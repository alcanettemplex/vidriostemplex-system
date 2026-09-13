/**
 * Script: 2026-09-12_mover_cotizador_a_schema.ts
 *
 * Mueve las 21 tablas del módulo Cotizador del schema `public` a un schema
 * propio `cotizador`, quitándoles el prefijo `cotizador_` al nombre:
 *   public.cotizador_producto  →  cotizador.producto
 *
 * Motivo: organizativo. Son 21 de ~70 tablas del sistema y viven aisladas
 * (el propio código las describe como "aisladas del resto del ERP" en
 * models/index.ts) — un schema propio las agrupa sin tocar su contenido.
 *
 * Decisiones ya tomadas (no reabrir aquí, ver encargo):
 *   - Los 8 ENUM `enum_cotizador_*` SE QUEDAN en `public`. El pooler de
 *     Supabase en modo transacción no propaga `search_path` de arranque, y
 *     `public` siempre resuelve sin calificar; moverlos obligaría a calificar
 *     el tipo en cada modelo. Postgres además resuelve el tipo de una columna
 *     por OID, no por nombre, así que dejar el ENUM en `public` mientras la
 *     tabla se muda a `cotizador` no rompe nada.
 *   - Los nombres de índices, constraints y secuencias NO se renombran.
 *     Siguen llamándose `cotizador_producto_pkey` etc. Es superficie interna;
 *     renombrarlos solo añade riesgo sin beneficio.
 *
 * Verificado en la documentación de PostgreSQL antes de escribir esto:
 *   - `ALTER TABLE ... SET SCHEMA` mueve junto con la tabla los índices, los
 *     constraints y las SECUENCIAS que le pertenecen a sus columnas (los
 *     `serial`/`IDENTITY` de estas 21 tablas). No hace falta moverlas aparte.
 *   - Las FK se resuelven por OID de tabla, no por nombre calificado: mover
 *     una tabla de schema no rompe FKs entrantes ni salientes, existan o no
 *     (en este módulo no se encontró ninguna cruzando hacia/desde `public`).
 *   - No hay vistas ni triggers de Postgres sobre estas tablas (se buscó en
 *     todo `backend-api/src` y no aparece ningún `CREATE VIEW`/`CREATE
 *     TRIGGER`; la auditoría del ERP es a nivel de hooks de Sequelize en JS,
 *     no de triggers de BD).
 *
 * ⚠️ RIESGO QUE NO RESUELVE ESTE SCRIPT: los modelos Sequelize del Cotizador
 * (`models/cotizador_*.model.ts`) siguen apuntando a `public.cotizador_*`
 * mientras no se actualicen sus `tableName`/`schema`. Si el backend sigue
 * corriendo con el código viejo en el momento del COMMIT, sus queries al
 * Cotizador empezarán a fallar con "relation does not exist" de inmediato
 * (la tabla ya no está donde el modelo cree). Este script y el despliegue del
 * código que actualiza los modelos deben ir juntos, no por separado.
 *
 * ⚠️ LOCKS: cada `ALTER TABLE ... SET SCHEMA` toma ACCESS EXCLUSIVE sobre esa
 * tabla durante toda la transacción. Con 21 tablas en una sola transacción,
 * cualquier query concurrente contra el Cotizador (lecturas incluidas) queda
 * bloqueada hasta el COMMIT o ROLLBACK. Correr en ventana de baja actividad.
 *
 * Uso:
 *   npx ts-node src/scripts/2026-09-12_mover_cotizador_a_schema.ts             (migrar)
 *   npx ts-node src/scripts/2026-09-12_mover_cotizador_a_schema.ts --revertir  (deshacer)
 *
 * Idempotente en ambos sentidos: si ya se migró, correrlo de nuevo sin
 * --revertir lo informa y no toca nada; igual al revés.
 */
import sequelize from '../config/database';
import { QueryTypes, Transaction } from 'sequelize';

const SCHEMA = 'cotizador';

// Fuente de verdad: los 21 nombres sin el prefijo. El nombre viejo se deriva
// del prefijo para no repetir la lista dos veces y arriesgar que diverjan.
const NOMBRES_NUEVOS = [
  'accesorio_sistema_activo',
  'calibracion_contraste',
  'calibracion_historial',
  'calibracion_holgura',
  'calibracion_margen',
  'calibracion_sistema',
  'consecutivo',
  'cotizacion',
  'cotizacion_item',
  'diseno',
  'diseno_accesorio',
  'diseno_perfil',
  'diseno_vidrio',
  'empresa',
  'empresa_logo',
  'geometria_override',
  'mapeo_accesorio',
  'parametro',
  'precio_historial',
  'precio_override',
  'producto',
] as const;

interface ParTabla {
  vieja: string; // public.cotizador_<nombre>
  nueva: string; // cotizador.<nombre>
}

const TABLAS: ParTabla[] = NOMBRES_NUEVOS.map((nombre) => ({
  vieja: `cotizador_${nombre}`,
  nueva: nombre,
}));

// De las 21, las 3 que hoy tienen filas en auditoria_log con el nombre viejo.
// Se derivan del mismo TABLAS para no repetir los strings sueltos.
const NOMBRES_CON_HISTORIAL_AUDITORIA = ['cotizacion', 'cotizacion_item', 'parametro'];
const TABLAS_CON_AUDITORIA = TABLAS.filter((t) => NOMBRES_CON_HISTORIAL_AUDITORIA.includes(t.nueva));

type Estado = 'PUBLIC' | 'COTIZADOR' | 'MIXTO';

/** Cuenta, fuera de transacción, en qué schema está hoy cada una de las 21 tablas. */
async function detectarEstado(): Promise<Estado> {
  const enCotizador = await sequelize.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname = :schema`,
    { type: QueryTypes.SELECT, replacements: { schema: SCHEMA } }
  );
  // `IN (:lista)` y no `ANY(:lista)`: Sequelize expande el array a valores
  // separados por comas, que `ANY(...)` rechaza con error de sintaxis.
  const enPublic = await sequelize.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN (:viejas)`,
    { type: QueryTypes.SELECT, replacements: { viejas: TABLAS.map((t) => t.vieja) } }
  );

  const nuevosEnCotizador = new Set(enCotizador.map((r) => r.tablename));
  const cuentaCotizador = TABLAS.filter((t) => nuevosEnCotizador.has(t.nueva)).length;
  const cuentaPublic = enPublic.length;

  if (cuentaCotizador === TABLAS.length && cuentaPublic === 0) return 'COTIZADOR';
  if (cuentaCotizador === 0 && cuentaPublic === TABLAS.length) return 'PUBLIC';
  return 'MIXTO';
}

async function migrar(): Promise<void> {
  const estado = await detectarEstado();
  if (estado === 'COTIZADOR') {
    console.log('Ya migrado: las 21 tablas están en el schema `cotizador`. No se toca nada.');
    return;
  }
  if (estado === 'MIXTO') {
    throw new Error(
      'Estado MIXTO: algunas tablas ya están en `cotizador` y otras siguen en `public`. ' +
        'Esto no debería ocurrir con este script (todo va en una transacción) — revisar a mano antes de continuar.'
    );
  }

  console.log('=== Migrando el Cotizador a su propio schema — 2026-09-12 ===\n');

  const t = await sequelize.transaction();
  try {
    await sequelize.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA};`, { transaction: t });
    console.log(`✓ Schema '${SCHEMA}' asegurado`);

    for (const { vieja, nueva } of TABLAS) {
      await sequelize.query(`ALTER TABLE public.${vieja} SET SCHEMA ${SCHEMA};`, { transaction: t });
      await sequelize.query(`ALTER TABLE ${SCHEMA}.${vieja} RENAME TO ${nueva};`, { transaction: t });
      console.log(`✓ public.${vieja}  →  ${SCHEMA}.${nueva}`);
    }

    console.log('\n--- Auditoría histórica ---');
    let totalActualizadas = 0;
    for (const { vieja, nueva } of TABLAS_CON_AUDITORIA) {
      const nuevoValor = `${SCHEMA}.${nueva}`;
      const [, filas] = await sequelize.query(
        `UPDATE auditoria_log SET tabla = :nuevoValor WHERE tabla = :vieja`,
        { replacements: { nuevoValor, vieja }, transaction: t }
      );
      const n = (filas as unknown as { rowCount?: number })?.rowCount ?? 0;
      console.log(`  ${vieja} → ${nuevoValor}: ${n} fila(s) actualizadas`);
      totalActualizadas += n;
    }
    console.log(`  Total auditoria_log actualizadas: ${totalActualizadas}`);

    console.log('\n--- Verificación previa al COMMIT ---');
    await verificarEstadoFinal(t, 'COTIZADOR');
    console.log('✓ Verificación OK: 21 tablas en `cotizador`, ninguna `cotizador_*` en `public`.');

    await t.commit();
    console.log('\n=== Migración completada y confirmada (COMMIT). ===');
  } catch (err) {
    await t.rollback();
    console.error('\n✘ Error durante la migración — se hizo ROLLBACK, la BD queda como estaba:', err);
    throw err;
  }
}

async function revertir(): Promise<void> {
  const estado = await detectarEstado();
  if (estado === 'PUBLIC') {
    console.log('Ya está revertido: las 21 tablas están en `public` con su nombre original. No se toca nada.');
    return;
  }
  if (estado === 'MIXTO') {
    throw new Error(
      'Estado MIXTO: algunas tablas están en `cotizador` y otras en `public`. ' +
        'No se puede revertir automáticamente en este estado — revisar a mano.'
    );
  }

  console.log('=== Revirtiendo: el Cotizador vuelve a `public` con su prefijo — 2026-09-12 ===\n');

  const t = await sequelize.transaction();
  try {
    for (const { vieja, nueva } of TABLAS) {
      await sequelize.query(`ALTER TABLE ${SCHEMA}.${nueva} RENAME TO ${vieja};`, { transaction: t });
      await sequelize.query(`ALTER TABLE ${SCHEMA}.${vieja} SET SCHEMA public;`, { transaction: t });
      console.log(`✓ ${SCHEMA}.${nueva}  →  public.${vieja}`);
    }

    console.log('\n--- Revirtiendo auditoría histórica ---');
    let totalActualizadas = 0;
    for (const { vieja, nueva } of TABLAS_CON_AUDITORIA) {
      const valorNuevo = `${SCHEMA}.${nueva}`;
      const [, filas] = await sequelize.query(
        `UPDATE auditoria_log SET tabla = :vieja WHERE tabla = :valorNuevo`,
        { replacements: { vieja, valorNuevo }, transaction: t }
      );
      const n = (filas as unknown as { rowCount?: number })?.rowCount ?? 0;
      console.log(`  ${valorNuevo} → ${vieja}: ${n} fila(s) actualizadas`);
      totalActualizadas += n;
    }
    console.log(`  Total auditoria_log actualizadas: ${totalActualizadas}`);

    console.log('\n--- Verificación previa al COMMIT ---');
    await verificarEstadoFinal(t, 'PUBLIC');
    console.log('✓ Verificación OK: 21 tablas de vuelta en `public` con su nombre original.');

    // Solo se elimina el schema si quedó realmente vacío (tablas, secuencias,
    // índices propios, etc.) — si algo ajeno a esta migración quedó ahí, se
    // deja el schema en pie con un aviso en vez de fallar todo el revert.
    const objetosRestantes = await sequelize.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = :schema`,
      { type: QueryTypes.SELECT, transaction: t, replacements: { schema: SCHEMA } }
    );
    if (Number(objetosRestantes[0].n) === 0) {
      await sequelize.query(`DROP SCHEMA ${SCHEMA};`, { transaction: t });
      console.log(`✓ Schema '${SCHEMA}' quedó vacío y se eliminó.`);
    } else {
      console.log(
        `⚠ Schema '${SCHEMA}' no se eliminó: quedan ${objetosRestantes[0].n} objeto(s) que esta migración no creó.`
      );
    }

    await t.commit();
    console.log('\n=== Reversión completada y confirmada (COMMIT). ===');
  } catch (err) {
    await t.rollback();
    console.error('\n✘ Error durante la reversión — se hizo ROLLBACK, la BD queda como estaba:', err);
    throw err;
  }
}

/**
 * Verifica, dentro de la misma transacción y antes del COMMIT, que el
 * schema quedó exactamente como se espera. Si algo no cuadra, lanza — el
 * catch de quien la llama hace el ROLLBACK.
 */
async function verificarEstadoFinal(t: Transaction, esperado: Estado): Promise<void> {
  const enCotizador = await sequelize.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname = :schema`,
    { type: QueryTypes.SELECT, transaction: t, replacements: { schema: SCHEMA } }
  );
  const enPublicViejas = await sequelize.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'cotizador\\_%' ESCAPE '\\'`,
    { type: QueryTypes.SELECT, transaction: t }
  );

  const nombresEnCotizador = new Set(enCotizador.map((r) => r.tablename));

  if (esperado === 'COTIZADOR') {
    const faltantes = TABLAS.filter((tt) => !nombresEnCotizador.has(tt.nueva)).map((tt) => tt.nueva);
    if (faltantes.length > 0) {
      throw new Error(`Verificación falló: faltan en '${SCHEMA}': ${faltantes.join(', ')}`);
    }
    if (enPublicViejas.length > 0) {
      throw new Error(
        `Verificación falló: quedaron tablas 'cotizador_*' en public: ${enPublicViejas.map((r) => r.tablename).join(', ')}`
      );
    }
  } else {
    // esperado === 'PUBLIC'
    const enPublicNombres = new Set(enPublicViejas.map((r) => r.tablename));
    const faltantes = TABLAS.filter((tt) => !enPublicNombres.has(tt.vieja)).map((tt) => tt.vieja);
    if (faltantes.length > 0) {
      throw new Error(`Verificación falló: faltan en public: ${faltantes.join(', ')}`);
    }
    if (enCotizador.length > 0) {
      throw new Error(
        `Verificación falló: quedaron tablas en '${SCHEMA}': ${enCotizador.map((r) => r.tablename).join(', ')}`
      );
    }
  }
}

async function run(): Promise<void> {
  const modoRevertir = process.argv.includes('--revertir');

  await sequelize.authenticate();
  console.log('Conexión OK\n');

  if (modoRevertir) {
    await revertir();
  } else {
    await migrar();
  }
}

run()
  .then(async () => {
    await sequelize.close();
  })
  .catch(async (err) => {
    console.error('\nEl script terminó con error:', err);
    await sequelize.close().catch(() => {});
    process.exit(1);
  });

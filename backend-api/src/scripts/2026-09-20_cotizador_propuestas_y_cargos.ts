/**
 * Script: 2026-09-20_cotizador_propuestas_y_cargos.ts  —  Fase 1 de "Propuestas y Cargos de Obra"
 *
 * Crea la estructura que convierte una cotización en un contenedor de
 * PROPUESTAS (A/B/C…) y saca los cargos de obra (SMO, andamio, huacal, flete,
 * otros) de dentro del BOM de cada ítem:
 *
 *   cotizacion
 *   └── propuesta A/B/C…      (nombre, nota, elegida, descuento_pct, totales espejo)
 *       ├── cotizacion_item   (los de siempre, ahora con propuesta_id)
 *       └── propuesta_cargo   (SMO | ANDAMIO | HUACAL | FLETE | OTRO)
 *
 * Motivo (medido en vivo): hoy las líneas `SMO` y `GTFA26` se inyectan dentro
 * del BOM de cada ítem, así que `totalizar()` las multiplica por
 * `cantidadPiezas`. Una ventana de 5 piezas cobraba 5 fletes y 5 manos de obra.
 * Un cargo es de la propuesta, no de la pieza: por eso vive en su propia tabla.
 *
 * Convenciones del schema `cotizador` que este script respeta (ver
 * docs/modulos/cotizador.md, "Tres trampas del schema propio"):
 *   - Los montos son `double precision`, NO `numeric`; los ids son `SERIAL`.
 *   - Las fechas son `timestamp with time zone`.
 *   - El ENUM se crea en `public`, NUNCA en `cotizador`: el pooler de Supabase
 *     en modo transacción no propaga `search_path` y `public` siempre resuelve.
 *     Se llama `enum_cotizador_cargo_tipo`, mismo patrón que los 8 ENUM que ya
 *     existen (`enum_cotizador_cotizacion_estado`, …).
 *   - Las tablas van sin prefijo dentro del schema (`cotizador.propuesta`); el
 *     prefijo sobrevive solo en los archivos y clases del modelo.
 *
 * MIGRACIÓN DE LOS DATOS EXISTENTES (4 cotizaciones, 5 ítems):
 * A cada una se le crea su propuesta 'A', elegida, con los totales actuales
 * copiados a los espejos y `legado_cargos_en_items = true`. **No se les crean
 * cargos a propósito**: su SMO y su flete ya están dentro del blob `resultado`
 * de cada ítem, que es una foto inmutable que no se reescribe nunca (ver
 * aptitudOrden.ts, "el artefacto del blob"). Crearles además cargos cobraría
 * dos veces lo mismo. Ese flag es lo que hace que el cálculo de totales de
 * Fase 2 trate a estas 4 como se comportan hoy.
 *
 * ⚠️ ORDEN DE EJECUCIÓN: correr este script ANTES de levantar el backend con
 * los modelos nuevos registrados. `server.ts` hace `sequelize.sync({alter:false})`
 * al arrancar y crearía las dos tablas por su cuenta — con el ENUM que Sequelize
 * se inventa, sin el índice único parcial de "una sola elegida" y sin la FK
 * hacia `cotizacion_item`. Si eso llegara a pasar, este script sigue siendo
 * seguro: detecta el estado PARCIAL y completa lo que falte, salvo el ENUM, que
 * habría que revisar a mano.
 *
 * ⚠️ `cotizador.cotizacion_item.propuesta_id` queda NOT NULL al terminar. Desde
 * ese momento, cualquier INSERT de ítem que no la informe falla: los caminos de
 * creación se actualizan en Fase 2. Este script y esa fase van juntos.
 *
 * ⚠️ POR QUÉ EL NOT NULL VA EN DOS TIEMPOS (decisión del agente principal,
 * 2026-09-20): la base de datos es la de PRODUCCIÓN y el backend desplegado es
 * todavía el anterior a la Fase 2, que inserta ítems sin `propuesta_id`. Poner
 * la columna NOT NULL de una vez dejaría el cotizador desplegado sin poder
 * guardar cotizaciones hasta que se despliegue la Fase 2. Por eso la corrida
 * normal crea la estructura y migra los datos dejando la columna NULLABLE —con
 * lo que producción sigue funcionando y las Fases 2 y 3 ya pueden probarse
 * contra datos reales— y el `SET NOT NULL` se aplica aparte, con `--finalizar`,
 * en el momento del despliegue.
 *
 * Uso:
 *   npx ts-node src/scripts/2026-09-20_cotizador_propuestas_y_cargos.ts               (migrar, columna nullable)
 *   npx ts-node src/scripts/2026-09-20_cotizador_propuestas_y_cargos.ts --con-not-null (migrar y cerrar de una vez)
 *   npx ts-node src/scripts/2026-09-20_cotizador_propuestas_y_cargos.ts --finalizar    (solo el SET NOT NULL)
 *   npx ts-node src/scripts/2026-09-20_cotizador_propuestas_y_cargos.ts --revertir     (deshacer)
 *
 * Idempotente en ambos sentidos y todo dentro de UNA transacción: si algo falla
 * se hace ROLLBACK y la BD queda exactamente como estaba (en Postgres el DDL es
 * transaccional, a diferencia de otros motores).
 */
import sequelize from '../config/database';
import { QueryTypes, Transaction } from 'sequelize';

const SCHEMA = 'cotizador';
const ENUM_CARGO = 'enum_cotizador_cargo_tipo'; // vive en `public`, ver cabecera
const ETIQUETA_INICIAL = 'A';
const NOMBRE_PROPUESTA_INICIAL = 'Propuesta inicial';

/** Una fila de `cotizador.cotizacion` con lo que hace falta para fabricar su propuesta 'A'. */
interface FilaCotizacion {
  id: number;
  numero: number;
  descuento_pct: number;
  total_subtotal: number;
  total_iva: number;
  total_total: number;
}

/**
 * BASE    = nada de esto existe todavía (estado esperado antes de migrar).
 * MIGRADO = tablas, columna NOT NULL y datos migrados; no hay nada que hacer.
 * PARCIAL = algo existe y algo no (típicamente porque `sync()` se adelantó, o
 *           porque una corrida anterior se interrumpió). `migrar()` lo completa.
 */
type Estado = 'BASE' | 'MIGRADO' | 'PARCIAL';

interface Diagnostico {
  estado: Estado;
  existePropuesta: boolean;
  existeCargo: boolean;
  existeEnum: boolean;
  existeColumnaItem: boolean;
  columnaItemNotNull: boolean;
  cotizacionesSinPropuesta: number;
  itemsSinPropuesta: number;
  /** ¿El UNIQUE de `orden` ya es por propuesta? Sin él, clonar falla. */
  uniqueOrdenPorPropuesta: boolean;
}

/** Fotografía del estado actual, sin tocar nada. Sirve antes de migrar y como
 *  verificación dentro de la transacción (por eso acepta una transacción). */
async function diagnosticar(t?: Transaction): Promise<Diagnostico> {
  const opciones = { type: QueryTypes.SELECT as const, transaction: t };

  const tablas = await sequelize.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname = :schema AND tablename IN ('propuesta','propuesta_cargo')`,
    { ...opciones, replacements: { schema: SCHEMA } }
  );
  const nombres = new Set(tablas.map((r) => r.tablename));
  const existePropuesta = nombres.has('propuesta');
  const existeCargo = nombres.has('propuesta_cargo');

  // El ENUM se busca calificado por namespace: todos los `enum_cotizador_*`
  // viven en `public` aunque sus tablas estén en `cotizador`.
  const tipos = await sequelize.query<{ typname: string }>(
    `SELECT tp.typname FROM pg_type tp
       JOIN pg_namespace ns ON ns.oid = tp.typnamespace
      WHERE ns.nspname = 'public' AND tp.typname = :nombre`,
    { ...opciones, replacements: { nombre: ENUM_CARGO } }
  );
  const existeEnum = tipos.length > 0;

  const columnas = await sequelize.query<{ is_nullable: string }>(
    `SELECT is_nullable FROM information_schema.columns
      WHERE table_schema = :schema AND table_name = 'cotizacion_item' AND column_name = 'propuesta_id'`,
    { ...opciones, replacements: { schema: SCHEMA } }
  );
  const existeColumnaItem = columnas.length > 0;
  const columnaItemNotNull = existeColumnaItem && columnas[0].is_nullable === 'NO';

  const ixOrden = await sequelize.query<{ indexname: string }>(
    `SELECT indexname FROM pg_indexes
      WHERE schemaname = :schema AND tablename = 'cotizacion_item'
        AND indexname = 'ux_cotizador_cotizacion_item_propuesta_orden'`,
    { ...opciones, replacements: { schema: SCHEMA } }
  );
  const uniqueOrdenPorPropuesta = ixOrden.length > 0;

  let cotizacionesSinPropuesta = 0;
  let itemsSinPropuesta = 0;
  if (existePropuesta) {
    const sinPropuesta = await sequelize.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM ${SCHEMA}.cotizacion c
        WHERE NOT EXISTS (SELECT 1 FROM ${SCHEMA}.propuesta p WHERE p.cotizacion_id = c.id)`,
      opciones
    );
    cotizacionesSinPropuesta = Number(sinPropuesta[0].n);
  }
  if (existeColumnaItem) {
    const sinItem = await sequelize.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM ${SCHEMA}.cotizacion_item WHERE propuesta_id IS NULL`,
      opciones
    );
    itemsSinPropuesta = Number(sinItem[0].n);
  }

  // `columnaItemNotNull` NO entra aquí: el cierre de la columna es un paso
  // aparte (`--finalizar`), así que una migración con la columna todavía
  // nullable está completa, no a medias.
  const todoPuesto =
    existePropuesta &&
    existeCargo &&
    existeEnum &&
    existeColumnaItem &&
    uniqueOrdenPorPropuesta &&
    cotizacionesSinPropuesta === 0 &&
    itemsSinPropuesta === 0;
  const nadaPuesto = !existePropuesta && !existeCargo && !existeEnum && !existeColumnaItem;

  const estado: Estado = todoPuesto ? 'MIGRADO' : nadaPuesto ? 'BASE' : 'PARCIAL';
  return {
    estado,
    existePropuesta,
    existeCargo,
    existeEnum,
    existeColumnaItem,
    columnaItemNotNull,
    cotizacionesSinPropuesta,
    itemsSinPropuesta,
    uniqueOrdenPorPropuesta,
  };
}

/**
 * El `SET NOT NULL` de `cotizacion_item.propuesta_id`, aislado para poder
 * aplicarlo en el momento del despliegue y no al crear la estructura.
 *
 * Si quedara algún ítem sin propuesta, el ALTER fallaría con un error de
 * Postgres difícil de leer: se comprueba antes para poder decir exactamente
 * cuáles son y a qué cotización pertenecen.
 */
async function aplicarNotNull(t: Transaction): Promise<void> {
  const rezagados = await sequelize.query<{ id: number; cotizacion_id: number }>(
    `SELECT id, cotizacion_id FROM ${SCHEMA}.cotizacion_item WHERE propuesta_id IS NULL ORDER BY id`,
    { type: QueryTypes.SELECT, transaction: t }
  );
  if (rezagados.length > 0) {
    const cotizaciones = [...new Set(rezagados.map((r) => r.cotizacion_id))].join(', ');
    throw new Error(
      `No se puede poner propuesta_id NOT NULL: ${rezagados.length} ítem(s) quedaron sin propuesta ` +
        `(ids ${rezagados.map((r) => r.id).join(', ')}; cotizaciones ${cotizaciones}). ` +
        'Lo más probable es que los haya creado el backend anterior a la Fase 2 mientras la columna ' +
        'era nullable: hay que asignarles propuesta antes de cerrar.'
    );
  }
  await sequelize.query(
    `ALTER TABLE ${SCHEMA}.cotizacion_item ALTER COLUMN propuesta_id SET NOT NULL;`,
    { transaction: t }
  );
  console.log(`✓ ${SCHEMA}.cotizacion_item.propuesta_id ahora es NOT NULL`);
}

/** Modo `--finalizar`: cierra la migración aplicando solo el NOT NULL. */
async function finalizar(): Promise<void> {
  const previo = await diagnosticar();
  if (!previo.existeColumnaItem) {
    throw new Error(
      'No existe `cotizacion_item.propuesta_id`: hay que correr la migración antes de finalizarla.'
    );
  }
  if (previo.columnaItemNotNull) {
    console.log('Ya está finalizada: `cotizacion_item.propuesta_id` ya es NOT NULL. No se toca nada.');
    return;
  }

  console.log('=== Cerrando la Fase 1: propuesta_id pasa a obligatoria — 2026-09-20 ===\n');
  const t = await sequelize.transaction();
  try {
    await aplicarNotNull(t);
    console.log('\n--- Verificación previa al COMMIT ---');
    await verificar(t, true);
    await t.commit();
    console.log('\n=== Fase 1 cerrada y confirmada (COMMIT). ===');
  } catch (err) {
    await t.rollback();
    console.error('\n✘ Error al finalizar — se hizo ROLLBACK, la BD queda como estaba:', err);
    throw err;
  }
}

async function migrar(conNotNull: boolean): Promise<void> {
  const previo = await diagnosticar();
  if (previo.estado === 'MIGRADO') {
    if (conNotNull && !previo.columnaItemNotNull) {
      console.log('La estructura ya está migrada; solo falta cerrar la columna.\n');
      await finalizar();
      return;
    }
    console.log('Ya migrado: las tablas de propuestas existen y no queda ninguna cotización sin');
    console.log('propuesta. No se toca nada.');
    if (!previo.columnaItemNotNull) {
      console.log('Pendiente: `--finalizar` para dejar `cotizacion_item.propuesta_id` en NOT NULL.');
    }
    return;
  }
  if (previo.estado === 'PARCIAL') {
    console.log('⚠ Estado PARCIAL detectado — se completará lo que falte (todos los pasos son idempotentes):');
    console.log(`    ${SCHEMA}.propuesta .............. ${previo.existePropuesta ? 'existe' : 'FALTA'}`);
    console.log(`    ${SCHEMA}.propuesta_cargo ........ ${previo.existeCargo ? 'existe' : 'FALTA'}`);
    console.log(`    public.${ENUM_CARGO} ... ${previo.existeEnum ? 'existe' : 'FALTA'}`);
    console.log(
      `    UNIQUE orden por propuesta ..... ${previo.uniqueOrdenPorPropuesta ? 'existe' : 'FALTA'}`
    );
    console.log(
      `    cotizacion_item.propuesta_id ... ${
        previo.existeColumnaItem ? (previo.columnaItemNotNull ? 'existe (NOT NULL)' : 'existe (nullable)') : 'FALTA'
      }`
    );
    console.log('');
  }

  console.log('=== Fase 1: propuestas y cargos de obra del Cotizador — 2026-09-20 ===\n');

  const t = await sequelize.transaction();
  try {
    // ── 1) ENUM de tipos de cargo ─────────────────────────────────────────────
    // En `public` (ver cabecera). `CREATE TYPE` no admite IF NOT EXISTS, de ahí
    // el bloque DO que se traga el duplicate_object — mismo patrón que usa
    // 2026-09-07_crear_tablas_cotizador.ts para los CHECK constraints.
    await sequelize.query(
      `DO $$ BEGIN
         CREATE TYPE public.${ENUM_CARGO} AS ENUM ('SMO','ANDAMIO','HUACAL','FLETE','OTRO');
       EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
      { transaction: t }
    );
    console.log(`✓ ENUM public.${ENUM_CARGO} (SMO | ANDAMIO | HUACAL | FLETE | OTRO)`);

    // ── 2) cotizador.propuesta ────────────────────────────────────────────────
    // `creada_en`/`actualizada_en` llevan DEFAULT now() aunque el controlador
    // las escriba siempre: es la red que evita que un INSERT manual deje una
    // fila sin fecha en una columna NOT NULL.
    await sequelize.query(
      `CREATE TABLE IF NOT EXISTS ${SCHEMA}.propuesta (
         id                     SERIAL PRIMARY KEY,
         cotizacion_id          INTEGER NOT NULL REFERENCES ${SCHEMA}.cotizacion(id) ON DELETE CASCADE,
         etiqueta               VARCHAR(2) NOT NULL,
         nombre                 VARCHAR(80),
         nota                   TEXT,
         elegida                BOOLEAN NOT NULL DEFAULT false,
         descuento_pct          DOUBLE PRECISION NOT NULL DEFAULT 0,
         legado_cargos_en_items BOOLEAN NOT NULL DEFAULT false,
         total_productos        DOUBLE PRECISION NOT NULL DEFAULT 0,
         total_descuento        DOUBLE PRECISION NOT NULL DEFAULT 0,
         total_cargos           DOUBLE PRECISION NOT NULL DEFAULT 0,
         total_iva              DOUBLE PRECISION NOT NULL DEFAULT 0,
         total_total            DOUBLE PRECISION NOT NULL DEFAULT 0,
         creada_en              TIMESTAMPTZ NOT NULL DEFAULT now(),
         actualizada_en         TIMESTAMPTZ NOT NULL DEFAULT now(),
         CONSTRAINT ux_cotizador_propuesta_etiqueta UNIQUE (cotizacion_id, etiqueta)
       );`,
      { transaction: t }
    );
    console.log(`✓ Tabla ${SCHEMA}.propuesta`);

    // Índice de la FK: Postgres NO lo crea solo, y toda lectura del detalle
    // entra por cotizacion_id.
    await sequelize.query(
      `CREATE INDEX IF NOT EXISTS ix_cotizador_propuesta_cotizacion
         ON ${SCHEMA}.propuesta (cotizacion_id);`,
      { transaction: t }
    );
    console.log('✓ ix_cotizador_propuesta_cotizacion');

    // La regla "solo una propuesta elegida por cotización" la impone Postgres,
    // no el código: un índice único PARCIAL sobre las filas con elegida=true.
    // Sequelize no puede declararlo, igual que los dos índices parciales de
    // calibración (ux_cotizador_margen_vigente / ux_cotizador_holgura_vigente).
    // Consecuencia de diseño para Fase 2: "elegir" es desmarcar-y-marcar dentro
    // de una transacción, porque a mitad de camino el índice rechazaría dos.
    await sequelize.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS ux_cotizador_propuesta_elegida
         ON ${SCHEMA}.propuesta (cotizacion_id) WHERE elegida;`,
      { transaction: t }
    );
    console.log('✓ ux_cotizador_propuesta_elegida (índice único parcial: una sola elegida)');

    // ── 3) cotizador.propuesta_cargo ──────────────────────────────────────────
    // `total` se guarda calculado (cantidad × valor_unitario, redondeado a 2) en
    // vez de derivarlo al leer: es el importe que se le mostró al cliente, y el
    // módulo entero trata lo cotizado como artefacto, no como fórmula viva.
    await sequelize.query(
      `CREATE TABLE IF NOT EXISTS ${SCHEMA}.propuesta_cargo (
         id             SERIAL PRIMARY KEY,
         propuesta_id   INTEGER NOT NULL REFERENCES ${SCHEMA}.propuesta(id) ON DELETE CASCADE,
         orden          INTEGER NOT NULL DEFAULT 0,
         tipo           public.${ENUM_CARGO} NOT NULL,
         descripcion    VARCHAR(200),
         cantidad       DOUBLE PRECISION NOT NULL DEFAULT 1,
         unidad         VARCHAR(20) NOT NULL DEFAULT 'GLOBAL',
         valor_unitario DOUBLE PRECISION NOT NULL DEFAULT 0,
         total          DOUBLE PRECISION NOT NULL DEFAULT 0,
         aplica_iva     BOOLEAN NOT NULL DEFAULT true,
         origen         VARCHAR(10) NOT NULL DEFAULT 'MANUAL'
       );`,
      { transaction: t }
    );
    console.log(`✓ Tabla ${SCHEMA}.propuesta_cargo`);

    // Los cargos siempre se leen como el juego completo de una propuesta y en
    // orden: el índice cubre la FK y ahorra el sort.
    await sequelize.query(
      `CREATE INDEX IF NOT EXISTS ix_cotizador_propuesta_cargo_propuesta
         ON ${SCHEMA}.propuesta_cargo (propuesta_id, orden);`,
      { transaction: t }
    );
    console.log('✓ ix_cotizador_propuesta_cargo_propuesta');

    // ── 4) cotizacion_item.propuesta_id ───────────────────────────────────────
    // `cotizacion_id` se CONSERVA (denormalizado) para no romper las consultas
    // ni los índices existentes; el ítem cuelga de la propuesta y la propuesta
    // de la cotización, así que ambos caminos llevan al mismo sitio.
    await sequelize.query(
      `ALTER TABLE ${SCHEMA}.cotizacion_item ADD COLUMN IF NOT EXISTS propuesta_id INTEGER;`,
      { transaction: t }
    );
    await sequelize.query(
      `DO $$ BEGIN
         ALTER TABLE ${SCHEMA}.cotizacion_item
           ADD CONSTRAINT fk_cotizador_cotizacion_item_propuesta
           FOREIGN KEY (propuesta_id) REFERENCES ${SCHEMA}.propuesta(id) ON DELETE CASCADE;
       EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
      { transaction: t }
    );
    await sequelize.query(
      `CREATE INDEX IF NOT EXISTS ix_cotizador_cotizacion_item_propuesta
         ON ${SCHEMA}.cotizacion_item (propuesta_id);`,
      { transaction: t }
    );
    console.log(`✓ ${SCHEMA}.cotizacion_item.propuesta_id (+ FK ON DELETE CASCADE + índice)`);

    // ── 4b) El UNIQUE de `orden` pasa a ser por PROPUESTA ─────────────────────
    // Estaba en `(cotizacion_id, orden)`, que era correcto cuando una cotización
    // era una lista plana de ítems. Con propuestas deja de serlo: los ítems de
    // la propuesta B empiezan otra vez en orden 0 y chocan con los de la A, que
    // viven en la misma cotización. Sin esto, CLONAR UNA PROPUESTA FALLA con un
    // 500 y "Validation error" — detectado probando contra datos reales el
    // 2026-09-20, no en compilación ni en las suites.
    //
    // Se eliminan las DOS variantes que existen: la histórica
    // (`cotizador_cotizacion_item_*`, de cuando la tabla llevaba prefijo en su
    // nombre) y la que genera `sync()` con el nombre actual.
    for (const viejo of [
      'cotizador_cotizacion_item_cotizacion_id_orden',
      'cotizacion_item_cotizacion_id_orden',
    ]) {
      await sequelize.query(`DROP INDEX IF EXISTS ${SCHEMA}.${viejo};`, { transaction: t });
    }
    await sequelize.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS ux_cotizador_cotizacion_item_propuesta_orden
         ON ${SCHEMA}.cotizacion_item (propuesta_id, orden);`,
      { transaction: t }
    );
    console.log('✓ UNIQUE de `orden` movido de (cotizacion_id, orden) a (propuesta_id, orden)');

    // ── 5) Migración de los datos existentes ──────────────────────────────────
    console.log('\n--- Migrando cotizaciones existentes ---');
    const huerfanas = await sequelize.query<FilaCotizacion>(
      `SELECT c.id, c.numero, c.descuento_pct, c.total_subtotal, c.total_iva, c.total_total
         FROM ${SCHEMA}.cotizacion c
        WHERE NOT EXISTS (SELECT 1 FROM ${SCHEMA}.propuesta p WHERE p.cotizacion_id = c.id)
        ORDER BY c.id`,
      { type: QueryTypes.SELECT, transaction: t }
    );

    if (huerfanas.length === 0) {
      console.log('  Ninguna cotización sin propuesta: nada que crear.');
    }
    for (const c of huerfanas) {
      // legado_cargos_en_items = true: su SMO y su flete ya están dentro del
      // blob `resultado` de cada ítem y ese blob no se reescribe nunca. Por eso
      // tampoco se les crea ni un solo cargo: sería cobrar dos veces.
      // Los totales se copian desde la propia fila (INSERT … SELECT) para no
      // hacer un round-trip de números double: lo escrito es exactamente lo leído.
      await sequelize.query(
        `INSERT INTO ${SCHEMA}.propuesta
           (cotizacion_id, etiqueta, nombre, elegida, descuento_pct, legado_cargos_en_items,
            total_productos, total_descuento, total_cargos, total_iva, total_total,
            creada_en, actualizada_en)
         SELECT c.id, :etiqueta, :nombre, true, c.descuento_pct, true,
                c.total_subtotal, 0, 0, c.total_iva, c.total_total,
                c.creada_en, c.actualizada_en
           FROM ${SCHEMA}.cotizacion c
          WHERE c.id = :id`,
        {
          transaction: t,
          replacements: { id: c.id, etiqueta: ETIQUETA_INICIAL, nombre: NOMBRE_PROPUESTA_INICIAL },
        }
      );
      console.log(
        `  ✓ Cotización #${c.numero} (id ${c.id}) → propuesta '${ETIQUETA_INICIAL}' elegida · ` +
          `productos ${c.total_subtotal} · IVA ${c.total_iva} · total ${c.total_total} · ` +
          `descuento_pct ${c.descuento_pct} · legado_cargos_en_items=true · 0 cargos`
      );
    }

    const [, metaItems] = await sequelize.query(
      `UPDATE ${SCHEMA}.cotizacion_item i
          SET propuesta_id = p.id
         FROM ${SCHEMA}.propuesta p
        WHERE p.cotizacion_id = i.cotizacion_id
          AND p.etiqueta = :etiqueta
          AND i.propuesta_id IS NULL`,
      { transaction: t, replacements: { etiqueta: ETIQUETA_INICIAL } }
    );
    const itemsColgados = (metaItems as unknown as { rowCount?: number })?.rowCount ?? 0;
    console.log(`  ✓ ${itemsColgados} ítem(s) colgados de su propuesta '${ETIQUETA_INICIAL}'`);

    // ── 6) propuesta_id pasa a obligatoria (solo si se pidió) ─────────────────
    // Por defecto NO: la columna queda nullable para que el backend desplegado
    // —anterior a la Fase 2— siga pudiendo guardar cotizaciones. Ver la cabecera.
    if (conNotNull) {
      await aplicarNotNull(t);
    } else {
      console.log(
        `\n⏸ ${SCHEMA}.cotizacion_item.propuesta_id queda NULLABLE a propósito.\n` +
          '   Producción sigue funcionando con el backend actual. Cerrar con `--finalizar`\n' +
          '   en el momento de desplegar la Fase 2.'
      );
    }

    // ── 7) Verificación dentro de la misma transacción, antes del COMMIT ──────
    console.log('\n--- Verificación previa al COMMIT ---');
    await verificar(t, conNotNull);

    await t.commit();
    console.log('\n=== Fase 1 completada y confirmada (COMMIT). ===');
    await resumenFinal();
  } catch (err) {
    await t.rollback();
    console.error('\n✘ Error durante la migración — se hizo ROLLBACK, la BD queda como estaba:', err);
    throw err;
  }
}

async function revertir(): Promise<void> {
  const previo = await diagnosticar();
  if (previo.estado === 'BASE') {
    console.log('Ya está revertido: no existen las tablas de propuestas, ni el ENUM, ni la columna. No se toca nada.');
    return;
  }

  console.log('=== Revirtiendo la Fase 1 de propuestas y cargos — 2026-09-20 ===\n');

  // La auditoría es bitácora: si quedaron filas en auditoria_log apuntando a
  // estas dos tablas NO se borran (borrar la prueba de lo que pasó es peor que
  // dejar una referencia a una tabla que ya no está). Solo se avisa.
  const auditadas = await sequelize.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM auditoria_log
      WHERE tabla IN ('${SCHEMA}.propuesta', '${SCHEMA}.propuesta_cargo')`,
    { type: QueryTypes.SELECT }
  );
  if (Number(auditadas[0].n) > 0) {
    console.log(
      `⚠ Quedan ${auditadas[0].n} fila(s) en auditoria_log de estas tablas. No se borran a propósito ` +
        '(la auditoría es bitácora); quedarán apuntando a tablas inexistentes hasta que se vuelva a migrar.\n'
    );
  }

  const t = await sequelize.transaction();
  try {
    // Borrar la columna arrastra consigo su FK y su índice: no hay que hacerlo
    // en pasos separados.
    await sequelize.query(
      `ALTER TABLE ${SCHEMA}.cotizacion_item DROP COLUMN IF EXISTS propuesta_id;`,
      { transaction: t }
    );
    console.log(`✓ ${SCHEMA}.cotizacion_item.propuesta_id eliminada (con su FK y sus índices)`);

    // Devolver el UNIQUE de `orden` a su ámbito anterior. Sin propuestas vuelve
    // a ser correcto por cotización, y dejar la tabla sin él permitiría dos
    // ítems con el mismo orden. Puede fallar si los datos ya no lo admiten
    // (dos propuestas fusionadas en la misma cotización), y entonces el revert
    // se aborta entero: es la señal de que hay que decidir a mano qué ítems
    // conservar, no algo que el script deba resolver por su cuenta.
    await sequelize.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS cotizador_cotizacion_item_cotizacion_id_orden
         ON ${SCHEMA}.cotizacion_item (cotizacion_id, orden);`,
      { transaction: t }
    );
    console.log('✓ UNIQUE (cotizacion_id, orden) restaurado');

    await sequelize.query(`DROP TABLE IF EXISTS ${SCHEMA}.propuesta_cargo;`, { transaction: t });
    console.log(`✓ Tabla ${SCHEMA}.propuesta_cargo eliminada`);

    // Las propuestas se van con sus datos: son las que creó este script. Los
    // totales originales siguen en `cotizador.cotizacion`, que nunca se tocó —
    // por eso el revert no pierde nada de la información previa a la Fase 1.
    await sequelize.query(`DROP TABLE IF EXISTS ${SCHEMA}.propuesta;`, { transaction: t });
    console.log(`✓ Tabla ${SCHEMA}.propuesta eliminada`);

    await sequelize.query(`DROP TYPE IF EXISTS public.${ENUM_CARGO};`, { transaction: t });
    console.log(`✓ ENUM public.${ENUM_CARGO} eliminado`);

    console.log('\n--- Verificación previa al COMMIT ---');
    const diag = await diagnosticar(t);
    if (diag.existePropuesta || diag.existeCargo || diag.existeColumnaItem || diag.existeEnum) {
      throw new Error('Verificación falló: algo de la Fase 1 sigue en pie tras el revert.');
    }
    console.log('✓ Verificación OK: no queda rastro de la Fase 1.');

    await t.commit();
    console.log('\n=== Reversión completada y confirmada (COMMIT). ===');
  } catch (err) {
    await t.rollback();
    console.error('\n✘ Error durante la reversión — se hizo ROLLBACK, la BD queda como estaba:', err);
    throw err;
  }
}

/**
 * Comprueba, dentro de la transacción y antes del COMMIT, que quedó exactamente
 * lo que se esperaba. Si algo no cuadra lanza, y el catch de quien llama hace
 * el ROLLBACK: nunca se confirma una migración a medias.
 */
async function verificar(t: Transaction, exigirNotNull: boolean): Promise<void> {
  const diag = await diagnosticar(t);
  const problemas: string[] = [];
  if (!diag.existeEnum) problemas.push(`falta el ENUM public.${ENUM_CARGO}`);
  if (!diag.existePropuesta) problemas.push(`falta la tabla ${SCHEMA}.propuesta`);
  if (!diag.existeCargo) problemas.push(`falta la tabla ${SCHEMA}.propuesta_cargo`);
  if (!diag.existeColumnaItem) problemas.push('falta la columna cotizacion_item.propuesta_id');
  if (exigirNotNull && !diag.columnaItemNotNull) {
    problemas.push('cotizacion_item.propuesta_id no quedó NOT NULL');
  }
  if (diag.cotizacionesSinPropuesta > 0) {
    problemas.push(`${diag.cotizacionesSinPropuesta} cotización(es) sin propuesta`);
  }
  if (diag.itemsSinPropuesta > 0) problemas.push(`${diag.itemsSinPropuesta} ítem(s) sin propuesta_id`);

  // Los 5 índices, uno a uno: el único parcial de "una sola elegida" es una
  // regla de negocio, no una optimización — si no está, no se confirma nada.
  const esperados = [
    'ux_cotizador_propuesta_etiqueta', // nace como constraint UNIQUE; pg_indexes lo lista igual
    'ix_cotizador_propuesta_cotizacion',
    'ux_cotizador_propuesta_elegida',
    'ix_cotizador_propuesta_cargo_propuesta',
    'ix_cotizador_cotizacion_item_propuesta',
    // El UNIQUE por propuesta: sin él, clonar una propuesta falla (ver paso 4b).
    'ux_cotizador_cotizacion_item_propuesta_orden',
  ];
  const indices = await sequelize.query<{ indexname: string }>(
    `SELECT indexname FROM pg_indexes WHERE schemaname = :schema AND indexname IN (:nombres)`,
    { type: QueryTypes.SELECT, transaction: t, replacements: { schema: SCHEMA, nombres: esperados } }
  );
  const presentes = new Set(indices.map((r) => r.indexname));
  for (const nombre of esperados) {
    if (!presentes.has(nombre)) problemas.push(`falta el índice ${nombre}`);
  }

  if (problemas.length > 0) {
    throw new Error(`Verificación falló:\n  - ${problemas.join('\n  - ')}`);
  }

  const sinElegida = await sequelize.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM ${SCHEMA}.cotizacion c
      WHERE NOT EXISTS (SELECT 1 FROM ${SCHEMA}.propuesta p WHERE p.cotizacion_id = c.id AND p.elegida)`,
    { type: QueryTypes.SELECT, transaction: t }
  );
  if (Number(sinElegida[0].n) > 0) {
    throw new Error(`Verificación falló: ${sinElegida[0].n} cotización(es) quedaron sin propuesta elegida.`);
  }

  console.log(
    `✓ Verificación OK: 2 tablas, 1 ENUM, 6 índices, columna ${
      diag.columnaItemNotNull ? 'NOT NULL' : 'creada (nullable, pendiente --finalizar)'
    },`
  );
  console.log('  toda cotización con su propuesta elegida y todo ítem colgado de una.');
}

/** Resumen legible de cómo quedó la BD, ya con el COMMIT hecho. */
async function resumenFinal(): Promise<void> {
  const filas = await sequelize.query<{
    numero: number;
    etiqueta: string;
    elegida: boolean;
    legado: boolean;
    items: string;
    cargos: string;
    total_total: number;
  }>(
    `SELECT c.numero,
            p.etiqueta,
            p.elegida,
            p.legado_cargos_en_items AS legado,
            (SELECT COUNT(*)::text FROM ${SCHEMA}.cotizacion_item i WHERE i.propuesta_id = p.id) AS items,
            (SELECT COUNT(*)::text FROM ${SCHEMA}.propuesta_cargo g WHERE g.propuesta_id = p.id) AS cargos,
            p.total_total
       FROM ${SCHEMA}.propuesta p
       JOIN ${SCHEMA}.cotizacion c ON c.id = p.cotizacion_id
      ORDER BY c.numero, p.etiqueta`,
    { type: QueryTypes.SELECT }
  );

  console.log('\n--- Resumen ---');
  console.log(`Propuestas en BD: ${filas.length}`);
  for (const f of filas) {
    console.log(
      `  Cotización #${f.numero} · propuesta ${f.etiqueta}${f.elegida ? ' (elegida)' : ''} · ` +
        `${f.items} ítem(s) · ${f.cargos} cargo(s) · total ${f.total_total}` +
        `${f.legado ? ' · legado_cargos_en_items=true (SMO y flete siguen dentro del blob de cada ítem)' : ''}`
    );
  }
  console.log(
    '\nRecordatorio: `cotizacion.descuento_pct` queda como columna LEGADA (se conserva, deja de\n' +
      'escribirse). El descuento vivo pasa a ser `propuesta.descuento_pct`, uno solo por propuesta.'
  );
}

async function run(): Promise<void> {
  const modoRevertir = process.argv.includes('--revertir');
  const modoFinalizar = process.argv.includes('--finalizar');
  const conNotNull = process.argv.includes('--con-not-null');

  await sequelize.authenticate();
  console.log('Conexión OK\n');

  if (modoRevertir) {
    await revertir();
  } else if (modoFinalizar) {
    await finalizar();
  } else {
    await migrar(conNotNull);
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

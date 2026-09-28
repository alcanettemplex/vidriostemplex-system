// Espejo flotante: el soporte es el tubular T-76 (TUB0302), no el T99 provisional
// (decisión del usuario, 2026-09-28).
//
// Dos cambios, en una sola transacción:
//   1. Costo de TUB0302 "TUBULAR T-76 DE 1 X 1 CRUDO": el proveedor lo vende en
//      perfil entero de 6 m a $50.000 → $8.333,33/m. Se cobra por metro, como el
//      resto de la perfilería (5 % de desperdicio en el despiece); la SAP sigue
//      pidiendo barras enteras. PA/PM/PB salen del multiplicador de PERFILERIA,
//      igual que en la sincronización con Proveedores. Se escribe en la tabla
//      base (no como override) para que, si mañana se vincula el T-76 en
//      Proveedores, el costo de las facturas lo reemplace sin quedar tapado.
//   2. Perfil del diseño ESP_FLOT_1 (única fila de `diseno_perfil` con ref T99):
//      apunta a TUB0302 en todos los colores —el T-76 crudo no va por acabado, y
//      el módulo Espejo no pide color (entra "mate")— y pasa a ref T76. Fórmula
//      (alto − 200 mm), 2 piezas y 5 % de desperdicio se conservan.
//
// `catalogo.json` y `disenos.json` se corrigieron en el mismo cambio para que la
// resiembra no devuelva los valores viejos.
//
// Idempotente. Por defecto solo muestra el antes/después; `--aplicar` escribe.
// NO se ejecuta con `npm run dev`. Tras aplicarlo, recargar la caché del
// Cotizador (POST /api/cotizador/recargar) o reiniciar el backend:
//   npx ts-node --files src/scripts/2026-09-28_cotizador_espejo_flotante_t76.ts [--aplicar]
import { QueryTypes } from 'sequelize';
import { sequelize, CotizadorPrecioHistorial } from '../models';

const CODIGO = 'TUB0302';
const PRECIO_PERFIL_6M = 50000;
const COSTO_METRO = PRECIO_PERFIL_6M / 6;
const DISENO = 'Vidrios y Espejos::ESP_FLOT_1';
const COLORES = ['MATE', 'CRUDO', 'NEGRO', 'BLANCO', 'BRONCE', 'GRISPLATA'];
const PERFIL_NUEVO = {
  ref: 'T76',
  descripcion: 'Tubular T-76',
  codigos_por_color: Object.fromEntries(COLORES.map((c) => [c, CODIGO])),
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const APLICAR = process.argv.includes('--aplicar');

interface FilaPrecio { costo_unitario: number; precio_pa: number; precio_pm: number; precio_pb: number }

async function main() {
  const t = await sequelize.transaction();
  try {
    // --- 1. Costo de TUB0302 ------------------------------------------------
    const [prod] = await sequelize.query<FilaPrecio & { categoria: string }>(
      `SELECT categoria, costo_unitario, precio_pa, precio_pm, precio_pb
         FROM cotizador.producto WHERE codigo = $1 FOR UPDATE`,
      { bind: [CODIGO], type: QueryTypes.SELECT, transaction: t }
    );
    if (!prod) throw new Error(`No existe ${CODIGO} en cotizador.producto.`);
    const [mult] = await sequelize.query<{ pa: number; pm: number; pb: number }>(
      `SELECT multiplicador_pa pa, multiplicador_pm pm, multiplicador_pb pb
         FROM cotizador.multiplicador_categoria WHERE categoria = $1`,
      { bind: [prod.categoria], type: QueryTypes.SELECT, transaction: t }
    );
    if (!mult?.pa) throw new Error(`La categoría ${prod.categoria} no tiene multiplicador configurado.`);

    const antes: FilaPrecio = {
      costo_unitario: Number(prod.costo_unitario),
      precio_pa: Number(prod.precio_pa),
      precio_pm: Number(prod.precio_pm),
      precio_pb: Number(prod.precio_pb),
    };
    const despues: FilaPrecio = {
      costo_unitario: round2(COSTO_METRO),
      precio_pa: round2(COSTO_METRO * mult.pa),
      precio_pm: round2(COSTO_METRO * mult.pm),
      precio_pb: round2(COSTO_METRO * mult.pb),
    };
    const precioIgual = (Object.keys(despues) as (keyof FilaPrecio)[])
      .every((k) => Math.abs(antes[k] - despues[k]) < 0.005);
    console.log(`${CODIGO}:`, antes, precioIgual ? '(ya estaba)' : '→', precioIgual ? '' : despues);

    if (!precioIgual && APLICAR) {
      await sequelize.query(
        `UPDATE cotizador.producto
            SET costo_unitario = $2, precio_pa = $3, precio_pm = $4, precio_pb = $5
          WHERE codigo = $1`,
        { bind: [CODIGO, despues.costo_unitario, despues.precio_pa, despues.precio_pm, despues.precio_pb], transaction: t }
      );
      await CotizadorPrecioHistorial.create(
        {
          fecha: new Date(),
          accion: 'editar-precio',
          codigo: CODIGO,
          antes,
          despues,
          por: 'script-2026-09-28',
          motivo: `Costo proveedor $${PRECIO_PERFIL_6M} por perfil entero de 6 m → $${despues.costo_unitario}/m. Soporte del espejo flotante.`,
        } as Record<string, unknown>,
        { transaction: t }
      );
    }

    // --- 2. Perfil de ESP_FLOT_1 -------------------------------------------
    const perfiles = await sequelize.query<{ id: number; ref: string; descripcion: string; codigos_por_color: Record<string, string> }>(
      `SELECT id, ref, descripcion, codigos_por_color FROM cotizador.diseno_perfil
        WHERE diseno_id = $1 ORDER BY orden FOR UPDATE`,
      { bind: [DISENO], type: QueryTypes.SELECT, transaction: t }
    );
    if (perfiles.length !== 1) {
      throw new Error(`Se esperaba 1 perfil en ${DISENO} y hay ${perfiles.length}: revisar a mano.`);
    }
    const perfil = perfiles[0];
    const perfilIgual =
      perfil.ref === PERFIL_NUEVO.ref &&
      perfil.descripcion === PERFIL_NUEVO.descripcion &&
      // Color por color: jsonb reordena las claves, así que comparar el JSON
      // serializado daría "distinto" en la segunda corrida.
      Object.keys(perfil.codigos_por_color ?? {}).length === COLORES.length &&
      COLORES.every((c) => perfil.codigos_por_color?.[c] === CODIGO);
    if (!perfilIgual && perfil.ref !== 'T99') {
      throw new Error(`El perfil de ${DISENO} tiene ref "${perfil.ref}", no T99: alguien lo cambió, revisar a mano.`);
    }
    console.log(
      `diseno_perfil #${perfil.id}:`,
      { ref: perfil.ref, descripcion: perfil.descripcion, codigos_por_color: perfil.codigos_por_color },
      perfilIgual ? '(ya estaba)' : '→',
      perfilIgual ? '' : PERFIL_NUEVO
    );
    if (!perfilIgual && APLICAR) {
      await sequelize.query(
        `UPDATE cotizador.diseno_perfil
            SET ref = $2, descripcion = $3, codigos_por_color = $4::jsonb
          WHERE id = $1`,
        { bind: [perfil.id, PERFIL_NUEVO.ref, PERFIL_NUEVO.descripcion, JSON.stringify(PERFIL_NUEVO.codigos_por_color)], transaction: t }
      );
    }

    if (APLICAR) {
      await t.commit();
      console.log('Aplicado. Recargar la caché del Cotizador o reiniciar el backend.');
    } else {
      await t.rollback();
      console.log('Simulación: no se escribió nada. Correr con --aplicar para escribir.');
    }
  } catch (e) {
    await t.rollback();
    throw e;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => setTimeout(() => sequelize.close(), 1500));

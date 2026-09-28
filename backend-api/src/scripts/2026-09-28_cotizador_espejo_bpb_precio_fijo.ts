// Espejo BPB a precio fijo de venta: $146.000/m² PA ANTES DE IVA (regla nueva
// del usuario, 2026-09-28). Solo el espejo: la instalación, el T-76 del
// flotante y el biselado siguen aparte y como estaban.
//
// Dos cambios, en una sola transacción:
//   1. Override de ES0001 con SOLO los precios de venta. El costo queda NULL en
//      el override, así que sigue siendo el de Proveedores (RAPI / TODOVIDRIO):
//      el sync lo sigue actualizando en la tabla base, pero ya no mueve PA/PM/PB.
//      Por eso override y no UPDATE a la tabla base, que la próxima factura
//      pisaría. Es la misma capa que escribe "editar precio" en Configuración.
//      - "Antes de IVA" es `subtotalConAiu`: el motor divide el precio de lista
//        entre el AIU (0,96), así que se guarda 146.000 × AIU.
//      - PM y PB proporcionales a PA según el multiplicador de VIDRIO
//        (decisión del usuario): conservan la misma relación que hoy.
//   2. Área real en los 3 diseños de espejo: `diseno_vidrio` de ESP_FLOT_1,
//      ESP_ELEV_1 y ESP_MARCO_1 pasa de 5 % a 0 % de desperdicio, para que con
//      o sin diseño el cliente pague exactamente precio × m² del espejo. Las
//      cabinas conservan su 5 %.
//
// `disenos.json` se corrigió en el mismo cambio para que la resiembra no
// devuelva el 5 %. `catalogo.json` no cambia: el override vive aparte.
//
// Idempotente. Por defecto solo muestra el antes/después; `--aplicar` escribe.
// NO se ejecuta con `npm run dev`. Tras aplicarlo, recargar la caché del
// Cotizador (POST /api/cotizador/recargar) o reiniciar el backend:
//   npx ts-node --files src/scripts/2026-09-28_cotizador_espejo_bpb_precio_fijo.ts [--aplicar]
import { QueryTypes } from 'sequelize';
import { sequelize, CotizadorPrecioOverride, CotizadorPrecioHistorial } from '../models';

const CODIGO = 'ES0001';
const PA_ANTES_DE_IVA = 146000;
const DISENOS_ESPEJO = [
  'Vidrios y Espejos::ESP_FLOT_1',
  'Vidrios y Espejos::ESP_ELEV_1',
  'Vidrios y Espejos::ESP_MARCO_1',
];
const MOTIVO = `Regla comercial: espejo BPB a $${PA_ANTES_DE_IVA}/m² PA antes de IVA; PM/PB proporcionales.`;

const round2 = (n: number) => Math.round(n * 100) / 100;
const APLICAR = process.argv.includes('--aplicar');

type Precios = { precio_pa: number | null; precio_pm: number | null; precio_pb: number | null };

async function main() {
  const t = await sequelize.transaction();
  try {
    // --- 1. Override de ES0001 ---------------------------------------------
    const [param] = await sequelize.query<{ aiu: number }>(
      `SELECT aiu FROM cotizador.parametro WHERE id = 1`,
      { type: QueryTypes.SELECT, transaction: t }
    );
    const [mult] = await sequelize.query<{ pa: number; pm: number; pb: number }>(
      `SELECT multiplicador_pa pa, multiplicador_pm pm, multiplicador_pb pb
         FROM cotizador.multiplicador_categoria WHERE categoria = 'VIDRIO'`,
      { type: QueryTypes.SELECT, transaction: t }
    );
    const [base] = await sequelize.query<Precios & { costo_unitario: number; categoria: string }>(
      `SELECT categoria, costo_unitario, precio_pa, precio_pm, precio_pb
         FROM cotizador.producto WHERE codigo = $1`,
      { bind: [CODIGO], type: QueryTypes.SELECT, transaction: t }
    );
    if (!param?.aiu || !mult?.pa || !base) throw new Error('Faltan AIU, multiplicador de VIDRIO o el producto ES0001.');
    if (base.categoria !== 'VIDRIO') throw new Error(`ES0001 es ${base.categoria}, no VIDRIO: revisar a mano.`);

    const aiu = Number(param.aiu);
    const nuevo: Precios = {
      precio_pa: round2(PA_ANTES_DE_IVA * aiu),
      precio_pm: round2(PA_ANTES_DE_IVA * (mult.pm / mult.pa) * aiu),
      precio_pb: round2(PA_ANTES_DE_IVA * (mult.pb / mult.pa) * aiu),
    };

    const existente = await CotizadorPrecioOverride.findByPk(CODIGO, { transaction: t, lock: t.LOCK.UPDATE });
    const actual = existente ? (existente.get({ plain: true }) as Precios & { costo_unitario: number | null; activo: boolean | null }) : null;
    if (actual && (actual.costo_unitario !== null || actual.activo === false)) {
      throw new Error(`ES0001 ya tiene un override con costo o baja (${JSON.stringify(actual)}): revisar a mano.`);
    }
    const overrideIgual =
      !!actual && (['precio_pa', 'precio_pm', 'precio_pb'] as const).every((k) => actual[k] === nuevo[k]);

    // Lo que el motor veía antes: override (si había) sobre la base.
    const antesEfectivo = {
      costo_unitario: Number(base.costo_unitario),
      precio_pa: Number(actual?.precio_pa ?? base.precio_pa),
      precio_pm: Number(actual?.precio_pm ?? base.precio_pm),
      precio_pb: Number(actual?.precio_pb ?? base.precio_pb),
    };
    const despuesEfectivo = { costo_unitario: Number(base.costo_unitario), ...nuevo };
    console.log(`${CODIGO} (precio de lista; antes de IVA = ÷ ${aiu}):`, antesEfectivo, overrideIgual ? '(ya estaba)' : '→', overrideIgual ? '' : despuesEfectivo);
    console.log('  antes de IVA por m²:', {
      PA: round2(nuevo.precio_pa! / aiu),
      PM: round2(nuevo.precio_pm! / aiu),
      PB: round2(nuevo.precio_pb! / aiu),
    });

    if (!overrideIgual && APLICAR) {
      const valores = { ...nuevo, fecha: new Date(), por: 'script-2026-09-28', motivo: MOTIVO };
      if (existente) await existente.update(valores, { transaction: t });
      else await CotizadorPrecioOverride.create({ codigo: CODIGO, ...valores }, { transaction: t });
      await CotizadorPrecioHistorial.create(
        {
          fecha: new Date(),
          accion: 'editar-precio',
          codigo: CODIGO,
          antes: antesEfectivo,
          despues: despuesEfectivo,
          por: 'script-2026-09-28',
          motivo: MOTIVO,
        } as Record<string, unknown>,
        { transaction: t }
      );
    }

    // --- 2. Área real en los diseños de espejo -----------------------------
    const vidrios = await sequelize.query<{ id: number; diseno_id: string; desperdicio_pct: number }>(
      `SELECT id, diseno_id, desperdicio_pct FROM cotizador.diseno_vidrio
        WHERE diseno_id = ANY($1) ORDER BY diseno_id FOR UPDATE`,
      { bind: [DISENOS_ESPEJO], type: QueryTypes.SELECT, transaction: t }
    );
    if (vidrios.length !== DISENOS_ESPEJO.length) {
      throw new Error(`Se esperaban ${DISENOS_ESPEJO.length} paños de espejo y hay ${vidrios.length}: revisar a mano.`);
    }
    for (const v of vidrios) {
      console.log(`diseno_vidrio #${v.id} ${v.diseno_id}: desperdicio ${v.desperdicio_pct} %`, Number(v.desperdicio_pct) === 0 ? '(ya estaba)' : '→ 0 %');
    }
    if (APLICAR) {
      await sequelize.query(
        `UPDATE cotizador.diseno_vidrio SET desperdicio_pct = 0 WHERE diseno_id = ANY($1) AND desperdicio_pct <> 0`,
        { bind: [DISENOS_ESPEJO], transaction: t }
      );
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

// Reinicia la numeración del Cotizador para que la primera cotización real sea
// la COT-17000 (decisión del usuario, 2026-09-28).
//
// Por qué 17000: la serie del talonario/sistema anterior, que las ODP guardan a
// mano en `odp.numero_cotizacion`, llegó a 16808. Arrancar por encima deja claro
// que una "16xxx" es de la serie vieja y una "COT-17xxx" es del Cotizador.
//
// Qué hace, en UNA transacción:
//   1. Borra las 3 cotizaciones de prueba (COT-87, COT-90, COT-91 — ids 88, 91,
//      92), con sus propuestas, ítems y cargos. De a uno por instancia, igual que
//      `cotizacionStore.eliminar`: los hooks de auditoría son de instancia y un
//      borrado en bloque (o el ON DELETE CASCADE) no dejaría rastro.
//   2. Deja `cotizador.consecutivo` ('cotizacion') en 16999: la próxima que se
//      cree toma 17000 (`UPDATE … SET valor = valor + 1 RETURNING valor`).
//
// ⚠️ Efecto colateral conocido: la COT-87 envió los sap_items 2213, 2214 y 2215
// a la SAP 405 (ODP-24381). El FK `sap_items.origen_cotizacion_id` es ON DELETE
// SET NULL, así que esos ítems pierden la referencia a la cotización y la ODP y
// la SAP quedan intactas. Su posible borrado se analiza aparte (pedido del
// usuario); los ids quedan anotados en SESSION_LOG.md.
//
// Protección: si existe cualquier cotización que no sea una de las 3 pruebas
// (alguien creó una real), aborta sin tocar nada. Idempotente: si las pruebas ya
// no están, sólo ajusta el contador.
//
// Por defecto sólo previsualiza; `--aplicar` escribe. NO se ejecuta con
// `npm run dev`:
//   npx ts-node --files src/scripts/2026-09-28_reiniciar_consecutivo_cotizador.ts [--aplicar]
import { QueryTypes } from 'sequelize';
import {
  sequelize,
  CotizadorCotizacion,
  CotizadorCotizacionItem,
  CotizadorPropuesta,
  CotizadorPropuestaCargo,
} from '../models';

const APLICAR = process.argv.includes('--aplicar');
const IDS_PRUEBA = [88, 91, 92];
const VALOR_CONTADOR = 16999; // la próxima será la COT-17000

interface Destruible {
  destroy: (o: { transaction: unknown }) => Promise<unknown>;
}

async function main() {
  const existentes = await sequelize.query<{ id: number; numero: number; cliente_nombre: string | null }>(
    'SELECT id, numero, cliente_nombre FROM cotizador.cotizacion ORDER BY numero',
    { type: QueryTypes.SELECT }
  );
  const ajenas = existentes.filter((c) => !IDS_PRUEBA.includes(Number(c.id)));
  if (ajenas.length > 0) {
    console.error('✗ Hay cotizaciones que no son las pruebas conocidas; no se toca nada:');
    for (const c of ajenas) console.error(`   id ${c.id} · COT-${c.numero} · ${c.cliente_nombre ?? ''}`);
    process.exitCode = 1;
    return;
  }

  const [contador] = await sequelize.query<{ valor: number }>(
    "SELECT valor FROM cotizador.consecutivo WHERE nombre = 'cotizacion'",
    { type: QueryTypes.SELECT }
  );
  if (!contador) throw new Error("No existe el contador 'cotizacion' en cotizador.consecutivo.");

  const sapItems = await sequelize.query<{ id: number; sap_id: number; origen_cotizacion_id: number }>(
    'SELECT id, sap_id, origen_cotizacion_id FROM sap_items WHERE origen_cotizacion_id IN (:ids) ORDER BY id',
    { replacements: { ids: IDS_PRUEBA }, type: QueryTypes.SELECT }
  );

  console.log(`Cotizaciones de prueba a borrar: ${existentes.map((c) => `COT-${c.numero}`).join(', ') || 'ninguna'}`);
  console.log(`sap_items que pierden la referencia: ${sapItems.map((s) => `${s.id} (SAP ${s.sap_id})`).join(', ') || 'ninguno'}`);
  console.log(`Contador: ${contador.valor} → ${VALOR_CONTADOR} (próxima: COT-${VALOR_CONTADOR + 1})`);

  if (!APLICAR) {
    console.log('\nPrevisualización. Corre con --aplicar para escribir.');
    return;
  }

  await sequelize.transaction(async (t) => {
    for (const id of existentes.map((c) => Number(c.id))) {
      const items = (await CotizadorCotizacionItem.findAll({ where: { cotizacion_id: id }, transaction: t })) as unknown as Destruible[];
      for (const it of items) await it.destroy({ transaction: t });

      const propuestas = (await CotizadorPropuesta.findAll({ where: { cotizacion_id: id }, transaction: t })) as unknown as Array<
        Destruible & { id: number }
      >;
      for (const p of propuestas) {
        const cargos = (await CotizadorPropuestaCargo.findAll({ where: { propuesta_id: p.id }, transaction: t })) as unknown as Destruible[];
        for (const c of cargos) await c.destroy({ transaction: t });
        await p.destroy({ transaction: t });
      }

      const cot = (await CotizadorCotizacion.findByPk(id, { transaction: t })) as unknown as Destruible | null;
      if (cot) await cot.destroy({ transaction: t });
    }

    await sequelize.query("UPDATE cotizador.consecutivo SET valor = :valor WHERE nombre = 'cotizacion'", {
      replacements: { valor: VALOR_CONTADOR },
      transaction: t,
    });
  });

  const [despues] = await sequelize.query<{ n: string; valor: number }>(
    "SELECT (SELECT count(*) FROM cotizador.cotizacion) AS n, (SELECT valor FROM cotizador.consecutivo WHERE nombre = 'cotizacion') AS valor",
    { type: QueryTypes.SELECT }
  );
  console.log(`\n✓ Aplicado. Cotizaciones: ${despues.n} · contador: ${despues.valor} · próxima: COT-${Number(despues.valor) + 1}`);
}

main()
  .catch((e) => {
    console.error('✗ Error:', e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  // Los hooks de auditoría escriben sin await: se les da tiempo antes de cerrar.
  .finally(() => setTimeout(() => sequelize.close(), 1500));

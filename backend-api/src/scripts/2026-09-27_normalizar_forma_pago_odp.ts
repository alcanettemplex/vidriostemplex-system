// Normaliza `odp.forma_pago = 'CONTADO'` → 'contado' (2026-09-27).
//
// "Crear ODP desde lead" (crm.controller → crearODPParaLead) guardaba la forma de
// pago en mayúsculas, mientras que ODPForm, los filtros del explorador de ODP y
// el buscador de Supervisión CRM usan 'contado'. Efecto: esas ODP no salían al
// filtrar por "Contado" y, al editarlas, el selector de forma de pago aparecía
// vacío. El origen se corrigió en el mismo cambio.
//
// Por defecto SOLO CUENTA. Escribe únicamente con `--aplicar`, fila por fila con
// `individualHooks` para que cada cambio quede en la auditoría.
//
// NO se ejecuta con `npm run dev`. Correr a mano tras desplegar:
//   npx ts-node --files src/scripts/2026-09-27_normalizar_forma_pago_odp.ts            (cuenta)
//   npx ts-node --files src/scripts/2026-09-27_normalizar_forma_pago_odp.ts --aplicar  (escribe)
import { sequelize, ODP } from '../models';

async function main() {
  const aplicar = process.argv.includes('--aplicar');
  const filas = (await ODP.findAll({
    where: { forma_pago: 'CONTADO' },
    attributes: ['id', 'numero_odp', 'forma_pago'],
  })) as unknown as { id: number; numero_odp: string; update: (d: object, o: object) => Promise<unknown> }[];
  console.log(`ODP con forma_pago 'CONTADO': ${filas.length}`);
  if (!aplicar) {
    console.log('Solo conteo. Para normalizar, correr con --aplicar.');
    return;
  }
  let hechas = 0;
  for (const f of filas) {
    await f.update({ forma_pago: 'contado' }, { hooks: true });
    hechas += 1;
  }
  console.log(`Normalizadas: ${hechas}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  // Los hooks de auditoría escriben sin await: dar un respiro antes de cerrar.
  .finally(() => setTimeout(() => sequelize.close(), 2000));

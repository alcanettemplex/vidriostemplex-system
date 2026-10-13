/**
 * Script: reporte_asesores.ts — motor de la skill /reporte-asesores de Claude Code.
 *
 * Imprime el mensaje del día para el grupo de WhatsApp con las MISMAS reglas que el
 * botón "Reporte del día" de Supervisión CRM (utils/reporteAsesores.ts). Solo lee:
 * no registra el envío ni marca cumplimientos (eso lo hace el ERP).
 *
 * Uso (desde backend-api/):
 *   npx ts-node --files src/scripts/reporte_asesores.ts
 *   npx ts-node --files src/scripts/reporte_asesores.ts --asesor "paola"     (uno o varios, separados por coma)
 *   npx ts-node --files src/scripts/reporte_asesores.ts --nuevos             (descuenta lo ya enviado hoy)
 *   npx ts-node --files src/scripts/reporte_asesores.ts --json               (datos estructurados por asesor)
 */
import { Op } from 'sequelize';
import sequelize from '../config/database';
import { Usuario } from '../models';
import { construirReporte } from '../utils/reporteAsesores';

const args = process.argv.slice(2);
const valorDe = (flag: string): string | undefined => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

async function idsPorNombre(filtro: string): Promise<number[]> {
  const usuarios = await Usuario.findAll({
    where: { rol: { [Op.notIn]: ['instalador', 'conductor'] } },
    attributes: ['id', 'nombre_completo'],
  });
  const buscados = filtro.split(',').map((t) => sinTildes(t.trim())).filter(Boolean);
  return usuarios
    .filter((u) => buscados.some((b) => sinTildes(u.getDataValue('nombre_completo')).includes(b)))
    .map((u) => u.getDataValue('id') as number);
}

async function main() {
  const filtro = valorDe('--asesor');
  let asesorIds: number[] | undefined;
  if (filtro) {
    asesorIds = await idsPorNombre(filtro);
    if (asesorIds.length === 0) {
      console.log(`No encontré ningún usuario cuyo nombre contenga "${filtro}".`);
      return;
    }
  }
  const reporte = await construirReporte({ asesorIds, soloNuevos: args.includes('--nuevos') });
  if (args.includes('--json')) {
    console.log(JSON.stringify({
      fecha: reporte.fecha, parte: reporte.parte, totales: reporte.totales,
      grupos: reporte.grupos.map((g) => ({
        responsable: g.nombre, activo: g.activo, leads: g.leads, odps: g.odps, saldo: g.saldo,
        items: g.items.map((i) => ({ tipo: i.tipo, texto: i.texto, lead_id: i.lead_id, odp_id: i.odp_id })),
      })),
    }, null, 2));
    return;
  }
  console.log(reporte.mensaje);
}

main()
  .catch((e) => { console.error('No se pudo armar el reporte:', e.message); process.exitCode = 1; })
  .finally(() => sequelize.close());

/**
 * Script: 2026-10-05_cerrar_rutas_sin_pendientes.ts
 *
 * Propósito: cerrar las rutas de instalación que siguen en `programada` / `en_curso`
 * aunque ya no les queda ninguna parada viva (`pendiente`, `en_curso`, `con_dano`).
 *
 * Al 2026-10-05 eran 4 (las 3 de "En curso" y una de "Programada"):
 *   - #322 y #411: sus ODPs se cerraron desde "Pendientes de cierre" el 2 y 3 de
 *     septiembre, antes del fix d98a272 que hizo que ese panel cerrara también la ruta.
 *   - #393 y #505: su única parada quedó `pausada`. Desde el 2026-10-05 pausar saca la ODP
 *     de la ruta (decisión del usuario), así que una parada pausada ya no la mantiene viva.
 *     Al cerrarlas, ODP-24203 y ODP-24313 reaparecen en su bandeja de Instalaciones.
 *
 * La regla es la misma de `cerrarRutaSiSinPendientes` (rutas.controller.ts): la ruta pasa
 * a `completada` con `fin_ruta` = el último `fin_instalacion` de sus paradas.
 * Se actualiza ruta por ruta (no en bloque) para que los hooks de auditoría registren el cambio.
 *
 * Ejecutar (vista previa):  npx ts-node src/scripts/2026-10-05_cerrar_rutas_sin_pendientes.ts
 * Aplicar:                  npx ts-node src/scripts/2026-10-05_cerrar_rutas_sin_pendientes.ts --aplicar
 * Idempotente: una segunda corrida no encuentra nada.
 */

import { QueryTypes } from 'sequelize';
import { sequelize, RutaInstalacion } from '../models';

const APLICAR = process.argv.includes('--aplicar');

interface Candidata {
  id: number;
  estado: string;
  creado_en: Date;
  paradas: string;
  fin_ultima: Date | null;
}

async function main() {
  const candidatas = await sequelize.query<Candidata>(
    `SELECT ri.id, ri.estado, ri.creado_en,
            string_agg(o.numero_odp || ' (' || ro.estado || ', ODP ' || o.estado_produccion || ')', '; ' ORDER BY ro.orden) AS paradas,
            MAX(ro.fin_instalacion) AS fin_ultima
       FROM rutas_instalacion ri
       JOIN ruta_odp ro ON ro.ruta_id = ri.id
       JOIN odp o ON o.id = ro.odp_id
      WHERE ri.estado IN ('programada', 'en_curso')
      GROUP BY ri.id, ri.estado, ri.creado_en
     HAVING bool_and(ro.estado NOT IN ('pendiente', 'en_curso', 'con_dano'))
      ORDER BY ri.id`,
    { type: QueryTypes.SELECT }
  );

  console.log(`\nRutas abiertas sin paradas vivas: ${candidatas.length}`);
  for (const c of candidatas) {
    console.log(`  #${c.id} [${c.estado}] → completada · fin_ruta ${c.fin_ultima?.toISOString() ?? '(ahora)'} · ${c.paradas}`);
  }

  if (!candidatas.length) { console.log('Nada que hacer.'); return; }
  if (!APLICAR) { console.log('\nVista previa: no se cambió nada. Corre con --aplicar para cerrarlas.'); return; }

  await sequelize.transaction(async (t) => {
    for (const c of candidatas) {
      const ruta = await RutaInstalacion.findByPk(c.id, { transaction: t, lock: t.LOCK.UPDATE }) as any;
      // Revalidado dentro de la transacción por si alguien la movió entre la consulta y aquí.
      if (!ruta || !['programada', 'en_curso'].includes(ruta.estado)) continue;
      await ruta.update({ estado: 'completada', fin_ruta: c.fin_ultima ?? new Date() }, { transaction: t });
    }
  });
  console.log(`\nAplicado: ${candidatas.length} ruta(s) cerradas.`);
}

main()
  .catch((e) => { console.error('Error:', e.message); process.exitCode = 1; })
  .finally(() => sequelize.close());

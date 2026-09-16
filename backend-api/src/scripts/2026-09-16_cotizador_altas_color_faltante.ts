/**
 * Script: 2026-09-16_cotizador_altas_color_faltante.ts
 *
 * Cierra el hueco de colores detectado el 2026-09-16: al cotizar Sistema5020 en
 * negro, el motor sustituía en silencio por mate porque el color no estaba en
 * `codigos_por_color` de esos perfiles — aunque el código SÍ existe en
 * `catalogo_productos` y con precio de proveedor activo. El aviso hardcodeado
 * de `ventanas.ts` ("en 5020 no existe ninguna referencia negra") ya no es
 * cierto, se corrige en el mismo commit.
 *
 * Alcance: no solo 5020/negro. Se revisaron los 13 sistemas y se cruzó cada
 * combinación (sistema, ref, color) sin mapear contra `catalogo_productos` +
 * `proveedor_producto` (precio activo). De 184 combinaciones faltantes, estas
 * 22 (16 códigos únicos — Sistema5020 y Sistema5020Reforzado comparten piezas)
 * tenían candidato único en el catálogo Y precio de proveedor. Las 58 sin
 * precio y las 104 sin código en el catálogo NO se tocan aquí — decisión
 * explícita del usuario: esperar el Excel de precios antes de darlas de alta,
 * para no cobrar $0 en silencio (la regla de oro de este módulo).
 *
 * MÉTODO DE PRECIO (confirmado por el usuario, 2026-09-16): cada producto
 * nuevo hereda categoría, unidad y multiplicador PA/PM/PB del "hermano" — el
 * mismo perfil (sistema+ref) en otro color que ya existe en cotizador.producto
 * con costo y precio reales. El costo sale de `proveedor_producto.precio_actual`
 * activo, normalizado a costo-por-metro (÷6 si la unidad de compra es
 * TIRA_6M, como el enganche 147 del 5020).
 *
 * QUÉ HACE
 *   1. Crea los 16 códigos en `cotizador.producto` (origen='CATALOGO',
 *      enlazados a su fila real de `catalogo_productos` vía catalogo_producto_id).
 *   2. Agrega la clave de color faltante a `codigos_por_color` en
 *      `cotizador.diseno_perfil`, para las 22 combinaciones (sistema, ref) —
 *      vía JOIN con `cotizador.diseno` por sistema, nunca por diseño individual,
 *      porque una misma pieza física se repite en todos los diseños de ese
 *      sistema.
 *   3. Llama a `POST /api/cotizador/recargar` contra el backend local para que
 *      el proceso en caliente vea los datos nuevos sin reiniciar — el propio
 *      script corre en un proceso aparte y no comparte la caché en memoria.
 *
 * Idempotente: salta cualquier código que ya exista en cotizador.producto, y
 * cualquier (sistema, ref) que ya tenga esa clave de color.
 *
 * Uso:
 *   DOTENV_CONFIG_PATH=backend-api/.env ./backend-api/node_modules/.bin/ts-node \
 *     -r ./backend-api/node_modules/dotenv/config \
 *     backend-api/src/scripts/2026-09-16_cotizador_altas_color_faltante.ts
 */
import jwt from 'jsonwebtoken';
import { QueryTypes } from 'sequelize';
import { sequelize, CotizadorProducto, CatalogoProducto } from '../models';
import { requestContext } from '../utils/requestContext';

interface Combo {
  sistema: string;
  ref: string;
  color: string;
  codigo: string;
  descripcion: string;
  categoria: string;
  unidad: string;
  costo_unitario: number;
  precio_pa: number;
  precio_pm: number;
  precio_pb: number;
}

const COMBOS: Combo[] = [
  { sistema: 'Sistema3831', ref: '173', color: 'NEGRO', codigo: 'SIL0606', descripcion: '3831 SILLAR CABEZAL 173 NEGRO', categoria: 'PERFILERIA', unidad: 'X METRO', costo_unitario: 14957.98, precio_pa: 23362, precio_pm: 22050, precio_pb: 20738 },
  { sistema: 'Sistema3831', ref: '174', color: 'CRUDO', codigo: 'JAM0302', descripcion: '3831 JAMBA 174 CRUDO', categoria: 'PERFILERIA', unidad: 'X METRO', costo_unitario: 15882.35, precio_pa: 24806, precio_pm: 23413, precio_pb: 22019 },
  { sistema: 'Sistema5020', ref: '144', color: 'NEGRO', codigo: 'CAB0606', descripcion: '5020 CABEZAL 144 NEGRO', categoria: 'PERFILERIA', unidad: 'X METRO', costo_unitario: 16302.52, precio_pa: 25462, precio_pm: 24032, precio_pb: 22602 },
  { sistema: 'Sistema5020', ref: '147', color: 'NEGRO', codigo: 'ENG0506', descripcion: '5020 ENGANCHE 147 NEGRO', categoria: 'PERFILERIA', unidad: 'X METRO', costo_unitario: 10630.25, precio_pa: 16603, precio_pm: 15670, precio_pb: 14738 },
  { sistema: 'Sistema5020', ref: '148', color: 'NEGRO', codigo: 'HOR0603', descripcion: '5020 HORIZONTAL 148 NEGRO', categoria: 'PERFILERIA', unidad: 'X METRO', costo_unitario: 16386.55, precio_pa: 25593, precio_pm: 24156, precio_pb: 22718 },
  { sistema: 'Sistema5020', ref: '192', color: 'NEGRO', codigo: 'TRA0604', descripcion: '5020 TRASLAPE 192 NEGRO', categoria: 'PERFILERIA', unidad: 'X METRO', costo_unitario: 10336.13, precio_pa: 16143, precio_pm: 15237, precio_pb: 14330 },
  { sistema: 'Sistema5020', ref: '193', color: 'NEGRO', codigo: 'JAM0605', descripcion: '5020 JAMBA 193 NEGRO', categoria: 'PERFILERIA', unidad: 'X METRO', costo_unitario: 16050.42, precio_pa: 25068, precio_pm: 23660, precio_pb: 22252 },
  { sistema: 'Sistema5020', ref: '194', color: 'NEGRO', codigo: 'SIL0603', descripcion: '5020 SILLAR 194 NEGRO', categoria: 'PERFILERIA', unidad: 'X METRO', costo_unitario: 17647.06, precio_pa: 27562, precio_pm: 26014, precio_pb: 24466 },
  { sistema: 'Sistema5020Reforzado', ref: '144', color: 'NEGRO', codigo: 'CAB0606', descripcion: '5020 CABEZAL 144 NEGRO', categoria: 'PERFILERIA', unidad: 'X METRO', costo_unitario: 16302.52, precio_pa: 25462, precio_pm: 24032, precio_pb: 22602 },
  { sistema: 'Sistema5020Reforzado', ref: '147', color: 'NEGRO', codigo: 'ENG0506', descripcion: '5020 ENGANCHE 147 NEGRO', categoria: 'PERFILERIA', unidad: 'X METRO', costo_unitario: 10630.25, precio_pa: 16603, precio_pm: 15670, precio_pb: 14738 },
  { sistema: 'Sistema5020Reforzado', ref: '148', color: 'NEGRO', codigo: 'HOR0603', descripcion: '5020 HORIZONTAL 148 NEGRO', categoria: 'PERFILERIA', unidad: 'X METRO', costo_unitario: 16386.55, precio_pa: 25593, precio_pm: 24156, precio_pb: 22718 },
  { sistema: 'Sistema5020Reforzado', ref: '192', color: 'NEGRO', codigo: 'TRA0604', descripcion: '5020 TRASLAPE 192 NEGRO', categoria: 'PERFILERIA', unidad: 'X METRO', costo_unitario: 10336.13, precio_pa: 16143, precio_pm: 15237, precio_pb: 14330 },
  { sistema: 'Sistema5020Reforzado', ref: '193', color: 'NEGRO', codigo: 'JAM0605', descripcion: '5020 JAMBA 193 NEGRO', categoria: 'PERFILERIA', unidad: 'X METRO', costo_unitario: 16050.42, precio_pa: 25068, precio_pm: 23660, precio_pb: 22252 },
  { sistema: 'Sistema5020Reforzado', ref: '194', color: 'NEGRO', codigo: 'SIL0603', descripcion: '5020 SILLAR 194 NEGRO', categoria: 'PERFILERIA', unidad: 'X METRO', costo_unitario: 17647.06, precio_pa: 27562, precio_pm: 26014, precio_pb: 24466 },
  { sistema: 'Sistema744', ref: '387', color: 'CRUDO', codigo: 'SIL0304', descripcion: '744 SILLAR 387 CRUDO', categoria: 'PERFILERIA', unidad: 'X METRO', costo_unitario: 16554.62, precio_pa: 25856, precio_pm: 24404, precio_pb: 22951 },
  { sistema: 'Sistema744', ref: '388', color: 'CRUDO', codigo: 'TRA0306', descripcion: '744 TRASLAPE 388 CRUDO', categoria: 'PERFILERIA', unidad: 'X METRO', costo_unitario: 13347.34, precio_pa: 20846, precio_pm: 19676, precio_pb: 18505 },
  { sistema: 'Sistema744', ref: '389', color: 'CRUDO', codigo: 'HOS0302', descripcion: '744 HORIZONTAL SUPERIOR 389 CRUDO', categoria: 'PERFILERIA', unidad: 'X METRO', costo_unitario: 12100.84, precio_pa: 18900, precio_pm: 17838, precio_pb: 16777 },
  { sistema: 'Sistema744', ref: '390', color: 'CRUDO', codigo: 'HOI0302', descripcion: '744 HORIZONTAL INFERIOR 390 CRUDO', categoria: 'PERFILERIA', unidad: 'X METRO', costo_unitario: 15798.32, precio_pa: 24674, precio_pm: 23289, precio_pb: 21903 },
  { sistema: 'Sistema744', ref: '391', color: 'CRUDO', codigo: 'ENG0304', descripcion: '744 ENGANCHE 391 CRUDO', categoria: 'PERFILERIA', unidad: 'X METRO', costo_unitario: 14103.64, precio_pa: 22028, precio_pm: 20791, precio_pb: 19553 },
  { sistema: 'Sistema744', ref: '392', color: 'CRUDO', codigo: 'CAB0306', descripcion: '744 CABEZAL 392 CRUDO', categoria: 'PERFILERIA', unidad: 'X METRO', costo_unitario: 11932.77, precio_pa: 18637, precio_pm: 17590, precio_pb: 16544 },
  { sistema: 'Sistema744', ref: '393', color: 'CRUDO', codigo: 'JAM0306', descripcion: '744 JAMBA 393 CRUDO', categoria: 'PERFILERIA', unidad: 'X METRO', costo_unitario: 15462.18, precio_pa: 24149, precio_pm: 22793, precio_pb: 21437 },
  { sistema: 'Sistema8025', ref: '191', color: 'NEGRO', codigo: 'ENG0607', descripcion: '8025 ENGANCHE 191 NEGRO', categoria: 'PERFILERIA', unidad: 'X METRO', costo_unitario: 28235.29, precio_pa: 44099, precio_pm: 41622, precio_pb: 39146 },
];

async function recargarCotizadorLocal(): Promise<void> {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.log('⚠ JWT_SECRET no disponible en este proceso, no se pudo recargar la caché del backend local. Recargala manualmente (Sistema → Cotizador → Recargar, o reinicia el backend).');
    return;
  }
  const token = jwt.sign({ id: 30, rol: 'root' }, secret, { expiresIn: '2m' });
  try {
    const res = await fetch('http://localhost:3001/api/cotizador/recargar', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    console.log('✓ Caché del Cotizador recargada en el backend local.');
  } catch (e) {
    console.log(`⚠ No se pudo recargar la caché del backend local (¿está corriendo en :3001?): ${e instanceof Error ? e.message : e}. Recargala manualmente.`);
  }
}

async function main(): Promise<void> {
  await requestContext.run({ userId: 30, userName: 'ROOT System', ip: null }, async () => {
    const t = await sequelize.transaction();
    try {
      const codigosUnicos = [...new Map(COMBOS.map((c) => [c.codigo, c])).values()];

      let creados = 0;
      let yaExistian = 0;
      for (const c of codigosUnicos) {
        const existente = await CotizadorProducto.findByPk(c.codigo, { transaction: t });
        if (existente) {
          yaExistian++;
          continue;
        }
        const catalogo = await CatalogoProducto.findOne({ where: { codigo: c.codigo }, transaction: t });
        if (!catalogo) {
          throw new Error(`${c.codigo} no existe en catalogo_productos — abortando, los datos cambiaron desde el análisis.`);
        }
        await CotizadorProducto.create(
          {
            codigo: c.codigo,
            descripcion: c.descripcion,
            categoria: c.categoria,
            unidad: c.unidad,
            costo_unitario: c.costo_unitario,
            precio_pa: c.precio_pa,
            precio_pm: c.precio_pm,
            precio_pb: c.precio_pb,
            origen: 'CATALOGO',
            provisional: false,
            catalogo_producto_id: catalogo.getDataValue('id'),
            fuente: `${c.sistema} · multiplicador heredado del hermano en otro color`,
            creado_en: new Date(),
            creado_por: 'sesion-2026-09-16',
          },
          { transaction: t }
        );
        creados++;
      }
      console.log(`✓ cotizador.producto: ${creados} código(s) creado(s), ${yaExistian} ya existían.`);

      let mapeados = 0;
      let yaMapeados = 0;
      for (const c of COMBOS) {
        const [, filas] = await sequelize.query(
          `UPDATE cotizador.diseno_perfil dp
              SET codigos_por_color = dp.codigos_por_color || jsonb_build_object(:color, :codigo)
             FROM cotizador.diseno d
            WHERE d.id = dp.diseno_id AND d.sistema = :sistema AND dp.ref = :ref
              AND NOT (dp.codigos_por_color ? :color)`,
          { replacements: { color: c.color, codigo: c.codigo, sistema: c.sistema, ref: c.ref }, transaction: t }
        );
        const n = (filas as unknown as { rowCount?: number })?.rowCount ?? 0;
        if (n > 0) mapeados += n;
        else {
          // 0 filas: o ya estaba mapeado (idempotencia) o el (sistema, ref) no existe más.
          const [chequeo] = await sequelize.query<{ existe: boolean }>(
            `SELECT EXISTS (
               SELECT 1 FROM cotizador.diseno_perfil dp
                 JOIN cotizador.diseno d ON d.id = dp.diseno_id
                WHERE d.sistema = :sistema AND dp.ref = :ref
             ) AS existe`,
            { replacements: { sistema: c.sistema, ref: c.ref }, transaction: t, type: QueryTypes.SELECT }
          );
          if (!chequeo?.existe) {
            throw new Error(`(${c.sistema}, ${c.ref}) ya no existe en cotizador.diseno_perfil — abortando.`);
          }
          yaMapeados++;
        }
      }
      console.log(`✓ cotizador.diseno_perfil: ${mapeados} fila(s) actualizadas con color nuevo, ${yaMapeados} combinación(es) ya estaban mapeadas.`);

      await t.commit();
      console.log('\n=== Migración confirmada (COMMIT). ===');
    } catch (err) {
      await t.rollback();
      console.error('\n✘ Error — se hizo ROLLBACK, la BD queda como estaba:', err);
      throw err;
    }
  });

  await recargarCotizadorLocal();
  await sequelize.close();
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });

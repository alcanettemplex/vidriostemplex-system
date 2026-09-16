/**
 * Script: 2026-09-16_alta_16_codigos_precio_manual.ts
 *
 * 16 códigos de perfilería (Sistema3831 y Sistema8025) que existían en
 * catalogo_productos pero nunca tuvieron fila en proveedor_producto —ni
 * siquiera en el historial de compras del WO exportado el 2026-09-16—, así
 * que no se les pudo derivar un precio real como al resto de la reconciliación
 * de colores de esta misma sesión. El usuario dio un precio inicial "hasta que
 * haya un movimiento o registro en el módulo de Proveedores".
 *
 * Confirmado por el usuario (2026-09-16):
 *   - Proveedor: VENTANAS Y PUERTAS S.A.S (id 829) — el mismo que ya provee
 *     los 6 hermanos de estas mismas familias (3831/8025) ya cargados hoy.
 *   - Unidad: TIRA_6M (perfil entero de 6 metros), no por metro — los montos
 *     dados (45.000-135.000) coinciden en orden de magnitud con los otros
 *     productos TIRA_6M de este mismo proveedor (NAV0101 $117.479/tira,
 *     PPR0101 $35.126/tira), muy por encima de los que sí son por metro
 *     (12.500-28.400).
 *
 * QUÉ HACE
 *   1. Crea la fila real en `proveedor_producto` (unidad_compra=TIRA_6M,
 *      metros_por_unidad=6, precio_actual=el dado por el usuario) + su
 *      historial en `proveedor_producto_precio` (origen=MANUAL) — así, el día
 *      que Compras cargue una factura real de estos códigos, la ingesta la
 *      encuentra por (proveedor_id, catalogo_producto_id, unidad_compra) y la
 *      ACTUALIZA sola, sin duplicar fila. Cumple lo pedido: "hasta que haya un
 *      movimiento en el módulo de Proveedores".
 *   2. Da de alta el código en `cotizador.producto`, con costo_unitario =
 *      precio_tira / 6 y precio_pa/pm/pb con el multiplicador de PA/PM/PB del
 *      "hermano" (mismo sistema+ref, otro color, ya con costo y precio reales)
 *      — mismo método confirmado por el usuario para toda la reconciliación de
 *      colores de hoy. Los 16 hermanos usan el mismo multiplicador exacto
 *      (1.561841 / 1.474123 / 1.386405 — el que ya comparten 205 de los 331
 *      productos PERFILERIA del Cotizador).
 *   3. Agrega la clave de color a `codigos_por_color` en
 *      `cotizador.diseno_perfil`, vía JOIN por sistema (no por diseño
 *      individual — la pieza física se repite en todos los diseños de ese
 *      sistema).
 *
 * ⚠️ NO llama a `recalcularCostoDesdeProveedor()` (el motor de sync real de
 * `sincronizacionProveedores.ts`): esa función busca el multiplicador en
 * `cotizador.multiplicador_categoria`, que hoy SOLO tiene sembrada la fila
 * ACCESORIO (ver TECH_DEBT.md 2026-09-14) — para PERFILERIA devolvería
 * "omitido: sin multiplicador verificado" y no escribiría nada. Se replica
 * aquí el mismo cálculo a mano con el multiplicador del hermano, que es
 * exactamente el mismo número que usaría el sync si la tabla estuviera
 * sembrada. Consecuencia real para el usuario: cuando Compras cargue la
 * factura real de estos 16 códigos, `proveedor_producto` se actualizará solo,
 * pero el precio de venta en `cotizador.producto` NO se recalculará solo
 * hasta que se resuelva esa deuda técnica — quedará desalineado en silencio.
 *
 * Idempotente: aborta sin escribir nada si algún código ya tiene fila en
 * `proveedor_producto` o en `cotizador.producto`.
 *
 * Uso:
 *   DOTENV_CONFIG_PATH=backend-api/.env ./backend-api/node_modules/.bin/ts-node \
 *     -r ./backend-api/node_modules/dotenv/config \
 *     backend-api/src/scripts/2026-09-16_alta_16_codigos_precio_manual.ts
 */
import jwt from 'jsonwebtoken';
import { sequelize, CotizadorProducto, CatalogoProducto, ProveedorProducto, ProveedorProductoPrecio } from '../models';
import { requestContext } from '../utils/requestContext';

const PROVEEDOR_ID = 829; // VENTANAS Y PUERTAS S.A.S — confirmado por el usuario

interface Item {
  codigo: string;
  nombre: string;
  sistema: string;
  ref: string;
  color: string;
  precioTira: number;
  categoria: string;
  unidad: string;
  multPa: number;
  multPm: number;
  multPb: number;
}

const ITEMS: Item[] = [
  { codigo: 'NAV0305', nombre: '3831 NAVE 176 CRUDO', sistema: 'Sistema3831', ref: '176', color: 'CRUDO', precioTira: 87000, categoria: 'PERFILERIA', unidad: 'X METRO', multPa: 1.5618410982866604, multPm: 1.474123005852837, multPb: 1.3864049134190133 },
  { codigo: 'DIV0401', nombre: '3831 DIVISOR 292 BLANCO', sistema: 'Sistema3831', ref: '292', color: 'BLANCO', precioTira: 135000, categoria: 'PERFILERIA', unidad: 'X METRO', multPa: 1.5618410982866604, multPm: 1.474123005852837, multPb: 1.3864049134190133 },
  { codigo: 'DIV0303', nombre: '3831 DIVISOR 292 CRUDO', sistema: 'Sistema3831', ref: '292', color: 'CRUDO', precioTira: 135000, categoria: 'PERFILERIA', unidad: 'X METRO', multPa: 1.5618410982866604, multPm: 1.474123005852837, multPb: 1.3864049134190133 },
  { codigo: 'ESQ0302', nombre: '3831 ESQUINERO 416 CRUDO', sistema: 'Sistema3831-Semireforzado', ref: '416', color: 'CRUDO', precioTira: 135000, categoria: 'PERFILERIA', unidad: 'X METRO', multPa: 1.5618410982866604, multPm: 1.474123005852837, multPb: 1.3864049134190133 },
  { codigo: 'SIL0302', nombre: '8025 SILLAR 150 CRUDO', sistema: 'Sistema8025', ref: '150', color: 'CRUDO', precioTira: 120000, categoria: 'PERFILERIA', unidad: 'X METRO', multPa: 1.5618410982866604, multPm: 1.474123005852837, multPb: 1.3864049134190133 },
  { codigo: 'CAB0207', nombre: '8025 CABEZAL 151 GRIS PLATA', sistema: 'Sistema8025', ref: '151', color: 'GRISPLATA', precioTira: 103000, categoria: 'PERFILERIA', unidad: 'X METRO', multPa: 1.5618410982866604, multPm: 1.474123005852837, multPb: 1.3864049134190133 },
  { codigo: 'CAB0301', nombre: '8025 CABEZAL 151 CRUDO', sistema: 'Sistema8025', ref: '151', color: 'CRUDO', precioTira: 103000, categoria: 'PERFILERIA', unidad: 'X METRO', multPa: 1.5618410982866604, multPm: 1.474123005852837, multPb: 1.3864049134190133 },
  { codigo: 'JAM0301', nombre: '8025 JAMBA 152 CRUDO', sistema: 'Sistema8025', ref: '152', color: 'CRUDO', precioTira: 45000, categoria: 'PERFILERIA', unidad: 'X METRO', multPa: 1.5618410982866604, multPm: 1.474123005852837, multPb: 1.3864049134190133 },
  { codigo: 'HOS0301', nombre: '8025 HORIZONTAL SUPERIOR 156 CRUDO', sistema: 'Sistema8025', ref: '156', color: 'CRUDO', precioTira: 80000, categoria: 'PERFILERIA', unidad: 'X METRO', multPa: 1.5618410982866604, multPm: 1.474123005852837, multPb: 1.3864049134190133 },
  { codigo: 'HOI0301', nombre: '8025 HORIZONTAL INFERIOR 157 CRUDO', sistema: 'Sistema8025', ref: '157', color: 'CRUDO', precioTira: 80000, categoria: 'PERFILERIA', unidad: 'X METRO', multPa: 1.5618410982866604, multPm: 1.474123005852837, multPb: 1.3864049134190133 },
  { codigo: 'TRA0301', nombre: '8025 TRASLAPE 190 CRUDO', sistema: 'Sistema8025', ref: '190', color: 'CRUDO', precioTira: 100000, categoria: 'PERFILERIA', unidad: 'X METRO', multPa: 1.5618410982866604, multPm: 1.474123005852837, multPb: 1.3864049134190133 },
  { codigo: 'ENG0301', nombre: '8025 ENGANCHE 191 CRUDO', sistema: 'Sistema8025', ref: '191', color: 'CRUDO', precioTira: 100000, categoria: 'PERFILERIA', unidad: 'X METRO', multPa: 1.5618410982866604, multPm: 1.474123005852837, multPb: 1.3864049134190133 },
  { codigo: 'CAB0206', nombre: '8025 CABEZAL 706 BLANCO', sistema: 'Sistema8025', ref: '706', color: 'BLANCO', precioTira: 120000, categoria: 'PERFILERIA', unidad: 'X METRO', multPa: 1.5618410982866604, multPm: 1.474123005852837, multPb: 1.386404913419013 },
  { codigo: 'SIL0402', nombre: '8025 SILLAR 707 BLANCO', sistema: 'Sistema8025', ref: '707', color: 'BLANCO', precioTira: 120000, categoria: 'PERFILERIA', unidad: 'X METRO', multPa: 1.5618410982866604, multPm: 1.474123005852837, multPb: 1.3864049134190133 },
  { codigo: 'JAM0401', nombre: '8025 JAMBA 708 BLANCO', sistema: 'Sistema8025', ref: '708', color: 'BLANCO', precioTira: 120000, categoria: 'PERFILERIA', unidad: 'X METRO', multPa: 1.5618410982866604, multPm: 1.474123005852837, multPb: 1.3864049134190133 },
  { codigo: 'JAM0303', nombre: '8025 JAMBA 708 CRUDO', sistema: 'Sistema8025', ref: '708', color: 'CRUDO', precioTira: 120000, categoria: 'PERFILERIA', unidad: 'X METRO', multPa: 1.5618410982866604, multPm: 1.474123005852837, multPb: 1.3864049134190133 },
];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function recargarCotizadorLocal(): Promise<void> {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.log('⚠ JWT_SECRET no disponible, no se pudo recargar la caché del backend local.');
    return;
  }
  const token = jwt.sign({ id: 30, rol: 'root' }, secret, { expiresIn: '2m' });
  try {
    const res = await fetch('http://localhost:3001/api/cotizador/recargar', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    console.log('✓ Caché del Cotizador recargada en el backend local.');
  } catch (e) {
    console.log(`⚠ No se pudo recargar la caché del backend local: ${e instanceof Error ? e.message : e}. Recargala manualmente.`);
  }
}

async function main(): Promise<void> {
  await requestContext.run({ userId: 30, userName: 'ROOT System', ip: null }, async () => {
    const t = await sequelize.transaction();
    try {
      const hoy = new Date().toISOString().slice(0, 10);
      let creadosPP = 0;
      let creadosCotizador = 0;
      let filasDisenoActualizadas = 0;

      for (const item of ITEMS) {
        const catalogo = await CatalogoProducto.findOne({ where: { codigo: item.codigo }, transaction: t });
        if (!catalogo) throw new Error(`${item.codigo} no existe en catalogo_productos — abortando.`);
        const catalogoProductoId = catalogo.getDataValue('id');

        const ppExistente = await ProveedorProducto.findOne({
          where: { proveedor_id: PROVEEDOR_ID, catalogo_producto_id: catalogoProductoId, unidad_compra: 'TIRA_6M' },
          transaction: t,
        });
        if (ppExistente) throw new Error(`${item.codigo} ya tiene fila en proveedor_producto (id ${ppExistente.getDataValue('id')}) — abortando, revisar a mano.`);

        const cotizadorExistente = await CotizadorProducto.findByPk(item.codigo, { transaction: t });
        if (cotizadorExistente) throw new Error(`${item.codigo} ya existe en cotizador.producto — abortando.`);

        const pp = await ProveedorProducto.create(
          {
            proveedor_id: PROVEEDOR_ID,
            catalogo_producto_id: catalogoProductoId,
            unidad_compra: 'TIRA_6M',
            metros_por_unidad: 6,
            precio_actual: item.precioTira,
            fecha_precio_actual: hoy,
            activo: true,
          },
          { transaction: t }
        );
        creadosPP++;

        await ProveedorProductoPrecio.create(
          {
            proveedor_producto_id: pp.getDataValue('id'),
            precio: item.precioTira,
            fecha_vigencia: hoy,
            origen: 'MANUAL',
            registrado_por: 30,
            lineas_en_factura: 1,
            retroactivo: false,
          },
          { transaction: t }
        );

        const costoUnitario = round2(item.precioTira / 6);
        await CotizadorProducto.create(
          {
            codigo: item.codigo,
            descripcion: item.nombre,
            categoria: item.categoria,
            unidad: item.unidad,
            costo_unitario: costoUnitario,
            precio_pa: round2(costoUnitario * item.multPa),
            precio_pm: round2(costoUnitario * item.multPm),
            precio_pb: round2(costoUnitario * item.multPb),
            origen: 'CATALOGO',
            provisional: false,
            catalogo_producto_id: catalogoProductoId,
            fuente: 'Precio inicial manual (Ventanas y Puertas, tira 6m) hasta factura real',
            creado_en: new Date(),
            creado_por: 'sesion-2026-09-16',
          },
          { transaction: t }
        );
        creadosCotizador++;

        const [, filas] = await sequelize.query(
          `UPDATE cotizador.diseno_perfil dp
              SET codigos_por_color = dp.codigos_por_color || jsonb_build_object(:color, :codigo)
             FROM cotizador.diseno d
            WHERE d.id = dp.diseno_id AND d.sistema = :sistema AND dp.ref = :ref
              AND NOT (dp.codigos_por_color ? :color)`,
          { replacements: { color: item.color, codigo: item.codigo, sistema: item.sistema, ref: item.ref }, transaction: t }
        );
        const n = (filas as unknown as { rowCount?: number })?.rowCount ?? 0;
        filasDisenoActualizadas += n;
      }

      console.log(`✓ proveedor_producto: ${creadosPP} fila(s) creada(s) (proveedor 829, TIRA_6M).`);
      console.log(`✓ cotizador.producto: ${creadosCotizador} código(s) creado(s).`);
      console.log(`✓ cotizador.diseno_perfil: ${filasDisenoActualizadas} fila(s) actualizadas con el color nuevo.`);

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

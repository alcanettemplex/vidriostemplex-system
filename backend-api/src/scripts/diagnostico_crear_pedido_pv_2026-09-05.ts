/**
 * Diagnóstico: por qué falla "Crear pedido" en el modal de Nuevo Pedido PV.
 *
 * 1) ¿Quedaron ODPItem huérfanos (id > 1853, los últimos que creé por script)?
 *    Si SÍ  → el POST /api/odp/:id/items pasó y falló el POST /api/pedidos-pv.
 *    Si NO  → falló la PRIMERA petición (validación de ítems).
 * 2) ¿Se creó algún PedidoPV nuevo después del 7085?
 * 3) Reproduce la validación Zod exacta de `odpItemSchema` (odp.controller.ts:42-67)
 *    contra el payload EXACTO que arma el modal, con y sin PUL A / PUL H.
 *
 * Solo lectura + validación en memoria. No escribe nada.
 */
import dotenv from 'dotenv';
dotenv.config({ path: 'backend-api/.env' });

import { ODPItem, PedidoPV, ODP, sequelize } from '../models';
import { Op } from 'sequelize';
import { z } from 'zod';

// ─── Copia VERBATIM del schema de odp.controller.ts (líneas 36-67) ───────────
const aEnteroOPosibleNull = (val: unknown) => {
  if (val === '' || val === null || val === undefined) return null;
  const num = Number(val);
  return isNaN(num) ? val : Math.round(num);
};

const odpItemSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  item: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  espesor: z.coerce.string().nullable().optional(),
  cantidad: z.preprocess(aEnteroOPosibleNull, z.number().int().positive().nullable().optional().default(1)),
  ancho_mm: z.preprocess(aEnteroOPosibleNull, z.number().int().positive().nullable().optional()),
  alto_mm: z.preprocess(aEnteroOPosibleNull, z.number().int().positive().nullable().optional()),
  tipo_vidrio: z.string().nullable().optional(),
  pelicula: z.boolean().nullable().optional(),
  matizado: z.boolean().nullable().optional(),
  carton: z.boolean().nullable().optional(),
  huacal: z.boolean().nullable().optional(),
  accesorios: z.string().nullable().optional(),
  pulidos: z.coerce.string().nullable().optional(),
  pulidos_h: z.coerce.string().nullable().optional(),
  perforaciones: z.preprocess(aEnteroOPosibleNull, z.number().int().nonnegative().nullable().optional().default(0)),
  boquetes: z.preprocess(aEnteroOPosibleNull, z.number().int().nonnegative().nullable().optional().default(0)),
  descuentos: z.string().nullable().optional(),
  otros: z.string().nullable().optional(),
  mts_pt_a: z.string().nullable().optional(),
  mts_pt_h: z.string().nullable().optional(),
  prod: z.string().nullable().optional(),
  verificacion_prod: z.boolean().nullable().optional().default(false),
});

// ─── Payloads EXACTOS que arma el modal (PedidosPVPage.tsx) ──────────────────
// itemVacio() — línea 501, tal cual sale del formulario sin tocar nada:
const itemSinTocar = {
  tipo_vidrio: '', color: 'Incoloro', espesor: '6', ancho_mm: '', alto_mm: '',
  cantidad: 1, pulidos: '', pulidos_h: '', perforaciones: 0, boquetes: 0,
  descuentos: '', otros: '', prod: 'PV',
};

// Lo mismo pero con el usuario escribiendo medidas y PUL A / PUL H.
// Los TextField de PUL A/PUL H son type:'number' y su onChange hace
// `parseInt(e.target.value) || 0` → guardan NÚMERO, no string (línea 1382).
const itemConPulidos = {
  ...itemSinTocar,
  ancho_mm: 1104, alto_mm: 2175,
  pulidos: 2,        // ← número, tal como lo deja el onChange
  pulidos_h: 2,      // ← número
};

// Y el caso de solo medidas, sin tocar PUL A/PUL H:
const itemSoloMedidas = { ...itemSinTocar, ancho_mm: 1104, alto_mm: 2175 };

// Lo que manda el modal YA CORREGIDO (guardaTexto → e.target.value, string):
const itemCorregido = { ...itemSinTocar, ancho_mm: 1104, alto_mm: 2175, pulidos: '2', pulidos_h: '2' };

// Y el campo PUL borrado tras el fix: string vacío, no el número 0:
const itemPulBorrado = { ...itemSinTocar, ancho_mm: 1104, alto_mm: 2175, pulidos: '', pulidos_h: '' };

const probar = (nombre: string, payload: unknown) => {
  const r = odpItemSchema.safeParse(payload);
  if (r.success) {
    console.log(`  ✅ ${nombre}: PASA la validación`);
  } else {
    console.log(`  ❌ ${nombre}: RECHAZADO →`);
    for (const issue of r.error.issues) {
      console.log(`       campo "${issue.path.join('.')}": ${issue.message} (${issue.code})`);
    }
  }
};

(async () => {
  try {
    console.log('\n═══ 1) ¿Ítems huérfanos creados después de mi script (id > 1853)? ═══');
    const huerfanos = await ODPItem.findAll({ where: { id: { [Op.gt]: 1853 } } });
    if (huerfanos.length === 0) {
      console.log('  Ninguno. → La PRIMERA petición (POST /odp/:id/items) nunca llegó a insertar.');
    } else {
      console.log(`  ${huerfanos.length} ítem(s):`);
      for (const h of huerfanos) {
        console.log('   ', JSON.stringify({
          id: h.getDataValue('id'), odp_id: h.getDataValue('odp_id'),
          ancho: h.getDataValue('ancho_mm'), alto: h.getDataValue('alto_mm'),
          pulidos: h.getDataValue('pulidos'), pulidos_h: h.getDataValue('pulidos_h'),
          pedido_pv_id: h.getDataValue('pedido_pv_id'),
        }));
      }
    }

    console.log('\n═══ 2) Últimos Pedidos PV en la BD ═══');
    const ultimos = await PedidoPV.findAll({
      order: [['numero_base', 'DESC']], limit: 5,
      attributes: ['id', 'numero_pedido', 'numero_base', 'odp_id', 'proveedor', 'estado', 'origen'],
    });
    for (const p of ultimos) console.log('  ', JSON.stringify(p.toJSON()));

    console.log('\n═══ 3) Validación Zod del payload real del modal ═══');
    probar('ítem sin tocar (todo por defecto)', itemSinTocar);
    probar('ítem con medidas, SIN pulidos', itemSoloMedidas);
    probar('ítem con PUL A/H = 2 NUMÉRICO (modal viejo, el que fallaba)', itemConPulidos);
    probar('ítem con PUL A/H = "2" STRING (modal corregido)', itemCorregido);
    probar('ítem con PUL A/H borrados tras el fix ("")', itemPulBorrado);

    console.log('\n═══ 4) Estado de las ODPs con las que se probó ═══');
    const odps = await ODP.findAll({
      where: { numero_odp: ['ODP-24000'] },
      attributes: ['id', 'numero_odp', 'estado_produccion'],
    });
    for (const o of odps) console.log('  ', JSON.stringify(o.toJSON()));
  } catch (e) {
    console.error(e);
  } finally {
    await sequelize.close();
  }
})();

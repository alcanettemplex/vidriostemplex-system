import { Request, Response } from 'express';
import { Op, QueryTypes } from 'sequelize';
import {
  ODP,
  ODPItem,
  Cliente,
  Usuario,
  sequelize,
  EvidenciaInstalacion,
  HistorialEstadoODP,
  NotaProduccion,
  NoConformidad,
  SAP,
  SAPItem,
  Cotizacion,
  TomaMedidas,
  OrdenCompra,
  ODCItem,
  RutaODP,
  Prospecto,
  PedidoPV,
  SalidaAlmacen,
} from '../models';
import Pago from '../models/pago.model';
import Produccion from '../models/produccion.model';
import ProgramacionInstalacion from '../models/programacion_instalacion.model';
import { z } from 'zod';
import { withUniqueRetry } from '../utils/withUniqueRetry';

const odpItemSchema = z.object({
  item: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  espesor: z.coerce.string().nullable().optional(),
  cantidad: z.number().int().positive().nullable().optional().default(1),
  ancho_mm: z.number().int().positive().nullable().optional(),
  alto_mm: z.number().int().positive().nullable().optional(),
  tipo_vidrio: z.string().nullable().optional(),
  pelicula: z.boolean().nullable().optional(),
  matizado: z.boolean().nullable().optional(),
  carton: z.boolean().nullable().optional(),
  huacal: z.boolean().nullable().optional(),
  accesorios: z.string().nullable().optional(),
  pulidos: z.string().nullable().optional(),
  pulidos_h: z.string().nullable().optional(),
  perforaciones: z.number().int().nonnegative().nullable().optional().default(0),
  boquetes: z.number().int().nonnegative().nullable().optional().default(0),
  descuentos: z.string().nullable().optional(),
  otros: z.string().nullable().optional(),
  mts_pt_a: z.string().nullable().optional(),
  mts_pt_h: z.string().nullable().optional(),
  prod: z.string().nullable().optional(),
  verificacion_prod: z.boolean().nullable().optional().default(false)
});

const odpSchema = z.object({
  numero_odp: z.string().optional(),
  cliente_id: z.number().int().positive('ID de cliente requerido'),
  asesor_id: z.number().int().positive('ID de asesor requerido').optional(),
  estado_produccion: z.enum(['EN_ESPERA', 'VISITA_TECNICA', 'MEDICION', 'PEDIDO_PROVEEDOR', 'ALUMINIO_CORTADO', 'VIDRIO_RECIBIDO', 'ACCESORIOS_SEPARADOS', 'LISTO_INSTALAR', 'PROGRAMADA', 'INSTALADA', 'ENTREGADA', 'PAUSADA']).optional(),
  estado_facturacion: z.enum(['PENDIENTE', 'FACTURADA']).optional(),
  estado_caja: z.enum(['PENDIENTE', 'ABONADO', 'CANCELADO', 'CREDITO_APROBADO']).optional(),
  factura_electronica: z.string().optional(),
  fecha_factura: z.string().optional(),
  url_documento_factura: z.string().optional(),
  autorizacion_especial_despacho: z.boolean().optional(),
  observacion_autorizacion: z.string().optional(),
  croquis_url: z.string().optional(),
  fecha_entrega: z.string().optional(),
  nombre_recibe: z.string().optional(),
  telefono_recibe: z.string().optional(),
  cargo_recibe: z.string().optional(),
  cantidad_total: z.number().int().positive().default(1).optional(),
  tipo_servicio: z.string().optional(),
  descripcion_pedido: z.string().optional(),
  servicios_detalle: z.any().optional(),
  observaciones: z.string().optional(),
  direccion_instalacion: z.string().optional(),
  matizado: z.boolean().optional(),
  pelicula: z.boolean().optional(),
  acarreo: z.boolean().optional(),
  instalacion: z.boolean().optional(),
  huacal: z.boolean().optional(),
  carton: z.boolean().optional(),
  forma_pago: z.string().optional(),
  valor_total: z.number().nullable().optional(),
  abono: z.number().nullable().optional(),
  pendiente: z.number().nullable().optional(),
  proveedor_vidrio: z.string().optional(),
  numero_pedido_proveedor: z.string().optional(),
  numero_cotizacion: z.string().optional().nullable(),
  chk_medicion: z.boolean().optional(),
  chk_corte: z.boolean().optional(),
  chk_vidrio: z.boolean().optional(),
  chk_accesorios: z.boolean().optional(),
  chk_ensamble: z.boolean().optional(),
  chk_matizado: z.boolean().optional(),
  chk_pelicula: z.boolean().optional(),
  chk_huacal: z.boolean().optional(),
  chk_carton: z.boolean().optional(),
  es_no_conformidad: z.boolean().optional(),
  odp_padre_id: z.number().optional().nullable(),
  tipo_odp: z.enum(['ODP', 'OA']).optional(),
  color_taller: z.string().max(20).nullable().optional(),
  items: z.array(odpItemSchema).optional()
});

export const getODPs = async (req: Request, res: Response) => {
  try {
    const { SAP, TomaMedidas, Op } = await import('../models').then(m => ({ ...m, Op: require('sequelize').Op }));
    const odps = await ODP.findAll({
      where: { es_garantia: false } as any,
      include: [
        { model: Cliente, as: 'cliente', attributes: ['id', 'nombre_razon_social', 'numero_documento', 'telefono', 'celular', 'email', 'direccion'] },
        { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo', 'username'] },
        { model: ODPItem, as: 'items', separate: true, order: [['id', 'ASC']] },
        { model: Pago, as: 'pagos', attributes: ['id', 'monto', 'metodo_pago', 'referencia_pago', 'observaciones', 'fecha'], separate: true, order: [['fecha', 'ASC']] },
        { model: TomaMedidas, as: 'tomas_medidas', attributes: ['id', 'numero_tm', 'croquis_url'], separate: true },
        { model: SAP, as: 'saps', attributes: ['id'], separate: true },
      ],
      order: [['fecha_creacion', 'DESC']]
    });
    res.json(odps);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener ODPs' });
  }
};

export const getNcGarantias = async (req: Request, res: Response) => {
  try {
    const { SAP, TomaMedidas, Op } = await import('../models').then(m => ({ ...m, Op: require('sequelize').Op }));
    const odps = await ODP.findAll({
      where: {
        [Op.or]: [{ es_no_conformidad: true }, { es_garantia: true }],
      } as any,
      include: [
        { model: Cliente, as: 'cliente', attributes: ['id', 'nombre_razon_social', 'numero_documento', 'telefono', 'celular', 'email', 'direccion'] },
        { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo', 'username'] },
        { model: ODPItem, as: 'items', separate: true, order: [['id', 'ASC']] },
        { model: ODP, as: 'odp_padre', attributes: ['id', 'numero_odp', 'fecha_entrega'] },
        { model: Pago, as: 'pagos', attributes: ['id', 'monto', 'metodo_pago', 'referencia_pago', 'observaciones', 'fecha'], separate: true, order: [['fecha', 'ASC']] },
        { model: TomaMedidas, as: 'tomas_medidas', attributes: ['id', 'numero_tm', 'croquis_url'], separate: true },
        { model: SAP, as: 'saps', attributes: ['id'], separate: true },
      ],
      order: [['fecha_creacion', 'DESC']],
    });
    res.json(odps);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener NC y garantías' });
  }
};

export const getGarantias = async (req: Request, res: Response) => {
  try {
    const { SAP, TomaMedidas } = await import('../models');
    const garantias = await ODP.findAll({
      where: { es_garantia: true } as any,
      include: [
        { model: Cliente, as: 'cliente' },
        { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo', 'username'] },
        { model: ODPItem, as: 'items', separate: true, order: [['id', 'ASC']] },
        { model: ODP, as: 'odp_padre', attributes: ['id', 'numero_odp', 'fecha_entrega'] },
        { model: Pago, as: 'pagos', attributes: ['id', 'monto', 'metodo_pago', 'referencia_pago', 'observaciones', 'fecha'], separate: true, order: [['fecha', 'ASC']] },
        { model: TomaMedidas, as: 'tomas_medidas', attributes: ['id', 'numero_tm', 'croquis_url'], separate: true },
        { model: SAP, as: 'saps', attributes: ['id'], separate: true },
      ],
      order: [['fecha_creacion', 'DESC']]
    });
    res.json(garantias);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener garantías' });
  }
};

export const getODP = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Importar modelos dinámicamente para evitar circular imports
    const { SAP, SAPItem, Cotizacion, TomaMedidas, EvidenciaInstalacion, RutaODP, RutaInstalacion, HistorialEstadoODP, NoConformidad, OrdenCompra, PedidoPV } = await import('../models');
    const { Op } = require('sequelize');

    const odp = await ODP.findByPk(id, {
      include: [
        { model: Cliente, as: 'cliente' },
        { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo', 'username', 'email'] },
        { model: ODPItem, as: 'items', separate: true, order: [['id', 'ASC']] },
        {
          model: ODP, as: 'odp_padre',
          attributes: ['id', 'numero_odp', 'fecha_entrega'],
          include: [{
            model: RutaODP, as: 'ruta_odps',
            attributes: ['id', 'estado'],
            include: [{
              model: RutaInstalacion, as: 'ruta',
              attributes: ['id'],
              include: [
                { model: Usuario, as: 'instaladores', attributes: ['id', 'nombre_completo'], through: { attributes: [] } },
                { model: Usuario, as: 'oficial', attributes: ['id', 'nombre_completo'] },
              ],
            }],
          }],
        },
        {
          model: NoConformidad, as: 'no_conformidades',
          include: [
            { model: Usuario, as: 'usuario_reporta', attributes: ['id', 'nombre_completo'] },
            { model: ODP, as: 'nueva_odp', attributes: ['id', 'numero_odp', 'estado_produccion'] }
          ]
        },
        {
          model: SAP, as: 'saps',
          include: [
            { model: SAPItem, as: 'items' },
            { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] },
          ],
          order: [['fecha_creacion', 'DESC']],
        },
        {
          model: Cotizacion, as: 'cotizaciones',
          include: [{ model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] }],
        },
        {
          model: TomaMedidas, as: 'tomas_medidas',
          include: [{ model: Usuario, as: 'realizador', attributes: ['id', 'nombre_completo'] }],
        },
        {
          model: EvidenciaInstalacion, as: 'evidencias',
          include: [{ model: Usuario, as: 'instalador', attributes: ['id', 'nombre_completo'] }],
        },
        {
          model: RutaODP, as: 'ruta_odps',
          attributes: ['id', 'estado', 'inicio_instalacion', 'fin_instalacion', 'firma_receptor', 'datos_receptor', 'foto_evidencia_url', 'gps_finalizacion', 'descripcion_dano', 'foto_dano_url', 'motivo_pausa'],
          include: [
            {
              model: RutaInstalacion, as: 'ruta',
              attributes: ['id', 'estado', 'creado_en'],
              include: [
                { model: (await import('../models')).Vehiculo, as: 'vehiculo', attributes: ['placa', 'tipo'] },
                { model: Usuario, as: 'instaladores', attributes: ['id', 'nombre_completo'], through: { attributes: [] } },
                { model: Usuario, as: 'oficial', attributes: ['id', 'nombre_completo'] },
              ],
            },
          ],
        },
        {
          model: HistorialEstadoODP, as: 'historial_estados',
          include: [{ model: Usuario, as: 'usuario', attributes: ['id', 'nombre_completo'] }],
          order: [['fecha', 'DESC']],
          separate: true,
        },
        {
          model: (await import('../models')).NotaProduccion,
          as: 'notas_produccion',
          include: [{ model: (await import('../models')).Usuario, as: 'usuario', attributes: ['nombre_completo'] }]
        },
        { model: Pago, as: 'pagos', attributes: ['id', 'monto', 'metodo_pago', 'referencia_pago', 'fecha'], separate: true, order: [['fecha', 'ASC']] },
        {
          model: PedidoPV, as: 'pedidos_pv',
          attributes: ['id', 'numero_pedido', 'proveedor', 'estado', 'fecha_envio', 'fecha_entrega_prometida', 'fecha_llegada_real', 'dias_diferencia', 'observaciones', 'tuvo_problema'],
          separate: true, order: [['id', 'ASC']]
        },
        {
          model: ODP, as: 'garantias',
          attributes: ['id', 'numero_odp', 'numero_garantia', 'estado_produccion', 'fecha_creacion', 'descripcion_pedido', 'nombre_recibe', 'telefono_recibe', 'direccion_instalacion', 'tipo_servicio', 'observaciones'],
          include: [
            { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] },
            { model: Cliente, as: 'cliente' },
            {
              model: RutaODP, as: 'ruta_odps',
              attributes: ['id', 'estado'],
              include: [{
                model: RutaInstalacion, as: 'ruta',
                attributes: ['id'],
                include: [
                  { model: Usuario, as: 'instaladores', attributes: ['id', 'nombre_completo'], through: { attributes: [] } },
                  { model: Usuario, as: 'oficial', attributes: ['id', 'nombre_completo'] },
                ],
              }],
            },
          ],
          separate: true,
          order: [['fecha_creacion', 'ASC']],
        },
      ],
    });

    if (!odp) return res.status(404).json({ error: 'ODP no encontrada' });

    // Enriquecer ordenes_compra de cada SAP a través de sus SAPItems (soporta ODC multi-SAP)
    const { ODCItem, Prospecto: ProspectoModel } = await import('../models');
    const odpJson: any = odp.toJSON();

    // Cargar TMs del prospecto vinculado que aún no tienen odp_id (datos previos a la corrección)
    const prospecto = await ProspectoModel.findOne({ where: { odp_id: Number(id) }, attributes: ['id'] });
    if (prospecto) {
      const tmsFaltantes = await TomaMedidas.findAll({
        where: { prospecto_id: prospecto.getDataValue('id'), odp_id: null } as any,
        include: [{ model: Usuario, as: 'realizador', attributes: ['id', 'nombre_completo'] }],
      });
      if (tmsFaltantes.length > 0) {
        odpJson.tomas_medidas = [...(odpJson.tomas_medidas || []), ...tmsFaltantes.map((t: any) => t.toJSON())];
      }
    }

    if (odpJson.saps && odpJson.saps.length > 0) {
      const { Op } = await import('sequelize');
      const allSapItemIds: number[] = [];
      
      for (const sap of odpJson.saps) {
        if (sap.items) sap.items.forEach((item: any) => allSapItemIds.push(item.id));
        sap.ordenes_compra = []; // Inicializamos vacío siempre
      }

      if (allSapItemIds.length > 0) {
        // Encontrar los ODCItems que apuntan a nuestro cristal/accesorios
        const odcItemsRelacionados = await ODCItem.findAll({ 
          where: { sap_item_id: { [Op.in]: allSapItemIds } }, 
          raw: true 
        });

        if (odcItemsRelacionados.length > 0) {
          const odcIds = [...new Set(odcItemsRelacionados.map((i: any) => i.odc_id))];

          // Traer info base de las ODCs
          const ordenes = await OrdenCompra.findAll({
            where: { id: { [Op.in]: odcIds } },
            attributes: ['id', 'numero_odc', 'proveedor', 'tipo', 'estado', 'fecha_creacion', 'fecha_recepcion'],
            raw: true
          });
          const ordenesMap = new Map(ordenes.map((o: any) => [o.id, o]));

          // Traer TODOS los ítems de estas ODCs (para mostrar todo lo pedido en esa ODC)
          const allOdcItemsData = await ODCItem.findAll({
            where: { odc_id: { [Op.in]: odcIds } },
            raw: true
          });
          const itemsByOdc = new Map<number, any[]>();
          for (const item of allOdcItemsData) {
            const key = (item as any).odc_id;
            if (!itemsByOdc.has(key)) itemsByOdc.set(key, []);
            itemsByOdc.get(key)!.push(item);
          }

          // Asignar ODCs a los SAPs
          for (const sap of odpJson.saps) {
            if (!sap.items) continue;
            const sapItemIdsContext = new Set(sap.items.map((i: any) => i.id));
            
            // Verificamos qué ODCs tocan a este SAP
            const odcItemsDelSap = odcItemsRelacionados.filter((i: any) => sapItemIdsContext.has(i.sap_item_id));
            const odcIdsDelSap = [...new Set(odcItemsDelSap.map((i: any) => i.odc_id))];

            sap.ordenes_compra = odcIdsDelSap.map((id) => ({
              ...ordenesMap.get(id),
              items: itemsByOdc.get(id) || []
            }));
          }
        }
      }
    }

    res.json(odpJson);
  } catch (error: any) {
    console.error('Error getODP:', error.message);
    res.status(500).json({ error: 'Error al obtener ODP' });
  }
};


export const createODP = async (req: Request, res: Response) => {
  try {
    const data = odpSchema.parse(req.body);
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    const { newOdp, odpId } = await withUniqueRetry(async () => {
      const t = await sequelize.transaction();
      try {
        // Generar número consecutivo según tipo (ODP-XXXX / OA-XXXX)
        const prefijo = data.tipo_odp === 'OA' ? 'OA' : 'ODP';
        const lastODP = await ODP.findOne({
          where: { numero_odp: { [require('sequelize').Op.like]: `${prefijo}-%` } },
          order: [[sequelize.literal("CAST(SPLIT_PART(numero_odp, '-', 2) AS INTEGER)"), 'DESC']],
          attributes: ['numero_odp'],
          transaction: t,
        });
        let nextODPNum = 1;
        if (lastODP) {
          const parts = lastODP.getDataValue('numero_odp').split('-');
          nextODPNum = parseInt(parts[parts.length - 1]) + 1;
        }
        const generatedNumeroODP = `${prefijo}-${String(nextODPNum).padStart(4, '0')}`;

        // Derivar estado inicial si no viene explícito desde el frontend
        const estadoInicial = data.estado_produccion
          ?? ((data.items && data.items.length > 0) ? 'MEDICION' : 'EN_ESPERA');

        const odpData = {
          numero_odp: data.numero_odp || generatedNumeroODP,
          cliente_id: data.cliente_id,
          asesor_id: data.asesor_id || userId,
          estado_produccion: estadoInicial,
          estado_facturacion: data.estado_facturacion,
          estado_caja: data.forma_pago === 'credito' ? 'CREDITO_APROBADO' : (data.estado_caja || 'PENDIENTE'),
          factura_electronica: data.factura_electronica,
          url_documento_factura: data.url_documento_factura,
          autorizacion_especial_despacho: data.autorizacion_especial_despacho,
          observacion_autorizacion: data.observacion_autorizacion,
          croquis_url: data.croquis_url,
          fecha_entrega: data.fecha_entrega,
          nombre_recibe: data.nombre_recibe,
          telefono_recibe: data.telefono_recibe,
          cantidad_total: data.cantidad_total || 1,
          tipo_servicio: data.tipo_servicio,
          descripcion_pedido: data.descripcion_pedido,
          servicios_detalle: data.servicios_detalle,
          observaciones: data.observaciones,
          direccion_instalacion: data.direccion_instalacion,
          matizado: data.matizado,
          pelicula: data.pelicula,
          acarreo: data.acarreo,
          instalacion: data.instalacion,
          huacal: data.huacal,
          carton: data.carton,
          forma_pago: data.forma_pago,
          valor_total: data.valor_total || 0,
          abono: data.abono || 0,
          pendiente: data.valor_total ? Math.max(0, (data.valor_total || 0) - (data.abono || 0)) : (data.pendiente || 0),
          proveedor_vidrio: data.proveedor_vidrio || null,
          tipo_odp: data.tipo_odp || 'ODP',
        };

        const createdOdp = await ODP.create(odpData as any, { transaction: t });
        const createdId = createdOdp.getDataValue('id');

        if (data.items && data.items.length > 0) {
          const itemsData = data.items.map(item => ({ ...item, odp_id: createdId }));
          await ODPItem.bulkCreate(itemsData as any, { transaction: t });
        }

        await t.commit();
        return { newOdp: createdOdp, odpId: createdId };
      } catch (err) {
        await t.rollback();
        throw err;
      }
    });

    // ── Crear PedidoPV automático si se seleccionó proveedor ──────────────
    if (data.proveedor_vidrio) {
      try {
        await withUniqueRetry(async () => {
          const ultimoPV = await PedidoPV.findOne({
            order: [['numero_base', 'DESC']],
            attributes: ['numero_base'],
          });
          const numero_base = ultimoPV ? (ultimoPV.getDataValue('numero_base') as number) + 1 : 6733;
          const numero_pedido = String(numero_base);

          await PedidoPV.create({
            odp_id: odpId,
            proveedor: data.proveedor_vidrio,
            numero_pedido,
            numero_base,
            sufijo: null,
            estado: 'PENDIENTE',
            origen: 'SISTEMA',
            creado_por: userId,
          });

          // Guardar el número generado en la ODP
          await ODP.update(
            { numero_pedido_proveedor: numero_pedido },
            { where: { id: odpId } }
          );

          console.warn(`PedidoPV ${numero_pedido} creado automáticamente para ODP ${odpId}`);
        });
      } catch (pvError: any) {
        console.error('Error creando PedidoPV automático:', pvError.message);
        // No fallar la creación de la ODP por esto
      }
    }

    import('../utils/notificaciones').then(({ emitirODPPatch }) => emitirODPPatch(odpId, 'create')).catch(() => {});
    res.status(201).json(newOdp);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      console.error('Validation Error Details:', JSON.stringify((error as any).errors, null, 2));
      return res.status(400).json({ error: 'Datos de ODP inválidos', detalles: (error as any).errors });
    }
    res.status(500).json({ error: error.message || 'Error al crear ODP' });
  }
};

export const updateODP = async (req: Request, res: Response) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const data = odpSchema.partial().parse(req.body);

    const odp = await ODP.findByPk(id, { transaction });
    if (!odp) {
      await transaction.rollback();
      return res.status(404).json({ error: 'ODP no encontrada' });
    }

    // Capturar valor ANTES del update — odp.update() muta el modelo en memoria
    const proveedorAnterior = odp.getDataValue('proveedor_vidrio');

    // ─── Verificación de ownership ───────────────────────────────────────────
    // Identificar qué campos se están intentando actualizar realmente (evitando defaults de Zod)
    const camposRecibidos = Object.keys(req.body);
    const camposPermitidosTaller = [
      'chk_medicion', 'chk_corte', 'chk_vidrio', 'chk_accesorios',
      'chk_ensamble', 'chk_matizado', 'chk_pelicula', 'chk_huacal', 'chk_carton',
      'color_taller'
    ];
    
    // Solo consideramos campos técnicos que están en el esquema
    const camposUpdate = camposRecibidos.filter(key => key in data);
    const soloEditaChecks = camposUpdate.length > 0 && camposUpdate.every(c => camposPermitidosTaller.includes(c));
    
    const rolUsuario = req.user?.rol;
    const esAdminOGerencia = rolUsuario === 'admin' || rolUsuario === 'gerencia';
    const esTaller = ['produccion', 'jefe_produccion'].includes(rolUsuario) && soloEditaChecks;
    const esCreador = Number(odp.getDataValue('asesor_id')) === Number(req.user?.id);
    // produccion / jefe_produccion pueden marcar ENTREGADA (pedido en la mano)
    const esMarcarEntregada = ['produccion', 'jefe_produccion'].includes(rolUsuario) &&
      camposUpdate.length === 1 && camposUpdate[0] === 'estado_produccion' && data.estado_produccion === 'ENTREGADA';

    // produccion / jefe_produccion pueden marcar LISTO_INSTALAR desde el tab Control Taller
    const esMarcarListoInstalar = ['produccion', 'jefe_produccion'].includes(rolUsuario) &&
      camposUpdate.length === 1 && camposUpdate[0] === 'estado_produccion' && data.estado_produccion === 'LISTO_INSTALAR';

    if (!esAdminOGerencia) {
      if (!esTaller && !esCreador && !esMarcarEntregada && !esMarcarListoInstalar) {
        await transaction.rollback();
        return res.status(403).json({ error: 'Solo el creador de la ODP puede editarla' });
      }
    }

    console.log(`Update ODP ${id} - Rol: ${rolUsuario}, Taller: ${esTaller}, Creador: ${esCreador}`);

    // ─── Lógica de dependencias de producción ───
    if (data.chk_pelicula || data.chk_matizado || data.chk_huacal || data.chk_carton) {
      if (!odp.getDataValue('chk_vidrio') && !data.chk_vidrio) {
         await transaction.rollback();
         return res.status(400).json({ error: 'No se puede procesar (película/matizado/huacal/cartón) sin haber recibido el vidrio primero.' });
      }
    }

    // Recalcular pendiente y estado_caja si viene valor_total o abono
    if (data.valor_total !== undefined || data.abono !== undefined) {
      const nuevoValorTotal = data.valor_total !== undefined ? (data.valor_total || 0) : (Number(odp.getDataValue('valor_total')) || 0);
      const nuevoAbono = data.abono !== undefined ? (data.abono || 0) : (Number(odp.getDataValue('abono')) || 0);
      const nuevoPendiente = Math.max(0, nuevoValorTotal - nuevoAbono);
      (data as any).pendiente = nuevoPendiente;
      const formaPago = data.forma_pago || odp.getDataValue('forma_pago');
      // Auto-calcular estado_caja según pagos (no permitir override manual)
      if (nuevoPendiente <= 0 && nuevoAbono > 0) {
        (data as any).estado_caja = 'CANCELADO';
      } else if (formaPago === 'credito' && nuevoAbono <= 0) {
        (data as any).estado_caja = 'CREDITO_APROBADO';
      } else if (nuevoAbono > 0) {
        (data as any).estado_caja = 'ABONADO';
      } else {
        (data as any).estado_caja = 'PENDIENTE';
      }
    } else {
      // Si no viene valor_total ni abono, no permitir cambio manual de estado_caja
      delete (data as any).estado_caja;
    }

    // Calcular fecha_vencimiento_credito al registrar factura electrónica en ODP de crédito
    if (data.fecha_factura) {
      const formaPago = data.forma_pago || odp.getDataValue('forma_pago');
      if (formaPago === 'credito') {
        const fechaFe = new Date(data.fecha_factura);
        fechaFe.setDate(fechaFe.getDate() + 30);
        (data as any).fecha_vencimiento_credito = fechaFe.toISOString().split('T')[0];
      }
    }

    // Registrar fecha cuando se activa chk_accesorios por primera vez
    if (data.chk_accesorios === true && !odp.getDataValue('fecha_chk_accesorios')) {
      (data as any).fecha_chk_accesorios = new Date().toISOString().split('T')[0];
    }

    // Registrar fecha cada vez que se llega a LISTO_INSTALAR (manual o re-liberación)
    if (data.estado_produccion === 'LISTO_INSTALAR') {
      (data as any).fecha_listo_instalar = new Date();
    }

    // No permitir que el form sobreescriba numero_pedido_proveedor con cadena vacía
    // si ya existe un valor (asignado por auto-create de PedidoPV).
    if (!data.numero_pedido_proveedor) {
      delete (data as any).numero_pedido_proveedor;
    }

    // Campos DATE: cadena vacía '' causa error en PostgreSQL. Convertir a null.
    if ((data as any).fecha_entrega === '') delete (data as any).fecha_entrega;
    if ((data as any).fecha_factura === '') delete (data as any).fecha_factura;

    // Actualizar campos de la ODP (incluyendo los booleanos, JSONs, y observaciones nuevas)
    await odp.update(data as any, { transaction });

    // Actualizar cristales si vienen en la data
    // IMPORTANTE: este bloque debe correr ANTES de la auto-transición a LISTO_INSTALAR
    // para que ODPItem.count() refleje el conteo final real y no un estado intermedio
    // (destroy sin bulkCreate) que daría itemCount=0 e induciría un disparo incorrecto.
    if (data.items && Array.isArray(data.items)) {
      await ODPItem.destroy({ where: { odp_id: id }, transaction });

      if (data.items.length > 0) {
        const nuevosItems = data.items.map(item => ({
          ...item,
          odp_id: id
        }));
        await ODPItem.bulkCreate(nuevosItems, { transaction });

        // Si la ODP estaba en EN_ESPERA y ahora tiene ítems de vidrio, avanzar a MEDICION
        const estadoActualOdp = odp.getDataValue('estado_produccion');
        if (estadoActualOdp === 'EN_ESPERA' && !data.estado_produccion) {
          await odp.update({ estado_produccion: 'MEDICION' }, { transaction });
          await HistorialEstadoODP.create({
            odp_id: id,
            estado_anterior: 'EN_ESPERA',
            estado_nuevo: 'MEDICION',
            usuario_id: req.user?.id,
            fecha: new Date(),
          }, { transaction });
        }
      }
    }

    // ─── Lógica de autocompletado LISTO_INSTALAR ───
    // Corre DESPUÉS del bloque de ítems para que ODPItem.count() devuelva el total
    // definitivo (post destroy+bulkCreate) y no un valor transitorio incorrecto.
    // Solo corre si la ODP está en un estado productivo activo: impide saltos desde
    // EN_ESPERA o VISITA_TECNICA donde la producción aún no ha empezado.
    const ESTADOS_PRODUCTIVOS = ['MEDICION', 'PEDIDO_PROVEEDOR', 'ALUMINIO_CORTADO', 'VIDRIO_RECIBIDO', 'ACCESORIOS_SEPARADOS'];
    const updatedOdp = await ODP.findByPk(id, { transaction });
    if (updatedOdp && !data.estado_produccion && ESTADOS_PRODUCTIVOS.includes(updatedOdp.getDataValue('estado_produccion')) && !updatedOdp.getDataValue('sin_items')) {
      const { SAP: SAPModel, TomaMedidas: TMModel, PedidoPV: PedidoPVModel } = await import('../models');
      const [tmCount, sapCount, itemCount, pvPendienteCount] = await Promise.all([
        TMModel.count({ where: { odp_id: id }, transaction }),
        SAPModel.count({ where: { odp_id: id }, transaction }),
        ODPItem.count({ where: { odp_id: id }, transaction }),
        PedidoPVModel.count({ where: { odp_id: id, estado: ['PENDIENTE', 'ENVIADO', 'CONFIRMADO_PROVEEDOR'] }, transaction }),
      ]);

      const needsMedicion = tmCount > 0;
      const needsCorte = !!updatedOdp.getDataValue('tiene_aluminio');
      // needsVidrio se activa si hay items registrados O si hay proveedor_vidrio declarado
      // (el PV puede existir aunque los items aún no estén en odp_items)
      const needsVidrio = itemCount > 0 || !!updatedOdp.getDataValue('proveedor_vidrio');
      const needsAccesorios = sapCount > 0;

      // Si el PedidoPV del vidrio aún no ha llegado, no puede transicionar a LISTO_INSTALAR
      if (pvPendienteCount > 0) {
        await transaction.commit();
        return res.status(200).json(await ODP.findByPk(id));
      }
      const needsEnsamble = !!updatedOdp.getDataValue('tiene_aluminio');
      const needsMatizado = updatedOdp.getDataValue('matizado');
      const needsPelicula = updatedOdp.getDataValue('pelicula');
      const needsHuacal = updatedOdp.getDataValue('huacal');
      const needsCarton = updatedOdp.getDataValue('carton');

      const isMedicionDone = !needsMedicion || updatedOdp.getDataValue('chk_medicion');
      const isCorteDone = !needsCorte || updatedOdp.getDataValue('chk_corte');
      const isVidrioDone = !needsVidrio || updatedOdp.getDataValue('chk_vidrio');
      const isAccesoriosDone = !needsAccesorios || updatedOdp.getDataValue('chk_accesorios');
      const isEnsambleDone = !needsEnsamble || updatedOdp.getDataValue('chk_ensamble');
      const isMatizadoDone = !needsMatizado || updatedOdp.getDataValue('chk_matizado');
      const isPeliculaDone = !needsPelicula || updatedOdp.getDataValue('chk_pelicula');
      const isHuacalDone = !needsHuacal || updatedOdp.getDataValue('chk_huacal');
      const isCartonDone = !needsCarton || updatedOdp.getDataValue('chk_carton');

      // Requiere al menos un trabajo registrado — evita que ODPs vacías (sin items, sin SAP,
      // sin TM, sin aluminio) salten a LISTO_INSTALAR solo por editar un campo como el abono.
      const tieneAlgunRequisito = needsMedicion || needsCorte || needsVidrio || needsAccesorios || needsEnsamble || needsMatizado || needsPelicula || needsHuacal || needsCarton;

      if (tieneAlgunRequisito && isMedicionDone && isCorteDone && isVidrioDone && isAccesoriosDone && isEnsambleDone && isMatizadoDone && isPeliculaDone && isHuacalDone && isCartonDone) {
        const updateData: Record<string, unknown> = { estado_produccion: 'LISTO_INSTALAR', fecha_listo_instalar: new Date() };
        await updatedOdp.update(updateData, { transaction });
        console.log(`✅ ODP ${updatedOdp.getDataValue('numero_odp')} marcada automáticamente como LISTO_INSTALAR.`);
      }
    }

    await transaction.commit();

    // ─── Auto-crear PedidoPV si proveedor_vidrio se asigna por primera vez en edición ───
    // Usar proveedorAnterior (capturado antes del update) porque odp.update() muta el modelo en memoria
    if (data.proveedor_vidrio && !proveedorAnterior) {
      try {
        const existente = await PedidoPV.findOne({ where: { odp_id: odp.getDataValue('id') } });
        if (!existente) {
          await withUniqueRetry(async () => {
            const ultimoPV = await PedidoPV.findOne({ order: [['numero_base', 'DESC']], attributes: ['numero_base'] });
            const numero_base = ultimoPV ? (ultimoPV.getDataValue('numero_base') as number) + 1 : 6733;
            const numero_pedido = String(numero_base);
            await PedidoPV.create({
              odp_id: odp.getDataValue('id'),
              proveedor: data.proveedor_vidrio,
              numero_pedido,
              numero_base,
              sufijo: null,
              estado: 'PENDIENTE',
              origen: 'SISTEMA',
              creado_por: (req.user as any)?.id || null,
            });
            await ODP.update({ numero_pedido_proveedor: numero_pedido }, { where: { id: odp.getDataValue('id') } });
          });
        }
      } catch (pvError: any) {
        console.error('Error creando PedidoPV automático en update:', pvError.message);
      }
    }

    // ─── Regla automática: PedidoPV VERIFICADO → ENTREGADO cuando ODP es INSTALADA/ENTREGADA ───
    if (data.estado_produccion === 'INSTALADA' || data.estado_produccion === 'ENTREGADA') {
      try {
        await PedidoPV.update(
          { estado: 'ENTREGADO' },
          { where: { odp_id: odp.getDataValue('id'), estado: 'VERIFICADO' } }
        );
      } catch (pvErr) {
        console.error('⚠️ Error al marcar PedidoPV como ENTREGADO:', pvErr);
      }
    }

    // ─── Regla automática: ODP padre → INSTALADA cuando el reproceso se completa ───
    if (data.estado_produccion === 'INSTALADA' && odp.getDataValue('es_no_conformidad') && odp.getDataValue('odp_padre_id')) {
      try {
        const { HistorialEstadoODP } = await import('../models');
        const odpPadre = await ODP.findByPk(odp.getDataValue('odp_padre_id'));
        if (odpPadre && odpPadre.getDataValue('estado_produccion') === 'PAUSADA') {
          await odpPadre.update({ estado_produccion: 'INSTALADA' });
          await HistorialEstadoODP.create({
            odp_id: odpPadre.getDataValue('id'),
            estado_anterior: 'PAUSADA',
            estado_nuevo: 'INSTALADA',
            usuario_id: req.user?.id || null,
            fecha: new Date(),
            observacion: `Completada automáticamente: la ODP de reproceso ${odp.getDataValue('numero_odp')} resolvió la no conformidad.`
          });
          console.log(`✅ ODP padre ${odpPadre.getDataValue('numero_odp')} → INSTALADA (reproceso completado)`);
        }
      } catch (autoErr) {
        console.error('⚠️ Error al completar ODP padre:', autoErr);
      }
    }

    // Notificación dirigida al cambiar estado de producción
    if (data.estado_produccion) {
      const numeroOdp = odp.getDataValue('numero_odp');
      const odpId = odp.getDataValue('id');
      const asesorId = odp.getDataValue('asesor_id');

      let mensaje: string | undefined;
      if (data.estado_produccion === 'VIDRIO_RECIBIDO') {
        const ped = odp.getDataValue('numero_pedido_proveedor');
        const prov = odp.getDataValue('proveedor_vidrio');
        mensaje = `Vidrio recibido en taller${prov ? ` — ${prov}` : ''}${ped ? ` (Ped. ${ped})` : ''}`;
      } else if (data.estado_produccion === 'INSTALADA' && odp.getDataValue('es_no_conformidad')) {
        mensaje = `ODP de reproceso instalada. La ODP original fue reactivada automáticamente.`;
      } else if (data.estado_produccion === 'LISTO_INSTALAR') {
        mensaje = `Orden lista para instalación`;
      }

      import('../utils/notificaciones').then(({ notificarCambioEstadoODP }) => {
        notificarCambioEstadoODP({
          numero_odp: numeroOdp,
          odp_id: odpId,
          asesor_id: asesorId,
          estado_nuevo: data.estado_produccion!,
          mensaje,
        });
      }).catch(err => console.error('Error notificación ODP:', err));
    }

    import('../utils/notificaciones').then(({ emitirODPPatch }) => emitirODPPatch(Number(id), 'update')).catch(() => {});
    res.json({ message: 'ODP actualizada con éxito', odp });
  } catch (error: any) {
    try {
      await transaction.rollback();
    } catch (rbError) {
      // Ignorar error si ya se hizo commit/rollback
    }
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Datos inválidos', detalles: (error as any).errors });
    }
    console.error('Error al actualizar ODP:', error);
    res.status(500).json({ error: 'Error al actualizar ODP' });
  }
};

export const deleteODP = async (req: Request, res: Response) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const odpId = Number(id);

    const odp = await ODP.findByPk(odpId, { transaction: t });
    if (!odp) {
      await t.rollback();
      return res.status(404).json({ error: 'ODP no encontrada' });
    }

    // ─── Verificación de ownership (solo creador, admin o gerencia) ───
    if (!['admin', 'gerencia'].includes(req.user?.rol ?? '')) {
      if (Number(odp.getDataValue('asesor_id')) !== Number(req.user?.id)) {
        await t.rollback();
        return res.status(403).json({ error: 'Solo el creador de la ODP puede eliminarla' });
      }
    }

    // No se puede eliminar una ODP ya facturada
    if (odp.getDataValue('estado_facturacion') === 'FACTURADA') {
      await t.rollback();
      return res.status(409).json({ error: 'No se puede eliminar una ODP que ya fue facturada' });
    }

    // Desvincula ODPs derivadas (auto-referencia) para no eliminarlas en cascada
    await ODP.update({ odp_padre_id: null } as any, { where: { odp_padre_id: odpId }, transaction: t });

    // Desvincula el prospecto (odp_id nullable)
    await Prospecto.update({ odp_id: null } as any, { where: { odp_id: odpId }, transaction: t });

    // Elimina ODCItems de las órdenes de compra relacionadas
    const ordenes = await OrdenCompra.findAll({ where: { odp_id: odpId }, attributes: ['id'], transaction: t });
    const ordenIds = ordenes.map((o: any) => o.id);
    if (ordenIds.length > 0) {
      await ODCItem.destroy({ where: { orden_compra_id: ordenIds }, transaction: t });
    }
    await OrdenCompra.destroy({ where: { odp_id: odpId }, transaction: t });

    // Elimina SAPItems de los SAPs relacionados
    const saps = await SAP.findAll({ where: { odp_id: odpId }, attributes: ['id'], transaction: t });
    const sapIds = saps.map((s: any) => s.id);
    if (sapIds.length > 0) {
      await SAPItem.destroy({ where: { sap_id: sapIds }, transaction: t });
    }
    await SAP.destroy({ where: { odp_id: odpId }, transaction: t });

    // Elimina registros hijos directos
    await ODPItem.destroy({ where: { odp_id: odpId }, transaction: t });
    await EvidenciaInstalacion.destroy({ where: { odp_id: odpId }, transaction: t });
    await HistorialEstadoODP.destroy({ where: { odp_id: odpId }, transaction: t });
    await NotaProduccion.destroy({ where: { odp_id: odpId }, transaction: t });
    // Desvincula NCs donde esta ODP era la ODP hija generada (nueva_odp_id)
    await NoConformidad.update({ nueva_odp_id: null } as any, { where: { nueva_odp_id: odpId }, transaction: t });
    await NoConformidad.destroy({ where: { odp_id: odpId }, transaction: t });
    await Cotizacion.destroy({ where: { odp_id: odpId }, transaction: t });
    await TomaMedidas.destroy({ where: { odp_id: odpId }, transaction: t });
    await Pago.destroy({ where: { odp_id: odpId }, transaction: t });
    await RutaODP.destroy({ where: { odp_id: odpId }, transaction: t });
    await PedidoPV.destroy({ where: { odp_id: odpId }, transaction: t });
    await SalidaAlmacen.destroy({ where: { odp_id: odpId }, transaction: t });
    await ProgramacionInstalacion.destroy({ where: { odp_id: odpId }, transaction: t });
    await Produccion.destroy({ where: { odp_id: odpId }, transaction: t });

    await odp.destroy({ transaction: t });
    await t.commit();

    import('../utils/notificaciones').then(({ emitirODPPatch }) => emitirODPPatch(odpId, 'delete')).catch(() => {});
    res.json({ status: 'ODP y sus registros relacionados eliminados correctamente' });
  } catch (error) {
    try { await t.rollback(); } catch (_) { /* ya commiteado */ }
    console.error('Error al eliminar ODP:', error);
    res.status(500).json({ error: 'Error al eliminar ODP' });
  }
};

export const finalizarInstalacionODP = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const odp = await ODP.findByPk(id);
    if (!odp) return res.status(404).json({ error: 'ODP no encontrada' });

    // Assuming Cloudinary handles the storage and `req.file` holds the `path` or `url`
    const fotoUrl = req.file ? req.file.path : null;

    if (!fotoUrl) {
      return res.status(400).json({ error: 'Se requiere una fotografía de evidencia para finalizar.' });
    }

    await odp.update({
      estado_produccion: 'INSTALADA',
      foto_instalacion_url: fotoUrl
    });

    import('../utils/notificaciones').then(({ notificarCambioEstadoODP }) => {
      notificarCambioEstadoODP({
        numero_odp: odp.getDataValue('numero_odp'),
        odp_id: odp.getDataValue('id'),
        asesor_id: odp.getDataValue('asesor_id'),
        estado_nuevo: 'INSTALADA',
        mensaje: `Instalación completada con evidencia fotográfica`,
      });
    }).catch(err => console.error('Error notificación instalación:', err));

    res.json({ message: 'Instalación registrada con éxito', foto_url: fotoUrl, odp });
  } catch (error: any) {
    console.error('Error al finalizar instalación ODP:', error);
    res.status(500).json({ error: 'Error al finalizar instalación de la ODP', details: error?.message || error });
  }
};

export const revisarDano = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const usuario = req.user!;

    const odp = await ODP.findByPk(id);
    if (!odp) return res.status(404).json({ error: 'ODP no encontrada' });

    const asesorId = odp.getDataValue('asesor_id');
    const rol = usuario.rol;
    const esAsesorDueno = rol === 'asesor_comercial' && usuario.id === asesorId;
    const esAutorizado = ['admin', 'gerencia'].includes(rol) || esAsesorDueno;

    if (!esAutorizado) {
      return res.status(403).json({ error: 'Solo el asesor creador, admin o gerencia pueden marcar el daño como revisado' });
    }

    await odp.update({ tiene_dano_instalacion: false } as any);

    res.json({ ok: true, mensaje: 'Daño marcado como revisado. La ODP salió del tab Con Daños.' });
  } catch (error: any) {
    console.error('Error al revisar daño ODP:', error);
    res.status(500).json({ error: 'Error al revisar el daño', details: error?.message });
  }
};

export const crearGarantia = async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Usuario no autenticado' });

  const t = await sequelize.transaction();
  try {
    const { Op } = require('sequelize');

    const odpPadre = await ODP.findByPk(id, { transaction: t });
    if (!odpPadre) { await t.rollback(); return res.status(404).json({ error: 'ODP padre no encontrada' }); }

    if (odpPadre.getDataValue('es_garantia') || odpPadre.getDataValue('es_no_conformidad')) {
      await t.rollback();
      return res.status(400).json({ error: 'No se puede crear una garantía a partir de una ODP derivada' });
    }

    const { descripcion_problema, nombre_recibe, telefono_recibe, cargo_recibe, tipo_servicio, direccion_instalacion, observaciones, items } = req.body;
    if (!descripcion_problema?.trim()) { await t.rollback(); return res.status(400).json({ error: 'La descripción del problema es obligatoria' }); }

    // Generar numero_garantia G-XXXX (usado también como numero_odp)
    const lastGarantia = await ODP.findOne({
      where: { numero_garantia: { [Op.like]: 'G-%' } },
      order: [['numero_garantia', 'DESC']],
      attributes: ['numero_garantia'],
      lock: true,
      transaction: t,
    });
    let nextG = 1;
    if (lastGarantia) {
      const partsG = lastGarantia.getDataValue('numero_garantia').split('-');
      nextG = parseInt(partsG[partsG.length - 1]) + 1;
    }
    const numero_garantia = `G-${String(nextG).padStart(4, '0')}`;
    const numero_odp = numero_garantia; // Las garantías no consumen consecutivo de ODPs

    const garantia = await ODP.create({
      numero_odp,
      numero_garantia,
      es_garantia: true,
      odp_padre_id: parseInt(id),
      cliente_id: odpPadre.getDataValue('cliente_id'),
      asesor_id: userId,
      descripcion_pedido: descripcion_problema.trim(),
      nombre_recibe: nombre_recibe || odpPadre.getDataValue('nombre_recibe') || '',
      telefono_recibe: telefono_recibe || odpPadre.getDataValue('telefono_recibe') || '',
      cargo_recibe: cargo_recibe || odpPadre.getDataValue('cargo_recibe') || '',
      tipo_servicio: tipo_servicio || odpPadre.getDataValue('tipo_servicio') || '',
      direccion_instalacion: direccion_instalacion || odpPadre.getDataValue('direccion_instalacion') || '',
      observaciones: observaciones || '',
      estado_produccion: 'EN_ESPERA',
      estado_facturacion: 'PENDIENTE',
      estado_caja: 'PENDIENTE',
      instalacion: true,
      fecha_creacion: new Date(),
    } as any, { transaction: t });

    if (Array.isArray(items) && items.length > 0) {
      await ODPItem.bulkCreate(
        items.map((item: any) => ({ ...item, odp_id: garantia.getDataValue('id') })),
        { transaction: t }
      );
    }

    await t.commit();
    res.status(201).json({ ok: true, garantia });
  } catch (error: any) {
    try { await t.rollback(); } catch (_) { /* ya commiteado */ }
    console.error('Error al crear garantía:', error);
    res.status(500).json({ error: 'Error al crear la garantía', details: error?.message });
  }
};

export const uploadCroquisODP = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const odp = await ODP.findByPk(id);
    if (!odp) return res.status(404).json({ error: 'ODP no encontrada' });

    const croquisUrl = (req.file as any)?.path || (req.file as any)?.url;

    if (!croquisUrl) {
      return res.status(400).json({ error: 'Se requiere una imagen del croquis.' });
    }

    await odp.update({ croquis_url: croquisUrl });

    res.json({ message: 'Croquis subido con éxito', croquis_url: croquisUrl, odp });
  } catch (error: any) {
    console.error('Error al subir croquis ODP:', error);
    res.status(500).json({ error: 'Error al subir el croquis', details: error?.message || error });
  }
};

// ─── Actualizar estado de caja manualmente (contabilidad, admin, gerencia) ───
export const actualizarEstadoCaja = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const schema = z.object({
      estado_caja: z.enum(['PENDIENTE', 'ABONADO', 'CANCELADO', 'CREDITO_APROBADO']),
    });
    const { estado_caja } = schema.parse(req.body);

    const odp = await ODP.findByPk(id);
    if (!odp) return res.status(404).json({ error: 'ODP no encontrada' });

    await odp.update({ estado_caja });
    res.json({ id: odp.getDataValue('id'), estado_caja });
  } catch (error: any) {
    if (error?.name === 'ZodError') return res.status(400).json({ error: error.errors });
    console.error('Error al actualizar estado caja ODP:', error);
    res.status(500).json({ error: 'Error al actualizar estado de caja', details: error?.message });
  }
};

// ─── Registrar / actualizar factura electrónica (contabilidad, admin, gerencia) ───
export const facturarODP = async (req: Request, res: Response) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const facturacionSchema = z.object({
      estado_facturacion: z.enum(['PENDIENTE', 'FACTURADA']),
      factura_electronica: z.string().min(1, 'Número de FE requerido').optional(),
      fecha_factura: z.string().optional(),
    });
    const data = facturacionSchema.parse(req.body);

    const odp = await ODP.findByPk(id, { transaction });
    if (!odp) {
      await transaction.rollback();
      return res.status(404).json({ error: 'ODP no encontrada' });
    }

    const updates: Record<string, any> = {
      estado_facturacion: data.estado_facturacion,
    };

    if (data.estado_facturacion === 'FACTURADA') {
      if (!data.factura_electronica) {
        await transaction.rollback();
        return res.status(400).json({ error: 'El número de FE es obligatorio para marcar como Facturada' });
      }
      updates.factura_electronica = data.factura_electronica;
      updates.fecha_factura = data.fecha_factura
        ? new Date(data.fecha_factura + 'T12:00:00.000Z')
        : null;

      // Calcular vencimiento a 30 días para ODPs de crédito
      if (data.fecha_factura && odp.getDataValue('forma_pago') === 'credito') {
        const fechaFe = new Date(data.fecha_factura + 'T12:00:00.000Z');
        fechaFe.setUTCDate(fechaFe.getUTCDate() + 30);
        updates.fecha_vencimiento_credito = fechaFe.toISOString().split('T')[0];
      }
    } else {
      // Al revertir a PENDIENTE se limpia la FE
      updates.factura_electronica = null;
      updates.fecha_factura = null;
    }

    await odp.update(updates, { transaction });
    await transaction.commit();

    const odpActualizada = await ODP.findByPk(id);
    res.json(odpActualizada);
  } catch (error: any) {
    await transaction.rollback();
    if (error?.name === 'ZodError') return res.status(400).json({ error: error.errors });
    console.error('Error al facturar ODP:', error);
    res.status(500).json({ error: 'Error al registrar la factura', details: error?.message });
  }
};

// POST /odp/:id/items — agrega nuevos ítems a una ODP existente (desde módulo PedidosPV)
export const agregarItems = async (req: Request, res: Response) => {
  try {
    const odpId = parseInt(req.params.id);
    const { items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Debe enviar al menos un ítem' });
    }

    const odp = await ODP.findByPk(odpId);
    if (!odp) return res.status(404).json({ error: 'ODP no encontrada' });

    const estadoActual = odp.getDataValue('estado_produccion') as string;
    const rolUsuario = req.user?.rol;
    const esAdminOGerencia = rolUsuario === 'admin' || rolUsuario === 'gerencia';
    if (['INSTALADA', 'ENTREGADA', 'PAUSADA'].includes(estadoActual) && !esAdminOGerencia) {
      return res.status(400).json({ error: `No se pueden agregar ítems a una ODP en estado ${estadoActual}` });
    }

    const nuevosItems = items.map((item: any) => ({
      odp_id: odpId,
      item: item.item || '',
      color: item.color || '',
      espesor: item.espesor || '',
      cantidad: item.cantidad || 1,
      ancho_mm: item.ancho_mm || null,
      alto_mm: item.alto_mm || null,
      tipo_vidrio: item.tipo_vidrio || '',
      pelicula: item.pelicula || false,
      matizado: item.matizado || false,
      carton: item.carton || false,
      huacal: item.huacal || false,
      accesorios: item.accesorios || '',
      pulidos: item.pulidos || '',
      pulidos_h: item.pulidos_h || '',
      perforaciones: item.perforaciones || 0,
      boquetes: item.boquetes || 0,
      descuentos: item.descuentos || '',
      otros: item.otros || '',
      mts_pt_a: item.mts_pt_a || '',
      mts_pt_h: item.mts_pt_h || '',
      prod: item.prod || '',
    }));

    const creados = await ODPItem.bulkCreate(nuevosItems as any);
    return res.status(201).json(creados);
  } catch (error: any) {
    console.error('Error agregarItems ODP:', error);
    return res.status(500).json({ error: 'Error al agregar ítems', details: error?.message });
  }
};

// GET /odp/carga-por-fecha?mes=YYYY-MM — conteo de ODPs por día del mes
export const getCargaPorMes = async (req: Request, res: Response) => {
  try {
    const { mes } = req.query as { mes?: string };
    if (!mes || !/^\d{4}-\d{2}$/.test(mes)) {
      return res.status(400).json({ error: 'Parámetro mes inválido (formato YYYY-MM)' });
    }
    const [year, month] = mes.split('-').map(Number);
    const ultimoDia = new Date(year, month, 0).getDate();
    const inicio = `${mes}-01`;
    const fin = `${mes}-${String(ultimoDia).padStart(2, '0')}`;

    const rows = await sequelize.query<{ dia: string }>(
      `SELECT fecha_entrega::date::text AS dia FROM odp
       WHERE fecha_entrega::date >= :inicio AND fecha_entrega::date <= :fin`,
      { replacements: { inicio, fin }, type: QueryTypes.SELECT }
    );

    const conteo: Record<string, number> = {};
    for (const row of rows) {
      conteo[row.dia] = (conteo[row.dia] || 0) + 1;
    }
    return res.json(conteo);
  } catch (error: any) {
    console.error('Error getCargaPorMes:', error);
    return res.status(500).json({ error: 'Error al obtener carga por mes', details: error?.message });
  }
};

// GET /odp/carga-por-fecha/:fecha — detalle de ODPs en una fecha YYYY-MM-DD
export const getCargaPorFecha = async (req: Request, res: Response) => {
  try {
    const { fecha } = req.params;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return res.status(400).json({ error: 'Fecha inválida (formato YYYY-MM-DD)' });
    }
    const rows = await sequelize.query<{ id: number; numero_odp: string; servicios_detalle: any; nombre_razon_social: string }>(
      `SELECT o.id, o.numero_odp, o.servicios_detalle, c.nombre_razon_social
       FROM odp o
       JOIN clientes c ON o.cliente_id = c.id
       WHERE o.fecha_entrega::date = :fecha
       ORDER BY o.numero_odp`,
      { replacements: { fecha }, type: QueryTypes.SELECT }
    );
    const resultado = rows.map(row => ({
      id: row.id,
      numero_odp: row.numero_odp,
      servicios_detalle: row.servicios_detalle,
      cliente: { nombre_razon_social: row.nombre_razon_social },
    }));
    return res.json(resultado);
  } catch (error: any) {
    console.error('Error getCargaPorFecha:', error);
    return res.status(500).json({ error: 'Error al obtener carga por fecha', details: error?.message });
  }
};

// PUT /odp/:id/aprobar-sin-items
// El asesor creador libera una ODP de pago adelantado (sin_items=true).
// Solo quita el bloqueo y regresa a EN_ESPERA — producción decide cuándo avanza.
export const aprobarSinItems = async (req: Request, res: Response) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const odp = await ODP.findByPk(id, { transaction });
    if (!odp) { await transaction.rollback(); return res.status(404).json({ error: 'ODP no encontrada' }); }
    if (!odp.getDataValue('sin_items')) { await transaction.rollback(); return res.status(400).json({ error: 'Esta ODP no está marcada como sin requerimientos' }); }

    const estadoActual = odp.getDataValue('estado_produccion');
    await odp.update({ sin_items: false, estado_produccion: 'EN_ESPERA' }, { transaction });
    await HistorialEstadoODP.create({
      odp_id: id, estado_anterior: estadoActual, estado_nuevo: 'EN_ESPERA',
      usuario_id: req.user?.id || null, fecha: new Date(),
      observacion: 'ODP liberada para producción por el asesor (pago adelantado).',
    }, { transaction });

    await transaction.commit();
    const odpActualizada = await ODP.findByPk(id);
    res.json(odpActualizada);
  } catch (error: any) {
    await transaction.rollback();
    console.error('Error al liberar ODP sin items:', error);
    res.status(500).json({ error: 'Error al liberar ODP', details: error?.message });
  }
};

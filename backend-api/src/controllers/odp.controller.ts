import { Request, Response } from 'express';
import { ODP, ODPItem, Cliente, Usuario, sequelize } from '../models';
import Pago from '../models/pago.model';
import { z } from 'zod';

const odpItemSchema = z.object({
  item: z.string().optional(),
  color: z.string().optional(),
  espesor: z.coerce.string().optional(),
  cantidad: z.number().int().positive().nullable().optional().default(1),
  ancho_mm: z.number().int().positive().nullable().optional(),
  alto_mm: z.number().int().positive().nullable().optional(),
  tipo_vidrio: z.string().optional(),
  pelicula: z.boolean().optional(),
  matizado: z.boolean().optional(),
  carton: z.boolean().optional(),
  huacal: z.boolean().optional(),
  accesorios: z.string().optional(),
  pulidos: z.string().optional(),
  pulidos_h: z.string().optional(),
  perforaciones: z.number().int().nonnegative().nullable().optional().default(0),
  boquetes: z.number().int().nonnegative().nullable().optional().default(0),
  descuentos: z.string().optional(),
  otros: z.string().optional(),
  mts_pt_a: z.string().optional(),
  mts_pt_h: z.string().optional(),
  prod: z.string().optional(),
  verificacion_prod: z.boolean().optional().default(false)
});

const odpSchema = z.object({
  numero_odp: z.string().optional(),
  cliente_id: z.number().int().positive('ID de cliente requerido'),
  asesor_id: z.number().int().positive('ID de asesor requerido').optional(),
  estado_produccion: z.enum(['EN_ESPERA', 'VISITA_TECNICA', 'MEDICION', 'PEDIDO_PROVEEDOR', 'ALUMINIO_CORTADO', 'VIDRIO_RECIBIDO', 'ACCESORIOS_SEPARADOS', 'LISTO_INSTALAR', 'PROGRAMADA', 'INSTALADA', 'ENTREGADA', 'PAUSADA']).default('EN_ESPERA'),
  estado_facturacion: z.enum(['PENDIENTE', 'FACTURADA']).default('PENDIENTE'),
  estado_caja: z.enum(['PENDIENTE', 'ABONADO', 'CANCELADO', 'CREDITO_APROBADO']).default('PENDIENTE'),
  factura_electronica: z.string().optional(),
  fecha_factura: z.string().optional(),
  url_documento_factura: z.string().optional(),
  autorizacion_especial_despacho: z.boolean().default(false),
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
  matizado: z.boolean().optional().default(false),
  pelicula: z.boolean().optional().default(false),
  acarreo: z.boolean().optional().default(false),
  instalacion: z.boolean().optional().default(false),
  huacal: z.boolean().optional().default(false),
  carton: z.boolean().optional().default(false),
  forma_pago: z.string().optional(),
  valor_total: z.number().nullable().optional(),
  abono: z.number().nullable().optional(),
  pendiente: z.number().nullable().optional(),
  proveedor_vidrio: z.string().optional(),
  numero_pedido_proveedor: z.string().optional(),
  chk_medicion: z.boolean().optional().default(false),
  chk_corte: z.boolean().optional().default(false),
  chk_vidrio: z.boolean().optional().default(false),
  chk_accesorios: z.boolean().optional().default(false),
  chk_ensamble: z.boolean().optional().default(false),
  chk_matizado: z.boolean().optional().default(false),
  chk_pelicula: z.boolean().optional().default(false),
  chk_huacal: z.boolean().optional().default(false),
  chk_carton: z.boolean().optional().default(false),
  es_no_conformidad: z.boolean().optional().default(false),
  odp_padre_id: z.number().optional().nullable(),
  items: z.array(odpItemSchema).optional()
});

export const getODPs = async (req: Request, res: Response) => {
  try {
    const odps = await ODP.findAll({
      include: [
        { model: Cliente, as: 'cliente' },
        { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo', 'username'] },
        { model: ODPItem, as: 'items' },
        { model: Pago, as: 'pagos', attributes: ['id', 'monto', 'metodo_pago', 'referencia_pago', 'fecha'], separate: true, order: [['fecha', 'ASC']] }
      ],
      order: [['fecha_creacion', 'DESC']]
    });
    res.json(odps);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener ODPs' });
  }
};

export const getODP = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Importar modelos dinámicamente para evitar circular imports
    const { SAP, SAPItem, Cotizacion, TomaMedidas, EvidenciaInstalacion, ProgramacionInstalacion, HistorialEstadoODP, NoConformidad, OrdenCompra } = await import('../models');

    const odp = await ODP.findByPk(id, {
      include: [
        { model: Cliente, as: 'cliente' },
        { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo', 'username', 'email'] },
        { model: ODPItem, as: 'items' },
        { model: ODP, as: 'odp_padre', attributes: ['id', 'numero_odp'] },
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
            {
              model: OrdenCompra, as: 'ordenes_compra',
              attributes: ['id', 'numero_odc', 'proveedor', 'estado'],
              order: [['fecha_creacion', 'ASC']],
            },
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
          model: ProgramacionInstalacion, as: 'programaciones',
          include: [
            { model: Usuario, as: 'instalador', attributes: ['id', 'nombre_completo'] },
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
        { model: Pago, as: 'pagos', attributes: ['id', 'monto', 'metodo_pago', 'referencia_pago', 'fecha'], separate: true, order: [['fecha', 'ASC']] }
      ],
    });

    if (!odp) return res.status(404).json({ error: 'ODP no encontrada' });
    res.json(odp);
  } catch (error: any) {
    console.error('Error getODP:', error.message);
    res.status(500).json({ error: 'Error al obtener ODP' });
  }
};


export const createODP = async (req: Request, res: Response) => {
  const t = await sequelize.transaction();
  try {
    const data = odpSchema.parse(req.body);
    const userId = (req as any).user?.id;
    if (!userId) {
      await t.rollback();
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    // Generar número ODP consecutivo sin año
    const lastODP = await ODP.findOne({
      where: { numero_odp: { [require('sequelize').Op.like]: 'ODP-%' } },
      order: [['numero_odp', 'DESC']],
      attributes: ['numero_odp'],
      transaction: t,
    });
    let nextODPNum = 1;
    if (lastODP) {
      const parts = lastODP.getDataValue('numero_odp').split('-');
      nextODPNum = parseInt(parts[parts.length - 1]) + 1;
    }
    const generatedNumeroODP = `ODP-${String(nextODPNum).padStart(4, '0')}`;

    const odpData = {
      numero_odp: data.numero_odp || generatedNumeroODP,
      cliente_id: data.cliente_id,
      asesor_id: data.asesor_id || userId,
      estado_produccion: data.estado_produccion,
      estado_facturacion: data.estado_facturacion,
      estado_caja: data.estado_caja,
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
    };

    const newOdp = await ODP.create(odpData as any, { transaction: t });

    if (data.items && data.items.length > 0) {
      const itemsData = data.items.map(item => ({ ...item, odp_id: newOdp.getDataValue('id') }));
      await ODPItem.bulkCreate(itemsData as any, { transaction: t });
    }

    await t.commit();
    res.status(201).json(newOdp);
  } catch (error: any) {
    await t.rollback();
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

    // ─── Lógica de dependencias de producción ───
    if (data.chk_pelicula || data.chk_matizado || data.chk_huacal || data.chk_carton) {
      if (!odp.getDataValue('chk_vidrio') && !data.chk_vidrio) {
         await transaction.rollback();
         return res.status(400).json({ error: 'No se puede procesar (película/matizado/huacal/cartón) sin haber recibido el vidrio primero.' });
      }
    }

    // Recalcular pendiente si viene valor_total o abono
    if (data.valor_total !== undefined || data.abono !== undefined) {
      const nuevoValorTotal = data.valor_total !== undefined ? (data.valor_total || 0) : (Number(odp.getDataValue('valor_total')) || 0);
      const nuevoAbono = data.abono !== undefined ? (data.abono || 0) : (Number(odp.getDataValue('abono')) || 0);
      (data as any).pendiente = Math.max(0, nuevoValorTotal - nuevoAbono);
    }

    // Actualizar campos de la ODP (incluyendo los booleanos, JSONs, y observaciones nuevas)
    await odp.update(data as any, { transaction });

    // ─── Lógica de autocompletado LISTO_INSTALAR ───
    const updatedOdp = await ODP.findByPk(id, { transaction });
    if (updatedOdp && updatedOdp.getDataValue('estado_produccion') !== 'LISTO_INSTALAR') {
      const needsMedicion = true;
      const needsCorte = true;
      const needsVidrio = true;
      const needsAccesorios = true;
      const needsEnsamble = true;
      const needsMatizado = updatedOdp.getDataValue('matizado');
      const needsPelicula = updatedOdp.getDataValue('pelicula');
      const needsHuacal = updatedOdp.getDataValue('huacal');
      const needsCarton = updatedOdp.getDataValue('carton');

      const isMedicionDone = updatedOdp.getDataValue('chk_medicion');
      const isCorteDone = updatedOdp.getDataValue('chk_corte');
      const isVidrioDone = updatedOdp.getDataValue('chk_vidrio');
      const isAccesoriosDone = updatedOdp.getDataValue('chk_accesorios');
      const isEnsambleDone = updatedOdp.getDataValue('chk_ensamble');
      const isMatizadoDone = !needsMatizado || updatedOdp.getDataValue('chk_matizado');
      const isPeliculaDone = !needsPelicula || updatedOdp.getDataValue('chk_pelicula');
      const isHuacalDone = !needsHuacal || updatedOdp.getDataValue('chk_huacal');
      const isCartonDone = !needsCarton || updatedOdp.getDataValue('chk_carton');

      if (isMedicionDone && isCorteDone && isVidrioDone && isAccesoriosDone && isEnsambleDone && isMatizadoDone && isPeliculaDone && isHuacalDone && isCartonDone) {
        await updatedOdp.update({ estado_produccion: 'LISTO_INSTALAR' }, { transaction });
        console.log(`✅ ODP ${updatedOdp.getDataValue('numero_odp')} marcada automáticamente como LISTO_INSTALAR.`);
      }
    }

    // Actualizar cristales si vienen en la data
    if (data.items && Array.isArray(data.items)) {
      // Borrar iterativos antiguos
      await ODPItem.destroy({ where: { odp_id: id }, transaction });

      // Crear los nuevos iterativos con el odp_id adecuado
      if (data.items.length > 0) {
        const nuevosItems = data.items.map(item => ({
          ...item,
          odp_id: id
        }));
        await ODPItem.bulkCreate(nuevosItems, { transaction });
      }
    }

    await transaction.commit();

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
            usuario_id: (req as any).user?.id || null,
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
  try {
    const { id } = req.params;
    const odp = await ODP.findByPk(id);
    if (!odp) return res.status(404).json({ error: 'ODP no encontrada' });

    await ODPItem.destroy({ where: { odp_id: id } });
    await odp.destroy();
    res.json({ status: 'ODP y sus ítems eliminados correctamente' });
  } catch (error) {
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


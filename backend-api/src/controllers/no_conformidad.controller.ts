import { Request, Response } from 'express';
import { z } from 'zod';
import { NoConformidad, ODP, ODPItem, Usuario, Cliente, HistorialEstadoODP } from '../models';

const updateNCSchema = z.object({
  estado: z.enum(['ABIERTO', 'EN_PROCESO', 'CERRADO']).optional(),
  acciones_correctivas: z.string().optional().nullable(),
  observaciones: z.string().optional().nullable(),
}).strict();

/**
 * Crear un Reporte de No Conformidad completo:
 * 1. Valida permisos (solo asesor dueño, producción o gerencia)
 * 2. Genera consecutivo NC-XXXX
 * 3. Crea la nueva ODP de reproceso (clonando datos del cliente)
 * 4. Crea el/los ítems de solución en la nueva ODP
 * 5. Pausa la ODP original
 * 6. Registra historial de estados
 */
export const createNoConformidad = async (req: Request, res: Response) => {
  try {
    const usuario = req.user!;
    const {
      odp_id,
      tipo_error,
      area_error,
      causa,
      responsable,
      efecto,
      producto_error_descripcion,
      producto_error_cantidad,
      items_solucion, // Array de ítems de repuesto/solución
      observaciones
    } = req.body;

    // 1. Buscar ODP original con su cliente y asesor
    const odp: any = await ODP.findByPk(odp_id, {
      include: [
        { model: Cliente, as: 'cliente' },
        { model: Usuario, as: 'asesor' }
      ]
    });

    if (!odp) {
      return res.status(404).json({ message: 'ODP no encontrada' });
    }

    // 2. Verificar permisos: solo asesor dueño, producción, gerencia o admin
    const userRole = usuario.rol;
    const isOwnerAsesor = userRole === 'asesor_comercial' && usuario.id === odp.asesor_id;
    const isAuthorized = ['admin', 'gerencia', 'produccion'].includes(userRole) || isOwnerAsesor;

    if (!isAuthorized) {
      return res.status(403).json({ message: 'No tiene permisos para reportar problemas en esta ODP. Solo el asesor dueño, producción o gerencia pueden hacerlo.' });
    }

    // 3. Generar consecutivo NC-XXXX
    const count = await NoConformidad.count();
    const numero_reporte = `NC-${(count + 1).toString().padStart(4, '0')}`;

    // 4. Generar número de la nueva ODP de reproceso
    const lastOdp: any = await ODP.findOne({ order: [['id', 'DESC']] });
    let nextNum = 1;
    if (lastOdp) {
      const match = lastOdp.numero_odp?.match(/\d+/);
      if (match) nextNum = parseInt(match[0]) + 1;
    }
    const nuevoNumeroOdp = `ODP-${nextNum.toString().padStart(4, '0')}`;

    // 5. Crear la nueva ODP de reproceso (hereda datos del cliente original)
    const nuevaOdp: any = await ODP.create({
      numero_odp: nuevoNumeroOdp,
      cliente_id: odp.cliente_id,
      asesor_id: odp.asesor_id,
      estado_produccion: 'MEDICION',
      estado_facturacion: 'PENDIENTE',
      estado_caja: 'PENDIENTE',
      fecha_entrega: null,
      nombre_recibe: odp.nombre_recibe,
      telefono_recibe: odp.telefono_recibe,
      tipo_servicio: odp.tipo_servicio,
      descripcion_pedido: `[REPROCESO ${numero_reporte}] Ref: ${odp.numero_odp}`,
      direccion_instalacion: odp.direccion_instalacion,
      observaciones: `No Conformidad ${numero_reporte} - ${causa || tipo_error}`,
      forma_pago: odp.forma_pago,
      cantidad_total: items_solucion?.length || 1,
      es_no_conformidad: true,
      odp_padre_id: odp.id,
    });

    // 6. Crear los ítems de solución en la nueva ODP
    if (items_solucion && items_solucion.length > 0) {
      for (const item of items_solucion) {
        await ODPItem.create({
          odp_id: nuevaOdp.id,
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
          perforaciones: item.perforaciones || 0,
          boquetes: item.boquetes || 0,
          descuentos: item.descuentos || '',
          otros: item.otros || '',
          mts_pt_a: item.mts_pt_a || '',
          mts_pt_h: item.mts_pt_h || '',
        });
      }
    }

    // 7. Crear el reporte de No Conformidad
    const nc: any = await NoConformidad.create({
      odp_id: odp.id,
      nueva_odp_id: nuevaOdp.id,
      numero_reporte,
      tipo_error,
      area_error: area_error || '',
      causa: causa || '',
      responsable: responsable || '',
      efecto: efecto || '',
      producto_error_descripcion: producto_error_descripcion || '',
      producto_error_cantidad: producto_error_cantidad || 1,
      producto_solucion_descripcion: items_solucion?.map((i: any) => `${i.item} ${i.ancho_mm}x${i.alto_mm}mm`).join(', ') || '',
      producto_solucion_cantidad: items_solucion?.reduce((sum: number, i: any) => sum + (i.cantidad || 1), 0) || 1,
      usuario_reporta_id: usuario.id,
      observaciones: observaciones || '',
      estado: 'ABIERTO'
    });

    // 8. Pausar la ODP original
    await odp.update({ estado_produccion: 'PAUSADA' });

    // 9. Registrar historial en ambas ODPs
    await HistorialEstadoODP.create({
      odp_id: odp.id,
      estado_anterior: odp.getDataValue('estado_produccion'),
      estado_nuevo: 'PAUSADA',
      usuario_id: usuario.id,
      fecha: new Date(),
      observacion: `Pausada por No Conformidad ${numero_reporte}`
    });

    await HistorialEstadoODP.create({
      odp_id: nuevaOdp.id,
      estado_anterior: null,
      estado_nuevo: 'MEDICION',
      usuario_id: usuario.id,
      fecha: new Date(),
    });

    res.status(201).json({
      message: `No Conformidad ${numero_reporte} creada exitosamente. Nueva ODP de reproceso: ${nuevoNumeroOdp}`,
      no_conformidad: nc,
      nueva_odp: nuevaOdp
    });
  } catch (error: any) {
    console.error('Error al crear No Conformidad:', error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * Obtener No Conformidades por ODP
 */
export const getNoConformidadesByODP = async (req: Request, res: Response) => {
  try {
    const { odpId } = req.params;
    const ncs = await NoConformidad.findAll({
      where: { odp_id: odpId },
      include: [
        { model: Usuario, as: 'usuario_reporta', attributes: ['nombre_completo'] },
        { model: ODP, as: 'nueva_odp', attributes: ['id', 'numero_odp', 'estado_produccion'] }
      ],
      order: [['creado_en', 'DESC']]
    });
    res.json(ncs);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * Actualizar No Conformidad (solo gerencia/admin)
 */
export const updateNoConformidad = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const nc = await NoConformidad.findByPk(id);
    if (!nc) {
      return res.status(404).json({ message: 'Reporte no encontrado' });
    }

    const data = updateNCSchema.parse(req.body);
    await nc.update(data as any);
    return res.json(nc);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Datos inválidos', detalles: error.issues });
    }
    res.status(500).json({ message: error.message });
  }
};

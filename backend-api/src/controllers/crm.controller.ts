import { Request, Response } from 'express';
import { Op } from 'sequelize';
import { Lead, LeadEvento, Usuario, Cliente } from '../models';



export const createLead = async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const { 
      telefono, nombre, mensaje_entrada, segmento, 
      respondio, producto_interes, descripcion_contexto, asesor_id 
    } = req.body;

    const newLead = await Lead.create({
      telefono,
      nombre,
      mensaje_entrada,
      segmento,
      respondio,
      producto_interes,
      descripcion_contexto,
      asesor_id: asesor_id || null, // Nulo = Bolsa Común
      asistente_id: user.id,
      estado_crm: asesor_id ? 'ASIGNADO' : 'NUEVO'
    });

    await LeadEvento.create({
      tipo: 'CREACION',
      detalle_texto: `Lead registrado exitosamente. Origen: WhatsApp. Producto: ${producto_interes || 'Sin definir'}`,
      lead_id: newLead.getDataValue('id'),
      creado_por: user.id
    });

    if (asesor_id) {
       await LeadEvento.create({
        tipo: 'ASIGNACION',
        detalle_texto: `Asignado directamente desde captura al asesor.`,
        lead_id: newLead.getDataValue('id'),
        creado_por: user.id
      });
    }

    res.status(201).json(newLead);
  } catch (error: any) {
    console.error('Error al crear lead:', error);
    res.status(500).json({ error: 'Error del servidor al crear lead' });
  }
};

export const updateLeadStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { nuevo_estado, motivo_perdida } = req.body;
    const user = req.user as any;

    const lead = await Lead.findByPk(id);
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado' });

    // Regla de negocio: Si se va a perdido, requiere motivo.
    if (nuevo_estado === 'PERDIDO' && !motivo_perdida) {
      return res.status(400).json({ error: 'Se requiere un motivo de pérdida oficial' });
    }

    const estadoAnterior = lead.getDataValue('estado_crm');

    // Lógica Anti-Fantasma (Seguimientos)
    if (nuevo_estado === 'EN_CONTACTO' || nuevo_estado === 'COTIZANDO' || nuevo_estado === 'VISITA_TECNICA') {
       if (estadoAnterior === nuevo_estado) { // Es un intento re-iterativo de seguimiento en la misma columna
         const intentos = lead.getDataValue('intentos_seguimiento');
         if (intentos >= 3) {
            // Regla disparada: Al 3ero va automático a FRIO.
            await lead.update({ estado_crm: 'FRIO' });
            await LeadEvento.create({
              tipo: 'PASE_A_FRIO',
              detalle_texto: `Sistema Anti-Fuga detectó 3 intentos de seguimiento sin éxito de respuesta. Auto-Pase a FRIO.`,
              lead_id: lead.getDataValue('id'),
              creado_por: user.id
            });
            return res.json(lead);
         } else {
            await lead.increment('intentos_seguimiento');
         }
       }
    }

    await lead.update({ 
      estado_crm: nuevo_estado,
      motivo_perdida: nuevo_estado === 'PERDIDO' ? motivo_perdida : lead.getDataValue('motivo_perdida')
    });

    await LeadEvento.create({
      tipo: 'CAMBIO_ESTADO',
      detalle_texto: `Movido de ${estadoAnterior} a ${nuevo_estado}`,
      lead_id: lead.getDataValue('id'),
      creado_por: user.id
    });

    res.json(lead);
  } catch (error: any) {
    console.error('Error al actualizar estado:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

export const assignLeadToMe = async (req: Request, res: Response) => {
   try {
    const { id } = req.params;
    const user = req.user as any;

    const lead = await Lead.findByPk(id);
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado' });

    if (lead.getDataValue('asesor_id') && lead.getDataValue('asesor_id') !== user.id) {
       return res.status(400).json({ error: 'El lead ya está asignado a otro asesor' });
    }

    await lead.update({ 
      asesor_id: user.id,
      estado_crm: 'ASIGNADO'
    });

    await LeadEvento.create({
      tipo: 'ASIGNACION',
      detalle_texto: `El asesor tomó el lead desde la bolsa común (Auto-Asignación).`,
      lead_id: lead.getDataValue('id'),
      creado_por: user.id
    });

    res.json(lead);
   } catch (error: any) {
      console.error('Error al auto-asignar lead:', error);
      res.status(500).json({ error: 'Error de servidor.' });
   }
};

export const assignLeadToUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = req.user as any;
    const { asesor_id } = req.body;

    if (!asesor_id) return res.status(400).json({ error: 'Se requiere el ID del asesor' });

    const lead = await Lead.findByPk(id);
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado' });

    const asesor = await Usuario.findByPk(asesor_id);
    if (!asesor) return res.status(404).json({ error: 'Asesor no encontrado' });

    await lead.update({ 
      asesor_id: asesor.getDataValue('id'),
      estado_crm: lead.getDataValue('estado_crm') === 'NUEVO' ? 'ASIGNADO' : lead.getDataValue('estado_crm')
    });

    await LeadEvento.create({
      tipo: 'ASIGNACION',
      detalle_texto: `Lead asignado manualmente al asesor: ${asesor.getDataValue('nombre_completo')}.`,
      lead_id: lead.getDataValue('id'),
      creado_por: user.id
    });

    const leadActualizado = await Lead.findByPk(id, {
      include: [{ model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] }]
    });

    res.json(leadActualizado);
  } catch (error: any) {
    console.error('Error al asignar lead:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

export const getLeadTimeline = async (req: Request, res: Response) => {
   try {
    const { id } = req.params;
    const eventos = await LeadEvento.findAll({
      where: { lead_id: id },
      include: [{ model: Usuario, as: 'creador', attributes: ['nombre_completo'] }],
      order: [['createdAt', 'DESC']]
    });
    res.json(eventos);
   } catch (error: any) {
      res.status(500).json({ error: 'Error de servidor.' });
   }
};

export const updateLeadMonto = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = req.user as any;
    const { monto_proyectado_cotizacion } = req.body;

    const monto = parseFloat(monto_proyectado_cotizacion);
    if (isNaN(monto) || monto < 0) {
      return res.status(400).json({ error: 'El monto debe ser un número positivo' });
    }

    const lead = await Lead.findByPk(id);
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado' });

    await lead.update({ monto_proyectado_cotizacion: monto });

    await LeadEvento.create({
      tipo: 'SEGUIMIENTO',
      detalle_texto: `Monto proyectado actualizado a ${new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(monto)}`,
      lead_id: lead.getDataValue('id'),
      creado_por: user.id,
    } as any);

    res.json(lead);
  } catch (error: any) {
    console.error('Error al actualizar monto:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

export const registerLeadSeguimiento = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = req.user as any;
    const { nota } = req.body;

    const lead = await Lead.findByPk(id);
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado' });

    const nuevosIntentos = (lead.getDataValue('intentos_seguimiento') || 0) + 1;
    const updates: any = { intentos_seguimiento: nuevosIntentos };
    
    let detalleEvento = `Intento de seguimiento #${nuevosIntentos}. ${nota || 'Sin observaciones.'}`;

    if (nuevosIntentos >= 3 && lead.getDataValue('estado_crm') !== 'FRIO') {
      updates.estado_crm = 'FRIO';
      detalleEvento += ' [EL CLIENTE HA SIDO TRASLADADO A ETAPA FRÍO POR FALTA DE RESPUESTA]';
      
      await LeadEvento.create({
        tipo: 'PASE_A_FRIO',
        detalle_texto: 'Cliente trasladado a etapa Frío automáticamente tras 3 intentos fallidos de contacto.',
        lead_id: lead.getDataValue('id'),
        creado_por: user.id
      });
    }

    await lead.update(updates);

    await LeadEvento.create({
      tipo: 'COMUNICACION',
      detalle_texto: detalleEvento,
      lead_id: lead.getDataValue('id'),
      creado_por: user.id
    } as any);

    res.json(lead);
  } catch (error: any) {
    console.error('Error al registrar seguimiento:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

export const convertLeadToCliente = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = req.user as any;
    const {
      nombre_razon_social,
      numero_documento,
      tipo_documento = 'DNI',
      direccion,
      condicion_pago = 'CONTADO',
      email,
    } = req.body;

    const lead = await Lead.findByPk(id);
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado' });
    if (lead.getDataValue('estado_crm') !== 'APROBADO') {
      return res.status(400).json({ error: 'Solo se pueden convertir leads en estado APROBADO' });
    }
    if (lead.getDataValue('cliente_id')) {
      return res.status(409).json({ error: 'Este lead ya fue convertido a cliente anteriormente' });
    }
    if (!numero_documento || !nombre_razon_social) {
      return res.status(400).json({ error: 'Se requiere nombre y documento del cliente' });
    }

    const existente = await Cliente.findOne({ where: { numero_documento } });
    if (existente) {
      await lead.update({ 
        cliente_id: existente.getDataValue('id'),
        fecha_cierre: new Date()
      });
      await LeadEvento.create({
        tipo: 'CONVERSION',
        detalle_texto: `Lead vinculado a cliente existente: ${existente.getDataValue('nombre_razon_social')} (ID: ${existente.getDataValue('id')})`,
        lead_id: lead.getDataValue('id'),
        creado_por: user.id
      });
      return res.json({ lead, cliente: existente, esNuevo: false });
    }

    const nuevoCliente = await Cliente.create({
      nombre_razon_social: nombre_razon_social || lead.getDataValue('nombre'),
      tipo_documento,
      numero_documento,
      telefono: lead.getDataValue('telefono'),
      celular: lead.getDataValue('telefono'),
      email: email || null,
      segmento: lead.getDataValue('segmento'),
      direccion: direccion || null,
      condicion_pago,
      creado_por: user.id,
    });

    await lead.update({
      cliente_id: nuevoCliente.getDataValue('id'),
      fecha_cierre: new Date()
    });

    await LeadEvento.create({
      tipo: 'CONVERSION',
      detalle_texto: `Lead convertido a cliente: ${nuevoCliente.getDataValue('nombre_razon_social')} (Doc: ${numero_documento})`,
      lead_id: lead.getDataValue('id'),
      creado_por: user.id
    });

    res.status(201).json({ lead, cliente: nuevoCliente, esNuevo: true });
  } catch (error: any) {
    console.error('Error al convertir lead a cliente:', error);
    res.status(500).json({ error: 'Error del servidor al convertir' });
  }
};

export const getLeads = async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const { mes, anio } = req.query;
    const esAdminOGerencia = ['admin', 'gerencia', 'root', 'asistente_administrativo'].includes(user.rol.toLowerCase());

    const whereClause: any = esAdminOGerencia 
      ? {} 
      : { 
          [Op.or]: [
            { asesor_id: user.id },
            { estado_crm: 'NUEVO' }
          ]
        };

    // Filtro por mes y año si vienen en el query
    if (mes && anio) {
      const month = parseInt(mes as string);
      const year = parseInt(anio as string);
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0, 23, 59, 59);

      whereClause.createdAt = {
        [Op.between]: [startDate, endDate]
      };
    }

    const leads = await Lead.findAll({
      where: whereClause,
      include: [
        { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] },
        { model: Usuario, as: 'captador', attributes: ['id', 'nombre_completo'] },
      ],
      order: [['createdAt', 'DESC']],
    });

    res.json(leads);
  } catch (error: any) {
    console.error('Error al obtener leads:', error);
    res.status(500).json({ error: 'Error del servidor al obtener leads' });
  }
};

export const getCRMStats = async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const { mes, anio } = req.query;
    const esGlobal = ['admin', 'gerencia', 'root', 'asistente_administrativo'].includes(user.rol);
    
    const whereBase: any = esGlobal ? {} : { asesor_id: user.id };

    // Filtro por mes y año
    if (mes && anio) {
      const month = parseInt(mes as string);
      const year = parseInt(anio as string);
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0, 23, 59, 59);
      whereBase.createdAt = { [Op.between]: [startDate, endDate] };
    }

    const leads = await Lead.findAll({ 
      where: whereBase,
      include: [{ model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] }]
    });

    const total = leads.length;
    const porEstado: Record<string, number> = {};
    const porMotivoPerdida: Record<string, number> = {};
    const porSegmento: Record<string, { total: number, aprobados: number, monto: number }> = {};
    const porProducto: Record<string, { total: number, aprobados: number, monto: number }> = {};
    
    let montoTotal = 0;
    let montoPotencial = 0;
    let sumaDiasCierre = 0;
    let cerradosConFecha = 0;

    leads.forEach((l: any) => {
      const estado = l.getDataValue('estado_crm');
      const monto = parseFloat(l.getDataValue('monto_proyectado_cotizacion') || '0');
      const segmento = l.getDataValue('segmento') || 'Sin Segmento';
      const producto = l.getDataValue('producto_interes') || 'Sin Definir';
      const creado = new Date(l.getDataValue('createdAt'));
      const cierre = l.getDataValue('fecha_cierre') ? new Date(l.getDataValue('fecha_cierre')) : null;

      porEstado[estado] = (porEstado[estado] || 0) + 1;
      montoTotal += monto;
      if (!['PERDIDO', 'FRIO'].includes(estado)) montoPotencial += monto;

      // Desglose por motivo de pérdida
      if (estado === 'PERDIDO' && l.getDataValue('motivo_perdida')) {
        const motivo = l.getDataValue('motivo_perdida');
        porMotivoPerdida[motivo] = (porMotivoPerdida[motivo] || 0) + 1;
      }

      // Desglose por segmento
      if (!porSegmento[segmento]) porSegmento[segmento] = { total: 0, aprobados: 0, monto: 0 };
      porSegmento[segmento].total++;
      porSegmento[segmento].monto += monto;
      if (estado === 'APROBADO') porSegmento[segmento].aprobados++;

      // Desglose por producto
      if (!porProducto[producto]) porProducto[producto] = { total: 0, aprobados: 0, monto: 0 };
      porProducto[producto].total++;
      porProducto[producto].monto += monto;
      if (estado === 'APROBADO') porProducto[producto].aprobados++;

      // Tiempo de cierre
      if (estado === 'APROBADO' && cierre) {
        const difMs = cierre.getTime() - creado.getTime();
        sumaDiasCierre += difMs / (1000 * 60 * 60 * 24);
        cerradosConFecha++;
      }
    });

    const aprobados = porEstado['APROBADO'] || 0;
    const convertidos = leads.filter((l: any) => l.getDataValue('cliente_id')).length;

    const statsPorAsesor: any[] = [];
    if (esGlobal) {
      const asesores = await Usuario.findAll({
        where: { rol: { [Op.or]: ['asesor_comercial', 'admin'] } },
        attributes: ['id', 'nombre_completo']
      });
      
      for (const asesor of asesores) {
        const asesorId = asesor.getDataValue('id');
        const leadsAsesor = leads.filter((l: any) => l.getDataValue('asesor_id') === asesorId);
        const aprobadosAsesor = leadsAsesor.filter((l: any) => l.getDataValue('estado_crm') === 'APROBADO').length;
        
        if (leadsAsesor.length > 0) {
          statsPorAsesor.push({
            id: asesorId,
            nombre: asesor.getDataValue('nombre_completo'),
            total: leadsAsesor.length,
            aprobados: aprobadosAsesor,
            perdidos: leadsAsesor.filter((l: any) => l.getDataValue('estado_crm') === 'PERDIDO').length,
            tasa_conversion: Math.round((aprobadosAsesor / leadsAsesor.length) * 100),
            monto_gestionado: leadsAsesor.reduce((s: number, l: any) => s + parseFloat(l.getDataValue('monto_proyectado_cotizacion') || '0'), 0),
          });
        }
      }
    }

    res.json({
      total,
      por_estado: porEstado,
      por_motivo_perdida: porMotivoPerdida,
      por_segmento: porSegmento,
      por_producto: porProducto,
      monto_total_cotizaciones: montoTotal,
      monto_potencial_activo: montoPotencial,
      tasa_conversion: total > 0 ? Math.round((aprobados / total) * 100) : 0,
      convertidos_a_cliente: convertidos,
      tiempo_promedio_cierre_dias: cerradosConFecha > 0 ? Math.round(sumaDiasCierre / cerradosConFecha) : 0,
      stats_por_asesor: statsPorAsesor.sort((a,b) => b.tasa_conversion - a.tasa_conversion),
    });
  } catch (error: any) {
    console.error('Error en stats CRM:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

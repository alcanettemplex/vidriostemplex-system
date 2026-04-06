import { Request, Response } from 'express';
import { Op } from 'sequelize';
import { Lead, LeadEvento, Usuario, Cliente } from '../models';

export const getLeads = async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const esAdminOGerencia = ['admin', 'gerencia', 'root', 'asistente_administrativo'].includes(user.rol.toLowerCase());

    const whereClause = esAdminOGerencia ? {} : { asesor_id: user.id };

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
              creado_por: user.id // El sistema a nombre del usuario
            });
            return res.json(lead); // Cerramos operación acá
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
      res.status(500).json({ error: 'Error de servidor.' });
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

// ─── CONVERSIÓN LEAD → CLIENTE ─────────────────────────────────────────────
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

    // Verificar que documento no exista ya
    const existente = await Cliente.findOne({ where: { numero_documento } });
    if (existente) {
      // Si ya existe, solo vinculamos sin duplicar
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

    // Crear cliente nuevo a partir del lead
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

    // Vincular lead al cliente y marcar fecha de cierre
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

// ─── ESTADÍSTICAS GERENCIALES ─────────────────────────────────────────────────
export const getCRMStats = async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const esGlobal = ['admin', 'gerencia', 'root', 'asistente_administrativo'].includes(user.rol);
    const whereBase = esGlobal ? {} : { asesor_id: user.id };

    // Contar por estado
    const leads = await Lead.findAll({ where: whereBase });
    const total = leads.length;
    const porEstado: Record<string, number> = {};
    let montoTotal = 0;
    let montoPotencial = 0;

    leads.forEach((l: any) => {
      const estado = l.getDataValue('estado_crm');
      porEstado[estado] = (porEstado[estado] || 0) + 1;
      const monto = parseFloat(l.getDataValue('monto_proyectado_cotizacion') || '0');
      montoTotal += monto;
      if (!['PERDIDO', 'FRIO'].includes(estado)) montoPotencial += monto;
    });

    const aprobados = porEstado['APROBADO'] || 0;
    const perdidos = porEstado['PERDIDO'] || 0;
    const convertidos = leads.filter((l: any) => l.getDataValue('cliente_id')).length;

    // Stats por asesor (solo para vista global)
    const statsPorAsesor: any[] = [];
    if (esGlobal) {
      const asesores = await Usuario.findAll({
        where: { rol: 'asesor_comercial' },
        attributes: ['id', 'nombre_completo']
      });
      for (const asesor of asesores) {
        const asesorId = asesor.getDataValue('id');
        const leadsAsesor = leads.filter((l: any) => l.getDataValue('asesor_id') === asesorId);
        const aprobadosAsesor = leadsAsesor.filter((l: any) => l.getDataValue('estado_crm') === 'APROBADO').length;
        statsPorAsesor.push({
          id: asesorId,
          nombre: asesor.getDataValue('nombre_completo'),
          total: leadsAsesor.length,
          aprobados: aprobadosAsesor,
          perdidos: leadsAsesor.filter((l: any) => l.getDataValue('estado_crm') === 'PERDIDO').length,
          tasa_conversion: leadsAsesor.length > 0 ? Math.round((aprobadosAsesor / leadsAsesor.length) * 100) : 0,
          monto_gestionado: leadsAsesor.reduce((s: number, l: any) => s + parseFloat(l.getDataValue('monto_proyectado_cotizacion') || '0'), 0),
        });
      }
    }

    res.json({
      total,
      por_estado: porEstado,
      monto_total_cotizaciones: montoTotal,
      monto_potencial_activo: montoPotencial,
      tasa_conversion: total > 0 ? Math.round((aprobados / total) * 100) : 0,
      convertidos_a_cliente: convertidos,
      stats_por_asesor: statsPorAsesor,
    });
  } catch (error: any) {
    console.error('Error en stats CRM:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

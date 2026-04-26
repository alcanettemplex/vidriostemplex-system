import { Request, Response } from 'express';
import { Op } from 'sequelize';
import sequelize from '../config/database';
import { Lead, LeadEvento, Usuario, Cliente, Prospecto, TomaMedidas } from '../models';
import ODP from '../models/odp.model';



export const createLead = async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const {
      telefono, nombre, mensaje_entrada, segmento, fuente_lead,
      respondio, producto_interes, descripcion_contexto, asesor_id
    } = req.body;

    // Verificar duplicado por teléfono
    const existente = await Lead.findOne({ where: { telefono: telefono?.trim() } });
    if (existente) {
      return res.status(409).json({ error: `Ya existe un lead registrado con el número ${telefono}. Búscalo en el pipeline antes de crear uno nuevo.` });
    }

    const newLead = await Lead.create({
      telefono,
      nombre,
      mensaje_entrada,
      segmento,
      fuente_lead: fuente_lead || 'Presencial',
      respondio,
      producto_interes,
      descripcion_contexto,
      asesor_id: asesor_id || null, // Nulo = Bolsa Común
      asistente_id: user.id,
      estado_crm: asesor_id ? 'ASIGNADO' : 'NUEVO',
      fecha_asignado: asesor_id ? new Date() : null
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

    import('../server').then(({ emitirCambio }) => emitirCambio('crm')).catch(() => {});
    res.status(201).json(newLead);
  } catch (error: any) {
    console.error('Error al crear lead:', error?.message || error);
    console.error('Stack:', error?.stack);
    res.status(500).json({ error: 'Error del servidor al crear lead', detalle: error?.message });
  }
};

export const updateLeadStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { nuevo_estado, motivo_perdida } = req.body;
    const user = req.user!;

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

    const MAP_FECHAS: Record<string, string> = {
      'ASIGNADO':       'fecha_asignado',
      'EN_CONTACTO':    'fecha_en_contacto',
      'COTIZANDO':      'fecha_cotizando',
      'VISITA_TECNICA': 'fecha_visita_tecnica',
      'FRIO':           'fecha_frio',
      'APROBADO':       'fecha_aprobado',
      'PERDIDO':        'fecha_perdido'
    };

    const updates: any = { 
      estado_crm: nuevo_estado,
      motivo_perdida: nuevo_estado === 'PERDIDO' ? motivo_perdida : lead.getDataValue('motivo_perdida')
    };

    if (MAP_FECHAS[nuevo_estado]) {
      updates[MAP_FECHAS[nuevo_estado]] = new Date();
    }
    
    // Si se aprueba, el monto proyectado pasa a ser el monto real inicial
    if (nuevo_estado === 'APROBADO') {
      updates.monto_real_venta = lead.getDataValue('monto_proyectado_cotizacion');
    }

    await lead.update(updates);

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
    const user = req.user!;

    const lead = await Lead.findByPk(id);
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado' });

    // Administración, Gerencia y Jefe de Producción pueden auto-asignarse leads
    const puedeTomar = ['admin', 'gerencia', 'root', 'asistente_administrativo', 'jefe_produccion'].includes(user.rol.toLowerCase());
    if (!puedeTomar) {
      return res.status(403).json({ error: 'No tienes permisos para auto-asignarte leads. Solicítalo a Gerencia.' });
    }

    if (lead.getDataValue('asesor_id') && lead.getDataValue('asesor_id') !== user.id) {
       return res.status(400).json({ error: 'El lead ya está asignado a otro asesor' });
    }

    await lead.update({ 
      asesor_id: user.id,
      estado_crm: 'ASIGNADO',
      fecha_asignado: new Date()
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
    const user = req.user!;
    const { asesor_id } = req.body;

    if (!asesor_id) return res.status(400).json({ error: 'Se requiere el ID del asesor' });

    const lead = await Lead.findByPk(id);
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado' });

    const asesor = await Usuario.findByPk(asesor_id);
    if (!asesor) return res.status(404).json({ error: 'Asesor no encontrado' });

    await lead.update({ 
      asesor_id: asesor.getDataValue('id'),
      estado_crm: lead.getDataValue('estado_crm') === 'NUEVO' ? 'ASIGNADO' : lead.getDataValue('estado_crm'),
      fecha_asignado: lead.getDataValue('fecha_asignado') || new Date()
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

    import('../server').then(({ emitirCambio }) => emitirCambio('crm')).catch(() => {});
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
    const user = req.user!;
    const { monto_proyectado_cotizacion } = req.body;

    const monto = parseFloat(monto_proyectado_cotizacion);
    if (isNaN(monto) || monto < 0) {
      return res.status(400).json({ error: 'El monto debe ser un número positivo' });
    }

    const lead = await Lead.findByPk(id);
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado' });

    await lead.update({ monto_proyectado_cotizacion: monto });

    await LeadEvento.create({
      tipo: 'CAMBIO_ESTADO',
      detalle_texto: `Monto proyectado actualizado a ${new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(monto)}`,
      lead_id: lead.getDataValue('id'),
      creado_por: user.id
    });

    res.json(lead);
  } catch (error: any) {
    console.error('Error al actualizar monto:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

export const registerLeadSeguimiento = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = req.user!;
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
    const user = req.user!;
    const {
      nombre_razon_social,
      numero_documento,
      tipo_documento = 'C.C',
      direccion,
      condicion_pago = 'CONTADO',
      email,
      telefono,
      celular,
      segmento,
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
        fecha_cierre: new Date(),
        cliente_es_nuevo: false
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
      telefono: telefono || lead.getDataValue('telefono') || null,
      celular: celular || lead.getDataValue('telefono') || null,
      email: email || null,
      segmento: segmento || lead.getDataValue('segmento') || null,
      direccion: direccion || null,
      condicion_pago,
      creado_por: user.id,
    });

    await lead.update({
      cliente_id: nuevoCliente.getDataValue('id'),
      fecha_cierre: new Date(),
      cliente_es_nuevo: true
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
    const user = req.user!;
    const { mes, anio, vista } = req.query;
    const esSinRespuesta = vista === 'sin_respuesta';
    const esAdminOGerencia = ['admin', 'gerencia', 'root', 'asistente_administrativo', 'marketing'].includes(user.rol?.toLowerCase());

    const whereClause: any = esAdminOGerencia
      ? {}
      : {
          [Op.or]: [
            { asesor_id: user.id },
            { estado_crm: 'NUEVO' }
          ]
        };

    // Separar pipeline de sin-respuesta
    if (esSinRespuesta) {
      whereClause.respondio = 'No responde';
    } else {
      whereClause.respondio = { [Op.ne]: 'No responde' };
    }

    // Filtro por mes y año si vienen en el query
    if (mes && anio && mes !== 'undefined' && anio !== 'undefined') {
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
      attributes: {
        include: [
          [sequelize.literal(`(SELECT MAX("createdAt") FROM "lead_eventos" WHERE "lead_eventos"."lead_id" = "Lead"."id")`), 'ultima_actividad']
        ]
      },
      include: [
        { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] },
        { model: Usuario, as: 'captador', attributes: ['id', 'nombre_completo'] },
      ],
      order: [['createdAt', 'DESC']],
    });

    res.json(leads);
  } catch (error: any) {
    console.error('Error al obtener leads:', error);
    // Intentar escribir a un archivo que SI podamos leer (UTF-8)
    try {
      require('fs').appendFileSync('C:/Users/User/Desktop/vidrios-templex-system/backend-api/debug_error.txt', 
        `[${new Date().toISOString()}] GET_LEADS_ERROR: ${error.message}\n${error.stack}\n\n`, 'utf8');
    } catch (fsErr) {}
    
    res.status(500).json({ 
      error: 'Error del servidor al obtener leads',
      details: error.message 
    });
  }
};

export const getCRMStats = async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { mes, anio } = req.query;
    const esGlobal = ['admin', 'gerencia', 'root', 'asistente_administrativo', 'marketing'].includes(user.rol?.toLowerCase());
    
    const whereBase: any = esGlobal ? {} : { asesor_id: user.id };

    // Extraer rango de fechas para reutilizar en queries de leads y ODP
    let periodStart: Date | null = null;
    let periodEnd: Date | null = null;
    if (mes && anio && mes !== 'undefined' && anio !== 'undefined') {
      const month = parseInt(mes as string);
      const year = parseInt(anio as string);
      periodStart = new Date(year, month - 1, 1);
      periodEnd = new Date(year, month, 0, 23, 59, 59);
      whereBase.createdAt = { [Op.between]: [periodStart, periodEnd] };
    }

    const leads = await Lead.findAll({
      where: whereBase,
      include: [{ model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] }]
    });

    const total = leads.length;
    const porEstado: Record<string, number> = {};
    const porMotivoPerdida: Record<string, number> = {};
    const porFuente: Record<string, number> = {};
    const porSegmento: Record<string, { total: number, aprobados: number, monto: number }> = {};
    const porProducto: Record<string, { total: number, aprobados: number, monto: number }> = {};

    let montoTotalProyectado = 0;
    let montoTotalReal = 0;
    let montoRealAprobados = 0;
    let sumaDiasCierre = 0;
    let cerradosConFecha = 0;

    // Acumuladores de tiempo entre etapas (ms)
    const tiempos: any = {
      nuevo_a_asignado: { suma: 0, conta: 0 },
      asignado_a_contacto: { suma: 0, conta: 0 },
      contacto_a_cotizando: { suma: 0, conta: 0 },
      cotizando_a_visita: { suma: 0, conta: 0 }
    };

    let convertidos = 0;
    let leadsConOdp = 0;
    let leadsAprobadosSinOdp = 0;
    leads.forEach((l: any) => {
      if (l.getDataValue('cliente_id')) convertidos++;
      if (l.getDataValue('odp_id')) leadsConOdp++;
      if (l.getDataValue('estado_crm') === 'APROBADO' && !l.getDataValue('odp_id')) leadsAprobadosSinOdp++;
    });

    // Nuevos vía CRM = leads APROBADO en el período
    const nuevosClientes = leads.filter((l: any) => l.getDataValue('estado_crm') === 'APROBADO').length;

    // Nuevos vía Prospectos = ODPs del período que tienen un Prospecto vinculado
    // Recurrentes = ODPs del período sin Prospecto (creación directa, clientes existentes)
    let nuevosProspectos = 0;
    let clientesRecurrentes = 0;
    if (periodStart && periodEnd) {
      const whereODP = { fecha_creacion: { [Op.between]: [periodStart, periodEnd] } };
      const [odpsConProspecto, totalOdps] = await Promise.all([
        ODP.count({
          where: whereODP,
          include: [{ model: Prospecto, as: 'prospecto', required: true }],
        }),
        ODP.count({ where: whereODP }),
      ]);
      nuevosProspectos = odpsConProspecto;
      clientesRecurrentes = Math.max(0, totalOdps - odpsConProspecto);
    }

    leads.forEach((l: any) => {
      const estado = l.getDataValue('estado_crm');
      const montoProy = parseFloat(l.getDataValue('monto_proyectado_cotizacion') || '0');
      const montoReal = parseFloat(l.getDataValue('monto_real_venta') || '0');
      const segmento = l.getDataValue('segmento') || 'Sin Segmento';
      const fuente = l.getDataValue('fuente_lead') || 'Presencial';
      const producto = l.getDataValue('producto_interes') || 'Sin Definir';
      const creado = new Date(l.getDataValue('createdAt'));
      const cierre = l.getDataValue('fecha_cierre') ? new Date(l.getDataValue('fecha_cierre')) : null;

      porEstado[estado] = (porEstado[estado] || 0) + 1;
      porFuente[fuente] = (porFuente[fuente] || 0) + 1;
      montoTotalProyectado += montoProy;
      montoTotalReal += montoReal;
      if (estado === 'APROBADO') montoRealAprobados += montoReal;

      // Desglose por motivo de pérdida
      if (estado === 'PERDIDO' && l.getDataValue('motivo_perdida')) {
        const motivo = l.getDataValue('motivo_perdida');
        porMotivoPerdida[motivo] = (porMotivoPerdida[motivo] || 0) + 1;
      }

      // Calculo de tiempos entre etapas
      const fAsignado = l.getDataValue('fecha_asignado');
      const fContacto = l.getDataValue('fecha_en_contacto');
      const fCotizando = l.getDataValue('fecha_cotizando');
      const fVisita = l.getDataValue('fecha_visita_tecnica');

      if (fAsignado) {
        tiempos.nuevo_a_asignado.suma += new Date(fAsignado).getTime() - creado.getTime();
        tiempos.nuevo_a_asignado.conta++;
        
        if (fContacto) {
          tiempos.asignado_a_contacto.suma += new Date(fContacto).getTime() - new Date(fAsignado).getTime();
          tiempos.asignado_a_contacto.conta++;

          if (fCotizando) {
            tiempos.contacto_a_cotizando.suma += new Date(fCotizando).getTime() - new Date(fContacto).getTime();
            tiempos.contacto_a_cotizando.conta++;

            if (fVisita) {
              tiempos.cotizando_a_visita.suma += new Date(fVisita).getTime() - new Date(fCotizando).getTime();
              tiempos.cotizando_a_visita.conta++;
            }
          }
        }
      }

      // Desglose por segmento
      if (!porSegmento[segmento]) porSegmento[segmento] = { total: 0, aprobados: 0, monto: 0 };
      porSegmento[segmento].total++;
      porSegmento[segmento].monto += montoProy;
      if (estado === 'APROBADO') porSegmento[segmento].aprobados++;

      // Desglose por producto
      if (!porProducto[producto]) porProducto[producto] = { total: 0, aprobados: 0, monto: 0 };
      porProducto[producto].total++;
      porProducto[producto].monto += montoProy;
      if (estado === 'APROBADO') porProducto[producto].aprobados++;

      // Tiempo de cierre
      if (estado === 'APROBADO' && cierre) {
        const difMs = cierre.getTime() - creado.getTime();
        sumaDiasCierre += difMs / (1000 * 60 * 60 * 24);
        cerradosConFecha++;
      }
    });

    const msToHours = (ms: number) => Math.round(ms / (1000 * 60 * 60));

    const aprobados = porEstado['APROBADO'] || 0;
    const statsPorAsesor: any[] = [];
    if (esGlobal) {
      const asesores = await Usuario.findAll({
        where: { rol: { [Op.or]: ['asesor_comercial', 'admin', 'gerencia', 'jefe_produccion'] } },
        attributes: ['id', 'nombre_completo']
      });
      
      for (const asesor of asesores) {
        const asesorId = asesor.getDataValue('id');
        const leadsAsesor = leads.filter((l: any) => l.getDataValue('asesor_id') === asesorId);
        const aprobadosAsesor = leadsAsesor.filter((l: any) => l.getDataValue('estado_crm') === 'APROBADO').length;
        
        if (leadsAsesor.length > 0) {
          const porEstadoAsesor: Record<string, number> = {};
          leadsAsesor.forEach((l: any) => {
            const e = l.getDataValue('estado_crm');
            porEstadoAsesor[e] = (porEstadoAsesor[e] || 0) + 1;
          });
          const etapaCuello = Object.entries(porEstadoAsesor)
            .filter(([e]) => !['APROBADO','PERDIDO','FRIO'].includes(e))
            .sort(([, a], [, b]) => b - a)[0]?.[0] || null;

          statsPorAsesor.push({
            id: asesorId,
            nombre: asesor.getDataValue('nombre_completo'),
            total: leadsAsesor.length,
            aprobados: aprobadosAsesor,
            perdidos: leadsAsesor.filter((l: any) => l.getDataValue('estado_crm') === 'PERDIDO').length,
            tasa_conversion: leadsAsesor.length > 0 ? Math.round((aprobadosAsesor / leadsAsesor.length) * 100) : 0,
            monto_gestionado: leadsAsesor.reduce((s: number, l: any) => s + parseFloat(l.getDataValue('monto_proyectado_cotizacion') || '0'), 0),
            por_estado: porEstadoAsesor,
            etapa_cuello: etapaCuello,
          });
        }
      }
    }

    res.json({
      total,
      por_estado: porEstado,
      por_fuente: porFuente,
      por_motivo_perdida: porMotivoPerdida,
      por_segmento: porSegmento,
      por_producto: porProducto,
      monto_total_proyectado: montoTotalProyectado,
      monto_total_real: montoTotalReal,
      monto_real_aprobados: montoRealAprobados,
      ticket_promedio_proyectado: total > 0 ? (montoTotalProyectado / total) : 0,
      tasa_conversion: total > 0 ? Math.round((aprobados / total) * 100) : 0,
      tiempos_promedio_horas: {
        asignacion: tiempos.nuevo_a_asignado.conta > 0 ? msToHours(Math.max(0, tiempos.nuevo_a_asignado.suma / tiempos.nuevo_a_asignado.conta)) : 0,
        contacto: tiempos.asignado_a_contacto.conta > 0 ? msToHours(Math.max(0, tiempos.asignado_a_contacto.suma / tiempos.asignado_a_contacto.conta)) : 0,
        cotizacion: tiempos.contacto_a_cotizando.conta > 0 ? msToHours(Math.max(0, tiempos.contacto_a_cotizando.suma / tiempos.contacto_a_cotizando.conta)) : 0,
        visita: tiempos.cotizando_a_visita.conta > 0 ? msToHours(Math.max(0, tiempos.cotizando_a_visita.suma / tiempos.cotizando_a_visita.conta)) : 0
      },
      convertidos_a_cliente: convertidos,
      nuevos_clientes: nuevosClientes,
      nuevos_prospectos: nuevosProspectos,
      clientes_recurrentes: clientesRecurrentes,
      leads_con_odp: leadsConOdp,
      leads_aprobados_sin_odp: leadsAprobadosSinOdp,
      tiempo_promedio_cierre_dias: cerradosConFecha > 0 ? Math.round(sumaDiasCierre / cerradosConFecha) : 0,
      stats_por_asesor: statsPorAsesor.sort((a,b) => b.tasa_conversion - a.tasa_conversion),
    });
  } catch (error: any) {
    console.error('Error en stats CRM:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

export const updateLeadDetails = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = req.user!;
    const {
      monto_proyectado_cotizacion,
      segmento,
      producto_interes,
      nombre,
      telefono,
      descripcion_contexto,
      fuente_lead,
    } = req.body;

    const lead = await Lead.findByPk(id);
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado' });

    const updates: any = {};
    if (monto_proyectado_cotizacion !== undefined) updates.monto_proyectado_cotizacion = parseFloat(monto_proyectado_cotizacion);
    if (segmento !== undefined) updates.segmento = segmento;
    if (producto_interes !== undefined) updates.producto_interes = producto_interes;
    if (nombre !== undefined) updates.nombre = nombre;
    if (telefono !== undefined) updates.telefono = telefono;
    if (descripcion_contexto !== undefined) updates.descripcion_contexto = descripcion_contexto;
    if (fuente_lead !== undefined) updates.fuente_lead = fuente_lead;

    await lead.update(updates);

    await LeadEvento.create({
      tipo: 'SEGUIMIENTO',
      detalle_texto: `Información del prospecto actualizada por el usuario.`,
      lead_id: lead.getDataValue('id'),
      creado_por: user.id
    });

    res.json(lead);
  } catch (error: any) {
    console.error('Error al actualizar detalles lead:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

// Recuperar lead de "Sin Respuesta" → Bolsa Común (NUEVO, sin asesor)
export const recuperarLead = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = req.user!;

    const lead = await Lead.findByPk(id);
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado' });

    await lead.update({
      estado_crm: 'NUEVO',
      asesor_id: null,
      fecha_asignado: null,
      respondio: 'Espera de información',
    });

    await LeadEvento.create({
      tipo: 'CAMBIO_ESTADO',
      detalle_texto: `Lead recuperado desde "Sin Respuesta" y devuelto a Bolsa Común.`,
      lead_id: lead.getDataValue('id'),
      creado_por: user.id,
    });

    const leadActualizado = await Lead.findByPk(id, {
      include: [{ model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] }],
    });

    import('../server').then(({ emitirCambio }) => emitirCambio('crm')).catch(() => {});
    res.json(leadActualizado);
  } catch (error: any) {
    console.error('Error al recuperar lead:', error);
    res.status(500).json({ error: 'Error del servidor al recuperar lead' });
  }
};

// Buscar ODPs para vincular a un lead aprobado
export const searchODPsForLead = async (req: Request, res: Response) => {
  try {
    const { q, cliente_id } = req.query;

    const where: any = {};
    if (q) {
      where.numero_odp = { [Op.iLike]: `%${q}%` };
    }
    if (cliente_id) {
      where.cliente_id = parseInt(cliente_id as string);
    }

    const odps = await ODP.findAll({
      where,
      include: [{ model: Cliente, as: 'cliente', attributes: ['id', 'nombre_razon_social'] }],
      attributes: ['id', 'numero_odp', 'estado_produccion', 'fecha_creacion', 'cliente_id'],
      order: [['fecha_creacion', 'DESC']],
      limit: 10,
    });

    res.json(odps);
  } catch (error: any) {
    console.error('Error al buscar ODPs:', error);
    res.status(500).json({ error: 'Error del servidor al buscar ODPs' });
  }
};

// Reporte mensual de actividad por asesor
export const getReporteAsesor = async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { mes, anio, asesor_id } = req.query;
    const esAdmin = ['admin', 'gerencia', 'root', 'jefe_produccion', 'asistente_administrativo'].includes(user.rol?.toLowerCase());
    // null = vista global (solo para admins sin asesor específico seleccionado)
    const asesorIdTarget: number | null = asesor_id
      ? parseInt(asesor_id as string)
      : esAdmin ? null : user.id;

    const whereBase: any = asesorIdTarget ? { asesor_id: asesorIdTarget } : {};
    if (mes && anio && mes !== 'undefined' && anio !== 'undefined') {
      const month = parseInt(mes as string);
      const year  = parseInt(anio as string);
      whereBase.createdAt = { [Op.between]: [new Date(year, month - 1, 1), new Date(year, month, 0, 23, 59, 59)] };
    }

    const leads = await Lead.findAll({ where: whereBase });
    const leadIds = leads.map((l: any) => l.getDataValue('id'));
    const eventos = leadIds.length > 0
      ? await LeadEvento.findAll({ where: { lead_id: { [Op.in]: leadIds } } })
      : [];

    const total     = leads.length;
    const aprobados = leads.filter((l: any) => l.getDataValue('estado_crm') === 'APROBADO').length;
    const perdidos  = leads.filter((l: any) => l.getDataValue('estado_crm') === 'PERDIDO').length;
    const frios     = leads.filter((l: any) => l.getDataValue('estado_crm') === 'FRIO').length;
    const activos   = total - aprobados - perdidos - frios;

    const contactos    = eventos.filter((e: any) => e.getDataValue('tipo') === 'COMUNICACION').length;
    const seguimientos = eventos.filter((e: any) => e.getDataValue('tipo') === 'SEGUIMIENTO').length;
    const cambiosEstado = eventos.filter((e: any) => e.getDataValue('tipo') === 'CAMBIO_ESTADO').length;

    // Tiempo promedio primera respuesta (creación → primer evento del lead)
    let sumaRespuesta = 0, countRespuesta = 0;
    leads.forEach((l: any) => {
      const creacion = new Date(l.getDataValue('createdAt')).getTime();
      const eventosLead = eventos
        .filter((e: any) => e.getDataValue('lead_id') === l.getDataValue('id'))
        .sort((a: any, b: any) => new Date(a.getDataValue('createdAt')).getTime() - new Date(b.getDataValue('createdAt')).getTime());
      if (eventosLead.length > 0) {
        const diff = new Date(eventosLead[0].getDataValue('createdAt')).getTime() - creacion;
        if (diff >= 0) { sumaRespuesta += diff; countRespuesta++; }
      }
    });
    const tiempoRespuestaH = countRespuesta > 0
      ? Math.round((sumaRespuesta / countRespuesta / (1000 * 60 * 60)) * 10) / 10
      : 0;

    const leadsPorEtapa: Record<string, number> = {};
    const motivosPerdida: Record<string, number> = {};
    leads.forEach((l: any) => {
      const e = l.getDataValue('estado_crm');
      leadsPorEtapa[e] = (leadsPorEtapa[e] || 0) + 1;
      if (e === 'PERDIDO' && l.getDataValue('motivo_perdida')) {
        const m = l.getDataValue('motivo_perdida');
        motivosPerdida[m] = (motivosPerdida[m] || 0) + 1;
      }
    });
    const etapaCuello = Object.entries(leadsPorEtapa)
      .filter(([e]) => !['APROBADO', 'PERDIDO', 'FRIO'].includes(e))
      .sort(([, a], [, b]) => b - a)[0]?.[0] || null;

    const montoGestionado = leads.reduce((s: number, l: any) => s + parseFloat(l.getDataValue('monto_proyectado_cotizacion') || '0'), 0);
    const asesor = asesorIdTarget
      ? await Usuario.findByPk(asesorIdTarget, { attributes: ['id', 'nombre_completo'] })
      : null;

    res.json({
      asesor: asesor?.getDataValue('nombre_completo') || (esAdmin && !asesorIdTarget ? 'Todos los asesores' : 'Desconocido'),
      asesor_id: asesorIdTarget,
      leads_asignados: total,
      contactos_realizados: contactos,
      seguimientos,
      cambios_estado: cambiosEstado,
      tiempo_prom_primera_respuesta_h: tiempoRespuestaH,
      leads_por_etapa: leadsPorEtapa,
      etapa_cuello: etapaCuello,
      leads_aprobados: aprobados,
      leads_perdidos: perdidos,
      leads_activos: activos,
      tasa_conversion: total > 0 ? Math.round((aprobados / total) * 100) : 0,
      motivos_perdida: motivosPerdida,
      monto_gestionado: montoGestionado,
    });
  } catch (error: any) {
    console.error('Error en reporte asesor:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

// Estadísticas de Prospectos para el módulo CRM
export const getStatsProspectos = async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { mes, anio } = req.query;
    const esGlobal = ['admin', 'gerencia', 'root', 'asistente_administrativo', 'marketing', 'jefe_produccion'].includes(user.rol?.toLowerCase());

    const whereBase: any = esGlobal ? {} : { asesor_id: user.id };
    if (mes && anio && mes !== 'undefined' && anio !== 'undefined') {
      const month = parseInt(mes as string);
      const year  = parseInt(anio as string);
      whereBase.fecha_creacion = { [Op.between]: [new Date(year, month - 1, 1), new Date(year, month, 0, 23, 59, 59)] };
    }

    const prospectos = await Prospecto.findAll({
      where: whereBase,
      include: [{ model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] }],
    });

    const prospectosIds = prospectos.map((p: any) => p.getDataValue('id'));
    const tomasMedidas = prospectosIds.length > 0
      ? await TomaMedidas.findAll({ where: { prospecto_id: { [Op.in]: prospectosIds } } })
      : [];

    const total       = prospectos.length;
    const activos     = prospectos.filter((p: any) => p.getDataValue('estado') === 'en_gestion').length;
    const aprobados   = prospectos.filter((p: any) => p.getDataValue('estado') === 'aprobado').length;
    const noAprobados = prospectos.filter((p: any) => p.getDataValue('estado') === 'no_aprobado').length;
    const convertidosODP = prospectos.filter((p: any) => p.getDataValue('odp_id')).length;

    const tmPorProspecto: Record<number, any[]> = {};
    tomasMedidas.forEach((tm: any) => {
      const pid = tm.getDataValue('prospecto_id');
      if (pid) { if (!tmPorProspecto[pid]) tmPorProspecto[pid] = []; tmPorProspecto[pid].push(tm); }
    });

    const conTM = prospectos.filter((p: any) => (tmPorProspecto[p.getDataValue('id')] || []).length > 0).length;
    const sinTM = prospectos.filter((p: any) =>
      p.getDataValue('estado') === 'en_gestion' &&
      (tmPorProspecto[p.getDataValue('id')] || []).length === 0
    ).length;

    const SIETE_DIAS = 7 * 24 * 60 * 60 * 1000;
    const ahora = Date.now();
    const sinActividad7d = prospectos.filter((p: any) => {
      if (p.getDataValue('estado') !== 'en_gestion') return false;
      const tms = tmPorProspecto[p.getDataValue('id')] || [];
      if (tms.length > 0) {
        const ultima = tms.sort((a: any, b: any) =>
          new Date(b.getDataValue('updatedAt') || 0).getTime() - new Date(a.getDataValue('updatedAt') || 0).getTime()
        )[0];
        if ((ahora - new Date(ultima.getDataValue('updatedAt') || 0).getTime()) < SIETE_DIAS) return false;
      }
      const fc = p.getDataValue('fecha_creacion');
      return fc && (ahora - new Date(fc).getTime()) >= SIETE_DIAS;
    }).length;

    let sumaAprobacion = 0, countAprobacion = 0;
    prospectos.forEach((p: any) => {
      if (p.getDataValue('estado') === 'aprobado' && p.getDataValue('fecha_gestion') && p.getDataValue('fecha_creacion')) {
        const diff = new Date(p.getDataValue('fecha_gestion')).getTime() - new Date(p.getDataValue('fecha_creacion')).getTime();
        if (diff >= 0) { sumaAprobacion += diff / (1000 * 60 * 60 * 24); countAprobacion++; }
      }
    });

    const asesorMap: Record<number, { nombre: string; total: number; aprobados: number }> = {};
    prospectos.forEach((p: any) => {
      const aid = p.getDataValue('asesor_id');
      if (!aid) return;
      const nombre = p.getDataValue('asesor')?.nombre_completo || `Asesor ${aid}`;
      if (!asesorMap[aid]) asesorMap[aid] = { nombre, total: 0, aprobados: 0 };
      asesorMap[aid].total++;
      if (p.getDataValue('estado') === 'aprobado') asesorMap[aid].aprobados++;
    });

    res.json({
      total,
      activos,
      aprobados,
      no_aprobados: noAprobados,
      tasa_conversion: total > 0 ? Math.round((aprobados / total) * 100) : 0,
      tiempo_prom_aprobacion_dias: countAprobacion > 0 ? Math.round(sumaAprobacion / countAprobacion) : 0,
      con_tm: conTM,
      sin_tm: sinTM,
      sin_actividad_7d: sinActividad7d,
      por_asesor: Object.entries(asesorMap).map(([id, d]) => ({
        id: parseInt(id), nombre: d.nombre, total: d.total, aprobados: d.aprobados,
        tasa: d.total > 0 ? Math.round((d.aprobados / d.total) * 100) : 0,
      })).sort((a, b) => b.tasa - a.tasa),
      embudo: { creados: total, con_tm: conTM, aprobados, convertidos_odp: convertidosODP },
    });
  } catch (error: any) {
    console.error('Error en stats prospectos:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

// Crear una ODP mínima desde un lead APROBADO y vincularla automáticamente
export const crearODPDesdeLead = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = req.user!;
    const { cliente_id, nombre, telefono } = req.body;

    const lead = await Lead.findByPk(id);
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado' });
    if (lead.getDataValue('estado_crm') !== 'APROBADO') {
      return res.status(400).json({ error: 'Solo se puede crear ODP para leads en estado APROBADO' });
    }
    if (lead.getDataValue('odp_id')) {
      return res.status(409).json({ error: 'Este lead ya tiene una ODP vinculada' });
    }

    // Resolver cliente_id
    let clienteIdFinal: number;
    if (cliente_id) {
      const clienteExist = await Cliente.findByPk(cliente_id);
      if (!clienteExist) return res.status(404).json({ error: 'Cliente no encontrado' });
      clienteIdFinal = cliente_id;
    } else if (telefono) {
      // Buscar por teléfono para evitar duplicados
      const porTelefono = await Cliente.findOne({ where: { [Op.or]: [{ telefono }, { celular: telefono }] } });
      if (porTelefono) {
        clienteIdFinal = porTelefono.getDataValue('id');
      } else {
        const nuevo = await Cliente.create({
          nombre_razon_social: nombre || lead.getDataValue('nombre') || 'Sin nombre',
          tipo_documento: 'C.C',
          numero_documento: `LEAD-${id}`,
          telefono: telefono || null,
          celular: telefono || null,
          condicion_pago: 'CONTADO',
          creado_por: user.id,
        });
        clienteIdFinal = nuevo.getDataValue('id');
      }
    } else {
      return res.status(400).json({ error: 'Se requiere cliente_id o teléfono para crear la ODP' });
    }

    // Generar número ODP consecutivo
    const lastODP = await ODP.findOne({
      where: { numero_odp: { [Op.like]: 'ODP-%' } },
      order: [['numero_odp', 'DESC']],
      attributes: ['numero_odp'],
    });
    let next = 1;
    if (lastODP) {
      const parts = lastODP.getDataValue('numero_odp').split('-');
      next = parseInt(parts[parts.length - 1]) + 1;
    }
    const numero_odp = `ODP-${String(next).padStart(4, '0')}`;

    const odp = await ODP.create({
      numero_odp,
      cliente_id: clienteIdFinal,
      asesor_id: lead.getDataValue('asesor_id') || user.id,
      estado_produccion: 'EN_ESPERA',
      estado_facturacion: 'PENDIENTE',
      estado_caja: 'PENDIENTE',
      fecha_creacion: new Date().toISOString().split('T')[0],
      descripcion_pedido: lead.getDataValue('descripcion_contexto') || lead.getDataValue('producto_interes') || `Lead CRM #${id}`,
      tipo_servicio: lead.getDataValue('producto_interes') || null,
      valor_total: parseFloat(lead.getDataValue('monto_real_venta') || lead.getDataValue('monto_proyectado_cotizacion') || '0'),
      forma_pago: 'CONTADO',
    } as any);

    await lead.update({ odp_id: odp.getDataValue('id') });

    await LeadEvento.create({
      tipo: 'SEGUIMIENTO',
      detalle_texto: `ODP ${numero_odp} creada y vinculada automáticamente desde Lead CRM.`,
      lead_id: lead.getDataValue('id'),
      creado_por: user.id,
    });

    const leadActualizado = await Lead.findByPk(id, {
      include: [
        { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] },
        { model: ODP, as: 'odp', attributes: ['id', 'numero_odp', 'estado_produccion'] },
      ],
    });

    import('../server').then(({ emitirCambio }) => emitirCambio('crm')).catch(() => {});
    res.status(201).json({ lead: leadActualizado, odp_id: odp.getDataValue('id'), numero_odp });
  } catch (error: any) {
    console.error('Error al crear ODP desde lead:', error);
    res.status(500).json({ error: 'Error del servidor al crear ODP' });
  }
};

// Vincular un lead aprobado a una ODP existente
export const vincularODPAlLead = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { odp_id } = req.body;
    const user = req.user!;

    const lead = await Lead.findByPk(id);
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado' });
    if (lead.getDataValue('estado_crm') !== 'APROBADO') {
      return res.status(400).json({ error: 'Solo se pueden vincular leads en estado APROBADO' });
    }

    if (odp_id) {
      const odp = await ODP.findByPk(odp_id);
      if (!odp) return res.status(404).json({ error: 'ODP no encontrada' });
    }

    await lead.update({ odp_id: odp_id || null });

    await LeadEvento.create({
      tipo: 'SEGUIMIENTO',
      detalle_texto: odp_id
        ? `Lead vinculado a ODP #${odp_id}.`
        : `Vínculo con ODP eliminado.`,
      lead_id: lead.getDataValue('id'),
      creado_por: user.id,
    });

    const leadActualizado = await Lead.findByPk(id, {
      include: [
        { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] },
        { model: ODP, as: 'odp', attributes: ['id', 'numero_odp', 'estado_produccion'] },
      ],
    });

    import('../server').then(({ emitirCambio }) => emitirCambio('crm')).catch(() => {});
    res.json(leadActualizado);
  } catch (error: any) {
    console.error('Error al vincular ODP al lead:', error);
    res.status(500).json({ error: 'Error del servidor al vincular ODP' });
  }
};

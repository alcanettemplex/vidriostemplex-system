import { Request, Response } from 'express';
import { Op } from 'sequelize';
import ExcelJS from 'exceljs';
import sequelize from '../config/database';
import {
  Lead, LeadEvento, LeadImagen, Usuario, Cliente, Prospecto, TomaMedidas,
  SupervisionLineamiento, SupervisionLineamientoItem, FacturaAdicionalODP,
  ConfiguracionGlobal,
} from '../models';
import ODP from '../models/odp.model';
import { v2 as cloudinary } from 'cloudinary';
import '../config/upload'; // garantiza que cloudinary está configurado
import { diasDesde, calcularAccionSugerida, FECHA_POR_ESTADO, hoyBogotaISO } from '../utils/crmSupervision';
import { withUniqueRetry } from '../utils/withUniqueRetry';
import { generarNumeroODP } from '../utils/generarNumeroODP';



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
    if (nuevo_estado === 'EN_CONTACTO' || nuevo_estado === 'COTIZANDO' || nuevo_estado === 'SEGUIMIENTO' || nuevo_estado === 'VISITA_TECNICA') {
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
      'SEGUIMIENTO':    'fecha_seguimiento',
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
      fuente: req.body.fuente || lead.getDataValue('fuente_lead') || null,
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
    const { fecha_desde, fecha_hasta, vista } = req.query;
    const esSinRespuesta = vista === 'sin_respuesta';
    const esPipeline = vista === 'pipeline';
    const esAdminOGerencia = ['admin', 'gerencia', 'root', 'asistente_administrativo', 'marketing', 'jefe_produccion'].includes(user.rol?.toLowerCase());

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

    // Filtro por rango de fechas (máx 4 meses)
    if (fecha_desde && fecha_hasta) {
      const start = new Date(fecha_desde as string);
      const end = new Date(fecha_hasta as string);
      end.setHours(23, 59, 59, 999);

      const diffMeses = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
      if (diffMeses > 4) {
        return res.status(400).json({
          error: 'Rango demasiado amplio',
          mensaje: 'El período máximo permitido es de 4 meses.'
        });
      }

      const filtroFecha = { [Op.between]: [start, end] };

      if (esPipeline) {
        // Pipeline: las etapas en gestión activa (NUEVO→VISITA_TECNICA) se muestran
        // siempre completas (un lead recuperado o reasignado no debe desaparecer solo
        // porque su actividad quedó fuera del mes). PERDIDO, FRIO y APROBADO son
        // estados terminales/cerrados: se acotan al período por su ÚLTIMA ACTIVIDAD
        // (columna denormalizada leads.ultima_actividad, fallback a createdAt) para no
        // acumular el histórico completo en cada carga del tablero.
        const ultimaActividad = sequelize.literal(`COALESCE("Lead"."ultima_actividad", "Lead"."createdAt")`);
        whereClause[Op.and] = [
          { [Op.or]: [
            { estado_crm: { [Op.notIn]: ['PERDIDO', 'FRIO', 'APROBADO'] } },
            sequelize.where(ultimaActividad, Op.between, [start, end]),
          ] },
        ];
      } else {
        whereClause.createdAt = filtroFecha;
      }
    }

    const leads = await Lead.findAll({
      where: whereClause,
      // ultima_actividad ya es columna del modelo (mantenida por hook); se incluye por defecto.
      include: [
        { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] },
        { model: Usuario, as: 'captador', attributes: ['id', 'nombre_completo'] },
        { model: ODP, as: 'odp', attributes: ['id', 'numero_odp'] },
      ],
      order: [['ultima_actividad', 'DESC']],
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
    const { fecha_desde, fecha_hasta } = req.query;
    const esGlobal = ['admin', 'gerencia', 'root', 'asistente_administrativo', 'marketing', 'jefe_produccion'].includes(user.rol?.toLowerCase());

    // Excluye leads "Sin Respuesta": nunca hubo interacción real, contarlos infla el
    // denominador y deprime artificialmente la tasa de conversión reportada.
    const whereBase: any = esGlobal
      ? { respondio: { [Op.ne]: 'No responde' } }
      : { asesor_id: user.id, respondio: { [Op.ne]: 'No responde' } };

    // Extraer rango de fechas para reutilizar en queries de leads y ODP
    let periodStart: Date | null = null;
    let periodEnd: Date | null = null;
    if (fecha_desde && fecha_hasta) {
      periodStart = new Date(fecha_desde as string);
      periodEnd = new Date(fecha_hasta as string);
      periodEnd.setHours(23, 59, 59, 999);

      const diffMeses = (periodEnd.getFullYear() - periodStart.getFullYear()) * 12 + (periodEnd.getMonth() - periodStart.getMonth());
      if (diffMeses > 4) {
        return res.status(400).json({
          error: 'Rango demasiado amplio',
          mensaje: 'El período máximo permitido es de 4 meses.'
        });
      }

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
    let montoNuevosProspectos = 0;
    let montoClientesRecurrentes = 0;
    let nuevosCRM = 0;            // ODPs del período originadas en un lead (vía CRM)
    let montoNuevosCRM = 0;
    let negociosPorFuente: { fuente: string; count: number; monto: number }[] = [];
    if (periodStart && periodEnd) {
      const whereODP = { fecha_creacion: { [Op.between]: [periodStart, periodEnd] } };
      // Un negocio que nació como lead en el CRM se acredita a la vía CRM (nuevos_clientes,
      // vía leads APROBADO), aunque haya usado el sub-flujo de visita técnica (prospecto).
      // Por eso las ODPs con lead vinculado se EXCLUYEN de nuevos_prospectos y de recurrentes:
      // así el mismo negocio no se cuenta dos veces en "Clientes captados".
      const SUBQ_ODPS_CON_LEAD = '(SELECT odp_id FROM leads WHERE odp_id IS NOT NULL)';
      const [odpsConProspectoData, totalOdpsData, odpsConLeadData] = await Promise.all([
        ODP.findAll({
          attributes: [
            [sequelize.fn('COUNT', sequelize.col('ODP.id')), 'count'],
            [sequelize.fn('SUM', sequelize.col('valor_total')), 'monto'],
          ],
          where: {
            ...whereODP,
            [Op.and]: [sequelize.literal(`"ODP"."id" NOT IN ${SUBQ_ODPS_CON_LEAD}`)],
          },
          include: [{ model: Prospecto, as: 'prospecto', required: true, attributes: [] }],
          raw: true,
        }),
        ODP.findAll({
          attributes: [
            [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
            [sequelize.fn('SUM', sequelize.col('valor_total')), 'monto'],
          ],
          where: whereODP,
          raw: true,
        }),
        ODP.findAll({
          attributes: [
            [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
            [sequelize.fn('SUM', sequelize.col('valor_total')), 'monto'],
          ],
          where: {
            ...whereODP,
            [Op.and]: [sequelize.literal(`id IN ${SUBQ_ODPS_CON_LEAD}`)],
          },
          raw: true,
        }),
      ]);
      const rowCon = (odpsConProspectoData[0] as any) ?? {};
      const rowTotal = (totalOdpsData[0] as any) ?? {};
      const rowLead = (odpsConLeadData[0] as any) ?? {};
      nuevosProspectos = parseInt(rowCon.count ?? '0', 10);
      montoNuevosProspectos = parseFloat(rowCon.monto ?? '0');
      const totalCount = parseInt(rowTotal.count ?? '0', 10);
      const totalMonto = parseFloat(rowTotal.monto ?? '0');
      nuevosCRM = parseInt(rowLead.count ?? '0', 10);
      montoNuevosCRM = parseFloat(rowLead.monto ?? '0');
      // Recurrentes = ODPs directas: ni prospecto puro ni lead detrás.
      clientesRecurrentes = Math.max(0, totalCount - nuevosProspectos - nuevosCRM);
      montoClientesRecurrentes = Math.max(0, totalMonto - montoNuevosProspectos - montoNuevosCRM);

      // Distribución por fuente: ODPs (negocios) del período según la fuente de su cliente.
      // LEFT JOIN para no perder ninguna ODP → la suma cuadra con el total de ODPs del período.
      const fuenteRows = await ODP.findAll({
        attributes: [
          [sequelize.col('cliente.fuente'), 'fuente'],
          [sequelize.fn('COUNT', sequelize.col('ODP.id')), 'count'],
          [sequelize.fn('SUM', sequelize.col('valor_total')), 'monto'],
        ],
        where: whereODP,
        include: [{ model: Cliente, as: 'cliente', attributes: [], required: false }],
        group: ['cliente.fuente'],
        raw: true,
      });
      negociosPorFuente = (fuenteRows as any[])
        .map((r: any) => ({ fuente: r.fuente || 'Sin especificar', count: parseInt(r.count ?? '0', 10), monto: parseFloat(r.monto ?? '0') }))
        .filter((x) => x.count > 0)
        .sort((a, b) => b.count - a.count);
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

    // Detalle de leads APROBADO sin ODP vinculada (ya cargados en memoria)
    const leadsAprobadosSinOdpDetalle = leads
      .filter((l: any) => l.getDataValue('estado_crm') === 'APROBADO' && !l.getDataValue('odp_id'))
      .map((l: any) => {
        const asesorData = l.getDataValue('asesor') as any;
        const fechaAprobado = l.getDataValue('fecha_aprobado');
        const diasDesdeAprobacion = fechaAprobado
          ? Math.floor((Date.now() - new Date(fechaAprobado).getTime()) / (1000 * 60 * 60 * 24))
          : null;
        return {
          id: l.getDataValue('id'),
          nombre: l.getDataValue('nombre') || 'Sin nombre',
          telefono: l.getDataValue('telefono') || '—',
          monto: parseFloat(l.getDataValue('monto_proyectado_cotizacion') || '0'),
          asesor_nombre: asesorData?.nombre_completo || 'Sin asignar',
          asesor_id: l.getDataValue('asesor_id') || null,
          dias_desde_aprobacion: diasDesdeAprobacion,
        };
      });

    // Distribución semanal de leads creados en el período
    const porSemana: { semana: string; count: number }[] = [];
    if (periodStart && periodEnd) {
      let cur = new Date(periodStart);
      let semNum = 1;
      while (cur <= periodEnd) {
        const wStart = new Date(cur);
        const wEnd = new Date(cur);
        wEnd.setDate(wEnd.getDate() + 6);
        if (wEnd > periodEnd) wEnd.setTime(periodEnd.getTime());
        const cnt = leads.filter((l: any) => {
          const d = new Date(l.getDataValue('createdAt'));
          return d >= wStart && d <= wEnd;
        }).length;
        porSemana.push({ semana: `Sem ${semNum}`, count: cnt });
        cur.setDate(cur.getDate() + 7);
        semNum++;
      }
    }

    // Comparativo vs período anterior (mes anterior al seleccionado)
    let vsAnterior: any = null;
    if (periodStart) {
      const prevStart = new Date(periodStart);
      prevStart.setMonth(prevStart.getMonth() - 1);
      const prevEnd = new Date(prevStart);
      prevEnd.setMonth(prevEnd.getMonth() + 1);
      prevEnd.setDate(0);
      prevEnd.setHours(23, 59, 59, 999);
      const prevWhere: any = esGlobal
        ? { respondio: { [Op.ne]: 'No responde' } }
        : { asesor_id: user.id, respondio: { [Op.ne]: 'No responde' } };
      prevWhere.createdAt = { [Op.between]: [prevStart, prevEnd] };
      const prevLeads = await Lead.findAll({
        where: prevWhere,
        attributes: ['estado_crm', 'monto_proyectado_cotizacion', 'monto_real_venta']
      });
      const prevTotal     = prevLeads.length;
      const prevAprobados = prevLeads.filter((l: any) => l.getDataValue('estado_crm') === 'APROBADO').length;
      const prevMontoProyectado = prevLeads.reduce((s: number, l: any) => s + parseFloat(l.getDataValue('monto_proyectado_cotizacion') || '0'), 0);
      const prevMontoReal = prevLeads
        .filter((l: any) => l.getDataValue('estado_crm') === 'APROBADO')
        .reduce((s: number, l: any) => s + parseFloat(l.getDataValue('monto_real_venta') || '0'), 0);
      vsAnterior = {
        total: prevTotal,
        tasa_conversion: prevTotal > 0 ? Math.round((prevAprobados / prevTotal) * 100) : 0,
        ticket_promedio_proyectado: prevTotal > 0 ? prevMontoProyectado / prevTotal : 0,
        monto_real_aprobados: prevMontoReal,
      };
    }

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
      nuevos_crm: nuevosCRM,
      clientes_recurrentes: clientesRecurrentes,
      monto_nuevos_clientes: montoNuevosProspectos,
      monto_nuevos_crm: montoNuevosCRM,
      monto_clientes_recurrentes: montoClientesRecurrentes,
      negocios_por_fuente: negociosPorFuente,
      leads_con_odp: leadsConOdp,
      leads_aprobados_sin_odp: leadsAprobadosSinOdp,
      tiempo_promedio_cierre_dias: cerradosConFecha > 0 ? Math.round(sumaDiasCierre / cerradosConFecha) : 0,
      stats_por_asesor: statsPorAsesor.sort((a,b) => b.tasa_conversion - a.tasa_conversion),
      por_semana: porSemana,
      vs_anterior: vsAnterior,
      leads_aprobados_sin_odp_detalle: leadsAprobadosSinOdpDetalle,
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
    const { fecha_desde, fecha_hasta, asesor_id } = req.query;
    const esAdmin = ['admin', 'gerencia', 'root', 'jefe_produccion', 'asistente_administrativo'].includes(user.rol?.toLowerCase());
    // null = vista global (solo para admins sin asesor específico seleccionado)
    const asesorIdTarget: number | null = asesor_id
      ? parseInt(asesor_id as string)
      : esAdmin ? null : user.id;

    const whereBase: any = asesorIdTarget
      ? { asesor_id: asesorIdTarget, respondio: { [Op.ne]: 'No responde' } }
      : { respondio: { [Op.ne]: 'No responde' } };
    if (fecha_desde && fecha_hasta) {
      const start = new Date(fecha_desde as string);
      const end = new Date(fecha_hasta as string);
      end.setHours(23, 59, 59, 999);

      const diffMeses = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
      if (diffMeses > 4) {
        return res.status(400).json({
          error: 'Rango demasiado amplio',
          mensaje: 'El período máximo permitido es de 4 meses.'
        });
      }

      whereBase.createdAt = { [Op.between]: [start, end] };
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
    const { fecha_desde, fecha_hasta } = req.query;
    const esGlobal = ['admin', 'gerencia', 'root', 'asistente_administrativo', 'marketing', 'jefe_produccion'].includes(user.rol?.toLowerCase());

    const whereBase: any = esGlobal ? {} : { asesor_id: user.id };
    if (fecha_desde && fecha_hasta) {
      const start = new Date(fecha_desde as string);
      const end = new Date(fecha_hasta as string);
      end.setHours(23, 59, 59, 999);

      const diffMeses = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
      if (diffMeses > 4) {
        return res.status(400).json({
          error: 'Rango demasiado amplio',
          mensaje: 'El período máximo permitido es de 4 meses.'
        });
      }

      whereBase.fecha_creacion = { [Op.between]: [start, end] };
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

    // Generar y crear la ODP con número consecutivo. withUniqueRetry: ante colisión
    // del UNIQUE numero_odp se regenera el número y se reintenta el INSERT.
    let numero_odp = '';
    const odp = await withUniqueRetry(async () => {
      numero_odp = await generarNumeroODP('ODP');
      return ODP.create({
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
    });

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

// Solicitar visita técnica desde un lead en estado VISITA_TECNICA
export const solicitarVisitaTecnica = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = req.user!;
    const { direccion, fecha_visita, nombre_contacto, telefono_contacto, observaciones } = req.body;

    if (!direccion?.trim()) {
      return res.status(400).json({ error: 'La dirección de visita es requerida' });
    }

    const lead = await Lead.findByPk(id);
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado' });
    if (lead.getDataValue('estado_crm') !== 'VISITA_TECNICA') {
      return res.status(400).json({ error: 'Solo se puede solicitar visita para leads en estado VISITA_TECNICA' });
    }
    if (lead.getDataValue('prospecto_id')) {
      return res.status(409).json({ error: 'Este lead ya tiene una visita técnica solicitada', prospecto_id: lead.getDataValue('prospecto_id') });
    }

    // Generar numero_prospecto
    const lastProspecto = await Prospecto.findOne({
      where: { numero_prospecto: { [Op.like]: 'PR-%' } },
      order: [['numero_prospecto', 'DESC']],
      attributes: ['numero_prospecto'],
    });
    let nextPR = 1;
    if (lastProspecto) {
      const parts = lastProspecto.getDataValue('numero_prospecto').split('-');
      nextPR = parseInt(parts[parts.length - 1]) + 1;
    }
    const numero_prospecto = `PR-${String(nextPR).padStart(4, '0')}`;

    const prospecto = await Prospecto.create({
      numero_prospecto,
      asesor_id: lead.getDataValue('asesor_id') || user.id,
      cliente_id: lead.getDataValue('cliente_id') || null,
      nombre_contacto: nombre_contacto || lead.getDataValue('nombre'),
      telefono_contacto: telefono_contacto || lead.getDataValue('telefono'),
      direccion: direccion.trim(),
      descripcion: lead.getDataValue('descripcion_contexto') || lead.getDataValue('producto_interes') || `Lead CRM #${id}`,
      estado: 'en_gestion',
      fecha_creacion: new Date(),
    } as any);

    // Generar numero_tm
    const lastTM = await TomaMedidas.findOne({
      where: { numero_tm: { [Op.like]: 'TM-%' } },
      order: [['numero_tm', 'DESC']],
      attributes: ['numero_tm'],
    });
    let nextTM = 1;
    if (lastTM) {
      const parts = lastTM.getDataValue('numero_tm').split('-');
      nextTM = parseInt(parts[parts.length - 1]) + 1;
    }
    const numero_tm = `TM-${String(nextTM).padStart(4, '0')}`;
    const estadoTM = fecha_visita ? 'programada' : 'solicitada';

    const tm = await TomaMedidas.create({
      numero_tm,
      prospecto_id: prospecto.getDataValue('id'),
      realizado_por: user.id,
      estado: estadoTM,
      fecha_visita: fecha_visita || null,
      direccion: direccion.trim(),
      nombre_contacto: nombre_contacto || lead.getDataValue('nombre'),
      telefono_contacto: telefono_contacto || lead.getDataValue('telefono'),
      observaciones: observaciones || null,
    } as any);

    await lead.update({ prospecto_id: prospecto.getDataValue('id') });

    await LeadEvento.create({
      tipo: 'SEGUIMIENTO',
      detalle_texto: `Visita técnica solicitada (${numero_tm}) — Prospecto ${numero_prospecto} creado. Dirección: ${direccion.trim()}`,
      lead_id: lead.getDataValue('id'),
      creado_por: user.id,
    });

    import('../server').then(({ emitirCambio }) => emitirCambio('crm')).catch(() => {});
    res.status(201).json({
      prospecto_id: prospecto.getDataValue('id'),
      numero_prospecto,
      tm_numero: numero_tm,
      estado_tm: estadoTM,
    });
  } catch (error: any) {
    console.error('Error al solicitar visita técnica:', error);
    res.status(500).json({ error: 'Error del servidor al solicitar visita técnica' });
  }
};

// ─── Imágenes del Lead ────────────────────────────────────────────────────────

// GET /api/crm/:id/imagenes
export const getLeadImagenes = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const imagenes = await LeadImagen.findAll({
      where: { lead_id: id },
      include: [{ model: Usuario, as: 'subidor', attributes: ['id', 'nombre_completo'] }],
      order: [['created_at', 'ASC']],
    });
    res.json(imagenes);
  } catch (error: any) {
    res.status(500).json({ error: 'Error al obtener imágenes del lead', detail: error.message });
  }
};

// POST /api/crm/:id/imagenes (multipart: imagen, nota?)
export const createLeadImagen = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = req.user!;
    const file = req.file as any;
    if (!file) return res.status(400).json({ error: 'Se requiere una imagen' });

    const lead = await Lead.findByPk(id);
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado' });

    const count = await LeadImagen.count({ where: { lead_id: id } });
    if (count >= 5) {
      return res.status(400).json({ error: 'El lead ya tiene el máximo de 5 imágenes permitidas' });
    }

    const { nota } = req.body;
    const imagen = await LeadImagen.create({
      lead_id: Number(id),
      url: file.path,
      public_id: file.filename,
      nota: nota || null,
      subido_por: user.id,
    });

    const completa = await LeadImagen.findByPk(imagen.getDataValue('id'), {
      include: [{ model: Usuario, as: 'subidor', attributes: ['id', 'nombre_completo'] }],
    });
    res.status(201).json(completa);
  } catch (error: any) {
    res.status(500).json({ error: 'Error al subir imagen', detail: error.message });
  }
};

// PATCH /api/crm/:id/imagenes/:imgId (editar nota)
export const updateLeadImagenNota = async (req: Request, res: Response) => {
  try {
    const { id, imgId } = req.params;
    const { nota } = req.body;
    const user = req.user!;

    const imagen = await LeadImagen.findOne({ where: { id: imgId, lead_id: id } });
    if (!imagen) return res.status(404).json({ error: 'Imagen no encontrada' });

    const esCreador = imagen.getDataValue('subido_por') === user.id;
    if (!esCreador && !['admin', 'gerencia'].includes(user.rol)) {
      return res.status(403).json({ error: 'Sin permiso para editar esta imagen' });
    }

    await imagen.update({ nota: nota ?? null });
    res.json(imagen);
  } catch (error: any) {
    res.status(500).json({ error: 'Error al actualizar nota', detail: error.message });
  }
};

// DELETE /api/crm/:id/imagenes/:imgId
export const deleteLeadImagen = async (req: Request, res: Response) => {
  try {
    const { id, imgId } = req.params;
    const user = req.user!;

    const imagen = await LeadImagen.findOne({ where: { id: imgId, lead_id: id } });
    if (!imagen) return res.status(404).json({ error: 'Imagen no encontrada' });

    const esCreador = imagen.getDataValue('subido_por') === user.id;
    if (!esCreador && !['admin', 'gerencia'].includes(user.rol)) {
      return res.status(403).json({ error: 'Sin permiso para eliminar esta imagen' });
    }

    const publicId = imagen.getDataValue('public_id');
    try { await cloudinary.uploader.destroy(publicId); } catch { /* no bloquear */ }

    await imagen.destroy();
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Error al eliminar imagen', detail: error.message });
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

// GET /api/crm/embudo — embudo de conversión etapa→etapa por asesor
export const getEmbudoAsesores = async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { fecha_desde, fecha_hasta } = req.query;

    const where: any = { asesor_id: { [Op.ne]: null } };

    if (fecha_desde && fecha_hasta) {
      const start = new Date(fecha_desde as string);
      const end = new Date(fecha_hasta as string);
      end.setHours(23, 59, 59, 999);

      const diffMeses = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
      if (diffMeses > 4) {
        return res.status(400).json({
          error: 'Rango demasiado amplio',
          mensaje: 'El período máximo permitido es de 4 meses.'
        });
      }

      where.createdAt = { [Op.between]: [start, end] };
    }

    if (user.rol === 'asesor_comercial') {
      where.asesor_id = user.id;
    }

    const leads = await Lead.findAll({
      where,
      attributes: [
        'id', 'asesor_id', 'estado_crm',
        'fecha_asignado', 'fecha_en_contacto', 'fecha_cotizando', 'fecha_seguimiento',
        'fecha_visita_tecnica', 'fecha_aprobado', 'fecha_perdido', 'fecha_frio',
      ],
      include: [{ model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] }],
      order: [['asesor_id', 'ASC']],
    });

    const mapaAsesores = new Map<number, { nombre: string; leads: any[] }>();
    for (const lead of leads) {
      const l = lead.toJSON() as any;
      if (!mapaAsesores.has(l.asesor_id)) {
        mapaAsesores.set(l.asesor_id, { nombre: l.asesor?.nombre_completo || 'Asesor', leads: [] });
      }
      mapaAsesores.get(l.asesor_id)!.leads.push(l);
    }

    // Conteo acumulativo: "llegó a etapa X" = tiene fecha_X O cualquier fecha posterior.
    // Esto evita % imposibles cuando los leads saltan etapas (ej: ASIGNADO → COTIZANDO).
    const TRAMOS = [
      {
        desde: 'ASIGNADO',
        hasta: 'EN_CONTACTO',
        camposD: ['fecha_asignado'],
        camposH: ['fecha_en_contacto', 'fecha_cotizando', 'fecha_seguimiento', 'fecha_visita_tecnica', 'fecha_aprobado'],
      },
      {
        desde: 'EN_CONTACTO',
        hasta: 'COTIZANDO',
        camposD: ['fecha_en_contacto', 'fecha_cotizando', 'fecha_seguimiento', 'fecha_visita_tecnica', 'fecha_aprobado'],
        camposH: ['fecha_cotizando', 'fecha_seguimiento', 'fecha_visita_tecnica', 'fecha_aprobado'],
      },
      {
        desde: 'COTIZANDO',
        hasta: 'SEGUIMIENTO',
        camposD: ['fecha_cotizando', 'fecha_seguimiento', 'fecha_visita_tecnica', 'fecha_aprobado'],
        camposH: ['fecha_seguimiento', 'fecha_visita_tecnica', 'fecha_aprobado'],
      },
      {
        desde: 'SEGUIMIENTO',
        hasta: 'VISITA_TECNICA',
        camposD: ['fecha_seguimiento', 'fecha_visita_tecnica', 'fecha_aprobado'],
        camposH: ['fecha_visita_tecnica', 'fecha_aprobado'],
      },
      {
        desde: 'VISITA_TECNICA',
        hasta: 'APROBADO',
        camposD: ['fecha_visita_tecnica', 'fecha_aprobado'],
        camposH: ['fecha_aprobado'],
      },
    ];

    const llego = (l: any, campos: string[]) => campos.some(c => l[c] !== null);

    const resultado = Array.from(mapaAsesores.entries()).map(([asesorId, { nombre, leads: ls }]) => {
      const totalLeads     = ls.length;
      const totalAprobados = ls.filter(l => l.fecha_aprobado !== null).length;

      const tramos = TRAMOS.map(t => {
        const leadsDesde = ls.filter(l => llego(l, t.camposD)).length;
        const leadsHasta = ls.filter(l => llego(l, t.camposH)).length;
        const pct = leadsDesde > 0 ? Math.round((leadsHasta / leadsDesde) * 100) : 0;

        // Caídas: llegaron al inicio del tramo pero no al final, y ya están cerrados
        const perdidos = ls.filter(l =>
          llego(l, t.camposD) && !llego(l, t.camposH) && l.estado_crm === 'PERDIDO'
        ).length;
        const frios = ls.filter(l =>
          llego(l, t.camposD) && !llego(l, t.camposH) && l.estado_crm === 'FRIO'
        ).length;

        return { desde: t.desde, hasta: t.hasta, leads_desde: leadsDesde, leads_hasta: leadsHasta, pct_conversion: pct, perdidos_en_etapa: perdidos, frios_en_etapa: frios };
      });

      return {
        asesor_id:       asesorId,
        asesor_nombre:   nombre,
        total_leads:     totalLeads,
        total_aprobados: totalAprobados,
        tasa_final:      totalLeads > 0 ? Math.round((totalAprobados / totalLeads) * 100) : 0,
        tramos,
      };
    }).sort((a, b) => b.tasa_final - a.tasa_final);

    const promedio_equipo = resultado.length > 0
      ? Math.round(resultado.reduce((s, a) => s + a.tasa_final, 0) / resultado.length)
      : 0;

    res.json({
      asesores: resultado.map(a => ({ ...a, vs_equipo: a.tasa_final - promedio_equipo })),
      promedio_equipo,
    });
  } catch (error: any) {
    console.error('Error en getEmbudoAsesores:', error);
    res.status(500).json({ error: 'Error del servidor al calcular embudo' });
  }
};

// GET /api/crm/:id — lead individual completo (usado por MonitorAsesores al abrir detalle)
export const getLeadById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const lead = await Lead.findByPk(id, {
      include: [
        { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo', 'rol'] },
        { model: ODP, as: 'odp', attributes: ['id', 'numero_odp', 'estado_produccion'] },
      ],
    });
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado' });
    res.json(lead);
  } catch (error: any) {
    console.error('Error al obtener lead:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

// GET /api/crm/monitor — leads activos agrupados por asesor con días en etapa
export const getMonitorAsesores = async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const ESTADOS_ACTIVOS = ['ASIGNADO', 'EN_CONTACTO', 'COTIZANDO', 'SEGUIMIENTO', 'VISITA_TECNICA'];
    const FECHA_POR_ESTADO: Record<string, string> = {
      ASIGNADO:       'fecha_asignado',
      EN_CONTACTO:    'fecha_en_contacto',
      COTIZANDO:      'fecha_cotizando',
      SEGUIMIENTO:    'fecha_seguimiento',
      VISITA_TECNICA: 'fecha_visita_tecnica',
    };

    const where: any = {
      estado_crm: { [Op.in]: ESTADOS_ACTIVOS },
      asesor_id:  { [Op.ne]: null },
    };
    // asesor_comercial solo ve sus propios leads
    if (user.rol === 'asesor_comercial') {
      where.asesor_id = user.id;
    }

    const leads = await Lead.findAll({
      where,
      attributes: [
        'id', 'nombre', 'telefono', 'producto_interes', 'estado_crm',
        'fecha_asignado', 'fecha_en_contacto', 'fecha_cotizando', 'fecha_seguimiento', 'fecha_visita_tecnica',
        'monto_proyectado_cotizacion', 'intentos_seguimiento', 'asesor_id', 'createdAt',
        'segmento', 'fuente_lead', 'descripcion_contexto', 'mensaje_entrada',
        'motivo_perdida', 'respondio',
      ],
      include: [
        { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] },
      ],
      order: [['asesor_id', 'ASC'], ['createdAt', 'ASC']],
    });

    const now = new Date();
    const mapaAsesores = new Map<number, any>();

    for (const lead of leads) {
      const l = lead.toJSON() as any;
      const campoFecha = FECHA_POR_ESTADO[l.estado_crm];
      const fechaEtapa = campoFecha ? l[campoFecha] : null;
      const diasEnEtapa = fechaEtapa
        ? Math.floor((now.getTime() - new Date(fechaEtapa).getTime()) / (1000 * 60 * 60 * 24))
        : 0;

      const leadData = {
        id: l.id,
        nombre: l.nombre,
        telefono: l.telefono,
        producto_interes: l.producto_interes,
        estado_crm: l.estado_crm,
        dias_en_etapa: Math.max(0, diasEnEtapa),
        monto_proyectado_cotizacion: l.monto_proyectado_cotizacion,
        intentos_seguimiento: l.intentos_seguimiento,
        segmento: l.segmento,
        createdAt: l.createdAt,
      };

      const asesorId = l.asesor_id;
      if (!mapaAsesores.has(asesorId)) {
        mapaAsesores.set(asesorId, {
          asesor_id: asesorId,
          asesor_nombre: l.asesor?.nombre_completo || 'Asesor',
          leads_por_etapa: {
            ASIGNADO:       [],
            EN_CONTACTO:    [],
            COTIZANDO:      [],
            SEGUIMIENTO:    [],
            VISITA_TECNICA: [],
          },
        });
      }
      mapaAsesores.get(asesorId)!.leads_por_etapa[l.estado_crm].push(leadData);
    }

    const resultado = Array.from(mapaAsesores.values()).map(asesor => {
      const todos: any[] = Object.values(asesor.leads_por_etapa).flat();
      return {
        ...asesor,
        total_activos:  todos.length,
        total_en_rojo:  todos.filter((l: any) => l.dias_en_etapa > 5).length,
        total_en_ambar: todos.filter((l: any) => l.dias_en_etapa >= 3 && l.dias_en_etapa <= 5).length,
      };
    }).sort((a, b) => a.asesor_nombre.localeCompare(b.asesor_nombre));

    res.json(resultado);
  } catch (error: any) {
    console.error('Error en getMonitorAsesores:', error);
    res.status(500).json({ error: 'Error del servidor al obtener el monitor' });
  }
};

// ─── Módulo Supervisión CRM (exclusivo rol admin) ────────────────────────────

const construirFiltroFecha = (fecha_desde: any, fecha_hasta: any) => {
  if (!fecha_desde || !fecha_hasta) return null;
  const start = new Date(fecha_desde as string);
  const end = new Date(fecha_hasta as string);
  end.setHours(23, 59, 59, 999);
  return { [Op.between]: [start, end] };
};

// Calcula el rango [inicio, fin) del período inmediatamente anterior, de la misma
// duración que [fecha_desde, fecha_hasta] — mismo patrón que dashboard.controller.ts
// (prev_odps_activas) para poder comparar deltas período-contra-período.
function calcularPeriodoAnterior(fecha_desde: any, fecha_hasta: any): { prevInicio: Date; prevFin: Date } | null {
  if (!fecha_desde || !fecha_hasta) return null;
  const inicio = new Date(fecha_desde as string);
  const fin = new Date(fecha_hasta as string);
  fin.setHours(23, 59, 59, 999);
  const periodoMs = fin.getTime() - inicio.getTime();
  const prevFin = new Date(inicio.getTime() - 1);
  const prevInicio = new Date(prevFin.getTime() - periodoMs);
  return { prevInicio, prevFin };
}

// GET /api/crm/supervision/resumen — conversión actual vs meta 20% + motivos de pérdida
// + KPIs financieros/comerciales complementarios (ciclo de venta, leads nuevos,
// meta de ODPs cerradas, facturación vs meta, % facturadas, cartera pendiente).
export const getSupervisionResumen = async (req: Request, res: Response) => {
  try {
    const { fecha_desde, fecha_hasta, asesor_id } = req.query;
    const asesorIdNum = asesor_id ? parseInt(asesor_id as string, 10) : undefined;
    const where: any = { respondio: { [Op.ne]: 'No responde' } };
    const rangoFecha = construirFiltroFecha(fecha_desde, fecha_hasta);
    if (rangoFecha) where.createdAt = rangoFecha;
    if (asesorIdNum) where.asesor_id = asesorIdNum;

    const leads = await Lead.findAll({ where, attributes: ['estado_crm', 'motivo_perdida'] });
    const total = leads.length;
    const aprobados = leads.filter((l: any) => l.getDataValue('estado_crm') === 'APROBADO').length;
    const tasaConversion = total > 0 ? Math.round((aprobados / total) * 1000) / 10 : 0;

    const motivosMap: Record<string, number> = {};
    leads
      .filter((l: any) => l.getDataValue('estado_crm') === 'PERDIDO')
      .forEach((l: any) => {
        const motivo = l.getDataValue('motivo_perdida') || 'Sin especificar';
        motivosMap[motivo] = (motivosMap[motivo] || 0) + 1;
      });
    const motivos_perdida = Object.entries(motivosMap)
      .map(([motivo, total]) => ({ motivo, total }))
      .sort((a, b) => b.total - a.total);

    // ─── KPI: Ciclo de venta promedio (días fecha_asignado → fecha_aprobado) ──
    const whereAprobados: any = {
      estado_crm: 'APROBADO',
      fecha_asignado: { [Op.ne]: null },
    };
    if (rangoFecha) whereAprobados.fecha_aprobado = rangoFecha;
    if (asesorIdNum) whereAprobados.asesor_id = asesorIdNum;
    const leadsAprobadosCiclo = await Lead.findAll({
      where: whereAprobados,
      attributes: ['fecha_asignado', 'fecha_aprobado'],
    });
    const ciclosDias = leadsAprobadosCiclo
      .map((l: any) => {
        const asignado = l.getDataValue('fecha_asignado');
        const aprobado = l.getDataValue('fecha_aprobado');
        if (!asignado || !aprobado) return null;
        return (new Date(aprobado).getTime() - new Date(asignado).getTime()) / (1000 * 60 * 60 * 24);
      })
      .filter((d): d is number => d !== null && d >= 0);
    const ciclo_venta_promedio_dias = ciclosDias.length > 0
      ? Math.round((ciclosDias.reduce((s, d) => s + d, 0) / ciclosDias.length) * 10) / 10
      : null;

    // ─── KPI: Leads nuevos del período vs período anterior ────────────────────
    const whereLeadsNuevos: any = {};
    if (rangoFecha) whereLeadsNuevos.createdAt = rangoFecha;
    if (asesorIdNum) whereLeadsNuevos.asesor_id = asesorIdNum;
    const leads_nuevos_periodo = await Lead.count({ where: whereLeadsNuevos });

    const periodoAnterior = calcularPeriodoAnterior(fecha_desde, fecha_hasta);
    let leads_nuevos_periodo_anterior = 0;
    if (periodoAnterior) {
      const whereAnterior: any = { createdAt: { [Op.between]: [periodoAnterior.prevInicio, periodoAnterior.prevFin] } };
      if (asesorIdNum) whereAnterior.asesor_id = asesorIdNum;
      leads_nuevos_periodo_anterior = await Lead.count({ where: whereAnterior });
    }
    const leads_nuevos_delta_pct = leads_nuevos_periodo_anterior > 0
      ? Math.round(((leads_nuevos_periodo - leads_nuevos_periodo_anterior) / leads_nuevos_periodo_anterior) * 100)
      : 0;

    // ─── KPI: Meta de ODPs cerradas por asesor vs real ────────────────────────
    const config = await ConfiguracionGlobal.findOne({ where: { id: 1 } });
    const metaOdpsCerradasAsesor = Number((config as any)?.meta_odps_cerradas_asesor) || 12;

    const whereCerradas: any = { estado_crm: 'APROBADO', odp_id: { [Op.ne]: null } };
    if (rangoFecha) whereCerradas.fecha_aprobado = rangoFecha;
    if (asesorIdNum) whereCerradas.asesor_id = asesorIdNum;
    const leadsCerrados = await Lead.findAll({ where: whereCerradas, attributes: ['asesor_id'] });
    const odps_cerradas_real = leadsCerrados.length;
    const asesoresConCierre = new Set(leadsCerrados.map((l: any) => l.getDataValue('asesor_id'))).size;
    const meta_odps_cerradas = asesorIdNum
      ? metaOdpsCerradasAsesor
      : metaOdpsCerradasAsesor * Math.max(1, asesoresConCierre);

    // ─── KPIs financieros: facturación vs meta, % facturadas, cartera pendiente ─
    const whereOdpPeriodo: any = { es_garantia: false };
    if (rangoFecha) whereOdpPeriodo.fecha_creacion = rangoFecha;
    if (asesorIdNum) whereOdpPeriodo.asesor_id = asesorIdNum;

    const facturacion_periodo = Number(await ODP.sum('valor_total', { where: whereOdpPeriodo }) || 0);
    const meta_facturacion_periodo = Number((config as any)?.meta_facturacion_mensual) || 120000000;

    const total_odps_periodo = await ODP.count({ where: whereOdpPeriodo });
    const odps_facturadas_periodo = await ODP.count({ where: { ...whereOdpPeriodo, estado_facturacion: 'FACTURADA' } });
    const pct_odps_facturadas = total_odps_periodo > 0
      ? Math.round((odps_facturadas_periodo / total_odps_periodo) * 100)
      : 0;

    const wherePendiente: any = {
      es_garantia: false,
      pendiente: { [Op.gt]: 0 },
      estado_caja: { [Op.ne]: 'CANCELADO' },
    };
    if (asesorIdNum) wherePendiente.asesor_id = asesorIdNum;
    const monto_pendiente_cobro_total = Number(await ODP.sum('pendiente', { where: wherePendiente }) || 0);

    res.json({
      meta_conversion: 20,
      tasa_conversion_actual: tasaConversion,
      total_leads_reales: total,
      total_aprobados: aprobados,
      motivos_perdida,
      ciclo_venta_promedio_dias,
      leads_nuevos_periodo,
      leads_nuevos_delta_pct,
      meta_odps_cerradas,
      odps_cerradas_real,
      facturacion_periodo,
      meta_facturacion_periodo,
      pct_odps_facturadas,
      monto_pendiente_cobro_total,
    });
  } catch (error: any) {
    console.error('Error en getSupervisionResumen:', error);
    res.status(500).json({ error: 'Error del servidor al calcular el resumen de supervisión' });
  }
};

// GET /api/crm/supervision/ranking-asesores — leaderboard comercial del período.
// A diferencia del resto de los endpoints de supervisión, IGNORA el filtro de
// asesor_id de la página: un ranking por definición compara a todos los asesores.
export const getRankingAsesores = async (req: Request, res: Response) => {
  try {
    const { fecha_desde, fecha_hasta } = req.query;
    const where: any = {
      respondio: { [Op.ne]: 'No responde' },
      asesor_id: { [Op.ne]: null },
    };
    const rangoFecha = construirFiltroFecha(fecha_desde, fecha_hasta);
    if (rangoFecha) where.createdAt = rangoFecha;

    const leads = await Lead.findAll({
      where,
      attributes: ['asesor_id', 'estado_crm', 'monto_real_venta'],
      include: [{ model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] }],
    });

    const mapa = new Map<number, { asesor_id: number; asesor_nombre: string; total_leads: number; aprobados: number; monto_vendido: number }>();
    for (const l of leads as any[]) {
      const data = l.toJSON();
      const id = data.asesor_id;
      if (!mapa.has(id)) {
        mapa.set(id, {
          asesor_id: id,
          asesor_nombre: data.asesor?.nombre_completo || 'Sin nombre',
          total_leads: 0,
          aprobados: 0,
          monto_vendido: 0,
        });
      }
      const entry = mapa.get(id)!;
      entry.total_leads += 1;
      if (data.estado_crm === 'APROBADO') {
        entry.aprobados += 1;
        entry.monto_vendido += parseFloat(data.monto_real_venta || '0');
      }
    }

    const ranking = Array.from(mapa.values())
      .map(e => ({
        ...e,
        conversion_pct: e.total_leads > 0 ? Math.round((e.aprobados / e.total_leads) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.monto_vendido - a.monto_vendido);

    res.json({ ranking });
  } catch (error: any) {
    console.error('Error en getRankingAsesores:', error);
    res.status(500).json({ error: 'Error del servidor al calcular el ranking de asesores' });
  }
};

// GET /api/crm/supervision/alto-valor — leads de alto valor sin ODP, cualquier etapa activa
export const getSupervisionAltoValor = async (req: Request, res: Response) => {
  try {
    const { fecha_desde, fecha_hasta, asesor_id, monto_min } = req.query;
    const umbral = monto_min ? parseFloat(monto_min as string) : 10000000;
    const ETAPAS_ACTIVAS = ['ASIGNADO', 'EN_CONTACTO', 'COTIZANDO', 'SEGUIMIENTO', 'VISITA_TECNICA', 'APROBADO'];

    const where: any = {
      respondio: { [Op.ne]: 'No responde' },
      estado_crm: { [Op.in]: ETAPAS_ACTIVAS },
      odp_id: null,
      monto_proyectado_cotizacion: { [Op.gte]: umbral },
    };
    const rangoFecha = construirFiltroFecha(fecha_desde, fecha_hasta);
    if (rangoFecha) where.createdAt = rangoFecha;
    if (asesor_id) where.asesor_id = parseInt(asesor_id as string);

    const leads = await Lead.findAll({
      where,
      include: [{ model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] }],
      order: [['monto_proyectado_cotizacion', 'DESC']],
    });

    const resultado = leads.map((l: any) => {
      const data = l.toJSON();
      const campoFecha = FECHA_POR_ESTADO[data.estado_crm];
      const dias = diasDesde((campoFecha && data[campoFecha]) || data.createdAt);
      return {
        id: data.id,
        nombre: data.nombre,
        telefono: data.telefono,
        estado_crm: data.estado_crm,
        monto_proyectado_cotizacion: parseFloat(data.monto_proyectado_cotizacion || '0'),
        asesor_id: data.asesor_id,
        asesor_nombre: data.asesor?.nombre_completo || 'Sin asignar',
        dias_en_etapa: dias,
        accion_sugerida: calcularAccionSugerida({ estado_crm: data.estado_crm, dias, odp_id: data.odp_id }),
      };
    });

    res.json({ umbral, total: resultado.length, leads: resultado });
  } catch (error: any) {
    console.error('Error en getSupervisionAltoValor:', error);
    res.status(500).json({ error: 'Error del servidor al obtener leads de alto valor' });
  }
};

// GET /api/crm/supervision/seguimiento — cola priorizada de SEGUIMIENTO, todos los asesores
export const getSupervisionSeguimiento = async (req: Request, res: Response) => {
  try {
    const { fecha_desde, fecha_hasta, asesor_id } = req.query;
    const where: any = {
      respondio: { [Op.ne]: 'No responde' },
      estado_crm: 'SEGUIMIENTO',
    };
    const rangoFecha = construirFiltroFecha(fecha_desde, fecha_hasta);
    if (rangoFecha) where.createdAt = rangoFecha;
    if (asesor_id) where.asesor_id = parseInt(asesor_id as string);

    const leads = await Lead.findAll({
      where,
      include: [{ model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] }],
    });

    const resultado = leads
      .map((l: any) => {
        const data = l.toJSON();
        const dias = diasDesde(data.fecha_seguimiento || data.createdAt);
        return {
          id: data.id,
          nombre: data.nombre,
          telefono: data.telefono,
          monto_proyectado_cotizacion: parseFloat(data.monto_proyectado_cotizacion || '0'),
          intentos_seguimiento: data.intentos_seguimiento,
          asesor_id: data.asesor_id,
          asesor_nombre: data.asesor?.nombre_completo || 'Sin asignar',
          dias_en_etapa: dias,
          accion_sugerida: calcularAccionSugerida({ estado_crm: 'SEGUIMIENTO', dias, odp_id: data.odp_id }),
        };
      })
      .sort((a, b) => b.dias_en_etapa - a.dias_en_etapa || b.monto_proyectado_cotizacion - a.monto_proyectado_cotizacion);

    res.json({ total: resultado.length, leads: resultado });
  } catch (error: any) {
    console.error('Error en getSupervisionSeguimiento:', error);
    res.status(500).json({ error: 'Error del servidor al obtener la cola de seguimiento' });
  }
};

// GET /api/crm/supervision/primer-contacto — leads ASIGNADO sin contactar, cualquier monto
export const getSupervisionPrimerContacto = async (req: Request, res: Response) => {
  try {
    const { fecha_desde, fecha_hasta, asesor_id } = req.query;
    const where: any = {
      respondio: { [Op.ne]: 'No responde' },
      estado_crm: 'ASIGNADO',
    };
    const rangoFecha = construirFiltroFecha(fecha_desde, fecha_hasta);
    if (rangoFecha) where.createdAt = rangoFecha;
    if (asesor_id) where.asesor_id = parseInt(asesor_id as string);

    const leads = await Lead.findAll({
      where,
      include: [{ model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] }],
    });

    const resultado = leads
      .map((l: any) => {
        const data = l.toJSON();
        const dias = diasDesde(data.fecha_asignado || data.createdAt);
        return {
          id: data.id,
          nombre: data.nombre,
          telefono: data.telefono,
          monto_proyectado_cotizacion: parseFloat(data.monto_proyectado_cotizacion || '0'),
          asesor_id: data.asesor_id,
          asesor_nombre: data.asesor?.nombre_completo || 'Sin asignar',
          dias_en_etapa: dias,
          accion_sugerida: calcularAccionSugerida({ estado_crm: 'ASIGNADO', dias, odp_id: data.odp_id }),
        };
      })
      .sort((a, b) => b.dias_en_etapa - a.dias_en_etapa || b.monto_proyectado_cotizacion - a.monto_proyectado_cotizacion);

    res.json({ total: resultado.length, leads: resultado });
  } catch (error: any) {
    console.error('Error en getSupervisionPrimerContacto:', error);
    res.status(500).json({ error: 'Error del servidor al obtener la cola de primer contacto' });
  }
};

// ─── Lineamiento del día + sesión de coaching (trazabilidad, exclusivo admin) ─

const UMBRAL_ALTO_VALOR_DEFAULT = 10000000;
const ESTADOS_ALTO_VALOR = ['EN_CONTACTO', 'COTIZANDO', 'VISITA_TECNICA', 'APROBADO'];

async function construirItemsUrgentes(asesorId: number, montoMin: number) {
  const leads = await Lead.findAll({
    where: {
      asesor_id: asesorId,
      respondio: { [Op.ne]: 'No responde' },
      estado_crm: { [Op.in]: ['ASIGNADO', 'EN_CONTACTO', 'COTIZANDO', 'SEGUIMIENTO', 'VISITA_TECNICA', 'APROBADO'] },
    },
  });

  const items: { lead_id: number; texto_accion: string; prioridad: string; origen: string }[] = [];

  for (const l of leads as any[]) {
    const data = l.toJSON();
    const monto = parseFloat(data.monto_proyectado_cotizacion || '0');
    const campoFecha = FECHA_POR_ESTADO[data.estado_crm];
    const dias = diasDesde((campoFecha && data[campoFecha]) || data.createdAt);
    const accion = calcularAccionSugerida({ estado_crm: data.estado_crm, dias, odp_id: data.odp_id });

    if (data.estado_crm === 'ASIGNADO') {
      // Todo lead recién asignado entra al lineamiento: la velocidad de respuesta
      // no depende del monto, es puramente de disciplina de ejecución.
      items.push({ lead_id: data.id, texto_accion: accion.texto, prioridad: accion.prioridad, origen: 'PRIMER_CONTACTO' });
    } else if (data.estado_crm === 'SEGUIMIENTO') {
      if (accion.prioridad !== 'baja') {
        items.push({ lead_id: data.id, texto_accion: accion.texto, prioridad: accion.prioridad, origen: 'SEGUIMIENTO' });
      }
    } else if (ESTADOS_ALTO_VALOR.includes(data.estado_crm)) {
      const calificaValor = data.estado_crm === 'APROBADO' ? !data.odp_id : true;
      if (calificaValor && monto >= montoMin && accion.prioridad !== 'baja') {
        items.push({ lead_id: data.id, texto_accion: accion.texto, prioridad: accion.prioridad, origen: 'ALTO_VALOR' });
      }
    }
  }

  return items;
}

// POST /api/crm/supervision/lineamiento — genera (o completa) el lineamiento de hoy de un asesor
export const generarLineamiento = async (req: Request, res: Response) => {
  const t = await sequelize.transaction();
  try {
    const user = req.user!;
    const { asesor_id, monto_min } = req.body;
    if (!asesor_id) {
      await t.rollback();
      return res.status(400).json({ error: 'Debes indicar el asesor para generar su lineamiento del día.' });
    }
    const umbral = monto_min ? parseFloat(monto_min) : UMBRAL_ALTO_VALOR_DEFAULT;
    const fecha = hoyBogotaISO();

    const [lineamiento] = await SupervisionLineamiento.findOrCreate({
      where: { fecha, asesor_id },
      defaults: { creado_por: user.id },
      transaction: t,
    });

    const candidatos = await construirItemsUrgentes(asesor_id, umbral);

    const existentes = await SupervisionLineamientoItem.findAll({
      where: { lineamiento_id: lineamiento.getDataValue('id') },
      attributes: ['lead_id'],
      transaction: t,
    });
    const leadIdsExistentes = new Set(existentes.map((e: any) => e.getDataValue('lead_id')));

    const nuevos = candidatos.filter((c) => !leadIdsExistentes.has(c.lead_id));
    if (nuevos.length > 0) {
      await SupervisionLineamientoItem.bulkCreate(
        nuevos.map((n) => ({ ...n, lineamiento_id: lineamiento.getDataValue('id') })),
        { transaction: t },
      );
    }

    await t.commit();

    const resultado = await SupervisionLineamiento.findByPk(lineamiento.getDataValue('id'), {
      include: [
        { model: SupervisionLineamientoItem, as: 'items', include: [{ model: Lead, as: 'lead', attributes: ['id', 'nombre', 'telefono'] }] },
        { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] },
      ],
    });

    res.json(resultado);
  } catch (error: any) {
    await t.rollback();
    console.error('Error en generarLineamiento:', error);
    res.status(500).json({ error: 'No se pudo generar el lineamiento del día. Intenta de nuevo.' });
  }
};

// GET /api/crm/supervision/lineamiento?fecha=&asesor_id= — obtiene el lineamiento de un día/asesor
export const getLineamiento = async (req: Request, res: Response) => {
  try {
    const { fecha, asesor_id } = req.query;
    if (!asesor_id) return res.status(400).json({ error: 'Debes indicar el asesor.' });
    const fechaConsulta = (fecha as string) || hoyBogotaISO();

    const lineamiento: any = await SupervisionLineamiento.findOne({
      where: { fecha: fechaConsulta, asesor_id: parseInt(asesor_id as string) },
      include: [
        { model: SupervisionLineamientoItem, as: 'items', include: [{ model: Lead, as: 'lead', attributes: ['id', 'nombre', 'telefono'] }] },
        { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] },
      ],
    });

    if (!lineamiento) return res.json(null);

    const data = lineamiento.toJSON();
    const rank: Record<string, number> = { alta: 0, media: 1, baja: 2 };
    data.items.sort((a: any, b: any) => (rank[a.prioridad] ?? 3) - (rank[b.prioridad] ?? 3));

    res.json(data);
  } catch (error: any) {
    console.error('Error en getLineamiento:', error);
    res.status(500).json({ error: 'No se pudo cargar el lineamiento.' });
  }
};

// PATCH /api/crm/supervision/lineamiento/item/:id — marca un ítem cumplido/no cumplido
export const marcarItemLineamiento = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { cumplido } = req.body;
    const item = await SupervisionLineamientoItem.findByPk(id);
    if (!item) return res.status(404).json({ error: 'Ítem de lineamiento no encontrado.' });

    item.set('cumplido', !!cumplido);
    item.set('fecha_cumplido', cumplido ? new Date() : null);
    await item.save();

    res.json(item);
  } catch (error: any) {
    console.error('Error en marcarItemLineamiento:', error);
    res.status(500).json({ error: 'No se pudo actualizar el ítem del lineamiento.' });
  }
};

// PATCH /api/crm/supervision/lineamiento/:id/notas — guarda las notas de la sesión de coaching
export const actualizarNotasLineamiento = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { notas_sesion } = req.body;
    const lineamiento = await SupervisionLineamiento.findByPk(id);
    if (!lineamiento) return res.status(404).json({ error: 'Lineamiento no encontrado.' });

    lineamiento.set('notas_sesion', notas_sesion ?? null);
    await lineamiento.save();

    res.json(lineamiento);
  } catch (error: any) {
    console.error('Error en actualizarNotasLineamiento:', error);
    res.status(500).json({ error: 'No se pudieron guardar las notas de la sesión.' });
  }
};

// GET /api/crm/supervision/lineamiento/adherencia — % cumplimiento agregado (leading indicator)
export const getAdherenciaLineamiento = async (req: Request, res: Response) => {
  try {
    const { fecha_desde, fecha_hasta, asesor_id } = req.query;
    const whereLineamiento: any = {};
    if (fecha_desde && fecha_hasta) {
      whereLineamiento.fecha = { [Op.between]: [fecha_desde, fecha_hasta] };
    }
    if (asesor_id) whereLineamiento.asesor_id = parseInt(asesor_id as string);

    const lineamientos = await SupervisionLineamiento.findAll({
      where: whereLineamiento,
      include: [{ model: SupervisionLineamientoItem, as: 'items', attributes: ['id', 'cumplido'] }],
    });

    let totalItems = 0;
    let cumplidos = 0;
    for (const l of lineamientos as any[]) {
      const items = l.getDataValue('items') || [];
      totalItems += items.length;
      cumplidos += items.filter((i: any) => i.getDataValue('cumplido')).length;
    }

    const pctAdherencia = totalItems > 0 ? Math.round((cumplidos / totalItems) * 100) : 0;

    res.json({ total_dias: lineamientos.length, total_items: totalItems, cumplidos, pct_adherencia: pctAdherencia });
  } catch (error: any) {
    console.error('Error en getAdherenciaLineamiento:', error);
    res.status(500).json({ error: 'No se pudo calcular la adherencia al lineamiento.' });
  }
};

// ─── Buscador Avanzado (admin) — búsqueda cruzada de ODPs y Leads con filtros ─
// detallados de facturación/caja/acarreo-instalación (ODP) y pipeline/fuente (Lead).
// construirWhereBuscador* se comparte entre el endpoint JSON y su export a Excel
// para no duplicar la lógica de filtros.

const CAMPOS_FECHA_ODP: Record<string, string> = {
  fecha_factura: 'fecha_factura',
  fecha_creacion: 'fecha_creacion',
  fecha_entrega: 'fecha_entrega',
};

const TOPE_FILAS_EXCEL = 5000;

async function construirWhereBuscadorODP(query: Record<string, any>) {
  const {
    fecha_desde, fecha_hasta, campo_fecha, asesor_id, estado_facturacion, estado_caja, acarreo, instalacion, tipo_odp, search,
    estado_produccion, monto_min, monto_max, incluir_garantias, es_no_conformidad, forma_pago, cartera_vencida,
  } = query;
  const where: any = {};
  // es_garantia se excluye por defecto (comportamiento original); incluir_garantias=true lo levanta.
  if (incluir_garantias !== 'true') where.es_garantia = false;

  const campoFecha = CAMPOS_FECHA_ODP[campo_fecha as string] || 'fecha_factura';
  const rangoFecha = construirFiltroFecha(fecha_desde, fecha_hasta);
  if (rangoFecha) where[campoFecha] = rangoFecha;

  if (asesor_id) where.asesor_id = parseInt(asesor_id as string, 10);
  if (estado_facturacion) where.estado_facturacion = estado_facturacion;
  if (estado_caja) where.estado_caja = estado_caja;
  if (acarreo !== undefined) where.acarreo = acarreo === 'true';
  if (instalacion !== undefined) where.instalacion = instalacion === 'true';
  if (tipo_odp) where.tipo_odp = tipo_odp;
  if (estado_produccion) where.estado_produccion = estado_produccion;
  if (es_no_conformidad !== undefined) where.es_no_conformidad = es_no_conformidad === 'true';
  if (forma_pago) where.forma_pago = forma_pago;

  if (monto_min || monto_max) {
    where.valor_total = {
      ...(monto_min ? { [Op.gte]: parseFloat(monto_min as string) } : {}),
      ...(monto_max ? { [Op.lte]: parseFloat(monto_max as string) } : {}),
    };
  }

  // Cartera vencida: misma definición que el dashboard (getResumenGerencial) —
  // créditos con FE emitida cuya fecha_factura supera el umbral de días configurado.
  if (cartera_vencida === 'true') {
    const config = await ConfiguracionGlobal.findOne({ where: { id: 1 } });
    const diasAlertaCartera = Number((config as any)?.dias_alerta_cartera_vencida) || 60;
    const fechaUmbralCartera = new Date(Date.now() - diasAlertaCartera * 24 * 3600 * 1000);
    where.forma_pago = 'credito';
    where.pendiente = { [Op.gt]: 0 };
    where.factura_electronica = { [Op.ne]: null };
    where.fecha_factura = { [Op.lt]: fechaUmbralCartera };
    where.estado_caja = { [Op.ne]: 'CANCELADO' };
  }

  if (search) {
    const like = { [Op.iLike]: `%${search}%` };
    where[Op.or] = [{ numero_odp: like }, { '$cliente.nombre_razon_social$': like }];
  }

  return where;
}

const includeBuscadorODP = [
  { model: Cliente, as: 'cliente', attributes: ['id', 'nombre_razon_social', 'fuente'] },
  { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] },
  { model: FacturaAdicionalODP, as: 'facturas_adicionales', attributes: ['numero_fe', 'fecha_factura'], separate: true },
  // Sin `limit` aquí: en un include hasMany con separate:true, `limit` topa el total
  // de filas devueltas entre TODOS los padres de la página, no por-padre — se toma
  // el primer resultado ya en la capa de mapeo (mapearFilaBuscadorODP).
  { model: Lead, as: 'leads_origen', attributes: ['fuente_lead'], separate: true },
];

function mapearFilaBuscadorODP(odp: any) {
  const data = odp.toJSON ? odp.toJSON() : odp;
  const leadOrigen = (data.leads_origen || [])[0];
  const fuente = leadOrigen?.fuente_lead || data.cliente?.fuente || null;
  return {
    id: data.id,
    numero_odp: data.numero_odp,
    cliente_nombre: data.cliente?.nombre_razon_social || null,
    fuente,
    asesor_nombre: data.asesor?.nombre_completo || null,
    estado_produccion: data.estado_produccion,
    estado_facturacion: data.estado_facturacion,
    estado_caja: data.estado_caja,
    tipo_odp: data.tipo_odp,
    forma_pago: data.forma_pago,
    es_no_conformidad: data.es_no_conformidad,
    valor_total: parseFloat(data.valor_total || '0'),
    abono: parseFloat(data.abono || '0'),
    pendiente: parseFloat(data.pendiente || '0'),
    factura_electronica: data.factura_electronica,
    fecha_factura: data.fecha_factura,
    facturas_adicionales: (data.facturas_adicionales || []).map((f: any) => ({ numero_fe: f.numero_fe, fecha_factura: f.fecha_factura })),
    acarreo: data.acarreo,
    instalacion: data.instalacion,
    fecha_entrega: data.fecha_entrega,
    fecha_creacion: data.fecha_creacion,
  };
}

// GET /api/supervision-crm/buscador/odp
export const getBuscadorODP = async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 50));
    const where = await construirWhereBuscadorODP(req.query);

    const { count, rows } = await ODP.findAndCountAll({
      where,
      include: includeBuscadorODP,
      order: [['fecha_creacion', 'DESC']],
      limit,
      offset: (page - 1) * limit,
      distinct: true,
    });

    const items = rows.map(mapearFilaBuscadorODP);
    const montoInstaladoPagina = items
      .filter(i => ['INSTALADA', 'ENTREGADA'].includes(i.estado_produccion))
      .reduce((s, i) => s + i.valor_total, 0);

    res.json({ total: count, page, limit, monto_instalado_pagina: montoInstaladoPagina, items });
  } catch (error: any) {
    console.error('Error en getBuscadorODP:', error);
    res.status(500).json({ error: 'Error del servidor al buscar ODPs' });
  }
};

// GET /api/supervision-crm/buscador/odp/excel
export const exportarBuscadorODPExcel = async (req: Request, res: Response) => {
  try {
    const where = await construirWhereBuscadorODP(req.query);
    const rows = await ODP.findAll({
      where,
      include: includeBuscadorODP,
      order: [['fecha_creacion', 'DESC']],
      limit: TOPE_FILAS_EXCEL,
    });
    if (rows.length >= TOPE_FILAS_EXCEL) {
      return res.status(400).json({ error: `Hay más de ${TOPE_FILAS_EXCEL} resultados. Acota el rango de fechas o los filtros antes de exportar.` });
    }

    const items = rows.map(mapearFilaBuscadorODP);

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('ODPs');
    ws.columns = [
      { header: 'ODP', key: 'numero_odp', width: 16 },
      { header: 'Cliente', key: 'cliente_nombre', width: 30 },
      { header: 'Fuente', key: 'fuente', width: 16 },
      { header: 'Asesor', key: 'asesor_nombre', width: 22 },
      { header: 'Estado Producción', key: 'estado_produccion', width: 18 },
      { header: 'Facturación', key: 'estado_facturacion', width: 14 },
      { header: 'Caja', key: 'estado_caja', width: 16 },
      { header: 'Tipo', key: 'tipo_odp', width: 8 },
      { header: 'Forma de Pago', key: 'forma_pago', width: 16 },
      { header: 'Valor Total', key: 'valor_total', width: 16 },
      { header: 'Abonado', key: 'abono', width: 16 },
      { header: 'Pendiente', key: 'pendiente', width: 16 },
      { header: 'FE Principal', key: 'factura_electronica', width: 18 },
      { header: 'Fecha Factura', key: 'fecha_factura', width: 14 },
      { header: 'Acarreo', key: 'acarreo', width: 10 },
      { header: 'Instalación', key: 'instalacion', width: 12 },
      { header: 'No Conformidad', key: 'es_no_conformidad', width: 14 },
      { header: 'Fecha Entrega', key: 'fecha_entrega', width: 14 },
      { header: 'Fecha Creación', key: 'fecha_creacion', width: 14 },
    ];
    ws.getRow(1).font = { bold: true };
    for (const item of items) {
      ws.addRow({
        ...item,
        fecha_factura: item.fecha_factura ? new Date(item.fecha_factura).toLocaleDateString('es-CO') : '',
        fecha_entrega: item.fecha_entrega ? new Date(item.fecha_entrega).toLocaleDateString('es-CO') : '',
        fecha_creacion: item.fecha_creacion ? new Date(item.fecha_creacion).toLocaleDateString('es-CO') : '',
        acarreo: item.acarreo ? 'Sí' : 'No',
        instalacion: item.instalacion ? 'Sí' : 'No',
        es_no_conformidad: item.es_no_conformidad ? 'Sí' : 'No',
      });
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="buscador_odp.xlsx"');
    await wb.xlsx.write(res);
    res.end();
  } catch (error: any) {
    console.error('Error en exportarBuscadorODPExcel:', error);
    res.status(500).json({ error: 'Error del servidor al exportar el Excel de ODPs' });
  }
};

function construirWhereBuscadorLeads(query: Record<string, any>) {
  const {
    fecha_desde, fecha_hasta, asesor_id, estado_crm, fuente_lead, search,
    segmento, respondio, motivo_perdida, monto_min, monto_max, tiene_odp,
  } = query;
  const where: any = {};

  const rangoFecha = construirFiltroFecha(fecha_desde, fecha_hasta);
  if (rangoFecha) where.createdAt = rangoFecha;
  if (asesor_id) where.asesor_id = parseInt(asesor_id as string, 10);
  if (estado_crm) where.estado_crm = estado_crm;
  if (fuente_lead) where.fuente_lead = fuente_lead;
  if (segmento) where.segmento = segmento;
  if (respondio) where.respondio = respondio;
  if (motivo_perdida) where.motivo_perdida = motivo_perdida;
  if (tiene_odp !== undefined) where.odp_id = tiene_odp === 'true' ? { [Op.ne]: null } : null;

  if (monto_min || monto_max) {
    where.monto_proyectado_cotizacion = {
      ...(monto_min ? { [Op.gte]: parseFloat(monto_min as string) } : {}),
      ...(monto_max ? { [Op.lte]: parseFloat(monto_max as string) } : {}),
    };
  }

  if (search) {
    const like = { [Op.iLike]: `%${search}%` };
    where[Op.or] = [{ nombre: like }, { telefono: like }];
  }

  return where;
}

const includeBuscadorLeads = [
  { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] },
  { model: ODP, as: 'odp', attributes: ['id', 'numero_odp'] },
];

function mapearFilaBuscadorLead(lead: any) {
  const data = lead.toJSON ? lead.toJSON() : lead;
  const campoFecha = FECHA_POR_ESTADO[data.estado_crm];
  const dias = diasDesde((campoFecha && data[campoFecha]) || data.createdAt);
  return {
    id: data.id,
    nombre: data.nombre,
    telefono: data.telefono,
    asesor_id: data.asesor_id,
    asesor_nombre: data.asesor?.nombre_completo || 'Sin asignar',
    estado_crm: data.estado_crm,
    dias_en_etapa: dias,
    fuente_lead: data.fuente_lead,
    segmento: data.segmento,
    monto_proyectado_cotizacion: parseFloat(data.monto_proyectado_cotizacion || '0'),
    monto_real_venta: parseFloat(data.monto_real_venta || '0'),
    motivo_perdida: data.motivo_perdida,
    odp_id: data.odp_id,
    numero_odp: data.odp?.numero_odp || null,
    createdAt: data.createdAt,
  };
}

// GET /api/supervision-crm/buscador/leads
export const getBuscadorLeads = async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 50));
    const where = construirWhereBuscadorLeads(req.query);

    const { count, rows } = await Lead.findAndCountAll({
      where,
      include: includeBuscadorLeads,
      order: [['createdAt', 'DESC']],
      limit,
      offset: (page - 1) * limit,
      distinct: true,
    });

    res.json({ total: count, page, limit, items: rows.map(mapearFilaBuscadorLead) });
  } catch (error: any) {
    console.error('Error en getBuscadorLeads:', error);
    res.status(500).json({ error: 'Error del servidor al buscar leads' });
  }
};

// GET /api/supervision-crm/buscador/leads/excel
export const exportarBuscadorLeadsExcel = async (req: Request, res: Response) => {
  try {
    const where = construirWhereBuscadorLeads(req.query);
    const rows = await Lead.findAll({
      where,
      include: includeBuscadorLeads,
      order: [['createdAt', 'DESC']],
      limit: TOPE_FILAS_EXCEL,
    });
    if (rows.length >= TOPE_FILAS_EXCEL) {
      return res.status(400).json({ error: `Hay más de ${TOPE_FILAS_EXCEL} resultados. Acota el rango de fechas o los filtros antes de exportar.` });
    }

    const items = rows.map(mapearFilaBuscadorLead);

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Leads');
    ws.columns = [
      { header: 'Nombre', key: 'nombre', width: 26 },
      { header: 'Teléfono', key: 'telefono', width: 16 },
      { header: 'Asesor', key: 'asesor_nombre', width: 22 },
      { header: 'Etapa', key: 'estado_crm', width: 16 },
      { header: 'Días en etapa', key: 'dias_en_etapa', width: 12 },
      { header: 'Fuente', key: 'fuente_lead', width: 16 },
      { header: 'Segmento', key: 'segmento', width: 18 },
      { header: 'Monto proyectado', key: 'monto_proyectado_cotizacion', width: 18 },
      { header: 'Monto real venta', key: 'monto_real_venta', width: 18 },
      { header: 'Motivo pérdida', key: 'motivo_perdida', width: 20 },
      { header: 'ODP', key: 'numero_odp', width: 16 },
      { header: 'Fecha creación', key: 'createdAt', width: 14 },
    ];
    ws.getRow(1).font = { bold: true };
    for (const item of items) {
      ws.addRow({ ...item, createdAt: item.createdAt ? new Date(item.createdAt).toLocaleDateString('es-CO') : '' });
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="buscador_leads.xlsx"');
    await wb.xlsx.write(res);
    res.end();
  } catch (error: any) {
    console.error('Error en exportarBuscadorLeadsExcel:', error);
    res.status(500).json({ error: 'Error del servidor al exportar el Excel de leads' });
  }
};

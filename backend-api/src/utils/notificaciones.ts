import { Usuario } from '../models';
import { emitirNotificacion, emitirEvento } from '../server';

const ESTADO_LABELS: Record<string, string> = {
  EN_ESPERA:            'En Espera',
  VISITA_TECNICA:       'Visita Técnica',
  MEDICION:             'Medición',
  PEDIDO_PROVEEDOR:     'Pedido a Proveedor',
  ALUMINIO_CORTADO:     'Aluminio Cortado',
  VIDRIO_RECIBIDO:      'Vidrio Recibido',
  ACCESORIOS_SEPARADOS: 'Accesorios Separados',
  LISTO_INSTALAR:       'Listo para Instalar',
  PROGRAMADA:           'Programada',
  INSTALADA:            'Instalada',
  ENTREGADA:            'Entregada',
  PAUSADA:              'Pausada',
};

// ─── Includes del listado de ODPs ────────────────────────────────────────────
// Debe coincidir exactamente con getODPs en odp.controller.ts.
// Si se agrega un include allá, agregarlo aquí también para mantener forma del objeto.
const getODPListaIncludes = async (): Promise<any[]> => {
  const { Cliente, Usuario: Usr, ODPItem, Pago, TomaMedidas, SAP } = await import('../models');
  return [
    { model: Cliente, as: 'cliente', attributes: ['id', 'nombre_razon_social', 'numero_documento', 'telefono', 'celular', 'email', 'direccion'] },
    { model: Usr, as: 'asesor', attributes: ['id', 'nombre_completo', 'username'] },
    { model: ODPItem, as: 'items', separate: true, order: [['id', 'ASC']] },
    { model: Pago, as: 'pagos', attributes: ['id', 'monto', 'metodo_pago', 'referencia_pago', 'observaciones', 'fecha'], separate: true, order: [['fecha', 'ASC']] },
    { model: TomaMedidas, as: 'tomas_medidas', attributes: ['id', 'numero_tm', 'croquis_url'], separate: true },
    { model: SAP, as: 'saps', attributes: ['id'], separate: true },
  ];
};

/**
 * Emite el evento 'odp_patch' para que el frontend actualice solo el ODP afectado
 * sin re-fetchear la lista completa. Reemplaza emitirCambio('odp') en odp.controller.ts.
 *
 * RIESGO: ContabilidadPage usa dos arrays (odps + odpsOA). El hook useODPSocketPatch
 * debe recibir ambos setters — ver project_odp_patch_riesgo.md en memoria.
 */
export const emitirODPPatch = async (id: number, accion: 'create' | 'update' | 'delete') => {
  try {
    if (accion === 'delete') {
      emitirEvento('odp_patch', { accion: 'delete', id });
      return;
    }
    const { ODP } = await import('../models');
    const includes = await getODPListaIncludes();
    const odp = await ODP.findByPk(id, { include: includes });
    if (!odp) return;
    emitirEvento('odp_patch', { accion, id, odp: odp.toJSON() });
  } catch (err) {
    console.error('[emitirODPPatch] Error:', err);
  }
};

/**
 * Emite notificación dirigida al asesor de la ODP + roles jefe_produccion y compras.
 */
export const notificarCambioEstadoODP = async (params: {
  numero_odp: string;
  odp_id: number;
  asesor_id: number;
  estado_nuevo: string;
  mensaje?: string;
}) => {
  try {
    const { numero_odp, odp_id, asesor_id, estado_nuevo, mensaje } = params;
    const label = ESTADO_LABELS[estado_nuevo] || estado_nuevo;
    const titulo = `ODP ${numero_odp}`;
    const textoMensaje = mensaje || `Estado actualizado: ${label}`;

    const payload = {
      titulo,
      mensaje: textoMensaje,
      odp_id,
      numero_odp,
      tipo: 'ESTADO_ODP',
      estado: estado_nuevo,
      timestamp: new Date(),
    };

    // Notificar al asesor responsable (usuario específico)
    emitirNotificacion({ userId: asesor_id }, payload);

    // Notificar a todos los jefe_produccion y compras
    emitirNotificacion({ roles: ['jefe_produccion', 'compras'] }, payload);
  } catch (err) {
    // No interrumpir el flujo principal si falla la notificación
    console.error('Error emitiendo notificación ODP:', err);
  }
};

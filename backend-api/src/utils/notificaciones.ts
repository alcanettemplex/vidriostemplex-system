import { Usuario } from '../models';
import { emitirNotificacion } from '../server';

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

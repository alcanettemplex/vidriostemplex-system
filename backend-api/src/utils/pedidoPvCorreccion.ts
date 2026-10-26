// Reglas de "Corregir medidas" de un Pedido PV (2026-10-26). Fuera del controlador por el
// mismo ciclo de imports que `pedidoPvCapacidad.ts` (`pedido_pv.controller` importa
// `../server`). Espejo en el frontend: `features/pedidos-pv/components/CorregirMedidasDialog.tsx`.

/**
 * Estados en los que el vidrio todavía no existe en planta. Desde LLEGADO ya está fabricado
 * —el templado no se recorta— y el camino es "Marcar problema" + reposición.
 */
export const ESTADOS_CORREGIBLES = ['PENDIENTE', 'ENVIADO', 'CONFIRMADO_PROVEEDOR'] as const;

export const esEstadoCorregible = (estado: unknown): boolean =>
  (ESTADOS_CORREGIBLES as readonly string[]).includes(String(estado));

/** Corrigen quienes gestionan Pedidos PV (`puede_gestionar_pv`) y admin/root (decisión del usuario). */
export const puedeCorregirMedidas = (rol: string | undefined, puedeGestionarPv: boolean): boolean =>
  rol === 'admin' || rol === 'root' || puedeGestionarPv;

/** Fuera de PENDIENTE el formulario ya salió hacia el proveedor: hay que declarar que aceptó. */
export const exigeAceptacionProveedor = (estado: unknown): boolean => String(estado) !== 'PENDIENTE';

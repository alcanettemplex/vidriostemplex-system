// Helpers compartidos del módulo Contabilidad.
// Extraídos de ContabilidadPage para que los modales (FE, abonos) puedan reutilizarse
// también desde la ficha de la ODP sin duplicar formato ni reglas de cálculo.

export const getToken = () => sessionStorage.getItem('token');
export const headers = () => ({ Authorization: `Bearer ${getToken()}` });

export const fmt = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

// Formato de miles para inputs de monto (ej: "4.123.548"). Solo enteros (COP sin centavos).
export const formatMiles = (input: string | number) => {
  const digits = String(input).replace(/\D/g, '');
  return digits ? Number(digits).toLocaleString('es-CO') : '';
};

export const parseMiles = (val: string) => Number(String(val).replace(/\D/g, '')) || 0;

export const fmtFecha = (f: string | null | undefined): string => {
  if (!f) return '—';
  try {
    // Extraer YYYY-MM-DD del string ISO para evitar el offset UTC→Bogotá (UTC-5)
    // que convierte medianoche UTC al día anterior en Colombia.
    const datePart = typeof f === 'string' ? f.substring(0, 10) : '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
      const [y, m, d] = datePart.split('-').map(Number);
      return new Date(y, m - 1, d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
    }
    return new Date(f).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Bogota' });
  } catch { return String(f); }
};

// Usa el pendiente almacenado en BD (ya descuenta diferencia/retención).
// Fallback a valor_total-abono solo si pendiente no está disponible (ODPs antiguas).
export const calcPendiente = (o: any) =>
  o?.pendiente != null
    ? Number(o.pendiente)
    : Math.max(0, Number(o?.valor_total || 0) - Number(o?.abono || 0));

export const BANCOS_COLOMBIA = [
  'Bancolombia', 'Nequi', 'Davivienda', 'Banco de Bogotá', 'BBVA', 'Scotiabank Colpatria',
  'Banco Popular', 'Banco de Occidente', 'AV Villas', 'Banco Caja Social', 'Banco Agrario',
  'Citibank', 'Banco Falabella', 'Banco Pichincha', 'Banco Serfinanza', 'Itaú', 'Banco GNB Sudameris',
  'Banco Finandina', 'Banco Mundo Mujer', 'Lulo Bank', 'Movii', 'Rappipay', 'Otro',
];

export const METODOS_PAGO = ['Efectivo', 'Tarjeta', 'Transferencia'];

// Roles con acceso al CRUD de facturación electrónica y abonos.
// Coincide con el RBAC del backend (odp.routes.ts y contabilidad.routes.ts).
export const ROLES_CONTABILIDAD = ['admin', 'contabilidad', 'gerencia'];

export const puedeGestionarCobros = (rol?: string) => ROLES_CONTABILIDAD.includes(rol || '');

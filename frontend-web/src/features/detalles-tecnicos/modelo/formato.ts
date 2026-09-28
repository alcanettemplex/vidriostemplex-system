export const PIE_FORMATO = 'FOR - 005 VERSION : 01 DE MAYO 2014';

export const fechaLarga = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
};

/** Logo de la hoja FOR-005: el del ERP (decisión del usuario, 2026-09-27; el
 * prototipo traía otro). En `public/` porque lo usan la hoja en pantalla y el
 * Excel, que lo descarga. Proporción 225×77 (≈ 2,92:1). */
export const LOGO_DETALLE_TECNICO = `${process.env.PUBLIC_URL}/assets/images/logotemplex.png`;

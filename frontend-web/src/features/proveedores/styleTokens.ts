// Escala de radios y tamaños de fuente del módulo Proveedores.
// Consolida los valores sueltos que se repetían como magic numbers en los
// `style={{}}` inline de los 12 componentes del módulo (ver TECH_DEBT.md).
export const RADIUS = {
  xs: 5,
  sm: 6,
  md: 8,
  lg: 10,
  xl: 12,
  '2xl': 14,
  '3xl': 16,
  '4xl': 18,
  pill: 999,
} as const;

export const FONT = {
  tiny: 10.5,
  xs: 11.5,
  sm: 12,
  base: 13,
  md: 14,
  lg: 15,
  xl: 16,
  xxl: 18,
  title: 22,
  hero: 24,
} as const;

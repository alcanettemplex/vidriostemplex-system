/**
 * Kit de visualización del ERP (2026-09-28). Toda gráfica, embudo, ranking y tarjeta de KPI
 * se arma con estas piezas y los colores de `vizTokens` — ver design/sistema-visual/README.md,
 * sección "Gráficas y KPI".
 */
export * from './vizTokens';
export * from './rechartsBase';
export { ChartCard, TablaDatos } from './ChartCard';
export { ChartTooltip } from './ChartTooltip';
export { Leyenda } from './Leyenda';
export type { ItemLeyenda } from './Leyenda';
export { BarraMagnitud, BarraApilada, Medidor } from './Barras';
export type { SegmentoApilado } from './Barras';
export { Sparkline } from './Sparkline';
export { Iniciales } from './Iniciales';
export { Ayuda } from './Ayuda';
export { TarjetaKPI } from '../dashboard/TarjetaKPI';
export type { TonoKPI } from '../dashboard/TarjetaKPI';

// Tipos del módulo Cotizador.
//
// Describen las formas que los motores portados ya esperaban cuando eran
// JavaScript: son la traducción a TypeScript de un contrato que ya existía, no
// un diseño nuevo. Por eso conservan el estilo mixto del origen —
// `costo_unitario` en snake_case (viene del Excel, vía catalogo.json) y
// `nivelCorte` en camelCase (nombre puesto por la app) —: renombrar aquí
// obligaría a tocar las 4.800 líneas de motores que el port quiere dejar
// intactas.

// ─── Precios y catálogo ─────────────────────────────────────────────────────

/**
 * Producto ya resuelto: las tres capas de origen (provisional < alta <
 * catálogo real) colapsadas por el discriminador `origen` de la tabla, con el
 * override aplicado encima.
 *
 * Los campos opcionales existen SOLO en los productos provisionales. No se
 * emiten como `null` en los demás: el objeto de un producto de catálogo tiene
 * exactamente 9 claves, igual que en `catalogo.json`, porque el golden master
 * compara con `deepStrictEqual` y una clave de más es una diferencia.
 */
export interface Producto {
  codigo: string;
  descripcion: string;
  categoria: string;
  unidad: string;
  costo_unitario: number;
  precio_pa: number;
  precio_pm: number;
  precio_pb: number;
  activo: boolean;
  provisional?: boolean;
  referencia?: string;
  color?: string;
  fuente?: string;
  acabadoExacto?: boolean;
  sospechosoValorPorDefecto?: boolean;
  ultimoCambio?: { fecha: string; por: string | null; motivo: string | null };
}

export interface Parametros {
  aiu: number;
  iva: number;
  clientes: string[];
  flete_fijo: number;
  smo: { tarifaMinima: number; pisoTableroGrande: number };
  asesores: string[];
  estados_cotizacion: string[];
}

export type SegmentoCliente = 'PA' | 'PM' | 'PB';

export interface ListadoProductos {
  items: Producto[];
  total: number;
  pagina: number;
  porPagina: number;
}

// ─── Diseños ────────────────────────────────────────────────────────────────

/** Fórmula lineal `a·anchoMm + b·altoMm + c`. Los coeficientes no enteros son
 * la definición operativa del nivel B: por eso viven en columnas propias y no
 * dentro de un JSONB opaco. */
export interface Formula {
  a: number;
  b: number;
  c: number;
}

export interface DisenoPerfil {
  ref: string;
  refOriginal: string | null;
  descripcion: string | null;
  cantidad: number;
  desperdicioPct: number;
  formula: Formula;
  nivelCorte: string;
  /** `null` cuando el perfil no tiene códigos por acabado. La columna es
   * NOT NULL y guarda `{}` en ese caso, pero se reconstruye como `null` para
   * que la caché sea indistinguible del `disenos.json` que los motores leían.
   * Ambas formas producen el mismo despiece —`Object.entries({})[0]` es
   * `undefined` y el motor no hace nada con él—, pero la fidelidad literal es
   * lo que hace verificable el port. */
  codigosPorColor: Record<string, string> | null;
  esAlfajia: boolean;
}

export interface DisenoVidrio {
  descripcion: string | null;
  cantidad: number;
  desperdicioPct: number;
  formulaAncho: Formula;
  formulaAlto: Formula;
  nivelRiesgo: string | null;
}

export interface DisenoAccesorio {
  descripcion: string;
  cantidad: number | null;
  formula: unknown;
}

export interface Diseno {
  id: string;
  modulo: string;
  sistema: string;
  diseno: string;
  etiqueta: string | null;
  paneles: number | null;
  nivelCorte: string;
  nivelVidrio: string | null;
  nivelPerfiles: string | null;
  medidasRespaldo: number | null;
  cotizable: boolean;
  refsSinPrecio: string[];
  perfiles: DisenoPerfil[];
  vidrios: DisenoVidrio[];
  accesorios: DisenoAccesorio[];
}

/** Proyección que devuelve `listarDisenos()` — 9 campos, no el diseño entero. */
export interface DisenoResumen {
  id: string;
  modulo: string;
  sistema: string;
  diseno: string;
  etiqueta: string | null;
  paneles: number | null;
  nivelCorte: string;
  aptoParaCorte: boolean;
  piezasPerfil: number;
  panosVidrio: number;
}

/** Una pieza de perfil ya despiezada, lista para el taller. `medidaMm` lleva
 * el margen de calibración aplicado; `medidaBrutaMm` es la de la fórmula pura,
 * y es la que debe registrar un contraste. */
export interface CortePerfil {
  ref: string;
  descripcion: string | null;
  medidaMm: number;
  cantidad: number;
  [clave: string]: unknown;
}

export interface CorteVidrio {
  descripcion: string | null;
  anchoMm: number;
  altoMm: number;
  cantidad: number;
  [clave: string]: unknown;
}

// ─── Calibración ────────────────────────────────────────────────────────────
//
// AUSENTE ≠ CERO es la invariante que defiende el módulo entero: `null`
// significa "nunca se midió"; `0` significa "se midió y da cero". Por eso los
// niveles no medidos se representan quitando la clave, no poniendo ceros.

/** Forma exacta de `storeCalibracion.getMargenes()`. Las claves de `sistema`,
 * `material` y `pieza` son las que arma `margenEfectivo()`. */
export interface Margenes {
  global: number | null;
  sistema: Record<string, number>;
  material: Record<string, number>;
  pieza: Record<string, number>;
}

export interface Holgura {
  anchoMm: number;
  altoMm: number;
  nota: string | null;
  definidoEn: string;
  definidoPor: string | null;
}

/** Forma exacta de `storeCalibracion.getHolguras()`. */
export interface Holguras {
  global: Holgura | null;
  sistema: Record<string, Holgura>;
}

export interface EstadoSistema {
  estado: string;
  firmaMaestro?: boolean;
  actualizadoEn: string | null;
  actualizadoPor: string | null;
}

/** Forma exacta de `storeCalibracion.getSistemas()`. */
export type Sistemas = Record<string, EstadoSistema>;

// ─── Accesorios ─────────────────────────────────────────────────────────────

/** Regla de consumo de un accesorio mapeado. `tipo` es uno de los cuatro que
 * sabe calcular la infraestructura (ver TIPOS_CONSUMO_SOPORTADOS); el resto de
 * campos depende del tipo. */
export interface ConsumoAccesorio {
  tipo: string;
  [clave: string]: unknown;
}

export interface MapeoAccesorio {
  estado: 'MAPEADO' | 'INSUMO_NO_FACTURADO' | 'PENDIENTE' | 'IGNORADO';
  codigo?: string | null;
  consumo?: ConsumoAccesorio | null;
  nota?: string | null;
  confianza?: string | null;
}

export interface MapeoAccesorios {
  sistemasActivos: string[];
  accesorios: Record<string, MapeoAccesorio>;
}

/** Correcciones manuales de geometría por diseño, inyectadas a
 * `calcularPlano()` por parámetro. */
export type GeometriaOverrides = Record<string, unknown>;

// ─── Contenido de la caché ──────────────────────────────────────────────────

export interface DatosCotizador {
  productos: Map<string, Producto>;
  parametros: Parametros;
  disenos: Map<string, Diseno>;
  disenosOrdenados: Diseno[];
  margenes: Margenes;
  holguras: Holguras;
  sistemas: Sistemas;
  mapeoAccesorios: MapeoAccesorios;
  geometriaOverrides: GeometriaOverrides;
}

export type Bucket = 'precios' | 'disenos' | 'calibracion' | 'accesorios' | 'geometria';

// ─── Módulos de producto ────────────────────────────────────────────────────

/**
 * Entrada de un módulo de producto (Ventanas, Proyectantes, Cabinas…).
 *
 * Se tipa laxo a propósito: cada módulo declara sus campos en su propio
 * `meta` —que es el contrato real, el que consume el formulario del
 * frontend— y no hay dos módulos con la misma forma. Un tipo estricto aquí
 * sería una tercera declaración que mantener en sincronía con `meta` y con el
 * formulario, y sería la primera en desincronizarse. Cada `calcular()` valida
 * y normaliza lo que recibe antes de usarlo, y lanza con un mensaje legible
 * si falta algo.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type InputModulo = Record<string, any>;

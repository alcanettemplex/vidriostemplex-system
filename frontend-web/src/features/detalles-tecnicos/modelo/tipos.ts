// Modelo de un detalle técnico de vidrio templado.
// Todas las medidas en milímetros. Origen arriba-izquierda, eje Y hacia abajo (como el plano impreso).

/** si = superior izquierda, sd = superior derecha, id = inferior derecha, ii = inferior izquierda */
export type EsquinaId = 'si' | 'sd' | 'id' | 'ii';
export type BordeId = 'sup' | 'der' | 'inf' | 'izq';
export type RefX = 'izq' | 'der' | 'centro';
export type RefY = 'sup' | 'inf' | 'centro';

/**
 * a = medida sobre el canto horizontal (superior/inferior),
 * b = medida sobre el canto vertical (izquierdo/derecho).
 */
export type TratamientoEsquina =
  | { tipo: 'recta' }
  | { tipo: 'despunte'; a: number; b: number }
  | { tipo: 'radio'; r: number }
  | { tipo: 'muesca'; a: number; b: number };

export type Contorno =
  | { tipo: 'rectangular' }
  /** Un lado vertical inclinado: el canto superior mide `anchoSup`, el inferior mide `ancho`. */
  | { tipo: 'desplome-lateral'; lado: 'izq' | 'der'; anchoSup: number }
  /** Canto superior inclinado: el lado indicado mide `altoLado`, el opuesto mide `alto`. */
  | { tipo: 'desplome-superior'; lado: 'izq' | 'der'; altoLado: number };

/** Procesos que forman un mismo herraje (p. ej. las 4 perforaciones de un par de bisagras): se mueven juntos. */
export interface Grupo {
  id: string;
  nombre: string;
}

interface OpBase {
  id: string;
  grupo?: Grupo;
}

/** Perforación circular. x/y son la distancia al centro desde el canto de referencia (o desde el eje, si es 'centro'). */
export interface Perforacion extends OpBase {
  tipo: 'perforacion';
  d: number;
  x: number;
  refX: RefX;
  y: number;
  refY: RefY;
}

/**
 * Boquete (corte rectangular en un canto). `pos` es la distancia desde el extremo de referencia del canto
 * hasta el inicio del boquete: 'inicio' = izquierda en cantos horizontales, arriba en cantos verticales.
 */
export interface Boquete extends OpBase {
  tipo: 'boquete';
  borde: BordeId;
  pos: number;
  desde: 'inicio' | 'fin';
  largo: number;
  prof: number;
  /** Radio de las esquinas internas del boquete (0 = en escuadra). */
  radio: number;
}

/** Chaflán / bisel sobre un canto completo. */
export interface Chaflan extends OpBase {
  tipo: 'chaflan';
  borde: BordeId;
  ancho: number;
}

/** Texto libre ubicado en % del vidrio (0–100). */
export interface Nota extends OpBase {
  tipo: 'nota';
  texto: string;
  x: number;
  y: number;
}

export type Operacion = Perforacion | Boquete | Chaflan | Nota;

export interface Pieza {
  ancho: number;
  alto: number;
  contorno: Contorno;
  esquinas: Record<EsquinaId, TratamientoEsquina>;
  operaciones: Operacion[];
}

export interface Plano {
  id: string;
  plantillaId: string;
  nombre: string;
  cantidad: number;
  color: string;
  espesor: string;
  selloEnCanto: boolean;
  observaciones: string;
  pieza: Pieza;
}

export type Proveedor = 'VITELSA' | 'TEMPLACOL';

export interface Pedido {
  numero: string;
  proveedor: Proveedor;
  fecha: string;
  odp: string;
  cliente: string;
  obra: string;
  asesor: string;
  planos: Plano[];
}

export interface Plantilla {
  id: string;
  nombre: string;
  /** Nombre de la hoja en «1.1 DETALLES TECNICOS.xlsx» de donde sale. */
  hoja: string;
  familia: string;
  descripcion: string;
  espesor?: string;
  selloEnCanto?: boolean;
  pieza: Pieza;
}

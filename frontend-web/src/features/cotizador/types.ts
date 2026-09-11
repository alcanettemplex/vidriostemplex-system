// Tipos del módulo Cotizador — espejo del contrato que ya expone el backend
// (backend-api/src/cotizador/tipos.ts, cotizacionStore.ts, motorCalculo.ts,
// planoProducto.ts, aptitudOrden.ts). No son un diseño nuevo: renombrar aquí
// desalinearía el frontend del backend sin ganar nada.

export type SegmentoCliente = 'PA' | 'PM' | 'PB';

// ─── Módulos de producto (registry) ────────────────────────────────────────

export type TipoCampo = 'string' | 'number' | 'boolean' | 'select';

export interface OpcionCampo {
    value: string | number;
    label: string;
}

/** Agrupación puramente visual (backend/utils/modules/*.ts): en qué tarjeta del
 * formulario cae el campo. No la lee ningún motor de cálculo — si falta, el
 * frontend cae a un único grupo sin dividir. */
export type GrupoCampo = 'cliente' | 'medidas' | 'vidrio' | 'comercial';

export interface CampoMeta {
    nombre: string;
    tipo: TipoCampo;
    etiqueta: string;
    requerido: boolean;
    grupo?: GrupoCampo;
    // Sólo en campos tipo 'select': cada opción es un primitivo (se muestra tal
    // cual) o un {value,label} cuando el texto a mostrar difiere del valor real.
    opciones?: Array<string | number | OpcionCampo>;
}

export interface ModuloMeta {
    id: string;
    nombre: string;
    descripcion: string;
    campos: CampoMeta[];
}

// ─── Resultado de calcular() — POST /cotizar/:moduloId ─────────────────────

export interface LineaBOM {
    codigo: string;
    descripcion: string;
    categoria: string;
    unidad: string;
    cantidad: number;
    precioUnitario: number;
    valorTotal: number;
    error: boolean;
    [clave: string]: unknown;
}

/** Referencia liviana al diseño usado, tal como la guarda `resultado.diseno`
 * en una cotización (no el objeto Diseno completo del catálogo). */
export interface DisenoRef {
    id: string;
    sistema: string;
    diseno: string;
    etiqueta: string | null;
    paneles: number | null;
    nivelCorte: string;
}

/** Salida de `calcular()` de cualquiera de los 6 módulos (motorCalculo.totalizar
 * + campos propios que agrega cada módulo: diseno, aptoParaCorte, cortes, medidas). */
export interface ResultadoCalculo {
    items: LineaBOM[];
    cantidadPiezas: number;
    subtotalPieza: number;
    subtotal: number;
    aiu: number;
    subtotalConAiu: number;
    descuentoPct: number;
    descuento: number;
    ivaPct: number;
    baseIva: number;
    iva: number;
    total: number;
    hayErrores: boolean;
    advertencias: string[];
    areaM2?: number;
    // Sólo presentes cuando el ítem se calculó POR DISEÑO (disenoId válido):
    diseno?: DisenoRef;
    aptoParaCorte?: boolean;
    cortes?: {
        perfiles?: Array<{ ref: string; descripcion: string | null; medidaMm: number; cantidad: number; [c: string]: unknown }>;
        vidrios?: Array<{ descripcion: string | null; anchoMm: number; altoMm: number; cantidad: number; [c: string]: unknown }>;
    };
    medidas?: {
        fabricacion?: { anchoCm: number; altoCm: number };
        [clave: string]: unknown;
    };
    [clave: string]: unknown;
}

// ─── Diseños (selector) ─────────────────────────────────────────────────────

/** Proyección de listarDisenos() — GET /disenos?modulo=&todos= */
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

// ─── Plano (geometría del diagrama) — GET /plano ────────────────────────────

export interface MedidaPlano {
    anchoMm: number;
    altoMm: number;
}

export interface PanelPlano {
    tipo: string;
    fila: number;
    col: number;
    xMm: number;
    yMm: number;
    anchoMm: number;
    altoMm: number;
    pano: MedidaPlano | null;
}

export type CotaPlano =
    | { tipo: 'exterior-ancho'; anchoMm: number }
    | { tipo: 'exterior-alto'; altoMm: number }
    | { tipo: 'pano'; fila: number; col: number; anchoMm: number; altoMm: number };

export interface Plano {
    escala: 'real' | 'esquema';
    confianza: 'alta' | 'media' | 'nula';
    motivo: string | null;
    exterior: MedidaPlano;
    paneles: PanelPlano[];
    cotas: CotaPlano[];
    avisos: string[];
}

// ─── Cotizaciones guardadas ─────────────────────────────────────────────────

export type EstadoCotizacion = 'PENDIENTE' | 'APROBADA' | 'CANCELADO' | 'PERDIDO';

export interface ClienteCotizacion {
    nombre?: string;
    direccion?: string | null;
    telefono?: string | null;
    obra?: string | null;
    contacto?: string | null;
}

/** Ítem tal como lo devuelve el listado (sin `input` ni `resultado`: son los
 * dos JSONB pesados, están sólo en el detalle de GET /cotizaciones/:id). */
export interface ItemCotizacionLigero {
    id: number;
    orden: number;
    moduloId: string;
    descripcionItem: string | null;
    disenoId: string | null;
    sistema: string | null;
    nivelCorte: string | null;
    aptoParaCorte: boolean;
    hayErrores: boolean;
    cantidadPiezas: number;
    subtotalConAiu: number;
    iva: number;
    total: number;
}

export interface ItemCotizacion extends ItemCotizacionLigero {
    input: Record<string, unknown>;
    resultado: ResultadoCalculo;
}

export interface CotizacionLigera {
    id: number;
    numero: number;
    version: number;
    estado: EstadoCotizacion;
    creadaEn?: string;
    actualizadaEn?: string;
    cliente: ClienteCotizacion;
    segmentoCliente: SegmentoCliente;
    asesor: string;
    descuentoPct: number;
    totales: { subtotal: number; iva: number; total: number };
    items: ItemCotizacionLigero[];
}

export interface Cotizacion extends Omit<CotizacionLigera, 'items'> {
    items: ItemCotizacion[];
}

/** Body de POST/PUT /cotizaciones. */
export interface ItemEntrada {
    moduloId?: string;
    descripcionItem?: string | null;
    input?: Record<string, unknown>;
    resultado?: ResultadoCalculo | null;
}

export interface CotizacionEntrada {
    cliente?: ClienteCotizacion;
    segmentoCliente?: SegmentoCliente;
    asesor?: string;
    descuentoPct?: number;
    estado?: EstadoCotizacion;
    items?: ItemEntrada[];
}

export interface FiltrosListado {
    cliente?: string;
    estado?: string;
    asesor?: string;
    numero?: string | number;
    q?: string;
}

// ─── Aptitud para orden de corte — GET /cotizaciones/:id/aptitud ────────────

export interface MotivoAptitud {
    codigo: string;
    texto: string;
    comoSeArregla: string | null;
}

export interface AptitudItem {
    itemId: number;
    imprimible: boolean;
    motivos: MotivoAptitud[];
}

export interface Aptitud {
    imprimible: boolean;
    porItem: AptitudItem[];
}

// ─── Parámetros globales — GET /parametros ──────────────────────────────────

export interface Parametros {
    aiu: number;
    iva: number;
    clientes: string[];
    flete_fijo: number;
    smo: { tarifaMinima: number; pisoTableroGrande: number };
    asesores: string[];
    estados_cotizacion: string[];
}

// ─── Estado del módulo — GET /estado ────────────────────────────────────────

export interface EstadoCotizador {
    estado: 'vacia' | 'cargando' | 'lista' | 'error';
    disponible: boolean;
    [clave: string]: unknown;
}

// ─── Carrito (estado local de la pestaña "Actual") ──────────────────────────
// No existe en el backend: es la forma que usa `CotizadorPage` para acumular
// ítems calculados antes de guardarlos. `idTemp` es sólo para la key de React
// y para poder quitar un ítem de la lista; nunca viaja al backend.
export interface ItemCarrito {
    idTemp: string;
    moduloId: string;
    moduloNombre: string;
    descripcionItem: string | null;
    input: Record<string, unknown>;
    resultado: ResultadoCalculo;
}

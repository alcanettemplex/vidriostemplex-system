// Tipos del módulo Cotizador — espejo del contrato que ya expone el backend
// (backend-api/src/cotizador/tipos.ts, cotizacionStore.ts, motorCalculo.ts,
// planoProducto.ts, aptitudOrden.ts). No son un diseño nuevo: renombrar aquí
// desalinearía el frontend del backend sin ganar nada.

export type SegmentoCliente = 'PA' | 'PM' | 'PB';

// ─── Módulos de producto (registry) ────────────────────────────────────────

// 'lineas' (2026-09-22) no es un control simple como los otros cuatro: es la
// tabla editable de códigos del catálogo que usa el módulo "Ítem libre", y la
// renderiza `EditorLineasLibres` a través de `CampoDinamico`. Su valor es un
// `LineaLibre[]`, no un primitivo.
export type TipoCampo = 'string' | 'number' | 'boolean' | 'select' | 'lineas';

/** Una línea del BOM que el vendedor arma a mano en el módulo "Ítem libre".
 * `cantidad` se interpreta según la unidad que el catálogo declara para ese
 * código (m², metros lineales o unidades): lo decide el producto, no un campo
 * aparte — misma regla que el Excel de los asesores. */
export interface LineaLibre {
    codigo: string;
    cantidad: number | '';
}

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

// ─── Catálogo de productos — GET /catalogo?categoria= ───────────────────────

/** Proyección de `listarCatalogo()`. El modal de clonado sólo pide la categoría
 * VIDRIO (40 filas) para poder avisar cuando el vidrio elegido está en $0:
 * traer el catálogo entero por eso sería mandar 430 productos al navegador. */
export interface ProductoCatalogo {
    codigo: string;
    descripcion: string;
    categoria: string;
    unidad: string;
    costo_unitario: number;
    precio_pa: number;
    precio_pm: number;
    precio_pb: number;
    activo: boolean;
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

/** Un corte de perfil, ya ordenado para taller por `ordenarParaTaller()`
 * (`grupoOrden`: 0 horizontales, 1 verticales, 2 el resto). */
export interface CorteDespiecePerfil {
    ref: string;
    descripcion: string | null;
    medidaMm: number;
    cantidad: number;
    nivelCorte?: string | null;
    incertidumbreMm?: number | null;
    grupoOrden: number;
    [clave: string]: unknown;
}

export interface CorteDespieceVidrio {
    descripcion: string | null;
    anchoMm: number;
    altoMm: number;
    cantidad: number;
    [clave: string]: unknown;
}

/** GET /cotizaciones/:id/items/:itemId/despiece — página 2 de la Hoja de
 * Trabajo. `nivelCorte`/`hayErrores` son las mismas columnas denormalizadas
 * del ítem: sirven para avisar cuando la medida no está validada. */
export interface DespieceItem {
    perfiles: CorteDespiecePerfil[];
    vidrios: CorteDespieceVidrio[];
    nivelCorte: string | null;
    hayErrores: boolean;
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
    /** A qué propuesta pertenece. Desde 2026-09-20 un ítem cuelga de una
     * propuesta, no de la cotización: el LISTADO devuelve los de todas, así que
     * contar `items.length` sin filtrar por aquí suma variantes que el cliente
     * nunca va a comprar juntas. */
    propuestaId?: number | null;
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

// ─── Propuestas (A/B/C…) y cargos de obra ──────────────────────────────────
// Desde el 2026-09-20 la jerarquía es cotización → PROPUESTA → ítem. Una
// cotización es un contenedor de variantes de la MISMA obra (el mismo baño en
// 5 mm y en templado) y su total es el de la propuesta ELEGIDA; de ella, y de
// ninguna otra, sale la orden de corte.
//
// Los cargos de obra cuelgan de la propuesta —no del ítem— porque se cobran UNA
// vez: hasta ese día vivían dentro del BOM y `totalizar()` los multiplicaba por
// `cantidadPiezas`, así que una ventana con 5 piezas cobraba 5 fletes.

export type TipoCargo = 'SMO' | 'ANDAMIO' | 'HUACAL' | 'FLETE' | 'OTRO';
export type UnidadCargo = 'DIA' | 'UND' | 'GLOBAL';
/** `SUGERIDO` = el monto lo puso el sistema; `MANUAL` = lo escribió el vendedor
 * encima del sugerido. El backend lo guarda tal como llega. */
export type OrigenCargo = 'SUGERIDO' | 'MANUAL';

export interface CargoPropuesta {
    id: number;
    propuestaId: number;
    orden: number;
    tipo: TipoCargo;
    /** Para OTRO es el texto del servicio; para SMO, la etiqueta del tipo de obra. */
    descripcion: string | null;
    cantidad: number;
    unidad: UnidadCargo;
    valorUnitario: number;
    /** `cantidad × valorUnitario`. Lo calcula el backend: la UI no lo envía. */
    total: number;
    aplicaIva: boolean;
    origen: OrigenCargo;
}

/** Lo que viaja en `PUT /cotizaciones/:id/propuestas/:pid/cargos`. El backend
 * valida con Zod `.strict()`: una clave de más se responde con 400. */
export interface CargoEntrada {
    tipo: TipoCargo;
    descripcion?: string | null;
    cantidad?: number;
    unidad?: UnidadCargo;
    valorUnitario?: number;
    aplicaIva?: boolean;
    origen?: OrigenCargo;
}

export interface TotalesPropuesta {
    /** Σ `subtotalConAiu` de los ítems, SIN descuento: el precio de lista. */
    productos: number;
    descuento: number;
    /** Base de los cargos, sin IVA. Van fuera del AIU y fuera del descuento. */
    cargos: number;
    /** IVA de productos + IVA de cargos, sumados. */
    iva: number;
    total: number;
}

export interface Propuesta {
    id: number;
    cotizacionId: number;
    etiqueta: string;
    nombre: string | null;
    nota: string | null;
    elegida: boolean;
    /** Fracción (0,05 = 5%). Es el ÚNICO descuento vivo del módulo. */
    descuentoPct: number;
    /** Propuesta anterior al 2026-09-20: su mano de obra y su flete están DENTRO
     * del precio de cada ítem. `PUT .../cargos` la rechaza con 409 porque
     * añadirle cargos cobraría lo mismo dos veces; hay que duplicarla. */
    legadoCargosEnItems: boolean;
    totales: TotalesPropuesta;
    creadaEn?: string;
    actualizadaEn?: string;
    /** Sólo en el detalle (`GET /cotizaciones/:id`). El listado no los trae. */
    cargos?: CargoPropuesta[];
    /** El detalle trae los blobs (`input`/`resultado`) SOLO de la propuesta
     * activa; las demás llegan con sus ítems en modo ligero. */
    items?: Array<ItemCotizacionLigero | ItemCotizacion>;
}

/** Propuesta tal como la devuelve el LISTADO: cabecera y totales espejo, sin
 * ítems ni cargos. Es lo que necesita "Guardadas" para pintar el rango de una
 * cotización que todavía no tiene propuesta elegida. */
export type PropuestaLigera = Omit<Propuesta, 'cargos' | 'items'>;

export interface PropuestaEntrada {
    nombre?: string | null;
    nota?: string | null;
    elegida?: boolean;
    descuentoPct?: number;
    items?: ItemEntrada[];
    /** AUSENTE ≠ VACÍO: sin la clave, el backend sugiere mano de obra y flete;
     * con un arreglo vacío, la propuesta se queda deliberadamente sin cargos. */
    cargos?: CargoEntrada[];
}

// ─── Sugerencia de mano de obra ────────────────────────────────────────────

export type TipoObraSeleccion = 'cabinas' | 'fachadas' | 'armadaVentanas' | 'persiana' | 'otro';

export interface TipoObraListado {
    id: TipoObraSeleccion;
    etiqueta: string;
    /** Tarifa vigente en parámetros; 0 para `otro`, que es monto libre. */
    tarifa: number;
}

/** `GET /cotizaciones/:id/propuestas/:pid/smo-sugerido?tipoObra=…` */
export interface SugerenciaSMO {
    /** Total sugerido = `cantidad × tarifa`. */
    monto: number;
    /** "3 unidades × $60.000 (Armada de ventanas)". Se muestra BAJO el campo
     * para que el vendedor sepa de dónde sale y pueda defenderlo ante el
     * cliente. */
    explicacion: string;
    /** Valor POR UNIDAD del tipo de obra (2026-09-20: la mano de obra se cobra
     * por unidad instalada, no por metro cuadrado). */
    tarifa: number;
    /** Unidades sugeridas: la suma de piezas de la propuesta. */
    cantidad: number;
    /** Área total. Sólo informativa: ya no interviene en el cálculo del SMO. */
    areaM2: number;
    tiposObra: TipoObraListado[];
}

// ─── Comparador de propuestas — GET /cotizaciones/:id/comparar ─────────────

export interface PropuestaComparada {
    id: number;
    etiqueta: string;
    nombre: string | null;
    nota: string | null;
    elegida: boolean;
    descuentoPct: number;
    cantidadItems: number;
    totales: TotalesPropuesta;
    cargos: CargoPropuesta[];
    /** Diferencia contra la PRIMERA propuesta (la A), nunca contra la elegida:
     * un ancla que se mueve al elegir haría saltar los números delante del
     * cliente. */
    diferencia: number;
    diferenciaPct: number | null;
}

export interface ComparativaPropuestas {
    cotizacionId: number;
    numero: number;
    estado: EstadoCotizacion;
    baseEtiqueta: string | null;
    propuestas: PropuestaComparada[];
}

/** Respuesta de `POST /propuestas` y de `POST /propuestas/:pid/clonar`. El
 * clonado NO bloquea si un ítem sale con errores de precio: crea la propuesta y
 * devuelve `advertencias` para que la pantalla las muestre. */
export interface RespuestaPropuesta {
    propuestaId: number;
    advertencias?: string[];
    cotizacion: Cotizacion;
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
    /** LEGADO: la cabecera ya no guarda descuento (el vivo es el de la
     * propuesta). Se sigue emitiendo por sus 4 filas históricas. */
    descuentoPct: number;
    /** Espejo de la propuesta ELEGIDA. Sin elegida quedan en 0 A PROPÓSITO: un
     * total inventado presentaría como definitivo un precio que nadie escogió.
     * En ese caso hay que pintar el RANGO leyendo `propuestas[]`. */
    totales: { subtotal: number; iva: number; total: number };
    /** En el LISTADO son los ítems de TODAS las propuestas juntos. Para contar
     * los de una sola hay que filtrar por `propuestaId`. */
    items: ItemCotizacionLigero[];
    propuestas?: PropuestaLigera[];
    propuestaElegidaId?: number | null;
}

export interface Cotizacion extends Omit<CotizacionLigera, 'items' | 'propuestas'> {
    /** Los de la propuesta ACTIVA, con sus blobs. El "carrito" del frontend es,
     * literalmente, la propuesta que se está mirando. */
    items: ItemCotizacion[];
    propuestas?: Propuesta[];
    /** Cuál de las propuestas trae despiece en esta respuesta. */
    propuestaActivaId?: number | null;
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
    /** El backend lo aplica a la propuesta destino, NO a la cabecera. Es la vía
     * por la que la UI guarda el descuento de la propuesta activa junto con sus
     * ítems, en una sola escritura. */
    descuentoPct?: number;
    estado?: EstadoCotizacion;
    /** Ítems planos: van a `propuestaId` y, si no llega, a la elegida. */
    items?: ItemEntrada[];
    /** Forma nueva: varias propuestas de una vez. Sólo se usa al CREAR. */
    propuestas?: PropuestaEntrada[];
    propuestaId?: number;
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
    /** Motivos de la COTIZACIÓN entera, no de un ítem. Hoy sólo
     * `SIN_PROPUESTA_ELEGIDA`; vacío en el caso normal. */
    motivos?: MotivoAptitud[];
}

// ─── Parámetros globales — GET /parametros ──────────────────────────────────

export interface Parametros {
    aiu: number;
    iva: number;
    clientes: string[];
    flete_fijo: number;
    /** El SMO no es una tarifa única: el Excel matriz cobra una por tipo de obra
     * (Cabinas, Fachadas, solo armada de ventanas, Persiana). Debe seguir
     * reflejando `Parametros['smo']` del backend (backend-api/src/cotizador/tipos.ts). */
    smo: {
        tarifaMinima: number;
        pisoTableroGrande: number;
        cabinas: number;
        fachadas: number;
        armadaVentanas: number;
        persiana: number;
    };
    alquiler_andamio: number;
    huacal: number;
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

// ─── Calibración — espejo de cotizador_calibracion.controller.ts ───────────

export type MaterialCalibracion = 'aluminio' | 'vidrio';
export type NivelCorte = 'A' | 'B' | 'C';
export type AmbitoMargen = 'global' | 'sistema' | 'material' | 'pieza';
export type AmbitoHolgura = 'global' | 'sistema';

export interface EstadoSistemaCalibracion {
    sistema: string;
    estado: 'EN_CALIBRACION' | 'VALIDADO' | 'EN_PRODUCCION';
    pausadoManualmente: boolean;
    firmaMaestro: boolean;
    cobertura: number;
    piezasTotales: number;
    piezasConMargen: number;
    piezasVetadas: number;
    motivo: string;
    actualizadoEn: string | null;
    actualizadoPor: string | null;
}

export interface PiezaCalibracion {
    ref: string;
    material: MaterialCalibracion;
    nivelCorte: NivelCorte | null;
    margenEfectivo: { margenMm: number; origen: string; clave: string | null };
    contrastesVigentes: number;
}

export interface ContrasteCalibracion {
    id: number;
    registrado_en: string;
    anulado: boolean;
    motivo_anulacion: string | null;
    anulado_en: string | null;
    sistema: string;
    ref: string;
    material: MaterialCalibracion;
    medida_sistema_bruta_mm: number;
    medida_maestro_mm: number;
    ancho_vano_mm: number | null;
    alto_vano_mm: number | null;
    nota: string | null;
    registrado_por: string | null;
}

/** Respuesta de GET /calibracion/analisis — espejo de analizarPieza() en
 * lib/calibracion.ts. Los campos varían según `puedeProponer`, por eso viene
 * laxo (igual que ResultadoGuardado en el backend): un blob de diagnóstico, no
 * una estructura fija que valga la pena tipar campo por campo aquí. */
export interface AnalisisPieza {
    sistema: string;
    ref: string;
    material: MaterialCalibracion;
    nivelCorte: NivelCorte | null;
    puedeProponer: boolean;
    motivo: string | null;
    margenMm?: number;
    tipo?: 'offset' | 'factor';
    explicacion?: string;
    accionSugerida?: string;
    anchosSugeridos?: number[];
    faltan?: number;
    [clave: string]: unknown;
}

export interface HolguraCalibracion {
    id: number;
    ambito: AmbitoHolgura;
    sistema: string | null;
    ancho_mm: number;
    alto_mm: number;
    nota: string | null;
    definido_por: string | null;
    definido_en: string;
    vigente: boolean;
}

export interface HistorialCalibracion {
    id: number;
    fecha: string;
    accion: 'aprobar-margen' | 'anular-margen' | 'fijar-holgura' | 'anular-holgura' | 'cambiar-estado';
    payload: Record<string, unknown>;
}

// ─── Configuración — multiplicadores por categoría ─────────────────────────

/** Una categoría del catálogo del Cotizador y su multiplicador costo→venta.
 * `configurado: false` NO significa multiplicador 1.0: significa que el motor
 * de sincronización se abstiene de tocar esos productos (misma invariante
 * AUSENTE ≠ CERO que defiende el módulo de calibración). */
export interface MultiplicadorCategoria {
    categoria: string;
    productos: number;
    /** Productos de la categoría vinculados a `catalogo_productos`: sin vínculo
     * no hay proveedor del que derivar costo, por mucho multiplicador que haya. */
    vinculados: number;
    configurado: boolean;
    multiplicadorPa: number | null;
    multiplicadorPm: number | null;
    multiplicadorPb: number | null;
    actualizadoEn: string | null;
    actualizadoPor: string | null;
    nota: string | null;
}

/**
 * `fase` distingue de dónde sale el número (ver el controlador):
 *   - 'proveedor'   — el costo se derivó del proveedor más barato.
 *   - 'realineacion' — el costo se conservó y sólo se realineó el precio de
 *     venta al multiplicador de la categoría (productos sin proveedor).
 */
export type FaseRecalculo = 'proveedor' | 'realineacion';

export interface ResultadoRecalculoCategoria {
    categoria: string;
    dryRun: boolean;
    productosEnCategoria: number;
    sinVinculoACatalogo: number;
    porProveedor: number;
    realineados: number;
    cambios: Array<{
        codigo: string;
        categoria: string;
        fase: FaseRecalculo;
        antes: { costo_unitario: number; precio_pa: number; precio_pm: number; precio_pb: number };
        despues: { costo_unitario: number; precio_pa: number; precio_pm: number; precio_pb: number };
    }>;
    omitidos: Array<{ codigo: string; motivo: string }>;
    resumen: string;
}

import { CampoMeta, ModuloMeta, OpcionCampo, ResultadoCalculo } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Ficha del producto configurado: lo que el vendedor eligió, en texto legible,
// para el bloque "Este producto" y la lista de ítems del resumen (2026-09-26).
// Antes era el componente `FichaProducto`, una tarjeta de dos columnas en el
// centro de Cotizar; con la mesa de trabajo sus datos pasaron al panel de la
// derecha y lo que queda es esta función pura.
//
// NO CALCULA NADA. Todo sale de `input` (lo que se envió a cotizar) y de
// `resultado` (lo que devolvió el motor); no llama a ninguna API, no deriva
// precios ni geometría. Si un dato no está, se omite en vez de inventarlo.
//
// DOS COSAS QUE HAY QUE RESPETAR AQUÍ:
//
//   1. UNIDADES. El motor trabaja en CENTÍMETROS (`anchoCm`, `altoCm`,
//      `anchoNaveCm`, `altoNaveCm`) y el vendedor lee MILÍMETROS. Aquí se
//      multiplica por 10 SÓLO para mostrar. La conversión de entrada vive en
//      `CampoDinamico`, el único punto del árbol donde se convierte mm↔cm.
//   2. ETIQUETAS. Los valores crudos del input son códigos (`CL6MM03SP`,
//      `gris plata`). El texto legible sale de `modulo.campos[].opciones[].label`,
//      el mismo contrato data-driven del formulario. Si la opción ya no existe
//      (cotización vieja), se muestra el valor crudo.
// ─────────────────────────────────────────────────────────────────────────────

export interface Ficha {
    /** "1.000 × 1.000 mm", o null si el ítem no tiene medidas (ítem libre). */
    medidas: string | null;
    sistema: string | null;
    color: string | null;
    /** Etiqueta del diseño; null en medida libre. */
    diseno: string | null;
    nivelCorte: string | null;
    vidrio: string | null;
    acabados: string | null;
    /** Qué película lleva ("película control solar titanio"), o null. Desde el
     * 2026-09-27 es un código; `true` de antes = la película normal. */
    pelicula: string | null;
    conInstalacion: boolean | null;
    enL: boolean;
    piezas: number;
}

const esVacio = (valor: unknown): boolean => valor === '' || valor === undefined || valor === null;

function labelDeOpcion(campo: CampoMeta | null, valor: unknown): string | null {
    if (esVacio(valor)) return null;
    if (!campo || !campo.opciones) return String(valor);
    const encontrada = campo.opciones.find(
        o => (typeof o === 'object' && o !== null ? (o as OpcionCampo).value : o) === valor
    );
    if (encontrada === undefined) return String(valor);
    return typeof encontrada === 'object' ? (encontrada as OpcionCampo).label : String(encontrada);
}

/** cm → mm, sólo para mostrar. Redondea: 60,3 × 10 en coma flotante da 602.999… */
function aMilimetros(valor: unknown): number | null {
    const n = Number(valor);
    if (!Number.isFinite(n) || n === 0) return null;
    return Math.round(n * 10);
}

const mil = (n: number) => n.toLocaleString('es-CO');

/** Nombre legible de la película a partir de la etiqueta de su opción, sin el
 * "(precio a cotizar)" que solo le sirve al asesor al elegirla. */
function nombrePelicula(campo: CampoMeta | null, valor: unknown): string | null {
    if (valor === true || valor === 'true') return 'película';
    if (esVacio(valor) || valor === false) return null;
    const label = labelDeOpcion(campo, valor) ?? String(valor);
    return label.replace(/\s*\(precio a cotizar\)\s*$/i, '').trim().toLowerCase().replace(/^pelicula\b/, 'película');
}

export function leerFicha(
    input: Record<string, unknown> | null | undefined,
    resultado?: ResultadoCalculo | null,
    modulo?: ModuloMeta | null,
): Ficha {
    const i = input ?? {};
    const campos = modulo?.campos ?? [];
    const campoDe = (nombre: string): CampoMeta | null => campos.find(c => c.nombre === nombre) ?? null;

    /** Primer campo con valor de una lista de alias: cada módulo bautiza lo
     * suyo (`sistema` / `tipoSistema`; `anchoCm` / `anchoNaveCm`). */
    const textoDe = (...nombres: string[]): string | null => {
        for (const nombre of nombres) {
            if (!esVacio(i[nombre])) return labelDeOpcion(campoDe(nombre), i[nombre]);
        }
        return null;
    };

    const anchoMm = aMilimetros(i.anchoCm ?? i.anchoNaveCm);
    const altoMm = aMilimetros(i.altoCm ?? i.altoNaveCm);
    const disenoRef = resultado?.diseno ?? null;
    const disenoId = typeof i.disenoId === 'string' && i.disenoId ? i.disenoId : null;

    const vidrio = textoDe('codigoVidrio');
    const espesor = textoDe('espesorVidrioMm', 'espesorMm');

    // `matizado` es select en unos módulos; una cotización vieja puede traerlo
    // como booleano (ver codigoMatizado en el backend).
    const matizado = i.matizado === true
        ? 'Matizado total'
        : (esVacio(i.matizado) || i.matizado === false ? null : labelDeOpcion(campoDe('matizado'), i.matizado));

    const piezas = Number(i.cantidadPiezas);
    let medidas = anchoMm || altoMm ? `${anchoMm ? mil(anchoMm) : '?'} × ${altoMm ? mil(altoMm) : '?'} mm` : null;
    // Proyectante sin diseño: las medidas capturadas son las de CADA nave.
    const naves = Math.floor(Number(i.numeroNaves));
    if (medidas && esVacio(i.anchoCm) && !esVacio(i.anchoNaveCm) && naves > 1) {
        medidas = `${naves} naves de ${medidas}`;
    }
    return {
        medidas,
        sistema: textoDe('sistema', 'tipoSistema') ?? disenoRef?.sistema ?? null,
        color: textoDe('colorPerfileria', 'acabado'),
        diseno: disenoRef ? (disenoRef.etiqueta || disenoRef.diseno || disenoRef.id) : disenoId,
        nivelCorte: disenoRef?.nivelCorte ?? null,
        vidrio: vidrio ?? (espesor ? `${espesor} mm` : null),
        acabados: matizado,
        pelicula: nombrePelicula(campoDe('pelicula'), i.pelicula),
        conInstalacion: 'conInstalacion' in i ? i.conInstalacion === true : null,
        enL: i.enL === true,
        piezas: Number.isFinite(piezas) && piezas > 0 ? Math.floor(piezas) : 1,
    };
}

// ─── Reglas de diseño compartidas con el formulario ─────────────────────────
// Viven aquí y no en FormularioModulo para que la Hoja de Trabajo describa el
// ítem con el mismo criterio con el que se capturó.

/** Módulos cuyo backend cotiza "por diseño" cuando llega `disenoId` (despiece
 * real, plano y cortes). Hasta el 2026-09-26 el selector solo aparecía en
 * ventanas, aunque proyectantes, cabinas y espejo ya aceptaban diseño. */
export const MODULOS_CON_DISENO: ReadonlySet<string> = new Set([
    'ventanas', 'proyectantes', 'cabinas-corredizas', 'cabinas-batientes', 'espejo',
]);

/** Campos que el backend deduce del diseño y deja de leer del input cuando llega
 * `disenoId`: ventanas saca cuerpos y alas del código; proyectantes, el número
 * de naves; cabinas corredizas, el kit de perfiles (corrediza, Primavera,
 * Torino), que reemplaza a `tipoSistema`; espejo, el soporte (el flotante trae
 * su T-76 en el despiece, el elevado y el de marco no llevan tubular). */
export const CAMPOS_DERIVADOS_DEL_DISENO: Readonly<Record<string, readonly string[]>> = {
    ventanas: ['cuerpos', 'alasCorredizas'],
    proyectantes: ['numeroNaves'],
    'cabinas-corredizas': ['tipoSistema'],
    espejo: ['tubularCantidad'],
};

/** Proyectantes por diseño trabaja con la medida TOTAL del vano, no la de cada
 * nave (proyectantes.ts: `input.anchoCm ?? input.anchoNaveCm`). Con diseño, los
 * mismos campos se rotulan como total y el formulario los envía además como
 * anchoCm/altoCm, que es lo que leen el backend, la mano de obra y el plano. */
export const ETIQUETAS_CON_DISENO: Readonly<Record<string, Readonly<Record<string, string>>>> = {
    proyectantes: { anchoNaveCm: 'Ancho total (mm)', altoNaveCm: 'Alto total (mm)' },
};

// ─── Ficha de fabricación ───────────────────────────────────────────────────

export interface Especificacion {
    etiqueta: string;
    valor: string;
}

/** Campos que no describen el producto: el segmento es de la cotización, la
 * cantidad ya va en la cabecera de la hoja y las líneas del ítem libre se
 * imprimen como lista de materiales. */
const CAMPOS_FUERA_DE_FICHA = new Set(['segmentoCliente', 'cantidadPiezas', 'descripcionItem']);

/** "Ancho (mm)" → "Ancho": la unidad ya va en el valor. */
const sinUnidad = (etiqueta: string) => etiqueta.replace(/\s*\((mm|cm|%|unidades[^)]*)\)\s*$/i, '').trim();

/**
 * Todo lo que el asesor eligió en el formulario, campo por campo, en texto
 * legible. Es la ficha que imprime la Hoja de Trabajo cuando el ítem no tiene
 * diseño (y por eso tampoco plano ni cortes): el taller necesita al menos saber
 * qué se vendió. Sale del contrato data-driven del módulo, así que sirve para
 * los 7 módulos sin conocer ninguno.
 */
/**
 * ¿El campo aplica con lo que hay en el formulario? (2026-10-04). Une las dos
 * reglas de visibilidad que dependen de otros campos: `soloSi` (una casilla
 * marcada) y `soloSiValor` (otro campo con uno de ciertos valores, p. ej. el
 * ancho de puerta solo en una división batiente). La usan el formulario —para
 * ocultar y no exigir— y la Hoja de Trabajo —para no imprimir lo que no aplica—.
 */
export function campoAplica(campo: CampoMeta, input: Record<string, unknown> | null | undefined): boolean {
    const i = input ?? {};
    if (campo.soloSi && !(i[campo.soloSi] === true || i[campo.soloSi] === 'true')) return false;
    for (const cond of campo.soloSiValor ?? []) {
        if (!cond.valores.some(v => String(v) === String(i[cond.campo] ?? ''))) return false;
    }
    return true;
}

export function especificaciones(
    input: Record<string, unknown> | null | undefined,
    modulo: ModuloMeta | null | undefined,
): Especificacion[] {
    const i = input ?? {};
    if (!modulo) return [];
    const conDiseno = MODULOS_CON_DISENO.has(modulo.id) && typeof i.disenoId === 'string' && Boolean(i.disenoId);
    const derivados = conDiseno ? (CAMPOS_DERIVADOS_DEL_DISENO[modulo.id] ?? []) : [];
    const etiquetas = conDiseno ? ETIQUETAS_CON_DISENO[modulo.id] : undefined;

    const salida: Especificacion[] = [];
    for (const campo of modulo.campos) {
        if (CAMPOS_FUERA_DE_FICHA.has(campo.nombre) || campo.tipo === 'lineas' || derivados.includes(campo.nombre)) continue;
        if (!campoAplica(campo, i)) continue;
        const valor = i[campo.nombre];
        const etiqueta = sinUnidad(etiquetas?.[campo.nombre] ?? campo.etiqueta);
        let texto: string | null = null;
        if (campo.tipo === 'boolean') {
            texto = valor === true || valor === 'true' ? 'Sí' : 'No';
        } else if (campo.tipo === 'select') {
            texto = labelDeOpcion(campo, valor);
            // Espesores (espesorMm, espesorVidrioMm): opciones numéricas sin unidad.
            if (texto && /Mm$/.test(campo.nombre) && /^\d+([.,]\d+)?$/.test(texto)) texto = `${texto} mm`;
        } else if (campo.tipo === 'number') {
            if (/Cm$/.test(campo.nombre)) {
                const mm = aMilimetros(valor);
                texto = mm ? `${mil(mm)} mm` : null;
            } else if (!esVacio(valor) && Number.isFinite(Number(valor))) {
                texto = mil(Number(valor));
            }
        } else if (!esVacio(valor)) {
            texto = String(valor);
        }
        if (texto) salida.push({ etiqueta, valor: texto });
    }
    return salida;
}

/**
 * La descripción del ítem para listas y tablas, la misma que imprime el PDF:
 * "Sala — Suministro e instalación de ventana 744 color mate, vidrio claro 4 mm
 * crudo, medidas 1.000 × 1.000 mm". La arma el backend y viaja en
 * `resultado.descripcionComercial`; aquí no se reimplementa, para que pantalla y
 * PDF no digan cosas distintas. Un ítem calculado antes de que existiera cae a
 * un respaldo con la ficha: "Sala — Ventanas · 1.000 × 1.000 mm · Mate · …".
 */
export function descripcionDeItem(
    input: Record<string, unknown> | null | undefined,
    resultado: ResultadoCalculo | null | undefined,
    modulo: ModuloMeta | null | undefined,
    nombreModulo: string,
): string {
    const frase = resultado?.descripcionComercial;
    if (typeof frase === 'string' && frase.trim()) return frase;
    const ficha = leerFicha(input, resultado, modulo);
    const ubicacion = typeof input?.descripcionItem === 'string' ? input.descripcionItem.trim() : '';
    const cuerpo = [nombreModulo, ficha.medidas, detalleCorto(ficha)].filter(Boolean).join(' · ');
    return ubicacion ? `${ubicacion} — ${cuerpo}` : cuerpo;
}

/** Una línea corta para listas: "Mate · Claro 5 mm · con instalación". */
export function detalleCorto(f: Ficha): string {
    return [
        f.color,
        f.vidrio,
        f.acabados,
        f.pelicula ? `con ${f.pelicula}` : null,
        f.conInstalacion === null ? null : f.conInstalacion ? 'con instalación' : 'sin instalación',
        f.enL ? 'en L' : null,
    ].filter(Boolean).join(' · ');
}

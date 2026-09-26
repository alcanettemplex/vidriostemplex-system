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
    pelicula: boolean;
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
    return {
        medidas: anchoMm || altoMm ? `${anchoMm ? mil(anchoMm) : '?'} × ${altoMm ? mil(altoMm) : '?'} mm` : null,
        sistema: textoDe('sistema', 'tipoSistema') ?? disenoRef?.sistema ?? null,
        color: textoDe('colorPerfileria', 'acabado'),
        diseno: disenoRef ? (disenoRef.etiqueta || disenoRef.diseno || disenoRef.id) : disenoId,
        nivelCorte: disenoRef?.nivelCorte ?? null,
        vidrio: vidrio ?? (espesor ? `${espesor} mm` : null),
        acabados: matizado,
        pelicula: i.pelicula === true,
        conInstalacion: 'conInstalacion' in i ? i.conInstalacion === true : null,
        enL: i.enL === true,
        piezas: Number.isFinite(piezas) && piezas > 0 ? Math.floor(piezas) : 1,
    };
}

/** Una línea corta para listas: "Mate · Claro 5 mm · con instalación". */
export function detalleCorto(f: Ficha): string {
    return [
        f.color,
        f.vidrio,
        f.acabados,
        f.pelicula ? 'con película' : null,
        f.conInstalacion === null ? null : f.conInstalacion ? 'con instalación' : 'sin instalación',
        f.enL ? 'en L' : null,
    ].filter(Boolean).join(' · ');
}

import React from 'react';
import { ClipboardList } from 'lucide-react';

import { CampoMeta, ModuloMeta, OpcionCampo, ResultadoCalculo as TResultadoCalculo } from '../types';
import { Chip, EstadoVacio, FilaDato, Tarjeta } from './ui';

// ─────────────────────────────────────────────────────────────────────────────
// Ficha del producto configurado: lo que el vendedor acaba de elegir, resumido
// en dos columnas, para poder leérselo al cliente sin volver a subir al
// formulario.
//
// NO CALCULA NADA. Todo sale de `input` (lo que se envió a cotizar) y de
// `resultado` (lo que devolvió el motor); no llama a ninguna API, no deriva
// precios ni geometría y no guarda estado. Si un dato no está, se omite la
// fila en vez de inventarla.
//
// DOS COSAS QUE HAY QUE RESPETAR AQUÍ:
//
//   1. UNIDADES. El motor trabaja en CENTÍMETROS (`anchoCm`, `altoCm`,
//      `anchoNaveCm`, `altoNaveCm`) y el vendedor lee MILÍMETROS. Esta ficha
//      multiplica por 10 SÓLO para mostrar — igual que `descripcionRespaldo`
//      en TabActual. El dato interno sigue en cm y no se toca: la conversión
//      de entrada vive en `CampoDinamico`, que es el único punto del árbol
//      donde se convierte mm↔cm.
//   2. ETIQUETAS. Los valores crudos del input son códigos (`CL6MM03SP`,
//      `gris plata`). El texto legible sale de `modulo.campos[].opciones[].label`,
//      que es el mismo contrato data-driven del formulario. Si la opción ya no
//      existe en el catálogo (cotización vieja), se muestra el valor crudo en
//      vez de dejar el hueco.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
    /** El input tal como se envió a `POST /cotizar/:moduloId`. */
    input: Record<string, unknown>;
    /** Salida del motor. Sólo se lee `diseno` (etiqueta y nivel de corte): es
     * el único dato de la ficha que el backend resuelve y el input no tiene. */
    resultado?: TResultadoCalculo | null;
    /** Metadatos del módulo activo, para traducir códigos a etiquetas. Sin
     * ellos la ficha sigue funcionando, mostrando los valores crudos. */
    modulo?: ModuloMeta | null;
}

const esVacio = (valor: unknown): boolean => valor === '' || valor === undefined || valor === null;

/** Etiqueta legible de un valor de campo `select` — misma regla que usa
 * `FormularioModulo` para sus chips de spec en vivo. */
function labelDeOpcion(campo: CampoMeta | null, valor: unknown): string | null {
    if (esVacio(valor)) return null;
    if (!campo || !campo.opciones) return String(valor);
    const encontrada = campo.opciones.find(
        o => (typeof o === 'object' && o !== null ? (o as OpcionCampo).value : o) === valor
    );
    if (encontrada === undefined) return String(valor);
    return typeof encontrada === 'object' ? (encontrada as OpcionCampo).label : String(encontrada);
}

/** cm → mm, sólo para mostrar. Redondea porque el producto de un decimal por
 * 10 en coma flotante da 602.9999…, y una cota con decimales fantasma en la
 * ficha que se le lee al cliente resta credibilidad al resto. */
function aMilimetros(valor: unknown): number | null {
    const n = Number(valor);
    if (!Number.isFinite(n) || n === 0) return null;
    return Math.round(n * 10);
}

const FichaProducto: React.FC<Props> = ({ input, resultado, modulo }) => {
    const campos = modulo?.campos ?? [];
    const campoDe = (nombre: string): CampoMeta | null => campos.find(c => c.nombre === nombre) ?? null;

    /** Primer nombre de campo con valor, de una lista de alias: cada módulo
     * bautiza lo suyo (`sistema` en ventanas, `tipoSistema` en cabinas;
     * `anchoCm` casi en todos, `anchoNaveCm` en proyectantes). */
    const primerValor = (...nombres: string[]): { nombre: string; valor: unknown } | null => {
        for (const nombre of nombres) {
            const valor = input?.[nombre];
            if (!esVacio(valor)) return { nombre, valor };
        }
        return null;
    };

    const textoDe = (...nombres: string[]): string | null => {
        const hit = primerValor(...nombres);
        if (!hit) return null;
        return labelDeOpcion(campoDe(hit.nombre), hit.valor);
    };

    // ── Medidas: cm por dentro, mm en pantalla ──────────────────────────────
    const anchoMm = aMilimetros(input?.anchoCm ?? input?.anchoNaveCm);
    const altoMm = aMilimetros(input?.altoCm ?? input?.altoNaveCm);
    const medidas = anchoMm || altoMm
        ? `${anchoMm ?? '?'} × ${altoMm ?? '?'} mm`
        : null;

    // ── Diseño: lo resuelve el backend; el input sólo trae el id ────────────
    const disenoRef = resultado?.diseno ?? null;
    const disenoIdInput = typeof input?.disenoId === 'string' && input.disenoId ? input.disenoId : null;
    const textoDiseno = disenoRef
        ? (disenoRef.etiqueta || disenoRef.diseno || disenoRef.id)
        : disenoIdInput;
    const valorDiseno: React.ReactNode = textoDiseno
        ? (
            <span className="inline-flex items-center gap-1.5">
                <span>{textoDiseno}</span>
                {disenoRef?.nivelCorte && (
                    <Chip tono="indigo" title="Nivel de corte del diseño">{`Nivel ${disenoRef.nivelCorte}`}</Chip>
                )}
            </span>
        )
        : 'Medidas libres (sin diseño)';

    const sistema = textoDe('sistema', 'tipoSistema') ?? disenoRef?.sistema ?? null;

    // ── Vidrio: código de catálogo o espesor, según el módulo ───────────────
    const vidrio = textoDe('codigoVidrio');
    const espesor = primerValor('espesorVidrioMm', 'espesorMm');
    const textoVidrio = vidrio ?? (espesor ? `${String(espesor.valor)} mm` : null);

    // ── Acabados: `matizado` es select en unos módulos; una cotización vieja
    //    puede traerlo como booleano (ver codigoMatizado en el backend) ──────
    const matizadoCrudo = input?.matizado;
    const textoMatizado = matizadoCrudo === true
        ? 'Matizado total'
        : (esVacio(matizadoCrudo) || matizadoCrudo === false ? null : labelDeOpcion(campoDe('matizado'), matizadoCrudo));

    const tienePelicula = 'pelicula' in (input ?? {});
    const textoPelicula = tienePelicula ? (input.pelicula ? 'Incluida' : 'Sin película') : null;

    type Fila = { etiqueta: string; valor: React.ReactNode; numerico?: boolean };
    const filas: Fila[] = [
        { etiqueta: campoDe('segmentoCliente')?.etiqueta ?? 'Tipo de cliente', valor: textoDe('segmentoCliente') },
        { etiqueta: 'Sistema', valor: sistema },
        { etiqueta: campoDe('colorPerfileria')?.etiqueta ?? 'Color de perfilería', valor: textoDe('colorPerfileria', 'acabado') },
        { etiqueta: 'Medidas', valor: medidas, numerico: true },
        { etiqueta: 'Diseño', valor: valorDiseno },
        { etiqueta: 'Vidrio', valor: textoVidrio },
        { etiqueta: 'Acabados', valor: textoMatizado },
        { etiqueta: 'Película', valor: textoPelicula },
    ].filter(f => f.valor !== null && f.valor !== undefined && f.valor !== '');

    if (filas.length === 0) {
        return (
            <Tarjeta titulo="Ficha del producto" icono={ClipboardList}>
                <EstadoVacio
                    icono={ClipboardList}
                    titulo="Todavía no hay datos del producto"
                    detalle="Completa la configuración de la izquierda y pulsa Calcular para ver aquí el resumen de lo elegido."
                />
            </Tarjeta>
        );
    }

    // Dos columnas en escritorio, una en móvil. El reparto es por mitades para
    // que las dos columnas terminen a la misma altura con un número impar de
    // filas (la primera se queda con la de más).
    const corte = Math.ceil(filas.length / 2);
    const columnas = [filas.slice(0, corte), filas.slice(corte)];

    return (
        <Tarjeta titulo="Ficha del producto" icono={ClipboardList}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
                {columnas.map((columna, i) => (
                    <dl key={i}>
                        {columna.map(f => (
                            <FilaDato key={f.etiqueta} etiqueta={f.etiqueta} valor={f.valor} numerico={f.numerico} />
                        ))}
                    </dl>
                ))}
            </div>
        </Tarjeta>
    );
};

export default FichaProducto;

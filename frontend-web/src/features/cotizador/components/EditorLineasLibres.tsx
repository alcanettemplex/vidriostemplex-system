import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, Search, AlertTriangle } from '../../../components/ui/icons';

import { apiGetCatalogo } from '../services/cotizadorApi';
import { LineaLibre, ProductoCatalogo, SegmentoCliente } from '../types';
import { fmtCOP } from '../format';
import { buscarEnCatalogo, MIN_BUSQUEDA, precioDe, rotuloCantidad } from '../catalogoUtil';
import { claseControl, CONTROL_LABEL_CLASS } from './ui';

// ─────────────────────────────────────────────────────────────────────────────
// Tabla editable de líneas del módulo "Ítem libre": el vendedor elige un código
// del catálogo, escribe una cantidad y ve el precio al instante.
//
// Reemplaza los TRECE bloques "PLANTILLAS" de la hoja `Formato Digital` del
// Excel de los asesores, donde esto mismo se hacía con `VLOOKUP` sobre
// `Tabla_Costos`: código a la izquierda, descripción/unidad/precio resueltos
// solos, y una celda de cantidad cuyo significado dependía de la unidad del
// producto.
//
// LA UNIDAD MANDA. No hay un selector de "tipo de línea": el catálogo dice si el
// código se cotiza `X M2`, `X METRO`/`ML` o `UND`, y de ahí sale el rótulo de la
// cantidad (m² / ml / und). Es la misma regla que aplica el motor en
// `modules/itemLibre.ts` (`claseDeUnidad`), duplicada aquí sólo para rotular:
// quien calcula sigue siendo el backend.
//
// PRECIO A COTIZAR (2026-09-26): un producto con `precioACotizar` (KVE001, los
// vidrios sobre pedido) no tiene precio de catálogo. La fila muestra un aviso y
// una casilla para el COSTO que el proveedor le dio al asesor; el precio de
// venta lo calcula el backend con el multiplicador del segmento, por eso aquí
// esas filas no muestran precio ni suman al total previo.
//
// EL CATÁLOGO SE PIDE UNA VEZ, ENTERO. Es la excepción que documenta
// `apiGetCatalogo`: el vendedor puede necesitar cualquier código, el endpoint
// responde desde la caché en memoria del backend (no toca Postgres, no suma
// egress) y filtrar en memoria evita una petición por tecla.
// ─────────────────────────────────────────────────────────────────────────────

/** Cuántas coincidencias se ofrecen a la vez. Más que esto y la lista tapa el
 * formulario en vez de ayudar; el vendedor afina la búsqueda. La búsqueda, el
 * rótulo por unidad y el precio por segmento viven en `catalogoUtil.ts`,
 * compartidos con la personalización de componentes. */
const MAX_SUGERENCIAS = 8;

interface Props {
    value: LineaLibre[];
    onChange: (lineas: LineaLibre[]) => void;
    /** Segmento elegido en el formulario: decide cuál de los tres precios se
     * previsualiza. Llega desde `FormularioModulo`, que es quien tiene el input
     * completo — `CampoDinamico` solo lo pasa de largo. */
    segmento: SegmentoCliente;
    error?: string | null;
}

const EditorLineasLibres: React.FC<Props> = ({ value, onChange, segmento, error }) => {
    const [catalogo, setCatalogo] = useState<ProductoCatalogo[]>([]);
    const [cargando, setCargando] = useState(true);
    const [fallo, setFallo] = useState(false);
    // Índice de la fila cuyo buscador está abierto, y el texto que se escribió.
    // Uno solo a la vez: dos listas abiertas se superponen.
    const [filaAbierta, setFilaAbierta] = useState<number | null>(null);
    const [busqueda, setBusqueda] = useState('');
    const contenedorRef = useRef<HTMLDivElement>(null);

    const lineas = Array.isArray(value) ? value : [];

    useEffect(() => {
        let vivo = true;
        apiGetCatalogo()
            .then(({ data }) => { if (vivo) setCatalogo(Array.isArray(data) ? data : []); })
            .catch(() => { if (vivo) setFallo(true); })
            .finally(() => { if (vivo) setCargando(false); });
        return () => { vivo = false; };
    }, []);

    // Cerrar el buscador al hacer clic fuera. Sin esto queda una lista flotando
    // sobre el resto del formulario y tapando los campos de abajo.
    useEffect(() => {
        if (filaAbierta === null) return;
        const alClic = (e: MouseEvent) => {
            if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) {
                setFilaAbierta(null);
            }
        };
        document.addEventListener('mousedown', alClic);
        return () => document.removeEventListener('mousedown', alClic);
    }, [filaAbierta]);

    const porCodigo = useMemo(() => {
        const mapa = new Map<string, ProductoCatalogo>();
        catalogo.forEach(p => mapa.set(p.codigo.toUpperCase(), p));
        return mapa;
    }, [catalogo]);

    const sugerencias = useMemo(
        () => buscarEnCatalogo(catalogo, busqueda, MAX_SUGERENCIAS),
        [busqueda, catalogo]
    );

    const actualizar = (i: number, cambio: Partial<LineaLibre>) => {
        onChange(lineas.map((l, idx) => (idx === i ? { ...l, ...cambio } : l)));
    };

    const agregar = () => {
        onChange([...lineas, { codigo: '', cantidad: '' }]);
        // La fila nueva abre su buscador sola: agregarla y tener que hacer un
        // clic más para poder escribir es un paso de sobra en un formulario que
        // se llena muchas veces al día.
        setFilaAbierta(lineas.length);
        setBusqueda('');
    };

    const quitar = (i: number) => {
        onChange(lineas.filter((_, idx) => idx !== i));
        setFilaAbierta(null);
    };

    const elegir = (i: number, producto: ProductoCatalogo) => {
        // El costo escrito es del producto anterior: no se hereda al nuevo.
        actualizar(i, { codigo: producto.codigo, costo: undefined });
        setFilaAbierta(null);
        setBusqueda('');
    };

    const totalLineas = lineas.reduce((acc, l) => {
        const p = porCodigo.get(String(l.codigo).toUpperCase());
        const cant = Number(l.cantidad);
        if (!p || p.precioACotizar || !Number.isFinite(cant)) return acc;
        return acc + precioDe(p, segmento) * cant;
    }, 0);

    return (
        <div ref={contenedorRef}>
            <label className={CONTROL_LABEL_CLASS}>
                Materiales y acabados <span className="text-rose-500">*</span>
            </label>

            {fallo && (
                <p className="mb-2 text-[12px] text-rose-700 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    No se pudo cargar el catálogo. Recarga la página para volver a intentarlo.
                </p>
            )}

            <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
                {/* Cabecera: sólo desde sm. En móvil cada línea se lee como
                    tarjeta apilada y una cabecera de 5 columnas no aplicaría. */}
                <div className="hidden sm:grid grid-cols-[minmax(0,2.2fr)_88px_110px_110px_32px] gap-2 px-3 py-2 bg-slate-50 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wide text-slate-900">
                    <span>Producto</span>
                    <span className="text-right">Cantidad</span>
                    <span className="text-right">Precio unit.</span>
                    <span className="text-right">Subtotal</span>
                    <span />
                </div>

                {lineas.length === 0 && (
                    <p className="px-3 py-4 text-[12.5px] text-slate-700">
                        Sin líneas todavía. Agrega el vidrio, los perfiles y los accesorios que lleva este ítem.
                    </p>
                )}

                {lineas.map((linea, i) => {
                    const producto = porCodigo.get(String(linea.codigo).toUpperCase()) ?? null;
                    const desconocido = Boolean(String(linea.codigo).trim()) && !producto && !cargando;
                    const precio = producto ? precioDe(producto, segmento) : 0;
                    const cant = Number(linea.cantidad);
                    const subtotal = producto && Number.isFinite(cant) ? precio * cant : 0;
                    const abierto = filaAbierta === i;
                    const aCotizar = Boolean(producto?.precioACotizar);
                    const sinCosto = aCotizar && !(Number(linea.costo) > 0);

                    return (
                        <div
                            key={i}
                            className="grid grid-cols-1 sm:grid-cols-[minmax(0,2.2fr)_88px_110px_110px_32px] gap-2 px-3 py-2 border-b border-slate-100 last:border-b-0 items-start"
                        >
                            {/* ── Producto: buscador + lo ya elegido ── */}
                            <div className="min-w-0 relative">
                                {abierto ? (
                                    <>
                                        <div className="relative">
                                            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                                            <input
                                                autoFocus
                                                className={claseControl(false, 'pl-8 text-[12.5px]')}
                                                placeholder={cargando ? 'Cargando catálogo…' : 'Código o descripción…'}
                                                disabled={cargando}
                                                value={busqueda}
                                                onChange={e => setBusqueda(e.target.value)}
                                                onKeyDown={e => {
                                                    if (e.key === 'Escape') { setFilaAbierta(null); setBusqueda(''); }
                                                    // Enter con una sola coincidencia la toma: el caso
                                                    // normal cuando el vendedor escribe el código exacto.
                                                    if (e.key === 'Enter' && sugerencias.length > 0) {
                                                        e.preventDefault();
                                                        elegir(i, sugerencias[0]);
                                                    }
                                                }}
                                            />
                                        </div>
                                        {busqueda.trim().length >= MIN_BUSQUEDA && (
                                            <ul className="absolute z-20 left-0 right-0 mt-1 max-h-64 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                                                {sugerencias.length === 0 && (
                                                    <li className="px-3 py-2 text-[12px] text-slate-700">Sin coincidencias.</li>
                                                )}
                                                {sugerencias.map(p => (
                                                    <li key={p.codigo}>
                                                        <button
                                                            type="button"
                                                            onClick={() => elegir(i, p)}
                                                            className="w-full text-left px-3 py-2 hover:bg-templex-50 border-b border-slate-100 last:border-b-0"
                                                        >
                                                            <span className="block text-[12px] font-semibold text-slate-900">{p.codigo}</span>
                                                            <span className="block text-[11.5px] text-slate-800 leading-snug">{p.descripcion}</span>
                                                            <span className="block text-[11px] text-slate-700 mt-0.5">
                                                                {p.unidad} · {fmtCOP(precioDe(p, segmento))}
                                                            </span>
                                                        </button>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => { setFilaAbierta(i); setBusqueda(String(linea.codigo || '')); }}
                                        className={
                                            'w-full text-left rounded-lg border px-2.5 py-1.5 transition ' +
                                            (desconocido
                                                ? 'border-rose-300 bg-rose-50/50 hover:border-rose-400'
                                                : 'border-slate-300 bg-white hover:border-slate-400')
                                        }
                                    >
                                        {producto ? (
                                            <>
                                                <span className="block text-[12px] font-semibold text-slate-900">{producto.codigo}</span>
                                                <span className="block text-[11.5px] text-slate-700 leading-snug truncate">
                                                    {producto.descripcion}
                                                </span>
                                            </>
                                        ) : desconocido ? (
                                            <span className="block text-[12px] text-rose-700 font-semibold">
                                                {linea.codigo} — no está en el catálogo
                                            </span>
                                        ) : (
                                            <span className="block text-[12px] text-slate-500">Elegir producto…</span>
                                        )}
                                    </button>
                                )}
                            </div>

                            {/* ── Cantidad, rotulada por la unidad del producto ── */}
                            <div className="relative">
                                <input
                                    type="number"
                                    min={0}
                                    step="any"
                                    aria-label={`Cantidad de la línea ${i + 1}`}
                                    className={claseControl(false, 'text-right pr-8 text-[12.5px]')}
                                    value={linea.cantidad === '' ? '' : linea.cantidad}
                                    onChange={e => {
                                        const texto = e.target.value;
                                        actualizar(i, { cantidad: texto === '' ? '' : Number(texto) });
                                    }}
                                />
                                <span className="absolute inset-y-0 right-2.5 flex items-center text-[11px] font-semibold text-slate-600 pointer-events-none">
                                    {producto ? rotuloCantidad(producto.unidad) : ''}
                                </span>
                            </div>

                            <div className="text-right text-[12.5px] text-slate-800 sm:pt-2 tabular-nums">
                                {!producto ? '—' : aCotizar ? 'Al calcular' : fmtCOP(precio)}
                            </div>
                            <div className="text-right text-[12.5px] font-semibold text-slate-900 sm:pt-2 tabular-nums">
                                {!producto ? '—' : aCotizar ? 'Al calcular' : fmtCOP(subtotal)}
                            </div>

                            <button
                                type="button"
                                onClick={() => quitar(i)}
                                aria-label={`Quitar la línea ${i + 1}`}
                                title="Quitar línea"
                                className="justify-self-start sm:justify-self-center sm:mt-1.5 p-1.5 rounded-lg text-slate-500 hover:text-rose-700 hover:bg-rose-50 transition"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>

                            {aCotizar && (
                                <div className="sm:col-span-5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 flex flex-col sm:flex-row sm:items-center gap-2">
                                    <p className="flex-1 text-[12px] text-amber-900 flex items-start gap-1.5">
                                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                        <span>
                                            <strong className="font-semibold">Precio a cotizar.</strong> Pide el precio al
                                            proveedor y escribe su costo por {rotuloCantidad(producto!.unidad)}; el precio
                                            de venta se calcula con el margen del tipo de cliente.
                                        </span>
                                    </p>
                                    <label className="flex items-center gap-2 shrink-0">
                                        <span className="text-[12px] font-semibold text-amber-900">Costo proveedor</span>
                                        <input
                                            type="number"
                                            min={0}
                                            step="any"
                                            aria-label={`Costo del proveedor de la línea ${i + 1}`}
                                            className={claseControl(sinCosto, 'w-36 text-right text-[12.5px]')}
                                            value={linea.costo === undefined || linea.costo === '' ? '' : linea.costo}
                                            onChange={e => {
                                                const texto = e.target.value;
                                                actualizar(i, { costo: texto === '' ? '' : Number(texto) });
                                            }}
                                        />
                                    </label>
                                </div>
                            )}
                        </div>
                    );
                })}

                <div className="flex items-center justify-between gap-3 px-3 py-2 bg-slate-50 border-t border-slate-200">
                    <button
                        type="button"
                        onClick={agregar}
                        className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-templex-700 hover:text-templex-800"
                    >
                        <Plus className="w-3.5 h-3.5" /> Agregar línea
                    </button>
                    {lineas.length > 0 && (
                        <span className="text-[12px] text-slate-800">
                            Materiales:{' '}
                            <strong className="font-semibold text-slate-900 tabular-nums">{fmtCOP(totalLineas)}</strong>
                        </span>
                    )}
                </div>
            </div>

            {/* El total de arriba es la suma cruda de las líneas: todavía sin AIU,
                sin la cantidad de piezas iguales y sin IVA. Decirlo evita que se
                lea como el precio del ítem y se compare contra el resultado. */}
            <p className="mt-1.5 text-[11px] text-slate-700">
                Suma de materiales antes de AIU, cantidad de piezas e IVA. El precio del ítem sale al calcular.
            </p>

            {error && <p className="mt-1 text-[11.5px] font-semibold text-rose-700">{error}</p>}
        </div>
    );
};

export default EditorLineasLibres;

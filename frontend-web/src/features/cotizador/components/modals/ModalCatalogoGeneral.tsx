import React, { useEffect, useState } from 'react';
import { Search, PackagePlus, AlertTriangle, Loader2 } from '../../../../components/ui/icons';
import { toast } from 'react-toastify';

import { apiBuscarCatalogoGeneral, apiImportarCatalogoGeneral, apiListarMultiplicadores } from '../../services/cotizadorApi';
import { MultiplicadorCategoria, ProductoCatalogo, ProductoCatalogoGeneral } from '../../types';
import { fmtCOP } from '../../format';
import { BotonPrimario, BotonSecundario, Campo, Input, ModalShell, Select } from '../ui';

// ─────────────────────────────────────────────────────────────────────────────
// Traer al Cotizador un producto del CATÁLOGO GENERAL del ERP (2026-09-23).
//
// Caso que lo originó: el vidrio miniboreal (VMINIBOR) existía en el catálogo
// del ERP con precio de proveedor, pero no en el del Cotizador, así que no se
// podía cotizar de ninguna forma. Aquí se busca, se confirma cómo se cobra
// (categoría y unidad, que el catálogo general casi nunca trae) y se da de
// alta VINCULADO: su precio sale de Proveedores con el multiplicador de la
// categoría y se actualiza solo.
//
// Se abre desde Configuración y desde el buscador de "Cambiar / Agregar
// componente", para no tener que salir de la cotización.
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORIAS = [
    { v: 'VIDRIO', l: 'Vidrio' },
    { v: 'ACCESORIO', l: 'Accesorio' },
    { v: 'PERFILERIA', l: 'Perfilería' },
    { v: 'ACABADO', l: 'Acabado' },
];
const UNIDADES = [
    { v: 'X M2', l: 'Por metro cuadrado (X M2)' },
    { v: 'X METRO', l: 'Por metro lineal (X METRO)' },
    { v: 'UND', l: 'Por unidad (UND)' },
];

interface Props {
    /** Texto con el que arranca la búsqueda (lo que el vendedor ya escribió). */
    busquedaInicial?: string;
    onClose: () => void;
    onImportado: (producto: ProductoCatalogo) => void;
}

const ModalCatalogoGeneral: React.FC<Props> = ({ busquedaInicial = '', onClose, onImportado }) => {
    const [q, setQ] = useState(busquedaInicial);
    const [resultados, setResultados] = useState<ProductoCatalogoGeneral[]>([]);
    const [buscando, setBuscando] = useState(false);
    const [elegido, setElegido] = useState<ProductoCatalogoGeneral | null>(null);
    const [categoria, setCategoria] = useState('');
    const [unidad, setUnidad] = useState('');
    const [costoManual, setCostoManual] = useState('');
    const [multiplicadores, setMultiplicadores] = useState<MultiplicadorCategoria[]>([]);
    const [importando, setImportando] = useState(false);

    useEffect(() => {
        apiListarMultiplicadores().then(r => setMultiplicadores(r.data)).catch(() => { /* la vista previa queda sin precios */ });
    }, []);

    // Búsqueda con espera de 300 ms: una petición por palabra, no por tecla.
    useEffect(() => {
        const texto = q.trim();
        if (texto.length < 2) { setResultados([]); return; }
        let vivo = true;
        const t = setTimeout(() => {
            setBuscando(true);
            apiBuscarCatalogoGeneral(texto)
                .then(r => { if (vivo) setResultados(r.data); })
                .catch(() => { if (vivo) toast.error('No se pudo buscar en el catálogo general.'); })
                .finally(() => { if (vivo) setBuscando(false); });
        }, 300);
        return () => { vivo = false; clearTimeout(t); };
    }, [q]);

    const elegir = (p: ProductoCatalogoGeneral) => {
        setElegido(p);
        setCategoria(p.sugerido.categoria ?? '');
        setUnidad(p.sugerido.unidad ?? '');
        setCostoManual('');
    };

    const costo = elegido?.proveedor ? elegido.proveedor.costoNormalizado : Number(costoManual) || 0;
    const mult = multiplicadores.find(m => m.categoria === categoria && m.configurado);

    const importar = async () => {
        if (!elegido) return;
        if (!categoria || !unidad) { toast.error('Elige la categoría y cómo se cobra.'); return; }
        if (!elegido.proveedor && !(Number(costoManual) > 0)) {
            toast.error('Este producto no tiene precio de proveedor: escribe su costo.');
            return;
        }
        setImportando(true);
        try {
            const { data } = await apiImportarCatalogoGeneral({
                catalogoProductoId: elegido.id,
                categoria,
                unidad,
                ...(elegido.proveedor ? {} : { costoManual: Number(costoManual) }),
            });
            toast.success(`${data.producto.codigo} ya está en el catálogo del Cotizador.`);
            for (const a of data.advertencias ?? []) toast.warn(a, { autoClose: 9000 });
            onImportado(data.producto);
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'No se pudo traer el producto.');
        } finally {
            setImportando(false);
        }
    };

    return (
        <ModalShell
            titulo="Traer del catálogo general"
            subtitulo="Productos del ERP que todavía no están en el Cotizador. Quedan vinculados al precio de Proveedores."
            anchoMaximo="max-w-3xl"
            onClose={onClose}
            pie={elegido ? (
                <div className="flex justify-end gap-2">
                    <BotonSecundario onClick={() => setElegido(null)}>Elegir otro</BotonSecundario>
                    <BotonPrimario icono={PackagePlus} cargando={importando} onClick={importar}>
                        Traer al Cotizador
                    </BotonPrimario>
                </div>
            ) : undefined}
        >
            <div className="p-6 space-y-4">
                {!elegido && (
                    <>
                        <div className="relative">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                            <Input
                                autoFocus
                                className="pl-9"
                                placeholder="Código o nombre (ej. miniboreal)…"
                                value={q}
                                onChange={e => setQ(e.target.value)}
                            />
                        </div>
                        {buscando && (
                            <p className="text-[12px] text-slate-700 flex items-center gap-1.5">
                                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Buscando…
                            </p>
                        )}
                        {!buscando && q.trim().length >= 2 && resultados.length === 0 && (
                            <p className="text-[12.5px] text-slate-800">
                                Sin coincidencias fuera del Cotizador. Si el producto ya está en el Cotizador, búscalo
                                directamente en el componente.
                            </p>
                        )}
                        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden">
                            {resultados.map(p => (
                                <li key={p.id}>
                                    <button
                                        type="button"
                                        onClick={() => elegir(p)}
                                        className="w-full text-left px-4 py-2.5 hover:bg-templex-50 flex items-start justify-between gap-3"
                                    >
                                        <span className="min-w-0">
                                            <span className="block text-[12.5px] font-semibold text-slate-900">{p.codigo}</span>
                                            <span className="block text-[12px] text-slate-800">{p.nombre}</span>
                                        </span>
                                        <span className="text-right shrink-0 text-[12px]">
                                            {p.proveedor ? (
                                                <>
                                                    <span className="block font-semibold text-slate-900 tabular-nums">
                                                        {fmtCOP(p.proveedor.precio)} / {p.proveedor.unidadCompra}
                                                    </span>
                                                    <span className="block text-slate-700">{p.proveedor.nombre}</span>
                                                </>
                                            ) : (
                                                <span className="text-amber-800 font-semibold">Sin precio de proveedor</span>
                                            )}
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </>
                )}

                {elegido && (
                    <div className="space-y-4">
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <p className="text-[13px] font-bold text-slate-900">{elegido.codigo} — {elegido.nombre}</p>
                            <p className="text-[12px] text-slate-800 mt-0.5">
                                {elegido.proveedor
                                    ? <>Costo de compra: <strong className="font-semibold text-slate-900 tabular-nums">{fmtCOP(elegido.proveedor.precio)}</strong> por {elegido.proveedor.unidadCompra} · {elegido.proveedor.nombre}</>
                                    : 'Ningún proveedor activo tiene precio para este producto: escribe el costo abajo. Cuando Proveedores registre uno, lo reemplazará solo.'}
                            </p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <Campo etiqueta="Categoría" requerido ayuda="Decide el multiplicador que convierte costo en precio.">
                                <Select value={categoria} onChange={e => setCategoria(e.target.value)}>
                                    <option value="">Elige…</option>
                                    {CATEGORIAS.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}
                                </Select>
                            </Campo>
                            <Campo etiqueta="Cómo se cobra" requerido ayuda="Sugerido por la unidad en que lo vende el proveedor.">
                                <Select value={unidad} onChange={e => setUnidad(e.target.value)}>
                                    <option value="">Elige…</option>
                                    {UNIDADES.map(u => <option key={u.v} value={u.v}>{u.l}</option>)}
                                </Select>
                            </Campo>
                            {!elegido.proveedor && (
                                <Campo etiqueta="Costo de compra" requerido>
                                    <Input type="number" min={0} value={costoManual} onChange={e => setCostoManual(e.target.value)} />
                                </Campo>
                            )}
                        </div>

                        {categoria && (
                            mult && costo > 0 ? (
                                <div className="grid grid-cols-3 gap-2">
                                    {(['Pa', 'Pm', 'Pb'] as const).map(s => {
                                        const m = Number(mult[`multiplicador${s}` as const]) || 0;
                                        return (
                                            <div key={s} className="rounded-xl border border-slate-200 px-3 py-2 text-center">
                                                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-900">Precio {s.toUpperCase()}</p>
                                                <p className="text-[15px] font-bold text-slate-900 tabular-nums">{fmtCOP(costo * m)}</p>
                                                <p className="text-[11px] text-slate-700 tabular-nums">× {m.toLocaleString('es-CO')}</p>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : !mult ? (
                                <p className="text-[12px] text-amber-800 font-semibold flex items-center gap-1.5">
                                    <AlertTriangle className="w-3.5 h-3.5" />
                                    La categoría elegida no tiene multiplicador configurado.
                                </p>
                            ) : null
                        )}
                        <p className="text-[12px] text-slate-700">
                            Vista previa: precio = costo × multiplicador de la categoría. El definitivo lo calcula el servidor
                            con la misma regla que usa Proveedores.
                        </p>
                    </div>
                )}
            </div>
        </ModalShell>
    );
};

export default ModalCatalogoGeneral;

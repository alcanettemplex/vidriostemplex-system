import React, { useEffect, useMemo, useState } from 'react';
import { Calculator, ExternalLink, Search, X } from '../../../components/ui/icons';

import { fmtCOP, numeroCotizacion } from '../format';
import { usePermisosCotizador } from '../permisos';
import { apiListarCotizaciones, apiPreviaCrearOdp } from '../services/cotizadorApi';
import { CotizacionLigera } from '../types';
import { enlaceCotizador, OrigenCotizacion } from '../vinculo';

// ─────────────────────────────────────────────────────────────────────────────
// "Partir de una cotización aprobada" en el formulario de ODP nueva (2026-09-27).
//
// Lista las cotizaciones APROBADAS sin ODP que este usuario puede vincular (las
// suyas, o todas si es control total). Al elegir una se pide la vista previa del
// "Crear ODP" (2026-10-28) —la misma del botón del Cotizador— y el formulario
// se llena con cliente, asesor, valor, productos, acarreo e instalación. Al
// guardar, el formulario crea la ODP por el Cotizador, que la vincula en la
// misma operación y con el candado contra la ODP doble.
//
// Una cotización de un LEAD ya se llena aquí (2026-10-28): el backend deja el
// lead con su ODP. La de un PROSPECTO no: su ODP sale de aprobarlo (pasa sus
// tomas de medidas), así que se avisa y se ofrece el enlace al Cotizador.
//
// Se muestra SIEMPRE a quien puede crear cotizaciones (2026-09-27): oculto
// cuando no había ninguna disponible, el usuario no sabía que la opción existía.
// Sin disponibles explica por qué y lleva al Cotizador.
//
// Buscador en vez de select (2026-09-27): "Buscar cotización (opcional)" por
// número, cliente u asesor. Si no se elige ninguna, la ODP se llena a mano.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
    onAplicar: (origen: OrigenCotizacion | null) => void;
}

const PartirDeCotizacion: React.FC<Props> = ({ onAplicar }) => {
    const permisos = usePermisosCotizador();
    const [lista, setLista] = useState<CotizacionLigera[]>([]);
    const [elegidaId, setElegidaId] = useState<number | null>(null);
    const [aviso, setAviso] = useState<string | null>(null);
    const [cargando, setCargando] = useState(true);
    const [texto, setTexto] = useState('');
    const [abierto, setAbierto] = useState(false);
    const [revisando, setRevisando] = useState(false);

    useEffect(() => {
        apiListarCotizaciones({ estado: 'APROBADA' })
            .then(r => setLista(r.data))
            .catch(() => setLista([]))
            .finally(() => setCargando(false));
    }, []);

    const disponibles = useMemo(
        () => lista.filter(c => !c.odpId && permisos.puedeEditar(c.asesorUsuarioId)),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [lista, permisos.nivel, permisos.usuarioId]
    );

    if (!permisos.puedeCrear) return null;
    if (cargando) return null;
    if (disponibles.length === 0) {
        return (
            <div className="rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <Calculator className="w-4 h-4 text-templex-600" /> ¿Parte de una cotización aprobada?
                </p>
                <p className="text-[13px] text-slate-800 flex-1 min-w-[220px]">
                    {permisos.nivel === 'total'
                        ? 'No hay cotizaciones aprobadas pendientes de ODP.'
                        : 'No tienes cotizaciones aprobadas pendientes de ODP.'}
                    {' '}Cuando apruebes una en el Cotizador aparecerá aquí para llenar la ODP con sus datos.
                </p>
                <a href="/cotizador" className="inline-flex items-center gap-1 text-[13px] font-semibold text-templex-700 hover:underline">
                    Ir al Cotizador <ExternalLink className="w-3.5 h-3.5" />
                </a>
            </div>
        );
    }
    const elegida = disponibles.find(c => c.id === elegidaId) ?? null;

    const elegir = async (id: number | null) => {
        setElegidaId(id);
        setAviso(null);
        const c = disponibles.find(x => x.id === id);
        onAplicar(null);
        if (!c) return;
        setRevisando(true);
        try {
            const { data } = await apiPreviaCrearOdp(c.id);
            if (!data.puede || !data.precarga) {
                setAviso(data.motivo || 'Esta cotización no puede generar una ODP todavía.');
                return;
            }
            if (data.camino === 'prospecto') {
                setAviso(`Es del prospecto ${data.prospecto?.numero ?? ''}: crea su ODP desde el Cotizador (Resumen → Crear ODP) para aprobarlo y pasarle sus tomas de medidas.`);
                return;
            }
            onAplicar({ cotizacionId: c.id, numero: c.numero, plan: data, precarga: data.precarga });
        } catch (e: any) {
            setAviso(e?.response?.data?.error || 'No se pudo leer la cotización. Revisa tu conexión e inténtalo de nuevo.');
        } finally {
            setRevisando(false);
        }
    };

    const q = texto.trim().toLowerCase();
    const coincidencias = disponibles.filter(c =>
        !q
        || String(c.numero).includes(q.replace(/^cot-?/, ''))
        || (c.cliente?.nombre ?? '').toLowerCase().includes(q)
        || (c.asesor ?? '').toLowerCase().includes(q)
    ).slice(0, 8);

    return (
        <div className="rounded-xl border border-templex-100 bg-templex-50 px-4 py-3 space-y-2">
            <label htmlFor="odp-partir-cotizacion" className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Calculator className="w-4 h-4 text-templex-600" /> ¿Parte de una cotización aprobada?
                <span className="font-normal text-slate-700">Si no eliges ninguna, la ODP se llena a mano.</span>
            </label>
            {elegida ? (
                <div className="flex h-10 items-center gap-2 rounded-lg border border-templex-300 bg-white px-3">
                    <span className="text-sm font-bold text-slate-900 tabular-nums">{numeroCotizacion(elegida.numero)}</span>
                    <span className="flex-1 min-w-0 truncate text-sm text-slate-800">
                        {elegida.cliente?.nombre || 'Sin nombre'} · {fmtCOP(elegida.totales?.total ?? 0)} · {elegida.asesor}
                    </span>
                    <button type="button" onClick={() => { setTexto(''); elegir(null); }}
                        className="inline-flex items-center gap-1 text-[12px] font-semibold text-slate-700 hover:text-rose-700">
                        <X className="w-3.5 h-3.5" /> Quitar
                    </button>
                </div>
            ) : (
                <div className="relative">
                    <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                        id="odp-partir-cotizacion"
                        type="search"
                        autoComplete="off"
                        value={texto}
                        onChange={e => { setTexto(e.target.value); setAbierto(true); }}
                        onFocus={() => setAbierto(true)}
                        onBlur={() => setTimeout(() => setAbierto(false), 150)}
                        placeholder={`Buscar cotización (opcional) — ${disponibles.length} aprobada${disponibles.length === 1 ? '' : 's'} sin ODP`}
                        className="h-10 w-full rounded-lg border border-slate-400 bg-white pl-9 pr-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {abierto && (
                        <ul className="absolute z-30 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-slate-300 bg-white shadow-lg">
                            {coincidencias.length === 0 ? (
                                <li className="px-3 py-2.5 text-sm text-slate-700">Ninguna cotización coincide con “{texto}”.</li>
                            ) : coincidencias.map(c => (
                                <li key={c.id}>
                                    <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => { setAbierto(false); elegir(c.id); }}
                                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-blue-50">
                                        <span className="font-bold text-slate-900 tabular-nums">{numeroCotizacion(c.numero)}</span>
                                        <span className="flex-1 min-w-0 truncate text-slate-800">{c.cliente?.nombre || 'Sin nombre'}</span>
                                        <span className="text-slate-700 truncate max-w-[140px]">{c.asesor}</span>
                                        <span className="font-semibold text-slate-900 tabular-nums">{fmtCOP(c.totales?.total ?? 0)}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
            {elegida && revisando && <p className="text-xs text-slate-800">Leyendo la cotización…</p>}
            {elegida && !aviso && !revisando && (
                <p className="text-xs text-slate-800">
                    Se llenaron cliente, asesor, valor, productos, acarreo e instalación. Al crear la ODP queda vinculada a la cotización {numeroCotizacion(elegida.numero)}.
                </p>
            )}
            {aviso && elegida && (
                <p className="text-xs text-amber-800 font-semibold flex flex-wrap items-center gap-2">
                    {aviso}
                    <a href={enlaceCotizador({ abrir: elegida.id })} className="inline-flex items-center gap-1 text-templex-700 underline">
                        Abrir la cotización <ExternalLink className="w-3 h-3" />
                    </a>
                </p>
            )}
        </div>
    );
};

export default PartirDeCotizacion;

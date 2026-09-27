import React, { useEffect, useMemo, useState } from 'react';
import { Calculator, ExternalLink, Search, X } from '../../../components/ui/icons';

import { fmtCOP } from '../format';
import { usePermisosCotizador } from '../permisos';
import { apiListarCotizaciones, apiObtenerVinculo } from '../services/cotizadorApi';
import { CotizacionLigera } from '../types';
import { enlaceCotizador, ROTULO_TIPO } from '../vinculo';

// ─────────────────────────────────────────────────────────────────────────────
// "Partir de una cotización aprobada" en el formulario de ODP nueva (2026-09-27).
//
// Lista las cotizaciones APROBADAS sin ODP que este usuario puede vincular (las
// suyas, o todas si es control total). Al elegir una llena cliente, asesor y
// valor; el formulario, al crear la ODP, la vincula (`PUT {odpId}`).
//
// Una cotización de un LEAD o un PROSPECTO no se llena aquí: su ODP debe salir
// del "Crear ODP" del Cotizador, que la crea por el flujo del CRM / de
// Prospectos y deja el lead y el prospecto sincronizados. Aquí se avisa y se
// ofrece el enlace.
//
// Se muestra SIEMPRE a quien puede crear cotizaciones (2026-09-27): oculto
// cuando no había ninguna disponible, el usuario no sabía que la opción existía.
// Sin disponibles explica por qué y lleva al Cotizador.
//
// Buscador en vez de select (2026-09-27): "Buscar cotización (opcional)" por
// número, cliente u asesor. Si no se elige ninguna, la ODP se llena a mano.
// ─────────────────────────────────────────────────────────────────────────────

export interface DatosDeCotizacion {
    cotizacionId: number;
    numero: number;
    clienteId: number;
    clienteNombre: string;
    valor: number;
    asesorUsuarioId: number | null;
}

interface Props {
    onAplicar: (d: DatosDeCotizacion | null) => void;
}

const PartirDeCotizacion: React.FC<Props> = ({ onAplicar }) => {
    const permisos = usePermisosCotizador();
    const [lista, setLista] = useState<CotizacionLigera[]>([]);
    const [elegidaId, setElegidaId] = useState<number | null>(null);
    const [aviso, setAviso] = useState<string | null>(null);
    const [cargando, setCargando] = useState(true);
    const [texto, setTexto] = useState('');
    const [abierto, setAbierto] = useState(false);

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
        if (!c) { onAplicar(null); return; }
        const tipo = c.vinculo?.tipo;
        if (tipo === 'lead' || tipo === 'prospecto') {
            setAviso(`Es de un ${ROTULO_TIPO[tipo].toLowerCase()}: crea su ODP desde el Cotizador (Resumen → Crear ODP) para que el CRM quede al día.`);
            onAplicar(null);
            return;
        }
        if (!c.clienteId) { setAviso('Esta cotización no tiene cliente: vincúlala a uno en el Cotizador.'); onAplicar(null); return; }
        let clienteNombre = c.cliente?.nombre ?? '';
        try { clienteNombre = (await apiObtenerVinculo('cliente', c.clienteId)).data.nombre || clienteNombre; } catch { /* se usa el de la cotización */ }
        onAplicar({
            cotizacionId: c.id,
            numero: c.numero,
            clienteId: c.clienteId,
            clienteNombre,
            valor: Number(c.totales?.total) || 0,
            asesorUsuarioId: c.asesorUsuarioId ?? null,
        });
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
                    <span className="text-sm font-bold text-slate-900 tabular-nums">COT-{elegida.numero}</span>
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
                                        <span className="font-bold text-slate-900 tabular-nums">COT-{c.numero}</span>
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
            {elegida && !aviso && (
                <p className="text-xs text-slate-800">
                    Se llenaron cliente, asesor y valor. Al crear la ODP queda vinculada a la cotización COT-{elegida.numero}.
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

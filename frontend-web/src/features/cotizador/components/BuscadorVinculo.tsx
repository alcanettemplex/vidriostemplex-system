import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { Search, Loader2, UserPlus, Users, Building2, FileText, Target } from '../../../components/ui/icons';

import { apiBuscarVinculos, apiCrearLeadRapido } from '../services/cotizadorApi';
import { FichaVinculo, FUENTES_LEAD, FuenteLead, ResultadosVinculo, ROTULO_TIPO, TipoVinculo } from '../vinculo';
import { BotonPrimario, BotonSecundario, Chip, claseControl, CONTROL_LABEL_CLASS } from './ui';

// ─────────────────────────────────────────────────────────────────────────────
// Buscador de "¿Para quién es esta cotización?" (2026-09-27).
//
// Un solo campo que busca a la vez leads, prospectos, clientes y ODP (el
// backend devuelve hasta 6 de cada uno) y, al final de la lista, "+ Crear lead
// rápido" para quien solo pregunta el precio: crea un lead REAL del CRM con el
// mismo flujo de `POST /api/crm` y lo deja elegido. Si el teléfono ya tiene
// lead, ofrece usar ese en vez de duplicarlo.
//
// También lo usa el modal "Crear ODP" con `tipos={['cliente']}` y sin lead
// rápido, para elegir el cliente de la ODP.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
    onElegir: (ficha: FichaVinculo) => void;
    tipos?: TipoVinculo[];
    permitirLeadRapido?: boolean;
    /** Asesor al que queda asignado el lead rápido (el de la cotización). */
    asesorIdLeadRapido?: number | null;
    placeholder?: string;
    autoFocus?: boolean;
    id?: string;
}

const GRUPOS: { clave: keyof ResultadosVinculo; titulo: string; Icono: React.ComponentType<{ className?: string }> }[] = [
    { clave: 'leads', titulo: 'Leads (CRM)', Icono: Target },
    { clave: 'prospectos', titulo: 'Prospectos', Icono: Users },
    { clave: 'clientes', titulo: 'Clientes', Icono: Building2 },
    { clave: 'odps', titulo: 'ODP', Icono: FileText },
];

const VACIO: ResultadosVinculo = { leads: [], prospectos: [], clientes: [], odps: [] };

const BuscadorVinculo: React.FC<Props> = ({
    onElegir, tipos, permitirLeadRapido = false, asesorIdLeadRapido, placeholder, autoFocus, id,
}) => {
    const [q, setQ] = useState('');
    const [abierto, setAbierto] = useState(false);
    const [buscando, setBuscando] = useState(false);
    const [resultados, setResultados] = useState<ResultadosVinculo>(VACIO);
    const [leadRapido, setLeadRapido] = useState<{ nombre: string; telefono: string; fuente: FuenteLead } | null>(null);
    const [creando, setCreando] = useState(false);
    const [existente, setExistente] = useState<FichaVinculo | null>(null);
    const caja = useRef<HTMLDivElement>(null);
    const tiposClave = (tipos ?? []).join(',');

    useEffect(() => {
        const termino = q.trim();
        if (termino.length < 2) { setResultados(VACIO); return; }
        let vigente = true;
        setBuscando(true);
        const espera = window.setTimeout(() => {
            apiBuscarVinculos(termino, tiposClave ? (tiposClave.split(',') as TipoVinculo[]) : undefined)
                .then(r => { if (vigente) setResultados(r.data); })
                .catch(() => { if (vigente) setResultados(VACIO); })
                .finally(() => { if (vigente) setBuscando(false); });
        }, 300);
        return () => { vigente = false; window.clearTimeout(espera); };
    }, [q, tiposClave]);

    useEffect(() => {
        if (!abierto) return;
        const fuera = (e: MouseEvent) => { if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false); };
        document.addEventListener('mousedown', fuera);
        return () => document.removeEventListener('mousedown', fuera);
    }, [abierto]);

    const elegir = (f: FichaVinculo) => {
        setAbierto(false);
        setQ('');
        setLeadRapido(null);
        setExistente(null);
        onElegir(f);
    };

    const abrirLeadRapido = () => {
        const t = q.trim();
        const pareceTelefono = /^[\d\s+()-]{7,}$/.test(t);
        setLeadRapido({ nombre: pareceTelefono ? '' : t, telefono: pareceTelefono ? t : '', fuente: 'Presencial' });
        setExistente(null);
        setAbierto(false);
    };

    const crearLead = async () => {
        if (!leadRapido) return;
        if (leadRapido.nombre.trim().length < 2) { toast.warn('Escribe el nombre de la persona.'); return; }
        if (leadRapido.telefono.trim().length < 7) { toast.warn('Escribe un teléfono de al menos 7 dígitos.'); return; }
        setCreando(true);
        try {
            const { data } = await apiCrearLeadRapido({
                nombre: leadRapido.nombre.trim(),
                telefono: leadRapido.telefono.trim(),
                fuente: leadRapido.fuente,
                asesorId: asesorIdLeadRapido ?? null,
            });
            toast.success(`Lead "${data.titulo}" creado en el CRM y vinculado a la cotización.`);
            elegir(data);
        } catch (e: any) {
            const cuerpo = e?.response?.data;
            if (e?.response?.status === 409 && cuerpo?.existente) {
                setExistente(cuerpo.existente as FichaVinculo);
            } else {
                toast.error(cuerpo?.error || 'No se pudo crear el lead. Revisa tu conexión e inténtalo de nuevo.');
            }
        } finally {
            setCreando(false);
        }
    };

    const total = GRUPOS.reduce((n, g) => n + resultados[g.clave].length, 0);
    const termino = q.trim();

    if (leadRapido) {
        return (
            <div className="rounded-xl border border-templex-200 bg-white p-3 space-y-2.5">
                <p className="text-[13px] font-bold text-slate-900 flex items-center gap-1.5">
                    <UserPlus className="w-4 h-4 text-templex-600" /> Crear lead rápido
                </p>
                <p className="text-[12px] text-slate-700 -mt-1">
                    Queda registrado en el CRM (CRM &amp; Leads) a nombre del asesor de la cotización.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                        <label className={CONTROL_LABEL_CLASS} htmlFor="lead-rapido-nombre">Nombre</label>
                        <input
                            id="lead-rapido-nombre"
                            className={claseControl()}
                            value={leadRapido.nombre}
                            maxLength={100}
                            autoFocus
                            onChange={e => setLeadRapido(l => l && { ...l, nombre: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className={CONTROL_LABEL_CLASS} htmlFor="lead-rapido-telefono">Teléfono</label>
                        <input
                            id="lead-rapido-telefono"
                            className={claseControl()}
                            value={leadRapido.telefono}
                            maxLength={20}
                            inputMode="tel"
                            onChange={e => { setExistente(null); setLeadRapido(l => l && { ...l, telefono: e.target.value }); }}
                        />
                    </div>
                    <div>
                        <label className={CONTROL_LABEL_CLASS} htmlFor="lead-rapido-fuente">¿Cómo llegó?</label>
                        <select
                            id="lead-rapido-fuente"
                            className={claseControl()}
                            value={leadRapido.fuente}
                            onChange={e => setLeadRapido(l => l && { ...l, fuente: e.target.value as FuenteLead })}
                        >
                            {FUENTES_LEAD.map(f => <option key={f} value={f}>{f}</option>)}
                        </select>
                    </div>
                </div>
                {existente && (
                    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">
                        <span className="flex-1 min-w-[200px]">
                            Ya hay un lead con ese teléfono: <span className="font-bold">{existente.titulo}</span> ({existente.estado ?? 'sin estado'}).
                        </span>
                        <BotonPrimario compacto onClick={() => elegir(existente)}>Usar ese lead</BotonPrimario>
                    </div>
                )}
                <div className="flex justify-end gap-2">
                    <BotonSecundario compacto onClick={() => { setLeadRapido(null); setExistente(null); }}>Cancelar</BotonSecundario>
                    <BotonPrimario compacto icono={UserPlus} cargando={creando} onClick={crearLead}>Crear lead y usarlo</BotonPrimario>
                </div>
            </div>
        );
    }

    return (
        <div ref={caja} className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
            <input
                id={id}
                value={q}
                autoFocus={autoFocus}
                autoComplete="off"
                onChange={e => { setQ(e.target.value); setAbierto(true); }}
                onFocus={() => setAbierto(true)}
                onKeyDown={e => { if (e.key === 'Escape') setAbierto(false); }}
                placeholder={placeholder ?? 'Busca lead, prospecto, cliente u ODP: nombre, teléfono o número'}
                className={claseControl(false, 'pl-9')}
            />
            {buscando && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 animate-spin" />}
            {abierto && (termino.length >= 2 || permitirLeadRapido) && (
                <div className="absolute left-0 right-0 top-full mt-1 z-40 max-h-[26rem] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl p-1.5">
                    {termino.length < 2 && (
                        <p className="px-2.5 py-2 text-[12.5px] text-slate-700">Escribe al menos 2 letras o números.</p>
                    )}
                    {termino.length >= 2 && !buscando && total === 0 && (
                        <p className="px-2.5 py-2 text-[12.5px] text-slate-700">Sin resultados para "{termino}".</p>
                    )}
                    {GRUPOS.filter(g => resultados[g.clave].length > 0).map(g => (
                        <div key={g.clave} className="py-1">
                            <p className="flex items-center gap-1.5 px-2.5 pt-1 pb-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-900">
                                <g.Icono className="w-3.5 h-3.5 text-templex-600" /> {g.titulo}
                            </p>
                            {resultados[g.clave].map(f => (
                                <button
                                    key={`${f.tipo}-${f.id}`}
                                    type="button"
                                    onClick={() => elegir(f)}
                                    className="w-full text-left rounded-lg px-2.5 py-1.5 hover:bg-templex-50 focus:bg-templex-50 focus:outline-none"
                                >
                                    <span className="flex items-center gap-1.5">
                                        <span className="text-[13px] font-semibold text-slate-900 truncate">{f.titulo}</span>
                                        {f.estado && <Chip tono={f.estado === 'PERDIDO' || f.estado === 'no_aprobado' || f.estado === 'ANULADA' ? 'rosa' : 'neutro'}>{f.estado.replace(/_/g, ' ').toLowerCase()}</Chip>}
                                    </span>
                                    <span className="block text-[12px] text-slate-700 truncate">{f.subtitulo}</span>
                                </button>
                            ))}
                        </div>
                    ))}
                    {permitirLeadRapido && (
                        <button
                            type="button"
                            onClick={abrirLeadRapido}
                            className="mt-1 w-full flex items-center gap-2 rounded-lg border-t border-slate-100 px-2.5 py-2 text-left text-[13px] font-bold text-templex-700 hover:bg-templex-50"
                        >
                            <UserPlus className="w-4 h-4" />
                            + Crear lead rápido
                            <span className="font-normal text-slate-700">— para quien solo pregunta el precio</span>
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

export default BuscadorVinculo;

/** Chip compacto de un vínculo ya elegido. */
export const ChipVinculo: React.FC<{ ficha: FichaVinculo; className?: string }> = ({ ficha, className = '' }) => (
    <span className={`inline-flex min-w-0 items-center gap-2 ${className}`}>
        <Chip tono="marca">{ROTULO_TIPO[ficha.tipo]}</Chip>
        <span className="min-w-0">
            <span className="block text-[13px] font-bold text-slate-900 truncate">{ficha.titulo}</span>
            <span className="block text-[12px] text-slate-700 truncate">{ficha.subtitulo}</span>
        </span>
    </span>
);

import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import {
    Loader2, Pause, Play, PenLine, PlusCircle, XCircle, CheckCircle2, History, Ruler, Layers,
} from 'lucide-react';

import {
    apiListarEstadoSistemas, apiActualizarEstadoSistema, apiListarPiezasDeSistema,
    apiListarContrastes, apiRegistrarContraste, apiAnularContraste, apiAnalizarPieza,
    apiAprobarMargen, apiListarHolguras, apiFijarHolgura, apiAnularHolgura,
    apiListarHistorialCalibracion,
} from '../services/cotizadorApi';
import {
    AnalisisPieza, ContrasteCalibracion, EstadoSistemaCalibracion, HistorialCalibracion,
    HolguraCalibracion, PiezaCalibracion,
} from '../types';
import { fmtFecha, fmtPct } from '../format';
import { BotonPeligro, BotonPrimario, BotonSecundario, Campo, Chip, ChipNivelCorte, Input, Select, Tarjeta } from './ui';

// ─────────────────────────────────────────────────────────────────────────────
// Pestaña "Calibración" del Cotizador — solo root/admin (mismo gate que el
// resto del módulo, ver cotizador.routes.ts). Convierte en formulario la capa
// de escritura de lib/calibracion.ts: registrar contrastes del taller,
// aprobar/anular márgenes y holguras, y pausar/reanudar/firmar un sistema.
//
// `EN_PRODUCCION` nunca se fuerza desde aquí: el botón "pausar" escribe el
// freno manual (EN_CALIBRACION); "reanudar" lo retira y deja mandar al cálculo
// real (cobertura 100% + firma). Ver aptitudOrden.ts::madurezDeSistema.
// ─────────────────────────────────────────────────────────────────────────────

type SubTab = 'sistemas' | 'holguras' | 'historial';

const TONO_ESTADO_SISTEMA: Record<EstadoSistemaCalibracion['estado'], 'esmeralda' | 'indigo' | 'ambar'> = {
    EN_PRODUCCION: 'esmeralda',
    VALIDADO: 'indigo',
    EN_CALIBRACION: 'ambar',
};

const labelEstado = (estado: EstadoSistemaCalibracion['estado']): string => {
    switch (estado) {
        case 'EN_PRODUCCION': return 'En producción';
        case 'VALIDADO': return 'Validado';
        default: return 'En calibración';
    }
};

const ChipEstadoSistema: React.FC<{ estado: EstadoSistemaCalibracion['estado'] }> = ({ estado }) => (
    <Chip tono={TONO_ESTADO_SISTEMA[estado] ?? 'ambar'}>{labelEstado(estado)}</Chip>
);

const TabCalibracion: React.FC = () => {
    const [sub, setSub] = useState<SubTab>('sistemas');

    const [sistemas, setSistemas] = useState<EstadoSistemaCalibracion[]>([]);
    const [cargandoSistemas, setCargandoSistemas] = useState(true);
    const [sistemaSel, setSistemaSel] = useState<string | null>(null);

    const [piezas, setPiezas] = useState<PiezaCalibracion[]>([]);
    const [cargandoPiezas, setCargandoPiezas] = useState(false);
    const [piezaSel, setPiezaSel] = useState<PiezaCalibracion | null>(null);

    const cargarSistemas = useCallback(async () => {
        setCargandoSistemas(true);
        try {
            const { data } = await apiListarEstadoSistemas();
            setSistemas(data);
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'No se pudo cargar el estado de los sistemas.');
        } finally {
            setCargandoSistemas(false);
        }
    }, []);

    useEffect(() => { cargarSistemas(); }, [cargarSistemas]);

    // No resetea `piezaSel`: se recarga también después de registrar/anular un
    // contraste desde el propio panel de la pieza (onCambio), y perder la
    // selección ahí cerraría el panel justo después de la acción que el
    // usuario acaba de hacer. Sólo `seleccionarSistema` (cambiar de sistema)
    // debe limpiar la selección.
    const cargarPiezas = useCallback(async (sistema: string) => {
        setCargandoPiezas(true);
        try {
            const { data } = await apiListarPiezasDeSistema(sistema);
            setPiezas(data);
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'No se pudo cargar el inventario de piezas.');
            setPiezas([]);
        } finally {
            setCargandoPiezas(false);
        }
    }, []);

    const seleccionarSistema = (sistema: string) => {
        setSistemaSel(sistema);
        setPiezaSel(null);
        cargarPiezas(sistema);
    };

    const togglePausa = async (s: EstadoSistemaCalibracion) => {
        try {
            await apiActualizarEstadoSistema(s.sistema, { pausado: !s.pausadoManualmente });
            toast.success(s.pausadoManualmente ? `${s.sistema} reanudado.` : `${s.sistema} pausado.`);
            cargarSistemas();
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'No se pudo cambiar el estado del sistema.');
        }
    };

    const toggleFirma = async (s: EstadoSistemaCalibracion) => {
        try {
            await apiActualizarEstadoSistema(s.sistema, { firmaMaestro: !s.firmaMaestro });
            toast.success(s.firmaMaestro ? 'Firma retirada.' : 'Firmado como maestro.');
            cargarSistemas();
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'No se pudo actualizar la firma.');
        }
    };

    return (
        <div className="p-4 space-y-4">
            <div className="flex items-center gap-2">
                {([
                    { key: 'sistemas', label: 'Sistemas y piezas', icon: <Layers className="w-4 h-4" /> },
                    { key: 'holguras', label: 'Holguras', icon: <Ruler className="w-4 h-4" /> },
                    { key: 'historial', label: 'Historial', icon: <History className="w-4 h-4" /> },
                ] as { key: SubTab; label: string; icon: React.ReactNode }[]).map((t) => (
                    <button
                        key={t.key}
                        onClick={() => setSub(t.key)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg border ${
                            sub === t.key ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                    >
                        {t.icon}{t.label}
                    </button>
                ))}
            </div>

            {sub === 'sistemas' && (
                <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4">
                    <Tarjeta titulo={`Sistemas (${sistemas.length})`} sinRelleno>
                        {cargandoSistemas ? (
                            <div className="p-6 flex justify-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
                        ) : (
                            <ul className="divide-y divide-slate-100 max-h-[560px] overflow-y-auto">
                                {sistemas.map((s) => (
                                    <li key={s.sistema}>
                                        <button
                                            onClick={() => seleccionarSistema(s.sistema)}
                                            className={`w-full text-left px-3 py-2.5 hover:bg-indigo-50/50 ${sistemaSel === s.sistema ? 'bg-indigo-50' : ''}`}
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-sm font-semibold text-slate-800">{s.sistema}</span>
                                                <ChipEstadoSistema estado={s.estado} />
                                            </div>
                                            <div className="text-xs text-slate-500 mt-0.5">
                                                {s.piezasConMargen}/{s.piezasTotales - s.piezasVetadas} piezas calibradas
                                                {s.piezasVetadas > 0 && ` · ${s.piezasVetadas} vetada(s) (nivel C)`}
                                                {' · '}{fmtPct(s.cobertura)}
                                            </div>
                                            {s.pausadoManualmente && (
                                                <div className="text-[11px] text-amber-700 mt-0.5">⏸ Pausado manualmente</div>
                                            )}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Tarjeta>

                    <div>
                        {!sistemaSel ? (
                            <div className="border border-dashed border-slate-200 rounded-xl p-10 text-center text-slate-400 text-sm">
                                Elegí un sistema de la lista para ver sus piezas.
                            </div>
                        ) : (
                            <PanelSistema
                                sistema={sistemas.find((s) => s.sistema === sistemaSel)!}
                                piezas={piezas}
                                cargandoPiezas={cargandoPiezas}
                                piezaSel={piezaSel}
                                onSeleccionarPieza={setPiezaSel}
                                onTogglePausa={togglePausa}
                                onToggleFirma={toggleFirma}
                                onCambio={() => { cargarSistemas(); cargarPiezas(sistemaSel); }}
                            />
                        )}
                    </div>
                </div>
            )}

            {sub === 'holguras' && <PanelHolguras sistemas={sistemas} />}
            {sub === 'historial' && <PanelHistorial />}
        </div>
    );
};

// ─── Panel de un sistema: piezas + contrastes + análisis ───────────────────

interface PanelSistemaProps {
    sistema: EstadoSistemaCalibracion;
    piezas: PiezaCalibracion[];
    cargandoPiezas: boolean;
    piezaSel: PiezaCalibracion | null;
    onSeleccionarPieza: (p: PiezaCalibracion | null) => void;
    onTogglePausa: (s: EstadoSistemaCalibracion) => void;
    onToggleFirma: (s: EstadoSistemaCalibracion) => void;
    onCambio: () => void;
}

const PanelSistema: React.FC<PanelSistemaProps> = ({
    sistema, piezas, cargandoPiezas, piezaSel, onSeleccionarPieza, onTogglePausa, onToggleFirma, onCambio,
}) => (
    <div className="space-y-3">
        <div className="border border-slate-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2">
            <div>
                <div className="text-sm font-bold text-slate-800">{sistema.sistema}</div>
                <div className="text-xs text-slate-500">{sistema.motivo}</div>
            </div>
            <div className="flex items-center gap-2">
                <BotonSecundario compacto icono={sistema.pausadoManualmente ? Play : Pause} onClick={() => onTogglePausa(sistema)}>
                    {sistema.pausadoManualmente ? 'Reanudar' : 'Pausar'}
                </BotonSecundario>
                {sistema.firmaMaestro ? (
                    <BotonPeligro compacto icono={PenLine} onClick={() => onToggleFirma(sistema)}>Retirar firma</BotonPeligro>
                ) : (
                    <BotonPrimario compacto icono={PenLine} onClick={() => onToggleFirma(sistema)}>Firmar como maestro</BotonPrimario>
                )}
            </div>
        </div>

        <Tarjeta sinRelleno>
            <table className="w-full text-sm">
                <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    <tr>
                        <th className="text-left px-3 py-2">Pieza</th>
                        <th className="text-left px-3 py-2">Material</th>
                        <th className="text-left px-3 py-2">Nivel</th>
                        <th className="text-left px-3 py-2">Margen efectivo</th>
                        <th className="text-left px-3 py-2">Contrastes</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {cargandoPiezas ? (
                        <tr><td colSpan={6} className="p-6 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline" /></td></tr>
                    ) : piezas.length === 0 ? (
                        <tr><td colSpan={6} className="p-6 text-center text-slate-400">Este sistema no tiene piezas.</td></tr>
                    ) : piezas.map((p) => (
                        <tr key={p.ref} className={piezaSel?.ref === p.ref ? 'bg-indigo-50/50' : ''}>
                            <td className="px-3 py-2 font-semibold text-slate-800">{p.ref}</td>
                            <td className="px-3 py-2 text-slate-600">{p.material}</td>
                            <td className="px-3 py-2">
                                {/* `p.nivelCorte` es `NivelCorte | null`; el ternario original caía a
                                    "A" cuando no era ni 'C' ni 'B' (incluido `null`) — se preserva ese
                                    comportamiento exacto en vez de decidir aquí un tratamiento nuevo
                                    para el caso sin nivel, que es un cambio de lógica y no de forma. */}
                                <ChipNivelCorte nivel={p.nivelCorte ?? 'A'} alertaEnC />
                            </td>
                            <td className="px-3 py-2 text-slate-600">
                                {p.margenEfectivo.origen === 'sin-calibrar' ? (
                                    <span className="text-slate-400">sin calibrar</span>
                                ) : (
                                    <span>{p.margenEfectivo.margenMm} mm <span className="text-slate-400">({p.margenEfectivo.origen})</span></span>
                                )}
                            </td>
                            <td className="px-3 py-2 text-slate-600">{p.contrastesVigentes}</td>
                            <td className="px-3 py-2 text-right">
                                <BotonSecundario compacto onClick={() => onSeleccionarPieza(p)}>Ver</BotonSecundario>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </Tarjeta>

        {piezaSel && (
            <PanelPieza sistema={sistema.sistema} pieza={piezaSel} onCambio={onCambio} />
        )}
    </div>
);

// ─── Panel de una pieza: contrastes registrados + formulario + análisis ────

const PanelPieza: React.FC<{ sistema: string; pieza: PiezaCalibracion; onCambio: () => void }> = ({ sistema, pieza, onCambio }) => {
    const [contrastes, setContrastes] = useState<ContrasteCalibracion[]>([]);
    const [cargando, setCargando] = useState(true);
    const [analisis, setAnalisis] = useState<AnalisisPieza | null>(null);
    const [analizando, setAnalizando] = useState(false);
    const [guardando, setGuardando] = useState(false);

    const [medidaSistema, setMedidaSistema] = useState('');
    const [medidaMaestro, setMedidaMaestro] = useState('');
    const [anchoVano, setAnchoVano] = useState('');
    const [altoVano, setAltoVano] = useState('');
    const [nota, setNota] = useState('');

    const cargarContrastes = useCallback(async () => {
        setCargando(true);
        try {
            const { data } = await apiListarContrastes(sistema, pieza.ref);
            setContrastes(data);
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'No se pudieron cargar los contrastes.');
        } finally {
            setCargando(false);
        }
    }, [sistema, pieza.ref]);

    useEffect(() => { cargarContrastes(); setAnalisis(null); }, [cargarContrastes]);

    const registrar = async (ev: React.FormEvent) => {
        ev.preventDefault();
        const msb = Number(medidaSistema);
        const mm = Number(medidaMaestro);
        if (!Number.isFinite(msb) || !Number.isFinite(mm)) {
            toast.error('Ingresá la medida del sistema y la del maestro.');
            return;
        }
        setGuardando(true);
        try {
            await apiRegistrarContraste({
                sistema, ref: pieza.ref, material: pieza.material,
                medidaSistemaBrutaMm: msb, medidaMaestroMm: mm,
                anchoVanoMm: anchoVano ? Number(anchoVano) : null,
                altoVanoMm: altoVano ? Number(altoVano) : null,
                nota: nota.trim() || null,
            });
            toast.success('Contraste registrado.');
            setMedidaSistema(''); setMedidaMaestro(''); setAnchoVano(''); setAltoVano(''); setNota('');
            cargarContrastes();
            onCambio();
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'No se pudo registrar el contraste.');
        } finally {
            setGuardando(false);
        }
    };

    const anular = async (c: ContrasteCalibracion) => {
        const motivo = window.prompt('Motivo de la anulación:');
        if (!motivo || !motivo.trim()) return;
        try {
            await apiAnularContraste(c.id, motivo.trim());
            toast.success('Contraste anulado.');
            cargarContrastes();
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'No se pudo anular el contraste.');
        }
    };

    const analizar = async () => {
        setAnalizando(true);
        try {
            const { data } = await apiAnalizarPieza(sistema, pieza.ref);
            setAnalisis(data);
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'No se pudo analizar la pieza.');
        } finally {
            setAnalizando(false);
        }
    };

    const aprobar = async () => {
        if (!analisis?.puedeProponer || analisis.margenMm === undefined) return;
        try {
            await apiAprobarMargen({
                ambito: 'pieza', sistema, ref: pieza.ref, material: pieza.material,
                margenMm: analisis.margenMm,
                evidencia: analisis as unknown as Record<string, unknown>,
            });
            toast.success(`Margen de ${analisis.margenMm} mm aprobado para ${pieza.ref}.`);
            setAnalisis(null);
            onCambio();
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'No se pudo aprobar el margen.');
        }
    };

    return (
        <div className="border border-indigo-200 rounded-xl p-3 bg-indigo-50/30 space-y-3">
            <div className="flex items-center justify-between">
                <div className="text-sm font-bold text-slate-800">Pieza {pieza.ref} — {pieza.material}</div>
                <BotonPrimario compacto icono={CheckCircle2} cargando={analizando} onClick={analizar}>Analizar</BotonPrimario>
            </div>

            {analisis && (
                <div className={`rounded-lg p-3 text-sm border ${analisis.puedeProponer ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                    {analisis.puedeProponer ? (
                        <>
                            <p className="font-semibold text-emerald-800">Se puede proponer un margen de {analisis.margenMm} mm ({analisis.tipo}).</p>
                            <p className="text-emerald-700 mt-1">{analisis.explicacion}</p>
                            <BotonPrimario compacto className="mt-2" onClick={aprobar}>Aprobar este margen</BotonPrimario>
                        </>
                    ) : (
                        <p className="text-amber-800">{analisis.motivo}</p>
                    )}
                </div>
            )}

            <form onSubmit={registrar} className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
                <Campo etiqueta="Sistema calculó (mm)">
                    <Input value={medidaSistema} onChange={(e) => setMedidaSistema(e.target.value)} inputMode="decimal" required />
                </Campo>
                <Campo etiqueta="Maestro cortó (mm)">
                    <Input value={medidaMaestro} onChange={(e) => setMedidaMaestro(e.target.value)} inputMode="decimal" required />
                </Campo>
                <Campo etiqueta="Ancho vano (mm)">
                    <Input value={anchoVano} onChange={(e) => setAnchoVano(e.target.value)} inputMode="decimal" />
                </Campo>
                <Campo etiqueta="Alto vano (mm)">
                    <Input value={altoVano} onChange={(e) => setAltoVano(e.target.value)} inputMode="decimal" />
                </Campo>
                <div>
                    <BotonPrimario compacto type="submit" icono={PlusCircle} cargando={guardando}>Registrar</BotonPrimario>
                </div>
                <Campo etiqueta="Nota (opcional)" className="col-span-2 md:col-span-5">
                    <Input value={nota} onChange={(e) => setNota(e.target.value)} />
                </Campo>
            </form>

            <div>
                <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">Contrastes registrados</div>
                {cargando ? (
                    <div className="p-3 text-slate-400"><Loader2 className="w-4 h-4 animate-spin inline" /></div>
                ) : contrastes.length === 0 ? (
                    <div className="p-3 text-sm text-slate-400">Sin contrastes todavía.</div>
                ) : (
                    <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-lg">
                        <table className="w-full text-xs">
                            <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                                <tr>
                                    <th className="text-left px-2 py-1.5">Fecha</th>
                                    <th className="text-left px-2 py-1.5">Sistema</th>
                                    <th className="text-left px-2 py-1.5">Maestro</th>
                                    <th className="text-left px-2 py-1.5">Vano</th>
                                    <th className="text-left px-2 py-1.5">Registró</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {contrastes.map((c) => (
                                    <tr key={c.id} className={c.anulado ? 'opacity-50 line-through' : ''}>
                                        <td className="px-2 py-1.5">{fmtFecha(c.registrado_en)}</td>
                                        <td className="px-2 py-1.5">{c.medida_sistema_bruta_mm} mm</td>
                                        <td className="px-2 py-1.5">{c.medida_maestro_mm} mm</td>
                                        <td className="px-2 py-1.5">{c.ancho_vano_mm ?? '—'}×{c.alto_vano_mm ?? '—'}</td>
                                        <td className="px-2 py-1.5">{c.registrado_por || '—'}</td>
                                        <td className="px-2 py-1.5 text-right">
                                            {!c.anulado && (
                                                <button onClick={() => anular(c)} className="text-rose-600 hover:text-rose-800" title="Anular">
                                                    <XCircle className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

// ─── Panel de holguras ──────────────────────────────────────────────────────

const PanelHolguras: React.FC<{ sistemas: EstadoSistemaCalibracion[] }> = ({ sistemas }) => {
    const [holguras, setHolguras] = useState<HolguraCalibracion[]>([]);
    const [cargando, setCargando] = useState(true);

    const [ambito, setAmbito] = useState<'global' | 'sistema'>('global');
    const [sistema, setSistema] = useState('');
    const [ancho, setAncho] = useState('3');
    const [alto, setAlto] = useState('3');
    const [nota, setNota] = useState('');
    const [guardando, setGuardando] = useState(false);

    const cargar = useCallback(async () => {
        setCargando(true);
        try {
            const { data } = await apiListarHolguras();
            setHolguras(data);
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'No se pudieron cargar las holguras.');
        } finally {
            setCargando(false);
        }
    }, []);

    useEffect(() => { cargar(); }, [cargar]);

    const fijar = async (ev: React.FormEvent) => {
        ev.preventDefault();
        if (ambito === 'sistema' && !sistema) {
            toast.error('Elegí un sistema.');
            return;
        }
        setGuardando(true);
        try {
            await apiFijarHolgura({
                ambito, sistema: ambito === 'sistema' ? sistema : undefined,
                anchoMm: Number(ancho), altoMm: Number(alto), nota: nota.trim() || null,
            });
            toast.success('Holgura fijada.');
            setNota('');
            cargar();
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'No se pudo fijar la holgura.');
        } finally {
            setGuardando(false);
        }
    };

    const anular = async (h: HolguraCalibracion) => {
        if (!window.confirm(`¿Anular la holgura de ${h.ambito === 'global' ? 'global' : h.sistema}? Vuelve a quedar "sin configurar".`)) return;
        try {
            await apiAnularHolgura(h.id);
            toast.success('Holgura anulada.');
            cargar();
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'No se pudo anular la holgura.');
        }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
            <Tarjeta titulo="Holguras vigentes" sinRelleno>
                {cargando ? (
                    <div className="p-6 flex justify-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
                ) : holguras.length === 0 ? (
                    <div className="p-6 text-sm text-slate-400">Sin holguras configuradas.</div>
                ) : (
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                            <tr>
                                <th className="text-left px-3 py-2">Ámbito</th>
                                <th className="text-left px-3 py-2">Medida</th>
                                <th className="text-left px-3 py-2">Nota</th>
                                <th className="text-left px-3 py-2">Definida por</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {holguras.map((h) => (
                                <tr key={h.id}>
                                    <td className="px-3 py-2 font-semibold text-slate-800">{h.ambito === 'global' ? 'Global' : h.sistema}</td>
                                    <td className="px-3 py-2 text-slate-600">{h.ancho_mm}×{h.alto_mm} mm</td>
                                    <td className="px-3 py-2 text-slate-500">{h.nota || '—'}</td>
                                    <td className="px-3 py-2 text-slate-500">{h.definido_por || '—'}</td>
                                    <td className="px-3 py-2 text-right">
                                        <BotonPeligro compacto icono={XCircle} onClick={() => anular(h)}>Anular</BotonPeligro>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </Tarjeta>

            <Tarjeta
                titulo="Fijar holgura"
                descripcion="Descuento del vano a la medida de fabricación (depende de la obra/instalación, no del perfil)."
                className="h-fit"
            >
                <form onSubmit={fijar} className="space-y-3">
                    <div className="flex gap-3">
                        <label className="flex items-center gap-1.5 text-sm">
                            <input type="radio" checked={ambito === 'global'} onChange={() => setAmbito('global')} /> Global
                        </label>
                        <label className="flex items-center gap-1.5 text-sm">
                            <input type="radio" checked={ambito === 'sistema'} onChange={() => setAmbito('sistema')} /> Por sistema
                        </label>
                    </div>
                    {ambito === 'sistema' && (
                        <Select value={sistema} onChange={(e) => setSistema(e.target.value)} required>
                            <option value="">Elegí un sistema…</option>
                            {sistemas.map((s) => <option key={s.sistema} value={s.sistema}>{s.sistema}</option>)}
                        </Select>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                        <Campo etiqueta="Ancho (mm)">
                            <Input value={ancho} onChange={(e) => setAncho(e.target.value)} inputMode="decimal" required />
                        </Campo>
                        <Campo etiqueta="Alto (mm)">
                            <Input value={alto} onChange={(e) => setAlto(e.target.value)} inputMode="decimal" required />
                        </Campo>
                    </div>
                    <Campo etiqueta="Nota">
                        <Input value={nota} onChange={(e) => setNota(e.target.value)} />
                    </Campo>
                    <BotonPrimario type="submit" icono={PlusCircle} cargando={guardando}>Fijar holgura</BotonPrimario>
                </form>
            </Tarjeta>
        </div>
    );
};

// ─── Panel de historial ─────────────────────────────────────────────────────

const PanelHistorial: React.FC = () => {
    const [items, setItems] = useState<HistorialCalibracion[]>([]);
    const [cargando, setCargando] = useState(true);

    useEffect(() => {
        apiListarHistorialCalibracion({ limit: 200 })
            .then(({ data }) => setItems(data))
            .catch((e) => toast.error(e?.response?.data?.error || 'No se pudo cargar el historial.'))
            .finally(() => setCargando(false));
    }, []);

    if (cargando) return <div className="p-6 text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline" /></div>;
    if (items.length === 0) return <div className="p-6 text-sm text-slate-400">Sin movimientos todavía.</div>;

    return (
        <Tarjeta sinRelleno>
            <table className="w-full text-sm">
                <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    <tr>
                        <th className="text-left px-3 py-2">Fecha</th>
                        <th className="text-left px-3 py-2">Acción</th>
                        <th className="text-left px-3 py-2">Detalle</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {items.map((h) => (
                        <tr key={h.id}>
                            <td className="px-3 py-2 text-slate-500">{fmtFecha(h.fecha)}</td>
                            <td className="px-3 py-2 font-semibold text-slate-700">{h.accion}</td>
                            <td className="px-3 py-2 text-slate-500 font-mono text-xs">{JSON.stringify(h.payload)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </Tarjeta>
    );
};

export default TabCalibracion;

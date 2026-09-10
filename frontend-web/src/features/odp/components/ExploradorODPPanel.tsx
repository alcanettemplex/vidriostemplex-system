import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import {
    Search, X, Loader2, ChevronUp, ChevronDown, ChevronsUpDown,
    CalendarRange, AlertTriangle, Filter, Inbox,
} from 'lucide-react';

import API from '../../../services/config';
import { badgeEstadoODP, ESTADO_LABELS_CORTOS } from '../../../utils/estadosODP';
import {
    apiGetExploradorODP, FiltrosExplorador, FilaExplorador,
    RespuestaExplorador, CampoFechaODP, TipoRegistroODP,
} from '../exploradorService';

// ─────────────────────────────────────────────────────────────────────────────
// Pestaña "Consultar" del módulo ODP — solo rol `admin`.
//
// Responde preguntas que ninguna otra pestaña puede: el listado de ODPListPage pide
// `excluir_completadas=true` y segmenta 200 filas del lado del cliente, así que deja
// fuera el ~78% terminado. "¿Qué está entregado y todavía sin facturar?" vive entero
// en ese 78%, y por eso este panel consulta al servidor (GET /api/odp/explorador) con
// su propio estado en vez de reusar el listado de la página.
//
// No se suscribe al socket a propósito: es una herramienta de consulta puntual, y
// enganchar `useODPSocketPatch` aquí lo pondría a pelear con un estado que no es el
// `listado` de la página.
// ─────────────────────────────────────────────────────────────────────────────

const fmtCOP = (v: number) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v);

const fmtFecha = (v?: string | null) =>
    v ? new Date(v).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—';

/**
 * Fecha local en formato YYYY-MM-DD.
 *
 * NO usar `toISOString().slice(0,10)`: convierte a UTC, y en Bogotá (UTC-5) una fecha
 * local a medianoche retrocede al día anterior. Es la misma clase de bug documentada
 * en TECH_DEBT 2026-07-12 para los rangos del CRM.
 */
const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Los 13 estados reales, en orden de flujo. PEDIDO_PROVEEDOR existe en el ENUM de
// Postgres pero está retirado del código desde el 2026-08-01: no se ofrece como filtro.
const ESTADOS: string[] = [
    'EN_ESPERA', 'VISITA_TECNICA', 'MEDICION', 'ALUMINIO_CORTADO', 'VIDRIO_RECIBIDO',
    'ACCESORIOS_SEPARADOS', 'LISTO_INSTALAR', 'PROGRAMADA', 'INSTALANDO',
    'INSTALADA', 'ENTREGADA', 'PAUSADA', 'ANULADA',
];

// Grupos rápidos: un clic para las preguntas frecuentes, chips sueltos para el resto.
// "Terminadas" + facturación PENDIENTE es literalmente la consulta "¿qué está por facturar?".
const GRUPOS: { key: string; label: string; estados: string[] }[] = [
    { key: 'taller', label: 'En taller', estados: ['EN_ESPERA', 'VISITA_TECNICA', 'MEDICION', 'ALUMINIO_CORTADO', 'VIDRIO_RECIBIDO', 'ACCESORIOS_SEPARADOS'] },
    { key: 'ruta', label: 'Listas / en ruta', estados: ['LISTO_INSTALAR', 'PROGRAMADA', 'INSTALANDO'] },
    { key: 'fin', label: 'Terminadas', estados: ['INSTALADA', 'ENTREGADA'] },
    { key: 'stop', label: 'Detenidas', estados: ['PAUSADA'] },
    { key: 'anul', label: 'Anuladas', estados: ['ANULADA'] },
];

const CAMPOS_FECHA: { v: CampoFechaODP; l: string }[] = [
    { v: 'fecha_creacion', l: 'Fecha de creación' },
    { v: 'fecha_entrega', l: 'Fecha de entrega' },
    { v: 'fecha_factura', l: 'Fecha de factura' },
    { v: 'fecha_listo_instalar', l: 'Fecha liberada a instalar' },
];

const TIPOS_REGISTRO: { v: TipoRegistroODP; l: string }[] = [
    { v: 'TODOS', l: 'Todos los registros' },
    { v: 'ODP', l: 'Solo ODP' },
    { v: 'OA', l: 'Solo OA' },
    { v: 'NC', l: 'Solo No Conformidades' },
    { v: 'GARANTIA', l: 'Solo Garantías' },
];

const LIMIT = 50;

const FILTROS_INICIALES: FiltrosExplorador = {
    campo_fecha: 'fecha_creacion',
    tipo_registro: 'TODOS',
    estados_produccion: [],
    orden_campo: 'fecha_creacion',
    orden_dir: 'DESC',
};

const selectClass = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200';
const labelClass = 'block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1';

interface Props {
    /** Abre la ficha de la ODP. Reusa el modal que la página ya tiene montado. */
    onAbrirODP: (id: number) => void;
}

const ExploradorODPPanel: React.FC<Props> = ({ onAbrirODP }) => {
    const [filtros, setFiltros] = useState<FiltrosExplorador>(FILTROS_INICIALES);
    const [searchInput, setSearchInput] = useState('');
    const [page, setPage] = useState(1);
    const [data, setData] = useState<RespuestaExplorador | null>(null);
    const [loading, setLoading] = useState(false);
    const [asesores, setAsesores] = useState<{ id: number; nombre_completo: string }[]>([]);
    const [diasCartera, setDiasCartera] = useState<number | null>(null);

    // El período es una elección explícita: la pestaña no consulta nada hasta que se
    // elige uno (incluido "Todo el histórico", que es un rango abierto pero deliberado).
    const [periodoElegido, setPeriodoElegido] = useState(false);
    const [presetActivo, setPresetActivo] = useState<string>('');

    // ─── Carga de apoyo ──────────────────────────────────────────────────────
    useEffect(() => {
        const headers = { Authorization: `Bearer ${sessionStorage.getItem('token')}` };
        axios.get(`${API}/api/usuarios`, { headers })
            .then(res => setAsesores((res.data || []).map((u: any) => ({ id: u.id, nombre_completo: u.nombre_completo }))))
            .catch(() => { /* el filtro de asesor queda vacío; no bloquea la consulta */ });

        // Umbral de días de cartera vencida: la BD manda, nunca un número quemado.
        // Se pide una vez por montaje, no en cada página de resultados.
        axios.get(`${API}/api/configuracion`, { headers })
            .then(res => setDiasCartera(Number(res.data?.dias_alerta_cartera_vencida) || 60))
            .catch(() => { /* el atajo de cartera se deshabilita si no se pudo leer */ });
    }, []);

    // Debounce del texto: evita una consulta por tecla.
    useEffect(() => {
        const t = setTimeout(() => {
            setFiltros(f => (f.search === (searchInput || undefined) ? f : { ...f, search: searchInput || undefined }));
        }, 400);
        return () => clearTimeout(t);
    }, [searchInput]);

    const cargar = useCallback(async () => {
        setLoading(true);
        try {
            const { data: resp } = await apiGetExploradorODP({ ...filtros, page, limit: LIMIT });
            setData(resp);
        } catch {
            toast.error('No se pudo ejecutar la consulta. Revisa los filtros e intenta de nuevo.');
        } finally {
            setLoading(false);
        }
    }, [filtros, page]);

    useEffect(() => { if (periodoElegido) cargar(); }, [periodoElegido, cargar]);

    // Cualquier cambio de filtro vuelve a la primera página: quedarse en la 4 tras
    // filtrar produce un "no hay resultados" que parece un error del sistema.
    const actualizar = useCallback((cambios: Partial<FiltrosExplorador>) => {
        setFiltros(f => ({ ...f, ...cambios }));
        setPage(1);
    }, []);

    // ─── Período ─────────────────────────────────────────────────────────────
    const aplicarPreset = (key: string) => {
        // "Personalizado" no toca el rango: solo activa la consulta con lo que ya haya en
        // los campos de fecha. Borrarlo obligaría a reescribirlo al volver de un preset.
        if (key === 'custom') {
            setPresetActivo('custom');
            setPeriodoElegido(true);
            return;
        }

        const hoy = new Date();
        let desde = '';
        let hasta = '';

        if (key === 'mes') {
            desde = iso(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
            hasta = iso(hoy);
        } else if (key === 'mes_pasado') {
            desde = iso(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1));
            hasta = iso(new Date(hoy.getFullYear(), hoy.getMonth(), 0));
        } else if (key === 'trimestre') {
            desde = iso(new Date(hoy.getFullYear(), hoy.getMonth() - 2, 1));
            hasta = iso(hoy);
        } else if (key === 'anio') {
            desde = iso(new Date(hoy.getFullYear(), 0, 1));
            hasta = iso(hoy);
        }
        // 'historico' deja el rango vacío = sin filtrar por fecha.

        setPresetActivo(key);
        setPeriodoElegido(true);
        actualizar({ fecha_desde: desde || undefined, fecha_hasta: hasta || undefined });
    };

    // ─── Estado de taller ────────────────────────────────────────────────────
    const estadosSel = filtros.estados_produccion || [];

    const toggleEstado = (estado: string) => {
        const siguiente = estadosSel.includes(estado)
            ? estadosSel.filter(e => e !== estado)
            : [...estadosSel, estado];
        actualizar({ estados_produccion: siguiente });
    };

    const toggleGrupo = (grupo: { estados: string[] }) => {
        const todosPuestos = grupo.estados.every(e => estadosSel.includes(e));
        const siguiente = todosPuestos
            ? estadosSel.filter(e => !grupo.estados.includes(e))
            : Array.from(new Set([...estadosSel, ...grupo.estados]));
        actualizar({ estados_produccion: siguiente });
    };

    /**
     * Atajo "Cartera vencida".
     *
     * NO es un filtro oculto: escribe los cuatro filtros atómicos que lo definen para
     * que queden a la vista y se puedan ajustar uno a uno. El backend reconstruye esa
     * misma combinación cuando /supervision-crm manda `cartera_vencida=true`, así que
     * ambos módulos devuelven exactamente el mismo conjunto.
     *
     * Definición: créditos con FE emitida hace más de N días, que aún deben plata y no
     * están cancelados en caja. N sale de `configuracion_global`.
     */
    const aplicarCarteraVencida = () => {
        if (diasCartera === null) return;
        const umbral = new Date();
        umbral.setDate(umbral.getDate() - diasCartera);
        setPresetActivo('historico');
        setPeriodoElegido(true);
        actualizar({
            fecha_desde: undefined,
            fecha_hasta: undefined,
            forma_pago: 'credito',
            solo_con_saldo: true,
            excluir_estado_caja: 'CANCELADO',
            estado_caja: undefined,
            facturada_antes_de: iso(umbral),
        });
    };

    const limpiarTodo = () => {
        setFiltros(FILTROS_INICIALES);
        setSearchInput('');
        setPresetActivo('');
        setPeriodoElegido(false);
        setData(null);
        setPage(1);
    };

    // ─── Chips de filtros activos ────────────────────────────────────────────
    // Con 11 filtros combinables, sin un resumen visible es fácil culpar al sistema de
    // "devolver mal" cuando lo que hay es un filtro olvidado tres campos más arriba.
    const chips = useMemo(() => {
        const out: { label: string; quitar: () => void }[] = [];
        const nombreAsesor = asesores.find(a => a.id === Number(filtros.asesor_id))?.nombre_completo;

        if (filtros.fecha_desde || filtros.fecha_hasta) {
            const campo = CAMPOS_FECHA.find(c => c.v === filtros.campo_fecha)?.l;
            out.push({
                label: `${campo}: ${filtros.fecha_desde || '…'} → ${filtros.fecha_hasta || '…'}`,
                quitar: () => { setPresetActivo('historico'); actualizar({ fecha_desde: undefined, fecha_hasta: undefined }); },
            });
        }
        estadosSel.forEach(e => out.push({
            label: ESTADO_LABELS_CORTOS[e] || e,
            quitar: () => toggleEstado(e),
        }));
        if (filtros.estado_facturacion) out.push({ label: `Facturación: ${filtros.estado_facturacion}`, quitar: () => actualizar({ estado_facturacion: undefined }) });
        if (filtros.estado_caja) out.push({ label: `Caja: ${filtros.estado_caja}`, quitar: () => actualizar({ estado_caja: undefined }) });
        if (filtros.excluir_estado_caja) out.push({ label: `Caja ≠ ${filtros.excluir_estado_caja}`, quitar: () => actualizar({ excluir_estado_caja: undefined }) });
        if (filtros.tipo_registro && filtros.tipo_registro !== 'TODOS') out.push({ label: TIPOS_REGISTRO.find(t => t.v === filtros.tipo_registro)?.l || '', quitar: () => actualizar({ tipo_registro: 'TODOS' }) });
        if (filtros.asesor_id) out.push({ label: `Asesor: ${nombreAsesor || filtros.asesor_id}`, quitar: () => actualizar({ asesor_id: undefined }) });
        if (filtros.search) out.push({ label: `"${filtros.search}"`, quitar: () => setSearchInput('') });
        if (filtros.forma_pago) out.push({ label: `Pago: ${filtros.forma_pago}`, quitar: () => actualizar({ forma_pago: undefined }) });
        if (filtros.monto_min) out.push({ label: `Desde ${fmtCOP(Number(filtros.monto_min))}`, quitar: () => actualizar({ monto_min: undefined }) });
        if (filtros.monto_max) out.push({ label: `Hasta ${fmtCOP(Number(filtros.monto_max))}`, quitar: () => actualizar({ monto_max: undefined }) });
        if (filtros.solo_con_saldo) out.push({ label: 'Con saldo pendiente', quitar: () => actualizar({ solo_con_saldo: false }) });
        if (filtros.facturada_antes_de) out.push({ label: `Facturada antes de ${filtros.facturada_antes_de}`, quitar: () => actualizar({ facturada_antes_de: undefined }) });
        return out;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filtros, asesores, estadosSel]);

    // ─── Ordenamiento ────────────────────────────────────────────────────────
    const ordenar = (campo: string) => {
        const mismoCampo = filtros.orden_campo === campo;
        actualizar({
            orden_campo: campo,
            orden_dir: mismoCampo && filtros.orden_dir === 'DESC' ? 'ASC' : 'DESC',
        });
    };

    const IconoOrden: React.FC<{ campo: string }> = ({ campo }) => {
        if (filtros.orden_campo !== campo) return <ChevronsUpDown className="w-3.5 h-3.5 ml-1 text-slate-300 inline" />;
        return filtros.orden_dir === 'ASC'
            ? <ChevronUp className="w-3.5 h-3.5 ml-1 text-indigo-500 inline" />
            : <ChevronDown className="w-3.5 h-3.5 ml-1 text-indigo-500 inline" />;
    };

    const th = (campo: string, texto: string, extra = '') => (
        <th
            onClick={() => ordenar(campo)}
            className={`px-4 py-3 font-medium cursor-pointer select-none hover:bg-slate-100 transition whitespace-nowrap ${extra}`}
        >
            {texto}<IconoOrden campo={campo} />
        </th>
    );

    const totales = data?.totales;
    const items: FilaExplorador[] = data?.items || [];

    return (
        <div className="p-4 space-y-4">
            {/* ── 1. Período ───────────────────────────────────────────────── */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                    <CalendarRange className="w-4 h-4 text-indigo-600" />
                    <span className="text-sm font-bold text-slate-700">Período</span>
                    <span className="text-xs text-slate-400">— elige uno para ejecutar la consulta</span>
                </div>

                <div className="flex flex-wrap gap-2 mb-3">
                    {[
                        { k: 'mes', l: 'Este mes' },
                        { k: 'mes_pasado', l: 'Mes pasado' },
                        { k: 'trimestre', l: 'Últimos 3 meses' },
                        { k: 'anio', l: 'Año actual' },
                        { k: 'historico', l: 'Todo el histórico' },
                        { k: 'custom', l: 'Personalizado' },
                    ].map(p => (
                        <button
                            key={p.k}
                            onClick={() => aplicarPreset(p.k)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${presetActivo === p.k
                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                        >
                            {p.l}
                        </button>
                    ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                        <label className={labelClass}>Campo de fecha</label>
                        <select
                            className={selectClass}
                            value={filtros.campo_fecha}
                            onChange={e => actualizar({ campo_fecha: e.target.value as CampoFechaODP })}
                        >
                            {CAMPOS_FECHA.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className={labelClass}>Desde</label>
                        <input
                            type="date" className={selectClass} value={filtros.fecha_desde || ''}
                            onChange={e => { setPresetActivo('custom'); setPeriodoElegido(true); actualizar({ fecha_desde: e.target.value || undefined }); }}
                        />
                    </div>
                    <div>
                        <label className={labelClass}>Hasta</label>
                        <input
                            type="date" className={selectClass} value={filtros.fecha_hasta || ''}
                            onChange={e => { setPresetActivo('custom'); setPeriodoElegido(true); actualizar({ fecha_hasta: e.target.value || undefined }); }}
                        />
                    </div>
                </div>
                <p className="text-[11px] text-slate-400 mt-2">
                    El rango solo aplica cuando tiene ambos extremos. «Fecha de factura» busca por presencia de
                    factura electrónica —principal o adicional— dentro del período.
                </p>
            </div>

            {/* ── 2. Estado de taller ──────────────────────────────────────── */}
            <div className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                    <Filter className="w-4 h-4 text-indigo-600" />
                    <span className="text-sm font-bold text-slate-700">Estado de taller</span>
                    {estadosSel.length > 0 && (
                        <button onClick={() => actualizar({ estados_produccion: [] })} className="text-xs text-slate-400 hover:text-rose-600 underline">
                            quitar los {estadosSel.length}
                        </button>
                    )}
                </div>

                <div className="flex flex-wrap gap-2 mb-3">
                    {GRUPOS.map(g => {
                        const activo = g.estados.every(e => estadosSel.includes(e));
                        return (
                            <button
                                key={g.key}
                                onClick={() => toggleGrupo(g)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${activo
                                    ? 'bg-slate-800 text-white border-slate-800'
                                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                            >
                                {g.label}
                            </button>
                        );
                    })}
                </div>

                <div className="flex flex-wrap gap-1.5">
                    {ESTADOS.map(e => {
                        const activo = estadosSel.includes(e);
                        return (
                            <button
                                key={e}
                                onClick={() => toggleEstado(e)}
                                className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition ${activo
                                    ? badgeEstadoODP(e) + ' ring-2 ring-offset-1 ring-indigo-300'
                                    : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'}`}
                            >
                                {ESTADO_LABELS_CORTOS[e] || e}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ── 3. Comercial ─────────────────────────────────────────────── */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-1 md:grid-cols-5 gap-3">
                <div>
                    <label className={labelClass}>Facturación</label>
                    <select className={selectClass} value={filtros.estado_facturacion || ''} onChange={e => actualizar({ estado_facturacion: e.target.value || undefined })}>
                        <option value="">Todas</option>
                        <option value="PENDIENTE">Pendiente</option>
                        <option value="FACTURADA">Facturada</option>
                    </select>
                </div>
                <div>
                    <label className={labelClass}>Estado de caja</label>
                    <select className={selectClass} value={filtros.estado_caja || ''} onChange={e => actualizar({ estado_caja: e.target.value || undefined, excluir_estado_caja: undefined })}>
                        <option value="">Todos</option>
                        <option value="PENDIENTE">Pendiente</option>
                        <option value="ABONADO">Abonado</option>
                        <option value="CANCELADO">Cancelado</option>
                        <option value="CREDITO_APROBADO">Crédito aprobado</option>
                    </select>
                </div>
                <div>
                    <label className={labelClass}>Tipo de registro</label>
                    <select className={selectClass} value={filtros.tipo_registro} onChange={e => actualizar({ tipo_registro: e.target.value as TipoRegistroODP })}>
                        {TIPOS_REGISTRO.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
                    </select>
                </div>
                <div>
                    <label className={labelClass}>Asesor</label>
                    <select className={selectClass} value={filtros.asesor_id || ''} onChange={e => actualizar({ asesor_id: e.target.value ? Number(e.target.value) : undefined })}>
                        <option value="">Todos</option>
                        {asesores.map(a => <option key={a.id} value={a.id}>{a.nombre_completo}</option>)}
                    </select>
                </div>
                <div>
                    <label className={labelClass}>Buscar</label>
                    <div className="relative">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                            className={`${selectClass} pl-9`}
                            placeholder="Nº ODP o cliente"
                            value={searchInput}
                            onChange={e => setSearchInput(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            {/* ── 4. Dinero ────────────────────────────────────────────────── */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                <div>
                    <label className={labelClass}>Forma de pago</label>
                    <select className={selectClass} value={filtros.forma_pago || ''} onChange={e => actualizar({ forma_pago: e.target.value || undefined })}>
                        <option value="">Todas</option>
                        <option value="contado">Contado</option>
                        <option value="credito">Crédito</option>
                    </select>
                </div>
                <div>
                    <label className={labelClass}>Valor desde</label>
                    <input type="number" className={selectClass} placeholder="0" value={filtros.monto_min || ''} onChange={e => actualizar({ monto_min: e.target.value || undefined })} />
                </div>
                <div>
                    <label className={labelClass}>Valor hasta</label>
                    <input type="number" className={selectClass} placeholder="Sin tope" value={filtros.monto_max || ''} onChange={e => actualizar({ monto_max: e.target.value || undefined })} />
                </div>
                <div>
                    <label className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
                        <input
                            type="checkbox"
                            className="w-4 h-4 accent-indigo-600"
                            checked={!!filtros.solo_con_saldo}
                            onChange={e => actualizar({ solo_con_saldo: e.target.checked })}
                        />
                        <span className="text-sm text-slate-700">Con saldo pendiente</span>
                    </label>
                </div>
                <div>
                    <button
                        onClick={aplicarCarteraVencida}
                        disabled={diasCartera === null}
                        title={diasCartera === null ? 'No se pudo leer el umbral configurado' : `Créditos facturados hace más de ${diasCartera} días y aún con saldo`}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-bold border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 transition disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <AlertTriangle className="w-4 h-4" />
                        Cartera vencida{diasCartera !== null && ` (${diasCartera}d)`}
                    </button>
                </div>
            </div>

            {/* ── Chips de filtros activos ─────────────────────────────────── */}
            {chips.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                    {chips.map((c, i) => (
                        <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-[11px] font-bold">
                            {c.label}
                            <button onClick={c.quitar} className="hover:text-rose-600"><X className="w-3 h-3" /></button>
                        </span>
                    ))}
                    <button onClick={limpiarTodo} className="text-[11px] font-bold text-slate-500 hover:text-rose-600 underline ml-1">
                        Limpiar todo
                    </button>
                </div>
            )}

            {/* ── Totales ──────────────────────────────────────────────────── */}
            {periodoElegido && totales && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                        { l: 'Órdenes', v: String(totales.count), c: 'text-slate-800' },
                        { l: 'Valor total', v: fmtCOP(totales.valor_total), c: 'text-slate-800' },
                        { l: 'Abonado', v: fmtCOP(totales.abono), c: 'text-emerald-700' },
                        { l: 'Pendiente', v: fmtCOP(totales.pendiente), c: 'text-rose-700' },
                    ].map(t => (
                        <div key={t.l} className="bg-white border border-slate-200 rounded-xl px-4 py-3">
                            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{t.l}</div>
                            <div className={`text-lg font-black ${t.c}`}>{t.v}</div>
                        </div>
                    ))}
                </div>
            )}

            {/* ── Resultados ───────────────────────────────────────────────── */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                {!periodoElegido ? (
                    <div className="py-16 text-center">
                        <CalendarRange className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                        <p className="text-slate-600 font-semibold">Elige un período para consultar</p>
                        <p className="text-slate-400 text-sm mt-1">
                            Usa «Todo el histórico» si buscas órdenes viejas — por ejemplo, entregadas hace meses y aún sin facturar.
                        </p>
                    </div>
                ) : (
                    <>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                                    <tr>
                                        {th('numero_odp', 'Nº ODP')}
                                        <th className="px-4 py-3 font-medium text-left">Cliente</th>
                                        <th className="px-4 py-3 font-medium text-left">Asesor</th>
                                        {th('estado_produccion', 'Estado taller')}
                                        <th className="px-4 py-3 font-medium">Facturación</th>
                                        <th className="px-4 py-3 font-medium">Caja</th>
                                        {th('valor_total', 'Valor', 'text-right')}
                                        {th('abono', 'Abono', 'text-right')}
                                        {th('pendiente', 'Pendiente', 'text-right')}
                                        {th('fecha_creacion', 'Creación')}
                                        {th('fecha_entrega', 'Entrega')}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {loading ? (
                                        <tr><td colSpan={11} className="py-16 text-center text-slate-400">
                                            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                                            Consultando…
                                        </td></tr>
                                    ) : items.length === 0 ? (
                                        <tr><td colSpan={11} className="py-16 text-center">
                                            <Inbox className="w-9 h-9 text-slate-300 mx-auto mb-2" />
                                            <p className="text-slate-600 font-semibold">Ninguna ODP cumple estos filtros</p>
                                            <p className="text-slate-400 text-sm mt-1">Revisa los chips de arriba: suele sobrar un filtro.</p>
                                        </td></tr>
                                    ) : items.map(o => (
                                        <tr
                                            key={o.id}
                                            onClick={() => onAbrirODP(o.id)}
                                            className="hover:bg-indigo-50/40 cursor-pointer transition"
                                        >
                                            <td className="px-4 py-3 font-bold text-slate-800 whitespace-nowrap">
                                                {o.numero_odp}
                                                {o.es_no_conformidad && <span className="ml-1.5 px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 text-[10px] font-black">NC</span>}
                                                {o.es_garantia && <span className="ml-1.5 px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 text-[10px] font-black">GAR</span>}
                                                {o.tipo_odp === 'OA' && <span className="ml-1.5 px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 text-[10px] font-black">OA</span>}
                                            </td>
                                            <td className="px-4 py-3 text-slate-700 max-w-[220px] truncate" title={o.cliente_nombre || ''}>{o.cliente_nombre || '—'}</td>
                                            <td className="px-4 py-3 text-slate-500 max-w-[160px] truncate">{o.asesor_nombre || '—'}</td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={`px-2 py-0.5 rounded-full border text-[11px] font-bold whitespace-nowrap ${badgeEstadoODP(o.estado_produccion)}`}>
                                                    {ESTADO_LABELS_CORTOS[o.estado_produccion] || o.estado_produccion}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={`px-2 py-0.5 rounded-full border text-[11px] font-bold ${o.estado_facturacion === 'FACTURADA'
                                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                                    : 'bg-amber-100 text-amber-800 border-amber-200'}`}>
                                                    {o.estado_facturacion === 'FACTURADA' ? 'Facturada' : 'Pendiente'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-center text-[11px] font-bold text-slate-600">{o.estado_caja}</td>
                                            <td className="px-4 py-3 text-right text-slate-700 whitespace-nowrap">{fmtCOP(o.valor_total)}</td>
                                            <td className="px-4 py-3 text-right text-emerald-700 whitespace-nowrap">{fmtCOP(o.abono)}</td>
                                            <td className={`px-4 py-3 text-right whitespace-nowrap font-bold ${o.pendiente > 0 ? 'text-rose-600' : 'text-slate-400'}`}>{fmtCOP(o.pendiente)}</td>
                                            <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmtFecha(o.fecha_creacion)}</td>
                                            <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmtFecha(o.fecha_entrega)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {data && data.totalPages > 1 && (
                            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50/50">
                                <span className="text-xs text-slate-500">
                                    Mostrando {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, data.total)} de {data.total}
                                </span>
                                <div className="flex items-center gap-2">
                                    <button
                                        disabled={page <= 1}
                                        onClick={() => setPage(p => Math.max(1, p - 1))}
                                        className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-200 bg-white disabled:opacity-40 hover:bg-slate-100"
                                    >
                                        Anterior
                                    </button>
                                    <span className="text-xs text-slate-600 font-semibold">Página {page} de {data.totalPages}</span>
                                    <button
                                        disabled={page >= data.totalPages}
                                        onClick={() => setPage(p => p + 1)}
                                        className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-200 bg-white disabled:opacity-40 hover:bg-slate-100"
                                    >
                                        Siguiente
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default ExploradorODPPanel;

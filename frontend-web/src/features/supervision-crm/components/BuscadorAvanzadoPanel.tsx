import React, { useCallback, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { motion } from 'framer-motion';
import { toast } from 'react-toastify';
import { Search, Download, Loader2, Truck, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  apiGetBuscadorODP, apiExportarBuscadorODPExcel, apiGetBuscadorLeads, apiExportarBuscadorLeadsExcel,
} from '../supervisionService';
import { apiGetLeadById } from '../../crm/crmService';
import LeadDetalleModal from '../../crm/components/LeadDetalleModal';
import ODPFichaModal from '../../odp/components/ODPFichaModal';
import { BuscadorODPItem, BuscadorLeadItem } from '../types';

type Modo = 'odp' | 'leads';
type TriEstado = '' | 'true' | 'false';

interface Props {
  fechaDesde: string;
  fechaHasta: string;
  asesorId: number | undefined;
}

const LIMIT = 30;

const ESTADOS_CRM = ['NUEVO', 'ASIGNADO', 'EN_CONTACTO', 'COTIZANDO', 'SEGUIMIENTO', 'VISITA_TECNICA', 'FRIO', 'APROBADO', 'PERDIDO'];
const FUENTES_LEAD = ['Web', 'Facebook', 'Instagram', 'WhatsApp', 'Llamada', 'Presencial', 'Show Room', 'Referidos', 'Visita Asesor', 'Cliente'];
const SEGMENTOS_LEAD = ['Arquitecto', 'Cliente final', 'Industrial', 'Institucional', 'Intervid'];
const MOTIVOS_PERDIDA = [
  'Precio muy alto', 'Eligió a la competencia', 'No tenía presupuesto', 'Proyecto cancelado',
  'No respondió (ghosting total)', 'No era el producto correcto', 'Lead duplicado', 'Otro motivo',
];
const ESTADOS_PRODUCCION = [
  'EN_ESPERA', 'VISITA_TECNICA', 'MEDICION', 'ALUMINIO_CORTADO', 'VIDRIO_RECIBIDO',
  'ACCESORIOS_SEPARADOS', 'LISTO_INSTALAR', 'PROGRAMADA', 'INSTALADA', 'ENTREGADA', 'PAUSADA',
];
const FORMAS_PAGO: { value: string; label: string }[] = [
  { value: 'contado', label: 'Pago Anticipado' },
  { value: 'credito', label: 'Crédito' },
  { value: '50_50', label: '50% anticipo / 50% entrega' },
];

const fmtCOP = (v: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v);

const selectCls = 'text-xs font-semibold text-apple-text bg-apple-gray rounded-lg px-2 py-1.5 outline-none cursor-pointer';
const inputCls = 'text-xs font-medium text-apple-text bg-apple-gray rounded-lg px-2 py-1.5 outline-none';

const BuscadorAvanzadoPanel: React.FC<Props> = ({ fechaDesde, fechaHasta, asesorId }) => {
  const user = useSelector((state: any) => state.auth.user);
  const [modo, setModo] = useState<Modo>('odp');

  // Filtros específicos de ODP
  const [campoFecha, setCampoFecha] = useState<'fecha_factura' | 'fecha_creacion' | 'fecha_entrega'>('fecha_factura');
  const [estadoFacturacion, setEstadoFacturacion] = useState('');
  const [estadoCaja, setEstadoCaja] = useState('');
  const [acarreo, setAcarreo] = useState<TriEstado>('');
  const [instalacion, setInstalacion] = useState<TriEstado>('');
  const [tipoOdp, setTipoOdp] = useState('');
  const [searchOdp, setSearchOdp] = useState('');
  const [estadoProduccion, setEstadoProduccion] = useState('');
  const [montoMinOdp, setMontoMinOdp] = useState('');
  const [montoMaxOdp, setMontoMaxOdp] = useState('');
  const [incluirGarantias, setIncluirGarantias] = useState(false);
  const [esNoConformidad, setEsNoConformidad] = useState<TriEstado>('');
  const [formaPago, setFormaPago] = useState('');
  const [carteraVencida, setCarteraVencida] = useState(false);

  // Filtros específicos de Leads
  const [estadoCrm, setEstadoCrm] = useState('');
  const [fuenteLead, setFuenteLead] = useState('');
  const [searchLead, setSearchLead] = useState('');
  const [segmento, setSegmento] = useState('');
  const [respondio, setRespondio] = useState('');
  const [motivoPerdida, setMotivoPerdida] = useState('');
  const [montoMinLead, setMontoMinLead] = useState('');
  const [montoMaxLead, setMontoMaxLead] = useState('');
  const [tieneOdp, setTieneOdp] = useState<TriEstado>('');

  const [page, setPage] = useState(1);
  const [odpData, setOdpData] = useState<{ items: BuscadorODPItem[]; total: number; monto_instalado_pagina: number } | null>(null);
  const [leadsData, setLeadsData] = useState<{ items: BuscadorLeadItem[]; total: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [exportando, setExportando] = useState(false);

  const [selectedOdpId, setSelectedOdpId] = useState<number | null>(null);
  const [leadDetalle, setLeadDetalle] = useState<any>(null);
  const [cargandoLead, setCargandoLead] = useState(false);

  const cargarODP = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await apiGetBuscadorODP({
        fecha_desde: fechaDesde,
        fecha_hasta: fechaHasta,
        campo_fecha: campoFecha,
        asesor_id: asesorId,
        estado_facturacion: estadoFacturacion || undefined,
        estado_caja: estadoCaja || undefined,
        acarreo: acarreo === '' ? undefined : acarreo === 'true',
        instalacion: instalacion === '' ? undefined : instalacion === 'true',
        tipo_odp: tipoOdp || undefined,
        search: searchOdp || undefined,
        estado_produccion: estadoProduccion || undefined,
        monto_min: montoMinOdp ? parseFloat(montoMinOdp) : undefined,
        monto_max: montoMaxOdp ? parseFloat(montoMaxOdp) : undefined,
        incluir_garantias: incluirGarantias || undefined,
        es_no_conformidad: esNoConformidad === '' ? undefined : esNoConformidad === 'true',
        forma_pago: formaPago || undefined,
        cartera_vencida: carteraVencida || undefined,
        page,
        limit: LIMIT,
      });
      setOdpData(data);
    } catch {
      toast.error('No se pudo cargar la búsqueda de ODPs');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    fechaDesde, fechaHasta, asesorId, campoFecha, estadoFacturacion, estadoCaja, acarreo, instalacion, tipoOdp, searchOdp,
    estadoProduccion, montoMinOdp, montoMaxOdp, incluirGarantias, esNoConformidad, formaPago, carteraVencida, page,
  ]);

  const cargarLeads = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await apiGetBuscadorLeads({
        fecha_desde: fechaDesde,
        fecha_hasta: fechaHasta,
        asesor_id: asesorId,
        estado_crm: estadoCrm || undefined,
        fuente_lead: fuenteLead || undefined,
        search: searchLead || undefined,
        segmento: segmento || undefined,
        respondio: respondio || undefined,
        motivo_perdida: motivoPerdida || undefined,
        monto_min: montoMinLead ? parseFloat(montoMinLead) : undefined,
        monto_max: montoMaxLead ? parseFloat(montoMaxLead) : undefined,
        tiene_odp: tieneOdp === '' ? undefined : tieneOdp === 'true',
        page,
        limit: LIMIT,
      });
      setLeadsData(data);
    } catch {
      toast.error('No se pudo cargar la búsqueda de leads');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    fechaDesde, fechaHasta, asesorId, estadoCrm, fuenteLead, searchLead,
    segmento, respondio, motivoPerdida, montoMinLead, montoMaxLead, tieneOdp, page,
  ]);

  useEffect(() => { setPage(1); }, [modo]);
  useEffect(() => { if (modo === 'odp') cargarODP(); }, [modo, cargarODP]);
  useEffect(() => { if (modo === 'leads') cargarLeads(); }, [modo, cargarLeads]);

  const handleExportar = async () => {
    setExportando(true);
    try {
      const resp = modo === 'odp'
        ? await apiExportarBuscadorODPExcel({
            fecha_desde: fechaDesde,
            fecha_hasta: fechaHasta,
            campo_fecha: campoFecha,
            asesor_id: asesorId,
            estado_facturacion: estadoFacturacion || undefined,
            estado_caja: estadoCaja || undefined,
            acarreo: acarreo === '' ? undefined : acarreo === 'true',
            instalacion: instalacion === '' ? undefined : instalacion === 'true',
            tipo_odp: tipoOdp || undefined,
            search: searchOdp || undefined,
            estado_produccion: estadoProduccion || undefined,
            monto_min: montoMinOdp ? parseFloat(montoMinOdp) : undefined,
            monto_max: montoMaxOdp ? parseFloat(montoMaxOdp) : undefined,
            incluir_garantias: incluirGarantias || undefined,
            es_no_conformidad: esNoConformidad === '' ? undefined : esNoConformidad === 'true',
            forma_pago: formaPago || undefined,
            cartera_vencida: carteraVencida || undefined,
          })
        : await apiExportarBuscadorLeadsExcel({
            fecha_desde: fechaDesde,
            fecha_hasta: fechaHasta,
            asesor_id: asesorId,
            estado_crm: estadoCrm || undefined,
            fuente_lead: fuenteLead || undefined,
            search: searchLead || undefined,
            segmento: segmento || undefined,
            respondio: respondio || undefined,
            motivo_perdida: motivoPerdida || undefined,
            monto_min: montoMinLead ? parseFloat(montoMinLead) : undefined,
            monto_max: montoMaxLead ? parseFloat(montoMaxLead) : undefined,
            tiene_odp: tieneOdp === '' ? undefined : tieneOdp === 'true',
          });
      const url = URL.createObjectURL(new Blob([resp.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }));
      const a = document.createElement('a');
      a.href = url;
      a.download = modo === 'odp' ? 'buscador_odp.xlsx' : 'buscador_leads.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'No se pudo exportar el Excel. Acota los filtros e intenta de nuevo.');
    } finally {
      setExportando(false);
    }
  };

  const handleLeadClick = async (leadId: number) => {
    setCargandoLead(true);
    try {
      const { data } = await apiGetLeadById(leadId);
      setLeadDetalle(data);
    } catch {
      toast.error('No se pudo cargar el detalle del lead');
    } finally {
      setCargandoLead(false);
    }
  };

  const total = modo === 'odp' ? (odpData?.total || 0) : (leadsData?.total || 0);
  const totalPaginas = Math.ceil(total / LIMIT);

  return (
    <div className="space-y-4">
      {/* Selector de modo + exportar */}
      <div className="flex items-center justify-between flex-wrap gap-3 bg-white rounded-2xl px-4 py-3 shadow-apple">
        <div className="flex items-center gap-0.5 bg-apple-gray rounded-xl p-1">
          {(['odp', 'leads'] as Modo[]).map(m => (
            <button
              key={m}
              onClick={() => setModo(m)}
              className={`relative px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${modo === m ? 'text-apple-text' : 'text-apple-text-secondary'}`}
            >
              {modo === m && (
                <motion.span
                  layoutId="buscadorSegmentedActive"
                  className="absolute inset-0 bg-white rounded-lg shadow-sm"
                  transition={{ type: 'spring', duration: 0.4, bounce: 0.15 }}
                />
              )}
              <span className="relative z-10">{m === 'odp' ? 'ODPs' : 'Leads'}</span>
            </button>
          ))}
        </div>
        <button
          onClick={handleExportar}
          disabled={exportando || total === 0}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-apple-green hover:bg-apple-green/90 text-white text-xs font-semibold transition-colors disabled:opacity-40"
        >
          {exportando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          Exportar Excel
        </button>
      </div>

      {/* Filtros específicos del modo activo */}
      {modo === 'odp' ? (
        <div className="flex flex-wrap items-center gap-3 bg-white rounded-2xl px-4 py-3 shadow-apple">
          <select value={campoFecha} onChange={e => { setCampoFecha(e.target.value as any); setPage(1); }} className={selectCls}>
            <option value="fecha_factura">Fecha de factura</option>
            <option value="fecha_creacion">Fecha de creación</option>
            <option value="fecha_entrega">Fecha de entrega</option>
          </select>
          <select value={estadoFacturacion} onChange={e => { setEstadoFacturacion(e.target.value); setPage(1); }} className={selectCls}>
            <option value="">Facturación: todas</option>
            <option value="PENDIENTE">Pendiente</option>
            <option value="FACTURADA">Facturada</option>
          </select>
          <select value={estadoCaja} onChange={e => { setEstadoCaja(e.target.value); setPage(1); }} className={selectCls}>
            <option value="">Caja: todas</option>
            <option value="PENDIENTE">Pendiente</option>
            <option value="ABONADO">Abonado</option>
            <option value="CANCELADO">Cancelado</option>
            <option value="CREDITO_APROBADO">Crédito aprobado</option>
          </select>
          <select value={acarreo} onChange={e => { setAcarreo(e.target.value as TriEstado); setPage(1); }} className={selectCls}>
            <option value="">Acarreo: todos</option>
            <option value="true">Solo acarreo</option>
            <option value="false">Sin acarreo</option>
          </select>
          <select value={instalacion} onChange={e => { setInstalacion(e.target.value as TriEstado); setPage(1); }} className={selectCls}>
            <option value="">Instalación: todas</option>
            <option value="true">Solo instalación</option>
            <option value="false">Sin instalación</option>
          </select>
          <select value={tipoOdp} onChange={e => { setTipoOdp(e.target.value); setPage(1); }} className={selectCls}>
            <option value="">Tipo: todos</option>
            <option value="ODP">ODP</option>
            <option value="OA">OA</option>
          </select>
          <select value={estadoProduccion} onChange={e => { setEstadoProduccion(e.target.value); setPage(1); }} className={selectCls}>
            <option value="">Etapa producción: todas</option>
            {ESTADOS_PRODUCCION.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
          <select value={formaPago} onChange={e => { setFormaPago(e.target.value); setPage(1); }} className={selectCls}>
            <option value="">Forma de pago: todas</option>
            {FORMAS_PAGO.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
          <select value={esNoConformidad} onChange={e => { setEsNoConformidad(e.target.value as TriEstado); setPage(1); }} className={selectCls}>
            <option value="">No Conformidad: todas</option>
            <option value="true">Solo NC</option>
            <option value="false">Sin NC</option>
          </select>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              value={montoMinOdp}
              onChange={e => { setMontoMinOdp(e.target.value); setPage(1); }}
              placeholder="Monto mín."
              className={`${inputCls} w-24`}
            />
            <span className="text-apple-text-tertiary">–</span>
            <input
              type="number"
              value={montoMaxOdp}
              onChange={e => { setMontoMaxOdp(e.target.value); setPage(1); }}
              placeholder="Monto máx."
              className={`${inputCls} w-24`}
            />
          </div>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-apple-text-secondary cursor-pointer">
            <input type="checkbox" checked={incluirGarantias} onChange={e => { setIncluirGarantias(e.target.checked); setPage(1); }} className="cursor-pointer accent-apple-blue" />
            Incluir garantías
          </label>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-apple-red cursor-pointer">
            <input type="checkbox" checked={carteraVencida} onChange={e => { setCarteraVencida(e.target.checked); setPage(1); }} className="cursor-pointer accent-apple-red" />
            Solo cartera vencida
          </label>
          <div className="flex items-center gap-1.5 flex-1 min-w-[180px]">
            <Search className="w-3.5 h-3.5 text-apple-text-tertiary shrink-0" />
            <input
              type="text"
              value={searchOdp}
              onChange={e => setSearchOdp(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { setPage(1); cargarODP(); } }}
              placeholder="Buscar por ODP o cliente..."
              className={`${inputCls} flex-1 min-w-0`}
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3 bg-white rounded-2xl px-4 py-3 shadow-apple">
          <select value={estadoCrm} onChange={e => { setEstadoCrm(e.target.value); setPage(1); }} className={selectCls}>
            <option value="">Etapa: todas</option>
            {ESTADOS_CRM.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
          <select value={fuenteLead} onChange={e => { setFuenteLead(e.target.value); setPage(1); }} className={selectCls}>
            <option value="">Fuente: todas</option>
            {FUENTES_LEAD.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          <select value={segmento} onChange={e => { setSegmento(e.target.value); setPage(1); }} className={selectCls}>
            <option value="">Segmento: todos</option>
            {SEGMENTOS_LEAD.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={respondio} onChange={e => { setRespondio(e.target.value); setPage(1); }} className={selectCls}>
            <option value="">Respondió: todos</option>
            <option value="Espera de información">Espera de información</option>
            <option value="No responde">No responde</option>
            <option value="Si">Sí</option>
          </select>
          <select value={motivoPerdida} onChange={e => { setMotivoPerdida(e.target.value); setPage(1); }} className={selectCls}>
            <option value="">Motivo de pérdida: todos</option>
            {MOTIVOS_PERDIDA.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={tieneOdp} onChange={e => { setTieneOdp(e.target.value as TriEstado); setPage(1); }} className={selectCls}>
            <option value="">¿Tiene ODP?: todos</option>
            <option value="true">Convertidos a ODP</option>
            <option value="false">Sin ODP aún</option>
          </select>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              value={montoMinLead}
              onChange={e => { setMontoMinLead(e.target.value); setPage(1); }}
              placeholder="Monto mín."
              className={`${inputCls} w-24`}
            />
            <span className="text-apple-text-tertiary">–</span>
            <input
              type="number"
              value={montoMaxLead}
              onChange={e => { setMontoMaxLead(e.target.value); setPage(1); }}
              placeholder="Monto máx."
              className={`${inputCls} w-24`}
            />
          </div>
          <div className="flex items-center gap-1.5 flex-1 min-w-[180px]">
            <Search className="w-3.5 h-3.5 text-apple-text-tertiary shrink-0" />
            <input
              type="text"
              value={searchLead}
              onChange={e => setSearchLead(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { setPage(1); cargarLeads(); } }}
              placeholder="Buscar por nombre o teléfono..."
              className={`${inputCls} flex-1 min-w-0`}
            />
          </div>
        </div>
      )}

      {/* KPI monto instalado — solo tiene sentido en ODPs */}
      {modo === 'odp' && odpData && (
        <div className="flex items-center gap-2 text-xs font-semibold text-apple-text-secondary px-1">
          <Truck className="w-3.5 h-3.5" />
          Monto instalado en esta página: <span className="text-apple-text font-bold">{fmtCOP(odpData.monto_instalado_pagina)}</span>
        </div>
      )}

      {/* Tabla de resultados */}
      <div className="bg-white rounded-2xl shadow-apple overflow-hidden">
        <div className="overflow-x-auto">
          {modo === 'odp' ? (
            <table className="w-full text-xs whitespace-nowrap">
              <thead>
                <tr className="bg-apple-bg text-apple-text-tertiary uppercase text-[10px] font-bold tracking-wider">
                  <th className="px-4 py-3 text-left">ODP</th>
                  <th className="px-4 py-3 text-left">Cliente</th>
                  <th className="px-4 py-3 text-left">Fuente</th>
                  <th className="px-4 py-3 text-left">Asesor</th>
                  <th className="px-4 py-3 text-left">Estado</th>
                  <th className="px-4 py-3 text-left">Facturación</th>
                  <th className="px-4 py-3 text-left">Caja</th>
                  <th className="px-4 py-3 text-right">Facturado</th>
                  <th className="px-4 py-3 text-right">Abonado</th>
                  <th className="px-4 py-3 text-left">FE</th>
                  <th className="px-4 py-3 text-left">Forma pago</th>
                  <th className="px-4 py-3 text-center">Acarreo</th>
                  <th className="px-4 py-3 text-center">Instalación</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-apple-hairline">
                {(odpData?.items || []).map(item => (
                  <tr key={item.id} onClick={() => setSelectedOdpId(item.id)} className="hover:bg-apple-blue/5 cursor-pointer transition-colors">
                    <td className="px-4 py-3 font-bold text-apple-text">
                      {item.numero_odp}
                      {item.es_no_conformidad && (
                        <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-apple-red/10 text-apple-red align-middle">NC</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-apple-text-secondary truncate max-w-[180px]">{item.cliente_nombre || '—'}</td>
                    <td className="px-4 py-3 text-apple-text-secondary">{item.fuente || '—'}</td>
                    <td className="px-4 py-3 text-apple-text-secondary">{item.asesor_nombre || '—'}</td>
                    <td className="px-4 py-3 text-apple-text-secondary">{item.estado_produccion}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${item.estado_facturacion === 'FACTURADA' ? 'bg-apple-green/10 text-apple-green' : 'bg-apple-gray text-apple-text-secondary'}`}>
                        {item.estado_facturacion}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        item.estado_caja === 'ABONADO' ? 'bg-apple-green/10 text-apple-green'
                          : item.estado_caja === 'CANCELADO' ? 'bg-apple-red/10 text-apple-red'
                          : 'bg-apple-orange/10 text-apple-orange'
                      }`}>
                        {item.estado_caja}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-apple-text">{fmtCOP(item.valor_total)}</td>
                    <td className="px-4 py-3 text-right text-apple-text-secondary">{fmtCOP(item.abono)}</td>
                    <td className="px-4 py-3 text-apple-text-secondary">
                      {item.factura_electronica || '—'}
                      {item.facturas_adicionales.length > 0 && ` +${item.facturas_adicionales.length}`}
                    </td>
                    <td className="px-4 py-3 text-apple-text-secondary">{FORMAS_PAGO.find(f => f.value === item.forma_pago)?.label || item.forma_pago || '—'}</td>
                    <td className="px-4 py-3 text-center">{item.acarreo ? '✓' : ''}</td>
                    <td className="px-4 py-3 text-center">{item.instalacion ? '✓' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-xs whitespace-nowrap">
              <thead>
                <tr className="bg-apple-bg text-apple-text-tertiary uppercase text-[10px] font-bold tracking-wider">
                  <th className="px-4 py-3 text-left">Nombre</th>
                  <th className="px-4 py-3 text-left">Teléfono</th>
                  <th className="px-4 py-3 text-left">Asesor</th>
                  <th className="px-4 py-3 text-left">Etapa</th>
                  <th className="px-4 py-3 text-center">Días en etapa</th>
                  <th className="px-4 py-3 text-left">Fuente</th>
                  <th className="px-4 py-3 text-left">Segmento</th>
                  <th className="px-4 py-3 text-right">Monto proyectado</th>
                  <th className="px-4 py-3 text-left">ODP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-apple-hairline">
                {(leadsData?.items || []).map(item => (
                  <tr key={item.id} onClick={() => handleLeadClick(item.id)} className="hover:bg-apple-blue/5 cursor-pointer transition-colors">
                    <td className="px-4 py-3 font-bold text-apple-text">{item.nombre}</td>
                    <td className="px-4 py-3 text-apple-text-secondary">{item.telefono}</td>
                    <td className="px-4 py-3 text-apple-text-secondary">{item.asesor_nombre}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-apple-blue/10 text-apple-blue">{item.estado_crm}</span>
                    </td>
                    <td className="px-4 py-3 text-center text-apple-text-secondary">{item.dias_en_etapa}d</td>
                    <td className="px-4 py-3 text-apple-text-secondary">{item.fuente_lead || '—'}</td>
                    <td className="px-4 py-3 text-apple-text-secondary">{item.segmento || '—'}</td>
                    <td className="px-4 py-3 text-right font-bold text-apple-text">{fmtCOP(item.monto_proyectado_cotizacion)}</td>
                    <td className="px-4 py-3 text-apple-text-secondary">{item.numero_odp || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {loading && (
            <div className="flex items-center justify-center py-10 text-apple-text-tertiary gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Cargando...
            </div>
          )}
          {!loading && total === 0 && (
            <div className="text-center py-10 text-sm text-apple-text-tertiary font-medium">Sin resultados para estos filtros.</div>
          )}
        </div>

        {/* Paginación */}
        {totalPaginas > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-apple-hairline">
            <span className="text-[11px] font-semibold text-apple-text-tertiary">
              Página {page} de {totalPaginas} · {total} resultados
            </span>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="p-1.5 rounded-full hover:bg-apple-gray disabled:opacity-30 text-apple-text-secondary">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={() => setPage(p => Math.min(totalPaginas, p + 1))} disabled={page >= totalPaginas} className="p-1.5 rounded-full hover:bg-apple-gray disabled:opacity-30 text-apple-text-secondary">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Overlay de carga al abrir un lead */}
      {cargandoLead && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 flex items-center gap-3 shadow-apple-lg">
            <Loader2 className="w-5 h-5 animate-spin text-apple-blue" />
            <span className="text-sm font-semibold text-apple-text">Cargando detalle...</span>
          </div>
        </div>
      )}

      {leadDetalle && (
        <div className="fixed inset-0 z-50 flex">
          <LeadDetalleModal
            lead={leadDetalle}
            rol={user?.rol || 'admin'}
            userId={user?.id}
            onClose={() => { setLeadDetalle(null); cargarLeads(); }}
            onLeadUpdate={setLeadDetalle}
            inlineMode={false}
          />
        </div>
      )}

      {selectedOdpId && (
        <ODPFichaModal odpId={selectedOdpId} onClose={() => setSelectedOdpId(null)} />
      )}
    </div>
  );
};

export default BuscadorAvanzadoPanel;

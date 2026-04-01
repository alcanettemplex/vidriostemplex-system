import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, FileText, Wrench, Truck, DollarSign, Package, Ruler, Plus,
  CheckCircle2, AlertCircle, AlertTriangle, MapPin, User, Calendar, Phone,
  Building2, ExternalLink, CreditCard, Camera, History,
  ClipboardList, TrendingUp, Printer
} from 'lucide-react';
import PrintableTalonario from './PrintableTalonario';
import PrintableGarantia from './PrintableGarantia';
import PrintableNoConformidad from './PrintableNoConformidad';
import PrintableProduccion from './PrintableProduccion';
import PrintableDetalleTecnico from './PrintableDetalleTecnico';
import PrintableSAP from './PrintableSAP';
import ReportarProblemaForm from './ReportarProblemaForm';
import SAPModal from './SAPModal';
import TMModal from './TMModal';

// ─── Paleta de estado ─────────────────────────────────────────────────────────
const estadoProdColor: Record<string, string> = {
  EN_ESPERA: 'bg-slate-100 text-slate-700 border-slate-200',
  MEDICION: 'bg-sky-100 text-sky-700 border-sky-200',
  PEDIDO_PROVEEDOR: 'bg-purple-100 text-purple-700 border-purple-200',
  ALUMINIO_CORTADO: 'bg-blue-100 text-blue-700 border-blue-200',
  VIDRIO_RECIBIDO: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  ACCESORIOS_SEPARADOS: 'bg-teal-100 text-teal-700 border-teal-200',
  LISTO_INSTALAR: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  PROGRAMADA: 'bg-amber-100 text-amber-700 border-amber-200',
  INSTALADA: 'bg-green-100 text-green-700 border-green-200',
  ENTREGADA: 'bg-gray-100 text-gray-700 border-gray-200',
  PAUSADA: 'bg-rose-100 text-rose-700 border-rose-200',
};

const cajaColor: Record<string, string> = {
  PENDIENTE: 'bg-rose-100 text-rose-700',
  ABONADO: 'bg-blue-100 text-blue-700',
  CANCELADO: 'bg-emerald-100 text-emerald-700',
  CREDITO_APROBADO: 'bg-indigo-100 text-indigo-700',
};

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0);

// ─── Componentes auxiliares ────────────────────────────────────────────────────
const InfoRow: React.FC<{ label: string; value?: any; icon?: React.ReactNode }> = ({ label, value, icon }) => (
  <div className="flex items-start gap-2 py-2 border-b border-slate-50 last:border-0">
    {icon && <span className="mt-0.5 text-slate-400 flex-shrink-0">{icon}</span>}
    <div className="flex-1 min-w-0">
      <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">{label}</p>
      <p className="text-sm font-semibold text-slate-800 mt-0.5 truncate">{value || '—'}</p>
    </div>
  </div>
);

const Badge: React.FC<{ className?: string; children: React.ReactNode }> = ({ className, children }) => (
  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${className}`}>{children}</span>
);

const TabButton: React.FC<{ active: boolean; icon: React.ReactNode; label: string; badge?: number; onClick: () => void }> = ({ active, icon, label, badge, onClick }) => (
  <button onClick={onClick}
    className={`flex items-center gap-2 px-4 py-3 text-sm font-bold border-b-2 transition-all whitespace-nowrap ${active ? 'border-indigo-600 text-indigo-700 bg-indigo-50/60' : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}>
    {icon}
    {label}
    {badge !== undefined && badge > 0 && (
      <span className={`ml-1 min-w-[18px] h-[18px] text-[10px] font-black rounded-full flex items-center justify-center px-1 ${active ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-600'}`}>{badge}</span>
    )}
  </button>
);

// ─── Tabs ──────────────────────────────────────────────────────────────────────
const TabDatosGenerales: React.FC<{ odp: any }> = ({ odp }) => {
  const servicios: string[] = [];
  if (odp.instalacion) servicios.push('Instalación');
  if (odp.matizado) servicios.push('Matizado');
  if (odp.pelicula) servicios.push('Película');
  if (odp.acarreo) servicios.push('Acarreo');
  if (odp.huacal) servicios.push('Huacal');
  if (odp.carton) servicios.push('Cartón');

  return (
    <div className="grid md:grid-cols-3 gap-6 p-6">
      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
        <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2"><FileText className="w-3.5 h-3.5" />Datos de la Orden</h3>
        <InfoRow label="N° ODP" value={<span className="text-indigo-700 font-black text-base">{odp.numero_odp}</span>} />
        <InfoRow label="Tipo de Servicio" value={odp.tipo_servicio?.replace(/_/g, ' ')} />
        <InfoRow label="Dirección de Instalación" value={odp.direccion_instalacion} icon={<MapPin className="w-3.5 h-3.5" />} />
        <InfoRow label="Fecha de Entrega" value={(() => { const d = odp.fecha_entrega ? new Date(odp.fecha_entrega.includes('T') ? odp.fecha_entrega : odp.fecha_entrega + 'T00:00:00') : null; return d && !isNaN(d.getTime()) ? d.toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' }) : null; })() } icon={<Calendar className="w-3.5 h-3.5" />} />
        <InfoRow label="Creado el" value={new Date(odp.fecha_creacion).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })} />
        <InfoRow label="Descripción" value={odp.descripcion_pedido} />
        {odp.observaciones && <InfoRow label="Observaciones" value={odp.observaciones} />}
      </div>

      <div className="space-y-4">
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
          <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2"><Building2 className="w-3.5 h-3.5" />Cliente</h3>
          <InfoRow label="Nombre / Razón Social" value={<span className="text-slate-900 font-bold">{odp.cliente?.nombre_razon_social}</span>} />
          <InfoRow label={`${odp.cliente?.tipo_documento || 'Documento'}`} value={odp.cliente?.numero_documento} />
          <InfoRow label="Contacto" value={odp.nombre_recibe} icon={<User className="w-3.5 h-3.5" />} />
          <InfoRow label="Teléfono Contacto" value={odp.telefono_recibe} icon={<Phone className="w-3.5 h-3.5" />} />
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
          <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2"><User className="w-3.5 h-3.5" />Asesor Responsable</h3>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white font-black text-sm flex-shrink-0">
              {odp.asesor?.nombre_completo?.[0]?.toUpperCase() || '?'}
            </div>
            <div>
              <p className="font-bold text-slate-800">{odp.asesor?.nombre_completo}</p>
              <p className="text-xs text-slate-500">{odp.asesor?.username} · {odp.asesor?.email}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
          <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 mb-4">Servicios Incluidos</h3>
          {servicios.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {servicios.map(s => <Badge key={s} className="bg-indigo-50 text-indigo-700 border-indigo-100"><CheckCircle2 className="w-3 h-3" />{s}</Badge>)}
            </div>
          ) : <p className="text-slate-400 text-sm">Sin servicios adicionales</p>}
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
          <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 mb-4">Ítems de Vidrio ({odp.items?.length || 0})</h3>
          {odp.items?.length > 0 ? (
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {odp.items.map((item: any, i: number) => (
                <div key={i} className="bg-slate-50 border border-slate-100 rounded-lg p-2.5 text-xs">
                  <div className="flex justify-between items-start">
                    <p className="font-bold text-slate-700">{item.tipo_vidrio || item.item}</p>
                    <Badge className="bg-slate-100 text-slate-600 border-slate-200">{item.cantidad}x</Badge>
                  </div>
                  <p className="text-slate-500 mt-0.5">{item.ancho_mm}mm × {item.alto_mm}mm {item.espesor && `· ${item.espesor}`} {item.color && `· ${item.color}`}</p>
                </div>
              ))}
            </div>
          ) : <p className="text-slate-400 text-sm">Sin ítems registrados</p>}
        </div>
      </div>
    </div>
  );
};

const TabComercial: React.FC<{ odp: any; onRefresh: () => void }> = ({ odp, onRefresh }) => {
  const [sapModalOpen, setSapModalOpen] = useState(false);
  const saps = odp.saps || [];
  const cots = odp.cotizaciones || [];
  const estadoCotColor: Record<string, string> = {
    enviada: 'bg-blue-100 text-blue-700 border-blue-200',
    aprobada: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    rechazada: 'bg-rose-100 text-rose-700 border-rose-200',
    vencida: 'bg-slate-100 text-slate-600 border-slate-200',
  };

  return (
    <div className="p-6 space-y-6">
      {/* SAP */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-extrabold uppercase tracking-widest text-slate-500 flex items-center gap-2">
            <Package className="w-4 h-4 text-indigo-600" /> Solicitudes de Accesorios y Perfilería (SAP)
          </h3>
          {saps.length === 0 ? (
            <button
              onClick={() => setSapModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" /> Gestionar SAP
            </button>
          ) : (
            <button
              onClick={() => setSapModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-slate-100 text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition"
            >
              <Package className="w-3.5 h-3.5" /> Ver SAP
            </button>
          )}
        </div>
        {saps.length === 0 ? (
          <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center text-slate-400">
            <Package className="w-10 h-10 mx-auto mb-2 text-slate-200" />
            <p className="font-bold">No hay SAPs registradas</p>
          </div>
        ) : saps.map((sap: any) => (
          <div key={sap.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden mb-3 shadow-sm">
            <div className="flex justify-between items-center px-5 py-3 bg-slate-50 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <span className="font-black text-indigo-700 text-lg">{sap.numero_sap}</span>
                <Badge className="bg-slate-100 text-slate-600 border-slate-200">{sap.estado}</Badge>
              </div>
              <p className="text-xs text-slate-500">{sap.asesor?.nombre_completo} · {new Date(sap.fecha_creacion).toLocaleDateString('es-CO')}</p>
            </div>
            <table className="w-full text-xs">
              <thead className="bg-slate-700 text-white">
                <tr>
                  <th className="px-3 py-1.5 text-center w-10">ITEM</th>
                  <th className="px-3 py-1.5 w-28">CÓDIGO</th>
                  <th className="px-3 py-1.5">DESCRIPCIÓN</th>
                  <th className="px-3 py-1.5 w-24">DIMENSIÓN</th>
                  <th className="px-3 py-1.5 text-center w-16">CANT.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sap.items?.map((item: any, i: number) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                    <td className="px-3 py-1.5 text-center font-black text-slate-600">{item.item}</td>
                    <td className="px-3 py-1.5 font-mono text-blue-700 font-bold">{item.codigo || '—'}</td>
                    <td className="px-3 py-1.5 text-slate-700">{item.descripcion || '—'}</td>
                    <td className="px-3 py-1.5 text-slate-500">{item.dimension || '—'}</td>
                    <td className="px-3 py-1.5 text-center font-bold">{item.cantidad}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {sap.notas && <p className="px-5 py-2 text-xs text-slate-500 italic border-t border-slate-100">"{sap.notas}"</p>}
          </div>
        ))}
      </div>

      {sapModalOpen && (
        <SAPModal
          odp={odp}
          onClose={() => { setSapModalOpen(false); onRefresh(); }}
        />
      )}

      <div>
        <h3 className="text-sm font-extrabold uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-blue-600" /> Cotizaciones (COT)
        </h3>
        {cots.length === 0 ? (
          <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center text-slate-400">
            <DollarSign className="w-10 h-10 mx-auto mb-2 text-slate-200" />
            <p className="font-bold">No hay cotizaciones registradas</p>
          </div>
        ) : cots.map((cot: any) => {
          const total = cot.valor_total * (1 - cot.descuento / 100);
          return (
            <div key={cot.id} className="bg-white border border-slate-200 rounded-2xl p-5 mb-3 shadow-sm">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <span className="font-black text-blue-700 text-lg">{cot.numero_cot}</span>
                    <Badge className={estadoCotColor[cot.estado] || 'bg-slate-100 text-slate-600 border-slate-200'}>{cot.estado}</Badge>
                  </div>
                  <p className="text-xs text-slate-500">{cot.asesor?.nombre_completo} · {new Date(cot.fecha_creacion).toLocaleDateString('es-CO')} · Válida {cot.validez_dias} días</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-black text-slate-900">{fmt(total)}</p>
                  {cot.descuento > 0 && <p className="text-xs text-slate-400 line-through">{fmt(cot.valor_total)}</p>}
                  <p className="text-xs font-bold text-slate-600 mt-0.5">{cot.forma_pago}</p>
                </div>
              </div>
              {cot.notas && <p className="text-xs text-slate-500 italic mt-2 pt-2 border-t border-slate-100">"{cot.notas}"</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const TabProduccion: React.FC<{ odp: any; onUpdate?: () => void }> = ({ odp, onUpdate }) => {
  const [uploading, setUploading] = useState(false);
  const [tmModalOpen, setTmModalOpen] = useState(false);
  const tms = odp.tomas_medidas || [];
  const chks = [
    { key: 'chk_medicion', label: 'Toma de Medidas', icon: <Ruler className="w-4 h-4" /> },
    { key: 'chk_vidrio', label: 'Vidrio', icon: <CheckCircle2 className="w-4 h-4" /> },
    { key: 'chk_corte', label: 'Aluminio / Corte', icon: <Wrench className="w-4 h-4" /> },
    { key: 'chk_accesorios', label: 'Herrajes / Acceso.', icon: <Package className="w-4 h-4" /> },
  ];
  const completados = chks.filter(c => odp[c.key]).length;

  const handleCroquisUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      const formData = new FormData();
      formData.append('croquis', file);

      const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';
      const token = localStorage.getItem('token');

      await axios.post(`${API}/api/odp/${odp.id}/croquis`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });

      if (onUpdate) onUpdate();
    } catch (error) {
      console.error('Error uploading croquis:', error);
      alert('Error al subir el croquis');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <h3 className="text-sm font-extrabold uppercase tracking-widest text-slate-500 mb-4 flex items-center gap-2">
            <Wrench className="w-4 h-4 text-amber-600" /> Estado de Componentes de Producción
          </h3>
          <div className="flex items-center gap-2 mb-4">
            <div className="flex-1 bg-slate-100 rounded-full h-2.5">
              <div className="bg-indigo-600 h-2.5 rounded-full transition-all duration-700" style={{ width: `${(completados / 4) * 100}%` }} />
            </div>
            <span className="text-sm font-black text-slate-700">{completados}/4</span>
            <Badge className={completados === 4 ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-amber-100 text-amber-700 border-amber-200'}>
              {completados === 4 ? 'LISTO' : 'EN CURSO'}
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {chks.map(chk => (
              <div key={chk.key} className={`p-4 rounded-xl border-2 text-center transition-all ${odp[chk.key] ? 'bg-emerald-50 border-emerald-400 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                <div className="flex justify-center mb-2">{chk.icon}</div>
                <p className="text-xs font-bold">{chk.label}</p>
                <p className="text-xs mt-1">{odp[chk.key] ? '✓ Completado' : 'Pendiente'}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <h3 className="text-sm font-extrabold uppercase tracking-widest text-slate-500 mb-4 flex items-center gap-2">
            <FileText className="w-4 h-4 text-indigo-600" /> Croquis / Plano Técnico
          </h3>
          <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-xl p-4 min-h-[160px] relative overflow-hidden group">
            {odp.croquis_url ? (
              <>
                <img src={odp.croquis_url} alt="Croquis" className="absolute inset-0 w-full h-full object-contain p-2" />
                <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]">
                  <label className="cursor-pointer bg-white text-slate-900 px-4 py-2 rounded-lg font-bold text-xs shadow-xl flex items-center gap-2 hover:scale-105 transition-transform">
                    <Camera className="w-4 h-4" /> CAMBIAR DIBUJO
                    <input type="file" className="hidden" accept="image/*" onChange={handleCroquisUpload} />
                  </label>
                </div>
              </>
            ) : (
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
                  <Camera className="w-6 h-6" />
                </div>
                <p className="text-slate-500 text-xs font-bold mb-3 uppercase tracking-wider">Aún no hay un dibujo técnico</p>
                <label className="cursor-pointer bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-black text-xs shadow-lg shadow-indigo-600/20 flex items-center gap-2 hover:bg-indigo-700 transition">
                  {uploading ? 'SUBIENDO...' : 'SUBIR CROQUIS'}
                  <input type="file" className="hidden" accept="image/*" onChange={handleCroquisUpload} disabled={uploading} />
                </label>
              </div>
            )}
          </div>
          <p className="text-[10px] text-slate-400 mt-3 italic text-center uppercase tracking-tighter">Este dibujo aparecerá automáticamente en el formato impreso de Detalle Técnico</p>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-extrabold uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-2">
          <Ruler className="w-4 h-4 text-amber-600" /> Tomas de Medida ({tms.length})
        </h3>
        {tms.length === 0 ? (
          <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center text-slate-400">
            <Ruler className="w-10 h-10 mx-auto mb-2 text-slate-200" />
            <p className="font-bold">Sin tomas de medida registradas</p>
          </div>
        ) : tms.map((tm: any) => {
          const fotos: string[] = Array.isArray(tm.medidas_json) && tm.medidas_json.every((f: any) => typeof f === 'string')
            ? tm.medidas_json : [];
          return (
            <div key={tm.id} className="bg-white border border-slate-200 rounded-2xl p-5 mb-3 shadow-sm">
              {/* Header TM */}
              <div className="flex justify-between items-start mb-3">
                <div>
                  <span className="font-black text-amber-700 text-lg">{tm.numero_tm}</span>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {tm.realizador?.nombre_completo} · {tm.fecha_visita ? new Date(tm.fecha_visita + 'T00:00:00').toLocaleDateString('es-CO') : 'Sin fecha'}
                  </p>
                  {tm.direccion && (
                    <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3 h-3" />{tm.direccion}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={
                    tm.estado === 'realizada' ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                    : tm.estado === 'programada' ? 'bg-blue-100 text-blue-700 border-blue-200'
                    : 'bg-amber-100 text-amber-700 border-amber-200'
                  }>
                    {tm.estado === 'realizada' ? '✓ Realizada' : tm.estado === 'programada' ? 'Programada' : 'Solicitada'}
                  </Badge>
                  <button
                    onClick={() => setTmModalOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Ver detalles
                  </button>
                </div>
              </div>

              {/* Fotos */}
              {fotos.length > 0 ? (
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <Camera className="w-3.5 h-3.5" /> Fotos relevadas ({fotos.length})
                  </p>
                  <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                    {fotos.map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noreferrer">
                        <img src={url} alt={`Foto ${i + 1}`}
                          className="w-full aspect-square object-cover rounded-lg border border-amber-200 hover:opacity-85 transition bg-slate-50" />
                      </a>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">
                  {tm.estado === 'realizada' ? 'Sin fotos registradas' : 'Pendiente de realizar la visita'}
                </p>
              )}

              {tm.observaciones && (
                <p className="text-xs text-slate-500 italic mt-3 pt-3 border-t border-slate-100">"{tm.observaciones}"</p>
              )}
            </div>
          );
        })}
      </div>

      {/* TMModal */}
      {tmModalOpen && (
        <TMModal odp={odp} onClose={() => setTmModalOpen(false)} />
      )}
    </div>
  );
};

const ESTADO_RUTA_ODP: Record<string, { label: string; cls: string }> = {
  pendiente:   { label: 'Pendiente',  cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  en_curso:    { label: 'En curso',   cls: 'bg-orange-100 text-orange-700 border-orange-200' },
  completada:  { label: 'Completada', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
};

const TabInstalacion: React.FC<{ odp: any }> = ({ odp }) => {
  const rutaOdps: any[] = odp.ruta_odps || [];
  const evidencias = odp.evidencias || [];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h3 className="text-sm font-extrabold uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-2">
          <Truck className="w-4 h-4 text-indigo-600" /> Programaciones de Instalación ({rutaOdps.length})
        </h3>
        {rutaOdps.length === 0 ? (
          <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center text-slate-400">
            <Truck className="w-10 h-10 mx-auto mb-2 text-slate-200" />
            <p className="font-bold">Sin programaciones asignadas</p>
          </div>
        ) : rutaOdps.map((prog: any) => {
          const estadoBadge = ESTADO_RUTA_ODP[prog.estado] || ESTADO_RUTA_ODP['pendiente'];
          const instaladores = prog.ruta?.instaladores?.map((i: any) => i.nombre_completo).join(', ') || '—';
          const vehiculo = prog.ruta?.vehiculo ? `${prog.ruta.vehiculo.tipo.toUpperCase()} — ${prog.ruta.vehiculo.placa}` : '—';
          return (
            <div key={prog.id} className="bg-white border border-slate-200 rounded-2xl p-5 mb-3 shadow-sm">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-xs text-slate-400 font-bold uppercase">Fecha programada</p>
                  <p className="font-bold">{prog.fecha_programada ? new Date(prog.fecha_programada).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-bold uppercase">Vehículo</p>
                  <p className="font-bold">{vehiculo}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-bold uppercase">Instaladores</p>
                  <p className="font-bold text-xs">{instaladores}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-bold uppercase">Estado</p>
                  <Badge className={`${estadoBadge.cls} mt-0.5`}>{estadoBadge.label}</Badge>
                </div>
              </div>
              {prog.inicio_instalacion && (
                <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-4 text-xs text-slate-500">
                  <span>Inicio: <strong>{new Date(prog.inicio_instalacion).toLocaleString('es-CO')}</strong></span>
                  {prog.fin_instalacion && <span>Fin: <strong>{new Date(prog.fin_instalacion).toLocaleString('es-CO')}</strong></span>}
                </div>
              )}
              {prog.datos_receptor && (
                <p className="text-xs text-slate-500 mt-2">Recibió: <strong>{prog.datos_receptor}</strong></p>
              )}
            </div>
          );
        })}
      </div>

      <div>
        <h3 className="text-sm font-extrabold uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-2">
          <Camera className="w-4 h-4 text-emerald-600" /> Evidencias Fotográficas ({evidencias.length})
        </h3>
        {evidencias.length === 0 ? (
          <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center text-slate-400">
            <Camera className="w-10 h-10 mx-auto mb-2 text-slate-200" />
            <p className="font-bold">Sin evidencias cargadas</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {evidencias.map((ev: any) => (
              <div key={ev.id} className="group relative rounded-xl overflow-hidden border border-slate-200 shadow-sm bg-slate-100 aspect-square">
                {ev.archivo_url ? (
                  <>
                    <img src={ev.archivo_url} alt="Evidencia" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    <a href={ev.archivo_url} target="_blank" rel="noopener noreferrer"
                      className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <ExternalLink className="w-6 h-6 text-white" />
                    </a>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-slate-400">
                    <Camera className="w-8 h-8 mb-1" />
                    <p className="text-xs">Sin imagen</p>
                  </div>
                )}
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-2">
                  <p className="text-white text-[10px] font-bold truncate">{ev.instalador?.nombre_completo}</p>
                  <p className="text-white/70 text-[10px]">{ev.fecha ? new Date(ev.fecha).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const TabFinanciero: React.FC<{ odp: any }> = ({ odp }) => {
  const valorTotal = Number(odp.valor_total) || 0;
  const abono = Number(odp.abono) || 0;
  const pendiente = Number(odp.pendiente) || 0;
  const pctCobrado = valorTotal > 0 ? Math.min(100, (abono / valorTotal) * 100) : (abono > 0 ? 100 : 0);

  return (
    <div className="p-6 space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Valor Total ODP', value: fmt(valorTotal), color: 'bg-slate-50 border-slate-200 text-slate-800' },
          { label: 'Abonado', value: fmt(abono), color: 'bg-emerald-50 border-emerald-200 text-emerald-800' },
          { label: 'Por Cobrar', value: fmt(pendiente), color: pendiente > 0 ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800' },
          { label: 'Estado Caja', value: odp.estado_caja?.replace(/_/g, ' '), color: cajaColor[odp.estado_caja] || 'bg-slate-100' },
        ].map((k, i) => (
          <div key={i} className={`border rounded-2xl p-5 ${k.color}`}>
            <p className="text-[10px] font-extrabold uppercase tracking-widest opacity-70 mb-1">{k.label}</p>
            <p className="text-xl font-black leading-none">{k.value}</p>
          </div>
        ))}
      </div>

      {valorTotal > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <div className="flex justify-between items-center mb-2">
            <p className="text-xs font-extrabold uppercase tracking-widest text-slate-500">Progreso de Cobro</p>
            <p className="text-sm font-black text-slate-700">{pctCobrado.toFixed(0)}%</p>
          </div>
          <div className="bg-slate-100 rounded-full h-3">
            <div className={`h-3 rounded-full transition-all duration-700 ${pctCobrado === 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${pctCobrado}%` }} />
          </div>
          <div className="flex justify-between mt-1.5 text-[10px] text-slate-400 font-bold">
            <span>$0</span><span>{fmt(valorTotal)}</span>
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2"><CreditCard className="w-3.5 h-3.5" />Facturación Electrónica</h3>
        <div className="grid grid-cols-2 gap-4">
          <InfoRow label="Estado Facturación" value={<Badge className={odp.estado_facturacion === 'FACTURADA' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-amber-100 text-amber-700 border-amber-200'}>{odp.estado_facturacion}</Badge>} />
          <InfoRow label="N° Factura Electrónica" value={odp.factura_electronica ? <span className="font-mono font-bold text-emerald-700">#{odp.factura_electronica}</span> : <span className="text-slate-400 text-xs italic">No emitida</span>} />
          <InfoRow label="Forma de Pago ODP" value={odp.forma_pago} />
          {odp.autorizacion_especial_despacho && <InfoRow label="Autorización Especial" value={<Badge className="bg-amber-100 text-amber-700 border-amber-200"><AlertCircle className="w-3 h-3" />Sí</Badge>} />}
        </div>
        {odp.url_documento_factura && (
          <a href={odp.url_documento_factura} target="_blank" rel="noopener noreferrer"
            className="mt-4 flex items-center gap-2 text-sm font-bold text-indigo-600 hover:text-indigo-800 transition">
            <ExternalLink className="w-4 h-4" /> Ver Documento de Factura
          </a>
        )}
      </div>
    </div>
  );
};

const TabHistorial: React.FC<{ odp: any }> = ({ odp }) => {
  const historial = odp.historial_estados || [];
  const timeline: { fecha: string; tipo: string; titulo: string; detalle: string; color: string; icon: React.ReactNode }[] = [];

  timeline.push({ fecha: odp.fecha_creacion, tipo: 'ODP', titulo: 'ODP Creada', detalle: `Asesor: ${odp.asesor?.nombre_completo}`, color: 'bg-indigo-500', icon: <FileText className="w-3.5 h-3.5" /> });
  (odp.saps || []).forEach((s: any) => timeline.push({ fecha: s.fecha_creacion, tipo: 'SAP', titulo: `SAP ${s.numero_sap}`, detalle: `${s.items?.length || 0} ítems · ${s.asesor?.nombre_completo}`, color: 'bg-indigo-500', icon: <Package className="w-3.5 h-3.5" /> }));
  (odp.cotizaciones || []).forEach((c: any) => timeline.push({ fecha: c.fecha_creacion, tipo: 'COT', titulo: `Cotización ${c.numero_cot}`, detalle: `${fmt(c.valor_total)} · ${c.asesor?.nombre_completo}`, color: 'bg-blue-500', icon: <DollarSign className="w-3.5 h-3.5" /> }));
  (odp.tomas_medidas || []).forEach((t: any) => timeline.push({ fecha: t.fecha_creacion, tipo: 'TM', titulo: `Toma de Medidas ${t.numero_tm}`, detalle: `${t.realizador?.nombre_completo} · ${t.medidas_json?.length || 0} medidas`, color: 'bg-amber-500', icon: <Ruler className="w-3.5 h-3.5" /> }));
  historial.forEach((h: any) => timeline.push({ fecha: h.fecha || h.fecha_cambio || h.creado_en, tipo: 'ESTADO', titulo: `Estado → ${(h.estado_nuevo || h.nuevo_estado || '').replace(/_/g, ' ')}`, detalle: `Por ${h.usuario?.nombre_completo || 'Sistema'} ${h.notas ? `· "${h.notas}"` : ''}`, color: 'bg-slate-500', icon: <History className="w-3.5 h-3.5" /> }));
  (odp.evidencias || []).forEach((e: any) => timeline.push({ fecha: e.fecha, tipo: 'EVIDENCIA', titulo: 'Evidencia de Instalación', detalle: `Instalador: ${e.instalador?.nombre_completo || '—'}`, color: 'bg-emerald-500', icon: <Camera className="w-3.5 h-3.5" /> }));
  (odp.no_conformidades || []).forEach((nc: any) => timeline.push({ fecha: nc.creado_en, tipo: 'FALLA', titulo: `No Conformidad ${nc.numero_reporte}`, detalle: `${nc.tipo_error?.replace(/_/g, ' ')} · ${nc.area_error}`, color: 'bg-rose-500', icon: <AlertTriangle className="w-3.5 h-3.5" /> }));

  timeline.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

  return (
    <div className="p-6">
      <h3 className="text-sm font-extrabold uppercase tracking-widest text-slate-500 mb-5 flex items-center gap-2">
        <History className="w-4 h-4" /> Línea de Tiempo de la ODP ({timeline.length} eventos)
      </h3>
      {timeline.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <History className="w-12 h-12 mx-auto mb-3 text-slate-200" />
          <p className="font-bold">Sin historial registrado</p>
        </div>
      ) : (
        <div className="relative">
          <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-slate-200" />
          <div className="space-y-4">
            {timeline.map((ev, i) => (
              <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                className="relative flex gap-4 items-start pl-12">
                <div className={`absolute left-3.5 -translate-x-1/2 w-3.5 h-3.5 rounded-full border-2 border-white ${ev.color} flex items-center justify-center text-white`} style={{ top: '6px' }} />
                <div className="flex-1 bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge className={`${ev.color.replace('bg-', 'bg-').replace('500', '100')} border-current/20 text-current`}>{ev.tipo}</Badge>
                        <p className="font-bold text-slate-800 text-sm">{ev.titulo}</p>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{ev.detalle}</p>
                    </div>
                    <p className="text-[10px] text-slate-400 whitespace-nowrap font-bold">
                      {ev.fecha ? new Date(ev.fecha).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Centro de Impresión: Sistema de Formatos por Rol ──────────────────────────
const TabImprimir: React.FC<{ odp: any }> = ({ odp }) => {
  const [selectedFormat, setSelectedFormat] = useState<'compra' | 'op' | 'tecnico' | 'garantia' | 'noconformidad' | 'sap'>('op');
  const [ncIndex, setNcIndex] = useState(0);

  const handlePrint = () => {
    const area = document.getElementById('printable-area');
    if (!area) return;
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head>
      <meta charset="utf-8"/>
      <title>Impresión ODP ${odp?.numero_odp || ''}</title>
      <script src="https://cdn.tailwindcss.com"><\/script>
      <style>
        @page { size: letter portrait; margin: 4mm; }
        body { margin: 0; padding: 0; font-family: sans-serif; }
        .excel-table { width: 100%; border-collapse: collapse; border: 2px solid #000; }
        .excel-table th, .excel-table td { border: 1px solid #000; padding: 2px 4px; }
        .excel-table th { font-weight: bold; text-align: center; }
        .thick-b { border-bottom: 2px solid #000 !important; }
      </style>
    </head><body>${area.innerHTML}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 800);
  };

  return (
    <div className="flex flex-col bg-slate-100 min-h-screen">
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 px-6 py-4 bg-white border-b border-slate-200 print:hidden shadow-sm">
        
        <div className="flex flex-wrap gap-2 bg-slate-100 p-1.5 rounded-xl border border-slate-200">
          <button onClick={() => setSelectedFormat('compra')} className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg transition ${selectedFormat === 'compra' ? 'bg-white text-slate-800 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>
            <FileText className="w-3 h-3" /> Ord. Compra
          </button>
          <button onClick={() => setSelectedFormat('op')} className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg transition ${selectedFormat === 'op' ? 'bg-white text-slate-800 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>
            <Package className="w-3 h-3" /> OP
          </button>
          <button onClick={() => setSelectedFormat('tecnico')} className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg transition ${selectedFormat === 'tecnico' ? 'bg-white text-slate-800 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>
            <Ruler className="w-3 h-3" /> Det. Técnico
          </button>
          <button onClick={() => setSelectedFormat('garantia')} className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg transition ${selectedFormat === 'garantia' ? 'bg-white text-slate-800 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>
            <CheckCircle2 className="w-3 h-3" /> Garantía
          </button>
          <button onClick={() => setSelectedFormat('noconformidad')} className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg transition ${selectedFormat === 'noconformidad' ? 'bg-white text-slate-800 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>
            <AlertCircle className="w-3 h-3" /> No Conform.
            {odp?.no_conformidades?.length > 0 && <span className="text-[10px] bg-rose-500 text-white px-1.5 rounded-full">{odp.no_conformidades.length}</span>}
          </button>
          <button onClick={() => setSelectedFormat('sap')} className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg transition ${selectedFormat === 'sap' ? 'bg-white text-slate-800 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>
            <Package className="w-3 h-3" /> SAP
            {odp?.saps?.length > 0 && <span className="text-[10px] bg-indigo-500 text-white px-1.5 rounded-full">{odp.saps.length}</span>}
          </button>
        </div>

        {selectedFormat === 'noconformidad' && odp?.no_conformidades?.length > 1 && (
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg p-1 px-3">
                <span className="text-[10px] font-black text-slate-400 uppercase">REPORTE:</span>
                <select className="bg-transparent text-xs font-bold outline-none" value={ncIndex} onChange={e => setNcIndex(parseInt(e.target.value))}>
                    {odp.no_conformidades.map((nc: any, idx: number) => (
                        <option key={idx} value={idx}>{nc.numero_reporte} - {new Date(nc.creado_en).toLocaleDateString()}</option>
                    ))}
                </select>
            </div>
        )}

        <button onClick={handlePrint} className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white font-black text-xs rounded-xl hover:bg-indigo-700 transition shadow-lg shadow-indigo-600/30">
          <Printer className="w-3 h-3" /> IMPRIMIR
        </button>
      </div>

      <div className="p-8 overflow-y-auto flex-1 flex flex-col items-center justify-start" id="printable-area">
        {selectedFormat === 'compra' && <PrintableTalonario odp={odp} />}
        {selectedFormat === 'op' && <PrintableProduccion odp={odp} />}
        {selectedFormat === 'tecnico' && <PrintableDetalleTecnico odp={odp} />}
        {selectedFormat === 'garantia' && <PrintableGarantia odp={odp} />}
        {selectedFormat === 'noconformidad' && <PrintableNoConformidad odp={odp} data={odp?.no_conformidades?.[ncIndex]} />}
        {selectedFormat === 'sap' && <PrintableSAP odp={odp} sap={odp?.saps?.[0]} />}
      </div>
    </div>
  );
};

// ─── COMPONENTE PRINCIPAL ──────────────────────────────────────────────────────
interface Props { odpId: number; onClose: () => void; initialTab?: string; }

const ODPFichaModal: React.FC<Props> = ({ odpId, onClose, initialTab = 'general' }) => {
  const [odp, setOdp] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(initialTab);
  const [showReportarForm, setShowReportarForm] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);

  const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';
  const token = localStorage.getItem('token');

  // Obtener usuario actual para validar permisos
  useEffect(() => {
    try {
      const stored = localStorage.getItem('user');
      if (stored) setCurrentUser(JSON.parse(stored));
    } catch { /* ignorar */ }
  }, []);

  const fetchODP = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API}/api/odp/${odpId}`, { headers: { Authorization: `Bearer ${token}` } });
      setOdp(res.data);
    } catch (err) {
      console.error("Error al cargar ODP:", err);
      setOdp(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchODP();
  }, [odpId]);

  const tabs = [
    { id: 'general',     label: 'Datos Generales', icon: <ClipboardList className="w-4 h-4" /> },
    { id: 'comercial',   label: 'Comercial',        icon: <DollarSign className="w-4 h-4" />,    badge: (odp?.saps?.length || 0) + (odp?.cotizaciones?.length || 0) },
    { id: 'produccion',  label: 'Producción',        icon: <Wrench className="w-4 h-4" />,         badge: odp?.tomas_medidas?.length || 0 },
    { id: 'instalacion', label: 'Instalación',       icon: <Truck className="w-4 h-4" />,          badge: (odp?.evidencias?.length || 0) + (odp?.ruta_odps?.length || 0) },
    { id: 'financiero',  label: 'Financiero',         icon: <TrendingUp className="w-4 h-4" /> },
    { id: 'historial',   label: 'Historial',          icon: <History className="w-4 h-4" />,        badge: odp?.no_conformidades?.length || 0 },
    { id: 'imprimir',    label: 'Imprimir ODP',       icon: <Printer className="w-4 h-4" /> },
  ];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-3">
      <motion.div initial={{ opacity: 0, scale: 0.96, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-slate-50 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[96vh] flex flex-col border border-slate-200 overflow-hidden relative">

        {/* MODAL REPORTAR PROBLEMA */}
        <AnimatePresence>
          {showReportarForm && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 z-[70] bg-white flex items-center justify-center overflow-y-auto">
              <div className="w-full max-w-3xl">
                <ReportarProblemaForm odp={odp} onClose={() => setShowReportarForm(false)} onSuccess={fetchODP} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* HEADER */}
        {loading ? (
          <div className="h-24 bg-white border-b border-slate-200 animate-pulse" />
        ) : odp && (
          <div className="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
            {/* Banner visual: ODP de Reproceso */}
            {odp.es_no_conformidad && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 mb-3 flex items-center gap-2 text-xs">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                <span className="font-black text-amber-700">ODP DE REPROCESO</span>
                <span className="text-amber-600">·</span>
                <span className="text-amber-600">Referencia: <strong>{odp.odp_padre?.numero_odp || `ODP Padre #${odp.odp_padre_id}`}</strong></span>
              </div>
            )}
            {/* Banner: ODP Pausada por No Conformidad */}
            {odp.estado_produccion === 'PAUSADA' && (
              <div className="bg-rose-50 border border-rose-200 rounded-lg px-3 py-1.5 mb-3 flex items-center gap-2 text-xs">
                <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                <span className="font-black text-rose-700">ODP PAUSADA</span>
                <span className="text-rose-500">Esta ODP tiene un reporte de No Conformidad activo. Se marcará como completada al instalar la ODP de reproceso.</span>
              </div>
            )}
            <div className="flex justify-between items-start">
              <div className="flex items-start gap-4">
                <div className="hidden md:flex flex-col items-center gap-1 pt-1">
                  <div className={`w-3 h-3 rounded-full ${odp.estado_produccion === 'INSTALADA' || odp.estado_produccion === 'ENTREGADA' ? 'bg-emerald-500' : odp.estado_produccion === 'PAUSADA' ? 'bg-rose-500' : 'bg-amber-400'} animate-pulse`} />
                </div>
                <div>
                  <div className="flex items-center gap-3 flex-wrap">
                    {odp.es_no_conformidad && (
                      <span className="text-[10px] font-black bg-amber-500 text-white px-1.5 py-0.5 rounded">REPROCESO</span>
                    )}
                    <h1 className="text-2xl font-black text-slate-900 tracking-tight">{odp.numero_odp}</h1>
                    <Badge className={estadoProdColor[odp.estado_produccion] || 'bg-slate-100 text-slate-700 border-slate-200'}>
                      {odp.estado_produccion?.replace(/_/g, ' ')}
                    </Badge>
                    <Badge className={cajaColor[odp.estado_caja] || 'bg-slate-100'}>
                      <CreditCard className="w-3 h-3" />{odp.estado_caja?.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                  <p className="text-sm text-slate-500 font-medium mt-1">
                    <span className="font-bold text-slate-700">{odp.cliente?.nombre_razon_social}</span>
                    {' · '}Asesor: {odp.asesor?.nombre_completo}
                    {' · '}Creado: {new Date(odp.fecha_creacion).toLocaleDateString('es-CO')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* Botón Reportar: solo asesor dueño, producción, gerencia o admin */}
                {(() => {
                  if (!currentUser) return null;
                  const role = currentUser.rol;
                  const isOwner = role === 'asesor' && currentUser.id === odp.asesor_id;
                  const canReport = ['admin', 'gerencia', 'produccion'].includes(role) || isOwner;
                  if (!canReport || odp.estado_produccion === 'PAUSADA') return null;
                  return (
                    <button onClick={() => setShowReportarForm(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-rose-50 border border-rose-200 text-rose-600 rounded-lg hover:bg-rose-100 transition print:hidden">
                      <AlertCircle className="w-3.5 h-3.5" /> REPORTAR PROBLEMA
                    </button>
                  );
                })()}
                <button onClick={() => setActiveTab('imprimir')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition print:hidden">
                  <Printer className="w-3.5 h-3.5" /> Imprimir
                </button>
                <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition flex-shrink-0">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TABS */}
        <div className="bg-white border-b border-slate-200 flex overflow-x-auto flex-shrink-0 scrollbar-none">
          {tabs.map(tab => (
            <TabButton key={tab.id} active={activeTab === tab.id} icon={tab.icon} label={tab.label} badge={tab.badge} onClick={() => setActiveTab(tab.id)} />
          ))}
        </div>

        {/* CONTENIDO */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-8 space-y-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-16 bg-white rounded-xl border border-slate-100 animate-pulse" />
              ))}
            </div>
          ) : !odp ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 p-8">
              <AlertCircle className="w-16 h-16 mb-4 text-slate-200" />
              <p className="font-bold text-lg">No se pudo cargar la ODP</p>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div key={activeTab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                {activeTab === 'general'     && <TabDatosGenerales odp={odp} />}
                {activeTab === 'comercial'   && odp && <TabComercial odp={odp} onRefresh={fetchODP} />}
                {activeTab === 'produccion'  && <TabProduccion odp={odp} onUpdate={fetchODP} />}
                {activeTab === 'instalacion' && <TabInstalacion odp={odp} />}
                {activeTab === 'financiero'  && <TabFinanciero odp={odp} />}
                {activeTab === 'historial'   && <TabHistorial odp={odp} />}
                {activeTab === 'imprimir'    && <TabImprimir odp={odp} />}
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default ODPFichaModal;

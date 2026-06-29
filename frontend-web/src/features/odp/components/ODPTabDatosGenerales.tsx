import React from 'react';
import {
  FileText, MapPin, Calendar, User, Phone, Building2, CheckCircle2, Package,
  Wrench, Sparkles, Film, Box, Archive
} from 'lucide-react';
import { Badge, InfoRow } from './ODPFichaModal.utils';

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
        <InfoRow label="Fecha de Entrega" value={(() => { const d = odp.fecha_entrega ? new Date(odp.fecha_entrega.includes('T') ? odp.fecha_entrega : odp.fecha_entrega + 'T00:00:00') : null; return d && !isNaN(d.getTime()) ? d.toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' }) : null; })()} icon={<Calendar className="w-3.5 h-3.5" />} />
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

export default TabDatosGenerales;

import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import { Package, Plus, Download } from '../../../components/ui/icons';
import { Badge, normalizarItemLabel } from './ODPFichaModal.utils';
import SAPModal from './SAPModal';
import CotizacionCapturas from './CotizacionCapturas';
import CotizacionesODPSection from './CotizacionesODPSection';
import TraerItemsCotizacionModal from './TraerItemsCotizacionModal';
import { useCotizacionesDeOdp } from './useCotizacionesDeOdp';
import { useSoloLectura } from '../../../utils/permisos';

/** Roles que pueden crear/editar una SAP: espejo de `documentos.routes.ts`
 * (`requireRole` de POST/PUT /sap; root pasa siempre). */
const ROLES_ESCRIBEN_SAP = new Set(['root', 'admin', 'gerencia', 'asesor_comercial', 'jefe_produccion']);

const TabComercial: React.FC<{ odp: any; onRefresh: () => void }> = ({ odp, onRefresh }) => {
  // Roles de solo lectura (marketing): pueden consultar los SAP, no crearlos.
  const soloLectura = useSoloLectura();
  const [sapModalOpen, setSapModalOpen] = useState(false);
  const [traerAbierto, setTraerAbierto] = useState(false);
  const rol = useSelector((s: any) => s.auth?.user?.rol) as string | undefined;
  const saps = odp.saps || [];

  // Cotizaciones del Cotizador vinculadas a la ODP (2026-09-27). Alimentan la
  // sección COT y deciden si aparece "Traer ítems de la cotización": solo con
  // una vinculada APROBADA, y solo para quien puede escribir la SAP.
  const cotizaciones = useCotizacionesDeOdp(odp.id);
  const hayAprobada = cotizaciones.lista.some(c => c.estado === 'APROBADA');
  const puedeTraer = hayAprobada && !soloLectura && ROLES_ESCRIBEN_SAP.has(String(rol ?? '').toLowerCase());

  return (
    <div className="p-6 space-y-6">
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold uppercase tracking-widest text-slate-900 flex items-center gap-2">
            <Package className="w-4 h-4 text-indigo-600" /> Solicitudes de Accesorios y Perfilería (SAP)
          </h3>
          <div className="flex items-center gap-2">
          {puedeTraer && (
            <button
              onClick={() => setTraerAbierto(true)}
              title="Trae perfilería (con cortes y barras de 6 m), accesorios y película de la opción elegida de la cotización aprobada"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-white text-emerald-700 border border-emerald-300 rounded-lg hover:bg-emerald-50 transition"
            >
              <Download className="w-3.5 h-3.5" /> Traer ítems de la cotización
            </button>
          )}
          {saps.length === 0 ? (soloLectura ? null : (
            <button
              onClick={() => setSapModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" /> Gestionar SAP
            </button>
          )) : (
            <button
              onClick={() => setSapModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-100 text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition"
            >
              <Package className="w-3.5 h-3.5" /> Ver SAP
            </button>
          )}
          </div>
        </div>
        {saps.length === 0 ? (
          <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center text-slate-700">
            <Package className="w-10 h-10 mx-auto mb-2 text-slate-200" />
            <p className="font-medium">No hay SAPs registradas</p>
          </div>
        ) : saps.map((sap: any) => (
          <div key={sap.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden mb-3 shadow-sm">
            <div className="flex justify-between items-center px-5 py-3 bg-slate-50 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <span className="font-bold text-indigo-700 text-lg">{sap.numero_sap}</span>
                <Badge className="bg-slate-100 text-slate-800 border-slate-200">{sap.estado}</Badge>
              </div>
              <p className="text-xs text-slate-700">{sap.asesor?.nombre_completo} · {new Date(sap.fecha_creacion).toLocaleDateString('es-CO')}</p>
            </div>
            <table className="w-full text-xs">
              <thead className="bg-slate-700 text-white">
                <tr>
                  <th className="px-3 py-1.5 text-center w-10">ITEM</th>
                  <th className="px-3 py-1.5 w-28">CÓDIGO</th>
                  <th className="px-3 py-1.5">DESCRIPCIÓN</th>
                  <th className="px-3 py-1.5 w-24">DIMENSIÓN</th>
                  <th className="px-3 py-1.5 text-center w-16">CANT.</th>
                  <th className="px-3 py-1.5 w-32">OBSERV.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[...(sap.items || [])].sort((a: any, b: any) => {
                  const toIdx = (it: string) => {
                    if (/^[A-Z]$/.test(it)) return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.indexOf(it);
                    const n = parseInt(it, 10);
                    return isNaN(n) ? 9999 : n - 1;
                  };
                  return toIdx(a.item) - toIdx(b.item);
                }).map((item: any, i: number) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                    <td className="px-3 py-1.5 text-center font-bold text-slate-900">{normalizarItemLabel(item.item)}</td>
                    <td className="px-3 py-1.5 font-mono text-blue-700 font-bold">{item.codigo || '—'}</td>
                    <td className="px-3 py-1.5 text-slate-700">{item.descripcion || '—'}</td>
                    <td className="px-3 py-1.5 text-slate-700">{item.dimension || '—'}</td>
                    <td className="px-3 py-1.5 text-center font-bold">{Number(item.cantidad) % 1 === 0 ? Math.round(Number(item.cantidad)) : item.cantidad}</td>
                    <td className="px-3 py-1.5 text-slate-700 text-[11px] max-w-[120px] truncate" title={item.observacion || ''}>{item.observacion || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {sap.notas && <p className="px-5 py-2 text-xs text-slate-700 italic border-t border-slate-100">"{sap.notas}"</p>}
          </div>
        ))}
      </div>

      {sapModalOpen && (
        <SAPModal
          odp={odp}
          onClose={() => { setSapModalOpen(false); onRefresh(); }}
        />
      )}

      {traerAbierto && (
        <TraerItemsCotizacionModal odpId={odp.id} onClose={() => setTraerAbierto(false)} onHecho={onRefresh} />
      )}

      <CotizacionCapturas odp_id={odp.id} numeroCotizacion={odp.numero_cotizacion || ''} onRefresh={onRefresh} />

      {/* Cotizaciones del Cotizador (2026-09-27). Antes leía `odp.cotizaciones`,
          la tabla vieja `cotizacion` (0 filas en producción); ese include sigue en
          el backend (getODPById) pero la ficha ya no lo pinta. */}
      <CotizacionesODPSection odp={odp} cotizaciones={cotizaciones} />
    </div>
  );
};

export default TabComercial;

import React from 'react';
import { TemplexLogo } from '../../../components/ui/TemplexLogo';

interface ODCItemPrint {
  id: number;
  item?: string;
  codigo?: string;
  descripcion?: string;
  cantidad: number;
  recibido?: boolean;
  sap_item?: {
    dimension?: string;
    und?: string;
    observacion?: string;
    SAP?: { numero_sap: string; ODP?: { numero_odp: string } };
  };
}

interface PrintableODCProps {
  odc: {
    numero_odc: string;
    proveedor: string;
    estado: string;
    notas?: string;
    fecha_creacion: string;
    fecha_recepcion?: string;
    creador?: { nombre_completo: string };
    items: ODCItemPrint[];
    sap?: { numero_sap: string; ODP?: { numero_odp: string; descripcion?: string; cliente?: { nombre_razon_social: string } } };
  };
}

const ESTADO_LABEL: Record<string, string> = {
  pendiente: 'Pendiente', en_transito: 'En tránsito', recibido: 'Recibido', problema: 'Problema',
};

const PrintableODC: React.FC<PrintableODCProps> = ({ odc }) => {
  const fecha = new Date(odc.fecha_creacion).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' });
  const fechaRec = odc.fecha_recepcion
    ? new Date(odc.fecha_recepcion).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })
    : null;

  const totalItems = odc.items.reduce((s, it) => s + Number(it.cantidad), 0);

  return (
    <div className="print-root block w-[21.5cm] min-h-[29cm] print:min-h-0 bg-white shadow-xl print:shadow-none text-black font-sans text-[10px] mx-auto overflow-hidden print:overflow-visible">
      <style>{`
        .odc-table { width: 100%; border-collapse: collapse; }
        .odc-table th, .odc-table td { border: 1px solid #cbd5e1; padding: 3px 6px; }
        .odc-table th { background-color: #1e293b; color: white; font-weight: bold; text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; }
        .odc-table tr:nth-child(even) { background-color: #f8fafc; }
        @media print {
          @page { size: letter portrait; margin: 8mm; }
          body, html { margin: 0 !important; padding: 0 !important; }
          .print-root { width: 100% !important; min-height: unset !important; box-shadow: none !important; margin: 0 !important; padding: 0 !important; overflow: visible !important; }
        }
      `}</style>

      <div className="p-6">
        {/* Cabecera */}
        <div className="flex justify-between items-start pb-4 mb-4 border-b-2 border-slate-800">
          <div className="flex flex-col gap-1">
            <TemplexLogo className="h-10 w-40 justify-start" />
            <p className="text-[9px] text-slate-500 mt-1">Vidrios y Aluminio · vidriostemplex.com</p>
          </div>
          <div className="text-center">
            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Orden de Compra</p>
            <div className="border-2 border-slate-800 px-6 py-2 mt-1">
              <p className="text-xl font-black text-slate-800">{odc.numero_odc}</p>
            </div>
            <p className="text-[9px] text-slate-500 mt-1">{ESTADO_LABEL[odc.estado] || odc.estado}</p>
          </div>
        </div>

        {/* Info general */}
        <div className="grid grid-cols-3 gap-4 mb-5 text-[10px]">
          <div className="border border-slate-200 rounded p-3">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Proveedor</p>
            <p className="font-black text-slate-800 text-sm">{odc.proveedor}</p>
          </div>
          <div className="border border-slate-200 rounded p-3">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Fecha emisión</p>
            <p className="font-semibold text-slate-700">{fecha}</p>
            {fechaRec && (
              <>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-2 mb-1">Fecha recepción</p>
                <p className="font-semibold text-green-700">{fechaRec}</p>
              </>
            )}
          </div>
          <div className="border border-slate-200 rounded p-3">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Creado por</p>
            <p className="font-semibold text-slate-700">{odc.creador?.nombre_completo || '—'}</p>
            {odc.notas && (
              <>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-2 mb-1">Notas</p>
                <p className="text-slate-500 italic">"{odc.notas}"</p>
              </>
            )}
          </div>
        </div>

        {/* ODP / SAP info si aplica */}
        {odc.sap?.ODP && (
          <div className="mb-4 p-3 bg-slate-50 border border-slate-200 rounded text-[10px]">
            <span className="font-bold text-slate-500 uppercase tracking-wider text-[9px]">Referencia: </span>
            <span className="font-bold text-indigo-700">{odc.sap.ODP.numero_odp}</span>
            {odc.sap.numero_sap && <><span className="mx-2 text-slate-300">·</span><span className="font-bold text-slate-600">SAP {odc.sap.numero_sap}</span></>}
            {odc.sap.ODP.cliente?.nombre_razon_social && <><span className="mx-2 text-slate-300">·</span><span className="text-slate-600">{odc.sap.ODP.cliente.nombre_razon_social}</span></>}
          </div>
        )}

        {/* Tabla de ítems */}
        <div className="mb-5">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2">Ítems de la Orden</p>
          <table className="odc-table">
            <thead>
              <tr>
                <th style={{ width: '30px' }}>#</th>
                <th style={{ width: '90px' }}>CÓDIGO</th>
                <th>DESCRIPCIÓN</th>
                <th style={{ width: '90px' }}>DIMENSIÓN</th>
                <th style={{ width: '50px', textAlign: 'center' }}>CANT.</th>
                <th style={{ width: '40px' }}>UND</th>
                <th style={{ width: '120px' }}>OBSERVACIÓN</th>
                <th style={{ width: '70px' }}>SAP</th>
                <th style={{ width: '70px' }}>ODP</th>
              </tr>
            </thead>
            <tbody>
              {odc.items.map((it, i) => (
                <tr key={i}>
                  <td style={{ textAlign: 'center', color: '#64748b' }}>{i + 1}</td>
                  <td style={{ fontFamily: 'monospace', fontWeight: 'bold', color: '#1d4ed8' }}>{it.codigo || '—'}</td>
                  <td>{it.descripcion || '—'}</td>
                  <td style={{ color: '#64748b' }}>{it.sap_item?.dimension || '—'}</td>
                  <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{it.cantidad}</td>
                  <td style={{ color: '#64748b' }}>{it.sap_item?.und || '—'}</td>
                  <td style={{ color: '#94a3b8', fontSize: '9px' }}>{it.sap_item?.observacion || '—'}</td>
                  <td style={{ fontWeight: 'bold', color: '#4f46e5' }}>{it.sap_item?.SAP?.numero_sap || odc.sap?.numero_sap || '—'}</td>
                  <td style={{ fontWeight: 'bold' }}>{it.sap_item?.SAP?.ODP?.numero_odp || odc.sap?.ODP?.numero_odp || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totales */}
        <div className="flex justify-end mb-6">
          <div className="border-2 border-slate-800 rounded p-3 text-right min-w-[160px]">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Total ítems</p>
            <p className="text-xl font-black text-slate-800">{odc.items.length} <span className="text-sm font-normal text-slate-500">refs</span></p>
            <p className="text-[10px] text-slate-500 mt-0.5">Cantidad total: <strong>{totalItems}</strong></p>
          </div>
        </div>

        {/* Firma */}
        <div className="grid grid-cols-2 gap-8 pt-6 border-t border-slate-200">
          <div className="text-center">
            <div className="border-b border-slate-400 mb-2 h-8" />
            <p className="text-[9px] text-slate-500 uppercase tracking-wider">Elaborado por</p>
            <p className="text-[10px] font-semibold text-slate-700 mt-0.5">{odc.creador?.nombre_completo || '_______________'}</p>
          </div>
          <div className="text-center">
            <div className="border-b border-slate-400 mb-2 h-8" />
            <p className="text-[9px] text-slate-500 uppercase tracking-wider">Recibido por (Proveedor)</p>
            <p className="text-[10px] font-semibold text-slate-700 mt-0.5">{odc.proveedor}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrintableODC;

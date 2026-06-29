import React, { useState, useEffect } from 'react';
import {
  FileText, Package, Ruler, Images, Shield, AlertCircle, Printer
} from 'lucide-react';
import axios from 'axios';
import PrintableTalonario from './PrintableTalonario';
import PrintableGarantia from './PrintableGarantia';
import PrintableNoConformidad from './PrintableNoConformidad';
import PrintableProduccion from './PrintableProduccion';
import PrintableOA from './PrintableOA';
import PrintableDetalleTecnico from './PrintableDetalleTecnico';
import PrintableDetSAP from './PrintableDetSAP';
import PrintableSAP from './PrintableSAP';
import API from '../../../services/config';

type FormatId = 'compra' | 'op' | 'tecnico' | 'det_sap' | 'garantia' | 'noconformidad' | 'sap';

const TabImprimir: React.FC<{ odp: any }> = ({ odp }) => {
  const tieneNC = (odp?.no_conformidades?.length || 0) > 0;
  const tieneGarantias = (odp?.garantias?.length || 0) > 0;
  const esGarantia = !!odp?.es_garantia;
  const esNC = !!odp?.es_no_conformidad;

  const [selectedFormat, setSelectedFormat] = useState<FormatId>(esNC ? 'noconformidad' : 'op');
  const [ncIndex, setNcIndex] = useState(0);
  const [garantiaIndex, setGarantiaIndex] = useState(0);
  const [detSapImagenes, setDetSapImagenes] = useState<any[]>([]);
  const [ncOrigenData, setNcOrigenData] = useState<any>(null);

  const token = sessionStorage.getItem('token');

  useEffect(() => {
    if (selectedFormat !== 'det_sap') return;
    axios.get(`${API}/api/detalle-sap-imagenes?odp_id=${odp.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(r => setDetSapImagenes(r.data)).catch(() => setDetSapImagenes([]));
  }, [selectedFormat, odp.id]);

  useEffect(() => {
    if (!esNC || !odp?.odp_padre_id) return;
    axios.get(`${API}/api/no-conformidad/odp/${odp.odp_padre_id}`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(r => {
      const nc = (r.data as any[]).find((n: any) => n.nueva_odp_id === odp.id);
      if (nc) setNcOrigenData(nc);
    }).catch(() => {});
  }, [esNC, odp?.odp_padre_id, odp?.id]);

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
        .sap-table { width: 100%; border-collapse: collapse; border: 2px solid #000; }
        .sap-table th, .sap-table td { border: 1px solid #000; padding: 2px 4px; }
        .sap-table th { font-weight: bold; text-align: center; background-color: #f0f0f0; }
        .thick-b { border-bottom: 2px solid #000 !important; }
        .sap-page { display: block; width: 21.5cm; min-height: 29cm; background: white; color: black; font-family: sans-serif; font-size: 14px; margin: 0 auto; overflow: hidden; page-break-after: always; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .sap-page:last-child { page-break-after: avoid; }
        .print-container { padding: 8px; }
        .bg-blue-100 { background-color: #dbeafe !important; }
        .bg-slate-50 { background-color: #f8fafc !important; }
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
          {odp?.tipo_odp !== 'OA' && (
            <button onClick={() => setSelectedFormat('compra')} className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg transition ${selectedFormat === 'compra' ? 'bg-white text-slate-800 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>
              <FileText className="w-3 h-3" /> Ord. Compra
            </button>
          )}
          <button onClick={() => setSelectedFormat('op')} className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg transition ${selectedFormat === 'op' ? 'bg-white text-slate-800 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>
            <Package className="w-3 h-3" /> OP
          </button>
          <button onClick={() => setSelectedFormat('tecnico')} className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg transition ${selectedFormat === 'tecnico' ? 'bg-white text-slate-800 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>
            <Ruler className="w-3 h-3" /> Det. Técnico
          </button>
          <button onClick={() => setSelectedFormat('det_sap')} className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg transition ${selectedFormat === 'det_sap' ? 'bg-white text-slate-800 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>
            <Images className="w-3 h-3" /> Det. SAP
          </button>
          {(tieneGarantias || esGarantia) && (
            <button onClick={() => setSelectedFormat('garantia')} className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg transition ${selectedFormat === 'garantia' ? 'bg-white text-slate-800 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>
              <Shield className="w-3 h-3 text-blue-500" /> Garantía
              {tieneGarantias && <span className="text-[10px] bg-blue-500 text-white px-1.5 rounded-full">{odp.garantias.length}</span>}
            </button>
          )}
          {(tieneNC || esNC) && (
            <button onClick={() => setSelectedFormat('noconformidad')} className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg transition ${selectedFormat === 'noconformidad' ? 'bg-white text-slate-800 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>
              <AlertCircle className="w-3 h-3" /> No Conform.
              {tieneNC && <span className="text-[10px] bg-rose-500 text-white px-1.5 rounded-full">{odp.no_conformidades.length}</span>}
            </button>
          )}
          {odp?.saps?.length > 0 && (
            <button onClick={() => setSelectedFormat('sap')} className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg transition ${selectedFormat === 'sap' ? 'bg-white text-slate-800 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>
              <Package className="w-3 h-3" /> SAP
              <span className="text-[10px] bg-indigo-500 text-white px-1.5 rounded-full">{odp.saps.length}</span>
            </button>
          )}
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
        {selectedFormat === 'garantia' && tieneGarantias && odp?.garantias?.length > 1 && (
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg p-1 px-3">
                <span className="text-[10px] font-black text-slate-400 uppercase">GARANTÍA:</span>
                <select className="bg-transparent text-xs font-bold outline-none" value={garantiaIndex} onChange={e => setGarantiaIndex(parseInt(e.target.value))}>
                    {odp.garantias.map((g: any, idx: number) => (
                        <option key={idx} value={idx}>{g.numero_garantia} - {new Date(g.fecha_creacion).toLocaleDateString()}</option>
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
        {selectedFormat === 'op' && (odp?.tipo_odp === 'OA' ? <PrintableOA odp={odp} /> : <PrintableProduccion odp={odp} />)}
        {selectedFormat === 'tecnico' && <PrintableDetalleTecnico odp={odp} />}
        {selectedFormat === 'det_sap' && <PrintableDetSAP odp={odp} imagenes={detSapImagenes} />}
        {selectedFormat === 'garantia' && (
          esGarantia
            ? <PrintableGarantia garantia={odp} odp={odp.odp_padre} />
            : <PrintableGarantia garantia={odp.garantias?.[garantiaIndex]} odp={odp} />
        )}
        {selectedFormat === 'noconformidad' && (
          esNC && !tieneNC
            ? <PrintableNoConformidad odp={odp.odp_padre || odp} data={ncOrigenData} />
            : <PrintableNoConformidad odp={odp} data={odp?.no_conformidades?.[ncIndex]} />
        )}
        {selectedFormat === 'sap' && <PrintableSAP odp={odp} sap={odp?.saps?.[0]} />}
      </div>
    </div>
  );
};

export default TabImprimir;

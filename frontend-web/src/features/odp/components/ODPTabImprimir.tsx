import React, { useState, useEffect } from 'react';
import {
  FileText, Package, Ruler, Images, Shield, AlertCircle, Printer, Banknote, FileCheck, Pencil
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
import FacturaElectronicaModal from '../../contabilidad/components/FacturaElectronicaModal';
import AbonoFormModal from '../../contabilidad/components/AbonoFormModal';
import AbonosODPModal from '../../contabilidad/components/AbonosODPModal';
import { fmtFecha, puedeGestionarCobros } from '../../contabilidad/components/contabilidad.utils';
import { abrirVentanaImpresion } from '../../../utils/printWindow';
import API from '../../../services/config';

type FormatId = 'compra' | 'op' | 'tecnico' | 'det_sap' | 'garantia' | 'noconformidad' | 'sap';

const TabImprimir: React.FC<{ odp: any; currentUser?: any }> = ({ odp, currentUser }) => {
  const tieneNC = (odp?.no_conformidades?.length || 0) > 0;
  const tieneGarantias = (odp?.garantias?.length || 0) > 0;
  const esGarantia = !!odp?.es_garantia;
  const esNC = !!odp?.es_no_conformidad;

  const [selectedFormat, setSelectedFormat] = useState<FormatId>(esNC ? 'noconformidad' : 'op');
  const [ncIndex, setNcIndex] = useState(0);
  const [garantiaIndex, setGarantiaIndex] = useState(0);
  const [detSapImagenes, setDetSapImagenes] = useState<any[]>([]);
  const [ncOrigenData, setNcOrigenData] = useState<any>(null);

  // ─── Accesos directos a facturación y abonos (mismos modales que Contabilidad) ──
  // Visibilidad replicada de la tabla Estado Caja: las OA no se facturan, las garantías
  // no se cobran y una caja ya CANCELADA no admite abonos nuevos.
  const [showFeModal, setShowFeModal] = useState(false);
  const [showAbonoModal, setShowAbonoModal] = useState(false);
  const [showAbonosModal, setShowAbonosModal] = useState(false);

  const puedeCobros = puedeGestionarCobros(currentUser?.rol);
  const esOA = odp?.tipo_odp === 'OA';
  const puedeFacturar = puedeCobros && !esOA && !esGarantia;
  const puedeRegistrarAbono = puedeCobros && !esGarantia && odp?.estado_caja !== 'CANCELADO';
  const totalAbonos = odp?.pagos?.length || 0;
  const puedeVerAbonos = puedeCobros && totalAbonos > 0;
  const hayAccesosDirectos = puedeFacturar || puedeRegistrarAbono || puedeVerAbonos;

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
    abrirVentanaImpresion({
      titulo: `Impresión ODP ${odp?.numero_odp || ''}`,
      contenidoHtml: area.innerHTML,
      estilos: `
        @page { size: letter portrait; margin: 4mm; }
        body { font-family: sans-serif; }
        .excel-table { width: 100%; border-collapse: collapse; border: 2px solid #000; }
        .excel-table th, .excel-table td { border: 1px solid #000; padding: 2px 4px; }
        .excel-table th { font-weight: bold; text-align: center; }
        .sap-table { width: 100%; border-collapse: collapse; border: 2px solid #000; }
        .sap-table th, .sap-table td { border: 1px solid #000; padding: 2px 4px; }
        .sap-table th { font-weight: bold; text-align: center; background-color: #f0f0f0; }
        .thick-b { border-bottom: 2px solid #000 !important; }
        /* Ancho/alto fijos solo para la vista en pantalla: en papel la hoja la
           define @page, y forzar 21.5cm x 29cm (alto A4) sobre una Carta
           desbordaba y sacaba una hoja extra en blanco. */
        .sap-page { display: block; width: 100%; background: white; color: black; font-family: sans-serif; font-size: 14px; margin: 0 auto; page-break-after: always; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .sap-page:last-child { page-break-after: avoid; }
        .print-container { padding: 8px; }
        .bg-blue-100 { background-color: #dbeafe !important; }
        .bg-slate-50 { background-color: #f8fafc !important; }
      `,
    });
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

        <div className="flex flex-wrap items-center gap-2">
          {hayAccesosDirectos && (
            <div className="flex flex-wrap items-center gap-2 pr-2 mr-1 border-r border-slate-200">
              {puedeFacturar && (
                <button onClick={() => setShowFeModal(true)}
                  title={odp?.factura_electronica ? 'Editar factura electrónica' : 'Registrar factura electrónica'}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border transition ${
                    odp?.factura_electronica
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}>
                  <FileCheck className="w-3.5 h-3.5" />
                  {odp?.factura_electronica ? (
                    <span className="font-mono">
                      FE-{odp.factura_electronica}
                      {odp.fecha_factura && <span className="ml-1 font-sans font-medium opacity-70">· {fmtFecha(odp.fecha_factura)}</span>}
                      {odp.facturas_adicionales?.length > 0 && (
                        <span className="ml-1 font-sans text-[10px] text-indigo-700 bg-indigo-50 border border-indigo-100 px-1 rounded">
                          +{odp.facturas_adicionales.length}
                        </span>
                      )}
                    </span>
                  ) : 'Registrar FE'}
                  <Pencil className="w-3 h-3 opacity-60" />
                </button>
              )}
              {puedeRegistrarAbono && (
                <button onClick={() => setShowAbonoModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition">
                  <Banknote className="w-3.5 h-3.5" /> Registrar Abono
                </button>
              )}
              {puedeVerAbonos && (
                <button onClick={() => setShowAbonosModal(true)}
                  title="Ver, editar o eliminar los abonos de esta ODP"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition">
                  Abonos
                  <span className="text-[10px] font-black bg-slate-200 text-slate-700 px-1.5 rounded-full">{totalAbonos}</span>
                </button>
              )}
            </div>
          )}
          <button onClick={handlePrint} className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white font-black text-xs rounded-xl hover:bg-indigo-700 transition shadow-lg shadow-indigo-600/30">
            <Printer className="w-3 h-3" /> IMPRIMIR
          </button>
        </div>
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

      {/* Modales de Contabilidad — fuera de #printable-area para que no entren en la impresión.
          Tras guardar no se refresca a mano: el backend emite odp_patch y el hook global
          limpia la cache Redux de esta ODP, que se recarga sola. */}
      {showFeModal && (
        <FacturaElectronicaModal odp={odp} onClose={() => setShowFeModal(false)} />
      )}
      {showAbonoModal && (
        <AbonoFormModal odpFija={odp} onClose={() => setShowAbonoModal(false)} />
      )}
      {showAbonosModal && (
        <AbonosODPModal
          odp={odp}
          puedeRegistrar={puedeRegistrarAbono}
          onClose={() => setShowAbonosModal(false)}
        />
      )}
    </div>
  );
};

export default TabImprimir;

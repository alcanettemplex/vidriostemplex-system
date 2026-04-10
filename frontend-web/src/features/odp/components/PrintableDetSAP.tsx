import React from 'react';
import { TemplexLogo } from '../../../components/ui/TemplexLogo';

interface PrintableDetSAPProps {
  odp: any;
  imagenes?: { url: string }[];
}

const PrintableDetSAP: React.FC<PrintableDetSAPProps> = ({ odp, imagenes = [] }) => {
  return (
    <div className="block print:block w-[21.5cm] min-h-[29cm] bg-white shadow-xl print:shadow-none text-black font-sans text-[10px] mx-auto overflow-hidden">
      <style>
        {`
        .excel-table { width: 100%; border-collapse: collapse; border: 2px solid #000; }
        .excel-table th, .excel-table td { border: 1px solid #000; padding: 2px 4px; border-color: #000; }
        .excel-table th { font-weight: bold; text-align: center; }

        @media print {
            .print-container { -webkit-print-color-adjust: exact; print-color-adjust: exact; padding: 0 !important; }
        }
        `}
      </style>

      <div className="print-container p-6">
        {/* ---------- CABECERA ---------- */}
        <div className="flex justify-between items-end mb-1">
          <div className="flex items-center w-1/3">
            <div className="flex flex-col">
              <TemplexLogo className="h-10 w-40 justify-start" />
            </div>
          </div>

          <div className="w-1/3 text-center font-bold text-[13px] mb-2 uppercase tracking-[0.2em]">
            DET. SAP
          </div>

          <div className="w-1/3 flex justify-end mb-1">
            <div className="border-[2px] border-black text-xl font-bold w-32 h-10 flex items-center justify-center">
              {odp.numero_odp?.split('-').pop() || odp.numero_odp}
            </div>
          </div>
        </div>

        {/* ---------- DATOS CLIENTE ---------- */}
        <table className="excel-table thick-b mb-1 border-t-2 border-l-2 border-r-2 border-black">
          <tbody>
            <tr>
              <td className="w-[30%] font-bold">FECHA: <span className="font-normal uppercase ml-1">{odp.fecha_creacion ? new Date(odp.fecha_creacion).toLocaleDateString() : ''}</span></td>
              <td className="w-[45%] font-bold">CLIENTE: <span className="font-normal uppercase ml-1">{odp.cliente?.nombre_razon_social}</span></td>
              <td className="w-[25%] font-bold">TEL: <span className="font-normal uppercase ml-1">{odp.cliente?.telefono}</span></td>
            </tr>
            <tr>
              <td className="w-[30%] font-bold">DIRECCION: <span className="font-normal uppercase ml-1">{odp.direccion_instalacion || odp.cliente?.direccion}</span></td>
              <td className="w-[45%] font-bold">NIT O C.C: <span className="font-normal uppercase ml-1">{odp.cliente?.numero_documento || odp.cliente?.ruc_rut}</span></td>
              <td className="w-[25%] font-bold">CEL: <span className="font-normal uppercase ml-1">{odp.cliente?.celular || odp.cliente?.telefono}</span></td>
            </tr>
          </tbody>
        </table>

        {/* ---------- GALERÍA DE IMÁGENES SAP ---------- */}
        <div className="border-2 border-black mt-2 w-full p-2" style={{ minHeight: '700px' }}>
          {imagenes.length === 0 ? (
            <div className="flex items-center justify-center h-full text-slate-400 text-sm">
              Sin imágenes Det. SAP
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {imagenes.map((img, i) => (
                <div key={i} className="border border-slate-200 rounded overflow-hidden" style={{ height: '320px' }}>
                  <img
                    src={img.url}
                    alt={`Det. SAP ${i + 1}`}
                    className="w-full h-full object-contain"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-2 border-black mt-2 w-full p-2 flex flex-col" style={{ height: '80px' }}>
          <span className="font-bold text-[12px] uppercase">OBSERVACION</span>
          <div className="mt-1 text-sm uppercase font-semibold text-slate-700 whitespace-pre-line flex-1">
            {odp.observaciones || ''}
          </div>
        </div>

        <div className="text-right mt-1 font-bold text-[8px]">
          Det. SAP — ODP {odp.numero_odp}
        </div>
      </div>
    </div>
  );
};

export default PrintableDetSAP;

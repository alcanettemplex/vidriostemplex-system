import React from 'react';
import { format } from 'date-fns';
import { TemplexLogo } from '../../../components/ui/TemplexLogo';

interface PrintableSAPProps {
    odp: any;
    sap?: any;
}

const PrintableSAP: React.FC<PrintableSAPProps> = ({ odp, sap }) => {

    return (
        <div className="block print:block w-[21.5cm] min-h-[29cm] bg-white shadow-xl print:shadow-none text-black font-sans text-[10px] mx-auto overflow-hidden">
            <style>
                {`
                .sap-table { width: 100%; border-collapse: collapse; border: 2px solid #000; }
                .sap-table th, .sap-table td { border: 1px solid #000; padding: 2px 4px; }
                .sap-table th { font-weight: bold; text-align: center; background-color: #f0f0f0; }
                .thick-b { border-bottom: 2px solid #000 !important; }

                @media print {
                    .print-container { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                }
                `}
            </style>

            <div className="print-container p-2">

                {/* ---------- CABECERA ---------- */}
                <div className="flex justify-between items-end mb-1">
                    <div className="w-1/3">
                        <TemplexLogo className="h-10 w-40 justify-start" />
                    </div>
                    <div className="w-1/3 text-center font-bold text-[11px] uppercase tracking-[0.15em] leading-tight">
                        SOLICITUD DE ACCESORIOS<br />Y PERFILERÍA (SAP)
                    </div>
                    <div className="w-1/3 flex flex-col items-end gap-1">
                        <div className="border-[2px] border-black text-xl font-bold w-32 h-10 flex items-center justify-center">
                            {(sap?.numero_sap || odp.saps?.[0]?.numero_sap || '').split('-').pop()}
                        </div>
                        <div className="text-[9px] font-bold">
                            ODP: <span className="font-normal">{odp.numero_odp?.split('-').pop() || odp.numero_odp}</span>
                        </div>
                    </div>
                </div>

                {/* ---------- DATOS CLIENTE ---------- */}
                <table className="sap-table thick-b mb-1">
                    <tbody>
                        <tr>
                            <td colSpan={3} className="font-bold">
                                NOMBRE CLIENTE / RAZÓN SOCIAL:
                                <span className="font-normal uppercase ml-2">{odp.cliente?.nombre_razon_social}</span>
                            </td>
                            <td className="font-bold w-[25%]">
                                ASESOR: <span className="font-normal uppercase ml-1">
                                    {odp.asesor?.nombre_completo || `${odp.asesor?.first_name || ''} ${odp.asesor?.last_name || ''}`}
                                </span>
                            </td>
                        </tr>
                        <tr>
                            <td className="font-bold w-[30%]">
                                NIT / CC: <span className="font-normal uppercase ml-1">{odp.cliente?.numero_documento || odp.cliente?.ruc_rut}</span>
                            </td>
                            <td className="font-bold w-[30%]">
                                TELÉFONO FIJO: <span className="font-normal uppercase ml-1">{odp.cliente?.telefono}</span>
                            </td>
                            <td className="font-bold w-[20%]">
                                CELULAR: <span className="font-normal uppercase ml-1">{odp.cliente?.celular}</span>
                            </td>
                            <td className="font-bold">
                                FECHA: <span className="font-normal ml-1">
                                    {sap?.fecha_creacion ? format(new Date(sap.fecha_creacion), 'dd/MM/yyyy') : odp.fecha_creacion ? format(new Date(odp.fecha_creacion), 'dd/MM/yyyy') : ''}
                                </span>
                            </td>
                        </tr>
                    </tbody>
                </table>

                {/* ---------- TABLA DE ÍTEMS ---------- */}
                <table className="sap-table mb-1 text-center uppercase">
                    <thead>
                        <tr className="font-bold text-[9px]">
                            <th className="w-8">ITEM</th>
                            <th className="w-[18%]">COD</th>
                            <th className="w-[30%]">DESCRIPCIÓN</th>
                            <th className="w-[15%]">DIMENSIÓN</th>
                            <th className="w-8">UND</th>
                            <th className="w-[12%]">EXIST. PERF.</th>
                            <th className="w-[12%]">GASTO PERF.</th>
                        </tr>
                    </thead>
                    <tbody>
                        {Array.from({ length: 18 }).map((_, idx) => {
                            const item = sap?.items?.[idx] || odp.saps?.[0]?.items?.[idx];
                            return (
                                <tr key={idx} className={`h-[20px] ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                                    <td className="font-bold text-center">{idx + 1}</td>
                                    <td className="text-[9px]">{item?.codigo || ''}</td>
                                    <td className="text-left text-[9px] px-1">{item?.descripcion || ''}</td>
                                    <td className="text-[9px]">{item?.dimension || ''}</td>
                                    <td className="text-[9px]">{item?.und || ''}</td>
                                    <td className="text-[9px]">{item?.exist_perf || ''}</td>
                                    <td className="text-[9px]">{item?.gasto_perf || ''}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>

                {/* ---------- DETALLE TÉCNICO / OBSERVACIÓN ---------- */}
                {(() => {
                    const sapData = sap || odp.saps?.[0];
                    const odcs: any[] = sapData?.ordenes_compra || [];
                    const rows = [0, 1, 2].map(i => odcs[i] || null);
                    return (
                        <table className="sap-table mb-1">
                            <thead>
                                <tr className="font-bold text-[9px]">
                                    <th className="w-[50%] text-left px-1">DETALLE TÉCNICO / OBSERVACIÓN</th>
                                    <th className="w-[16%]">ODC Nº</th>
                                    <th className="w-[16%]">ITEMS</th>
                                    <th className="w-[18%]">PROV / FECHA</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((odc, i) => (
                                    <tr key={i}>
                                        {i === 0 && (
                                            <td className="align-top p-1 h-[80px]" rowSpan={3}>
                                                <p className="text-[9px] whitespace-pre-line uppercase font-semibold">
                                                    {sapData?.notas || ''}
                                                </p>
                                            </td>
                                        )}
                                        <td className="text-center text-[9px] h-[26px] font-bold">
                                            {odc?.numero_odc?.split('-').pop() || ''}
                                        </td>
                                        <td className="text-center text-[9px]">
                                            {odc?.items?.map((it: any) => it.item).join(', ') || ''}
                                        </td>
                                        <td className="text-center text-[9px]">
                                            {odc ? `${odc.proveedor || ''} ${odc.fecha_creacion ? new Date(odc.fecha_creacion).toLocaleDateString('es-CO') : ''}`.trim() : ''}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    );
                })()}

                {/* ---------- FIRMA ---------- */}
                <div className="flex justify-between items-end mt-4 px-2">
                    <div className="text-center">
                        <div className="w-48 border-b border-black mb-0.5"></div>
                        <p className="font-bold uppercase text-[9px] tracking-widest">SOLICITADO POR</p>
                    </div>
                    <div className="text-center">
                        <div className="w-48 border-b border-black mb-0.5"></div>
                        <p className="font-bold uppercase text-[9px] tracking-widest">AUTORIZADO POR</p>
                    </div>
                    <div className="text-center">
                        <div className="w-48 border-b border-black mb-0.5"></div>
                        <p className="font-bold uppercase text-[9px] tracking-widest">RECIBIDO POR</p>
                    </div>
                </div>

                {/* ---------- PIE DE PÁGINA ---------- */}
                <div className="flex justify-end mt-1">
                    <span className="text-[7px] text-slate-500">VTS-2026-003</span>
                </div>

            </div>
        </div>
    );
};

export default PrintableSAP;

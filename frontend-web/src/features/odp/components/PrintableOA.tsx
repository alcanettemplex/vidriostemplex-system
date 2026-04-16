import React from 'react';
import { format } from 'date-fns';
import { TemplexLogo } from '../../../components/ui/TemplexLogo';

interface PrintableOAProps {
  odp: any;
}

const ITEMS_POR_PAGINA = 10;

/**
 * Imprimible para ODP sin IVA (OA) — "Órdenes Azules"
 * Replicación del formato ORDENES AZULES.xlsx
 * Si items.length > ITEMS_POR_PAGINA genera páginas adicionales con misma cabecera.
 */
const PrintableOA: React.FC<PrintableOAProps> = ({ odp }) => {
  const items: any[] = odp.items || [];
  const totalPaginas = Math.max(1, Math.ceil(items.length / ITEMS_POR_PAGINA));
  const paginas = Array.from({ length: totalPaginas }, (_, i) =>
    items.slice(i * ITEMS_POR_PAGINA, (i + 1) * ITEMS_POR_PAGINA)
  );

  const fmtNum = (v: unknown): string => {
    const n = parseFloat(String(v ?? ''));
    return isNaN(n) ? '' : String(n);
  };

  const calcArea = (item: any): string => {
    const ancho = parseFloat(item?.ancho_mm) || 0;
    const alto = parseFloat(item?.alto_mm) || 0;
    const cant = parseFloat(item?.cantidad) || 1;
    if (!ancho || !alto) return '';
    return ((ancho * alto / 1_000_000) * cant).toFixed(3);
  };

  return (
    <div className="font-sans text-black text-[10px]">
      <style>{`
        .oa-table { width: 100%; border-collapse: collapse; border: 2px solid #000; }
        .oa-table th, .oa-table td { border: 1px solid #000; padding: 2px 4px; vertical-align: middle; }
        .oa-table th { font-weight: bold; text-align: center; background-color: #bdd7ee; }
        .oa-header-cell { background-color: #bdd7ee; }
        .page-break { page-break-after: always; }
        @media print {
          @page { size: letter portrait; margin: 5mm; }
          body, html { margin: 0 !important; padding: 0 !important; }
          .page-break { page-break-after: always; }
        }
      `}</style>

      {paginas.map((itemsPagina, pageIdx) => (
        <div
          key={pageIdx}
          className={`w-[21.5cm] bg-white p-3 mx-auto${pageIdx < paginas.length - 1 ? ' page-break' : ''}`}
        >
          {/* ── CABECERA ── */}
          <div className="flex justify-between items-center mb-1">
            {/* Logo */}
            <div className="w-1/3">
              <TemplexLogo className="h-10 w-40 justify-start" />
            </div>
            {/* Leyenda de códigos */}
            <div className="w-1/3 text-[8px] leading-tight">
              <div className="grid grid-cols-2 gap-x-2">
                <span><strong>T/C:</strong> Templado Crudo</span>
                <span><strong>MP:</strong> Materia prima</span>
                <span><strong>CL:</strong> Color</span>
                <span><strong>PT:</strong> Producto terminado</span>
                <span><strong>P:</strong> Pulido</span>
                <span><strong>REF:</strong> Referencia</span>
                <span><strong>DT:</strong> Descripción Técnica</span>
              </div>
              <div className="mt-0.5"><strong>PBX:</strong> 57 4 448 86 56</div>
            </div>
            {/* Título + número */}
            <div className="w-1/3 flex flex-col items-end gap-1">
              <span className="font-bold text-[11px] uppercase tracking-widest">ORDEN DE PRODUCCION</span>
              <div className="border-[2px] border-black text-xl font-bold w-28 h-9 flex items-center justify-center">
                {odp.numero_odp?.split('-').pop() || odp.numero_odp}
              </div>
            </div>
          </div>

          {/* ── DATOS CLIENTE ── */}
          <table className="oa-table mb-1">
            <tbody>
              <tr>
                <td colSpan={3} className="font-bold oa-header-cell">
                  CLIENTE: <span className="font-normal uppercase ml-1">{odp.cliente?.nombre_razon_social}</span>
                </td>
              </tr>
              <tr>
                <td className="font-bold w-1/3 oa-header-cell">
                  FECHA ELABORACION:{' '}
                  <span className="font-normal ml-1">
                    {odp.fecha_creacion ? format(new Date(odp.fecha_creacion), 'dd/MM/yyyy') : ''}
                  </span>
                </td>
                <td className="font-bold w-1/3 oa-header-cell">
                  ENTREGA SOLICITADA:{' '}
                  <span className="font-normal ml-1">
                    {odp.fecha_entrega ? format(new Date(odp.fecha_entrega), 'dd/MM/yyyy') : ''}
                  </span>
                </td>
                <td className="font-bold w-1/3 oa-header-cell">
                  ASESOR: <span className="font-normal uppercase ml-1">{odp.asesor?.nombre_completo}</span>
                </td>
              </tr>
            </tbody>
          </table>

          {/* ── SECCIÓN SERVICIOS (solo pág. 1) ── */}
          {pageIdx === 0 && odp.servicios_detalle && odp.servicios_detalle.length > 0 && (
            <table className="oa-table mb-1">
              <thead>
                <tr>
                  <th className="w-12">CANT</th>
                  <th>PRODUCTO O SERVICIO</th>
                </tr>
              </thead>
              <tbody>
                {odp.servicios_detalle.map((svc: any, idx: number) => (
                  <tr key={idx}>
                    <td className="h-10 font-bold text-center text-base align-middle">{svc.cantidad}</td>
                    <td className="align-top p-1">
                      <span className="whitespace-pre-line uppercase font-semibold text-[10px] leading-tight">
                        <span className="font-bold">{svc.tipo_servicio}{svc.descripcion ? ': ' : ''}</span>
                        {svc.descripcion}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* ── TABLA DE ÍTEMS (cristalería) ── */}
          {items.length > 0 && (
            <table className="oa-table text-center uppercase mb-1">
              <thead>
                <tr>
                  <th rowSpan={2} className="w-6">ITEM</th>
                  <th rowSpan={2} className="w-6">CANT</th>
                  <th colSpan={7} className="oa-header-cell">MATERIAL</th>
                  <th rowSpan={2} className="w-14">ÁREA m²</th>
                  <th rowSpan={2} className="w-[22%]">D.T</th>
                </tr>
                <tr>
                  <th className="w-8">T/C</th>
                  <th className="w-8">CL</th>
                  <th className="w-8">MM</th>
                  <th className="w-14">ANCHO</th>
                  <th className="w-14">ALTO</th>
                  <th className="w-7">PERF</th>
                  <th className="w-7">P</th>
                </tr>
              </thead>
              <tbody>
                {/* Filas fijas: ITEMS_POR_PAGINA */}
                {Array.from({ length: ITEMS_POR_PAGINA }).map((_, idx) => {
                  const item = itemsPagina[idx];
                  const letter = String.fromCharCode(65 + (pageIdx * ITEMS_POR_PAGINA) + idx);
                  return (
                    <tr key={idx} className="h-[22px]">
                      <td className="font-bold">{item ? letter : ''}</td>
                      <td className="font-bold">{item?.cantidad || ''}</td>
                      <td className="font-bold text-[9px]">{item?.prod || ''}</td>
                      <td className="font-bold text-[9px]">{item?.color?.substring(0, 4)?.toUpperCase() || ''}</td>
                      <td className="font-bold">{item?.espesor || ''}</td>
                      <td className="font-bold">{item?.ancho_mm || ''}</td>
                      <td className="font-bold">{item?.alto_mm || ''}</td>
                      <td className="font-bold text-[9px]">{item?.perforaciones > 0 ? item.perforaciones : ''}</td>
                      <td className="font-bold text-[9px]">{item?.pulidos || ''}</td>
                      <td className="font-bold text-[9px]">{item ? calcArea(item) : ''}</td>
                      <td className="font-bold text-[9px] text-left px-1 max-w-[120px]">
                        {item ? [item.accesorios, item.otros].filter(Boolean).join(' | ') : ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {/* ── PIE: dirección + observaciones ── */}
          {pageIdx === paginas.length - 1 && (
            <div className="border-[2px] border-black p-2 mt-1 bg-white min-h-[40px]">
              <p className="font-bold uppercase text-[10px] mb-1">
                DIRECCIÓN DE ENTREGA:{' '}
                <span className="font-normal">{odp.direccion_instalacion}</span>
              </p>
              {odp.observaciones && (
                <p className="font-bold uppercase text-[10px]">
                  OBSERVACIONES:{' '}
                  <span className="font-normal whitespace-pre-line">{odp.observaciones}</span>
                </p>
              )}
            </div>
          )}

          {/* Indicador de página */}
          {totalPaginas > 1 && (
            <div className="text-right text-[8px] text-slate-400 mt-0.5">
              Pág. {pageIdx + 1} / {totalPaginas}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default PrintableOA;

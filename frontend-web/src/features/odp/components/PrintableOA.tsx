import React from 'react';
import { format } from 'date-fns';
import { TemplexLogo } from '../../../components/ui/TemplexLogo';

interface PrintableOAProps {
  odp: any;
}

const ITEMS_POR_PAGINA = 10;
const BLUE = '#2F75B6';
const BLUE_LIGHT = '#BDD7EE';

/**
 * Imprimible para ODP sin IVA (OA) — "Órdenes Azules"
 * Copia exacta del formato ORDENES AZULES.xlsx
 */
const PrintableOA: React.FC<PrintableOAProps> = ({ odp }) => {
  const items: any[] = odp.items || [];
  const servicios: any[] = odp.servicios_detalle || [];
  const totalPaginas = Math.max(1, Math.ceil(items.length / ITEMS_POR_PAGINA));
  const paginas = Array.from({ length: totalPaginas }, (_, i) =>
    items.slice(i * ITEMS_POR_PAGINA, (i + 1) * ITEMS_POR_PAGINA)
  );

  const calcArea = (item: any): string => {
    const ancho = parseFloat(item?.ancho_mm) || 0;
    const alto  = parseFloat(item?.alto_mm)  || 0;
    const cant  = parseFloat(item?.cantidad) || 1;
    if (!ancho || !alto) return '';
    return ((ancho * alto / 1_000_000) * cant).toFixed(3);
  };

  const numero      = odp.numero_odp?.split('-').pop() || odp.numero_odp;
  const cliente     = odp.cliente?.nombre_razon_social || '';
  const fechaElab   = odp.fecha_creacion ? format(new Date(odp.fecha_creacion), 'dd/MM/yyyy') : '';
  const fechaEntrega = odp.fecha_entrega ? format(new Date(odp.fecha_entrega), 'dd/MM/yyyy') : '';
  const dtTexto     = [odp.descripcion_pedido, odp.observaciones].filter(Boolean).join('\n');

  const thStyle: React.CSSProperties = {
    backgroundColor: BLUE_LIGHT,
    border: `1px solid ${BLUE}`,
    fontWeight: 'bold',
    textAlign: 'center',
    verticalAlign: 'middle',
    padding: '2px 3px',
    fontSize: '8px',
  };
  const tdStyle: React.CSSProperties = {
    border: `1px solid ${BLUE}`,
    verticalAlign: 'middle',
    padding: '2px 3px',
    fontSize: '9px',
  };
  const tableStyle: React.CSSProperties = {
    width: '100%',
    borderCollapse: 'collapse',
    border: `2px solid ${BLUE}`,
  };

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', color: '#000', fontSize: '9px' }}>
      <style>{`
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
          style={{ width: '21.5cm', background: '#fff', padding: '8px', margin: '0 auto' }}
          className={pageIdx < paginas.length - 1 ? 'page-break' : ''}
        >
          {/* ── CABECERA ── */}
          <table style={{ ...tableStyle, marginBottom: '4px' }}>
            <tbody>
              <tr>
                {/* Logo */}
                <td style={{ ...tdStyle, width: '38%', textAlign: 'center', padding: '6px 8px' }}>
                  <TemplexLogo className="h-12 w-44 mx-auto" />
                  <div style={{ fontSize: '7px', color: '#666', marginTop: '2px' }}>Respaldo y confianza</div>
                </td>

                {/* Leyenda */}
                <td style={{ ...tdStyle, width: '38%', verticalAlign: 'top', padding: '4px 6px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8px' }}>
                    <tbody>
                      <tr>
                        <td style={{ paddingRight: '4px', whiteSpace: 'nowrap' }}><b>T/C:</b> Templado Crudo</td>
                        <td style={{ whiteSpace: 'nowrap' }}><b>MP:</b> Materia prima</td>
                      </tr>
                      <tr>
                        <td><b>CL:</b> Color</td>
                        <td><b>PT:</b> Producto terminado</td>
                      </tr>
                      <tr>
                        <td><b>P:</b> Pulido</td>
                        <td><b>REF:</b> Referencia</td>
                      </tr>
                      <tr>
                        <td colSpan={2}><b>DT:</b> Descripcion Tecnica</td>
                      </tr>
                      <tr>
                        <td colSpan={2}><b>PBX:</b> 57 4 448 86 56</td>
                      </tr>
                    </tbody>
                  </table>
                </td>

                {/* Título + número */}
                <td style={{ ...tdStyle, width: '24%', textAlign: 'center', verticalAlign: 'middle', padding: '6px' }}>
                  <div style={{ fontWeight: 'bold', fontSize: '10px', textTransform: 'uppercase', lineHeight: '1.2' }}>
                    ORDEN DE<br />PRODUCCION
                  </div>
                  <div style={{ marginTop: '6px' }}>
                    <span style={{ fontSize: '9px', fontWeight: '600' }}>N°</span>
                    <span style={{ fontSize: '24px', fontWeight: 'bold', color: '#FF0000', marginLeft: '4px' }}>
                      {numero}
                    </span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          {/* ── CLIENTE / FECHAS ── */}
          <table style={{ ...tableStyle, marginBottom: '4px' }}>
            <tbody>
              <tr>
                <td style={{ ...thStyle, width: '46%', textAlign: 'left' }} rowSpan={2}>
                  <span style={{ fontWeight: 'bold' }}>CLIENTE: </span>
                  <span style={{ fontWeight: 'normal', textTransform: 'uppercase' }}>{cliente}</span>
                </td>
                <td style={{ ...thStyle, width: '27%' }}>FECHA ELABORACION</td>
                <td style={{ ...thStyle, width: '27%' }}>ENTREGA SOLICITADA</td>
              </tr>
              <tr>
                <td style={{ ...tdStyle, textAlign: 'center', height: '18px' }}>{fechaElab}</td>
                <td style={{ ...tdStyle, textAlign: 'center', height: '18px' }}>{fechaEntrega}</td>
              </tr>
            </tbody>
          </table>

          {/* ── SERVICIOS (solo pág. 1, si existen) ── */}
          {pageIdx === 0 && servicios.length > 0 && (
            <table style={{ ...tableStyle, marginBottom: '4px' }}>
              <tbody>
                <tr>
                  <td style={{ ...thStyle, width: '36px' }}>CANT</td>
                  <td style={{ ...thStyle }}>PRODUCTO O SERVICIO</td>
                </tr>
                {servicios.map((svc: any, idx: number) => (
                  <React.Fragment key={idx}>
                    <tr>
                      <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 'bold', fontSize: '11px', height: '40px' }}>
                        {svc.cantidad}
                      </td>
                      <td style={{ ...tdStyle, textTransform: 'uppercase', fontWeight: '600', fontSize: '9px', lineHeight: '1.4', padding: '4px 6px' }}>
                        <span style={{ fontWeight: 'bold' }}>{svc.tipo_servicio}{svc.descripcion ? ': ' : ''}</span>
                        {svc.descripcion}
                      </td>
                    </tr>
                    {/* Fila separadora entre servicios */}
                    {idx < servicios.length - 1 && (
                      <tr>
                        <td colSpan={2} style={{ height: '6px', border: 'none', background: '#fff' }} />
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}

          {/* ── TABLA DE ÍTEMS ── */}
          <table style={{ ...tableStyle, textAlign: 'center', textTransform: 'uppercase' }}>
            <tbody>
              {/* Fila de cabecera 1 */}
              <tr>
                <td style={{ ...thStyle, width: '32px' }} rowSpan={2}>CANT</td>
                <td style={{ ...thStyle }} colSpan={3}>MATERIAL</td>
                <td style={{ ...thStyle }} colSpan={2}></td>
                <td style={{ ...thStyle }} colSpan={2}></td>
                <td style={{ ...thStyle, width: '46px' }}>AREA</td>
                <td style={{ ...thStyle, width: '28%' }}>D.T</td>
              </tr>
              {/* Fila de cabecera 2 — D.T data empieza aquí (rowspan) */}
              <tr>
                <td style={{ ...thStyle, width: '34px' }}>T/C</td>
                <td style={{ ...thStyle, width: '34px' }}>CL</td>
                <td style={{ ...thStyle, width: '28px' }}>MM</td>
                <td style={{ ...thStyle, width: '50px' }}>ANCHO</td>
                <td style={{ ...thStyle, width: '50px' }}>ALTO</td>
                <td style={{ ...thStyle, width: '32px' }}>PERF</td>
                <td style={{ ...thStyle, width: '28px' }}>P</td>
                <td style={{ ...thStyle, width: '36px' }}>MP</td>
                {/* D.T: celda única que abarca sub-cabecera + todas las filas de datos */}
                <td
                  style={{ ...tdStyle, verticalAlign: 'top', textAlign: 'left', fontSize: '8px' }}
                  rowSpan={ITEMS_POR_PAGINA + 1}
                />
              </tr>

              {/* Filas de datos */}
              {Array.from({ length: ITEMS_POR_PAGINA }).map((_, idx) => {
                const item = itemsPagina[idx];
                return (
                  <tr key={idx} style={{ height: '22px' }}>
                    <td style={{ ...tdStyle, fontWeight: 'bold' }}>{item?.cantidad || ''}</td>
                    <td style={{ ...tdStyle, fontWeight: 'bold', fontSize: '8px' }}>{item?.prod || ''}</td>
                    <td style={{ ...tdStyle, fontWeight: 'bold', fontSize: '8px' }}>{item?.color?.substring(0, 4)?.toUpperCase() || ''}</td>
                    <td style={{ ...tdStyle, fontWeight: 'bold' }}>{item?.espesor || ''}</td>
                    <td style={{ ...tdStyle, fontWeight: 'bold' }}>{item?.ancho_mm || ''}</td>
                    <td style={{ ...tdStyle, fontWeight: 'bold' }}>{item?.alto_mm || ''}</td>
                    <td style={{ ...tdStyle, fontWeight: 'bold', fontSize: '8px' }}>{item?.perforaciones > 0 ? item.perforaciones : ''}</td>
                    <td style={{ ...tdStyle, fontWeight: 'bold', fontSize: '8px' }}>{item?.pulidos || ''}</td>
                    <td style={{ ...tdStyle, fontWeight: 'bold', fontSize: '8px' }}>{item ? calcArea(item) : ''}</td>
                    {/* D.T cubierta por rowspan */}
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* ── DIRECCIÓN ── */}
          {pageIdx === paginas.length - 1 && (odp.direccion_instalacion || odp.observaciones) && (
            <div style={{ border: `2px solid ${BLUE}`, padding: '4px 6px', marginTop: '4px', minHeight: '32px', fontSize: '9px' }}>
              {odp.direccion_instalacion && (
                <div>
                  <span style={{ fontWeight: 'bold', textTransform: 'uppercase' }}>DIRECCIÓN DE ENTREGA: </span>
                  <span style={{ textTransform: 'uppercase' }}>{odp.direccion_instalacion}</span>
                </div>
              )}
            </div>
          )}

          {totalPaginas > 1 && (
            <div style={{ textAlign: 'right', fontSize: '7px', color: '#999', marginTop: '2px' }}>
              Pág. {pageIdx + 1} / {totalPaginas}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default PrintableOA;

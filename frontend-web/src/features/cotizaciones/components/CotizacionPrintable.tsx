import React from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { CotizacionType, CotizacionItemType, LABEL_SECCION } from '../cotizacionesTypes';

interface CotizacionPrintableProps {
  cotizacion: CotizacionType;
}

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

const SectionTable: React.FC<{
  titulo: string;
  items: CotizacionItemType[];
  subtotal: number;
  showCodigo?: boolean;
}> = ({ titulo, items, subtotal, showCodigo = true }) => {
  if (items.length === 0) return null;
  return (
    <div style={{ marginBottom: 8 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9 }}>
        <thead>
          <tr style={{ backgroundColor: '#1a3c5e', color: '#fff' }}>
            <th colSpan={showCodigo ? 7 : 6} style={{ padding: '3px 6px', textAlign: 'left', fontWeight: 'bold', fontSize: 10 }}>
              {titulo}
            </th>
          </tr>
          <tr style={{ backgroundColor: '#d9e8f5' }}>
            <th style={thStyle}>#</th>
            {showCodigo && <th style={thStyle}>Código</th>}
            <th style={{ ...thStyle, textAlign: 'left', width: '35%' }}>Descripción</th>
            <th style={thStyle}>Cantidad</th>
            <th style={thStyle}>Unidad</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>P. Unitario</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>P. Venta</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => {
            const pv = item.precio_venta ?? item.cantidad * item.precio_unitario;
            return (
              <tr key={i} style={{ backgroundColor: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                <td style={tdStyle}>{i + 1}</td>
                {showCodigo && <td style={tdStyle}>{item.codigo || ''}</td>}
                <td style={{ ...tdStyle, textAlign: 'left' }}>{item.descripcion}</td>
                <td style={tdStyle}>{item.cantidad}</td>
                <td style={tdStyle}>{item.unidad}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>{fmt(item.precio_unitario)}</td>
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 500 }}>{fmt(pv)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr style={{ backgroundColor: '#eaf0f8' }}>
            <td colSpan={showCodigo ? 5 : 4} />
            <td style={{ ...tdStyle, fontWeight: 'bold', textAlign: 'right', borderTop: '2px solid #1a3c5e' }}>
              SUBTOTAL {titulo.toUpperCase().split(' ')[0]}:
            </td>
            <td style={{ ...tdStyle, fontWeight: 'bold', textAlign: 'right', borderTop: '2px solid #1a3c5e' }}>
              {fmt(subtotal)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
};

const thStyle: React.CSSProperties = {
  border: '1px solid #aac',
  padding: '2px 4px',
  textAlign: 'center',
  fontWeight: 'bold',
};

const tdStyle: React.CSSProperties = {
  border: '1px solid #ccd',
  padding: '2px 4px',
  textAlign: 'center',
  verticalAlign: 'middle',
};

const CotizacionPrintable = React.forwardRef<HTMLDivElement, CotizacionPrintableProps>(
  ({ cotizacion: cot }, ref) => {
    const items = cot.items ?? [];
    const vidrios = items.filter(i => i.seccion === 'vidrio').sort((a, b) => a.orden - b.orden);
    const acabados = items.filter(i => i.seccion === 'acabado').sort((a, b) => a.orden - b.orden);
    const gastos = items.filter(i => i.seccion === 'gasto_instalacion').sort((a, b) => a.orden - b.orden);

    const fecha = cot.fecha_creacion
      ? format(new Date(cot.fecha_creacion), "d 'de' MMMM 'de' yyyy", { locale: es })
      : '';

    const validezTexto =
      cot.validez_dias === 30 ? 'Treinta (30) días' :
      cot.validez_dias === 15 ? 'Quince (15) días' :
      `${cot.validez_dias} días`;

    return (
      <div
        ref={ref}
        id="cot-print-area"
        style={{
          width: '21cm',
          minHeight: '29.7cm',
          margin: '0 auto',
          backgroundColor: '#fff',
          color: '#000',
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontSize: 10,
          padding: '1cm',
          boxSizing: 'border-box',
        }}
      >
        <style>{`
          @media print {
            @page { size: letter portrait; margin: 8mm; }
            body * { visibility: hidden !important; }
            #cot-print-area, #cot-print-area * { visibility: visible !important; }
            #cot-print-area { position: fixed; top: 0; left: 0; width: 100%; }
          }
        `}</style>

        {/* ============ ENCABEZADO ============ */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
          <tbody>
            <tr>
              {/* Logo / Empresa */}
              <td style={{ width: '45%', verticalAlign: 'top', paddingRight: 8 }}>
                <div style={{ fontWeight: 'bold', fontSize: 18, color: '#1a3c5e', letterSpacing: 1 }}>
                  VIDRIOS TEMPLEX
                </div>
                <div style={{ fontSize: 9, marginTop: 2, color: '#444' }}>
                  NIT 900.192.869-0<br />
                  PBX 448 86 56<br />
                  Cra 44 # 41-43, Medellín
                </div>
              </td>
              {/* Datos cotización */}
              <td
                style={{
                  width: '55%',
                  verticalAlign: 'top',
                  border: '2px solid #1a3c5e',
                  padding: '6px 10px',
                  backgroundColor: '#eaf0f8',
                }}
              >
                <table style={{ width: '100%', fontSize: 10 }}>
                  <tbody>
                    <tr>
                      <td style={{ fontWeight: 'bold', paddingRight: 8 }}>COTIZACIÓN No.:</td>
                      <td style={{ fontWeight: 'bold', fontSize: 13, color: '#1a3c5e' }}>{cot.numero_cot}</td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 'bold' }}>Fecha:</td>
                      <td>{fecha}</td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 'bold' }}>Validez:</td>
                      <td>{validezTexto}</td>
                    </tr>
                    {cot.tipo_cliente && (
                      <tr>
                        <td style={{ fontWeight: 'bold' }}>Tipo cliente:</td>
                        <td>{cot.tipo_cliente}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>

        {/* ============ DATOS CLIENTE ============ */}
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            border: '1px solid #aac',
            marginBottom: 10,
            fontSize: 9.5,
          }}
        >
          <tbody>
            <tr style={{ backgroundColor: '#d9e8f5' }}>
              <th colSpan={4} style={{ padding: '3px 6px', textAlign: 'left', fontSize: 10 }}>
                DATOS DEL CLIENTE
              </th>
            </tr>
            <tr>
              <td style={{ ...tdStyle, fontWeight: 'bold', width: '15%' }}>CLIENTE:</td>
              <td style={{ ...tdStyle, textAlign: 'left', width: '35%' }}>{cot.cliente?.nombre_razon_social || ''}</td>
              <td style={{ ...tdStyle, fontWeight: 'bold', width: '15%' }}>TELÉFONO:</td>
              <td style={{ ...tdStyle, textAlign: 'left', width: '35%' }}>{cot.cliente?.telefono || ''}</td>
            </tr>
            <tr>
              <td style={{ ...tdStyle, fontWeight: 'bold' }}>DIRECCIÓN:</td>
              <td style={{ ...tdStyle, textAlign: 'left' }} colSpan={3}>{cot.cliente?.direccion || ''}</td>
            </tr>
            {cot.nombre_proyecto && (
              <tr>
                <td style={{ ...tdStyle, fontWeight: 'bold' }}>PROYECTO:</td>
                <td style={{ ...tdStyle, textAlign: 'left' }} colSpan={3}>{cot.nombre_proyecto}</td>
              </tr>
            )}
            <tr>
              <td style={{ ...tdStyle, fontWeight: 'bold' }}>ASESOR:</td>
              <td style={{ ...tdStyle, textAlign: 'left' }}>{cot.asesor?.nombre_completo || ''}</td>
              <td style={{ ...tdStyle, fontWeight: 'bold' }}>FORMA DE PAGO:</td>
              <td style={{ ...tdStyle, textAlign: 'left' }}>{cot.forma_pago || ''}</td>
            </tr>
          </tbody>
        </table>

        {/* ============ SECCIÓN VIDRIOS ============ */}
        <SectionTable
          titulo={LABEL_SECCION.vidrio}
          items={vidrios}
          subtotal={cot.total_vidrio}
          showCodigo
        />

        {/* ============ SECCIÓN ACABADOS ============ */}
        <SectionTable
          titulo={LABEL_SECCION.acabado}
          items={acabados}
          subtotal={cot.total_acabados}
          showCodigo
        />

        {/* ============ SECCIÓN GASTOS INSTALACIÓN ============ */}
        <SectionTable
          titulo={LABEL_SECCION.gasto_instalacion}
          items={gastos}
          subtotal={cot.total_gastos_instalacion}
          showCodigo={false}
        />

        {/* ============ RESUMEN DE TOTALES ============ */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6, marginBottom: 10 }}>
          <tbody>
            <TotalRow label="TOTAL VIDRIOS" value={cot.total_vidrio} />
            <TotalRow label="TOTAL ACABADOS Y ACCESORIOS" value={cot.total_acabados} />
            <TotalRow label="TOTAL GASTOS DE INSTALACIÓN" value={cot.total_gastos_instalacion} />
            <tr>
              <td colSpan={2}><hr style={{ borderTop: '1px solid #aac', margin: '2px 0' }} /></td>
            </tr>
            <TotalRow label="SUBTOTAL" value={cot.subtotal} />
            {cot.descuento > 0 && (
              <TotalRow
                label={`DESCUENTO (${cot.descuento}%)`}
                value={-(cot.subtotal - cot.base_gravable)}
                negative
              />
            )}
            <TotalRow label="BASE GRAVABLE" value={cot.base_gravable} />
            <TotalRow label="IVA (19%)" value={cot.iva} />
            <tr>
              <td colSpan={2}><hr style={{ borderTop: '2px solid #1a3c5e', margin: '2px 0' }} /></td>
            </tr>
            <TotalRow label="TOTAL NETO" value={cot.valor_total} highlight />
          </tbody>
        </table>

        {/* ============ CONDICIONES ============ */}
        <div
          style={{
            border: '1px solid #aac',
            padding: '6px 10px',
            fontSize: 9,
            marginBottom: 12,
            backgroundColor: '#fafbfc',
          }}
        >
          <div style={{ fontWeight: 'bold', marginBottom: 4 }}>CONDICIONES COMERCIALES:</div>
          {cot.notas ? (
            <div style={{ whiteSpace: 'pre-wrap' }}>{cot.notas}</div>
          ) : (
            <div style={{ color: '#555' }}>
              • Los precios están sujetos a cambio sin previo aviso.<br />
              • Esta cotización tiene una validez de {cot.validez_dias} días calendario a partir de la fecha de emisión.<br />
              • Los trabajos se realizarán según las especificaciones acordadas.<br />
              • La forma de pago acordada es: {cot.forma_pago || 'A convenir'}.
            </div>
          )}
          <div style={{ marginTop: 6, fontWeight: 'bold' }}>GARANTÍA:</div>
          <div style={{ color: '#555' }}>
            Seis (6) meses por instalación contados a partir de la fecha de entrega. La garantía no cubre daños por mal uso,
            accidentes, modificaciones no autorizadas o causas de fuerza mayor.
          </div>
        </div>

        {/* ============ FIRMAS ============ */}
        <table style={{ width: '100%', marginTop: 20 }}>
          <tbody>
            <tr>
              <td style={{ width: '45%', textAlign: 'center', verticalAlign: 'bottom' }}>
                <div style={{ borderTop: '1px solid #000', paddingTop: 4, marginTop: 40 }}>
                  <div style={{ fontWeight: 'bold' }}>ASESOR COMERCIAL</div>
                  <div style={{ fontSize: 9, color: '#555' }}>{cot.asesor?.nombre_completo || ''}</div>
                  <div style={{ fontSize: 9, color: '#555' }}>VIDRIOS TEMPLEX SAS</div>
                </div>
              </td>
              <td style={{ width: '10%' }} />
              <td style={{ width: '45%', textAlign: 'center', verticalAlign: 'bottom' }}>
                <div style={{ borderTop: '1px solid #000', paddingTop: 4, marginTop: 40 }}>
                  <div style={{ fontWeight: 'bold' }}>CLIENTE — APROBADO POR</div>
                  <div style={{ fontSize: 9, color: '#555' }}>{cot.cliente?.nombre_razon_social || ''}</div>
                  <div style={{ fontSize: 9, color: '#555' }}>CC / NIT: _________________________</div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        {/* ============ PIE DE PÁGINA ============ */}
        <div
          style={{
            marginTop: 16,
            textAlign: 'center',
            fontSize: 8,
            color: '#888',
            borderTop: '1px solid #ccd',
            paddingTop: 4,
          }}
        >
          VIDRIOS TEMPLEX SAS — NIT 900.192.869-0 — PBX 448 86 56 — Cra 44 # 41-43, Medellín — {cot.numero_cot}
        </div>
      </div>
    );
  }
);

CotizacionPrintable.displayName = 'CotizacionPrintable';
export default CotizacionPrintable;

// ============ Helpers ============
const TotalRow: React.FC<{
  label: string;
  value: number;
  highlight?: boolean;
  negative?: boolean;
}> = ({ label, value, highlight, negative }) => (
  <tr>
    <td
      style={{
        textAlign: 'right',
        paddingRight: 8,
        paddingTop: 2,
        paddingBottom: 2,
        fontWeight: highlight ? 'bold' : 'normal',
        fontSize: highlight ? 11 : 9.5,
        width: '70%',
      }}
    >
      {label}:
    </td>
    <td
      style={{
        textAlign: 'right',
        paddingRight: 4,
        fontWeight: highlight ? 'bold' : 'normal',
        fontSize: highlight ? 12 : 9.5,
        color: negative ? '#c00' : highlight ? '#1a3c5e' : 'inherit',
        width: '30%',
      }}
    >
      {negative ? `(${fmt(Math.abs(value))})` : fmt(value)}
    </td>
  </tr>
);

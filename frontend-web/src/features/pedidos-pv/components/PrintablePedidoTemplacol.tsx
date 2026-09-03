import React from 'react';
import { TemplexLogo } from '../../../components/ui/TemplexLogo';

interface PrintablePedidoTemplacolProps {
  odp: any;
  pedido: any;
}

const fmtFecha = (ts: string | null) => {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return ts; }
};

// Un cero impreso es ruido: el proveedor puede leerlo como dato real ("0 perforaciones"
// en vez de "sin perforaciones"). Ojo con los campos STRING: "0" es truthy en JS, así que
// `valor || ''` no basta para vaciarlos.
const sinCeros = (val: unknown): string => {
  if (val === null || val === undefined) return '';
  const s = String(val).trim();
  return (s === '' || s === '0') ? '' : s;
};

const PrintablePedidoTemplacol: React.FC<PrintablePedidoTemplacolProps> = ({ odp, pedido }) => {
  // Preferir ítems asignados específicamente a este pedido PV
  const items: any[] = pedido?.items_asignados?.length
    ? pedido.items_asignados
    : odp?.items || odp?.odp_items || [];
  // El formato de Templacol tiene 29 filas de ítem (B16:B44 en la plantilla Excel)
  const rows = Array.from({ length: 29 }, (_, i) => items[i] || null);

  const iniciales = (n: string) => n.trim().split(/\s+/).map((p: string) => p[0] || '').join('').toUpperCase();
  const obra = [odp?.numero_odp, odp?.asesor?.nombre_completo ? iniciales(odp.asesor.nombre_completo) : '']
    .filter(Boolean).join(' — ');

  return (
    <div className="print-root block w-[21.5cm] min-h-[27.9cm] print:min-h-0 bg-white shadow-xl print:shadow-none text-black font-sans mx-auto overflow-hidden print:overflow-visible">
      <style>{`
        .pv-t { width: 100%; border-collapse: collapse; }
        .pv-t td, .pv-t th { border: 1px solid #000; padding: 1px 2px; vertical-align: middle; }
        .pv-t th { font-weight: bold; text-align: center; background-color: #efefef; }
        .pv-bold { font-weight: bold; }
        .pv-center { text-align: center; }
        .pv-outer { border: 2px solid #000 !important; }

        @media print {
          @page { size: letter portrait; margin: 5mm; }
          body, html { margin: 0 !important; padding: 0 !important; }
          .print-root {
            width: 100% !important;
            min-height: unset !important;
            box-shadow: none !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
          }
          .pv-color { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <div className="pv-color" style={{ padding: '6px', fontSize: '7px' }}>

        {/* ── ENCABEZADO ─────────────────────────────────────────────── */}
        <table className="pv-t pv-outer" style={{ marginBottom: '2px' }}>
          <tbody>
            <tr>
              <td rowSpan={2} className="pv-outer" style={{ width: '18%', textAlign: 'center', verticalAlign: 'middle', padding: '4px' }}>
                <div className="flex justify-center">
                  <TemplexLogo className="h-[45px] w-auto" />
                </div>
              </td>
              <td className="pv-outer" style={{ textAlign: 'center', fontWeight: 900, fontSize: '14px', letterSpacing: '1px', verticalAlign: 'middle' }}>
                ORDEN DE PEDIDO TEMPLACOL
              </td>
              <td rowSpan={2} className="pv-outer" style={{ width: '20%', textAlign: 'center', verticalAlign: 'middle', padding: '4px' }}>
                <div style={{ fontSize: '6.5px', fontWeight: 'bold' }}>ORDEN DE PEDIDO (OC) No.</div>
                <div style={{ fontWeight: 900, fontSize: '18px', letterSpacing: '1px' }}>
                  {pedido?.numero_pedido || ''}
                </div>
              </td>
            </tr>
            <tr>
              <td style={{ textAlign: 'center' }}>
                <span className="pv-bold">FECHA :</span> {fmtFecha(pedido?.fecha_envio || null)}
              </td>
            </tr>
          </tbody>
        </table>

        {/* ── SERVICIO ADICIONAL ─────────────────────────────────────── */}
        <table className="pv-t pv-outer" style={{ marginBottom: '2px' }}>
          <tbody>
            <tr>
              <td className="pv-bold" style={{ width: '16%' }}>SERVICIO ADICIONAL</td>
              <td style={{ width: '28%' }}>TEMPLAEXPRESS (+20%)</td>
              <td style={{ width: '28%' }}>SERVICIO DE TEMPLE</td>
              <td>OTRO SERVICIO</td>
            </tr>
          </tbody>
        </table>

        {/* ── DATOS DEL SOLICITANTE ──────────────────────────────────── */}
        <table className="pv-t pv-outer" style={{ marginBottom: '2px' }}>
          <tbody>
            <tr>
              <td className="pv-bold" style={{ width: '18%', whiteSpace: 'nowrap' }}>CLIENTE (Razón Social)</td>
              <td style={{ width: '46%' }}>VIDRIOS TEMPLEX S.A.S.</td>
              <td className="pv-bold" style={{ width: '10%' }}>CC / NIT</td>
              <td>900.192.869</td>
            </tr>
            <tr>
              <td className="pv-bold">DIRECCIÓN Y CIUDAD DE ENTREGA</td>
              <td colSpan={3}>CRA 44 #41-43, MEDELLIN- ANTIOQUIA</td>
            </tr>
            <tr>
              <td className="pv-bold">CONTACTO Y TELÉFONO DE ENTREGA</td>
              <td colSpan={3}>COMPRAS 315-2591660</td>
            </tr>
            <tr>
              <td className="pv-bold">NOMBRE DE OBRA O PROYECTO</td>
              <td colSpan={3}>{obra}</td>
            </tr>
            <tr>
              <td className="pv-bold">LUGAR DEL SELLO</td>
              <td colSpan={3}>
                <span style={{ marginRight: '12px' }}>☐ FRONTAL</span>
                <span style={{ marginRight: '12px' }}>☑ EN EL CANTO</span>
                <span>☐ SEGÚN PLANO</span>
              </td>
            </tr>
            <tr>
              <td className="pv-bold">TIPO DE VIDRIO</td>
              <td colSpan={3}>TEMPLADO</td>
            </tr>
          </tbody>
        </table>

        {/* ── TABLA DE ÍTEMS ─────────────────────────────────────────── */}
        <table className="pv-t pv-outer pv-color" style={{ marginBottom: '2px', fontSize: '6px' }}>
          <thead>
            <tr>
              <th rowSpan={3} style={{ width: '3%' }}>ÍTEM</th>
              <th colSpan={5}>ESPECIFICACIONES DEL VIDRIO</th>
              <th rowSpan={3} style={{ width: '6%' }}>Detalle Técnico (DT) Plano</th>
              <th colSpan={6}>ACABADOS (Metros Lineales)</th>
              <th colSpan={4}>MAQUINADOS (Uds)</th>
              <th rowSpan={3} style={{ width: '13%' }}>OBSERVACIONES ESPECIALES (Según Ítem)</th>
            </tr>
            <tr>
              <th rowSpan={2} style={{ width: '5%' }}>Cantidad</th>
              <th rowSpan={2} style={{ width: '6%' }}>Color</th>
              <th rowSpan={2} style={{ width: '4%' }}>Esp.<br />(mm)</th>
              <th rowSpan={2} style={{ width: '5%' }}>Ancho<br />(mm)</th>
              <th rowSpan={2} style={{ width: '5%' }}>Alto<br />(mm)</th>
              <th colSpan={2}>BPB</th>
              <th colSpan={2}>BPM</th>
              <th colSpan={2}>CHAFLÁN</th>
              <th rowSpan={2} style={{ width: '4%' }}>PERF</th>
              <th rowSpan={2} style={{ width: '4%' }}>BOQ</th>
              <th rowSpan={2} style={{ width: '4%' }}>RADIOS</th>
              <th rowSpan={2} style={{ width: '4%' }}>DSP</th>
            </tr>
            <tr>
              <th>Anchos</th>
              <th>Altos</th>
              <th>Anchos</th>
              <th>Altos</th>
              <th>Anchos</th>
              <th>Altos</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item, i) => (
              <tr key={i} style={{ height: '14px' }}>
                <td className="pv-center">{i + 1}</td>
                <td className="pv-center">{sinCeros(item?.cantidad)}</td>
                <td className="pv-center">
                  {String(item?.color || '').toLowerCase() === 'incoloro' ? 'INC' : (item?.color || '')}
                </td>
                <td className="pv-center">{sinCeros(item?.espesor)}</td>
                <td className="pv-center">{sinCeros(item?.ancho_mm)}</td>
                <td className="pv-center">{sinCeros(item?.alto_mm)}</td>
                <td className="pv-center">{item?.dt || ''}</td>
                {/* BPB: único acabado con origen en el modelo (pulidos / pulidos_h) */}
                <td className="pv-center">{sinCeros(item?.pulidos)}</td>
                <td className="pv-center">{sinCeros(item?.pulidos_h)}</td>
                {/* BPM y CHAFLÁN: sin campo equivalente en ODPItem */}
                <td></td>
                <td></td>
                <td></td>
                <td></td>
                <td className="pv-center">{sinCeros(item?.perforaciones)}</td>
                <td className="pv-center">{sinCeros(item?.boquetes)}</td>
                {/* RADIOS y DSP: sin campo equivalente en ODPItem */}
                <td></td>
                <td></td>
                <td>{item?.observaciones_pv || item?.otros || item?.accesorios || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* ── ENVÍO / LLEGADA ────────────────────────────────────────── */}
        <table className="pv-t pv-outer" style={{ marginBottom: '2px' }}>
          <tbody>
            <tr>
              <td className="pv-bold" style={{ width: '10%' }}>ENVIADO:</td>
              <td style={{ width: '20%' }}>{fmtFecha(pedido?.fecha_envio || null)}</td>
              <td style={{ width: '14%' }}>{pedido?.hora_envio ? String(pedido.hora_envio).substring(0, 5) : ''}</td>
              <td className="pv-bold" style={{ width: '26%' }}>FECHA ESTIMADA DE LLEGADA:</td>
              <td>{fmtFecha(pedido?.fecha_entrega_prometida || null)}</td>
            </tr>
          </tbody>
        </table>

        {/* ── OBSERVACIONES GENERALES ────────────────────────────────── */}
        <div className="pv-outer" style={{ border: '2px solid #000', padding: '3px', marginBottom: '2px', minHeight: '32px' }}>
          <div className="pv-bold">OBSERVACIONES GENERALES:</div>
          {pedido?.observaciones && <div style={{ marginTop: '2px' }}>{pedido.observaciones}</div>}
        </div>

        {/* ── TEXTO LEGAL FIJO DE TEMPLACOL ──────────────────────────── */}
        <div className="pv-outer pv-color" style={{ border: '2px solid #000', padding: '3px', marginBottom: '2px', fontSize: '6.5px', lineHeight: 1.4 }}>
          <div>
            Recuerde consultar los Términos y Condiciones Comerciales de Ventas y de Garantías con nuestro personal
            del proceso comercial o en nuestra página web www.templacol.com
          </div>
          <div>
            Tenga en cuenta que los pedidos enviados después de las 11:00am, se contará como día inicial el siguiente día hábil.
          </div>
        </div>

        {/* ── FIRMAS ─────────────────────────────────────────────────── */}
        <table className="pv-t pv-outer">
          <tbody>
            <tr style={{ height: '34px' }}>
              <td className="pv-center pv-bold" style={{ width: '50%', verticalAlign: 'bottom' }}>
                ELABORADO / APROBADO POR<br />(Cliente)
              </td>
              <td className="pv-center pv-bold" style={{ verticalAlign: 'bottom' }}>
                RECIBIDO / REVISADO POR<br />(Empleado Templacol)
              </td>
            </tr>
          </tbody>
        </table>

      </div>
    </div>
  );
};

export default PrintablePedidoTemplacol;

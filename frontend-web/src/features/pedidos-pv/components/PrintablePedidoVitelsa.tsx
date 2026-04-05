import React from 'react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { TemplexLogo } from '../../../components/ui/TemplexLogo';

interface PrintablePedidoVitelsaProps {
  odp: any;
  pedido: any;
}

const fmtFecha = (fecha: string | null) => {
  if (!fecha) return '';
  try { return format(parseISO(fecha), 'dd/MM/yyyy', { locale: es }); } catch { return fecha; }
};

const fmtFechaHora = (ts: string | null) => {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    return d.toLocaleDateString('es-CO', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  } catch { return ts; }
};

const PrintablePedidoVitelsa: React.FC<PrintablePedidoVitelsaProps> = ({ odp, pedido }) => {
  // Preferir ítems asignados específicamente a este pedido PV
  const items: any[] = (pedido as any)?.items_asignados?.length
    ? (pedido as any).items_asignados
    : odp?.items || odp?.odp_items || [];
  const rows = Array.from({ length: 12 }, (_, i) => items[i] || null);

  return (
    <div className="print-root block w-[21.5cm] min-h-[27.9cm] print:min-h-0 bg-white shadow-xl print:shadow-none text-black font-sans mx-auto overflow-hidden print:overflow-visible">
      <style>{`
        .pv-t { width: 100%; border-collapse: collapse; }
        .pv-t td, .pv-t th { border: 1px solid #000; padding: 2px 4px; vertical-align: middle; }
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

      <div className="pv-color" style={{ padding: '8px', fontSize: '8px' }}>

        {/* ── ENCABEZADO ─────────────────────────────────────────────── */}
        <table className="pv-t pv-outer" style={{ marginBottom: '3px' }}>
          <tbody>
            <tr>
              {/* Logo / emisor */}
              <td
                rowSpan={3}
                className="pv-outer"
                style={{ width: '18%', textAlign: 'center', verticalAlign: 'middle', padding: '6px' }}
              >
                <div className="flex justify-center mb-1">
                  <TemplexLogo className="h-[55px] w-auto" />
                </div>
              </td>

              {/* Título */}
              <td
                colSpan={2}
                className="pv-outer"
                style={{ textAlign: 'center', fontWeight: 900, fontSize: '15px', letterSpacing: '1px', padding: '4px', verticalAlign: 'middle' }}
              >
                ORDEN DE PEDIDO
              </td>

              {/* Número de pedido */}
              <td
                rowSpan={3}
                className="pv-outer"
                style={{ width: '16%', textAlign: 'center', verticalAlign: 'middle', padding: '6px' }}
              >
                <div style={{ fontSize: '7px', fontWeight: 'bold', marginBottom: '2px' }}>ORDEN DE PEDIDO No.</div>
                <div style={{ fontWeight: 900, fontSize: '20px', letterSpacing: '1px' }}>
                  {pedido?.numero_pedido || ''}
                </div>
              </td>
            </tr>
            <tr>
              <td className="pv-center" style={{ width: '8%', fontWeight: 'bold' }}>VR03</td>
              <td style={{ fontSize: '7px', color: '#555' }}>
                FECHA DE VIGENCIA: 8 De Mayo Del 2023 &nbsp;&nbsp;&nbsp; VERSION: 03
              </td>
            </tr>
            <tr>
              <td colSpan={2} style={{ fontSize: '7px', color: '#555' }}>
                Formulario de pedido de vidrio templado — VITELSA S.A.
              </td>
            </tr>
          </tbody>
        </table>

        {/* ── FECHA Y NÚMERO ─────────────────────────────────────────── */}
        <table className="pv-t pv-outer" style={{ marginBottom: '3px' }}>
          <tbody>
            <tr>
              <td className="pv-bold" style={{ width: '8%', whiteSpace: 'nowrap' }}>FECHA :</td>
              <td style={{ width: '22%' }}>{fmtFechaHora(pedido?.creado_en || null)}</td>
              <td className="pv-bold" style={{ width: '18%', whiteSpace: 'nowrap' }}>ORDEN DE PEDIDO No.</td>
              <td style={{ fontWeight: 900, fontSize: '11px' }}>{pedido?.numero_pedido || ''}</td>
            </tr>
          </tbody>
        </table>

        {/* ── TIPO DE PEDIDO ─────────────────────────────────────────── */}
        <table className="pv-t pv-outer" style={{ marginBottom: '3px' }}>
          <tbody>
            <tr>
              <td className="pv-bold" style={{ width: '8%' }}>PEDIDO</td>
              <td className="pv-center" style={{ width: '4%', fontSize: '11px' }}>☑</td>
              <td style={{ width: '20%' }}>SERVICIO DE TEMPLE</td>
              <td style={{ width: '20%' }}>SERVIFLASH (+20%)</td>
              <td style={{ width: '48%' }}></td>
            </tr>
            <tr>
              <td colSpan={2}></td>
              <td colSpan={3} style={{ color: '#333' }}>Servicios Adicionales</td>
            </tr>
            <tr>
              <td colSpan={2}></td>
              <td colSpan={3}><span className="pv-bold">CUALES:</span></td>
            </tr>
          </tbody>
        </table>

        {/* ── DATOS DEL SOLICITANTE ──────────────────────────────────── */}
        <table className="pv-t pv-outer" style={{ marginBottom: '3px' }}>
          <tbody>
            <tr>
              <td className="pv-bold" style={{ width: '16%', whiteSpace: 'nowrap' }}>NOMBRE O RAZÓN SOCIAL:</td>
              <td style={{ width: '36%' }}>VIDRIOS TEMPLEX S.A.S</td>
              <td className="pv-bold" style={{ width: '10%', whiteSpace: 'nowrap' }}>CC / NIT :</td>
              <td>900.192.869-0</td>
            </tr>
            <tr>
              <td className="pv-bold">DIRECCIÓN :</td>
              <td>CR 44 No. 41 43</td>
              <td className="pv-bold">CIUDAD :</td>
              <td>MEDELLÍN</td>
            </tr>
            <tr>
              <td colSpan={2}>
                <span className="pv-bold" style={{ marginRight: '6px' }}>RÉGIMEN :</span>
                <span style={{ marginRight: '8px' }}>☑ COMÚN</span>
                <span style={{ marginRight: '8px' }}>☐ GRANDES CONTRIB.</span>
                <span>☐ SIMPLIFICADO</span>
              </td>
              <td className="pv-bold">TELÉFONO :</td>
              <td>448 86 56</td>
            </tr>
          </tbody>
        </table>

        {/* ── DIRECCIÓN DE ENVÍO + OBRA ──────────────────────────────── */}
        <table className="pv-t pv-outer" style={{ marginBottom: '3px' }}>
          <tbody>
            <tr>
              <td className="pv-bold" style={{ width: '16%', whiteSpace: 'nowrap' }}>DIRECCIÓN DE ENVÍO</td>
              <td style={{ width: '36%' }}>CR 44 No. 41 43</td>
              <td className="pv-bold" style={{ width: '6%' }}>OBRA</td>
              <td>
                {odp?.cliente?.nombre_razon_social || ''}
                {odp?.numero_odp ? <span style={{ marginLeft: '6px', color: '#555' }}>— {odp.numero_odp}</span> : ''}
                {odp?.asesor?.nombre_completo ? <span style={{ marginLeft: '6px', color: '#555' }}>— {odp.asesor.nombre_completo}</span> : ''}
              </td>
            </tr>
          </tbody>
        </table>

        {/* ── TABLA DE ÍTEMS ─────────────────────────────────────────── */}
        <table className="pv-t pv-outer pv-color" style={{ marginBottom: '3px', fontSize: '7px' }}>
          <thead>
            <tr>
              <th rowSpan={2} style={{ width: '3%' }}>ÍTEM</th>
              <th rowSpan={2} style={{ width: '7%' }}>COLOR</th>
              <th rowSpan={2} style={{ width: '4%' }}>ESP<br />(mm)</th>
              <th rowSpan={2} style={{ width: '4%' }}>CANT.</th>
              <th colSpan={2} style={{ width: '10%' }}>MEDIDAS</th>
              <th rowSpan={2} style={{ width: '3%' }}>DT</th>
              <th rowSpan={2} style={{ width: '3%' }}>PER</th>
              <th rowSpan={2} style={{ width: '3%' }}>BOQ</th>
              <th rowSpan={2} style={{ width: '3%' }}>DES</th>
              <th colSpan={2} style={{ width: '6%' }}>BPB</th>
              <th colSpan={2} style={{ width: '6%' }}>BP MATE</th>
              <th colSpan={2} style={{ width: '6%' }}>CHAFLÁN</th>
              <th rowSpan={2}>ESPECIFICACIONES ESPECIALES</th>
            </tr>
            <tr>
              <th>ANCHO (A)</th>
              <th>ALTO (H)</th>
              <th>ANCHO</th>
              <th>ALTO</th>
              <th>ANCHO</th>
              <th>ALTO</th>
              <th>ANCHO</th>
              <th>ALTO</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item, i) => (
              <tr key={i} style={{ height: '18px' }}>
                <td className="pv-center">{i + 1}</td>
                <td>{item?.color || ''}</td>
                <td className="pv-center">{item?.espesor || ''}</td>
                <td className="pv-center">{item?.cantidad || ''}</td>
                <td className="pv-center">{item?.ancho_mm || ''}</td>
                <td className="pv-center">{item?.alto_mm || ''}</td>
                {/* DT: Doble Templado / tipo especial */}
                <td className="pv-center">{item?.dt ? item.dt : ''}</td>
                {/* PER: Perforaciones */}
                <td className="pv-center">{item?.perforaciones ? item.perforaciones : ''}</td>
                {/* BOQ: Boquetes */}
                <td className="pv-center">{item?.boquetes ? item.boquetes : ''}</td>
                {/* DES: Descuentos */}
                <td className="pv-center">{item?.descuentos || ''}</td>
                {/* BPB Ancho/Alto: Borde Pulido Biselado */}
                <td className="pv-center">{item?.pulidos || ''}</td>
                <td className="pv-center">{item?.pulidos_h || ''}</td>
                {/* BP MATE Ancho/Alto */}
                <td className="pv-center"></td>
                <td className="pv-center"></td>
                {/* CHAFLÁN: no hay campo directo en el modelo */}
                <td></td>
                <td></td>
                {/* ESPECIFICACIONES ESPECIALES */}
                <td>{item?.observaciones_pv || item?.otros || item?.accesorios || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* ── OBSERVACIONES (texto legal fijo de VITELSA) ────────────── */}
        <div
          className="pv-outer pv-color"
          style={{ border: '2px solid #000', padding: '4px', marginBottom: '3px', fontSize: '6.5px', lineHeight: 1.4 }}
        >
          <div className="pv-bold" style={{ marginBottom: '2px' }}>OBSERVACIONES:</div>
          <div>
            * EXPRESAMENTE AUTORIZO A VITELSA S.A., PARA QUE OBTENGA LAS INFORMACIONES Y REFERENCIAS RELATIVAS A MI PERSONA, MIS NOMBRES, APELLIDOS
            Y DOCUMENTO DE IDENTIFICACIÓN, A MI COMPORTAMIENTO Y CRÉDITO COMERCIAL, HÁBITOS DE PAGO, MANEJO DE MI(S) CUENTA(S) CORRIENTE(S) BANCARIA
            Y EN GENERAL, CUMPLIMIENTO DE OBLIGACIONES. ADEMÁS AUTORIZAMOS IRREVOCABLEMENTE PARA QUE EN EL EVENTO QUE INCUMPLAMOS UNA O CUALQUIERA
            DE LAS OBLIGACIONES CONTRAIDAS O QUE SE LLEGAREN A CONTRAER, NUESTROS NOMBRES, APELLIDOS Y DOCUMENTO DE IDENTIFICACIÓN, SE INCORPOREN A LOS
            ARCHIVOS DE DEUDORES MOROSOS DE LA ASOCIACIÓN BANCARIA O CUALQUIER OTRA ENTIDAD SIMILAR. EXHONERAMOS DE TODA RESPONSABILIDAD POR LA INCLUSIÓN
            DE TALES DATOS A VITELA S.A., ASÍ COMO LA ENTIDAD QUE PRODUZCA EL CORRESPONDIENTE ARCHIVO.
          </div>
          <div style={{ marginTop: '2px' }}>
            * PARA LOS PEDIDOS ENVIADOS A PRODUCCIÓN DESPUÉS DE LAS 11:00 M, SE CONSIDERA COMO DÍA INICIAL EL SIGUIENTE DÍA HÁBIL.
          </div>
          <div>* EL PLAZO DE ENTREGA PARA EL SERVIFLASH ES DE 24 HORAS HÁBILES DE LUNES A VIERNES.</div>
          <div>
            * LA FORMA DE PAGO DEL SERVIFLASH ES 100% ANTICIPADO, CONSIGNAR EN LAS SIGUIENTES CUENTAS A NOMBRE DE VITELSA S.A.:{' '}
            BOGOTÁ CUENTA CORRIENTE CONVENIO 8830 N° CUENTA 349-283-465 &nbsp;·&nbsp;
            BANCOLOMBIA CUENTA AHORROS N° 102-025445-95 CONVENIO 18853 &nbsp;·&nbsp;
            BANCOLOMBIA CUENTA CORRIENTE N° 625-118-251-07 CONVENIO 18771.
          </div>
          {pedido?.observaciones && (
            <div style={{ marginTop: '3px', fontWeight: 'bold', fontSize: '7px', borderTop: '1px solid #ccc', paddingTop: '2px' }}>
              OBSERVACIONES DEL PEDIDO: {pedido.observaciones}
            </div>
          )}
        </div>

        {/* ── FOOTER ─────────────────────────────────────────────────── */}
        <div style={{ textAlign: 'center', fontSize: '7px', borderTop: '1px solid #000', paddingTop: '2px', color: '#333' }}>
          VITELSA S.A — GIRARDOTA PARQUE INDUSTRIAL DEL NORTE: 444-92-69 — WEB www.vitelsa.com.co
        </div>

      </div>
    </div>
  );
};

export default PrintablePedidoVitelsa;

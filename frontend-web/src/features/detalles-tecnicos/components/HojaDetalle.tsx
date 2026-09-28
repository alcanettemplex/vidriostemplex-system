import { conteosDe } from '../modelo/geometria';
import type { Pedido, Pieza, Plano } from '../modelo/tipos';
import { PlanoEditable } from './PlanoEditable';
import { PlanoSVG } from './PlanoSVG';
import { fechaLarga, LOGO_DETALLE_TECNICO, PIE_FORMATO } from '../modelo/formato';

const celda: React.CSSProperties = { border: '1px solid #000', padding: '3px 6px', fontSize: 11 };

interface Props {
  pedido: Pedido;
  plano: Plano;
  letra: string;
  resaltarId?: string | null;
  /** Si viene, el plano se puede seleccionar y arrastrar. */
  edicion?: {
    seleccionId: string | null;
    onSeleccionar: (id: string | null) => void;
    onCambiarPieza: (fn: (p: Pieza) => Pieza, clave: string) => void;
  };
}

/** Vista previa de la hoja impresa: mismo formato FOR-005 que el Excel original. */
export function HojaDetalle({ pedido, plano, letra, resaltarId, edicion }: Props) {
  const c = conteosDe(plano.pieza);
  return (
    <div
      className="hoja-imprimible"
      style={{
        width: '100%',
        maxWidth: 780,
        aspectRatio: '8.5 / 11',
        background: '#fff',
        color: '#000',
        boxShadow: '0 2px 12px rgba(0,0,0,.18)',
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'Arial, sans-serif',
        margin: '0 auto',
      }}
    >
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          <tr>
            <td style={{ ...celda, width: '34%', textAlign: 'center' }} rowSpan={2}>
              <img src={LOGO_DETALLE_TECNICO} alt="Vidrios Templex" style={{ height: 48 }} />
            </td>
            <td style={{ ...celda, fontSize: 24, textAlign: 'center' }} colSpan={2}>
              DETALLE TÉCNICO
            </td>
          </tr>
          <tr>
            <td style={{ ...celda }}>DETALLE PARA PEDIDO / COMPRA N°</td>
            <td style={{ ...celda, fontWeight: 700, color: '#c00', textAlign: 'center', width: '22%' }}>{pedido.numero}</td>
          </tr>
          <tr>
            <td style={{ ...celda, fontWeight: 700 }}>CLIENTE: VIDRIOS TEMPLEX S.A.S</td>
            <td style={celda}>FECHA</td>
            <td style={{ ...celda, textAlign: 'center' }}>{fechaLarga(pedido.fecha)}</td>
          </tr>
          <tr>
            <td style={celda}>
              PROVEEDOR: <b>{pedido.proveedor}</b> · ODP: <b>{pedido.odp || '—'}</b>
            </td>
            <td style={celda}>OBRA / CLIENTE FINAL: {pedido.obra || pedido.cliente || '—'}</td>
            <td style={{ ...celda, fontWeight: 700, fontSize: 14, textAlign: 'center' }}>PLANO {letra}</td>
          </tr>
        </tbody>
      </table>

      <div style={{ flex: 1, minHeight: 0, border: '1px solid #000', borderTop: 'none', padding: 8 }}>
        {edicion ? (
          <PlanoEditable
            pieza={plano.pieza}
            selloEnCanto={plano.selloEnCanto}
            resaltarId={resaltarId ?? null}
            seleccionId={edicion.seleccionId}
            onSeleccionar={edicion.onSeleccionar}
            onCambiarPieza={edicion.onCambiarPieza}
          />
        ) : (
          <PlanoSVG pieza={plano.pieza} selloEnCanto={plano.selloEnCanto} resaltarId={resaltarId} />
        )}
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6, textAlign: 'center' }}>
        <thead>
          <tr style={{ background: '#efefef' }}>
            {['CANT.', 'COLOR', 'ESP. (mm)', 'ANCHO', 'ALTO', 'PERF', 'BOQ', 'DSP', 'RADIOS', 'CHAFLÁN'].map((h) => (
              <th key={h} style={{ ...celda, fontSize: 10 }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {[plano.cantidad, plano.color, plano.espesor, plano.pieza.ancho, plano.pieza.alto, c.perf, c.boq, c.dsp, c.radios, c.chaflanMl ? `${c.chaflanMl.toFixed(2)} ml` : ''].map((v, i) => (
              <td key={i} style={celda}>
                {v === 0 ? '' : v}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      {plano.observaciones && <div style={{ ...celda, marginTop: 4 }}>OBSERVACIONES: {plano.observaciones}</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 8, fontSize: 11 }}>
        <span>
          ASESOR: <b>{pedido.asesor}</b>
        </span>
        <span style={{ fontSize: 9, borderTop: '1px solid #000', paddingTop: 2 }}>{PIE_FORMATO}</span>
      </div>
    </div>
  );
}

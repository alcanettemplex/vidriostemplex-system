import { conteosDe } from '../modelo/geometria';
import type { Pieza, Plano } from '../modelo/tipos';
import { PlanoEditable } from './PlanoEditable';
import { PlanoSVG } from './PlanoSVG';
import { fechaLarga, LOGO_DETALLE_TECNICO, PIE_FORMATO } from '../modelo/formato';

const celda: React.CSSProperties = { border: '1px solid #000', padding: '3px 6px', fontSize: 11 };

/** Datos del encabezado FOR-005. En modo pedido salen del Pedido PV y de su ODP. */
export interface EncabezadoHoja {
  numero: string;
  /** Día de calendario 'YYYY-MM-DD'. */
  fecha: string;
  proveedor: string;
  odp: string;
  /** Modo pedido: «ODP — iniciales del asesor», igual que el formulario oficial. */
  obra: string;
  asesor: string;
}

/** Una fila de la tabla de datos: un vidrio. En modo pedido, cada vidrio con esta letra DT. */
export interface FilaVidrio {
  cantidad: number | string;
  color: string;
  espesor: string;
  ancho: number | string;
  alto: number | string;
}

interface Props {
  encabezado: EncabezadoHoja;
  plano: Plano;
  letra: string;
  filas: FilaVidrio[];
  resaltarId?: string | null;
  /** Si viene, el plano se puede seleccionar y arrastrar. */
  edicion?: {
    seleccionId: string | null;
    onSeleccionar: (id: string | null) => void;
    onCambiarPieza: (fn: (p: Pieza) => Pieza, clave: string) => void;
  };
}

/** Estilos de la hoja en la ventana de impresión: una hoja carta por plano, sin la sombra de
 *  pantalla. La altura fija reemplaza el `aspect-ratio` de pantalla, que con los márgenes
 *  de la página desbordaba y dejaba una segunda hoja en blanco. */
export const ESTILOS_HOJA_IMPRESA = `
.hoja-imprimible { box-shadow: none !important; max-width: none !important; aspect-ratio: auto !important;
  height: 255mm !important; padding: 0 !important; box-sizing: border-box; break-after: page; page-break-after: always; }
.hoja-imprimible:last-child { break-after: auto; page-break-after: auto; }
`;

/** Vista previa de la hoja impresa: mismo formato FOR-005 que el Excel. */
export function HojaDetalle({ encabezado, plano, letra, filas, resaltarId, edicion }: Props) {
  const c = conteosDe(plano.pieza);
  const observaciones = [plano.selloEnCanto ? 'SELLO EN EL CANTO' : '', plano.observaciones].filter(Boolean).join(' · ');
  const conteos = [c.perf, c.boq, c.dsp, c.radios, c.chaflanMl ? `${c.chaflanMl.toFixed(2)} ml` : ''];
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
            <td style={{ ...celda, fontWeight: 700, color: '#c00', textAlign: 'center', width: '22%' }}>{encabezado.numero}</td>
          </tr>
          <tr>
            <td style={{ ...celda, fontWeight: 700 }}>CLIENTE: VIDRIOS TEMPLEX S.A.S</td>
            <td style={celda}>FECHA</td>
            <td style={{ ...celda, textAlign: 'center' }}>{fechaLarga(encabezado.fecha)}</td>
          </tr>
          <tr>
            <td style={celda}>
              PROVEEDOR: <b>{encabezado.proveedor}</b> · ODP: <b>{encabezado.odp || '—'}</b>
            </td>
            <td style={celda}>OBRA: {encabezado.obra || '—'}</td>
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
          {filas.map((f, k) => (
            <tr key={k}>
              {[f.cantidad, f.color, f.espesor, f.ancho, f.alto, ...conteos].map((v, i) => (
                <td key={i} style={celda}>
                  {v === 0 || v === '0' ? '' : v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {observaciones && <div style={{ ...celda, marginTop: 4 }}>OBSERVACIONES: {observaciones}</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 8, fontSize: 11 }}>
        <span>
          ASESOR: <b>{encabezado.asesor}</b>
        </span>
        <span style={{ fontSize: 9, borderTop: '1px solid #000', paddingTop: 2 }}>{PIE_FORMATO}</span>
      </div>
    </div>
  );
}

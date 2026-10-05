// Hoja de Ruta impresa: el papel que se lleva el equipo de instalación para el día.
// Una ruta sola (desde su tarjeta) o todas las rutas de un equipo en un día (vista
// "Por equipo"). Sin valores en pesos —el mismo criterio con el que se retiró
// PrintableOP—: el pago se indica solo como estado (Pagado / Crédito / Pendiente…).

import { abrirVentanaImpresion, escaparHtml } from '../../../utils/printWindow';
import { fmtDia, fmtMomento } from '../../../utils/fechas';
import { estadoFactura, estadoPago, tipoServicio } from './estadoInstalacion';

const MAX_DESCRIPCION = 180;

const e = (v: unknown): string => escaparHtml(v == null ? '' : String(v));

const recortar = (texto: string | null | undefined): string => {
  const limpio = (texto ?? '').replace(/\s+/g, ' ').trim();
  return limpio.length > MAX_DESCRIPCION ? `${limpio.slice(0, MAX_DESCRIPCION)}…` : limpio;
};

const nombres = (lista: { nombre_completo?: string }[] | null | undefined): string[] =>
  (lista ?? []).map((p) => p.nombre_completo ?? '').filter(Boolean);

/**
 * @param rutas   Rutas a imprimir (sus paradas vivas, en orden).
 * @param fecha   Día de la hoja (`YYYY-MM-DD`); solo se imprimen paradas de ese día.
 *                `null` = todas las paradas pendientes de las rutas.
 */
export const imprimirHojaRuta = (rutas: any[], fecha: string | null): void => {
  const paradas = rutas.flatMap((r) =>
    (r.ruta_odps ?? [])
      .filter((ro: any) => ro.estado === 'pendiente' || ro.estado === 'en_curso')
      .filter((ro: any) => !fecha || String(ro.fecha_programada).slice(0, 10) === fecha)
      .map((ro: any) => ({ ruta: r, ro }))
  );

  const oficiales = Array.from(new Set(rutas.map((r) => r.oficial?.nombre_completo).filter(Boolean)));
  const instaladores = Array.from(new Set(rutas.flatMap((r) => nombres(r.instaladores)))).filter((n) => !oficiales.includes(n));
  const conductores = Array.from(new Set(rutas.map((r) => r.conductor?.nombre_completo).filter(Boolean)));
  const vehiculos = Array.from(new Set(rutas.map((r) => (r.vehiculo ? `${r.vehiculo.tipo ?? ''} ${r.vehiculo.placa ?? ''}`.trim() : null)).filter(Boolean)));
  const numerosRuta = rutas.map((r) => `#${r.id}`).join(', ');
  const observaciones = rutas.map((r) => r.observaciones).filter(Boolean);

  const filas = paradas.map(({ ruta, ro }, i) => {
    const odp = ro.odp ?? {};
    const pago = estadoPago(odp);
    const factura = estadoFactura(odp);
    const contacto = [odp.nombre_recibe, odp.telefono_recibe].filter(Boolean).join(' · ')
      || [odp.cliente?.nombre_razon_social, odp.cliente?.telefono].filter(Boolean).join(' · ');
    return `
      <tr>
        <td class="c">${i + 1}</td>
        <td><b>${e(odp.numero_odp)}</b><br/><span class="sm">${e(odp.cliente?.nombre_razon_social)}</span>${rutas.length > 1 ? `<br/><span class="sm">Ruta #${e(ruta.id)}</span>` : ''}</td>
        <td>${e(odp.direccion_instalacion) || '<span class="sm">Sin dirección</span>'}</td>
        <td>${e(contacto) || '—'}</td>
        <td>${e(tipoServicio(odp).label)}</td>
        <td>${e(pago.label)}${factura && factura.tono !== 'ok' ? `<br/><span class="sm">${e(factura.label)}</span>` : ''}</td>
        <td class="sm">${e(recortar(odp.descripcion_pedido))}</td>
        <td></td>
        <td></td>
      </tr>`;
  }).join('');

  const tituloFecha = fecha ? fmtDia(fecha, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }) : 'Paradas pendientes';

  const html = `
    <div class="hoja">
      <div class="cab">
        <img src="/assets/images/logotemplex.png" alt="Vidrios Templex" class="logo"/>
        <div>
          <h1>Hoja de Ruta</h1>
          <p class="fecha">${e(tituloFecha)}</p>
        </div>
        <div class="der sm">Ruta${rutas.length > 1 ? 's' : ''} ${e(numerosRuta)}<br/>Impresa ${e(fmtMomento(new Date(), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }))}</div>
      </div>
      <table class="equipo">
        <tr>
          <td><b>Oficial:</b> ${e(oficiales.join(', ') || '—')}</td>
          <td><b>Instaladores:</b> ${e(instaladores.join(', ') || '—')}</td>
          <td><b>Conductor:</b> ${e(conductores.join(', ') || 'Sin conductor')}</td>
          <td><b>Vehículo:</b> ${e(vehiculos.join(', ') || '—')}</td>
        </tr>
      </table>
      <table class="paradas">
        <thead>
          <tr>
            <th style="width:3%">#</th>
            <th style="width:13%">ODP / Cliente</th>
            <th style="width:17%">Dirección</th>
            <th style="width:13%">Contacto en obra</th>
            <th style="width:9%">Servicio</th>
            <th style="width:8%">Pago</th>
            <th>Descripción</th>
            <th style="width:8%">Llegada / salida</th>
            <th style="width:12%">Recibe (nombre y firma)</th>
          </tr>
        </thead>
        <tbody>${filas || '<tr><td colspan="9" class="c">No hay paradas pendientes para este día.</td></tr>'}</tbody>
      </table>
      ${observaciones.length ? `<p class="obs"><b>Observaciones:</b> ${observaciones.map(e).join(' · ')}</p>` : ''}
    </div>`;

  abrirVentanaImpresion({
    titulo: `Hoja de Ruta ${fecha ?? ''} ${oficiales[0] ?? ''}`.trim(),
    contenidoHtml: html,
    ancho: 1100,
    alto: 800,
    estilos: `
      @page { size: letter landscape; margin: 8mm; }
      .hoja { font-size: 11px; color: #000; }
      .cab { display: flex; align-items: center; gap: 14px; border-bottom: 2px solid #000; padding-bottom: 6px; margin-bottom: 8px; }
      .logo { height: 38px; }
      h1 { font-size: 18px; margin: 0; }
      .fecha { margin: 2px 0 0; font-size: 13px; text-transform: capitalize; }
      .der { margin-left: auto; text-align: right; }
      .sm { font-size: 10px; color: #333; }
      table { width: 100%; border-collapse: collapse; }
      .equipo td { padding: 4px 6px; border: 1px solid #000; }
      .equipo { margin-bottom: 8px; }
      .paradas th, .paradas td { border: 1px solid #000; padding: 4px; vertical-align: top; }
      .paradas th { background: #eee; font-size: 10px; text-transform: uppercase; }
      .paradas tr { page-break-inside: avoid; height: 42px; }
      .c { text-align: center; }
      .obs { margin-top: 8px; }
    `,
  });
};

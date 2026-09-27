import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import API from '../../../../services/config';
import type { DatosPanelCotizaciones, FiltrosCotizaciones } from './tipos';
import { hoyISO } from './formato';

const URL_PANEL = `${API}/api/dashboard/cotizaciones`;

export const filtrosIniciales = (): FiltrosCotizaciones => {
  const hoy = hoyISO();
  return {
    desde: `${hoy.slice(0, 4)}-01-01`,
    hasta: hoy,
    asesorId: '',
    cliente: '',
    estado: '',
    montoMin: '',
    montoMax: '',
    segmento: '',
    producto: '',
  };
};

/** Query params sin los vacíos (el backend valida con Zod `.strict()`). */
export function aParams(f: FiltrosCotizaciones): Record<string, string> {
  const p: Record<string, string> = {
    desde: f.desde,
    hasta: f.hasta,
    asesor_id: f.asesorId,
    cliente: f.cliente.trim(),
    estado: f.estado,
    monto_min: f.montoMin,
    monto_max: f.montoMax,
    segmento: f.segmento,
    producto: f.producto,
  };
  return Object.fromEntries(Object.entries(p).filter(([, v]) => v !== ''));
}

/** Mensaje legible de un error de Axios, también cuando la respuesta es un Blob. */
async function mensajeDeError(err: unknown, porDefecto: string): Promise<string> {
  if (axios.isAxiosError(err)) {
    const data: unknown = err.response?.data;
    if (data instanceof Blob) {
      try {
        const j = JSON.parse(await data.text()) as { error?: string };
        if (j.error) return j.error;
      } catch { /* respuesta no JSON */ }
    } else if (data && typeof data === 'object' && 'error' in data && typeof (data as { error: unknown }).error === 'string') {
      return (data as { error: string }).error;
    }
    if (!err.response) return 'No hay conexión con el servidor. Revisa tu red e inténtalo de nuevo.';
  }
  return porDefecto;
}

export function useCotizacionesDashboard(filtros: FiltrosCotizaciones) {
  const [datos, setDatos] = useState<DatosPanelCotizaciones | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [descargando, setDescargando] = useState(false);
  const ultima = useRef(0);

  // Texto y montos se escriben tecla a tecla: se espera a que el usuario pare.
  const [debounced, setDebounced] = useState(filtros);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(filtros), 400);
    return () => clearTimeout(t);
  }, [filtros]);

  const cargar = useCallback(async (f: FiltrosCotizaciones) => {
    const turno = ++ultima.current;
    setCargando(true);
    setError(null);
    try {
      const res = await axios.get<DatosPanelCotizaciones>(URL_PANEL, { params: aParams(f) });
      if (turno === ultima.current) setDatos(res.data);
    } catch (err) {
      const msg = await mensajeDeError(err, 'No se pudo cargar el tablero de cotizaciones. Intenta de nuevo en un momento.');
      if (turno === ultima.current) setError(msg);
    } finally {
      if (turno === ultima.current) setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(debounced); }, [debounced, cargar]);

  const descargarExcel = useCallback(async () => {
    setDescargando(true);
    setError(null);
    try {
      const res = await axios.get<Blob>(`${URL_PANEL}/excel`, { params: aParams(filtros), responseType: 'blob' });
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Cotizaciones ${filtros.desde} a ${filtros.hasta}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(await mensajeDeError(err, 'No se pudo generar el Excel. Intenta de nuevo en un momento.'));
    } finally {
      setDescargando(false);
    }
  }, [filtros]);

  return { datos, cargando, error, recargar: () => cargar(filtros), descargarExcel, descargando };
}

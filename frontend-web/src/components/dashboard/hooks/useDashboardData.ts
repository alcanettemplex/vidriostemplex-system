import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

export interface PeriodParams {
  mesInicio:  number;
  anioInicio: number;
  mesFin:     number;
  anioFin:    number;
}

interface DashboardData {
  general:    any | null;
  ventas:     any | null;
  produccion: any | null;
  equipo:     any | null;
  alertas:    any[];
  loading: {
    general:    boolean;
    ventas:     boolean;
    produccion: boolean;
    equipo:     boolean;
    alertas:    boolean;
  };
  error:   string | null;
  refetch: () => void;
}

export const useDashboardData = (period: PeriodParams): DashboardData => {
  const [data, setData] = useState<Partial<DashboardData>>({
    general: null, ventas: null, produccion: null, equipo: null, alertas: [],
  });
  const [loading, setLoading] = useState({
    general: true, ventas: true, produccion: true, equipo: true, alertas: true,
  });
  const [error, setError] = useState<string | null>(null);

  const fetchSection = useCallback(async (section: keyof typeof loading, params: PeriodParams) => {
    setLoading(prev => ({ ...prev, [section]: true }));
    try {
      const token = localStorage.getItem('token');
      const qs    = new URLSearchParams({
        mes_inicio:  String(params.mesInicio),
        anio_inicio: String(params.anioInicio),
        mes_fin:     String(params.mesFin),
        anio_fin:    String(params.anioFin),
      });
      const url = `${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api/dashboard/${section}?${qs}`;
      const res = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
      setData(prev => ({ ...prev, [section]: res.data }));
    } catch (err: any) {
      console.error(`Error fetching dashboard/${section}:`, err);
    } finally {
      setLoading(prev => ({ ...prev, [section]: false }));
    }
  }, []);

  const fetchAll = useCallback(async () => {
    setError(null);
    try {
      await Promise.allSettled([
        fetchSection('general',    period),
        fetchSection('ventas',     period),
        fetchSection('produccion', period),
        fetchSection('equipo',     period),
        fetchSection('alertas',    period),
      ]);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error de conexión al cargar el dashboard');
    }
  }, [fetchSection, period.mesInicio, period.anioInicio, period.mesFin, period.anioFin]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  return {
    ...data as { general: any; ventas: any; produccion: any; equipo: any; alertas: any[] },
    loading,
    error,
    refetch: fetchAll,
  };
};

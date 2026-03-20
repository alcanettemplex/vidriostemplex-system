import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';

interface DashboardData {
  general: any | null;
  ventas: any | null;
  produccion: any | null;
  equipo: any | null;
  alertas: any[];
  loading: {
    general: boolean;
    ventas: boolean;
    produccion: boolean;
    equipo: boolean;
    alertas: boolean;
  };
  error: string | null;
  refetch: () => void;
}

export const useDashboardData = (): DashboardData => {
  const [data, setData] = useState<Partial<DashboardData>>({
    general: null,
    ventas: null,
    produccion: null,
    equipo: null,
    alertas: [],
  });

  const [loading, setLoading] = useState({
    general: true,
    ventas: true,
    produccion: true,
    equipo: true,
    alertas: true,
  });

  const [error, setError] = useState<string | null>(null);
  
  // Guardamos las referencias para evitar closures rancios en el refetch
  const dataRef = useRef(data);
  const loadingRef = useRef(loading);

  useEffect(() => {
    dataRef.current = data;
    loadingRef.current = loading;
  }, [data, loading]);

  const fetchSection = async (section: keyof typeof loading) => {
    setLoading(prev => ({ ...prev, [section]: true }));
    try {
      const token = localStorage.getItem('token');
      const url = `${process.env.REACT_APP_API_URL || "http://localhost:3001"}/api/dashboard/${section}`;
      const res = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setData(prev => ({ ...prev, [section]: res.data }));
    } catch (err: any) {
      console.error(`Error fetching ${section}:`, err);
      // No rompemos todo el dashboard por una sección
      // Pero podríamos establecer un estado de error local si quisiéramos
    } finally {
      setLoading(prev => ({ ...prev, [section]: false }));
    }
  };

  const fetchAll = useCallback(async () => {
    setError(null);
    try {
      // Promise.allSettled permite que si una falla, las demás sigan
      await Promise.allSettled([
        fetchSection('general'),
        fetchSection('ventas'),
        fetchSection('produccion'),
        fetchSection('equipo'),
        fetchSection('alertas'),
      ]);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error de conexión al cargar el dashboard');
    }
  }, []);

  useEffect(() => {
    fetchAll();

    // Refetch automático cada 5 minutos
    const interval = setInterval(() => {
      fetchAll();
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [fetchAll]);

  return {
    ...data as { general: any, ventas: any, produccion: any, equipo: any, alertas: any[] },
    loading,
    error,
    refetch: fetchAll
  };
};

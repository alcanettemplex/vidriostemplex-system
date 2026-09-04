import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import API from '../../../services/config';

/**
 * Búsqueda transversal del módulo Proveedores.
 *
 * Lo usan la barra única de la página y el autocompletado de Consultar Precios,
 * para que ambos entiendan exactamente lo mismo: si mañana el buscador aprende a
 * reconocer algo nuevo, lo aprenden los dos a la vez.
 *
 * Tres cuidados que hacen que teclear no castigue la base de datos:
 *  · Mínimo de caracteres antes de consultar — dos letras traen media tabla.
 *  · Espera a que el usuario deje de escribir (300 ms).
 *  · Cancela la consulta anterior: sin esto, una respuesta lenta de "vid" puede
 *    llegar después de la de "vidrio" y pisar en pantalla el resultado correcto.
 */

export const MIN_CARACTERES = 3;

export interface MotivoCoincidencia {
  tipo: 'CODIGO' | 'CODIGO_PROVEEDOR' | 'ALIAS' | 'NOMBRE';
  detalle: string | null;
}

export interface ProductoSugerido {
  id: number;
  codigo: string;
  nombre: string;
  unidad_medida: string | null;
  total_proveedores: number;
  precio_min: number | null;
  unidad_precio_min: string | null;
  motivo: MotivoCoincidencia;
}

export interface ProveedorSugerido {
  id: number;
  nombre_comercial: string;
  nit: string | null;
  seguir_precios: boolean;
  total_equivalencias: number;
}

export interface PendienteSugerido {
  id: number;
  proveedor_id: number;
  codigo_proveedor: string;
  descripcion_proveedor: string | null;
  precio_detectado: number | null;
  veces_visto: number;
  unidad_detectada: string | null;
  proveedor?: { id: number; nombre_comercial: string } | null;
}

export interface EquivalenciaSugerida {
  id: number;
  codigo_proveedor: string;
  descripcion_proveedor: string | null;
  unidad_compra: string;
  precio_actual: number | null;
  fecha_precio_actual: string | null;
  proveedor?: { id: number; nombre_comercial: string } | null;
  producto?: { id: number; codigo: string; nombre: string } | null;
}

export interface FacturaSugerida {
  id: number;
  numero_factura: string | null;
  fecha_emision: string | null;
  tipo_documento: string;
  motivo_omision: string | null;
  proveedor?: { id: number; nombre_comercial: string } | null;
}

export interface ResultadoBusqueda {
  termino: string;
  productos: ProductoSugerido[];
  proveedores: ProveedorSugerido[];
  pendientes: PendienteSugerido[];
  equivalencias: EquivalenciaSugerida[];
  facturas: FacturaSugerida[];
  total: number;
}

interface Opciones {
  /** Cuando es false el hook no consulta: lo usa el autocompletado tras elegir un resultado */
  habilitado?: boolean;
}

export function useBusquedaModulo(termino: string, opciones: Opciones = {}) {
  const { habilitado = true } = opciones;

  const [datos, setDatos] = useState<ResultadoBusqueda | null>(null);
  const [cargando, setCargando] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const limpio = termino.trim();

    if (!habilitado || limpio.length < MIN_CARACTERES) {
      abortRef.current?.abort();
      setDatos(null);
      setCargando(false);
      return;
    }

    setCargando(true);
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const control = new AbortController();
      abortRef.current = control;

      try {
        const { data } = await axios.get<ResultadoBusqueda>(`${API}/api/proveedores/buscar`, {
          params: { q: limpio },
          signal: control.signal,
        });
        if (!control.signal.aborted) {
          setDatos(data);
          setCargando(false);
        }
      } catch (err: any) {
        // Una búsqueda cancelada no es un error: solo significa que el usuario siguió escribiendo
        if (!axios.isCancel(err) && err?.code !== 'ERR_CANCELED' && err?.name !== 'CanceledError') {
          setDatos(null);
          setCargando(false);
        }
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [termino, habilitado]);

  // Al desmontar, cortar cualquier consulta viva
  useEffect(() => () => abortRef.current?.abort(), []);

  return { datos, cargando };
}

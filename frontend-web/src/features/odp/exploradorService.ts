import axios from 'axios';

import API from '../../services/config';

const getHeaders = () => ({
  headers: { Authorization: `Bearer ${sessionStorage.getItem('token')}` }
});

// ─── Filtros del explorador ──────────────────────────────────────────────────
// Los 11 filtros de la pestaña "Consultar" del módulo ODP. Se mapean 1:1 con lo que
// acepta backend-api/src/utils/odpFiltros.ts.

export type CampoFechaODP = 'fecha_creacion' | 'fecha_entrega' | 'fecha_factura' | 'fecha_listo_instalar';
export type TipoRegistroODP = 'TODOS' | 'ODP' | 'OA' | 'NC' | 'GARANTIA';

export interface FiltrosExplorador {
  fecha_desde?: string;
  fecha_hasta?: string;
  campo_fecha?: CampoFechaODP;
  estados_produccion?: string[];
  estado_facturacion?: string;
  estado_caja?: string;
  excluir_estado_caja?: string;
  tipo_registro?: TipoRegistroODP;
  asesor_id?: number | '';
  search?: string;
  forma_pago?: string;
  monto_min?: string;
  monto_max?: string;
  solo_con_saldo?: boolean;
  facturada_antes_de?: string;
  orden_campo?: string;
  orden_dir?: 'ASC' | 'DESC';
  page?: number;
  limit?: number;
}

export interface FilaExplorador {
  id: number;
  numero_odp: string;
  cliente_nombre: string | null;
  asesor_nombre: string | null;
  estado_produccion: string;
  estado_facturacion: string;
  estado_caja: string;
  tipo_odp: string;
  forma_pago: string | null;
  es_no_conformidad: boolean;
  es_garantia: boolean;
  valor_total: number;
  abono: number;
  pendiente: number;
  factura_electronica: string | null;
  fecha_factura: string | null;
  fecha_entrega: string | null;
  fecha_creacion: string | null;
  fecha_listo_instalar: string | null;
}

export interface RespuestaExplorador {
  items: FilaExplorador[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  totales: { count: number; valor_total: number; abono: number; pendiente: number };
}

/**
 * Serializa los filtros a query string.
 *
 * Los arrays se repiten sin corchetes (`estados_produccion=X&estados_produccion=Y`),
 * que es la forma que Express parsea a array — el mismo criterio que ya usa el buscador
 * de ODPListPage para `estados`. Con `qs` por defecto Axios mandaría `estados[]=X` y el
 * backend recibiría una clave que no existe, filtrando por nada en silencio.
 *
 * Los vacíos se omiten: un `''` que llegue al backend es un filtro activo con valor
 * vacío, no la ausencia de filtro.
 */
const buildParams = (filtros: FiltrosExplorador): string => {
  const params = new URLSearchParams();
  Object.entries(filtros).forEach(([clave, valor]) => {
    if (valor === undefined || valor === null || valor === '' || valor === false) return;
    if (Array.isArray(valor)) {
      valor.forEach(v => params.append(clave, String(v)));
      return;
    }
    params.append(clave, String(valor));
  });
  return params.toString();
};

/** Consulta transversal de ODPs con filtros combinables. Solo rol `admin`. */
export const apiGetExploradorODP = (filtros: FiltrosExplorador) =>
  axios.get<RespuestaExplorador>(`${API}/api/odp/explorador?${buildParams(filtros)}`, getHeaders());

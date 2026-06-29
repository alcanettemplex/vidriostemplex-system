import axios from 'axios';

/**
 * Caché compartida en memoria para listas de referencia que se consumen desde
 * múltiples formularios (clientes y catálogo de productos).
 *
 * Motivo: estas listas se descargaban completas en CADA apertura de formulario
 * (crear ODP, prospecto, cotización, etc.), generando egress innecesario en
 * Supabase. Aquí se cachean por un TTL corto y se deduplican las peticiones
 * concurrentes. NO cambia los datos devueltos: cada consumidor recibe el mismo
 * arreglo (mismos campos, mismo orden) que el endpoint original.
 *
 * Frescura: TTL de 10 min + invalidación explícita al crear/editar/eliminar
 * (ver invalidarClientes / invalidarCatalogo). Un registro creado por OTRO
 * usuario puede tardar hasta el TTL en aparecer; el creador lo ve al instante
 * porque su acción invalida la caché.
 */

import API from './config';
const TTL = 10 * 60 * 1000; // 10 minutos

interface CacheEntry { data: any[]; ts: number; }

let catalogoCache: CacheEntry | null = null;
let catalogoInflight: Promise<any[]> | null = null;

const authHeaders = () => ({ Authorization: `Bearer ${sessionStorage.getItem('token')}` });
const esFresco = (c: CacheEntry | null) => !!c && (Date.now() - c.ts < TTL);

/**
 * Busca clientes por nombre/teléfono/documento. Requiere al menos 2 caracteres.
 * El endpoint ya no devuelve la lista completa sin búsqueda.
 * Devuelve el arreglo de resultados (campo `rows` de la respuesta).
 */
export async function getClientesCached(buscar = '', force = false): Promise<any[]> {
  if (!buscar || buscar.trim().length < 2) return [];
  const q = encodeURIComponent(buscar.trim());
  const { data } = await axios.get(`${API}/api/clientes?buscar=${q}`, { headers: authHeaders() });
  return data?.rows ?? [];
}

export function invalidarClientes(): void { /* no-op: clientes ya no se cachea */ }

/**
 * Devuelve el catálogo de productos desde caché si está fresco; si no, lo descarga.
 */
export async function getCatalogoCached(force = false): Promise<any[]> {
  if (!force && esFresco(catalogoCache)) return [...catalogoCache!.data];
  if (!force && catalogoInflight) return catalogoInflight.then(d => [...d]);
  catalogoInflight = axios
    .get(`${API}/api/catalogo`, { headers: authHeaders() })
    .then(r => { catalogoCache = { data: r.data, ts: Date.now() }; return r.data as any[]; })
    .finally(() => { catalogoInflight = null; });
  return catalogoInflight.then(d => [...d]);
}

export function invalidarCatalogo(): void { catalogoCache = null; }

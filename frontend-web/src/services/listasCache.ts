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

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';
const TTL = 10 * 60 * 1000; // 10 minutos

interface CacheEntry { data: any[]; ts: number; }

let clientesCache: CacheEntry | null = null;
let clientesInflight: Promise<any[]> | null = null;
let catalogoCache: CacheEntry | null = null;
let catalogoInflight: Promise<any[]> | null = null;

const authHeaders = () => ({ Authorization: `Bearer ${sessionStorage.getItem('token')}` });
const esFresco = (c: CacheEntry | null) => !!c && (Date.now() - c.ts < TTL);

/**
 * Devuelve la lista de clientes desde caché si está fresca; si no, la descarga.
 * Devuelve una copia superficial para evitar mutaciones cruzadas entre consumidores.
 */
export async function getClientesCached(force = false): Promise<any[]> {
  if (!force && esFresco(clientesCache)) return [...clientesCache!.data];
  if (!force && clientesInflight) return clientesInflight.then(d => [...d]);
  clientesInflight = axios
    .get(`${API}/api/clientes`, { headers: authHeaders() })
    .then(r => { clientesCache = { data: r.data, ts: Date.now() }; return r.data as any[]; })
    .finally(() => { clientesInflight = null; });
  return clientesInflight.then(d => [...d]);
}

export function invalidarClientes(): void { clientesCache = null; }

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

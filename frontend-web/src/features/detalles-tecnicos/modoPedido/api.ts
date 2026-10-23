// Detalles técnicos — modo pedido (2026-10-16): llamadas a /api/detalle-tecnico y tipos de
// la respuesta. Axios con el token que agrega el interceptor global (services/httpInterceptors.ts).
import axios from 'axios';
import API from '../../../services/config';
import { conteosDe, type Conteos } from '../modelo/geometria';
import type { Pieza } from '../modelo/tipos';
import { piezaParaMedida } from './planos';
import { diaBogotaISO } from '../../../utils/fechas';
import type { EncabezadoHoja, FilaVidrio } from '../components/HojaDetalle';

/** Versión del formato de `pieza` que se guarda en `pedido_pv_plano.esquema`. */
export const ESQUEMA_PIEZA = 1;

/** Conteos como se guardan: los del dibujo y, si lleva chaflán, sus metros por medida de vidrio
 *  de la letra (`"700x1800": 4.1`), que el Excel del servidor usa fila por fila (2026-10-17). */
export type ConteosGuardados = Conteos & { chaflanPorMedida?: Record<string, number> };

export interface ItemDT {
  id: number;
  pedido_pv_id: number;
  item: string | null;
  prod: string | null;
  cantidad: number | null;
  color: string | null;
  espesor: string | null;
  ancho_mm: number | null;
  alto_mm: number | null;
  letra: string | null;
  perforaciones: number | null;
  boquetes: number | null;
  observaciones_pv: string | null;
  /** Va en un pedido ya enviado y el grupo no está desbloqueado. */
  bloqueado: boolean;
}

export interface PlanoDT {
  id: number;
  pedido_pv_id: number;
  letra: string;
  plantilla_id: string | null;
  nombre: string;
  sello_en_canto: boolean;
  observaciones: string | null;
  pieza: Pieza;
  esquema: number;
  conteos: ConteosGuardados;
  imagen_url: string | null;
  actualizado_en: string;
  /** Quien guardó el plano por última vez: «DISEÑADO POR» de la hoja (2026-10-23). */
  disenado_por: string | null;
}

export interface PedidoDelGrupo {
  id: number;
  numero_pedido: string;
  sufijo: string | null;
  estado: string;
  proveedor: string;
}

export interface DisenoPedido {
  pedido_base_id: number;
  encabezado: {
    numero_pedido: string;
    proveedor: string;
    creado_en: string;
    odp_id: number | null;
    numero_odp: string;
    cliente: string;
    asesor_nombre: string;
    asesor_iniciales: string;
  };
  pedidos: PedidoDelGrupo[];
  items: ItemDT[];
  planos: PlanoDT[];
  letras_bloqueadas: string[];
  desbloqueo: { en: string; por: string } | null;
  hay_enviados: boolean;
  puede_editar: boolean;
  puede_desbloquear: boolean;
}

export interface GuardarPlanoBody {
  plantilla_id: string | null;
  nombre: string;
  sello_en_canto: boolean;
  observaciones: string;
  pieza: Pieza;
  esquema: number;
  conteos: ConteosGuardados;
  imagen: string;
  imagen_ancho: number;
  imagen_alto: number;
  version: string | null;
}

const base = `${API}/api/detalle-tecnico/pedido`;

export const cargarDiseno = async (pedidoId: number) => (await axios.get<DisenoPedido>(`${base}/${pedidoId}`)).data;
export const guardarPlanoDT = async (pedidoId: number, letra: string, body: GuardarPlanoBody) =>
  (await axios.put<PlanoDT>(`${base}/${pedidoId}/plano/${encodeURIComponent(letra)}`, body)).data;
export const eliminarPlanoDT = async (pedidoId: number, letra: string) => {
  await axios.delete(`${base}/${pedidoId}/plano/${encodeURIComponent(letra)}`);
};
export const cambiarLetrasDT = async (pedidoId: number, cambios: { item_id: number; letra: string | null }[]) => {
  await axios.patch(`${base}/${pedidoId}/letras`, { cambios });
};
export const cambiarBloqueoDT = async (pedidoId: number, desbloquear: boolean) => {
  await axios.patch(`${base}/${pedidoId}/bloqueo`, { desbloquear });
};

/** Descarga el Excel oficial del proveedor (con sus hojas «PLANO X») de un pedido del grupo. */
export async function descargarExcelPedidoPV(pedido: PedidoDelGrupo) {
  const resp = await axios.get(`${API}/api/pedidos-pv/${pedido.id}/excel`, { responseType: 'blob' });
  // El backend arma el nombre con el proveedor del formato; aquí se repite el mismo criterio.
  const proveedor = /templacol/i.test(pedido.proveedor) ? 'TEMPLACOL' : 'VITELSA';
  const url = URL.createObjectURL(new Blob([resp.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `PEDIDO ${proveedor} #${pedido.numero_pedido}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Mensaje del backend si viene redactado para el usuario; si no, el contexto. */
export const mensajeError = (e: unknown, contexto: string) => {
  const detalle = axios.isAxiosError(e) ? e.response?.data?.error : undefined;
  return typeof detalle === 'string' ? detalle : `${contexto}. Revisa tu conexión e intenta de nuevo.`;
};
export const esConflicto = (e: unknown) => axios.isAxiosError(e) && e.response?.status === 409;

// ── Datos de la hoja FOR-005 ─────────────────────────────────────────────────

/** Encabezado de la hoja (decisión 2026-10-16): número del pedido, # ODP e iniciales del
 *  asesor; la «obra» es la misma del formulario oficial y no lleva el nombre del cliente. */
export function encabezadoDe(d: DisenoPedido, numeroPedido = d.encabezado.numero_pedido): EncabezadoHoja {
  const e = d.encabezado;
  return {
    numero: numeroPedido,
    fecha: e.creado_en ? diaBogotaISO(e.creado_en) : '',
    proveedor: /templacol/i.test(e.proveedor) ? 'TEMPLACOL' : 'VITELSA',
    obra: [e.numero_odp, e.asesor_iniciales].filter(Boolean).join(' — '),
    asesor: e.asesor_iniciales,
  };
}

/** Una fila por vidrio. Con la pieza, el chaflán de cada fila se mide con la medida de ese
 *  vidrio: un canto de 750 no da los mismos metros que uno de 600 (2026-10-17). */
export const filasDe = (items: ItemDT[], pieza?: Pieza): FilaVidrio[] => {
  const conChaflan = !!pieza?.operaciones.some((o) => o.tipo === 'chaflan');
  return items.map((i) => ({
    cantidad: i.cantidad ?? '',
    color: i.color ?? '',
    espesor: i.espesor ?? '',
    ancho: i.ancho_mm ?? '',
    alto: i.alto_mm ?? '',
    ...(pieza && conChaflan && i.ancho_mm && i.ancho_mm > 0 && i.alto_mm && i.alto_mm > 0
      ? { chaflanMl: conteosDe(piezaParaMedida(pieza, i.ancho_mm, i.alto_mm)).chaflanMl }
      : {}),
  }));
};

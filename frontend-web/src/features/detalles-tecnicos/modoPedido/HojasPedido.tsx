import type { Plano } from '../modelo/tipos';
import { HojaDetalle } from '../components/HojaDetalle';
import { encabezadoDe, filasDe, type DisenoPedido } from './api';
import { itemsDeLetra, letrasDe, planoDeDT } from './planos';

interface Props {
  diseno: DisenoPedido;
  /** Solo las letras de los vidrios de este pedido (principal o extensión), como el Excel. */
  pedidoId?: number;
  /** Planos a imprimir (el estado del editor). Sin esto, los guardados en la BD. */
  planos?: Plano[];
  /** Solo esta letra. */
  letra?: string;
}

/**
 * Hojas FOR-005 de un Pedido PV, una por letra con plano. Las usan la impresión del editor
 * y el «Imprimir pedido» de Gestión PV (decisión 2026-10-16: el imprimible lleva el mismo
 * formato que el Excel), así que el papel y el Excel salen iguales.
 */
export function HojasPedido({ diseno, pedidoId, planos, letra }: Props) {
  const pedido = pedidoId !== undefined ? diseno.pedidos.find((p) => p.id === pedidoId) : undefined;
  const enc = encabezadoDe(diseno, pedido?.numero_pedido);
  const lista = planos ?? diseno.planos.map((p) => planoDeDT(p, itemsDeLetra(diseno.items, p.letra)));
  const letras = letrasDe(diseno, lista).filter((l) => (letra ? l === letra : true));
  return (
    <>
      {letras.map((l) => {
        const plano = lista.find((p) => p.letra === l);
        const items = itemsDeLetra(diseno.items, l, pedidoId);
        if (!plano || items.length === 0) return null;
        return <HojaDetalle key={l} encabezado={enc} plano={plano} letra={l} filas={filasDe(items, plano.pieza)} />;
      })}
    </>
  );
}

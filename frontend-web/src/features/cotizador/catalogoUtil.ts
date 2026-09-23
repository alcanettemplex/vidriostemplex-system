import { ProductoCatalogo, SegmentoCliente } from './types';

// Utilidades de presentación del catálogo del Cotizador, compartidas por el
// editor del Ítem libre y el de personalización de componentes (2026-09-23;
// antes vivían dentro de EditorLineasLibres).

export type ClaseUnidad = 'area' | 'lineal' | 'unidad';

/** Misma clasificación que `claseDeUnidad` en backend-api/src/cotizador/modules/
 * itemLibre.ts. Si cambia allá, cambia aquí: allá decide el cálculo (y si un
 * cambio de componente es válido), aquí sólo el rótulo y el filtro. */
export function claseDeUnidad(unidad: string | null | undefined): ClaseUnidad {
    const u = String(unidad ?? '').toUpperCase().replace(/\s+/g, ' ').trim();
    if (u.includes('M2')) return 'area';
    if (u.includes('METRO') || u === 'ML') return 'lineal';
    return 'unidad';
}

export function rotuloCantidad(unidad: string | null | undefined): string {
    const c = claseDeUnidad(unidad);
    return c === 'area' ? 'm²' : c === 'lineal' ? 'ml' : 'und';
}

export function precioDe(producto: ProductoCatalogo, segmento: SegmentoCliente): number {
    if (segmento === 'PB') return producto.precio_pb;
    if (segmento === 'PM') return producto.precio_pm;
    return producto.precio_pa;
}

export const MIN_BUSQUEDA = 2;

/** Primero los códigos que EMPIEZAN por el texto (el vendedor que ya sabe el
 * código lo escribe entero), después los que lo contienen en código o
 * descripción. `filtro` restringe el universo (p. ej. misma clase de unidad). */
export function buscarEnCatalogo(
    catalogo: ProductoCatalogo[],
    texto: string,
    max: number,
    filtro: (p: ProductoCatalogo) => boolean = () => true,
): ProductoCatalogo[] {
    const q = texto.trim().toUpperCase();
    if (q.length < MIN_BUSQUEDA) return [];
    const resultado: ProductoCatalogo[] = [];
    for (const p of catalogo) {
        if (filtro(p) && p.codigo.toUpperCase().startsWith(q)) resultado.push(p);
        if (resultado.length >= max) return resultado;
    }
    for (const p of catalogo) {
        if (resultado.includes(p) || !filtro(p)) continue;
        if (p.codigo.toUpperCase().includes(q) || p.descripcion.toUpperCase().includes(q)) resultado.push(p);
        if (resultado.length >= max) break;
    }
    return resultado;
}

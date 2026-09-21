// Genera las filas de perfilería (columnas CANT./DIMENSION de una SAP) a
// partir del despiece ya calculado de los ítems de una propuesta.
//
// AISLADO A PROPÓSITO (2026-09-21): esta función no consulta Postgres, no
// conoce `sap_items` ni `ODP`, y no decide qué ítems son aptos para corte —
// eso ya lo resuelve `aptitudOrden.ts` (condiciones 1-9), y este módulo no lo
// duplica. El LLAMADOR filtra con `evaluarAptitudOrden(cotizacion).porItem` y
// sólo pasa aquí los ítems cuyo `imprimible` dio `true`. Ver
// `docs/modulos/cotizador-vision.md` → "El hueco real: la perfilería en la SAP".
//
// CONVENCIÓN CONFIRMADA POR EL USUARIO (2026-09-21), no inventada:
//   1. La barra comercial de CUALQUIER perfil mide siempre 6.000 mm.
//   2. Cuántas barras pedir "es lo de menos": no hay que empaquetar (bin
//      packing) los cortes en barras concretas — el retal sobrante lo
//      gestiona el taller a mano, ingresándolo a inventario. Por eso `CANT.`
//      es sólo `ceil(metros totales con desperdicio / 6)`, nunca una
//      optimización de corte.
//   3. El 5 % de desperdicio (`cotizador.diseno_perfil.desperdicio_pct`) es
//      real, no un artefacto: se aplica siempre.
//   4. Las letras A, B, C… de la columna `item` de la SAP siguen el orden en
//      que el asesor cargó los productos en la cotización — no una heurística
//      de geometría. (No confundir con `ordenCorte.ts`, que ordena las PIEZAS
//      dentro de un despiece para la Orden de Corte: es un problema distinto,
//      sigue sin confirmar con el taller, y este módulo no lo toca.)
//   5. Los perfiles que el proveedor entrega ya cortados quedan a criterio del
//      asesor: este generador no los distingue de los demás.
//
// BARRA DE 6 m: por ahora fija para todo perfil. Si algún día un perfil mide
// otra cosa, el dato vive en `cotizador.diseno_perfil` (o donde el usuario
// decida) y este único punto (`MM_POR_BARRA`) es el que hay que tocar.
const MM_POR_BARRA = 6000;

import type { CortePerfil } from "../tipos";

/** Lo mínimo que necesita este módulo de un ítem de cotización ya aprobado
 * para el corte: sólo su despiece de perfiles, en el orden en que el asesor
 * cargó los productos (para las letras A, B, C…). El resto del ítem
 * (precios, plano, vidrio) no le importa a la SAP de perfilería. */
export interface ItemParaPerfileriaSAP {
  /** Identificador legible del ítem, sólo para las advertencias. */
  descripcion?: string | null;
  resultado?: {
    cortes?: {
      perfiles?: CortePerfil[] | null;
    } | null;
  } | null;
}

export interface FilaPerfileriaSAP {
  /** A, B, C… — orden de primera aparición del código entre los ítems. */
  item: string;
  codigo: string;
  descripcion: string;
  /** Formato taller: "4-400/ 2-1000/ 2-1900" (cantidad-medida_mm). */
  dimension: string;
  /** Barras completas de 6 m a pedir, redondeadas hacia arriba. */
  cantidad: number;
}

export interface ResultadoGeneradorSAP {
  filas: FilaPerfileriaSAP[];
  advertencias: string[];
}

/** A, B, C, …, Z, AA, AB, … — mismo esquema que las columnas de una hoja de
 * cálculo, por si una cotización necesita más de 26 perfiles distintos. */
function letraDeIndice(indice: number): string {
  let n = indice;
  let letra = "";
  do {
    letra = String.fromCharCode(65 + (n % 26)) + letra;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return letra;
}

interface GrupoPerfil {
  codigo: string;
  descripcion: string;
  /** metros lineales YA con el desperdicio de cada corte aplicado. */
  metrosConDesperdicio: number;
  /** medida_mm (redondeada al mm) -> cantidad de piezas, en orden de
   * primera aparición para que `dimension` salga estable. */
  cortesPorMedida: Map<number, number>;
  ordenMedidas: number[];
}

/**
 * Genera las filas de perfilería para la SAP a partir de los ítems (YA
 * filtrados por aptitud para corte) de la propuesta elegida de una
 * cotización.
 *
 * No lanza: un ítem sin despiece (espejo, tablero) o un corte sin código de
 * catálogo se excluye en silencio del cálculo y se explica en `advertencias`,
 * para que un problema puntual no bloquee las demás filas.
 */
export function generarPerfileriaSAP(items: ItemParaPerfileriaSAP[]): ResultadoGeneradorSAP {
  const advertencias: string[] = [];
  const grupos = new Map<string, GrupoPerfil>();
  const ordenGrupos: string[] = [];

  items.forEach((item, indiceItem) => {
    const nombreItem = item.descripcion?.trim() || `ítem ${indiceItem + 1}`;
    const cortes = item.resultado?.cortes?.perfiles;

    if (!Array.isArray(cortes) || cortes.length === 0) {
      // No es un error: un espejo o un tablero no tiene despiece por diseño.
      return;
    }

    for (const corte of cortes) {
      if (!corte.codigo) {
        advertencias.push(
          `${nombreItem}: el perfil "${corte.descripcion ?? corte.ref}" no tiene código de catálogo ` +
            `en el color cotizado — se excluyó de la SAP. Revisa el ítem antes de pedir el material.`
        );
        continue;
      }
      if (corte.desperdicioPct === undefined) {
        // Blob guardado antes del 2026-09-21 (esta pieza no llevaba el campo):
        // no se inventa un % — se avisa y se excluye, en vez de asumir 0 y
        // pedir de menos.
        advertencias.push(
          `${nombreItem}: el perfil "${corte.descripcion ?? corte.ref}" viene de una cotización anterior ` +
            `a este cálculo y no trae % de desperdicio guardado — se excluyó de la SAP. Clona la ` +
            `propuesta para regenerar el despiece con los datos completos.`
        );
        continue;
      }

      const metrosNetos = (corte.medidaMm / 1000) * corte.cantidad;
      const metrosConDesperdicio = metrosNetos * (1 + corte.desperdicioPct / 100);
      const medidaRedondeada = Math.round(corte.medidaMm);

      let grupo = grupos.get(corte.codigo);
      if (!grupo) {
        grupo = {
          codigo: corte.codigo,
          descripcion: corte.descripcion ?? corte.ref,
          metrosConDesperdicio: 0,
          cortesPorMedida: new Map(),
          ordenMedidas: [],
        };
        grupos.set(corte.codigo, grupo);
        ordenGrupos.push(corte.codigo);
      }

      grupo.metrosConDesperdicio += metrosConDesperdicio;
      const cantidadPrevia = grupo.cortesPorMedida.get(medidaRedondeada);
      if (cantidadPrevia === undefined) {
        grupo.ordenMedidas.push(medidaRedondeada);
      }
      grupo.cortesPorMedida.set(medidaRedondeada, (cantidadPrevia ?? 0) + corte.cantidad);
    }
  });

  const filas: FilaPerfileriaSAP[] = ordenGrupos.map((codigo, indice) => {
    const grupo = grupos.get(codigo)!;
    const dimension = grupo.ordenMedidas
      .map((medida) => `${grupo.cortesPorMedida.get(medida)}-${medida}`)
      .join("/ ");
    return {
      item: letraDeIndice(indice),
      codigo: grupo.codigo,
      descripcion: grupo.descripcion,
      dimension,
      // `.toFixed(6)` + `Number(...)` antes de `ceil`: sin esto, un total que
      // matemáticamente cae justo en un múltiplo de 6 m puede llegar como
      // 12.000000000000002 por acumulación de punto flotante y pedir una
      // barra de más.
      cantidad: Math.ceil(Number((grupo.metrosConDesperdicio / (MM_POR_BARRA / 1000)).toFixed(6))),
    };
  });

  return { filas, advertencias };
}

import { Transaction } from 'sequelize';
import { ProveedorProducto, ProveedorProductoCodigo } from '../models';
import { normalizarCodigo } from './proveedorCodigos';

/**
 * Reglas de código por proveedor (2026-09-30).
 *
 * Problema: varios proveedores facturan el MISMO producto con códigos distintos y
 * cada código nuevo volvía a "Por Mapear" aunque el producto ya estuviera vinculado.
 *   · GRUPO ROLDAN     GRE175NG / GRP175NG / ALU175NG — cambia el prefijo de línea.
 *   · VENTANAS Y PUERTAS 392EC / 392ECMT ("... RETAL") — el retal lleva sufijo MT.
 *   · VEA              …023 "CHAPETA … IZQUIERDA" / …006 "… DERECHA" — la mano.
 *   · HI-TECH          SV1590 / SV3590 — la familia es el producto en el catálogo.
 *
 * Cada regla traduce un código (y su descripción) a una LLAVE: dos códigos del mismo
 * proveedor con la misma llave son el mismo producto. La lista es cerrada a propósito
 * —nunca expresiones escritas por el usuario—: una regla mal escrita no da error,
 * da un precio en la fila equivocada, y ahora ese precio llega al Cotizador.
 *
 * Una regla NUNCA es global. La misma lógica que acierta 3 de 3 en Roldán comete 22
 * errores en ACVICOL, donde las letras que cambian (`-8` = negro) sí son productos
 * distintos. Por eso se asigna por proveedor y se valida contra sus propios mapeos
 * (`probarRegla`) antes de activarse.
 *
 * Vive en `utils/` y no en el controlador por la misma razón que `proveedorCodigos.ts`:
 * los scripts one-off y las pruebas la importan sin arrastrar tipos de Express.
 */

// ─── Normalización ──────────────────────────────────────────────────────────

const sinTildes = (s: string | null | undefined) =>
  String(s ?? '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const alfanumerico = (s: string | null | undefined) => sinTildes(s).replace(/[^A-Z0-9]/g, '');

/** Primera palabra significativa de la descripción: el TIPO de pieza (ADAPTADOR, JAMBA…). */
const tipoDePieza = (descripcion: string | null | undefined) => (sinTildes(descripcion).match(/[A-Z]{3,}/) || [''])[0];

const PALABRAS_MANO = /\b(IZQ|IZQUIERDA|IZQUIERDO|DER|DERECHA|DERECHO)\b/g;
const tieneMano = (descripcion: string | null | undefined) => new RegExp(PALABRAS_MANO.source).test(sinTildes(descripcion));

// ─── Catálogo cerrado de reglas ────────────────────────────────────────────

export type UnidadCompra = 'UNIDAD' | 'TIRA_6M' | 'METRO' | 'KG' | 'M2' | 'ML';

interface DefinicionRegla {
  titulo: string;
  descripcion: string;
  ejemplo: string;
  /** Llave del código; null = la regla no se pronuncia sobre él. */
  llave: (codigo: string, descripcion: string | null) => string | null;
  /** Si la regla, además del producto, sabe la modalidad (retal → METRO). */
  modalidad?: (codigo: string, descripcion: string | null) => UnidadCompra | null;
  /** Solo se busca coincidencia para el código ENTRANTE si cumple esto. */
  aplicaAlEntrante?: (codigo: string, descripcion: string | null) => boolean;
}

export const REGLAS_CODIGO = {
  QUITAR_PREFIJO_LINEA: {
    titulo: 'Quitar el prefijo de línea',
    descripcion:
      'El proveedor antepone al código una línea o extrusora que cambia de una factura a otra. ' +
      'Se compara la referencia + el color + el tipo de pieza, sin el prefijo. El color sí cuenta: NG ≠ NT.',
    ejemplo: 'GRE175NG = GRP175NG = ALU175NG (adaptador 3831 negro)',
    llave: (codigo, descripcion) => {
      const m = alfanumerico(codigo).match(/^[A-Z]*?(\d+)([A-Z]{1,3})$/);
      if (!m) return null;
      const tipo = tipoDePieza(descripcion);
      // Sin tipo de pieza no hay con qué separar una jamba 393 de un cabezal 393
      return tipo ? `${Number(m[1])}${m[2]}|${tipo}` : null;
    },
  },
  SUFIJO_RETAL: {
    titulo: 'Retal con sufijo MT',
    descripcion:
      'El proveedor factura el retal (metros sueltos) del mismo perfil agregando MT al código y la palabra RETAL ' +
      'a la descripción. El retal se compra por metro.',
    ejemplo: '392EC (tira) = 392ECMT "CABEZAL 744 CRUDO … RETAL" (metro)',
    llave: (codigo, descripcion) => {
      const c = alfanumerico(codigo);
      if (!c) return null;
      return /MT$/.test(c) && /RETAL/.test(sinTildes(descripcion)) ? c.replace(/MT$/, '') : c;
    },
    modalidad: (codigo, descripcion) =>
      /MT$/.test(alfanumerico(codigo)) && /RETAL/.test(sinTildes(descripcion)) ? 'METRO' : null,
  },
  IGNORAR_MANO: {
    titulo: 'Ignorar la mano (izquierda / derecha)',
    descripcion:
      'El proveedor usa un código distinto para la mano izquierda y la derecha de una pieza que tu catálogo no ' +
      'distingue. Se compara la descripción sin IZQ/DER; tiene que ser idéntica en todo lo demás.',
    ejemplo: '"CHAPETA DIV. BAÑO 6mm. IZQUIERDA 517" = "… DERECHA 517"',
    llave: (_codigo, descripcion) => alfanumerico(sinTildes(descripcion).replace(PALABRAS_MANO, ' ')) || null,
    aplicaAlEntrante: (_codigo, descripcion) => tieneMano(descripcion),
  },
  FAMILIA_POR_PREFIJO: {
    titulo: 'La familia es el producto',
    descripcion:
      'Las letras iniciales del código son la familia del producto y tu catálogo no distingue el resto ' +
      '(porcentaje, ancho del rollo). Úsala solo si el precio por unidad es comparable entre variantes.',
    ejemplo: 'SV1590-15 = SV3590-15 (Solar Vision 15 % y 35 %)',
    llave: (codigo) => {
      const m = alfanumerico(codigo).match(/^([A-Z]{2,})\d/);
      return m ? m[1] : null;
    },
  },
} satisfies Record<string, DefinicionRegla>;

export type ReglaCodigo = keyof typeof REGLAS_CODIGO;
export const NOMBRES_REGLAS = Object.keys(REGLAS_CODIGO) as ReglaCodigo[];
export const MODOS_REGLA = ['AUTO', 'SUGERENCIA'] as const;
export type ModoRegla = (typeof MODOS_REGLA)[number];

export function esReglaValida(valor: unknown): valor is ReglaCodigo {
  return typeof valor === 'string' && (NOMBRES_REGLAS as string[]).includes(valor);
}

function definicion(regla: ReglaCodigo): DefinicionRegla {
  return REGLAS_CODIGO[regla] as DefinicionRegla;
}

export function catalogoReglas() {
  return NOMBRES_REGLAS.map((nombre) => {
    const d = definicion(nombre);
    return { regla: nombre, titulo: d.titulo, descripcion: d.descripcion, ejemplo: d.ejemplo };
  });
}

// ─── Índice de lo que el proveedor ya tiene mapeado ────────────────────────

export interface CodigoConocido {
  codigo: string;
  descripcion: string | null;
  ppId: number;
  catalogoProductoId: number;
  unidadCompra: string;
}

export interface EquivalenciaConocida {
  ppId: number;
  catalogoProductoId: number;
  unidadCompra: string;
  precioActual: number | null;
}

export interface IndiceRegla {
  regla: ReglaCodigo;
  porLlave: Map<string, CodigoConocido[]>;
  /** Todas las equivalencias activas del proveedor por producto, tengan o no código. */
  equivalenciasPorProducto: Map<number, EquivalenciaConocida[]>;
}

/** Arma el índice en memoria. Puro: lo usan la ingesta, las pruebas y `probarRegla`. */
export function indexar(
  regla: ReglaCodigo,
  codigos: CodigoConocido[],
  equivalencias: EquivalenciaConocida[]
): IndiceRegla {
  const def = definicion(regla);
  const porLlave = new Map<string, CodigoConocido[]>();
  for (const c of codigos) {
    const k = def.llave(c.codigo, c.descripcion);
    if (!k) continue;
    if (!porLlave.has(k)) porLlave.set(k, []);
    porLlave.get(k)!.push(c);
  }
  const equivalenciasPorProducto = new Map<number, EquivalenciaConocida[]>();
  for (const e of equivalencias) {
    if (!equivalenciasPorProducto.has(e.catalogoProductoId)) equivalenciasPorProducto.set(e.catalogoProductoId, []);
    equivalenciasPorProducto.get(e.catalogoProductoId)!.push(e);
  }
  return { regla, porLlave, equivalenciasPorProducto };
}

/** Agrega al índice un código recién vinculado, para que el resto del lote lo vea. */
export function sumarAlIndice(indice: IndiceRegla, codigo: CodigoConocido): void {
  const k = definicion(indice.regla).llave(codigo.codigo, codigo.descripcion);
  if (!k) return;
  if (!indice.porLlave.has(k)) indice.porLlave.set(k, []);
  indice.porLlave.get(k)!.push(codigo);
}

/** Lee de la BD los códigos y equivalencias ACTIVAS del proveedor. Dos consultas acotadas. */
export async function leerMapeosProveedor(
  proveedorId: number,
  transaction?: Transaction
): Promise<{ codigos: CodigoConocido[]; equivalencias: EquivalenciaConocida[] }> {
  const [filasCodigo, filasEquivalencia] = await Promise.all([
    ProveedorProductoCodigo.findAll({
      where: { proveedor_id: proveedorId },
      attributes: ['codigo_proveedor', 'descripcion_proveedor'],
      include: [
        {
          model: ProveedorProducto,
          as: 'equivalencia',
          where: { activo: true },
          required: true,
          attributes: ['id', 'catalogo_producto_id', 'unidad_compra', 'descripcion_proveedor'],
        },
      ],
      transaction,
    }),
    ProveedorProducto.findAll({
      where: { proveedor_id: proveedorId, activo: true },
      attributes: ['id', 'catalogo_producto_id', 'unidad_compra', 'precio_actual'],
      transaction,
    }),
  ]);

  const codigos: CodigoConocido[] = filasCodigo.map((f: any) => {
    const eq = f.getDataValue('equivalencia');
    return {
      codigo: String(f.getDataValue('codigo_proveedor')),
      // El código adicional puede no tener descripción propia: se toma la de la equivalencia
      descripcion: (f.getDataValue('descripcion_proveedor') as string | null) ?? eq.getDataValue('descripcion_proveedor') ?? null,
      ppId: Number(eq.getDataValue('id')),
      catalogoProductoId: Number(eq.getDataValue('catalogo_producto_id')),
      unidadCompra: String(eq.getDataValue('unidad_compra')),
    };
  });
  const equivalencias: EquivalenciaConocida[] = filasEquivalencia.map((e: any) => {
    const pa = e.getDataValue('precio_actual');
    return {
      ppId: Number(e.getDataValue('id')),
      catalogoProductoId: Number(e.getDataValue('catalogo_producto_id')),
      unidadCompra: String(e.getDataValue('unidad_compra')),
      precioActual: pa === null || pa === undefined ? null : parseFloat(pa),
    };
  });
  return { codigos, equivalencias };
}

export async function construirIndiceRegla(
  proveedorId: number,
  regla: ReglaCodigo,
  transaction?: Transaction
): Promise<IndiceRegla> {
  const { codigos, equivalencias } = await leerMapeosProveedor(proveedorId, transaction);
  return indexar(regla, codigos, equivalencias);
}

// ─── Resolución de un código entrante ──────────────────────────────────────

export interface CodigoEntrante {
  codigo: string;
  descripcion: string | null;
  /** Unidad de la línea; solo cuenta si `unidadConfiable` (MTR, KGM, MTK…). */
  unidad: string | null;
  unidadConfiable: boolean;
  precio: number | null;
}

export type Resolucion =
  | {
      tipo: 'VINCULAR';
      ppId: number;
      catalogoProductoId: number;
      unidadCompra: string;
      viaCodigo: string;
      variacionPct: number | null;
    }
  | {
      /** La regla identifica el producto, pero algo impide vincular sin un humano. */
      tipo: 'SUGERIR';
      catalogoProductoId: number;
      unidadCompra: string | null;
      viaCodigo: string;
      motivo: string;
    }
  | { tipo: 'SIN_COINCIDENCIA' };

/**
 * Decide qué hacer con un código desconocido. Las condiciones para VINCULAR son
 * estrictas a propósito, porque nadie va a revisar el resultado antes de que mueva un precio:
 *  1. Un ÚNICO producto con la misma llave. Dos → no hay forma de elegir.
 *  2. Modalidad decidida sin adivinar: la unidad confiable de la factura; si no la
 *     hay, la que dicta la regla (retal → METRO); si no, la única equivalencia del
 *     producto o la única de los códigos que coincidieron.
 *  3. Ya existe la equivalencia en esa modalidad. La regla no crea filas de precio
 *     nuevas: abrir una modalidad sigue siendo decisión humana.
 *  4. El precio no se aleja del vigente más que el umbral de anomalía. Un salto así
 *     suele significar que la regla emparejó dos cosas distintas.
 */
export function resolverConRegla(indice: IndiceRegla, entrante: CodigoEntrante, umbralPct: number): Resolucion {
  const def = definicion(indice.regla);
  if (def.aplicaAlEntrante && !def.aplicaAlEntrante(entrante.codigo, entrante.descripcion)) {
    return { tipo: 'SIN_COINCIDENCIA' };
  }
  const k = def.llave(entrante.codigo, entrante.descripcion);
  if (!k) return { tipo: 'SIN_COINCIDENCIA' };

  const propio = normalizarCodigo(entrante.codigo);
  const coincidencias = (indice.porLlave.get(k) ?? []).filter((c) => normalizarCodigo(c.codigo) !== propio);
  const productos = Array.from(new Set(coincidencias.map((c) => c.catalogoProductoId)));
  if (productos.length !== 1) return { tipo: 'SIN_COINCIDENCIA' };

  const catalogoProductoId = productos[0];
  const viaCodigo = coincidencias[0].codigo;
  const equivalencias = indice.equivalenciasPorProducto.get(catalogoProductoId) ?? [];

  let modalidad: string | null = null;
  if (entrante.unidadConfiable && entrante.unidad) modalidad = entrante.unidad;
  else if (def.modalidad) modalidad = def.modalidad(entrante.codigo, entrante.descripcion);
  if (!modalidad) {
    const deLasEquivalencias = Array.from(new Set(equivalencias.map((e) => e.unidadCompra)));
    const deLasCoincidencias = Array.from(new Set(coincidencias.map((c) => c.unidadCompra)));
    if (deLasEquivalencias.length === 1) modalidad = deLasEquivalencias[0];
    // Copiar la modalidad del código gemelo solo vale si la regla une variantes de la
    // MISMA forma de compra (GRE175NG/ALU175NG, ambos tira). Si la regla misma define la
    // modalidad (retal → METRO), el gemelo de un perfil entero es su retal: copiarla
    // metería el precio de la tira en la fila del metro.
    else if (!def.modalidad && deLasCoincidencias.length === 1) modalidad = deLasCoincidencias[0];
  }
  if (!modalidad) {
    return {
      tipo: 'SUGERIR', catalogoProductoId, unidadCompra: null, viaCodigo,
      motivo: 'El producto tiene varias modalidades y la factura no precisa la unidad.',
    };
  }

  const destino = equivalencias.find((e) => e.unidadCompra === modalidad);
  if (!destino) {
    return {
      tipo: 'SUGERIR', catalogoProductoId, unidadCompra: modalidad, viaCodigo,
      motivo: `El producto todavía no tiene equivalencia por ${modalidad} con este proveedor.`,
    };
  }

  let variacionPct: number | null = null;
  if (destino.precioActual !== null && destino.precioActual > 0 && entrante.precio !== null && entrante.precio > 0) {
    variacionPct = ((entrante.precio - destino.precioActual) / destino.precioActual) * 100;
    if (Math.abs(variacionPct) > umbralPct) {
      return {
        tipo: 'SUGERIR', catalogoProductoId, unidadCompra: modalidad, viaCodigo,
        motivo: `El precio se aleja ${variacionPct.toFixed(1)} % del vigente: revísalo antes de vincular.`,
      };
    }
  }

  return { tipo: 'VINCULAR', ppId: destino.ppId, catalogoProductoId, unidadCompra: modalidad, viaCodigo, variacionPct };
}

// ─── Prueba de una regla contra los mapeos que ya existen ──────────────────

export interface ResultadoPrueba {
  /** Pares de códigos mapeados que la regla une y que TÚ también uniste. */
  aciertos: Array<{ codigo_a: string; codigo_b: string; catalogo_producto_id: number }>;
  /** Pares que la regla uniría pero que mapeaste a productos distintos: bloquean la regla. */
  errores: Array<{ codigo_a: string; producto_a: number; codigo_b: string; producto_b: number }>;
}

/**
 * La evidencia que habilita una regla: compararla con las decisiones que ya tomó un
 * humano. Un solo error significa que la regla, aplicada sola, habría puesto un
 * precio en el producto equivocado.
 */
export function probarRegla(regla: ReglaCodigo, codigos: CodigoConocido[]): ResultadoPrueba {
  const indice = indexar(regla, codigos, []);
  const aciertos: ResultadoPrueba['aciertos'] = [];
  const errores: ResultadoPrueba['errores'] = [];
  for (const grupo of indice.porLlave.values()) {
    for (let i = 0; i < grupo.length; i++) {
      for (let j = i + 1; j < grupo.length; j++) {
        const a = grupo[i];
        const b = grupo[j];
        if (normalizarCodigo(a.codigo) === normalizarCodigo(b.codigo)) continue; // mismo código, otra modalidad
        if (a.catalogoProductoId === b.catalogoProductoId) {
          aciertos.push({ codigo_a: a.codigo, codigo_b: b.codigo, catalogo_producto_id: a.catalogoProductoId });
        } else {
          errores.push({ codigo_a: a.codigo, producto_a: a.catalogoProductoId, codigo_b: b.codigo, producto_b: b.catalogoProductoId });
        }
      }
    }
  }
  return { aciertos, errores };
}

/**
 * Qué modos admite una regla según su evidencia. AUTO exige al menos un acierto: con
 * cero (VEA hoy, que aún no tiene ningún par izquierda/derecha mapeado) la regla no
 * está probada y solo puede sugerir.
 */
export function modosPermitidos(prueba: ResultadoPrueba): ModoRegla[] {
  if (prueba.errores.length > 0) return [];
  return prueba.aciertos.length > 0 ? ['AUTO', 'SUGERENCIA'] : ['SUGERENCIA'];
}

/** Lee la regla configurada de una instancia de Proveedor, validándola. */
export function reglaDe(proveedor: any): { regla: ReglaCodigo; modo: ModoRegla } | null {
  const regla = proveedor?.getDataValue?.('regla_codigo') ?? proveedor?.regla_codigo;
  const modo = proveedor?.getDataValue?.('regla_codigo_modo') ?? proveedor?.regla_codigo_modo;
  if (!esReglaValida(regla)) return null;
  return { regla, modo: modo === 'AUTO' ? 'AUTO' : 'SUGERENCIA' };
}

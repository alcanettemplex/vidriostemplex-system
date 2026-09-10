// Caché en memoria del módulo Cotizador.
//
// NO es una optimización de egress: es el adaptador que hace posible el port.
// Los motores de cálculo portados (motorDespiece, cotizarPorDiseno, catalogo,
// aptitudOrden y los 6 módulos de producto) son SÍNCRONOS de punta a punta —
// cero async/await en ~4.800 líneas — y Sequelize es asíncrono. Todo lo que
// esos motores leen tiene que estar ya en RAM antes del primer request, así
// que se precarga una vez al arrancar y se invalida explícitamente tras cada
// escritura.
//
// Se precarga incluso la calibración, que por ser mutable durante el día uno
// dejaría fuera por instinto: motorDespiece la lee de forma síncrona.
//
// Invariante de atomicidad: `datos` se reemplaza SIEMPRE por un objeto nuevo
// y completo. Nunca se muta un bucket en sitio. Como Node es monohilo y no hay
// await entre la construcción y la asignación, ningún motor puede observar un
// estado a medias.
import {
  CotizadorProducto,
  CotizadorPrecioOverride,
  CotizadorParametro,
  CotizadorDiseno,
  CotizadorDisenoPerfil,
  CotizadorDisenoVidrio,
  CotizadorDisenoAccesorio,
  CotizadorMapeoAccesorio,
  CotizadorAccesorioSistemaActivo,
  CotizadorGeometriaOverride,
  CotizadorCalibracionMargen,
  CotizadorCalibracionHolgura,
  CotizadorCalibracionSistema,
} from '../models';
import type {
  Bucket,
  DatosCotizador,
  Diseno,
  DisenoAccesorio,
  DisenoPerfil,
  DisenoVidrio,
  GeometriaOverrides,
  Holgura,
  Holguras,
  MapeoAccesorio,
  MapeoAccesorios,
  Margenes,
  Parametros,
  Producto,
  Sistemas,
} from './tipos';

export class CotizadorNoDisponibleError extends Error {
  constructor(detalle: string) {
    super(`El módulo Cotizador no está disponible: ${detalle}`);
    this.name = 'CotizadorNoDisponibleError';
  }
}

type EstadoCache = 'vacia' | 'cargando' | 'lista' | 'error';

let estado: EstadoCache = 'vacia';
let datos: DatosCotizador | null = null;
let ultimoError: string | null = null;
let cargadoEn: Date | null = null;
const sucios = new Set<Bucket>();

// ─── Carga de cada bucket ───────────────────────────────────────────────────

/** Resuelve los productos aplicando la precedencia del origen. Las tres capas
 * de abajo (provisional < alta < catálogo real) ya vienen colapsadas en una
 * sola tabla por el discriminador `origen` — la migración verificó que no hay
 * un solo código repetido entre ellas —, así que aquí solo queda aplicar la
 * cuarta: el override, que gana siempre y se mezcla campo a campo.
 *
 * Un campo NULL del override significa "no opina sobre este campo", que es
 * exactamente la semántica que tenía la ausencia de la clave en el JSON. */
async function cargarProductos(): Promise<Map<string, Producto>> {
  const [filas, overrides] = await Promise.all([
    CotizadorProducto.findAll({ raw: true }),
    CotizadorPrecioOverride.findAll({ raw: true }),
  ]);

  const mapa = new Map<string, Producto>();
  for (const f of filas as unknown as Record<string, unknown>[]) {
    const base: Producto = {
      codigo: f.codigo as string,
      descripcion: f.descripcion as string,
      categoria: f.categoria as string,
      unidad: f.unidad as string,
      costo_unitario: f.costo_unitario as number,
      precio_pa: f.precio_pa as number,
      precio_pm: f.precio_pm as number,
      precio_pb: f.precio_pb as number,
      activo: true,
    };
    // Los metadatos de procedencia solo existen en los provisionales. No se
    // emiten como null en los demás: un producto de catálogo tiene exactamente
    // 9 claves, igual que en catalogo.json, y el golden master compara con
    // deepStrictEqual.
    if (f.origen === 'PROVISIONAL') {
      base.provisional = true;
      if (f.referencia != null) base.referencia = f.referencia as string;
      if (f.color != null) base.color = f.color as string;
      if (f.fuente != null) base.fuente = f.fuente as string;
      if (f.acabado_exacto != null) base.acabadoExacto = f.acabado_exacto as boolean;
      if (f.sospechoso_valor_por_defecto != null) {
        base.sospechosoValorPorDefecto = f.sospechoso_valor_por_defecto as boolean;
      }
    }
    mapa.set(base.codigo, base);
  }

  for (const ov of overrides as unknown as Record<string, unknown>[]) {
    const codigo = ov.codigo as string;
    // Un override cuyo código no resuelve se conserva igual, para no perder el
    // dato en silencio (misma regla que proveedorLocal.js).
    const base = mapa.get(codigo) ?? ({ codigo, activo: true } as Producto);
    const resuelto: Producto = { ...base, codigo };
    for (const campo of ['precio_pa', 'precio_pm', 'precio_pb', 'costo_unitario'] as const) {
      if (ov[campo] != null) resuelto[campo] = ov[campo] as number;
    }
    if (ov.activo != null) resuelto.activo = ov.activo as boolean;
    if (ov.fecha != null) {
      resuelto.ultimoCambio = {
        fecha: aIso(ov.fecha),
        por: (ov.por as string | null) ?? null,
        motivo: (ov.motivo as string | null) ?? null,
      };
    }
    mapa.set(codigo, resuelto);
  }

  return mapa;
}

async function cargarParametros(): Promise<Parametros> {
  const fila = (await CotizadorParametro.findByPk(1, { raw: true })) as unknown as Record<
    string,
    unknown
  > | null;
  if (!fila) throw new Error('No existe la fila de parámetros (cotizador_parametro id=1).');
  return {
    aiu: fila.aiu as number,
    iva: fila.iva as number,
    clientes: fila.clientes as string[],
    flete_fijo: fila.flete_fijo as number,
    smo: {
      tarifaMinima: fila.smo_tarifa_minima as number,
      pisoTableroGrande: fila.smo_piso_tablero_grande as number,
    },
    asesores: fila.asesores as string[],
    estados_cotizacion: fila.estados_cotizacion as string[],
  };
}

/** Reconstruye los diseños en el camelCase que esperan los motores, tal como
 * venían de disenos.json. Se hacen 4 queries planas y se agrupa en memoria en
 * vez de un include anidado: son ~2.400 filas y el include produciría un
 * producto cartesiano de perfiles × vidrios × accesorios. */
async function cargarDisenos(): Promise<{ mapa: Map<string, Diseno>; ordenados: Diseno[] }> {
  const [cabeceras, perfiles, vidrios, accesorios] = await Promise.all([
    CotizadorDiseno.findAll({ raw: true }),
    CotizadorDisenoPerfil.findAll({ order: [['diseno_id', 'ASC'], ['orden', 'ASC']], raw: true }),
    CotizadorDisenoVidrio.findAll({ order: [['diseno_id', 'ASC'], ['orden', 'ASC']], raw: true }),
    CotizadorDisenoAccesorio.findAll({ order: [['diseno_id', 'ASC'], ['orden', 'ASC']], raw: true }),
  ]);

  const perfilesPorDiseno = agrupar(perfiles as unknown as Record<string, unknown>[], 'diseno_id');
  const vidriosPorDiseno = agrupar(vidrios as unknown as Record<string, unknown>[], 'diseno_id');
  const accesoriosPorDiseno = agrupar(accesorios as unknown as Record<string, unknown>[], 'diseno_id');

  const ordenados: Diseno[] = [];
  const mapa = new Map<string, Diseno>();

  for (const c of cabeceras as unknown as Record<string, unknown>[]) {
    const id = c.id as string;
    const diseno: Diseno = {
      id,
      modulo: c.modulo as string,
      sistema: c.sistema as string,
      diseno: c.diseno as string,
      etiqueta: (c.etiqueta as string | null) ?? null,
      paneles: (c.paneles as number | null) ?? null,
      nivelCorte: c.nivel_corte as string,
      nivelVidrio: (c.nivel_vidrio as string | null) ?? null,
      nivelPerfiles: (c.nivel_perfiles as string | null) ?? null,
      medidasRespaldo: (c.medidas_respaldo as number | null) ?? null,
      cotizable: c.cotizable as boolean,
      refsSinPrecio: (c.refs_sin_precio as string[]) ?? [],
      perfiles: (perfilesPorDiseno.get(id) ?? []).map(
        (p): DisenoPerfil => ({
          ref: p.ref as string,
          refOriginal: (p.ref_original as string | null) ?? null,
          descripcion: (p.descripcion as string | null) ?? null,
          cantidad: p.cantidad as number,
          desperdicioPct: p.desperdicio_pct as number,
          formula: { a: p.formula_a as number, b: p.formula_b as number, c: p.formula_c as number },
          nivelCorte: p.nivel_corte as string,
          codigosPorColor: vacioANull(p.codigos_por_color as Record<string, string> | null),
          esAlfajia: p.es_alfajia as boolean,
        })
      ),
      vidrios: (vidriosPorDiseno.get(id) ?? []).map(
        (v): DisenoVidrio => ({
          descripcion: (v.descripcion as string | null) ?? null,
          cantidad: v.cantidad as number,
          desperdicioPct: v.desperdicio_pct as number,
          formulaAncho: {
            a: v.formula_ancho_a as number,
            b: v.formula_ancho_b as number,
            c: v.formula_ancho_c as number,
          },
          formulaAlto: {
            a: v.formula_alto_a as number,
            b: v.formula_alto_b as number,
            c: v.formula_alto_c as number,
          },
          nivelRiesgo: (v.nivel_riesgo as string | null) ?? null,
        })
      ),
      accesorios: (accesoriosPorDiseno.get(id) ?? []).map(
        (a): DisenoAccesorio => ({
          descripcion: a.descripcion as string,
          cantidad: (a.cantidad as number | null) ?? null,
          formula: a.formula ?? null,
        })
      ),
    };
    mapa.set(id, diseno);
    ordenados.push(diseno);
  }

  return { mapa, ordenados };
}

/** Reconstruye las tres formas que los motores esperan de storeCalibracion.
 *
 * AUSENTE ≠ CERO: solo entran las filas `vigente`. Un margen ausente es la
 * falta de fila (queda `null` / clave inexistente); un margen de cero es una
 * fila vigente con `margen_mm = 0`. Confundirlos haría que el sistema creyera
 * calibrado lo que nadie midió. */
async function cargarCalibracion(): Promise<{
  margenes: Margenes;
  holguras: Holguras;
  sistemas: Sistemas;
}> {
  const [margenesFilas, holgurasFilas, sistemasFilas] = await Promise.all([
    CotizadorCalibracionMargen.findAll({ where: { vigente: true }, raw: true }),
    CotizadorCalibracionHolgura.findAll({ where: { vigente: true }, raw: true }),
    CotizadorCalibracionSistema.findAll({ raw: true }),
  ]);

  const margenes: Margenes = { global: null, sistema: {}, material: {}, pieza: {} };
  for (const m of margenesFilas as unknown as Record<string, unknown>[]) {
    const ambito = m.ambito as 'global' | 'sistema' | 'material' | 'pieza';
    if (ambito === 'global') margenes.global = m.margen_mm as number;
    else margenes[ambito][m.clave as string] = m.margen_mm as number;
  }

  const holguras: Holguras = { global: null, sistema: {} };
  for (const h of holgurasFilas as unknown as Record<string, unknown>[]) {
    const valor: Holgura = {
      anchoMm: h.ancho_mm as number,
      altoMm: h.alto_mm as number,
      nota: (h.nota as string | null) ?? null,
      definidoEn: aIso(h.definido_en),
      definidoPor: (h.definido_por as string | null) ?? null,
    };
    if (h.ambito === 'global') holguras.global = valor;
    else holguras.sistema[h.sistema as string] = valor;
  }

  const sistemas: Sistemas = {};
  for (const s of sistemasFilas as unknown as Record<string, unknown>[]) {
    sistemas[s.sistema as string] = {
      estado: s.estado as string,
      firmaMaestro: s.firma_maestro as boolean,
      actualizadoEn: s.actualizado_en ? aIso(s.actualizado_en) : null,
      actualizadoPor: (s.actualizado_por as string | null) ?? null,
    };
  }

  return { margenes, holguras, sistemas };
}

async function cargarAccesorios(): Promise<MapeoAccesorios> {
  const [filas, activos] = await Promise.all([
    CotizadorMapeoAccesorio.findAll({ raw: true }),
    CotizadorAccesorioSistemaActivo.findAll({ raw: true }),
  ]);

  const accesorios: Record<string, MapeoAccesorio> = {};
  for (const f of filas as unknown as Record<string, unknown>[]) {
    const entrada: MapeoAccesorio = { estado: f.estado as MapeoAccesorio['estado'] };
    if (f.codigo != null) entrada.codigo = f.codigo as string;
    if (f.consumo != null) entrada.consumo = f.consumo as MapeoAccesorio['consumo'];
    if (f.nota != null) entrada.nota = f.nota as string;
    if (f.confianza != null) entrada.confianza = f.confianza as string;
    accesorios[f.descripcion as string] = entrada;
  }

  return {
    sistemasActivos: (activos as unknown as Record<string, unknown>[]).map((a) => a.sistema as string),
    accesorios,
  };
}

async function cargarGeometria(): Promise<GeometriaOverrides> {
  const filas = await CotizadorGeometriaOverride.findAll({ raw: true });
  const overrides: GeometriaOverrides = {};
  for (const f of filas as unknown as Record<string, unknown>[]) {
    overrides[f.diseno_id as string] = f.asignacion;
  }
  return overrides;
}

// ─── Precarga e invalidación ────────────────────────────────────────────────

async function construirTodo(): Promise<DatosCotizador> {
  const [productos, parametros, disenos, calibracion, mapeoAccesorios, geometriaOverrides] =
    await Promise.all([
      cargarProductos(),
      cargarParametros(),
      cargarDisenos(),
      cargarCalibracion(),
      cargarAccesorios(),
      cargarGeometria(),
    ]);

  verificarTipos(productos);

  return {
    productos,
    parametros,
    disenos: disenos.mapa,
    disenosOrdenados: disenos.ordenados,
    margenes: calibracion.margenes,
    holguras: calibracion.holguras,
    sistemas: calibracion.sistemas,
    mapeoAccesorios,
    geometriaOverrides,
  };
}

/** Falla ruidosa al arrancar en vez de aritmética silenciosamente rota más
 * tarde: si alguna columna de precio llegara como string (lo que ocurre si
 * alguien cambia una columna a NUMERIC, porque el driver `pg` devuelve NUMERIC
 * como texto), los motores concatenarían en vez de sumar sin lanzar ningún
 * error. */
function verificarTipos(productos: Map<string, Producto>): void {
  for (const p of productos.values()) {
    for (const campo of ['precio_pa', 'precio_pm', 'precio_pb', 'costo_unitario'] as const) {
      const valor = p[campo];
      if (valor != null && typeof valor !== 'number') {
        throw new Error(
          `El producto ${p.codigo} devolvió ${campo} como ${typeof valor}. ` +
            `Alguna columna de precio dejó de ser double precision: los motores harían aritmética de strings.`
        );
      }
    }
    break; // Una muestra basta: el tipo lo fija la columna, no la fila.
  }
}

export async function precargar(): Promise<void> {
  estado = 'cargando';
  try {
    const nuevos = await construirTodo();
    datos = nuevos;
    estado = 'lista';
    ultimoError = null;
    cargadoEn = new Date();
    sucios.clear();
    console.log(
      `[Cotizador] Caché lista: ${nuevos.productos.size} productos, ${nuevos.disenosOrdenados.length} diseños.`
    );
  } catch (e) {
    estado = 'error';
    ultimoError = e instanceof Error ? e.message : String(e);
    throw e;
  }
}

/**
 * Invalida y recarga un bucket. Debe llamarse DESPUÉS del commit, nunca dentro
 * de la transacción: dentro leería un estado que aún nadie más ve, y un
 * rollback posterior dejaría la caché envenenada con datos que no existen.
 *
 * Si la recarga falla, la escritura ya está persistida: se marca el bucket
 * sucio y se sigue sirviendo lo anterior, en vez de dejar el módulo caído.
 */
export async function recargar(bucket: Bucket): Promise<void> {
  if (!datos) {
    await precargar();
    return;
  }
  try {
    const anterior = datos;
    switch (bucket) {
      case 'precios': {
        const [productos, parametros] = await Promise.all([cargarProductos(), cargarParametros()]);
        datos = { ...anterior, productos, parametros };
        break;
      }
      case 'disenos': {
        const { mapa, ordenados } = await cargarDisenos();
        datos = { ...anterior, disenos: mapa, disenosOrdenados: ordenados };
        break;
      }
      case 'calibracion': {
        const { margenes, holguras, sistemas } = await cargarCalibracion();
        datos = { ...anterior, margenes, holguras, sistemas };
        break;
      }
      case 'accesorios':
        datos = { ...anterior, mapeoAccesorios: await cargarAccesorios() };
        break;
      case 'geometria':
        datos = { ...anterior, geometriaOverrides: await cargarGeometria() };
        break;
    }
    sucios.delete(bucket);
  } catch (e) {
    sucios.add(bucket);
    console.error(
      `[Cotizador] Falló la recarga del bucket "${bucket}"; se sigue sirviendo la copia anterior:`,
      e instanceof Error ? e.message : e
    );
  }
}

/** Deja el módulo fuera de servicio sin tumbar el ERP. Lo llama server.ts si la
 * precarga falla al arrancar. */
export function marcarIndisponible(detalle: string): void {
  estado = 'error';
  ultimoError = detalle;
  datos = null;
}

export function disponible(): boolean {
  return estado === 'lista' && datos !== null;
}

export function diagnostico() {
  return {
    estado,
    disponible: disponible(),
    cargadoEn: cargadoEn ? cargadoEn.toISOString() : null,
    ultimoError,
    bucketsSucios: [...sucios],
    conteos: datos
      ? {
          productos: datos.productos.size,
          disenos: datos.disenosOrdenados.length,
          mapeoAccesorios: Object.keys(datos.mapeoAccesorios.accesorios).length,
        }
      : null,
  };
}

// ─── Lectura síncrona (lo que consumen los motores) ─────────────────────────

function exigirDatos(): DatosCotizador {
  if (estado !== 'lista' || !datos) {
    throw new CotizadorNoDisponibleError(ultimoError ?? `la caché está en estado "${estado}"`);
  }
  return datos;
}

export function getProductos(): Map<string, Producto> {
  return exigirDatos().productos;
}
export function getParametros(): Parametros {
  return exigirDatos().parametros;
}
export function getDisenos(): Diseno[] {
  return exigirDatos().disenosOrdenados;
}
export function getDiseno(id: string): Diseno | null {
  return exigirDatos().disenos.get(id) ?? null;
}
export function getMargenes(): Margenes {
  return exigirDatos().margenes;
}
export function getHolguras(): Holguras {
  return exigirDatos().holguras;
}
export function getSistemas(): Sistemas {
  return exigirDatos().sistemas;
}
export function getMapeoAccesorios(): MapeoAccesorios {
  return exigirDatos().mapeoAccesorios;
}
export function getGeometriaOverrides(): GeometriaOverrides {
  return exigirDatos().geometriaOverrides;
}

// ─── Utilidades ─────────────────────────────────────────────────────────────

function agrupar(
  filas: Record<string, unknown>[],
  clave: string
): Map<string, Record<string, unknown>[]> {
  const mapa = new Map<string, Record<string, unknown>[]>();
  for (const f of filas) {
    const k = f[clave] as string;
    const lista = mapa.get(k);
    if (lista) lista.push(f);
    else mapa.set(k, [f]);
  }
  return mapa;
}

/** La columna `codigos_por_color` es NOT NULL y guarda `{}` cuando el perfil no
 * tiene códigos por acabado; el `disenos.json` de origen ponía `null`. Se
 * devuelve `null` para que la caché sea indistinguible del archivo que los
 * motores leían. */
function vacioANull(valor: Record<string, string> | null): Record<string, string> | null {
  if (!valor || Object.keys(valor).length === 0) return null;
  return valor;
}

/** Las columnas DATE vuelven como Date; el origen las emitía como string ISO. */
function aIso(valor: unknown): string {
  if (valor instanceof Date) return valor.toISOString();
  return String(valor);
}

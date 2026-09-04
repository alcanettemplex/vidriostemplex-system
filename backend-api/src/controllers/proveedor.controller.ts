import { Request, Response } from 'express';
import { Op, Transaction, fn, col } from 'sequelize';
import { z } from 'zod';
import * as XLSX from 'xlsx';
import multer from 'multer';
import sequelize from '../config/database';
import {
  Proveedor,
  ProveedorProducto,
  ProveedorProductoPrecio,
  ProveedorCodigoPendiente,
  FacturaProveedorProcesada,
  ProductoAlias,
  CatalogoProducto,
  ConfiguracionGlobal,
} from '../models';
import { procesarBufferFactura, derivarCodigo, FacturaParseada } from '../utils/dianXmlParser';

// ─── Constantes de dominio ────────────────────────────────────────────────────

const UNIDADES_COMPRA = ['UNIDAD', 'TIRA_6M', 'METRO', 'KG', 'M2', 'ML'] as const;
const MAX_PAGINA = 200;

// ─── Helpers internos ─────────────────────────────────────────────────────────

/** Deja solo los dígitos de un NIT/cédula: "NIT 900149483-1" → "9001494831" → "900149483".
 *  El dígito de verificación se descarta cuando viene separado, que es como lo traen
 *  tanto World Office como el XML DIAN. */
function normalizarNit(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const soloDigitos = String(valor).replace(/\D/g, '');
  return soloDigitos.length >= 6 ? soloDigitos : null;
}

/** Normaliza un nombre para comparar sin depender de mayúsculas, tildes ni dobles espacios */
function normalizarNombre(valor: string | null | undefined): string {
  if (!valor) return '';
  return String(valor)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Fecha ISO (YYYY-MM-DD) de un valor que puede ser Date, string ISO o DATEONLY */
function aFechaISO(valor: any): string | null {
  if (!valor) return null;
  if (typeof valor === 'string') return valor.split('T')[0];
  try {
    return new Date(valor).toISOString().split('T')[0];
  } catch {
    return null;
  }
}

/** Caché en memoria del umbral: se leía de la BD una vez por cada cambio de precio,
 *  lo que en un lote de 100 facturas significaba cientos de consultas idénticas. */
let umbralCache: { valor: number; expira: number } | null = null;

/** La pantalla de configuración llama a esto al guardar: sin invalidar, cambiar el
 *  umbral no tenía efecto visible hasta que expirara la caché y parecía no funcionar. */
export function invalidarCacheUmbral(): void {
  umbralCache = null;
}

async function obtenerUmbral(): Promise<number> {
  if (umbralCache && umbralCache.expira > Date.now()) return umbralCache.valor;
  const config = await ConfiguracionGlobal.findOne({
    where: { id: 1 },
    attributes: ['umbral_variacion_precio_pct'],
  });
  const valor = (config?.getDataValue('umbral_variacion_precio_pct') as number) ?? 30;
  umbralCache = { valor, expira: Date.now() + 60_000 };
  return valor;
}

interface ResultadoPrecio {
  cambio: boolean;
  anomalo: boolean;
  variacionPct: number | null;
  retroactivo: boolean;
}

interface OpcionesPrecio {
  origen: 'MANUAL' | 'LISTA' | 'FACTURA';
  registradoPor: number | null;
  documentoRef?: string | null;
  cufe?: string | null;
  porcentajeIva?: number | null;
  lineasEnFactura?: number;
  transaction?: Transaction;
}

/**
 * Actualiza el precio vigente de un ProveedorProducto y corre la denormalización.
 *
 * Tres reglas que sostienen todo el módulo:
 *  · El histórico registra CAMBIOS de precio, no apariciones del producto.
 *  · El precio vigente lo define la FECHA DE LA FACTURA, no el orden de carga: una
 *    factura anterior a la vigente se archiva en el histórico sin desplazar nada.
 *    Sin esto, arrastrar un lote con fechas mezcladas deja como "precio actual" el
 *    de la factura más antigua del montón.
 *  · Un salto mayor al umbral configurado se marca como anómalo, no se registra en
 *    silencio.
 */
async function actualizarPrecio(
  pp: any,
  nuevoPrecio: number,
  fechaVigencia: string,
  opciones: OpcionesPrecio
): Promise<ResultadoPrecio> {
  const { origen, registradoPor, documentoRef = null, cufe = null, porcentajeIva = null, lineasEnFactura = 1, transaction } = opciones;

  const precioActualRaw = pp.getDataValue('precio_actual');
  const precioActual = precioActualRaw === null || precioActualRaw === undefined ? null : parseFloat(precioActualRaw);
  const fechaActual = aFechaISO(pp.getDataValue('fecha_precio_actual'));

  // Documento anterior al precio vigente: se archiva sin tocar el actual.
  const esRetroactivo = !!(fechaActual && fechaVigencia < fechaActual);

  // Precio idéntico al vigente: solo se confirma la fecha, no se ensucia el histórico.
  if (!esRetroactivo && precioActual !== null && precioActual === nuevoPrecio) {
    await pp.update({ fecha_precio_actual: fechaVigencia }, { transaction });
    return { cambio: false, anomalo: false, variacionPct: null, retroactivo: false };
  }

  // Variación porcentual respecto al precio anterior
  let variacionPct: number | null = null;
  let anomalo = false;
  if (precioActual !== null && precioActual > 0) {
    variacionPct = ((nuevoPrecio - precioActual) / precioActual) * 100;
    const umbral = await obtenerUmbral();
    anomalo = Math.abs(variacionPct) > umbral;
  }

  if (!esRetroactivo) {
    // Denormalización: actual → anterior_1 → anterior_2
    await pp.update(
      {
        precio_anterior_2: pp.getDataValue('precio_anterior_1'),
        fecha_anterior_2: pp.getDataValue('fecha_anterior_1'),
        precio_anterior_1: pp.getDataValue('precio_actual'),
        fecha_anterior_1: pp.getDataValue('fecha_precio_actual'),
        precio_actual: nuevoPrecio,
        fecha_precio_actual: fechaVigencia,
      },
      { transaction }
    );
  }

  await ProveedorProductoPrecio.create(
    {
      proveedor_producto_id: pp.getDataValue('id'),
      precio: nuevoPrecio,
      fecha_vigencia: fechaVigencia,
      origen,
      documento_ref: documentoRef,
      cufe,
      registrado_por: registradoPor,
      precio_anomalo: anomalo,
      variacion_pct: variacionPct,
      porcentaje_iva: porcentajeIva,
      lineas_en_factura: lineasEnFactura,
      retroactivo: esRetroactivo,
    },
    { transaction }
  );

  return { cambio: !esRetroactivo, anomalo, variacionPct, retroactivo: esRetroactivo };
}

/** Respuesta de error uniforme: mensaje accionable para el usuario, detalle técnico al log. */
function fallar(res: Response, status: number, mensaje: string, err?: any) {
  if (err) console.error(`[proveedores] ${mensaje}:`, err?.message ?? err);
  return res.status(status).json({ error: mensaje });
}

/** Traduce un error de Sequelize a un mensaje que el usuario pueda entender y resolver */
function mensajeDeError(err: any, accionFallida: string): { status: number; mensaje: string } {
  if (err?.name === 'SequelizeUniqueConstraintError') {
    return { status: 409, mensaje: `${accionFallida}: ya existe un registro con esos datos.` };
  }
  if (err?.name === 'SequelizeForeignKeyConstraintError') {
    return { status: 409, mensaje: `${accionFallida}: el registro está referenciado por otros datos y no puede modificarse.` };
  }
  if (err?.name === 'SequelizeValidationError') {
    return { status: 400, mensaje: `${accionFallida}: revisa los campos, hay valores fuera de lo esperado.` };
  }
  return { status: 500, mensaje: `${accionFallida}. Vuelve a intentarlo; si persiste, avisa al administrador.` };
}

// ─── Esquemas de validación ───────────────────────────────────────────────────

const proveedorSchema = z.object({
  nit: z.string().trim().max(20).optional().nullable(),
  tipo_identificacion: z.string().trim().max(20).optional(),
  numero_identificacion: z.string().trim().max(30).optional().nullable(),
  nombre_comercial: z.string().trim().min(1, 'El nombre comercial es obligatorio').max(255),
  razon_social: z.string().trim().max(255).optional().nullable(),
  contacto_nombre: z.string().trim().max(150).optional().nullable(),
  telefono: z.string().trim().max(30).optional().nullable(),
  email: z.string().trim().max(150).optional().nullable(),
  direccion: z.string().trim().optional().nullable(),
  notas: z.string().trim().optional().nullable(),
  codigo_world_office: z.string().trim().max(50).optional().nullable(),
  seguir_precios: z.boolean().optional(),
}).strict();

const proveedorUpdateSchema = proveedorSchema.partial().extend({
  activo: z.boolean().optional(),
}).strict();

const precioManualSchema = z.object({
  catalogo_producto_id: z.coerce.number().int().positive(),
  codigo_proveedor: z.string().trim().max(100).optional().nullable(),
  descripcion_proveedor: z.string().trim().optional().nullable(),
  unidad_compra: z.enum(UNIDADES_COMPRA).default('UNIDAD'),
  precio: z.coerce.number().positive('El precio debe ser mayor a cero'),
  fecha_precio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  guardar_alias: z.boolean().default(true),
}).strict();

const vincularSchema = z.object({
  catalogo_producto_id: z.coerce.number().int().positive(),
  unidad_compra: z.enum(UNIDADES_COMPRA).default('UNIDAD'),
  precio: z.coerce.number().positive().optional(),
  fecha_precio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  guardar_alias: z.boolean().default(true),
  descripcion_alias: z.string().trim().optional().nullable(),
}).strict();

const editarPrecioSchema = z.object({
  precio: z.coerce.number().positive().optional(),
  fecha_precio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  codigo_proveedor: z.string().trim().max(100).optional().nullable(),
  descripcion_proveedor: z.string().trim().optional().nullable(),
  unidad_compra: z.enum(UNIDADES_COMPRA).optional(),
}).strict();

/** Extrae el primer mensaje legible de un ZodError (zod v4 expone `issues`) */
function mensajeZod(err: z.ZodError): string {
  const primero = err.issues[0];
  const campo = primero?.path?.join('.') || 'dato';
  if (!primero) return 'Los datos enviados no son válidos.';
  if (primero.code === 'invalid_type' && (primero as any).input === undefined) {
    return `Falta el campo obligatorio "${campo}".`;
  }
  if (primero.code === 'unrecognized_keys') {
    return `El campo "${(primero as any).keys?.join(', ') ?? campo}" no es válido para esta operación.`;
  }
  return `${primero.message} (campo "${campo}").`;
}

// ─── Multer en memoria para el Excel de proveedores ───────────────────────────
export const uploadExcel = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const ext = file.originalname.toLowerCase();
    if (ext.endsWith('.xlsx') || ext.endsWith('.xls')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se aceptan archivos Excel (.xlsx, .xls)'));
    }
  },
}).single('archivo');

// ─── Multer en memoria para Facturas Electrónicas (.zip y .xml) ────────────────
// `fileSize` es POR ARCHIVO, no por lote: con 100 archivos permitidos, un tope de
// 100 MB dejaba entrar hasta 10 GB en memoria. Los .zip de FE pesan pocos cientos
// de KB, así que 8 MB por archivo es holgado y acota el lote a ~800 MB en el peor caso.
export const uploadFacturas = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024,
    files: 100,
    fields: 10,
  },
  fileFilter: (_req, file, cb) => {
    const ext = file.originalname.toLowerCase();
    if (ext.endsWith('.zip') || ext.endsWith('.xml')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se aceptan archivos comprimidos .zip o facturas .xml'));
    }
  },
}).array('archivos', 100);

// ─── GET /api/proveedores ─────────────────────────────────────────────────────
export const listarProveedores = async (req: Request, res: Response) => {
  try {
    const { activo, q, compacto } = req.query;
    const where: any = {};
    if (activo !== undefined) where.activo = activo === 'true';
    if (q) {
      const term = `%${String(q).trim()}%`;
      where[Op.or] = [
        { nombre_comercial: { [Op.iLike]: term } },
        { nit: { [Op.iLike]: term } },
        { razon_social: { [Op.iLike]: term } },
      ];
    }

    // Modo compacto: las pantallas que solo necesitan poblar un selector no tienen
    // por qué descargar el maestro completo con todas sus columnas.
    const attributes = compacto === 'true'
      ? ['id', 'nombre_comercial', 'seguir_precios']
      : ['id', 'nit', 'nombre_comercial', 'razon_social', 'telefono', 'email', 'activo',
         'tipo_identificacion', 'numero_identificacion', 'seguir_precios', 'origen_registro'];

    const proveedores = await Proveedor.findAll({
      where,
      order: [['nombre_comercial', 'ASC']],
      attributes,
    });
    res.json(proveedores);
  } catch (err: any) {
    const { status, mensaje } = mensajeDeError(err, 'No se pudo cargar la lista de proveedores');
    fallar(res, status, mensaje, err);
  }
};

// ─── POST /api/proveedores ────────────────────────────────────────────────────
export const crearProveedor = async (req: Request, res: Response) => {
  try {
    const datos = proveedorSchema.parse(req.body);
    const proveedor = await Proveedor.create({
      ...datos,
      nit: datos.nit || null,
      tipo_identificacion: datos.tipo_identificacion || 'NIT',
      origen_registro: 'MANUAL',
    });
    res.status(201).json(proveedor);
  } catch (err: any) {
    if (err instanceof z.ZodError) return fallar(res, 400, mensajeZod(err));
    if (err.name === 'SequelizeUniqueConstraintError') {
      return fallar(res, 409, 'Ya existe un proveedor registrado con ese NIT.');
    }
    const { status, mensaje } = mensajeDeError(err, 'No se pudo crear el proveedor');
    fallar(res, status, mensaje, err);
  }
};

// ─── PATCH /api/proveedores/:id ───────────────────────────────────────────────
export const editarProveedor = async (req: Request, res: Response) => {
  try {
    const datos = proveedorUpdateSchema.parse(req.body);
    const proveedor = await Proveedor.findByPk(req.params.id);
    if (!proveedor) return fallar(res, 404, 'El proveedor no existe o fue eliminado.');
    await proveedor.update(datos);
    res.json(proveedor);
  } catch (err: any) {
    if (err instanceof z.ZodError) return fallar(res, 400, mensajeZod(err));
    const { status, mensaje } = mensajeDeError(err, 'No se pudo guardar el proveedor');
    fallar(res, status, mensaje, err);
  }
};

// ─── DELETE /api/proveedores/:id ──────────────────────────────────────────────
export const desactivarProveedor = async (req: Request, res: Response) => {
  try {
    const proveedor = await Proveedor.findByPk(req.params.id);
    if (!proveedor) return fallar(res, 404, 'El proveedor no existe o fue eliminado.');
    await proveedor.update({ activo: false });
    res.json({ message: 'Proveedor desactivado' });
  } catch (err: any) {
    const { status, mensaje } = mensajeDeError(err, 'No se pudo desactivar el proveedor');
    fallar(res, status, mensaje, err);
  }
};

// ─── PATCH /api/proveedores/:id/seguimiento ───────────────────────────────────
/**
 * Enciende o apaga el seguimiento de precios de un proveedor. Al apagarlo, sus
 * códigos pendientes se descartan de una vez: es la acción que limpia la bandeja
 * cuando el emisor es una gasolinera, un parqueadero o la papelería.
 */
export const cambiarSeguimiento = async (req: Request, res: Response) => {
  const t = await sequelize.transaction();
  try {
    const seguir = req.body?.seguir_precios;
    if (typeof seguir !== 'boolean') {
      await t.rollback();
      return fallar(res, 400, 'Indica si el proveedor debe seguirse o no (seguir_precios: true | false).');
    }

    const proveedor = await Proveedor.findByPk(req.params.id, { transaction: t });
    if (!proveedor) {
      await t.rollback();
      return fallar(res, 404, 'El proveedor no existe o fue eliminado.');
    }

    await proveedor.update({ seguir_precios: seguir }, { transaction: t });

    let descartados = 0;
    if (!seguir) {
      const [afectados] = await ProveedorCodigoPendiente.update(
        { estado: 'DESCARTADO' },
        {
          where: { proveedor_id: proveedor.getDataValue('id'), estado: 'PENDIENTE' },
          transaction: t,
          individualHooks: true, // los hooks de auditoría no disparan en operaciones bulk
        }
      );
      descartados = afectados;
    }

    await t.commit();
    res.json({
      message: seguir
        ? 'Se reanudó el seguimiento de precios de este proveedor'
        : `Se dejó de seguir a este proveedor${descartados ? ` y se descartaron ${descartados} código(s) de su bandeja` : ''}`,
      seguir_precios: seguir,
      codigos_descartados: descartados,
    });
  } catch (err: any) {
    await t.rollback();
    const { status, mensaje } = mensajeDeError(err, 'No se pudo cambiar el seguimiento del proveedor');
    fallar(res, status, mensaje, err);
  }
};

// ─── POST /api/proveedores/importar-excel ─────────────────────────────────────
/**
 * Importa el archivo proveedores_limpio.xlsx generado por el script de limpieza.
 * Optimizado: lee existentes en memoria y usa bulkCreate para procesar 1.805 filas
 * en ~1 segundo. Corre con hooks desactivados a propósito: auditar fila por fila una
 * carga masiva del maestro llenaría auditoria_log sin aportar trazabilidad útil.
 */
export const importarExcel = async (req: Request, res: Response) => {
  try {
    if (!req.file) return fallar(res, 400, 'No se recibió ningún archivo. Selecciona el Excel de proveedores.');

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames.includes('Proveedores_Limpios')
      ? 'Proveedores_Limpios'
      : workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows: any[] = XLSX.utils.sheet_to_json(sheet);

    if (!rows || rows.length === 0) {
      return fallar(res, 400, 'El archivo no tiene filas para importar. Verifica que sea el Excel correcto.');
    }

    // 1. Cargar todos los proveedores existentes en memoria
    const existentes = await Proveedor.findAll({
      attributes: ['id', 'nit', 'nombre_comercial', 'tipo_identificacion', 'numero_identificacion'],
    });

    const mapaPorNit = new Map<string, any>();
    const mapaPorNombre = new Map<string, any>();

    for (const p of existentes) {
      const nitVal = p.getDataValue('nit');
      const nombreVal = p.getDataValue('nombre_comercial');
      if (nitVal) mapaPorNit.set(String(nitVal).trim().toLowerCase(), p);
      if (nombreVal) mapaPorNombre.set(String(nombreVal).trim().toLowerCase(), p);
    }

    const nuevos: any[] = [];
    const paraActualizar: Array<{ instancia: any; nombre: string; tipoId: string; numeroId: string | null }> = [];
    const nitsProcesados = new Set<string>();
    const nombresProcesados = new Set<string>();

    let omitidos = 0;
    const errores: string[] = [];

    for (const row of rows) {
      const nombre = String(row['Nombre'] ?? '').trim();
      const tipoId = String(row['Tipo_ID'] ?? 'NIT').trim();
      const numeroId = String(row['Numero_ID'] ?? '').trim();

      if (!nombre || nombre.length <= 2) {
        omitidos++;
        continue;
      }

      const nit = tipoId === 'NIT' && numeroId ? numeroId : null;
      const nitKey = nit ? nit.toLowerCase() : null;
      const nombreKey = nombre.toLowerCase();

      // Evitar duplicados dentro del mismo archivo
      if (nitKey && nitsProcesados.has(nitKey)) {
        omitidos++;
        continue;
      }
      if (!nitKey && nombresProcesados.has(nombreKey)) {
        omitidos++;
        continue;
      }
      if (nitKey) nitsProcesados.add(nitKey);
      nombresProcesados.add(nombreKey);

      // Verificar si ya existe en la BD
      const existing = nitKey ? (mapaPorNit.get(nitKey) ?? mapaPorNombre.get(nombreKey)) : mapaPorNombre.get(nombreKey);

      if (existing) {
        paraActualizar.push({
          instancia: existing,
          nombre,
          tipoId,
          numeroId: numeroId || null,
        });
      } else {
        nuevos.push({
          nit,
          tipo_identificacion: tipoId,
          numero_identificacion: numeroId || null,
          nombre_comercial: nombre,
          activo: true,
          origen_registro: 'IMPORTACION_WO',
        });
      }
    }

    // 2. Inserción masiva de nuevos en 1 sola consulta SQL
    let creados = 0;
    if (nuevos.length > 0) {
      await Proveedor.bulkCreate(nuevos, { validate: true, hooks: false });
      creados = nuevos.length;
    }

    // 3. Actualizar existentes en paralelo por lotes
    let actualizados = 0;
    const batchSize = 50;
    for (let i = 0; i < paraActualizar.length; i += batchSize) {
      const lote = paraActualizar.slice(i, i + batchSize);
      await Promise.all(
        lote.map(async item => {
          try {
            await item.instancia.update(
              {
                nombre_comercial: item.nombre,
                tipo_identificacion: item.tipoId,
                numero_identificacion: item.numeroId,
              },
              { hooks: false }
            );
            actualizados++;
          } catch (e: any) {
            errores.push(`${item.nombre}: ${e.message}`);
          }
        })
      );
    }

    res.json({
      message: 'Importación completada con éxito',
      creados,
      actualizados,
      omitidos,
      total: rows.length,
      errores: errores.slice(0, 10),
    });
  } catch (err: any) {
    const { status, mensaje } = mensajeDeError(err, 'No se pudo importar el archivo');
    fallar(res, status, mensaje, err);
  }
};

// ─── GET /api/proveedores/buscar ─────────────────────────────────────────────

/**
 * Buscador transversal del módulo: una sola caja que relaciona todo.
 *
 * El módulo tenía seis buscadores con seis comportamientos distintos, y el más
 * completo (Equivalencias) era el más escondido, mientras que el principal
 * (Consultar Precios) no encontraba ni por código de proveedor ni por nombre de
 * proveedor — justamente los dos datos que uno tiene delante cuando está mirando
 * una factura. Este endpoint alimenta tanto la barra del módulo como el
 * autocompletado de la pantalla de consulta, para que ambos entiendan lo mismo.
 *
 * Cada palabra debe aparecer en algún campo (AND entre palabras, OR entre campos):
 * así "vidrio incoloro 6" encuentra "VIDRIO TEMPLADO 6MM INCOLORO", que con la
 * frase completa como patrón no aparecía nunca.
 */

const MIN_BUSQUEDA = 3;
const LIMITE_GRUPO = 5;

/** Prioridad del motivo de coincidencia: lo más específico manda */
const PESO_MOTIVO: Record<string, number> = {
  CODIGO: 0,
  CODIGO_PROVEEDOR: 1,
  ALIAS: 2,
  NOMBRE: 3,
};

export const buscarEnModulo = async (req: Request, res: Response) => {
  const vacio = {
    productos: [] as any[],
    proveedores: [] as any[],
    pendientes: [] as any[],
    equivalencias: [] as any[],
    facturas: [] as any[],
    total: 0,
  };

  try {
    const q = String(req.query.q ?? '').trim();
    if (q.length < MIN_BUSQUEDA) {
      return res.json({ termino: q, ...vacio, minimo: MIN_BUSQUEDA });
    }

    // Tope de palabras: pegar un párrafo en el buscador no debe traducirse en 30
    // condiciones LIKE contra cinco tablas.
    const palabras = q.split(/\s+/).filter(Boolean).slice(0, 6);

    /** AND entre palabras, OR entre campos */
    const condiciones = (campos: string[]) => ({
      [Op.and]: palabras.map((p) => ({
        [Op.or]: campos.map((campo) => ({ [campo]: { [Op.iLike]: `%${p}%` } })),
      })),
    });

    const [porTexto, porAlias, porCodigoProveedor, proveedores, pendientes, equivalencias, facturas] =
      await Promise.all([
        // 1. Productos por código, nombre o descripción propios
        CatalogoProducto.findAll({
          where: { activo: true, ...condiciones(['codigo', 'nombre', 'descripcion']) },
          attributes: ['id', 'codigo', 'nombre', 'unidad_medida'],
          order: [['codigo', 'ASC']],
          limit: LIMITE_GRUPO,
        }),

        // 2. Productos por sinónimo aprendido
        ProductoAlias.findAll({
          where: condiciones(['alias']),
          attributes: ['catalogo_producto_id', 'alias'],
          limit: LIMITE_GRUPO * 2,
        }),

        // 3. Productos por el código o la descripción que usa el proveedor
        ProveedorProducto.findAll({
          where: { activo: true, ...condiciones(['codigo_proveedor', 'descripcion_proveedor']) },
          include: [{ model: Proveedor, as: 'proveedor', attributes: ['id', 'nombre_comercial'] }],
          attributes: ['id', 'catalogo_producto_id', 'codigo_proveedor', 'descripcion_proveedor'],
          limit: LIMITE_GRUPO * 2,
          subQuery: false,
        }),

        // 4. Proveedores
        Proveedor.findAll({
          where: { activo: true, ...condiciones(['nombre_comercial', 'nit', 'razon_social']) },
          attributes: ['id', 'nombre_comercial', 'nit', 'seguir_precios'],
          order: [['nombre_comercial', 'ASC']],
          limit: LIMITE_GRUPO,
        }),

        // 5. Bandeja: solo lo que sigue pendiente — lo descartado fue una decisión humana
        ProveedorCodigoPendiente.findAll({
          where: { estado: 'PENDIENTE', ...condiciones(['codigo_proveedor', 'descripcion_proveedor']) },
          include: [{ model: Proveedor, as: 'proveedor', attributes: ['id', 'nombre_comercial'] }],
          attributes: ['id', 'proveedor_id', 'codigo_proveedor', 'descripcion_proveedor',
                       'precio_detectado', 'veces_visto', 'unidad_detectada'],
          order: [['veces_visto', 'DESC']],
          limit: LIMITE_GRUPO,
          subQuery: false,
        }),

        // 6. Equivalencias ya confirmadas
        ProveedorProducto.findAll({
          where: {
            activo: true,
            ...condiciones([
              'codigo_proveedor', 'descripcion_proveedor',
              '$producto.codigo$', '$producto.nombre$', '$proveedor.nombre_comercial$',
            ]),
          },
          include: [
            { model: Proveedor, as: 'proveedor', attributes: ['id', 'nombre_comercial'] },
            { model: CatalogoProducto, as: 'producto', attributes: ['id', 'codigo', 'nombre'] },
          ],
          attributes: ['id', 'codigo_proveedor', 'descripcion_proveedor', 'unidad_compra',
                       'precio_actual', 'fecha_precio_actual'],
          limit: LIMITE_GRUPO,
          subQuery: false,
        }),

        // 7. Documentos ya procesados
        FacturaProveedorProcesada.findAll({
          where: condiciones(['numero_factura', 'archivo_origen']),
          include: [{ model: Proveedor, as: 'proveedor', attributes: ['id', 'nombre_comercial'] }],
          attributes: ['id', 'numero_factura', 'fecha_emision', 'tipo_documento', 'motivo_omision'],
          order: [['fecha_emision', 'DESC']],
          limit: LIMITE_GRUPO,
          subQuery: false,
        }),
      ]);

    // ── Unificar los productos de las tres fuentes ────────────────────────────
    // Un mismo producto puede llegar por varias vías; se conserva el motivo más
    // específico para que el usuario entienda por qué se le está proponiendo.
    const motivos = new Map<number, { tipo: string; detalle: string | null }>();

    const registrarMotivo = (id: number, tipo: string, detalle: string | null) => {
      const previo = motivos.get(id);
      if (!previo || PESO_MOTIVO[tipo] < PESO_MOTIVO[previo.tipo]) {
        motivos.set(id, { tipo, detalle });
      }
    };

    const productosPorId = new Map<number, any>();

    for (const p of porTexto) {
      const id = Number(p.getDataValue('id'));
      productosPorId.set(id, p);
      const codigo = normalizarNombre(p.getDataValue('codigo'));
      const coincidePorCodigo = palabras.some((w) => codigo.includes(normalizarNombre(w)));
      registrarMotivo(id, coincidePorCodigo ? 'CODIGO' : 'NOMBRE', null);
    }

    for (const a of porAlias) {
      registrarMotivo(Number(a.getDataValue('catalogo_producto_id')), 'ALIAS', String(a.getDataValue('alias')));
    }

    for (const pp of porCodigoProveedor) {
      const id = Number(pp.getDataValue('catalogo_producto_id'));
      const prov = (pp as any).getDataValue('proveedor');
      const codProv = pp.getDataValue('codigo_proveedor');
      registrarMotivo(id, 'CODIGO_PROVEEDOR', `${codProv}${prov ? ` · ${prov.nombre_comercial}` : ''}`);
    }

    // Traer los productos que llegaron por alias o por código de proveedor y que no
    // estaban en la búsqueda por texto
    const faltantes = Array.from(motivos.keys()).filter((id) => !productosPorId.has(id));
    if (faltantes.length > 0) {
      const extra = await CatalogoProducto.findAll({
        where: { id: { [Op.in]: faltantes }, activo: true },
        attributes: ['id', 'codigo', 'nombre', 'unidad_medida'],
        limit: LIMITE_GRUPO * 2,
      });
      for (const p of extra) productosPorId.set(Number(p.getDataValue('id')), p);
    }

    // Ordenar por especificidad del motivo y recortar al límite del grupo
    const idsProducto = Array.from(productosPorId.keys())
      .sort((a, b) => {
        const pa = PESO_MOTIVO[motivos.get(a)?.tipo ?? 'NOMBRE'];
        const pb = PESO_MOTIVO[motivos.get(b)?.tipo ?? 'NOMBRE'];
        if (pa !== pb) return pa - pb;
        return String(productosPorId.get(a)?.getDataValue('codigo') ?? '')
          .localeCompare(String(productosPorId.get(b)?.getDataValue('codigo') ?? ''));
      })
      .slice(0, LIMITE_GRUPO);

    // ── Precio de referencia y número de proveedores ──────────────────────────
    // Una sola consulta para todos los productos del resultado. Se traen las filas
    // en lugar de un MIN() agregado porque hace falta saber a qué modalidad
    // corresponde el precio más bajo: decir "desde $8.000" sin aclarar que es por
    // metro, cuando el resto se compra por tira de 6 m, es peor que no decir nada.
    const resumenPrecios = new Map<number, { total: number; min: number | null; unidad: string | null }>();
    if (idsProducto.length > 0) {
      const filasPrecio = await ProveedorProducto.findAll({
        where: { catalogo_producto_id: { [Op.in]: idsProducto }, activo: true },
        attributes: ['catalogo_producto_id', 'proveedor_id', 'precio_actual', 'unidad_compra'],
      });

      const proveedoresPorProducto = new Map<number, Set<number>>();
      for (const fila of filasPrecio) {
        const idProd = Number(fila.getDataValue('catalogo_producto_id'));
        const precioRaw = fila.getDataValue('precio_actual');
        const precio = precioRaw === null || precioRaw === undefined ? null : parseFloat(precioRaw);

        if (!proveedoresPorProducto.has(idProd)) proveedoresPorProducto.set(idProd, new Set());
        proveedoresPorProducto.get(idProd)!.add(Number(fila.getDataValue('proveedor_id')));

        const actual = resumenPrecios.get(idProd) ?? { total: 0, min: null, unidad: null };
        if (precio !== null && (actual.min === null || precio < actual.min)) {
          actual.min = precio;
          actual.unidad = fila.getDataValue('unidad_compra');
        }
        resumenPrecios.set(idProd, actual);
      }

      for (const [idProd, setProv] of proveedoresPorProducto.entries()) {
        const actual = resumenPrecios.get(idProd) ?? { total: 0, min: null, unidad: null };
        actual.total = setProv.size;
        resumenPrecios.set(idProd, actual);
      }
    }

    // ── Equivalencias por proveedor, para el grupo de proveedores ─────────────
    const totalPorProveedor = new Map<number, number>();
    const idsProveedor = proveedores.map((p) => Number(p.getDataValue('id')));
    if (idsProveedor.length > 0) {
      const conteos: any[] = await ProveedorProducto.findAll({
        where: { proveedor_id: { [Op.in]: idsProveedor }, activo: true },
        attributes: ['proveedor_id', [fn('COUNT', col('id')), 'total']],
        group: ['proveedor_id'],
        raw: true,
      });
      for (const c of conteos) totalPorProveedor.set(Number(c.proveedor_id), Number(c.total));
    }

    // ── Armar la respuesta ────────────────────────────────────────────────────
    const gruposProductos = idsProducto.map((id) => {
      const p = productosPorId.get(id);
      const resumen = resumenPrecios.get(id);
      return {
        id,
        codigo: p.getDataValue('codigo'),
        nombre: p.getDataValue('nombre'),
        unidad_medida: p.getDataValue('unidad_medida'),
        total_proveedores: resumen?.total ?? 0,
        precio_min: resumen?.min ?? null,
        unidad_precio_min: resumen?.unidad ?? null,
        motivo: motivos.get(id) ?? { tipo: 'NOMBRE', detalle: null },
      };
    });

    const gruposProveedores = proveedores.map((p) => ({
      id: p.getDataValue('id'),
      nombre_comercial: p.getDataValue('nombre_comercial'),
      nit: p.getDataValue('nit'),
      seguir_precios: p.getDataValue('seguir_precios'),
      total_equivalencias: totalPorProveedor.get(Number(p.getDataValue('id'))) ?? 0,
    }));

    const resultado = {
      termino: q,
      productos: gruposProductos,
      proveedores: gruposProveedores,
      pendientes: pendientes.map((b: any) => b.toJSON()),
      equivalencias: equivalencias.map((e: any) => e.toJSON()),
      facturas: facturas.map((f: any) => f.toJSON()),
    };

    res.json({
      ...resultado,
      total:
        resultado.productos.length + resultado.proveedores.length + resultado.pendientes.length +
        resultado.equivalencias.length + resultado.facturas.length,
    });
  } catch (err: any) {
    const { status, mensaje } = mensajeDeError(err, 'No se pudo completar la búsqueda');
    fallar(res, status, mensaje, err);
  }
};

// ─── GET /api/proveedores/consulta ───────────────────────────────────────────
/**
 * Pantalla principal: busca un producto por código, nombre, alias o ID y retorna
 * todos sus proveedores con precio comparativo, ordenados por precio_actual ASC.
 *
 * Cuando el término coincide con varios productos devuelve la lista de candidatos
 * en vez de elegir uno arbitrariamente: antes un `findOne` sin `order` respondía
 * con el primero que apareciera y el usuario no se enteraba de que había más.
 */
export const consultarPrecios = async (req: Request, res: Response) => {
  try {
    const { codigo, nombre, modalidad, producto_id, id, q } = req.query;
    const term = (q || codigo || nombre || '').toString().trim();

    if (!term && !producto_id && !id) {
      return fallar(res, 400, 'Escribe el código o el nombre del producto que quieres comparar.');
    }

    const atributosProducto = ['id', 'codigo', 'nombre', 'unidad_medida', 'porcentaje_iva'];
    let producto: any = null;

    if (producto_id || id) {
      producto = await CatalogoProducto.findByPk(Number(producto_id || id), { attributes: atributosProducto });
      if (!producto) return fallar(res, 404, 'El producto seleccionado ya no está en el catálogo.');
    }

    // 1. Coincidencia exacta por código — es la búsqueda que el usuario espera resolver directo
    if (!producto && term) {
      producto = await CatalogoProducto.findOne({
        where: { codigo: term.toUpperCase(), activo: true },
        attributes: atributosProducto,
      });
    }

    // 2. Búsqueda amplia: código parcial, nombre o alias aprendido de proveedores
    if (!producto && term) {
      const patron = `%${term}%`;
      const porTexto = await CatalogoProducto.findAll({
        where: {
          activo: true,
          [Op.or]: [{ codigo: { [Op.iLike]: patron } }, { nombre: { [Op.iLike]: patron } }],
        },
        attributes: atributosProducto,
        order: [['codigo', 'ASC']],
        limit: 12,
      });

      let candidatos = porTexto;

      // 3. El código con el que lo factura el proveedor. Es el dato que uno tiene
      //    delante al mirar una factura de VEA o Vitelsa, y hasta ahora escribirlo
      //    aquí no encontraba nada: solo servía dentro de la bandeja.
      if (candidatos.length === 0) {
        const porCodigoProveedor = await ProveedorProducto.findAll({
          where: {
            activo: true,
            [Op.or]: [
              { codigo_proveedor: { [Op.iLike]: patron } },
              { descripcion_proveedor: { [Op.iLike]: patron } },
            ],
          },
          include: [{ model: CatalogoProducto, as: 'producto', attributes: atributosProducto }],
          limit: 12,
        });
        const vistos = new Set<number>();
        candidatos = porCodigoProveedor
          .map((pp: any) => pp.getDataValue('producto'))
          .filter((p: any) => {
            if (!p || vistos.has(p.id)) return false;
            vistos.add(p.id);
            return true;
          });
      }

      // 4. Sinónimos aprendidos en mapeos anteriores
      if (candidatos.length === 0) {
        const alias = await ProductoAlias.findAll({
          where: { alias: { [Op.iLike]: patron } },
          include: [{ model: CatalogoProducto, as: 'producto', attributes: atributosProducto }],
          limit: 12,
        });
        const vistos = new Set<number>();
        candidatos = alias
          .map((a: any) => a.getDataValue('producto'))
          .filter((p: any) => {
            if (!p || vistos.has(p.id)) return false;
            vistos.add(p.id);
            return true;
          });
      }

      if (candidatos.length === 0) {
        return fallar(res, 404, `No se encontró ningún producto que coincida con "${term}". Revisa el código o busca por nombre.`);
      }

      if (candidatos.length > 1) {
        return res.json({
          candidatos: candidatos.map((p: any) => ({
            id: p.id,
            codigo: p.codigo,
            nombre: p.nombre,
            unidad_medida: p.unidad_medida,
          })),
          total_candidatos: candidatos.length,
        });
      }

      producto = candidatos[0];
    }

    if (!producto) {
      return fallar(res, 404, 'No se encontró el producto en el catálogo.');
    }

    // Obtener todos los mapeos activos de ese producto
    const whereModalidad: any = {
      catalogo_producto_id: producto.id,
      activo: true,
    };
    if (modalidad) whereModalidad.unidad_compra = String(modalidad).toUpperCase();

    const precios = await ProveedorProducto.findAll({
      where: whereModalidad,
      include: [
        {
          model: Proveedor,
          as: 'proveedor',
          where: { activo: true },
          attributes: ['id', 'nit', 'nombre_comercial'],
        },
      ],
      order: [['precio_actual', 'ASC']],
      attributes: [
        'id', 'proveedor_id', 'codigo_proveedor', 'descripcion_proveedor',
        'unidad_compra', 'metros_por_unidad',
        'precio_actual', 'fecha_precio_actual',
        'precio_anterior_1', 'fecha_anterior_1',
        'precio_anterior_2', 'fecha_anterior_2',
      ],
    });

    const umbral = await obtenerUmbral();
    const pct_iva = producto.getDataValue('porcentaje_iva') ?? 19;

    const resultado = precios.map((pp: any) => {
      const actualRaw = pp.precio_actual;
      const anteriorRaw = pp.precio_anterior_1;
      const precioActual = actualRaw === null || actualRaw === undefined ? null : parseFloat(actualRaw);
      const precioAnterior1 = anteriorRaw === null || anteriorRaw === undefined ? null : parseFloat(anteriorRaw);
      let variacionPct: number | null = null;
      let anomalo = false;

      if (precioActual !== null && precioAnterior1 !== null && precioAnterior1 > 0) {
        variacionPct = ((precioActual - precioAnterior1) / precioAnterior1) * 100;
        anomalo = Math.abs(variacionPct) > umbral;
      }

      // Precio por metro derivado (solo para TIRA_6M)
      const metros = parseFloat(pp.metros_por_unidad);
      const precioMetroDerivado = pp.unidad_compra === 'TIRA_6M' && precioActual !== null && metros > 0
        ? precioActual / metros
        : null;

      return {
        proveedor_producto_id: pp.id,
        proveedor: pp.proveedor,
        codigo_proveedor: pp.codigo_proveedor,
        descripcion_proveedor: pp.descripcion_proveedor,
        unidad_compra: pp.unidad_compra,
        precio_sin_iva: precioActual,
        precio_con_iva: precioActual !== null ? +(precioActual * (1 + pct_iva / 100)).toFixed(2) : null,
        precio_metro_derivado: precioMetroDerivado !== null ? +precioMetroDerivado.toFixed(2) : null,
        fecha_precio_actual: pp.fecha_precio_actual,
        precio_anterior_1: pp.precio_anterior_1,
        fecha_anterior_1: pp.fecha_anterior_1,
        precio_anterior_2: pp.precio_anterior_2,
        fecha_anterior_2: pp.fecha_anterior_2,
        variacion_pct: variacionPct !== null ? +variacionPct.toFixed(2) : null,
        precio_anomalo: anomalo,
      };
    });

    res.json({
      producto: {
        id: producto.id,
        codigo: producto.codigo,
        nombre: producto.nombre,
        unidad_medida: producto.unidad_medida,
        porcentaje_iva: pct_iva,
      },
      umbral_variacion_pct: umbral,
      precios: resultado,
      total: resultado.length,
    });
  } catch (err: any) {
    const { status, mensaje } = mensajeDeError(err, 'No se pudo consultar los precios');
    fallar(res, status, mensaje, err);
  }
};

// ─── GET /api/proveedores/:id/productos ───────────────────────────────────────
export const listarProductosProveedor = async (req: Request, res: Response) => {
  try {
    const productos = await ProveedorProducto.findAll({
      where: { proveedor_id: req.params.id, activo: true },
      include: [{ model: CatalogoProducto, as: 'producto', attributes: ['id', 'codigo', 'nombre', 'unidad_medida'] }],
      attributes: [
        'id', 'proveedor_id', 'catalogo_producto_id', 'codigo_proveedor', 'descripcion_proveedor',
        'unidad_compra', 'metros_por_unidad', 'precio_actual', 'fecha_precio_actual',
      ],
      order: [['precio_actual', 'ASC']],
      limit: MAX_PAGINA,
    });
    res.json(productos);
  } catch (err: any) {
    const { status, mensaje } = mensajeDeError(err, 'No se pudieron cargar los productos del proveedor');
    fallar(res, status, mensaje, err);
  }
};

// ─── POST /api/proveedores/:id/productos ──────────────────────────────────────
export const agregarPrecioManual = async (req: Request, res: Response) => {
  const t = await sequelize.transaction();
  try {
    const datos = precioManualSchema.parse(req.body);
    const proveedor_id = parseInt(req.params.id, 10);
    const userId = req.user?.id ?? null;

    const [proveedor, producto] = await Promise.all([
      Proveedor.findByPk(proveedor_id, { transaction: t }),
      CatalogoProducto.findByPk(datos.catalogo_producto_id, { transaction: t }),
    ]);
    if (!proveedor) {
      await t.rollback();
      return fallar(res, 404, 'El proveedor no existe o fue eliminado.');
    }
    if (!producto) {
      await t.rollback();
      return fallar(res, 404, 'El producto ya no está en el catálogo. Actualiza la búsqueda e inténtalo de nuevo.');
    }

    const fechaVigencia = datos.fecha_precio ?? new Date().toISOString().split('T')[0];

    const [pp, creado] = await ProveedorProducto.findOrCreate({
      where: { proveedor_id, catalogo_producto_id: datos.catalogo_producto_id, unidad_compra: datos.unidad_compra },
      defaults: {
        proveedor_id,
        catalogo_producto_id: datos.catalogo_producto_id,
        codigo_proveedor: datos.codigo_proveedor || null,
        descripcion_proveedor: datos.descripcion_proveedor || null,
        unidad_compra: datos.unidad_compra,
        precio_actual: datos.precio,
        fecha_precio_actual: fechaVigencia,
      },
      transaction: t,
    });

    if (!creado) {
      // Reactivar el mapeo si venía dado de baja y refrescar cómo lo nombra el proveedor
      const cambios: any = {};
      if (pp.getDataValue('activo') === false) cambios.activo = true;
      if (datos.codigo_proveedor) cambios.codigo_proveedor = datos.codigo_proveedor;
      if (datos.descripcion_proveedor) cambios.descripcion_proveedor = datos.descripcion_proveedor;
      if (Object.keys(cambios).length) await pp.update(cambios, { transaction: t });

      await actualizarPrecio(pp, datos.precio, fechaVigencia, {
        origen: 'MANUAL',
        registradoPor: userId,
        transaction: t,
      });
    } else {
      await ProveedorProductoPrecio.create(
        {
          proveedor_producto_id: pp.getDataValue('id'),
          precio: datos.precio,
          fecha_vigencia: fechaVigencia,
          origen: 'MANUAL',
          registrado_por: userId,
        },
        { transaction: t }
      );
    }

    if (datos.guardar_alias && datos.descripcion_proveedor) {
      await ProductoAlias.findOrCreate({
        where: { catalogo_producto_id: datos.catalogo_producto_id, alias: datos.descripcion_proveedor },
        defaults: {
          catalogo_producto_id: datos.catalogo_producto_id,
          alias: datos.descripcion_proveedor,
          origen: 'PROVEEDOR',
          proveedor_id,
        },
        transaction: t,
      });
    }

    await t.commit();
    res.status(creado ? 201 : 200).json({ message: creado ? 'Mapeo creado' : 'Precio actualizado', pp });
  } catch (err: any) {
    await t.rollback();
    if (err instanceof z.ZodError) return fallar(res, 400, mensajeZod(err));
    const { status, mensaje } = mensajeDeError(err, 'No se pudo registrar el precio');
    fallar(res, status, mensaje, err);
  }
};

// ─── PATCH /api/proveedores/productos/:pp_id ──────────────────────────────────
export const editarPrecio = async (req: Request, res: Response) => {
  const t = await sequelize.transaction();
  try {
    const datos = editarPrecioSchema.parse(req.body);
    const pp = await ProveedorProducto.findByPk(req.params.pp_id, { transaction: t });
    if (!pp) {
      await t.rollback();
      return fallar(res, 404, 'La equivalencia ya no existe. Refresca la lista.');
    }

    const userId = req.user?.id ?? null;

    const updates: any = {};
    if (datos.codigo_proveedor !== undefined) updates.codigo_proveedor = datos.codigo_proveedor;
    if (datos.descripcion_proveedor !== undefined) updates.descripcion_proveedor = datos.descripcion_proveedor;
    if (datos.unidad_compra !== undefined) updates.unidad_compra = datos.unidad_compra;
    if (Object.keys(updates).length) await pp.update(updates, { transaction: t });

    let resultado: ResultadoPrecio | null = null;
    if (datos.precio !== undefined) {
      const fechaVigencia = datos.fecha_precio ?? new Date().toISOString().split('T')[0];
      resultado = await actualizarPrecio(pp, datos.precio, fechaVigencia, {
        origen: 'MANUAL',
        registradoPor: userId,
        transaction: t,
      });
    }

    await t.commit();
    res.json({
      message: resultado?.retroactivo
        ? 'Precio archivado en el histórico: la fecha indicada es anterior al precio vigente'
        : 'Actualizado',
      anomalo: resultado?.anomalo ?? false,
      variacion_pct: resultado?.variacionPct ?? null,
      retroactivo: resultado?.retroactivo ?? false,
    });
  } catch (err: any) {
    await t.rollback();
    if (err instanceof z.ZodError) return fallar(res, 400, mensajeZod(err));
    const { status, mensaje } = mensajeDeError(err, 'No se pudo actualizar la equivalencia');
    fallar(res, status, mensaje, err);
  }
};

// ─── DELETE /api/proveedores/productos/:pp_id ─────────────────────────────────
export const desactivarMapeo = async (req: Request, res: Response) => {
  try {
    const pp = await ProveedorProducto.findByPk(req.params.pp_id);
    if (!pp) return fallar(res, 404, 'El mapeo ya no existe.');
    await pp.update({ activo: false });
    res.json({ message: 'Mapeo desactivado' });
  } catch (err: any) {
    const { status, mensaje } = mensajeDeError(err, 'No se pudo desactivar el mapeo');
    fallar(res, status, mensaje, err);
  }
};

// ─── GET /api/proveedores/codigos-pendientes ─────────────────────────────────
export const listarPendientes = async (req: Request, res: Response) => {
  try {
    const { q, proveedor_id, estado } = req.query;
    const limit = Math.min(parseInt(String(req.query.limit ?? MAX_PAGINA), 10) || MAX_PAGINA, MAX_PAGINA);
    const offset = Math.max(parseInt(String(req.query.offset ?? 0), 10) || 0, 0);
    const orden = String(req.query.orden ?? 'frecuencia');

    const where: any = { estado: estado ? String(estado).toUpperCase() : 'PENDIENTE' };
    if (proveedor_id) where.proveedor_id = Number(proveedor_id);
    if (q) {
      const patron = `%${String(q).trim()}%`;
      where[Op.or] = [
        { codigo_proveedor: { [Op.iLike]: patron } },
        { descripcion_proveedor: { [Op.iLike]: patron } },
      ];
    }

    const order: any =
      orden === 'reciente' ? [['fecha_deteccion', 'DESC']]
      : orden === 'precio' ? [['precio_detectado', 'DESC']]
      : [['veces_visto', 'DESC'], ['id', 'DESC']];

    const { rows, count } = await ProveedorCodigoPendiente.findAndCountAll({
      where,
      include: [{ model: Proveedor, as: 'proveedor', attributes: ['id', 'nombre_comercial', 'nit', 'seguir_precios'] }],
      attributes: [
        'id', 'proveedor_id', 'codigo_proveedor', 'descripcion_proveedor', 'precio_detectado',
        'documento_ref', 'veces_visto', 'estado', 'fecha_deteccion',
        'unidad_detectada', 'porcentaje_iva_detectado', 'codigo_derivado',
      ],
      order,
      limit,
      offset,
    });

    res.json({ items: rows, total: count, limit, offset });
  } catch (err: any) {
    const { status, mensaje } = mensajeDeError(err, 'No se pudo cargar la bandeja de códigos');
    fallar(res, status, mensaje, err);
  }
};

// ─── GET /api/proveedores/codigos-pendientes/count ───────────────────────────
/** Solo el número para el badge: antes se descargaba la bandeja entera para contarla. */
export const contarPendientes = async (_req: Request, res: Response) => {
  try {
    const count = await ProveedorCodigoPendiente.count({ where: { estado: 'PENDIENTE' } });
    res.json({ count });
  } catch (err: any) {
    const { status, mensaje } = mensajeDeError(err, 'No se pudo contar los códigos pendientes');
    fallar(res, status, mensaje, err);
  }
};

// ─── POST /api/proveedores/codigos-pendientes/:id/vincular ────────────────────
export const vincularPendiente = async (req: Request, res: Response) => {
  const t = await sequelize.transaction();
  try {
    const datos = vincularSchema.parse(req.body);
    const pendiente = await ProveedorCodigoPendiente.findByPk(req.params.id, { transaction: t });
    if (!pendiente) {
      await t.rollback();
      return fallar(res, 404, 'Ese código ya no está en la bandeja. Refresca la lista.');
    }

    const userId = req.user?.id ?? null;

    const producto = await CatalogoProducto.findByPk(datos.catalogo_producto_id, { transaction: t });
    if (!producto) {
      await t.rollback();
      return fallar(res, 404, 'El producto ya no está en el catálogo. Búscalo de nuevo o créalo.');
    }

    const proveedor_id = pendiente.getDataValue('proveedor_id');
    const descripcion = (pendiente.getDataValue('descripcion_proveedor') || '').trim();

    // El precio que el usuario confirma en pantalla manda sobre el detectado en el XML:
    // el campo era editable pero se ignoraba, así que corregir una cifra mal leída
    // no tenía ningún efecto.
    const precioDetectado = pendiente.getDataValue('precio_detectado');
    const precio = datos.precio ?? (precioDetectado !== null && precioDetectado !== undefined ? parseFloat(precioDetectado) : null);

    // La fecha vigente es la de la factura donde se detectó, no la de hoy
    const fechaFactura = aFechaISO(pendiente.getDataValue('fecha_deteccion'));
    const fechaVigencia = datos.fecha_precio || fechaFactura || new Date().toISOString().split('T')[0];

    const [pp, creado] = await ProveedorProducto.findOrCreate({
      where: { proveedor_id, catalogo_producto_id: datos.catalogo_producto_id, unidad_compra: datos.unidad_compra },
      defaults: {
        proveedor_id,
        catalogo_producto_id: datos.catalogo_producto_id,
        codigo_proveedor: pendiente.getDataValue('codigo_proveedor'),
        descripcion_proveedor: descripcion || null,
        unidad_compra: datos.unidad_compra,
        precio_actual: precio,
        fecha_precio_actual: precio !== null ? fechaVigencia : null,
      },
      transaction: t,
    });

    if (!creado) {
      // Reutilizar un mapeo dado de baja en lugar de dejarlo inactivo y sin efecto
      const cambios: any = {};
      if (pp.getDataValue('activo') === false) cambios.activo = true;
      if (!pp.getDataValue('codigo_proveedor')) cambios.codigo_proveedor = pendiente.getDataValue('codigo_proveedor');
      if (Object.keys(cambios).length) await pp.update(cambios, { transaction: t });

      if (precio !== null) {
        await actualizarPrecio(pp, precio, fechaVigencia, {
          origen: 'FACTURA',
          registradoPor: userId,
          documentoRef: pendiente.getDataValue('documento_ref'),
          porcentajeIva: pendiente.getDataValue('porcentaje_iva_detectado'),
          transaction: t,
        });
      }
    } else if (precio !== null) {
      await ProveedorProductoPrecio.create(
        {
          proveedor_producto_id: pp.getDataValue('id'),
          precio,
          fecha_vigencia: fechaVigencia,
          origen: 'FACTURA',
          registrado_por: userId,
          documento_ref: pendiente.getDataValue('documento_ref'),
          porcentaje_iva: pendiente.getDataValue('porcentaje_iva_detectado'),
        },
        { transaction: t }
      );
    }

    // Guardar la descripción como alias solo si el usuario lo pidió: la casilla
    // "Recordar como sinónimo" existía en pantalla pero no se consultaba.
    const alias = (datos.descripcion_alias || descripcion).trim();
    if (datos.guardar_alias && alias) {
      await ProductoAlias.findOrCreate({
        where: { catalogo_producto_id: datos.catalogo_producto_id, alias },
        defaults: { catalogo_producto_id: datos.catalogo_producto_id, alias, origen: 'PROVEEDOR', proveedor_id },
        transaction: t,
      });
    }

    await pendiente.update({ estado: 'MAPEADO' }, { transaction: t });

    await t.commit();
    res.json({ message: 'Código vinculado exitosamente', proveedor_producto: pp });
  } catch (err: any) {
    await t.rollback();
    if (err instanceof z.ZodError) return fallar(res, 400, mensajeZod(err));
    const { status, mensaje } = mensajeDeError(err, 'No se pudo vincular el código');
    fallar(res, status, mensaje, err);
  }
};

// ─── PATCH /api/proveedores/codigos-pendientes/:id/descartar ──────────────────
export const descartarPendiente = async (req: Request, res: Response) => {
  try {
    const pendiente = await ProveedorCodigoPendiente.findByPk(req.params.id);
    if (!pendiente) return fallar(res, 404, 'Ese código ya no está en la bandeja.');
    await pendiente.update({ estado: 'DESCARTADO' });
    res.json({ message: 'Código descartado' });
  } catch (err: any) {
    const { status, mensaje } = mensajeDeError(err, 'No se pudo descartar el código');
    fallar(res, status, mensaje, err);
  }
};

// ─── POST /api/proveedores/codigos-pendientes/descartar-lote ──────────────────
/** Descarta varios códigos de una vez: con 270 entradas de fletes y papelería,
 *  hacerlo de a uno no es un flujo de trabajo viable. */
export const descartarLote = async (req: Request, res: Response) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((n: any) => Number(n)).filter(Number.isInteger) : [];
    if (ids.length === 0) return fallar(res, 400, 'Selecciona al menos un código para descartar.');
    if (ids.length > 500) return fallar(res, 400, 'Puedes descartar hasta 500 códigos por vez.');

    const [afectados] = await ProveedorCodigoPendiente.update(
      { estado: 'DESCARTADO' },
      { where: { id: { [Op.in]: ids }, estado: 'PENDIENTE' }, individualHooks: true },
    );

    res.json({ message: `${afectados} código(s) descartado(s)`, descartados: afectados });
  } catch (err: any) {
    const { status, mensaje } = mensajeDeError(err, 'No se pudieron descartar los códigos');
    fallar(res, status, mensaje, err);
  }
};

// ─── GET /api/proveedores/equivalencias ──────────────────────────────────────
export const listarEquivalencias = async (req: Request, res: Response) => {
  try {
    const { proveedor_id, q, unidad_compra } = req.query;
    const limit = Math.min(parseInt(String(req.query.limit ?? MAX_PAGINA), 10) || MAX_PAGINA, MAX_PAGINA);
    const offset = Math.max(parseInt(String(req.query.offset ?? 0), 10) || 0, 0);

    const where: any = { activo: true };
    if (proveedor_id) where.proveedor_id = Number(proveedor_id);
    if (unidad_compra) where.unidad_compra = String(unidad_compra).toUpperCase();
    if (q) {
      const patron = `%${String(q).trim()}%`;
      where[Op.or] = [
        { codigo_proveedor: { [Op.iLike]: patron } },
        { descripcion_proveedor: { [Op.iLike]: patron } },
        { '$producto.codigo$': { [Op.iLike]: patron } },
        { '$producto.nombre$': { [Op.iLike]: patron } },
        { '$proveedor.nombre_comercial$': { [Op.iLike]: patron } },
      ];
    }

    const { rows, count } = await ProveedorProducto.findAndCountAll({
      where,
      include: [
        { model: Proveedor, as: 'proveedor', attributes: ['id', 'nombre_comercial', 'nit'] },
        { model: CatalogoProducto, as: 'producto', attributes: ['id', 'codigo', 'nombre', 'es_aluminio'] },
      ],
      attributes: [
        'id', 'proveedor_id', 'catalogo_producto_id', 'codigo_proveedor', 'descripcion_proveedor',
        'unidad_compra', 'metros_por_unidad', 'precio_actual', 'fecha_precio_actual',
        'precio_anterior_1', 'fecha_anterior_1', 'precio_anterior_2', 'fecha_anterior_2', 'activo',
      ],
      order: [[{ model: Proveedor, as: 'proveedor' }, 'nombre_comercial', 'ASC'], ['id', 'ASC']],
      limit,
      offset,
      subQuery: false,
      distinct: true,
    });

    // `catalogo_producto` se mantiene como alias de `producto` por compatibilidad con la UI
    const items = rows.map((eq: any) => {
      const plain = eq.toJSON();
      plain.catalogo_producto = plain.producto;
      return plain;
    });

    res.json({ items, total: count, limit, offset });
  } catch (err: any) {
    const { status, mensaje } = mensajeDeError(err, 'No se pudieron cargar las equivalencias');
    fallar(res, status, mensaje, err);
  }
};

// ─── DELETE /api/proveedores/equivalencias/:id ───────────────────────────────
/**
 * Desvincula una equivalencia y devuelve su código a la bandeja.
 *
 * Es baja lógica, no borrado. El borrado físico arrastraba en cascada todo el
 * histórico de precios de ese proveedor para ese producto — justamente el activo
 * que el módulo existe para acumular, y la única copia del CUFE de origen.
 */
export const desvincularEquivalencia = async (req: Request, res: Response) => {
  const t = await sequelize.transaction();
  try {
    const pp = await ProveedorProducto.findByPk(req.params.id, { transaction: t });
    if (!pp) {
      await t.rollback();
      return fallar(res, 404, 'La equivalencia ya no existe. Refresca la lista.');
    }

    const proveedor_id = pp.getDataValue('proveedor_id');
    const codigo_proveedor = pp.getDataValue('codigo_proveedor');
    const descripcion_proveedor = pp.getDataValue('descripcion_proveedor');
    const precio_actual = pp.getDataValue('precio_actual');
    const fecha_precio_actual = pp.getDataValue('fecha_precio_actual');
    const unidad_compra = pp.getDataValue('unidad_compra');

    await pp.update({ activo: false }, { transaction: t });

    if (codigo_proveedor) {
      const pendiente = await ProveedorCodigoPendiente.findOne({
        where: { proveedor_id, codigo_proveedor },
        transaction: t,
      });

      if (pendiente) {
        await pendiente.update(
          {
            estado: 'PENDIENTE',
            precio_detectado: precio_actual ?? pendiente.getDataValue('precio_detectado'),
            fecha_deteccion: fecha_precio_actual ?? pendiente.getDataValue('fecha_deteccion'),
            unidad_detectada: pendiente.getDataValue('unidad_detectada') ?? unidad_compra,
          },
          { transaction: t }
        );
      } else {
        await ProveedorCodigoPendiente.create(
          {
            proveedor_id,
            codigo_proveedor,
            descripcion_proveedor: descripcion_proveedor || null,
            precio_detectado: precio_actual || null,
            unidad_detectada: unidad_compra,
            veces_visto: 1,
            estado: 'PENDIENTE',
            fecha_deteccion: fecha_precio_actual || new Date(),
          },
          { transaction: t }
        );
      }
    }

    await t.commit();
    res.json({ message: 'Equivalencia desvinculada y devuelta a Por Mapear. Su histórico de precios se conserva.' });
  } catch (err: any) {
    await t.rollback();
    const { status, mensaje } = mensajeDeError(err, 'No se pudo desvincular la equivalencia');
    fallar(res, status, mensaje, err);
  }
};

// ─── GET /api/proveedores/equivalencias/:id/historico ────────────────────────
/** Histórico completo de precios de una equivalencia, para auditar de dónde salió cada cifra. */
export const historicoEquivalencia = async (req: Request, res: Response) => {
  try {
    const historico = await ProveedorProductoPrecio.findAll({
      where: { proveedor_producto_id: req.params.id },
      attributes: [
        'id', 'precio', 'fecha_vigencia', 'origen', 'documento_ref', 'cufe',
        'precio_anomalo', 'variacion_pct', 'porcentaje_iva', 'lineas_en_factura',
        'retroactivo', 'fecha_registro',
      ],
      order: [['fecha_vigencia', 'DESC'], ['id', 'DESC']],
      limit: 60,
    });
    res.json(historico);
  } catch (err: any) {
    const { status, mensaje } = mensajeDeError(err, 'No se pudo cargar el histórico de precios');
    fallar(res, status, mensaje, err);
  }
};

// ─── POST /api/proveedores/:id/importar-precios ──────────────────────────────

/**
 * Fase 3 de `compras.md`: actualización masiva por **lista de precios** del proveedor.
 *
 * Por qué existe teniendo ya la ingesta de facturas: una FE dice qué se pagó por lo
 * que se compró ese día — con descuentos puntuales, promociones y fletes; la lista
 * dice qué cobra el proveedor en general. La factura sirve para *detectar* que un
 * precio cambió; la lista es la fuente natural del precio de referencia. Por eso el
 * histórico distingue el `origen` (`MANUAL | LISTA | FACTURA`): hasta ahora `LISTA`
 * estaba declarado y ningún camino lo escribía.
 *
 * Dos decisiones que sostienen el flujo:
 *  · **Nunca se escribe a ciegas.** El primer envío es una previsualización
 *    (`dry_run`) que muestra qué columnas se detectaron y qué haría con cada fila.
 *    Cada proveedor manda su Excel como se le ocurre; que el usuario confirme el
 *    mapeo antes de tocar precios es más barato que deshacer una carga equivocada.
 *  · **Un código sin equivalencia va a la bandeja, no se adivina** — la misma regla
 *    que gobierna la ingesta de facturas, y con el mismo derivador de código, para
 *    que una lista y una factura del mismo ítem caigan en la misma fila.
 */

/** Encabezados que se aceptan por columna. Se comparan normalizados (sin tildes ni signos). */
const CABECERAS_LISTA: Record<'codigo' | 'descripcion' | 'precio' | 'unidad' | 'fecha', string[]> = {
  codigo: ['CODIGO', 'COD', 'CODIGO PRODUCTO', 'CODIGO PROVEEDOR', 'REFERENCIA', 'REF', 'SKU', 'ITEM'],
  descripcion: ['DESCRIPCION', 'PRODUCTO', 'NOMBRE', 'DETALLE', 'ARTICULO', 'ITEM DESCRIPCION'],
  precio: ['PRECIO', 'VALOR', 'PRECIO UNITARIO', 'VALOR UNITARIO', 'VR UNITARIO', 'UNITARIO',
           'PRECIO LISTA', 'PRECIO SIN IVA', 'PRECIO VENTA', 'VLR UNITARIO'],
  unidad: ['UNIDAD', 'UND', 'UM', 'UNIDAD MEDIDA', 'UNIDAD DE MEDIDA', 'MEDIDA', 'PRESENTACION', 'MODALIDAD'],
  fecha: ['FECHA', 'VIGENCIA', 'FECHA PRECIO', 'FECHA VIGENCIA', 'FECHA LISTA'],
};

/**
 * Interpreta un precio escrito por un humano en Excel.
 * "45.000" son cuarenta y cinco mil, no cuarenta y cinco: en Colombia el punto separa
 * miles. Leerlo al revés metería un precio 1.000 veces menor sin que nada avise.
 */
function parsearPrecioCelda(valor: any): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  if (typeof valor === 'number') return Number.isFinite(valor) && valor > 0 ? valor : null;

  let s = String(valor).replace(/[^\d.,-]/g, '').trim();
  if (!s) return null;

  const coma = s.lastIndexOf(',');
  const punto = s.lastIndexOf('.');

  if (coma > -1 && punto > -1) {
    // El separador que va más a la derecha es el decimal
    s = coma > punto ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (coma > -1) {
    s = s.length - coma - 1 <= 2 ? s.replace(',', '.') : s.replace(/,/g, '');
  } else if (punto > -1 && s.length - punto - 1 === 3) {
    s = s.replace(/\./g, '');
  }

  const numero = parseFloat(s);
  return Number.isFinite(numero) && numero > 0 ? numero : null;
}

/** Traduce la unidad escrita en la lista a una modalidad del sistema */
function unidadDesdeTexto(valor: any): string | null {
  const t = normalizarNombre(valor);
  if (!t) return null;
  if (/(TIRA|BARRA|6\s?M\b|6MTS?)/.test(t)) return 'TIRA_6M';
  if (/(^|\s)(M2|MT2|METRO CUADRADO)/.test(t)) return 'M2';
  if (/(^|\s)(KG|KILO|KILOGRAMO)/.test(t)) return 'KG';
  if (/(^|\s)(ML|METRO LINEAL)/.test(t)) return 'ML';
  if (/(^|\s)(M|MT|MTS|METRO|METROS)(\s|$)/.test(t)) return 'METRO';
  if (/(^|\s)(UND?|UN|UNIDAD|UNID|PZA|PIEZA|C\/U)/.test(t)) return 'UNIDAD';
  return null;
}

interface FilaLista {
  fila: number;
  codigo: string;
  descripcion: string;
  precio: number;
  unidad: string | null;
  fecha: string | null;
}

export const importarListaPrecios = async (req: Request, res: Response) => {
  const proveedorId = parseInt(req.params.id, 10);
  const userId = req.user?.id ?? null;

  try {
    if (!req.file) {
      return fallar(res, 400, 'No se recibió ningún archivo. Selecciona el Excel con la lista de precios.');
    }

    const proveedor = await Proveedor.findByPk(proveedorId, { attributes: ['id', 'nombre_comercial'] });
    if (!proveedor) return fallar(res, 404, 'El proveedor no existe o fue eliminado.');

    const dryRun = String(req.body?.dry_run ?? 'true') !== 'false';
    const preciosConIva = String(req.body?.precios_incluyen_iva ?? 'false') === 'true';
    const crearPendientes = String(req.body?.crear_pendientes ?? 'true') !== 'false';

    const unidadPedida = String(req.body?.unidad_defecto ?? 'UNIDAD').toUpperCase();
    const unidadDefecto = (UNIDADES_COMPRA as readonly string[]).includes(unidadPedida) ? unidadPedida : 'UNIDAD';

    const fechaPedida = String(req.body?.fecha_lista ?? '');
    const fechaLista = /^\d{4}-\d{2}-\d{2}$/.test(fechaPedida) ? fechaPedida : new Date().toISOString().split('T')[0];

    // ── 1. Localizar la fila de encabezados ────────────────────────────────────
    // Las listas de proveedor traen logo, título y notas antes de la tabla, así que
    // no se puede asumir que la primera fila sea la de los nombres de columna.
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    // `blankrows: true` a propósito: conserva las filas vacías para que el índice del
    // arreglo siga coincidiendo con el número de fila real del Excel. Compactando,
    // los "Fila 27: sin precio" del informe apuntaban a una fila distinta de la que
    // el usuario abre a corregir.
    const matriz: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: true, defval: null });

    if (matriz.length === 0) {
      return fallar(res, 400, 'El archivo está vacío. Verifica que sea la lista de precios correcta.');
    }

    const buscarColumna = (celdas: any[], candidatos: string[]): number => {
      const normalizadas = celdas.map((c) => normalizarNombre(c));
      let idx = normalizadas.findIndex((c) => c && candidatos.includes(c));
      if (idx === -1) idx = normalizadas.findIndex((c) => c && candidatos.some((cand) => c.includes(cand)));
      return idx;
    };

    let filaEncabezado = -1;
    let cols = { codigo: -1, descripcion: -1, precio: -1, unidad: -1, fecha: -1 };

    for (let i = 0; i < Math.min(matriz.length, 15); i++) {
      const celdas = matriz[i] ?? [];
      const candidato = {
        codigo: buscarColumna(celdas, CABECERAS_LISTA.codigo),
        descripcion: buscarColumna(celdas, CABECERAS_LISTA.descripcion),
        precio: buscarColumna(celdas, CABECERAS_LISTA.precio),
        unidad: buscarColumna(celdas, CABECERAS_LISTA.unidad),
        fecha: buscarColumna(celdas, CABECERAS_LISTA.fecha),
      };
      // Sin precio no hay nada que importar; y hace falta código o descripción para identificar el ítem
      if (candidato.precio > -1 && (candidato.codigo > -1 || candidato.descripcion > -1)) {
        filaEncabezado = i;
        cols = candidato;
        break;
      }
    }

    if (filaEncabezado === -1) {
      return fallar(
        res,
        400,
        'No se reconocieron las columnas de la lista. El archivo debe tener una fila de encabezados con al menos "Precio" y "Código" (o "Descripción"). Renombra los títulos y vuelve a intentarlo.'
      );
    }

    const nombreCol = (idx: number): string | null =>
      idx > -1 ? String(matriz[filaEncabezado][idx] ?? '').trim() || null : null;

    const columnasDetectadas = {
      codigo: nombreCol(cols.codigo),
      descripcion: nombreCol(cols.descripcion),
      precio: nombreCol(cols.precio),
      unidad: nombreCol(cols.unidad),
      fecha: nombreCol(cols.fecha),
    };

    // ── 2. Leer las filas ──────────────────────────────────────────────────────
    const MAX_FILAS = 3000;
    const filas: FilaLista[] = [];
    const errores: string[] = [];
    let filasIgnoradas = 0;

    for (let i = filaEncabezado + 1; i < matriz.length; i++) {
      if (filas.length >= MAX_FILAS) {
        errores.push(`La lista supera las ${MAX_FILAS} filas: se procesaron las primeras ${MAX_FILAS}.`);
        break;
      }

      const celdas = matriz[i] ?? [];

      // Las filas en blanco de separación no son un error del archivo: se saltan sin
      // contarlas, para que "filas ignoradas" siga significando "filas con datos que
      // no se pudieron usar".
      if (celdas.every((c) => c === null || c === undefined || String(c).trim() === '')) continue;

      const descripcion = cols.descripcion > -1 ? String(celdas[cols.descripcion] ?? '').trim() : '';
      const codigoBruto = cols.codigo > -1 ? String(celdas[cols.codigo] ?? '').trim() : '';
      const precio = parsearPrecioCelda(cols.precio > -1 ? celdas[cols.precio] : null);

      if (!codigoBruto && !descripcion) { filasIgnoradas++; continue; }

      if (precio === null) {
        filasIgnoradas++;
        if (errores.length < 15) {
          errores.push(`Fila ${i + 1}: sin precio válido ("${codigoBruto || descripcion}"). No se tuvo en cuenta.`);
        }
        continue;
      }

      // Sin código propio se deriva de la descripción con el mismo algoritmo que usa
      // la ingesta de facturas: así la lista y la FE del mismo ítem coinciden.
      const codigo = (codigoBruto || derivarCodigo(descripcion)).slice(0, 100);

      let fecha: string | null = null;
      if (cols.fecha > -1) fecha = aFechaISO(celdas[cols.fecha]);

      filas.push({
        fila: i + 1,
        codigo,
        descripcion: descripcion || codigoBruto,
        precio,
        unidad: cols.unidad > -1 ? unidadDesdeTexto(celdas[cols.unidad]) : null,
        fecha,
      });
    }

    if (filas.length === 0) {
      return fallar(res, 400, 'No se encontró ninguna fila con código y precio válidos debajo de los encabezados.');
    }

    // ── 3. Contrastar contra lo ya conocido de este proveedor ──────────────────
    const codigos = Array.from(new Set(filas.map((f) => f.codigo)));

    const [equivalencias, bandeja] = await Promise.all([
      ProveedorProducto.findAll({
        where: { proveedor_id: proveedorId, codigo_proveedor: { [Op.in]: codigos }, activo: true },
        attributes: ['id', 'codigo_proveedor', 'catalogo_producto_id', 'unidad_compra', 'precio_actual', 'fecha_precio_actual'],
      }),
      ProveedorCodigoPendiente.findAll({
        where: { proveedor_id: proveedorId, codigo_proveedor: { [Op.in]: codigos } },
        attributes: ['id', 'codigo_proveedor', 'estado'],
      }),
    ]);

    const equivPorCodigo = new Map<string, any[]>();
    for (const eq of equivalencias) {
      const cod = eq.getDataValue('codigo_proveedor');
      if (!equivPorCodigo.has(cod)) equivPorCodigo.set(cod, []);
      equivPorCodigo.get(cod)!.push(eq);
    }
    const bandejaPorCodigo = new Map<string, any>();
    for (const b of bandeja) bandejaPorCodigo.set(b.getDataValue('codigo_proveedor'), b);

    // IVA por producto, solo si hay que descontarlo de precios con IVA incluido
    const ivaPorProducto = new Map<number, number>();
    if (preciosConIva && equivalencias.length > 0) {
      const idsProducto = Array.from(new Set(equivalencias.map((e: any) => Number(e.getDataValue('catalogo_producto_id')))));
      const productos = await CatalogoProducto.findAll({
        where: { id: { [Op.in]: idsProducto } },
        attributes: ['id', 'porcentaje_iva'],
      });
      for (const p of productos) {
        ivaPorProducto.set(Number(p.getDataValue('id')), Number(p.getDataValue('porcentaje_iva') ?? 19));
      }
    }

    const umbral = await obtenerUmbral();

    interface CambioLista {
      fila: number;
      codigo: string;
      descripcion: string;
      unidad_compra: string;
      precio_anterior: number | null;
      precio_nuevo: number;
      variacion_pct: number | null;
      anomalo: boolean;
      retroactivo: boolean;
    }

    const cambios: CambioLista[] = [];
    const nuevosPendientes: Array<{ fila: number; codigo: string; descripcion: string; precio: number }> = [];
    const ambiguas: Array<{ fila: number; codigo: string; motivo: string }> = [];
    let sinCambio = 0;

    // Plan de trabajo: qué equivalencia recibe qué precio. Se calcula igual para la
    // previsualización y para la aplicación, así lo que el usuario aprueba es lo que ocurre.
    const plan: Array<{ pp: any; precio: number; fecha: string; fila: FilaLista }> = [];

    for (const f of filas) {
      const candidatas = equivPorCodigo.get(f.codigo) ?? [];
      const fechaVigencia = f.fecha ?? fechaLista;

      if (candidatas.length === 0) {
        const pendiente = bandejaPorCodigo.get(f.codigo);
        const estado = pendiente?.getDataValue('estado');
        if (estado === 'DESCARTADO') {
          ambiguas.push({ fila: f.fila, codigo: f.codigo, motivo: 'Descartado antes por decisión humana: no se reabre.' });
        } else {
          nuevosPendientes.push({ fila: f.fila, codigo: f.codigo, descripcion: f.descripcion, precio: f.precio });
        }
        continue;
      }

      // Misma regla que la ingesta de facturas: la unidad decide qué precio se toca.
      let objetivo: any[];
      if (f.unidad) {
        objetivo = candidatas.filter((eq) => eq.getDataValue('unidad_compra') === f.unidad);
      } else if (candidatas.length === 1) {
        objetivo = candidatas;
      } else {
        objetivo = candidatas.filter((eq) => eq.getDataValue('unidad_compra') === unidadDefecto);
      }

      if (objetivo.length === 0) {
        ambiguas.push({
          fila: f.fila,
          codigo: f.codigo,
          motivo: f.unidad
            ? `La lista lo cotiza por ${f.unidad} y no hay equivalencia en esa modalidad.`
            : 'Tiene varias modalidades registradas y la lista no dice cuál. Precio no aplicado.',
        });
        continue;
      }

      for (const pp of objetivo) {
        let precioBase = f.precio;
        if (preciosConIva) {
          const iva = ivaPorProducto.get(Number(pp.getDataValue('catalogo_producto_id'))) ?? 19;
          precioBase = +(precioBase / (1 + iva / 100)).toFixed(2);
        }

        const actualRaw = pp.getDataValue('precio_actual');
        const precioAnterior = actualRaw === null || actualRaw === undefined ? null : parseFloat(actualRaw);
        const fechaActual = aFechaISO(pp.getDataValue('fecha_precio_actual'));
        const retroactivo = !!(fechaActual && fechaVigencia < fechaActual);

        if (!retroactivo && precioAnterior !== null && precioAnterior === precioBase) {
          sinCambio++;
          continue;
        }

        const variacion = precioAnterior !== null && precioAnterior > 0
          ? ((precioBase - precioAnterior) / precioAnterior) * 100
          : null;

        cambios.push({
          fila: f.fila,
          codigo: f.codigo,
          descripcion: f.descripcion,
          unidad_compra: pp.getDataValue('unidad_compra'),
          precio_anterior: precioAnterior,
          precio_nuevo: precioBase,
          variacion_pct: variacion !== null ? +variacion.toFixed(2) : null,
          anomalo: variacion !== null && Math.abs(variacion) > umbral,
          retroactivo,
        });

        plan.push({ pp, precio: precioBase, fecha: fechaVigencia, fila: f });
      }
    }

    const resumen = {
      dry_run: dryRun,
      proveedor: { id: proveedorId, nombre_comercial: proveedor.getDataValue('nombre_comercial') },
      archivo: req.file.originalname,
      fila_encabezado: filaEncabezado + 1,
      columnas_detectadas: columnasDetectadas,
      total_filas_leidas: filas.length,
      filas_ignoradas: filasIgnoradas,
      precios_sin_cambio: sinCambio,
      precios_actualizados: cambios,
      codigos_nuevos_pendientes: nuevosPendientes,
      filas_no_aplicadas: ambiguas,
      umbral_variacion_pct: umbral,
      errores,
    };

    // ── 4. Previsualización: se responde sin haber tocado nada ─────────────────
    if (dryRun) {
      return res.json({
        ...resumen,
        message: `Previsualización: ${cambios.length} precio(s) cambiarían, ${nuevosPendientes.length} código(s) irían a la bandeja. Nada se ha guardado todavía.`,
      });
    }

    // ── 5. Aplicar ─────────────────────────────────────────────────────────────
    const documentoRef = `LISTA-${req.file.originalname}`.slice(0, 100);
    const t = await sequelize.transaction();
    try {
      for (const item of plan) {
        await actualizarPrecio(item.pp, item.precio, item.fecha, {
          origen: 'LISTA',
          registradoPor: userId,
          documentoRef,
          transaction: t,
        });
      }

      let pendientesCreados = 0;
      if (crearPendientes) {
        for (const np of nuevosPendientes) {
          const existente = bandejaPorCodigo.get(np.codigo);
          if (existente) {
            await existente.update(
              {
                estado: 'PENDIENTE',
                precio_detectado: np.precio,
                documento_ref: documentoRef,
                fecha_deteccion: fechaLista,
                descripcion_proveedor: np.descripcion || existente.getDataValue('descripcion_proveedor'),
              },
              { transaction: t }
            );
          } else {
            const creado = await ProveedorCodigoPendiente.create(
              {
                proveedor_id: proveedorId,
                codigo_proveedor: np.codigo,
                descripcion_proveedor: np.descripcion,
                precio_detectado: np.precio,
                documento_ref: documentoRef,
                veces_visto: 1,
                estado: 'PENDIENTE',
                fecha_deteccion: fechaLista,
              },
              { transaction: t }
            );
            bandejaPorCodigo.set(np.codigo, creado);
          }
          pendientesCreados++;
        }
      }

      await t.commit();

      return res.json({
        ...resumen,
        pendientes_registrados: pendientesCreados,
        message: `Lista aplicada: ${cambios.length} precio(s) actualizado(s)${pendientesCreados ? `, ${pendientesCreados} código(s) enviado(s) a Por Mapear` : ''}.`,
      });
    } catch (errAplicar: any) {
      await t.rollback();
      throw errAplicar;
    }
  } catch (err: any) {
    const { status, mensaje } = mensajeDeError(err, 'No se pudo importar la lista de precios');
    fallar(res, status, mensaje, err);
  }
};

// ─── GET /api/proveedores/facturas ───────────────────────────────────────────
/**
 * Bitácora de la ingesta: qué documentos entraron, de quién y qué movieron.
 *
 * La tabla se escribía desde el primer día pero no la leía nadie, así que la
 * pregunta operativa más frecuente — "¿ya cargué las facturas de este proveedor?"
 * — solo se podía responder volviendo a subir el lote y mirando cuántas rebotaban
 * por CUFE repetido.
 */
export const listarFacturasProcesadas = async (req: Request, res: Response) => {
  try {
    const { q, proveedor_id, tipo_documento } = req.query;
    const limit = Math.min(parseInt(String(req.query.limit ?? 50), 10) || 50, MAX_PAGINA);
    const offset = Math.max(parseInt(String(req.query.offset ?? 0), 10) || 0, 0);

    const where: any = {};
    if (proveedor_id) where.proveedor_id = Number(proveedor_id);
    if (tipo_documento) where.tipo_documento = String(tipo_documento).toUpperCase();
    if (q) {
      const termino = String(q).trim();
      where[Op.or] = [
        { numero_factura: { [Op.iLike]: `%${termino}%` } },
        { archivo_origen: { [Op.iLike]: `%${termino}%` } },
        { cufe: termino },
      ];
    }

    const { rows, count } = await FacturaProveedorProcesada.findAndCountAll({
      where,
      include: [{ model: Proveedor, as: 'proveedor', attributes: ['id', 'nombre_comercial'] }],
      attributes: [
        'id', 'cufe', 'numero_factura', 'fecha_emision', 'tipo_documento', 'moneda',
        'lineas_totales', 'lineas_actualizadas', 'lineas_pendientes', 'lineas_omitidas',
        'motivo_omision', 'archivo_origen', 'fecha_procesado',
      ],
      order: [['fecha_emision', 'DESC'], ['id', 'DESC']],
      limit,
      offset,
    });

    res.json({ items: rows, total: count, limit, offset });
  } catch (err: any) {
    const { status, mensaje } = mensajeDeError(err, 'No se pudo cargar el historial de facturas procesadas');
    fallar(res, status, mensaje, err);
  }
};

// ─── POST /api/proveedores/facturas/cargar ──────────────────────────────────

interface LineaAgrupada {
  descripcion: string;
  maxPrecio: number;
  unidad: string;
  unidadConfiable: boolean;
  porcentajeIva: number;
  codigoDerivado: boolean;
  ocurrencias: number;
}

interface PrecioActualizadoItem {
  codigo_proveedor: string;
  descripcion: string;
  proveedor_nombre: string;
  precio_anterior: number;
  precio_nuevo: number;
  variacion_pct: number;
  anomalo: boolean;
  retroactivo: boolean;
}

interface AvisoLote {
  tipo: 'UNIDAD_DISTINTA' | 'IVA_DISTINTO' | 'MONEDA' | 'NOTA_CREDITO' | 'PROVEEDOR_NUEVO';
  proveedor_nombre: string;
  detalle: string;
}

/**
 * Ingesta de facturas electrónicas.
 *
 * Orden de operaciones y por qué:
 *  1. Parsear todo primero y ORDENAR POR FECHA DE EMISIÓN. El precio vigente lo
 *     define la fecha de la factura, no el orden en que el navegador subió los
 *     archivos; sin este paso un lote con fechas mezcladas deja como precio actual
 *     el de la factura más antigua.
 *  2. Descartar CUFEs ya registrados consultando `factura_proveedor_procesada` en
 *     una sola consulta.
 *  3. Precargar proveedores, equivalencias y bandeja en memoria. Antes se consultaba
 *     la BD tres veces por línea, más una búsqueda de CUFE que recorría el histórico
 *     entero: miles de consultas por lote.
 *  4. Procesar cada factura dentro de su propia transacción, para que un documento
 *     defectuoso no arrastre al resto del lote.
 */
export const cargarFacturasLote = async (req: Request, res: Response) => {
  try {
    const files = (req.files as Express.Multer.File[]) || [];
    if (files.length === 0) {
      return fallar(res, 400, 'No se recibió ningún archivo. Arrastra los .zip o .xml de tus facturas.');
    }

    const userId = req.user?.id ?? null;
    const errores: string[] = [];
    const avisos: AvisoLote[] = [];

    // ── 1. Parsear todos los archivos ──────────────────────────────────────────
    type FacturaEnLote = FacturaParseada & { archivo: string };
    const facturas: FacturaEnLote[] = [];

    for (const file of files) {
      try {
        const parseadas = procesarBufferFactura(file.buffer, file.originalname);
        if (parseadas.length === 0) {
          errores.push(`${file.originalname}: no contiene un XML de factura electrónica válido`);
          continue;
        }
        for (const f of parseadas) facturas.push({ ...f, archivo: file.originalname });
      } catch (fileErr: any) {
        errores.push(`${file.originalname}: no se pudo leer (${fileErr.message})`);
      }
    }

    // ── 2. Deduplicar por CUFE: dentro del lote y contra lo ya procesado ──────
    let facturasDuplicadasCufe = 0;
    const vistosEnLote = new Set<string>();
    const candidatas: FacturaEnLote[] = [];

    for (const f of facturas) {
      if (f.cufe) {
        if (vistosEnLote.has(f.cufe)) { facturasDuplicadasCufe++; continue; }
        vistosEnLote.add(f.cufe);
      }
      candidatas.push(f);
    }

    const cufes = candidatas.map(f => f.cufe).filter((c): c is string => !!c);
    const yaProcesadas = cufes.length
      ? await FacturaProveedorProcesada.findAll({ where: { cufe: { [Op.in]: cufes } }, attributes: ['cufe'] })
      : [];
    const cufesRegistrados = new Set(yaProcesadas.map((f: any) => f.getDataValue('cufe')));

    const pendientesDeProcesar = candidatas.filter(f => {
      if (f.cufe && cufesRegistrados.has(f.cufe)) { facturasDuplicadasCufe++; return false; }
      return true;
    });

    // ── 3. Ordenar cronológicamente ───────────────────────────────────────────
    pendientesDeProcesar.sort((a, b) => (a.fecha_emision || '').localeCompare(b.fecha_emision || ''));

    // ── 4. Resolver proveedores en bloque ─────────────────────────────────────
    const maestro = await Proveedor.findAll({
      attributes: ['id', 'nit', 'numero_identificacion', 'nombre_comercial', 'razon_social', 'seguir_precios'],
    });

    const porNit = new Map<string, any>();
    const porNombre = new Map<string, any>();
    for (const p of maestro) {
      const nit = normalizarNit(p.getDataValue('nit')) ?? normalizarNit(p.getDataValue('numero_identificacion'));
      if (nit && !porNit.has(nit)) porNit.set(nit, p);
      for (const campo of ['nombre_comercial', 'razon_social']) {
        const clave = normalizarNombre(p.getDataValue(campo));
        if (clave && !porNombre.has(clave)) porNombre.set(clave, p);
      }
    }

    /** Match exacto sobre NIT normalizado; el LIKE anterior emparejaba 900123 con 1900123456 */
    const resolverProveedor = async (fac: FacturaEnLote) => {
      const nit = normalizarNit(fac.emisor_nit);
      if (nit && porNit.has(nit)) return porNit.get(nit);

      const clave = normalizarNombre(fac.emisor_nombre);
      if (clave && porNombre.has(clave)) return porNombre.get(clave);

      const nuevo = await Proveedor.create({
        nit: nit,
        numero_identificacion: nit,
        nombre_comercial: fac.emisor_nombre || `Proveedor ${nit || 'S/N'}`,
        razon_social: fac.emisor_nombre || null,
        activo: true,
        seguir_precios: true,
        origen_registro: 'INGESTA_FE',
      });
      if (nit) porNit.set(nit, nuevo);
      if (clave) porNombre.set(clave, nuevo);
      avisos.push({
        tipo: 'PROVEEDOR_NUEVO',
        proveedor_nombre: nuevo.getDataValue('nombre_comercial'),
        detalle: `Registrado automáticamente desde la factura ${fac.numero}. Revísalo en la pestaña Proveedores.`,
      });
      return nuevo;
    };

    // ── 5. Procesar ───────────────────────────────────────────────────────────
    let facturasProcesadas = 0;
    let preciosSinCambio = 0;
    let codigosNuevosPendientes = 0;
    let notasCredito = 0;
    let lineasOmitidasProveedor = 0;
    const preciosActualizados: PrecioActualizadoItem[] = [];

    for (const fac of pendientesDeProcesar) {
      const t = await sequelize.transaction();
      try {
        const proveedor = await resolverProveedor(fac);
        const proveedorId = proveedor.getDataValue('id');
        const proveedorNombre = proveedor.getDataValue('nombre_comercial');
        const docRef = `${fac.tipo_documento === 'FACTURA' ? 'FE' : 'NC'}-${fac.numero}`.slice(0, 100);

        const registrarDocumento = async (motivo: string | null, totales: { act: number; pend: number; omit: number }) => {
          if (!fac.cufe) return;
          await FacturaProveedorProcesada.create(
            {
              cufe: fac.cufe,
              proveedor_id: proveedorId,
              numero_factura: String(fac.numero).slice(0, 60),
              fecha_emision: fac.fecha_emision,
              tipo_documento: fac.tipo_documento,
              moneda: fac.moneda,
              lineas_totales: fac.lineas.length,
              lineas_actualizadas: totales.act,
              lineas_pendientes: totales.pend,
              lineas_omitidas: totales.omit,
              motivo_omision: motivo,
              archivo_origen: fac.archivo.slice(0, 255),
              procesado_por: userId,
            },
            { transaction: t }
          );
        };

        // Notas crédito/débito: corrigen una factura previa. Registrar su valor como
        // precio de compra distorsiona el histórico, así que se deja constancia y no
        // se mueven precios.
        if (fac.tipo_documento !== 'FACTURA') {
          notasCredito++;
          avisos.push({
            tipo: 'NOTA_CREDITO',
            proveedor_nombre: proveedorNombre,
            detalle: `${fac.tipo_documento === 'NOTA_CREDITO' ? 'Nota crédito' : 'Nota débito'} ${fac.numero}: registrada, sin afectar precios.`,
          });
          await registrarDocumento(fac.tipo_documento, { act: 0, pend: 0, omit: fac.lineas.length });
          await t.commit();
          facturasProcesadas++;
          continue;
        }

        // Moneda distinta a COP: el precio no es comparable con el resto del maestro.
        if (fac.moneda && fac.moneda !== 'COP') {
          avisos.push({
            tipo: 'MONEDA',
            proveedor_nombre: proveedorNombre,
            detalle: `Factura ${fac.numero} emitida en ${fac.moneda}: no se registran precios para no mezclar monedas.`,
          });
          await registrarDocumento('MONEDA_EXTRANJERA', { act: 0, pend: 0, omit: fac.lineas.length });
          await t.commit();
          facturasProcesadas++;
          continue;
        }

        // Proveedor excluido del seguimiento de precios
        if (proveedor.getDataValue('seguir_precios') === false) {
          lineasOmitidasProveedor += fac.lineas.length;
          await registrarDocumento('PROVEEDOR_NO_SEGUIDO', { act: 0, pend: 0, omit: fac.lineas.length });
          await t.commit();
          facturasProcesadas++;
          continue;
        }

        // Agrupar líneas del mismo producto — manda el precio mayor (compras.md §8),
        // comparando solo entre líneas de la misma unidad.
        const agrupadas = new Map<string, LineaAgrupada>();
        for (const linea of fac.lineas) {
          const cod = linea.codigo_proveedor.trim() || 'SIN_CODIGO';
          const clave = `${cod}|${linea.unidad}`;
          const existente = agrupadas.get(clave);
          if (!existente) {
            agrupadas.set(clave, {
              descripcion: linea.descripcion,
              maxPrecio: linea.precio_unitario,
              unidad: linea.unidad,
              unidadConfiable: linea.unidad_confiable,
              porcentajeIva: linea.porcentaje_iva,
              codigoDerivado: linea.codigo_derivado,
              ocurrencias: 1,
            });
          } else {
            existente.ocurrencias++;
            if (linea.precio_unitario > existente.maxPrecio) {
              existente.maxPrecio = linea.precio_unitario;
              existente.descripcion = linea.descripcion;
              existente.porcentajeIva = linea.porcentaje_iva;
            }
          }
        }

        // Equivalencias y bandeja de este proveedor, en dos consultas
        const codigos = Array.from(agrupadas.keys()).map(k => k.split('|')[0]);
        const [equivalencias, bandeja] = await Promise.all([
          ProveedorProducto.findAll({
            where: { proveedor_id: proveedorId, codigo_proveedor: { [Op.in]: codigos }, activo: true },
            transaction: t,
          }),
          ProveedorCodigoPendiente.findAll({
            where: { proveedor_id: proveedorId, codigo_proveedor: { [Op.in]: codigos } },
            transaction: t,
          }),
        ]);

        const equivPorCodigo = new Map<string, any[]>();
        for (const eq of equivalencias) {
          const cod = eq.getDataValue('codigo_proveedor');
          if (!equivPorCodigo.has(cod)) equivPorCodigo.set(cod, []);
          equivPorCodigo.get(cod)!.push(eq);
        }
        const bandejaPorCodigo = new Map<string, any>();
        for (const b of bandeja) bandejaPorCodigo.set(b.getDataValue('codigo_proveedor'), b);

        // Productos del catálogo de las equivalencias tocadas por esta factura.
        // El contraste de IVA hacía un findByPk por línea actualizada: en una factura
        // de 40 líneas mapeadas eran 40 consultas para leer tres columnas.
        const productosPorId = new Map<number, any>();
        const idsProducto = Array.from(
          new Set(equivalencias.map((eq: any) => Number(eq.getDataValue('catalogo_producto_id'))))
        ).filter(Number.isFinite);
        if (idsProducto.length > 0) {
          const productosFactura = await CatalogoProducto.findAll({
            where: { id: { [Op.in]: idsProducto } },
            attributes: ['id', 'codigo', 'porcentaje_iva'],
            transaction: t,
          });
          for (const prod of productosFactura) productosPorId.set(prod.getDataValue('id'), prod);
        }

        let actualizadas = 0;
        let nuevasPendientes = 0;
        let omitidas = 0;

        // La bandeja tiene UNIQUE (proveedor, código), así que un código facturado en
        // dos unidades distintas dentro del MISMO documento ocupa una sola fila. Sin
        // este control, la segunda vuelta sumaba otra aparición y dejaba como precio
        // detectado el de la otra modalidad — dos cifras no comparables en una casilla.
        const codigosVistosEnFactura = new Set<string>();

        for (const [clave, info] of agrupadas.entries()) {
          const codigoProv = clave.split('|')[0];
          const candidatas = equivPorCodigo.get(codigoProv) ?? [];
          const repetidoEnOtraUnidad = codigosVistosEnFactura.has(codigoProv);
          codigosVistosEnFactura.add(codigoProv);

          // Elegir contra qué modalidad se compara el precio.
          //  · Unidad informativa en el XML (MTR, KGM, MTK): solo se actualiza la
          //    equivalencia de esa misma modalidad.
          //  · Unidad genérica ("94", "EA"): el XML no afirma nada, así que se confía
          //    en la equivalencia registrada — pero solo si hay una sola. Con dos
          //    modalidades activas no hay forma de saber a cuál corresponde, y
          //    escribir el mismo precio en ambas era exactamente el defecto a evitar.
          let objetivo: any[] = [];
          if (candidatas.length > 0) {
            if (info.unidadConfiable) {
              objetivo = candidatas.filter(eq => eq.getDataValue('unidad_compra') === info.unidad);
            } else if (candidatas.length === 1) {
              objetivo = candidatas;
            }
          }

          if (candidatas.length > 0 && objetivo.length === 0) {
            // Hay equivalencia para el código pero no se puede decidir la modalidad:
            // no se pisa ningún precio y queda constancia para revisión.
            omitidas++;
            avisos.push({
              tipo: 'UNIDAD_DISTINTA',
              proveedor_nombre: proveedorNombre,
              detalle: info.unidadConfiable
                ? `${codigoProv} (${info.descripcion}) llegó facturado por ${info.unidad}, pero no hay equivalencia en esa modalidad. Precio no aplicado.`
                : `${codigoProv} (${info.descripcion}) tiene varias modalidades registradas y la factura no precisa la unidad. Precio no aplicado.`,
            });
            continue;
          }

          if (objetivo.length > 0) {
            for (const pp of objetivo) {
              const anteriorRaw = pp.getDataValue('precio_actual');
              const precioAnt = anteriorRaw === null || anteriorRaw === undefined ? 0 : parseFloat(anteriorRaw);

              const resAct = await actualizarPrecio(pp, info.maxPrecio, fac.fecha_emision, {
                origen: 'FACTURA',
                registradoPor: userId,
                documentoRef: docRef,
                cufe: fac.cufe,
                porcentajeIva: info.porcentajeIva,
                lineasEnFactura: info.ocurrencias,
                transaction: t,
              });

              if (resAct.cambio || resAct.retroactivo) {
                actualizadas++;
                preciosActualizados.push({
                  codigo_proveedor: codigoProv,
                  descripcion: info.descripcion,
                  proveedor_nombre: proveedorNombre,
                  precio_anterior: precioAnt,
                  precio_nuevo: info.maxPrecio,
                  variacion_pct: resAct.variacionPct ?? 0,
                  anomalo: resAct.anomalo,
                  retroactivo: resAct.retroactivo,
                });
              } else {
                preciosSinCambio++;
              }

              // El IVA del XML es el dato real; si difiere del catálogo, avisar en
              // vez de sobrescribir en silencio una configuración hecha a mano.
              const producto = productosPorId.get(Number(pp.getDataValue('catalogo_producto_id')));
              const ivaCatalogo = producto ? Number(producto.getDataValue('porcentaje_iva')) : null;
              if (ivaCatalogo !== null && Number.isFinite(info.porcentajeIva) && Math.abs(ivaCatalogo - info.porcentajeIva) > 0.01) {
                avisos.push({
                  tipo: 'IVA_DISTINTO',
                  proveedor_nombre: proveedorNombre,
                  detalle: `${producto!.getDataValue('codigo')}: la factura trae IVA ${info.porcentajeIva}% y el catálogo tiene ${ivaCatalogo}%.`,
                });
              }
            }
            continue;
          }

          // Código sin equivalencia → bandeja
          const pendienteExistente = bandejaPorCodigo.get(codigoProv);

          if (pendienteExistente) {
            const estado = pendienteExistente.getDataValue('estado');

            // Un código MAPEADO sin equivalencia activa quedaba en tierra de nadie:
            // ni actualizaba precio ni volvía a aparecer en la bandeja. Se devuelve.
            const debeReactivarse = estado === 'MAPEADO';

            if (repetidoEnOtraUnidad && estado !== 'DESCARTADO') {
              // Ya se registró este código en esta misma factura con otra unidad:
              // se conserva la primera lectura y se deja constancia en vez de pisarla.
              omitidas++;
              avisos.push({
                tipo: 'UNIDAD_DISTINTA',
                proveedor_nombre: proveedorNombre,
                detalle: `${codigoProv} (${info.descripcion}) viene en la misma factura con dos unidades distintas. Se conservó la primera lectura para mapearlo; revisa cuál corresponde.`,
              });
            } else if (estado === 'PENDIENTE' || debeReactivarse) {
              await pendienteExistente.update(
                {
                  estado: 'PENDIENTE',
                  veces_visto: (pendienteExistente.getDataValue('veces_visto') || 1) + 1,
                  precio_detectado: info.maxPrecio,
                  documento_ref: docRef,
                  fecha_deteccion: fac.fecha_emision,
                  unidad_detectada: info.unidadConfiable ? info.unidad : pendienteExistente.getDataValue('unidad_detectada'),
                  porcentaje_iva_detectado: info.porcentajeIva,
                  codigo_derivado: info.codigoDerivado,
                },
                { transaction: t }
              );
              if (debeReactivarse) nuevasPendientes++;
            } else {
              // DESCARTADO: fue una decisión humana, se respeta
              omitidas++;
            }
          } else {
            // Se guarda la INSTANCIA creada, no un booleano: una misma factura puede
            // traer el mismo código en dos unidades distintas (una línea con `MTR` y
            // otra con el relleno genérico `94`), y entonces la segunda vuelta lo
            // encuentra aquí. Con un `true` en el mapa, la rama de arriba llamaba
            // `getDataValue` sobre un booleano y tumbaba la factura entera.
            const pendienteCreado = await ProveedorCodigoPendiente.create(
              {
                proveedor_id: proveedorId,
                codigo_proveedor: codigoProv,
                descripcion_proveedor: info.descripcion,
                precio_detectado: info.maxPrecio,
                documento_ref: docRef,
                veces_visto: 1,
                estado: 'PENDIENTE',
                fecha_deteccion: fac.fecha_emision,
                unidad_detectada: info.unidadConfiable ? info.unidad : null,
                porcentaje_iva_detectado: info.porcentajeIva,
                codigo_derivado: info.codigoDerivado,
              },
              { transaction: t }
            );
            bandejaPorCodigo.set(codigoProv, pendienteCreado);
            nuevasPendientes++;
            codigosNuevosPendientes++;
          }
        }

        await registrarDocumento(null, { act: actualizadas, pend: nuevasPendientes, omit: omitidas });
        await t.commit();
        facturasProcesadas++;
      } catch (facErr: any) {
        await t.rollback();
        errores.push(`${fac.archivo} (factura ${fac.numero}): ${facErr.message}`);
      }
    }

    res.json({
      total_archivos: files.length,
      facturas_procesadas: facturasProcesadas,
      facturas_duplicadas_cufe: facturasDuplicadasCufe,
      notas_credito: notasCredito,
      precios_sin_cambio: preciosSinCambio,
      precios_actualizados: preciosActualizados,
      codigos_nuevos_pendientes: codigosNuevosPendientes,
      lineas_omitidas_proveedor: lineasOmitidasProveedor,
      avisos: avisos.slice(0, 40),
      errores,
    });
  } catch (err: any) {
    const { status, mensaje } = mensajeDeError(err, 'No se pudo procesar el lote de facturas');
    fallar(res, status, mensaje, err);
  }
};

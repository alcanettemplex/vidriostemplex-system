import { Request, Response } from 'express';
import { Op } from 'sequelize';
import * as XLSX from 'xlsx';
import multer from 'multer';
import {
  Proveedor,
  ProveedorProducto,
  ProveedorProductoPrecio,
  ProveedorCodigoPendiente,
  ProductoAlias,
  CatalogoProducto,
  ConfiguracionGlobal,
  Usuario,
} from '../models';
import { procesarBufferFactura } from '../utils/dianXmlParser';

// ─── Helpers internos ─────────────────────────────────────────────────────────

/** Extrae el número limpio del campo Identificacion de World Office.
 *  Formatos posibles: "NIT 900149483 1" | "CC 79448711" | "NIT PENDIENTE"
 */
function extraerNumeroId(identificacion: string): string | null {
  if (!identificacion) return null;
  const partes = identificacion.trim().split(/\s+/);
  for (const p of partes) {
    if (/^\d{6,}$/.test(p)) return p;
  }
  return null;
}

/** Obtiene el umbral de variación de precio desde configuracion_global.
 *  Usa 30 como fallback si la fila no existe (por ej. en entorno de pruebas).
 */
async function obtenerUmbral(): Promise<number> {
  const config = await ConfiguracionGlobal.findOne({ where: { id: 1 } });
  return (config?.getDataValue('umbral_variacion_precio_pct') as number) ?? 30;
}

/** Actualiza el precio vigente de un ProveedorProducto y corre la denormalización.
 *  Solo registra en histórico si el precio efectivamente cambió.
 *  Retorna true si hubo cambio, false si el precio era igual.
 */
async function actualizarPrecio(
  pp: any,
  nuevoPrecio: number,
  fechaVigencia: string,
  origen: 'MANUAL' | 'LISTA' | 'FACTURA',
  registradoPor: number | null,
  documentoRef?: string
): Promise<{ cambio: boolean; anomalo: boolean; variacionPct: number | null }> {
  const precioActual = parseFloat(pp.precio_actual) || null;

  // Si el precio es idéntico solo actualiza la fecha de confirmación
  if (precioActual !== null && precioActual === nuevoPrecio) {
    await pp.update({ fecha_precio_actual: fechaVigencia });
    return { cambio: false, anomalo: false, variacionPct: null };
  }

  // Calcular variación porcentual respecto al precio anterior
  let variacionPct: number | null = null;
  let anomalo = false;
  if (precioActual !== null && precioActual > 0) {
    variacionPct = ((nuevoPrecio - precioActual) / precioActual) * 100;
    const umbral = await obtenerUmbral();
    anomalo = Math.abs(variacionPct) > umbral;
  }

  // Correr denormalización: actual → anterior_1 → anterior_2
  await pp.update({
    precio_anterior_2: pp.precio_anterior_1,
    fecha_anterior_2: pp.fecha_anterior_1,
    precio_anterior_1: pp.precio_actual,
    fecha_anterior_1: pp.fecha_precio_actual,
    precio_actual: nuevoPrecio,
    fecha_precio_actual: fechaVigencia,
  });

  // Registrar en histórico completo
  await ProveedorProductoPrecio.create({
    proveedor_producto_id: pp.id,
    precio: nuevoPrecio,
    fecha_vigencia: fechaVigencia,
    origen,
    documento_ref: documentoRef ?? null,
    registrado_por: registradoPor,
    precio_anomalo: anomalo,
    variacion_pct: variacionPct,
  });

  return { cambio: true, anomalo, variacionPct };
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
export const uploadFacturas = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 40 * 1024 * 1024 }, // 40 MB total por lote
  fileFilter: (_req, file, cb) => {
    const ext = file.originalname.toLowerCase();
    if (ext.endsWith('.zip') || ext.endsWith('.xml')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se aceptan archivos comprimidos .zip o facturas .xml'));
    }
  },
}).array('archivos', 50);

// ─── GET /api/proveedores ─────────────────────────────────────────────────────
export const listarProveedores = async (req: Request, res: Response) => {
  try {
    const { activo, q } = req.query;
    const where: any = {};
    if (activo !== undefined) where.activo = activo === 'true';
    if (q) {
      const term = `%${q}%`;
      where[Op.or] = [
        { nombre_comercial: { [Op.iLike]: term } },
        { nit: { [Op.iLike]: term } },
        { razon_social: { [Op.iLike]: term } },
      ];
    }

    const proveedores = await Proveedor.findAll({
      where,
      order: [['nombre_comercial', 'ASC']],
      attributes: ['id', 'nit', 'nombre_comercial', 'razon_social', 'telefono', 'email', 'activo', 'tipo_identificacion', 'numero_identificacion'],
    });
    res.json(proveedores);
  } catch (err: any) {
    res.status(500).json({ error: 'Error al listar proveedores', detalle: err.message });
  }
};

// ─── POST /api/proveedores ────────────────────────────────────────────────────
export const crearProveedor = async (req: Request, res: Response) => {
  try {
    const { nit, nombre_comercial, razon_social, tipo_identificacion, numero_identificacion, contacto_nombre, telefono, email, direccion, notas, codigo_world_office } = req.body;
    if (!nombre_comercial?.trim()) {
      return res.status(400).json({ error: 'El nombre comercial es obligatorio' });
    }
    const proveedor = await Proveedor.create({
      nit: nit?.trim() || null,
      tipo_identificacion: tipo_identificacion || 'NIT',
      numero_identificacion: numero_identificacion?.trim() || null,
      nombre_comercial: nombre_comercial.trim(),
      razon_social: razon_social?.trim() || null,
      contacto_nombre: contacto_nombre?.trim() || null,
      telefono: telefono?.trim() || null,
      email: email?.trim() || null,
      direccion: direccion?.trim() || null,
      notas: notas?.trim() || null,
      codigo_world_office: codigo_world_office?.trim() || null,
    });
    res.status(201).json(proveedor);
  } catch (err: any) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ error: `Ya existe un proveedor con ese NIT` });
    }
    res.status(500).json({ error: 'Error al crear proveedor', detalle: err.message });
  }
};

// ─── PATCH /api/proveedores/:id ───────────────────────────────────────────────
export const editarProveedor = async (req: Request, res: Response) => {
  try {
    const proveedor = await Proveedor.findByPk(req.params.id);
    if (!proveedor) return res.status(404).json({ error: 'Proveedor no encontrado' });
    await proveedor.update(req.body);
    res.json(proveedor);
  } catch (err: any) {
    res.status(500).json({ error: 'Error al editar proveedor', detalle: err.message });
  }
};

// ─── DELETE /api/proveedores/:id ──────────────────────────────────────────────
export const desactivarProveedor = async (req: Request, res: Response) => {
  try {
    const proveedor = await Proveedor.findByPk(req.params.id);
    if (!proveedor) return res.status(404).json({ error: 'Proveedor no encontrado' });
    await proveedor.update({ activo: false });
    res.json({ message: 'Proveedor desactivado' });
  } catch (err: any) {
    res.status(500).json({ error: 'Error al desactivar proveedor', detalle: err.message });
  }
};

// ─── POST /api/proveedores/importar-excel ─────────────────────────────────────
/**
 * Importa el archivo proveedores_limpio.xlsx generado por el script de limpieza.
 * Optimizado: Lee existentes en memoria y usa bulkCreate para procesar 1.805 filas en ~1 segundo.
 */
export const importarExcel = async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo' });

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames.includes('Proveedores_Limpios')
      ? 'Proveedores_Limpios'
      : workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows: any[] = XLSX.utils.sheet_to_json(sheet);

    if (!rows || rows.length === 0) {
      return res.status(400).json({ error: 'El archivo Excel no contiene filas' });
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
    console.error('Error en importarExcel:', err);
    res.status(500).json({ error: 'Error al importar Excel', detalle: err.message });
  }
};

// ─── GET /api/proveedores/consulta ───────────────────────────────────────────
/**
 * Pantalla principal: busca un producto por código, nombre o alias y retorna
 * todos sus proveedores con precio comparativo, ordenados por precio_actual ASC.
 */
export const consultarPrecios = async (req: Request, res: Response) => {
  try {
    const { codigo, nombre, modalidad } = req.query;
    if (!codigo && !nombre) {
      return res.status(400).json({ error: 'Debe especificar código o nombre del producto' });
    }

    // Buscar el producto en catálogo (incluyendo aliases)
    let producto: any = null;
    if (codigo) {
      producto = await CatalogoProducto.findOne({
        where: { codigo: String(codigo).toUpperCase() },
        attributes: ['id', 'codigo', 'nombre', 'unidad_medida', 'porcentaje_iva'],
      });
    }

    if (!producto && nombre) {
      // Búsqueda por nombre directo
      producto = await CatalogoProducto.findOne({
        where: { nombre: { [Op.iLike]: `%${nombre}%` }, activo: true },
        attributes: ['id', 'codigo', 'nombre', 'unidad_medida', 'porcentaje_iva'],
      });

      // Si no lo encontró por nombre, buscar por alias
      if (!producto) {
        const alias = await ProductoAlias.findOne({
          where: { alias: { [Op.iLike]: `%${nombre}%` } },
          include: [{ model: CatalogoProducto, as: 'producto', attributes: ['id', 'codigo', 'nombre', 'unidad_medida', 'porcentaje_iva'] }],
        });
        producto = alias?.getDataValue('producto') ?? null;
      }
    }

    if (!producto) {
      return res.status(404).json({ error: 'Producto no encontrado en el catálogo' });
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
      const precioActual = parseFloat(pp.precio_actual) || null;
      const precioAnterior1 = parseFloat(pp.precio_anterior_1) || null;
      let variacionPct: number | null = null;
      let anomalo = false;

      if (precioActual && precioAnterior1) {
        variacionPct = ((precioActual - precioAnterior1) / precioAnterior1) * 100;
        anomalo = Math.abs(variacionPct) > umbral;
      }

      // Precio por metro derivado (solo para TIRA_6M)
      const precioMetroDerivado = pp.unidad_compra === 'TIRA_6M' && precioActual && pp.metros_por_unidad
        ? precioActual / parseFloat(pp.metros_por_unidad)
        : null;

      return {
        proveedor_producto_id: pp.id,
        proveedor: pp.proveedor,
        codigo_proveedor: pp.codigo_proveedor,
        descripcion_proveedor: pp.descripcion_proveedor,
        unidad_compra: pp.unidad_compra,
        precio_sin_iva: precioActual,
        precio_con_iva: precioActual ? +(precioActual * (1 + pct_iva / 100)).toFixed(2) : null,
        precio_metro_derivado: precioMetroDerivado ? +precioMetroDerivado.toFixed(2) : null,
        fecha_precio_actual: pp.fecha_precio_actual,
        precio_anterior_1: pp.precio_anterior_1,
        fecha_anterior_1: pp.fecha_anterior_1,
        precio_anterior_2: pp.precio_anterior_2,
        fecha_anterior_2: pp.fecha_anterior_2,
        variacion_pct: variacionPct ? +variacionPct.toFixed(2) : null,
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
    res.status(500).json({ error: 'Error al consultar precios', detalle: err.message });
  }
};

// ─── GET /api/proveedores/:id/productos ───────────────────────────────────────
export const listarProductosProveedor = async (req: Request, res: Response) => {
  try {
    const productos = await ProveedorProducto.findAll({
      where: { proveedor_id: req.params.id, activo: true },
      include: [{ model: CatalogoProducto, as: 'producto', attributes: ['id', 'codigo', 'nombre', 'unidad_medida'] }],
      order: [['precio_actual', 'ASC']],
    });
    res.json(productos);
  } catch (err: any) {
    res.status(500).json({ error: 'Error al listar productos del proveedor', detalle: err.message });
  }
};

// ─── POST /api/proveedores/:id/productos ──────────────────────────────────────
export const agregarPrecioManual = async (req: Request, res: Response) => {
  try {
    const { catalogo_producto_id, codigo_proveedor, descripcion_proveedor, unidad_compra = 'UNIDAD', precio, fecha_precio, guardar_alias = true } = req.body;
    const proveedor_id = parseInt(req.params.id);
    const userId = (req as any).user?.id ?? null;

    if (!catalogo_producto_id || !precio) {
      return res.status(400).json({ error: 'producto y precio son obligatorios' });
    }

    // Verificar que el proveedor y el producto existen
    const [proveedor, producto] = await Promise.all([
      Proveedor.findByPk(proveedor_id),
      CatalogoProducto.findByPk(catalogo_producto_id),
    ]);
    if (!proveedor) return res.status(404).json({ error: 'Proveedor no encontrado' });
    if (!producto) return res.status(404).json({ error: 'Producto no encontrado en el catálogo' });

    const fechaVigencia = fecha_precio ?? new Date().toISOString().split('T')[0];

    // Crear o actualizar la relación proveedor_producto
    const [pp, creado] = await ProveedorProducto.findOrCreate({
      where: { proveedor_id, catalogo_producto_id, unidad_compra },
      defaults: {
        proveedor_id,
        catalogo_producto_id,
        codigo_proveedor: codigo_proveedor?.trim() || null,
        descripcion_proveedor: descripcion_proveedor?.trim() || null,
        unidad_compra,
        precio_actual: parseFloat(precio),
        fecha_precio_actual: fechaVigencia,
      },
    });

    if (!creado) {
      // Ya existía — actualizar precio con la lógica de cambio
      await actualizarPrecio(pp, parseFloat(precio), fechaVigencia, 'MANUAL', userId);
    } else {
      // Primer precio — registrar directamente en histórico
      await ProveedorProductoPrecio.create({
        proveedor_producto_id: pp.getDataValue('id'),
        precio: parseFloat(precio),
        fecha_vigencia: fechaVigencia,
        origen: 'MANUAL',
        registrado_por: userId,
      });
    }

    // Guardar descripción del proveedor como alias del producto (aprendizaje automático)
    if (guardar_alias && descripcion_proveedor?.trim()) {
      await ProductoAlias.findOrCreate({
        where: { catalogo_producto_id, alias: descripcion_proveedor.trim() },
        defaults: { catalogo_producto_id, alias: descripcion_proveedor.trim(), origen: 'PROVEEDOR', proveedor_id },
      });
    }

    res.status(creado ? 201 : 200).json({ message: creado ? 'Mapeo creado' : 'Precio actualizado', pp });
  } catch (err: any) {
    res.status(500).json({ error: 'Error al agregar precio', detalle: err.message });
  }
};

// ─── PATCH /api/proveedores/productos/:pp_id ──────────────────────────────────
export const editarPrecio = async (req: Request, res: Response) => {
  try {
    const pp = await ProveedorProducto.findByPk(req.params.pp_id);
    if (!pp) return res.status(404).json({ error: 'Relación proveedor-producto no encontrada' });

    const { precio, fecha_precio, codigo_proveedor, descripcion_proveedor } = req.body;
    const userId = (req as any).user?.id ?? null;

    // Actualizar campos opcionales de la relación
    const updates: any = {};
    if (codigo_proveedor !== undefined) updates.codigo_proveedor = codigo_proveedor;
    if (descripcion_proveedor !== undefined) updates.descripcion_proveedor = descripcion_proveedor;
    if (Object.keys(updates).length) await pp.update(updates);

    // Actualizar precio si se envió uno nuevo
    let resultado = null;
    if (precio !== undefined) {
      const fechaVigencia = fecha_precio ?? new Date().toISOString().split('T')[0];
      resultado = await actualizarPrecio(pp, parseFloat(precio), fechaVigencia, 'MANUAL', userId);
    }

    res.json({ message: 'Actualizado', anomalo: resultado?.anomalo ?? false, variacion_pct: resultado?.variacionPct ?? null });
  } catch (err: any) {
    res.status(500).json({ error: 'Error al editar precio', detalle: err.message });
  }
};

// ─── DELETE /api/proveedores/productos/:pp_id ─────────────────────────────────
export const desactivarMapeo = async (req: Request, res: Response) => {
  try {
    const pp = await ProveedorProducto.findByPk(req.params.pp_id);
    if (!pp) return res.status(404).json({ error: 'Mapeo no encontrado' });
    await pp.update({ activo: false });
    res.json({ message: 'Mapeo desactivado' });
  } catch (err: any) {
    res.status(500).json({ error: 'Error al desactivar mapeo', detalle: err.message });
  }
};

// ─── GET /api/proveedores/pendientes ─────────────────────────────────────────
export const listarPendientes = async (req: Request, res: Response) => {
  try {
    const pendientes = await ProveedorCodigoPendiente.findAll({
      where: { estado: 'PENDIENTE' },
      include: [{ model: Proveedor, as: 'proveedor', attributes: ['id', 'nombre_comercial', 'nit'] }],
      order: [['veces_visto', 'DESC']],
    });
    res.json(pendientes);
  } catch (err: any) {
    res.status(500).json({ error: 'Error al listar pendientes', detalle: err.message });
  }
};

// ─── POST /api/proveedores/pendientes/:id/vincular ────────────────────────────
export const vincularPendiente = async (req: Request, res: Response) => {
  try {
    const pendiente = await ProveedorCodigoPendiente.findByPk(req.params.id, {
      include: [{ model: Proveedor, as: 'proveedor' }],
    });
    if (!pendiente) return res.status(404).json({ error: 'Pendiente no encontrado' });

    const { catalogo_producto_id, unidad_compra = 'UNIDAD' } = req.body;
    const userId = (req as any).user?.id ?? null;

    if (!catalogo_producto_id) return res.status(400).json({ error: 'catalogo_producto_id es obligatorio' });

    const producto = await CatalogoProducto.findByPk(catalogo_producto_id);
    if (!producto) return res.status(404).json({ error: 'Producto no encontrado' });

    const proveedor_id = pendiente.getDataValue('proveedor_id');
    const precio = pendiente.getDataValue('precio_detectado');
    const descripcion = pendiente.getDataValue('descripcion_proveedor');
    const fechaVigencia = new Date().toISOString().split('T')[0];

    // Crear o actualizar la relación proveedor_producto
    const [pp, creado] = await ProveedorProducto.findOrCreate({
      where: { proveedor_id, catalogo_producto_id, unidad_compra },
      defaults: {
        proveedor_id,
        catalogo_producto_id,
        codigo_proveedor: pendiente.getDataValue('codigo_proveedor'),
        descripcion_proveedor: descripcion,
        unidad_compra,
        precio_actual: precio,
        fecha_precio_actual: fechaVigencia,
      },
    });

    if (!creado && precio) {
      await actualizarPrecio(pp, parseFloat(precio), fechaVigencia, 'FACTURA', userId, pendiente.getDataValue('documento_ref'));
    } else if (creado && precio) {
      await ProveedorProductoPrecio.create({
        proveedor_producto_id: pp.getDataValue('id'),
        precio: parseFloat(precio),
        fecha_vigencia: fechaVigencia,
        origen: 'FACTURA',
        registrado_por: userId,
        documento_ref: pendiente.getDataValue('documento_ref'),
      });
    }

    // Guardar descripción como alias
    if (descripcion?.trim()) {
      await ProductoAlias.findOrCreate({
        where: { catalogo_producto_id, alias: descripcion.trim() },
        defaults: { catalogo_producto_id, alias: descripcion.trim(), origen: 'PROVEEDOR', proveedor_id },
      });
    }

    // Marcar el pendiente como mapeado
    await pendiente.update({ estado: 'MAPEADO' });

    res.json({ message: 'Código vinculado exitosamente', proveedor_producto: pp });
  } catch (err: any) {
    res.status(500).json({ error: 'Error al vincular código', detalle: err.message });
  }
};

// ─── POST /api/proveedores/pendientes/:id/descartar ───────────────────────────
export const descartarPendiente = async (req: Request, res: Response) => {
  try {
    const pendiente = await ProveedorCodigoPendiente.findByPk(req.params.id);
    if (!pendiente) return res.status(404).json({ error: 'Pendiente no encontrado' });
    await pendiente.update({ estado: 'DESCARTADO' });
    res.json({ message: 'Código descartado' });
  } catch (err: any) {
    res.status(500).json({ error: 'Error al descartar código', detalle: err.message });
  }
};

// ─── GET /api/proveedores/equivalencias ──────────────────────────────────────
export const listarEquivalencias = async (req: Request, res: Response) => {
  try {
    const { proveedor_id, q } = req.query;
    const where: any = { activo: true };
    if (proveedor_id) where.proveedor_id = proveedor_id;

    const equivalencias = await ProveedorProducto.findAll({
      where,
      include: [
        { model: Proveedor, as: 'proveedor', attributes: ['id', 'nombre_comercial', 'nit'] },
        { model: CatalogoProducto, as: 'producto', attributes: ['id', 'codigo', 'nombre', 'es_aluminio'] },
      ],
      order: [[{ model: Proveedor, as: 'proveedor' }, 'nombre_comercial', 'ASC']],
    });

    // Mapear para compatibilidad con catalogo_producto y producto
    const response = equivalencias.map((eq: any) => {
      const plain = eq.toJSON();
      plain.catalogo_producto = plain.producto;
      return plain;
    });

    res.json(response);
  } catch (err: any) {
    res.status(500).json({ error: 'Error al listar equivalencias', detalle: err.message });
  }
};

// ─── DELETE /api/proveedores/equivalencias/:id ───────────────────────────────
export const desvincularEquivalencia = async (req: Request, res: Response) => {
  try {
    const pp = await ProveedorProducto.findByPk(req.params.id);
    if (!pp) return res.status(404).json({ error: 'Equivalencia no encontrada' });
    await pp.destroy();
    res.json({ message: 'Equivalencia desvinculada exitosamente' });
  } catch (err: any) {
    res.status(500).json({ error: 'Error al desvincular equivalencia', detalle: err.message });
  }
};

// ─── POST /api/proveedores/facturas/cargar ──────────────────────────────────
export const cargarFacturasLote = async (req: Request, res: Response) => {
  try {
    const files = (req.files as Express.Multer.File[]) || [];
    if (files.length === 0) {
      return res.status(400).json({ error: 'No se enviaron archivos para procesar' });
    }

    const userId = (req as any).user?.id ?? null;
    const cufesVistosLote = new Set<string>();

    let facturasProcesadas = 0;
    let facturasDuplicadasCufe = 0;
    let preciosSinCambio = 0;
    const preciosActualizados: Array<{
      codigo_proveedor: string;
      descripcion: string;
      proveedor_nombre: string;
      precio_anterior: number;
      precio_nuevo: number;
      variacion_pct: number;
      anomalo: boolean;
    }> = [];
    let codigosNuevosPendientes = 0;
    const errores: string[] = [];

    for (const file of files) {
      try {
        const facturas = procesarBufferFactura(file.buffer, file.originalname);
        if (facturas.length === 0) {
          errores.push(`${file.originalname}: No se encontró un XML de factura válido`);
          continue;
        }

        for (const fac of facturas) {
          // Validar CUFE para idempotencia
          if (fac.cufe) {
            if (cufesVistosLote.has(fac.cufe)) {
              facturasDuplicadasCufe++;
              continue;
            }
            cufesVistosLote.add(fac.cufe);

            // Verificar si el CUFE ya fue registrado antes en histórico
            const yaRegistrado = await ProveedorProductoPrecio.findOne({
              where: {
                documento_ref: { [Op.like]: `%${fac.cufe}%` },
              },
            });
            if (yaRegistrado) {
              facturasDuplicadasCufe++;
              continue;
            }
          }

          // Identificar o crear proveedor por NIT o nombre
          let proveedor: any = null;
          if (fac.emisor_nit) {
            proveedor = await Proveedor.findOne({
              where: {
                [Op.or]: [
                  { nit: { [Op.like]: `%${fac.emisor_nit}%` } },
                  { numero_identificacion: { [Op.like]: `%${fac.emisor_nit}%` } },
                ],
              },
            });
          }

          if (!proveedor && fac.emisor_nombre) {
            proveedor = await Proveedor.findOne({
              where: {
                [Op.or]: [
                  { nombre_comercial: { [Op.iLike]: `%${fac.emisor_nombre}%` } },
                  { razon_social: { [Op.iLike]: `%${fac.emisor_nombre}%` } },
                ],
              },
            });
          }

          // Si el proveedor no existe, registrarlo como borrador activo
          if (!proveedor) {
            proveedor = await Proveedor.create({
              nit: fac.emisor_nit,
              nombre_comercial: fac.emisor_nombre || `Proveedor ${fac.emisor_nit || 'S/N'}`,
              razon_social: fac.emisor_nombre || null,
              activo: true,
            });
          }

          const proveedorId = proveedor.id;
          const docRef = `FE-${fac.numero}${fac.cufe ? ` · CUFE:${fac.cufe.slice(0, 12)}...` : ''}`;

          // Regla compras.md §8: Si hay varias líneas del mismo producto en la misma FE, manda el precio MAYOR
          const lineasPorCodigo = new Map<string, { desc: string; maxPrecio: number; unidad: string }>();
          for (const linea of fac.lineas) {
            const cod = linea.codigo_proveedor?.trim() || 'SIN_CODIGO';
            const precio = linea.precio_unitario;
            const existente = lineasPorCodigo.get(cod);
            if (!existente || precio > existente.maxPrecio) {
              lineasPorCodigo.set(cod, {
                desc: linea.descripcion,
                maxPrecio: precio,
                unidad: linea.unidad || 'UNIDAD',
              });
            }
          }

          for (const [codigoProv, info] of lineasPorCodigo.entries()) {
            // 1. Buscar si ya existe equivalencia en proveedor_producto
            const ppList = await ProveedorProducto.findAll({
              where: {
                proveedor_id: proveedorId,
                codigo_proveedor: codigoProv,
                activo: true,
              },
            });

            if (ppList.length > 0) {
              // Ya mapeado -> actualizar precio
              for (const pp of ppList) {
                const precioAnt = parseFloat(pp.getDataValue('precio_actual')) || 0;
                const resAct = await actualizarPrecio(
                  pp,
                  info.maxPrecio,
                  fac.fecha_emision,
                  'FACTURA',
                  userId,
                  docRef
                );

                if (resAct.cambio) {
                  preciosActualizados.push({
                    codigo_proveedor: codigoProv,
                    descripcion: info.desc,
                    proveedor_nombre: proveedor.nombre_comercial,
                    precio_anterior: precioAnt,
                    precio_nuevo: info.maxPrecio,
                    variacion_pct: resAct.variacionPct ?? 0,
                    anomalo: resAct.anomalo,
                  });
                } else {
                  preciosSinCambio++;
                }
              }
            } else {
              // 2. No mapeado -> registrar en bandeja de códigos pendientes
              const pendienteExistente = await ProveedorCodigoPendiente.findOne({
                where: {
                  proveedor_id: proveedorId,
                  codigo_proveedor: codigoProv,
                },
              });

              if (pendienteExistente) {
                if (pendienteExistente.getDataValue('estado') === 'PENDIENTE') {
                  const veces = (pendienteExistente.getDataValue('veces_visto') || 1) + 1;
                  await pendienteExistente.update({
                    veces_visto: veces,
                    precio_detectado: info.maxPrecio,
                    documento_ref: docRef,
                  });
                }
              } else {
                await ProveedorCodigoPendiente.create({
                  proveedor_id: proveedorId,
                  codigo_proveedor: codigoProv,
                  descripcion_proveedor: info.desc,
                  precio_detectado: info.maxPrecio,
                  documento_ref: docRef,
                  veces_visto: 1,
                  estado: 'PENDIENTE',
                });
                codigosNuevosPendientes++;
              }
            }
          }

          facturasProcesadas++;
        }
      } catch (fileErr: any) {
        errores.push(`${file.originalname}: ${fileErr.message}`);
      }
    }

    res.json({
      total_archivos: files.length,
      facturas_procesadas: facturasProcesadas,
      facturas_duplicadas_cufe: facturasDuplicadasCufe,
      precios_sin_cambio: preciosSinCambio,
      precios_actualizados: preciosActualizados,
      codigos_nuevos_pendientes: codigosNuevosPendientes,
      errores,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Error general al cargar facturas', detalle: err.message });
  }
};


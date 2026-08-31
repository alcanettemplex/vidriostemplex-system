import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

/**
 * ProveedorProductoPrecio — histórico completo de cambios de precio.
 *
 * REGLA CRÍTICA: solo se inserta cuando el precio CAMBIA respecto al vigente.
 * Con ~20 FE diarias y productos recurrentes, registrar cada aparición llenaria
 * los 2 espacios de "precio anterior" con el mismo valor repetido, destruyendo
 * la información de negocio que se quería conservar.
 *
 * El campo variacion_pct permite detectar cambios anómalos (> umbral_variacion_precio_pct).
 */
class ProveedorProductoPrecio extends Model {}

ProveedorProductoPrecio.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },

  proveedor_producto_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'proveedor_producto', key: 'id' },
  },

  precio: { type: DataTypes.DECIMAL(15, 2), allowNull: false },

  // Fecha de la factura — NO la fecha de carga. Define qué precio es "el vigente"
  // cuando se procesan facturas fuera de orden cronológico (backfill).
  fecha_vigencia: { type: DataTypes.DATEONLY, allowNull: false },

  // Trazabilidad del origen del precio
  origen: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'MANUAL',
    // Valores: MANUAL | LISTA | FACTURA
  },
  documento_ref: { type: DataTypes.STRING(100), allowNull: true }, // Número de factura legible
  // CUFE completo del documento que originó el precio. La idempotencia vive en
  // factura_proveedor_procesada; esto es trazabilidad directa desde el precio.
  cufe: { type: DataTypes.STRING(120), allowNull: true },
  registrado_por: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'usuarios', key: 'id' },
  },

  // IVA que traía la línea del XML — en Colombia hay excluidos, exentos y tarifas
  // especiales, así que el porcentaje es un dato del documento, no una constante.
  porcentaje_iva: { type: DataTypes.DECIMAL(5, 2), allowNull: true },

  // Cuántas líneas del mismo producto traía la factura. Con más de una manda el
  // precio mayor (compras.md §8) y conviene poder auditar de dónde salió el número.
  lineas_en_factura: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },

  // true cuando la factura es anterior al precio vigente: se archiva en el histórico
  // sin desplazar el precio actual, para que un backfill no retroceda los precios.
  retroactivo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

  // Alerta de variación anómala respecto al precio anterior
  precio_anomalo: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
  variacion_pct: { type: DataTypes.DECIMAL(8, 2), allowNull: true },

  fecha_registro: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, {
  sequelize,
  modelName: 'ProveedorProductoPrecio',
  tableName: 'proveedor_producto_precio',
  timestamps: false,
});

export default ProveedorProductoPrecio;

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
  documento_ref: { type: DataTypes.STRING(100), allowNull: true }, // CUFE o referencia
  registrado_por: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'usuarios', key: 'id' },
  },

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

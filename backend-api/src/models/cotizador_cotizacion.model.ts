import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

// Cliente aplanado en columnas (no JSONB): el listado filtra por substring
// sobre cliente_nombre y cliente_obra, y son 5 campos fijos e indexables.
// numero es UNIQUE — la constraint que el JSON de origen nunca tuvo — y se
// asigna con cotizador_consecutivo dentro de una transacción (ver
// cotizador_cotizacion.controller.ts), nunca con max(numero)+1.
// asesor queda como texto libre (decisión 8): sin FK a usuarios.
class CotizadorCotizacion extends Model {}

CotizadorCotizacion.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  numero: { type: DataTypes.INTEGER, allowNull: false, unique: true },
  version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  estado: {
    type: DataTypes.ENUM('PENDIENTE', 'APROBADA', 'CANCELADO', 'PERDIDO'),
    allowNull: false,
    defaultValue: 'PENDIENTE',
  },
  creada_en: { type: DataTypes.DATE, allowNull: false },
  actualizada_en: { type: DataTypes.DATE, allowNull: false },
  cliente_nombre: { type: DataTypes.STRING(150), allowNull: false },
  cliente_direccion: { type: DataTypes.STRING(200) },
  cliente_telefono: { type: DataTypes.STRING(50) },
  cliente_obra: { type: DataTypes.STRING(150) },
  cliente_contacto: { type: DataTypes.STRING(120) },
  segmento_cliente: { type: DataTypes.ENUM('PA', 'PM', 'PB'), allowNull: false, defaultValue: 'PA' },
  asesor: { type: DataTypes.STRING(80) },
  descuento_pct: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
  total_subtotal: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
  total_iva: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
  total_total: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
}, {
  sequelize,
  modelName: 'CotizadorCotizacion',
  tableName: 'cotizador_cotizacion',
  timestamps: false,
  indexes: [
    { fields: ['estado'] },
    { fields: ['asesor'] },
    { fields: ['actualizada_en'] },
  ],
});

export default CotizadorCotizacion;

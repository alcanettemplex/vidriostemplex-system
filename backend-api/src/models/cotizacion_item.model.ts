import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class CotizacionItem extends Model {}

CotizacionItem.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  cotizacion_id: { type: DataTypes.INTEGER, allowNull: false },
  seccion: {
    type: DataTypes.ENUM('vidrio', 'acabado', 'gasto_instalacion'),
    allowNull: false,
    defaultValue: 'acabado',
  },
  descripcion: { type: DataTypes.TEXT, allowNull: false },
  codigo: { type: DataTypes.STRING(50), allowNull: true },
  cantidad: { type: DataTypes.DECIMAL(10, 3), allowNull: false, defaultValue: 1 },
  unidad: {
    type: DataTypes.ENUM('M2', 'ML', 'UND', 'GL', 'HR', 'X M2', 'X METRO'),
    allowNull: false,
    defaultValue: 'UND',
  },
  precio_unitario: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  // Columna generada en la BD (GENERATED ALWAYS AS cantidad * precio_unitario STORED)
  // Solo lectura: NO incluir en create() ni bulkCreate()
  precio_venta: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
  producto_ref: { type: DataTypes.STRING(150), allowNull: true },
  orden: { type: DataTypes.SMALLINT, defaultValue: 0 },
}, {
  sequelize,
  modelName: 'CotizacionItem',
  tableName: 'cotizacion_items',
  timestamps: false,
});

export default CotizacionItem;

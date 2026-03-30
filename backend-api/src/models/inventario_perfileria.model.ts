import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class InventarioPerfileria extends Model {}

InventarioPerfileria.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  consecutivo: { type: DataTypes.INTEGER, allowNull: false, unique: true },
  codigo: { type: DataTypes.STRING(100), allowNull: true },
  mm: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
  ubicacion: { type: DataTypes.STRING(255), allowNull: true },
  fecha_corte: { type: DataTypes.DATEONLY, allowNull: true },
  creado_en: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, {
  sequelize,
  modelName: 'InventarioPerfileria',
  tableName: 'inventario_perfileria',
  timestamps: false,
});

export default InventarioPerfileria;

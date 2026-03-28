import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class CatalogoProducto extends Model {}

CatalogoProducto.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  codigo: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  nombre: { type: DataTypes.STRING(255), allowNull: false },
  categoria: { type: DataTypes.STRING(100), allowNull: true },
  descripcion: { type: DataTypes.TEXT },
  activo: { type: DataTypes.BOOLEAN, defaultValue: true },
  es_aluminio: { type: DataTypes.BOOLEAN, defaultValue: false },
}, {
  sequelize,
  modelName: 'CatalogoProducto',
  tableName: 'catalogo_productos',
  timestamps: false,
});

export default CatalogoProducto;

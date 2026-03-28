import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class CatalogoProducto extends Model {}

CatalogoProducto.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  categoria: { type: DataTypes.STRING(100), allowNull: false },
  nombre: { type: DataTypes.STRING(255), allowNull: false },
  descripcion: { type: DataTypes.TEXT },
  activo: { type: DataTypes.BOOLEAN, defaultValue: true },
}, {
  sequelize,
  modelName: 'CatalogoProducto',
  tableName: 'catalogo_productos',
  timestamps: false,
});

export default CatalogoProducto;

import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class Produccion extends Model {}

Produccion.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  odp_id: { type: DataTypes.INTEGER, allowNull: false },
  avance: { type: DataTypes.STRING(100) },
  inventario: { type: DataTypes.STRING(255) },
  sap: { type: DataTypes.STRING(100) },
}, {
  sequelize,
  modelName: 'Produccion',
  tableName: 'produccion',
  timestamps: false,
});

export default Produccion;

import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class SAPItem extends Model {}

SAPItem.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  sap_id: { type: DataTypes.INTEGER, allowNull: false },
  descripcion: { type: DataTypes.STRING(200), allowNull: false },
  referencia: { type: DataTypes.STRING(100) },
  color: { type: DataTypes.STRING(80) },
  cantidad: { type: DataTypes.DECIMAL(10, 2), defaultValue: 1 },
  unidad: { type: DataTypes.STRING(20), defaultValue: 'und' },
  observacion: { type: DataTypes.TEXT },
}, {
  sequelize, modelName: 'SAPItem', tableName: 'sap_items', timestamps: false,
});

export default SAPItem;

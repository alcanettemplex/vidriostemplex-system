import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class ODCItem extends Model {}

ODCItem.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  odc_id: { type: DataTypes.INTEGER, allowNull: false },
  sap_item_id: { type: DataTypes.INTEGER, allowNull: true },
  odp_item_id: { type: DataTypes.INTEGER, allowNull: true },
  odp_id: { type: DataTypes.INTEGER, allowNull: true },
  item: { type: DataTypes.STRING(10) },
  codigo: { type: DataTypes.STRING(50) },
  descripcion: { type: DataTypes.STRING(255) },
  cantidad: { type: DataTypes.DECIMAL(10, 2), defaultValue: 1 },
  recibido: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
}, {
  sequelize, modelName: 'ODCItem', tableName: 'odc_items', timestamps: false,
});

export default ODCItem;

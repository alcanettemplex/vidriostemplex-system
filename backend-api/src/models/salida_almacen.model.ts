import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class SalidaAlmacen extends Model {}

SalidaAlmacen.init({
  id:         { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  odp_id:     { type: DataTypes.INTEGER, allowNull: false, unique: true },
  numero_sa:  { type: DataTypes.STRING(30), allowNull: false },
  fecha_sa:   { type: DataTypes.DATEONLY, allowNull: false },
  creado_por: { type: DataTypes.INTEGER, allowNull: true },
  creado_en:  { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, {
  sequelize,
  modelName: 'SalidaAlmacen',
  tableName: 'salidas_almacen',
  timestamps: false,
});

export default SalidaAlmacen;

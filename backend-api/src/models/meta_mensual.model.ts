import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class MetaMensual extends Model {}

MetaMensual.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  anio: { type: DataTypes.INTEGER, allowNull: false },
  mes: { type: DataTypes.INTEGER, allowNull: false }, // 1 a 12
  meta_facturacion: { type: DataTypes.DECIMAL(15, 2), defaultValue: 120000000.00 },
  meta_odps_asesor: { type: DataTypes.INTEGER, defaultValue: 12 },
}, {
  sequelize,
  modelName: 'MetaMensual',
  tableName: 'metas_mensuales',
  timestamps: false,
  indexes: [
    { unique: true, fields: ['anio', 'mes'] }
  ]
});

export default MetaMensual;

import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class Pago extends Model {}

Pago.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    odp_id: { type: DataTypes.INTEGER, allowNull: false },
    monto: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    metodo_pago: { type: DataTypes.STRING(50), allowNull: false },
    referencia_pago: { type: DataTypes.STRING(100) },
    observaciones: { type: DataTypes.TEXT },
    registrado_por: { type: DataTypes.INTEGER, allowNull: false },
    fecha: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    modelName: 'Pago',
    tableName: 'pagos',
    timestamps: false,
  },
);

export default Pago;

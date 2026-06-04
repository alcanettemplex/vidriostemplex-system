import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class HistorialEstadoODP extends Model {}

HistorialEstadoODP.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  odp_id: { type: DataTypes.INTEGER, allowNull: false },
  estado_anterior: { type: DataTypes.STRING(30) },
  estado_nuevo: { type: DataTypes.STRING(30) },
  usuario_id: { type: DataTypes.INTEGER, allowNull: false },
  fecha: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  observacion: { type: DataTypes.TEXT, allowNull: true },
}, {
  sequelize,
  modelName: 'HistorialEstadoODP',
  tableName: 'historial_estados_odp',
  timestamps: false,
});

export default HistorialEstadoODP;

import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class ProgramacionInstalacion extends Model {}

ProgramacionInstalacion.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  odp_id: { type: DataTypes.INTEGER, allowNull: false },
  instalador_id: { type: DataTypes.INTEGER, allowNull: false },
  vehiculo_id: { type: DataTypes.INTEGER, allowNull: false },
  fecha_instalacion: { type: DataTypes.DATE, allowNull: false },
}, {
  sequelize,
  modelName: 'ProgramacionInstalacion',
  tableName: 'programacion_instalaciones',
  timestamps: false,
});

export default ProgramacionInstalacion;

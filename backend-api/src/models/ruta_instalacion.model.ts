import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class RutaInstalacion extends Model {}

RutaInstalacion.init({
  id:           { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  vehiculo_id:  { type: DataTypes.INTEGER, allowNull: true },
  conductor_id: { type: DataTypes.INTEGER, allowNull: true },
  creado_por:   { type: DataTypes.INTEGER, allowNull: false },
  estado: {
    type: DataTypes.ENUM('programada', 'en_curso', 'completada', 'cancelada'),
    defaultValue: 'programada',
  },
  oficial_id:    { type: DataTypes.INTEGER, allowNull: true },
  observaciones: { type: DataTypes.TEXT, allowNull: true },
  inicio_ruta:   { type: DataTypes.DATE, allowNull: true },
  fin_ruta:      { type: DataTypes.DATE, allowNull: true },
  creado_en:     { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, {
  sequelize,
  modelName: 'RutaInstalacion',
  tableName: 'rutas_instalacion',
  timestamps: false,
});

export default RutaInstalacion;

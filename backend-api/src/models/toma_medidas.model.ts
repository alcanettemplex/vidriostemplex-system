import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class TomaMedidas extends Model {}

TomaMedidas.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  numero_tm: { type: DataTypes.STRING(30), allowNull: false, unique: true },
  odp_id: { type: DataTypes.INTEGER, allowNull: false },
  realizado_por: { type: DataTypes.INTEGER },
  fecha_visita: { type: DataTypes.DATEONLY },
  direccion: { type: DataTypes.STRING(255) },
  contacto_obra: { type: DataTypes.STRING(100) },
  telefono_obra: { type: DataTypes.STRING(30) },
  observaciones: { type: DataTypes.TEXT },
  medidas_json: { type: DataTypes.JSONB, defaultValue: [] },
  croquis_url: { type: DataTypes.STRING(500) },
  fecha_creacion: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, {
  sequelize, modelName: 'TomaMedidas', tableName: 'toma_medidas', timestamps: false,
});

export default TomaMedidas;

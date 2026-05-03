import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class RutaODP extends Model {}

RutaODP.init({
  id:                  { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  ruta_id:             { type: DataTypes.INTEGER, allowNull: false },
  odp_id:              { type: DataTypes.INTEGER, allowNull: false },
  orden:               { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  fecha_programada:    { type: DataTypes.DATEONLY, allowNull: false },
  llegada_conductor:   { type: DataTypes.DATE, allowNull: true },
  inicio_instalacion:  { type: DataTypes.DATE, allowNull: true },
  fin_instalacion:     { type: DataTypes.DATE, allowNull: true },
  estado: {
    type: DataTypes.ENUM('pendiente', 'en_curso', 'pausada', 'completada', 'con_dano'),
    defaultValue: 'pendiente',
  },
  datos_receptor:     { type: DataTypes.STRING(300), allowNull: true },
  firma_receptor:     { type: DataTypes.TEXT, allowNull: true },
  foto_evidencia_url: { type: DataTypes.STRING(500), allowNull: true },
  gps_finalizacion:   { type: DataTypes.STRING(100), allowNull: true },
  descripcion_dano:   { type: DataTypes.TEXT, allowNull: true },
  foto_dano_url:      { type: DataTypes.STRING(500), allowNull: true },
  motivo_pausa:       { type: DataTypes.TEXT, allowNull: true },
}, {
  sequelize,
  modelName: 'RutaODP',
  tableName: 'ruta_odp',
  timestamps: false,
});

export default RutaODP;

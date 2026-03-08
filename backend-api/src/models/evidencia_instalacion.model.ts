import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class EvidenciaInstalacion extends Model {}

EvidenciaInstalacion.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  odp_id: { type: DataTypes.INTEGER, allowNull: false },
  instalador_id: { type: DataTypes.INTEGER, allowNull: false },
  tipo_evidencia: { type: DataTypes.ENUM('foto','video','firma'), allowNull: false },
  archivo_url: { type: DataTypes.STRING(255), allowNull: false },
  fecha: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  gps: { type: DataTypes.STRING(100) },
  hash: { type: DataTypes.STRING(255) },
  datos_firmante: { type: DataTypes.STRING(255) },
}, {
  sequelize,
  modelName: 'EvidenciaInstalacion',
  tableName: 'evidencias_instalacion',
  timestamps: false,
});

export default EvidenciaInstalacion;

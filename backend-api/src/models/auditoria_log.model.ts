import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class AuditoriaLog extends Model {}

AuditoriaLog.init(
  {
    id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    tabla: { type: DataTypes.STRING(100), allowNull: false },
    operacion: { type: DataTypes.STRING(10), allowNull: false }, // INSERT | UPDATE | DELETE
    registro_id: { type: DataTypes.STRING(100), allowNull: true },
    datos_anteriores: { type: DataTypes.JSONB, allowNull: true },
    datos_nuevos: { type: DataTypes.JSONB, allowNull: true },
    usuario_id: { type: DataTypes.INTEGER, allowNull: true },
    usuario_nombre: { type: DataTypes.STRING(200), allowNull: true },
    ip_address: { type: DataTypes.STRING(50), allowNull: true },
    fecha: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    modelName: 'AuditoriaLog',
    tableName: 'auditoria_log',
    timestamps: false,
  }
);

export default AuditoriaLog;

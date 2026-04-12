import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';
// rol: incluye 'marketing' (solo lectura CRM)

class Usuario extends Model { }

Usuario.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  username: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  password_hash: { type: DataTypes.STRING(255), allowNull: false },
  rol: { type: DataTypes.ENUM('root', 'admin', 'gerencia', 'gerente', 'jefe_produccion', 'asesor_comercial', 'produccion', 'instalador', 'conductor', 'contabilidad', 'compras', 'asistente_administrativo', 'marketing'), allowNull: false },
  nombre_completo: { type: DataTypes.STRING(100), allowNull: false },
  email: { type: DataTypes.STRING(100), unique: true },
  puede_gestionar_pv: { type: DataTypes.BOOLEAN, defaultValue: false },
  creado_en: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, {
  sequelize,
  modelName: 'Usuario',
  tableName: 'usuarios',
  timestamps: false,
});

export default Usuario;

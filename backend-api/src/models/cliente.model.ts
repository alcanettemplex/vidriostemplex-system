import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class Cliente extends Model { }

Cliente.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  nombre_razon_social: { type: DataTypes.STRING(100), allowNull: false },
  tipo_documento: { type: DataTypes.STRING(20), defaultValue: 'DNI' },
  numero_documento: { type: DataTypes.STRING(30), allowNull: false, unique: true },
  direccion: { type: DataTypes.STRING(200) },
  telefono: { type: DataTypes.STRING(20) },
  celular: { type: DataTypes.STRING(20) },
  email: { type: DataTypes.STRING(100) },
  segmento: { type: DataTypes.STRING(50) },
  condicion_pago: { type: DataTypes.ENUM('CONTADO', 'CREDITO_30', 'CREDITO_60', 'CUPO_APROBADO'), defaultValue: 'CONTADO' },
  creado_por: { type: DataTypes.INTEGER, allowNull: true },
  creado_en: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, {
  sequelize,
  modelName: 'Cliente',
  tableName: 'clientes',
  timestamps: false,
});

export default Cliente;

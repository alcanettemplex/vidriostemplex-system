import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class Proveedor extends Model {}

Proveedor.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },

  // Identificación fiscal — NIT es la llave de match automático contra XML DIAN
  nit: { type: DataTypes.STRING(20), allowNull: true, unique: true },
  tipo_identificacion: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'NIT' },
  numero_identificacion: { type: DataTypes.STRING(30), allowNull: true },

  // Datos comerciales
  nombre_comercial: { type: DataTypes.STRING(255), allowNull: false },
  razon_social: { type: DataTypes.STRING(255), allowNull: true },

  // Contacto
  contacto_nombre: { type: DataTypes.STRING(150), allowNull: true },
  telefono: { type: DataTypes.STRING(30), allowNull: true },
  email: { type: DataTypes.STRING(150), allowNull: true },
  direccion: { type: DataTypes.TEXT, allowNull: true },

  // Metadatos
  notas: { type: DataTypes.TEXT, allowNull: true },
  activo: { type: DataTypes.BOOLEAN, defaultValue: true, allowNull: false },

  // Referencia cruzada con World Office (código interno del software contable)
  codigo_world_office: { type: DataTypes.STRING(50), allowNull: true },

  fecha_creacion: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, {
  sequelize,
  modelName: 'Proveedor',
  tableName: 'proveedores',
  timestamps: false,
});

export default Proveedor;

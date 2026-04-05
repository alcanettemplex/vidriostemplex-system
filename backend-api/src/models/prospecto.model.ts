import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class Prospecto extends Model {}

Prospecto.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    numero_prospecto: { type: DataTypes.STRING(30), allowNull: false, unique: true },
    asesor_id: { type: DataTypes.INTEGER, allowNull: false },
    cliente_id: { type: DataTypes.INTEGER, allowNull: true },
    nombre_contacto: { type: DataTypes.STRING(150), allowNull: true },
    telefono_contacto: { type: DataTypes.STRING(30), allowNull: true },
    email_contacto: { type: DataTypes.STRING(150), allowNull: true },
    direccion: { type: DataTypes.STRING(255), allowNull: true },
    descripcion: { type: DataTypes.TEXT, allowNull: true },
    estado: {
      type: DataTypes.STRING(20),
      defaultValue: 'en_gestion',
      allowNull: false,
      // valores: en_gestion | aprobado | no_aprobado
    },
    motivo_no_aprobado: { type: DataTypes.TEXT, allowNull: true },
    numero_cotizacion: { type: DataTypes.STRING(50), allowNull: true },
    odp_id: { type: DataTypes.INTEGER, allowNull: true },
    fecha_creacion: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    fecha_gestion: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    modelName: 'Prospecto',
    tableName: 'prospectos',
    timestamps: false,
  },
);

export default Prospecto;

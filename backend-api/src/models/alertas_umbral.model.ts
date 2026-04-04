import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class AlertasUmbral extends Model {}

AlertasUmbral.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    clave: { type: DataTypes.STRING(100), allowNull: false, unique: true },
    nombre: { type: DataTypes.STRING(200), allowNull: false },
    descripcion: { type: DataTypes.TEXT, allowNull: true },
    valor: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 80 },
    unidad: { type: DataTypes.STRING(20), allowNull: false, defaultValue: '%' },
    activo: { type: DataTypes.BOOLEAN, defaultValue: true },
  },
  {
    sequelize,
    modelName: 'AlertasUmbral',
    tableName: 'alertas_umbral',
    timestamps: false,
  }
);

export default AlertasUmbral;

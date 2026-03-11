import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class SAP extends Model {}

SAP.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  numero_sap: { type: DataTypes.STRING(30), allowNull: false, unique: true },
  odp_id: { type: DataTypes.INTEGER, allowNull: false },
  creado_por: { type: DataTypes.INTEGER },
  notas: { type: DataTypes.TEXT },
  estado: { type: DataTypes.ENUM('borrador', 'enviada', 'aprobada'), defaultValue: 'borrador' },
  fecha_creacion: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, {
  sequelize, modelName: 'SAP', tableName: 'sap', timestamps: false,
});

export default SAP;

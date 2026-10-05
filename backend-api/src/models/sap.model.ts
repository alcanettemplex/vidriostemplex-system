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
  impresa_auto: { type: DataTypes.BOOLEAN, defaultValue: false },
  // Pase a corte de aluminio (2026-10-05): el taller anota que la perfilería de esta
  // SAP ya se pasó al corte. Es una nota con fecha, NO el check `chk_corte` de la
  // ODP ("aluminio cortado"): no mueve estados. NULL = no se ha pasado a corte.
  // Script: scripts/2026-10-05_sap_pase_corte.ts.
  fecha_pase_corte: { type: DataTypes.DATE, allowNull: true },
  pase_corte_por_id: { type: DataTypes.INTEGER, allowNull: true },
}, {
  sequelize, modelName: 'SAP', tableName: 'sap', timestamps: false,
});

export default SAP;

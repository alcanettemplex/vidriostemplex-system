import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

// Capa de planeación tentativa: coloca ODPs "listas para instalar" en días de un
// calendario, antes de armar la ruta real. NO toca odp.estado_produccion.
// Una ODP = un solo día a la vez (odp_id UNIQUE). No se audita (planeación volátil).
class AgendaInstalacion extends Model {}

AgendaInstalacion.init({
  id:              { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  odp_id:          { type: DataTypes.INTEGER, allowNull: false, unique: true },
  fecha_tentativa: { type: DataTypes.DATEONLY, allowNull: false },
  orden:           { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  nota:            { type: DataTypes.STRING(300), allowNull: true },
  creado_por:      { type: DataTypes.INTEGER, allowNull: false },
  creado_en:       { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, {
  sequelize,
  modelName: 'AgendaInstalacion',
  tableName: 'agenda_instalacion',
  timestamps: false,
  indexes: [
    { fields: ['fecha_tentativa'] },
  ],
});

export default AgendaInstalacion;

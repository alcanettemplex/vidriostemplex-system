import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class NotaProduccion extends Model { }

NotaProduccion.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  odp_id: { type: DataTypes.INTEGER, allowNull: false },
  usuario_id: { type: DataTypes.INTEGER, allowNull: false },
  texto: { type: DataTypes.TEXT, allowNull: false },
  fecha: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, {
  sequelize,
  modelName: 'NotaProduccion',
  tableName: 'notas_produccion',
  timestamps: false,
});

export default NotaProduccion;

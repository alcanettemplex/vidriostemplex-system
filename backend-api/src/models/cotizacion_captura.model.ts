import { Model, DataTypes } from 'sequelize';
import sequelize from '../config/database';

class CotizacionCaptura extends Model {}

CotizacionCaptura.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  odp_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'odp', key: 'id' },
    onDelete: 'CASCADE',
  },
  prospecto_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'prospectos', key: 'id' },
    onDelete: 'CASCADE',
  },
  url: { type: DataTypes.TEXT, allowNull: false },
  public_id: { type: DataTypes.TEXT, allowNull: false },
  nota: { type: DataTypes.TEXT, allowNull: true },
  subido_por: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'usuarios', key: 'id' },
  },
}, {
  sequelize,
  tableName: 'cotizacion_capturas',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
});

export default CotizacionCaptura;

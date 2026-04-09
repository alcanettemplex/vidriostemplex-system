import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class MetaUsuarioMensual extends Model {}

MetaUsuarioMensual.init({
  id:               { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  usuario_id:       { type: DataTypes.INTEGER, allowNull: false },
  anio:             { type: DataTypes.INTEGER, allowNull: false },
  mes:              { type: DataTypes.INTEGER, allowNull: false },
  meta_facturacion: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
}, {
  sequelize,
  modelName: 'MetaUsuarioMensual',
  tableName: 'metas_usuario_mensual',
  timestamps: false,
  indexes: [
    { unique: true, fields: ['usuario_id', 'anio', 'mes'] }
  ]
});

export default MetaUsuarioMensual;

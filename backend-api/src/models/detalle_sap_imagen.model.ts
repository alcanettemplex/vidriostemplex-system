import { Model, DataTypes } from 'sequelize';
import sequelize from '../config/database';

class DetalleSAPImagen extends Model {}

DetalleSAPImagen.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  odp_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'odp', key: 'id' },
    onDelete: 'CASCADE',
  },
  url: { type: DataTypes.STRING(500), allowNull: false },
  public_id: { type: DataTypes.STRING(300), allowNull: false },
  subido_por: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'usuarios', key: 'id' },
    onDelete: 'SET NULL',
  },
}, {
  sequelize,
  tableName: 'detalle_sap_imagenes',
  timestamps: true,
  createdAt: 'creado_en',
  updatedAt: false,
});

export default DetalleSAPImagen;

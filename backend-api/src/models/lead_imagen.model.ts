import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class LeadImagen extends Model {}

LeadImagen.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    lead_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'leads', key: 'id' },
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
  },
  {
    sequelize,
    modelName: 'LeadImagen',
    tableName: 'lead_imagenes',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
  },
);

export default LeadImagen;

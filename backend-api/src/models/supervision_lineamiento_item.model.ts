import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class SupervisionLineamientoItem extends Model {}

SupervisionLineamientoItem.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    lineamiento_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'supervision_lineamientos', key: 'id' },
      onDelete: 'CASCADE',
    },
    lead_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'leads', key: 'id' },
    },
    texto_accion: { type: DataTypes.TEXT, allowNull: false },
    prioridad: {
      type: DataTypes.ENUM('alta', 'media', 'baja'),
      allowNull: false,
    },
    origen: {
      type: DataTypes.ENUM('PRIMER_CONTACTO', 'ALTO_VALOR', 'SEGUIMIENTO', 'MANUAL'),
      allowNull: false,
    },
    cumplido: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    fecha_cumplido: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    modelName: 'SupervisionLineamientoItem',
    tableName: 'supervision_lineamiento_items',
    timestamps: true,
    updatedAt: false,
  },
);

export default SupervisionLineamientoItem;

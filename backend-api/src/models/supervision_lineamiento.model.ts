import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class SupervisionLineamiento extends Model {}

SupervisionLineamiento.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    fecha: { type: DataTypes.DATEONLY, allowNull: false },
    asesor_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'usuarios', key: 'id' },
    },
    creado_por: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'usuarios', key: 'id' },
    },
    notas_sesion: { type: DataTypes.TEXT, allowNull: true },
  },
  {
    sequelize,
    modelName: 'SupervisionLineamiento',
    tableName: 'supervision_lineamientos',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['fecha', 'asesor_id'] },
    ],
  },
);

export default SupervisionLineamiento;

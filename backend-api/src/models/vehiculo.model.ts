import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class Vehiculo extends Model {}

Vehiculo.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  tipo: { type: DataTypes.ENUM('moto','camion'), allowNull: false },
  placa: { type: DataTypes.STRING(20), allowNull: false, unique: true },
  estado: { type: DataTypes.STRING(30) },
}, {
  sequelize,
  modelName: 'Vehiculo',
  tableName: 'vehiculos',
  timestamps: false,
});

export default Vehiculo;

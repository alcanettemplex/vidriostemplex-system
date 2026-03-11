import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class Cotizacion extends Model {}

Cotizacion.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  numero_cot: { type: DataTypes.STRING(30), allowNull: false, unique: true },
  odp_id: { type: DataTypes.INTEGER, allowNull: false },
  creado_por: { type: DataTypes.INTEGER },
  valor_total: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  descuento: { type: DataTypes.DECIMAL(5, 2), defaultValue: 0 },
  forma_pago: { type: DataTypes.STRING(100) },
  validez_dias: { type: DataTypes.INTEGER, defaultValue: 30 },
  notas: { type: DataTypes.TEXT },
  estado: { type: DataTypes.ENUM('enviada', 'aprobada', 'rechazada', 'vencida'), defaultValue: 'enviada' },
  fecha_creacion: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, {
  sequelize, modelName: 'Cotizacion', tableName: 'cotizacion', timestamps: false,
});

export default Cotizacion;

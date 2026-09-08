import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

// Histórico append-only de cambios de precio, alta, baja y edición de parámetros.
class CotizadorPrecioHistorial extends Model {}

CotizadorPrecioHistorial.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  fecha: { type: DataTypes.DATE, allowNull: false },
  accion: {
    type: DataTypes.ENUM('editar-precio', 'dar-de-baja', 'reactivar', 'dar-de-alta', 'editar-parametros'),
    allowNull: false,
  },
  codigo: { type: DataTypes.STRING(20) }, // NULL en editar-parametros
  antes: { type: DataTypes.JSONB },
  despues: { type: DataTypes.JSONB },
  por: { type: DataTypes.STRING(80) },
  motivo: { type: DataTypes.STRING(300) },
}, {
  sequelize,
  modelName: 'CotizadorPrecioHistorial',
  tableName: 'cotizador_precio_historial',
  timestamps: false,
  indexes: [
    { fields: ['codigo', 'fecha'] },
    { fields: ['fecha'] },
  ],
});

export default CotizadorPrecioHistorial;

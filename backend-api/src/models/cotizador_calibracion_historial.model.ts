import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

// Historial append-only que mezcla márgenes, holguras y cambios de estado en
// una sola línea temporal, tal como GET /calibracion/historial la sirve.
// Reconstruirlo con UNION de las tablas versionadas sería más código para
// el mismo resultado — por eso tabla propia.
class CotizadorCalibracionHistorial extends Model {}

CotizadorCalibracionHistorial.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  fecha: { type: DataTypes.DATE, allowNull: false },
  // 'aprobar-margen' | 'anular-margen' | 'fijar-holgura' | 'anular-holgura' | 'cambiar-estado'
  accion: { type: DataTypes.STRING(40), allowNull: false },
  payload: { type: DataTypes.JSONB, allowNull: false },
}, {
  sequelize,
  modelName: 'CotizadorCalibracionHistorial',
  tableName: 'cotizador_calibracion_historial',
  timestamps: false,
  indexes: [
    { fields: ['fecha'] },
  ],
});

export default CotizadorCalibracionHistorial;

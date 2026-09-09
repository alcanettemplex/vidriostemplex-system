import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class HistorialEstadoODP extends Model {}

HistorialEstadoODP.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  odp_id: { type: DataTypes.INTEGER, allowNull: false },
  estado_anterior: { type: DataTypes.STRING(30) },
  estado_nuevo: { type: DataTypes.STRING(30) },
  usuario_id: { type: DataTypes.INTEGER, allowNull: false },
  fecha: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  observacion: { type: DataTypes.TEXT, allowNull: true },
  // true = el movimiento lo hizo el sistema solo (checks automáticos de vidrio/herrajes,
  // avance a LISTO_INSTALAR, retroceso por material revertido). Alimenta la pestaña
  // "Automáticos" del tablero de Producción. Se distingue por columna y no por el texto
  // de `observacion` para que reescribir un mensaje no rompa la consulta.
  automatico: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
}, {
  sequelize,
  modelName: 'HistorialEstadoODP',
  tableName: 'historial_estados_odp',
  timestamps: false,
});

export default HistorialEstadoODP;

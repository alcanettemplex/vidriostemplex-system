import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

// Estado de madurez por sistema constructivo. Mientras no esté EN_PRODUCCION,
// aptitudOrden.ts bloquea la impresión de una orden de corte definitiva.
class CotizadorCalibracionSistema extends Model {}

CotizadorCalibracionSistema.init({
  sistema: { type: DataTypes.STRING(60), primaryKey: true },
  estado: {
    type: DataTypes.ENUM('EN_CALIBRACION', 'VALIDADO', 'EN_PRODUCCION'),
    allowNull: false,
    defaultValue: 'EN_CALIBRACION',
  },
  firma_maestro: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  actualizado_en: { type: DataTypes.DATE },
  actualizado_por: { type: DataTypes.STRING(80) },
}, {
  sequelize,
  modelName: 'CotizadorCalibracionSistema',
  tableName: 'cotizador_calibracion_sistema',
  timestamps: false,
});

export default CotizadorCalibracionSistema;

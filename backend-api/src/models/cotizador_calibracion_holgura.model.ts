import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

// Holguras de instalación: vano → medida de fabricación. Cascada más simple
// que la de márgenes: solo global → sistema. El script de migración agrega
// el índice único parcial sobre (ambito, COALESCE(sistema,'global')) WHERE
// vigente, que Sequelize no puede declarar.
class CotizadorCalibracionHolgura extends Model {}

CotizadorCalibracionHolgura.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  ambito: { type: DataTypes.ENUM('global', 'sistema'), allowNull: false },
  sistema: { type: DataTypes.STRING(60) },
  ancho_mm: { type: DataTypes.DOUBLE, allowNull: false },
  alto_mm: { type: DataTypes.DOUBLE, allowNull: false },
  nota: { type: DataTypes.TEXT },
  definido_por: { type: DataTypes.STRING(80) },
  definido_en: { type: DataTypes.DATE, allowNull: false },
  vigente: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
}, {
  sequelize,
  modelName: 'CotizadorCalibracionHolgura',
  tableName: 'cotizador_calibracion_holgura',
  timestamps: false,
});

export default CotizadorCalibracionHolgura;

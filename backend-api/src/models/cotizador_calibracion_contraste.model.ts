import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

// Dato crudo de calibración, JAMÁS se corrige. medida_sistema_bruta_mm es
// SIN margen aplicado — invariante crítica (storeCalibracion.js:46-53): si
// se contrastara la medida ya corregida, la calibración se validaría a sí
// misma. Anular es lógico (anulado=true), nunca DELETE.
class CotizadorCalibracionContraste extends Model {}

CotizadorCalibracionContraste.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  registrado_en: { type: DataTypes.DATE, allowNull: false },
  anulado: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  motivo_anulacion: { type: DataTypes.TEXT },
  anulado_en: { type: DataTypes.DATE },
  sistema: { type: DataTypes.STRING(60), allowNull: false },
  ref: { type: DataTypes.STRING(30), allowNull: false },
  material: { type: DataTypes.STRING(20), allowNull: false }, // 'aluminio' | 'vidrio'
  medida_sistema_bruta_mm: { type: DataTypes.DOUBLE, allowNull: false },
  medida_maestro_mm: { type: DataTypes.DOUBLE, allowNull: false },
  ancho_vano_mm: { type: DataTypes.DOUBLE },
  alto_vano_mm: { type: DataTypes.DOUBLE },
  nota: { type: DataTypes.TEXT },
  registrado_por: { type: DataTypes.STRING(80) },
}, {
  sequelize,
  modelName: 'CotizadorCalibracionContraste',
  tableName: 'cotizador_calibracion_contraste',
  timestamps: false,
  indexes: [
    { fields: ['sistema', 'ref'] },
  ],
});

export default CotizadorCalibracionContraste;

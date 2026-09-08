import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

// Tabla vacía, sin endpoint propio: le da casa a un eventual
// geometria-overrides.json (paso 7 de calcularPlano en planoProducto.ts).
// Sin ella se perdería esa capacidad en silencio al portar el motor de plano.
class CotizadorGeometriaOverride extends Model {}

CotizadorGeometriaOverride.init({
  diseno_id: { type: DataTypes.STRING(80), primaryKey: true },
  asignacion: { type: DataTypes.JSONB, allowNull: false },
  nota: { type: DataTypes.TEXT },
  actualizado_en: { type: DataTypes.DATE },
}, {
  sequelize,
  modelName: 'CotizadorGeometriaOverride',
  tableName: 'cotizador_geometria_override',
  timestamps: false,
});

export default CotizadorGeometriaOverride;

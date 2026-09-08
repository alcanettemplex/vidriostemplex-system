import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

// Vidrios de un diseño (218 filas).
class CotizadorDisenoVidrio extends Model {}

CotizadorDisenoVidrio.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  diseno_id: { type: DataTypes.STRING(80), allowNull: false },
  orden: { type: DataTypes.INTEGER, allowNull: false },
  descripcion: { type: DataTypes.STRING(120) },
  cantidad: { type: DataTypes.DOUBLE, allowNull: false },
  desperdicio_pct: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
  formula_ancho_a: { type: DataTypes.DOUBLE, allowNull: false },
  formula_ancho_b: { type: DataTypes.DOUBLE, allowNull: false },
  formula_ancho_c: { type: DataTypes.DOUBLE, allowNull: false },
  formula_alto_a: { type: DataTypes.DOUBLE, allowNull: false },
  formula_alto_b: { type: DataTypes.DOUBLE, allowNull: false },
  formula_alto_c: { type: DataTypes.DOUBLE, allowNull: false },
  nivel_riesgo: { type: DataTypes.STRING(30) },
}, {
  sequelize,
  modelName: 'CotizadorDisenoVidrio',
  tableName: 'cotizador_diseno_vidrio',
  timestamps: false,
  indexes: [
    { fields: ['diseno_id', 'orden'], unique: true },
  ],
});

export default CotizadorDisenoVidrio;

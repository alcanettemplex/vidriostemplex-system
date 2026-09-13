import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

// Vidrios de un diseño (218 filas).
//
// Igual que en diseno_perfil: `formula_*` es la recta ajustada sobre las 3
// observaciones de la extracción y `modelo_*` el cálculo entero reconstruido
// `op((p*ancho + q*alto + r) / n)`. Aquí el ancho y el alto van por separado
// porque son medidas independientes: el ancho de un paño suele dividirse entre
// el número de cuerpos y el alto no. `nivel_riesgo` es el peor de los dos lados.
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
  // Modelo de corte entero por lado. NULL en bloque cuando no lo admite.
  modelo_ancho_p: { type: DataTypes.INTEGER },
  modelo_ancho_q: { type: DataTypes.INTEGER },
  modelo_ancho_r: { type: DataTypes.INTEGER },
  modelo_ancho_n: { type: DataTypes.INTEGER },
  modelo_ancho_op: { type: DataTypes.STRING(6) },
  modelo_ancho_dispersion_mm: { type: DataTypes.DOUBLE },
  modelo_alto_p: { type: DataTypes.INTEGER },
  modelo_alto_q: { type: DataTypes.INTEGER },
  modelo_alto_r: { type: DataTypes.INTEGER },
  modelo_alto_n: { type: DataTypes.INTEGER },
  modelo_alto_op: { type: DataTypes.STRING(6) },
  modelo_alto_dispersion_mm: { type: DataTypes.DOUBLE },
  nivel_riesgo: { type: DataTypes.STRING(30) },
}, {
  sequelize,
  modelName: 'CotizadorDisenoVidrio',
  tableName: 'diseno_vidrio',
  schema: 'cotizador',
  timestamps: false,
  indexes: [
    { fields: ['diseno_id', 'orden'], unique: true },
  ],
});

export default CotizadorDisenoVidrio;

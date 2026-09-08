import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

// Perfiles de un diseño (983 filas). Fórmula en columnas (no JSONB): el
// análisis de nivel A/B/C inspecciona los coeficientes — "coeficientes no
// enteros" es la definición operativa de nivel B. codigosPorColor sí queda
// JSONB: 5 claves fijas (no siempre las 5 presentes) que nunca se filtran
// en SQL — claveColor() las resuelve en JS con el Map ya cargado en caché.
class CotizadorDisenoPerfil extends Model {}

CotizadorDisenoPerfil.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  diseno_id: { type: DataTypes.STRING(80), allowNull: false },
  orden: { type: DataTypes.INTEGER, allowNull: false },
  ref: { type: DataTypes.STRING(30), allowNull: false },
  ref_original: { type: DataTypes.STRING(30) },
  descripcion: { type: DataTypes.STRING(120) },
  cantidad: { type: DataTypes.DOUBLE, allowNull: false },
  desperdicio_pct: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
  formula_a: { type: DataTypes.DOUBLE, allowNull: false },
  formula_b: { type: DataTypes.DOUBLE, allowNull: false },
  formula_c: { type: DataTypes.DOUBLE, allowNull: false },
  nivel_corte: { type: DataTypes.CHAR(1), allowNull: false },
  codigos_por_color: { type: DataTypes.JSONB, allowNull: false },
  es_alfajia: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
}, {
  sequelize,
  modelName: 'CotizadorDisenoPerfil',
  tableName: 'cotizador_diseno_perfil',
  timestamps: false,
  indexes: [
    { fields: ['diseno_id', 'orden'], unique: true },
    { fields: ['ref'] },
    { fields: ['diseno_id'] },
  ],
});

export default CotizadorDisenoPerfil;

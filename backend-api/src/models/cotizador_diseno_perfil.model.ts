import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

// Perfiles de un diseño (983 filas). Fórmula en columnas (no JSONB): el
// análisis de nivel A/B/C inspecciona los coeficientes — "coeficientes no
// enteros" es la definición operativa de nivel B. codigosPorColor sí queda
// JSONB: 5 claves fijas (no siempre las 5 presentes) que nunca se filtran
// en SQL — claveColor() las resuelve en JS con el Map ya cargado en caché.
//
// DOS REPRESENTACIONES DE LA MISMA MEDIDA (2026-09-13)
// `formula_*` es la recta `a*ancho + b*alto + c` ajustada por mínimos cuadrados
// sobre las 3 observaciones de la extracción. `modelo_*` es el cálculo entero
// reconstruido `op((p*ancho + q*alto + r) / n)`, que es la forma en que el
// software de origen calcula de verdad. La recta se conserva porque 8 perfiles
// no admiten modelo entero y porque permite auditar de dónde salió cada cosa;
// el motor prefiere el modelo cuando existe. `modelo_n IS NULL` es la única
// señal de "esta pieza no tiene modelo": las demás columnas se llenan juntas o
// no se llenan (lo verifica el script de migración antes de confirmar).
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
  // Modelo de corte entero. NULL en bloque cuando la pieza no lo admite.
  modelo_p: { type: DataTypes.INTEGER },
  modelo_q: { type: DataTypes.INTEGER },
  modelo_r: { type: DataTypes.INTEGER },
  modelo_n: { type: DataTypes.INTEGER },
  modelo_op: { type: DataTypes.STRING(6) },
  /** Separación máxima entre los modelos compatibles con las observaciones, en
   * vanos de obra reales. Es la incertidumbre que queda, no un error medido
   * contra el taller. 0 = todos los modelos compatibles dan el mismo número. */
  modelo_dispersion_mm: { type: DataTypes.DOUBLE },
  codigos_por_color: { type: DataTypes.JSONB, allowNull: false },
  es_alfajia: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
}, {
  sequelize,
  modelName: 'CotizadorDisenoPerfil',
  tableName: 'diseno_perfil',
  schema: 'cotizador',
  timestamps: false,
  indexes: [
    { fields: ['diseno_id', 'orden'], unique: true },
    { fields: ['ref'] },
    { fields: ['diseno_id'] },
  ],
});

export default CotizadorDisenoPerfil;

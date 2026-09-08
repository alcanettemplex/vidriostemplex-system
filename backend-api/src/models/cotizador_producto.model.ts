import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

// Catálogo de precios del módulo Cotizador (aislado del catálogo de Proveedores).
// codigo es PK: nunca hay dos filas para el mismo código, ni siquiera entre
// catálogo real y provisional (verificado: cero colisiones al migrar).
// Todo número es DOUBLE, nunca DECIMAL — pg devuelve NUMERIC como string y
// motorCalculo.ts haría concatenación silenciosa en vez de sumar.
class CotizadorProducto extends Model {}

CotizadorProducto.init({
  codigo: { type: DataTypes.STRING(20), primaryKey: true },
  descripcion: { type: DataTypes.STRING(120), allowNull: false },
  // STRING + CHECK (no ENUM): un alta hoy puede llegar sin categoría; el
  // formulario nuevo la exige, pero el esquema no debe romper con datos viejos.
  categoria: { type: DataTypes.STRING(20), allowNull: false },
  unidad: { type: DataTypes.STRING(20) },
  costo_unitario: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
  precio_pa: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
  precio_pm: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
  precio_pb: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
  origen: { type: DataTypes.ENUM('CATALOGO', 'PROVISIONAL', 'ALTA'), allowNull: false },
  provisional: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  referencia: { type: DataTypes.STRING(20) },
  color: { type: DataTypes.STRING(20) },
  // Texto neutralizado: nunca debe nombrar el software externo de origen.
  // Formato: "referencia externa · <acabado>" o "referencia externa · mediana de acabados".
  fuente: { type: DataTypes.STRING(120) },
  acabado_exacto: { type: DataTypes.BOOLEAN },
  sospechoso_valor_por_defecto: { type: DataTypes.BOOLEAN },
  creado_en: { type: DataTypes.DATE },
  creado_por: { type: DataTypes.STRING(80) },
}, {
  sequelize,
  modelName: 'CotizadorProducto',
  tableName: 'cotizador_producto',
  timestamps: false,
  indexes: [
    { fields: ['categoria'] },
    { fields: ['origen'] },
  ],
});

export default CotizadorProducto;

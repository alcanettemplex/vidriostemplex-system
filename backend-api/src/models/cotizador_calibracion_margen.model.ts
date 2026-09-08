import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

// Cascada de márgenes de corte: global → sistema → material → pieza, por
// REEMPLAZO (nunca suma). `clave` se deriva en el controlador igual que
// margenEfectivo() (calibracion.js:314-321): global→'global', sistema→sistema,
// material→'sistema|material', pieza→'sistema|ref'.
//
// El script de migración agrega, además de esta definición Sequelize:
//   - CREATE UNIQUE INDEX ... ON (ambito, clave) WHERE vigente
//     (dos objetos que Sequelize no puede declarar) — da versionado gratis:
//     aprobar = marcar el anterior vigente=false + insertar.
//   - CHECK de gramática de la cascada (qué columnas van NULL según ambito).
//
// AUSENTE vs CERO (invariante que el módulo entero defiende): ausente =
// ninguna fila vigente; cero = una fila vigente con margen_mm = 0.
class CotizadorCalibracionMargen extends Model {}

CotizadorCalibracionMargen.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  ambito: { type: DataTypes.ENUM('global', 'sistema', 'material', 'pieza'), allowNull: false },
  sistema: { type: DataTypes.STRING(60) },
  material: { type: DataTypes.STRING(20) }, // 'aluminio' | 'vidrio'
  ref: { type: DataTypes.STRING(30) },
  clave: { type: DataTypes.STRING(120), allowNull: false },
  margen_mm: { type: DataTypes.DOUBLE, allowNull: false },
  aprobado_por: { type: DataTypes.STRING(80) },
  evidencia: { type: DataTypes.JSONB },
  vigente: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  creado_en: { type: DataTypes.DATE, allowNull: false },
  anulado_en: { type: DataTypes.DATE },
}, {
  sequelize,
  modelName: 'CotizadorCalibracionMargen',
  tableName: 'cotizador_calibracion_margen',
  timestamps: false,
});

export default CotizadorCalibracionMargen;

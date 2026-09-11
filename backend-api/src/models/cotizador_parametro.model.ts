import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

// Fila única (id=1, CHECK reforzado en el script de migración) con los
// parámetros globales de negocio. Colapsa lo que en el origen eran
// data/parametros.json + su capa de override: aquí el artefacto diffeable
// es el script de siembra, no un archivo.
class CotizadorParametro extends Model {}

CotizadorParametro.init({
  id: { type: DataTypes.INTEGER, primaryKey: true },
  aiu: { type: DataTypes.DOUBLE, allowNull: false },
  iva: { type: DataTypes.DOUBLE, allowNull: false },
  flete_fijo: { type: DataTypes.DOUBLE, allowNull: false },
  smo_tarifa_minima: { type: DataTypes.DOUBLE, allowNull: false },
  smo_piso_tablero_grande: { type: DataTypes.DOUBLE, allowNull: false },
  // Un SMO por TIPO DE OBRA (Excel hoja COSTOS, tabla "GASTOS DE INSTALACION",
  // Z27:AC38). La webapp modelaba un único `smo_tarifa_minima`, así que cobraba
  // lo mismo instalar una cabina que armar una ventana (2026-09-11).
  //
  // Llevan `defaultValue` —el resto de columnas de la tabla no— porque estas
  // nacen NOT NULL sobre una fila que YA existe: sin un valor por defecto, un
  // entorno nuevo que crea la tabla con sync({alter:false}) y luego corre la
  // siembra (que no las pasa) violaría el NOT NULL. Los valores coinciden con
  // los DEFAULT del script 2026-09-11_migrar_parametros_smo.ts.
  smo_cabinas: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 120000 },          // SMO01
  smo_fachadas: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 85000 },          // SMO02
  smo_armada_ventanas: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 60000 },   // SMO03
  smo_persiana: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 110000 },         // SMO04
  alquiler_andamio: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 90000 },      // ALQU36
  huacal: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 80000 },                // HUAC06
  clientes: { type: DataTypes.JSONB, allowNull: false }, // ["PA","PM","PB"]
  asesores: { type: DataTypes.JSONB, allowNull: false }, // lista fija de nombres, texto libre
  estados_cotizacion: { type: DataTypes.JSONB, allowNull: false },
  actualizado_en: { type: DataTypes.DATE },
  actualizado_por: { type: DataTypes.STRING(80) },
}, {
  sequelize,
  modelName: 'CotizadorParametro',
  tableName: 'cotizador_parametro',
  timestamps: false,
});

export default CotizadorParametro;

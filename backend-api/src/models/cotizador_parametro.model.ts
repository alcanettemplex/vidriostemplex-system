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

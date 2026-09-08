import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

// Cabecera de diseño (138 filas). id conserva el formato de origen
// "Sistema5020::OX" — es la clave que usan los motores de despiece.
// Sin auditoría: es dato de catálogo técnico, no una operación de negocio.
class CotizadorDiseno extends Model {}

CotizadorDiseno.init({
  id: { type: DataTypes.STRING(80), primaryKey: true },
  modulo: { type: DataTypes.STRING(30), allowNull: false },
  sistema: { type: DataTypes.STRING(60), allowNull: false },
  diseno: { type: DataTypes.STRING(40), allowNull: false },
  etiqueta: { type: DataTypes.STRING(120) },
  paneles: { type: DataTypes.INTEGER },
  nivel_corte: { type: DataTypes.CHAR(1), allowNull: false },
  nivel_vidrio: { type: DataTypes.CHAR(1) },
  nivel_perfiles: { type: DataTypes.CHAR(1) },
  medidas_respaldo: { type: DataTypes.INTEGER },
  cotizable: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  refs_sin_precio: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
}, {
  sequelize,
  modelName: 'CotizadorDiseno',
  tableName: 'cotizador_diseno',
  timestamps: false,
  indexes: [
    { fields: ['modulo'] },
    { fields: ['sistema'] },
    { fields: ['cotizable'] },
  ],
});

export default CotizadorDiseno;

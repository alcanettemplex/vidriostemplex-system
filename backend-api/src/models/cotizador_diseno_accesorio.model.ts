import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

// Accesorios "de diseño" (1.049 filas). Hoy son dato muerto para el precio
// (el motor no los cobra; cada módulo usa sus propias constantes hardcodeadas
// en modules/*.ts), pero SÍ los lee desgloseAccesorios() y la pantalla de
// comparación (AccesoriosTab) — comparar hardcodeado vs. mapeado ES ese
// módulo. Se migran completos. cantidad y formula son nullables: el origen
// trae varias entradas con cantidad=null (p.ej. "Felpa").
class CotizadorDisenoAccesorio extends Model {}

CotizadorDisenoAccesorio.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  diseno_id: { type: DataTypes.STRING(80), allowNull: false },
  orden: { type: DataTypes.INTEGER, allowNull: false },
  descripcion: { type: DataTypes.STRING(120), allowNull: false },
  cantidad: { type: DataTypes.DOUBLE },
  formula: { type: DataTypes.JSONB },
}, {
  sequelize,
  modelName: 'CotizadorDisenoAccesorio',
  tableName: 'cotizador_diseno_accesorio',
  timestamps: false,
  indexes: [
    { fields: ['diseno_id', 'orden'], unique: true },
    { fields: ['descripcion'] },
  ],
});

export default CotizadorDisenoAccesorio;

import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

// Formaliza el multiplicador costo→precio de venta (PA/PM/PB) por categoría,
// que hasta el 2026-09-14 se recalculaba a mano en cada script one-off (ver
// 2026-09-14_alta_accesorios_7038_restantes.ts). La ausencia de una fila para
// una categoría es la señal que usa `sincronizacionProveedores.ts` para
// abstenerse de tocar esos productos: no confundir "sin fila" con "multiplicador
// 1.0" ni con ningún otro default silencioso.
class CotizadorMultiplicadorCategoria extends Model {}

CotizadorMultiplicadorCategoria.init({
  categoria: { type: DataTypes.STRING(20), primaryKey: true },
  multiplicador_pa: { type: DataTypes.DOUBLE, allowNull: false },
  multiplicador_pm: { type: DataTypes.DOUBLE, allowNull: false },
  multiplicador_pb: { type: DataTypes.DOUBLE, allowNull: false },
  actualizado_en: { type: DataTypes.DATE },
  actualizado_por: { type: DataTypes.STRING(80) },
  nota: { type: DataTypes.TEXT },
}, {
  sequelize,
  modelName: 'CotizadorMultiplicadorCategoria',
  tableName: 'multiplicador_categoria',
  schema: 'cotizador',
  timestamps: false,
});

export default CotizadorMultiplicadorCategoria;

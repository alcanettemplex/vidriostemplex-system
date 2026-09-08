import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

// Capa de precios editada a mano: gana siempre sobre cotizador_producto.
// Columnas nullables (no JSONB): NULL significa "no opina sobre este campo",
// exactamente la semántica de mezcla de proveedorLocal.js:133-142.
// Sin FK a codigo, a propósito: un override puede sobrevivir a un código que
// ya no resuelve en cotizador_producto (para no perder el dato en silencio).
class CotizadorPrecioOverride extends Model {}

CotizadorPrecioOverride.init({
  codigo: { type: DataTypes.STRING(20), primaryKey: true },
  precio_pa: { type: DataTypes.DOUBLE },
  precio_pm: { type: DataTypes.DOUBLE },
  precio_pb: { type: DataTypes.DOUBLE },
  costo_unitario: { type: DataTypes.DOUBLE },
  activo: { type: DataTypes.BOOLEAN },
  fecha: { type: DataTypes.DATE, allowNull: false },
  por: { type: DataTypes.STRING(80) },
  motivo: { type: DataTypes.STRING(300) },
}, {
  sequelize,
  modelName: 'CotizadorPrecioOverride',
  tableName: 'cotizador_precio_override',
  timestamps: false,
});

export default CotizadorPrecioOverride;

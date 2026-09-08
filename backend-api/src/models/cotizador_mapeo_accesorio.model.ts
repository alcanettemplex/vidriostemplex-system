import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

// Mapeo de las 54 descripciones de accesorio de diseño al catálogo real de
// Templex (editable desde la pantalla de comparación). Mientras un sistema
// no esté en cotizador_accesorio_sistema_activo, sus accesorios los sigue
// cobrando el mapa hardcodeado de cada módulo — activar un sistema es una
// decisión de negocio deliberada, nunca automática.
class CotizadorMapeoAccesorio extends Model {}

CotizadorMapeoAccesorio.init({
  descripcion: { type: DataTypes.STRING(120), primaryKey: true },
  estado: {
    type: DataTypes.ENUM('MAPEADO', 'INSUMO_NO_FACTURADO', 'PENDIENTE', 'IGNORADO'),
    allowNull: false,
  },
  codigo: { type: DataTypes.STRING(20) },
  consumo: { type: DataTypes.JSONB }, // {tipo: 'unidad'|'perimetroVidrio'|'perimetroMarco'|'altoPorHoja', ...}
  nota: { type: DataTypes.TEXT },
  confianza: { type: DataTypes.STRING(20) },
  actualizado_en: { type: DataTypes.DATE },
  actualizado_por: { type: DataTypes.STRING(80) },
}, {
  sequelize,
  modelName: 'CotizadorMapeoAccesorio',
  tableName: 'cotizador_mapeo_accesorio',
  timestamps: false,
});

export default CotizadorMapeoAccesorio;

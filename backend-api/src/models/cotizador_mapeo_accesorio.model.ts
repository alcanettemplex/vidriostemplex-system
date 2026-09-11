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
  // {tipo: 'unidad'|'perimetroVidrio'|'perimetroMarco'|'altoPorHoja'
  //        |'porAlasCorredizas'|'porCuerpos'|'porAnchoEscalonado', ...}
  consumo: { type: DataTypes.JSONB },
  // Restringe el mapeo a estos sistemas (2026-09-11). NULL o [] = vale para
  // todos. Existe porque el extractor dejó descripciones genéricas que
  // significan un producto distinto en cada sistema ("E.universa. Empaque
  // Universal" es EMP5020 en 5020 y EMPA8025 en 8025): sin esta lista, mapear
  // la clave cobraría el código equivocado a los demás sistemas en silencio.
  sistemas: { type: DataTypes.JSONB },
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

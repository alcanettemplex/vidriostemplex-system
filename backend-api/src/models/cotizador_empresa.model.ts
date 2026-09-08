import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

// Fila única (id=1) con los datos de empresa para el PDF de cotización.
// Separada del logo (ver cotizador_empresa_logo) para que
// GET /api/cotizador/empresa no pague los 23 KB del logo salvo que se pida
// explícitamente — el generador de PDF lo lee de la caché en memoria, con
// coste 0. Aislada de configuracion_global a propósito (ver decisión 1):
// esa tabla tiene whitelist, otro dueño de edición y auditoría propia.
class CotizadorEmpresa extends Model {}

CotizadorEmpresa.init({
  id: { type: DataTypes.INTEGER, primaryKey: true },
  razon_social: { type: DataTypes.STRING(120) },
  nombre_comercial: { type: DataTypes.STRING(120) },
  eslogan: { type: DataTypes.STRING(200) },
  nit: { type: DataTypes.STRING(30) },
  telefono: { type: DataTypes.STRING(60) },
  direccion: { type: DataTypes.STRING(150) },
  web: { type: DataTypes.STRING(120) },
  cuenta_bancaria: { type: DataTypes.JSONB },
  garantia: { type: DataTypes.TEXT },
  validez_oferta_dias: { type: DataTypes.INTEGER },
  validez_oferta_texto: { type: DataTypes.STRING(200) },
  condiciones_comerciales: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] }, // los 11 textos verbatim
  actualizado_en: { type: DataTypes.DATE },
  actualizado_por: { type: DataTypes.STRING(80) },
}, {
  sequelize,
  modelName: 'CotizadorEmpresa',
  tableName: 'cotizador_empresa',
  timestamps: false,
});

export default CotizadorEmpresa;

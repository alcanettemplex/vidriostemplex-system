import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class ConfiguracionGlobal extends Model {}

ConfiguracionGlobal.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  
  // Financieras
  meta_facturacion_mensual: { type: DataTypes.DECIMAL(15, 2), defaultValue: 120000000.00 },

  // Comerciales
  meta_odps_cerradas_asesor: { type: DataTypes.INTEGER, defaultValue: 12 },

  // Producción
  meta_ciclo_produccion_dias: { type: DataTypes.INTEGER, defaultValue: 8 },
  dias_alerta_odp_estancada: { type: DataTypes.INTEGER, defaultValue: 2 },
  
  // Flujo Caja
  dias_alerta_cartera_vencida: { type: DataTypes.INTEGER, defaultValue: 60 },

  // Módulo Proveedores: % de variación de precio que dispara alerta en rojo.
  // Configurable desde /configuracion por root/admin. La BD es fuente de verdad.
  umbral_variacion_precio_pct: { type: DataTypes.INTEGER, defaultValue: 30 },
  
  ultima_modificacion: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, {
  sequelize,
  modelName: 'ConfiguracionGlobal',
  tableName: 'configuracion_global',
  timestamps: false,
});

export default ConfiguracionGlobal;

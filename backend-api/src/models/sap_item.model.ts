import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class SAPItem extends Model {}

SAPItem.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  sap_id: { type: DataTypes.INTEGER, allowNull: false },
  item: { type: DataTypes.STRING(10) },           // A, B, C...
  codigo: { type: DataTypes.STRING(50) },          // código del catálogo
  descripcion: { type: DataTypes.STRING(255) },    // descripción del catálogo o manual
  dimension: { type: DataTypes.STRING(100) },      // medida ingresada por asesor
  cantidad: { type: DataTypes.DECIMAL(10, 2), defaultValue: 1 },
  und: { type: DataTypes.STRING(20), allowNull: true },
  exist_perf: { type: DataTypes.TEXT, allowNull: true },
  observacion: { type: DataTypes.TEXT, allowNull: true },
  estado_compra: {
    type: DataTypes.STRING(20),
    defaultValue: 'pendiente',
    allowNull: false,
  },
  modificado: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
  // true = ítem generado como "faltante" desde una cobertura parcial de existencia perfilería
  es_faltante: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
  datos_anteriores: { type: DataTypes.JSONB, allowNull: true },
  // Snapshot de piezas de inventario consumidas al cubrir por existencia (para poder revertir).
  // Forma: { piezas: [{ consecutivo, codigo, mm, ubicacion, fecha_corte }], faltante_id: number | null }
  existencia_piezas: { type: DataTypes.JSONB, allowNull: true },
}, {
  sequelize, modelName: 'SAPItem', tableName: 'sap_items', timestamps: false,
});

export default SAPItem;

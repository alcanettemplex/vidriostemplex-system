import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class ODPItem extends Model { }

ODPItem.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  odp_id: { type: DataTypes.INTEGER, allowNull: false },
  item: { type: DataTypes.STRING(100) },
  color: { type: DataTypes.STRING(30) },
  espesor: { type: DataTypes.STRING(10) },
  cantidad: { type: DataTypes.INTEGER, defaultValue: 1 },
  ancho_mm: { type: DataTypes.INTEGER },
  alto_mm: { type: DataTypes.INTEGER },
  tipo_vidrio: { type: DataTypes.STRING(30) },
  pelicula: { type: DataTypes.BOOLEAN, defaultValue: false },
  matizado: { type: DataTypes.BOOLEAN, defaultValue: false },
  carton: { type: DataTypes.BOOLEAN, defaultValue: false },
  huacal: { type: DataTypes.BOOLEAN, defaultValue: false },
  accesorios: { type: DataTypes.STRING(255) },
  pulidos: { type: DataTypes.STRING(10) },
  pulidos_h: { type: DataTypes.STRING(10) },
  perforaciones: { type: DataTypes.INTEGER, defaultValue: 0 },
  boquetes: { type: DataTypes.INTEGER, defaultValue: 0 },
  descuentos: { type: DataTypes.STRING(50) },
  otros: { type: DataTypes.STRING(100) },
  mts_pt_a: { type: DataTypes.STRING(20) },
  mts_pt_h: { type: DataTypes.STRING(20) },
  prod: { type: DataTypes.STRING(30) },
  verificacion_prod: { type: DataTypes.BOOLEAN, defaultValue: false },
  pedido_pv_id: { type: DataTypes.INTEGER, allowNull: true },
  dt: { type: DataTypes.STRING(100), allowNull: true },
  observaciones_pv: { type: DataTypes.STRING(255), allowNull: true },
  estado_compra: { type: DataTypes.STRING(20), allowNull: true, defaultValue: 'pendiente' },
}, {
  sequelize,
  modelName: 'ODPItem',
  tableName: 'odp_items',
  timestamps: false,
  defaultScope: {
    order: [['id', 'ASC']],
  },
});

export default ODPItem;

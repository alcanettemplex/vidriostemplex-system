import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class CatalogoProducto extends Model {}

CatalogoProducto.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  codigo: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  nombre: { type: DataTypes.STRING(255), allowNull: false },
  categoria: { type: DataTypes.STRING(100), allowNull: true },
  descripcion: { type: DataTypes.TEXT },
  activo: { type: DataTypes.BOOLEAN, defaultValue: true },
  es_aluminio: { type: DataTypes.BOOLEAN, defaultValue: false },
  // Módulo Proveedores: unidad canónica del producto (ej: UNIDAD, METRO, M2, KG)
  // Necesaria para comparar precios entre proveedores cuando las unidades difieren.
  unidad_medida: { type: DataTypes.STRING(30), allowNull: true },
  // Porcentaje de IVA por producto. Default 19 pero NO hardcodeado:
  // en Colombia hay bienes excluidos (0%), exentos (0%) y tarifas distintas.
  porcentaje_iva: { type: DataTypes.INTEGER, defaultValue: 19 },
}, {
  sequelize,
  modelName: 'CatalogoProducto',
  tableName: 'catalogo_productos',
  timestamps: false,
});

export default CatalogoProducto;

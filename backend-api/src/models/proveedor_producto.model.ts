import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

/**
 * ProveedorProducto — tabla de equivalencias N:M entre Proveedor y CatalogoProducto.
 *
 * Resuelve el problema central: cada proveedor nombra y codifica el mismo producto
 * de forma diferente. Esta tabla dice "el producto TUB0510 del catálogo interno
 * es el AL-2245 del Proveedor A, a $45.000".
 *
 * La clave única es (proveedor_id, catalogo_producto_id, unidad_compra) para
 * permitir que la perfilería tenga dos filas: precio por TIRA_6M y precio por METRO.
 *
 * Los campos precio_anterior_1/2 son denormalizados para que el listado comparativo
 * se resuelva en una sola consulta sin subconsultas costosas (relevante para egress Supabase).
 */
class ProveedorProducto extends Model {}

ProveedorProducto.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },

  proveedor_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'proveedores', key: 'id' },
  },
  catalogo_producto_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'catalogo_productos', key: 'id' },
  },

  // Cómo llama este proveedor a nuestro producto — atributos de la relación, no del producto
  codigo_proveedor: { type: DataTypes.STRING(100), allowNull: true },
  descripcion_proveedor: { type: DataTypes.TEXT, allowNull: true },

  // Modalidad de compra — permite dos precios del mismo producto (tira vs metro)
  unidad_compra: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'UNIDAD',
    // Valores válidos: UNIDAD | TIRA_6M | METRO | KG | ML | M2
  },
  // Para perfilería en TIRA_6M: largo real de la tira (siempre 6 según el usuario)
  metros_por_unidad: { type: DataTypes.DECIMAL(5, 2), defaultValue: 6 },

  // Precio vigente (sin IVA) — denormalizado para consultas rápidas
  precio_actual: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
  fecha_precio_actual: { type: DataTypes.DATEONLY, allowNull: true },

  // Histórico denormalizado de los 2 últimos precios (para listado sin joins)
  precio_anterior_1: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
  fecha_anterior_1: { type: DataTypes.DATEONLY, allowNull: true },
  precio_anterior_2: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
  fecha_anterior_2: { type: DataTypes.DATEONLY, allowNull: true },

  activo: { type: DataTypes.BOOLEAN, defaultValue: true, allowNull: false },
}, {
  sequelize,
  modelName: 'ProveedorProducto',
  tableName: 'proveedor_producto',
  timestamps: false,
  indexes: [
    {
      // UNIQUE: un proveedor tiene un solo precio por producto por modalidad de compra
      unique: true,
      fields: ['proveedor_id', 'catalogo_producto_id', 'unidad_compra'],
      name: 'uq_proveedor_producto_modalidad',
    },
  ],
});

export default ProveedorProducto;

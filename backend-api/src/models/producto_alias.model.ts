import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

/**
 * ProductoAlias — diccionario de sinónimos por producto del catálogo.
 *
 * Cada vez que un humano mapea un código de proveedor a un producto interno,
 * la descripción del proveedor se guarda como alias de ese producto.
 *
 * Efecto acumulativo: el primer proveedor es el más difícil de mapear.
 * El segundo proveedor que vende el mismo producto se sugiere automáticamente
 * porque su descripción coincide con un alias ya registrado.
 *
 * Ejemplo: TUB0510 (Brazo hidráulico) acumula aliases:
 *   - "CIERRAPUERTAS HIDRAULICO" (de VEA)
 *   - "CIERRA PUERTA 100KG" (de VyP)
 *   - "BRAZO CIERRE AEREO" (de ACVICOL)
 */
class ProductoAlias extends Model {}

ProductoAlias.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },

  catalogo_producto_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'catalogo_productos', key: 'id' },
  },

  alias: { type: DataTypes.STRING(255), allowNull: false },

  origen: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'PROVEEDOR',
    // Valores: PROVEEDOR (se aprendió de un mapeo) | MANUAL (lo escribió un usuario)
  },

  // Con qué proveedor se aprendió este alias (nullable para aliases manuales)
  proveedor_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'proveedores', key: 'id' },
  },

  fecha_registro: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, {
  sequelize,
  modelName: 'ProductoAlias',
  tableName: 'producto_alias',
  timestamps: false,
  indexes: [
    {
      unique: true,
      fields: ['catalogo_producto_id', 'alias'],
      name: 'uq_producto_alias',
    },
    {
      fields: ['catalogo_producto_id'],
      name: 'idx_producto_alias_catalogo',
    },
  ],
});

export default ProductoAlias;

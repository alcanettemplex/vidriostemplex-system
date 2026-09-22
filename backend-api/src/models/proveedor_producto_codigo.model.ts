import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

/**
 * ProveedorProductoCodigo — los N códigos con los que UN proveedor factura
 * UN mismo producto interno.
 *
 * Nace de un caso real (2026-09-21): GRUPO ROLDAN factura el mismo sillar 7038
 * como `GRE701NG` en septiembre y como `GRP701NG` en agosto. Con un solo
 * `codigo_proveedor` en `proveedor_producto`, el segundo código caía a la bandeja
 * de mapeo una y otra vez: al vincularlo, `findOrCreate` encontraba la fila ya
 * existente y descartaba el código nuevo en silencio. Eran 5 casos en ROLDAN y
 * 15 mapeos huérfanos repartidos en otros 5 proveedores.
 *
 * La UNIQUE es (proveedor_producto_id, codigo_proveedor) y NO (proveedor_id,
 * codigo_proveedor): el proveedor 1029 factura los códigos `3`, `11` y `32` en
 * dos modalidades del mismo producto (UNIDAD y M2), que son dos filas distintas
 * de `proveedor_producto`. Que un código apunte a dos productos DISTINTOS sí es
 * un error, pero se valida en aplicación para poder explicarlo con un mensaje
 * legible en vez de reventar con una violación de constraint.
 *
 * `proveedor_id` va denormalizado a propósito: la consulta caliente de la ingesta
 * es `WHERE proveedor_id = X AND codigo_proveedor IN (...)` por lote de factura.
 * Con la columna aquí se resuelve por índice directo; sin ella, cada lote paga un
 * JOIN contra `proveedor_producto`. Ninguna ruta mueve una equivalencia de
 * proveedor, así que no puede quedar desincronizada.
 *
 * `proveedor_producto.codigo_proveedor` se conserva como el código PRINCIPAL
 * denormalizado — lo leen los dos buscadores, el comparador, tres listados y el
 * frontend. Esta tabla es la fuente de verdad; aquella, la copia de lectura.
 */
class ProveedorProductoCodigo extends Model {}

ProveedorProductoCodigo.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },

  proveedor_producto_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'proveedor_producto', key: 'id' },
  },

  // Denormalizado desde la equivalencia — ver cabecera
  proveedor_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'proveedores', key: 'id' },
  },

  codigo_proveedor: { type: DataTypes.STRING(100), allowNull: false },

  // Cómo describe el proveedor ESTE código puntual. Dos códigos del mismo producto
  // suelen traer descripciones casi iguales pero no idénticas (en ROLDAN cambia el
  // peso de la tira), y esa diferencia es justo la pista de si son o no lo mismo.
  descripcion_proveedor: { type: DataTypes.TEXT, allowNull: true },

  // El que se muestra en listados y se copia a proveedor_producto.codigo_proveedor.
  // Hay exactamente uno por equivalencia mientras quede al menos un código.
  principal: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

  // BACKFILL | BANDEJA | MANUAL | LISTA — de dónde salió el código
  origen: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'MANUAL' },

  fecha_alta: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, {
  sequelize,
  modelName: 'ProveedorProductoCodigo',
  tableName: 'proveedor_producto_codigo',
  timestamps: false,
  indexes: [
    {
      unique: true,
      fields: ['proveedor_producto_id', 'codigo_proveedor'],
      name: 'uq_ppc_codigo',
    },
    {
      // La consulta caliente de la ingesta y de la importación de listas
      fields: ['proveedor_id', 'codigo_proveedor'],
      name: 'idx_ppc_lookup',
    },
  ],
});

export default ProveedorProductoCodigo;

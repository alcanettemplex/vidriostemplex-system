import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

// Corrección de medidas de un vidrio que ya va en un Pedido PV (2026-10-26). Una fila por
// vidrio corregido: las medidas de antes y después, quién, cuándo y en qué estado estaba el
// pedido. Las medidas viven en `odp_items`; esta tabla es su bitácora y permite medir
// cuánto se repite el error.
//
// Tabla propia —y no columnas en `pedido_pv`/`odp_items`— porque `sync({ alter: false })`
// crea tablas nuevas pero no agrega columnas (mismo motivo que `pedido_pv_dt_desbloqueo`).
// Auditada pero no revertible desde ROOT: revertir esta fila no devolvería la medida del vidrio.
class PedidoPVCorreccion extends Model {}

PedidoPVCorreccion.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  pedido_pv_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'pedido_pv', key: 'id' },
    onDelete: 'CASCADE',
  },
  odp_id: { type: DataTypes.INTEGER, allowNull: false },
  odp_item_id: { type: DataTypes.INTEGER, allowNull: false },
  /** Letra DT del vidrio al momento de corregir (texto libre en `odp_items.dt`). */
  letra: { type: DataTypes.STRING(10), allowNull: true },
  cantidad: { type: DataTypes.INTEGER, allowNull: false },
  ancho_antes: { type: DataTypes.INTEGER, allowNull: true },
  alto_antes: { type: DataTypes.INTEGER, allowNull: true },
  ancho_nuevo: { type: DataTypes.INTEGER, allowNull: false },
  alto_nuevo: { type: DataTypes.INTEGER, allowNull: false },
  /** Estado del pedido al corregir: PENDIENTE, ENVIADO o CONFIRMADO_PROVEEDOR. */
  estado_pedido: { type: DataTypes.STRING(30), allowNull: false },
  /** El usuario declaró que el proveedor aceptó el cambio (obligatorio si el pedido ya salió). */
  proveedor_acepto: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  nota: { type: DataTypes.TEXT, allowNull: true },
  usuario_id: { type: DataTypes.INTEGER, allowNull: false },
  creado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  sequelize,
  modelName: 'PedidoPVCorreccion',
  tableName: 'pedido_pv_correccion',
  timestamps: false,
  indexes: [{ fields: ['pedido_pv_id'] }, { fields: ['odp_id'] }],
});

export default PedidoPVCorreccion;

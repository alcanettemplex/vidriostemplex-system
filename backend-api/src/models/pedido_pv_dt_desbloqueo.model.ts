import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

// Desbloqueo de los planos DT de un Pedido PV ya enviado (2026-10-16). Una letra queda
// bloqueada en cuanto alguno de sus vidrios va en un pedido que salió de PENDIENTE (el
// papel ya llegó al proveedor); solo admin la reabre, y queda abierta hasta que admin
// la vuelva a bloquear (borra la fila).
//
// Tabla propia —y no columnas en `pedido_pv`— a propósito: `sync({ alter: false })` crea
// tablas nuevas pero no agrega columnas, y un modelo `PedidoPV` con columnas que la BD aún
// no tiene haría fallar TODAS las consultas de Pedidos PV hasta correr el ALTER.
class PedidoPVDtDesbloqueo extends Model {}

PedidoPVDtDesbloqueo.init({
  /** Pedido PV principal (`sufijo IS NULL`). */
  pedido_pv_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    references: { model: 'pedido_pv', key: 'id' },
    onDelete: 'CASCADE',
  },
  desbloqueado_por: { type: DataTypes.INTEGER, allowNull: false },
  desbloqueado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  sequelize,
  modelName: 'PedidoPVDtDesbloqueo',
  tableName: 'pedido_pv_dt_desbloqueo',
  timestamps: false,
});

export default PedidoPVDtDesbloqueo;

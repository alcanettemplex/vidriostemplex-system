import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class PedidoPV extends Model {}

PedidoPV.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  numero_pedido: { type: DataTypes.STRING(20), allowNull: false, unique: true },
  numero_base: { type: DataTypes.INTEGER, allowNull: false },
  sufijo: { type: DataTypes.STRING(5), allowNull: true },
  odp_id: { type: DataTypes.INTEGER, allowNull: true },
  proveedor: { type: DataTypes.STRING(100), allowNull: false },
  creado_por: { type: DataTypes.INTEGER, allowNull: true },
  estado: {
    type: DataTypes.ENUM('PENDIENTE', 'ENVIADO', 'CONFIRMADO_PROVEEDOR', 'LLEGADO', 'VERIFICADO', 'PROBLEMA'),
    allowNull: false,
    defaultValue: 'PENDIENTE',
  },
  tuvo_problema: { type: DataTypes.BOOLEAN, defaultValue: false },
  fecha_envio: { type: DataTypes.DATEONLY, allowNull: true },
  hora_envio: { type: DataTypes.TIME, allowNull: true },
  confirmado_proveedor: { type: DataTypes.BOOLEAN, defaultValue: false },
  fecha_entrega_prometida: { type: DataTypes.DATEONLY, allowNull: true },
  fecha_llegada_real: { type: DataTypes.DATEONLY, allowNull: true },
  dias_diferencia: { type: DataTypes.INTEGER, allowNull: true },
  metraje_venta: { type: DataTypes.DECIMAL(8, 2), allowNull: true },
  espesor_vidrio: { type: DataTypes.STRING(100), allowNull: true },
  factura_pv: { type: DataTypes.STRING(100), allowNull: true },
  observaciones: { type: DataTypes.TEXT, allowNull: true },
  alerta_enviada: { type: DataTypes.BOOLEAN, defaultValue: false },
  verificado_por: { type: DataTypes.INTEGER, allowNull: true },
  fecha_verificacion: { type: DataTypes.DATE, allowNull: true },
  observacion_verificacion: { type: DataTypes.TEXT, allowNull: true },
  origen: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'SISTEMA' },
  nombre_cliente_excel: { type: DataTypes.STRING(300), allowNull: true },
  asesor_iniciales: { type: DataTypes.STRING(10), allowNull: true },
  odp_numero_excel: { type: DataTypes.STRING(30), allowNull: true },
  creado_en: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, {
  sequelize,
  modelName: 'PedidoPV',
  tableName: 'pedido_pv',
  timestamps: false,
});

export default PedidoPV;

import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class Cotizacion extends Model {}

Cotizacion.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  numero_cot: { type: DataTypes.STRING(30), allowNull: false, unique: true },
  odp_id: { type: DataTypes.INTEGER, allowNull: true },        // nullable: COT pre-ODP
  prospecto_id: { type: DataTypes.INTEGER, allowNull: true },
  cliente_id: { type: DataTypes.INTEGER, allowNull: true },
  nombre_proyecto: { type: DataTypes.STRING(200), allowNull: true },
  tipo_cliente: {
    type: DataTypes.ENUM('PA', 'PM', 'PB'),
    allowNull: true,
  },
  creado_por: { type: DataTypes.INTEGER, allowNull: true },
  // Totales calculados y persistidos (calculados en el controlador)
  total_vidrio: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  total_acabados: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  total_gastos_instalacion: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  subtotal: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  descuento: { type: DataTypes.DECIMAL(5, 2), defaultValue: 0 }, // porcentaje 0-100
  base_gravable: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  iva: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  valor_total: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 }, // TOTAL NETO final
  forma_pago: { type: DataTypes.STRING(100), allowNull: true },
  validez_dias: { type: DataTypes.INTEGER, defaultValue: 30 },
  notas: { type: DataTypes.TEXT, allowNull: true },
  estado: {
    type: DataTypes.ENUM('borrador', 'enviada', 'aprobada', 'rechazada', 'vencida', 'convertida'),
    defaultValue: 'borrador',
  },
  fecha_creacion: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, {
  sequelize,
  modelName: 'Cotizacion',
  tableName: 'cotizacion',
  timestamps: false,
});

export default Cotizacion;

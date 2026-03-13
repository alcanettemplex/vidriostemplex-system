import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class OrdenCompra extends Model {}

OrdenCompra.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    odp_id: { type: DataTypes.INTEGER, allowNull: true },
    proveedor: { type: DataTypes.STRING(100), allowNull: false },
    odc: { type: DataTypes.STRING(30), allowNull: false },
    descripcion: { type: DataTypes.TEXT },
    monto: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    estado: {
      type: DataTypes.ENUM('pendiente', 'en_transito', 'recibido', 'problema'),
      defaultValue: 'pendiente',
      allowNull: false,
    },
    fecha_entrega: { type: DataTypes.DATEONLY },
    creado_por: { type: DataTypes.INTEGER, allowNull: false },
    fecha_creacion: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    modelName: 'OrdenCompra',
    tableName: 'ordenes_compra',
    timestamps: false,
  },
);

export default OrdenCompra;

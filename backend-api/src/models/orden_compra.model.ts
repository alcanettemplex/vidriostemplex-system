import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class OrdenCompra extends Model {}

OrdenCompra.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    numero_odc: { type: DataTypes.STRING(30), allowNull: false, unique: true },
    sap_id: { type: DataTypes.INTEGER, allowNull: true },
    odp_id: { type: DataTypes.INTEGER, allowNull: true },
    tipo: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'perfileria' },
    proveedor: { type: DataTypes.STRING(150), allowNull: false },
    estado: {
      type: DataTypes.STRING(20),
      defaultValue: 'pendiente',
      allowNull: false,
    },
    notas: { type: DataTypes.TEXT },
    creado_por: { type: DataTypes.INTEGER, allowNull: false },
    fecha_creacion: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    fecha_recepcion: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    modelName: 'OrdenCompra',
    tableName: 'ordenes_compra',
    timestamps: false,
  },
);

export default OrdenCompra;

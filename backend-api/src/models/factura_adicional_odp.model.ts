import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

// Facturas electrónicas ADICIONALES de una ODP (2ª y 3ª).
// La FE principal sigue en odp.factura_electronica / fecha_factura.
class FacturaAdicionalODP extends Model {}

FacturaAdicionalODP.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    odp_id: { type: DataTypes.INTEGER, allowNull: false },
    numero_fe: { type: DataTypes.STRING(100), allowNull: false },
    fecha_factura: { type: DataTypes.DATE, allowNull: true },
    url_documento_factura: { type: DataTypes.STRING(255), allowNull: true },
    creado_por: { type: DataTypes.INTEGER, allowNull: true },
    creado_en: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    modelName: 'FacturaAdicionalODP',
    tableName: 'facturas_adicionales_odp',
    timestamps: false,
  },
);

export default FacturaAdicionalODP;

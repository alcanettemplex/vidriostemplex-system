import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

// Logo en tabla aparte de cotizador_empresa, a propósito (ver ese modelo).
// Se guarda como data URI (no Cloudinary): pdfmake cierra
// setUrlAccessPolicy(() => false), así que se niega a bajar una URL remota;
// leerlo de RAM es además más barato en egress que un fetch por PDF.
class CotizadorEmpresaLogo extends Model {}

CotizadorEmpresaLogo.init({
  id: { type: DataTypes.INTEGER, primaryKey: true },
  data_uri: { type: DataTypes.TEXT, allowNull: false },
  mime: { type: DataTypes.STRING(40) },
  actualizado_en: { type: DataTypes.DATE },
}, {
  sequelize,
  modelName: 'CotizadorEmpresaLogo',
  tableName: 'cotizador_empresa_logo',
  timestamps: false,
});

export default CotizadorEmpresaLogo;

import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

// Tabla VACÍA a propósito y SIN endpoint que la escriba. Preserva la regla
// del proyecto origen: "no hay, ni debe haber, un endpoint que active un
// sistema automáticamente" (README.md:228-231). Activar un sistema para que
// cobre accesorios desde el mapeo es hoy un INSERT manual en Supabase,
// deliberado y auditable por fecha.
class CotizadorAccesorioSistemaActivo extends Model {}

CotizadorAccesorioSistemaActivo.init({
  sistema: { type: DataTypes.STRING(60), primaryKey: true },
  activado_en: { type: DataTypes.DATE },
  activado_por: { type: DataTypes.STRING(80) },
}, {
  sequelize,
  modelName: 'CotizadorAccesorioSistemaActivo',
  tableName: 'cotizador_accesorio_sistema_activo',
  timestamps: false,
});

export default CotizadorAccesorioSistemaActivo;

import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

// Numeración de cotizaciones sin condición de carrera. Dentro de la
// transacción de creación:
//   UPDATE cotizador_consecutivo SET valor = valor + 1
//     WHERE nombre = 'cotizacion' RETURNING valor;
// El UPDATE toma row-lock: los creadores concurrentes se encolan y un
// rollback DEVUELVE el número (a diferencia de un SERIAL, que deja huecos
// visibles en un documento comercial). UNIQUE(numero) en la cotización es
// la segunda barrera.
class CotizadorConsecutivo extends Model {}

CotizadorConsecutivo.init({
  nombre: { type: DataTypes.STRING(40), primaryKey: true },
  valor: { type: DataTypes.INTEGER, allowNull: false },
}, {
  sequelize,
  modelName: 'CotizadorConsecutivo',
  tableName: 'cotizador_consecutivo',
  timestamps: false,
});

export default CotizadorConsecutivo;

import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

// resultado: JSONB ÍNTEGRO del snapshot de cálculo (BOM + cortes + medidas +
// plano + advertencias, ~4,5 KB). NO se descompone en tablas hijas:
//   1) aptitudOrden.verificarVigencia() compara por POSICIÓN con tolerancia
//      0.005 mm; descomponer arriesga falsos MEDIDA_PERFIL_DESACTUALIZADA.
//   2) Es un artefacto legal inmutable: lo que se cotizó al cliente.
//   3) Se escribe una vez y se lee entero — ninguna consulta filtra dentro.
//   4) JSONB de este tamaño va a TOAST fuera de línea: un SELECT que no
//      nombre `resultado` no paga esos bytes (clave para el egress).
// Precio de esta decisión: el listado nunca puede hacer SELECT *, por eso
// las columnas espejo de abajo, escritas por el controlador.
class CotizadorCotizacionItem extends Model {}

CotizadorCotizacionItem.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  cotizacion_id: { type: DataTypes.INTEGER, allowNull: false },
  orden: { type: DataTypes.INTEGER, allowNull: false },
  modulo_id: { type: DataTypes.STRING(30), allowNull: false }, // sin FK: el registry vive en código
  descripcion_item: { type: DataTypes.STRING(200) },
  input: { type: DataTypes.JSONB, allowNull: false },
  resultado: { type: DataTypes.JSONB, allowNull: false },
  // Espejo denormalizado — escrito por el controlador, nunca por hook.
  diseno_id: { type: DataTypes.STRING(80) },
  sistema: { type: DataTypes.STRING(60) },
  nivel_corte: { type: DataTypes.CHAR(1) },
  apto_para_corte: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  hay_errores: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  cantidad_piezas: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  subtotal_con_aiu: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
  iva: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
  total: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
}, {
  sequelize,
  modelName: 'CotizadorCotizacionItem',
  tableName: 'cotizador_cotizacion_item',
  timestamps: false,
  indexes: [
    { fields: ['cotizacion_id', 'orden'], unique: true },
    { fields: ['cotizacion_id'] },
    { fields: ['diseno_id'] },
  ],
});

export default CotizadorCotizacionItem;

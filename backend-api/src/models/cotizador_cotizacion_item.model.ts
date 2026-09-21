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
  // El ítem cuelga de una PROPUESTA (A/B/C…) desde el 2026-09-20; `cotizacion_id`
  // se conserva denormalizado para no romper las consultas ni los índices que ya
  // existían. NOT NULL en BD: lo puso el script
  // 2026-09-20_cotizador_propuestas_y_cargos.ts tras colgar los 5 ítems
  // existentes de la propuesta 'A' de su cotización.
  propuesta_id: { type: DataTypes.INTEGER, allowNull: false },
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
  tableName: 'cotizacion_item',
  schema: 'cotizador',
  timestamps: false,
  // El UNIQUE de `orden` es por PROPUESTA, no por cotización (2026-09-20).
  // Antes era `(cotizacion_id, orden)`, y con propuestas eso rompía el clonado:
  // los ítems de la propuesta B empiezan otra vez en orden 0 y chocaban con los
  // de la A, que están en la misma cotización. El síntoma era un 500 con
  // "Validation error" al duplicar una propuesta.
  //
  // Los índices no se declaran aquí: los crea el script de migración
  // (`ux_cotizador_cotizacion_item_propuesta_orden` y compañía). Declararlos en
  // el modelo hacía que `sync()` creara en cada arranque una copia de cada uno
  // con el nombre que inventa Sequelize — así aparecieron los tres
  // `cotizacion_item_*` sin prefijo que hubo que borrar a mano.
});

export default CotizadorCotizacionItem;

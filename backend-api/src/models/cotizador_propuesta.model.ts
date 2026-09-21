import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

// Una cotización es un contenedor de PROPUESTAS (A/B/C…): el mismo cliente y la
// misma obra, cotizados de varias maneras (todo templado vs. 5 mm, con película
// vs. sin ella). Antes no existía forma de cotizar variantes: meterlas al
// carrito las SUMABA, como si el cliente comprara las dos.
//
// El total de la cotización es el de la propuesta ELEGIDA, y de ella —solo de
// ella— sale la orden de corte.
//
// Los cargos de obra (SMO, andamio, huacal, flete) cuelgan de aquí y no del
// ítem: un flete se cobra una vez por propuesta, no una vez por pieza. Ese era
// el bug que originó todo esto (5 piezas cobraban 5 fletes).
//
// El script 2026-09-20_cotizador_propuestas_y_cargos.ts agrega, además de esta
// definición Sequelize, el índice único PARCIAL que Sequelize no puede declarar:
//   CREATE UNIQUE INDEX ux_cotizador_propuesta_elegida ON cotizador.propuesta
//     (cotizacion_id) WHERE elegida;
// Es lo que hace que "solo una elegida" sea una regla de Postgres y no una
// promesa del código. Consecuencia: elegir otra propuesta es desmarcar-y-marcar
// dentro de una transacción, porque a mitad de camino habría dos.
//
// `legado_cargos_en_items` marca las 4 cotizaciones anteriores a este cambio:
// su SMO y su flete viven dentro del blob `resultado` de cada ítem, que es una
// foto inmutable que no se reescribe nunca (ver aptitudOrden.ts, "el artefacto
// del blob"). Con el flag en true sus totales se calculan como siempre —sumando
// los ítems— y ni el descuento ni los cargos de la propuesta intervienen;
// crearles cargos habría cobrado dos veces lo mismo.
//
// Los totales son ESPEJO denormalizado, escritos por el controlador: el listado
// y el comparador de propuestas los leen sin tocar los JSONB de los ítems, que
// son lo caro en egress.
class CotizadorPropuesta extends Model {}

CotizadorPropuesta.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  cotizacion_id: { type: DataTypes.INTEGER, allowNull: false },
  // 'A'…'E' — la asigna el backend (primera libre), nunca el cliente. Máximo 5.
  etiqueta: { type: DataTypes.STRING(2), allowNull: false },
  nombre: { type: DataTypes.STRING(80) }, // libre: "Todo templado", "Económica"
  nota: { type: DataTypes.TEXT },
  elegida: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  // Fracción 0–1, NO porcentaje. Es el único descuento del módulo desde
  // 2026-09-20: reemplaza al de la cabecera (`cotizacion.descuento_pct`, que no
  // afectaba a ningún total) y al del formulario por ítem.
  descuento_pct: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
  legado_cargos_en_items: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  // Espejos denormalizados. total_productos = Σ subtotalConAiu SIN descuento;
  // total_cargos = base de cargos sin IVA; total_iva = IVA de productos + IVA de
  // cargos (un cargo con aplica_iva=false no aporta).
  total_productos: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
  total_descuento: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
  total_cargos: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
  total_iva: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
  total_total: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
  creada_en: { type: DataTypes.DATE, allowNull: false },
  actualizada_en: { type: DataTypes.DATE, allowNull: false },
}, {
  sequelize,
  modelName: 'CotizadorPropuesta',
  tableName: 'propuesta',
  schema: 'cotizador',
  timestamps: false,
  // Sin `indexes`: los crea el script de migración con nombre propio
  // (`ux_cotizador_propuesta_etiqueta`, `ix_cotizador_propuesta_cotizacion` y
  // el único parcial `ux_cotizador_propuesta_elegida`, que Sequelize ni
  // siquiera sabe declarar). Tenerlos aquí hacía que `sync()` creara en cada
  // arranque una segunda copia de los dos primeros con el nombre que inventa
  // Sequelize — verificado el 2026-09-20.
});

export default CotizadorPropuesta;

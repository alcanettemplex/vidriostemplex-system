import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

// Los cargos de obra de una propuesta: mano de obra (SMO), alquiler de andamio,
// huacal, flete y cualquier servicio suelto (OTRO).
//
// Viven aquí y no dentro del BOM de cada ítem —que es donde estaban hasta el
// 2026-09-20— porque `totalizar()` multiplica cada línea del BOM por
// `cantidadPiezas`: una ventana de 5 piezas cobraba 5 fletes y 5 manos de obra,
// y una cotización de 3 productos, 3 fletes más. Un cargo es de la propuesta:
// se cobra UNA vez, por eso es una tabla hermana de los ítems y no una línea
// suya.
//
// En la cadena de totales los cargos van FUERA del AIU y FUERA del descuento,
// pero CON IVA (salvo que la línea diga aplica_iva = false). Son las dos únicas
// reglas que hay que recordar al tocarlos.
//
// `tipo` usa el ENUM public.enum_cotizador_cargo_tipo, creado por el script
// 2026-09-20_cotizador_propuestas_y_cargos.ts. Los ENUM del Cotizador viven en
// `public` aunque sus tablas estén en `cotizador`: el pooler de Supabase en modo
// transacción no propaga `search_path` y `public` siempre resuelve.
class CotizadorPropuestaCargo extends Model {}

CotizadorPropuestaCargo.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  propuesta_id: { type: DataTypes.INTEGER, allowNull: false },
  orden: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  // STRING y no DataTypes.ENUM, aunque en Postgres la columna SÍ es un ENUM.
  //
  // Sequelize nombra los tipos que crea como `enum_<tabla>_<columna>` y los crea
  // en el schema del modelo: al arrancar `server.ts` con `sync()` generaba
  // `cotizador.enum_propuesta_cargo_tipo`, un tipo huérfano y duplicado, porque
  // el real es `public.enum_cotizador_cargo_tipo` (los ENUM del Cotizador viven
  // en `public` a propósito: el pooler de Supabase en modo transacción no
  // propaga `search_path`). Verificado el 2026-09-20: la basura aparecía en cada
  // arranque, también en producción.
  //
  // Declarándola STRING, Sequelize no crea ningún tipo y quien valida de verdad
  // sigue siendo Postgres, que rechaza cualquier valor fuera del ENUM. El
  // `isIn` de aquí solo adelanta el error con un mensaje legible.
  tipo: {
    type: DataTypes.STRING(10),
    allowNull: false,
    validate: {
      isIn: {
        args: [['SMO', 'ANDAMIO', 'HUACAL', 'FLETE', 'OTRO']],
        msg: 'El tipo de cargo debe ser SMO, ANDAMIO, HUACAL, FLETE u OTRO.',
      },
    },
  },
  // Para OTRO es el texto del servicio; para SMO, el tipo de obra elegido
  // ("Armada de ventanas"), que es lo que el vendedor le lee al cliente.
  descripcion: { type: DataTypes.STRING(200) },
  // Días (andamio), unidades (huacal), 1 en el resto. Es double y no integer
  // porque medio día de andamio es un caso real.
  cantidad: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 1 },
  unidad: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'GLOBAL' }, // DIA | UND | GLOBAL
  valor_unitario: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
  // cantidad × valor_unitario redondeado a 2. Se guarda calculado en vez de
  // derivarse al leer: es el importe que se le mostró al cliente, y el módulo
  // trata lo cotizado como artefacto, no como fórmula viva.
  total: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
  aplica_iva: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  // SUGERIDO = el monto que propuso el sistema; MANUAL = el vendedor lo
  // sobrescribió. Sirve para saber, al revisar una cotización, si el precio de
  // la mano de obra salió de la tarifa o de una decisión comercial.
  origen: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'MANUAL' },
}, {
  sequelize,
  modelName: 'CotizadorPropuestaCargo',
  tableName: 'propuesta_cargo',
  schema: 'cotizador',
  timestamps: false,
  // Sin `indexes`: los crea el script de migración con nombre propio
  // (`ix_cotizador_propuesta_cargo_propuesta`). Declararlos aquí hacía que
  // `sync()` creara un SEGUNDO índice idéntico con el nombre que inventa
  // Sequelize, en cada arranque. Ver el mismo comentario en
  // `cotizador_propuesta.model.ts`.
});

export default CotizadorPropuestaCargo;

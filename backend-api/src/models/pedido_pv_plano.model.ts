import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

// Plano de detalle técnico (FOR-005) de una letra DT de un Pedido PV (2026-10-16).
// Cuelga del pedido PRINCIPAL (`sufijo IS NULL`): las extensiones -1, -2 se borran y
// se recrean en cada `asignarItems`, así que colgarlo de ellas perdería los planos.
// Un plano por letra: los ítems con la misma letra comparten el dibujo (acota los
// herrajes) y cada uno lleva su ancho × alto en la fila del formulario del proveedor.
class PedidoPVPlano extends Model {}

PedidoPVPlano.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  pedido_pv_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'pedido_pv', key: 'id' },
    onDelete: 'CASCADE',
  },
  /** Letra DT normalizada (mayúscula, sin espacios): la misma que `odp_items.dt`. */
  letra: { type: DataTypes.STRING(10), allowNull: false },
  plantilla_id: { type: DataTypes.STRING(60), allowNull: true },
  nombre: { type: DataTypes.STRING(150), allowNull: false },
  sello_en_canto: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  observaciones: { type: DataTypes.TEXT, allowNull: true },
  /** El dibujo (`Pieza` de frontend-web/src/features/detalles-tecnicos/modelo/tipos.ts). */
  pieza: { type: DataTypes.JSONB, allowNull: false },
  /** Versión del formato de `pieza`: permite migrar planos guardados si el modelo cambia. */
  esquema: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  /** PERF, BOQ, DSP, radios, chaflán y m², calculados en el navegador al guardar: así el
   *  servidor arma el Excel sin duplicar la geometría. */
  conteos: { type: DataTypes.JSONB, allowNull: false },
  imagen_url: { type: DataTypes.STRING(500), allowNull: true },
  imagen_public_id: { type: DataTypes.STRING(255), allowNull: true },
  /** Tamaño lógico (px) con que la imagen se ubica en la hoja «PLANO X». */
  imagen_ancho: { type: DataTypes.INTEGER, allowNull: true },
  imagen_alto: { type: DataTypes.INTEGER, allowNull: true },
  creado_por: { type: DataTypes.INTEGER, allowNull: true },
  creado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  actualizado_por: { type: DataTypes.INTEGER, allowNull: true },
  /** También sirve de control de concurrencia: guardar sobre una versión vieja da 409. */
  actualizado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  sequelize,
  modelName: 'PedidoPVPlano',
  tableName: 'pedido_pv_plano',
  timestamps: false,
  indexes: [{ unique: true, fields: ['pedido_pv_id', 'letra'] }],
});

export default PedidoPVPlano;

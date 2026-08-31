import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

/**
 * FacturaProveedorProcesada — registro de idempotencia de la ingesta de FE.
 *
 * El CUFE es el identificador único de la factura electrónica colombiana. Antes el
 * control de duplicados se intentaba resolver buscando el CUFE dentro de
 * `proveedor_producto_precio.documento_ref`, pero ahí se guardaba truncado a 12
 * caracteres: la comparación nunca coincidía y recargar el mismo .zip reprocesaba
 * todo. Peor, una factura cuyas líneas fueran todas códigos nuevos no dejaba
 * ningún rastro, así que era reprocesable siempre.
 *
 * Esta tabla es el rastro: una fila por documento, con UNIQUE sobre el CUFE.
 * Cumple además el papel de bitácora de la ingesta (compras.md §5.4, la postura
 * de "no guardar el .zip y conservar solo el CUFE + los datos extraídos").
 */
class FacturaProveedorProcesada extends Model {}

FacturaProveedorProcesada.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },

  // CUFE completo (96 caracteres en DIAN). UNIQUE = la garantía de idempotencia.
  cufe: { type: DataTypes.STRING(120), allowNull: false, unique: true },

  proveedor_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'proveedores', key: 'id' },
  },

  numero_factura: { type: DataTypes.STRING(60), allowNull: true },
  fecha_emision: { type: DataTypes.DATEONLY, allowNull: true },

  tipo_documento: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'FACTURA',
    // Valores: FACTURA | NOTA_CREDITO | NOTA_DEBITO
  },

  moneda: { type: DataTypes.STRING(10), allowNull: true, defaultValue: 'COP' },

  // Resultado del procesamiento — permite auditar qué hizo cada carga sin releer el XML
  lineas_totales: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  lineas_actualizadas: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  lineas_pendientes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  lineas_omitidas: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },

  // Motivo cuando el documento se registra pero no mueve precios
  // (NOTA_CREDITO, PROVEEDOR_NO_SEGUIDO, MONEDA_EXTRANJERA)
  motivo_omision: { type: DataTypes.STRING(40), allowNull: true },

  archivo_origen: { type: DataTypes.STRING(255), allowNull: true },

  procesado_por: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'usuarios', key: 'id' },
  },

  fecha_procesado: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, {
  sequelize,
  modelName: 'FacturaProveedorProcesada',
  tableName: 'factura_proveedor_procesada',
  timestamps: false,
  indexes: [
    { unique: true, fields: ['cufe'], name: 'uq_factura_proveedor_cufe' },
    { fields: ['proveedor_id', 'fecha_emision'], name: 'idx_factura_proveedor_fecha' },
  ],
});

export default FacturaProveedorProcesada;

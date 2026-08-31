import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

/**
 * ProveedorCodigoPendiente — bandeja de códigos de proveedor sin mapear.
 *
 * Cuando el parser XML (Fase 2) encuentra un código de proveedor desconocido,
 * no lo descarta ni lo adivina: cae aquí. Un humano lo vincula una sola vez
 * y el sistema lo recuerda para siempre en ProveedorProducto.
 *
 * La UNIQUE (proveedor_id, codigo_proveedor) garantiza que si el mismo código
 * aparece en múltiples facturas, solo hay una fila en la bandeja con veces_visto
 * incrementando — no N filas duplicadas.
 */
class ProveedorCodigoPendiente extends Model {}

ProveedorCodigoPendiente.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },

  proveedor_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'proveedores', key: 'id' },
  },

  codigo_proveedor: { type: DataTypes.STRING(100), allowNull: false },
  descripcion_proveedor: { type: DataTypes.TEXT, allowNull: true },

  // Último precio detectado en facturas (referencia orientativa para el mapeo)
  precio_detectado: { type: DataTypes.DECIMAL(15, 2), allowNull: true },

  // Unidad leída del unitCode del XML. Solo se guarda cuando el código era informativo
  // (MTR, KGM, MTK…) y no el relleno genérico: así el mapeo se propone contra la
  // modalidad correcta en vez de dejar que el humano adivine.
  unidad_detectada: { type: DataTypes.STRING(20), allowNull: true },

  // Porcentaje de IVA que traía la línea en el XML (no siempre es 19)
  porcentaje_iva_detectado: { type: DataTypes.DECIMAL(5, 2), allowNull: true },

  // true si el XML no traía identificación de ítem y el código se derivó de la descripción
  codigo_derivado: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

  // CUFE u otra referencia del documento donde se detectó
  documento_ref: { type: DataTypes.STRING(100), allowNull: true },

  // Cuántas veces ha aparecido este código sin ser mapeado (ordena la bandeja)
  veces_visto: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },

  estado: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'PENDIENTE',
    // Valores: PENDIENTE | MAPEADO | DESCARTADO
  },

  fecha_deteccion: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, {
  sequelize,
  modelName: 'ProveedorCodigoPendiente',
  tableName: 'proveedor_codigo_pendiente',
  timestamps: false,
  indexes: [
    {
      unique: true,
      fields: ['proveedor_id', 'codigo_proveedor'],
      name: 'uq_proveedor_codigo',
    },
    {
      // Para ordenar la bandeja por frecuencia de aparición descendente
      fields: ['estado', 'veces_visto'],
      name: 'idx_codigo_pendiente_estado',
    },
  ],
});

export default ProveedorCodigoPendiente;

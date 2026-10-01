import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class Proveedor extends Model {}

Proveedor.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },

  // Identificación fiscal — NIT es la llave de match automático contra XML DIAN
  nit: { type: DataTypes.STRING(20), allowNull: true, unique: true },
  tipo_identificacion: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'NIT' },
  numero_identificacion: { type: DataTypes.STRING(30), allowNull: true },

  // Datos comerciales
  nombre_comercial: { type: DataTypes.STRING(255), allowNull: false },
  razon_social: { type: DataTypes.STRING(255), allowNull: true },

  // Contacto
  contacto_nombre: { type: DataTypes.STRING(150), allowNull: true },
  telefono: { type: DataTypes.STRING(30), allowNull: true },
  email: { type: DataTypes.STRING(150), allowNull: true },
  direccion: { type: DataTypes.TEXT, allowNull: true },

  // Metadatos
  notas: { type: DataTypes.TEXT, allowNull: true },
  activo: { type: DataTypes.BOOLEAN, defaultValue: true, allowNull: false },

  // Referencia cruzada con World Office (código interno del software contable)
  codigo_world_office: { type: DataTypes.STRING(50), allowNull: true },

  // Tri-estado (2026-09-04). En cualquier caso sus facturas se registran como procesadas.
  //   NULL  = sin decidir. Lo crea así la ingesta al ver un emisor por primera vez.
  //           Desde el 2026-09-12 NO bloquea: sus líneas sí entran a Por Mapear y el
  //           resumen del lote pide la decisión (`bloqueaIngesta()` en el controlador).
  //   true  = seguir precios.
  //   false = ignorado por decisión explícita: sus líneas no llenan la bandeja.
  // Dos lecturas distintas: `bloqueaIngesta()` gobierna la bandeja (solo corta con
  // false o inactivo) y `siguePrecios()` (utils/proveedorReglas.ts) gobierna los costos
  // derivados, como el Cotizador (exige true y activo).
  seguir_precios: { type: DataTypes.BOOLEAN, defaultValue: null, allowNull: true },

  // MANUAL | IMPORTACION_WO | INGESTA_FE — distingue el maestro curado de los
  // proveedores que la ingesta creó sola al no reconocer el NIT de una factura.
  origen_registro: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'MANUAL' },

  // Regla que reconoce los códigos inconsistentes de ESTE proveedor (2026-09-30):
  // GRUPO ROLDAN factura el mismo perfil como GRE175NG y como ALU175NG. Los valores
  // posibles y su lógica viven en `utils/proveedorReglasCodigo.ts` (lista cerrada,
  // nunca expresiones escritas a mano). NULL = sin regla, la ingesta de siempre.
  regla_codigo: { type: DataTypes.STRING(40), allowNull: true, defaultValue: null },
  // AUTO = vincula sola al cargar la factura · SUGERENCIA = solo propone en Por Mapear
  regla_codigo_modo: { type: DataTypes.STRING(12), allowNull: true, defaultValue: null },

  fecha_creacion: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, {
  sequelize,
  modelName: 'Proveedor',
  tableName: 'proveedores',
  timestamps: false,
});

export default Proveedor;

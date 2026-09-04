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

  // Tri-estado (2026-09-04). Decide si las facturas de este proveedor alimentan la
  // bandeja de mapeo; en cualquier caso se registran como procesadas.
  //   NULL  = sin decidir. Lo crea así la ingesta al ver un emisor por primera vez:
  //           sus líneas NO entran a la bandeja hasta que un humano lo apruebe. Con
  //           ~20 FE diarias, la mayoría de emisores nuevos son combustible, peajes o
  //           papelería, y dejarlos entrar "por si acaso" era el ruido dominante.
  //   true  = seguir precios.
  //   false = ignorado por decisión explícita.
  // La regla de lectura no es este campo suelto sino `siguePrecios()` en el
  // controlador: un proveedor inactivo tampoco alimenta la bandeja.
  seguir_precios: { type: DataTypes.BOOLEAN, defaultValue: null, allowNull: true },

  // MANUAL | IMPORTACION_WO | INGESTA_FE — distingue el maestro curado de los
  // proveedores que la ingesta creó sola al no reconocer el NIT de una factura.
  origen_registro: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'MANUAL' },

  fecha_creacion: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, {
  sequelize,
  modelName: 'Proveedor',
  tableName: 'proveedores',
  timestamps: false,
});

export default Proveedor;

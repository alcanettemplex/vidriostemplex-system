import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';
import Usuario from './usuario.model';

class Lead extends Model { }

Lead.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  telefono: { type: DataTypes.STRING(20), allowNull: false },
  nombre: { type: DataTypes.STRING(100), allowNull: false },
  mensaje_entrada: { type: DataTypes.TEXT, allowNull: true },
  segmento: { 
    type: DataTypes.ENUM('Arquitecto', 'Cliente final', 'Industrial', 'Institucional', 'Intervid'), 
    allowNull: true 
  },
  respondio: { 
    type: DataTypes.ENUM('Espera de información', 'No responde', 'Si'), 
    allowNull: true,
    defaultValue: 'Espera de información'
  },
  producto_interes: { 
    type: DataTypes.STRING(100), // Usamos STRING porque puede cambiar fácilmente o ser múltiple, aunque se maneje con menú en el front.
    allowNull: true 
  },
  descripcion_contexto: { type: DataTypes.TEXT, allowNull: true },
  estado_crm: { 
    type: DataTypes.ENUM('NUEVO', 'ASIGNADO', 'EN_CONTACTO', 'COTIZANDO', 'VISITA_TECNICA', 'FRIO', 'APROBADO', 'PERDIDO'), 
    allowNull: false, 
    defaultValue: 'NUEVO' 
  },
  intentos_seguimiento: { type: DataTypes.INTEGER, defaultValue: 0 },
  monto_proyectado_cotizacion: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0.00 },
  motivo_perdida: { type: DataTypes.STRING(100), allowNull: true },
  fecha_cierre: { type: DataTypes.DATE, allowNull: true },
  asesor_id: { 
    type: DataTypes.INTEGER, 
    allowNull: true,
    references: { model: Usuario, key: 'id' }
  },
  asistente_id: { 
    type: DataTypes.INTEGER, 
    allowNull: false,
    references: { model: Usuario, key: 'id' }
  },
  cliente_id: { 
    type: DataTypes.INTEGER,
    allowNull: true, // Se llena solo cuando se convierte a cliente
  },
}, {
  sequelize,
  modelName: 'Lead',
  tableName: 'leads',
  timestamps: true, // Agrega createdAt y updatedAt automáticamente
});

export default Lead;

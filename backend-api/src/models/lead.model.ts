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
  fuente_lead: { 
    type: DataTypes.ENUM('Web', 'Facebook', 'Instagram', 'WhatsApp', 'Llamada', 'Presencial', 'Show Room', 'Referidos', 'Visita Asesor', 'Cliente'),
    allowNull: true,
    defaultValue: 'Presencial'
  },
  respondio: { 
    type: DataTypes.ENUM('Espera de información', 'No responde', 'Si'), 
    allowNull: true,
    defaultValue: 'Espera de información'
  },
  producto_interes: { 
    type: DataTypes.STRING(100),
    allowNull: true 
  },
  descripcion_contexto: { type: DataTypes.TEXT, allowNull: true },
  estado_crm: { 
    type: DataTypes.ENUM('NUEVO', 'ASIGNADO', 'EN_CONTACTO', 'COTIZANDO', 'SEGUIMIENTO', 'VISITA_TECNICA', 'FRIO', 'APROBADO', 'PERDIDO'),
    allowNull: false, 
    defaultValue: 'NUEVO' 
  },
  intentos_seguimiento: { type: DataTypes.INTEGER, defaultValue: 0 },
  monto_proyectado_cotizacion: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0.00 },
  monto_real_venta: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0.00 },
  motivo_perdida: { type: DataTypes.STRING(100), allowNull: true },
  
  // Tiempos de transición (Cycle Time)
  fecha_asignado:      { type: DataTypes.DATE, allowNull: true },
  fecha_en_contacto:   { type: DataTypes.DATE, allowNull: true },
  fecha_cotizando:     { type: DataTypes.DATE, allowNull: true },
  fecha_seguimiento:   { type: DataTypes.DATE, allowNull: true },
  fecha_visita_tecnica:{ type: DataTypes.DATE, allowNull: true },
  fecha_frio:          { type: DataTypes.DATE, allowNull: true },
  fecha_aprobado:      { type: DataTypes.DATE, allowNull: true },
  fecha_perdido:       { type: DataTypes.DATE, allowNull: true },
  
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
  odp_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  cliente_es_nuevo: {
    type: DataTypes.BOOLEAN,
    allowNull: true, // null = no convertido aún; true = cliente nuevo; false = cliente existente
  },
  prospecto_id: {
    type: DataTypes.INTEGER,
    allowNull: true, // Se llena cuando se solicita visita técnica desde CRM
  },
}, {
  sequelize,
  modelName: 'Lead',
  tableName: 'leads',
  timestamps: true, // Agrega createdAt y updatedAt automáticamente
});

export default Lead;

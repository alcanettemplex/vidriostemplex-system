import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';
import Lead from './lead.model';
import Usuario from './usuario.model';

class LeadEvento extends Model { }

LeadEvento.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  tipo: {
    type: DataTypes.ENUM('CREACION', 'ASIGNACION', 'COMUNICACION', 'SEGUIMIENTO', 'PASE_A_FRIO', 'CAMBIO_ESTADO', 'CONVERSION'),
    allowNull: false
  },
  detalle_texto: { type: DataTypes.TEXT, allowNull: false },
  lead_id: { 
    type: DataTypes.INTEGER, 
    allowNull: false,
    references: { model: Lead, key: 'id' },
    onDelete: 'CASCADE'
  },
  creado_por: { 
    type: DataTypes.INTEGER, 
    allowNull: false,
    references: { model: Usuario, key: 'id' }
  },
}, {
  sequelize,
  modelName: 'LeadEvento',
  tableName: 'lead_eventos',
  timestamps: true, // Agrega createdAt y updatedAt
  updatedAt: false, // En eventos históricos rara vez editamos, basta con createdAt
});

export default LeadEvento;

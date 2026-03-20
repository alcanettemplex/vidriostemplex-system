import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class NoConformidad extends Model { }

NoConformidad.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  odp_id: { type: DataTypes.INTEGER, allowNull: false },
  numero_reporte: { type: DataTypes.STRING(20) },
  fecha: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  tipo_error: { 
    type: DataTypes.ENUM('ERROR_INTERNO', 'DANO_PLANTA', 'REPROCESO', 'QUEJA'),
    allowNull: false 
  },
  area_error: { type: DataTypes.STRING(100) },
  causa: { type: DataTypes.TEXT },
  responsable: { type: DataTypes.STRING(100) },
  efecto: { type: DataTypes.TEXT },
  
  // Producto que presenta el error
  producto_error_descripcion: { type: DataTypes.TEXT },
  producto_error_cantidad: { type: DataTypes.INTEGER },
  
  // Producto que soluciona el error
  producto_solucion_descripcion: { type: DataTypes.TEXT },
  producto_solucion_cantidad: { type: DataTypes.INTEGER },
  
  costo_total: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
  usuario_reporta_id: { type: DataTypes.INTEGER, allowNull: false },
  observaciones: { type: DataTypes.TEXT },
  
  vo_bo_responsable: { type: DataTypes.BOOLEAN, defaultValue: false },
  vo_bo_gerencia: { type: DataTypes.BOOLEAN, defaultValue: false },
  
  estado: { 
    type: DataTypes.ENUM('ABIERTO', 'EN_PROCESO', 'CERRADO'),
    defaultValue: 'ABIERTO'
  }
}, {
  sequelize,
  modelName: 'NoConformidad',
  tableName: 'no_conformidades',
  timestamps: true,
  createdAt: 'creado_en',
  updatedAt: 'actualizado_en'
});

export default NoConformidad;

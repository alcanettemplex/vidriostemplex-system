import sequelize from '../config/database';
import Usuario from './usuario.model';
import Cliente from './cliente.model';
import ODP from './odp.model';
import ODPItem from './odp_item.model';
import EvidenciaInstalacion from './evidencia_instalacion.model';
import Vehiculo from './vehiculo.model';
import ProgramacionInstalacion from './programacion_instalacion.model';
import HistorialEstadoODP from './historial_estado_odp.model';
import SAP from './sap.model';
import SAPItem from './sap_item.model';
import Cotizacion from './cotizacion.model';
import TomaMedidas from './toma_medidas.model';

// ─── Asociaciones ODP ────────────────────────────────────────────────────────
Cliente.hasMany(ODP, { foreignKey: 'cliente_id', as: 'odps' });
ODP.belongsTo(Cliente, { foreignKey: 'cliente_id', as: 'cliente' });

Usuario.hasMany(ODP, { foreignKey: 'asesor_id', as: 'odps_gestionadas' });
ODP.belongsTo(Usuario, { foreignKey: 'asesor_id', as: 'asesor' });

ODP.hasMany(ODPItem, { foreignKey: 'odp_id', as: 'items' });
ODPItem.belongsTo(ODP, { foreignKey: 'odp_id' });

ODP.hasMany(EvidenciaInstalacion, { foreignKey: 'odp_id', as: 'evidencias' });
EvidenciaInstalacion.belongsTo(ODP, { foreignKey: 'odp_id' });

Usuario.hasMany(EvidenciaInstalacion, { foreignKey: 'instalador_id', as: 'evidencias_subidas' });
EvidenciaInstalacion.belongsTo(Usuario, { foreignKey: 'instalador_id' });

ODP.hasMany(ProgramacionInstalacion, { foreignKey: 'odp_id', as: 'programaciones' });
ProgramacionInstalacion.belongsTo(ODP, { foreignKey: 'odp_id' });

Usuario.hasMany(ProgramacionInstalacion, { foreignKey: 'instalador_id' });
ProgramacionInstalacion.belongsTo(Usuario, { foreignKey: 'instalador_id', as: 'instalador' });

Vehiculo.hasMany(ProgramacionInstalacion, { foreignKey: 'vehiculo_id' });
ProgramacionInstalacion.belongsTo(Vehiculo, { foreignKey: 'vehiculo_id', as: 'vehiculo' });

ODP.hasMany(HistorialEstadoODP, { foreignKey: 'odp_id', as: 'historial_estados' });
HistorialEstadoODP.belongsTo(ODP, { foreignKey: 'odp_id' });

Usuario.hasMany(HistorialEstadoODP, { foreignKey: 'usuario_id' });
HistorialEstadoODP.belongsTo(Usuario, { foreignKey: 'usuario_id', as: 'usuario' });

// ─── Bloque B: SAP, Cotizacion, TomaMedidas ──────────────────────────────────
ODP.hasMany(SAP, { foreignKey: 'odp_id', as: 'saps' });
SAP.belongsTo(ODP, { foreignKey: 'odp_id' });

SAP.hasMany(SAPItem, { foreignKey: 'sap_id', as: 'items' });
SAPItem.belongsTo(SAP, { foreignKey: 'sap_id' });

Usuario.hasMany(SAP, { foreignKey: 'creado_por', as: 'saps_creadas' });
SAP.belongsTo(Usuario, { foreignKey: 'creado_por', as: 'asesor' });

ODP.hasMany(Cotizacion, { foreignKey: 'odp_id', as: 'cotizaciones' });
Cotizacion.belongsTo(ODP, { foreignKey: 'odp_id' });

Usuario.hasMany(Cotizacion, { foreignKey: 'creado_por', as: 'cotizaciones_creadas' });
Cotizacion.belongsTo(Usuario, { foreignKey: 'creado_por', as: 'asesor' });

ODP.hasMany(TomaMedidas, { foreignKey: 'odp_id', as: 'tomas_medidas' });
TomaMedidas.belongsTo(ODP, { foreignKey: 'odp_id' });

Usuario.hasMany(TomaMedidas, { foreignKey: 'realizado_por', as: 'tomas_realizadas' });
TomaMedidas.belongsTo(Usuario, { foreignKey: 'realizado_por', as: 'realizador' });

export {
  sequelize,
  Usuario,
  Cliente,
  ODP,
  ODPItem,
  EvidenciaInstalacion,
  Vehiculo,
  ProgramacionInstalacion,
  HistorialEstadoODP,
  SAP,
  SAPItem,
  Cotizacion,
  TomaMedidas,
};

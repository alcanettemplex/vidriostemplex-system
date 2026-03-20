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
import OrdenCompra from './orden_compra.model';
import Pago from './pago.model';

import NoConformidad from './no_conformidad.model';

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
EvidenciaInstalacion.belongsTo(Usuario, { foreignKey: 'instalador_id', as: 'instalador' });

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

// ─── No Conformidades ────────────────────────────────────────────────────────
ODP.hasMany(NoConformidad, { foreignKey: 'odp_id', as: 'no_conformidades' });
NoConformidad.belongsTo(ODP, { foreignKey: 'odp_id', as: 'odp' });

Usuario.hasMany(NoConformidad, { foreignKey: 'usuario_reporta_id', as: 'reportes_no_conformidad' });
NoConformidad.belongsTo(Usuario, { foreignKey: 'usuario_reporta_id', as: 'usuario_reporta' });

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

// ─── Bloque C: Compras y Pagos ───────────────────────────────────────────────
ODP.hasMany(OrdenCompra, { foreignKey: 'odp_id', as: 'compras' });
OrdenCompra.belongsTo(ODP, { foreignKey: 'odp_id', as: 'odp' });

Usuario.hasMany(OrdenCompra, { foreignKey: 'creado_por', as: 'compras_creadas' });
OrdenCompra.belongsTo(Usuario, { foreignKey: 'creado_por', as: 'creador' });

ODP.hasMany(Pago, { foreignKey: 'odp_id', as: 'pagos' });
Pago.belongsTo(ODP, { foreignKey: 'odp_id', as: 'odp' });

Usuario.hasMany(Pago, { foreignKey: 'registrado_por', as: 'pagos_registrados' });
Pago.belongsTo(Usuario, { foreignKey: 'registrado_por', as: 'registrador' });

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
  NoConformidad,
  SAP,
  SAPItem,
  Cotizacion,
  TomaMedidas,
  OrdenCompra,
  Pago,
};


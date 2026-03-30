import sequelize from '../config/database';
import Usuario from './usuario.model';
import Cliente from './cliente.model';
import ODP from './odp.model';
import ODPItem from './odp_item.model';
import EvidenciaInstalacion from './evidencia_instalacion.model';
import Vehiculo from './vehiculo.model';
import HistorialEstadoODP from './historial_estado_odp.model';
import SAP from './sap.model';
import SAPItem from './sap_item.model';
import Cotizacion from './cotizacion.model';
import TomaMedidas from './toma_medidas.model';
import OrdenCompra from './orden_compra.model';
import ODCItem from './odc_item.model';
import Pago from './pago.model';
import RutaInstalacion from './ruta_instalacion.model';
import RutaODP from './ruta_odp.model';

import NoConformidad from './no_conformidad.model';
import ConfiguracionGlobal from './configuracion.model';
import MetaMensual from './meta_mensual.model';
import NotaProduccion from './nota_produccion.model';
import CatalogoProducto from './catalogo_producto.model';
import Prospecto from './prospecto.model';
import InventarioPerfileria from './inventario_perfileria.model';

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

ODP.hasMany(HistorialEstadoODP, { foreignKey: 'odp_id', as: 'historial_estados' });
HistorialEstadoODP.belongsTo(ODP, { foreignKey: 'odp_id' });

Usuario.hasMany(HistorialEstadoODP, { foreignKey: 'usuario_id' });
HistorialEstadoODP.belongsTo(Usuario, { foreignKey: 'usuario_id', as: 'usuario' });

// ─── Notas de Producción ───────────────────────────────────────────────────
ODP.hasMany(NotaProduccion, { foreignKey: 'odp_id', as: 'notas_produccion' });
NotaProduccion.belongsTo(ODP, { foreignKey: 'odp_id' });

Usuario.hasMany(NotaProduccion, { foreignKey: 'usuario_id', as: 'notas_enviadas' });
NotaProduccion.belongsTo(Usuario, { foreignKey: 'usuario_id', as: 'usuario' });

// ─── No Conformidades ────────────────────────────────────────────────────────
ODP.hasMany(NoConformidad, { foreignKey: 'odp_id', as: 'no_conformidades' });
NoConformidad.belongsTo(ODP, { foreignKey: 'odp_id', as: 'odp' });

ODP.hasOne(NoConformidad, { foreignKey: 'nueva_odp_id', as: 'no_conformidad_origen' });
NoConformidad.belongsTo(ODP, { foreignKey: 'nueva_odp_id', as: 'nueva_odp' });

Usuario.hasMany(NoConformidad, { foreignKey: 'usuario_reporta_id', as: 'reportes_no_conformidad' });
NoConformidad.belongsTo(Usuario, { foreignKey: 'usuario_reporta_id', as: 'usuario_reporta' });

ODP.hasMany(ODP, { foreignKey: 'odp_padre_id', as: 'odps_derivadas' });
ODP.belongsTo(ODP, { foreignKey: 'odp_padre_id', as: 'odp_padre' });

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
TomaMedidas.belongsTo(ODP, { foreignKey: 'odp_id', as: 'odp' });

Usuario.hasMany(TomaMedidas, { foreignKey: 'realizado_por', as: 'tomas_realizadas' });
TomaMedidas.belongsTo(Usuario, { foreignKey: 'realizado_por', as: 'realizador' });

// ─── Bloque D: Prospectos ────────────────────────────────────────────────────
Usuario.hasMany(Prospecto, { foreignKey: 'asesor_id', as: 'prospectos_gestionados' });
Prospecto.belongsTo(Usuario, { foreignKey: 'asesor_id', as: 'asesor' });

Cliente.hasMany(Prospecto, { foreignKey: 'cliente_id', as: 'prospectos' });
Prospecto.belongsTo(Cliente, { foreignKey: 'cliente_id', as: 'cliente' });

Prospecto.belongsTo(ODP, { foreignKey: 'odp_id', as: 'odp' });
ODP.hasOne(Prospecto, { foreignKey: 'odp_id', as: 'prospecto' });

Prospecto.hasMany(TomaMedidas, { foreignKey: 'prospecto_id', as: 'tomas_medidas' });
TomaMedidas.belongsTo(Prospecto, { foreignKey: 'prospecto_id', as: 'prospecto' });

// ─── Bloque E: Rutas de Instalación ─────────────────────────────────────────
RutaInstalacion.belongsTo(Vehiculo, { foreignKey: 'vehiculo_id', as: 'vehiculo' });
RutaInstalacion.belongsTo(Usuario, { foreignKey: 'conductor_id', as: 'conductor' });
RutaInstalacion.belongsTo(Usuario, { foreignKey: 'creado_por', as: 'creador' });

RutaInstalacion.belongsToMany(Usuario, {
  through: 'ruta_instaladores',
  foreignKey: 'ruta_id',
  otherKey: 'instalador_id',
  as: 'instaladores',
});
Usuario.belongsToMany(RutaInstalacion, {
  through: 'ruta_instaladores',
  foreignKey: 'instalador_id',
  otherKey: 'ruta_id',
  as: 'rutas_asignadas',
});

RutaInstalacion.hasMany(RutaODP, { foreignKey: 'ruta_id', as: 'ruta_odps' });
RutaODP.belongsTo(RutaInstalacion, { foreignKey: 'ruta_id', as: 'ruta' });

ODP.hasMany(RutaODP, { foreignKey: 'odp_id', as: 'ruta_odps' });
RutaODP.belongsTo(ODP, { foreignKey: 'odp_id', as: 'odp' });

// ─── Bloque C: Compras y Pagos ───────────────────────────────────────────────
ODP.hasMany(OrdenCompra, { foreignKey: 'odp_id', as: 'compras' });
OrdenCompra.belongsTo(ODP, { foreignKey: 'odp_id', as: 'odp' });

SAP.hasMany(OrdenCompra, { foreignKey: 'sap_id', as: 'ordenes_compra' });
OrdenCompra.belongsTo(SAP, { foreignKey: 'sap_id', as: 'sap' });

Usuario.hasMany(OrdenCompra, { foreignKey: 'creado_por', as: 'compras_creadas' });
OrdenCompra.belongsTo(Usuario, { foreignKey: 'creado_por', as: 'creador' });

OrdenCompra.hasMany(ODCItem, { foreignKey: 'odc_id', as: 'items' });
ODCItem.belongsTo(OrdenCompra, { foreignKey: 'odc_id' });

SAPItem.hasMany(ODCItem, { foreignKey: 'sap_item_id', as: 'odc_items' });
ODCItem.belongsTo(SAPItem, { foreignKey: 'sap_item_id', as: 'sap_item' });

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
  HistorialEstadoODP,
  NoConformidad,
  SAP,
  SAPItem,
  Cotizacion,
  TomaMedidas,
  OrdenCompra,
  ODCItem,
  Pago,
  ConfiguracionGlobal,
  MetaMensual,
  NotaProduccion,
  CatalogoProducto,
  Prospecto,
  InventarioPerfileria,
  RutaInstalacion,
  RutaODP,
};


import sequelize from '../config/database';
import AuditoriaLog from './auditoria_log.model';
import AlertasUmbral from './alertas_umbral.model';
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
import CotizacionItem from './cotizacion_item.model';
import TomaMedidas from './toma_medidas.model';
import OrdenCompra from './orden_compra.model';
import ODCItem from './odc_item.model';
import Pago from './pago.model';
import RutaInstalacion from './ruta_instalacion.model';
import RutaODP from './ruta_odp.model';
import AgendaInstalacion from './agenda_instalacion.model';

import NoConformidad from './no_conformidad.model';
import ConfiguracionGlobal from './configuracion.model';
import MetaMensual from './meta_mensual.model';
import NotaProduccion from './nota_produccion.model';
import CatalogoProducto from './catalogo_producto.model';
import Prospecto from './prospecto.model';
import InventarioPerfileria from './inventario_perfileria.model';
import PedidoPV from './pedido_pv.model';
import SalidaAlmacen from './salida_almacen.model';
import CotizacionCaptura from './cotizacion_captura.model';
import DetalleSAPImagen from './detalle_sap_imagen.model';
import Lead from './lead.model';
import LeadEvento from './lead_evento.model';
import LeadImagen from './lead_imagen.model';
import MetaUsuarioMensual from './meta_usuario_mensual.model';
import FacturaAdicionalODP from './factura_adicional_odp.model';
import SupervisionLineamiento from './supervision_lineamiento.model';
import SupervisionLineamientoItem from './supervision_lineamiento_item.model';

// ─── Asociaciones ODP ────────────────────────────────────────────────────────
Cliente.hasMany(ODP, { foreignKey: 'cliente_id', as: 'odps' });
ODP.belongsTo(Cliente, { foreignKey: 'cliente_id', as: 'cliente' });

Usuario.hasMany(ODP, { foreignKey: 'asesor_id', as: 'odps_gestionadas' });
ODP.belongsTo(Usuario, { foreignKey: 'asesor_id', as: 'asesor' });

// Cliente creado_por
Usuario.hasMany(Cliente, { foreignKey: 'creado_por', as: 'clientes_creados' });
Cliente.belongsTo(Usuario, { foreignKey: 'creado_por', as: 'creador' });

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
ODP.hasMany(ODP, { foreignKey: 'odp_padre_id', as: 'garantias', scope: { es_garantia: true } });
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

// Cotizacion pre-ODP: items, cliente directo y prospecto
Cotizacion.hasMany(CotizacionItem, { foreignKey: 'cotizacion_id', as: 'items' });
CotizacionItem.belongsTo(Cotizacion, { foreignKey: 'cotizacion_id' });

Cotizacion.belongsTo(Cliente, { foreignKey: 'cliente_id', as: 'cliente' });
Cliente.hasMany(Cotizacion, { foreignKey: 'cliente_id', as: 'cotizaciones_directas' });

Cotizacion.belongsTo(Prospecto, { foreignKey: 'prospecto_id', as: 'prospecto' });
Prospecto.hasMany(Cotizacion, { foreignKey: 'prospecto_id', as: 'cotizaciones' });

ODP.hasMany(TomaMedidas, { foreignKey: 'odp_id', as: 'tomas_medidas' });
TomaMedidas.belongsTo(ODP, { foreignKey: 'odp_id', as: 'odp' });

Usuario.hasMany(TomaMedidas, { foreignKey: 'realizado_por', as: 'tomas_realizadas' });
TomaMedidas.belongsTo(Usuario, { foreignKey: 'realizado_por', as: 'realizador' });

// ─── Bloque CRM: Leads y Eventos ────────────────────────────────────────────
Usuario.hasMany(Lead, { foreignKey: 'asesor_id', as: 'leads_asignados' });
Lead.belongsTo(Usuario, { foreignKey: 'asesor_id', as: 'asesor' });

Usuario.hasMany(Lead, { foreignKey: 'asistente_id', as: 'leads_capturados' });
Lead.belongsTo(Usuario, { foreignKey: 'asistente_id', as: 'captador' });

Lead.hasMany(LeadEvento, { foreignKey: 'lead_id', as: 'eventos' });
LeadEvento.belongsTo(Lead, { foreignKey: 'lead_id', as: 'lead' });

Usuario.hasMany(LeadEvento, { foreignKey: 'creado_por', as: 'eventos_crm_rutas' });
LeadEvento.belongsTo(Usuario, { foreignKey: 'creado_por', as: 'creador' });

// Lead → ODP (vínculo de cierre)
Lead.belongsTo(ODP, { foreignKey: 'odp_id', as: 'odp' });
ODP.hasMany(Lead, { foreignKey: 'odp_id', as: 'leads_origen' });

// Lead → Prospecto (vínculo de visita técnica desde CRM)
Lead.belongsTo(Prospecto, { foreignKey: 'prospecto_id', as: 'prospecto_visita' });
Prospecto.hasMany(Lead, { foreignKey: 'prospecto_id', as: 'leads_origen_crm' });

// Lead → Imágenes
Lead.hasMany(LeadImagen, { foreignKey: 'lead_id', as: 'imagenes' });
LeadImagen.belongsTo(Lead, { foreignKey: 'lead_id', as: 'lead' });
Usuario.hasMany(LeadImagen, { foreignKey: 'subido_por', as: 'lead_imagenes_subidas' });
LeadImagen.belongsTo(Usuario, { foreignKey: 'subido_por', as: 'subidor' });

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
RutaInstalacion.belongsTo(Usuario, { foreignKey: 'oficial_id', as: 'oficial' });

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

// ─── Agenda tentativa de instalaciones (planeación previa a la ruta) ─────────
// 1 ODP = 1 día (odp_id UNIQUE). No se audita: planeación volátil.
ODP.hasOne(AgendaInstalacion, { foreignKey: 'odp_id', as: 'agenda' });
AgendaInstalacion.belongsTo(ODP, { foreignKey: 'odp_id', as: 'odp' });
Usuario.hasMany(AgendaInstalacion, { foreignKey: 'creado_por', as: 'agendas_creadas' });
AgendaInstalacion.belongsTo(Usuario, { foreignKey: 'creado_por', as: 'creador' });

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

ODPItem.hasMany(ODCItem, { foreignKey: 'odp_item_id', as: 'odc_items_vidrio' });
ODCItem.belongsTo(ODPItem, { foreignKey: 'odp_item_id', as: 'odp_item' });

ODP.hasMany(ODCItem, { foreignKey: 'odp_id', as: 'odc_items_directos' });
ODCItem.belongsTo(ODP, { foreignKey: 'odp_id', as: 'odp_directo' });

ODP.hasMany(Pago, { foreignKey: 'odp_id', as: 'pagos' });
Pago.belongsTo(ODP, { foreignKey: 'odp_id', as: 'odp' });

Usuario.hasMany(Pago, { foreignKey: 'registrado_por', as: 'pagos_registrados' });
Pago.belongsTo(Usuario, { foreignKey: 'registrado_por', as: 'registrador' });

// ─── Facturas electrónicas adicionales (2ª y 3ª FE de una ODP) ───────────────
ODP.hasMany(FacturaAdicionalODP, { foreignKey: 'odp_id', as: 'facturas_adicionales' });
FacturaAdicionalODP.belongsTo(ODP, { foreignKey: 'odp_id', as: 'odp' });
Usuario.hasMany(FacturaAdicionalODP, { foreignKey: 'creado_por', as: 'facturas_adicionales_creadas' });
FacturaAdicionalODP.belongsTo(Usuario, { foreignKey: 'creado_por', as: 'creador' });

// ─── Bloque F: Pedidos PV ────────────────────────────────────────────────────
ODP.hasMany(PedidoPV, { foreignKey: 'odp_id', as: 'pedidos_pv' });
PedidoPV.belongsTo(ODP, { foreignKey: 'odp_id', as: 'odp' });

Usuario.hasMany(PedidoPV, { foreignKey: 'creado_por', as: 'pedidos_pv_creados' });
PedidoPV.belongsTo(Usuario, { foreignKey: 'creado_por', as: 'creador' });

Usuario.hasMany(PedidoPV, { foreignKey: 'verificado_por', as: 'pedidos_pv_verificados' });
PedidoPV.belongsTo(Usuario, { foreignKey: 'verificado_por', as: 'verificador' });

PedidoPV.hasMany(ODPItem, { foreignKey: 'pedido_pv_id', as: 'items_asignados' });
ODPItem.belongsTo(PedidoPV, { foreignKey: 'pedido_pv_id', as: 'pedidoPV' });

// ─── Bloque H: Capturas de Cotización ───────────────────────────────────────
ODP.hasMany(CotizacionCaptura, { foreignKey: 'odp_id', as: 'cotizacion_capturas' });
CotizacionCaptura.belongsTo(ODP, { foreignKey: 'odp_id' });

Prospecto.hasMany(CotizacionCaptura, { foreignKey: 'prospecto_id', as: 'cotizacion_capturas' });
CotizacionCaptura.belongsTo(Prospecto, { foreignKey: 'prospecto_id' });

Usuario.hasMany(CotizacionCaptura, { foreignKey: 'subido_por', as: 'capturas_subidas' });
CotizacionCaptura.belongsTo(Usuario, { foreignKey: 'subido_por', as: 'subidor' });

// ─── Bloque I: Detalle SAP Imágenes ─────────────────────────────────────────
ODP.hasMany(DetalleSAPImagen, { foreignKey: 'odp_id', as: 'detalle_sap_imagenes' });
DetalleSAPImagen.belongsTo(ODP, { foreignKey: 'odp_id' });
Usuario.hasMany(DetalleSAPImagen, { foreignKey: 'subido_por', as: 'detalle_sap_subidas' });
DetalleSAPImagen.belongsTo(Usuario, { foreignKey: 'subido_por', as: 'subidor' });

// ─── Bloque G: Salidas de Almacén ────────────────────────────────────────────
ODP.hasOne(SalidaAlmacen, { foreignKey: 'odp_id', as: 'salida_almacen' });
SalidaAlmacen.belongsTo(ODP, { foreignKey: 'odp_id', as: 'odp' });

Usuario.hasMany(SalidaAlmacen, { foreignKey: 'creado_por', as: 'salidas_creadas' });
SalidaAlmacen.belongsTo(Usuario, { foreignKey: 'creado_por', as: 'creador' });

// ─── Bloque I: Inventario Perfilería ─────────────────────────────────────────
InventarioPerfileria.belongsTo(CatalogoProducto, { foreignKey: 'codigo', targetKey: 'codigo', as: 'catalogo' });
CatalogoProducto.hasMany(InventarioPerfileria, { foreignKey: 'codigo', sourceKey: 'codigo', as: 'piezas' });

// ─── Bloque J: Supervisión CRM — Lineamientos diarios y sesiones de coaching ─
Usuario.hasMany(SupervisionLineamiento, { foreignKey: 'asesor_id', as: 'lineamientos_recibidos' });
SupervisionLineamiento.belongsTo(Usuario, { foreignKey: 'asesor_id', as: 'asesor' });

Usuario.hasMany(SupervisionLineamiento, { foreignKey: 'creado_por', as: 'lineamientos_generados' });
SupervisionLineamiento.belongsTo(Usuario, { foreignKey: 'creado_por', as: 'creador' });

SupervisionLineamiento.hasMany(SupervisionLineamientoItem, { foreignKey: 'lineamiento_id', as: 'items' });
SupervisionLineamientoItem.belongsTo(SupervisionLineamiento, { foreignKey: 'lineamiento_id' });

Lead.hasMany(SupervisionLineamientoItem, { foreignKey: 'lead_id', as: 'items_lineamiento' });
SupervisionLineamientoItem.belongsTo(Lead, { foreignKey: 'lead_id', as: 'lead' });

// ─── Hooks globales de auditoría ────────────────────────────────────────────
// Captura INSERT/UPDATE/DELETE en todos los modelos registrados y graba en auditoria_log
import { getContext } from '../utils/requestContext';

const MODELOS_AUDITADOS = [
  { model: Usuario, tabla: 'usuarios', pk: 'id' },
  { model: Cliente, tabla: 'clientes', pk: 'id' },
  { model: ODP, tabla: 'odp', pk: 'id' },
  { model: ODPItem, tabla: 'odp_items', pk: 'id' },
  { model: SAP, tabla: 'saps', pk: 'id' },
  { model: SAPItem, tabla: 'sap_items', pk: 'id' },
  { model: OrdenCompra, tabla: 'ordenes_compra', pk: 'id' },
  { model: ODCItem, tabla: 'odc_items', pk: 'id' },
  { model: Pago, tabla: 'pagos', pk: 'id' },
  { model: Cotizacion, tabla: 'cotizaciones', pk: 'id' },
  { model: CotizacionItem, tabla: 'cotizacion_items', pk: 'id' },
  { model: TomaMedidas, tabla: 'toma_medidas', pk: 'id' },
  { model: EvidenciaInstalacion, tabla: 'evidencias_instalacion', pk: 'id' },
  { model: NoConformidad, tabla: 'no_conformidades', pk: 'id' },
  { model: NotaProduccion, tabla: 'notas_produccion', pk: 'id' },
  { model: HistorialEstadoODP, tabla: 'historial_estados_odp', pk: 'id' },
  { model: Vehiculo, tabla: 'vehiculos', pk: 'id' },
  { model: RutaInstalacion, tabla: 'rutas_instalacion', pk: 'id' },
  { model: RutaODP, tabla: 'ruta_odps', pk: 'id' },
  { model: Prospecto, tabla: 'prospectos', pk: 'id' },
  { model: CatalogoProducto, tabla: 'catalogo_productos', pk: 'id' },
  { model: InventarioPerfileria, tabla: 'inventario_perfileria', pk: 'id' },
  { model: MetaMensual, tabla: 'metas_mensuales', pk: 'id' },
  { model: ConfiguracionGlobal, tabla: 'configuracion_global', pk: 'id' },
  { model: PedidoPV, tabla: 'pedido_pv', pk: 'id' },
  { model: SalidaAlmacen, tabla: 'salidas_almacen', pk: 'id' },
  { model: CotizacionCaptura, tabla: 'cotizacion_capturas', pk: 'id' },
  { model: Lead, tabla: 'leads', pk: 'id' },
  { model: LeadEvento, tabla: 'lead_eventos', pk: 'id' },
  { model: LeadImagen, tabla: 'lead_imagenes', pk: 'id' },
  { model: MetaUsuarioMensual, tabla: 'metas_usuario_mensual', pk: 'id' },
  { model: FacturaAdicionalODP, tabla: 'facturas_adicionales_odp', pk: 'id' },
  { model: SupervisionLineamiento, tabla: 'supervision_lineamientos', pk: 'id' },
  { model: SupervisionLineamientoItem, tabla: 'supervision_lineamiento_items', pk: 'id' },
];

function registrarAuditoria(
  tabla: string,
  pk: string,
  operacion: 'INSERT' | 'UPDATE' | 'DELETE',
  instance: any,
  datosAnteriores: any
) {
  const ctx = getContext();
  const registroId = instance.getDataValue ? String(instance.getDataValue(pk) ?? '') : '';
  const datosNuevos = operacion !== 'DELETE' ? (instance.toJSON ? instance.toJSON() : instance) : null;

  AuditoriaLog.create({
    tabla,
    operacion,
    registro_id: registroId,
    datos_anteriores: datosAnteriores ?? null,
    datos_nuevos: datosNuevos,
    usuario_id: ctx.userId,
    usuario_nombre: ctx.userName,
    ip_address: ctx.ip,
  }).catch(() => { /* no interrumpir la operación principal */ });
}

for (const { model, tabla, pk } of MODELOS_AUDITADOS) {
  (model as any).addHook('afterCreate', `audit_insert_${tabla}`, (instance: any) => {
    registrarAuditoria(tabla, pk, 'INSERT', instance, null);
  });

  (model as any).addHook('beforeUpdate', `audit_before_update_${tabla}`, (instance: any) => {
    (instance as any)._auditAntes = instance.previous ? { ...instance.previous() } : null;
  });

  (model as any).addHook('afterUpdate', `audit_update_${tabla}`, (instance: any) => {
    registrarAuditoria(tabla, pk, 'UPDATE', instance, (instance as any)._auditAntes ?? null);
  });

  (model as any).addHook('beforeDestroy', `audit_before_destroy_${tabla}`, (instance: any) => {
    (instance as any)._auditSnap = instance.toJSON ? instance.toJSON() : instance;
  });

  (model as any).addHook('afterDestroy', `audit_delete_${tabla}`, (instance: any) => {
    registrarAuditoria(tabla, pk, 'DELETE', instance, (instance as any)._auditSnap ?? null);
  });
}

export {
  sequelize,
  AuditoriaLog,
  AlertasUmbral,
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
  CotizacionItem,
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
  AgendaInstalacion,
  PedidoPV,
  SalidaAlmacen,
  CotizacionCaptura,
  DetalleSAPImagen,
  Lead,
  LeadEvento,
  LeadImagen,
  MetaUsuarioMensual,
  FacturaAdicionalODP,
  SupervisionLineamiento,
  SupervisionLineamientoItem,
};


/**
 * Diagnóstico SOLO LECTURA de la ODC-9355 previo a marcarla como recibida.
 * No escribe nada.
 *
 * Uso:
 *   ./backend-api/node_modules/.bin/ts-node -r backend-api/node_modules/dotenv/config backend-api/src/scripts/2026-09-10_consultar_odc9355.ts
 */
import dotenv from 'dotenv';
dotenv.config({ path: 'backend-api/.env' });

import { Op } from 'sequelize';
import { OrdenCompra, ODCItem, SAPItem, SAP, ODP, ODPItem, Usuario, sequelize } from '../models';

const NUMERO = 'ODC-9355';

(async () => {
  try {
    const odc = await OrdenCompra.findOne({
      where: { numero_odc: { [Op.iLike]: `%9355%` } },
    });
    if (!odc) {
      console.log(`No se encontró ninguna ODC que coincida con ${NUMERO}`);
      return;
    }

    const odcId = odc.getDataValue('id');
    console.log('═══ CABECERA ODC ═══');
    console.log({
      id: odcId,
      numero_odc: odc.getDataValue('numero_odc'),
      tipo: odc.getDataValue('tipo'),
      proveedor: odc.getDataValue('proveedor'),
      estado: odc.getDataValue('estado'),
      sap_id: odc.getDataValue('sap_id'),
      odp_id: odc.getDataValue('odp_id'),
      creado_por: odc.getDataValue('creado_por'),
      fecha_creacion: odc.getDataValue('fecha_creacion'),
      fecha_recepcion: odc.getDataValue('fecha_recepcion'),
      notas: odc.getDataValue('notas'),
    });

    const creador = await Usuario.findByPk(odc.getDataValue('creado_por'), {
      attributes: ['id', 'nombre_completo', 'rol'],
    });
    console.log('creador:', creador ? creador.toJSON() : null);

    const items = await ODCItem.findAll({ where: { odc_id: odcId }, order: [['id', 'ASC']] });
    console.log(`\n═══ ÍTEMS DE LA ODC (${items.length}) ═══`);
    items.forEach((i: any) => console.log({
      id: i.getDataValue('id'),
      item: i.getDataValue('item'),
      codigo: i.getDataValue('codigo'),
      descripcion: i.getDataValue('descripcion'),
      cantidad: i.getDataValue('cantidad'),
      recibido: i.getDataValue('recibido'),
      sap_item_id: i.getDataValue('sap_item_id'),
      odp_item_id: i.getDataValue('odp_item_id'),
      odp_id: i.getDataValue('odp_id'),
    }));

    const sapItemIds = items.map((i: any) => i.getDataValue('sap_item_id')).filter(Boolean);
    const odpItemIds = items.map((i: any) => i.getDataValue('odp_item_id')).filter(Boolean);

    const odpIds = new Set<number>();

    if (sapItemIds.length > 0) {
      const sapItems = await SAPItem.findAll({ where: { id: { [Op.in]: sapItemIds } }, order: [['id', 'ASC']] });
      console.log(`\n═══ SAPItems referenciados (${sapItems.length}) ═══`);
      for (const si of sapItems) {
        const sap = await SAP.findByPk(si.getDataValue('sap_id'), { attributes: ['id', 'numero_sap', 'odp_id'] });
        if (sap?.getDataValue('odp_id')) odpIds.add(sap.getDataValue('odp_id'));
        console.log({
          sap_item_id: si.getDataValue('id'),
          sap_id: si.getDataValue('sap_id'),
          numero_sap: sap?.getDataValue('numero_sap') ?? null,
          odp_id: sap?.getDataValue('odp_id') ?? null,
          codigo: si.getDataValue('codigo'),
          estado_compra: si.getDataValue('estado_compra'),
          modificado: si.getDataValue('modificado'),
        });
      }
      const modificados = sapItems.filter((s: any) => s.getDataValue('modificado') === true).length;
      console.log(`\n>> BLOQUEO "materiales modificados": ${modificados > 0 ? `SÍ (${modificados})` : 'no'}`);
    }

    if (odpItemIds.length > 0) {
      const odpItems = await ODPItem.findAll({ where: { id: { [Op.in]: odpItemIds } }, order: [['id', 'ASC']] });
      console.log(`\n═══ ODPItems referenciados (${odpItems.length}) ═══`);
      odpItems.forEach((oi: any) => {
        if (oi.getDataValue('odp_id')) odpIds.add(oi.getDataValue('odp_id'));
        console.log({
          odp_item_id: oi.getDataValue('id'),
          odp_id: oi.getDataValue('odp_id'),
          item: oi.getDataValue('item'),
          tipo_vidrio: oi.getDataValue('tipo_vidrio'),
          estado_compra: oi.getDataValue('estado_compra'),
        });
      });
    }

    console.log(`\n═══ ODPs afectadas (${odpIds.size}) ═══`);
    for (const oid of odpIds) {
      const odp = await ODP.findByPk(oid, {
        attributes: ['id', 'numero_odp', 'estado_produccion', 'chk_accesorios', 'chk_vidrio',
          'chk_corte', 'chk_medicion', 'fecha_chk_accesorios', 'proveedor_vidrio', 'asesor_id'],
      });
      console.log(odp ? odp.toJSON() : { id: oid, error: 'no encontrada' });

      // ¿Qué otras SAP tiene esta ODP y en qué estado están sus líneas?
      const saps = await SAP.findAll({ where: { odp_id: oid }, attributes: ['id', 'numero_sap'] });
      for (const s of saps) {
        const lineas = await SAPItem.findAll({
          where: { sap_id: s.getDataValue('id') },
          attributes: ['id', 'codigo', 'estado_compra'],
        });
        console.log(`   SAP ${s.getDataValue('numero_sap')} (id ${s.getDataValue('id')}) — ${lineas.length} líneas:`,
          lineas.map((l: any) => `${l.getDataValue('id')}:${l.getDataValue('estado_compra')}`).join(', ') || '(vacía)');
      }
    }

    // ¿Alguno de estos SAPItems está en otra ODC activa?
    if (sapItemIds.length > 0) {
      const otras = await ODCItem.findAll({
        where: { sap_item_id: { [Op.in]: sapItemIds }, odc_id: { [Op.ne]: odcId } },
      });
      if (otras.length) {
        console.log('\n═══ Mismos SAPItems en OTRAS ODC ═══');
        for (const o of otras) {
          const otraOdc = await OrdenCompra.findByPk(o.getDataValue('odc_id'), {
            attributes: ['id', 'numero_odc', 'estado'],
          });
          console.log({ sap_item_id: o.getDataValue('sap_item_id'), odc: otraOdc?.toJSON() });
        }
      }
    }
  } catch (e: any) {
    console.error('ERROR:', e.message);
  } finally {
    await sequelize.close();
  }
})();

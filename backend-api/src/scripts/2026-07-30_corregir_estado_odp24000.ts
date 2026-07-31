/**
 * 2026-07-30 — ODP-24000 (LABORATORIOS ECAR SA): devolver a LISTO_INSTALAR.
 *
 * Contexto: la ODP se pasó manualmente a EN_ESPERA para intentar que apareciera en el
 * modal "Nuevo Pedido PV". Ese modal no filtra por estado — la ODP no salía porque
 * pedía las 200 más recientes sin excluir completadas y ella quedaba en la posición
 * 228 de 390. El cambio de estado no servía a ese fin y sí la volvía inconsistente:
 * tenía fecha_listo_instalar (17-jul), producción marcada, FACTURADA y CREDITO_APROBADO.
 *
 * Se usa .update() sobre la instancia (no bulk) para que disparen los hooks de
 * auditoría, y se registra el cambio en historial_estados_odp.
 *
 * Ejecutar una sola vez:  npx ts-node src/scripts/2026-07-30_corregir_estado_odp24000.ts
 */
import { ODP, HistorialEstadoODP, sequelize } from '../models';

const NUMERO_ODP = 'ODP-24000';
const ESTADO_DESTINO = 'LISTO_INSTALAR';
const USUARIO_ID = 30; // ROOT — corrección administrativa

(async () => {
  try {
    const odp = (await ODP.findOne({ where: { numero_odp: NUMERO_ODP } })) as any;
    if (!odp) {
      console.error(`No se encontró ${NUMERO_ODP}. Nada que hacer.`);
      return;
    }

    const anterior = odp.getDataValue('estado_produccion');
    console.log(`${NUMERO_ODP} (id ${odp.getDataValue('id')}) — estado actual: ${anterior}`);

    if (anterior === ESTADO_DESTINO) {
      console.log('Ya está en el estado destino. No se modifica nada.');
      return;
    }

    // Chequeos de seguridad: no pisar una situación legítima.
    if (['INSTALADA', 'ENTREGADA'].includes(anterior)) {
      console.error(`ABORTADO: la ODP está en ${anterior}; devolverla sería una regresión real.`);
      return;
    }

    await odp.update({ estado_produccion: ESTADO_DESTINO });
    await HistorialEstadoODP.create({
      odp_id: odp.getDataValue('id'),
      estado_anterior: anterior,
      estado_nuevo: ESTADO_DESTINO,
      usuario_id: USUARIO_ID,
      fecha: new Date(),
      observacion:
        'Corrección administrativa: la ODP se había pasado a EN_ESPERA por error ' +
        '(intento de listarla en el modal Nuevo Pedido PV). Producción terminada, ' +
        'facturada y con crédito aprobado desde el 17-jul.',
    } as any);

    console.log(`OK — ${anterior} → ${ESTADO_DESTINO}, con registro en historial_estados_odp.`);

    // Los hooks de auditoría son fire-and-forget: dar margen antes de cerrar la conexión.
    await new Promise((r) => setTimeout(r, 2500));
  } catch (e: any) {
    console.error('ERROR:', e.message);
  } finally {
    await sequelize.close();
  }
})();

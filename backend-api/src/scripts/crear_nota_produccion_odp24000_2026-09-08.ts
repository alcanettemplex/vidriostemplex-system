/**
 * Registra una nota de producción en ODP-24000 dejando constancia del
 * despacho de material (herrajes/accesorios) hecho por Rafael el 2026-09-08.
 *
 * Autor de la nota (usuario_id): 1 — "Administrador" (confirmado con el usuario
 * en sesión de Claude Code, ver consultar_usuario_admin_2026-09-08.ts).
 *
 * Uso:
 *   ./backend-api/node_modules/.bin/ts-node -r backend-api/node_modules/dotenv/config backend-api/src/scripts/crear_nota_produccion_odp24000_2026-09-08.ts
 */
import dotenv from 'dotenv';
dotenv.config({ path: 'backend-api/.env' });

import { ODP, NotaProduccion, Usuario, sequelize } from '../models';

const TEXTO = `Rafael despachó el siguiente material:
- 2 manijas tipo Roma 60-40
- 2 esquineros superior (izq, der)
- 2 pivotes aéreos
- 1 chapa Yale 170 1/4
- 1 porta chapa
- 1 recibidor
- 6 manijas serie Laguna
- 1 kit Optiglass
- 3 cargadores 12V
- Cable UTP
- 1 chapa pico loro`;

(async () => {
  try {
    const odp = await ODP.findOne({ where: { numero_odp: 'ODP-24000' } });
    if (!odp) {
      console.log('ODP-24000 no encontrada. Abortado, no se creó nada.');
      return;
    }
    const odpId = odp.getDataValue('id');

    const usuario = await Usuario.findByPk(1);
    if (!usuario) {
      console.log('usuario_id=1 no existe. Abortado, no se creó nada.');
      return;
    }

    const nota = await NotaProduccion.create({
      odp_id: odpId,
      usuario_id: 1,
      texto: TEXTO,
      fecha: new Date(),
    });

    console.log('Nota de producción creada:', nota.toJSON());
  } catch (e) {
    console.error(e);
  } finally {
    await sequelize.close();
  }
})();

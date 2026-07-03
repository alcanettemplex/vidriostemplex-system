// Fix: crm.controller.ts (convertLeadToCliente) crea LeadEvento con tipo: 'CONVERSION',
// pero ese valor nunca existio en el enum real de Postgres (enum_lead_eventos_tipo).
// Resultado: cada "Convertir a Cliente" actualizaba el lead correctamente pero luego
// lanzaba una excepcion al loguear el evento -> 500 al asesor, aunque la conversion
// ya habia quedado guardada. Confirmado: 36 leads con cliente_id seteado, 0 eventos
// tipo CONVERSION en toda la tabla lead_eventos.
// No hay CHECK CONSTRAINT adicional en esta columna (verificado), solo el ENUM nativo.
import sequelize from '../config/database';
import { QueryTypes } from 'sequelize';

async function run() {
  await sequelize.authenticate();
  await sequelize.query(`ALTER TYPE enum_lead_eventos_tipo ADD VALUE IF NOT EXISTS 'CONVERSION';`);
  console.log("Valor 'CONVERSION' agregado (o ya existente) en enum_lead_eventos_tipo.");

  const valores = await sequelize.query<{ enumlabel: string }>(`
    SELECT e.enumlabel FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'enum_lead_eventos_tipo'
    ORDER BY e.enumsortorder;
  `, { type: QueryTypes.SELECT });
  console.log('Valores actuales del enum:', valores.map(v => v.enumlabel));

  await sequelize.close();
}

run().catch((err) => {
  console.error('Error en migracion:', err);
  process.exit(1);
});

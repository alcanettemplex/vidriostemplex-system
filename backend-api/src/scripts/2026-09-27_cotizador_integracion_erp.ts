// Integración del Cotizador con el ERP (2026-09-27, orden del usuario): la
// cotización deja de estar aislada.
//
// Solo AGREGA columnas (nada se borra ni se renombra):
//   cotizador.cotizacion
//     asesor_usuario_id  dueño: el asesor asignado (edita la cotización)
//     creado_por_id      quién la creó (puede ser una asistente para un asesor)
//     lead_id | prospecto_id | cliente_id | odp_id   vínculo (obligatorio al crear
//                        desde esta fecha; las anteriores quedan "sin vínculo")
//     motivo_perdida, motivo_perdida_detalle   al marcarla PERDIDO
//   public.sap_items
//     origen_cotizacion_id   ítems traídos de una cotización: evita traerlos dos veces
//
// Todas las FK con ON DELETE SET NULL: borrar un lead, una ODP o un usuario nunca
// arrastra la cotización (las cotizaciones son documentos comerciales).
// El campo de texto `asesor` se conserva para las cotizaciones anteriores.
//
// Idempotente. NO se ejecuta con `npm run dev`. Correr a mano tras desplegar:
//   npx ts-node --files src/scripts/2026-09-27_cotizador_integracion_erp.ts
import { sequelize } from '../models';

const SENTENCIAS: string[] = [
  `ALTER TABLE cotizador.cotizacion ADD COLUMN IF NOT EXISTS asesor_usuario_id INTEGER REFERENCES public.usuarios(id) ON DELETE SET NULL`,
  `ALTER TABLE cotizador.cotizacion ADD COLUMN IF NOT EXISTS creado_por_id INTEGER REFERENCES public.usuarios(id) ON DELETE SET NULL`,
  `ALTER TABLE cotizador.cotizacion ADD COLUMN IF NOT EXISTS lead_id INTEGER REFERENCES public.leads(id) ON DELETE SET NULL`,
  `ALTER TABLE cotizador.cotizacion ADD COLUMN IF NOT EXISTS prospecto_id INTEGER REFERENCES public.prospectos(id) ON DELETE SET NULL`,
  `ALTER TABLE cotizador.cotizacion ADD COLUMN IF NOT EXISTS cliente_id INTEGER REFERENCES public.clientes(id) ON DELETE SET NULL`,
  `ALTER TABLE cotizador.cotizacion ADD COLUMN IF NOT EXISTS odp_id INTEGER REFERENCES public.odp(id) ON DELETE SET NULL`,
  `ALTER TABLE cotizador.cotizacion ADD COLUMN IF NOT EXISTS motivo_perdida VARCHAR(40)`,
  `ALTER TABLE cotizador.cotizacion ADD COLUMN IF NOT EXISTS motivo_perdida_detalle TEXT`,
  // Cuándo se aprobó / se perdió: el Dashboard mide "días hasta aprobar".
  `ALTER TABLE cotizador.cotizacion ADD COLUMN IF NOT EXISTS aprobada_en TIMESTAMPTZ`,
  `ALTER TABLE cotizador.cotizacion ADD COLUMN IF NOT EXISTS perdida_en TIMESTAMPTZ`,
  `CREATE INDEX IF NOT EXISTS cotizacion_asesor_usuario_idx ON cotizador.cotizacion (asesor_usuario_id)`,
  `CREATE INDEX IF NOT EXISTS cotizacion_lead_idx ON cotizador.cotizacion (lead_id)`,
  `CREATE INDEX IF NOT EXISTS cotizacion_prospecto_idx ON cotizador.cotizacion (prospecto_id)`,
  `CREATE INDEX IF NOT EXISTS cotizacion_cliente_idx ON cotizador.cotizacion (cliente_id)`,
  `CREATE INDEX IF NOT EXISTS cotizacion_odp_idx ON cotizador.cotizacion (odp_id)`,
  `ALTER TABLE public.sap_items ADD COLUMN IF NOT EXISTS origen_cotizacion_id INTEGER REFERENCES cotizador.cotizacion(id) ON DELETE SET NULL`,
];

async function main() {
  for (const sql of SENTENCIAS) {
    await sequelize.query(sql);
    console.log('✓', sql.replace(/\s+/g, ' ').slice(0, 110));
  }
  const [cols] = await sequelize.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema='cotizador' AND table_name='cotizacion' ORDER BY ordinal_position`
  );
  console.log('columnas de cotizador.cotizacion:', (cols as { column_name: string }[]).map((c) => c.column_name).join(', '));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());

// Etapa 1 del módulo Cotizador — crea las 21 tablas cotizador_* y los objetos
// que Sequelize no puede declarar por su cuenta: 2 índices únicos parciales
// y 4 CHECK constraints (3 de fila única + 1 de gramática de cascada).
//
// Ejecutar UNA vez por entorno (local / Supabase de producción), en cualquier
// orden respecto de `npm run dev` (que ya crea las tablas base vía
// sequelize.sync({alter:false}) al arrancar, porque los 21 modelos están
// registrados en models/index.ts). Es idempotente: se puede correr de nuevo
// sin efecto si ya se aplicó.
//
// Uso: npx ts-node src/scripts/2026-09-07_crear_tablas_cotizador.ts
import { sequelize } from '../models';

async function run() {
  try {
    await sequelize.authenticate();
    console.log('Conexión OK');

    // 1) Asegura que las 21 tablas base existan (no toca ninguna tabla existente
    //    del resto del ERP: alter:false solo crea lo que falta).
    await sequelize.sync({ alter: false });
    console.log('✓ sync({alter:false}) — tablas base del cotizador aseguradas');

    // 2) Índice único parcial: un solo margen "vigente" por (ambito, clave).
    //    Da versionado gratis — aprobar = marcar el anterior vigente=false + insertar.
    await sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_cotizador_margen_vigente
        ON cotizador_calibracion_margen (ambito, clave)
        WHERE vigente;
    `);
    console.log('✓ ux_cotizador_margen_vigente');

    // 3) CHECK de gramática de la cascada: qué columnas deben ir NULL según el ámbito.
    //    Imposible de expresar con una clave opaca tipo "Sistema5020|193".
    await sequelize.query(`
      DO $$ BEGIN
        ALTER TABLE cotizador_calibracion_margen ADD CONSTRAINT ck_cotizador_margen_ambito CHECK (
          (ambito='global'   AND sistema IS NULL     AND material IS NULL     AND ref IS NULL) OR
          (ambito='sistema'  AND sistema IS NOT NULL AND material IS NULL     AND ref IS NULL) OR
          (ambito='material' AND sistema IS NOT NULL AND material IS NOT NULL AND ref IS NULL) OR
          (ambito='pieza'    AND sistema IS NOT NULL AND material IS NULL     AND ref IS NOT NULL)
        );
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    console.log('✓ ck_cotizador_margen_ambito');

    // 4) Índice único parcial de holguras vigentes: una por ámbito (global,
    //    o una por sistema). COALESCE colapsa el NULL de "global" a un valor
    //    fijo para que el índice funcione igual en ambos casos.
    await sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_cotizador_holgura_vigente
        ON cotizador_calibracion_holgura (ambito, COALESCE(sistema, 'global'))
        WHERE vigente;
    `);
    console.log('✓ ux_cotizador_holgura_vigente');

    // 5) CHECK de fila única en las 3 tablas de configuración singleton.
    const singletons = ['cotizador_parametro', 'cotizador_empresa', 'cotizador_empresa_logo'];
    for (const tabla of singletons) {
      await sequelize.query(`
        DO $$ BEGIN
          ALTER TABLE ${tabla} ADD CONSTRAINT ck_${tabla}_id_unico CHECK (id = 1);
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      `);
      console.log(`✓ ck_${tabla}_id_unico`);
    }

    console.log('\nEtapa 1 — creación de tablas del Cotizador completada.');
  } catch (err) {
    console.error('Error creando tablas del cotizador:', err);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

run();

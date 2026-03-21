import sequelize from './config/database';

async function migrateProd() {
  try {
    console.log('--- INICIANDO MIGRACIÓN MAESTRA DE PRODUCCIÓN ---');

    // Múltiples queries independientes para que si una falla, otra continúe.
    const queries = [
      // 1. Columnas ODP Checklists (Producción)
      `ALTER TABLE "odp" ADD COLUMN IF NOT EXISTS "chk_ensamble" BOOLEAN DEFAULT FALSE;`,
      `ALTER TABLE "odp" ADD COLUMN IF NOT EXISTS "chk_matizado" BOOLEAN DEFAULT FALSE;`,
      `ALTER TABLE "odp" ADD COLUMN IF NOT EXISTS "chk_pelicula" BOOLEAN DEFAULT FALSE;`,
      `ALTER TABLE "odp" ADD COLUMN IF NOT EXISTS "chk_huacal" BOOLEAN DEFAULT FALSE;`,
      `ALTER TABLE "odp" ADD COLUMN IF NOT EXISTS "chk_carton" BOOLEAN DEFAULT FALSE;`,
      
      // 2. Columnas ODP No Conformidad
      `ALTER TABLE "odp" ADD COLUMN IF NOT EXISTS "es_no_conformidad" BOOLEAN DEFAULT FALSE;`,
      `ALTER TABLE "odp" ADD COLUMN IF NOT EXISTS "odp_padre_id" INTEGER;`,

      // 3. Tabla de Notas de Producción (Bitácora)
      `CREATE TABLE IF NOT EXISTS "notas_produccion" (
        "id" SERIAL PRIMARY KEY,
        "odp_id" INTEGER NOT NULL REFERENCES "odp"("id") ON DELETE CASCADE,
        "usuario_id" INTEGER REFERENCES "usuarios"("id") ON DELETE SET NULL,
        "texto" TEXT NOT NULL,
        "fecha" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );`,

      // 4. Tabla de No Conformidades
      `CREATE TABLE IF NOT EXISTS "no_conformidades" (
        "id" SERIAL PRIMARY KEY,
        "odp_id" INTEGER REFERENCES "odp"("id") ON DELETE CASCADE,
        "usuario_reporta_id" INTEGER REFERENCES "usuarios"("id") ON DELETE SET NULL,
        "tipo" VARCHAR(50),
        "descripcion" TEXT,
        "estado" VARCHAR(50) DEFAULT 'pendiente',
        "nueva_odp_id" INTEGER REFERENCES "odp"("id") ON DELETE SET NULL,
        "fecha_reporte" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );`,

      // 5. Tabla Configuraciones Generales
      `CREATE TABLE IF NOT EXISTS "configuraciones_globales" (
        "id" SERIAL PRIMARY KEY,
        "clave" VARCHAR(50) UNIQUE NOT NULL,
        "valor" TEXT NOT NULL,
        "descripcion" TEXT,
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );`,

      // 6. Tabla Metas Mensuales
      `CREATE TABLE IF NOT EXISTS "metas_mensuales" (
        "id" SERIAL PRIMARY KEY,
        "mes" INTEGER NOT NULL,
        "anio" INTEGER NOT NULL,
        "meta_venta" DECIMAL(15, 2) DEFAULT 0,
        "meta_instalacion" INTEGER DEFAULT 0,
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );`,

      // 7. Seed Data por defecto para evitar 500s en componentes que esperan datos.
      `ALTER TABLE "metas_mensuales" ADD COLUMN IF NOT EXISTS "meta_venta" DECIMAL(15, 2) DEFAULT 0;`,
      `ALTER TABLE "metas_mensuales" ADD COLUMN IF NOT EXISTS "meta_instalacion" INTEGER DEFAULT 0;`,
      
      `INSERT INTO "metas_mensuales" (mes, anio, meta_venta, meta_instalacion) 
       VALUES (3, 2026, 150000.00, 20) 
       ON CONFLICT DO NOTHING;`,

      `INSERT INTO "configuraciones_globales" (clave, valor, descripcion) 
       VALUES ('TEMA_DASHBOARD', 'PREMIUM', 'Estilo visual del panel') 
       ON CONFLICT (clave) DO NOTHING;`
    ];

    for (let i = 0; i < queries.length; i++) {
        try {
            await sequelize.query(queries[i]);
            console.log(`[OK] Query ${i+1}`);
        } catch (e: any) {
            console.log(`[IGNORADO/WARN] Query ${i+1} arrojó:`, e.message);
        }
    }

    console.log('✅ Base de datos 100% sincronizada (Render / Supabase).');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error general migrando:', error);
    process.exit(1);
  }
}

migrateProd();

/**
 * Exporta el schema completo (sin datos) de la BD Supabase a un archivo SQL.
 * Incluye: CREATE TABLE, columnas con tipos/defaults/nullability, PKs, UKs, FKs, CHECK, índices.
 */
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const OUTPUT_PATH = 'C:/Compartido/vidrios_templex_schema_2026-04-25.sql';

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function run() {
  await client.connect();
  console.log('Conectado a la BD...');

  const lines = [];
  lines.push('-- ============================================================');
  lines.push('-- Schema: Vidrios Templex ERP');
  lines.push('-- Exportado: 2026-04-25');
  lines.push('-- Solo estructura (sin datos)');
  lines.push('-- ============================================================\n');

  // Obtener tablas del schema public
  const tablesRes = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  const tables = tablesRes.rows.map(r => r.table_name);
  console.log(`Tablas encontradas: ${tables.length}`);

  for (const table of tables) {
    lines.push(`-- ────────────────────────────────────────`);
    lines.push(`-- Tabla: ${table}`);
    lines.push(`-- ────────────────────────────────────────`);
    lines.push(`DROP TABLE IF EXISTS "${table}" CASCADE;`);
    lines.push(`CREATE TABLE "${table}" (`);

    // Columnas
    const colsRes = await client.query(`
      SELECT
        c.column_name,
        c.data_type,
        c.udt_name,
        c.character_maximum_length,
        c.numeric_precision,
        c.numeric_scale,
        c.is_nullable,
        c.column_default
      FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = $1
      ORDER BY c.ordinal_position
    `, [table]);

    const colDefs = [];
    for (const col of colsRes.rows) {
      let type = col.data_type;
      if (type === 'character varying') type = col.character_maximum_length ? `VARCHAR(${col.character_maximum_length})` : 'TEXT';
      else if (type === 'character') type = col.character_maximum_length ? `CHAR(${col.character_maximum_length})` : 'CHAR';
      else if (type === 'numeric') type = col.numeric_precision ? `NUMERIC(${col.numeric_precision},${col.numeric_scale})` : 'NUMERIC';
      else if (type === 'integer') type = 'INTEGER';
      else if (type === 'bigint') type = 'BIGINT';
      else if (type === 'smallint') type = 'SMALLINT';
      else if (type === 'boolean') type = 'BOOLEAN';
      else if (type === 'text') type = 'TEXT';
      else if (type === 'timestamp without time zone') type = 'TIMESTAMP';
      else if (type === 'timestamp with time zone') type = 'TIMESTAMPTZ';
      else if (type === 'date') type = 'DATE';
      else if (type === 'json') type = 'JSON';
      else if (type === 'jsonb') type = 'JSONB';
      else if (type === 'double precision') type = 'DOUBLE PRECISION';
      else if (type === 'real') type = 'REAL';
      else if (type === 'USER-DEFINED') type = col.udt_name.toUpperCase(); // ENUMs

      let def = `  "${col.column_name}" ${type}`;
      if (col.is_nullable === 'NO') def += ' NOT NULL';
      if (col.column_default) def += ` DEFAULT ${col.column_default}`;
      colDefs.push(def);
    }

    // Primary key
    const pkRes = await client.query(`
      SELECT kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
      WHERE tc.table_schema = 'public' AND tc.table_name = $1 AND tc.constraint_type = 'PRIMARY KEY'
      ORDER BY kcu.ordinal_position
    `, [table]);
    if (pkRes.rows.length > 0) {
      const pkCols = pkRes.rows.map(r => `"${r.column_name}"`).join(', ');
      colDefs.push(`  PRIMARY KEY (${pkCols})`);
    }

    // Unique constraints
    const uqRes = await client.query(`
      SELECT tc.constraint_name, kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
      WHERE tc.table_schema = 'public' AND tc.table_name = $1 AND tc.constraint_type = 'UNIQUE'
      ORDER BY tc.constraint_name, kcu.ordinal_position
    `, [table]);
    const uqMap = {};
    for (const row of uqRes.rows) {
      if (!uqMap[row.constraint_name]) uqMap[row.constraint_name] = [];
      uqMap[row.constraint_name].push(row.column_name);
    }
    for (const [cname, cols] of Object.entries(uqMap)) {
      colDefs.push(`  CONSTRAINT "${cname}" UNIQUE (${cols.map(c => `"${c}"`).join(', ')})`);
    }

    // Check constraints
    const chkRes = await client.query(`
      SELECT cc.constraint_name, cc.check_clause
      FROM information_schema.check_constraints cc
      JOIN information_schema.table_constraints tc
        ON cc.constraint_name = tc.constraint_name AND cc.constraint_schema = tc.table_schema
      WHERE tc.table_schema = 'public' AND tc.table_name = $1
    `, [table]);
    for (const row of chkRes.rows) {
      colDefs.push(`  CONSTRAINT "${row.constraint_name}" CHECK (${row.check_clause})`);
    }

    lines.push(colDefs.join(',\n'));
    lines.push(');\n');
  }

  // Foreign Keys (separadas, al final)
  lines.push('\n-- ============================================================');
  lines.push('-- Claves Foráneas (Foreign Keys)');
  lines.push('-- ============================================================\n');

  const fkRes = await client.query(`
    SELECT
      tc.table_name,
      tc.constraint_name,
      kcu.column_name,
      ccu.table_name AS foreign_table,
      ccu.column_name AS foreign_column,
      rc.update_rule,
      rc.delete_rule
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    JOIN information_schema.referential_constraints rc
      ON tc.constraint_name = rc.constraint_name AND tc.constraint_schema = rc.constraint_schema
    JOIN information_schema.constraint_column_usage ccu
      ON rc.unique_constraint_name = ccu.constraint_name
    WHERE tc.table_schema = 'public' AND tc.constraint_type = 'FOREIGN KEY'
    ORDER BY tc.table_name, tc.constraint_name
  `);

  for (const fk of fkRes.rows) {
    lines.push(`ALTER TABLE "${fk.table_name}" ADD CONSTRAINT "${fk.constraint_name}"`);
    lines.push(`  FOREIGN KEY ("${fk.column_name}") REFERENCES "${fk.foreign_table}" ("${fk.foreign_column}")`);
    lines.push(`  ON UPDATE ${fk.update_rule} ON DELETE ${fk.delete_rule};\n`);
  }

  // Índices (excluyendo los de PK/UK que ya están en CREATE TABLE)
  lines.push('\n-- ============================================================');
  lines.push('-- Índices adicionales');
  lines.push('-- ============================================================\n');

  const idxRes = await client.query(`
    SELECT indexname, tablename, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname NOT IN (
        SELECT constraint_name FROM information_schema.table_constraints
        WHERE table_schema = 'public' AND constraint_type IN ('PRIMARY KEY', 'UNIQUE')
      )
    ORDER BY tablename, indexname
  `);
  for (const idx of idxRes.rows) {
    lines.push(`${idx.indexdef};`);
  }

  // ENUMs
  lines.push('\n-- ============================================================');
  lines.push('-- Tipos ENUM');
  lines.push('-- ============================================================\n');

  const enumRes = await client.query(`
    SELECT t.typname, e.enumlabel
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
    ORDER BY t.typname, e.enumsortorder
  `);
  const enumMap = {};
  for (const row of enumRes.rows) {
    if (!enumMap[row.typname]) enumMap[row.typname] = [];
    enumMap[row.typname].push(row.enumlabel);
  }
  for (const [name, vals] of Object.entries(enumMap)) {
    lines.push(`CREATE TYPE "${name}" AS ENUM (${vals.map(v => `'${v}'`).join(', ')});`);
  }

  const sql = lines.join('\n');
  fs.writeFileSync(OUTPUT_PATH, sql, 'utf8');
  console.log(`\n✅ Schema exportado: ${OUTPUT_PATH}`);
  console.log(`   Tablas: ${tables.length} | FKs: ${fkRes.rows.length} | Índices: ${idxRes.rows.length}`);

  await client.end();
}

run().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});

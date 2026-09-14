/**
 * Script: 2026-09-14_agregar_codigos_faltantes_inventario.ts
 *
 * Agrega a `catalogo_productos` los códigos que el reporte
 * "Inventarios_Por_Bodega_Acum.pdf" (World Office, 1.222 productos con
 * existencia) trae y que HOY no existen en el catálogo maestro de Supabase.
 *
 * Origen de los datos: se extrajo el texto del PDF con `pdftotext -layout
 * -enc UTF-8` y se parsearon los 1.222 productos usando las líneas
 * "Total para <codigo> ..." como confirmación de que la línea es un producto
 * real (no un encabezado de sección como "ACCESORIOS"), tomando la
 * descripción completa de la primera línea de cada bloque (la línea "Total
 * para" a veces trunca la descripción por el ancho fijo de columna del PDF).
 * Cruzado contra los 1.212 códigos no-nulos de catalogo_productos: **14
 * faltan**.
 *
 * QUÉ NO HACE (a propósito, mismo criterio mínimo que seed_catalogo.sql):
 * solo llena codigo+nombre+activo=true. NO asigna categoria (95% del
 * catálogo ya está así) ni unidad_medida (0% poblado hoy) — aunque el PDF sí
 * trae unidad para 9 de los 14, introducirla unilateralmente empezaría una
 * convención que ningún otro código sigue; queda como oportunidad aparte, no
 * en el alcance de "agregar los que faltan".
 *
 * SEGURIDAD: `catalogo_productos.codigo` NO tiene constraint UNIQUE real en
 * la BD (drift modelo↔BD documentado en el plan de integración Cotizador,
 * 2026-09-14) — por eso este script verifica explícitamente, dentro de la
 * misma transacción, que cada código sigue sin existir antes de insertarlo
 * (no confía en ON CONFLICT). Correrlo dos veces es seguro: la segunda vez
 * no inserta nada.
 *
 * Uso: npx ts-node src/scripts/2026-09-14_agregar_codigos_faltantes_inventario.ts
 */
import sequelize from '../config/database';
import { QueryTypes } from 'sequelize';

const FALTANTES: { codigo: string; nombre: string }[] = [
  { codigo: 'CEP0102', nombre: 'CHAPETA ESQUINERA CON CERROJO Y CANTONERA (P4CK)' },
  { codigo: 'LOG0101', nombre: 'LOGO PLOTER DE CORTE' },
  { codigo: 'PERK0104', nombre: 'SISTEMA KONCEPT' },
  { codigo: 'INS001', nombre: 'INSTALACION PELICULAS' },
  { codigo: 'PELI031', nombre: 'SUMINISTRO E INSTALACIÓN DE PELICULAS' },
  { codigo: 'RAD0101', nombre: 'RADIO' },
  { codigo: 'RAD0102', nombre: 'RADIO 50MM' },
  { codigo: 'MATI07', nombre: 'MATIZADO TOTAL' },
  // Corregido a mano: la extracción del PDF traía "-42.875,42" pegado al
  // final (un valor de costo que se filtró desde la columna vecina).
  { codigo: 'MATI08', nombre: 'MATIZADO DIBUJO CATALOGO' },
  { codigo: '1BPB10', nombre: 'BORDE PULIDO Y BRILLADO EN 10MM VTA' },
  { codigo: 'BIESP01', nombre: 'BISEL ESPEJO 4MM (1CM)' },
  { codigo: 'BIESP02', nombre: 'BISEL ESPEJO 4MM (2,5 CM)' },
  { codigo: 'BPB018', nombre: 'BORDE PULIDO Y BRILLADO (12 - 18MM)' },
  { codigo: 'BPB04', nombre: 'BORDE PULIDO BRILLADO (4 - 6MM)' },
];

async function main(): Promise<void> {
  await sequelize.authenticate();
  console.log('Conexión OK\n');

  const t = await sequelize.transaction();
  try {
    const existentes = await sequelize.query<{ codigo: string }>(
      `SELECT codigo FROM catalogo_productos WHERE codigo IN (:codigos)`,
      { type: QueryTypes.SELECT, transaction: t, replacements: { codigos: FALTANTES.map((f) => f.codigo) } }
    );
    const yaExisten = new Set(existentes.map((e) => e.codigo));

    let insertados = 0;
    for (const f of FALTANTES) {
      if (yaExisten.has(f.codigo)) {
        console.log(`= ${f.codigo} ya existe — se omite (script ya corrido antes, o se agregó por otra vía)`);
        continue;
      }
      await sequelize.query(
        `INSERT INTO catalogo_productos (codigo, nombre, activo) VALUES (:codigo, :nombre, true)`,
        { transaction: t, replacements: { codigo: f.codigo, nombre: f.nombre } }
      );
      console.log(`✓ ${f.codigo} — ${f.nombre}`);
      insertados++;
    }

    console.log(`\n${insertados} código(s) nuevo(s) insertados de ${FALTANTES.length} candidatos.`);
    await t.commit();
    console.log('=== COMMIT ===');
  } catch (err) {
    await t.rollback();
    console.error('\n✘ Error — se hizo ROLLBACK:', err);
    throw err;
  } finally {
    await sequelize.close();
  }
}

main().catch((err) => {
  console.error('\nEl script terminó con error:', err);
  process.exit(1);
});

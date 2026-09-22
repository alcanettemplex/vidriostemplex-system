/**
 * Script: 2026-09-13_importar_disenos_fase1.ts
 *
 * FASE 1 de la importación de diseños faltantes desde el proyecto externo de
 * origen. Importa SOLO los diseños que cumplen las tres condiciones que los
 * hacen cotizables de inmediato, sin ningún trabajo de datos nuevo:
 *
 *   1. COMPLETOS      -> ≥4 perfiles con fórmula y ≥1 paño de vidrio. Descarta la
 *                        cola de diseños que el extractor del software de origen
 *                        dejó degenerados (un solo perfil "Alfajía", sin vidrio ni
 *                        marco): importarlos sólo cotizaría un perfil suelto.
 *   2. YA MAPEADOS    -> cada referencia de perfil del origen ya existe, con su
 *                        `codigos_por_color`, en un diseño del MISMO sistema que
 *                        ya está en producción. El mapeo referencia→código Templex
 *                        por color no vive en ningún archivo (se hizo fuera del
 *                        repo); aquí se REUTILIZA el de los diseños gemelos, que
 *                        es la única fuente fiable que existe.
 *   3. CON PRECIO     -> los códigos reutilizados existen en cotizador.producto.
 *
 * Sistemas de esta fase: Sistema3831, Sistema3831-Reforzado, Sistema7038-Interior.
 * Resultado esperado: 38 diseños (21 + 14 + 3). El número no se hardcodea: se
 * deriva aplicando el criterio, y el script aborta si algún supuesto falla.
 *
 * QUÉ NO HACE
 *   - No toca los 138 diseños existentes.
 *   - No calcula los modelos de corte ni los niveles A/B/C: eso lo hacen, después,
 *     `2026-09-13_reconstruir_modelos_corte.ts` + `..._aplicar_modelos_corte.ts`,
 *     que procesan todos los diseños de la BD (los nuevos incluidos). Aquí los
 *     niveles se insertan como 'C' PROVISIONAL — el paso de modelos los corrige.
 *
 * MODOS
 *   (sin flags)  DRY-RUN: imprime exactamente qué insertaría, sin escribir nada.
 *   --aplicar    Inserta en una transacción, con verificación antes del COMMIT.
 *   --revertir   Borra los diseños que este script importó (lista en el JSON de
 *                salida), de las 4 tablas.
 *
 * USO
 *   npx ts-node src/scripts/2026-09-13_importar_disenos_fase1.ts            # dry-run
 *   npx ts-node src/scripts/2026-09-13_importar_disenos_fase1.ts --aplicar
 *   npx ts-node src/scripts/2026-09-13_importar_disenos_fase1.ts --revertir
 */
import fs from 'fs';
import path from 'path';
import { QueryTypes, Transaction } from 'sequelize';

import dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

import { parsearCodigo } from '../cotizador/lib/codigoDiseno';

// Los dos JSON de origen viven FUERA del repo, en el proyecto externo del que se
// extrajeron los despieces. La ruta no se escribe aquí por dos razones: el nombre
// del software de origen no debe aparecer en el código del ERP (decisión 8 del
// Cotizador, ver docs/modulos/cotizador.md), y la que estaba escrita apuntaba al
// escritorio de OTRA máquina (`C:/Users/User/...`), así que ya no resolvía en
// ninguna parte. Este script es de un solo uso y ya corrió; quien lo re-ejecute
// tiene que decir dónde están los archivos:
//
//   COTIZADOR_DATOS_ORIGEN=D:/ruta/al/proyecto/data npx ts-node src/scripts/...
const DIR_ORIGEN = process.env.COTIZADOR_DATOS_ORIGEN ?? '';
const RUTA_FORMULAS = path.join(DIR_ORIGEN, 'formulas.json');
const RUTA_MULTIMEDIDA = path.join(DIR_ORIGEN, 'multimedida.json');
const SALIDA_IDS = path.join(__dirname, 'datos_cotizador', 'importados_fase1_2026-09-13.json');

const SISTEMAS = ['Sistema3831', 'Sistema3831-Reforzado', 'Sistema7038-Interior'];
const MODULO = 'ventanas';

const NOMBRE_PANEL: Record<string, string> = {
  O: 'Fijo', X: 'Corredizo', W: 'Proyectante', B: 'Batiente', P: 'Persiana', E: 'Espejo',
};
const LETRAS_PANEL = new Set(Object.keys(NOMBRE_PANEL));

/**
 * Filas de paneles de un código. NO se usa parsearCodigo: su heurística de
 * "apilado" falla en los códigos mixtos de esta fase (interpreta W_O como 1
 * panel en vez de Proyectante sobre Fijo). Aquí se aplica una regla directa y
 * verificable: el código se parte por "_" (cada trozo es una fila apilada), y de
 * cada fila se toman las letras-panel consecutivas desde el inicio. Así una cola
 * o un sufijo descriptivo se corta solo:
 *   "OO2"      -> [O,O]          (corta en el "2")
 *   "OO_TOPE"  -> [[O,O]]        ("TOPE" no empieza por letra-panel -> se ignora)
 *   "OXXXXXXO_3P" -> [[O,X,X,X,X,X,X,O]]
 *   "W_O"      -> [[W],[O]]      (dos filas)
 * El resultado se CONTRASTA contra el nº real de paños de vidrio (abajo); si no
 * cuadran, el script lo marca para revisión en vez de escribir un dato dudoso.
 */
function derivarFilas(codigo: string): string[][] {
  const filas: string[][] = [];
  for (const seg of codigo.split('_')) {
    const letras: string[] = [];
    for (const ch of seg) {
      if (LETRAS_PANEL.has(ch)) letras.push(ch);
      else break;
    }
    if (letras.length) filas.push(letras);
  }
  return filas;
}

function derivarEtiqueta(codigo: string): string | null {
  const filas = derivarFilas(codigo);
  if (!filas.length) return null;
  return filas.map((fila) => fila.map((l) => NOMBRE_PANEL[l] ?? l).join(' + ')).join('  |  ') || null;
}

interface PerfilOrigen {
  ref: string | number;
  descripcion: string;
  cantidad: number;
  desperdicio: number;
  formula: { a: number; b: number; c: number } | null;
}
interface VidrioOrigen {
  descripcion: string; cantidad: number; desperdicio: number;
  formulaAncho: { a: number; b: number; c: number } | null;
  formulaAlto: { a: number; b: number; c: number } | null;
}
interface AccesorioOrigen { descripcion: string; cantidad: number | null; }
interface DisenoOrigen {
  perfiles?: PerfilOrigen[]; vidrios?: VidrioOrigen[]; accesorios?: AccesorioOrigen[];
}

interface Gemelo {
  ref: string; ref_original: string | null;
  codigos_por_color: Record<string, string>; es_alfajia: boolean; descripcion: string | null;
}

async function main() {
  const revertir = process.argv.includes('--revertir');
  const aplicar = process.argv.includes('--aplicar');
  const { default: sequelize } = await import('../config/database');

  // ─── Revertir ─────────────────────────────────────────────────────────────
  if (revertir) {
    if (!fs.existsSync(SALIDA_IDS)) throw new Error(`No hay registro de importación en ${SALIDA_IDS}: nada que revertir.`);
    const ids: string[] = JSON.parse(fs.readFileSync(SALIDA_IDS, 'utf8')).ids;
    console.log(`Revirtiendo ${ids.length} diseños importados…`);
    await sequelize.transaction(async (t: Transaction) => {
      for (const tabla of ['diseno_accesorio', 'diseno_vidrio', 'diseno_perfil', 'diseno']) {
        const col = tabla === 'diseno' ? 'id' : 'diseno_id';
        await sequelize.query(
          `DELETE FROM cotizador.${tabla} WHERE ${col} IN (:ids)`,
          { replacements: { ids }, transaction: t }
        );
      }
    });
    console.log('✓ revertido. Recuerda re-correr aplicar_modelos_corte si ya lo habías corrido sobre estos.');
    await sequelize.close();
    return;
  }

  // ─── Cargar origen ──────────────────────────────────────────────────────────
  // Sin la variable de entorno, `path.join('', 'formulas.json')` daría la ruta
  // relativa 'formulas.json' y el error sería un ENOENT sin pistas. Mejor decir
  // qué falta.
  if (!DIR_ORIGEN) {
    throw new Error(
      'Falta COTIZADOR_DATOS_ORIGEN: la carpeta `data` del proyecto externo con formulas.json y ' +
        'multimedida.json. Esos archivos no están en el repo. Ejemplo:\n' +
        '  COTIZADOR_DATOS_ORIGEN=D:/ruta/al/proyecto/data npx ts-node src/scripts/2026-09-13_importar_disenos_fase1.ts'
    );
  }
  const fm = JSON.parse(fs.readFileSync(RUTA_FORMULAS, 'utf8')) as Record<string, Record<string, DisenoOrigen>>;
  const mm = JSON.parse(fs.readFileSync(RUTA_MULTIMEDIDA, 'utf8')) as Array<{ sistemaNombre: string; diseno: string; ancho: number; alto: number }>;

  // medidas_respaldo = nº de medidas distintas extraídas para ese diseño
  const medidasPorDiseno = new Map<string, Set<string>>();
  for (const e of mm) {
    const k = `${e.sistemaNombre}::${e.diseno}`;
    if (!medidasPorDiseno.has(k)) medidasPorDiseno.set(k, new Set());
    medidasPorDiseno.get(k)!.add(`${e.ancho}x${e.alto}`);
  }

  // ─── Estado del ERP ───────────────────────────────────────────────────────
  const disExistentes = new Set(
    (await sequelize.query(`SELECT sistema||'::'||diseno k FROM cotizador.diseno`, { type: QueryTypes.SELECT }) as Array<{ k: string }>).map((r) => r.k)
  );
  const codigosProducto = new Set(
    (await sequelize.query(`SELECT codigo FROM cotizador.producto`, { type: QueryTypes.SELECT }) as Array<{ codigo: string }>).map((r) => r.codigo)
  );

  // Mapa gemelo (sistema, refCualquiera) -> datos del perfil ya mapeado
  const filasPerfilErp = await sequelize.query(
    `SELECT d.sistema, p.ref, p.ref_original, p.descripcion, p.codigos_por_color, p.es_alfajia
       FROM cotizador.diseno_perfil p JOIN cotizador.diseno d ON d.id = p.diseno_id`,
    { type: QueryTypes.SELECT }
  ) as Array<{ sistema: string; ref: string; ref_original: string | null; descripcion: string | null; codigos_por_color: Record<string, string>; es_alfajia: boolean }>;

  const gemelo = new Map<string, Gemelo>();
  for (const f of filasPerfilErp) {
    const tieneColor = f.codigos_por_color && Object.keys(f.codigos_por_color).length > 0;
    if (!tieneColor) continue;
    for (const r of [f.ref, f.ref_original].filter(Boolean) as string[]) {
      const clave = `${f.sistema}||${r}`;
      if (!gemelo.has(clave)) {
        gemelo.set(clave, {
          ref: f.ref, ref_original: f.ref_original,
          codigos_por_color: f.codigos_por_color, es_alfajia: f.es_alfajia, descripcion: f.descripcion,
        });
      }
    }
  }

  // ─── Selección: derivar la lista de diseños a importar ──────────────────────
  const esCompleto = (d: DisenoOrigen) => (d.perfiles ?? []).filter((p) => p.formula).length >= 4 && (d.vidrios ?? []).length >= 1;

  interface Preparado {
    id: string; sistema: string; diseno: string; etiqueta: string | null; paneles: number; medidasRespaldo: number;
    panelesLetras: number; divergePaneles: boolean;
    perfiles: Array<Record<string, unknown>>; vidrios: Array<Record<string, unknown>>; accesorios: Array<Record<string, unknown>>;
  }
  const preparados: Preparado[] = [];
  const descartados: Array<{ id: string; motivo: string }> = [];

  for (const sistema of SISTEMAS) {
    const disenos = fm[sistema] ?? {};
    for (const diseno of Object.keys(disenos)) {
      const id = `${sistema}::${diseno}`;
      if (disExistentes.has(id)) continue; // ya está
      const d = disenos[diseno];
      if (!esCompleto(d)) { descartados.push({ id, motivo: `degenerado (${(d.perfiles ?? []).length}p / ${(d.vidrios ?? []).length}v)` }); continue; }

      // Medida de FABRICACIÓN de prueba (vano 2000×1500 mm menos la holgura de
      // 3 mm). Sirve para descartar diseños con algún perfil cuya fórmula da una
      // medida ≤ 0 a tamaño normal: es un perfil que necesita un parámetro que
      // el formulario no pide (los "Marco Nave"/"Marco" de ciertos diseños), y
      // el motor lo marcaría como línea de error permanente. No basta con que la
      // referencia esté mapeada; la fórmula tiene que dar una pieza cortable.
      const A_PRUEBA = 1997, H_PRUEBA = 1497;

      // Resolver cada perfil contra su gemelo
      const perfiles: Array<Record<string, unknown>> = [];
      let huecoRef: string | null = null;
      let codigoSinPrecio: string | null = null;
      let perfilInvalido: string | null = null;
      (d.perfiles ?? []).forEach((p, orden) => {
        const g = gemelo.get(`${sistema}||${p.ref}`);
        if (!g) { huecoRef = huecoRef ?? String(p.ref); return; }
        // los códigos del gemelo deben existir en el catálogo con precio
        for (const cod of Object.values(g.codigos_por_color)) {
          if (!codigosProducto.has(cod)) codigoSinPrecio = codigoSinPrecio ?? cod;
        }
        const medidaPrueba = (p.formula?.a ?? 0) * A_PRUEBA + (p.formula?.b ?? 0) * H_PRUEBA + (p.formula?.c ?? 0);
        if (!(medidaPrueba > 0)) perfilInvalido = perfilInvalido ?? `${p.ref} "${p.descripcion}" (${Math.round(medidaPrueba)}mm)`;
        perfiles.push({
          diseno_id: id, orden,
          ref: g.ref, ref_original: g.ref_original,
          descripcion: p.descripcion ?? g.descripcion,
          cantidad: p.cantidad,
          desperdicio_pct: p.desperdicio ?? 0,
          formula_a: p.formula?.a ?? 0, formula_b: p.formula?.b ?? 0, formula_c: p.formula?.c ?? 0,
          nivel_corte: 'C', // PROVISIONAL: lo recalcula aplicar_modelos_corte
          codigos_por_color: g.codigos_por_color,
          es_alfajia: g.es_alfajia,
        });
      });

      if (huecoRef) { descartados.push({ id, motivo: `ref sin mapear: ${huecoRef}` }); continue; }
      if (codigoSinPrecio) { descartados.push({ id, motivo: `código sin precio: ${codigoSinPrecio}` }); continue; }
      if (perfilInvalido) { descartados.push({ id, motivo: `perfil da medida inválida a tamaño normal: ${perfilInvalido}` }); continue; }
      if (perfiles.length !== (d.perfiles ?? []).length) { descartados.push({ id, motivo: 'no todos los perfiles resolvieron' }); continue; }

      const vidrios = (d.vidrios ?? []).map((v, orden) => ({
        diseno_id: id, orden,
        descripcion: v.descripcion, cantidad: v.cantidad, desperdicio_pct: v.desperdicio ?? 0,
        formula_ancho_a: v.formulaAncho?.a ?? 0, formula_ancho_b: v.formulaAncho?.b ?? 0, formula_ancho_c: v.formulaAncho?.c ?? 0,
        formula_alto_a: v.formulaAlto?.a ?? 0, formula_alto_b: v.formulaAlto?.b ?? 0, formula_alto_c: v.formulaAlto?.c ?? 0,
        nivel_riesgo: 'C_MODELO_LINEAL_INCORRECTO', // PROVISIONAL
      }));
      const accesorios = (d.accesorios ?? []).map((a, orden) => ({
        diseno_id: id, orden, descripcion: a.descripcion, cantidad: a.cantidad ?? null, formula: null,
      }));

      // INVARIANTE DEL PROYECTO (codigoDiseno.test.ts): para todo diseño de la
      // caché, parsearCodigo debe dar confianza 'alta' y su nº de paneles debe
      // igualar la suma de paños de vidrio. Los diseños con batiente/proyectante
      // EN LÍNEA (OB, OW, OBO…) la rompen legítimamente —2 paneles pero 1 paño,
      // porque la hoja no cuenta como paño facturable en el extractor— y además
      // `cotizarPorDiseno` deriva `cuerpos` de parsearCodigo, así que un diseño
      // que el parser no entiende bien tampoco repartiría bien su geometría.
      // Esta Fase 1 importa SOLO lo que encaja sin fisuras; los de hoja-en-línea
      // se apartan para una decisión de modelo de datos propia.
      const panelesVidrio = Math.round((d.vidrios ?? []).reduce((a, v) => a + (Number(v.cantidad) || 0), 0));
      const parse = parsearCodigo(diseno, { modulo: MODULO });
      if (parse.confianza !== 'alta') { descartados.push({ id, motivo: `parser confianza=${parse.confianza}` }); continue; }
      if (parse.paneles !== panelesVidrio) { descartados.push({ id, motivo: `paneles(parser)=${parse.paneles} ≠ paños=${panelesVidrio} (diseño con hoja, revisar aparte)` }); continue; }

      preparados.push({
        id, sistema, diseno,
        etiqueta: derivarEtiqueta(diseno),
        paneles: parse.paneles, // = suma de paños (invariante) y coherente con línea 91 del test
        panelesLetras: panelesVidrio,
        divergePaneles: false,
        medidasRespaldo: medidasPorDiseno.get(id)?.size ?? 3,
        perfiles, vidrios, accesorios,
      });
    }
  }

  // ─── Informe ────────────────────────────────────────────────────────────────
  console.log(`\n${'='.repeat(78)}`);
  console.log(`FASE 1 — ${aplicar ? 'APLICAR' : 'DRY-RUN'}`);
  console.log('='.repeat(78));
  const porSis = new Map<string, Preparado[]>();
  for (const p of preparados) { if (!porSis.has(p.sistema)) porSis.set(p.sistema, []); porSis.get(p.sistema)!.push(p); }
  for (const sis of SISTEMAS) {
    const lista = porSis.get(sis) ?? [];
    console.log(`\n${sis}: ${lista.length} diseños`);
    for (const p of lista) {
      console.log(`  ${p.diseno.padEnd(22)} paneles=${p.paneles} perf=${p.perfiles.length} vid=${p.vidrios.length} acc=${p.accesorios.length} resp=${p.medidasRespaldo}  "${p.etiqueta}"`);
    }
  }
  // Descartados agrupados por motivo, para ver qué queda fuera y por qué
  const porMotivo = new Map<string, string[]>();
  for (const d of descartados) {
    const clave = d.motivo.replace(/[:=].*/, '').trim();
    if (!porMotivo.has(clave)) porMotivo.set(clave, []);
    porMotivo.get(clave)!.push(d.id.split('::')[1]);
  }
  console.log('\n=== descartados por motivo ===');
  for (const [motivo, ids] of porMotivo) {
    console.log(`  ${motivo} (${ids.length}): ${ids.slice(0, 12).join(', ')}${ids.length > 12 ? '…' : ''}`);
  }
  console.log(`\nTOTAL a importar: ${preparados.length} diseños, ` +
    `${preparados.reduce((a, p) => a + p.perfiles.length, 0)} perfiles, ` +
    `${preparados.reduce((a, p) => a + p.vidrios.length, 0)} vidrios, ` +
    `${preparados.reduce((a, p) => a + p.accesorios.length, 0)} accesorios`);
  console.log(`Descartados (no cotizables): ${descartados.length}`);

  if (!aplicar) {
    console.log('\n(DRY-RUN: no se escribió nada. Vuelve a correr con --aplicar para insertar.)');
    await sequelize.close();
    return;
  }

  // ─── Aplicar ──────────────────────────────────────────────────────────────
  const idsImportados = preparados.map((p) => p.id);
  await sequelize.transaction(async (t: Transaction) => {
    // La etiqueta de un diseño apilado grande (WWWWWW_OOOOOO) llega a 125 chars;
    // la columna era VARCHAR(120). Ampliar el límite no reescribe la tabla ni
    // afecta a las 138 filas existentes. Idempotente.
    await sequelize.query(`ALTER TABLE cotizador.diseno ALTER COLUMN etiqueta TYPE VARCHAR(200)`, { transaction: t });

    // Idempotencia: si alguno ya existiera (re-corrida), abortar en vez de duplicar.
    const yaExiste = await sequelize.query(
      `SELECT count(*)::int n FROM cotizador.diseno WHERE id IN (:ids)`,
      { replacements: { ids: idsImportados }, type: QueryTypes.SELECT, transaction: t }
    ) as Array<{ n: number }>;
    if (yaExiste[0].n > 0) throw new Error(`${yaExiste[0].n} de los diseños a importar ya existen: aborto para no duplicar. ¿Ya se corrió?`);

    for (const p of preparados) {
      await sequelize.query(
        `INSERT INTO cotizador.diseno (id, modulo, sistema, diseno, etiqueta, paneles, nivel_corte, nivel_vidrio, nivel_perfiles, medidas_respaldo, cotizable, refs_sin_precio)
         VALUES (:id, :modulo, :sistema, :diseno, :etiqueta, :paneles, 'C', NULL, NULL, :resp, true, '[]'::jsonb)`,
        { replacements: { id: p.id, modulo: MODULO, sistema: p.sistema, diseno: p.diseno, etiqueta: p.etiqueta, paneles: p.paneles, resp: p.medidasRespaldo }, transaction: t }
      );
      for (const perfil of p.perfiles) {
        await sequelize.query(
          `INSERT INTO cotizador.diseno_perfil (diseno_id, orden, ref, ref_original, descripcion, cantidad, desperdicio_pct, formula_a, formula_b, formula_c, nivel_corte, codigos_por_color, es_alfajia)
           VALUES (:diseno_id, :orden, :ref, :ref_original, :descripcion, :cantidad, :desperdicio_pct, :formula_a, :formula_b, :formula_c, 'C', :codigos_por_color, :es_alfajia)`,
          { replacements: { ...perfil, codigos_por_color: JSON.stringify(perfil.codigos_por_color) } as Record<string, unknown>, transaction: t }
        );
      }
      for (const v of p.vidrios) {
        await sequelize.query(
          `INSERT INTO cotizador.diseno_vidrio (diseno_id, orden, descripcion, cantidad, desperdicio_pct, formula_ancho_a, formula_ancho_b, formula_ancho_c, formula_alto_a, formula_alto_b, formula_alto_c, nivel_riesgo)
           VALUES (:diseno_id, :orden, :descripcion, :cantidad, :desperdicio_pct, :formula_ancho_a, :formula_ancho_b, :formula_ancho_c, :formula_alto_a, :formula_alto_b, :formula_alto_c, :nivel_riesgo)`,
          { replacements: v as Record<string, unknown>, transaction: t }
        );
      }
      for (const a of p.accesorios) {
        await sequelize.query(
          `INSERT INTO cotizador.diseno_accesorio (diseno_id, orden, descripcion, cantidad, formula)
           VALUES (:diseno_id, :orden, :descripcion, :cantidad, NULL)`,
          { replacements: a as Record<string, unknown>, transaction: t }
        );
      }
    }

    // Verificación ANTES del COMMIT
    const cuenta = await sequelize.query(
      `SELECT count(*)::int n FROM cotizador.diseno WHERE id IN (:ids)`,
      { replacements: { ids: idsImportados }, type: QueryTypes.SELECT, transaction: t }
    ) as Array<{ n: number }>;
    if (cuenta[0].n !== preparados.length) throw new Error(`Se esperaban ${preparados.length} cabeceras, hay ${cuenta[0].n} — aborto.`);

    const huerfanos = await sequelize.query(
      `SELECT count(*)::int n FROM cotizador.diseno_perfil p WHERE p.diseno_id IN (:ids)
         AND NOT EXISTS (SELECT 1 FROM cotizador.diseno d WHERE d.id = p.diseno_id)`,
      { replacements: { ids: idsImportados }, type: QueryTypes.SELECT, transaction: t }
    ) as Array<{ n: number }>;
    if (huerfanos[0].n > 0) throw new Error('Hay perfiles huérfanos — aborto.');
  });

  fs.mkdirSync(path.dirname(SALIDA_IDS), { recursive: true });
  fs.writeFileSync(SALIDA_IDS, JSON.stringify({ importadoEn: new Date().toISOString(), sistemas: SISTEMAS, ids: idsImportados }, null, 2));

  console.log(`\n✓ Importados ${idsImportados.length} diseños.`);
  console.log(`✓ Registro en ${path.basename(SALIDA_IDS)} (para --revertir).`);
  console.log('\nSIGUIENTE (obligatorio, para que tengan modelos de corte y niveles reales):');
  console.log('  npx ts-node src/scripts/2026-09-13_reconstruir_modelos_corte.ts');
  console.log('  npx ts-node src/scripts/2026-09-13_aplicar_modelos_corte.ts');

  await sequelize.close();
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error('FALLO:', e instanceof Error ? e.message : e); process.exit(1); });

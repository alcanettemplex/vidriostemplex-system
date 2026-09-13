/**
 * Script: 2026-09-13_aplicar_modelos_corte.ts
 *
 * Aplica a la base los modelos de corte reconstruidos por
 * `2026-09-13_reconstruir_modelos_corte.ts` y recalcula los niveles A/B/C con
 * el criterio nuevo.
 *
 * QUÉ CAMBIA Y POR QUÉ
 * --------------------
 * Hasta hoy cada pieza se calcula con una recta `a*ancho + b*alto + c` ajustada
 * sobre 3 observaciones. Esa recta no es el cálculo real de AlumSoftware: el real
 * es `trunc((ancho - k) / nº de paneles)`. Como las 3 medidas de extracción eran
 * múltiplos de 100, la división caía exacta y el truncamiento quedó invisible; la
 * regresión lo absorbió desplazando la pendiente (1/3 = 0,3333… quedó como
 * 0,334). Ese desplazamiento produce un error que CRECE con el tamaño del vano,
 * y es el origen del "puede desviarse hasta 3,3 mm" del nivel C.
 *
 * Este script guarda, junto a la recta (que se conserva intacta), el modelo entero
 * reconstruido. `motorDespiece` usa el modelo entero cuando existe y cae a la
 * recta cuando no. El error deja de crecer con el tamaño y queda acotado por la
 * `dispersionMm` de cada pieza.
 *
 * QUÉ SIGNIFICAN LOS NIVELES NUEVOS
 * ---------------------------------
 * El nivel deja de describir "qué pinta tienen los coeficientes" y pasa a
 * describir CUÁNTO PUEDE EQUIVOCARSE la medida:
 *
 *   A -> modelo entero con dispersión 0 mm: todos los modelos compatibles con las
 *        observaciones dan exactamente el mismo número. La medida está determinada.
 *   B -> modelo entero con dispersión ≤ 1 mm: hay varios modelos compatibles y
 *        difieren como mucho en 1 mm. Acotado, pero no exacto.
 *   C -> sin modelo entero: sigue con la recta y su error no está acotado.
 *
 * OJO — QUÉ **NO** SIGNIFICA EL NIVEL A
 * -------------------------------------
 * "Determinada" es una afirmación sobre la ARITMÉTICA de AlumSoftware, no sobre
 * el taller. Que la medida esté determinada no dice que sea la medida correcta
 * para cortar: eso depende del margen de corte de cada perfil, que se calibra
 * aparte contra piezas reales (`cotizador.calibracion_margen`) y sigue sin
 * medir. La aptitud para emitir una orden de corte la decide `aptitudOrden.ts`
 * con ocho condiciones, de las que el nivel es sólo una.
 *
 * REVERSIBLE
 *   --revertir  deja las columnas de modelo en NULL y restaura los niveles
 *               previos desde el respaldo que este mismo script escribe.
 *
 * USO
 *   npx ts-node src/scripts/2026-09-13_aplicar_modelos_corte.ts [--revertir]
 */
import fs from 'fs';
import path from 'path';
import { QueryTypes, Transaction } from 'sequelize';

// El .env vive en backend-api/. Se carga por ruta absoluta y ANTES de importar
// config/database (que construye Sequelize al evaluarse), para que el script
// funcione igual desde la raíz del monorepo o desde backend-api.
import dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const ENTRADA = path.join(__dirname, 'datos_cotizador', 'modelos_corte.json');
const RESPALDO = path.join(__dirname, 'datos_cotizador', 'niveles_previos_2026-09-13.json');

type NombreOp = 'exacto' | 'trunc' | 'round' | 'ceil';
interface ModeloCorte { p: number; q: number; r: number; n: number; op: NombreOp }

interface ArchivoModelos {
  generadoEn: string;
  disenos: Record<string, {
    perfiles: Array<{ orden: number; ref?: string; descripcion: string | null; modelo: ModeloCorte; dispersionMm: number; candidatos: number }>;
    vidrios: Array<{
      orden: number; descripcion: string | null;
      ancho: { modelo: ModeloCorte; dispersionMm: number; candidatos: number };
      alto: { modelo: ModeloCorte; dispersionMm: number; candidatos: number };
    }>;
  }>;
}

/**
 * Nivel de una pieza a partir de su incertidumbre. `null` = sin modelo entero.
 *
 * El caso `p = q = 0` (la medida no depende del vano) se degrada a C aunque su
 * dispersión sea 0. La aritmética es exacta —el origen devuelve esa constante de
 * verdad— pero una pieza que no escala con la ventana significa que el diseño se
 * calcula con un parámetro que el formulario no pide, y esa medida no sirve para
 * cortar. Llamarla "determinada" sería cierto sobre la cuenta y falso sobre la
 * pieza; `motorDespiece` explica el motivo real en la advertencia.
 */
function nivelDe(dispersionMm: number | null, modelo?: ModeloCorte): 'A' | 'B' | 'C' {
  if (dispersionMm === null) return 'C';
  if (modelo && modelo.p === 0 && modelo.q === 0) return 'C';
  if (dispersionMm === 0) return 'A';
  if (dispersionMm <= 1) return 'B';
  return 'C';
}

const ORDEN_NIVEL = ['A', 'B', 'C'];
const peorNivel = (a: string, b: string): string =>
  ORDEN_NIVEL.indexOf(b) > ORDEN_NIVEL.indexOf(a) ? b : a;

const RIESGO_POR_NIVEL: Record<string, string> = {
  A: 'A_EXACTA',
  B: 'B_DIVISION_LIMPIA',
  C: 'C_MODELO_LINEAL_INCORRECTO',
};

async function main() {
  const revertir = process.argv.includes('--revertir');
  const { default: sequelize } = await import('../config/database');

  // ─── Columnas (idempotente) ───────────────────────────────────────────────
  // Se crean también al revertir: "revertir" vacía los datos, no desmonta el
  // esquema, para que aplicar de nuevo no tenga que recrear nada.
  const columnasPerfil = ['modelo_p', 'modelo_q', 'modelo_r', 'modelo_n'];
  const columnasVidrio = ['ancho', 'alto'].flatMap((lado) =>
    ['p', 'q', 'r', 'n'].map((c) => `modelo_${lado}_${c}`)
  );

  await sequelize.transaction(async (t: Transaction) => {
    for (const c of columnasPerfil) {
      await sequelize.query(
        `ALTER TABLE cotizador.diseno_perfil ADD COLUMN IF NOT EXISTS ${c} INTEGER`,
        { transaction: t }
      );
    }
    await sequelize.query(
      `ALTER TABLE cotizador.diseno_perfil ADD COLUMN IF NOT EXISTS modelo_op VARCHAR(6)`,
      { transaction: t }
    );
    await sequelize.query(
      `ALTER TABLE cotizador.diseno_perfil ADD COLUMN IF NOT EXISTS modelo_dispersion_mm DOUBLE PRECISION`,
      { transaction: t }
    );
    for (const c of columnasVidrio) {
      await sequelize.query(
        `ALTER TABLE cotizador.diseno_vidrio ADD COLUMN IF NOT EXISTS ${c} INTEGER`,
        { transaction: t }
      );
    }
    for (const lado of ['ancho', 'alto']) {
      await sequelize.query(
        `ALTER TABLE cotizador.diseno_vidrio ADD COLUMN IF NOT EXISTS modelo_${lado}_op VARCHAR(6)`,
        { transaction: t }
      );
      await sequelize.query(
        `ALTER TABLE cotizador.diseno_vidrio ADD COLUMN IF NOT EXISTS modelo_${lado}_dispersion_mm DOUBLE PRECISION`,
        { transaction: t }
      );
    }
  });
  console.log('✓ columnas de modelo presentes');

  // ─── Revertir ─────────────────────────────────────────────────────────────
  if (revertir) {
    if (!fs.existsSync(RESPALDO)) {
      throw new Error(`No hay respaldo de niveles en ${RESPALDO}: no se puede revertir sin él.`);
    }
    const previo = JSON.parse(fs.readFileSync(RESPALDO, 'utf8')) as {
      perfiles: Array<{ diseno_id: string; orden: number; nivel_corte: string }>;
      vidrios: Array<{ diseno_id: string; orden: number; nivel_riesgo: string | null }>;
      disenos: Array<{ id: string; nivel_corte: string; nivel_vidrio: string | null; nivel_perfiles: string | null }>;
    };

    await sequelize.transaction(async (t: Transaction) => {
      await sequelize.query(
        `UPDATE cotizador.diseno_perfil SET modelo_p=NULL, modelo_q=NULL, modelo_r=NULL,
            modelo_n=NULL, modelo_op=NULL, modelo_dispersion_mm=NULL`,
        { transaction: t }
      );
      await sequelize.query(
        `UPDATE cotizador.diseno_vidrio SET
            modelo_ancho_p=NULL, modelo_ancho_q=NULL, modelo_ancho_r=NULL, modelo_ancho_n=NULL,
            modelo_ancho_op=NULL, modelo_ancho_dispersion_mm=NULL,
            modelo_alto_p=NULL, modelo_alto_q=NULL, modelo_alto_r=NULL, modelo_alto_n=NULL,
            modelo_alto_op=NULL, modelo_alto_dispersion_mm=NULL`,
        { transaction: t }
      );
      for (const p of previo.perfiles) {
        await sequelize.query(
          `UPDATE cotizador.diseno_perfil SET nivel_corte=:n WHERE diseno_id=:d AND orden=:o`,
          { replacements: { n: p.nivel_corte, d: p.diseno_id, o: p.orden }, transaction: t }
        );
      }
      for (const v of previo.vidrios) {
        await sequelize.query(
          `UPDATE cotizador.diseno_vidrio SET nivel_riesgo=:n WHERE diseno_id=:d AND orden=:o`,
          { replacements: { n: v.nivel_riesgo, d: v.diseno_id, o: v.orden }, transaction: t }
        );
      }
      for (const d of previo.disenos) {
        await sequelize.query(
          `UPDATE cotizador.diseno SET nivel_corte=:c, nivel_vidrio=:v, nivel_perfiles=:p WHERE id=:id`,
          { replacements: { c: d.nivel_corte, v: d.nivel_vidrio, p: d.nivel_perfiles, id: d.id }, transaction: t }
        );
      }
    });
    console.log('✓ revertido: modelos borrados y niveles restaurados desde el respaldo');
    await sequelize.close();
    return;
  }

  // ─── Aplicar ──────────────────────────────────────────────────────────────
  if (!fs.existsSync(ENTRADA)) {
    throw new Error(
      `No existe ${ENTRADA}. Genéralo primero con:\n` +
        `  npx ts-node src/scripts/2026-09-13_reconstruir_modelos_corte.ts`
    );
  }
  const archivo = JSON.parse(fs.readFileSync(ENTRADA, 'utf8')) as ArchivoModelos;
  console.log(`Modelos generados el ${archivo.generadoEn}: ${Object.keys(archivo.disenos).length} diseños`);

  // Respaldo de los niveles actuales ANTES de tocar nada.
  const [pPrev, vPrev, dPrev] = await Promise.all([
    sequelize.query(`SELECT diseno_id, orden, nivel_corte FROM cotizador.diseno_perfil ORDER BY diseno_id, orden`, { type: QueryTypes.SELECT }),
    sequelize.query(`SELECT diseno_id, orden, nivel_riesgo FROM cotizador.diseno_vidrio ORDER BY diseno_id, orden`, { type: QueryTypes.SELECT }),
    sequelize.query(`SELECT id, nivel_corte, nivel_vidrio, nivel_perfiles FROM cotizador.diseno ORDER BY id`, { type: QueryTypes.SELECT }),
  ]);
  if (!fs.existsSync(RESPALDO)) {
    fs.writeFileSync(RESPALDO, JSON.stringify({ tomadoEn: new Date().toISOString(), perfiles: pPrev, vidrios: vPrev, disenos: dPrev }, null, 2));
    console.log(`✓ respaldo de niveles previos escrito en ${path.basename(RESPALDO)}`);
  } else {
    console.log(`· respaldo ya existente, se conserva el original (${path.basename(RESPALDO)})`);
  }

  const resumen = {
    perfilesActualizados: 0,
    vidriosActualizados: 0,
    disenosActualizados: 0,
    perfilesSinModelo: 0,
    vidriosSinModelo: 0,
  };
  const nivelesPerfil = new Map<string, number>();
  const nivelesVidrio = new Map<string, number>();
  const nivelesDiseno = new Map<string, number>();
  const cuenta = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

  await sequelize.transaction(async (t: Transaction) => {
    for (const [disenoId, cont] of Object.entries(archivo.disenos)) {
      let peorPerfil = 'A';
      let peorVidrio: string | null = null;
      const ordenesPerfilConModelo = new Set<number>();
      const ordenesVidrioConModelo = new Set<number>();

      for (const p of cont.perfiles) {
        const nivel = nivelDe(p.dispersionMm, p.modelo);
        await sequelize.query(
          `UPDATE cotizador.diseno_perfil
              SET modelo_p=:p, modelo_q=:q, modelo_r=:r, modelo_n=:n, modelo_op=:op,
                  modelo_dispersion_mm=:disp, nivel_corte=:nivel
            WHERE diseno_id=:d AND orden=:o`,
          {
            replacements: {
              p: p.modelo.p, q: p.modelo.q, r: p.modelo.r, n: p.modelo.n, op: p.modelo.op,
              disp: p.dispersionMm, nivel, d: disenoId, o: p.orden,
            },
            transaction: t,
          }
        );
        ordenesPerfilConModelo.add(p.orden);
        peorPerfil = peorNivel(peorPerfil, nivel);
        cuenta(nivelesPerfil, nivel);
        resumen.perfilesActualizados++;
      }

      for (const v of cont.vidrios) {
        // El paño lo limita su peor lado: un ancho exacto con un alto dudoso
        // sigue siendo un paño dudoso.
        const nivel = peorNivel(
          nivelDe(v.ancho.dispersionMm, v.ancho.modelo),
          nivelDe(v.alto.dispersionMm, v.alto.modelo)
        );
        await sequelize.query(
          `UPDATE cotizador.diseno_vidrio
              SET modelo_ancho_p=:ap, modelo_ancho_q=:aq, modelo_ancho_r=:ar, modelo_ancho_n=:an,
                  modelo_ancho_op=:aop, modelo_ancho_dispersion_mm=:adisp,
                  modelo_alto_p=:hp, modelo_alto_q=:hq, modelo_alto_r=:hr, modelo_alto_n=:hn,
                  modelo_alto_op=:hop, modelo_alto_dispersion_mm=:hdisp,
                  nivel_riesgo=:riesgo
            WHERE diseno_id=:d AND orden=:o`,
          {
            replacements: {
              ap: v.ancho.modelo.p, aq: v.ancho.modelo.q, ar: v.ancho.modelo.r, an: v.ancho.modelo.n,
              aop: v.ancho.modelo.op, adisp: v.ancho.dispersionMm,
              hp: v.alto.modelo.p, hq: v.alto.modelo.q, hr: v.alto.modelo.r, hn: v.alto.modelo.n,
              hop: v.alto.modelo.op, hdisp: v.alto.dispersionMm,
              riesgo: RIESGO_POR_NIVEL[nivel], d: disenoId, o: v.orden,
            },
            transaction: t,
          }
        );
        ordenesVidrioConModelo.add(v.orden);
        peorVidrio = peorVidrio === null ? nivel : peorNivel(peorVidrio, nivel);
        cuenta(nivelesVidrio, nivel);
        resumen.vidriosActualizados++;
      }

      // Las piezas de este diseño que NO recibieron modelo se quedan con la
      // recta: son nivel C por definición (error no acotado), y arrastran el
      // nivel del diseño entero.
      const sinModeloPerfil = (await sequelize.query(
        `SELECT orden FROM cotizador.diseno_perfil WHERE diseno_id=:d AND modelo_n IS NULL`,
        { replacements: { d: disenoId }, type: QueryTypes.SELECT, transaction: t }
      )) as Array<{ orden: number }>;
      for (const s of sinModeloPerfil) {
        await sequelize.query(
          `UPDATE cotizador.diseno_perfil SET nivel_corte='C' WHERE diseno_id=:d AND orden=:o`,
          { replacements: { d: disenoId, o: s.orden }, transaction: t }
        );
        peorPerfil = peorNivel(peorPerfil, 'C');
        cuenta(nivelesPerfil, 'C');
        resumen.perfilesSinModelo++;
      }

      const sinModeloVidrio = (await sequelize.query(
        `SELECT orden FROM cotizador.diseno_vidrio WHERE diseno_id=:d AND modelo_ancho_n IS NULL`,
        { replacements: { d: disenoId }, type: QueryTypes.SELECT, transaction: t }
      )) as Array<{ orden: number }>;
      for (const s of sinModeloVidrio) {
        await sequelize.query(
          `UPDATE cotizador.diseno_vidrio SET nivel_riesgo='C_MODELO_LINEAL_INCORRECTO' WHERE diseno_id=:d AND orden=:o`,
          { replacements: { d: disenoId, o: s.orden }, transaction: t }
        );
        peorVidrio = peorVidrio === null ? 'C' : peorNivel(peorVidrio, 'C');
        cuenta(nivelesVidrio, 'C');
        resumen.vidriosSinModelo++;
      }

      const nivelCorte = peorVidrio === null ? peorPerfil : peorNivel(peorPerfil, peorVidrio);
      await sequelize.query(
        `UPDATE cotizador.diseno
            SET nivel_corte=:c, nivel_perfiles=:p, nivel_vidrio=:v
          WHERE id=:id`,
        { replacements: { c: nivelCorte, p: peorPerfil, v: peorVidrio, id: disenoId }, transaction: t }
      );
      cuenta(nivelesDiseno, nivelCorte);
      resumen.disenosActualizados++;
    }

    // ─── Verificación ANTES de confirmar ────────────────────────────────────
    // Un modelo guardado tiene que estar completo: si `n` está y `op` no, el
    // motor evaluaría con undefined y produciría NaN en silencio.
    const incompletos = (await sequelize.query(
      `SELECT count(*)::int AS n FROM cotizador.diseno_perfil
        WHERE (modelo_n IS NULL) <> (modelo_op IS NULL)
           OR (modelo_n IS NOT NULL AND (modelo_p IS NULL OR modelo_q IS NULL OR modelo_r IS NULL))`,
      { type: QueryTypes.SELECT, transaction: t }
    )) as Array<{ n: number }>;
    if (incompletos[0].n > 0) {
      throw new Error(`${incompletos[0].n} perfiles quedaron con modelo incompleto — se aborta.`);
    }
    const incompletosV = (await sequelize.query(
      `SELECT count(*)::int AS n FROM cotizador.diseno_vidrio
        WHERE (modelo_ancho_n IS NULL) <> (modelo_ancho_op IS NULL)
           OR (modelo_alto_n IS NULL) <> (modelo_alto_op IS NULL)
           OR (modelo_ancho_n IS NOT NULL AND modelo_alto_n IS NULL)`,
      { type: QueryTypes.SELECT, transaction: t }
    )) as Array<{ n: number }>;
    if (incompletosV[0].n > 0) {
      throw new Error(`${incompletosV[0].n} paños quedaron con modelo incompleto — se aborta.`);
    }
    const divisorCero = (await sequelize.query(
      `SELECT count(*)::int AS n FROM cotizador.diseno_perfil WHERE modelo_n = 0
       UNION ALL SELECT count(*)::int FROM cotizador.diseno_vidrio WHERE modelo_ancho_n = 0 OR modelo_alto_n = 0`,
      { type: QueryTypes.SELECT, transaction: t }
    )) as Array<{ n: number }>;
    if (divisorCero.some((r) => r.n > 0)) {
      throw new Error('Hay modelos con divisor 0 — se aborta.');
    }
  });

  // ─── Informe ──────────────────────────────────────────────────────────────
  console.log('\n=== APLICADO ===');
  console.log(`  perfiles con modelo   : ${resumen.perfilesActualizados}`);
  console.log(`  perfiles sin modelo   : ${resumen.perfilesSinModelo} (siguen con la recta, nivel C)`);
  console.log(`  paños con modelo      : ${resumen.vidriosActualizados}`);
  console.log(`  paños sin modelo      : ${resumen.vidriosSinModelo}`);
  console.log(`  diseños recalculados  : ${resumen.disenosActualizados}`);

  const fmt = (m: Map<string, number>) =>
    ORDEN_NIVEL.map((n) => `${n}=${m.get(n) ?? 0}`).join('  ');
  console.log(`\n  niveles de perfil  : ${fmt(nivelesPerfil)}`);
  console.log(`  niveles de paño    : ${fmt(nivelesVidrio)}`);
  console.log(`  niveles de diseño  : ${fmt(nivelesDiseno)}`);

  const despues = (await sequelize.query(
    `SELECT nivel_corte AS v, count(*)::int AS n FROM cotizador.diseno GROUP BY 1 ORDER BY 1`,
    { type: QueryTypes.SELECT }
  )) as Array<{ v: string; n: number }>;
  console.log('\n  verificado en BD (cotizador.diseno.nivel_corte): ' + despues.map((r) => `${r.v}=${r.n}`).join('  '));

  await sequelize.close();
}

main()
  .then(() => process.exit(0))
  .catch(async (e) => {
    console.error('FALLO:', e instanceof Error ? e.message : e);
    process.exit(1);
  });

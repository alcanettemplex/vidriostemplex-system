// Etapa 1 del módulo Cotizador — verificación. Asserta (no imprime y ya):
// conteos exactos, ausencia del nombre del software externo de origen en los
// datos migrados, y el round-trip de fidelidad: reconstruye
// disenos.json / catalogo.json / catalogo-provisional.json
// en memoria desde las tablas y los compara campo a campo contra el archivo
// de origen. Es la única forma de saber que un coeficiente DOUBLE no perdió
// un dígito en el viaje por Postgres.
//
// Uso: npx ts-node src/scripts/2026-09-07_verificar_datos_cotizador.ts
import * as fs from 'fs';
import * as path from 'path';
import {
  sequelize,
  CotizadorProducto,
  CotizadorDiseno,
  CotizadorDisenoPerfil,
  CotizadorDisenoVidrio,
  CotizadorDisenoAccesorio,
  CotizadorMapeoAccesorio,
  CotizadorParametro,
  CotizadorEmpresa,
  CotizadorEmpresaLogo,
  CotizadorConsecutivo,
} from '../models';

const DATOS_DIR = path.join(__dirname, 'datos_cotizador');
function leerJSON<T = any>(nombre: string): T {
  return JSON.parse(fs.readFileSync(path.join(DATOS_DIR, nombre), 'utf8'));
}

let fallos = 0;
function assert(cond: boolean, mensaje: string) {
  if (cond) {
    console.log(`✓ ${mensaje}`);
  } else {
    console.error(`✗ FALLO: ${mensaje}`);
    fallos++;
  }
}

// Compara dos números con tolerancia mínima (por si acaso; DOUBLE no debería
// perder precisión, pero la comparación no debe reventar por -0 vs 0, etc.)
function numIguales(a: number | null | undefined, b: number | null | undefined): boolean {
  const na = a ?? 0;
  const nb = b ?? 0;
  return Math.abs(na - nb) < 1e-9;
}

// Deep-equal insensible al orden de claves. Necesario porque JSONB de
// Postgres NO preserva el orden original de las claves de un objeto (lo
// normaliza internamente) — un JSON.stringify directo compararía strings
// distintos para contenido idéntico, dando falsos negativos sistemáticos.
function jsonIgual(a: any, b: any): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a == null && b == null;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => jsonIgual(v, b[i]));
  }
  if (typeof a === 'object') {
    const ka = Object.keys(a).sort();
    const kb = Object.keys(b).sort();
    if (ka.length !== kb.length || ka.some((k, i) => k !== kb[i])) return false;
    return ka.every((k) => jsonIgual(a[k], b[k]));
  }
  return false;
}

async function verificarConteos() {
  const producto = await CotizadorProducto.count();
  const catalogo = await CotizadorProducto.count({ where: { origen: 'CATALOGO' } });
  const provisional = await CotizadorProducto.count({ where: { origen: 'PROVISIONAL' } });
  // 558 / 432 desde el 2026-09-11: la regeneración contra el Excel matriz dio
  // de alta dos códigos que la siembra original no tenía (KDG1106 y KOP0102).
  // Los 126 provisionales no se movieron.
  assert(producto === 558, `cotizador_producto = 558 (obtenido: ${producto})`);
  assert(catalogo === 432, `  de los cuales CATALOGO = 432 (obtenido: ${catalogo})`);
  assert(provisional === 126, `  de los cuales PROVISIONAL = 126 (obtenido: ${provisional})`);

  const diseno = await CotizadorDiseno.count();
  const cotizables = await CotizadorDiseno.count({ where: { cotizable: true } });
  assert(diseno === 138, `cotizador_diseno = 138 (obtenido: ${diseno})`);
  assert(cotizables === 120, `  de los cuales cotizable=true = 120 (obtenido: ${cotizables})`);

  const perfil = await CotizadorDisenoPerfil.count();
  const vidrio = await CotizadorDisenoVidrio.count();
  const accesorio = await CotizadorDisenoAccesorio.count();
  assert(perfil === 983, `cotizador_diseno_perfil = 983 (obtenido: ${perfil})`);
  assert(vidrio === 218, `cotizador_diseno_vidrio = 218 (obtenido: ${vidrio})`);
  assert(accesorio === 1049, `cotizador_diseno_accesorio = 1049 (obtenido: ${accesorio})`);

  const mapeo = await CotizadorMapeoAccesorio.count();
  assert(mapeo === 54, `cotizador_mapeo_accesorio = 54 (obtenido: ${mapeo})`);

  const empresa = await CotizadorEmpresa.findByPk(1);
  const logo = await CotizadorEmpresaLogo.findByPk(1);
  assert(!!empresa, 'cotizador_empresa tiene 1 fila');
  const condiciones = (empresa?.getDataValue('condiciones_comerciales') ?? []) as any[];
  assert(condiciones.length === 11, `  condiciones_comerciales tiene 11 elementos (obtenido: ${condiciones.length})`);
  const dataUri = logo?.getDataValue('data_uri') as string | undefined;
  assert(!!dataUri && dataUri.length === 23342, `cotizador_empresa_logo.data_uri tiene 23342 chars (obtenido: ${dataUri?.length})`);

  const parametro = await CotizadorParametro.findByPk(1);
  assert(!!parametro, 'cotizador_parametro tiene 1 fila');
  assert(numIguales(parametro?.getDataValue('aiu'), 0.96), `  aiu = 0.96 (obtenido: ${parametro?.getDataValue('aiu')})`);
  assert(numIguales(parametro?.getDataValue('iva'), 0.19), `  iva = 0.19 (obtenido: ${parametro?.getDataValue('iva')})`);
  // 40000 = GTFA26 del Excel matriz. Antes se afirmaba 25000, valor heredado de
  // la siembra de 2026-09-07 y corregido por la migración del 2026-09-11.
  assert(numIguales(parametro?.getDataValue('flete_fijo'), 40000), `  flete_fijo = 40000 (obtenido: ${parametro?.getDataValue('flete_fijo')})`);
  assert(numIguales(parametro?.getDataValue('smo_cabinas'), 120000), `  smo_cabinas = 120000 (obtenido: ${parametro?.getDataValue('smo_cabinas')})`);
  assert(numIguales(parametro?.getDataValue('smo_fachadas'), 85000), `  smo_fachadas = 85000 (obtenido: ${parametro?.getDataValue('smo_fachadas')})`);
  assert(numIguales(parametro?.getDataValue('smo_armada_ventanas'), 60000), `  smo_armada_ventanas = 60000 (obtenido: ${parametro?.getDataValue('smo_armada_ventanas')})`);
  assert(numIguales(parametro?.getDataValue('smo_persiana'), 110000), `  smo_persiana = 110000 (obtenido: ${parametro?.getDataValue('smo_persiana')})`);

  const consecutivo = await CotizadorConsecutivo.findByPk('cotizacion');
  assert(!!consecutivo, 'cotizador_consecutivo tiene la fila "cotizacion"');
  assert(consecutivo?.getDataValue('valor') === 0, `  valor = 0 (obtenido: ${consecutivo?.getDataValue('valor')})`);
}

// El nombre del software externo de origen no puede aparecer en ningún dato
// migrado (decisión 11). Se arma la palabra a buscar por partes en vez de
// escribirla literal en el código, para que ni siquiera el propio verificador
// deje el string en el repositorio.
function nombreProhibido(): string {
  return ['alum', 'software'].join('');
}

async function verificarNombreFuenteExterna() {
  const patron = `%${nombreProhibido()}%`;
  const [rows]: any = await sequelize.query(
    `SELECT count(*)::int AS n FROM cotizador_producto WHERE fuente ILIKE :patron`,
    { replacements: { patron } }
  );
  assert(rows[0].n === 0, `cotizador_producto: 0 filas con el nombre del software de origen en "fuente" (obtenido: ${rows[0].n})`);

  // Barrido de todas las columnas de texto/JSONB relevantes, por si acaso.
  const [rows2]: any = await sequelize.query(
    `SELECT
      (SELECT count(*) FROM cotizador_producto WHERE descripcion ILIKE :patron) +
      (SELECT count(*) FROM cotizador_mapeo_accesorio WHERE nota ILIKE :patron) AS n`,
    { replacements: { patron } }
  );
  assert(rows2[0].n === '0' || rows2[0].n === 0, `Barrido adicional: 0 coincidencias (obtenido: ${rows2[0].n})`);
}

async function verificarRoundTripCatalogo() {
  const origen: any[] = leerJSON('catalogo.json');
  const enBD = await CotizadorProducto.findAll({ where: { origen: 'CATALOGO' }, raw: true });
  const porCodigo = new Map(enBD.map((p: any) => [p.codigo, p]));

  let ok = 0;
  for (const p of origen) {
    const fila = porCodigo.get(p.codigo);
    if (!fila) { console.error(`✗ FALLO round-trip catálogo: falta código ${p.codigo}`); fallos++; continue; }
    const iguales =
      fila.descripcion === p.descripcion &&
      fila.categoria === p.categoria &&
      fila.unidad === p.unidad &&
      numIguales(fila.costo_unitario, p.costo_unitario) &&
      numIguales(fila.precio_pa, p.precio_pa) &&
      numIguales(fila.precio_pm, p.precio_pm) &&
      numIguales(fila.precio_pb, p.precio_pb);
    if (!iguales) { console.error(`✗ FALLO round-trip catálogo: diff en ${p.codigo}`); fallos++; }
    else ok++;
  }
  assert(ok === origen.length, `Round-trip catalogo.json: ${ok}/${origen.length} productos idénticos`);
}

async function verificarRoundTripProvisional() {
  const origen = leerJSON<{ productos: any[] }>('catalogo-provisional.json').productos;
  const enBD = await CotizadorProducto.findAll({ where: { origen: 'PROVISIONAL' }, raw: true });
  const porCodigo = new Map(enBD.map((p: any) => [p.codigo, p]));

  let ok = 0;
  for (const p of origen) {
    const fila = porCodigo.get(p.codigo);
    if (!fila) { console.error(`✗ FALLO round-trip provisional: falta código ${p.codigo}`); fallos++; continue; }
    const iguales =
      fila.descripcion === p.descripcion &&
      fila.categoria === p.categoria &&
      fila.unidad === p.unidad &&
      numIguales(fila.costo_unitario, p.costo_unitario) &&
      numIguales(fila.precio_pa, p.precio_pa) &&
      numIguales(fila.precio_pm, p.precio_pm) &&
      numIguales(fila.precio_pb, p.precio_pb) &&
      fila.referencia === p.referencia &&
      fila.color === p.color &&
      fila.fuente === p.fuente && // ya neutralizado en ambos lados
      fila.acabado_exacto === p.acabadoExacto &&
      fila.sospechoso_valor_por_defecto === p.sospechosoValorPorDefecto;
    if (!iguales) { console.error(`✗ FALLO round-trip provisional: diff en ${p.codigo}`, { fila, p }); fallos++; }
    else ok++;
  }
  assert(ok === origen.length, `Round-trip catalogo-provisional.json: ${ok}/${origen.length} productos idénticos`);
}

async function verificarRoundTripDisenos() {
  const disenos = leerJSON<{ disenos: any[] }>('disenos.json').disenos;

  const [disenoRows, perfilRows, vidrioRows, accesorioRows] = await Promise.all([
    CotizadorDiseno.findAll({ raw: true }),
    CotizadorDisenoPerfil.findAll({ raw: true, order: [['diseno_id', 'ASC'], ['orden', 'ASC']] }),
    CotizadorDisenoVidrio.findAll({ raw: true, order: [['diseno_id', 'ASC'], ['orden', 'ASC']] }),
    CotizadorDisenoAccesorio.findAll({ raw: true, order: [['diseno_id', 'ASC'], ['orden', 'ASC']] }),
  ]);

  const disenoPorId = new Map(disenoRows.map((d: any) => [d.id, d]));
  const perfilesPorDiseno = new Map<string, any[]>();
  for (const p of perfilRows as any[]) {
    if (!perfilesPorDiseno.has(p.diseno_id)) perfilesPorDiseno.set(p.diseno_id, []);
    perfilesPorDiseno.get(p.diseno_id)!.push(p);
  }
  const vidriosPorDiseno = new Map<string, any[]>();
  for (const v of vidrioRows as any[]) {
    if (!vidriosPorDiseno.has(v.diseno_id)) vidriosPorDiseno.set(v.diseno_id, []);
    vidriosPorDiseno.get(v.diseno_id)!.push(v);
  }
  const accesoriosPorDiseno = new Map<string, any[]>();
  for (const a of accesorioRows as any[]) {
    if (!accesoriosPorDiseno.has(a.diseno_id)) accesoriosPorDiseno.set(a.diseno_id, []);
    accesoriosPorDiseno.get(a.diseno_id)!.push(a);
  }

  let disenosOk = 0;
  for (const d of disenos) {
    const fila = disenoPorId.get(d.id);
    if (!fila) { console.error(`✗ FALLO round-trip diseños: falta ${d.id}`); fallos++; continue; }

    let diffs: string[] = [];
    if (fila.modulo !== d.modulo) diffs.push('modulo');
    if (fila.sistema !== d.sistema) diffs.push('sistema');
    if (fila.diseno !== d.diseno) diffs.push('diseno');
    if (fila.etiqueta !== d.etiqueta) diffs.push('etiqueta');
    if (fila.paneles !== d.paneles) diffs.push('paneles');
    if (fila.nivel_corte !== d.nivelCorte) diffs.push('nivelCorte');
    if (fila.nivel_vidrio !== d.nivelVidrio) diffs.push('nivelVidrio');
    if (fila.nivel_perfiles !== d.nivelPerfiles) diffs.push('nivelPerfiles');
    if (fila.medidas_respaldo !== d.medidasRespaldo) diffs.push('medidasRespaldo');
    if (fila.cotizable !== d.cotizable) diffs.push('cotizable');
    if (!jsonIgual(fila.refs_sin_precio ?? [], d.refsSinPrecio ?? [])) diffs.push('refsSinPrecio');

    const perfilesOrigen = d.perfiles ?? [];
    const perfilesBD = perfilesPorDiseno.get(d.id) ?? [];
    if (perfilesBD.length !== perfilesOrigen.length) {
      diffs.push(`perfiles.length (${perfilesBD.length} vs ${perfilesOrigen.length})`);
    } else {
      perfilesOrigen.forEach((p: any, i: number) => {
        const f = perfilesBD[i];
        if (
          f.ref !== p.ref || f.ref_original !== p.refOriginal || f.descripcion !== p.descripcion ||
          !numIguales(f.cantidad, p.cantidad) || !numIguales(f.desperdicio_pct, p.desperdicioPct ?? 0) ||
          !numIguales(f.formula_a, p.formula?.a ?? 0) || !numIguales(f.formula_b, p.formula?.b ?? 0) ||
          !numIguales(f.formula_c, p.formula?.c ?? 0) || f.nivel_corte !== p.nivelCorte ||
          f.es_alfajia !== !!p.esAlfajia ||
          !jsonIgual(f.codigos_por_color ?? {}, p.codigosPorColor ?? {})
        ) {
          diffs.push(`perfil[${i}] (${p.ref})`);
        }
      });
    }

    const vidriosOrigen = d.vidrios ?? [];
    const vidriosBD = vidriosPorDiseno.get(d.id) ?? [];
    if (vidriosBD.length !== vidriosOrigen.length) {
      diffs.push(`vidrios.length (${vidriosBD.length} vs ${vidriosOrigen.length})`);
    } else {
      vidriosOrigen.forEach((v: any, i: number) => {
        const f = vidriosBD[i];
        if (
          f.descripcion !== v.descripcion || !numIguales(f.cantidad, v.cantidad) ||
          !numIguales(f.desperdicio_pct, v.desperdicioPct ?? 0) ||
          !numIguales(f.formula_ancho_a, v.formulaAncho?.a ?? 0) ||
          !numIguales(f.formula_ancho_b, v.formulaAncho?.b ?? 0) ||
          !numIguales(f.formula_ancho_c, v.formulaAncho?.c ?? 0) ||
          !numIguales(f.formula_alto_a, v.formulaAlto?.a ?? 0) ||
          !numIguales(f.formula_alto_b, v.formulaAlto?.b ?? 0) ||
          !numIguales(f.formula_alto_c, v.formulaAlto?.c ?? 0) ||
          f.nivel_riesgo !== v.nivelRiesgo
        ) {
          diffs.push(`vidrio[${i}]`);
        }
      });
    }

    const accesoriosOrigen = d.accesorios ?? [];
    const accesoriosBD = accesoriosPorDiseno.get(d.id) ?? [];
    if (accesoriosBD.length !== accesoriosOrigen.length) {
      diffs.push(`accesorios.length (${accesoriosBD.length} vs ${accesoriosOrigen.length})`);
    } else {
      accesoriosOrigen.forEach((a: any, i: number) => {
        const f = accesoriosBD[i];
        if (
          f.descripcion !== a.descripcion ||
          !numIguales(f.cantidad ?? 0, a.cantidad ?? 0) ||
          !jsonIgual(f.formula ?? null, a.formula ?? null)
        ) {
          diffs.push(`accesorio[${i}] (${a.descripcion})`);
        }
      });
    }

    if (diffs.length > 0) {
      console.error(`✗ FALLO round-trip diseño ${d.id}: ${diffs.join(', ')}`);
      fallos++;
    } else {
      disenosOk++;
    }
  }
  assert(disenosOk === disenos.length, `Round-trip disenos.json: ${disenosOk}/${disenos.length} diseños idénticos campo a campo`);
}

async function run() {
  try {
    await sequelize.authenticate();
    console.log('Conexión OK\n--- Conteos ---');
    await verificarConteos();

    console.log('\n--- Neutralización de la fuente externa ---');
    await verificarNombreFuenteExterna();

    console.log('\n--- Round-trip de fidelidad ---');
    await verificarRoundTripCatalogo();
    await verificarRoundTripProvisional();
    await verificarRoundTripDisenos();

    console.log(`\n${fallos === 0 ? '✅ Etapa 1 verificada sin fallos.' : `❌ ${fallos} verificación(es) fallida(s).`}`);
    process.exitCode = fallos === 0 ? 0 : 1;
  } catch (err) {
    console.error('Error verificando datos del cotizador:', err);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

run();

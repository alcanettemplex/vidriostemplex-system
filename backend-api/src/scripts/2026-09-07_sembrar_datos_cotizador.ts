// Etapa 1 del módulo Cotizador — siembra los datos migrados desde el
// proyecto standalone (catálogo, provisionales, diseños, parámetros,
// empresa, mapeo de accesorios). Los JSON de origen viven en
// src/scripts/datos_cotizador/ (solo para esta siembra; no se leen en
// runtime ni entran a la imagen Docker).
//
// Idempotente, respetando la regla "data/ se regenera, db/ no" del proyecto
// origen:
//   - cotizador_producto: upsert (el catálogo SÍ se regenera con el tiempo),
//     pero NUNCA toca cotizador_precio_override (tabla aparte).
//   - cotizador_diseno + hijas: se reemplazan completas (son catálogo técnico
//     derivado, nadie las edita a mano; geometria-overrides es aparte).
//   - cotizador_mapeo_accesorio, cotizador_parametro, cotizador_empresa(+logo):
//     ON CONFLICT DO NOTHING — la primera vez siembra, después nunca pisa
//     una edición hecha desde la pantalla.
//   - cotizador_consecutivo: se siembra en 0 solo si no existe.
//
// NO se migran cotizaciones de prueba (decisión 7): la numeración arranca en 1.
//
// Uso: npx ts-node src/scripts/2026-09-07_sembrar_datos_cotizador.ts
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

async function sembrarProductos() {
  const catalogo: any[] = leerJSON('catalogo.json');
  const provisional = leerJSON<{ productos: any[] }>('catalogo-provisional.json');

  const filasCatalogo = catalogo.map((p) => ({
    codigo: p.codigo,
    descripcion: p.descripcion,
    categoria: p.categoria,
    unidad: p.unidad,
    costo_unitario: p.costo_unitario,
    precio_pa: p.precio_pa,
    precio_pm: p.precio_pm,
    precio_pb: p.precio_pb,
    origen: 'CATALOGO' as const,
    provisional: false,
  }));

  const filasProvisional = provisional.productos.map((p) => ({
    codigo: p.codigo,
    descripcion: p.descripcion,
    categoria: p.categoria,
    unidad: p.unidad,
    costo_unitario: p.costo_unitario,
    precio_pa: p.precio_pa,
    precio_pm: p.precio_pm,
    precio_pb: p.precio_pb,
    origen: 'PROVISIONAL' as const,
    provisional: true,
    referencia: p.referencia,
    color: p.color,
    fuente: p.fuente, // ya neutralizado ("referencia externa · ...") al copiar los datos
    acabado_exacto: p.acabadoExacto,
    sospechoso_valor_por_defecto: p.sospechosoValorPorDefecto,
  }));

  await CotizadorProducto.bulkCreate([...filasCatalogo, ...filasProvisional], {
    updateOnDuplicate: [
      'descripcion', 'categoria', 'unidad', 'costo_unitario',
      'precio_pa', 'precio_pm', 'precio_pb', 'origen', 'provisional',
      'referencia', 'color', 'fuente', 'acabado_exacto', 'sospechoso_valor_por_defecto',
    ],
  });

  console.log(`✓ cotizador_producto: ${filasCatalogo.length} catálogo + ${filasProvisional.length} provisional`);
}

async function sembrarDisenos() {
  const data = leerJSON<{ disenos: any[] }>('disenos.json');
  const disenos = data.disenos;

  await sequelize.transaction(async (t) => {
    // Diseños regenerables por completo (catálogo técnico derivado, no editado a mano).
    await CotizadorDisenoAccesorio.destroy({ where: {}, transaction: t });
    await CotizadorDisenoVidrio.destroy({ where: {}, transaction: t });
    await CotizadorDisenoPerfil.destroy({ where: {}, transaction: t });
    await CotizadorDiseno.destroy({ where: {}, transaction: t });

    const filasDiseno = disenos.map((d) => ({
      id: d.id,
      modulo: d.modulo,
      sistema: d.sistema,
      diseno: d.diseno,
      etiqueta: d.etiqueta,
      paneles: d.paneles,
      nivel_corte: d.nivelCorte,
      nivel_vidrio: d.nivelVidrio,
      nivel_perfiles: d.nivelPerfiles,
      medidas_respaldo: d.medidasRespaldo,
      cotizable: d.cotizable,
      refs_sin_precio: d.refsSinPrecio ?? [],
    }));
    await CotizadorDiseno.bulkCreate(filasDiseno, { transaction: t });

    const filasPerfil: any[] = [];
    const filasVidrio: any[] = [];
    const filasAccesorio: any[] = [];

    for (const d of disenos) {
      (d.perfiles ?? []).forEach((p: any, orden: number) => {
        filasPerfil.push({
          diseno_id: d.id,
          orden,
          ref: p.ref,
          ref_original: p.refOriginal,
          descripcion: p.descripcion,
          cantidad: p.cantidad,
          desperdicio_pct: p.desperdicioPct ?? 0,
          formula_a: p.formula?.a ?? 0,
          formula_b: p.formula?.b ?? 0,
          formula_c: p.formula?.c ?? 0,
          nivel_corte: p.nivelCorte,
          codigos_por_color: p.codigosPorColor ?? {},
          es_alfajia: !!p.esAlfajia,
        });
      });

      (d.vidrios ?? []).forEach((v: any, orden: number) => {
        filasVidrio.push({
          diseno_id: d.id,
          orden,
          descripcion: v.descripcion,
          cantidad: v.cantidad,
          desperdicio_pct: v.desperdicioPct ?? 0,
          formula_ancho_a: v.formulaAncho?.a ?? 0,
          formula_ancho_b: v.formulaAncho?.b ?? 0,
          formula_ancho_c: v.formulaAncho?.c ?? 0,
          formula_alto_a: v.formulaAlto?.a ?? 0,
          formula_alto_b: v.formulaAlto?.b ?? 0,
          formula_alto_c: v.formulaAlto?.c ?? 0,
          nivel_riesgo: v.nivelRiesgo,
        });
      });

      (d.accesorios ?? []).forEach((a: any, orden: number) => {
        filasAccesorio.push({
          diseno_id: d.id,
          orden,
          descripcion: a.descripcion,
          cantidad: a.cantidad ?? null,
          formula: a.formula ?? null,
        });
      });
    }

    await CotizadorDisenoPerfil.bulkCreate(filasPerfil, { transaction: t });
    await CotizadorDisenoVidrio.bulkCreate(filasVidrio, { transaction: t });
    await CotizadorDisenoAccesorio.bulkCreate(filasAccesorio, { transaction: t });

    console.log(`✓ cotizador_diseno: ${filasDiseno.length}`);
    console.log(`✓ cotizador_diseno_perfil: ${filasPerfil.length}`);
    console.log(`✓ cotizador_diseno_vidrio: ${filasVidrio.length}`);
    console.log(`✓ cotizador_diseno_accesorio: ${filasAccesorio.length}`);
  });
}

async function sembrarMapeoAccesorios() {
  const data = leerJSON<{ accesorios: Record<string, any> }>('mapeo-accesorios.json');
  const filas = Object.entries(data.accesorios).map(([descripcion, v]: [string, any]) => ({
    descripcion,
    estado: v.estado,
    codigo: v.codigo ?? null,
    consumo: v.consumo ?? null,
    // Restricción por sistema (2026-09-11): ver MapeoAccesorio.sistemas.
    sistemas: v.sistemas ?? null,
    nota: v.nota ?? null,
    confianza: v.confianza ?? null,
  }));

  // DO NOTHING: no pisar ediciones ya hechas desde la pantalla de mapeo.
  await CotizadorMapeoAccesorio.bulkCreate(filas, { ignoreDuplicates: true });
  console.log(`✓ cotizador_mapeo_accesorio: ${filas.length} (ignoreDuplicates)`);
}

async function sembrarParametros() {
  const p = leerJSON<any>('parametros.json');
  const existe = await CotizadorParametro.findByPk(1);
  if (existe) {
    console.log('… cotizador_parametro ya existe — no se pisa (puede tener ediciones)');
    return;
  }
  await CotizadorParametro.create({
    id: 1,
    aiu: p.aiu,
    iva: p.iva,
    flete_fijo: p.flete_fijo,
    smo_tarifa_minima: p.smo.tarifaMinima,
    smo_piso_tablero_grande: p.smo.pisoTableroGrande,
    // Un SMO por tipo de obra (2026-09-11). Se pasan explícitamente para que un
    // entorno nuevo nazca con los valores del Excel matriz y no dependa del
    // defaultValue del modelo, que es sólo una red de seguridad.
    smo_cabinas: p.smo.cabinas,
    smo_fachadas: p.smo.fachadas,
    smo_armada_ventanas: p.smo.armadaVentanas,
    smo_persiana: p.smo.persiana,
    alquiler_andamio: p.alquiler_andamio,
    huacal: p.huacal,
    clientes: p.clientes,
    asesores: p.asesores,
    estados_cotizacion: p.estados_cotizacion,
    actualizado_en: new Date(),
    actualizado_por: 'siembra-inicial-2026-09-07',
  });
  console.log('✓ cotizador_parametro sembrado (aiu=%s, iva=%s)', p.aiu, p.iva);
}

async function sembrarEmpresa() {
  const e = leerJSON<any>('empresa.json');

  const existeEmpresa = await CotizadorEmpresa.findByPk(1);
  if (!existeEmpresa) {
    await CotizadorEmpresa.create({
      id: 1,
      razon_social: e.razonSocial,
      nombre_comercial: e.nombreComercial,
      eslogan: e.eslogan,
      nit: e.nit,
      telefono: e.telefono,
      direccion: e.direccion,
      web: e.web,
      cuenta_bancaria: e.cuentaBancaria,
      garantia: e.garantia,
      validez_oferta_dias: e.validezOfertaDias,
      validez_oferta_texto: e.validezOfertaTexto,
      condiciones_comerciales: e.condicionesComerciales,
      actualizado_en: new Date(e.actualizadoEn ?? Date.now()),
      actualizado_por: e.actualizadoPor ?? 'siembra-inicial-2026-09-07',
    });
    console.log('✓ cotizador_empresa sembrada (%s)', e.razonSocial);
  } else {
    console.log('… cotizador_empresa ya existe — no se pisa');
  }

  const existeLogo = await CotizadorEmpresaLogo.findByPk(1);
  if (!existeLogo) {
    const dataUri: string = e.logoDataUri;
    const mimeMatch = /^data:([^;]+);/.exec(dataUri);
    await CotizadorEmpresaLogo.create({
      id: 1,
      data_uri: dataUri,
      mime: mimeMatch ? mimeMatch[1] : 'image/png',
      actualizado_en: new Date(),
    });
    console.log('✓ cotizador_empresa_logo sembrado (%d chars)', dataUri.length);
  } else {
    console.log('… cotizador_empresa_logo ya existe — no se pisa');
  }
}

async function sembrarConsecutivo() {
  const existe = await CotizadorConsecutivo.findByPk('cotizacion');
  if (existe) {
    console.log('… cotizador_consecutivo ya existe — no se pisa (valor=%s)', existe.getDataValue('valor'));
    return;
  }
  await CotizadorConsecutivo.create({ nombre: 'cotizacion', valor: 0 });
  console.log('✓ cotizador_consecutivo sembrado en 0');
}

async function run() {
  try {
    await sequelize.authenticate();
    console.log('Conexión OK\n');

    await sembrarProductos();
    await sembrarDisenos();
    await sembrarMapeoAccesorios();
    await sembrarParametros();
    await sembrarEmpresa();
    await sembrarConsecutivo();

    console.log('\nEtapa 1 — siembra de datos del Cotizador completada.');
  } catch (err) {
    console.error('Error sembrando datos del cotizador:', err);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

run();

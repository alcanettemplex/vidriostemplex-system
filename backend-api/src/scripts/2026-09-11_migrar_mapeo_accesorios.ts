// Empuja a la base el mapeo de accesorios arbitrado contra el Excel matriz
// (2026-09-11) y agrega la columna `sistemas` que ese arbitraje necesita.
//
// POR QUÉ HACE FALTA ESTE SCRIPT Y NO BASTA RE-SEMBRAR:
// `sembrarMapeoAccesorios()` (2026-09-07) escribe con
// `bulkCreate(..., { ignoreDuplicates: true })` a propósito, para no pisar
// ediciones hechas desde la pantalla de mapeo. Eso significa que volver a
// correr la siembra NO actualiza las 54 filas que ya existen: el JSON nuevo se
// quedaría en disco sin llegar nunca a producción.
//
// QUÉ HACE
//   1. ALTER TABLE ... ADD COLUMN IF NOT EXISTS sistemas JSONB
//      Restringe un mapeo a ciertos sistemas. Existe porque el extractor dejó
//      descripciones genéricas que significan un producto distinto en cada
//      sistema: "E.universa. Empaque Universal" es EMP5020 en Sistema5020 y
//      EMPA8025 en Sistema8025. Sin la columna, mapear esa clave le cobraría el
//      empaque equivocado a los demás sistemas EN SILENCIO.
//   2. UPDATE fila por fila de las 54 descripciones desde
//      datos_cotizador/mapeo-accesorios.json, informando qué cambió.
//
// QUÉ NO HACE — DELIBERADAMENTE
// NO activa ningún sistema. `cotizador_accesorio_sistema_activo` está vacía por
// regla del proyecto ("no hay, ni debe haber, un endpoint que active un sistema
// automáticamente"): activar es un INSERT manual, deliberado y auditable por
// fecha, porque cambia lo que se le cobra al cliente. Al final el script
// imprime el SQL exacto para hacerlo a mano cuando se decida.
//
// Uso:
//   npx ts-node backend-api/src/scripts/2026-09-11_migrar_mapeo_accesorios.ts
// No se ejecuta con `npm run dev`.
import * as fs from 'fs';
import * as path from 'path';
import { sequelize, CotizadorMapeoAccesorio } from '../models';

interface EntradaMapeo {
  estado: string;
  codigo?: string | null;
  consumo?: Record<string, unknown> | null;
  sistemas?: string[] | null;
  nota?: string | null;
  confianza?: string | null;
}

const ARCHIVO = path.join(__dirname, 'datos_cotizador', 'mapeo-accesorios.json');

/** Comparación estable para JSONB: el orden de claves no debe contar como cambio. */
function mismoJson(a: unknown, b: unknown): boolean {
  const norm = (v: unknown): string => {
    if (v === null || v === undefined) return 'null';
    if (Array.isArray(v)) return JSON.stringify(v);
    if (typeof v === 'object') {
      const o = v as Record<string, unknown>;
      return JSON.stringify(Object.keys(o).sort().map((k) => [k, o[k]]));
    }
    return JSON.stringify(v);
  };
  return norm(a) === norm(b);
}

async function main() {
  const crudo = JSON.parse(fs.readFileSync(ARCHIVO, 'utf8')) as {
    sistemasActivos: string[];
    accesorios: Record<string, EntradaMapeo>;
  };
  const entradas = Object.entries(crudo.accesorios);

  // Guarda mínima: si el JSON viniera truncado, mejor abortar que vaciar 54
  // mapeos en producción.
  if (entradas.length < 54) {
    throw new Error(
      `mapeo-accesorios.json trae ${entradas.length} accesorios; se esperaban al menos 54. Abortado sin escribir.`
    );
  }

  console.log('→ Agregando columna `sistemas` si no existe…');
  await sequelize.query(
    'ALTER TABLE cotizador_mapeo_accesorio ADD COLUMN IF NOT EXISTS sistemas JSONB'
  );
  console.log('  ✓ columna lista');

  let actualizados = 0;
  let sinCambio = 0;
  let ausentes = 0;
  const cambios: string[] = [];

  await sequelize.transaction(async (t) => {
    const filas = (await CotizadorMapeoAccesorio.findAll({
      raw: true,
      transaction: t,
    })) as unknown as Record<string, unknown>[];
    const enBd = new Map(filas.map((f) => [f.descripcion as string, f]));

    for (const [descripcion, v] of entradas) {
      const actual = enBd.get(descripcion);
      if (!actual) {
        ausentes++;
        console.log(`  ! "${descripcion}" no existe en la tabla — la crea la siembra, no este script`);
        continue;
      }

      const nuevo = {
        estado: v.estado,
        codigo: v.codigo ?? null,
        consumo: v.consumo ?? null,
        sistemas: v.sistemas ?? null,
        nota: v.nota ?? null,
        confianza: v.confianza ?? null,
      };

      const igual =
        actual.estado === nuevo.estado &&
        (actual.codigo ?? null) === nuevo.codigo &&
        mismoJson(actual.consumo, nuevo.consumo) &&
        mismoJson(actual.sistemas, nuevo.sistemas) &&
        (actual.nota ?? null) === nuevo.nota &&
        (actual.confianza ?? null) === nuevo.confianza;

      if (igual) {
        sinCambio++;
        continue;
      }

      if (actual.estado !== nuevo.estado) {
        cambios.push(`    ${descripcion}: ${actual.estado} → ${nuevo.estado}${nuevo.codigo ? ` (${nuevo.codigo})` : ''}`);
      }

      await CotizadorMapeoAccesorio.update(
        { ...nuevo, actualizado_en: new Date(), actualizado_por: 'migracion-excel-2026-09-11' },
        { where: { descripcion }, transaction: t }
      );
      actualizados++;
    }
  });

  console.log(`\n✓ cotizador_mapeo_accesorio: ${actualizados} actualizados, ${sinCambio} sin cambio, ${ausentes} ausentes`);
  if (cambios.length) {
    console.log('\n  Cambios de estado:');
    cambios.forEach((c) => console.log(c));
  }

  console.log(
    '\n⚠️  Los sistemas NO se activaron: es una decisión de negocio, no de migración.\n' +
      '    Cuando se decida, el INSERT manual y auditable es:\n\n' +
      "    INSERT INTO cotizador_accesorio_sistema_activo (sistema, activado_en, activado_por)\n" +
      "    VALUES ('Sistema5020', now(), '<tu nombre>'),\n" +
      "           ('Sistema5020Reforzado', now(), '<tu nombre>')\n" +
      '    ON CONFLICT (sistema) DO NOTHING;\n\n' +
      '    Sólo esos dos: son los únicos cuyos accesorios quedan 100% resueltos.\n' +
      '    Activar otro dejaría sus diseños sin poder cotizarse (un PENDIENTE bloquea).'
  );
}

main()
  .then(() => sequelize.close())
  .catch(async (e) => {
    console.error('✗ Falló la migración del mapeo:', e);
    await sequelize.close();
    process.exit(1);
  });

// ESP4MMBPB pasa a ser el producto del espejo BISELADO (decisión del usuario,
// 2026-09-26): el módulo Espejo lo cobra por m² en vez de ES0001 + 15,07%.
//
// Corrige dos datos de la fila, heredados del Excel de los asesores:
//   - unidad "X METRO" → "X M2": el usuario confirmó que el precio es por m².
//     El motor ya lo cobraba con `unidadOverride: "M2"`; esto alinea el rótulo
//     del catálogo, la pantalla de precios y la lista de materiales del taller.
//   - descripción "ESPEJO 4MM BPB" → "ESPEJO 4MM BISELADO": es el biselado (su
//     vínculo en el catálogo maestro, id 582, ya se llama así). Con el nombre
//     viejo, la Hoja de Trabajo le diría al taller BPB para un espejo biselado.
//
// No toca precios ni costo. `catalogo.json` se corrigió en el mismo cambio para
// que `2026-09-11_regenerar_catalogo_cotizador.ts` no devuelva los valores viejos.
//
// Idempotente. NO se ejecuta con `npm run dev`. Correr a mano tras desplegar y
// luego recargar la caché del Cotizador (POST /api/cotizador/recargar) o
// reiniciar el backend:
//   npx ts-node --files src/scripts/2026-09-26_cotizador_espejo_biselado.ts
import { sequelize, CotizadorProducto } from '../models';

const CODIGO = 'ESP4MMBPB';
const NUEVO = { unidad: 'X M2', descripcion: 'ESPEJO 4MM BISELADO' };

async function main() {
  const fila = await CotizadorProducto.findByPk(CODIGO);
  if (!fila) throw new Error(`No existe ${CODIGO} en cotizador.producto.`);
  const antes = { unidad: fila.get('unidad'), descripcion: fila.get('descripcion') };
  if (antes.unidad === NUEVO.unidad && antes.descripcion === NUEVO.descripcion) {
    console.log(`${CODIGO} ya estaba corregido: nada que hacer.`);
    return;
  }
  await fila.update(NUEVO);
  console.log(`${CODIGO}:`, antes, '→', NUEVO);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  // Los hooks de auditoría escriben sin await: dar un respiro antes de cerrar.
  .finally(() => setTimeout(() => sequelize.close(), 1500));

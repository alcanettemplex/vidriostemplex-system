// Datos de la empresa que encabezan y cierran cada cotización impresa: razón
// social, NIT, logo, cuenta bancaria, condiciones comerciales, garantía y
// validez de la oferta.
//
// Sustituye a `db/storeEmpresa.js`, que guardaba un objeto en un JSON.
//
// EL LOGO VA EN SU PROPIA TABLA, y no es un capricho de normalización: es un
// data URI de 23.342 caracteres. Devolverlo en cada carga de pantalla son 23 KB
// de egress por visita contra un baseline diario de 50-60 MB. Por eso `leer()`
// lo omite salvo que se pida explícitamente, y el generador de PDF (Etapa 4) lo
// tomará de la caché con coste cero.
//
// Tampoco va a Cloudinary aunque parezca lo obvio: el generador de PDF empotra
// el data URI directamente en el documento y cierra su política de red, así que
// se negaría a descargar una URL remota. Ir a Cloudinary obligaría a un fetch y
// un base64 por cada PDF, o a abrir esa política.
//
// Y no va a `configuracion_global`: esa tabla tiene whitelist, se edita desde
// otro módulo con otro rol y está auditada — acoplarla aquí rompería el
// aislamiento que el módulo mantiene a propósito.
import { sequelize, CotizadorEmpresa, CotizadorEmpresaLogo } from '../../models';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fila = Record<string, any>;

/** Campos editables, en el camelCase que usa la API, mapeados a su columna. */
const CAMPOS: Array<[string, string]> = [
  ['razonSocial', 'razon_social'],
  ['nombreComercial', 'nombre_comercial'],
  ['eslogan', 'eslogan'],
  ['nit', 'nit'],
  ['telefono', 'telefono'],
  ['direccion', 'direccion'],
  ['web', 'web'],
  ['cuentaBancaria', 'cuenta_bancaria'],
  ['garantia', 'garantia'],
  ['validezOfertaDias', 'validez_oferta_dias'],
  ['validezOfertaTexto', 'validez_oferta_texto'],
  ['condicionesComerciales', 'condiciones_comerciales'],
];

/**
 * @param incluirLogo cuando es true añade `logoDataUri` (23 KB). El listado y
 *   las pantallas normales no lo necesitan.
 */
export async function leer(incluirLogo = false): Promise<Fila | null> {
  const fila = (await CotizadorEmpresa.findByPk(1, { raw: true })) as unknown as Fila | null;
  if (!fila) return null;

  const salida: Fila = {};
  for (const [clave, columna] of CAMPOS) salida[clave] = fila[columna];
  salida.actualizadoEn = fila.actualizado_en;
  salida.actualizadoPor = fila.actualizado_por;

  if (incluirLogo) {
    const logo = (await CotizadorEmpresaLogo.findByPk(1, { raw: true })) as unknown as Fila | null;
    salida.logoDataUri = logo?.data_uri ?? null;
  }
  return salida;
}

/** Sólo el data URI del logo, para quien de verdad lo necesita (el PDF). */
export async function leerLogo(): Promise<string | null> {
  const logo = (await CotizadorEmpresaLogo.findByPk(1, { raw: true })) as unknown as Fila | null;
  return logo?.data_uri ?? null;
}

/**
 * Merge superficial de un nivel, igual que el origen: sólo se tocan los campos
 * presentes en `datos`. `condicionesComerciales` se reemplaza entera (es una
 * lista, no un objeto que mezclar), que es también lo que hacía el original.
 */
export async function guardar(datos: Fila, { por }: { por?: string } = {}): Promise<Fila> {
  const t = await sequelize.transaction();
  try {
    const cambios: Fila = { actualizado_en: new Date(), actualizado_por: por ?? null };
    for (const [clave, columna] of CAMPOS) {
      if (datos[clave] !== undefined) cambios[columna] = datos[clave];
    }

    const fila = await CotizadorEmpresa.findByPk(1, { transaction: t });
    if (fila) {
      await (fila as unknown as Fila).update(cambios, { transaction: t });
    } else {
      await CotizadorEmpresa.create({ id: 1, ...cambios } as Fila, { transaction: t });
    }

    if (datos.logoDataUri !== undefined) {
      const logo = await CotizadorEmpresaLogo.findByPk(1, { transaction: t });
      const valores = {
        data_uri: datos.logoDataUri,
        mime: String(datos.logoDataUri).slice(5).split(';')[0] || null,
        actualizado_en: new Date(),
      };
      if (logo) await (logo as unknown as Fila).update(valores, { transaction: t });
      else await CotizadorEmpresaLogo.create({ id: 1, ...valores } as Fila, { transaction: t });
    }

    await t.commit();
    // Se devuelve con logo sólo si el llamador lo acaba de cambiar: así quien
    // guarda el logo confirma que quedó, y quien guarda un teléfono no se lleva
    // 23 KB de vuelta sin pedirlos.
    return (await leer(datos.logoDataUri !== undefined)) as Fila;
  } catch (e) {
    await t.rollback();
    throw e;
  }
}

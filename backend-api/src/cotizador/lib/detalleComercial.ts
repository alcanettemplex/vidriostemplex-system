// Descripción COMERCIAL de un ítem: la frase que ve el cliente en el PDF y el
// asesor en la pantalla (decisión del usuario, 2026-09-26):
//
//   "Sala — Suministro e instalación de ventana 744 color mate, vidrio claro
//    4 mm crudo, medidas 1.000 × 1.000 mm"
//
//   - "Suministro e instalación de" si el ítem tiene "Con instalación"
//     marcado; "Suministro de" si no. Un módulo sin esa casilla (ítem libre) no
//     lleva prefijo: su texto es el que escribió el asesor.
//   - La ubicación (`descripcionItem`, campo opcional) va al inicio.
//   - El vidrio va siempre: es lo que distingue las opciones A/B/C de una misma
//     obra (crudo, templado, con película).
//
// NO CALCULA NADA: todo sale del `input` guardado del ítem, de las etiquetas que
// declara su módulo (`meta.campos[].opciones`) y del diseño que registró el
// motor en `resultado.diseno`. Si un dato no está, se omite en vez de
// inventarlo. Redactada para un cliente, no para el taller: nada de códigos
// internos, nivel de corte ni herrajes (eso es `fichaProducto.ts` del frontend).
//
// La escribe `calcularItem` en `resultado.descripcionComercial` para que la
// pantalla la lea sin reimplementarla; el PDF la recalcula al imprimir, así
// también sirve para ítems guardados antes de que existiera.
import { getModulo } from "../modules/registry";
import { nombrePelicula } from "./peliculas";

type Opcion = string | number | { value: unknown; label: string };
interface CampoLaxo {
  nombre: string;
  opciones?: Opcion[];
}
interface DisenoLaxo {
  sistema?: string;
  etiqueta?: string | null;
  diseno?: string;
}

const vacio = (v: unknown) => v === undefined || v === null || v === "";
const marcado = (v: unknown) => v === true || v === "true";
const mil = (n: number) => n.toLocaleString("es-CO");

function etiquetaDe(campos: CampoLaxo[], nombre: string, valor: unknown): string | null {
  if (vacio(valor)) return null;
  const campo = campos.find((c) => c.nombre === nombre);
  const opcion = campo?.opciones?.find((o) => (typeof o === "object" && o !== null ? o.value : o) === valor);
  if (opcion === undefined) return String(valor);
  return typeof opcion === "object" ? opcion.label : String(opcion);
}

/** cm (unidad del motor) → mm (lo que se lee), redondeado. */
function mm(valor: unknown): number | null {
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 10) : null;
}

/** "Claro 4mm crudo" → "claro 4 mm crudo". */
function textoVidrio(label: string): string {
  return label.replace(/(\d)\s*mm\b/i, "$1 mm").replace(/^\p{Lu}/u, (c) => c.toLowerCase());
}

/** "Sistema7038-Interior" → "7038 Interior". */
function sistemaVentana(s: string): string {
  return s.replace(/^Sistema/, "").replace(/-/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").trim();
}

/** Forma del diseño en minúscula, para ir entre paréntesis: "(fijo + corredizo)". */
function forma(diseno: DisenoLaxo | null): string {
  const f = diseno?.etiqueta?.trim();
  return f ? ` (${f.toLowerCase()})` : "";
}

/** Tipo de cabina corrediza sin diseño: el nombre comercial, sin el detalle
 * técnico entre paréntesis de la etiqueta del formulario. */
const CABINA_CORREDIZA: Record<string, string> = {
  corrediza: "cabina de baño corrediza",
  glasvit: "cabina de baño Glasvit",
  deslizante_pizavidrio: "cabina de baño deslizante pizavidrio",
  tubo_rectangular: "cabina de baño corrediza en tubo rectangular",
};

/** Cabina Glasvit en L: qué lleva cada lado. */
const CONFIGURACION_L: Record<string, string> = {
  "2F1C": "2 fijos + 1 corrediza",
  "2F2C": "2 fijos + 2 corredizas",
};

const ACABADO_ESPEJO: Record<string, string> = {
  BPB: "espejo 4 mm con borde pulido brillado",
  BISELADO: "espejo 4 mm biselado",
};

/** Matizado legible, o null si no lleva. Admite el booleano viejo. */
function matizadoDe(campos: CampoLaxo[], valor: unknown): string | null {
  if (marcado(valor)) return "matizado";
  if (vacio(valor) || valor === false) return null;
  const m = etiquetaDe(campos, "matizado", valor);
  return m && !/^sin/i.test(m) ? m.toLowerCase() : null;
}

/** Lo que es el producto, sin prefijo ni medidas: "ventana 744 color mate,
 * vidrio claro 4 mm crudo, con película". */
function producto(
  moduloId: string,
  i: Record<string, unknown>,
  campos: CampoLaxo[],
  diseno: DisenoLaxo | null,
  nombreModulo: string
): string {
  const color = etiquetaDe(campos, "colorPerfileria", i.colorPerfileria);
  const codigoVidrio = etiquetaDe(campos, "codigoVidrio", i.codigoVidrio);
  const espesor = i.espesorVidrioMm ?? i.espesorMm;
  const vidrioTemplado = !vacio(espesor) ? `vidrio templado ${espesor} mm` : null;
  const matizado = matizadoDe(campos, i.matizado);
  // La película dice cuál (2026-09-27): "con película control solar titanio".
  const pelicula = nombrePelicula(i.pelicula);
  const extras = [matizado, pelicula ? `con ${pelicula}` : null];

  let base: string;
  let atributos: (string | null)[];
  switch (moduloId) {
    case "ventanas": {
      const sistema = diseno?.sistema ? sistemaVentana(diseno.sistema) : etiquetaDe(campos, "sistema", i.sistema);
      base = `ventana${sistema ? ` ${sistema}` : ""}${forma(diseno)}${color ? ` color ${color.toLowerCase()}` : ""}`;
      atributos = [codigoVidrio ? `vidrio ${textoVidrio(codigoVidrio)}` : null, ...extras, marcado(i.alfajia) ? "con alfajía" : null];
      break;
    }
    case "proyectantes": {
      const naves = Math.floor(Number(i.numeroNaves));
      const porNave = !diseno && naves > 1;
      base = `ventana proyectante${porNave ? ` de ${naves} naves` : ""}${forma(diseno)}${color ? ` color ${color.toLowerCase()}` : ""}`;
      atributos = [codigoVidrio ? `vidrio ${textoVidrio(codigoVidrio)}` : null, ...extras];
      break;
    }
    case "cabinas-corredizas": {
      // Con diseño manda su sistema ("Cabina Deslizante Torino" → "cabina de
      // baño deslizante Torino", "Cabina Glasvit" → "cabina de baño Glasvit":
      // solo el tipo va en minúscula, la marca no); sin diseño, el tipo elegido.
      const porDiseno = diseno?.sistema
        ? `cabina de baño ${diseno.sistema
            .replace(/^Cabina\s+/i, "")
            .replace(/^(Deslizante|Corrediza|Batiente)\b/, (c) => c.toLowerCase())}`
        : null;
      base = porDiseno ?? CABINA_CORREDIZA[String(i.tipoSistema)] ?? "cabina de baño corrediza";
      // En L la forma del diseño (fijo + corredizo) describe solo el lado X: se
      // cambia por la configuración de la L (Glasvit, 2026-09-27).
      const configL = CONFIGURACION_L[String(i.configuracionL ?? "")];
      base += marcado(i.enL) && configL ? "" : forma(diseno);
      atributos = [marcado(i.enL) ? (configL ? `en L (${configL})` : "en L") : null, vidrioTemplado];
      break;
    }
    case "cabinas-batientes":
      base = `cabina de baño batiente${forma(diseno)}`;
      atributos = [marcado(i.enL) ? "en L" : null, vidrioTemplado];
      break;
    case "tablero":
      base = `tablero en ${vidrioTemplado ?? "vidrio templado"}`;
      atributos = extras;
      break;
    case "espejo": {
      base = `${ACABADO_ESPEJO[String(i.acabado)] ?? "espejo 4 mm"}${forma(diseno)}`;
      const tubulares = Number(i.tubularCantidad);
      atributos = [
        Number.isFinite(tubulares) && tubulares > 0
          ? `con ${tubulares} soporte${tubulares === 1 ? "" : "s"} tubular${tubulares === 1 ? "" : "es"}`
          : null,
      ];
      break;
    }
    default:
      base = nombreModulo.toLowerCase();
      atributos = [];
  }
  // "en L" va pegado al nombre; lo demás separado por comas.
  const esL = typeof atributos[0] === "string" && atributos[0].startsWith("en L");
  const conL = esL ? `${base} ${atributos[0]}` : base;
  const resto = esL ? atributos.slice(1) : atributos;
  return [conL, ...resto].filter((p): p is string => Boolean(p)).join(", ");
}

/** "medidas 1.000 × 1.000 mm"; un proyectante sin diseño se mide por nave. */
function medidas(i: Record<string, unknown>, diseno: DisenoLaxo | null): string | null {
  const ancho = mm(i.anchoCm ?? i.anchoNaveCm);
  const alto = mm(i.altoCm ?? i.altoNaveCm);
  if (!ancho || !alto) return null;
  // Cabina en L con sus dos lados (X × Y) y el alto aparte.
  const ladoY = marcado(i.enL) ? mm(i.ladoYCm) : null;
  if (ladoY) return `medidas ${mil(ancho)} × ${mil(ladoY)} mm, alto ${mil(alto)} mm`;
  const porNave = !diseno && vacio(i.anchoCm) && !vacio(i.anchoNaveCm) && Math.floor(Number(i.numeroNaves)) > 1;
  return `medidas ${mil(ancho)} × ${mil(alto)} mm${porNave ? " por nave" : ""}`;
}

export function descripcionComercial(
  moduloId: string | null | undefined,
  input: Record<string, unknown> | null | undefined,
  resultado?: { diseno?: DisenoLaxo | null } | null
): string {
  const i = input ?? {};
  const modulo = moduloId ? getModulo(moduloId) : null;
  const campos = (modulo?.meta?.campos ?? []) as CampoLaxo[];
  const diseno = resultado?.diseno ?? null;
  const ubicacion = typeof i.descripcionItem === "string" ? i.descripcionItem.trim() : "";

  // Sin casilla de instalación (ítem libre): el texto es el del asesor.
  const tieneInstalacion = campos.some((c) => c.nombre === "conInstalacion");
  if (!tieneInstalacion) return ubicacion || modulo?.meta?.nombre || "Producto";

  const verbo = marcado(i.conInstalacion) ? "Suministro e instalación de" : "Suministro de";
  const cuerpo = [producto(String(moduloId), i, campos, diseno, modulo?.meta?.nombre ?? ""), medidas(i, diseno)]
    .filter(Boolean)
    .join(", ");
  const frase = `${verbo} ${cuerpo}`;
  return ubicacion ? `${ubicacion} — ${frase}` : frase;
}

export interface ResumenPersonalizacionLaxo {
  cambios?: Array<{ descripcionDe?: string; descripcionA?: string; de?: string; a?: string }>;
  quitados?: Array<{ descripcion?: string; codigo?: string }>;
  extras?: Array<{ descripcion?: string; codigo?: string }>;
}

/**
 * Segunda línea del ítem en el PDF cuando el asesor personalizó componentes
 * (punto 4 de la hoja de ruta, 2026-09-26): antes, una ventana con un perfil
 * cambiado salía igual que una de catálogo. Lee el resumen que el motor deja en
 * `resultado.personalizacion` (ver `aplicarPersonalizacion`), con las
 * descripciones del catálogo ya resueltas. Null si no hay nada que decir.
 */
export function personalizacionComercial(
  resultado: { personalizacion?: ResumenPersonalizacionLaxo | null } | null | undefined
): string | null {
  const r = resultado?.personalizacion;
  if (!r) return null;
  const nombre = (d?: string, c?: string) => (d?.trim() || c?.trim() || "").toLowerCase();
  // Un componente sin descripción ni código no se puede nombrar: se omite.
  const partes = [
    ...(r.cambios ?? []).map((c) => {
      const a = nombre(c.descripcionA, c.a);
      const de = nombre(c.descripcionDe, c.de);
      return a && de ? `${a} en lugar de ${de}` : null;
    }),
    ...(r.quitados ?? []).map((q) => (nombre(q.descripcion, q.codigo) ? `sin ${nombre(q.descripcion, q.codigo)}` : null)),
    ...(r.extras ?? []).map((e) => (nombre(e.descripcion, e.codigo) ? `incluye ${nombre(e.descripcion, e.codigo)}` : null)),
  ].filter((p): p is string => p !== null);
  return partes.length ? `Personalizado: ${partes.join("; ")}` : null;
}

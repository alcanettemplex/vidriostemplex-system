// Pruebas de `descripcionComercial` (cotizador/lib/detalleComercial.ts): la
// frase que ve el cliente en el PDF y el asesor en la pantalla —"Suministro e
// instalación de ventana 744 color mate, vidrio claro 4 mm crudo, medidas…"—.
//
// Función pura: lee el input guardado y las etiquetas que declara cada módulo;
// no toca la caché ni Postgres.
import { test } from "node:test";
import assert from "node:assert/strict";

import { descripcionComercial, personalizacionComercial } from "../../cotizador/lib/detalleComercial";

const VENTANA = { sistema: "744", colorPerfileria: "mate", anchoCm: 100, altoCm: 100, cuerpos: 2, codigoVidrio: "CL4MM01CR" };

test("ventana con instalación: el ejemplo del usuario, con el vidrio", () => {
  assert.equal(
    descripcionComercial("ventanas", { ...VENTANA, conInstalacion: true }),
    "Suministro e instalación de ventana 744 color mate, vidrio claro 4 mm crudo, medidas 1.000 × 1.000 mm"
  );
});

test("sin 'Con instalación' marcado es solo suministro", () => {
  assert.match(descripcionComercial("ventanas", { ...VENTANA, conInstalacion: false }), /^Suministro de ventana 744/);
});

test("la ubicación va al inicio", () => {
  assert.match(
    descripcionComercial("ventanas", { ...VENTANA, conInstalacion: true, descripcionItem: " Sala " }),
    /^Sala — Suministro e instalación de ventana 744/
  );
});

test("las opciones de una misma ventana se distinguen: crudo, templado y con película", () => {
  const a = descripcionComercial("ventanas", { ...VENTANA, codigoVidrio: "CL5MM01CR", conInstalacion: true });
  const b = descripcionComercial("ventanas", { ...VENTANA, codigoVidrio: "CL5MM03SP", conInstalacion: true });
  const c = descripcionComercial("ventanas", { ...VENTANA, codigoVidrio: "CL5MM03SP", pelicula: true, conInstalacion: true });
  assert.match(a, /vidrio claro 5 mm crudo,/);
  assert.match(b, /vidrio claro 5 mm templado,/);
  assert.match(c, /vidrio claro 5 mm templado, con película,/);
});

test("ventana por diseño: sistema del diseño y su forma; matizado y alfajía", () => {
  const d = descripcionComercial(
    "ventanas",
    { sistema: "7038", colorPerfileria: "gris plata", anchoCm: 160, altoCm: 130, codigoVidrio: "CL5MM03SP", matizado: "raya", alfajia: true, conInstalacion: true },
    { diseno: { sistema: "Sistema7038-Interior", diseno: "OXX", etiqueta: "Fijo + Corredizo + Corredizo" } }
  );
  assert.equal(
    d,
    "Suministro e instalación de ventana 7038 Interior (fijo + corredizo + corredizo) color gris plata, " +
      "vidrio claro 5 mm templado, matizado raya, con alfajía, medidas 1.600 × 1.300 mm"
  );
});

test("proyectante sin diseño se describe por naves; con diseño, por medida total", () => {
  assert.equal(
    descripcionComercial("proyectantes", {
      numeroNaves: 2, anchoNaveCm: 60, altoNaveCm: 50, colorPerfileria: "bronce", codigoVidrio: "CL5MM01CR", conInstalacion: true,
    }),
    "Suministro e instalación de ventana proyectante de 2 naves color bronce, vidrio claro 5 mm crudo, medidas 600 × 500 mm por nave"
  );
  const conDiseno = descripcionComercial(
    "proyectantes",
    { anchoNaveCm: 150, altoNaveCm: 60, anchoCm: 150, altoCm: 60, numeroNaves: 3, colorPerfileria: "mate", conInstalacion: true },
    { diseno: { sistema: "Sistema3831", etiqueta: "Proyectante + Proyectante" } }
  );
  assert.match(conDiseno, /^Suministro e instalación de ventana proyectante \(proyectante \+ proyectante\) color mate, medidas 1\.500 × 600 mm$/);
});

test("cabinas: tipo comercial, en L y vidrio templado", () => {
  assert.equal(
    descripcionComercial("cabinas-corredizas", { anchoCm: 120, altoCm: 190, espesorVidrioMm: 8, tipoSistema: "glasvit", enL: true, conInstalacion: true }),
    "Suministro e instalación de cabina de baño Glasvit en L, vidrio templado 8 mm, medidas 1.200 × 1.900 mm"
  );
  // Glasvit (antes Primavera, 2026-09-27): la marca no va en minúscula; el tipo sí.
  assert.match(
    descripcionComercial(
      "cabinas-corredizas",
      { anchoCm: 150, altoCm: 190, espesorVidrioMm: 8, tipoSistema: "corrediza", conInstalacion: true },
      { diseno: { sistema: "Cabina Glasvit", etiqueta: null } }
    ),
    /^Suministro e instalación de cabina de baño Glasvit, vidrio templado 8 mm,/
  );
  assert.match(
    descripcionComercial(
      "cabinas-corredizas",
      { anchoCm: 150, altoCm: 190, espesorVidrioMm: 8, conInstalacion: true },
      { diseno: { sistema: "Cabina Deslizante Torino", etiqueta: null } }
    ),
    /^Suministro e instalación de cabina de baño deslizante Torino,/
  );
  // En L: X × Y y el alto aparte; la configuración reemplaza la forma del diseño.
  assert.equal(
    descripcionComercial(
      "cabinas-corredizas",
      { anchoCm: 120, ladoYCm: 90, altoCm: 190, espesorVidrioMm: 8, enL: true, configuracionL: "2F1C", conInstalacion: true },
      { diseno: { sistema: "Cabina Glasvit", etiqueta: "Fijo + Corredizo" } }
    ),
    "Suministro e instalación de cabina de baño Glasvit en L (2 fijos + 1 corrediza), vidrio templado 8 mm, medidas 1.200 × 900 mm, alto 1.900 mm"
  );
  assert.equal(
    descripcionComercial("cabinas-batientes", { anchoCm: 90, altoCm: 190, espesorVidrioMm: 8, conInstalacion: true }),
    "Suministro e instalación de cabina de baño batiente, vidrio templado 8 mm, medidas 900 × 1.900 mm"
  );
});

test("tablero y espejo", () => {
  assert.equal(
    descripcionComercial("tablero", { anchoCm: 120, altoCm: 180, espesorMm: 6, matizado: true, conInstalacion: false }),
    "Suministro de tablero en vidrio templado 6 mm, matizado, medidas 1.200 × 1.800 mm"
  );
  assert.equal(
    descripcionComercial("espejo", { anchoCm: 100, altoCm: 100, acabado: "BISELADO", conInstalacion: true }),
    "Suministro e instalación de espejo 4 mm biselado, medidas 1.000 × 1.000 mm"
  );
  assert.equal(
    descripcionComercial("espejo", { anchoCm: 50, altoCm: 170, acabado: "BPB", tubularCantidad: 2, conInstalacion: true }),
    "Suministro e instalación de espejo 4 mm con borde pulido brillado, con 2 soportes tubulares, medidas 500 × 1.700 mm"
  );
});

test("ítem libre: el texto del asesor, sin prefijo", () => {
  assert.equal(descripcionComercial("item-libre", { descripcionItem: "Fachada oficina 2º piso", lineas: [] }), "Fachada oficina 2º piso");
  assert.equal(descripcionComercial(null, null), "Producto");
});

test("personalización: cambios, quitados y agregados en una línea legible", () => {
  const d = personalizacionComercial({
    personalizacion: {
      cambios: [{ de: "CAB0102", a: "CAB0105", descripcionDe: "5020 CABEZAL 144 MATE", descripcionA: "5020 CABEZAL REFORZADO MATE" }],
      quitados: [{ codigo: "EMP5020", descripcion: "EMPAQUE 5020 VIDRIO" }],
      extras: [{ codigo: "TUB0316", descripcion: "TUBO 1 PULGADA" }],
    },
  });
  assert.equal(
    d,
    "Personalizado: 5020 cabezal reforzado mate en lugar de 5020 cabezal 144 mate; sin empaque 5020 vidrio; incluye tubo 1 pulgada"
  );
  assert.equal(personalizacionComercial({ personalizacion: { cambios: [], quitados: [], extras: [] } }), null);
  assert.equal(personalizacionComercial(null), null);
});

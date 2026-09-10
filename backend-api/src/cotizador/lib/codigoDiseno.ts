// Parser del código de diseño del catálogo ("OX", "XOX", "OXXO_TORINO",
// "XXX_3P", "O_O", "ESP_FLOT_1"...) hacia la lista de paneles que describe.
//
// EL BUG QUE ESTO CORRIGE
// disenos.json trae un campo `paneles` que se calculó contando con una
// expresión regular TODAS las letras O,X,W,B,P,Z del código completo,
// sufijo incluido. El sufijo (todo lo que sigue al primer "_") es texto
// descriptivo libre — nombre de variante, de sistema comercial, nota de
// armado — y por pura coincidencia del idioma varias de esas palabras
// contienen una letra del alfabeto de panel: "CABINA" tiene una B, "TORINO"
// tiene dos O, "3P" tiene una P, "BOLSILLO_CERROJOPR" tiene una B y tres O.
// El resultado: XXX_3P (3 paneles reales, verificado contra sus 3 paños de
// vidrio) queda registrado con `paneles:4`; XOX_BOLSILLO_CERROJOPR (3
// paneles reales) queda registrado con `paneles:9`.
//
// Se verificó exhaustivamente contra los 138 diseños reales de disenos.json
// en pruebas_cotizador/codigoDiseno.test.ts (comparando el resultado de este
// parser contra la suma de `vidrios[].cantidad` de cada diseño, que es la
// fuente de verdad independiente: cuántos paños de vidrio se cortan de verdad).
// De los 138, esta regla de parseo coincide en los 138; el campo `paneles`
// original de disenos.json está corrupto en 43 de ellos (todos los que tienen
// sufijo con letras O/X/W/B/P/Z "de casualidad"). El detalle línea por línea de
// esa verificación queda en el propio test, no se repite aquí para no tener dos
// fuentes que puedan desincronizarse.
//
// LA REGLA REAL
// De los 138 códigos, sólo 3 usan "_" como separador de FILA (varios cuerpos
// apilados verticalmente, no lado a lado en el mismo nivel): O_O, O_O_O y
// OO_OO_OO, los tres del Sistema3831 (persianas apiladas). En TODOS los
// demás, "_" separa el código de su sufijo descriptivo y nada de lo que
// sigue aporta paneles. Por eso: se cuentan letras de panel SÓLO en el primer
// segmento (antes del primer "_"), salvo la tabla cerrada de abajo.
//
// Un caso más, propio del módulo espejo: un código "ESP_..." no es un patrón
// de paneles con letras — es un rectángulo de vidrio único con variante
// descriptiva (FLOT = flotante, ELEV = elevado, MARCO = con marco
// perimetral). Se modela como un panel único de tipo "E".

/** Alfabeto de panel válido. M (marco) NUNCA es panel aunque aparezca suelto
 * en el código ("MXX" tiene 2 paños de vidrio, no 3; "MXXX" tiene 3) — por
 * eso M no está aquí y basta con no incluirla para que quede excluida. */
const ALFABETO_PANEL = 'OXWBPZ';
const RE_LETRA_PANEL = /[OXWBPZ]/g;

// Dígitos finales tras una letra de panel ("XOX2", "Z1") o símbolos como el
// grado de un ángulo ("90°") no son paneles: no hace falta descartarlos con
// una regla aparte porque RE_LETRA_PANEL sólo captura letras del alfabeto de
// arriba — cualquier dígito, símbolo o letra fuera de OXWBPZ queda ignorado
// por construcción al usar `.match()`.

// Tabla EXPLÍCITA y cerrada a propósito: estos son los únicos 3 códigos de
// todo el catálogo (138 diseños) donde "_" separa filas reales en vez de
// introducir un sufijo. Verificado iterando disenos.json — ver cabecera. Un
// código nuevo que use "_" entra por la rama general (sufijo puro) salvo que
// alguien lo añada aquí a mano tras confirmar que de verdad es una fila.
const CODIGOS_CON_FILAS = new Set(['O_O', 'O_O_O', 'OO_OO_OO']);

export interface CodigoParseado {
  /** Array de arrays de letras — normalmente una sola fila con todos los
   * paneles, hasta 3 filas en los diseños apilados del Sistema3831. */
  filas: string[][];
  sufijo: string | null;
  confianza: 'alta' | 'nula';
  paneles: number;
  alas: number;
}

/**
 * Extrae las letras de panel válidas de un fragmento de código, en orden de
 * aparición. Cualquier carácter fuera del alfabeto (dígitos, guiones, "°",
 * letras de una palabra descriptiva) se ignora en silencio.
 */
function letrasPanel(segmento: unknown): string[] {
  return String(segmento ?? '').match(RE_LETRA_PANEL) ?? [];
}

function vacio(): CodigoParseado {
  return { filas: [], sufijo: null, confianza: 'nula', paneles: 0, alas: 0 };
}

/**
 * Parsea un código de diseño del catálogo.
 *
 * @param codigo - el código tal cual viene en `diseno.diseno` (NO el id
 *        completo "Sistema::codigo" — ese ya trae el sistema, que puede
 *        introducir sus propias letras del alfabeto por casualidad, p.ej.
 *        "Reforzado" tiene O y Z, y volvería a meter el mismo bug que esto
 *        corrige).
 * @param opts.modulo - `diseno.modulo`. Sólo se usa para activar la regla
 *        especial de espejo (códigos "ESP_...").
 *
 * `paneles` es el total de letras-panel en todas las filas (reemplaza a
 * `diseno.paneles`, corrupto en 43/138). `alas` cuenta cuántas de esas letras
 * son "X" (reemplaza a `codigo.match(/X/g).length` sobre el código completo,
 * que arrastra el mismo bug de sufijo — aunque en la práctica, dato curioso
 * verificado, ninguna palabra de sufijo del catálogo actual contiene una "X",
 * así que `alasCorredizas` nunca llegó a estar mal en los datos de hoy; sí lo
 * habría estado con el primer sufijo que la tuviera).
 *
 * Nunca lanza excepción: un código no reconocible devuelve `confianza:"nula"`
 * y `filas:[]`.
 */
export function parsearCodigo(codigo: unknown, { modulo }: { modulo?: string } = {}): CodigoParseado {
  try {
    const cod = String(codigo ?? '')
      .trim()
      .toUpperCase();
    if (!cod) return vacio();

    // Espejo: ESP_* es un panel único de vidrio, no una fórmula de letras.
    if (modulo === 'espejo' && cod.startsWith('ESP_')) {
      const sufijo = cod.slice(4) || null;
      return { filas: [['E']], sufijo, confianza: 'alta', paneles: 1, alas: 0 };
    }

    // Tabla cerrada de códigos con separador de FILA real.
    if (CODIGOS_CON_FILAS.has(cod)) {
      const filas = cod.split('_').map(letrasPanel);
      if (filas.some((f) => f.length === 0)) return vacio(); // defensivo; no ocurre con la tabla actual
      const planas = filas.flat();
      return {
        filas,
        sufijo: null,
        confianza: 'alta',
        paneles: planas.length,
        alas: planas.filter((l) => l === 'X').length,
      };
    }

    // Caso general: todo lo que sigue al primer "_" es sufijo descriptivo y
    // no aporta paneles, aunque contenga letras del alfabeto por coincidencia
    // del idioma — es justo el bug que este parser corrige.
    const posGuion = cod.indexOf('_');
    const cuerpo = posGuion === -1 ? cod : cod.slice(0, posGuion);
    const sufijo = posGuion === -1 ? null : cod.slice(posGuion + 1) || null;

    const fila = letrasPanel(cuerpo);
    if (fila.length === 0) return vacio();

    return {
      filas: [fila],
      sufijo,
      confianza: 'alta',
      paneles: fila.length,
      alas: fila.filter((l) => l === 'X').length,
    };
  } catch {
    // No debería poder llegar aquí (todo lo de arriba es aritmética sobre
    // strings), pero la regla del contrato es "nunca lanza": si algo
    // imprevisto pasa, se declara no reconocido en vez de tumbar al llamador.
    return vacio();
  }
}

export { ALFABETO_PANEL };

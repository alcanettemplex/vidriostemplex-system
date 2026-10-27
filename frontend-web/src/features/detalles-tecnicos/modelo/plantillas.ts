// Catálogo migrado de «1.1 DETALLES TECNICOS.xlsx»: una plantilla por hoja.
// Las cotas de herrajes (30, 60, 200, 900…) salen de las celdas de cada hoja. El Excel no
// registra ancho y alto (se escribían a mano), así que se usan medidas típicas editables.
// Donde el Excel era ambiguo se tomó la lectura más razonable del dibujo: revisar con el taller.
// Muescas de esquina de puerta: `mue(largo sobre el borde sup/inf, alto sobre el canto)` — 150×35,
// no 35×150 (corregido con el plano del taller, 2026-10-23).

import type { Pieza, Plantilla } from './tipos';
import {
  agrupar,
  arco,
  BQ,
  BQA,
  CH,
  PF,
  bisagras,
  boton,
  cierrePuerta,
  cuatroEsquinas,
  desplome,
  dsp,
  esq,
  kitOptiglass,
  manijaRoma,
  mue,
  muescaPiso,
  NOTA,
  muescasFijo,
  nuevoId,
  perfCorredera,
  perfGlassvit,
  pieza,
  rad,
  toalleroHor,
  toalleroVer,
} from './constructores';

export { nuevoId };

const despuntesCorredera = () => esq({ si: dsp(30), sd: dsp(30) });

export const FAMILIAS = ['Corredizas', 'Glassvit', 'Batientes', 'Fijos', 'Tableros', 'Puertas', 'Optiglass', 'Formas y perforaciones'] as const;

export const PLANTILLAS: Plantilla[] = [
  // ── Corredizas ─────────────────────────────────────────────────────────────
  { id: 'corr-boton', nombre: 'Corrediza con botón', hoja: 'CORR BOTÓN', familia: 'Corredizas', descripcion: '2 despuntes 30×30, 2 perf. Ø6 para rodamientos y perf. Ø8 para botón.', pieza: pieza(600, 1900, [...perfCorredera(), ...boton(40, 900)], despuntesCorredera()) },
  { id: 'corr-toahor', nombre: 'Corrediza toallero horizontal', hoja: 'CORR TOAHOR', familia: 'Corredizas', descripcion: 'Despuntes 30×30, rodamientos Ø6 y toallero horizontal Ø8 a 950 mm.', pieza: pieza(600, 1900, [...perfCorredera(), ...toalleroHor(50, 950)], despuntesCorredera()) },
  { id: 'corr-toaver', nombre: 'Corrediza toallero vertical', hoja: 'CORR TOAVER', familia: 'Corredizas', descripcion: 'Despuntes 30×30, rodamientos Ø6 y toallero vertical Ø8 (800–1000 mm).', pieza: pieza(600, 1900, [...perfCorredera(), ...toalleroVer(70, 800)], despuntesCorredera()) },
  { id: 'deslizante', nombre: 'Deslizante', hoja: 'DESLIZANTE', familia: 'Corredizas', descripcion: '2 perf. Ø6 superiores y perf. Ø8 lateral para manija.', pieza: pieza(600, 1900, [...agrupar('Rodamientos de deslizante', [PF(6, 30, 'izq', 15, 'sup'), PF(6, 30, 'der', 15, 'sup')]), PF(8, 25, 'izq', 0, 'centro')]) },

  // ── Glassvit ───────────────────────────────────────────────────────────────
  { id: 'glassvit-boton', nombre: 'Glassvit con botón', hoja: 'GLASSVIT BOTON', familia: 'Glassvit', descripcion: '2 perf. Ø14 superiores a 70 mm y botón Ø8.', pieza: pieza(600, 1900, [...perfGlassvit(70), ...boton(50, 900)]) },
  { id: 'glassvit-toahor', nombre: 'Glassvit toallero horizontal', hoja: 'GLASSVIT TOAHOR', familia: 'Glassvit', descripcion: '2 perf. Ø14 superiores a 60 mm y toallero horizontal Ø8 (300 mm).', pieza: pieza(600, 1900, [...perfGlassvit(60), ...toalleroHor(40, 950, 300)]) },
  { id: 'glassvit-toaver', nombre: 'Glassvit toallero vertical', hoja: 'GLASSVIT TOAVER', familia: 'Glassvit', descripcion: '2 perf. Ø14 superiores a 60 mm y toallero vertical Ø8.', pieza: pieza(600, 1900, [...perfGlassvit(60), ...toalleroVer(50, 750)]) },

  // ── Batientes ──────────────────────────────────────────────────────────────
  { id: 'bat-2840-boton', nombre: 'Batiente 28-40 con botón', hoja: 'BAT 28-40 BOTON', familia: 'Batientes', descripcion: '4 perf. Ø16 de bisagra (28 + 40 mm, a 200 mm) y botón Ø8 a 1000 mm.', pieza: pieza(700, 1900, [...bisagras(28, 40), ...boton(50, 1000)]) },
  { id: 'bat-2840-thor', nombre: 'Batiente 28-40 toallero horizontal', hoja: 'BAT 28-40 THOR', familia: 'Batientes', descripcion: 'Bisagras 28-40 y toallero horizontal Ø8 de 200 mm.', pieza: pieza(700, 1900, [...bisagras(28, 40), ...toalleroHor(50, 1000)]) },
  { id: 'bat-2840-tver', nombre: 'Batiente 28-40 toallero vertical', hoja: 'BAT 28-40 TVER', familia: 'Batientes', descripcion: 'Bisagras 28-40 y toallero vertical Ø8.', pieza: pieza(700, 1900, [...bisagras(28, 40), ...toalleroVer(60, 900)]) },
  { id: 'bat-1pto-25', nombre: 'Batiente 1 punto 25 con botón', hoja: 'BAT 1PTO-25 BOTON', familia: 'Batientes', descripcion: '2 perf. Ø16 a 25 mm del canto y botón Ø8.', pieza: pieza(700, 1900, [PF(16, 25, 'izq', 200, 'sup'), PF(16, 25, 'izq', 200, 'inf'), ...boton(50, 900)]) },
  { id: 'bat-2530-boton', nombre: 'Batiente 25-30 con botón', hoja: 'BAT 25-30 BOTON', familia: 'Batientes', descripcion: '4 perf. Ø16 de bisagra (25 + 30 mm) y botón Ø8.', pieza: pieza(700, 1900, [...bisagras(25, 30), ...boton(50, 900)]) },
  { id: 'bat-2530-tver', nombre: 'Batiente 25-30 toallero vertical', hoja: 'BAT 25-30 TVER', familia: 'Batientes', descripcion: 'Bisagras 25-30 y toallero vertical Ø8.', pieza: pieza(700, 1900, [...bisagras(25, 30), ...toalleroVer(60, 900)]) },
  { id: 'bat-2530-thor', nombre: 'Batiente 25-30 toallero horizontal', hoja: 'BAT 25-30 THOR', familia: 'Batientes', descripcion: 'Bisagras 25-30 y toallero horizontal Ø8.', pieza: pieza(700, 1900, [...bisagras(25, 30), ...toalleroHor(50, 1000)]) },
  { id: 'bat-esqbot', nombre: 'Batiente esquinero con botón', hoja: 'BAT ESQBOT', familia: 'Batientes', descripcion: 'Muescas de esquina 75×25 para bisagra esquinera y botón Ø8.', pieza: pieza(700, 1900, boton(50, 900), esq({ si: mue(75, 25), ii: mue(75, 25) })) },
  { id: 'bat2840-chaflan', nombre: 'Batiente 28-40 con chaflán', hoja: 'BAT28-40 CHAFLAN', familia: 'Batientes', descripcion: 'Batiente 28-40 con botón y chaflán en el canto superior.', pieza: pieza(700, 1900, [...bisagras(28, 40), ...boton(50, 1000), CH('sup', 10)]) },

  // ── Fijos ──────────────────────────────────────────────────────────────────
  { id: 'corr-fijo-des1', nombre: 'Fijo desplome (abre abajo)', hoja: 'CORR FIJO DES1', familia: 'Fijos', descripcion: 'Canto derecho inclinado: más ancho abajo.', pieza: pieza(600, 1900, [], esq(), desplome('der', 570)) },
  { id: 'corr-fijo-des2', nombre: 'Fijo desplome (abre arriba)', hoja: 'CORR FIJO DES2', familia: 'Fijos', descripcion: 'Canto derecho inclinado: más ancho arriba.', pieza: pieza(600, 1900, [], esq(), desplome('der', 630)) },
  { id: 'fijo-bat-2cha3020', nombre: 'Fijo batiente 2 muescas 30×20', hoja: 'FIJO BAT 2CHA3020', familia: 'Fijos', descripcion: '2 muescas en el canto derecho a 200 mm (20 alto × 30 prof.).', pieza: pieza(400, 1900, muescasFijo(20, 30)) },
  { id: 'fijo-bat-2cha3530', nombre: 'Fijo batiente 2 muescas 35×30', hoja: 'FIJO BAT 2CHA3530', familia: 'Fijos', descripcion: '2 muescas en el canto derecho a 200 mm (30 alto × 35 prof.).', pieza: pieza(400, 1900, muescasFijo(30, 35)) },
  { id: 'fijo-bat-3cha3020', nombre: 'Fijo batiente 3 muescas 30×20', hoja: 'FIJO BAT 3CHA3020', familia: 'Fijos', descripcion: '2 muescas laterales + muesca de piso a 100 mm.', pieza: pieza(400, 1900, [...muescasFijo(20, 30), ...muescaPiso(30, 20)]) },
  { id: 'fijo-bat-3cha3530', nombre: 'Fijo batiente 3 muescas 35×30', hoja: 'FIJO BAT 3CHA3530', familia: 'Fijos', descripcion: '2 muescas laterales 35×30 + muesca de piso.', pieza: pieza(400, 1900, [...muescasFijo(30, 35), ...muescaPiso(35, 30)]) },
  { id: 'fijo-cha-perf', nombre: 'Fijo con muescas y perforaciones', hoja: 'FIJO CHA-PERF', familia: 'Fijos', descripcion: 'Muescas 35×30, muesca de piso y 4 perf. Ø16 de bisagra 35-35.', pieza: pieza(400, 1900, [...muescasFijo(30, 35), ...muescaPiso(35, 30), ...bisagras(35, 35)]) },
  { id: 'fij-bat-3chades1', nombre: 'Fijo 3 muescas con desplome 1', hoja: 'FIJ-BAT 3CHADES1', familia: 'Fijos', descripcion: 'Desplome derecho, 2 muescas 35×30 y muesca de piso.', pieza: pieza(400, 1900, [...muescasFijo(30, 35), ...muescaPiso(35, 30)], esq(), desplome('der', 370)) },
  { id: 'fij-bat-3chades2', nombre: 'Fijo 3 muescas con desplome 2', hoja: 'FIJ-BAT 3CHADES2', familia: 'Fijos', descripcion: 'Desplome derecho inverso, 2 muescas 35×30 y muesca de piso.', pieza: pieza(400, 1900, [...muescasFijo(30, 35), ...muescaPiso(35, 30)], esq(), desplome('der', 430)) },
  { id: 'fij-bat-2chades12', nombre: 'Fijo 2 muescas con desplome 1-2', hoja: 'FIJ-BAT 2CHADES1-2', familia: 'Fijos', descripcion: 'Desplome derecho y 2 muescas 35×30.', pieza: pieza(400, 1900, muescasFijo(30, 35), esq(), desplome('der', 370)) },
  { id: 'fij-bat-2chades21', nombre: 'Fijo 2 muescas con desplome 2-1', hoja: 'FIJ-BAT 2CHADES2-1', familia: 'Fijos', descripcion: 'Desplome derecho inverso y 2 muescas 35×30.', pieza: pieza(400, 1900, muescasFijo(30, 35), esq(), desplome('der', 430)) },
  { id: 'fijo-3cha90', nombre: 'Fijo 3 muescas a 90°', hoja: 'FIJO-3CHA90°', familia: 'Fijos', descripcion: 'Muescas 30×20, muesca de piso y 4 perf. Ø16 (35-35).', pieza: pieza(400, 1900, [...muescasFijo(20, 30), ...muescaPiso(30, 20), ...bisagras(35, 35)]) },
  { id: 'fijo2840-chaflan', nombre: 'Fijo 28-40 con chaflán', hoja: 'FIJO28-40 CHAFLAN', familia: 'Fijos', descripcion: 'Muescas 35×30, muesca de piso y chaflán superior.', pieza: pieza(400, 1900, [...muescasFijo(30, 35), ...muescaPiso(35, 30), CH('sup', 10)]) },

  // ── Tableros ───────────────────────────────────────────────────────────────
  { id: 'tabl-4phor', nombre: 'Tablero 4 perf. horizontal', hoja: 'TABL 4PHOR', familia: 'Tableros', descripcion: '4 perf. Ø14 a 50×50 mm de cada esquina.', selloEnCanto: true, pieza: pieza(1200, 600, cuatroEsquinas(14, 50, 50)) },
  { id: 'tabl-4pver', nombre: 'Tablero 4 perf. vertical', hoja: 'TABL 4PVER', familia: 'Tableros', descripcion: '4 perf. Ø14 a 50×50 mm de cada esquina.', selloEnCanto: true, pieza: pieza(600, 1200, cuatroEsquinas(14, 50, 50)) },
  { id: 'tabl-6phor', nombre: 'Tablero 6 perf. horizontal', hoja: 'TABL 6PHOR', familia: 'Tableros', descripcion: '4 perf. Ø14 en esquinas + 2 al centro de los cantos largos.', selloEnCanto: true, pieza: pieza(1800, 600, [...cuatroEsquinas(14, 50, 50), PF(14, 0, 'centro', 50, 'sup'), PF(14, 0, 'centro', 50, 'inf')]) },
  { id: 'tabl-6pver', nombre: 'Tablero 6 perf. vertical', hoja: 'TABL 6PVER', familia: 'Tableros', descripcion: '4 perf. Ø14 en esquinas + 2 al centro de los cantos largos.', selloEnCanto: true, pieza: pieza(600, 1800, [...cuatroEsquinas(14, 50, 50), PF(14, 50, 'izq', 0, 'centro'), PF(14, 50, 'der', 0, 'centro')]) },
  { id: 'tabl-4per-4rad', nombre: 'Tablero 4 perf. y 4 radios', hoja: 'TABL 4PER-4RAD', familia: 'Tableros', descripcion: '4 perf. Ø14 a 100×65 mm y radios de 10 mm.', selloEnCanto: true, pieza: pieza(1200, 600, cuatroEsquinas(14, 100, 65), esq({ si: rad(10), sd: rad(10), id: rad(10), ii: rad(10) })) },
  { id: 'pasa-voz', nombre: 'Pasa voz', hoja: 'PASA VOZ', familia: 'Tableros', descripcion: 'Roseta de 5 perf. Ø12 separadas 50 mm, centrada a lo ancho.', selloEnCanto: true, pieza: pieza(993, 872, [PF(12, 0, 'centro', 450, 'inf'), PF(12, -50, 'centro', 450, 'inf'), PF(12, 50, 'centro', 450, 'inf'), PF(12, 0, 'centro', 400, 'inf'), PF(12, 0, 'centro', 500, 'inf')]) },

  // ── Puertas ────────────────────────────────────────────────────────────────
  { id: 'pta-tiprompicolo', nombre: 'Puerta tipo Rompicolo', hoja: 'PTA TIPROMPICOLO', familia: 'Puertas', descripcion: 'Boquete de cerradura 150×35 a 1000 mm y perf. Ø14.', pieza: pieza(900, 2100, [BQ('der', 1000, 'fin', 150, 35, 15), PF(14, 85, 'der', 800, 'inf')]) },
  { id: 'pta-esq-perf-a', nombre: 'Puerta esquina + perf. A', hoja: 'PTA ESQ PERF-A', familia: 'Puertas', descripcion: 'Muesca superior 110×35 con perf. Ø16, cerradura y perf. Ø14.', pieza: pieza(900, 2100, [PF(16, 60, 'izq', 135, 'sup'), ...cierrePuerta(), PF(14, 90, 'der', 800, 'inf')], esq({ si: mue(110, 35) })) },
  { id: 'pta-esq-perf-b', nombre: 'Puerta esquina + perf. B', hoja: 'PTA ESQ PERF-B', familia: 'Puertas', descripcion: 'Muescas superior e inferior 110×35 con perf. Ø16, cerradura y perf. Ø14.', pieza: pieza(900, 2100, [PF(16, 60, 'izq', 135, 'sup'), PF(16, 60, 'izq', 135, 'inf'), ...cierrePuerta(), PF(14, 90, 'der', 800, 'inf')], esq({ si: mue(110, 35), ii: mue(110, 35) })) },
  { id: 'pta-romesqured', nombre: 'Puerta esquina redonda', hoja: 'PTA ROMESQURED', familia: 'Puertas', descripcion: 'Muescas 150×35 superior e inferior, cerradura y perf. Ø14.', pieza: pieza(900, 2100, [...cierrePuerta(), PF(14, 90, 'der', 800, 'inf')], esq({ si: mue(150, 35), ii: mue(150, 35) })) },
  { id: 'pta-esqred-roma40', nombre: 'Puerta esquina redonda · manija Roma 40', hoja: '', familia: 'Puertas', descripcion: 'Muescas 150×35 superior e inferior, cerradura 75×90 de fondo redondo a 1000 mm y 2 perf. Ø14 de manija Roma a 120 del canto (800 y 1200 mm).', pieza: pieza(900, 2100, [BQ('der', 1000, 'fin', 75, 90, 37.5), ...manijaRoma(120)], esq({ si: mue(150, 35), ii: mue(150, 35) })) },
  // Del plano del taller (2026-10-27), sin hoja en el Excel. Perf. Ø16 a 135 del canto y 25 del borde,
  // fuera de la muesca 110×35; cerradura 75×90 de fondo redondo y manija Roma a 150 del canto.
  { id: 'pta-esq-perf-a-roma150', nombre: 'Puerta esquina + perf. A · manija Roma 150', hoja: '', familia: 'Puertas', descripcion: 'Muesca superior 110×35 con perf. Ø16 (a 135 del canto y 25 de arriba), muesca inferior 150×35, cerradura 75×90 de fondo redondo a 1000 mm y 2 perf. Ø14 de manija Roma a 150 del canto (800 y 1200 mm).', pieza: pieza(900, 2100, [PF(16, 135, 'izq', 25, 'sup'), BQ('der', 1000, 'fin', 75, 90, 37.5), ...manijaRoma(150)], esq({ si: mue(110, 35), ii: mue(150, 35) })) },
  { id: 'pta-esq-perf-a-sin-manija', nombre: 'Puerta esquina + perf. A · sin manija', hoja: '', familia: 'Puertas', descripcion: 'Muesca superior 110×35 con perf. Ø16 (a 135 del canto y 25 de arriba), muesca inferior 150×35 y cerradura 75×90 de fondo redondo a 1000 mm.', pieza: pieza(900, 2100, [PF(16, 135, 'izq', 25, 'sup'), BQ('der', 1000, 'fin', 75, 90, 37.5)], esq({ si: mue(110, 35), ii: mue(150, 35) })) },
  { id: 'pta-esq-perf-b-roma150', nombre: 'Puerta esquina + perf. B · manija Roma 150', hoja: '', familia: 'Puertas', descripcion: 'Muescas superior e inferior 110×35 con perf. Ø16 (a 135 del canto y 25 del borde), cerradura 75×90 de fondo redondo a 1000 mm y 2 perf. Ø14 de manija Roma a 150 del canto (800 y 1200 mm).', pieza: pieza(900, 2100, [PF(16, 135, 'izq', 25, 'sup'), PF(16, 135, 'izq', 25, 'inf'), BQ('der', 1000, 'fin', 75, 90, 37.5), ...manijaRoma(150)], esq({ si: mue(110, 35), ii: mue(110, 35) })) },
  { id: 'pta-esq-perf-b-sin-manija', nombre: 'Puerta esquina + perf. B · sin manija', hoja: '', familia: 'Puertas', descripcion: 'Muescas superior e inferior 110×35 con perf. Ø16 (a 135 del canto y 25 del borde) y cerradura 75×90 de fondo redondo a 1000 mm.', pieza: pieza(900, 2100, [PF(16, 135, 'izq', 25, 'sup'), PF(16, 135, 'izq', 25, 'inf'), BQ('der', 1000, 'fin', 75, 90, 37.5)], esq({ si: mue(110, 35), ii: mue(110, 35) })) },
  { id: 'pta-flautaacero', nombre: 'Puerta flauta acero', hoja: 'PTA FLAUTAACERO', familia: 'Puertas', descripcion: 'Grupos de perf. Ø16 para herraje de acero arriba y abajo, cerradura lateral.', pieza: pieza(900, 2100, [PF(16, 30, 'der', 70, 'sup'), PF(16, 30, 'der', 105, 'sup'), PF(16, 30, 'der', 140, 'sup'), PF(16, 30, 'der', 70, 'inf'), PF(16, 30, 'der', 105, 'inf'), PF(16, 30, 'der', 140, 'inf'), BQ('izq', 1000, 'fin', 75, 30, 15), PF(16, 150, 'izq', 800, 'inf')]) },
  { id: 'pta-corre-acero', nombre: 'Puerta corrediza acero', hoja: 'PTA CORRE ACERO', familia: 'Puertas', descripcion: 'Perf. Ø16 dobles para carros de acero y perf. de manija.', pieza: pieza(900, 2100, [PF(16, 70, 'izq', 70, 'sup'), PF(16, 140, 'izq', 70, 'sup'), PF(16, 70, 'der', 70, 'sup'), PF(16, 140, 'der', 70, 'sup'), PF(16, 35, 'der', 1000, 'inf'), PF(16, 35, 'der', 1150, 'inf')]) },
  { id: 'pta-bat-jupiter', nombre: 'Puerta batiente Júpiter', hoja: 'PTA BAT JUPITER', familia: 'Puertas', descripcion: 'Muescas 150×35 para pivotes y boquete de cerradura.', pieza: pieza(900, 2100, cierrePuerta(), esq({ si: mue(150, 35), ii: mue(150, 35) })) },
  { id: 'fijo-jupiter', nombre: 'Fijo Júpiter', hoja: 'FIJO JUPITER', familia: 'Puertas', descripcion: 'Boquete recibidor de cerradura a 1005 mm.', pieza: pieza(600, 2100, [BQ('der', 1005, 'fin', 75, 30, 15)]) },
  { id: 'recibidor-picoloro', nombre: 'Recibidor Picoloro', hoja: 'RECIBIDOR PICOLORO', familia: 'Puertas', descripcion: 'Boquete recto 75×35 para recibidor.', pieza: pieza(600, 2100, [BQ('der', 1000, 'fin', 75, 35)]) },
  { id: 'recibidor-redondo', nombre: 'Recibidor redondo', hoja: 'RECIBIDOR REDONDO', familia: 'Puertas', descripcion: 'Boquete redondeado 75×30 para recibidor.', pieza: pieza(600, 2100, [BQ('der', 1000, 'fin', 75, 30, 15)]) },
  { id: 'glass-rect-nave', nombre: 'Glass rectangular nave', hoja: 'GLASS RECT. NAVE', familia: 'Puertas', descripcion: 'Perf. Ø17 y Ø12 superiores para herraje y 2 perf. Ø8 de manija.', pieza: pieza(700, 2000, [PF(17, 60, 'izq', 30, 'sup'), PF(17, 60, 'der', 30, 'sup'), PF(12, 60, 'izq', 86, 'sup'), PF(12, 60, 'der', 86, 'sup'), PF(8, 40, 'izq', 1000, 'inf'), PF(8, 40, 'izq', 1200, 'inf')]) },
  // Plantillas nuevas (2026-10-20), sin hoja en el Excel: del plano que mandó el taller.
  { id: 'pta-boquetes-alivio', nombre: 'Puerta con boquetes de alivio', hoja: '', familia: 'Puertas', descripcion: '2 boquetes 60×38 en el canto izquierdo con alivios Ø16 hasta 40 mm, centrados a 300 de arriba y de abajo, y 2 perf. Ø14 de manija a 400 mm.', pieza: pieza(600, 1760, [...agrupar('Boquetes de bisagra', [BQA('izq', 270, 'inicio', 60, 38, 16, 40), BQA('izq', 270, 'fin', 60, 38, 16, 40)]), PF(14, 70, 'der', 680, 'inf'), PF(14, 70, 'der', 1080, 'inf')]) },
  { id: 'glass-rect-fijo', nombre: 'Glass rectangular fijo', hoja: 'GLASS RECT. FIJO', familia: 'Puertas', descripcion: '2 perf. Ø14 superiores a 60×60 mm.', pieza: pieza(500, 2000, [PF(14, 60, 'izq', 60, 'sup'), PF(14, 60, 'der', 60, 'sup')]) },

  // ── Optiglass ──────────────────────────────────────────────────────────────
  // Familia propia desde el 2026-10-22: las cuatro comparten el kit (Ø23 + ranura de 12 a 85 y 21).
  // La primera es la del plano del taller (sin hoja en el Excel); las otras tres, las hojas OPTIGLASS1-3.
  { id: 'optiglass-roma-picoloro', nombre: 'Optiglass · manija Roma + cerradura Picoloro', hoja: '', familia: 'Optiglass', descripcion: 'Kit Optiglass, cerradura Picoloro 150×35 de esquinas rectas centrada a 1000 mm del piso y 2 perf. Ø14 de manija Roma a 85 del canto (800 y 1200 mm).', pieza: pieza(900, 2140, [...kitOptiglass(), BQ('der', 925, 'fin', 150, 35), ...manijaRoma()]) },
  { id: 'optiglass1', nombre: 'Optiglass 1', hoja: 'OPTIGLASS1', familia: 'Optiglass', descripcion: 'Kit Optiglass, boquete de cerradura 150×35 R15 a 1000 mm y 1 perf. Ø14 a 800 mm.', pieza: pieza(900, 2100, [...kitOptiglass(), BQ('der', 1000, 'fin', 150, 35, 15), PF(14, 85, 'der', 800, 'inf')]) },
  { id: 'optiglass2', nombre: 'Optiglass 2', hoja: 'OPTIGLASS2', familia: 'Optiglass', descripcion: 'Kit Optiglass y perf. Ø50 de manija a 80 del canto.', pieza: pieza(900, 2100, [...kitOptiglass(), PF(50, 80, 'der', 1000, 'inf')]) },
  { id: 'optiglass3', nombre: 'Optiglass 3', hoja: 'OPTIGLASS3', familia: 'Optiglass', descripcion: 'Kit Optiglass y perf. Ø50 centrada.', pieza: pieza(900, 2100, [...kitOptiglass(), PF(50, 0, 'centro', 1000, 'inf')]) },

  // ── Formas y perforaciones ─────────────────────────────────────────────────
  { id: 'en-blanco', nombre: 'En blanco', hoja: 'EN BLANCO', familia: 'Formas y perforaciones', descripcion: 'Vidrio rectangular sin procesos: agrega lo que necesites.', pieza: pieza(1000, 1000) },
  { id: 'una-perf', nombre: 'Una perforación', hoja: 'UNA PERF', familia: 'Formas y perforaciones', descripcion: '1 perf. Ø8 lateral a media altura.', selloEnCanto: true, pieza: pieza(500, 800, [PF(8, 40, 'izq', 0, 'centro')]) },
  { id: 'dos-perf', nombre: 'Dos perforaciones', hoja: 'DOS PERF', familia: 'Formas y perforaciones', descripcion: '2 perf. Ø8 superiores a 43×35 mm.', selloEnCanto: true, pieza: pieza(800, 500, [PF(8, 43, 'izq', 35, 'sup'), PF(8, 43, 'der', 35, 'sup')]) },
  { id: 'cuatro-perf', nombre: 'Cuatro perforaciones', hoja: 'CUATRO PERF', familia: 'Formas y perforaciones', descripcion: '4 perf. Ø10 en las esquinas.', selloEnCanto: true, pieza: pieza(1000, 500, cuatroEsquinas(10, 50, 50)) },
  { id: 'vid-4radver', nombre: 'Vidrio 4 radios vertical', hoja: 'VID 4RADVER ', familia: 'Formas y perforaciones', descripcion: 'Radios en las 4 esquinas.', selloEnCanto: true, pieza: pieza(600, 800, [], esq({ si: rad(30), sd: rad(30), id: rad(30), ii: rad(30) })) },
  { id: 'vid-4radhor', nombre: 'Vidrio 4 radios horizontal', hoja: 'VID 4RADHOR', familia: 'Formas y perforaciones', descripcion: 'Radios en las 4 esquinas.', selloEnCanto: true, pieza: pieza(900, 500, [], esq({ si: rad(30), sd: rad(30), id: rad(30), ii: rad(30) })) },
  { id: 'vid-2radhor', nombre: 'Vidrio 2 radios horizontal', hoja: 'VID 2RADHOR', familia: 'Formas y perforaciones', descripcion: 'Radios en las 2 esquinas superiores.', selloEnCanto: true, pieza: pieza(900, 500, [], esq({ si: rad(40), sd: rad(40) })) },
  { id: 'boquete', nombre: 'Boquete de esquina 300×300', hoja: 'BOQUETE', familia: 'Formas y perforaciones', descripcion: 'Corte en L de 300×300 mm en la esquina superior izquierda.', pieza: pieza(1000, 800, [], esq({ si: mue(300, 300) })) },
  { id: 'boquete-esq', nombre: 'Boquete de esquina inferior', hoja: 'BOQUETE ESQ.', familia: 'Formas y perforaciones', descripcion: 'Corte rectangular pequeño en la esquina inferior izquierda.', pieza: pieza(500, 1900, [], esq({ ii: mue(60, 100) })) },
  { id: 'semicirculo', nombre: 'Semicírculo', hoja: '', familia: 'Formas y perforaciones', descripcion: 'Medio círculo: el lado derecho completo en arco. El ancho es la mitad del alto.', pieza: pieza(935, 1870, [NOTA('BORDE PULIDO MATE', 45, 50)], esq(), arco('der')) },
  { id: 'deschor', nombre: 'Descuadre horizontal', hoja: 'DESCHOR', familia: 'Formas y perforaciones', descripcion: 'Canto superior inclinado (lado derecho más bajo).', pieza: pieza(1200, 700, [], esq(), { tipo: 'desplome-superior', lado: 'der', altoLado: 520 }) },
];

export const plantillaPorId = (id: string) => PLANTILLAS.find((p) => p.id === id);

/** Copia profunda con ids nuevos, lista para editar sin tocar el catálogo. */
export function clonarPieza(p: Pieza): Pieza {
  const c: Pieza = JSON.parse(JSON.stringify(p));
  const grupos = new Map<string, string>();
  c.operaciones = c.operaciones.map((o) => {
    if (!o.grupo) return { ...o, id: nuevoId() };
    if (!grupos.has(o.grupo.id)) grupos.set(o.grupo.id, nuevoId());
    return { ...o, id: nuevoId(), grupo: { ...o.grupo, id: grupos.get(o.grupo.id)! } };
  });
  return c;
}

/**
 * Ancho × alto que representa la medida del vidrio en el pedido. En un desplome lateral el ancho
 * es el MAYOR de los dos (abajo o arriba): la hoja del pedido lleva el ancho mayor y es el que se
 * imprime en ANCHO (`medidasCaja`). El descuadre del borde superior sigue con `alto` tal cual
 * (decisión del usuario, 2026-10-17).
 */
export function medidaPedido(p: Pieza): { ancho: number; alto: number } {
  const ancho = p.contorno.tipo === 'desplome-lateral' ? Math.max(p.ancho, p.contorno.anchoSup) : p.ancho;
  return { ancho, alto: p.alto };
}

/**
 * La pieza de una plantilla llevada a otras medidas. Las perforaciones y boquetes se miden desde los
 * bordes, así que se reubican solos; los desplomes conservan su diferencia de medida. En el desplome
 * lateral `ancho` es el ancho MAYOR (ver `medidaPedido`): un «abre arriba» lo pone arriba. Antes iba
 * siempre abajo, y un «abre arriba» de 1150 salía con 1180 arriba, sin cuadrar con el pedido.
 */
export function piezaConMedidas(p: Pieza, ancho: number, alto: number): Pieza {
  const c = clonarPieza(p);
  let anchoAbajo = ancho;
  if (c.contorno.tipo === 'desplome-lateral') {
    const d = c.contorno.anchoSup - p.ancho;
    if (d > 0) anchoAbajo = ancho - d;
    c.contorno = { ...c.contorno, anchoSup: anchoAbajo + d };
  }
  if (c.contorno.tipo === 'desplome-superior') c.contorno = { ...c.contorno, altoLado: alto + (c.contorno.altoLado - p.alto) };
  return { ...c, ancho: anchoAbajo, alto };
}

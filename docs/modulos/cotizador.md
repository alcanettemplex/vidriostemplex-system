# Módulo Cotizador

Cotizador de ventanas, puertas, cabinas y espejos de aluminio/vidrio. Portado desde un proyecto
standalone como módulo `/cotizador` del ERP, **aislado del flujo**: no genera ODP, no lee clientes
ni el catálogo del módulo Proveedores por su cuenta (sí toma costos de ahí, ver más abajo).

Solo `root` / `admin`.

> **Para qué se está construyendo:** el destino del módulo —integrar el Excel de cotización, traer
> el despiece a la SAP, cargar el plano en el Det. Técnico y tener estadística comercial— está en
> [`cotizador-vision.md`](cotizador-vision.md). Ese documento es **destino, no pendiente**: el
> aislamiento descrito arriba sigue vigente y nada de allí se implementa sin orden explícita.

---

## Lo primero que hay que entender: cotizar y cortar son dos cosas distintas

Es la confusión que más tiempo ha costado en las sesiones, así que va arriba del todo.

| | Qué hace | Estado |
|---|---|---|
| **Cotizar** | Metes medidas → sale el precio | ✅ Funciona desde la Etapa 3 |
| **Orden de corte** | El papel para el taller: "corta este perfil a 483 mm" | ⚙️ Habilitado desde 2026-09-19, con ±1 mm |

Toda la maquinaria de calibración, niveles A/B/C y `aptitudOrden.ts` pertenece **exclusivamente** a
la segunda. Un problema de calibración nunca impidió cotizar.

Verificación en vivo (2026-09-19): Sistema5020, 1000×1500 mm, mate, vidrio claro 4 mm →
**$465.854,56**, sin errores ni advertencias.

---

## Dónde vive

**Backend**
- `backend-api/src/cotizador/` — motores portados (~4.700 LOC), `cache.ts`, `modules/` (**7**: los 6
  de producto más `itemLibre`, ver "Ítem libre" más abajo),
  `lib/` (cálculo, despiece, plano, aptitud, calibración, sincronización con Proveedores)
- `backend-api/src/controllers/cotizador_*.controller.ts` — 9 controladores
- `backend-api/src/routes/cotizador.routes.ts` — **51 endpoints** bajo `/api/cotizador` (verificado
  por conteo el 2026-09-21 — la cifra anterior, 40, ya estaba desactualizada antes de hoy)
- `backend-api/src/scripts/pruebas_cotizador/` — 7 suites, `npm run test:cotizador`

**Frontend** — `frontend-web/src/features/cotizador/`, 5 pestañas:
Cotizar · Actual · Guardadas · Calibración · Configuración. Sin Redux (estado local, mismo criterio
que el Explorador ODP).

**BD** — 21 tablas en el schema **`cotizador`**, sin prefijo: `cotizador.producto`, no
`public.cotizador_producto`. Los archivos y clases sí conservan el prefijo
(`CotizadorProducto`, `cotizador_producto.model.ts`).

### Tres trampas del schema propio

1. Los 8 ENUM `enum_cotizador_*` **siguen en `public`** a propósito: el pooler de Supabase en modo
   transacción no propaga `search_path`, y `public` siempre resuelve.
2. `auditoria_log.tabla` guarda el nombre **calificado** (`cotizador.producto`).
   `root.controller.ts` lo parte con `identificadorSql()`.
3. Cualquier consulta a `pg_tables`/`information_schema` que filtre por `'public'` deja el
   cotizador fuera. Ya mordió una vez, en el respaldo del panel ROOT.

Script reversible: `2026-09-12_mover_cotizador_a_schema.ts --revertir`.

---

## Unidades: el vendedor ve milímetros, el motor calcula en centímetros

Los campos siguen llamándose `anchoCm` / `altoCm` porque así lo espera el motor verificado contra el
golden master. La conversión ×10 / ÷10 vive **enteramente en `CampoDinamico.tsx`** (detecta
`campo.nombre.endsWith('Cm')`).

⚠️ **No reintroducir la conversión en ningún otro punto del árbol.**

---

## Niveles de corte: qué significan de verdad

Cada pieza de cada diseño tiene un nivel, y el del diseño es el **peor** de sus piezas.

| Nivel | Qué significa | ¿Sirve para cortar? |
|---|---|---|
| **A** | Fórmula determinada, dispersión 0 | Sí |
| **B** | Candidatos coinciden **dentro de 1 mm** — error **acotado** | Sí, desde 2026-09-19 |
| **C** | Error **crece con el vano** (hasta 3,3 mm, sin tope) o sin modelo | **No** |

La diferencia entre B y C no es de grado. Un error acotado se absorbe con la holgura de instalación
(3 mm configurados); uno que se agranda con el tamaño de la ventana, no.

Reparto actual: **15 A · 124 B · 24 C** de 163 diseños. A nivel de pieza: 980 perfiles A, 222 B.

### Por qué existe el nivel B (la causa raíz, verificada el 2026-09-19)

Los despieces se extrajeron del software de origen en **tres vanos: 1000×1200, 1000×600 y
500×1200**. Los tres son múltiplos de 100, así que toda división cae exacta y **el truncamiento
nunca se manifiesta**: `trunc((A−69)/2)` y `trunc((A−70)/2)` dan lo mismo en 1000 y en 500.

**No falta información: se preguntó en medidas que no podían revelarla.**

Dato revelador: de los 980 perfiles nivel A, **975 usan `exacto` con n=1** — son piezas que no
dividen (marco = ancho, jamba = alto − k) y por eso nunca redondean. Los dudosos son exactamente
las piezas que se reparten entre hojas. Por eso **no hay convención transferible de A a B**: forzar
truncamiento en los dudosos resuelve 0 de 419 (probado), porque la ambigüedad está en la constante,
no en la operación.

### Cómo se cerraría de raíz

Una sola lectura en una medida **no redonda**. La óptima, calculada por barrido:
**903 × 601 mm** → cierra 241 de 419 piezas (57,5 %); con una segunda (902×701), 293 (69,9 %).

Los datos crudos están en `multimedida.json` (4,2 MB, 1.992 extracciones, 652 diseños) dentro del
proyecto externo, y los 139 diseños afectados están **todos** cubiertos por su `fix_mapa.json`.

🔴 **Bloqueador actual: la cuenta del software de origen está vencida.** Sin ella no hay extracción.
Alternativa sin suscripción: el catálogo técnico del fabricante de perfilería, que trae las cotas y
permite escribir las fórmulas directamente en vez de deducirlas.

---

## Aptitud para la orden de corte — las 8 condiciones

`cotizador/lib/aptitudOrden.ts`. `CODIGOS_MOTIVO` es contrato estable; la redacción puede cambiar.
El frontend **solo renderiza `texto`, no ramifica por `codigo`**.

| # | Condición | Notas |
|---|---|---|
| 1 | Cotización aprobada | |
| 2 | Tiene despiece por diseño | Un espejo o tablero no lo tiene: bloqueo legítimo |
| 3 | Nivel aceptable | Acepta **A y B**; frena C y nivel *desconocido* |
| 4 | Holgura configurada | 1 fila global vigente, 3 mm / 3 mm |
| 5 | Apto para corte | Ver "el artefacto del blob", abajo |
| 6 | Sin errores de presupuesto | |
| 7 | Sistema en producción | **Desactivada** — `EXIGIR_SISTEMA_EN_PRODUCCION = false` |
| 8 | Despiece vigente | Recalcula y compara contra lo guardado |

### Dos constantes que gobiernan todo esto

- `NIVELES_APTOS_PARA_CORTE` en `motorDespiece.ts` — `{A, B}`
- `EXIGIR_SISTEMA_EN_PRODUCCION` en `aptitudOrden.ts` — `false`

**Deben moverse juntas con la condición 3**, que replica el criterio para redactar el motivo. Si
divergen, un ítem sale apto sin explicación o al revés. Ambas están comentadas en sitio con el
razonamiento y la fecha. Ver `TECH_DEBT.md` 2026-09-19 (2).

### El artefacto del blob — releer antes de tocar la condición 5

`resultado.aptoParaCorte` es un **booleano grabado en el JSONB el día que se cotizó el ítem**, con
la regla de niveles vigente entonces. Cambiar el motor **no reescribe los blobs ya guardados**.

Cuando B pasó a ser apto, las 4 cotizaciones existentes seguían bloqueadas con ese booleano en
`false` pese a tener **cero líneas en error**. La condición 5 pasa a **reevaluar el criterio sobre
los datos crudos del blob** (el nivel y si alguna línea quedó en error), que son hechos del cálculo
y no cambian cuando cambia la regla. Si el blob ni trae `items`, se respeta lo guardado.

⚠️ Y la supresión del motivo es `nivel === "C"`, **no** `"B" || "C"`. Con B apto, un
`aptoParaCorte:false` en un diseño B solo puede venir de una medida inválida; callarlo daría un
**bloqueo mudo**.

---

## Calibración — existe entera, pero no es obligatoria

Tablas (`calibracion_sistema` / `margen` / `holgura` / `contraste` / `historial`), matemática
(`lib/calibracion.ts`), 13 endpoints de escritura y la pestaña `TabCalibracion.tsx`. **Todo
operativo.**

Estado real en BD: `calibracion_margen` **0**, `calibracion_contraste` **0**,
`calibracion_sistema` **0**, `calibracion_holgura` 2 (1 vigente, global, 3/3 mm).

Dos invariantes que no se negocian:
- **AUSENTE ≠ CERO.** "No he medido esta pieza" y "la medí y no lleva descuento" llevan a decisiones
  distintas: un nivel sin valor se **omite** del objeto, nunca se guarda como 0.
- **El contraste es dato crudo:** jamás se corrige ni se borra, solo se anula lógicamente. Y
  `medida_sistema_bruta_mm` es **sin margen aplicado** — si se contrastara la medida ya corregida,
  la calibración se validaría a sí misma.

`EN_PRODUCCION` nunca se escribe a mano: "reanudar" un sistema escribe `'VALIDADO'` como centinela,
porque `madurezDeSistema` solo trata de forma especial la cadena exacta `'EN_CALIBRACION'`.

---

## Precios: de dónde sale el costo

`cotizador.producto` se vincula a `catalogo_productos` por `codigo`, y de ahí a `proveedor_producto`.
El motor `lib/sincronizacionProveedores.ts` (enganchado en `actualizarPrecio`) mueve los costos.

- **Multiplicadores por categoría** en `cotizador.multiplicador_categoria`, configurables desde la
  pestaña Configuración. Una categoría sin fila devuelve `configurado: false`, **no cero** — un
  multiplicador en cero pondría todos los precios en cero.
- Un producto sin `catalogo_producto_id` **nunca** se sincroniza: su costo queda congelado en lo que
  esté escrito a mano.
- ⚠️ El campo **AIU se divide, no se multiplica** (`subtotal / aiu`): el 4 % se escribe **0,96**.
  Escribir `0,04` multiplicaba el total por 25. El piso está en 0,5 en frontend y backend.

Ver `docs/modulos/compras.md` para las reglas del módulo del que vienen esos costos.

---

## Generador de perfilería para SAP (2026-09-21)

`cotizador/lib/generadorSapPerfileria.ts` — función pura, **aislada**: no toca Postgres, no conoce
`sap_items` ni `ODP`, y no decide aptitud (eso sigue siendo de `evaluarAptitudOrden()`; el llamador
debe filtrar los ítems con `porItem[].imprimible === true` **antes** de pasarlos aquí). Dado el
despiece ya calculado de los ítems de una propuesta, produce las columnas `CANT.`/`DIMENSION` de una
SAP, agrupadas por código de catálogo (que ya codifica perfil+color).

Reglas de negocio confirmadas por el maestro del taller el 2026-09-21 — no vuelvas a preguntarlas,
ver el detalle completo en `cotizador-vision.md`:
- **Barra comercial fija en 6 m**, para cualquier perfil (`MM_POR_BARRA` en el archivo).
- **`CANT.` no es bin-packing** — es `ceil(metros totales con 5 % de desperdicio / 6)`. El retal lo
  gestiona el taller a mano, ingresándolo a inventario; pedir de más es aceptable, pedir de menos no.
- Las **letras A, B, C…** de cada fila siguen el **orden de entrada del asesor** (primera aparición
  del código entre los ítems), no una heurística geométrica. Distinto de la heurística
  horizontal/vertical de `ordenCorte.ts` (piezas dentro de UN despiece), que sigue sin confirmar.
- Perfiles que el proveedor entrega ya cortados: sin tratamiento especial, a criterio del asesor.

Para que el generador pueda leer `codigo` y `desperdicioPct` por corte sin re-derivar la lógica de
color/fallback, `motorDespiece.ts` ahora los agrega (aditivo) a cada elemento de
`resultado.cortes.perfiles[]` — campos nuevos, ninguno existente cambió. Consecuencia: **los blobs
de cotización guardados antes del 2026-09-21 no traen estos dos campos**, así que el generador los
excluye con advertencia explícita ("clona la propuesta para regenerar") en vez de asumir 0 % de
desperdicio o adivinar el código.

⚠️ **Sigue sin conectarse a nada** — no hay endpoint, no hay botón en `SAPModal`. Bloqueado por la
falta de vínculo Cotización↔ODP (`cotizador-vision.md` → sección "Identidad"): sin saber qué
cotización alimenta qué SAP, no hay desde dónde invocarlo.

---

## Pruebas

`npm --prefix backend-api run test:cotizador` — 7 suites, **84 pruebas**. En verde (84/84,
verificado el 2026-09-22 **suite por suite**: 11 `codigoDiseno` · 16 `plano` · 3 `humo` ·
7 `accesorios` · 18 `cargos` · 10 `generadorSapPerfileria` · 19 `itemLibre`). Una corrida con el
pool de Supabase ya ocupado por otra cosa dio 28 fallos falsos el 2026-09-21 y 47 el 2026-09-22 —
ver advertencia de conexiones más abajo.

### ⚠️ Bajar el backend dev antes de correrlas

Las suites precargan la caché, que abre su propia conexión a Supabase. Con `npm run dev` levantado
se agotan las **15 conexiones del pooler** y fallan con:

```
SequelizeConnectionError: (EMAXCONNSESSION) max clients reached in session mode
```

Engaña, porque **no falla la suite que toca el cambio**: fallan las que dependen de la caché, que
pueden ser cualquiera. Mordió dos veces en la misma sesión y da la impresión de una regresión que no
existe. Liberar el puerto 3001, correr, y volver a levantar.

### Cómo verificar SIN bajar el backend dev (2026-09-22)

El patrón del fallo falso es reconocible de un golpe: **fallan exactamente las suites que precargan
caché y pasan las puras**. Medido con `npm run dev` levantado, corriendo las 7 seguidas:

```
codigoDiseno  11/11 ✅   plano 16/16 ✅   generadorSapPerfileria 10/10 ✅   ← no tocan Postgres
humo 0/3 ❌   accesorios 0/7 ❌   cargos 0/18 ❌   itemLibre 0/19 ❌        ← precargan caché
```

Las cuatro de abajo pasan al 100 % **corridas de una en una**, con unos 12 s entre ellas para que el
pooler libere. Cada suite abre su caché en el `before` y la cierra en el `after`, así que una sola a
la vez cabe junto al backend dev; el problema es solaparlas. Sirve para verificar un cambio sin
interrumpir a nadie, y es lo que se hizo el 2026-09-22.

Un `0/N` limpio —ni una sola prueba pasando— es casi siempre esto y casi nunca una regresión: una
regresión real rompe algunas pruebas, no todas.

### El centinela del catálogo

`humo.test.ts` afirma un número exacto de productos (**469** desde el 2026-09-16). No es un dato
decorativo: vigila que los **126 productos `PROVISIONAL`** —precios del software externo, no
verificados— no se mezclen con el catálogo real (464 `CATALOGO` + 5 `ALTA`). Si el conteo cambia sin
que nadie lo espere, esa mezcla es la primera sospecha.

Cada vez que crezca legítimamente hay que **actualizar el número y dejar el renglón** explicando por
qué, como hacen las entradas anteriores del archivo. Un centinela que falla siempre deja de vigilar:
el fallo que importa se confunde con el ruido de fondo.

⚠️ El **golden master** (`test:cotizador:golden`) sí sigue obsoleto desde el 2026-09-11 — 6 de 10
fallan por datos, no por código. **No confiar en él como red antes de regenerarlo.**

---

## Decisiones cerradas — no volver a preguntar

1. Port completo pero **aislado** del flujo del ERP.
2. Todo a Postgres con caché en memoria al arrancar — necesaria, no es solo egress: los motores son
   síncronos y Sequelize es async.
3. **Sin Redux** para el estado del módulo.
4. Identidad visual propia dentro del lenguaje del ERP: Space Grotesk / Manrope.
5. Prefijo `cotizador` en todo — choque real con `/api/cotizaciones`, `features/cotizaciones/` y
   `cotizacionesSlice`, que son el COTModal de la ODP, otra cosa.
6. Sin identidad de usuario: `asesor` / `registrado_por` son texto libre, sin FK a `usuarios`.
7. Auditoría solo en 5 tablas: producto, precio_override, cotizacion, cotizacion_item, parametro.
8. **El nombre del software externo de origen no puede aparecer en ningún dato ni código del ERP.**
   Verificación: `grep -ri "<nombre del software de origen>" backend-api/src frontend-web/src` → 0.
   **El repositorio ya no deletrea ese nombre en ninguna parte** (2026-09-22), tampoco en esta
   documentación, así que el `grep` lo tiene que escribir quien lo conozca. Se repasó, además, lo que
   la regla no decía explícitamente y es donde de verdad importa: la **base de datos**. Barrido
   `ILIKE` sobre las 327 columnas de texto y 22 JSONB de `public` + `cotizador` → **0**.
   `cotizador.producto.fuente` —el único campo que viaja al frontend como `fuentePrecio`— ya venía
   neutralizado desde la siembra ("referencia externa · <acabado>").
   Se incumplió entre el 2026-09-13 y el 2026-09-22 en 4 archivos de `scripts/`, uno de ellos un
   **dato** (`modelos_corte.json`, campo `nota`); lo detectó el `TECH_DEBT.md` 2026-09-19 (4) y se
   cerró ahí mismo. Si vuelve a aparecer, el sitio probable es un script one-off nuevo: los
   comentarios que explican de dónde salieron los despieces son la tentación natural.
9. Unidades visibles en milímetros; contrato interno en centímetros.
10. El milímetro del nivel B es **indiferente**, en aluminio y en vidrio (2026-09-19).

---

## PDF de cotización (2026-09-21)

`GET /api/cotizador/cotizaciones/:id/propuestas/:pid/pdf` — el documento que el asesor envía al
cliente por WhatsApp (`cotizador-vision.md` → "Aprobación del cliente, en dos tiempos", fase 1: PDF
a mano, el asesor marca `APROBADA` en el sistema). Botón "Descargar PDF" en
`ModalDetalleCotizacion.tsx`, sobre la propuesta que se esté mirando (no forzosamente la elegida).

- **`pdfmake@0.3.11` exacto** (instalado, `--save-exact`) — 0.3 reescribió el motor sobre `pdfkit` y
  cambió la API entera frente a la 0.2. Por eso **no** se instaló `@types/pdfmake` (describe la 0.2,
  declararía una API que ya no existe): los tipos mínimos que usa el generador están a mano en
  `backend-api/src/types/pdfmake.d.ts`. ⚠️ Esa declaración ambiental no llega sola al programa de
  `ts-node` si nadie más la importa (a diferencia de `tsc`, que usa el `include` del tsconfig
  entero) — de ahí el `/// <reference path=... />` en `generadorPdfCotizacion.ts`.
- **Fuente:** Helvetica (las 14 estándar de pdfkit, sin archivos que embeber). La identidad visual
  del Cotizador en pantalla usa Space Grotesk/Manrope, pero traerlas al PDF exige generar un
  `vfs_fonts` propio — no entró en esta v1.
- **`setLocalAccessPolicy`**: pdfkit resuelve las 14 fuentes estándar por el mismo camino que un
  archivo local (`PDFDocument.provideFont` → `validateLocalFile`), así que negar la política entera
  bloquea también `Helvetica-Bold`. Sólo se permiten los 4 nombres que declara
  `pdfmake/standard-fonts/Helvetica`; cualquier otra ruta sigue denegada — el documento nunca
  referencia un archivo del disco, el logo llega como data URI.
- **Contenido real, no de relleno**: el módulo lee `cotizador.empresa` / `cotizador.empresa_logo`
  (`store/empresaStore.ts`), que ya tenían sembrados desde el 2026-09-07
  (`2026-09-07_sembrar_datos_cotizador.ts`) los datos reales de Vidrios Templex — razón social, NIT,
  cuenta Bancolombia, garantía, validez de la oferta (8 días hábiles) y **las 11 condiciones
  comerciales verbatim** del negocio. No hizo falta ninguna migración ni placeholder: esa
  infraestructura se construyó por adelantado pensando en esta etapa.
- **Ítems en el PDF muestran `subtotalConAiu` (sin IVA), no `item.total`**: el IVA de cada ítem
  guardado en su blob está "a precio lleno, sin el descuento de la propuesta" (ver "Propuestas y
  cargos" más arriba); sumar esos `total` no cuadraría con `total_productos`. El PDF pone un solo
  IVA agrupado al final, como cualquier factura — matemáticamente consistente con el contrato de
  `calcularTotalesPropuesta`, que es de donde salen los 5 totales que el PDF sólo lee (no recalcula).
- **"Otras propuestas presentadas"**: sólo si la cotización tiene más de una — nombre + total, nunca
  su detalle completo (ya lo fija `cotizador-vision.md`).
- **Paleta estimada del logo real** (`frontend-web/public/assets/images/logotemplex.png`), no un
  código de marca confirmado — navy `#1B3A63` / azul `#2E75B6`. Es el único punto a tocar si el
  usuario da los códigos exactos.

---

## Hoja de Trabajo (2026-09-21, rediseñada 2026-09-22)

Documento **interno para el taller, sin plata** — no confundir con el PDF de cotización de arriba
(ese sí lleva precios y es para el cliente). Botón "Hoja de Trabajo" en `ModalDetalleCotizacion.tsx`,
junto al de "Descargar PDF".

**Una página por ítem** (2026-09-22, reemplaza el esquema original de "página 1 con el resumen de
TODOS los ítems + página 2 con las specs de TODOS los ítems" — ver git log si hace falta el diseño
viejo). A pedido explícito del usuario, es una **réplica del formato de
`frontend-web/src/features/odp/components/PrintableDetalleTecnico.tsx`** (la Hoja de Detalle
Técnico de la ODP real): misma cabecera (logo + título centrado + caja con número, aquí el número
de ÍTEM en vez del de ODP), misma tabla de datos con bordes gruesos (`.excel-table`), mismas DOS
cajas apiladas con borde grueso — arriba el plano (donde el ODP pone el croquis), abajo "Cortes del
taller" (donde el ODP pone "Observación de instalación"). Tamaño Carta, no A4 — distinto del resto
de printables del Cotizador, que son A4.

- **Ambas cajas tienen ALTURA FIJA** (430px el plano, 400px los cortes — decisión explícita del
  usuario, igual que el ODP). La del plano sí lleva `overflow: hidden` (como el ODP: es una imagen/
  SVG que se ajusta con `preserveAspectRatio`); la de cortes **no** — es una tabla de largo
  variable, y si un ítem trae más perfiles de los que caben en 400px la tabla se sale del borde en
  vez de truncar filas. Perder una medida de corte por un borde imperfecto sería peor que el borde.
- **Ítem sin diseño:** no tiene ni plano ni despiece calculable — el endpoint
  `GET /cotizaciones/:id/items/:itemId/despiece` rechaza con 400 "Este ítem no tiene despiece por
  diseño" cuando `resultado.cortes` no existe (sólo lo llena `calcularDespiecePorDiseno`, la rama
  que corre cuando el vendedor eligió un diseño). Igual lleva su página completa, con aviso en cada
  caja ("Sin plano — cotizado por medidas libres" / "Sin despiece calculado") — no desaparece del
  documento.
- **Aviso de confiabilidad**, sin cambios de criterio: reutiliza `ordenarParaTaller()`
  (`ordenCorte.ts`) para el orden de los perfiles y el mismo corte que `NIVELES_APTOS_PARA_CORTE`
  en `motorDespiece.ts` (A y B pasan, C o "sin nivel" avisan) — `esConfiable()` en
  `PrintableHojaTrabajo.tsx` replica ese criterio explícitamente; si `NIVELES_APTOS_PARA_CORTE`
  cambia, hay que tocar también ahí. **Sale siempre** (sigue sin pasar por `/aptitud`: es el único
  documento de taller que existe), avisa en rojo en vez de bloquear la impresión.
- **100 % lectura, sin recalcular nada.** `cot.items` de la propuesta que se está mirando ya trae
  `input` completo; el plano y el despiece se piden por ítem (mismo patrón: por propuesta activa),
  y se cargan en cuanto se abre el detalle — antes los planos sólo se pedían al entrar a "Vista
  técnica", pero la Hoja de Trabajo se imprime desde "Normal".
- **`window.print()` vía `abrirVentanaImpresion()`**, no pdfmake — mismo patrón que
  `PrintableProduccion`/`PrintableOA` de la ODP real. A diferencia del PDF de cotización, esta hoja
  nunca sale del edificio, así que no necesita ser un archivo portátil.
- ⚠️ **No confundir con `ordenCorte.ts`**: ese archivo ordena las PIEZAS dentro de un despiece para
  una futura Orden de Corte (heurística horizontal/vertical, sin confirmar con el taller); la Hoja
  de Trabajo no llega a ese nivel de detalle, sólo reutiliza su función de orden.
- **La v1 (2026-09-21) resolvía los campos técnicos de "página 1" de forma genérica** contra
  `modulo.campos` filtrando por `grupo: 'medidas' | 'vidrio'`. Esa tabla **se eliminó** en el
  rediseño del 2026-09-22 — "sólo plano y cortes", instrucción explícita del usuario — así que ese
  mecanismo genérico ya no se usa aquí (sigue vivo en otros puntos del árbol, no se tocó).
- Componente: `frontend-web/src/features/cotizador/components/PrintableHojaTrabajo.tsx`, renderizado
  siempre oculto (`display:none`) dentro del modal; el botón lee su `innerHTML` al imprimir.

---

## Ítem libre — el 7º módulo (2026-09-22)

El ítem que el asesor arma **línea por línea** con cualquier código del catálogo, para lo que no
encaja en ninguno de los seis productos: fachadas, divisiones de oficina, barandas, pasamanos.

**Por qué existe:** el Excel de los asesores no tiene sólo los seis productos. La hoja
`Formato Digital` tiene además **trece bloques idénticos rotulados "PLANTILLAS"** donde el vendedor
escribe un código, el Excel le resuelve descripción / unidad / precio del segmento con
`VLOOKUP(Tabla_Costos, MATCH(segmento, COSTOS!L1:W1))`, y él pone el área o la cantidad. En el
archivo vivo hay ítems rotulados **"Fachada"**, **"División de oficina"** y **"Mayor seguridad"**.
Mientras el ERP sólo supiera cotizar los seis módulos, **el Excel no se podía jubilar**.

`backend-api/src/cotizador/modules/itemLibre.ts` + `registry.ts`.
**Sin migración de BD:** `cotizacion_item.modulo_id` es `STRING(30)` sin FK ("el registry vive en
código"), `input` es JSONB, y `diseno_id`/`sistema`/`nivel_corte` son nullable.

### Las cuatro cosas que NO hace, a propósito

1. **No emite `cortes`.** Sin diseño no hay despiece, ni plano, ni nivel — igual que en el Excel.
   `aptitudOrden` ya trataba la ausencia de `resultado.cortes` como `SIN_DESPIECE_POR_DISENO`, y la
   Hoja de Trabajo ya imprimía sus avisos "Sin plano" / "Sin despiece calculado": **no hubo que
   tocar ninguno de los dos.**
2. **No agrega SMO ni flete al BOM**, aunque el Excel sí los pone como dos líneas más (`SMO01`,
   `GTFA26`). `totalizar()` multiplica cada línea del BOM por `cantidadPiezas`: meterlos ahí
   reproduce el bug medido el 2026-09-20 (cinco piezas, cinco fletes). Son cargos de la propuesta.
3. **No declara `descuentoPct`** — un solo descuento, en la propuesta.
4. **No hace `unidadOverride`.** La unidad que vale es la del catálogo, que es la misma que el
   formulario usó para rotular la cantidad; forzarla sería contradecir la etiqueta que vio el
   vendedor.

### La unidad del catálogo decide qué significa `cantidad`

No hay campo "tipo de línea": lo decide el producto, como en el Excel. `claseDeUnidad()` clasifica
por **contenido y no por lista exacta**, para que una unidad nueva caiga en el grupo correcto en vez
de degradarse a "unidades" en silencio.

| Clase | Unidades reales hoy | Rótulo |
|---|---|---|
| área | `X M2` (37 productos) | m² |
| lineal | `X METRO` (217) · `ML` (2) | ml |
| unidad | `UND` (176) | und |

⚠️ **`PERF01` y `ELE1101` NO son `UND` en el catálogo del ERP**: están como `X METRO`
(`PERFORACION HASTA 20MM`), aunque la tabla ACABADOS del Excel los listaba como `UNID`. Por eso
`tablero.ts` los pide con `unidadOverride: "UND"` — ese módulo sabe que cuenta piezas, no metros. En
un ítem libre, un código así cobra su cantidad **como metros lineales**. Lo descubrió una prueba que
los usaba de ejemplo de "UND" y falló; el ejemplo correcto es `BES0302`.

### Frontend

`EditorLineasLibres.tsx` (nuevo) es una tabla editable con buscador de catálogo, precio en vivo del
segmento elegido y subtotal por línea. Se engancha por el tipo de campo **`lineas`** (nuevo en el
union `TipoCampo`), que `CampoDinamico` delega entero — no es un control con label, es una tabla.

Tres detalles del enganche:
- **El buscador pide el catálogo ENTERO una vez** y filtra en memoria. Es la excepción a la nota de
  `apiGetCatalogo` ("siempre con `categoria`"): aquí el vendedor puede necesitar cualquier código.
  Barato: el endpoint responde desde la caché en memoria del backend, no toca Postgres, no suma
  egress.
- **`CampoDinamico` recibe `segmento`** (prop nueva, opcional). Un campo no ve a sus hermanos, y la
  previsualización de precio necesita saber si es PA, PM o PB; lo pasa `FormularioModulo`, que sí
  tiene el input completo.
- **`esVacio()` ahora trata `[]` como vacío.** Sin eso, un ítem libre sin una sola línea pasaba la
  validación de `requerido` y el 400 lo daba el motor, con el toast genérico en vez del
  "Completa: …" que señala el campo.

### `descripcionItem` dejó de ser `null` fijo

`TabCotizar` guardaba **todos** los ítems con `descripcionItem: null`, así que todos caían al
respaldo `"<modulo> #N"` de `cotizacionStore`. Para un ítem libre eso le llegaría al cliente como
`"item-libre #3"` en vez de `"Fachada oficina 2º piso"`. Ahora lee el campo del input si el módulo
lo declara: es **genérico**, cualquier módulo que declare `descripcionItem` gana nombre propio.

### Consecuencia aceptada

`evaluarAptitudOrden` marca la cotización completa como `imprimible` sólo si **todos** sus ítems lo
son. Un ítem libre apaga esa bandera agregada — igual que ya pasaba con un espejo o un tablero. Lo
que el taller usa es `porItem`, ítem por ítem, así que no se pierde información.

### Lo que no hubo que tocar (verificado, no supuesto)

`clonarPropuesta` es data-driven: `moduloAcepta()` mira `meta.campos`, y como el ítem libre no
declara `codigoVidrio`/`pelicula`/`matizado`, se copia intacto con una advertencia legible. El
`cotizarItem` del controlador despacha por `getModulo()` sin lista fija. El PDF lee
`subtotalConAiu` y `descripcion_item`. `generadorSapPerfileria` nunca lo recibe porque el llamador
filtra por `imprimible`. La Hoja de Trabajo sólo usa `modulo.nombre` como respaldo del rótulo.

**Centinela actualizado:** `cargos.test.ts` afirmaba `listarModulos().length === 6`; ahora **7**, con
el renglón que explica por qué. Sigue vigilando lo mismo (que nadie vuelva a declarar
`descuentoPct`).

---

## El Excel de los asesores — qué más quedó fuera del port (2026-09-22)

Auditoría del archivo que usan hoy los asesores
(`ORIGINAL PARA COPIAR no tocar.xlsb`, 20 hojas, 1,1 MB). **Sin VBA** — 0 módulos, toda la lógica
está en fórmulas, así que es auditable al 100 %. Se trabajó siempre sobre una copia; el original no
se abrió en modo escritura.

Lo que ya estaba portado y verificado: los 6 módulos 1:1, el AIU `0,96` (`COSTOS!G7`), los estados
`PENDIENTE/APROBADA/CANCELADO/PERDIDO` (`Parametros!G`), los segmentos PA/PM/PB, las cuatro tarifas
de SMO, los kits `K1000…K2000`, los cargos `GTFA26`/`ALQU36`/`HUAC06`, y los bugs del Excel (#4
código sin precio, #5 `PELI31` duplicado, #10 doble conteo).

### 1. El modelo de márgenes: el *porqué* de los 12 multiplicadores

`cotizador.multiplicador_categoria` guarda 12 números que el script de siembra documenta como
*"observado en 221 de 363 productos"* y *"el usuario lo aportó"* — es decir, se obtuvieron por
**ingeniería inversa estadística**. `COSTOS!A1:D16` tiene la máquina que los produce:

```
PRODUCC 18,55%   ADMON 20,39%   VTAS 12,08%   FNROS 3,99%
UTILIDAD ESPERADA  11% (PA) / 10% (PM) / 9% (PB)
T. GTOS FIJOS      66,01% / 65,01% / 64,01%
Comisión: VIDRIO 11/10/9%  ·  ACABADO-ACCESORIO-PERFILERÍA 10/8/7%
```

Factor = `1 / (1 − Σ cargas ponderadas)`, con ponderación distinta por categoría:

| Categoría | Composición (PA) | Factor PA | En BD |
|---|---|---|---|
| ACABADO | ADMON×62,5% + VTAS×100% + comisión 10% | 1,534301 | ✅ igual |
| VIDRIO | PRODUCC×70% + ADMON×50% + VTAS×50% + utilidad 11% | 1,672800 | ✅ igual |
| ACCESORIO | PRODUCC×50% + ADMON×50% + VTAS×50% + comisión 10% | 1,550628 | ✅ igual |
| PERFILERIA | PRODUCC×70% + ADMON×40% + VTAS×40% + comisión 10% | 1,561841 | ✅ igual |

`PM = (PA + PB) / 2` siempre. Coinciden **dígito por dígito** con lo que hay en BD, lo que también
explica los *outliers* de la siembra (12 de 14, 35 de 37, 221 de 363): son productos con precio
puesto a mano, fuera del modelo.

⚠️ **Asimetría real, documentada sin tocar** (decisión del usuario, 2026-09-22): VIDRIO es la única
categoría cuya fórmula incluye *utilidad esperada* y **no** comisión; las otras tres incluyen
comisión y no utilidad. Puede ser deliberado o un arrastre de 2021. **No se "corrigió": los precios
de venta vigentes salen de ahí**, y unificarla movería el precio del vidrio en todas las
cotizaciones futuras sin que nadie lo haya pedido.

**No está implementado.** El ERP sigue guardando el resultado, no el modelo. Consecuencia: si ADMON
sube del 20,39 % al 22 %, hay que recalcular 12 números a mano.

### 2. La barra de 6 m ya estaba en el Excel

`cotizador-vision.md` daba el largo de barra como "el dato que falta y bloquea todo", resuelto por
testimonio del maestro el 2026-09-21. Estaba escrito: `COSTOS!N = IF(TIPO="PERFILERIA", W/6, W)` —
el costo por metro se obtiene dividiendo el de la barra entre 6, en las 363 filas de perfilería— y
`PRECIOS!E` = 6 por fila. El 6 m tiene respaldo documental, no sólo verbal.

### 3. `Hoja3` — compras reales con Centro de Costos = ODP

Export de facturas de compra con **`Vr und Restado dscto`** (precio neto de descuento: la regla 8 de
Proveedores ya regía en su Excel), NIT del proveedor, prefijo y número del documento externo, y
**Centro de Costos**, que en muchas filas es el número de ODP (`19356`) o una OA (`OA-3446`). Es
**costo real imputado a la ODP** → margen real vs cotizado, que hoy el ERP no puede calcular. 597
filas de 2022: histórico, no vivo.

### 4. Existencia y costo promedio

Las hojas ocultas `Word Office` y `wo5_03_19` son exports de inventario con **Existencia** y
**Promedio** (costo promedio ponderado). El ERP costea con última compra
(`proveedor_producto.precio_actual`): son dos números distintos para el mismo producto y el Excel
tiene los dos. También aparece el prefijo `1` (`1BPB07` vs `BPB07`) separando código de venta de
código de compra — la misma equivalencia que hoy resuelve `ProveedorProductoCodigo`.

### 5. Campos del documento que el PDF no tiene

El formato impreso (código **VR09**, versión 01) trae, además de lo ya portado:
**PRODUCTO/SERVICIO**, **TOMA DE MEDIDA**, **FECHA DE ENTREGA**, **APROBÓ SI/NO** y
**O.D.P. No: ____**. El papel ya pedía el vínculo cotización↔ODP que `cotizador-vision.md` pone como
bloqueador: lo llenaban a mano.

### 6. Lo que está roto en el Excel (contexto, no tarea)

- **`Modificar_Cotización`** (oculta): todas sus `SUMIFS` son `#REF!`. La hoja para editar una
  cotización guardada **no funciona**.
- **`Resumen_Cotizaciones`** (oculta): tabla dinámica alimentada por esa misma hoja; sus valores en
  caché son todos `2`. La estadística comercial del Excel **existió y se rompió** — matiza el "no
  existe ninguna estadística comercial" de `cotizador-vision.md`.
- **Fórmulas a libros externos** (`[3]`…`[8]`): el FACTOR de `PRECIOS!G2` y todos los costos de la
  hoja `7038` salen de **copias externas del propio archivo**. El nombre "ORIGINAL PARA COPIAR" lo
  explica: cada cotización es una copia y las copias se referencian entre sí. Un precio puede venir
  de un archivo que ya nadie sabe dónde está.

---

## Lo que falta

- 3 de 9 suites de pruebas: `aptitudOrden`, `hojaTrabajo`, `pdf`.
- Regenerar golden master y centinela del catálogo.
- Los 24 diseños nivel C.
- **El modelo de márgenes, si se decide implementarlo** — hoy sólo documentado (ver arriba). Llevar
  la estructura de gastos a tablas configurables y *derivar* los 12 multiplicadores en vez de
  guardarlos a mano. No es una corrección: los números vigentes ya son correctos al dígito, así que
  es valor futuro y cualquier error al portar la fórmula movería precios reales.
- `npm run lint` del backend está roto de antes (ESLint 10 con `.eslintrc.json`), ver `TECH_DEBT.md`
  2026-09-22. La verificación efectiva hoy es `npm run build` + `test:cotizador`.

---

## Propuestas y cargos de obra (2026-09-20)

Una cotización dejó de ser una lista de ítems y pasó a ser un **contenedor de propuestas**:

```
cotizacion (cliente, obra, asesor, numero)
└── propuesta A/B/C…   (nombre, nota, elegida, descuento_pct, totales espejo)
    ├── cotizacion_item   (ahora con propuesta_id)
    └── propuesta_cargo   (SMO | ANDAMIO | HUACAL | FLETE | OTRO)
```

El total de la cotización es el de la **propuesta elegida**, y de ella —solo de ella— sale la
orden de corte (condición novena de `aptitudOrden.ts`, `SIN_PROPUESTA_ELEGIDA`).

### El bug que lo originó, medido

`SMO` y `GTFA26` (flete) eran dos líneas más del BOM de cada ítem, y `totalizar()` multiplica toda
línea del BOM por `cantidadPiezas`. Una ventana OX 5020 de 1000×1500 con 5 piezas cobraba
**5 fletes ($200.000) y 5 manos de obra ($450.000)**; una cotización de 3 productos, 3 fletes más.
Un cargo es de la obra, no de la pieza. Verificado tras el cambio: el mismo ítem bajó de
`subtotalPieza` 419.372,35 a 289.372,35 — exactamente los $130.000 de las dos líneas.

### Contrato numérico (no improvisar sobre esto)

```
total_productos = Σ item.resultado.subtotalConAiu       (ya trae AIU)
total_descuento = round2(total_productos × descuento_pct)
baseGravable    = total_productos − total_descuento
ivaProductos    = round2(baseGravable × ivaPct)

cargo.total     = round2(cantidad × valor_unitario)
total_cargos    = Σ cargo.total                          FUERA del AIU y del descuento
ivaCargos       = Σ (cargo.aplica_iva ? round2(cargo.total × ivaPct) : 0)

total_total     = baseGravable + ivaProductos + total_cargos + ivaCargos
```

El IVA de cada cargo se redondea **por línea**, no sobre la suma: así el total cuadra con los
renglones que el cliente tiene delante. Todo esto vive en **`cotizador/lib/cargos.ts`**, que es
también el único sitio donde se calcula una sugerencia de SMO (incluido el piso de $87.000 del
tablero grande, que se trajo desde `modules/tablero.ts`).

**Consecuencia aceptada:** el `iva` y el `total` que cada ítem guarda en su blob quedan *a precio
lleno*, sin el descuento de la propuesta. La UI los rotula así en los tres sitios donde se ven.

### Un solo descuento

Había dos: el del formulario por ítem (que sí aplicaba) y el de la cabecera (que **no afectaba a
ningún total** pese a guardarse y mostrarse). Desde hoy hay uno, `propuesta.descuento_pct`, que
aplica sobre los productos y **no** sobre los cargos. `descuentoPct` salió de `meta.campos` de los
6 módulos y `cotizacion.descuento_pct` queda como columna **legada**: se conserva, se escribe 0.

### `legado_cargos_en_items` — por qué existe

Las 4 cotizaciones anteriores al cambio tienen su SMO y su flete **dentro** del blob `resultado` de
cada ítem, que es una foto inmutable que no se reescribe nunca. Su propuesta 'A' lleva ese flag en
`true` y sus totales se calculan como siempre (suma pura, descuento y cargos ignorados); crearles
cargos habría cobrado dos veces lo mismo. `PUT .../cargos` sobre una propuesta legada responde 409
y la UI ofrece duplicarla.

### Reglas que impone el sistema

1. Toda cotización tiene al menos una propuesta; no se puede borrar la última (409).
2. Con una sola propuesta, es la elegida. Máximo 5.
3. "Solo una elegida" **la impone Postgres**, con el índice único parcial
   `ux_cotizador_propuesta_elegida (cotizacion_id) WHERE elegida` — por eso elegir es
   desmarcar-y-marcar dentro de una transacción: a mitad de camino habría dos.
4. No se aprueba sin propuesta elegida (400), y no se cambia ni se borra la elegida de una
   cotización aprobada sin quitarle antes la aprobación (409): puede haber material ya cortado.
5. Clonar una propuesta recalcula sus ítems con el motor cambiando vidrio, película y matizado —
   es la respuesta a "cotíceme esto en 5 mm y en templado". Avisa si el vidrio elegido no tiene
   precio (hoy `CL4MM03LM` y `CL4MM08SP` están en $0).

### Egress

`GET /cotizaciones/:id` trae los JSONB **solo de la propuesta activa**; las demás vienen con sus
ítems en modo ligero (`COLUMNAS_ITEM_LIGERO`). Acepta `?propuesta=<id>`, igual que el plano de un
ítem. Sin esto, cuatro propuestas multiplicaban por cuatro el peso del detalle.

### Migración

`backend-api/src/scripts/2026-09-20_cotizador_propuestas_y_cargos.ts`, en **dos tiempos**:
la corrida normal crea la estructura y migra los datos dejando `cotizacion_item.propuesta_id`
**nullable** —para que el backend desplegado, anterior a este cambio, siga pudiendo guardar—, y
`--finalizar` aplica el `SET NOT NULL` en el momento del despliegue. `--revertir` deshace todo.

⚠️ **Correr el script ANTES de levantar el backend con los modelos nuevos.** `server.ts` hace
`sequelize.sync({ alter: false })` al arrancar y crearía las dos tablas por su cuenta, con un ENUM
inventado por Sequelize y sin el índice parcial de "una sola elegida".

### Dos trampas que solo aparecieron al probar contra datos reales (2026-09-20)

**1. El UNIQUE de `orden` era por cotización.** `cotizacion_item` tenía
`UNIQUE (cotizacion_id, orden)`, correcto cuando una cotización era una lista plana. Con
propuestas, los ítems de la B empiezan otra vez en orden 0 y chocaban con los de la A: **clonar
una propuesta fallaba con 500 y "Validation error"**. Ahora es
`ux_cotizador_cotizacion_item_propuesta_orden (propuesta_id, orden)`. No lo detectaron ni la
compilación ni las 55 pruebas: hizo falta clonar contra la base.

**2. El vidrio se cambiaba en silencio.** `modules/ventanas.ts` valida `codigoVidrio` contra
`VIDRIOS_VALIDOS` (8 códigos) y cae a `CL4MM01CR` si no está. Eso pasaba **sin avisar**, así que
duplicar una propuesta pidiendo un vidrio fuera de la lista devolvía una propuesta B con el mismo
total que la A. Hoy emite advertencia, y `ModalClonarPropuesta` ofrece solo los vidrios que los
módulos declaran en `meta.campos` — la misma fuente que usa `moduloAcepta` en el store.

**3. `sync()` ensucia el schema al arrancar.** Los modelos nuevos no declaran `indexes` ni
`DataTypes.ENUM` a propósito: Sequelize nombra lo que crea a su manera
(`enum_propuesta_cargo_tipo` en `cotizador`, índices sin prefijo) y duplicaba lo que ya había
creado la migración, en cada arranque. Quien valida el ENUM es Postgres; el modelo declara la
columna como texto con `isIn`.

### Pruebas

`cargos.test.ts` — 18 pruebas, entre ellas la regresión del bug original (cinco piezas no cobran
cinco fletes). El total del módulo pasó de 37 a **55**.

---

## Lección transversal

Postgres **no preserva el orden de claves** de un objeto en JSONB. Cualquier comparación de
fidelidad contra JSON de origen debe usar deep-equal insensible al orden — nunca
`JSON.stringify(a) === JSON.stringify(b)`. Dio 129 falsos positivos la primera vez.

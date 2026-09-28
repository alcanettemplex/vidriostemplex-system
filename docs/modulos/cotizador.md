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
- `backend-api/src/routes/cotizador.routes.ts` — **54 endpoints** bajo `/api/cotizador` (51 contados
  el 2026-09-21; el 2026-09-23 se sumaron `PATCH /cotizaciones/:id/segmento`,
  `GET /catalogo-general` y `POST /catalogo-general/importar`)
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

**La pieza VIDRIO de un sistema lleva el PEOR nivel de vidrio de sus diseños** (2026-09-23,
`inventarioPiezasDeSistema` en `aptitudOrden.ts`). Antes tomaba el del primer diseño que traía
vidrio —además dependiente del orden en que Postgres devolviera las cabeceras—, y Sistema3831,
3831-Reforzado y 7038-Interior, que tienen diseños con vidrio A, B y C, salían en A. Ninguno de los
163 diseños tiene `nivel_vidrio` nulo (medido ese día).

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

### Qué proveedor manda cuando hay varios: el MÁS ALTO (regla del usuario, 2026-09-28)

`elegirCandidato()` en `lib/sincronizacionProveedores.ts`, en este orden:
1. **Vigencia:** compiten solo los precios de los **últimos 6 meses** (`MESES_VIGENCIA_PRECIO`). Si
   ninguno entra, compiten todos, para no dejar el producto sin costo. Un precio sin fecha cuenta
   como fuera de la ventana.
2. **Modalidad preferida:** en perfilería, la tira de 6 m (`TIRA_6M` ÷ `metros_por_unidad`). El
   precio por metro solo cuenta si no hay tiras. Con la regla del más alto esto pesa más: el metro
   suelto es ~30 % más caro que tira ÷ 6 y ganaría siempre.
3. Gana el **costo normalizado más alto**. Hasta el 2026-09-28 ganaba el más barato.

Aplica a todo el catálogo. La vigencia va **antes** que la modalidad: una tira de hace 8 meses no le
gana a un precio por metro de este mes. Pruebas: `sincronizacion.test.ts` (13, pura, sin BD).

### Cómo llega el costo desde Proveedores (corregido 2026-09-28)

Un cambio de precio pasa por `actualizarPrecio()` de `proveedor.controller.ts` (facturas, listas de
precios, editar precio, reutilizar una equivalencia), que tras el commit llama a
`programarRecalculo(catalogo_producto_id)`. El recálculo elige proveedor (sección de arriba),
aplica el multiplicador, escribe `costo_unitario` + PA/PM/PB, deja historial y **recarga la caché**.

⚠️ **Bug corregido el 2026-09-28:** el camino `creado` de `vincularPendiente` y de
`agregarPrecioManual`, que es el caso **normal** al mapear un código nuevo, guardaba el precio **sin**
pasar por `actualizarPrecio()`. El Cotizador nunca se enteraba del proveedor nuevo. Venía desde la
conexión con Proveedores (`c52b7a4`, 2026-09-14). Ese día había 26 de 149 productos vinculados con
un costo que no correspondía a la regla, entre ellos los 19 mapeos del día. Se recalcularon con
`2026-09-28_cotizador_recalculo_precio_mas_alto.ts`.

Desde entonces, `programarRecalculoTrasCommit()` / `programarRecalculoDeProveedores()` disparan
también en todo camino que cambia **quién compite**, no solo el precio:

| Camino | Recalcula |
|---|---|
| Mapear un código (`vincularPendiente`) o precio manual (`agregarPrecioManual`), nuevo o reactivado | el producto |
| Cambiar la unidad de compra (`editarPrecio`) | el producto |
| Desvincular o desactivar una equivalencia | el producto (baja al siguiente) |
| Desactivar un proveedor, o cambiar su `activo` o su seguimiento (individual y masivo) | todos sus productos |

La cola coalesce las llamadas repetidas y recarga la caché una sola vez. Un producto que se queda sin
ningún proveedor conserva su último costo.

Condiciones para que funcione — si falla una, el costo no se mueve y no hay aviso:
1. El producto del Cotizador tiene `catalogo_producto_id` (hoy 459 de 470; los 11 sin vínculo nunca
   se sincronizan aunque se mapeen).
2. La equivalencia en Proveedores apunta a **ese mismo** `catalogo_producto_id`.
3. El proveedor está activo y con `seguir_precios = true`.
4. No es un precio retroactivo (factura anterior al vigente).

**Estado medido el 2026-09-23** (productos vinculados, sin provisionales):

| Categoría | Con proveedor seguido (costo vivo) | Sin ninguna equivalencia (costo sembrado del Excel) |
|---|---|---|
| PERFILERIA | 60 | 172 |
| ACCESORIO | 50 | 121 (+1 solo con proveedor no seguido) |
| VIDRIO | 11 | 29 |
| ACABADO | 7 | 8 |

Los 330 sin equivalencia **sí tienen precio** (el sembrado); se irán volviendo vivos solos a medida
que el usuario mapee códigos en Proveedores — decisión del usuario, no requiere código. De los 470
productos que ven los motores (464 `CATALOGO` + 6 `ALTA`), **459 tienen precio**; los 11 en $0 están
listados en "Lo que falta". Los 126 `PROVISIONAL` no los ve ningún motor.

Al mapear, el precio de venta puede **saltar** respecto al sembrado (el costo del Excel era de otra
fecha): no es un error, es el costo real entrando.

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

✅ **Conectado desde el 2026-09-27** vía `lib/itemsParaSap.ts` y el botón "Traer ítems de la
cotización" de la ficha ODP — ver la sección "Integración con la ficha ODP" al final.

---

## Pruebas

`npm --prefix backend-api run test:cotizador` — **14 suites, 173 pruebas** desde el 2026-09-28 (entra
`sincronizacion`, 13, pura: la regla del proveedor más alto). Antes, 13 suites / 160 pruebas el
2026-09-27. Histórico: **10 suites, 116 pruebas** desde el 2026-09-26 (2)
(`cargos` pasó de 18 a 21: salieron las 6 del SMO por tipo de obra y entraron 9 de mano de obra por
producto, totales con AIU y elevadores del tablero). Antes, **10 suites, 113 pruebas** el 2026-09-26
(+ `precioACotizar`, 8, y Glasvit en `piezaEntera`, que pasa a 10; 113/113 ese día, suite por suite
con el backend dev arriba). Antes: 9 suites, 104 pruebas (2026-09-25). Lo que sigue es el detalle del
2026-09-23, 8 suites, **95 pruebas**. En verde (95/95,
verificado el 2026-09-23 **suite por suite**: 11 `codigoDiseno` · 16 `plano` · 4 `humo` ·
7 `accesorios` · 18 `cargos` · 10 `generadorSapPerfileria` · 19 `itemLibre` · 10
`personalizacion`). La 3ª de `humo` es la regresión del nivel de vidrio del sistema (ver
Calibración). Una corrida con el
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

`humo.test.ts` vigila que los **126 productos `PROVISIONAL`** —precios del software externo, no
verificados— no se mezclen con el catálogo real. **Desde el 2026-09-23 el número fijo es sólo el de
origen `CATALOGO` (464)** y la prueba comprueba que los motores ven exactamente `CATALOGO + ALTA` de
la base, sin ningún provisional. Antes fijaba el total (469), y con la importación desde el
catálogo general (origen `ALTA`) se habría puesto en rojo con cada alta normal. Hoy: 464 + 6 `ALTA`
(la 6ª es VMINIBOR).

Cada vez que crezca legítimamente hay que **actualizar el número y dejar el renglón** explicando por
qué, como hacen las entradas anteriores del archivo. Un centinela que falla siempre deja de vigilar:
el fallo que importa se confunde con el ruido de fondo.

⚠️ El **golden master** (`test:cotizador:golden`) sí sigue obsoleto desde el 2026-09-11 — 6 de 10
fallan por datos, no por código. **No confiar en él como red antes de regenerarlo.** En la máquina
de la oficina (2026-09-25) ni siquiera corre: las 10 salen `# SKIP` (0 pass, 0 fail) — no es una
señal verde.

---

## Decisiones cerradas — no volver a preguntar

1. Port completo pero **aislado** del flujo del ERP.
2. Todo a Postgres con caché en memoria al arrancar — necesaria, no es solo egress: los motores son
   síncronos y Sequelize es async.
3. **Sin Redux** para el estado del módulo.
4. ~~Identidad visual propia dentro del lenguaje del ERP: Space Grotesk / Manrope.~~ **Revertida el
   2026-09-26** (Fase 5 del sistema visual, decisión del usuario): el módulo usa Geist y el azul
   `templex` como el resto del ERP. Space Grotesk queda solo para las cotas del plano
   (`DiagramaProducto`), que también se imprimen. Detalle en `design/sistema-visual/README.md`.
   Las frases que ve el asesor por módulo viven en `frontend-web/src/features/cotizador/descripcionesModulo.ts`;
   al agregar un módulo en `registry.ts`, agregar también su frase (si falta, se muestra la
   `descripcion` técnica del backend).
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
- **Fuente:** Helvetica (las 14 estándar de pdfkit, sin archivos que embeber). La pantalla usa Geist
  desde el 2026-09-26; traerla al PDF exige generar un `vfs_fonts` propio — no entró en esta v1.
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
- **Especificaciones por ítem (2026-09-26, tras las pruebas N.° 16 y N.° 18):** bajo el nombre de cada
  ítem va una línea gris con medidas, sistema (el del diseño si lo hay), forma del diseño, color,
  vidrio, matizado, película, alfajía, "en L", tubulares y "sin instalación" (solo la excepción). Sale
  de `lib/detalleComercial.ts` (`detalleComercial`), función pura sobre el `input` guardado y las
  etiquetas de `meta.campos` — sin códigos internos. Motivo: en la prueba de 3 opciones (crudo /
  templado / con película) las tres propuestas se veían idénticas renglón por renglón. Si hubo
  **personalización** de componentes, una tercera línea en cursiva ("Personalizado: X en lugar de Y;
  sin Z; incluye W") desde `resultado.personalizacion` (`personalizacionComercial`). Pruebas:
  `detalleComercial.test.ts` (9).
- **Nombre de la opción en el encabezado** ("Opción C: Templado 5 mm con película") bajo el folio.
- **Columna VR. UNIT.** = `subtotalConAiu ÷ piezas`, solo presentación (redondeado × piezas puede
  diferir en $1 del subtotal, que sigue siendo el del motor).
- **"IVA (19%)"**: el controlador pasa `ivaPct` desde `getParametros().iva`; solo rotula.
- **Paginación:** filas `dontBreakRows` (un ítem no se parte entre hojas), método de pago + garantía
  `unbreakable`, y términos y condiciones en un bloque con `id` que `pageBreakBefore` pasa entero a
  la hoja siguiente si no cabe (antes la cláusula 11 caía sola en la página 2).
- **Pendiente, no hecho:** un PDF único comparativo con todas las opciones (hoy es un PDF por
  propuesta con "Otras propuestas presentadas" en total).

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
  que corre cuando el vendedor eligió un diseño). Hasta el 2026-09-26 su página salía con dos cajas
  vacías y "Sistema: —" (en la prueba N.° 18, 27 de 29 páginas). Desde entonces la caja de arriba
  lleva la **FICHA DE FABRICACIÓN** —cada campo del formulario en texto, `especificaciones()` de
  `fichaProducto.ts`, data-driven para los 7 módulos— y la de abajo los **MATERIALES de la
  cotización** (el BOM de `resultado.items`, sin precios, cantidades de UNA pieza) con un aviso ámbar:
  "No son medidas de corte".
- **Tercera fila de datos para todos los ítems** (2026-09-26): MEDIDA · COLOR / ACABADO · VIDRIO,
  desde `leerFicha`. `SISTEMA` cae a `ficha.sistema` (lo elegido en el formulario) y luego al nombre
  del módulo cuando no hay diseño.
- **Plano** (2026-09-26): `DiagramaProducto` acepta `altoMaximoPx` (la hoja pasa 300) y limita el
  ancho para respetar ese alto — antes una ventana alta (1000 × 1800) crecía hacia abajo y se cortaba.
  La cota de cada paño se dimensiona por el ancho DEL PAÑO y va en dos líneas; antes usaba el ancho
  total y en una 7038 de tres paños las etiquetas se montaban. Se sigue rotulando un paño por tamaño
  distinto (es a propósito).
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

## Segmento, edición de ítems y cotizaciones aprobadas (2026-09-23)

### El segmento es de la COTIZACIÓN, no del ítem

Antes cada ítem pedía su "Tipo de cliente" en el formulario, y el segmento de la cabecera se podía
cambiar después sin recalcular nada: la cotización decía PB con ítems preciados en PA, sin aviso.

- El formulario **ya no pide el segmento** (`CAMPOS_DE_LA_COTIZACION` en `FormularioModulo.tsx`):
  lo inyecta al calcular desde la cabecera. Un resultado pendiente calculado con otro segmento se
  descarta. Cotizar muestra un chip "Precios PA".
- Cambiar el segmento en Actual **recalcula automáticamente** (decisión del usuario):
  - Cotización **guardada** → `PATCH /cotizaciones/:id/segmento` → `cambiarSegmento()` del store:
    recalcula con el motor los ítems de **todas** las propuestas en una transacción. Tiene que ser
    en el servidor porque el carrito sólo tiene la propuesta activa. **Atómico**: si un ítem no se
    puede recalcular no cambia nada (409). Un ítem que queda sin precio en la lista nueva se guarda y
    vuelve en `advertencias`, como en el clonado.
  - Cotización **sin guardar** → el carrito es toda la cotización: `CotizadorPage` recalcula ítem
    por ítem con `POST /cotizar`; si uno falla, se revierte todo.
- El backend **rechaza la mezcla**: `crear()`/`actualizar()` responden 400 si un ítem trae
  `input.segmentoCliente` distinto del de la cotización, y `actualizar()` responde 409 si se intenta
  cambiar el segmento por el PUT normal.
- Rechaza (409) con una propuesta **legada**: recalcularla sacaría el SMO y el flete del precio.

### Editar y duplicar ítems

Acciones por fila en Actual: **Editar** abre el ítem en Cotizar con su input (`inputInicial` de
`FormularioModulo`); "Guardar cambios en el ítem N" lo reemplaza **en su posición**. **Duplicar**
copia input y resultado justo debajo, sin recalcular. Editar se deshabilita en propuestas legadas y
en ítems cuyo módulo ya no existe.

### Cotización aprobada: la elegida es de solo lectura

`exigirPropuestaEditable()` en el store — 409 al cambiar ítems o descuento (`actualizar`,
`actualizarPropuesta`), cargos (`guardarCargos`) o segmento (`cambiarSegmento`) de la elegida de una
cotización `APROBADA`.

- **`reconciliarItems` devuelve si algo cambió de verdad** (comparación profunda con
  `isDeepStrictEqual`, insensible al orden de claves del JSONB). Necesario porque el frontend
  reenvía la lista completa en cada guardado: sin esto, corregir el teléfono del cliente de una
  aprobada daría 409. De paso, las filas idénticas ya no se reescriben.
- Pasar a Pendiente **en el mismo guardado** que edita, sí se permite.
- Las propuestas NO elegidas de una aprobada siguen editables (no pueden ir a corte sin
  desaprobar).
- La UI (`bloqueoEdicion` en `CotizadorPage`) mira el estado **guardado** y el del select a la vez
  y deshabilita ítems, descuento, cargos y segmento con el motivo; el estado sigue editable.

Verificado contra Supabase el 2026-09-23: 24/24 comprobaciones, con las cotizaciones reales 11 y 12
sólo en caminos de rechazo (quedaron intactas) y el flujo completo sobre la **N.° 13, cotización de
PRUEBA** ("PRUEBA DEL SISTEMA — NO ES UN CLIENTE", asesor `PRUEBA-SISTEMA`, estado CANCELADO). Ese
número del consecutivo lo consumió la prueba con autorización del usuario; **no es un cliente**.

---

## Barra de trabajo y flujo de propuestas (2026-09-23, UX)

Pedido del usuario: "que el sistema sea amigable, aplica las mejores prácticas". Motivo: no encontró
cómo agregar un ítem a la Propuesta B (el destino era una línea gris de 12 px y las propuestas sólo
se manejaban en Actual). **Sólo frontend** — backend, BD y reglas intactos.

- **`components/BarraTrabajo.tsx`** — fija arriba de **Cotizar y Actual** (ya no sale en Guardadas).
  Fila 1: cotización + estado + cliente · **Tipo de cliente PA | PM | PB** (control segmentado,
  `role="radiogroup"`) · **Guardar** con estado (*Cambios sin guardar* / *Guardando…* / ✓
  *Guardado*) y **Ctrl+S**. Fila 2: **pestañas de propuesta** (clic cambia, doble clic o lápiz
  renombra — usa `PATCH …/propuestas/:pid` que existía sin UI; sólo actualiza `propuestas`, no
  vuelca la cotización, para no pisar ítems sin guardar), **"Nueva propuesta ▾"** (vacía / copia
  exacta / variante con otro vidrio) y las cifras de siempre.
- **Color fijo por propuesta** (`propuestaColor.ts`): A índigo, B verde azulado, C ámbar, D rosa,
  E violeta — en la pestaña, la franja de Cotizar, el botón "Agregar a" y el punto de las tarjetas
  de Actual. Clases literales (Tailwind). `rotuloPropuesta()` da el mismo texto en todos lados.
- **Cotizar:** franja "Estás cotizando para la Propuesta B · … · precios PA · N ítems"; botón
  `Agregar a la Propuesta B · <nombre>` del color de la propuesta (`BotonPrimario` ganó
  `claseColor`). Cambiar el tipo de cliente con un ítem calculado sin agregar **lo recalcula solo**
  (antes se descartaba).
- **`ModalCambiosSinGuardar`** reemplaza los `window.confirm` "¿seguir? se perderán": **Guardar y
  continuar** (principal, foco inicial) · Descartar · Cancelar (Esc). Lo usa `prepararAccion()` en
  `CotizadorPage` antes de cambiar/crear/elegir/borrar propuesta, cambiar el tipo de cliente o
  empezar cotización nueva. **Borrar propuesta** antes descartaba en silencio los cambios de la
  activa; ya no.
- **Cotización sin guardar:** "Nueva propuesta" guarda primero ("Guardar y crear: …") — consume el
  número del consecutivo, igual que guardar. Guardar por primera vez **ya no salta a Actual**.
- **Tipo de cliente bloqueado** si la cotización está aprobada **o cualquier** propuesta es legada
  (el backend recalcula todas; antes sólo se miraba la activa y, parado en la B de una aprobada, el
  control parecía disponible y respondía 409).
- `persistir()` devuelve la cotización guardada (o null) para que las acciones "guarden y
  continúen" con la respuesta en mano; `guardarCotizacion` es su envoltorio.
- Avisos: el adaptador `services/configurarNotificaciones.ts` (Sileo) titula todo `success` como
  **"Guardado"** — lo que aún no está guardado (ítem agregado/editado, segmento cambiado sin
  guardar) va como `info`. Sileo acepta JSX en la descripción (aviso con "Ver propuesta").
- **Aviso al salir** (`beforeunload`) con cambios pendientes. ⚠️ No cubre la navegación interna del
  ERP (menú lateral): la app usa `BrowserRouter` y `useBlocker` exige router de datos — ver
  `TECH_DEBT.md` 2026-09-23.
- Actual: el tipo de cliente queda de **sólo lectura** ("Se cambia arriba, en la barra"); la tarjeta
  Propuestas conserva elegir / borrar / comparar; el botón de abajo dice "Guardar cotización N.° X"
  (mismo verbo que la barra).

**Verificado 2026-09-23:** `tsc` y ESLint del módulo limpios; E2E con Playwright (Edge instalado,
token firmado localmente para el usuario 30) sobre la cotización de PRUEBA N.° 13: **20/20** —
copia B, renombrar, agregar a B desde Cotizar, PB con ítem en curso, modal "Guardar y continuar"
(B quedó con 2 ítems en BD), Ctrl+S sin cambios, PB aplicado a todas en servidor, sin errores JS. La
N.° 13 quedó como estaba (sólo A, PA, CANCELADO, $426.278,16). El script limpia la N.° 13 también
si falla a mitad.

⚠️ El ítem de la N.° 13 se creó por API **sin el campo `sistema`**: al editarlo, el formulario pide
elegir el sistema. Es un artefacto del dato de prueba (los ítems creados desde la UI, N.° 11 y 12,
sí lo traen), no un defecto de "Editar ítem".

---

## Personalizar componentes y traer del catálogo general (2026-09-23)

El asesor cotiza un sistema y el motor arma el despiece estándar; el cliente pide otra chapa, un
vidrio miniboreal o un pedazo de perfil de más. Dos piezas:

### Traer productos del catálogo general
`controllers/cotizador_catalogo_general.controller.ts` — `GET /catalogo-general?q=` busca en
`public.catalogo_productos` lo que **no** está en el Cotizador (ni por código ni por vínculo), con el
mejor proveedor (mismo filtro que la sincronización: proveedor activo y `seguir_precios = true`,
costo por metro si se compra `TIRA_6M`). `POST /catalogo-general/importar` lo da de alta con origen
`ALTA`, `catalogo_producto_id` enlazado, historial `dar-de-alta`, y corre
`recalcularCostoDesdeProveedor` para fijar costo y precios (costo × multiplicador de la categoría).
Sin proveedor con precio exige `costoManual`, que Proveedores reemplazará solo. 409 si ya está; 400
si el código pasa de 20 caracteres (`cotizador.producto.codigo`).

El catálogo general casi nunca trae categoría ni unidad (1.205 de 1.271 sin categoría, ninguno con
unidad): quien importa las elige, sugeridas desde la unidad de compra del proveedor (M2 → VIDRIO/X
M2, TIRA_6M → PERFILERIA/X METRO, UNIDAD → ACCESORIO/UND). Avisa si la unidad elegida no calza con
la de compra.

Frontend: `modals/ModalCatalogoGeneral.tsx`, desde Configuración ("Productos del catálogo
general") y desde el buscador de componentes ("¿No aparece? Tráelo del catálogo general").

**Primera alta real:** VMINIBOR (vidrio miniboreal), proveedor TODOVIDRIO Y ALUMINIO $31.932,76/m²
→ PA $53.417,12 · PM $50.663,94 · PB $47.910,76.

### Personalizar los componentes de un ítem
`cotizador/lib/personalizacion.ts` + `calcularItem()` en `modules/registry.ts`, **la única puerta
para calcular un ítem**: la usan `POST /cotizar`, `clonarPropuesta` y `cambiarSegmento`.

- Vive en `input.personalizacion = { cambios: [{de, a}], quitados: [código], extras: [{codigo,
  cantidad} | {codigo, medidaMm, piezas}] }` y se aplica **sobre el despiece que el motor da en ese
  momento**, con los precios del segmento vigente. Por eso sobrevive a editar el ítem, cambiar el
  segmento y clonar la propuesta. Sin personalización, `calcularItem` devuelve exactamente lo mismo
  que el motor (probado con `deepEqual`).
- **Cambio:** sólo entre la misma clase de unidad (`claseDeUnidad` del Ítem libre: m² / metro /
  unidad); si no, 400. Si el código original ya no está en el despiece (cambió el color, el
  diseño, o una variante cambió el vidrio), el cambio **se ignora con aviso**, nunca se adivina.
- **Extra de perfil:** medida mm × piezas + **5 %** de desperdicio (`DESPERDICIO_PERFIL_EXTRA_PCT`),
  y entra en `cortes.perfiles` con `ref: 'AGREGADO'` para que el taller lo vea.
- **Vidrio cambiado:** `cortes.vidrios[].descripcion` pasa al vidrio nuevo (la Hoja de Trabajo
  corta el que se va a usar).
- **Perfilería tocada** (cambiada, quitada o agregada): `aptoParaCorte = false`,
  `perfileriaPersonalizada = true`. `aptitudOrden` emite el motivo nuevo
  **`PERFILERIA_PERSONALIZADA`** (condición 5b — la 5 se reevalúa sobre nivel y errores y sin esto
  volvía a dar el ítem por apto) y **no corre la condición 8** en ese ítem (daría un falso "la
  estructura del diseño cambió"). Queda fuera de `generadorSapPerfileria` porque el llamador filtra
  por `imprimible`. La Hoja de Trabajo muestra un aviso ámbar (`despiece.perfileriaPersonalizada`).
- Frontend: la tabla de `ResultadoCalculo` en Cotizar tiene Cambiar / Quitar por línea, "Agregar
  componente", Deshacer y Restaurar (`modals/ModalComponente.tsx`); cada acción recalcula en el
  servidor. `FormularioModulo` reenvía la personalización vigente al pulsar Calcular. Actual marca
  el ítem "Personalizado" (ámbar si tocó perfilería). La búsqueda de catálogo, el rótulo por unidad
  y el precio por segmento viven en `catalogoUtil.ts`, compartidos con el Ítem libre.

Verificado contra Supabase el 2026-09-23 (15/15): búsqueda y alta de VMINIBOR (y 409 al repetirla);
sobre la cotización de PRUEBA N.° 13, vidrio → VMINIBOR + perfil agregado, guardado, motivo
`PERFILERIA_PERSONALIZADA` sin falso positivo de la condición 8, y cambio de segmento conservando
la personalización con precio distinto. La N.° 13 quedó de nuevo CANCELADA.

---

## Los 18 diseños que no se podían cotizar (diagnóstico 2026-09-23 · 13 cerrados 2026-09-25)

> ✅ **Cerrado el 2026-09-25: 163 de 163 cotizables.** Dos scripts, ambos reversibles con
> `--revertir`: `2026-09-25_cotizador_platina_511_y_tubo_inox.ts` (`511` y `ROD1PULG`, 13 diseños)
> y `2026-09-25_cotizador_tubular_torino_kik0301.ts` (`REC30X10`, los 5 de Torino) — ver
> "Perfiles por pieza entera" más abajo.
>
> - `REC30X10` = **`KIK0301` "KIT TUBO RECTANGULAR"** (dato del usuario), mismo código en los seis
>   colores. Es un kit "todo en uno" que **trae las rodachinas**: **1 kit por riel, cualquier
>   ancho** (OXXO_TORINO lleva dos). Costo corregido por el usuario: $210.000 sembrado →
>   **$150.550** (ACCESORIO, PA $233.447,05), sin proveedor.
>
> - `511` = **PLATINA P-30 1 x 1 1/2**: MATE `P300101`, CRUDO `P300301`, NEGRO `P300601` (dato del
>   usuario). No existe en blanco, bronce ni gris plata: el motor cae a mate con aviso. Sin
>   proveedor con precio → alta con **costo manual $80.000 por barra de 6 m** ($13.333,33/m, PA
>   $20.824,55/m), el mismo en los tres colores; se volverá vivo al mapear una factura en
>   Proveedores (como `TIRA_6M`, la sincronización divide entre 6, coherente con este costo).
> - `ROD1PULG` = `TUB0316`, mismo código en los seis colores (inox). Costo de ACVICOL $37.500 por
>   tubo, multiplicador PERFILERIA → PA $58.569,04 por tubo.
>
> Lo que sigue es el diagnóstico original, conservado como contexto.

**No es un problema de precio: es de código.** Los 18 comparten uno de tres perfiles cuyo
`codigos_por_color` está **vacío (`{}`)** en `cotizador.diseno_perfil` — el motor no sabe qué código
Templex usar en ningún color, así que no hay producto que preciar. Aparecen 28 veces en total, y
**sólo** en estos 18 diseños (ninguno cotizable los usa).

| Ref (original) | Descripción | Diseños | Sistemas |
|---|---|---|---|
| `511` (`511-B`) | Retícula de Aluminio | 8 | Sistema5020 `XX_RETICULA2` · Sistema744 `OXXO_RETICULA`, `XX_RETICULA`, `XX_RETICULA_2x5`, `XXX_3P_RETICULA` · Sistema8025 `OX_RETICULA`, `XX_RETICULA`, `XXX_RETICULA` |
| `REC30X10` (`REC30X10-AI`) | Tubular 30 mm × 10 mm | 5 | Cabina Deslizante Torino: `OX`, `OXO`, `OXXO`, `OXXO_FACHADA`, `XO` |
| `ROD1PULG` (`ROD1PULG-AI`) | Tubo Redondo Diám. 1 Pulgada | 5 | Cabina Deslizante Primavera: `OX`, `OXO`, `OXXO`, `XO` · Cabina Batiente `PP_PLEGABLE_RODAMIENTO` |

Todos son nivel **B** (aptos para corte una vez cotizables).

**Lo que necesita el usuario (dato de negocio):** el código Templex de cada uno de los tres perfiles
**por color** (`MATE`, `CRUDO`, `NEGRO`, `BLANCO`, `BRONCE`, `GRISPLATA`), o confirmar que un perfil
existe sólo en ciertos colores. Candidatos vistos en `catalogo_productos` que hay que confirmar, no
asumir: `TUB0511` (id 1132, sin descripción).

**Pista del sufijo `-AI`:** `REC30X10-AI` y `ROD1PULG-AI` parecen ser **acero inoxidable**, no
aluminio (confirmado para el tubo de 1", ver abajo). Si es así, no tienen color: el mismo código va
en los seis colores de `codigos_por_color`. Confirmar con el usuario para el 30×10; el `-B` de
`511-B` sigue sin explicar.

### `ROD1PULG` = `TUB0316` (dato del usuario, 2026-09-23)

Medido ese día:
- `TUB0316` está en `catalogo_productos` (id **1114**), alias *"Tubo 1" de 1800 mm inox"*. **No**
  está en `cotizador.producto`: hay que darlo de alta (catálogo general → importar).
- Un solo proveedor: **ACVICOL**, modalidad **`UNIDAD`**, **$37.500** por tubo de 1.800 mm,
  activo y seguido.

⚠️ **Choque de unidades — decidir antes de escribir el script.** El despiece pide este perfil en
milímetros y el motor cobra perfilería **por metro**, pero el proveedor lo vende **por tubo de
1,8 m**. `sincronizacionProveedores.ts` sólo normaliza `TIRA_6M` (÷ 6); un `UNIDAD` lo tomaría como
costo por metro y cobraría $37.500/m en vez de ~$20.833/m. Opciones a presentar:
1. Alta como `PERFILERIA` / `X METRO` con costo $20.833,33 (= 37.500 ÷ 1,8) y **sin sincronización**
   (el sync lo pisaría con 37.500) — rápida, pero el precio queda congelado.
2. Generalizar la normalización del sync a "largo de la pieza" (hoy fijo en 6 m para `TIRA_6M`),
   para que un `UNIDAD` de 1,8 m se divida entre 1,8 — correcta, toca Proveedores.
3. Cobrarlo por tubo entero (`UND`, `ceil(mm totales / 1800)`), como se compra — toca el motor.

✅ **Decidido por el usuario el 2026-09-23: tubos enteros según el ancho** — hasta 1.800 mm es 1
tubo, de 1.801 a 3.600 mm son 2, y así sucesivamente. "Ese tubo lo venden a esa medida y es un solo
precio, no se vende fraccionado." Precio por tubo ($37.500 de costo × multiplicador), que el
vínculo con ACVICOL (`UNIDAD`) puede seguir alimentando sin normalizar. Implica que el motor aprenda
a cobrar **un perfil por pieza entera** (hoy toda la perfilería se cobra por metro en
`motorDespiece.ts`, `lineaCatalogo(codigo, metrosConDesperdicio, …)`): hace falta saber el largo de
pieza del producto (1.800 mm) — probablemente una columna nueva en `cotizador.producto` o un dato
por producto — y definir si el 5 % de desperdicio aplica antes del redondeo (con piezas enteras
normalmente **no**: el sobrante ya es el desperdicio). Plan detallado en la sesión del 2026-09-24.

**Trampa — `cotizable` es un flag GRABADO, no se recalcula.** `cotizador.diseno.cotizable` y
`refs_sin_precio` se escribieron en la siembra del 2026-09-07; `cache.ts` los lee tal cual y
`motorDespiece.listarDisenos(soloCotizables)` filtra por él. Llenar los códigos **no** hace aparecer
los diseños: el script que cargue los códigos tiene que, en la misma transacción:
1. escribir `codigos_por_color` de las 28 filas de `diseno_perfil`,
2. verificar que cada código exista en `cotizador.producto` con precio > 0 (si no, darlo de alta
   desde el catálogo general — `POST /catalogo-general/importar`),
3. poner `cotizable = true` y `refs_sin_precio = '[]'` en los 18 diseños,
4. recargar la caché (reiniciar backend o `recargarPrecios()`),

y verificarse cotizando al menos un diseño de cada sistema.

### Perfiles por pieza entera (2026-09-25)

**La regla la decide la UNIDAD del producto que resuelve el perfil:** si es `UND`, se cobra por
piezas enteras, nunca por metro, y **sin** el 5 % de desperdicio (el sobrante ya lo es).
`cotizador.producto.largo_pieza_mm` (DOUBLE, nullable, `CHECK > 0`) dice cuántas:

| Producto | Unidad | `largo_pieza_mm` | Se cobra por corte |
|---|---|---|---|
| Perfil normal | `X METRO` | NULL | metros × (1 + 5 %) |
| `TUB0316` tubo inox | `UND` | 1800 | `cantidad × ceil(medida / 1800)` |
| `KIK0301` kit tubo rectangular | `UND` | NULL | `cantidad × 1` — cualquier ancho |

Antes del 2026-09-25 ningún perfil de diseño resolvía a un producto `UND` (medido), así que la regla
no movió el precio de ningún diseño que ya se cotizaba.

- **Motor** (`motorDespiece.ts`): **por corte** — dos cortes de 800 mm son 2 tubos, no se juntan
  en uno. `.toFixed(6)` antes del `ceil`, para que 1.800/1.800 no dé 2.
- **Cortes:** llevan `piezasEnteras` (lo que se cobró) **sólo** si el producto es `UND`, y
  `largoPiezaMm` sólo si además tiene largo; `medidaMm` sigue siendo el corte real (p. ej. 1.500),
  no el largo del tubo. Los perfiles por metro no llevan ninguna de las dos claves.
- **SAP** (`generadorSapPerfileria.ts`): `CANT.` = suma de `piezasEnteras`, no `ceil(metros / 6)`.
  La cuenta vive sólo en el motor.
- **Rodachinas:** `KITS_CON_RODACHINAS` en `cabinasCorredizas.ts` (hoy `{KIK0301}`). Si el kit
  está en el despiece (Torino) o es el del sistema libre "tubo rectangular", no se suman las 4
  `ROD0401`. ⚠️ Esto **bajó** el precio del cálculo libre con tubo rectangular, que las cobraba.
  Glasvit (`KDG0306`) también viene completo (usuario, 2026-09-26): está en el Set desde ese día.
- **Caché y tipo `Producto`:** `largoPiezaMm` se emite sólo cuando tiene valor, igual que los
  metadatos de los provisionales — un producto normal sigue con sus 9 claves.
- **Sincronización con Proveedores:** no se tocó. Un `UNIDAD` ya entra como costo por pieza, que es
  justo lo que se cobra.
- ⚠️ **No se edita desde la UI**: ni Configuración ni el alta del catálogo general lo exponen. Hoy
  sólo por script (`TECH_DEBT.md` 2026-09-25). Personalizar un ítem no puede cambiar una platina
  por el tubo: son clases de unidad distintas (metro vs unidad) y se rechaza con 400.

Pruebas: `piezaEntera.test.ts` (9) — frontera 1.800/1.801/3.600/3.601, dos cortes en un diseño,
kit 1 por riel a 1.200 y 3.000 mm y 2 en OXXO, rodachinas por los dos caminos (y regresión: los
demás sistemas siguen con sus 4), SAP en piezas, color de la platina con respaldo a mate, y los 18
diseños sin líneas en error (163 cotizables).

---

## Productos en $0 (2026-09-23 · cerrado 2026-09-26)

| Código | Qué es | Estado |
|---|---|---|
| `KDE0303` | Kit deslizante 6 mm en L | ✅ Costo Templex **$200.000** (usuario, 2026-09-26) |
| `KDE0304` | Kit deslizante 6 mm tres cuerpos | ✅ **$175.000** |
| `SDR0301` | Set de rodamiento AN 208 | ✅ **$130.000** |
| `CM572A` | Cerradura a muro 5724 | ✅ **$120.000** |
| `KVE001` | Kit ventanería especial | ✅ **Precio a cotizar** — ver abajo |
| `CL4MM03LM` | Vidrio claro 2+2 laminado | ✅ **Precio a cotizar** (sobre pedido) |
| `CL4MM08SP` | Vidrio claro 4 mm templado STV | ✅ **Precio a cotizar** (sobre pedido) |
| `1BPB07`, `1BPB10`, `1PERF01`, `1BOQN02` | "CODIGO NO EXISTE" — prefijo `1` de código de compra | Sin tocar: verificado el 2026-09-26 que **ningún diseño, mapeo, override ni cotización los usa** (sólo existen en su propia fila). Decisión del usuario: si nada los usa, no afectan |

Los 4 costos se cargaron con PA/PM/PB = costo × multiplicador de ACCESORIO (script
`2026-09-26_cotizador_precios_kits_y_perforaciones.ts`). Ninguno tiene proveedor con precio: cuando
se mapee una factura en Proveedores, el sync los reemplaza solo.

### Precio a cotizar (2026-09-26)

`cotizador.producto.precio_a_cotizar` (BOOLEAN NOT NULL DEFAULT false) marca un producto que **no
tiene precio de catálogo**: se cotiza aparte con el proveedor. Hoy: `KVE001`, `CL4MM03LM`,
`CL4MM08SP`. Se enciende por script (no hay control en Configuración todavía).

- **El asesor escribe el COSTO del proveedor**, no el precio de venta (decisión del usuario). El
  motor calcula `precio = round2(costo × multiplicador[categoría][segmento])`, la misma regla que fija
  PA/PM/PB del catálogo. Los multiplicadores viajan en la caché desde este cambio (bucket `precios`,
  `getMultiplicador()` en `lib/catalogo.ts`), y `guardarMultiplicador` recarga la caché al guardar.
- **Dónde se escribe:** en la línea del ítem libre (`lineas[i].costo`), en un componente agregado
  (`personalizacion.extras[i].costo`) y en un cambio de componente (`personalizacion.cambios[i].costo`).
  Viaja dentro de `input`, así que se guarda con la cotización y sobrevive a recalcular.
- **Sin costo:** si el catálogo tiene precio de referencia (> 0) se usa y se avisa; si no, la línea
  queda en **error** ("se cotiza aparte: pide el precio al proveedor…") y bloquea el ítem, como un $0.
- **Con costo:** la línea lleva `precioACotizar: true` y `costoManual`; `calcularItem` (registry)
  agrega una advertencia por código, y `ResultadoCalculo` muestra la insignia "Costo manual".
- `costo` se **ignora** en productos sin la marca: su precio es el del catálogo y no se pisa a mano.
- Un producto normal no lleva la clave `precioACotizar` (solo se emite cuando es true).

### Perforaciones por unidad (2026-09-26)

`PERF01/02/03` pasaron de `X METRO` a `UND` (el proveedor factura por UNIDAD; "05-20"/"21-50" son mm de
diámetro). No movió ningún precio: Cabinas Corredizas ya las contaba por unidad y Tablero forzaba
`unidadOverride: "UND"`. La equivalencia de **Templados y Laminados a $175** para PERF01
(`proveedor_producto` #222, factura FE-FA140924) se **desvinculó** por orden del usuario: el código
`PERFORACION001` volvió a "Por Mapear" con su histórico intacto. ⚠️ `PERF03` sigue con costo $5.900
(Vitelsa) aunque Templados y Laminados lo da a $5.200: el próximo sync lo bajará a $5.200, que es
correcto.

---

## ~~Cotización sin cliente ni asesor — deliberado mientras está aislado~~ (superado el 2026-09-27)

> Desde la integración con el ERP (ver "Integración con el ERP" al final) toda cotización nueva exige
> vínculo (lead, prospecto, cliente u ODP) y tiene asesor dueño (`asesor_usuario_id`). Lo de abajo queda
> como historia.

Hoy se puede guardar y aprobar una cotización sin cliente y sin asesor (`clienteSchema` y `asesor`
son `optional()`; las N.° 11 y 12 están así). **No es un bug a corregir ahora** (decisión del
usuario, 2026-09-23): el módulo está aislado y en preparación; la obligatoriedad llega con la
identidad real (`cliente_id`, `asesor_usuario_id`) al lanzarlo a producción. Queda como condición de
salida del paso 6 de la hoja de ruta.

---

## Hoja de ruta — se ataca un punto a la vez, en este orden

Decisión del usuario (2026-09-23): los pendientes se trabajan uno por uno en el orden que proponga
Claude. El orden va de lo que desbloquea cotizar hoy a lo que conecta con el ERP.

1. ~~**Los 18 diseños no cotizables**~~ — **cerrado el 2026-09-25**, 163/163.
2. ~~**Los 5 kits/accesorios en $0**~~ — **cerrado el 2026-09-26** (4 con costo, `KVE001` a cotizar).
3. ~~**Vidrios sobre pedido**~~ — **cerrado el 2026-09-26** con la marca "precio a cotizar".
4. ~~**El PDF no menciona la personalización**~~ — **cerrado el 2026-09-26**: especificaciones por
   ítem, línea "Personalizado: …", nombre de la opción, valor unitario y paginación (ver "PDF de
   cotización").
5. **Red de pruebas** — las 3 suites faltantes (`aptitudOrden`, `hojaTrabajo`, `pdf`) y regenerar el
   golden master, antes de tocar el flujo del ERP.
6. **Identidad y acceso de asesores** — `cliente_id`, `asesor_usuario_id`, rol asesor con sus
   cotizaciones y sin Configuración/Calibración, cliente y asesor obligatorios. Rompe el aislamiento:
   **requiere orden explícita**.
7. **Destino** (`cotizador-vision.md`) — ODP desde cotización, generador de perfilería al
   `SAPModal`, plano al Det. Técnico, estadísticas, enlace público. Requiere orden explícita.

Fuera de la fila:
- **Campos del formato VR09 en el PDF** — en pausa por decisión del usuario (ver "El Excel de los
  asesores", punto 5).
- **Los 24 diseños nivel C** — bloqueados por la cuenta vencida del software de origen.
- **El modelo de márgenes** — hoy sólo documentado (ver arriba). Llevar la estructura de gastos a
  tablas configurables y *derivar* los 12 multiplicadores. No es una corrección: los números
  vigentes ya son correctos al dígito, y un error al portar la fórmula movería precios reales.
- **Mapear los 330 productos con costo sembrado** — lo hace el usuario en Proveedores, sin código.
- `npm run lint` del backend está roto de antes (ESLint 10 con `.eslintrc.json`), ver `TECH_DEBT.md`
  2026-09-22. La verificación efectiva hoy es `npm run build` + `test:cotizador`.

---

## Mano de obra por producto y total en vivo (2026-09-26)

Reglas del usuario, 2026-09-26. **Reemplazan** la mano de obra "SMO por tipo de obra" del
2026-09-20 (una línea por propuesta, piezas × tarifa del tipo predominante).

| Producto | Qué se cobra | Tarifa (parámetro) |
|---|---|---|
| Ventanas y proyectantes | **Ensamble, siempre**, por m² | $60.000 (`mo_ensamble_ventana_m2`) |
| Ventanas y proyectantes | **+ Instalación** si el ítem la lleva, por m² | $25.000 (`mo_instalacion_ventana_m2`) |
| Cabinas corredizas y batientes | Instalación si la lleva, por unidad; **en L cuenta doble** | $120.000 (`mo_instalacion_cabina_und`) |
| Espejos y tableros | Instalación si la lleva, por m² | $85.000 (`mo_instalacion_espejo_tablero_m2`) |

- **Montos antes de AIU e IVA**, editables en Configuración → Parámetros. Las líneas llevan
  **AIU, descuento de la propuesta e IVA**, como un producto (decisión del usuario).
- **m² por pieza con mínimo de 1 m²** (decisión del usuario): `max(ancho × alto, 1) × piezas`. Se
  lee de las MEDIDAS del `input`, nunca de `resultado.areaM2` (no significa lo mismo en todos los
  módulos). Proyectante sin diseño: naves × ancho de nave × alto de nave.
- **Casillas por ítem** en el formulario: "Con instalación" (6 módulos, **marcada por defecto** vía
  el campo nuevo `defecto` de `meta.campos`) y "Cabina en L" (las dos cabinas). No tocan el despiece.
- **Dónde vive:** `calcularManoObraProductos()` en `lib/cargos.ts` — único sitio. Genera líneas
  `ENSAMBLE` / `INSTALACION` (`origen = AUTOMATICO`, una por grupo, ninguna en cero) con
  `valor_unitario = round2(tarifa / aiu)`: el AIU va en el valor unitario, así el renglón que ve el
  cliente ya lo trae y el PDF cuadra.
- **Persistencia:** `recalcularPropuesta` (store) las regenera desde los ítems en cada recálculo y
  solo reescribe si cambió algo (`sincronizarManoObra`; las filas están auditadas). `insertarCargos`
  descarta cualquier ENSAMBLE/INSTALACION que llegue de afuera y `guardarCargos` ya no las borra.
  Nueva columna `propuesta.total_mano_obra`; la cabecera guarda `total_subtotal = productos + mano de obra`.
- **Previsualización:** `POST /api/cotizador/mano-obra` (ítems = módulo + input, no escribe)
  reemplazó a los dos endpoints `smo-sugerido`. El frontend lo pide con `useManoObra`
  (`totalesPropuesta.ts`) y NO replica la regla.
- **Total en vivo** (pedido del usuario, opción A): `calcularTotalesPrevistos()` en
  `frontend-web/src/features/cotizador/totalesPropuesta.ts` es la réplica única del contrato de
  totales (antes copiada en `TabActual`). La usan la barra superior ("Total", con "sin guardar"
  mientras hay cambios, solo en Actual), la pestaña Actual y el **resumen fijo de la derecha** de
  Cotizar (`ResumenPropuesta`, mesa de trabajo), que incluye el producto en pantalla aunque no se
  haya agregado (si se edita un ítem, lo reemplaza en vez de sumarlo; uno con errores no cuenta).
  Diseño de la pantalla: `design/sistema-visual/README.md` → "Cotizar: mesa de trabajo".
- **PDF:** las líneas de mano de obra van ANTES del descuento (entran en su base); el resto de
  cargos, después.
- **SMO legado:** el tipo `SMO` sigue siendo válido en BD. Una propuesta guardada con SMO lo muestra
  en el panel como servicio adicional "Mano de obra anterior", para no perder el dato. Las tarifas
  `smo_*` siguen en `cotizador.parametro` pero ya no se muestran ni se usan.
- Script: `2026-09-26_cotizador_mano_obra_por_producto.ts` (ejecutado; `--revertir`). Verificado de
  punta a punta con la cotización de prueba N.° 14: 2 ventanas 1500×1000 → ensamble 3 m² × $62.500 =
  $187.500, total $1.100.408,32 igual al calculado aparte al peso.

### Elevadores del tablero (2026-09-26)

`elevadoresTablero()` en `modules/tablero.ts`: **4 + 2 si el ancho pasa de 1.500 mm + 2 si el alto
pasa de 1.500 mm** (1000×1000 → 4, 1501×1000 → 6, 1501×1501 → 8). Las perforaciones `PERF01` llevan la
misma cantidad. Reemplaza el umbral del Excel (solo ancho, ≥ 1,51 m). Con esto desapareció la tarifa
"tablero grande" de $87.000 de la mano de obra.

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
total_mano_obra = Σ total de ENSAMBLE/INSTALACION        (ya trae AIU — 2026-09-26)
total_descuento = round2((total_productos + total_mano_obra) × descuento_pct)
baseGravable    = total_productos + total_mano_obra − total_descuento
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
   **Ampliada el 2026-09-23:** de esa elegida tampoco se cambian ítems, descuento, cargos ni el
   segmento de la cotización — ver "Segmento, edición de ítems y cotizaciones aprobadas".
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

---

## Diseño del catálogo fuera de ventanas (2026-09-26)

El backend ya cotizaba **por diseño** en proyectantes (28 diseños 3831), cabinas corredizas (14:
Corrediza, Primavera, Torino), cabinas batientes (4) y espejo (3), pero el formulario solo mostraba
`SelectorDiseno` en ventanas: esos ítems salían siempre por medidas libres y sin plano ni cortes en
la Hoja de Trabajo. Tablero e ítem libre no tienen diseños.

- `MODULOS_CON_DISENO`, `CAMPOS_DERIVADOS_DEL_DISENO` y `ETIQUETAS_CON_DISENO` viven en
  `fichaProducto.ts`, compartidos por `FormularioModulo` y la Hoja de Trabajo.
- **Campos que se ocultan con diseño:** ventanas `cuerpos`/`alasCorredizas`; proyectantes
  `numeroNaves`; cabinas corredizas `tipoSistema` (el kit lo da el diseño).
- **Proyectantes por diseño trabaja con medida TOTAL** (`proyectantes.ts`: `input.anchoCm ??
  input.anchoNaveCm`). Con diseño, los campos se rotulan "Ancho/Alto total" y el formulario envía
  además `anchoCm`/`altoCm`; sin diseño los borra. Sin eso la mano de obra (`areaPiezaM2`) habría
  multiplicado la medida total por las naves: verificado, 3 naves de 1500 × 600 → 2,7 m² sin diseño,
  1 m² (mínimo) con diseño.
- El filtro por "Sistema" del selector solo aplica a ventanas; los demás listan todos los diseños de
  su módulo agrupados por sistema.
- Verificado con Playwright (11/11): selector en proyectantes/cabinas/espejo, ausente en tablero,
  naves y tipo de sistema ocultos con diseño, proyectante por diseño calcula y dibuja plano.

---

## Espejo: un producto por acabado, sin BPB aparte (2026-09-26)

Decisión del usuario tras preguntar de dónde salía `ES0001`.

- **`ES0001` "ESPEJO"** viene del Excel de los asesores (semilla 2026-09-07, costo $71.429). En el
  catálogo maestro está vinculado a **`ESP4BPB` "ESPEJO 4MM BPB"**, así que su costo lo pone
  Proveedores: desde el 2026-09-17, $55.200/m² de RAPI VIDRIOS (TODOVIDRIO vende a $62.400; manda el
  menor). **Ese precio ya trae el borde pulido brillado** (confirmado por el usuario).
- **BPB → solo `ES0001` por m².** Antes se sumaba además `BPB04` por el perímetro: el borde se cobraba
  dos veces (1 × 1 m PM: $119.474 → **$91.228** sin IVA).
- **BISELADO → `ESP4MMBPB` por m²** (costo $120.549 sembrado del Excel, **sin proveedor vinculado**).
  Antes: `ES0001` + recargo del 15,07 % (`ESP02`, diferencial ESP02/ESP01 del Excel), que al bajar
  `ES0001` al costo real dejó el biselado más barato que el BPB (1 × 1 m PM: $104.975 →
  **$199.231** sin IVA).
- `ESP4MMBPB` se corrigió con `2026-09-26_cotizador_espejo_biselado.ts` (ya corrido en local): unidad
  "X METRO" → "X M2" (el usuario confirmó m²) y descripción → "ESPEJO 4MM BISELADO". También en
  `catalogo.json`, para que regenerar el catálogo no lo revierta.
- Aplica igual en la rama por diseño (`codigoVidrio` = producto del acabado, sin accesorios de borde).
- Salieron `RECARGO_BISELADO`, `lineaManual` y la línea `ESP02` del módulo. Las cotizaciones ya
  guardadas no cambian hasta que se recalculen.
- ⚠️ El golden master del espejo cambia a propósito: regenerarlo en el punto 5 de la hoja de ruta.
- Pendiente del usuario: vincular un proveedor real a `ESP4MMBPB` en Proveedores para que su costo
  deje de ser el del Excel.

### Soporte tubular T-76 (2026-09-28)

El campo "Soportes tubulares T-76" solo existe para el cálculo **sin diseño**. Con diseño, el
soporte lo pone el despiece y el campo se ignora:

| Camino | Qué cobra |
|---|---|
| Sin diseño, `tubularCantidad` > 0 | `TUB0302` × **2 × alto × soportes** (fórmula J11 del Excel: cada soporte = los dos lados verticales) |
| `ESP_FLOT_1` flotante | 2 piezas de `TUB0302` de **(alto − 200 mm)** + 5 % de desperdicio |
| `ESP_ELEV_1` elevado | Ningún tubular (decisión del usuario: sigue así) |
| `ESP_MARCO_1` con marco | Marco perimetral `VP010` (provisional `PRVVP010*`) |

- **Antes:** el flotante cobraba el **T99** "Tubular Doble Pestaña" con precio provisional
  (`PRVT99*`, $6.879/m PM), y el formulario mostraba el campo de tubulares con diseño elegido sin
  que moviera el precio. Desde este cambio el campo se oculta (`CAMPOS_DERIVADOS_DEL_DISENO.espejo`
  en `fichaProducto.ts`, que también respeta la Hoja de Trabajo).
- **Costo de `TUB0302`:** $50.000 por perfil entero de 6 m (dato del usuario) → **$8.333,33/m**;
  PA $13.015 · PM $12.284 · PB $11.553. Se cobra **por metro**, como el resto de la perfilería (no
  por barra: decisión del usuario). Escrito en la tabla base con historial, **no** como override,
  para que un vínculo futuro en Proveedores lo reemplace. Hoy **ningún proveedor lo tiene vinculado**.
- Script `2026-09-28_cotizador_espejo_flotante_t76.ts` (**corrido** el 2026-09-28; simula por
  defecto, escribe con `--aplicar`). `diseno_perfil` #981 pasó a ref `T76` y `TUB0302` en los 6
  colores. `catalogo.json` y `disenos.json` actualizados para que la resiembra no lo revierta.
- Efecto (100 × 150 cm, BPB, PM, sin IVA): flotante $156.718 → **$171.474**; sin diseño con 2
  soportes $184.512 → **$205.075**. Había 0 cotizaciones de espejo guardadas.
- ⚠️ `TUB0605` "TUBULAR T-76 NEGRO" cuesta $45.251/m, 7,5 veces el crudo. No se tocó: ver
  `TECH_DEBT.md` 2026-09-28.
- **Actualización del mismo día:** el usuario mapeó `T76AC` de VENTANAS Y PUERTAS a TUB0302
  ($8.302,52/m). El recálculo con la regla del más alto dejó el costo en ese valor, que reemplaza los
  $50.000 ÷ 6 escritos a mano (PA $12.967/m).

### Espejo BPB a precio fijo: $146.000/m² PA antes de IVA (2026-09-28)

Regla comercial del usuario. **Solo el espejo BPB (`ES0001`)**: instalación, T-76 del flotante y
biselado siguen aparte y como estaban.

- **Override, no tabla base.** El costo de `ES0001` lo pone Proveedores (RAPI $55.200 / TODOVIDRIO
  $62.400, seguidos) y cada factura recalcula PA/PM/PB en `cotizador.producto`: escribir ahí el precio
  duraría hasta la próxima factura. Por eso vive en `cotizador.precio_override` con **solo** los tres
  precios (`costo_unitario` NULL → sigue el de Proveedores). El sync sigue escribiendo la tabla base y
  su motivo avisa "override activo". Se puede editar desde Configuración → precios.
- **"Antes de IVA" = `subtotalConAiu`**: el motor divide la lista entre el AIU (0,96), así que se guarda
  `146.000 × 0,96`:

  | Segmento | Antes de IVA /m² | Lista guardada | Antes (antes de IVA) |
  |---|---|---|---|
  | PA | **$146.000** | $140.160 | $96.186 |
  | PM | $138.475 (proporcional al multiplicador de VIDRIO) | $132.936 | $91.228 |
  | PB | $130.950 | $125.712 | $86.271 |

- **Área real con o sin diseño**: los paños de `ESP_FLOT_1`, `ESP_ELEV_1` y `ESP_MARCO_1`
  (`diseno_vidrio` 216-218) pasaron de 5 % a 0 % de desperdicio. Consecuencia aceptada: el biselado
  con diseño también se cobra por área real. Las cabinas conservan su 5 %.
- Script `2026-09-28_cotizador_espejo_bpb_precio_fijo.ts` (**corrido** el 2026-09-28, idempotente,
  simula sin `--aplicar`). `disenos.json` alineado; `catalogo.json` no cambia.
- Verificado con el motor: 1 m² PA libre → $146.000 antes de IVA ($173.740 con IVA); 100 × 150
  flotante → $219.000 del espejo + $37.012 del T-76. Había 0 ítems guardados con `ES0001`.
- ⚠️ Mientras el override exista, **el precio no sigue al costo**: si el proveedor sube el espejo, el
  margen se achica sin aviso en pantalla (solo en el historial del sync).

---

## Descripción comercial, instalación dentro del precio y formato VR09 (2026-09-26)

Pedido del usuario: que el producto se identifique ("ventana 744 color mate con vidrio claro 4 mm"),
que el PDF diga "Suministro e instalación de…" o "Suministro de…" según la casilla, el logo actual y
las condiciones de su formato impreso (VR09). Respuestas del selector: frase **con vidrio**,
**ubicación opcional**, **instalación dentro del precio del ítem**, **12 condiciones corregidas +
bloque de cierre**.

- **`lib/detalleComercial.ts` → `descripcionComercial(moduloId, input, resultado)`** (reemplaza a
  `detalleComercial`). "Sala — Suministro e instalación de ventana 744 color mate, vidrio claro 4 mm
  crudo, medidas 1.000 × 1.000 mm". Verbo por `conInstalacion`; ubicación = `descripcionItem`; módulo
  sin esa casilla (ítem libre) = el texto del asesor. Frases por módulo: ventana (sistema del diseño y
  su forma entre paréntesis), ventana proyectante (N naves, medidas "por nave" sin diseño), cabina de
  baño corrediza/Glasvit/deslizante…/batiente (+ "en L"), tablero en vidrio templado, espejo 4 mm
  biselado / con borde pulido brillado. Pruebas: `detalleComercial.test.ts` (10).
- **`calcularItem` la guarda en `resultado.descripcionComercial`** para que la pantalla no la
  reimplemente (import circular registry ↔ detalleComercial, seguro porque ambos lados se llaman
  dentro de funciones). El PDF la recalcula al imprimir; el frontend usa `descripcionDeItem`
  (`fichaProducto.ts`) con respaldo para ítems sin ella.
- **Campo "Ubicación (opcional)"** (`descripcionItem`, grupo comercial) en los 6 módulos con
  instalación. Sin cambio de BD: la columna ya existía y `TabCotizar` ya la tomaba del input.
- **Instalación dentro del precio (solo PDF):** `manoObraPorItem` (lib/cargos.ts, mismas reglas y
  tarifas que `calcularManoObraProductos`) da los PESOS; `valoresConManoObra`
  (generadorPdfCotizacion.ts) reparte el total de mano de obra GUARDADO y redondea por mayor
  residuo, así los ítems suman exactamente el "Subtotal" (productos + mano de obra) y el total no
  cambia. Totales del PDF: Subtotal → Descuento → cargos → IVA (19%) → Total. Si no hay cómo repartir,
  vuelven los renglones aparte. La pantalla conserva el desglose. Pruebas en `cargos.test.ts` (23).
- **Pantalla:** Actual y el detalle unen "Producto"/"Detalle" en una columna **Descripción** con el
  módulo como rótulo; el resumen de Cotizar muestra la frase en dos líneas.
- **Formato VR09:** script `2026-09-26_cotizador_formato_vr09.ts` (corrido en local; imprime los
  valores anteriores para revertir): 12 condiciones corregidas (la 12 es la de desmontes; "**NO
  asumimos**" en negrilla vía `**…**`), garantía y validez corregidas, y el **logo del ERP**
  (`datos_cotizador/logo-templex.png`, copia de `frontend-web/public/assets/images/logotemplex.png`,
  porque el contenedor del backend no trae el frontend). El PDF cierra con condiciones → garantía →
  validez → recuadro: marca (navy) + Asesor comercial / Fecha de entrega / Aprobó SÍ ☐ NO ☐ / O.D.P.
  No, todo en un bloque que no se parte. La validez salió del encabezado.
- **Configuración → "Documento de cotización":** edita condiciones (una por renglón), garantía y
  validez vía `PUT /empresa`, que existía sin pantalla.

### Hoja de Trabajo con letra grande (2026-09-26)
Pedido del usuario: los cortes "más grandes, más llamativos y que aprovechen la hoja". Plano 430 → 340
px (dibujo con `altoMaximoPx` 230), caja de cortes 400 → 490 px. Tablas `.tabla-cortes` con escala por
renglones (`escalaCortes`): ≤12 → texto 17 / medida 22 negrilla / encabezado 15 px; ≤15 → 15/19/13;
más → 13/16/12 (nunca se cortan filas). Materiales cuentan +3 renglones por el encabezado y el aviso.
Ficha de fabricación a 15 px. Verificado con 4 casos (diseño corto, 7038 de 6 paños, 8025 sin
diseño con 14 materiales, tablero).

**Plano +50 % (mismo día, pedido del usuario):** `DiagramaProducto` acepta `anchoMaximoPx` e
`impresion` (menos relleno y ancho completo de la caja: sin `w-full` el recuadro se encogía al
contenido y un plano ancho no crecía). La hoja pasa 345 px de alto y 630 de ancho; cajas 400 px
(plano) / 430 px (cortes); escalones ≤10 → 17/22/15, ≤12 → 15/19/13, más → 13/16/12. La pantalla
conserva 420 × 420. `@page { margin: 0 }` **no** quitó la fecha ni el "about:blank" en el navegador del
usuario (los pone el diálogo, "Encabezados y pies de página"): se volvió a 5 mm, como las hojas de la
ODP.

---

## Autoguardado y varios clientes a la vez (2026-09-26, a prueba)

Pedido del usuario: "tengo 5 cotizaciones a clientes distintos, ¿cómo salto de una a otra?". Validado
antes con una maqueta clickeable (artifact "Cotizador Templex · varios clientes"). El usuario pidió
verlo en real y **revertir si no le convence** (respaldo de los archivos previos en el scratchpad de
la sesión, `respaldo-antes-autoguardado/`).

- **Autoguardado** (`CotizadorPage.tsx`): 4 s después del último cambio (`ESPERA_AUTOGUARDADO_MS`);
  una cotización nueva se crea con su primer producto (300 ms). El autoguardado usa
  `PUT /cotizaciones/:id?respuesta=ligera` —`obtener(id, { ligero: true })` no trae los blobs de la
  propuesta activa— y NO vuelca la cotización: actualiza versión, totales y opciones, para no
  reiniciar lo que el asesor edita. `revision` (ref) evita marcar "guardado" si hubo cambios durante
  el guardado.
- **Versión:** el `PUT` acepta `versionEsperada`; si la base tiene otra, 409 "cambió en otra ventana"
  (`cotizacionStore.actualizar`). La pantalla muestra "Cambió en otra ventana" y deja de autoguardar.
- **Saltos:** `asegurarGuardado` guarda antes de abrir otra cotización, otra opción, la lista o una
  cotización nueva; el modal "cambios sin guardar" sólo aparece si ese guardado falla. Corrige un
  riesgo previo: reabrir desde Guardadas descartaba en silencio los cambios de la abierta.
- **Barra:** el nombre del cliente es el título y abre "Cambiar a otra cotización" (últimas 5 de este
  navegador, `recientes.ts` en `localStorage`); indicador "Guardando… / ✓ Guardado / No se pudo guardar
  · Reintentar"; "+ Nuevo cliente". Sin botón Guardar (Ctrl+S sigue guardando ya).
- **Cotizar:** campo "¿Para quién es esta cotización?" arriba (`ClienteRapido`).
- **Pestañas:** Cotizar · Resumen (antes Actual) · Mis cotizaciones (antes Guardadas); Calibración y
  Configuración en el menú ⚙ Administración. Las claves internas (`actual`, `guardadas`) no cambiaron.
- **Vocabulario:** en pantalla las propuestas son "Opción A/B/C" (`rotuloPropuesta`); "+ Otra opción
  para este cliente".
- Verificado con Playwright (12/12): 3 clientes creados sin pulsar Guardar, salto con el selector
  (≈3,4 s: guarda la abierta y trae la otra), edición previa al salto persistida, autoguardado en
  Resumen, conflicto detectado sin pisar la otra ventana.

## Tablero de Cotizaciones en el Dashboard gerencial (2026-09-27)

La pestaña **Cotizaciones** del Dashboard leía la tabla vieja `public.cotizacion` (0 filas: todo en cero). Se rediseñó sobre el schema `cotizador`.

- **Backend:** `GET /api/dashboard/cotizaciones` (panel) y `GET /api/dashboard/cotizaciones/excel` (libro .xlsx). Controlador `controllers/dashboard_cotizaciones.controller.ts`; consultas y Excel en `services/dashboardCotizaciones.service.ts`. Filtros por query con Zod `.strict()`: `desde`, `hasta` (AAAA-MM-DD, por defecto el año en curso), `asesor_id`, `cliente` (nombre, obra o N.°), `estado`, `monto_min`, `monto_max`, `segmento`, `producto` (módulo en la opción elegida).
- **Acceso:** control total del Cotizador (`nivelCotizador === 'total'`) ve todo; `asesor_comercial` ve **solo** sus cotizaciones (`asesor_usuario_id = su id`), impuesto en el servicio aunque mande otro `asesor_id`. Otros roles: 403. El asesor ya entraba al Dashboard gerencial (DashboardHome) y veía las otras 5 pestañas: eso no se tocó; solo se le suma esta. `gerente` (control total pero fuera de `DASHBOARD_ROLES`) ve un tablero con **solo** esta pestaña (`TableroCotizacionesSolo`).
- **Reglas de cálculo:** valores = `cotizacion.total_total` (opción ELEGIDA, con IVA; sin elegida suma $0 y se avisa). Las **canceladas se excluyen** de todas las métricas salvo filtrando por ese estado. Fechas contra la fecha de **Bogotá** (`AT TIME ZONE 'America/Bogota'`: la sesión de Supabase está en UTC). Conversión = aprobadas ÷ cotizadas (# y $). "Con ODP" = `odp_id` no nulo. Productos y sistemas salen de las columnas espejo del ítem (`modulo_id`, `sistema`, `cantidad_piezas`, `total`) de la opción elegida: valor de productos **sin** cargos de obra ni descuento, por eso no cuadra con el total de la cotización.
- **Validez:** `cotizador.empresa.validez_oferta_dias` días **hábiles lunes a viernes, sin festivos**. Vencida = pasó el plazo; por vencer = quedan 0–2 días hábiles. Solo señal visual, el estado no cambia (decisión del usuario).
- **Egress:** el panel es 100% agregado en SQL, sin JSONB. El Excel lee `input` + `resultado->'diseno'` (no el blob entero) solo de los ítems filtrados, para `descripcionComercial`.
- **Caché:** `cacheRespuesta(5 min, { claveExtra })` — la clave suma el ALCANCE (`total` compartido, `u<id>` por asesor). `cacheMemoria.ts` ganó la opción `claveExtra`, aditiva. Sin ella, un asesor con la misma URL recibiría la foto cacheada de un gerente. El Excel no se cachea.
- **Frontend:** `components/dashboard/panels/PanelCotizaciones.tsx` + `panels/cotizaciones/` (filtros propios, hook `useCotizacionesDashboard`, 5 bloques). Ya no pasa por `useDashboardData` ni por el selector de periodo del encabezado.

---

## Integración con la ficha ODP: SAP, Hoja de trabajo y sección COT (2026-09-27)

Tres piezas en la ficha de la ODP que leen la cotización del Cotizador vinculada
(`cotizador.cotizacion.odp_id`). La ficha solo LEE el Cotizador; crear/editar se hace allá
(`/cotizador?abrir=<id>`, `/cotizador?nuevo=1&vinculo=odp:<id>`).

### Traer ítems de la cotización → SAP
- Botón en Comercial → SAP, visible solo si hay una cotización vinculada **APROBADA** y el rol puede
  escribir la SAP (`root/admin/gerencia/asesor_comercial/jefe_produccion`, espejo de
  `documentos.routes.ts`). Usa la opción ELEGIDA.
- Endpoint `POST /api/documentos/sap/desde-cotizacion` (`sap.controller.ts → traerItemsDeCotizacion`),
  Zod `.strict()`: `{ odp_id, cotizacion_id?, sap_id?: number|'nueva', modo?: 'agregar'|'reemplazar',
  dry_run? }`. **`dry_run` es TRUE por defecto**: sin `dry_run:false` explícito nunca escribe. La
  previsualización devuelve exactamente las filas que se escribirían.
- Lógica pura en `lib/itemsParaSap.ts` (pruebas `itemsParaSap.test.ts`, 16, sin BD, en `test:cotizador`):
  - **Perfilería con cortes**: una fila por código, DIMENSIÓN "cant-medida" con " / ", × piezas del
    ítem; CANT. = barras de 6 m calculadas por `generarPerfileriaSAP` (no se duplica la cuenta).
  - **Sin cortes** (medidas libres, o blob sin `desperdicioPct`): barras desde los metros del BOM,
    DIMENSIÓN "Total 4,2 m", OBSERVACIÓN "Medir en obra: sin cortes calculados". Un mismo perfil
    puede salir dos veces (una con cortes y otra "medir") si la cotización mezcla ítems con y sin diseño.
  - **Accesorios**: cantidad × piezas, UND/ML/M2, redondeo hacia arriba.
  - **Película y matizado** (`PELI*`, `PEL0*`, `MATI*`, se reconocen por código): una fila por tamaño
    de paño "750 x 1600" (despiece o medida del formulario), cantidad = paños.
  - **No trae**: vidrio (categoría VIDRIO) ni procesos del vidrio (ACABADO: BPB, PERF, BOQ) — van al
    Pedido PV; se listan en `excluidos`. `GPI1102` (guía de piso, mal categorizada como VIDRIO) sí va
    como accesorio.
  - **Códigos del ERP**: se traduce el código del Cotizador al de `catalogo_productos` vía
    `cotizador.producto.catalogo_producto_id` (105 productos tienen código propio, p. ej.
    PRV700MATE ↔ CAB0103) y se toma su nombre como DESCRIPCIÓN. Sin equivalencia → código del
    Cotizador + advertencia. Sin esto Compras no encuentra el ítem ni se marca `tiene_aluminio`.
  - Diseño no apto para corte → se trae con observación "Verificar medidas antes de cortar".
  - `dimension` es VARCHAR(100): lo que no quepa pasa completo a la observación.
  - Letras: convención de `SAPModal` (A…Z, luego "27", "28"…).
- **Destino**: sin SAP → se crea una en borrador por el mismo camino que `createSAP`
  (`generarNumeroSAP` + `withUniqueRetry`), en la MISMA transacción que los ítems (no queda una SAP
  vacía que bloquee Herrajes). Con SAP → la más reciente; se puede elegir otra o "Nueva SAP".
- **Agregar debajo**: letras desde la siguiente a la MAYOR usada (no rellena huecos).
  **Reemplazar**: solo si ningún ítem está comprometido — `odc_items` que lo referencian,
  `estado_compra ≠ pendiente`, `existencia_piezas`, `es_faltante`, `modificado`, `exist_perf` con
  texto. Se recomprueba dentro de la transacción con `LOCK UPDATE`. El estado de la SAP no cuenta
  (las 386 están en 'borrador'). Borrado y alta con `individualHooks: true` (auditoría).
- **Doble carga**: `sap_items.origen_cotizacion_id`; si la cotización ya está en una SAP de la ODP se
  rechaza (409) salvo reemplazar sobre esa misma SAP.
- Después: `recalcularAluminioODP`, `recalcularChecksODP({herrajes:true})`, `emitirODPPatch`,
  `emitirCambio('compras')`. Una ODP ANULADA se rechaza.
- Verificado 2026-09-27 solo en `dry_run` contra ODP reales (633 sin SAP, 630 SAP libre, 627 con 11
  ítems comprometidos → reemplazo bloqueado). **La escritura real no se ha probado.**

### Hoja de trabajo en "Imprimir ODP"
Formato nuevo en `ODPTabImprimir.tsx` → `HojaTrabajoODP.tsx`, que reutiliza **tal cual**
`PrintableHojaTrabajo` y carga planos/despieces como `ModalDetalleCotizacion`. Prefiere las
cotizaciones APROBADAS (selector si hay varias); sin cotización vinculada el botón queda
deshabilitado con el motivo. Se imprime sin `ESTILOS_IMPRESION_ODP` (la hoja trae su `<style>`/@page).

### Sección "Cotizaciones (COT)" de Comercial
`CotizacionesODPSection.tsx` + `useCotizacionesDeOdp.ts`: tarjetas desde
`GET /cotizador/cotizaciones?odpId=` y el detalle de cada una (máx. 5, por egress) para la
descripción comercial y los servicios. Modal con productos, cargos, totales, cliente/vínculo,
"Descargar PDF" y "Editar cotización" (si `puedeEditar`). "Nueva cotización" y "Vincular cotización"
(aprobadas sin ODP, sugeridas por cliente, `PUT {odpId}`) para roles que crean cotizaciones.
Ya no se pinta `odp.cotizaciones` (tabla vieja `cotizacion`, 0 filas); el include sigue en
`getODPById` y `COTModal` sigue vivo en `ODPListPage`.


---

## Vínculo con el ERP, CRM automático y "Crear ODP" (2026-09-27, Agente B)

Parte de la integración del Cotizador al ERP (permisos y migración: fase A del supervisor).

- **Vínculo obligatorio.** "¿Para quién es esta cotización?" (arriba de Cotizar, `BarraVinculo` +
  `BuscadorVinculo`) busca a la vez leads, prospectos, clientes y ODP (`GET /api/cotizador/vinculos/buscar`,
  6 por tipo, mín. 2 caracteres). Sin vínculo se calcula pero no se agrega ("Primero elige para quién es";
  prop `sinVinculo` de `TabCotizar`). El vínculo precarga nombre/teléfono/dirección (editables en Resumen).
  En una cotización guardada, "Cambiar" hace `PUT {vinculo}` al instante.
- **Lead rápido** (`POST /vinculos/lead-rapido`, exige `puedeCrear`): crea un lead REAL con
  `crearLeadRegistro` —el cuerpo extraído de `createLead` del CRM—, asignado al asesor de la cotización.
  Teléfono repetido → 409 con la ficha del existente ("Usar ese lead").
- **Asesor = dueño.** Se elige al crear (por defecto quien crea; `GET /vinculos/asesores`); después solo
  control total lo cambia (select en Resumen → Comercial).
- **CRM automático** (`cotizador/lib/vinculos.ts`, dentro de la transacción del store; eventos con tipos
  ya existentes del ENUM):
  - crear / vincular a un lead → COTIZANDO si estaba en NUEVO, ASIGNADO, EN_CONTACTO o FRIO (FRIO se
    reactiva); nunca retrocede SEGUIMIENTO/VISITA_TECNICA ni toca APROBADO/PERDIDO. Lead de bolsa común →
    toma el asesor de la cotización (evento ASIGNACION). Siempre evento CAMBIO_ESTADO o SEGUIMIENTO.
  - APROBADA → lead APROBADO + `fecha_aprobado` + `monto_real_venta` = total de la opción elegida (misma
    escritura que `updateLeadStatus`).
  - PERDIDO → modal `ModalMotivoPerdida` (PRECIO, TIEMPO_ENTREGA, COMPETENCIA, NO_RESPONDIO, DESISTIO,
    OTRO + detalle) y "¿Marcar también el lead como perdido?" (`marcarLeadPerdido` en el PUT). Motivo al
    CRM con sus etiquetas ("Precio alto", "Fue con la competencia"…). Un lead APROBADO no se pierde.
  - La respuesta trae `avisosCRM: string[]` y la pantalla los muestra.
  - **El prospecto NO se aprueba al aprobar la cotización**: en el código aprobar un prospecto ES crear su
    ODP (`aprobarProspecto`); se aprueba con "Crear ODP".
- **Crear ODP** (Resumen, solo con la cotización APROBADA guardada): `GET /cotizaciones/:id/crear-odp`
  previsualiza (no escribe) y `POST` ejecuta **el flujo existente**:
  prospecto (o lead con prospecto en gestión) → `aprobarProspectoRegistro`; lead → `crearODPParaLead`;
  cliente → `crearODPRegistro` (el `POST /api/odp`). Valor = total con IVA de la opción elegida, asesor de
  la cotización, `servicios_detalle`/descripción desde los ítems, forma de pago obligatoria (después solo
  gerencia/admin la cambia). Si el lead/prospecto ya tiene ODP se ofrece vincular esa. Roles: los del
  `POST /api/odp` (admin, gerencia, asesor_comercial, jefe_produccion); prospecto: su asesor o admin/gerencia.
  Los cuatro handlers (`createLead`, `crearODPDesdeLead`, `aprobarProspecto`, `createODP`) se partieron en
  handler + función exportable **sin cambiar su comportamiento**.
- **Contrato de enlaces** (`enlaceCotizador` en `features/cotizador/vinculo.ts`):
  `/cotizador?abrir=<id>` y `/cotizador?nuevo=1&vinculo=<tipo>:<id>`; se consumen una vez y se limpian.
- **Entradas:** detalle del lead (CRM, `CotizacionesDeRegistro`), botón "Cotizar" en tarjetas de la columna
  Cotizando, modal del prospecto (`CotizacionesDeRegistro`), y en el formulario de ODP nueva "¿Parte de una
  cotización aprobada?" (`PartirDeCotizacion`: llena cliente, asesor y valor y al crear hace `PUT {odpId}`;
  las de lead/prospecto se mandan al Cotizador para no desincronizar el CRM).
- **Pruebas** (scratchpad de la sesión): `vinculos-api.js` (33 ✔), `sync-crm-rollback.ts` (10 ✔, en
  transacción deshecha y sin auditoría), `regresion-flujos.js` (6 ramas sin escritura de los handlers
  refactorizados), `e2e-vinculo.js` (Playwright, 19 ✔). Crear ODP / lead rápido reales quedan para la
  prueba coordinada con el usuario (la base local es producción).

---

## Integración con el ERP (2026-09-27) — resumen del supervisor

Orden del usuario: conectar el Cotizador al ERP. Trabajo repartido en una fase base (supervisor) y tres
agentes (B vínculo/CRM/Crear ODP, C ficha ODP/SAP/impresión, D Dashboard), cada uno con su sección arriba.

- **Base:** script `2026-09-27_cotizador_integracion_erp.ts` (columnas de dueño, creador, vínculo, ODP,
  motivo de pérdida, `aprobada_en`, `perdida_en`; `sap_items.origen_cotizacion_id`). Permisos en
  `cotizador/lib/permisos.ts` (espejo `features/cotizador/permisos.ts`): total = root, admin, gerencia,
  gerente, jefe_produccion; propias = asesor_comercial, asistente_administrativo (ven todo, editan lo
  suyo); resto solo lectura — **produccion y compras pasaron a lectura en la ronda 2** (abajo). Precios,
  costos, calibración y configuración: solo total.
- **Decisiones confirmadas por el usuario tras la revisión:** un lead FRÍO que recibe cotización vuelve a
  COTIZANDO; el asesor comercial conserva las demás pestañas del Dashboard y suma Cotizaciones filtrada;
  asistente/producción/compras no ven esa pestaña.
- **Bug del CRM corregido:** "Crear ODP desde lead" guardaba `forma_pago = 'CONTADO'` (mayúsculas); ahora
  'contado'. Script `2026-09-27_normalizar_forma_pago_odp.ts` para las 65 ODP afectadas (cuenta por
  defecto; escribe con `--aplicar`).
- **Verificación del supervisor (las tres partes juntas):** tsc back/front, ESLint sin avisos nuevos,
  suites 90/90, permisos 20/20, vínculos 33/33, regresión de los 4 flujos extraídos (mismos códigos de
  respuesta), UI Cotizador 18/18, ficha ODP 15/15 (root y asesor, sin escribir en SAP), Dashboard 20/20.
- **⚠️ La base local es la de PRODUCCIÓN:** los caminos que escriben en el ERP (lead rápido, Crear ODP,
  escritura real a SAP, sincronía CRM persistida) se verifican en una prueba coordinada con el usuario.

## Ronda 2 de la integración (2026-09-27, tras la verificación del usuario)

- **Nadie cotiza a nombre de otro.** La cotización nace con quien la crea como asesor (`store.crear`
  ignora `asesorUsuarioId` si hay usuario). Se quitó el selector "Asesor" de la barra "¿Para quién…?";
  en Resumen el asesor es un dato fijo, salvo para control total en una cotización ya creada (reasignar).
  Crean: asesores, asistente administrativo, jefe de producción, admin, root, gerencia y gerente
  (el gerente queda igual que gerencia, decisión del usuario). Producción y compras: solo lectura.
- **Pestaña "Cotizaciones"** (antes "Mis cotizaciones") con filtro **Asesor**: "Todos / Mis cotizaciones /
  cada asesor". Arranca en "Mis cotizaciones" para quien edita solo las suyas.
- **Ficha del prospecto** (`ProspectosPage`, el modal de detalle — no el formulario `ProspectoModal`):
  sección "Cotizaciones del prospecto" con "Nueva cotización".
- **ODP nueva → "¿Parte de una cotización aprobada?"** se muestra siempre; sin disponibles explica por qué
  y lleva al Cotizador (antes se ocultaba y el usuario no sabía que existía). `ODPForm`: etiquetas en
  negro, bordes de campo `slate-400`, obligatorios con asterisco rojo (solo visual).
- **Crear ODP → "+ Crear cliente"** en los tres caminos: mini formulario (nombre, tipo y número de
  documento, teléfono, correo, dirección, fuente) contra `POST /api/clientes`; el 409 de duplicado se
  explica. Reemplaza el "Es un cliente nuevo" (solo nombre + teléfono) del camino lead.
- **Referencia del PDF:** `COT-87` y, con varias opciones, la letra (`COT-87 B`). Encabeza el PDF junto a
  la ODP vinculada y el cliente, y da nombre al archivo: `COT-87 B, ODP-24381 Cliente.pdf`
  (`folioCotizacion` / `nombreArchivoCotizacion` en `generadorPdfCotizacion.ts`). El backend lo manda en
  `Content-Disposition` (`filename*` UTF-8) y `app.ts` expone esa cabecera por CORS.

### Cabina Glasvit (antes "Cabina Deslizante Primavera")

Script `2026-09-27_cotizador_cabina_glasvit.ts` (**corrido**, la base local es producción):
- Solo cambia `cotizador.diseno.sistema` → "Cabina Glasvit". Los ids (`Cabina Deslizante Primavera::…`)
  NO cambian: los referencian ítems guardados, perfiles, vidrios y accesorios. El módulo reconoce Glasvit
  por `/PRIMAVERA/` en el id.
- Alta de `KDG0305` (costo $105.000, del usuario, sin proveedor), `KDG0302` ($386.555) y `KDG0308`
  ($115.000), ambos del proveedor vigente; PA/PM/PB con el multiplicador de ACCESORIO.
- **Holgura de todas las cabinas: 3 mm en el ancho, 0 en el alto** (fila por sistema en
  `calibracion_holgura`; la global sigue en 3 × 3).

Reglas (usuario, `modules/cabinasCorredizas.ts`, por diseño y por medidas libres):
- El kit trae los herrajes: **sin ROD0401 ni botón**. Perforación (PERF01), boquilla (BOQN02) y BPB sí se
  cobran — son ACABADO y la SAP ya los excluye.
- Kit: ancho ≤ 1.500 → KDG0306; ≤ 2.200 → KDG0305; más → KDG0305 **con aviso**. En L, un solo kit que
  ya contempla los dos lados: KDG0302 (2 fijos + 1 corrediza) o KDG0308 (2 fijos + 2 corredizas).
- Tubo TUB0316: **uno**, largo = ancho (en L, X + Y), cobrado por **tramo**: $37.500 hasta 1.800 mm,
  $50.000 hasta 2.200, $75.000 hasta 3.000 y, pasando, $75.000 + la fracción proporcional (con aviso).
  Precio = costo del tramo × multiplicador de su categoría. La SAP pide 1 tubo (`piezasEnteras`).
- **En L se mide X × Y:** campos `ladoYCm` y `configuracionL`, visibles solo con "en L" (nuevo `soloSi` del
  contrato de campos, lo respeta `FormularioModulo`). Lado Y: 2F1C = un fijo a la medida del lado; 2F2C =
  el mismo diseño sobre Y. Van a los cortes con `lado: "Y"`. Sin lado Y → error claro.
- `cotizarPorDiseno` ganó el hook `ajustarItems` (último retoque del BOM antes de totalizar).
- Descripción comercial: "cabina de baño Glasvit en L (2 fijos + 1 corrediza), …, medidas 1.200 × 900 mm,
  alto 1.900 mm".

Verificación: `test:cotizador` 148/148 (4 pruebas nuevas de Glasvit; se corrigieron 2 que esperaban lo
anterior — Primavera con rodachinas y `calcularItem` idéntico al motor, rota desde que existe la
descripción comercial); API de permisos/PDF 10/10; capturas de barra, pestaña, cabina en L, ficha de
prospecto y ODP nueva sin errores de página.

## Ronda 3 de la integración (2026-09-27)

- **Cliente oficial al crear la ODP:** `crearODPDesdeCotizacion` (`lib/vinculos.ts`), en los tres caminos,
  copia a la cotización el cliente de la ODP recién creada (`cliente_id`, nombre, teléfono y dirección
  oficiales). El lead / prospecto de origen se conservan. Antes quedaba el nombre escrito a mano al cotizar
  y el filtro por cliente no la encontraba.
- **Listado con vínculos:** `store.listar` agrega `vinculos: [{tipo, id, etiqueta}]` (nombre del lead,
  PR-…, cliente, ODP-…) con 4 consultas agrupadas solo por los ids listados. El buscador `q` también
  encuentra por número de ODP, de prospecto y nombre del lead (subconsultas con el texto escapado).
  Pestaña Cotizaciones: columna "Vinculada a" con chips por tipo.
- **Excel del tablero, hoja Listado:** columna **Fuente** = `leads.fuente_lead` de la cotización → fuente
  del cliente (directo, del prospecto o de la ODP) → lead de origen del prospecto / ODP → "Sin registrar".
- **Tablero:** el filtro Asesor va primero ("Todos los asesores") y lista a todos los que pueden cotizar,
  no solo a quien ya tiene cotizaciones.
- **"Partir de una cotización aprobada"** es un buscador (número, cliente, asesor) en vez de un select.

### ⚠️ Pruebas contra la base de producción
La base local es la de producción y el pooler de Supabase admite **15 conexiones** en modo sesión,
compartidas con el ERP en uso. Correr la suite completa con el backend local encendido las agota: otros
usuarios pueden ver errores momentáneos. Correr las pruebas por partes y fuera del horario laboral.

---

## Revisión del usuario: cerrojo, películas, código del ERP (2026-09-27)

Detalles que el usuario encontró recorriendo el módulo. Decisiones suyas, no volver a preguntarlas.

### Cerrojo y chapa en ventanas (`modules/ventanas.ts`)
- **5020 lleva UN cerrojo `CPTOR`** (en el ERP `CPTOR01`, "CERROJO PUNTO ROJO") por ventana, por
  diseño y por medidas libres. Antes no tenía ninguno.
- **5020 Reforzado NO lleva cerrojo** (cierra con su traslape reforzado). Tiene entrada propia en
  `CATALOGO_SISTEMAS` (`"5020Reforzado"`, los mismos accesorios del 5020 sin cerrojo). La búsqueda de
  accesorios por diseño prueba primero el nombre exacto sin "Sistema" y sólo si no existe le quita
  "Reforzado": antes se lo quitaba siempre y el reforzado heredaba todo del 5020.
- **8025 ya no lleva cerrojo** (tenía `CPTOR`, 1 cada 2 cuerpos). Su chapa predeterminada es `CH8025S`.
  744 y 7038 nunca lo tuvieron.

### Película: una lista del catálogo, no un sí/no
- `lib/peliculas.ts`: `listarPeliculas()` (productos del catálogo del Cotizador cuya descripción empieza
  por "PELICULA", `PELI31` primero), `codigoPelicula()` (`true` de antes = `PELI31`, `''` = sin
  película), `nombrePelicula()` (para la descripción comercial; tolera correr sin caché).
- El campo `pelicula` de **ventanas, proyectantes y tablero** es `CAMPO_PELICULA` (select con
  `opcionesDinamicas: "peliculas"`); `listarModulos()` le pone las opciones del catálogo en cada
  consulta, así que una película dada de alta después aparece sola. Cabinas y espejo no tienen película
  (decisión del usuario: "en todos" = también tableros).
- **Película sin precio → precio a cotizar**: campo `costoPelicula` (`CAMPO_COSTO_PELICULA`, "$ por
  metro, del proveedor"), que el formulario sólo muestra si la opción elegida trae `precioACotizar`
  (propiedad nueva `soloSiACotizar` en `CampoMeta`, resuelta en `FormularioModulo.campoOculto`). Se pasa
  como `costoManual` a `lineaCatalogo`: sin costo la línea sale en error, con costo lleva la advertencia
  de siempre.
- Script `2026-09-27_cotizador_peliculas_catalogo.ts` (**ya corrido**): 23 altas (`origen ALTA`,
  vinculadas, `X METRO`, ACABADO) — 3 con precio de proveedor (PEL0103, PEL0104, PEL0106) y 20 a cotizar.
  **Todas las películas en ACABADO**: PELI0101/PELI0102 (venían de ACCESORIO) y PEL0107 (de VIDRIO) se
  recategorizaron y su precio se recalculó con el multiplicador de ACABADO (bajó un poco: ×1,534 frente a
  ×1,551 y ×1,673). Revertible con `--revertir`.
- Clonar propuesta acepta `pelicula` como código (o el booleano viejo) y `costoPelicula`.
- `itemsParaSap.clasificar()` reconoce `^(PEL|MATI)` (antes `PELI|PEL0|MATI`, que dejaba PEL1020/PEL1030
  como proceso del vidrio).
- ⚠️ **Heredado, sin tocar:** la película se cobra con el ÁREA del vidrio (m²) como cantidad, pero su
  unidad y el costo del proveedor son **por metro** de rollo. Es lo que hacía `PELI31` desde el Excel.
  Si el rollo no mide 1 m de ancho, el precio no es exacto: pendiente de confirmar con el usuario.

### Código del ERP en pantalla y en el buscador
- 170 productos del Cotizador tienen un código distinto al del ERP: 44 del catálogo (`CPTOR` ↔
  `CPTOR01`, `PELI31` ↔ `PEL0101`) y los 126 provisionales `PRV…` (`PRV700MATE` ↔ `CAB0103`). Vienen del
  software de origen. **No se renombraron** (tocaría diseños, mapeo de accesorios, módulos y blobs).
- La caché trae `catalogo_productos.codigo` de cada producto vinculado y emite `Producto.codigoErp` sólo
  cuando difiere; `lineaCatalogo` lo copia a la línea (`LineaBOM.codigoErp`).
- Se muestra en el despiece (`ResultadoCalculo`, el del Cotizador debajo), en el ítem libre, en
  "Cambiar/Agregar componente" y en la tabla de materiales de la Hoja de Trabajo. El PDF no muestra
  códigos. Los buscadores (`buscarEnCatalogo`) encuentran por cualquiera de los dos.
- Las cotizaciones guardadas antes de esta fecha muestran el código del Cotizador hasta recalcularse.

### Otros
- Se quitaron los puntos de color de la descripción del despiece (azul si el texto decía "VIDRIO", gris
  el resto): no tenían leyenda y fallaban.
- La lista del buscador del ítem libre flota sobre toda la página (portal a `body`, `fixed`, se recoloca
  con scroll/resize, se abre hacia arriba si no cabe). Antes la recortaba el `overflow-hidden` de la
  tabla. Muestra hasta 30 y avisa si hay más.

**Pruebas:** suite nueva `peliculasYCerrojo.test.ts` (12). Total **13 suites, 160 pruebas**, en verde
corridas una a una con el backend dev arriba (cargos, itemLibre, personalizacion y piezaEntera dieron 0/N
en la primera pasada por el pooler y pasaron completas al repetirlas solas).

# Compras — Documento de Diseño

> **Estado:** borrador / captura de requisitos
> **Creado:** 2026-08-02
> **Propósito:** documentar la visión, reglas y decisiones del módulo de Compras
> antes de implementar. Aquí NO se escribe código: se acuerda el "qué" y el "por qué".
> La implementación se hará en una fase posterior, cuando este documento esté cerrado.

---

## 1. Objetivo

Construir un **maestro de proveedores con lista de precios comparable**, de modo que al
consultar un producto del catálogo interno el sistema muestre **qué proveedores lo venden
y a qué precio**, para poder elegir el más conveniente antes de emitir la orden de compra.

Requisitos declarados por el usuario (2026-08-02):

1. Lista de proveedores.
2. Cada proveedor vende productos **según su categoría** (vidrio templado, vidrio crudo,
   accesorios, servicios, insumos, etc.).
3. Varios proveedores venden **el mismo producto a precios distintos**.
4. Al consultar un producto → ver la lista de proveedores con sus precios para elegir.
5. Al actualizarse un precio, conservar los **2 precios anteriores con sus fechas**.

Problema central identificado por el usuario: **el catálogo interno usa un código propio
(ej. `TUB0510`), pero cada proveedor usa su propio código para el mismo producto.**

---

## 2. Situación actual

Levantado del código el 2026-08-02. **Hoy no existe ninguna entidad "proveedor" ni ningún
precio de compra en el sistema.**

### 2.1 Lo que existe

| Elemento | Dónde | Qué guarda |
|---|---|---|
| `catalogo_productos` | `catalogo_producto.model.ts` | `codigo` (UNIQUE), `nombre`, `categoria` (texto libre), `descripcion`, `activo`, `es_aluminio`. **Sin precio, sin unidad de medida.** |
| `ordenes_compra` | `orden_compra.model.ts` | `proveedor: STRING(150)` — **texto libre** |
| `odc_items` | `odc_item.model.ts` | `codigo`, `descripcion`, `cantidad`, `recibido`. **Sin precio unitario ni total.** |
| `odp.proveedor_vidrio` | `odp.model.ts:50` | `STRING(100)` — **texto libre** |
| `pedido_pv.proveedor` | `pedido_pv.model.ts:12` | `STRING(100)` — **texto libre** |
| `inventario_perfileria` | `inventario_perfileria.model.ts` | `codigo`, `mm`, `ubicacion`. Sin costo. |

### 2.2 Sistema externo: World Office

El usuario opera además con **World Office** (software contable), del cual puede exportar la
**lista de proveedores**. Implicación: el maestro `proveedores` **no se captura a mano** —
se puebla por importación desde World Office, lo que además evita los duplicados por tipeo
que tendría una captura manual.

Pendiente definir si World Office es la **fuente de verdad** de proveedores (y el ERP solo
espeja) o si tras la importación inicial el ERP toma vida propia. Ver §7.

### 2.3 Hallazgos que condicionan el diseño

- **El nombre del proveedor se escribe a mano en 3 tablas distintas** (`ordenes_compra`,
  `odp`, `pedido_pv`) con 3 longitudes distintas (150/100/100) y sin ninguna relación entre
  ellas. El mismo proveedor puede existir hoy como `"VIDRIO ANDINO"`, `"Vidrio Andino S.A"`
  y `"vidrio andino sa"` sin que el sistema lo sepa. **Pendiente: medir cuántas variantes
  reales hay en la BD antes de migrar.**
- **Compras hoy no conoce dinero.** Ni la ODC ni sus ítems guardan precio. El módulo
  gestiona *qué se pide y si llegó*, no *cuánto costó*. Agregar precios es una ampliación
  real de alcance, no un campo más.
- `catalogo_productos.categoria` es texto libre `STRING(100)`, no un ENUM ni una tabla.
  Las categorías que el usuario menciona (vidrio templado, vidrio crudo, accesorios,
  servicios, insumos) **no están normalizadas hoy**. Pendiente ver los valores reales en BD.
- El catálogo **no tiene unidad de medida**. Sin ella, comparar precios entre proveedores
  es inseguro (ver §6, caso borde crítico).

### 2.4 Datos reales medidos en producción (2026-08-02)

Consulta read-only directa a Supabase para dimensionar el trabajo. **Responde varias de las
preguntas abiertas sin necesidad de preguntarlas.**

#### ✅ El catálogo interno existe y está sano — riesgo mayor descartado

| Métrica | Valor |
|---|---|
| Productos en `catalogo_productos` | **1.243** (todos activos) |
| Con código propio | **1.212 (97,5 %)** |
| Sin código | 31 — son productos **terminados de venta** (`VIDRIO TEMPLADO 6MM CON MATIZADO`, `CABINA GLASSVIT 8MM`), no insumos |
| Marcados `es_aluminio` | 505 |

Los códigos siguen exactamente el patrón que el usuario citó: `ACC0106`, `ADA0101`,
`TUB0103`, `PEL0106`, `CER0301`. **El catálogo contra el cual mapear ya existe y está
poblado** — no hay que construirlo.

> Nota: el catálogo es **mixto**. Convive un grupo pequeño de productos terminados de venta
> (sin código) con ~1.212 insumos de compra (con código). Solo estos últimos son mapeables.

#### ✅ Los códigos que se compran ya están en el catálogo

| Métrica | Valor |
|---|---|
| Códigos distintos usados en `odc_items` | 313 |
| De ellos, **presentes en `catalogo_productos`** | **303 (96,8 %)** |

Dato clave para dimensionar: **de 1.212 productos, solo ~313 se compran realmente.** El
esfuerzo de mapeo no es sobre el catálogo completo, sino sobre ese subconjunto — y ordenado
por frecuencia (§3.4), los primeros ~25 códigos ya cubren buena parte del volumen.

#### ⚠️ Las categorías están prácticamente vacías

| Estado | Productos |
|---|---|
| **Sin categoría (`NULL`)** | **1.180 (95 %)** |
| Con categoría | 63 — y son de **venta**, no de compra: `Películas` (32), `Ventanería` (5), `Cabinas Batientes` (4), `Tableros` (4), `Espejos` (4), `Fachadas` (2)… |

El requisito 2 del usuario (*"proveedores que venden según su categoría"*) **hoy no se puede
cumplir**: no hay con qué agrupar.

~~**Atajo posible:** derivar la categoría del **prefijo de 3 letras** del código
(`TUB`=tubular, `ACC`=accesorio, `PEL`=película…).~~
❌ **Descartado por el usuario (2026-08-02):** *"el prefijo de las 3 letras no es recomendable
guiarse porque no sigue una estructura definida; con el tiempo los que crearon esos códigos
perdieron la estructura"*. Aunque los ejemplos observados parecían consistentes, **el usuario
conoce el historial de sus códigos** y la regla fallaría de forma silenciosa en un número
desconocido de casos — justo el tipo de error que contamina datos sin avisar.

✅ **Sustituido por:** el usuario aportará el **inventario ya clasificado por categoría** en
Excel (§9). Fuente confiable en vez de regla adivinada.

#### ⚠️ Proveedores duplicados por tipeo — confirmado con datos

50 valores distintos en `ordenes_compra.proveedor`, pero **varios son el mismo proveedor**:

| Mismo proveedor escrito de varias formas | Registros |
|---|---|
| `VENTANAS Y PUERTAS` (45) · `VyP` (12) · `VYP` (6) | 63 |
| `VIDRIO EQUIPOS Y ACCESORIOS` (9) · `VEA` (4) · `VIDRIO EQUIPOS Y ACCESORIOS VEA` (3) · `VIDRIO EQUIPOS Y ACCESORIOS - VEA` (1) | 17 |
| `ACCESORIOS PARA VIDRIO DE COLOMBIA` (6) · `ACCESORIOS PARA VIDRIOS DE COLOMBIA` (1) | 7 |
| `GRUPO ROLDAN` (6) · `GR` (1) | 7 |

Normalizar por mayúsculas y espacios **no los une** (siguen siendo 50): las variantes son
siglas y erratas, no diferencias de formato. **La unificación exige criterio humano** — otra
razón para que el maestro nazca de World Office y no de estos textos.

**Vidrio, en cambio, está limpio y concentrado:** `odp.proveedor_vidrio` tiene solo 2 valores
(`Vitelsa` ×266, `PV` ×1) y `pedido_pv.proveedor` tres (`Vitelsa` ×280, `PV` ×2,
`Templacol` ×1).

---

## 3. Propuesta

### 3.1 Modelo conceptual

Tres piezas, separando dos problemas que no deben mezclarse:

```
proveedores  ──┐
               ├──►  proveedor_producto  (equivalencia + precio vigente)
catalogo_productos ─┘          │
                               └──►  proveedor_producto_precio  (histórico)
```

- **`proveedores`** — el maestro que hoy no existe: NIT, nombre comercial, razón social,
  contacto, categorías que atiende, activo/inactivo.
- **`proveedor_producto`** — **la pieza clave.** Es la tabla de equivalencia N:M que resuelve
  el problema de los códigos: dice que *mi* `TUB0510` es el `AL-2245` del Proveedor A y el
  `PERF.TUB.05` del Proveedor B. Además guarda el precio vigente de ese proveedor para ese
  producto.
- **`proveedor_producto_precio`** — histórico completo de cambios de precio (ver §3.3).

Con esa estructura, la consulta que el usuario pide ("dame el precio de X producto") es un
solo `SELECT` sobre `proveedor_producto` filtrando por `catalogo_producto_id`, ordenado por
precio ascendente.

#### Ejemplo concreto — un producto, tres proveedores que lo nombran distinto

Duda planteada por el usuario (2026-08-02): *"para un mismo producto puede haber proveedores
con descripción y códigos distintos, además de precios distintos"*. **Eso es exactamente lo
que la tabla `proveedor_producto` está hecha para guardar.** Cada fila es "cómo llama ESTE
proveedor a MI producto, y a cuánto me lo vende":

`proveedor_producto` — filtrando por `catalogo_producto_id` = mi `TUB0510`:

| proveedor | mi código | código del proveedor | descripción del proveedor | precio (sin IVA) |
|---|---|---|---|---|
| Proveedor A | `TUB0510` | `AL-2245` | CIERRAPUERTAS HIDRAULICO | 45.000 |
| Proveedor B | `TUB0510` | `CP-100` | CIERRA PUERTA 100KG | 48.500 |
| Proveedor C | `TUB0510` | `7789` | BRAZO CIERRE AEREO | 43.200 |

Tres códigos distintos, tres descripciones distintas, tres precios distintos — **las tres
filas apuntan al mismo producto interno**. Esa consulta es, literalmente, la pantalla que el
usuario pidió: "dame el precio del brazo hidráulico" → estos tres proveedores, ordenados por
precio.

**La idea clave:** el código y la descripción del proveedor **no son atributos del producto,
son atributos de la relación proveedor↔producto**. Por eso viven en la tabla intermedia y no
en `catalogo_productos`. El producto interno tiene *un* código (el suyo); los nombres ajenos
son tantos como proveedores haya, y no compiten entre sí.

### 3.2 Cómo se alimentan los precios — opciones

El usuario planteó cargar el PDF de la factura electrónica (FE) del proveedor y extraer los
precios de ahí, señalando como problema el choque de códigos. **La reconciliación de códigos
se resuelve igual en todas las opciones** (con `proveedor_producto` + bandeja de mapeo,
§3.4); lo que cambia entre opciones es **de dónde sale el dato del precio**.

#### Opción A — Captura manual asistida
Pantalla "Lista de precios del proveedor": se elige proveedor, se ve su catálogo mapeado y
se edita el precio con su fecha.
- ✅ Cero dependencias, cero riesgo de lectura errada, se implementa rápido.
- ✅ **Se necesita de todos modos** como respaldo (proveedor nuevo, precio telefónico,
  corrección de un dato mal extraído).
- ❌ Trabajo manual recurrente.

#### Opción B — Importación por Excel/CSV con plantilla
Se descarga una plantilla que ya trae el código interno y el código del proveedor; se llenan
los precios; se sube y el sistema hace match por `codigo_proveedor`.
- ✅ Barata, robusta, sin IA, ideal para **actualizaciones masivas de lista de precios**.
- ✅ Se alinea con cómo se mueven los precios en la realidad: el proveedor manda una **lista
  de precios**, no una factura por cada cambio.
- ❌ Requiere que alguien consiga y suba el archivo.

#### Opción C — PDF de la FE + extracción automática (idea original)
Tres sub-variantes, muy distintas entre sí:

- **C1 — Parseo de texto del PDF con reglas por proveedor.** Se escribe una "plantilla" de
  lectura por cada proveedor.
  ❌ Frágil: cualquier cambio de formato del proveedor lo rompe en silencio. Mantenimiento
  eterno. **No recomendado.**
- **C2 — PDF → modelo de lenguaje → JSON estructurado.** Se envía el PDF y se pide de vuelta
  `{codigo_proveedor, descripcion, cantidad, precio_unitario}`.
  ✅ Aguanta formatos distintos sin plantillas. ❌ Costo por documento, requiere validación
  humana antes de escribir precios (una alucinación en un precio es cara).
- **C3 — XML DIAN de la factura electrónica.** ⭐ En Colombia toda FE válida viaja con un
  **XML UBL 2.1** que ya trae, línea por línea y de forma estructurada y exacta: código del
  vendedor, descripción, cantidad, unidad, precio unitario e IVA.
  ✅ **Cero ambigüedad, cero alucinación, cero costo de IA, cero plantillas por proveedor.**
  Es la misma información del PDF pero en formato de máquina.
  ❌ Depende de que se reciban/archiven los XML, no solo el PDF impreso.

#### ✅ Decidido (2026-08-02): opción C3 — XML DIAN desde el .zip

El usuario confirmó que **recibe y archiva el comprimido `.zip`** que contiene el PDF **y el
XML** de cada factura electrónica. Esto habilita C3 y **descarta C1 y C2**: teniendo el XML,
leer el PDF es trabajar de más con datos peores.

**Flujo de ingesta previsto:**

```
Usuario sube el .zip  →  backend descomprime en memoria
                      →  localiza el XML (ignora el PDF)
                      →  si es AttachedDocument, extrae el Invoice embebido (CDATA)
                      →  recorre cada cac:InvoiceLine
                      →  por línea: código del vendedor, descripción, cantidad,
                         unidad, precio unitario, % IVA
                      →  match contra proveedor_producto
                          ├─ conocido  → registra precio (origen = FACTURA)
                          └─ nuevo     → bandeja de códigos sin mapear
```

Detalle técnico a tener presente: la FE colombiana suele venir como **`AttachedDocument`**,
un XML contenedor que trae el `Invoice` real **embebido dentro de un bloque CDATA** — hay
que desanidar antes de parsear. El NIT del emisor viene en el mismo XML, lo que permite
**identificar el proveedor automáticamente** sin que el usuario lo seleccione.

Se conserva el `.zip` original como respaldo/trazabilidad del precio (`documento_ref`)
— alcance por decidir, ver §5.4.

**Volumen real (declarado 2026-08-02): ~20 facturas electrónicas diarias.** Consecuencias
de diseño:
- La carga debe ser **por lote con selección múltiple**, nunca de a un archivo por vez.
- El usuario puede **descomprimir y quedarse solo con los XML**, así que la ingesta debe
  aceptar **tanto `.zip` como XML sueltos** (y una selección de varios XML a la vez).
- No hay urgencia de tiempo real: el usuario declaró que **no necesita los precios "de ya
  para ya"**. La ingesta puede ser un proceso por lotes, sin optimizaciones de latencia.
- Con ese volumen, la repetición de productos es la norma → ver §3.5.

#### Recomendación de fases
**Fases, no todo de una vez:**

1. **Fase 1** — importar proveedores desde World Office + `proveedor_producto` + histórico
   + **Opción A** (captura manual). Con esto la funcionalidad que el usuario pidió
   (*"consultar un producto y ver proveedores y precios"*) **ya funciona completa**. Todo lo
   demás es automatizar la digitación.
2. **Fase 2** — **ingesta del `.zip`/XML (C3)** con bandeja de mapeo.
3. **Fase 3** — **Opción B** (Excel) para actualizaciones masivas de lista de precios.

Motivo de fondo: la factura **no es la mejor fuente de una lista de precios**. Una FE dice
qué se pagó por lo que se compró ese día (con descuentos puntuales, fletes, promociones), no
lo que el proveedor cobra en general. Sirve para *detectar* que un precio cambió, pero la
lista de precios como tal se alimenta mejor por lista. Conviene distinguir en el modelo el
**origen** de cada precio (`MANUAL | LISTA | FACTURA`) — ver §4.

### 3.3 Los "2 últimos precios con fecha"

El usuario pidió columnas con los 2 precios anteriores y sus fechas. Dos formas:

- **Solo columnas** (`precio_anterior_1/fecha_1`, `precio_anterior_2/fecha_2`): simple, pero
  **el tercer precio hacia atrás se pierde para siempre.** Sin posibilidad de auditar ni de
  graficar tendencia.
- **Híbrida (recomendada):** tabla `proveedor_producto_precio` con el histórico completo
  (una fila por cambio) **+** las columnas denormalizadas en `proveedor_producto` para que
  el listado se resuelva en una sola consulta sin joins ni subconsultas.
  Se conserva todo el historial y la pantalla sigue siendo barata de leer — relevante por el
  **egress de Supabase**, donde una consulta con histórico por cada fila del listado sería
  costosa.

Las columnas denormalizadas se actualizan por corrimiento al registrar un precio nuevo:
`actual → anterior_1 → anterior_2`.

### 3.4 Identificación del producto — el problema difícil

**Planteamiento del usuario (2026-08-02):** no solo difieren los códigos, también difieren
las descripciones. Él llama a un producto **"brazo hidráulico"** y el proveedor lo llama
**"cierrapuertas"**. No hay ningún campo en común entre ambos sistemas.

#### La observación que reduce el problema

**Esto no es un problema de búsqueda, es un problema de memoria.** El par
`(proveedor, código_proveedor)` solo hay que resolverlo **una vez en la vida**, porque el
proveedor **sí es consistente consigo mismo**: su código `AL-2245` significará lo mismo en
todas sus facturas, hoy y dentro de tres años.

Consecuencia práctica: el esfuerzo es **finito y decreciente**. La primera factura de un
proveedor exige trabajo humano; la segunda mucho menos; la décima, prácticamente ninguno.
No hay que enseñarle al sistema que "cierrapuertas = brazo hidráulico" en abstracto —
**basta con que un humano lo diga una sola vez** y el sistema lo recuerde para siempre.

Por eso el diseño **no depende** de acertar el match automáticamente. El automatismo es un
acelerador opcional; el mecanismo que sostiene todo es la confirmación humana registrada.

#### Bandeja de códigos sin mapear

Cuando entra un precio (por cualquier vía) con un `codigo_proveedor` desconocido, **no se
descarta y no se adivina**: cae en una bandeja de pendientes donde un humano lo vincula al
código interno (o lo marca como "no me interesa", para que no vuelva a preguntar por fletes,
redondeos y demás líneas que no son productos). Hecho el vínculo, las cargas siguientes de
ese proveedor son automáticas.

#### Ayudas para que el trabajo humano sea llevadero

Ninguna decide sola; todas **sugieren** y el humano confirma.

1. **Diccionario de alias por producto** ⭐ — cada producto del catálogo acumula los nombres
   con que el mundo lo llama: `brazo hidráulico` → alias `cierrapuertas`, `cierra puerta`,
   `door closer`. Cada vez que se mapea un ítem, **la descripción del proveedor se guarda
   como alias**. Resultado: el sistema aprende del trabajo ya hecho, y cuando el *segundo*
   proveedor mande su "cierra puertas", ya lo reconoce. **Es la ayuda con mejor relación
   beneficio/esfuerzo y la que hace que el trabajo se pague solo.**
2. **Sugerencia semántica con modelo de lenguaje** — aquí sí tiene sentido usar IA, pero
   **no donde se pensó originalmente**: no para leer el PDF (el XML ya da datos exactos),
   sino para el matching de significado *"cierrapuertas ≈ brazo hidráulico"*, que es
   justamente donde la comparación de texto plano fracasa y un modelo de lenguaje acierta.
   Como es sugerencia con confirmación humana, un error no contamina nada.
3. **Orden de trabajo por impacto** — la bandeja se ordena por **frecuencia y valor**, no
   alfabéticamente. Mapeando los ~20 productos que concentran la mayor parte del gasto se
   cubre la mayoría del volumen; la cola larga se mapea cuando aparezca.
4. **Backfill desde los `.zip` ya archivados** ⭐ — el usuario confirmó (2026-08-02) que
   World Office **no** sirve para esto: él digita la factura de compra con *sus* códigos y
   la equivalencia con la FE del proveedor la hace **visualmente, en su cabeza**; nunca queda
   registrada en ninguna parte.
   **Pero el backfill no necesita World Office:** el usuario ya tiene un archivo histórico
   de `.zip`. Procesarlos en lote precarga la bandeja con **todos los códigos de proveedor
   realmente usados**, con su frecuencia y su valor acumulado. En vez de esperar meses a que
   lleguen facturas nuevas, se mapea en una sesión de trabajo, empezando por lo más
   frecuente. **La materia prima del backfill ya existe y está en su disco.**

#### Emparejamiento por "huella" — semiautomático dentro de una misma factura

Idea derivada del flujo real del usuario: para cada compra existen **dos versiones del mismo
documento**: la factura que él digita en World Office (con *sus* códigos) y el XML del
proveedor (con los *del proveedor*). Son el mismo hecho económico descrito dos veces.

Si ambas están disponibles para una misma factura, el emparejamiento **no depende de la
descripción**: la **cantidad + el precio unitario + el total de línea** funcionan como huella
digital. Si en su factura hay `TUB0510 · 20 und · $45.000` y en el XML hay
`AL-2245 · 20 und · $45.000`, es el mismo ítem con altísima probabilidad — sin importar que
uno diga "brazo hidráulico" y el otro "cierrapuertas".

Es **mucho más confiable que comparar texto**, porque los números coinciden exactamente
mientras que los nombres no coinciden nunca. Y basta hacerlo una vez por producto/proveedor.

⚠️ Viabilidad **pendiente de confirmar (§7)**: depende de si el detalle de la factura de
compra de World Office se puede obtener de alguna forma (exportar, consultar, copiar). Si no
se puede, se pierde este acelerador pero **no el backfill** (ayuda 4), que solo necesita los
`.zip`.

### 3.5 Qué pasa cuando el mismo producto vuelve a aparecer

Pregunta del usuario (2026-08-02): *"puede ocurrir que hoy me llegue una factura de un
producto y a los días me llegue otra con el mismo producto (producto muy solicitado por mí),
¿qué pasaría en ese caso?"*

**Contexto de volumen declarado: ~20 FE diarias** (≈440/mes). La repetición de productos no
es un caso excepcional: **es el caso normal**. El diseño se define por él.

| Situación | Qué hace el sistema |
|---|---|
| Producto **ya mapeado** para ese proveedor | Se reconoce solo. **No pregunta nada.** Es el premio de haber mapeado una vez |
| Mismo proveedor, mismo código, **mismo precio** | ✅ **No registra nada nuevo.** Solo actualiza `fecha_ultima_confirmacion` |
| Mismo proveedor, mismo código, **precio distinto** | 📈 Registra fila en el histórico + corre `actual → anterior_1 → anterior_2`. Esto es lo que el usuario quiere ver |
| Mismo producto, **otro proveedor** | Fila distinta en `proveedor_producto`. Es justamente la comparación que se busca (§3.1) |
| **Misma factura cargada dos veces** | ❌ Rechazada por CUFE repetido. No duplica nada |
| Código de proveedor **nunca visto** | → Bandeja de sin mapear, con `veces_visto` incrementando |

#### 🔴 La regla que hace que esto funcione

> **El histórico registra CAMBIOS de precio, no APARICIONES del producto.**

Es el punto más fácil de implementar mal y el que arruinaría la funcionalidad pedida. Si
cada factura se registrara como "precio nuevo", con 20 FE diarias y productos recurrentes,
en pocos días los dos espacios de precio anterior quedarían ocupados **por el mismo número
repetido**, y el precio realmente anterior —el único dato que el usuario quería conservar—
se habría perdido.

```
❌ Registrando cada aparición:      ✅ Registrando solo cambios:
   actual:      45.000                 actual:      45.000  (desde 02-ago)
   anterior_1:  45.000                 anterior_1:  42.000  (12-jul → 02-ago)
   anterior_2:  45.000                 anterior_2:  39.500  (03-may → 12-jul)
   ← inservible                        ← la historia real del precio
```

Efecto secundario valioso: como solo se registra cuando **cambia**, cada fila del histórico
es un evento con significado — y permite avisar *"este proveedor te subió el brazo hidráulico
un 12% respecto a la compra anterior"*.

#### 🔴 El orden lo manda la fecha de la factura, no el orden de carga

El precio vigente es el de la **factura con fecha más reciente**, no el del último archivo
procesado. Sin esta regla el backfill se autodestruye: al cargar el histórico de `.zip`
archivados, se procesarían facturas viejas **después** de las nuevas, y una factura de hace
ocho meses sobrescribiría el precio actual.

Aplica también en operación normal: una FE que llega tarde no debe pisar un precio más nuevo.

### 3.6 Unidad de medida — el caso de la perfilería

Respuesta del usuario (2026-08-02): *"la perfilería generalmente se compra por unidad que
equivale a 6 metros, pero hay casos en que solo compro cierta cantidad de metros, no el
perfil completo"*.

Esto **acota** el riesgo crítico de §6: no es que cada proveedor use una unidad distinta, es
que **el mismo producto se compra de dos maneras**:

| Forma de compra | Frecuencia | Qué factura el proveedor |
|---|---|---|
| **Tira completa** (6 m) | la normal | 1 unidad = 6 m |
| **Fracción** (x metros sueltos) | ocasional | x metros |

#### Unidad canónica: el metro

Para poder comparar, la perfilería se normaliza a **precio por metro**:

```
Proveedor A · tira 6 m · $60.000   →  $10.000 / m
Proveedor B · tira 6 m · $63.000   →  $10.500 / m
```

La pantalla mostrará **ambos**: precio por tira (como se compra) y precio por metro (como se
compara). Guardar solo el precio de la tira haría incomparable cualquier compra fraccionada.

#### 🔴 La fracción cuesta más caro… *a veces*

Confirmado por el usuario (2026-08-02): el metro fraccionado le sale más caro que la tira
completa **"sí, en algunos casos"** — no siempre.

Esa es la respuesta más incómoda posible, y **es la que define el modelo**: si el recargo
fuera constante, bastaría un factor de conversión; si nunca existiera, bastaría un solo
precio. Al depender del proveedor, del producto y de la negociación, **no hay regla que
derivar: hay que guardar los dos precios como datos independientes.**

#### Solución: la modalidad de compra forma parte de la clave

`proveedor_producto` pasa a identificarse por
**`(proveedor, producto, unidad_compra)`**, con `unidad_compra` ∈ `TIRA_6M | METRO | UNIDAD | …`

```
Proveedor A · TUB0103 · TIRA_6M  →  $60.000   ($10.000/m derivado)
Proveedor A · TUB0103 · METRO    →  $11.500/m  ← precio real fraccionado, +15 %
```

Dos filas, dos precios, **cada una con su propio histórico de 2 precios anteriores** (§3.3).
Ninguno se calcula a partir del otro.

**Regla de comparación:** el ranking de proveedores se hace **dentro de la misma modalidad**.
Nunca se mezclan en la misma tabla el precio de la tira y el del metro fraccionado — sería
comparar cosas distintas. El precio por metro *derivado* de la tira ($10.000) se muestra como
referencia, visiblemente distinguido del metro fraccionado *real* ($11.500).

**Beneficio inesperado:** teniendo ambos, el sistema puede cuantificar algo que hoy nadie
sabe — **cuánto cuesta fraccionar** ("comprar por metro te sale 15 % más caro que la tira
completa en este proveedor"). Es información de negocio, no solo un dato técnico.

#### El mapeo no se duplica

Aunque haya dos filas de precio, **el humano mapea el código una sola vez**. Si un código ya
está vinculado a un producto y luego llega facturado en otra unidad, el sistema ya sabe a qué
producto pertenece: **crea la modalidad nueva solo, sin volver a preguntar.** La equivalencia
es por `(proveedor, código)`; la modalidad solo abre una fila de precio más.

Ventaja práctica: el XML de la FE trae la **unidad de medida por línea** (`unitCode`), así que
el sistema distingue solo si la línea es tira o metros — sin que el usuario lo indique.

#### ✅ El largo de la tira es constante: 6 m para todos

Confirmado por el usuario (2026-08-02): *"todo lo que es perfilería se maneja la unidad que
es igual a 6 metros"*. **Ningún proveedor vende tiras de otro largo.**

Simplificación que habilita: `metros_por_unidad` queda como campo con **valor por defecto 6**,
sin captura manual ni verificación por proveedor. Se conserva el campo (en vez de quemar el 6
en el código) porque cuesta lo mismo y evita rehacer el modelo si algún día entra un proveedor
con otra medida — pero **nadie tendrá que llenarlo**.

La conversión tira → metro es entonces una división fija por 6, y el único dato realmente
variable sigue siendo el **precio del metro fraccionado**, que se guarda aparte (arriba).

> La modalidad `TIRA_6M` aplica solo a **perfilería**. Accesorios, cerraduras y demás se
> compran por unidad simple, y el vidrio por su propia unidad. Esto se resolverá con la
> columna de unidad de medida del Excel de inventario (§9.2), producto por producto.

#### Regla innegociable

**El sistema nunca crea un mapeo por su cuenta.** Un mapeo errado no da error: da un precio
equivocado con apariencia de dato correcto, y contamina la comparación entre proveedores
justo en la pantalla que existe para tomar la decisión de compra.

---

## 4. Reglas de negocio

_(en construcción — se irán fijando conforme el usuario las defina)_

- Un producto del catálogo puede tener **N proveedores**; un proveedor puede vender **N
  productos** (relación N:M con atributos).
- La combinación `(proveedor, producto)` es **única**: un proveedor tiene un solo precio
  vigente por producto.
- Un cambio de precio **no sobrescribe**: registra fila nueva en el histórico y corre las
  columnas denormalizadas.
- Cada precio guarda su **origen** (`MANUAL | LISTA | FACTURA`) y quién/cuándo lo registró.
- **IVA — decidido 2026-08-02:** los precios se almacenan **sin IVA (base gravable)**. La
  pantalla ofrece un **calculador de IVA del 19%** para ver el valor con impuesto.
  - El 19% es el **valor por defecto, no una constante hardcodeada**: debe ser un campo por
    producto (o por línea), porque en Colombia hay bienes y servicios **excluidos, exentos y
    con tarifas distintas**. Hardcodear 19 obliga a rehacerlo el día que entre un ítem que
    no lo sea.
  - En la ingesta por XML **no hace falta suponer nada**: el XML DIAN trae el porcentaje y
    el valor real del IVA por línea. Se toma de ahí y se guarda la base.
- Si una misma factura trae **varias líneas del mismo producto** con precios distintos, se
  toma el **precio mayor** (criterio conservador), previa normalización de unidad.
- Un cambio de precio que supere cierto **porcentaje de variación** respecto al anterior
  debe **avisar**, no registrarse en silencio: protege contra errores de digitación del
  proveedor y contra mapeos equivocados. _(umbral por definir)_
- El mapeo `(proveedor, código)` → producto interno **siempre lo confirma un humano**; el
  sistema nunca lo crea solo.
- Cada mapeo confirmado **guarda la descripción del proveedor como alias** del producto
  interno, para alimentar sugerencias futuras.
- _(pendiente)_ ¿Los precios tienen vigencia/caducidad, o el último vale indefinidamente?
- _(pendiente)_ ¿"Servicios" (templado, biselado, etc.) van en el mismo catálogo que los
  productos físicos?

**Alcance acotado (decidido 2026-08-02):** por ahora es un **consultor de precios
independiente**. No alimenta la creación de ODC, no toca el flujo de compras existente, no
modifica `ordenes_compra` ni `odc_items`. Esto reduce mucho el riesgo de regresión: se
construye *al lado* del módulo en producción, no *dentro* de él.

---

## 5. Impacto técnico

### 5.1 Base de datos

Tablas nuevas propuestas (esquema preliminar, sujeto a cierre):

**`proveedores`**
`id`, `nit`, `nombre_comercial`, `razon_social`, `contacto_nombre`, `telefono`, `email`,
`direccion`, `categorias` _(a definir: array/tabla puente)_, `notas`, `activo`,
`codigo_world_office`, `fecha_creacion`.
→ El `nit` debe ser **UNIQUE**: es la llave que permite identificar al proveedor
automáticamente desde el XML de la factura y evitar duplicados al importar de World Office.

**`proveedor_producto`** — equivalencia de códigos + precio vigente **por modalidad de compra**
`id`, `proveedor_id` (FK), `catalogo_producto_id` (FK), `codigo_proveedor`,
`descripcion_proveedor`, **`unidad_compra`** (`TIRA_6M|METRO|UNIDAD|…`),
**`metros_por_unidad`** (largo real de la tira de *ese* proveedor, §3.6), `precio_actual`,
`fecha_precio_actual`, `precio_anterior_1`, `fecha_anterior_1`, `precio_anterior_2`,
`fecha_anterior_2`, `activo`.
→ UNIQUE **`(proveedor_id, catalogo_producto_id, unidad_compra)`** — un proveedor puede tener
dos precios del mismo producto: la tira y el metro fraccionado (§3.6).
→ El mismo `codigo_proveedor` puede repetirse entre modalidades; lo que **no** puede es
apuntar a dos productos distintos: la equivalencia `(proveedor, código) → producto` es única
y se confirma una sola vez.

**`proveedor_producto_precio`** — histórico completo
`id`, `proveedor_producto_id` (FK), `precio`, `fecha_vigencia`, `origen`
(`MANUAL|LISTA|FACTURA`), `documento_ref`, `registrado_por`, `fecha_registro`.

**`proveedor_codigo_pendiente`** — bandeja de sin mapear
`id`, `proveedor_id`, `codigo_proveedor`, `descripcion_proveedor`, `precio_detectado`,
`documento_ref`, `veces_visto`, `estado` (`PENDIENTE|MAPEADO|DESCARTADO`),
`fecha_deteccion`.

**`producto_alias`** — diccionario de sinónimos (§3.4)
`id`, `catalogo_producto_id` (FK), `alias`, `origen` (`PROVEEDOR|MANUAL`), `proveedor_id`
(nullable), `fecha_registro`.

Cambios sobre tablas existentes:
- `catalogo_productos`: agregar `unidad_medida` (necesario para comparar, §6) y
  `porcentaje_iva` (default 19, ver §4); normalizar `categoria`.
- **Nada más.** Con el alcance acotado a consultor independiente, `ordenes_compra`,
  `odc_items`, `odp.proveedor_vidrio` y `pedido_pv.proveedor` **no se tocan en esta etapa**.
  Quedan anotados para una fase futura:
  - `ordenes_compra`: agregar `proveedor_id` (FK) conservando el texto durante la transición.
  - `odc_items`: agregar `precio_unitario` si la ODC ha de registrar el costo pactado.
  - `odp.proveedor_vidrio` / `pedido_pv.proveedor`: migración a FK — toca producción.

> ⚠️ Recordatorio operativo: `sync({ alter: false })` **no** agrega columnas a tablas
> existentes. Todo cambio sobre tablas ya creadas requiere script `ALTER TABLE` en
> `backend-api/src/scripts/`. Si se usa ENUM, el CHECK CONSTRAINT se recrea aparte.

### 5.2 Backend
_(pendiente — nuevo `proveedor.controller.ts` bajo `/api/proveedores`; agregar los modelos
nuevos a `models/index.ts`, a `MODELOS_AUDITADOS` y a `TABLAS_AUDITABLES` en
`root.controller.ts`)_

### 5.3 Frontend

Responde a las tres dudas planteadas por el usuario el 2026-08-02: dónde se cargan los
`.zip`, si los códigos sin relacionar tienen pestaña propia, y cómo se vincula un segundo
proveedor a un producto que ya tiene uno.

#### Ubicación — recomendación: feature propio

Dos opciones:

| | Opción | Valoración |
|---|---|---|
| **A** | Tabs nuevos dentro de `/compras` | ComprasPage ya tiene 4 tabs (SAPs, Órdenes, Perfilería, Vidrios); sumar 5 más la sobrecarga. Invita a acoplarse al flujo de compras que decidimos **no** tocar |
| **B** ⭐ | **Feature propio** `/proveedores` | Alcance independiente = módulo independiente. Permisos propios (el costo es sensible, §6). Si mañana se integra a la ODC, se integra; pero nace separado y sin riesgo de regresión |

**Recomendado: B.** Barra de tabs con el componente compartido `FolderTabs`, como el resto
del sistema.

#### Estructura de tabs

```
/proveedores
├── Consultar precios   ⭐ la pantalla que motivó todo el módulo
├── Cargar facturas        aquí se suben los .zip / XML
├── Por mapear  ⑦          la bandeja, con contador de pendientes
├── Proveedores            maestro (importación desde World Office)
└── Equivalencias          mapeos ya hechos: consultar, corregir, deshacer
```

#### Tab "Cargar facturas" — respuesta a *"¿dónde se cargan los `.zip`?"*

Zona de arrastrar-y-soltar con **selección múltiple** (~20 FE diarias, §3.2). Acepta `.zip`
y XML sueltos. Al terminar, **resumen del lote** — sin esto el usuario no sabe qué pasó con
sus 20 archivos:

```
  ✓ 18 facturas procesadas        ✓ 2 rechazadas (ya cargadas antes)
  ✓ 34 precios sin cambio         📈 6 precios actualizados
  ⚠ 5 códigos nuevos → Por mapear
```

Los precios actualizados se listan con su variación (`$42.000 → $45.000  +7,1%`), y los que
superen el umbral de §4 se marcan en rojo.

#### Tab "Por mapear" — respuesta a *"¿pestaña exclusiva?"*

**Sí, pestaña propia con contador visible** — es una bandeja de trabajo, y si vive escondida
dentro de otra pantalla nadie la atiende. Una fila por cada `(proveedor, código)` sin
vincular, **ordenada por frecuencia y valor acumulado**, no alfabéticamente (§3.4).

Tres acciones por fila:
- **Vincular** → abre el modal de abajo.
- **Descartar** → no es un producto de interés (fletes, redondeos, papelería). No vuelve a
  preguntar.
- **Crear producto nuevo** → el proveedor trae algo que **no existe en `catalogo_productos`**.
  Caso real y frecuente: debe poder resolverse ahí mismo, sin salir a otro módulo, o la
  bandeja se atasca con ítems que no se pueden mapear.

#### Modal de vinculación — respuesta a *"¿cómo vinculo un segundo proveedor?"*

**Duda del usuario:** *"si ya vinculé el código de un proveedor a mi código y luego cargo el
mismo producto con otro proveedor, ¿cómo vinculo ese código con el mío que ya tiene un
proveedor registrado?"*

> **No hay conflicto: tu código no queda "ocupado".** Vincular el Proveedor B **no reemplaza**
> al Proveedor A — **agrega una fila más** a `proveedor_producto` (§3.1). Eso *es* el
> objetivo del módulo: llegar a tener el mismo producto con varios proveedores para poder
> comparar. La operación es **exactamente igual** a la primera vez.

Y no solo no estorba: **ayuda**. El modal aprovecha lo ya mapeado para dar confianza y para
sugerir mejor.

```
┌─ Vincular código de proveedor ─────────────────────────────┐
│                                                            │
│  EL PROVEEDOR DICE          →   ¿A CUÁL DE MIS PRODUCTOS?  │
│  ─────────────────────          ─────────────────────────  │
│  Proveedor:  VIDRIOS B S.A.     🔍 [ cierra puerta______ ] │
│  Código:     CP-100                                        │
│  Descripción: CIERRA PUERTA     Sugerencias:               │
│               100KG             ● TUB0510 · Brazo hidrá... │
│  Unidad:     UND                  ↳ alias "cierrapuertas"  │
│  Precio:     $48.500 (sin IVA)    ↳ ya lo compras a:       │
│                                      Proveedor A · $45.000 │
│                                 ○ TUB0511 · Brazo aéreo    │
│                                                            │
│                              [ Cancelar ]  [ Vincular ]    │
└────────────────────────────────────────────────────────────┘
```

Dos detalles que hacen fácil el segundo mapeo:
1. **El alias aprendido del Proveedor A hace que el Proveedor B se sugiera solo.** Al mapear
   `AL-2245 · CIERRAPUERTAS HIDRAULICO`, la descripción quedó guardada como alias de
   `TUB0510` (§3.4). Cuando llega el `CP-100 · CIERRA PUERTA 100KG` del Proveedor B, el
   buscador ya reconoce esa familia de palabras. **El segundo proveedor es más fácil que el
   primero, y el tercero más que el segundo.**
2. **Mostrar "ya lo compras a: Proveedor A · $45.000" confirma visualmente que es el
   producto correcto**, y de paso el usuario ve la comparación naciendo ($48.500 vs $45.000)
   en el mismo momento de mapear.

#### Tab "Consultar precios" — la pantalla que motivó el módulo

Buscador por código, nombre **o alias** → tabla de proveedores ordenada por precio ascendente
(la tabla de §3.1), con el precio sin IVA, el **calculador del 19%**, la fecha del último
precio y los 2 anteriores con su variación.

#### Tab "Equivalencias"

Los mapeos son permanentes, así que **debe existir dónde corregirlos**: buscar por producto o
proveedor, reasignar un código mal vinculado, desvincular. Sin esta pantalla, un error de
mapeo sería irreversible desde la interfaz.

#### Pendiente
¿Qué roles ven precios de compra? El costo es información sensible (§6, §7.11).

### 5.4 Impacto en consumo del backend

Pregunta del usuario (2026-08-02): *"si tengo los .zip, ¿quién analiza los XML? ¿esto no
aumenta el consumo cotidiano del backend de forma agresiva?"*

**Respuesta corta: no, y por una razón estructural — es trabajo puntual disparado por un
humano, no trabajo recurrente.** Pero hay un riesgo real que sí hay que atender, y no es el
que parece.

#### Lo que NO se ve afectado

- **Egress de Supabase (el consumo que sí duele hoy):** el egress es tráfico **BD →
  backend**. Descomprimir y parsear es **CPU local del backend**: no lee una sola fila de
  más. Lo que toca la BD son `INSERT` de precios (escrituras pequeñas) y algunos `SELECT`
  puntuales de mapeo. **Escribir no genera egress.**
- **El `.zip` no pasa por Supabase:** viaja del navegador al backend. No entra en el
  presupuesto de egress de la BD.

#### Órdenes de magnitud

| Concepto | Estimado |
|---|---|
| Peso de un XML de FE | ~50–200 KB |
| Facturas de compra procesadas | puntual, cuando el usuario sube el `.zip` |
| Baseline de egress Supabase actual | ~50–60 MB/día |

Aun procesando varias facturas al día, el tráfico agregado queda en el orden de **1 MB/día
por una vía que ni siquiera es Supabase** — despreciable frente a lo que el sistema ya mueve.
No es un proceso que corra en cada request, ni un job periódico, ni un poll: **solo ocurre
cuando alguien sube un archivo**.

#### El riesgo real: bloqueo del event loop 🔴

El problema no es el volumen, es **cómo** se parsea. **Node.js es mono-hilo**: si se
descomprime y se parsea un XML grande de forma **síncrona**, mientras dura esa operación
**todas las demás peticiones del ERP quedan congeladas** — la ODP que alguien está
guardando, el tablero de producción, todo. Con 200 KB serían milisegundos; con un `.zip`
inesperadamente grande o un lote de backfill, se nota.

Mitigaciones a fijar en la implementación:
- Parseo **asíncrono/streaming**, nunca síncrono bloqueante.
- **Límite de tamaño** del `.zip` aceptado, con error amigable.
- El **backfill masivo** (procesar el archivo histórico completo) **no** debe correr como
  una petición HTTP: va como **script one-off** en `backend-api/src/scripts/`, fuera del
  ciclo de request, o procesando de a lotes.

#### Almacenamiento

Guardar cada `.zip` como respaldo **acumula** con el tiempo (es storage, no egress). Tres
posturas posibles — decisión pendiente (§7):
- guardar el `.zip` completo en Cloudinary (trazabilidad total, mayor costo);
- guardar **solo el XML** (mucho más liviano que el `.zip` con PDF, misma trazabilidad de datos);
- **no guardar nada** y conservar únicamente el CUFE + los datos extraídos (el usuario ya
  archiva los `.zip` por su cuenta).

---

## 6. Casos borde y riesgos

- 🔴 **Unidad de medida — el riesgo más grave para comparar precios.** Si el Proveedor A
  vende la lámina y el Proveedor B vende el m², "el más barato" que muestre la pantalla
  **será falso**. Comparar precios exige unidad normalizada y `factor_conversion` por
  proveedor. Sin esto, la funcionalidad induce a decisiones equivocadas con apariencia de
  dato duro.
- 🔴 **Mapeo errado de código = precio contaminado en silencio.** De ahí que el match
  automático solo sugiera y el humano confirme.
- 🟠 **Un mismo código de proveedor que agrupa varios productos internos** (o al revés).
  Rompe el supuesto 1:1 del mapeo. Hay que ver si ocurre en la realidad del negocio.
- 🟠 **Proveedores duplicados por tipeo** al migrar los 3 campos de texto libre existentes.
- 🟠 **Precio ≠ costo real:** flete, IVA, descuento por volumen y plazo de pago cambian cuál
  proveedor conviene. Un precio unitario aislado puede llevar a elegir mal.
- 🟡 **Visibilidad del costo por rol:** hoy `marketing` es solo lectura pero *ve* Compras.
  Los precios de compra son sensibles — definir quién puede verlos.
- 🟡 **Egress Supabase:** el listado comparativo debe resolverse con `attributes` selectivos
  y sin traer el histórico completo por fila.
- 🟡 **Precio histórico vs precio de la ODC:** si mañana la ODC guarda precio, debe guardar
  el **pactado en ese momento**, nunca leer el precio vigente al mostrarse — o las órdenes
  viejas cambiarían de valor solas.

**Específicos de la ingesta por XML:**

- 🟠 **IVA no siempre es 19%.** Hay bienes excluidos, exentos y tarifas especiales. Se toma
  el porcentaje **del XML**, no de una constante.
- 🟠 **Facturas cargadas dos veces.** Debe haber control de idempotencia por CUFE (el
  identificador único de la FE colombiana): reprocesar el mismo `.zip` no puede duplicar
  precios en el histórico.
- 🟠 **Líneas que no son productos:** fletes, descuentos globales, redondeos, notas. No
  deben caer a la bandeja como si fueran productos por mapear — de ahí el estado
  `DESCARTADO`.
- 🟠 **Notas crédito/débito.** Un XML puede ser una nota crédito que corrige una factura
  anterior. Registrar su precio como si fuera compra normal distorsiona el histórico.
- 🟡 **Precio de factura ≠ precio de lista.** Descuentos puntuales y promociones hacen que
  el precio facturado no sea el vigente general — por eso se guarda el `origen`.
- 🟡 **El `.zip` puede traer varios XML** o el XML puede ser un `AttachedDocument` con el
  `Invoice` embebido en CDATA. El parser debe manejar ambos casos, no asumir uno.
- 🔴 **Registrar apariciones en vez de cambios de precio** destruiría la funcionalidad de los
  "2 precios anteriores" en cuestión de días — ver §3.5.
- 🔴 **Procesar facturas fuera de orden cronológico** (inevitable en el backfill) haría que
  una factura vieja sobrescriba el precio actual. El vigente lo define la **fecha de la
  factura**, no el orden de carga — ver §3.5.
- ✅ **El mismo producto repetido en dos líneas de la misma factura** con precios distintos
  (lote, descuento parcial): **manda el mayor** — decidido 2026-08-02. Criterio conservador:
  nunca subestima el costo de referencia. Dos matices a respetar al implementarlo:
  - Solo se comparan líneas con la **misma unidad de medida**; con unidades distintas hay que
    normalizar antes de decidir cuál es "el mayor".
  - Tomar el mayor **amplifica un valor atípico** si el proveedor se equivocó al digitar. Se
    cubre con la alerta de variación porcentual respecto al precio anterior (§4).
  - Conviene dejar registrado en el histórico que la factura traía varias líneas del mismo
    producto, para poder auditar de dónde salió el precio.
- 🟠 **Facturas de proveedores que no interesan** (servicios públicos, papelería, arriendo)
  entrarán en el lote de 20 diarias. Debe poderse marcar un proveedor como "no seguir
  precios" para que sus facturas no ensucien la bandeja.

---

## 7. Preguntas abiertas

**Respondidas el 2026-08-02** — ver §8: origen de precios (XML del `.zip`), IVA (sin IVA +
calculador 19%), alcance (consultor independiente).

**Sobre World Office**
1. ¿En qué formato exporta World Office la lista de proveedores (Excel, CSV, otro)? ¿Trae
   NIT? — el NIT es la llave para no duplicar y para reconocer al proveedor desde el XML.
2. **"Sacar el detalle de World Office" — qué significa exactamente** (aclaración pedida por
   el usuario). No son los totales de la factura, sino **los renglones** de la factura de
   compra que él digita:

   | mi código | descripción | cantidad | precio unitario |
   |---|---|---|---|
   | `TUB0510` | Brazo hidráulico | 20 | 45.000 |

   Junto con el proveedor y el número de la factura, para poder cruzarla con su XML.
   Las vías posibles, de mejor a peor: exportar un **informe de compras a Excel**; generar
   el reporte y copiarlo; o consultar directamente la base de datos de World Office.
   **Basta con una muestra de pocas facturas para saber si el cruce funciona** — no hace
   falta el histórico completo.
   ⚠️ **Prioridad baja:** es un acelerador, no un requisito. Con 20 FE diarias, el backfill
   por XML (§3.4, ayuda 4) resuelve el mapeo por sí solo. **No vale la pena invertir mucho
   esfuerzo aquí.**
3. ¿Cuántos `.zip` históricos hay archivados y desde qué fecha? — dimensiona el backfill.

**~~Sobre el volumen~~ — RESUELTO por medición (§2.4), ya no hace falta preguntarlo**
- ~~¿Cuántos productos tiene el catálogo?~~ → **1.243 (1.212 con código)**
- ~~¿Cuántos se compran de forma recurrente?~~ → **313 códigos distintos en `odc_items`**
- ~~¿El catálogo del ERP está al día?~~ → **sí: el 96,8 % de lo comprado ya está en él**
- ~~¿Cuántos proveedores hay?~~ → **50 textos distintos, ~40 proveedores reales** tras
  unificar siglas y erratas

**~~Prioritarias~~ — RESUELTAS el 2026-08-02**
- ~~Unidad de medida~~ → perfilería se compra por **tira de 6 m**, ocasionalmente por metros
  sueltos. Modelado en **§3.6**
- ~~¿El prefijo de 3 letras sirve como categoría?~~ → **no**, la estructura se perdió con el
  tiempo. Descartado
- ~~Unificación de proveedores~~ → el usuario aportará **Excel de proveedores** (§9.1)

- ~~¿El metro fraccionado cuesta más caro?~~ → **sí, en algunos casos** (no siempre) →
  resuelto en §3.6: la modalidad de compra entra en la clave, dos precios independientes

- ~~¿Varía el largo de la tira entre proveedores?~~ → **no: 6 m para toda la perfilería** →
  `metros_por_unidad` con default 6, sin captura manual (§3.6)

**✅ No quedan preguntas prioritarias abiertas.** Las restantes son menores y no bloquean el
diseño.

**🟡 Menores (no bloquean el diseño)**

7. ¿Qué **umbral de variación porcentual** dispara la alerta de precio anómalo (§4)?
8. ¿Quiénes pueden **ver precios de compra**? Es información sensible (§6).
9. ¿Se guarda el `.zip` completo, solo el XML, o nada (solo CUFE + datos)? — ver §5.4.
10. ¿"**Servicios**" (templado, biselado) van en el mismo catálogo que los productos físicos?
11. ¿Un producto puede tener **precio por volumen** (escalonado), o un solo precio?
12. ¿Se quiere marcar un **proveedor preferido** por producto, o se decide caso a caso?
13. ¿Los precios **caducan** (un precio de hace un año sigue mostrándose como vigente) o el
    último vale indefinidamente?

---

## 8. Decisiones tomadas

| Fecha | Decisión | Motivo | Alternativas descartadas |
|-------|----------|--------|--------------------------|
| 2026-08-02 | Los precios se alimentan del **XML DIAN** contenido en el `.zip` de la FE | El usuario ya archiva el `.zip` completo (PDF + XML). El XML es estructurado y exacto: sin alucinación, sin costo de IA, sin plantilla por proveedor | **C1** parseo de texto del PDF (frágil ante cambios de formato); **C2** PDF→LLM (costo y riesgo innecesarios teniendo el XML) |
| 2026-08-02 | Precios almacenados **sin IVA** (base gravable) + calculador del 19% en pantalla | Es la base comparable entre proveedores; el IVA se deriva | Guardar con IVA incluido (haría la comparación dependiente del régimen de cada proveedor) |
| 2026-08-02 | El 19% es **campo con default**, no constante en código | En Colombia hay excluidos, exentos y tarifas distintas; el XML trae el % real por línea | Hardcodear 19% |
| 2026-08-02 | Alcance: **consultor de precios independiente** | No toca el flujo de compras en producción → riesgo de regresión bajo | Integrarlo desde ya a la creación de ODC |
| 2026-08-02 | El maestro de proveedores **se importa de World Office** | Evita captura manual y duplicados por tipeo | Capturar proveedores a mano |
| 2026-08-02 | El mapeo `(proveedor, código)` → producto **siempre lo confirma un humano**; el sistema solo sugiere | Un mapeo errado no falla: produce un precio equivocado con apariencia de dato correcto | Match automático por similitud de texto |
| 2026-08-02 | El **backfill del mapeo sale de los `.zip` ya archivados**, no de World Office | World Office no registra la equivalencia (el usuario la hace visualmente). Los `.zip` históricos sí contienen todos los códigos de proveedor realmente usados | Esperar a que lleguen facturas nuevas y mapear a goteo |
| 2026-08-02 | El **backfill masivo va como script one-off**, no como petición HTTP | Node es mono-hilo: un lote grande dentro de un request congelaría el resto del ERP | Procesar el histórico desde la interfaz web |
| 2026-08-02 | El histórico registra **cambios de precio, no apariciones** del producto | Con ~20 FE diarias y productos recurrentes, registrar cada aparición llenaría los 2 espacios de "precio anterior" con el mismo valor repetido, destruyendo el dato que se quería conservar | Una fila de histórico por cada factura procesada |
| 2026-08-02 | El precio vigente lo determina la **fecha de la factura**, no el orden de carga | El backfill procesa facturas viejas después de las nuevas; sin esta regla se sobrescribiría el precio actual con uno antiguo | Tomar siempre como vigente el último archivo procesado |
| 2026-08-02 | La ingesta acepta **`.zip` y XML sueltos**, con carga **por lote** | El usuario recibe ~20 FE/día y puede descomprimirlas dejando solo los XML | Aceptar únicamente `.zip`, de a un archivo por vez |
| 2026-08-02 | Mismo producto en **varias líneas de una misma factura** → manda el **precio mayor** | Criterio conservador: no subestima el costo de referencia para comparar proveedores | El último, el promedio ponderado, el menor |
| 2026-08-02 | UI en **feature propio `/proveedores`** con `FolderTabs`, no como tabs dentro de `/compras` | ComprasPage ya tiene 4 tabs; el alcance es independiente y los permisos son distintos (el costo es sensible) | Agregar 5 tabs a ComprasPage |
| 2026-08-02 | La bandeja de sin mapear es **tab propio con contador**, y permite **crear producto nuevo** desde ahí | Una bandeja escondida no se atiende; y si el proveedor trae algo que no existe en el catálogo, sin esa acción la bandeja se atasca | Resolver los pendientes dentro de la pantalla de carga |
| 2026-08-02 | **NO** derivar la categoría del prefijo de 3 letras del código | El usuario confirma que la estructura de códigos se perdió con el tiempo; la regla fallaría en silencio en un número desconocido de casos | Clasificación automática por prefijo |
| 2026-08-02 | Las categorías y la unidad de medida se importan de un **Excel de inventario** que aporta el usuario | Dato confiable en vez de regla adivinada; además puede resolver la unidad de los 1.212 productos de una vez | Clasificar 1.180 productos a mano; deducirlos por prefijo |
| 2026-08-02 | El maestro de proveedores se construye desde un **Excel aportado por el usuario**, no unificando los 50 textos libres | Las variantes son siglas y erratas que ninguna normalización automática une; el Excel además trae el **NIT**, llave para reconocer al proveedor desde el XML | Unificar a mano los textos de `ordenes_compra` |
| 2026-08-02 | Perfilería: **unidad canónica = metro**; se muestran precio por tira (6 m) y precio por metro | Es la única forma de comparar cuando a veces se compra la tira completa y a veces metros sueltos | Guardar solo el precio de la tira |
| 2026-08-02 | La **modalidad de compra entra en la clave**: `(proveedor, producto, unidad_compra)`. Tira y metro fraccionado son **dos precios independientes**, ninguno derivado del otro | El recargo por fraccionar existe "solo en algunos casos": no es constante ni nulo, así que no hay factor que derivar — hay que guardar el dato real | Un solo precio + factor de conversión; un recargo porcentual fijo |
| 2026-08-02 | El ranking de proveedores compara **dentro de la misma modalidad** | Mezclar precio de tira con precio de metro fraccionado compara cosas distintas y sesga la decisión | Una sola tabla de comparación con todos los precios juntos |
| 2026-08-02 | `metros_por_unidad` se conserva como campo pero con **default 6 y sin captura manual** | El usuario confirma que **toda** la perfilería se maneja en tiras de 6 m, sin variación entre proveedores. Se deja el campo porque cuesta lo mismo y evita rehacer el modelo si algún día cambia | Quemar el 6 en el código; obligar a capturarlo por proveedor |
| 2026-08-23 | **Roles con acceso al módulo `/proveedores`:** solo `root` y `admin` | Los precios de compra son información comercialmente sensible (margen, estrategia de negociación). El rol `compras` ve las ODC pero no los costos unitarios de referencia | Dar acceso a `compras`, `gerencia` u otros roles |
| 2026-08-23 | **Umbral de alerta de variación de precio: 30%, configurable** | Se almacena en `configuracion_global` como `umbral_variacion_precio_pct` (INTEGER, default 30). Si el precio nuevo supera ±30% respecto al anterior, la UI lo marca en rojo y el backend lo registra como anómalo. El umbral es editable desde `/configuracion` por `root`/`admin` sin tocar código | Hardcodear el 30%; no tener alerta; umbral fijo no configurable |

---

## 9. Insumos a entregar por el usuario

El usuario ofreció (2026-08-02) aportar dos archivos que sustituyen trabajo de adivinación
por datos confiables. **Especificación de lo que debe traer cada uno** para que sirva a la
primera.

### 9.1 Excel de proveedores

Reemplaza la unificación manual de los 50 textos libres (§2.4).

| Columna | Prioridad | Por qué |
|---|---|---|
| **NIT** | 🔴 **crítica** | Es la llave que permite **reconocer al proveedor automáticamente desde el XML** de la FE, sin que nadie lo seleccione. Sin NIT, cada factura habría que asignarla a mano |
| Razón social | 🔴 | Nombre legal, el que aparece en la factura |
| Nombre comercial / **siglas** | 🟠 | Para reconciliar con lo que ya está escrito en el ERP: si el Excel dice que `VENTANAS Y PUERTAS S.A.S` se abrevia `VyP`, la unificación se hace sola |
| Categorías que maneja | 🟠 | Requisito 2 del usuario (proveedores por categoría) |
| Teléfono · email · contacto · ciudad | 🟡 | Ficha del proveedor |

⚠️ **Advertencia:** si el Excel sale de World Office, probablemente traiga **todos los
terceros** (clientes incluidos, más servicios públicos, arriendos, papelería). Debe poderse
filtrar a proveedores de mercancía, o al menos marcar cuáles interesan para seguimiento de
precios (§6).

### 9.2 Excel de inventario por categoría

Reemplaza el atajo descartado del prefijo (§2.4) y, de paso, puede resolver la unidad de
medida de golpe.

| Columna | Prioridad | Por qué |
|---|---|---|
| **Código interno** | 🔴 **crítica** | Llave de cruce con `catalogo_productos` (1.212 códigos ya existentes) |
| **Categoría** | 🔴 | El dato que hoy falta en el 95 % del catálogo |
| **Unidad de medida** | 🔴 | Si viene, **resuelve la pregunta de la unidad para los 1.212 productos de una sola vez**, en vez de definirla familia por familia |
| Descripción | 🟠 | Para validar que el cruce por código fue correcto |
| Subcategoría | 🟡 | Si existe un segundo nivel |

**Sobre las categorías:** conviene que sean las que el usuario nombró desde el principio
(vidrio templado, vidrio crudo, accesorios, servicios, insumos) o las de su inventario real —
lo importante es que sean **una lista corta y cerrada**, no texto libre, o se repetirá el
problema actual de `catalogo_productos.categoria`.

**Verificación al importar:** cruzar los códigos del Excel contra los 1.212 del ERP y reportar
los que no coincidan en ninguna de las dos direcciones. Ese informe es en sí mismo valioso:
muestra qué está desactualizado y dónde.

---

## 10. Anexo — Organizador de facturas electrónicas (herramienta local)

> **Estado:** idea temprana (2026-08-02). Se afinará poco a poco.
> **Independiente del ERP:** no toca la base de datos, ni el backend, ni el frontend. Es una
> utilidad de escritorio que trabaja sobre carpetas locales.
> Se documenta aquí —y no aparte— porque **comparte la materia prima (los `.zip` de FE) y la
> lógica de lectura del XML** con el módulo de precios. Lo que se construya aquí se reutiliza.

### 10.1 Qué haría

Procesar una carpeta llena de `.zip` de facturas electrónicas y, por cada uno:

1. **Extraer el PDF** y guardarlo en una carpeta configurable, **renombrado** con el patrón:
   ```
   02 AGO VyP 7584569.pdf
   └──┬─┘ └┬┘ └───┬───┘
    fecha  prov.  número de la FE
   ```
2. **Archivar el `.zip`** en otra carpeta configurable.
3. *(opcional)* **Imprimir 2 copias** del PDF.

### 10.2 El punto clave: los datos salen del XML, no del PDF

**El PDF nunca se lee.** Solo se copia y se renombra. Los tres datos del nombre vienen del XML
que viaja en el mismo `.zip`:

| Parte del nombre | Origen en el XML |
|---|---|
| `02 AGO` | `cbc:IssueDate` — fecha oficial de emisión |
| `7584569` | `cbc:ID` — número de la factura |
| `VyP` | NIT del emisor → alias configurado |

Nada de OCR ni de interpretar texto: el dato es exacto por construcción. Aplica el mismo
detalle de §3.2 — el XML puede venir como `AttachedDocument` con la factura embebida en CDATA.

### 10.3 Lo único que requiere configuración: el alias del proveedor

El XML trae la **razón social completa** (`VENTANAS Y PUERTAS S.A.S`), no la sigla `VyP`. Hace
falta un archivo de equivalencias:

```
900123456  →  VyP
830456789  →  VEA
```

**Se obtiene del mismo Excel de proveedores de §9.1** (columna NIT + columna siglas). Un solo
trabajo sirve para las dos cosas.

### 10.4 Impresión de 2 copias

Windows necesita apoyarse en un lector de PDF para imprimir sin abrir ventanas:

| Opción | Invocación | Valoración |
|---|---|---|
| **SumatraPDF** ⭐ | `-print-to-default -silent` | Gratuito, portable (~10 MB), pensado para lotes. Acepta número de copias |
| Adobe Reader | `AcroRd32.exe /t` | Sirve si ya está instalado, pero a veces deja el proceso colgado |
| PowerShell puro | `Start-Process -Verb Print` | Sin instalar nada, pero usa la app asociada: puede abrir ventanas y no controla las copias |

### 10.5 Riesgos y decisiones de diseño

- 🔴 **La impresión debe ser opcional y explícita, nunca automática.** Si el script imprimiera
  siempre y algún día se corriera sobre la **carpeta histórica completa** (para renombrar lo
  viejo), saldrían cientos o miles de hojas. Renombrar y archivar: siempre. Imprimir: solo
  cuando se pida.
- 🟠 **Un fallo de impresora no puede detener el proceso.** Sin papel o impresora apagada, debe
  seguir renombrando y archivando, registrar cuáles no se imprimieron y permitir reintentar
  solo esas.
- 🟠 **`.zip` que no son facturas o vienen dañados** → carpeta de "no procesados", sin abortar
  el lote.
- 🟠 **No sobrescribir** un PDF ya existente al reprocesar.
- 🟡 **Volumen de impresión:** 20 FE/día × 2 copias ≈ **800 hojas/mes** como mínimo, más si
  alguna factura tiene varias páginas.

### 10.6 Preguntas abiertas

1. 🔴 **El nombre no lleva año** (`02 AGO`): el 2 de agosto de 2027 colisionaría con el de
   2026. ¿Se archiva en **carpetas por año/mes**, o se agrega el año al nombre?
2. ¿El número de la FE lleva **prefijo alfanumérico** (`FE-7584569`, `SETP7584569`)? El ejemplo
   dado son solo dígitos, pero la mayoría de facturas colombianas llevan prefijo de resolución
   DIAN. ¿Se conserva o se recorta?
3. ¿Se procesan también **notas crédito y débito**, o solo facturas? Comparten formato XML pero
   son documentos distintos.
4. ¿Los `.zip` se **mueven** a la carpeta de archivo o se **copian** (dejando el original)?
5. ¿Se ejecuta **a demanda** (se señala una carpeta y corre) o **vigilando** una carpeta y
   procesando lo que vaya llegando?

---

## Bitácora de captura

### 2026-08-02
- Se crea el documento.
- **Requisito 1 del usuario:** maestro de proveedores con productos por categoría, precios
  comparables entre proveedores, y conservación de los 2 precios anteriores con fecha.
- Levantada la situación actual del código: **no existe entidad proveedor**; el nombre vive
  como texto libre en 3 tablas; Compras no maneja precios en ninguna parte.
- Presentadas al usuario las opciones A/B/C para alimentar precios, con recomendación por
  fases y el hallazgo del **XML DIAN** como fuente estructurada superior al PDF.
- **Respuestas del usuario:** trabaja con **World Office** (de donde exporta proveedores);
  archiva el **`.zip` con PDF + XML** de cada FE; precios **sin IVA** con calculador del 19%;
  alcance **consultor independiente** por ahora.
- **Nuevo problema planteado:** no solo difieren los códigos, también las descripciones
  ("brazo hidráulico" vs "cierrapuertas"). Documentado en §3.4 con la observación de que el
  mapeo es un problema de **memoria** (una vez por par proveedor/código, permanente) y no de
  búsqueda, más 4 ayudas: diccionario de **alias**, sugerencia semántica por LLM, orden por
  impacto y backfill desde el histórico de World Office.
- 6 decisiones registradas en §8.

**Segunda ronda (mismo día):**
- **World Office no sirve para el backfill:** el usuario digita la factura de compra con sus
  propios códigos y la equivalencia con la FE del proveedor la hace **visualmente**; nunca
  queda registrada. → Redirigido el backfill a los **`.zip` archivados**, que sí contienen
  todos los códigos de proveedor reales (§3.4, ayuda 4). Queda abierta la precisión de si el
  detalle de la factura de compra de WO es obtenible de alguna forma, lo que habilitaría el
  **emparejamiento por huella** (cantidad + precio como llave, más confiable que el texto).
- **Duda del usuario sobre el modelo** (varios proveedores con código, descripción y precio
  distintos para un mismo producto) → resuelta con ejemplo concreto en §3.1: el código y la
  descripción del proveedor son atributos **de la relación**, no del producto.
- **Duda del usuario sobre consumo del backend** al parsear XML → analizada en §5.4: impacto
  despreciable y **no toca el egress de Supabase** (es CPU local, y escribir no genera
  egress). El riesgo real identificado es otro: **bloqueo del event loop de Node** si el
  parseo es síncrono o si el backfill corre dentro de un request.
- 8 decisiones acumuladas en §8.

**Tercera ronda (mismo día):**
- **Volumen declarado: ~20 FE diarias**, sin urgencia de tiempo real ("no los necesito de ya
  para ya"). El usuario puede descomprimir y quedarse solo con los XML. → La ingesta se
  define **por lote**, aceptando `.zip` y XML sueltos.
- **Pregunta del usuario:** qué pasa cuando el mismo producto vuelve a aparecer en otra
  factura días después. → Respondida en §3.5 con matriz de 6 casos y **dos reglas críticas**:
  el histórico registra **cambios**, no apariciones; y el precio vigente lo define la **fecha
  de la factura**, no el orden de carga (sin esto, el backfill se autodestruye).
- Aclarado en §7.2 qué significa "sacar el detalle de World Office" y **rebajada su
  prioridad**: con 20 FE diarias el backfill por XML basta, WO solo sería un acelerador.
- 11 decisiones acumuladas en §8.

**Cuarta ronda (mismo día):**
- **Decisión del usuario:** ante varias líneas del mismo producto en una misma factura,
  **manda el precio mayor**. Registrada en §8; caso borde de §6 cerrado.
- Derivada: se agrega a §4 la regla de **alerta por variación porcentual** anómala, que
  cubre el riesgo de que "tomar el mayor" amplifique un error de digitación del proveedor.
- Total: **12 decisiones**.

**Quinta ronda (mismo día) — diseño de pantallas:**
- Tres dudas del usuario sobre el flujo de uso → **§5.3 escrita completa** (estaba pendiente):
  1. *¿Dónde se cargan los `.zip`?* → tab **"Cargar facturas"** con arrastrar-y-soltar
     múltiple y resumen del lote al terminar.
  2. *¿Los códigos sin relacionar tienen pestaña exclusiva?* → **sí**, tab **"Por mapear"**
     con contador, ordenado por frecuencia/valor, con acciones Vincular / Descartar / **Crear
     producto nuevo**.
  3. *¿Cómo vinculo un segundo proveedor a un producto que ya tiene uno?* → **No hay
     conflicto**: el código propio no queda "ocupado". Vincular al Proveedor B **agrega una
     fila**, no reemplaza al A — es literalmente el objetivo del módulo. Además el **alias
     aprendido** del primer mapeo hace que el segundo proveedor se sugiera solo.
- Definida la estructura de 5 tabs en `/proveedores` y agregado el tab **"Equivalencias"**,
  necesario para poder **corregir un mapeo errado** (sin él, un error sería irreversible
  desde la interfaz).
- Total: **14 decisiones**.

**Sexta ronda (mismo día) — medición en producción:**
- Consulta read-only a Supabase para responder con datos las preguntas de volumen. Resultados
  en **§2.4**. Tres conclusiones:
  - ✅ **Riesgo mayor descartado:** `catalogo_productos` tiene **1.212 códigos** con el
    patrón esperado (`TUB0103`, `ACC0106`…) y el **96,8 % de lo que se compra ya está en él**.
    No hay que construir el catálogo: existe y está sano.
  - ✅ **El esfuerzo de mapeo es menor de lo temido:** solo **313 códigos** se compran
    realmente, no los 1.212.
  - ⚠️ **Las categorías están vacías (95 %)** y las pocas que hay son de venta, no de compra
    → el requisito 2 hoy no se puede cumplir. **Hallazgo útil:** el prefijo de 3 letras del
    código ya codifica la familia, lo que permitiría derivarlas por regla.
  - ⚠️ **Duplicados de proveedor confirmados** (`VENTANAS Y PUERTAS`/`VyP`/`VYP`;
    `VIDRIO EQUIPOS Y ACCESORIOS`/`VEA`/…): 50 textos ≈ 40 proveedores reales, y normalizar
    mayúsculas **no** los une.
- §7 reordenada: preguntas de volumen tachadas por resueltas; quedan **3 prioritarias**
  (unidad de medida, categorías, unificación de proveedores) y 7 menores.

**Séptima ronda (mismo día) — las 3 prioritarias, respondidas:**
- **Unidad de medida:** perfilería se compra por **tira de 6 m**, y ocasionalmente por metros
  sueltos. → **§3.6 nueva**: unidad canónica = **metro**, mostrando ambos precios. Detectado
  un riesgo derivado: la compra fraccionada suele costar más por metro que la tira completa,
  así que **no debe desplazar el precio de referencia**. Queda como única pregunta prioritaria.
- **Prefijo de 3 letras: descartado por el usuario** — la estructura de códigos se perdió con
  el tiempo. Se elimina el atajo de §2.4: una regla que falla en silencio es peor que no
  tenerla.
- **Proveedores e inventario: el usuario aportará dos Excel.** → **§9 nueva** con la
  especificación de columnas de cada uno, marcando el **NIT** como dato crítico (llave para
  reconocer al proveedor desde el XML) y la **unidad de medida** en el de inventario (podría
  resolver los 1.212 productos de una sola vez).
- Total: **19 decisiones**.

**Octava ronda (mismo día):**
- **El metro fraccionado cuesta más "en algunos casos"** — ni constante ni inexistente. Es la
  respuesta que obliga a guardar el dato en vez de derivarlo: **la modalidad de compra entra
  en la clave** de `proveedor_producto`, y tira y metro pasan a ser dos precios independientes
  con histórico propio (§3.6 reescrita, §5.1 actualizada).
- Aclarado que **esto no duplica el trabajo de mapeo**: el humano vincula el código una vez;
  si luego llega facturado en otra unidad, el sistema abre la modalidad solo.
- Beneficio derivado detectado: con ambos precios, el sistema puede **cuantificar el
  sobrecosto de fraccionar**, información de negocio que hoy no existe en ninguna parte.
- Nuevo caso borde: **el largo de la tira puede variar entre proveedores** (5,85 m vs 6,00 m)
  → `metros_por_unidad` se guarda por proveedor. Pendiente confirmar si ocurre.
- Total: **22 decisiones**.

**Novena ronda (mismo día):**
- **Toda la perfilería se maneja en tiras de 6 m**, sin variación entre proveedores → caso
  borde cerrado: `metros_por_unidad` con default 6, sin captura manual. La conversión
  tira→metro es una división fija; el único dato variable sigue siendo el precio del metro
  fraccionado.
- **Ya no quedan preguntas prioritarias abiertas.** El modelo de datos está cerrado; lo
  pendiente son ajustes menores (umbral de alerta, roles, retención del `.zip`) y los dos
  Excel de §9.
- Total: **22 decisiones** (una reformulada).

**Décima ronda (mismo día) — idea adicional del usuario:**
- Planteado un **organizador local de facturas electrónicas**: procesar una carpeta de `.zip`,
  extraer el PDF renombrado como `02 AGO VyP 7584569.pdf`, archivar el `.zip` aparte y
  opcionalmente imprimir 2 copias. → **§10 nueva** (anexo).
- Es una **herramienta independiente del ERP**, pero se documenta en este mismo archivo porque
  comparte los `.zip` y el parseo del XML con el módulo de precios: lo que se construya ahí se
  reutiliza. También reutiliza el Excel de proveedores (§9.1) para el alias `NIT → VyP`.
- Riesgo principal identificado: **la impresión debe ser opcional y explícita**, o correr el
  proceso sobre la carpeta histórica vaciaría la impresora.
- Estado: **idea temprana**, a afinar poco a poco. 5 preguntas abiertas en §10.6, la primera de
  ellas real: el nombre propuesto **no lleva año** y colisionaría entre 2026 y 2027.

### 2026-09-03 — Fase 3 implementada y cierre de la ayuda de alias

- **Fase 3 construida** (`POST /api/proveedores/:id/importar-precios`): lista de precios en Excel
  con detección automática de encabezados y **previsualización obligatoria** antes de escribir.
  Hasta hoy el `origen: 'LISTA'` existía en el modelo y ningún camino del código lo producía, así
  que todo el histórico venía de facturas — justo la fuente que §3.2 señala como *peor* para una
  lista de precios: la FE dice qué se pagó ese día, no qué cobra el proveedor.
  Respeta las mismas reglas de la ingesta: fecha de vigencia sobre orden de carga, retroactividad
  archivada sin desplazar el vigente, la modalidad decide qué precio se toca, y el código
  desconocido va a la bandeja con el mismo derivador `SD-<hash>` (lista y factura del mismo ítem
  caen en la misma fila). Admite listas con IVA incluido, descontándolo para guardar la base
  comparable de §4.
- **La ayuda 1 de §3.4 estaba inerte.** Los alias se guardaban en cada vinculación desde el primer
  día, pero el buscador del modal (`/api/catalogo?q=`) solo miraba código, nombre y descripción:
  nadie los leía. El mecanismo que sostiene el argumento central del diseño —*"el segundo proveedor
  es más fácil que el primero"*— no estaba operando. Ahora la búsqueda consulta `producto_alias` y
  muestra qué sinónimo trajo cada sugerencia. Va como complemento, nunca reordenando: un alias
  viejo no debe desplazar al producto que coincide por código.
- **El umbral de §4 ya es editable desde `/configuracion`**, como se había decidido el 2026-08-23.
- Queda pendiente de las fases previstas: el **backfill de los `.zip` archivados** (ayuda 4), que
  exige extraer la ingesta a un servicio compartido y sacarla del request (riesgo de §5.4).

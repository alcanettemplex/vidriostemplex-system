# TECH_DEBT.md

Deuda técnica identificada durante el desarrollo. Formato: fecha, severidad, descripción, estimación.

---

## 2026-09-22 — `npm run lint` del backend está roto: ESLint 10 con config de ESLint 8

**Severidad:** Media (DX) · **Estimación:** 1-2 h

Descubierto al intentar lintar los archivos nuevos del módulo "Ítem libre". **No lo rompió ese
cambio: estaba roto de antes** y cualquier `npm --prefix backend-api run lint` falla igual desde
que se subió ESLint.

```
ESLint: 10.0.3
ESLint couldn't find an eslint.config.(js|mjs|cjs) file.
```

Dos incompatibilidades a la vez:

1. `package.json` declara `"eslint": "^10.0.3"`, pero la configuración sigue siendo
   `backend-api/.eslintrc.json` — el formato *eslintrc* dejó de ser el default en ESLint 9 y la
   versión instalada ya no lo lee.
2. El script es `eslint src/ --ext .ts`, y `--ext` **también** se eliminó en ESLint 9: aunque se
   migrara la config, el script seguiría fallando.

Consecuencia real: **el proyecto no tiene linter operativo hoy**, ni `lint` ni `lint:fix`. La
verificación efectiva es `npm run build` (tsc), que sí corre y sí pasa — pero tsc no ve lo que veía
ESLint (variables sin usar en algunos casos, `no-explicit-any`, promesas sin await). Dado que no
hay tests automatizados fuera del Cotizador, perder el linter deja menos red de la que parece.

**Para resolverlo:** migrar a `eslint.config.js` (flat config) con `typescript-eslint` v8, mover
las reglas de `.eslintrc.json`, y cambiar el script a `eslint src/` (sin `--ext`, que en flat
config se resuelve con el campo `files`). Ojo con las reglas *type-aware*: piden
`parserOptions.projectService`, y activarlas sobre ~47 modelos y ~30 controladores va a sacar un
lote de hallazgos preexistentes que hay que decidir si se arreglan o se silencian de entrada.

Alternativa de menor esfuerzo, si no se quiere migrar ahora: fijar `eslint` en `^8.57.0` en
`devDependencies` y dejar el `.eslintrc.json` como está. Recupera el linter en minutos, a cambio de
quedarse en una versión sin soporte.

---

## 2026-09-22 — Cotizador: `nivelCorte` nulo se trata como "A" en la tabla de piezas de Calibración

**Severidad:** Baja · **Estimación:** 15 min

Encontrado al extraer `ChipNivelCorte` (`ui/index.tsx`) durante un refactor visual de
`TabCalibracion.tsx`. `PiezaCalibracion.nivelCorte` es `NivelCorte | null`, pero el ternario
original (`p.nivelCorte === 'C' ? … : p.nivelCorte === 'B' ? … : (<span>A</span>)`) caía a "A"
—el mejor caso, "todas las medidas determinadas"— para cualquier valor que no fuera literalmente
`'C'` o `'B'`, **incluido `null`**. Una pieza sin nivel calculado se pinta hoy como si su medida
estuviera determinada, en vez de mostrarse como "sin nivel" o tratarse como el caso más
conservador (C).

No se corrigió en este refactor porque era estrictamente visual (extender el sistema de diseño
del Cotizador a Calibración/Configuración/Guardadas/modales, sin tocar lógica) — se preservó el
comportamiento exacto pasando `p.nivelCorte ?? 'A'` al nuevo componente compartido, ver
`TabCalibracion.tsx` (tabla de piezas de `PanelSistema`).

**Para resolverlo:** decidir con el taller qué debe verse cuando `nivelCorte` es `null` (¿pasa
alguna vez en datos reales, o es sólo un artefacto del tipo?) y, si aplica, tratarlo como C
(bloqueado, conservador) en vez de A.

---

## 2026-09-21 — Hook de auditoría `afterUpdate`/`afterCreate`/`afterDestroy` no espera su propio INSERT

**Severidad:** Media · **Estimación:** 15 min

`registrarAuditoria()` en `backend-api/src/models/index.ts:463-472` llama
`AuditoriaLog.create(...).catch(() => {})` **sin `await`**, y los hooks que la invocan
(`afterUpdate`, `afterCreate`, `afterDestroy`, línea 475-495) tampoco devuelven esa promesa.
El comentario dice "no interrumpir la operación principal" — evita que un fallo de
auditoría tumbe la operación real, correcto — pero el efecto colateral no buscado es que
**nada garantiza que el INSERT en `auditoria_log` termine antes de que el proceso siga**.

Se detectó al marcar ODP-23891 y ODP-23857 como No Conformidad
(`scripts/marcar_nc_odp23891_23857_2026-09-21.ts`): dos `odp.update()` seguidos dentro del
mismo script, cerrando `sequelize.close()` justo después del segundo. La auditoría de la
primera ODP quedó registrada (tuvo tiempo); la de la segunda no — el `INSERT` seguía en
vuelo cuando se cerró el pool. Se reconstruyó manualmente con
`scripts/backfill_auditoria_odp62_2026-09-21.ts`.

En producción, dentro de una request normal, el riesgo es bajo (el proceso no se cierra
entre operaciones). El patrón sí es peligroso en **scripts one-off que hacen varias
escrituras auditadas seguidas y cierran la conexión al terminar** — cualquier script futuro
así puede perder auditoría de las últimas filas tocadas, en silencio (el `.catch()` no
loguea ni el script se entera). Arreglo: que los hooks `await` la promesa de
`AuditoriaLog.create()` (o que `registrarAuditoria` la devuelva y los hooks la propaguen),
envuelto igual en try/catch para no romper la operación principal ante un fallo real de
auditoría — solo se quita el fire-and-forget, no el aislamiento de errores.

---

## 2026-09-21 — Autocompletes de catálogo: el orden es alfabético, no por relevancia

**Severidad:** Baja · **Estimación:** 45 min

Detectado al reportarse que buscar `190` en *Ingresar Perfilería* no mostraba `TRA0608`
(8025 TRASLAPE 190 NEGRO). La causa inmediata era el corte silencioso del desplegable
—8 sugerencias en `IngresarPerfilModal.tsx`, 10 en `AgregarPrecioModal.tsx`— y ya está
corregida: ambos muestran hasta 50 con scroll.

Queda el problema de fondo: **el orden es el alfabético que entrega el backend**
(`catalogo.controller.ts`, `ORDER BY codigo ASC, nombre ASC` con `q`; `categoria ASC,
nombre ASC` sin `q` — y `categoria` es `null` en toda la perfilería, así que manda el
nombre). Con `190`, los cuatro primeros resultados son sillares **2190** — el dígito
buscado aparece dentro de un número mayor — y empujan hacia abajo los traslapes 190 que
sí se buscaban. Con 11 coincidencias se resuelve bajando la vista; con un término más
frecuente vuelve a ser incómodo.

Arreglo propuesto y **descartado por el usuario en su momento** (prefirió el cambio
mínimo): ordenar por relevancia —código exacto → código parcial → palabra completa en el
nombre → substring— penalizando el match embebido en un número más largo. Se puede hacer
solo en cliente (`getSuggestions`) sin tocar el backend.

Efecto colateral del fix aplicado, sin acción pendiente: subir `limit` a 50 en
`AgregarPrecioModal` hace que la segunda pasada por sinónimos de `getCatalogo`
(`limit: limite * 2`) pida hasta 100 filas de dos columnas en vez de 20, y solo cuando los
aciertos directos no llenan el cupo. Despreciable frente al baseline de egress.

---

## 2026-09-20 — Cotizador: tres cabos sueltos que dejó el cambio a propuestas y cargos

**Severidad:** Baja a Media · **Estimación:** 10 min, 1 h y 30 min respectivamente

Los tres se detectaron durante la implementación de propuestas y cargos de obra (ver
`docs/modulos/cotizador.md`). Ninguno bloquea, los tres tienen dueño claro.

**1. `resultado.areaM2` no significa lo mismo en todos los módulos.** Ventanas, proyectantes y el
camino por diseño lo devuelven **ya multiplicado por `cantidadPiezas`**; tablero y espejo devuelven
el área de **una** pieza. Consecuencia medida: con 3 piezas de 1,5 m², la sugerencia de mano de obra
da $382.500 en ventanas y $127.500 en tablero — instalar tres tableros cuesta más que instalar uno.
Como el monto es editable, no es un cobro automático equivocado, pero la sugerencia engaña.
Arreglo: normalizar `areaM2` para que todos devuelvan el área total. Toca el contrato de salida de
los 6 módulos y lo que pinta `ResultadoCalculo.tsx`. **Pendiente de decisión del usuario.**

**2. `propuesta_cargo` no guarda `tipo_obra`, solo su etiqueta legible en `descripcion`.** Para
repoblar el selector de mano de obra al reabrir una propuesta, el frontend replica
`ETIQUETA_TIPO_OBRA` de `cotizador/lib/cargos.ts` en `PanelCargosObra.tsx`. Si allá se renombra una
etiqueta, el selector abre en blanco (no rompe nada: el monto guardado se respeta). Arreglo: una
columna `tipo_obra` en la tabla. **El momento barato es antes de correr la migración**, que a fecha
de hoy sigue sin ejecutarse; después cuesta un ALTER más.

**3. ESLint no corre en `backend-api`.** La versión instalada (10.x) ya no lee `.eslintrc.*` y no
hay `eslint.config.js`, así que `npm run lint` falla antes de analizar nada — es preexistente y
ajeno a este cambio, pero significa que hoy la única verificación real es `tsc` + las suites.

---

## 2026-09-19 (2) — Cotizador: la calibración de taller quedó desactivada por decisión de negocio (no es un olvido)

**Severidad:** Media · **Estimación:** reactivar, 5 minutos; calibrar de verdad, semanas de taller

`aptitudOrden.ts` tiene `EXIGIR_SISTEMA_EN_PRODUCCION = false` desde hoy, y
`NIVELES_APTOS_PARA_CORTE` en `motorDespiece.ts` acepta B además de A. **Ambas cosas son decisiones
explícitas del usuario, tomadas con los datos a la vista** — se documentan aquí para que nadie las
lea como un descuido y las "arregle" sin contexto.

**Por qué se desactivó la condición 7.** Exigía `madurezDeSistema` en `EN_PRODUCCION`, que requiere
cobertura total de márgenes aprobados más firma del maestro. En BD hay **0 filas** en
`calibracion_margen`, `calibracion_contraste` y `calibracion_sistema`: el proceso nunca empezó, así
que la condición bloqueaba el 100 % de las órdenes de forma permanente. No era una red de seguridad,
era un candado sin llave.

**Por qué se acepta el nivel B.** Su error está **acotado en 1 mm** y la holgura de instalación
vigente es de 3 mm. El nivel C sigue bloqueado y esa diferencia no es de grado: ahí el error *crece*
con el vano (hasta 3,3 mm medidos, sin tope), porque la pieza se calcula con la recta ajustada en
vez de con un modelo entero.

**Qué se pierde:** las medidas de la orden de corte pueden desviarse ±1 mm, y el software ya no
frena un sistema cuyo corte real esté desviado. **Qué se gana:** 139 de 163 diseños pueden emitir
orden; antes, ninguno.

**Cómo revertir:** poner la constante en `true` y quitar `"B"` del Set. Las dos están comentadas en
sitio con el razonamiento completo. La maquinaria de calibración (tablas, matemática, 13 endpoints y
la pestaña Calibración) quedó intacta y operativa.

**La vía que resolvería esto de raíz, y por qué está cerrada hoy:** los 222 perfiles nivel B se
desambiguan con **una sola lectura en una medida no redonda** — la óptima, calculada por barrido, es
**903 × 601 mm** (cierra 241 de 419 piezas; con 902×701 se llega a 293). La lista de los 139 diseños
afectados está lista y los 139 están cubiertos por `fix_mapa.json`. **Bloqueador: la cuenta de
del software de origen está vencida** (`/inactivo.html` — "SUSCRIPCIÓN VENCIDA"). Con un mes de suscripción,
el scraper existente lo resuelve desatendido. Alternativa sin suscripción: el catálogo técnico del
fabricante de perfilería, que trae las cotas y permite escribir las fórmulas directamente.

---

## 2026-09-19 (3) — Cotizador: el centinela de 437 productos del catálogo — ✅ RESUELTO el mismo día

**Severidad:** Baja · **Estado:** cerrado

`pruebas_cotizador/humo.test.ts` afirmaba *"el catálogo tiene los 437 productos"* y `listarCatalogo()`
devolvía **469**. Era la única prueba en rojo de las 37.

**Causa, legítima:** los **32 códigos dados de alta el 2026-09-16** al cerrar el hueco de colores (16
con candidato único en catálogo y precio real de proveedor + 16 de Sistema3831/Sistema8025 con precio
inicial del usuario). El número quedó sin actualizar ese día.

**Comprobado antes de tocarlo:** el reparto seguía sano — 464 `CATALOGO` + 5 `ALTA` = 469, con los
126 `PROVISIONAL` **aparte**, que es exactamente lo que el centinela existe para detectar. **No hubo
contaminación.**

**Resuelto** (2026-09-19, autorizado por el usuario): número actualizado a 469 y renglón añadido con
el porqué, siguiendo la convención del propio archivo. **Suite completa en verde: 37/37.**

**La lección, que es lo que vale conservar:** el centinela estuvo tres días en rojo, y en ese estado
**dejó de vigilar** — si los 126 provisionales se hubieran colado de verdad, la prueba ya fallaba y
nadie lo habría notado. Un guardián que avisa siempre no avisa de nada. Al subir el conteo por una
razón buena, actualizar el número es parte del trabajo, no una tarea aparte.

**Sigue abierto y es del mismo tipo:** el **golden master** (`test:cotizador:golden`) está obsoleto
desde el 2026-09-11, 6 de 10 fallan por datos. Ahí la red sigue caída.

---

## ~~2026-09-19 (4) — Cotizador: el nombre del software externo volvió a aparecer en `src/`~~ — RESUELTO 2026-09-22

**Severidad:** Baja · **Estimación:** 20 min · **Resuelto el 2026-09-22**, aplicando exactamente la
solución que esta entrada prescribía (ver "Cómo se cerró" al final).

La decisión 11 del plan maestro del Cotizador dice que el nombre del software de origen **no puede
aparecer en ningún dato ni código del ERP**, y su verificación es
`grep -ri "<nombre del software de origen>" backend-api/src frontend-web/src` → **0**. Hoy da **4 archivos**, todos
introducidos el 2026-09-13 (no por el cambio de hoy, que no lo menciona en ninguno de sus 2
archivos):

- `scripts/2026-09-13_aplicar_modelos_corte.ts` — en comentarios
- `scripts/2026-09-13_importar_disenos_fase1.ts` — en comentarios y en una **ruta absoluta** a la
  carpeta del proyecto externo
- `scripts/2026-09-13_reconstruir_modelos_corte.ts` — en comentarios y ruta por defecto
- `scripts/datos_cotizador/modelos_corte.json` — en el campo `nota`, que **es un dato**, no un
  comentario: *"…observaciones reales del software de origen"*

**Matiz:** los tres `.ts` son scripts one-off ya ejecutados; el riesgo real es el JSON, porque es un
artefacto de datos que se lee en runtime durante la reconstrucción. Los comentarios de los scripts
son discutibles — la regla nació para los datos de precios provisionales — pero conviene decidirlo
de forma consciente en vez de dejar la verificación del plan maestro dando un número que ya nadie
comprueba.

**Solución:** reemplazar el nombre por "el software de origen" en el `nota` del JSON y en los
comentarios, y mover la ruta absoluta a una variable de entorno o argumento de línea de comandos.

### Cómo se cerró (2026-09-22)

Eso es literalmente lo que se hizo, más la limpieza de la documentación:

- **Los 15 usos en prosa** de los 3 scripts pasaron a "el software de origen" / "el proyecto externo
  de origen", cuidando la gramática (*"de el"* no queda en ninguno).
- **Las 3 rutas absolutas** (`C:/Users/User/Desktop/.../data/...`) salieron del código. Ahora la
  carpeta se pasa por **`COTIZADOR_DATOS_ORIGEN`** (o como argumento, en
  `reconstruir_modelos_corte.ts`), con un error explícito si falta. Detalle que la entrada original
  no señalaba: **esas rutas apuntaban al escritorio de OTRA máquina** (`C:/Users/User/...`, y esta
  máquina es `PRODUCCION`), así que llevaban tiempo sin resolver en ninguna parte — no era sólo un
  problema de nombre.
- **El campo `nota` del JSON** quedó neutralizado. Se reserializó con `json.dump(indent=2,
  ensure_ascii=False)` y el diff salió de **2 líneas**: ni un número ni una clave de los 163 diseños
  cambió. También se corrigió el generador de esa nota
  (`reconstruir_modelos_corte.ts`) para que no la vuelva a escribir con el nombre.
- **Se verificó la BASE DE DATOS**, que la entrada original no cubría: barrido `ILIKE` sobre las
  **327 columnas de texto y 22 JSONB** de los schemas `public` y `cotizador` → **0 apariciones**. El
  `nota` nunca se sembró (sólo lo escribe el script, en el archivo), y `cotizador.producto.fuente`
  —el campo que sí viaja al frontend como `fuentePrecio`— ya venía neutralizado desde la siembra
  ("referencia externa · <acabado>").
- **La documentación** (`docs/modulos/cotizador.md`, `TECH_DEBT.md`, `SESSION_LOG.md`) tenía 18 usos
  más, incluido el dominio de la aplicación externa. También se neutralizaron, y los dos comandos de
  verificación pasaron a `grep -ri "<nombre del software de origen>" …`: quien conoce el nombre puede
  correr el grep, y el repositorio deja de deletrearlo.

**Estado:** `grep -ri` en `backend-api/src` y `frontend-web/src` → **0**. En todo el repositorio → 0.

---

## 2026-09-18 (4) — `react-toastify` sigue instalado solo como fachada de los avisos

**Severidad:** Baja · **Estimación:** 1-2 h para retirarlo del todo

Desde el 2026-09-18 los avisos los pinta **Sileo** (`sileo@0.1.5`), pero las 470 llamadas repartidas
en 81 archivos se siguen escribiendo `toast.error('…')` importando `toast` de `react-toastify`.
`services/configurarNotificaciones.ts` reemplaza en caliente esos métodos y los traduce a la API de
Sileo (que recibe un objeto `{title, description, duration}` donde react-toastify recibe un texto).

**Por qué se hizo así:** migrar 470 llamadas de golpe en un sistema en producción sin tests no se
justificaba, y concentrar la traducción en un archivo tiene una ventaja que conviene no perder:
**cambiar de librería de avisos vuelve a ser cosa de ese archivo, no de los 81.** Es la red de
seguridad frente a que Sileo deje de mantenerse — hoy está en `0.1.5` y su última publicación es del
22 de febrero de 2026, siete meses atrás.

**Las dos consecuencias a tener presentes:**
1. `react-toastify` **no se puede desinstalar todavía**: los 81 archivos lo importan. Ya no renderiza
   nada (su `ToastContainer` se retiró), así que solo aporta el objeto que se intercepta y su peso
   muerto en el bundle (~30 KB de código + 17 KB de CSS sin comprimir).
2. El envoltorio depende de que ese objeto siga siendo **mutable**. Hoy lo es (no hay `Object.freeze`
   en la v11.0.5, verificado). Si una versión futura lo congelara, **los avisos dejarían de salir**
   —no habría error, simplemente nada—, así que conviene no actualizar react-toastify sin probar
   que siguen apareciendo.

**Salida limpia:** crear `utils/avisos.ts` que exporte el `toast` ya adaptado, cambiar el import en
los 81 archivos (una línea cada uno, mecánico) y desinstalar `react-toastify`. Eso elimina las dos
consecuencias de arriba de una vez.

### Contraste de los tonos de estado de Sileo — tres siguen por debajo de AA

Los cuatro colores con que Sileo pinta el título, el icono y el botón de cada aviso fallan el
contraste mínimo de WCAG AA (4.5:1) sobre la píldora clara. Medidos el 2026-09-18:

| Estado | Tono de Sileo | Contraste | Tono que cumpliría |
|---|---|---|---|
| Aviso | `oklch(0.795 0.184 86.047)` → `#f0b100` | **1.91:1** | `#a56800` (4.57:1) — **corregido** |
| Verde | `oklch(0.723 0.219 142.136)` → `#3ac530` | 2.27:1 | `#008a00` (4.51:1) |
| Azul | `oklch(0.685 0.169 237.323)` → `#00a6f4` | 2.71:1 | `#007bc6` (4.52:1) |
| Rojo | `oklch(0.637 0.237 25.331)` → `#fb2c36` | 3.82:1 | `#eb0e28` (4.54:1) |

**Solo se corrigió el ámbar** (`styles/avisos.css` redefine `--sileo-state-warning` bajando la
luminosidad de 0.795 a 0.565, conservando croma y matiz). Decisión del usuario: era el único
verdaderamente ilegible, y apagar los otros tres desvirtuaría el diseño por el que se eligió esta
librería — el título es además una palabra corta y previsible (*Guardado*, *Error*) acompañada de un
icono, mientras que el mensaje que de verdad hay que leer va en blanco sobre `#1a1a1a` con 17:1.

Si alguna vez el ERP se audita por accesibilidad, estos tres tonos son un hallazgo conocido y la
columna de la derecha ya trae el reemplazo calculado.

### Nota sobre la dependencia nueva

`sileo` entró el 2026-09-18 para reemplazar un componente propio (`AvisoIsla.tsx`, ~180 líneas más
la geometría SVG en CSS) que replicaba su diseño a mano y no convenció. Verificado antes de
instalar: MIT, repositorio y autor coinciden con los del sitio oficial, `peerDependencies: react >=18`
(compatible con el React 19 del proyecto), y no añadió ninguna vulnerabilidad al `npm audit`
(siguen siendo 29, todas de la cadena de `react-scripts`). Arrastra `motion@12`, que comparte núcleo
con el `framer-motion@12.35.0` ya instalado, así que el peso añadido es marginal.

---

## 2026-09-18 (2) — Warnings de ESLint del frontend: 133 `no-unused-vars` saldados, 23 `exhaustive-deps` pendientes

**Severidad:** Baja (lo saldado) · Media (lo pendiente) · **Estimación:** 2-3 h revisar los `exhaustive-deps`

El `npm start` del frontend compilaba con ~156 warnings acumulados. Se limpiaron todos los
`@typescript-eslint/no-unused-vars` (133); quedan vivos **23 `react-hooks/exhaustive-deps`** y
**1 `no-mixed-operators`** (`LeadDetalleModal.tsx:188`).

**Por qué los `exhaustive-deps` no se tocaron:** cada uno exige criterio, no limpieza mecánica.
Un `useEffect` al que le falta una dependencia puede estar así **a propósito** —para que corra solo
al montar y no en cada render que recrea la función— y agregarla a ciegas provoca loops infinitos
de render. Son 23 decisiones individuales, cada una con su prueba manual; el fix masivo es
justamente el camino que rompe cosas. Concentrados en: `ComprasPage` (4, todos por `headers`),
`PedidosPVPage`, `ProduccionPage`, `ContabilidadPage`, `ConfiguracionPage`, `ODPTabProduccion`,
`ReportarProblemaForm`. Vale la pena mirarlos si alguna vez se reporta "esto a veces no se
actualiza" en esas pantallas: el síntoma típico de una dependencia faltante es una función que
sigue viendo el valor viejo de una variable (closure obsoleto).

**Lo que sí se resolvió (2026-09-18), y tres hallazgos que no eran cosméticos:**

1. **119 imports sobrantes** en 25 archivos. Eliminados con un script AST-guiado
   (`typescript` como parser, borrado por rangos textuales exactos) para no reformatear los
   imports multilínea. **Trampa encontrada:** al borrar varios specifiers *consecutivos al final*
   de un import (`{ A, B, C }` quitando B y C), los rangos de borrado se solapan y se llevan por
   delante el `}` de cierre — rompió 5 archivos en el primer intento. La corrección fue anclar el
   borrado del último specifier al anterior **que sobrevive**, más fusionar rangos solapados antes
   de aplicarlos. `tsc --noEmit` detectó el daño de inmediato: es la verificación que hace segura
   una limpieza masiva de imports.
2. **`InstaladorView.tsx` hacía una petición HTTP desperdiciada.** `abrirDocumentoConDetSap`
   llamaba a `GET /api/detalle-sap-imagenes?odp_id=...` y **descartaba la respuesta**: el documento
   que imprime sale de `document.getElementById('print-det-sap-<id>').innerHTML`, un nodo ya
   renderizado. Cada apertura de Det. SAP por un instalador gastaba una ida al backend para nada.
   Llamada eliminada (no solo el destructuring, que habría callado a ESLint dejando vivo el
   desperdicio). Relevante para el frente de egress.
3. **`ComprasPage.tsx` tenía una cadena de estado muerta.** `cargarItemsDetalle` (~16 líneas) no la
   invocaba nadie, y era la única que llamaba a `setItemsDetalle` — de modo que `itemsDetalle` ya
   era permanentemente `null` y la línea `const listaItems = itemsDetalle ?? odc.items` **ya
   resolvía siempre a `odc.items`**. Se eliminó el bloque completo (función + los dos `useState` +
   la constante `ESTADO_COMPRA_STYLE`) y se simplificó el consumo. Sin cambio de comportamiento.
4. **`KanbanBoard.tsx`: 164 líneas de código muerto.** `renderKanban` (la "Vista Kanban Colapsable
   (Propuesta 4)") no se invocaba en ningún lado. Al eliminarla quedaron huérfanos su estado
   `collapsed`/`setCollapsed`, `toggleCollapse` y 5 imports, todos removidos en la misma pasada.
   Queda en el historial de git si algún día se retoma esa propuesta.

**Riesgo residual:** el único cambio con efecto observable es el punto 2 (Det. SAP en la vista de
instalador). El resto es código que nadie ejecutaba.

---

## 2026-09-18 (3) — `npm run build` del frontend no corre en Windows

**Severidad:** Baja (no afecta producción) · **Estimación:** 15 min

El script es `CI=false react-scripts build && cp build/index.html build/404.html`: sintaxis de
shell Unix que **cmd.exe no entiende**. npm ejecuta los scripts con cmd en Windows, así que el
comando muere en la primera palabra —`"CI" no se reconoce como un comando interno o externo`— y
`cp` tampoco existe ahí. Descubierto el 2026-09-18 al intentar verificar un cambio con el build
real.

**No afecta el despliegue:** Cloudflare Pages construye en Linux, donde la línea es válida. El
impacto es solo local: en Windows no se puede comprobar que un cambio compile en modo producción
sin rodearlo a mano (`CI=false node node_modules/react-scripts/scripts/build.js` desde Git Bash,
que sí acepta la asignación inline).

**Alternativas, ninguna aplicada todavía porque implican decisión:**
- `cross-env` como devDependency (`cross-env CI=false react-scripts build`) — es la solución
  estándar, pero agrega una dependencia.
- Mover `CI=false` a un `.env` del frontend y dejar el script sin prefijo de variable.
- Reemplazar el `cp` por `node -e "require('fs').copyFileSync(...)"`, que funciona en ambos SO.

---

## 2026-09-18 — `xlsx` (SheetJS) en frontend-web sin parche disponible en npm

**Severidad:** Alta según el advisory de npm, pero mitigada por contexto de uso · **Estimación:** N/A (sin fix), migrar a `exceljs` ~1-2 días si algún día se decide

`npm audit` (tras el pull del 2026-09-18) marca `xlsx` como vulnerable a Prototype Pollution
(GHSA-4r6h-8v6p-xvw6) y ReDoS (GHSA-5pgg-2g8v-p4x9), sin fix disponible en el registro de npm — el
mantenedor de SheetJS dejó de publicar parches ahí y solo los sube a su propio CDN
(`cdn.sheetjs.com`). Es dependencia directa de `frontend-web/package.json` (`^0.18.5`).

**Decisión del usuario (2026-09-18):** dejarlo así por ahora. El vector de explotación real es un
archivo `.xlsx` armado a propósito para el import/export de Excel del frontend (módulo
Proveedores); hoy **solo el usuario mismo sube esos archivos**, así que el riesgo práctico es bajo.
No se toma acción salvo que cambie quién puede subir Excel al sistema (por ejemplo, si se abriera
esa función a otros roles o a clientes).

**Alternativas descartadas por ahora:**
- Migrar a `exceljs` (ya se usa en el backend para las plantillas de PedidoPV) — unificaría la
  librería Excel del monorepo, pero implica reescribir el código de import/export del frontend.
- Apuntar a la fuente propia de SheetJS (CDN del fabricante) en vez del paquete de npm — fuente de
  instalación no estándar para un `package.json`.

Nota aparte: en el mismo `npm audit fix` (sin `--force`) se corrigió `axios` (1.13.2 → resuelto en
1.20.0 dentro del mismo rango `^1.x`, sin cambios de código) — de 67 vulnerabilidades bajó a 29, las
29 restantes son toolchain de `react-scripts`/CRA (jest, webpack-dev-server, svgo, etc.), no código
que se sirve en producción; arreglarlas de raíz requeriría `--force` y un downgrade/breaking change
de `react-scripts`, evaluado y descartado por ahora (bajo beneficio real, alto riesgo de romper el
build).

---

## 2026-09-16 (2) — Cotizador: el recálculo de precios por categoría no termina a tiempo para PERFILERIA (N+1 contra Supabase) — ✅ RESUELTO 2026-09-17

**Severidad:** Alta para PERFILERIA (hoy no se puede usar en producción) · Media para el resto · **Estimación:** 3-4 h

**✅ Resuelto el 2026-09-17** con los pasos 1 y 2 de la solución propuesta más abajo (el 3 —trabajo
asíncrono— sigue sin hacer falta). El motor pasó a ser
`recalcularCostosDesdeProveedor(ids[])`: 3 lecturas fijas (productos, candidatos de proveedor y
**los multiplicadores, ahora fuera del bucle**) sin importar cuántos ids entren, y una sola
transacción de escritura con dos sentencias — un `UPDATE ... FROM unnest()` de 5 arrays paralelos
(Sequelize no sabe actualizar N filas con N valores distintos en una sentencia) más un
`bulkCreate` del histórico. `recalcularCostoDesdeProveedor(id)` queda como envoltorio delgado, con
el contrato original intacto (`null` si el id no tiene productos vinculados), así que ni la cola de
sincronización ni el script one-off del 2026-09-14 cambian de comportamiento. La cola conserva a
propósito su bucle por id: aísla el fallo de un id para que no tumbe al resto del lote.

**A/B medido contra el algoritmo anterior (dry_run, backend local contra el pooler):**

| Categoría | ids | Antes | Ahora | Aceleración | Resultado |
|---|---|---|---|---|---|
| ACCESORIO | 169 | 51,5 s | 0,46 s | 112× | idéntico: mismos 48 códigos y mismos valores |
| PERFILERIA | 296 | **96,7 s** | 0,46 s | 208× | idéntico: 0 cambios, 305 omitidos |

El número real de PERFILERIA (96,7 s) resultó **más bajo que los ~142 s proyectados pero igual de
pegado al corte de 100 s** — el riesgo era real, con menos margen del que parecía. Los 48 cambios
de ACCESORIO no contradicen los 45 medidos el 2026-09-16: el algoritmo viejo también dice 48 hoy,
es dato que cambió en el medio.

**Dos diferencias de comportamiento, ambas deliberadas:**
1. `dryRun` ya no abre transacción. Antes escribía y hacía rollback (4 viajes por producto para
   descartarlo todo); ahora la previsualización sale entera del cálculo en memoria. Se pierde la
   validación incidental de que el UPDATE fuera aceptable — se verificó aparte, ejecutando la
   sentencia `unnest` real dentro de una transacción revertida.
2. La corrida de una categoría entera va en **una sola transacción**: todo o nada. Para una acción
   masiva y explícita es la semántica segura, y es justamente lo que faltaba frente al 524 de
   Cloudflare, donde el corte llegaba después de escrituras ya confirmadas.

**Sigue pendiente, y es lo que hoy bloquea de verdad a PERFILERIA:** la categoría no tiene fila en
`cotizador.multiplicador_categoria`, así que el endpoint corta con 400 antes del bucle. El
rendimiento ya no es el obstáculo; el multiplicador verificado sí (ver 2026-09-14).

---

**Descripción original del problema, conservada como registro:**

**Descripción:** `POST /api/cotizador/multiplicadores/:categoria/recalcular` (controller
`cotizador_multiplicadores.controller.ts`, botón "Recalcular" de la nueva pestaña Configuración)
recorre los productos de la categoría llamando a `recalcularCostoDesdeProveedor(id)` **una vez por
cada `catalogo_producto_id` distinto**. Ese motor (`cotizador/lib/sincronizacionProveedores.ts`)
está escrito para el caso de uso para el que nació —la cola de sincronización, que lo invoca con
un puñado de ids tras cargar una factura—, no para barrer una categoría entera. Cada id cuesta
como mínimo dos viajes a la BD (`CotizadorProducto.findAll` + `ProveedorProducto.findAll` con
`include` de Proveedor) y **dentro del bucle de productos hay un tercero**:
`CotizadorMultiplicadorCategoria.findByPk(categoria)`, que vuelve a traer siempre la misma fila.

**Medición real (2026-09-16, backend local contra el pooler de Supabase, `dry_run=true`):**

| Categoría | Productos | Vinculados | ids distintos | Viajes a BD | Tiempo |
|---|---|---|---|---|---|
| ACCESORIO | 175 | 172 | 169 | ~510 | **81,2 s medidos** |
| PERFILERIA | 363 | 304 | 296 | ~896 | **~142 s proyectados** |
| VIDRIO | 40 | 39 | 38 | ~115 | ~18 s |
| ACABADO | 17 | 15 | 14 | ~44 | ~7 s |

Da ~160 ms por viaje, que es sencillamente la latencia de ida y vuelta al pooler: no hay una
consulta lenta que optimizar, hay demasiadas consultas. El `dry_run` es además el caso **barato**
— la corrida real suma un UPDATE por producto que cambia (45 en ACCESORIO; hasta 304 en
PERFILERIA).

**Por qué bloquea producción:** si el backend se sirve detrás del proxy de Cloudflare, el límite
de 100 s por request (error 524) corta la conexión antes de que PERFILERIA responda —y lo hace
*después* de que el backend ya escribió, porque el corte es del proxy, no del servidor: el usuario
ve un error y la BD quedó modificada. **Confirmar primero si el registro DNS del backend está
proxiado**; si está en gris (DNS only) el límite no aplica y el riesgo baja a un timeout de
navegador. Hoy el frontend no declara `timeout` en Axios, así que en local simplemente espera los
81 s con el botón en "Recalculando…" — funciona, pero es una espera sin barra de progreso ni
forma de cancelar.

**Solución propuesta, en orden de relación costo/beneficio:**
1. **Sacar el `findByPk` del multiplicador fuera del bucle** (es una fila por categoría, constante
   durante toda la corrida). Elimina ~304 viajes en PERFILERIA, ~34 % del total. 15 minutos.
2. **Variante batch de `recalcularCostoDesdeProveedor`**: una sola consulta `WHERE
   catalogo_producto_id IN (:ids)` para productos y otra para candidatos de proveedor, agrupar en
   memoria y resolver el "proveedor más barato que sigue precios" ahí. Pasa de ~896 viajes a ~3, o
   sea de minutos a segundos. **Mantener la función por-id como envoltorio delgado sobre la batch**
   para no alterar el comportamiento de la cola de sincronización, que es el consumidor existente
   y ya está probado.
3. Solo si después de (1) y (2) sigue sin caber en el presupuesto de tiempo: convertirlo en trabajo
   asíncrono (job + consulta de estado). No hacerlo antes — agrega infraestructura para esconder un
   problema que es puramente de cantidad de consultas.

**Nota relacionada, pendiente de decisión del usuario:** la previsualización de ACCESORIO
(2026-09-16) muestra 45 productos que cambiarían, varios con caídas fuertes (`TSL0101` −73 %,
`PPD1101` −34 %, `SIL0002` −33 %). Antes de aplicar cualquier recálculo masivo conviene revisar si
esas caídas son reales o son otro desajuste de unidad tira/metro como el que apareció en
perfilería el mismo día. No se aplicó ningún recálculo: todo quedó en `dry_run`.

---

## 2026-09-17 — Cotizador: dos productos sin forma de costearse automáticamente (mapeo o unidad irreconciliables)

**Severidad:** Media · **Estimación:** decisión de negocio + 30 min de dato

**Descripción:** al sembrar los multiplicadores y recalcular (ver `SESSION_LOG.md` 2026-09-17 (2)),
dos productos quedaron **excluidos a mano** del recálculo porque el motor no puede derivar su costo
sin inventar un supuesto:

- **`TEN0101` "TENSORES"** (`catalogo_producto_id` 989) — el Cotizador vende un tensor por unidad;
  el proveedor (Mundial de Tornillos) vende *"VARILLA ROSCADA UNC 5/16"* por metro a $3.479. Las
  dos unidades son correctas: **falta el factor de consumo** (cuántos metros de varilla lleva un
  tensor). Eso es lista de materiales, no una unidad mal escrita. Tomarlo tal cual dejaría el costo
  en $3.479 contra los $6.250 actuales (−44 %).
- **`BOQN03`** (`catalogo_producto_id` 1308) — el Cotizador dice *"BOQUETE TAQUILLA"*, el maestro
  dice *"BOQUETE ESPECIAL PERIMETRAL"* y el proveedor (Vitelsa) dice *"BOQUETE MICKEY MOUSE"*. Son
  tres cosas distintas. **No está claro de qué lado está el error**: puede ser el
  `catalogo_producto_id` del producto del Cotizador, o la fila de `proveedor_producto`. Por eso no
  se tocó ninguno de los dos lados — desactivar la fila equivocada rompería un precio válido.

**⚠️ La exclusión fue sólo de esa corrida.** Ninguno de los dos quedó marcado en la BD, así que
**la sincronización automática puede moverlos en cuanto Compras cargue una factura que los toque**.
No hay hoy ninguna forma de decir "este producto no se costea solo" sin desactivar la equivalencia
entera.

**Solución a evaluar:** (a) resolver el mapeo de `BOQN03` con el usuario y corregir el lado que
corresponda; (b) para `TEN0101`, o bien registrar el factor de consumo, o bien aceptar que es un
producto fabricado y desvincularlo del maestro con `catalogo_producto_id = NULL`, que es el
precedente ya aceptado para los 5 "Kit Aluminio" (ver 2026-09-16); (c) si el caso se repite,
evaluar una marca explícita de "no costear automáticamente" en `cotizador.producto`, que hoy no
existe.

**Nota aparte, sin resolver:** dos productos recalculados saltaron muchísimo sin explicación de
unidad — `ROD8025` +502,3 % (factor 6,02 exacto entre costo viejo y nuevo, ¿el proveedor lo vende
por paquete de 6?) y `TZO0301` +405,8 % (factor 5,06). Las unidades de ambos lados dicen UNIDAD y
coinciden, así que el motor hizo lo correcto; queda la duda de si el dato del proveedor es el que
está mal. El usuario decidió aplicar el recálculo de todos modos; el `antes` de cada uno está en
`cotizador.precio_historial`.

---

## 2026-09-16 — Cotizador: 5 "Kit Aluminio" (`K1000`...`K2000`) sin costeo real, precio calculado a mano

**Severidad:** Media · **Estimación:** depende de tener precios reales de perfilería por sistema, no es solo código

**Descripción:** dentro de la reconciliación de códigos huérfanos del Cotizador (Fase 1/2, ver `SESSION_LOG.md` 2026-09-14/16), `K1000`, `K1200`, `K1300`, `K1500` y `K2000` ("Kit Aluminio hasta 1000mm", "de 1001 a 1200mm", etc.) quedaron confirmados como huérfanos permanentes — no se homologan a `catalogo_productos` porque no representan un código de compra real, sino un **cálculo interno** que agrupa el costo de perfilería de un sistema por rango de tamaño. Decisión del usuario (2026-09-16): "son un cálculo, pero dejalo documentado, ya que el cálculo lo sacaremos con los precios reales de los perfiles".

**Impacto:** el costo/precio de estos 5 códigos en `cotizador.producto` sigue siendo el que se cargó a mano (no viene de `proveedor_producto` como el resto de PERFILERIA vinculada a catálogo), así que no se beneficia de `sincronizacionProveedores.ts` ni de ningún ajuste automático de precio de proveedor.

**Solución pendiente:** cuando se tengan los precios reales de los perfiles que componen cada rango (probablemente vía el mismo mecanismo que usa `motorDespiece.ts` para el despiece), recalcular estos 5 kits como una suma/fórmula sobre productos ya vinculados a catálogo, en vez de un precio manual fijo. No se tocó código en esta pasada — solo se documentó y se dejaron `catalogo_producto_id = NULL` a propósito.

---

## 2026-09-14 (2) — `catalogo_productos.codigo` sin UNIQUE/NOT NULL real en la BD (drift modelo↔esquema)

**Severidad:** Media · **Estimación:** 1-2 h, pero exige primero resolver las filas que ya rompen el constraint

**Descripción:** `catalogo_producto.model.ts` declara `codigo: { unique: true, allowNull: false }`, pero la tabla real en Postgres no tiene ningún `UNIQUE` ni `NOT NULL` sobre esa columna — es puro contrato de Sequelize, nunca se materializó en la BD (probablemente porque `sequelize.sync({ alter: false })` nunca altera tablas existentes, ver nota de `server.ts` en este mismo documento). Verificado el 2026-09-14 durante la integración Cotizador↔Catálogo↔Proveedores:

- **31 filas con `codigo IS NULL`** en las 1.257 actuales.
- Sin `UNIQUE`, nada impide un `codigo` duplicado — no se encontró ninguno hoy, pero tampoco hay nada que lo evite mañana.

**Por qué importa ahora:** la migración `2026-09-14_cotizador_vinculo_catalogo_maestro.ts` vincula `cotizador.producto` a `catalogo_productos` por `codigo` exacto, y el script tuvo que blindarse a mano contra un eventual duplicado (excluye del backfill automático cualquier código repetido y lo deja listado en el log) precisamente porque el constraint que debería impedirlo no existe. Cualquier futuro script que asuma `codigo` único en `catalogo_productos` hereda el mismo riesgo si no hace la misma verificación.

**Solución a evaluar:** antes de poder agregar `ALTER TABLE catalogo_productos ADD CONSTRAINT ... UNIQUE (codigo)`, hay que decidir qué hacer con las 31 filas `codigo IS NULL` (¿dejarlas fuera del constraint con un índice `UNIQUE ... WHERE codigo IS NOT NULL`, o asignarles código?) — no se tocó en esta pasada, es decisión de negocio, no solo de esquema.

## 2026-09-14 — Multiplicador PERFILERIA/VIDRIO sin verificar: el sync automático de costo solo cubre ACCESORIO — ✅ RESUELTO 2026-09-17

**Severidad:** Media · **Estimación:** verificación con taller/datos reales, no es trabajo de código puro

**✅ Resuelto el 2026-09-17.** El usuario aportó la tabla de multiplicadores por categoría y se
verificó contra los datos ya cargados (método `precio_pa / costo_unitario`, el mismo de ACCESORIO):
la tabla resultó ser **el valor observado redondeado a 3 decimales**, así que se sembraron los 6
decimales reales — ACABADO 1,534301/1,412297/1,290293 (12 de 14 productos), VIDRIO
1,672800/1,586582/1,500364 (35 de 37), ACCESORIO 1,550628/1,440712/1,330796 (166 de 169, ya
existía), PERFILERIA 1,561841/1,474123/1,386405 (221 de 363). Usar los 3 decimales habría
reescrito ~12 precios de más por puro ruido de redondeo. Script
`2026-09-17_cotizador_multiplicadores_y_unidades.ts`, ejecutado. Detalle en `SESSION_LOG.md`
2026-09-17 (2).

**Sobre el riesgo tira/metro que este mismo apartado señalaba:** se verificó y **existía**. Siete
productos tenían la unidad del Cotizador y la del proveedor en desacuerdo, y uno más (`ZSE0104`)
tenía mal la unidad del propio proveedor. Tres se corrigieron con evidencia, dos quedaron fuera del
costeo automático y tres eran ruido sin impacto. Ver 2026-09-17 más abajo.

**El residuo se cerró el mismo día.** Los 116 productos de PERFILERIA que seguían en el
multiplicador viejo (1,514500) no tenían proveedor con precio, así que el recálculo por proveedor
no los alcanzaba. Se resolvió agregando una **segunda fase** al recálculo que conserva el costo y
sólo realinea PA/PM/PB (`realinearPreciosAlMultiplicador`): hoy los 363 productos de PERFILERIA
están en 1,561841 y la desalineación restante es **0 en las cuatro categorías**. Sólo quedan fuera
los 11 productos con costo en cero (ACCESORIO 6, ACABADO 3, VIDRIO 2), omitidos a propósito.
Ver `SESSION_LOG.md` 2026-09-17 (3) y (4).

**Descripción:** `cotizador.multiplicador_categoria` (tabla nueva del 2026-09-14, ver plan de integración Cotizador↔Catálogo↔Proveedores) solo tiene sembrada la fila `ACCESORIO` (×1.550628/×1.440712/×1.330796, verificado contra 18+ productos reales). Las otras dos categorías del Cotizador —**PERFILERIA (205 productos, el grupo dominante) y VIDRIO (35 productos)**— quedaron deliberadamente sin fila: SESSION_LOG (2026-09-12) menciona un multiplicador aproximado (~×1.56 y ~×1.67 respectivamente) pero nunca se verificó a 6 decimales contra datos reales como sí se hizo con ACCESORIO.

**Impacto:** el motor de sincronización automática con Proveedores (`cotizador/lib/sincronizacionProveedores.ts`) omite cualquier producto de esas dos categorías con el motivo "sin multiplicador verificado para esta categoría" — es un `omitido`, no un error, pero significa que **hoy la sincronización automática solo puede mover precios de la porción ACCESORIO del catálogo**, aunque un producto de PERFILERIA o VIDRIO ya esté vinculado a `catalogo_productos` y tenga proveedor con precio real.

**Riesgo adicional a resolver junto con esto:** para PERFILERIA, buena parte de los productos se compran por `TIRA_6M` (el motor ya deriva costo por metro dividiendo entre `metros_por_unidad`), pero no está verificado que `cotizador.producto.unidad` sea consistentemente "por metro" en ese universo — verificar esa correspondencia es parte del mismo trabajo antes de dar de alta la fila.

**Solución:** confirmar los dos multiplicadores contra una muestra real de productos ya cargados (mismo método que se usó para ACCESORIO: `precio_pa / costo_unitario`, `precio_pm / costo_unitario`, `precio_pb / costo_unitario` sobre productos reales de cada categoría) e insertar las filas en `cotizador.multiplicador_categoria` — un solo INSERT por categoría, sin script nuevo.

---

## 2026-09-13 — Cotizador: el módulo de calibración está a medio construir (sólo lectura, sin capa de escritura)

**Severidad:** Media/Alta (funcionalidad central pendiente, no es un bug) · **Estimación:** varios días + insumo del taller

**Descripción:**
`cotizador/lib/aptitudOrden.ts` bloquea la impresión de una orden de corte definitiva y, en tres de sus ocho condiciones, remite al usuario a la ruta `/calibracion` para resolverlo. **Esa vía no existe.** Verificado en todo el repo:

- ✅ **Existen** las tablas (`cotizador.calibracion_sistema` / `margen` / `holgura` / `contraste` / `historial`), la matemática (`cotizador/lib/calibracion.ts` — análisis de pieza, propuesta de margen, holgura, madurez de sistema) y los **getters de lectura** (`cotizador/store/calibracionStore.ts` → `cache.cargarCalibracion()`, que sólo carga filas `vigente`).
- ❌ **Faltan** el controller de escritura (`cotizador_calibracion.controller.ts` — lo menciona un comentario en `calibracionStore.ts` como si existiera, pero **no está en el repo**), las rutas `/calibracion` en `routes/cotizador.routes.ts` (no hay ninguna), y la pantalla de calibración en `frontend-web` (grep sin resultados).

**Impacto:** `calibracion_sistema` arranca vacío y el `defaultValue` del modelo es `EN_CALIBRACION`, así que **todos los sistemas quedan EN_CALIBRACION sin forma de sacarlos**. Ninguna cotización con diseño puede emitir orden de corte. El semáforo de `aptitudOrden` es correcto y conservador (bloquea de más, nunca de menos), pero la herramienta que levanta el bloqueo no está terminada. La única vía hoy es escribir filas a mano en Supabase.

**Verificado con la cotización #5 (2026-09-13):** ítem de ventanas con diseño `Sistema5020::OX`, sistema `Sistema5020` en `EN_CALIBRACION`, inventario de 9 piezas (8 perfiles + vidrio), **0 contrastes, 0 márgenes** → "0 de 9 piezas calibradas". Los tres mensajes de ese ítem tienen esa raíz única.

**Qué falta** (las 10 funciones de escritura que `calibracionStore.ts` da por reimplementadas): registrar/anular contrastes del maestro, aprobar/anular márgenes, fijar holguras, cambiar el estado de un sistema, firma del maestro e historial. Backend en transacción siguiendo el patrón de los demás controllers del cotizador (`requireRole('root','admin')`), más la pantalla `/calibracion` (registro de contrastes, propuesta de margen por pieza, gestión de estado y firma). Depende además de un **insumo externo**: las medidas reales que corta el maestro del taller; sin ellas no hay contrastes que registrar.

**Nota — son dos bloqueos distintos, no confundirlos:** marcar un sistema `EN_PRODUCCION` **no basta** para un diseño nivel B/C. El nivel del diseño lo bloquea aparte: `motorDespiece.ts:360` fija `aptoParaCorte = nivelCorte === "A"`, y `aptitudOrden` lo comprueba en sus condiciones 3 y 5. Un sistema puede estar `EN_PRODUCCION` y aun así tener diseños no imprimibles por nivel, hasta identificar su fórmula real (el caso del `OX` del 5020: perfil Horizontal `148` + paño de vidrio, ±1 mm por una división cuyo redondeo el sistema no conoce).

**Decisión (2026-09-13):** documentar y no construir por ahora — elección del usuario ("dejarlo, sólo documentar") ante las opciones de alcance. No se tocó código. Detalle en `SESSION_LOG.md` 2026-09-13 (3).

---

## 2026-09-10 — `cartera_vencida=true` pisa en silencio otros filtros (solo /supervision-crm)

**Severidad:** baja · **Estimación:** 20 min

En `utils/odpFiltros.ts`, el parámetro `cartera_vencida=true` no es un filtro más: reescribe
`forma_pago` a `'credito'` y fuerza `estado_caja ≠ CANCELADO`, descartando lo que el llamador
hubiera enviado en esos dos campos. Pedir "contado + cartera vencida" devuelve créditos.

Es el comportamiento histórico y **el Buscador Avanzado de `/supervision-crm` depende de él**,
por eso se conservó tal cual al extraer el motor. La pestaña "Consultar" del módulo ODP **no**
manda este parámetro: su atajo de Cartera Vencida escribe los cuatro filtros atómicos
equivalentes (`forma_pago`, `solo_con_saldo`, `excluir_estado_caja`, `facturada_antes_de`) a la
vista del usuario, que puede ajustarlos uno a uno. La equivalencia entre ambos caminos está
verificada: el bloque `cartera_vencida` se reescribe internamente en esos mismos cuatro filtros.

**Solución:** migrar `BuscadorAvanzadoPanel.tsx` al mismo esquema de pre-llenado y retirar el
parámetro `cartera_vencida` del util. Mientras tanto no hay divergencia de criterio — hay una
sola implementación—, solo una UI que miente sobre lo que filtró.

---


## 2026-09-09 — ESLint del backend inoperante (config v9 pendiente de migrar)

**Severidad:** media · **Estimación:** 30-45 min

`npm --prefix backend-api run lint` (y `lint:fix`) **fallan siempre**, sin analizar un solo archivo:

```
ESLint: 10.0.3
ESLint couldn't find an eslint.config.(js|mjs|cjs) file.
```

El repo tiene configuración en formato `.eslintrc`, que ESLint dejó de leer en la v9. La versión instalada es la 10.0.3.

**Impacto:** el proyecto no tiene tests automatizados y la verificación se apoya en compilación + pruebas manuales; el linter era la tercera pata y hoy no existe en el backend. Nadie lo nota porque el comando falla rápido y con un mensaje que parece de entorno. El frontend sí lo corre (vía `react-scripts`) y ahí sigue funcionando.

**Detectado:** 2026-09-09, al intentar lintar los archivos tocados por el motor de checks automáticos. **No introducido en esa sesión** — es anterior.

**Solución:** migrar a `eslint.config.js` (flat config) con la guía oficial, o fijar `eslint@8` en `devDependencies` si se prefiere aplazar. Lo primero es lo correcto; lo segundo devuelve el linter en 5 minutos.

---


## 2026-09-04 (2) — Proveedores: aprobar a un emisor no recupera sus facturas ya cargadas

**Severidad:** Media — **abierta**. Detalle en `SESSION_LOG.md` 2026-09-04 (3).

**El problema:** cuando la ingesta descubre un emisor nuevo lo crea con `seguir_precios = NULL` y **omite todas las líneas** de esa factura, dejando solo el registro en `factura_proveedor_procesada`. Al aprobarlo después, `aplicarSeguimiento` borra ese registro para liberar el CUFE — pero **no puede reprocesar nada**, porque los XML no se guardan en ninguna parte: `uploadFacturas` usa `multer.memoryStorage()` y la bitácora solo persiste metadatos (CUFE, número, fecha, conteos, nombre de archivo). La única salida es volver a subir los `.zip` a mano.

En la práctica esto convierte la decisión sobre un proveedor en un trabajo con memoria externa: si el usuario aprueba a un emisor semanas después y ya borró los correos, esas facturas no entran nunca. Es la misma dependencia del archivo local que ya señala la entrada anterior.

**Qué faltaría:** persistir las líneas parseadas **solo** de las facturas omitidas por motivo `PROVEEDOR_*` (tabla `factura_proveedor_linea` o un JSONB en la fila existente) y, al encender el seguimiento, reproyectarlas por el mismo camino que la ingesta normal en vez de borrar el registro. Se purgan al resolver el proveedor, así que la tabla no crece. **Estimación:** 4 h. Alternativa descartada por peso: guardar el XML crudo comprimido, que además permitiría reparsear si mejora el parser.

**Mitigación mientras tanto:** el mensaje del endpoint ya dice cuántas facturas se liberaron y que hay que volver a subirlas.

### Hallazgo colateral

🟡 **Dar de baja a un proveedor no limpia su bandeja.** `desactivarProveedor` solo hace `activo: false`; sus códigos `PENDIENTE` siguen listándose en Por Mapear y se pueden vincular, creando equivalencias de un proveedor dado de baja. Es la inconsistencia inversa a "ignorar", que sí descarta todo. **Estimación:** 30 min (alinear la baja con `aplicarSeguimiento`, o filtrar la bandeja por proveedor activo).

---

## 2026-09-04 — Proveedores: el histórico de precios no es auditable ni recalculable

**Severidad:** Alta (obligó a borrar y recargar todo el módulo) — **mayormente resuelta el 2026-09-19**. Detalle en `SESSION_LOG.md` 2026-09-04 (2).

> **Cierre parcial 2026-09-19.** Se agregaron las tres columnas que pedía esta entrada —`cantidad`, `total_linea` y `precio_bruto`— más `descuento_pct` y `descuento_valor`, en `proveedor_producto_precio` (y sus equivalentes en `proveedor_codigo_pendiente`). Desde ahora un error de parseo se corrige con un `UPDATE` y un script de recálculo, que era justamente lo que faltaba. **Lo que sigue abierto:** las filas anteriores al 2026-09-19 tienen esas columnas en `NULL` y **no se pueden recomputar**, porque los XML no se persisten (ver la entrada 2026-09-04 (2) más arriba, que sigue abierta y es la causa raíz). Se corrigen solas cuando entra la próxima factura de cada producto — decisión del usuario, 2026-09-19.

**El problema:** `proveedor_producto_precio` guarda el precio resultante, pero no la **cantidad** ni el **total de línea** del documento del que salió. Cuando se descubrió que el parser dividía el precio unitario entre `cbc:BaseQuantity` (ver la sesión), no hubo forma de saber qué filas estaban mal: nada en la fila permite recomputar la cifra ni contrastarla contra la factura. Sumado a la idempotencia por CUFE —que impide reprocesar los mismos `.zip`—, la única salida fue **vaciar el módulo y recargarlo**, perdiendo todas las equivalencias y alias ya mapeados.

**Qué faltaría:** `cantidad`, `total_linea` y el `precio_bruto_xml` en cada fila del histórico. Con esos tres campos, un error de parseo se corrige con un `UPDATE` y un script de recálculo en vez de un borrado total. **Estimación:** 3 h (migración + escritura en la ingesta + script de recálculo).

**Mitigación mientras tanto:** la bitácora `factura_proveedor_procesada` conserva el CUFE y el archivo de origen, así que el usuario puede volver a subir los `.zip`. Depende de que él los siga archivando: si deja de hacerlo, un error de parseo pasa a ser irreversible.

### Hallazgo colateral

🟡 **`PATCH /api/proveedores/:id` puede dejar `seguir_precios` fuera de la regla unificada.** `proveedorUpdateSchema` acepta `seguir_precios` directo, y por esa vía se puede encender el seguimiento **sin** reabrir las facturas omitidas del proveedor (lo que sí hace `aplicarSeguimiento`). No es un bug hoy —ninguna pantalla lo usa así— pero es la misma clase de desalineación que ya existe entre `PATCH /api/pedidos-pv/:id` y la propagación del proveedor. **Estimación:** 20 min (sacar el campo del schema de update y dejar el seguimiento solo en su endpoint).

---

## 2026-09-03 (2) — Buscadores del módulo Proveedores: seis alcances distintos, unificados

**Severidad:** Media (usabilidad + una carencia funcional real) — **resuelto**. Detalle en `SESSION_LOG.md` 2026-09-03 (2).

**El problema:** el módulo tenía seis buscadores y el reparto estaba invertido. El de *Equivalencias* —el más escondido— ya cruzaba cinco campos; el de *Consultar Precios* —la pantalla que motivó el módulo— era el más pobre y el único que exigía Enter. Escribir el código del proveedor no encontraba nada, pese a ser el dato que uno tiene delante al mirar una factura.

**Resuelto** con un motor único (`GET /api/proveedores/buscar`) que alimenta la barra transversal del módulo y el autocompletado de la pantalla principal, más el hook `useBusquedaModulo` (mínimo 3 caracteres, 300 ms de espera, cancelación de la consulta anterior).

### Hallazgo colateral

🟡 **`/api/search` es un endpoint huérfano.** El buscador global del ERP (ODP, clientes, prospectos, leads) existe en el backend y **ninguna pantalla lo llama** — verificado por búsqueda en todo `frontend-web/src`. Se sumó a la lista de huérfanos junto a `evidencias`, `cotizaciones` y `reportes`. Decidir: montarle una UI o retirarlo. **Estimación:** 3 h montarlo, 10 min retirarlo.

**No se extendió `/api/search` con proveedores a propósito:** lo consultan todos los roles autenticados y los precios de compra son exclusivos de `root`/`admin`. Mezclarlos exigiría filtrar por rol dentro del buscador global, y un descuido ahí expone los costos.

### Nota de rendimiento

Las búsquedas usan `iLike '%texto%'`, que no aprovecha índices B-tree. Con 1.212 productos y 1.011 proveedores es irrelevante; si el catálogo crece un orden de magnitud, evaluar `pg_trgm` con índices GIN. **Estimación:** 2 h llegado el caso.

---

## 2026-09-03 — Proveedores: Fase 3 construida y 4 defectos corregidos

**Severidad:** Media (1 bug de robustez), Baja (3 de rendimiento/seguridad) — **todos corregidos**. Detalle de la sesión en `SESSION_LOG.md` 2026-09-03.

### Corregido

| # | Defecto | Consecuencia |
|---|---|---|
| 1 | La bandeja en memoria de la ingesta guardaba `true` en vez de la instancia creada | Una factura con el **mismo código en dos unidades** (línea `MTR` + línea con relleno `94`) llamaba `getDataValue` sobre un booleano: `TypeError` y **rollback de la factura completa**. Sin corrupción (el CUFE no se registraba, era reprocesable) pero el precio se perdía hasta que alguien leyera el listado de errores del lote |
| 2 | Contraste de IVA con `findByPk` por línea actualizada | N+1 residual: 40 consultas en una factura de 40 líneas mapeadas para leer tres columnas |
| 3 | `ProveedoresTab` sin debounce sobre `busqueda` | Una descarga del maestro completo **por cada tecla**; escribir "vitelsa" = 7 peticiones |
| 4 | `actualizarConfiguracion` hacía `update({ ...req.body })` | Sin whitelist: cualquier admin podía escribir cualquier columna de `configuracion_global`, `id` incluido |

### Deuda saldada del 2026-08-30

- ✅ **El umbral de variación ya es editable desde `/configuracion`**, como decidía `compras.md` (2026-08-23). Antes solo por SQL o API cruda. Incluye validación de rango (1–200) e invalidación de la caché.
- ✅ **Los alias ya se usan.** Se guardaban desde el primer día y ningún buscador los leía: `/api/catalogo?q=` solo miraba código, nombre y descripción. La ayuda 1 de `compras.md §3.4` —la que hace que mapear el segundo proveedor sea más barato que el primero— estaba inerte.
- ✅ **`factura_proveedor_procesada` ya es consultable** (`GET /api/proveedores/facturas`). Era una tabla que se escribía y nadie leía.

### Deuda residual del módulo (no bloqueante)

- 🟡 **El backfill de los `.zip` archivados sigue pendiente** y el parseo continúa siendo **síncrono dentro del request** (riesgo del event loop, `compras.md §5.4`). Hacerlo bien exige extraer la ingesta a un servicio compartido para que script y controlador no tengan dos versiones de la misma lógica. **Estimación:** 6 h.
- 🟡 **Sin paginación en la UI** de la bandeja y de equivalencias: el backend acepta `limit`/`offset`, el frontend pide 200 y solo avisa "mostrando X de Y". Con ~270 registros de ruido en bandeja ya se roza el techo. **Estimación:** 2 h.
- 🟡 **Sin fusión de proveedores duplicados** (`VyP` / `VYP` / `VENTANAS Y PUERTAS`): 50 textos ≈ 40 proveedores reales, medido el 2026-08-02. Cada variante acumula su propio histórico de precios. **Estimación:** 4 h.
- 🟡 **Sin pantalla para corregir alias.** Un sinónimo mal aprendido solo se quita por SQL, y ahora que los alias sí alimentan el buscador, uno equivocado propone un producto errado. **Estimación:** 2 h.
- 🟡 **El sobrecosto de fraccionar** (tira de 6 m vs metro suelto) no se calcula en ninguna parte, siendo el beneficio de negocio que justificó meter la modalidad en la clave (`compras.md §3.6`). **Estimación:** 3 h.
- 🟡 **Categorías de producto vacías (95 %)**: el requisito 2 original —"productos por categoría"— sigue sin poder cumplirse. Depende de una decisión del usuario, no de código.
- 🟡 Persisten del 2026-08-30: los **49 códigos puramente numéricos** por revisar a mano (30 min) y el **BOM en 4 archivos** del módulo (5 min).

---

## 2026-09-03 — Ciclo de imports en `pedido_pv.controller`, endpoint huérfano y semántica de `pulidos`

**Severidad:** Media (ciclo de imports), Media (semántica `pulidos`), Baja (endpoint huérfano), Baja (proveedor sin constraint)

Hallazgos de la sesión que implementó el formato Templacol y la propagación de proveedor (commits `a408971`, `b67bcc3`). Ninguno bloqueó el trabajo; los cuatro siguen abiertos salvo donde se indica.

### 1. `pedido_pv.controller` está dentro de un ciclo de imports — Media

`pedido_pv.controller.ts:8` importa `emitirNotificacion` desde `../server` de forma **estática**, y `server → app → routes/pedido_pv.routes → pedido_pv.controller` cierra el ciclo.

Entrando por `server.ts` no se nota: cuando `pedido_pv.routes` pide los handlers, el controlador ya terminó de evaluarse. Pero **cualquier script o módulo que importe ese controlador como punto de entrada revienta** con `TypeError: argument handler must be a function`, porque el controlador se evalúa primero, dispara la carga de `app.ts` y las rutas reciben `undefined`.

Se topó con esto al escribir `2026-09-03_alinear_proveedor_pedidos_pv.ts`. Se esquivó extrayendo la lógica compartida a `utils/pedidoPvCapacidad.ts`, que solo depende de modelos — pero **el ciclo sigue ahí**: el próximo script que importe el controlador va a fallar igual, y el error no dice nada sobre imports circulares.

- **Arreglo de raíz:** volver dinámico el import de `emitirNotificacion` (`import('../server').then(...)`), como ya se hace con `emitirCambio` en ese mismo archivo. Verificar antes que no haya otros controladores con importación estática de `../server`.
- **Estimación:** 30 min más pruebas de humo de las notificaciones de Pedidos PV.

### 2. `pulidos` / `pulidos_h` no son metros lineales — Media

El formato de Templacol rotula las columnas I/J como **"ACABADOS (Metros Lineales)"**, pero `ODPItem.pulidos` y `pulidos_h` (`STRING(10)`) guardan **cantidad de lados**: de 698 ítems con dato, 688 valen exactamente `"2"`/`"2"`.

Por decisión del usuario se vuelca el valor crudo, igual que se viene haciendo con Vitelsa desde hace 335 pedidos —donde el printable rotula esas mismas columnas como BPB, sin unidad—, así que es plausible que el proveedor ya lo interprete como lados. Pero **con el rótulo explícito de Templacol el riesgo es real**: 2 lados pulidos leídos como 2 metros lineales cambia la cotización y la fabricación.

Además el modelo no distingue BPB de BPM ni de chaflán: todo `pulidos` cae en BPB, y las columnas K/L (BPM), M/N (CHAFLÁN), Q (RADIOS) y R (DSP) quedan siempre vacías por falta de campo de origen.

- **Acción sugerida:** validar con Templacol cómo leen esas columnas antes de que el volumen crezca. Si hace falta convertir, la fórmula sería `(ancho_mm/1000) × pulidos × cantidad` — pero eso presupone que `pulidos` significa "cantidad de lados", que también está sin confirmar.
- **Estimación:** 15 min de código; el costo real es la validación con el proveedor.

### 3. `POST /api/odp/:id/instalacion` es un endpoint huérfano — Baja

`finalizarInstalacionODP` (`odp.controller.ts:1318`) está montado en `odp.routes.ts:61` y accesible a `admin`, `gerencia`, `jefe_produccion` e `instalador`, pero **ningún cliente lo llama**: no aparece en `frontend-web` ni en `mobile-app`. Lo reemplazó el flujo de rutas (`finalizarInstalacion` en `rutas.controller.ts`, nombre casi idéntico).

Además pone `estado_produccion: 'INSTALADA'` con `odp.update()` directo, **sin pasar por `updateODP`**, así que no verifica `es_no_conformidad`/`odp_padre_id`: si alguien lo invocara sobre una ODP de reproceso, el padre quedaría huérfano en `PAUSADA` — el mismo bug que se corrigió en los otros cinco puntos del código.

- **Acción sugerida:** confirmar que está muerto y eliminarlo (endpoint, controlador y ruta), o añadirle la reactivación del padre si se decide conservarlo.
- **Estimación:** 20 min.

### 4. `pedido_pv.proveedor` acepta cualquier texto — Baja

No hay ENUM ni CHECK sobre la columna, y el frontend ofrece `['Vitelsa','Templacol','Vidplex','Otros']` solo como lista del `<Select>`. En producción había 2 pedidos con proveedor `"PV"` (corregidos el 2026-09-03 por el script de alineación).

El generador de Excel y el selector de printable normalizan con `trim().toLowerCase()` y caen a Vitelsa por defecto, así que un valor sucio no rompe nada — pero silenciosamente entrega el formato equivocado, que es justo el modo de falla que este trabajo vino a eliminar.

- **Acción sugerida:** validar el valor contra la lista en `createPedidoPV` y `updatePedidoPV` con Zod, o un CHECK en BD.
- **Estimación:** 20 min.

### 5. Cerrado en esta sesión

- **`updateODP` no reactivaba al padre de una NC si la hija saltaba directo a `ENTREGADA`** — corregido en `a408971`, junto con el mismo hueco en `terminarRutaConductor`. Era estructural desde el 2026-09-02: al separarse `INSTALANDO`, el flujo por ruta dejó de tocar `INSTALADA`.
- **Cambiar `proveedor_vidrio` en la ODP no propagaba al Pedido PV** — corregido en `b67bcc3`. Sigue abierta la vía inversa: ver "Pendientes" en `SESSION_LOG.md` 2026-09-03.

---

## 2026-08-30 — Auditoría del módulo Proveedores: 26 hallazgos, corregidos

**Severidad:** Crítica (5 hallazgos), Alta (9), Media (10), Baja (2) — **todos corregidos el mismo día**

**Contexto:** auditoría completa de las Fases 1 y 2 del módulo (commits `9a39045` → `6f216f9`), disparada por la entrada en producción de la ingesta de facturas electrónicas DIAN. Ninguno de los defectos se manifestaba como excepción: todos producían datos plausibles pero equivocados, que es el peor modo de falla para una herramienta cuyo propósito es decidir a qué proveedor comprar.

### Los cinco críticos

| ID | Defecto | Causa raíz |
|----|---------|------------|
| C1 | La idempotencia por CUFE **nunca coincidía** | `documento_ref` guardaba el CUFE truncado a 12 caracteres y se buscaba el completo (96) con `LIKE`. Recargar un `.zip` reprocesaba todo. Una factura de códigos 100% nuevos no dejaba rastro del CUFE en ninguna tabla, así que era reprocesable siempre |
| C2 | La unidad del XML se leía y se **descartaba** | El `findAll` de equivalencias no filtraba `unidad_compra` y el bucle escribía el mismo precio en todas las filas del código. Un perfil con tira de 6 m y metro recibía la misma cifra en ambas |
| C3 | Una factura vieja **pisaba** el precio vigente | `actualizarPrecio` nunca comparaba fechas y el lote se procesaba en orden de multer, no por `fecha_emision` |
| C4 | Desvincular **borraba el histórico** | `destroy()` físico + `ON DELETE CASCADE` en `proveedor_producto_precio` |
| C5 | Código `MAPEADO` sin equivalencia quedaba **en limbo permanente** | La ingesta solo actualizaba pendientes en estado `PENDIENTE`; con `MAPEADO` no hacía nada y tampoco entraba al `else` que lo habría creado |

**C5 ya había ocurrido en producción:** el pendiente `id=5`, código `VTNA000000006INC` — *vidrio templado 6 mm incoloro*, visto 17 veces — llevaba desde antes del fix `d3012b7` sin capturar precio y sin aparecer en ninguna bandeja. El script de migración lo devolvió a `PENDIENTE`.

### Cambios de esquema

Script `backend-api/src/scripts/2026_08_30_fix_ingesta_proveedores.ts` (ya ejecutado, idempotente):

- **Tabla nueva `factura_proveedor_procesada`** — `cufe` UNIQUE. Es el registro de idempotencia real y la bitácora de la ingesta (qué documento entró, cuántas líneas movió y por qué se omitió, si aplica). Auditada y registrada en `MODELOS_AUDITADOS`.
- `proveedor_codigo_pendiente`: `unidad_detectada`, `porcentaje_iva_detectado`, `codigo_derivado`.
- `proveedores`: `seguir_precios` (interruptor de ruido), `origen_registro` (`MANUAL` / `IMPORTACION_WO` / `INGESTA_FE`).
- `proveedor_producto_precio`: `cufe`, `porcentaje_iva`, `lineas_en_factura`, `retroactivo`.
- Índice `idx_proveedor_producto_prov_codigo` sobre `(proveedor_id, codigo_proveedor)` — la consulta caliente de la ingesta.

### Reglas de negocio que ahora sí se cumplen

- **El precio vigente lo define la fecha de la factura.** Las facturas de un lote se ordenan por `fecha_emision` antes de procesarse, y una anterior a la vigente se archiva en el histórico con `retroactivo = true` sin desplazar el precio actual.
- **La unidad decide contra qué modalidad se compara.** Un `unitCode` informativo (`MTR`, `KGM`, `MTK`) exige coincidencia con `unidad_compra`; uno genérico (`94`, `EA`, `NIU`) confía en la equivalencia registrada **solo si hay una sola**. Con dos modalidades activas y unidad ambigua no se toca ningún precio y se emite un aviso.
- **Notas crédito y débito se registran sin mover precios.** Antes se procesaban como facturas de compra.
- **Facturas en moneda distinta a COP** se registran y se omiten sus precios.
- **El IVA se toma del XML** y se guarda en el histórico; si difiere del catálogo se avisa en vez de sobrescribir en silencio una configuración hecha a mano.

### Deuda residual (no bloqueante)

- 🟡 **49 códigos puramente numéricos** en la bandeja, previos al fix del parser (que ya no usa `cbc:ID` como código y deriva `SD-<hash>` de la descripción). Algunos son códigos legítimos del proveedor (`1088`, `3710`), otros son números de línea que pudieron agrupar productos distintos. No es distinguible automáticamente: el script de migración los lista para revisión manual. **Estimación:** 30 min de revisión humana.
- 🟡 **La carga sigue siendo una petición HTTP síncrona.** Se eliminó el N+1 (precarga de proveedores, equivalencias y bandeja en memoria; una transacción por factura), pero un backfill masivo debería ir por script one-off, como advierte `compras.md`. **Estimación:** 4 h si se necesita.
- 🟡 **BOM en 4 archivos** del módulo (`AgregarPrecioModal`, `NuevoProveedorModal`, `ConsultarPreciosTab`, `ProveedoresTab`). Cosmético; quitarlo reescribe el archivo entero en el diff. **Estimación:** 5 min.
- 🟡 **`npm run build` del frontend falla en Windows** (`CI=false` no es sintaxis de cmd). Preexistente y sin impacto: Cloudflare Pages construye en Linux. Localmente se usa `CI=false npx react-scripts build` desde bash. **Estimación:** 10 min con `cross-env`.

**Verificación:** 26 comprobaciones automatizadas end-to-end contra la BD real con facturas DIAN sintéticas (idempotencia, orden cronológico, conflicto de unidad, nota crédito, código derivado, rescate de limbo, validación Zod, corte de ruido por proveedor). Todas pasaron; los datos de prueba se eliminaron al terminar.

---

## 2026-08-01 — `PEDIDO_PROVEEDOR`: valor huérfano en el ENUM de Postgres

**Severidad:** Baja (resuelta en código, permanece como nota de BD)

**Descripción:**
`PEDIDO_PROVEEDOR` existe en el ENUM `enum_odp_estado_produccion` de Postgres, en la posición 3 (entre `MEDICION` y `ALUMINIO_CORTADO`), pero **no** está en el ENUM de Sequelize de `backend-api/src/models/odp.model.ts`. Mismo patrón de drift que el de roles `auxiliar_produccion`/`taller` (ver 2026-07-10): alguien lo removió del modelo y nadie lo sincronizó de vuelta.

**Estado verificado en Supabase (2026-08-01):**
- Presente en el ENUM de PG: **sí** (12 valores en total).
- CHECK CONSTRAINT sobre `estado_produccion`: **ninguno** — solo manda el ENUM.
- ODPs actualmente en ese estado: **0**.
- Registros en `historial_estados_odp` que lo referencian: **4** — el estado sí se usó en el pasado.

**Decisión (2026-08-01):** el seguimiento al proveedor lo cubren los módulos de Compras y Pedidos PV, así que el estado no vuelve al flujo de producción. Se retiró la única referencia que quedaba en el código: `ESTADOS_NC_ACTIVOS` en `frontend-web/src/features/produccion/ProduccionPage.tsx:134`, que se eliminó por quedar idéntica a `activeStates`. Esa línea se había agregado el 2026-07-07 (commit `ce77ebf`) como defensa preventiva para que una NC/garantía no desapareciera del tab al pasar por ese estado; con 0 ODPs usándolo, la defensa era innecesaria.

**Por qué NO se elimina de la BD:** quitar un valor de un ENUM en Postgres obliga a recrear el tipo completo, y los 4 registros históricos de `historial_estados_odp` que lo referencian se romperían. El valor queda como dato histórico inerte. El ENUM de Sequelize sin el valor actúa además como guardarraíl: impide asignarlo desde el backend.

**Riesgo residual:** una ODP editada **directamente en Supabase** hacia ese estado sería aceptada por la BD (el ENUM lo permite, no hay CHECK) y quedaría **invisible en el tablero de Producción** — no aparece en `ESTADOS_PRODUCCION_VISIBLES`, así que ni siquiera se pide al backend, y no tiene columna en el Kanban ni posición en `ESTADO_ORDEN`. Es el mismo tipo de pérdida silenciosa que el caso `ENTREGADA`/tope de 200 filas (2026-07-30).

**Fix pendiente opcional:** que el backend registre un warning al detectar ODPs en estados fuera de `ESTADOS_PRODUCCION_VISIBLES`, como red de seguridad ante ediciones manuales en BD. **Estimación:** 20 min. No planificado.

---

## 2026-07-27 — Aprobar prospecto marca sus TMs como `convertida` aunque la visita no se haya realizado — ✅ RESUELTO 2026-09-11

**Severidad:** Media

**Descripción:**
`backend-api/src/controllers/prospecto.controller.ts` (bloque "Vincular todas las TMs del prospecto a la ODP") ejecuta al aprobar un prospecto:

```ts
await TomaMedidas.update({ odp_id, estado: 'convertida' }, { where: { id: { [OpTM.in]: tms.map(...) } }, transaction: t });
```

Marca **todas** las TMs del prospecto como `convertida` sin verificar su estado previo. Como `getTMPanel` agrupa `realizada` + `convertida` en el panel "Realizadas", una TM que seguía `solicitada`/`programada` (visita nunca hecha, sin fotos) salta al panel de completadas y desaparece del flujo operativo del jefe de producción: no se puede programar, ni editar, ni eliminar (`updateTM`/`deleteTM` solo aceptan `solicitada`/`programada`), y en el panel Realizadas no hay botón "Retornar" — solo existe para `programada`.

Esto contradice la definición del propio sistema en `frontend-web/src/utils/tmEstado.ts:2`: *"convertida = prospecto convertido a ODP **después de visita realizada**"*.

**Cómo se detectó:** caso real TM-0178 (2026-07-27). Quedó en `convertida` sin fotos (`medidas_json = []`, `croquis_url = NULL`) mientras su ODP-24201 seguía en `VISITA_TECNICA` con `chk_medicion = false` — el resto del sistema era coherente con "visita pendiente"; solo el estado de la TM mentía. Corregida con el script one-off `backend-api/src/scripts/fix_tm_0178_2026-07-27.ts`.

**Alcance de la inconsistencia en datos:** 4 TMs históricas en `convertida` sin fotos (TM-0015, TM-0048, TM-0107, TM-0178). Las 3 primeras tienen sus ODPs ya INSTALADA/ENTREGADA con `chk_medicion = true` — histórico cerrado, no vale la pena tocarlas. Solo TM-0178 estaba en un flujo vivo.

**Efecto colateral en auditoría:** ese `TomaMedidas.update({...}, { where })` es un update masivo, así que **no dispara los hooks de instancia** y el salto a `convertida` no queda registrado en `auditoria_log` (ver deuda 2026-07-02). En el caso TM-0178 el rastro se interrumpe justo en el cambio que causó el problema.

**Fix propuesto:** separar en dos updates dentro de la misma transacción — las TMs ya en `realizada` pasan a `convertida`; las que estén en `solicitada`/`programada` solo heredan `odp_id` y conservan su estado. Alternativa complementaria: agregar botón "Retornar" en el panel Realizadas para TMs sin fotos y ampliar `retornarTM` para aceptarlas.

**Estimación:** 15 min el fix en `prospecto.controller.ts`; +30 min si se agrega también el botón "Retornar" en `TomaMedidasPage.tsx` + backend. No requiere migración de BD.

**✅ Resuelto el 2026-09-11** — lo volvió a reportar un usuario desde el flujo vivo (crear prospecto → solicitar TM → generar ODP y ver la TM saltar a "Realizadas"). Se aplicaron las dos ramas del fix propuesto:

1. `prospecto.controller.ts` — el update masivo se partió en dos dentro de la misma transacción: las TMs en `realizada` pasan a `convertida`; las demás (`solicitada`/`programada`/`archivada`) **solo heredan `odp_id`** y conservan su estado. Ambos updates con `individualHooks: true`, así que el cambio ya queda en `auditoria_log`.
2. `retornarTM` + `TomaMedidasPage.tsx` — el botón "Retornar" ya aparece en el panel Realizadas para TMs sin croquis ni fotos, con la misma guarda en backend (409 si tiene archivos registrados). El criterio vive en `tmRetornable()` (`utils/tmEstado.ts`) para que front y back no diverjan.

**Decisión de datos:** no se corrió script de corrección masiva. Las TMs que ya quedaron atrapadas en `convertida` las destraba producción caso por caso con el botón nuevo. **`retornarTM` no toca la ODP**: si una ODP ya tenía `chk_medicion = true`, retornar su TM no lo revierte (mismo criterio que `fix_tm_0178_2026-07-27.ts`).

---

## 2026-07-27 — `auditoria_log.usuario_nombre` queda siempre NULL

**Severidad:** Baja

**Descripción:**
El middleware de contexto de auditoría en `backend-api/src/app.ts:67-80` intenta poblar `userName` leyendo `decoded?.nombre_completo` del JWT, pero `auth.controller.ts:63-67` firma el token solo con `{ id, rol }`. El campo nunca existe en el payload, así que `usuario_nombre` se graba `NULL` en todos los registros.

**Medición (2026-07-27):** de 2.378 registros de `auditoria_log` de los últimos 7 días, 2.218 tienen `usuario_id` poblado y **solo 1** tiene `usuario_nombre` — y ese único es el escrito manualmente por el script `fix_tm_0178_2026-07-27.ts`.

**Impacto:** la trazabilidad no se pierde (`usuario_id` sí se registra y es la referencia dura), pero cualquier vista que muestre el nombre directamente desde `auditoria_log` sin hacer JOIN con `usuarios` sale vacía. Verificar cómo lo resuelve hoy el tab Auditoría del panel ROOT.

**Fix propuesto:** agregar `nombre_completo` al payload del JWT en `auth.controller.ts`. Ojo: los tokens ya emitidos (8h de vigencia) seguirían sin el campo hasta que expiren, y el tamaño del token crece ligeramente. Alternativa sin tocar el JWT: resolver el nombre por JOIN al leer la auditoría, y dejar de escribir la columna denormalizada.

**Estimación:** 10 min (JWT) o 20 min (JOIN en lectura + limpieza del campo).

---

## 2026-07-10 — Drift RBAC: roles `auxiliar_produccion` y `taller` fuera del ENUM de Sequelize

**Severidad:** Alta

**Descripción:**
`backend-api/src/models/usuario.model.ts` define el ENUM de Sequelize del campo `rol` con 13 valores. `auxiliar_produccion` y `taller` **no están incluidos**, pero ambos se usan activamente: `frontend-web/src/components/common/Sidebar.tsx` y `frontend-web/src/routes/AppRoutes.tsx` les asignan ítems de menú y rutas propias (`auxiliar_produccion` ve `/produccion`, `/inventario`, `/pedidos-pv`), `backend-api/src/seed.ts` crea un usuario con `rol: 'auxiliar_produccion'`, y `ROLES_VALIDOS` en `server.ts` (salas de Socket.io) también lo incluye. El CHECK CONSTRAINT de Postgres sí reconoce ambos roles (reincorporados el 2026-04-12 vía `fix_constraint.ts`), pero el ENUM de Sequelize nunca se actualizó de vuelta tras removerlos el 2026-04-05.

**Riesgo real:** crear o editar un usuario con `rol='auxiliar_produccion'` o `rol='taller'` vía Sequelize (incluyendo si se vuelve a correr `seed.ts` tal como está) muy probablemente falla con un error de validación ENUM antes de llegar a la BD, aunque el CHECK CONSTRAINT de Postgres lo aceptaría. No se ejecutó el seed para confirmar en runtime (acción no de solo-lectura) — hallazgo por lectura estática del código + reconstrucción de historial git, con alta confianza.

**Cómo se detectó:** Auditoría forense completa del sistema para actualizar `CLAUDE.md` (2026-07-10). `git log -p` sobre `usuario.model.ts` reconstruyó la secuencia: creación con `auxiliar_produccion` (2026-03-08) → se agrega `taller` (2026-03-11) → se remueven ambos + `gerente` en refactor RBAC (2026-04-05, mismo día que `fix_bd.js` borró físicamente esos usuarios) → CHECK CONSTRAINT los reincorpora una semana después (2026-04-12, `fix_constraint.ts`) sin sincronizar el modelo.

**Alcance conocido:** `usuario.model.ts` (ENUM a corregir), verificar también `ROLES_VALIDOS` en `server.ts` y el tipo `RolUsuario` en `rbacMiddleware.ts` para que las 5 listas de roles del sistema queden consistentes.

**Avance parcial 2026-07-27:** se agregó `auxiliar_produccion` al tipo `RolUsuario` de `rbacMiddleware.ts` (era requisito para que compilara el `requireRole` ampliado del inventario). Falta todavía el ENUM de `usuario.model.ts` y el rol `taller` en ambos sitios — el riesgo principal de la deuda (crear/editar usuarios con esos roles) sigue vigente. Dato de contexto: hoy **no existe ningún usuario con rol `auxiliar_produccion` ni `taller`** en la BD de producción (verificado 2026-07-27), así que la deuda no está causando fallos activos; conviene confirmar con el usuario si ambos roles siguen vigentes antes de completar el fix.

**Estimación:** 15-20 min — agregar `auxiliar_produccion` y `taller` al ENUM de `usuario.model.ts` y a las listas menores; no requiere migración de BD (el CHECK CONSTRAINT ya los acepta). Confirmar con el usuario si ambos roles siguen vigentes en el negocio antes de tocar (podría ser que `taller` sea un rol descontinuado a propósito).

---

## 2026-07-10 — Revertir auditoría falla siempre para `Cotizacion`, `SAP` y `RutaODP`

**Severidad:** Media

**Descripción:**
Los modelos `Cotizacion`, `SAP` y `RutaODP` tienen `tableName` en singular (`cotizacion`, `sap`, `ruta_odp`), pero tanto el array `MODELOS_AUDITADOS` (`models/index.ts`) como el Set `TABLAS_AUDITABLES` (`root.controller.ts`) usan el string en plural (`cotizaciones`, `saps`, `ruta_odps`) como valor de `tabla`. El registro en `auditoria_log` funciona igual (el campo `tabla` es solo texto libre), pero `revertirAuditoria` ejecuta SQL crudo (`UPDATE "${tabla}" ...` / `INSERT INTO "${tabla}" ...`) usando ese string como nombre de tabla literal — para estos 3 casos apunta a una tabla inexistente y Postgres devuelve "relation does not exist", que el `catch` genérico convierte en 500 silencioso.

**Cómo se detectó:** Auditoría forense completa del sistema para actualizar `CLAUDE.md` (2026-07-10), comparando `tableName` real de cada modelo contra las 2 listas de auditoría. No se ejecutó el endpoint de revertir para confirmar en runtime (fuera de alcance de una auditoría de solo lectura) — hallazgo por lectura estática del SQL generado, con alta confianza.

**Alcance conocido:** `backend-api/src/controllers/root.controller.ts` (`TABLAS_AUDITABLES` + `revertirAuditoria`), `backend-api/src/models/index.ts` (`MODELOS_AUDITADOS`).

**Estimación:** 10 min — corregir los 3 strings a singular en ambos lugares. Verificar antes si hay registros de auditoría ya grabados en `auditoria_log.tabla` con el valor plural viejo (esos quedarían huérfanos del nuevo valor y no se podrían revertir retroactivamente sin un `UPDATE` de corrección adicional).

---

## 2026-07-10 — Módulos frontend con código completo pero sin ruta montada

**Severidad:** Baja/Media (depende de si es intencional)

**Descripción:**
Tres páginas existen completas en `frontend-web/src/features/` pero no están importadas ni montadas en `AppRoutes.tsx` — inalcanzables desde la UI real:
- `evidencias/EvidenciasPage.tsx` — captura de evidencias (foto/firma/video + geolocalización) por ODP. CLAUDE.md las documentaba como ruta activa (`/evidencias`) hasta esta auditoría; ya no lo es.
- `cotizaciones/CotizacionesPage.tsx` — CRUD completo de cotizaciones con `cotizacionesSlice`.
- `reportes/ReportesPage.tsx` — reportes de ODP con gráficos (`recharts`) y export Excel/PDF.

**Cómo se detectó:** Auditoría forense completa del sistema para actualizar `CLAUDE.md` (2026-07-10), al construir la tabla de rutas reales desde `AppRoutes.tsx` y no encontrar coincidencia para estos 3 componentes.

**Alcance conocido:** los 3 archivos arriba, más el módulo `NoteBook`/`components/dashboard` si aplica (no verificado a fondo).

**Estimación:** Sin estimar — requiere decisión de negocio, no es un fix mecánico. Confirmar con el usuario: ¿son features en desarrollo pendientes de enrutar, o quedaron obsoletas tras el módulo CRM (`/crm`, que ya cubre reportes de asesor y pipeline) y deberían eliminarse?

---

## 2026-07-02 — Auditoría no se registra en `destroy`/`update` masivos (bulk)

**Severidad:** Media

**Descripción:**
Los hooks globales de auditoría (`backend-api/src/models/index.ts`, bloque `MODELOS_AUDITADOS`) están implementados como hooks de instancia (`beforeUpdate`/`afterUpdate`/`beforeDestroy`/`afterDestroy`). Sequelize **no dispara hooks de instancia en operaciones bulk** (`Model.destroy({ where })` o `Model.update({...}, { where })`) a menos que se pase explícitamente `individualHooks: true`. Cualquier `destroy`/`update` masivo sobre un modelo auditado deja el cambio sin traza en `auditoria_log`, silenciosamente (no lanza error).

**Cómo se detectó:** Al ejecutar `backend-api/src/scripts/eliminar_leads_prueba_2026-07-02.ts` con `Lead.destroy({ where: { id: [...] } })` para borrar 2 leads de prueba. El borrado fue correcto (incluido el `CASCADE` a `lead_eventos`/`lead_imagenes`), pero no generó entrada `DELETE` en `auditoria_log`. Se corrigió manualmente insertando las entradas compensatorias con el snapshot ya capturado antes del borrado, y se corrigió el script agregando `individualHooks: true` como referencia.

**Alcance conocido (grep `.destroy({ where` / `.update({...}, { where` en `backend-api/src/controllers/`):**
`odp.controller.ts`, `odc.controller.ts`, `rutas.controller.ts`, `pedido_pv.controller.ts`, `agenda.controller.ts`, `sap.controller.ts`, `cotizacion.controller.ts`. No se verificó caso por caso cuáles de esos `destroy`/`update` operan sobre modelos incluidos en `MODELOS_AUDITADOS` ni cuáles ya usan `individualHooks: true` — requiere revisión dedicada.

**Estimación:** 1-2 h — revisar cada ocurrencia, confirmar si el modelo está en `MODELOS_AUDITADOS`, y agregar `individualHooks: true` donde el volumen de filas afectadas sea bajo (para operaciones masivas de alto volumen, evaluar si vale la pena el costo en performance vs. registrar un único evento de auditoría "resumen").

---

## 2026-07-06 — `LeadCard.tsx` y `renderKanban()` son código muerto en el módulo CRM

**Severidad:** Baja

**Descripción:**
`frontend-web/src/features/crm/components/KanbanBoard.tsx` define una función `renderKanban()` (comentada como "Vista Kanban Colapsable — Propuesta 4", ~línea 773) que renderiza columnas con drag & drop usando `LeadCard.tsx`. Esta función **nunca se invoca**: el render principal del componente solo llama a `renderTabla()` o `renderPipelineHorizontal()` según `viewMode` (`'kanban' | 'tabla'`; el valor `'kanban'` en realidad dispara `renderPipelineHorizontal()`, no `renderKanban()`). El archivo `LeadCard.tsx` completo, junto con el bloque `renderKanban` (~150 líneas), quedaron huérfanos tras un rediseño visual anterior.

**Cómo se detectó:** Al agregar un chip "Últ. mov" a `LeadCard.tsx` (parte del mismo cambio que lo agregó a `renderPipelineHorizontal` y `TablaFila`), la verificación visual en navegador mostró que el chip nunca aparecía en la app, sin importar la vista activa. Se rastreó con `grep "renderKanban()"` y no hubo ningún llamado.

**Alcance conocido:** `frontend-web/src/features/crm/components/LeadCard.tsx` (archivo completo) y el bloque `renderKanban` dentro de `KanbanBoard.tsx` (~773-936). Ambos siguen compilando sin errores porque TypeScript no marca funciones/archivos no invocados como error.

**Estimación:** 20-30 min — confirmar con el usuario que `renderPipelineHorizontal`/`renderTabla` cubren todos los casos de uso que `renderKanban` pretendía resolver, y luego eliminar `LeadCard.tsx`, el bloque `renderKanban`, y sus imports/tipos asociados (`DragDropContext`, `Droppable`, `Draggable`, `DropResult` de `@hello-pangea/dnd` si no se usan en otro lado del archivo).

---

## 2026-07-08 — Warnings de ESLint acumulados en `frontend-web` (~35 archivos)

**Severidad:** Baja (mayoría cosmética) / Media (subconjunto `exhaustive-deps`)

**Descripción:**
Al levantar el frontend en local (`npm start`), la compilación terminó con "Compiled with warnings" — ninguno bloquea la app, pero se acumularon en el tiempo. Dos ya se corrigieron directamente por ser bugs reales de bajo riesgo (ver commits de esta sesión):
- `DashboardGerencial.tsx:341` — tooltip usaba comillas dobles en vez de template literal; el usuario veía literalmente `${nuevos_clientes}` en pantalla en vez del número. **Corregido.**
- `ComprasPage.tsx:240` — `odp?.estado_produccion || odpsInfo[0] && '' || ''`: por precedencia de operadores el término del medio nunca aportaba nada (`odpsInfo[0]` no tiene campo `estado_produccion` en su tipo), quedaba como código muerto confuso. Simplificado a `odp?.estado_produccion || ''` (comportamiento idéntico). **Corregido.**

El resto queda pendiente, agrupado por severidad:

**`react-hooks/exhaustive-deps` (11 casos, riesgo medio — closures obsoletos con `headers`/`token` viejos o filtros que no disparan refetch):**
`ComprasPage.tsx` (headers, x4), `ConfiguracionPage.tsx` (API), `ContabilidadPage.tsx` (canSeeOA), `ConductorView.tsx` (headers), `InstaladorView.tsx` (headers), `ProgramarRutaModal.tsx` (headers), `InventarioPage.tsx` (headers x2, loadItems/viewMode), `COTModal.tsx` (fetchCOTs), `ODPForm.tsx` (odpToEdit), `ODPTabImprimir.tsx` (token x2), `ODPTabProduccion.tsx` (token, handleFile), `ReportarProblemaForm.tsx` (items), `ProduccionPage.tsx` (panelOdp). **No corregir en bloque agregando la dependencia a ciegas** — varios casos pueden causar loops infinitos de refetch si la dependencia agregada cambia dentro del propio callback; requiere revisión caso por caso.

**`no-unused-vars` (mayoría de los warnings, ~30 archivos, sin riesgo):**
Imports de iconos (`lucide-react`, `tabler-icons`) y variables/funciones sin usar en `Sidebar.tsx`, `PanelGeneral.tsx`, `ComprasPage.tsx`, `ConfiguracionPage.tsx` (indirecto), `ContabilidadPage.tsx`, `CrearODPModal.tsx`, `DashboardGerencial.tsx`, `KanbanBoard.tsx`, `LeadDetalleModal.tsx`, `ProspectosStats.tsx`, `ReporteAsesor.tsx`, `IngresarPerfilModal.tsx`, `ManualesPage.tsx`, `ODPListPage.tsx`, `COTModal.tsx`, `GarantiaFormModal.tsx`, `ODPFichaModal.tsx`, `ODPForm.tsx`, `ODPTabComercial.tsx`, `ODPTabDatosGenerales.tsx`, `ODPTabFinanciero.tsx`, `ODPTabHistorial.tsx`, `ODPTabInstalacion.tsx`, `PrintableOA.tsx`, `ProduccionPage.tsx`, `RootPage.tsx`, `index.tsx`.

**Menores (sin riesgo):**
`no-useless-escape` en `ComprasPage.tsx:394`, `InstaladorView.tsx:96`, `ODPTabImprimir.tsx:57` (escape `\/` innecesario). `unicode-bom` en `PedidosPVPage.tsx:1` (BOM al inicio del archivo).

**Cómo se detectó:** Salida completa de `npm start` (react-scripts/CRA con ESLint plugin integrado) al levantar el entorno local el 2026-07-08.

**Estimación:** 30-40 min para los `no-unused-vars`/`no-useless-escape`/`unicode-bom` (mecánico, bajo riesgo). 2-3 h para revisar los 11 `exhaustive-deps` caso por caso (requiere entender cada flujo de datos antes de agregar la dependencia). Resolución incremental: limpiar cada archivo cuando se vuelva a tocar por otra tarea, en vez de un barrido masivo no relacionado.

---

## 2026-07-26 — `updateODP` factura sin registrar `monto_factura_principal`

**Severidad:** Alta (corrompe el KPI de facturación en silencio)

**Descripción:**
Existen **dos rutas** para marcar una ODP como facturada y solo una mantiene el monto de la FE:

- `facturarODP` (`PATCH /odp/:id/facturar`, modal de Contabilidad) — setea `monto_factura_principal` (default `valor_total`), valida el tope `principal + Σadicionales ≤ valor_total` y limpia el monto al revertir a PENDIENTE. **Correcto.**
- `updateODP` (`PUT /odp/:id`, formulario general de ODP) — `odpSchema` (`odp.controller.ts` ~línea 67) acepta `estado_facturacion`, `factura_electronica` y `fecha_factura`, y los persiste con `odp.update(data)` **sin tocar `monto_factura_principal`**. La ODP queda FACTURADA con monto NULL.

Impacto: `sqlFacturadoEnRango` (`utils/facturacion.ts`) suma con `SUM`, que **ignora los NULL sin error**. Cada ODP facturada por esta vía desaparecía del KPI aportando $0. Se mitigó con `COALESCE(monto_factura_principal, valor_total)` en el helper y en `getPedidosFacturados`, pero eso es una red de seguridad: el fallback adivina el monto (asume FE por el total), y esa suposición ya resultó equivocada una vez — ver abajo.

**Cómo se detectó:** El usuario reportó que el KPI de julio no sumaba unas FE adicionales recién capturadas. Al auditar aparecieron 3 ODPs facturadas el 24-jul con monto NULL ($223.740.481 fuera del KPI). La primera hipótesis —ventana de carrera del despliegue de `2d95d57`— **era incorrecta**: el registro de `auditoria_log` de ODP-24000 muestra un UPDATE (24-jul 21:02) que pasó `PENDIENTE → FACTURADA` con `factura_electronica='7332'` dejando el monto NULL, patrón que solo produce la ruta de `updateODP`.

**Riesgo de la mitigación actual:** al aplicar `monto = valor_total` a esas 3 ODPs, ODP-24000 (LABORATORIOS ECAR SA, $220.754.096, en `PROGRAMADA` y sin abono) infló el KPI de julio a $430.768.658. Se dejó su FE en **0 explícito** (no NULL, que con el COALESCE volvería a contar el total) a la espera de confirmación de contabilidad. ODP-24031 y ODP-24120 quedaron con `monto = valor_total`, también pendientes de confirmar.

**Opciones (requiere decisión del usuario):**
1. **Alinear `updateODP`** — si el payload marca FACTURADA con FE y el monto está vacío, asignar `valor_total − Σadicionales`, y limpiarlo al revertir a PENDIENTE. Replica el default de `facturarODP`; aditivo, no cambia flujos. ~30 min.
2. **Cerrar la ruta** — quitar `estado_facturacion`/`factura_electronica`/`fecha_factura` de `odpSchema` para que facturar sea exclusivo del modal de Contabilidad. Más limpio conceptualmente (una sola puerta de entrada), pero cambia el comportamiento del formulario de ODP y hay que verificar quién factura hoy por ahí. ~1 h + validación con usuarios.
3. **Restricción en BD** — `CHECK (estado_facturacion <> 'FACTURADA' OR factura_electronica IS NULL OR monto_factura_principal IS NOT NULL)`. Garantía a prueba de futuras rutas, pero rompería con error 500 crudo cualquier flujo que hoy no setea el monto; hacerlo solo **después** de 1 o 2.

**Estimación:** 30 min (opción 1) a 1 h (opción 2). Recomendada la 1 por ser aditiva y no alterar cómo trabaja el equipo hoy.

---

## 2026-07-27 — La impresión de documentos depende de un CDN externo (`cdn.tailwindcss.com`)

**Severidad:** Media

**Descripción:**
Todos los flujos de impresión abren una ventana nueva con `window.open` y le inyectan `<script src="https://cdn.tailwindcss.com"></script>` para darle estilos al documento. Si el CDN no responde (sin internet en el taller, bloqueo de red, caída del servicio), el documento sale **sin ningún estilo**: tablas sin bordes, sin márgenes, sin colores de fondo.

Es innecesario: el proyecto compila Tailwind localmente (`tailwindcss ^3.4.19`, `postcss.config.js`, `@tailwind base/components/utilities` en `src/index.css`, `content: ["./src/**/*.{js,jsx,ts,tsx}"]`). Como los printables viven bajo `src/`, sus clases **ya están en el CSS del bundle** que el navegador tiene cargado. Se sale a la red a buscar algo que ya está en memoria.

Peor: el CDN carga Tailwind con la **configuración por defecto**, sin `tailwind.config.js`, así que ninguna clase del theme extendido (`apple-*`, `shadow-apple`) existe en la ventana de impresión aunque sí exista en pantalla.

**Segundo defecto, en el mismo código:** el disparo de `print()` se hace con un `setTimeout` ciego —800 ms en `ODPTabImprimir`, 600 ms en `printDocument.ts`— en vez de esperar la carga real del CSS. Es una carrera: en un equipo lento o con el CDN frío, el diálogo de impresión aparece antes de que los estilos estén aplicados.

**Alcance conocido (5 sitios):**
- `frontend-web/src/features/odp/components/ODPTabImprimir.tsx:57`
- `frontend-web/src/features/compras/ComprasPage.tsx:394`
- `frontend-web/src/features/pedidos-pv/PedidosPVPage.tsx:588`
- `frontend-web/src/features/instalaciones/components/InstaladorView.tsx:96`
- `frontend-web/src/features/instalaciones/utils/printDocument.ts:13`

**Solución propuesta (ya investigada, no implementada):** un helper `frontend-web/src/utils/printWindow.ts` que (1) serialice las `cssRules` de `document.styleSheets` a un `<style>` inline en la ventana nueva —cero red, y si alguna hoja fuera cross-origin y lanzara `SecurityError`, caer a clonar el `<link href>` absoluto—, (2) conserve los estilos de impresión propios de cada sitio (`@page`, `.excel-table`, `.sap-page`, `print-color-adjust`), y (3) reemplace el `setTimeout` por espera real de carga, dejando el timeout solo como red de seguridad. Los 5 sitios pasarían a consumirlo; `printDocument.ts` quedaría absorbido.

**Riesgo de corregirlo:** pasar del Tailwind del CDN al compilado **puede mover detalles visuales** en documentos que la empresa imprime a diario (talonario, garantía, OP, SAP, det. técnico, det. SAP, no conformidad, OA). No es un cambio invisible: exige revisar a ojo los 9 printables de la ficha ODP más los de compras, pedidos PV e instalador. Por eso conviene hacerlo como cambio aislado, nunca mezclado con otro trabajo sobre esas pantallas.

**Cómo se detectó:** Análisis previo a agregar los accesos directos de facturación en `ODPTabImprimir` (2026-07-27). El usuario decidió documentarlo y no tocarlo en esa pasada.

**Estimación:** 2-3 h — 1 h el helper y la migración de los 5 sitios, el resto verificación visual de cada formato impreso.

---

## 2026-07-28 — Hallazgos de la auditoría de egress (no corregidos en la Fase 1)

Detectados al medir `pg_stat_statements` agregado + `pg_column_size` contra la BD de producción. Ninguno se tocó: quedaron fuera del alcance acordado (Fase 1 quirúrgica sobre la tabla `odp`).

### 1. `password_hash` viaja en consultas de listado de usuarios — **seguridad, severidad media**

`SELECT "id", "username", "password_hash", "rol", … FROM "usuarios"` aparece con **971 llamadas / 22.241 filas** acumuladas. El hash de contraseña se transfiere en consultas que solo necesitan nombre y rol (selectores de asesor, includes de `asesor`, etc.).

No es un fallo explotable por sí solo —el hash no sale al cliente si el `toJSON()` lo omite— pero amplía innecesariamente la superficie: cualquier `console.log`, traza de error o log de query lo expone.

**Solución:** `defaultScope` en `usuario.model.ts` con `attributes: { exclude: ['password_hash'] }` y un scope explícito `withPassword` para el login. Requiere revisar `auth.controller.ts`, que sí lo necesita.

**Estimación:** 45 min, con prueba de login obligatoria.

### 2. Tres endpoints traen la tabla `salidas_almacen` completa para un `NOT IN` en JavaScript — **egress, severidad baja**

`SELECT "odp_id" FROM "salidas_almacen"` sin `WHERE`: **149.060 filas en 595 llamadas** (250 filas por llamada, la tabla entera).

- `salidas_almacen.controller.ts:20` (`getFacturadas`)
- `salidas_almacen.controller.ts:75` (`getOAPendientes`)
- `salidas_almacen.controller.ts:122` (`getNcSinSalida`)

Los tres hacen el mismo patrón: traer todos los `odp_id` con salida y filtrarlos en memoria con `Op.notIn`. Son 8 B por fila, así que el impacto en bytes es marginal (~0,05 MB/día), pero el patrón escala mal: crece linealmente con el histórico de salidas y ya está en 250 filas por llamada.

**Solución:** `NOT EXISTS` (o `Op.notIn` con subquery `Sequelize.literal`) para que el filtrado ocurra en Postgres.

**Estimación:** 1 h las tres, con verificación de que los conteos de las pestañas no cambian.

### 3. `npm run build` de `frontend-web` no funciona en Windows — **DX, severidad baja**

El script es `CI=false react-scripts build && cp build/index.html build/404.html`: sintaxis POSIX (prefijo de variable de entorno inline + `cp`) que **cmd.exe y PowerShell no interpretan**. Falla con `"CI" no se reconoce como un comando interno o externo`.

En un shell POSIX (Git Bash) sí corre. El build de Cloudflare Pages corre en Linux, así que **producción no está afectada** — el problema es solo local, y es una trampa silenciosa: `npm run build` puede terminar con exit 0 sin haber construido nada.

**Solución:** `cross-env CI=false react-scripts build` + reemplazar `cp` por un `node -e` con `fs.copyFileSync`, o mover ambas cosas a un script de Node. Requiere agregar `cross-env` (dependencia de desarrollo) o resolverlo sin dependencias nuevas.

**Estimación:** 20 min.

### 4. Desarrollo local apuntando a la BD de producción — **egress, severidad a evaluar**

`server.ts:143` ejecuta `sequelize.sync({ alter: false })` cuando `NODE_ENV !== 'production'`. Cada reinicio de `nodemon` reintrospecta el esquema completo (`information_schema`, `pg_type`, `pg_timezone_names`: 1.196 filas y 143 ms solo esta última).

No es la fuga actual —registró Δ0 llamadas en el período medido, o sea que no hubo desarrollo local en esos días— pero **cada sesión de `npm run dev` consume de la misma cuota de 5 GB que usa la empresa en producción**, y además opera sobre datos reales.

**Solución a evaluar con el usuario:** base de datos de desarrollo separada, o al menos condicionar el `sync()` a una variable explícita (`SYNC_SCHEMA=true`) en vez de deducirlo de `NODE_ENV`.

---

## 2026-09-11 — Cotizador: 13 accesorios sin referencia de catálogo y 5 SKU por crear para Sistema7038-Interior

**Severidad:** media · **Estimación:** ver desglose (no es una tarea de código: son decisiones de taller y altas de catálogo)

Arbitrando las 54 descripciones de `disenos.json` contra el **Excel matriz del que nació el módulo**
se resolvieron 9 (8 a `MAPEADO` y 1 a `IGNORADO`), y el recuento de `mapeo-accesorios.json` quedó en
**17 MAPEADO / 9 INSUMO_NO_FACTURADO / 27 PENDIENTE / 1 IGNORADO**. Lo que sigue es lo que el Excel
**no** pudo zanjar, con el efecto exacto que tiene sobre la cotización: en `lib/accesoriosPorDiseno.ts`
un accesorio `PENDIENTE` produce una línea con `error: true`, así que **un solo pendiente basta para
que ningún diseño de ese sistema se pueda cotizar por esta vía**.

### 1. `E.universa. Empaque Universal` — bloquea los 17 diseños de los dos sistemas ya activados

El Excel CONFIRMA que esta descripción del extractor no es un producto sino tres: `EMP5020` en
Sistema5020, `EMP1305`/`EMP1306` en Sistema744, `EMPA8025` en Sistema8025. El mapeo va **por
descripción única**, así que el esquema actual no puede representarlo.

⚠️ **Es el único bloqueador que le queda a `Sistema5020` y `Sistema5020Reforzado`**, los dos sistemas
que `sistemasActivos` acaba de declarar. Verificado ejecutando `accesoriosPorDiseno` sobre los 138
diseños: los 17 de esos dos sistemas siguen produciendo exactamente una línea en error, la de este
empaque. **Activarlos no los deja cotizables todavía** — resolver esto es el paso que falta.

**Dos salidas posibles:** (a) partir la clave del mapeo por sistema (campo nuevo en
`cotizador_mapeo_accesorio` + `MapeoAccesorio` en `tipos.ts`), o (b) reescribir la descripción en
`disenos.json` para que cada sistema traiga la suya. **Estimación:** 2-3 h la opción (a), que es la
que no toca datos de origen.

### 2. Doce accesorios que ni el catálogo ni el Excel cubren — requieren referencia del taller

Ninguno tiene candidato entre los 430 productos, y el Excel matriz tampoco los despieza: no es un
error de mapeo, es que **la referencia no existe en ninguna fuente escrita**. Bloqueo medido por
sistema:

| Accesorio | Sistema que deja sin cotizar |
|---|---|
| `Cerrojo Media Luna` | Sistema8025 (25 diseños) — es su **único** bloqueador |
| `Union VP010` | Vidrios y Espejos (3 diseños) — es su **único** bloqueador |
| `Chapeta Anudal` | Sistema3831-Semireforzado (1 diseño) |
| `Rodamiento Orquilla` | Cabina Batiente (4 diseños) |
| `Chapetas Fijo Primavera` | Cabina Deslizante Primavera (4 diseños) |
| `Sujecion Fijo Torino`, `Guia Torino`, `Union 90° Torino`, `Trinquete Inoxidable` | Cabina Deslizante Torino (5 diseños) |
| `Soporte de Toallero`, `Platina para Rodamiento de cabina`, `Empaque de Cabina` | Cabina Corrediza (5 diseños) |

**Nota sobre Sistema8025:** con `Cerrojo Media Luna` resuelto queda a un paso de ser cotizable por
esta vía, pero antes hay que atender un detalle del mapeo por descripción: sus diseños dicen
`Chapa de Impacto Alpha`, que quedó mapeada a `CHJ0101` (chapa Jaguar, la del 744), mientras el
Excel usa `CH8025S` (chapa 8025 con seguro) para el 8025. Mismo problema estructural que el
empaque universal, en menor escala.

**Estimación:** 1-2 h de taller para identificar las 12 referencias, más el alta de catálogo de las
que no existan.

### 3. ~~Cinco SKU por crear para `Sistema7038-Interior`~~ — RESUELTO 2026-09-14

`Chapa Overseas Doble Cilindro`, `Guia 7038`, `Rodamiento 7038`, `E7038_6mm Empaque monumental 6mm`
y `Manija 744-8025`. El sistema no existía como clave en `CATALOGO_SISTEMAS` de `modules/ventanas.ts`,
así que cotizaba con la advertencia "No hay accesorios configurados" — **sin cobrar accesorio
alguno**, que es peor que bloquear.

`Guia 7038` → `GIN7038` y `Rodamiento 7038` → `ROD7038ABB` (+ `ROD7038NY` como alterna sin uso, no
hay campo seleccionable) ya se habían resuelto el 2026-09-12. Los 2 que quedaban — `Chapa Overseas
Doble Cilindro` y `E7038_6mm Empaque monumental 6mm` — necesitaban costo real de proveedor (el
Excel matriz los despieza, pero con un factor plano de 1,3674 que no distingue PA/PM/PB). El taller
lo confirmó el 2026-09-14: `COG0101` (Cerradura Overseas Gancho, $84.542) y `EMP1312` (Empaque 7038
Ref 6-8mm, $988/m), dados de alta con la fórmula ACCESORIO verificada (×1.550628/×1.440712/×1.330796).

`Manija 744-8025` se mantiene `IGNORADO` a propósito también para 7038-Interior: mismo criterio que
744/8025 (el Excel no la cobra en ventana).

`CATALOGO_SISTEMAS["7038-Interior"]` (clave exacta, con guion) quedó con los 4 accesorios
conectados. Los 23 diseños de ese sistema ya cobran accesorios por diseño. Ver `mapeo-accesorios.json`
y `scripts/2026-09-14_alta_accesorios_7038_restantes.ts` / `2026-09-14_mapear_accesorios_7038_restantes.ts`.

### 4. Consumo del cerrojo con número impar de cuerpos — sin criterio de redondeo

`Cerrojo de Embutir` quedó mapeado a `CPTOR` con el consumo del Excel, `cuerpos / 2`. Con 3 cuerpos
da 1,5 y el Excel no dice hacia dónde redondear; los propios diseños extraídos se contradicen
(`Sistema5020::XOX` trae 2 y `Sistema5020::OXO` trae 1, ambos de 3 cuerpos). Se dejó la fórmula
exacta, **sin redondeo inventado**, para que la regla la fije el taller en el mapeo y no el motor.

**Estimación:** 5 min una vez que el taller responda.

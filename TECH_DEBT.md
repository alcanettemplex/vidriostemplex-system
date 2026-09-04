# TECH_DEBT.md

Deuda técnica identificada durante el desarrollo. Formato: fecha, severidad, descripción, estimación.

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

## 2026-07-27 — Aprobar prospecto marca sus TMs como `convertida` aunque la visita no se haya realizado

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

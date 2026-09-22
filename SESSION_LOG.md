# Session Log

## 2026-06-30 — Bugfixes: ODP cliente selector, EXIS. PERF. col, PrintableSAP merge

### Cambios realizados

**1. `ODPForm.tsx` — Selección de cliente no se mostraba visualmente**
- Causa: `clienteSeleccionadoODP` se derivaba del array `clientes` que se limpiaba al cerrar el dropdown
- Fix: nuevo estado `clienteSeleccionadoObj` independiente del array de búsqueda
- Al seleccionar se guarda el objeto completo; al tipear se limpia; en edición se pobla desde `odpToEdit.cliente`

**2. `ComprasPage.tsx` — Columna EXIS. PERF. nunca mostraba "Gestionar"**
- Causa: `codigosConStock` se inicializaba vacío y nunca se poblaba
- Fix: `useEffect` que carga desde `GET /api/compras/codigos-perfileria`
- `invalidarStockCodigo` ahora también agrega códigos al set si aún hay piezas

**3. `PrintableSAP.tsx` — `exist_perf` se perdía en items con cobertura parcial**
- Causa: `itemPorIndice[indice] = it` sobrescribía el item original (con `exist_perf`) con el faltante (sin `exist_perf`) al compartir la misma letra
- Fix: merge de duplicados en una sola fila unificada con `exist_perf` + badge **FALTA** + cantidad total

### Commit
- `9daf11a` — push a `main`
- 3 archivos modificados, +42/-10 líneas

### Pendientes
- Ninguno por ahora. Mañana se continúa.

---

## 2026-07-02 — INCIDENTE PRODUCCIÓN: secuencias de PK desincronizadas tras migración de BD

### Síntoma reportado
Múltiples módulos fallaban en producción con el patrón "al principio permitía, luego quedaba bloqueado (no se recupera)":
1. Crear rutas de instalación
2. Registrar salidas de almacén
3. Registrar pagos → error literal **"Validation error"**
4. Subir imagen en modal de nuevo lead (rol `asistente_administrativo`)
5. (Aparte) Letras **E/S** del imprimible de SAP: compras no las veía, admin sí

### Causa raíz (casos 1–4)
La **migración de la BD a otra cuenta de Supabase** (`pg_dump`/restore) reinsertó todas las filas con sus IDs originales pero **NO reajustó las secuencias** (`setval`) ni restableció el `OWNED BY`. Cada `INSERT` nuevo pedía a la secuencia un id que **ya existía** → violación de PRIMARY KEY → PostgreSQL `duplicate key` → Sequelize lo envuelve como `SequelizeUniqueConstraintError`, cuyo `.message` por defecto es literalmente **"Validation error"**. Bloqueo determinista hasta que la secuencia rebasara el `MAX(id)`.

**Diagnóstico:** 34 de 40 secuencias desincronizadas (las 6 restantes eran tablas vacías). `pg_get_serial_sequence()` devolvía NULL en las 40 tablas → confirmó pérdida de `OWNED BY` (huella de dump/restore). No relacionado con el commit del CRM del día anterior.

### Fix aplicado
- **Nuevo script:** `backend-api/src/scripts/reparar_secuencias_2026-07-02.ts` — descubre dinámicamente todas las columnas serial (parsea la secuencia desde `column_default`, no usa `pg_get_serial_sequence` porque estaba roto), ejecuta `setval` al `MAX(id)` real (o reset a 1 en tablas vacías) y restablece `ALTER SEQUENCE ... OWNED BY`. Idempotente y de riesgo mínimo (setval no toca datos).
- **Ejecutado una vez** contra producción: **34 reparadas, 6 sin cambio, 0 errores.**
- **Verificación:** re-auditoría independiente → 0 desincronizadas; pruebas `INSERT`/`ROLLBACK` en pagos (id 366), salidas_almacen (id 223) y rutas_instalacion (id 217) → todas OK.

### Fix caso 5 (independiente)
- `frontend-web/src/features/odp/components/PrintableSAP.tsx` — badges **E/S/FALTA** ahora llevan **estilos inline** (color + `print-color-adjust: exact`) además de las clases Tailwind.
- Causa: la ventana de impresión (`ODPTabImprimir.tsx handlePrint`) depende del **CDN externo `cdn.tailwindcss.com`** con `setTimeout` de 800 ms; si no carga a tiempo (red/proxy en la PC de compras) las clases no aplican y los badges desaparecen. Los estilos inline no dependen del CDN ni del ajuste "Gráficos de fondo".
- Verificación visual final pendiente en la PC de compras (hard-refresh Ctrl+Shift+R).

### Decisiones técnicas / notas
- Comportamientos que NO son bugs (confirmados): 2ª salida para la misma ODP → 409 (UNIQUE `salidas_almacen.odp_id`, por diseño); ODP ya programada desaparece de la lista de rutas (pasa a `PROGRAMADA`).
- Script `reparar_secuencias_*.ts` queda como **herramienta reutilizable**: ejecutar tras cualquier migración/restore futuro de la BD.

### Prevención de recurrencia
Tras cualquier `pg_dump`/restore o migración de cuenta de Supabase, correr:
`cd backend-api && npx ts-node --transpile-only src/scripts/reparar_secuencias_2026-07-02.ts`

### Pendientes
- Verificación visual del imprimible SAP en la PC de compras (caso 5).
- Confirmar en producción caso 4 (subir imagen lead); si persiste tras el fix de secuencias, revisar formato/credenciales Cloudinary (causa secundaria, no bloqueante).

## 2026-07-07 — Fix: garantías activas no aparecían en tab NC/Garantías (Producción)

### Problema reportado
El módulo Control de Taller, pestaña "NC / Garantías", mostraba (0) a pesar de existir garantías activas (G-0003 EN_ESPERA, G-0004 MEDICION).

### Causa raíz — regresión
`GET /api/odp/nc-garantias` (`getNcGarantias`) filtraba solo `es_no_conformidad: true`. El commit original `af118d2` (11-may) usaba `Op.or` con `es_garantia: true`; el refactor de egress `09e174e` (28-jun, ítem M5: unificación getGarantias/getNcGarantias en `buscarODPsEspeciales`) perdió la condición de garantías. Como `crearGarantia` setea `es_garantia: true` sin `es_no_conformidad`, las garantías nunca entraban en la respuesta.

### Fix aplicado (commit ce77ebf)
- `odp.controller.ts:193` — restaurado `{ [Op.or]: [{ es_no_conformidad: true }, { es_garantia: true }] }`.
- `ProduccionPage.tsx:134` — `ESTADOS_NC_ACTIVOS` ahora incluye `PEDIDO_PROVEEDOR` (antes una NC/garantía desaparecía del tab al pasar por ese estado). `activeStates` (tablero principal y botón "marcar listo") intacto.

### Verificación
- E2E con token efímero contra backend local: endpoint devuelve 20 registros (4 garantías + 16 NC). G-0003 y G-0004 visibles en el tab (estados activos de taller); G-0001/G-0002 en LISTO_INSTALAR quedan fuera por diseño del filtro frontend.
- Backend reinició sin errores de tipos; frontend typecheck "No issues found".

### Notas
- Impacto egress despreciable (~2-4 filas más en respuesta ya limitada a 100).
- Scripts sin commitear de sesión anterior siguen untracked: `fix_fecha_corte_importacion_2026-07-06.js`, `importar_buscador_leads_2026-07-06.js`.

## 2026-07-07 (2) — Imprimible SAP: faltantes deterministas + herencia de re-letrado

### Problema 1 — dimensión faltante pisaba la original en el imprimible
Al dividir por existencia (Compras → Pendientes), el imprimible SAP fusionaba original+faltante pero sin fusionar `dimension`: ganaba el registro que llegara primero de la API (sin ORDER BY, orden físico de PG). Verificado con SAP-7844 fila H.

**Fix (`PrintableSAP.tsx`):** merge determinista — el ORIGINAL manda siempre en CANT/código/dimensión/exist_perf; cada faltante aporta cantidad+dimensión a un badge FALTA en la columna EXIS. PERF. (fusionado con el texto de piezas). Badge movido de Descripción a EXIS. PERF. Componente `BadgeFalta` con estilos inline (lección CDN). Fallback para faltante sin par (badge solo, p.ej. fila R de SAP-7844 cuyo original fue re-letrado a B en una edición antigua).

### Problema 2 — el par original/faltante se rompía al editar el SAP
Editar ítems del SAP re-letraba el original sin que el faltante lo siguiera (causa raíz de la fila R huérfana), y los faltantes eran editables/borrables desde SAPModal.

**Fix (`sap.controller.ts` updateSAP):**
- Herencia de re-letrado en cascada vía `existencia_piezas.faltante_id` (updates por instancia → auditados), con guard anti-ciclo y de sap_id.
- Faltantes nunca se eliminan desde la edición del SAP; ediciones entrantes sobre ellos se ignoran; `es_faltante`/`existencia_piezas` no se pisan desde el formulario.

**Fix (`SAPModal.tsx`):** al editar, los faltantes salen de la tabla editable y se muestran en panel ámbar de solo lectura.

### Verificación
- Simulación del merge con datos reales (ambos órdenes de llegada → resultado idéntico).
- E2E real: SAP desechable con cadena original→f1→f2 (letra A) → PUT re-letrando a C → los 3 en C, ningún faltante borrado. Limpieza total incluida (datos + auditoría), sin tocar el consecutivo SAP.
- Typecheck frontend limpio; backend reinició sin errores.

### Notas
- Pares antiguos sin snapshot (pre-rework existencias, p.ej. SAP-7844) no se auto-reparan — decisión: se deja así, ya está en producción.
- CLAUDE.md: nueva regla de commits — solo commit+push cuando el usuario lo ordene explícitamente.

## 2026-07-07 (3) — Inventario perfilería: corrección de datos + edición de código en UI

### Corrección de datos (script one-off ejecutado)
- Consecutivo 10789: código PEP0301 → MOS0501 (pieza física era PERFIL MOSQUITERO).
- Consecutivo 10812: restaurado con PERF001 (6000 mm, C1) — había sido ingresado hoy con ANG0301 y eliminado a las 14:07. PERF001 = "PERFILERIA ESPECIAL", existe en catálogo.
- Script: `fix_inventario_10789_10812_2026-07-07.ts` — idempotente, transaccional, vía modelos Sequelize para que quede en auditoría (verificado: UPDATE e INSERT registrados en auditoria_log).

### Feature: edición de código desde la UI de inventario
Antes el endpoint PATCH solo aceptaba mm/ubicación — corregir un código requería script.
- **Backend** (`inventario_perfileria.controller.ts` updateInventarioItem): acepta `codigo` opcional, trim + MAYÚSCULAS, vacío → null. Sin validación dura contra catálogo (existen códigos legítimos fuera de él: JAM0201, SIL0204, "SIN CODIGO").
- **Frontend** (`InventarioPage.tsx`): celda CÓDIGO editable inline (mayúsculas automáticas) con feedback en vivo vía catalogoMap: nombre del producto en verde si existe en catálogo, aviso ámbar "No está en catálogo" si no (advierte, no bloquea).
- RBAC sin cambios (PATCH ya era admin/gerencia/compras). Auditoría automática por update de instancia.

### Verificación
E2E con pieza desechable (consecutivo 99999) + limpieza total: minúsculas→MAYÚSCULAS ✅, vacío→null ✅, PATCH solo mm/ubicación no toca código ✅. Typecheck frontend limpio.

## 2026-07-08 — CRM/Leads: última actividad, badges de ODP y filtro sin-ODP + fixes

### Fixes de calidad (2 bugs reales detectados al levantar el frontend)
- `DashboardGerencial.tsx`: tooltip de "Clientes Nuevos" usaba comillas dobles en vez de template literal → el usuario veía `${nuevos_clientes}` literal en pantalla. Corregido a backticks.
- `ComprasPage.tsx`: `odp?.estado_produccion || odpsInfo[0] && '' || ''` — término medio siempre muerto (precedencia). Simplificado a `odp?.estado_produccion || ''` (comportamiento idéntico).
- Resto de warnings ESLint (exhaustive-deps, no-unused-vars, etc.) documentados en `TECH_DEBT.md` para resolución incremental.

### Fix ProspectoModal — selección de cliente existente se borraba
`clienteSeleccionado` se derivaba de `clientes.find(...)` (resultados de búsqueda); al limpiar la búsqueda tras el clic, `clientes` se vaciaba → el nombre parpadeaba y desaparecía. Reemplazado por estado propio `clienteSel` (fuente de verdad independiente). Arregla también modo edición (el nombre no aparecía al abrir a editar).

### CRM Pipeline — filtro/orden por última actividad + denormalización
- `getLeads` (vista pipeline): **APROBADO** ahora se acota al rango de fechas (antes siempre visible), junto con PERDIDO/FRIO. El criterio pasó de `createdAt` a **última actividad** (`COALESCE(ultima_actividad, createdAt)`). Etapas activas (NUEVO→VISITA_TECNICA) siguen siempre completas.
- `sortByPriority` (frontend): orden secundario cambiado de `fecha_asignado` a `ultima_actividad` (más reciente primero); mantiene URGENTE arriba.
- **Deuda aplicada (denormalización):** nueva columna `leads.ultima_actividad` (migración `add_ultima_actividad_leads_2026-07-08.js`: ALTER + backfill 1352 leads + índice). Mantenida por hook `LeadEvento.afterCreate` en `models/index.ts` (usa `hooks:false` para no ensuciar auditoría; respeta la transacción del create). `getLeads` dejó de usar la subquery correlacionada `MAX(createdAt)`.
- Verificación: hook probado con transacción + rollback (sin residuo); filtro emulado sobre julio 2026 (28 aprobados visibles / 13 ocultos por actividad fuera de rango).

### CRM Pipeline — badges de ODP en tarjetas APROBADO
- `getLeads`: `include` de ODP (`id`, `numero_odp`) — LEFT JOIN, egress mínimo.
- Tarjetas Kanban de APROBADO: badge verde clickeable `✓ {numero_odp}` → abre `ODPFichaModal` in-place; badge rojo `⚠ SIN ODP VINCULADA` (pulsante) → abre `CrearODPModal` (reutilizado), refresca al crear. `GET /api/odp/:id` accesible por todo rol autenticado. 0 `odp_id` huérfanos verificados.

### CRM Pipeline — filtro contextual "solo sin ODP"
Chip contador-toggle en el header de la columna Aprobados (`⚠ N sin ODP` → activo `SIN ODP · N ✕`). Estado `soloSinOdp`, filtrado 100% frontend sobre `lead.odp` (cero egress), reset automático al salir de la etapa. Conteo desacoplado del toggle para mostrar el total real.

### Notas
- Sin tests automatizados: verificación por compilación (`tsc` backend/frontend limpios) + pruebas de datos deterministas contra BD + hook con rollback.
- Dashboards/reportes y vista "Sin Respuesta" NO tocados (siguen midiendo por `createdAt`/`fecha_creacion`).

## 2026-07-26 — KPI de facturación: caché sin invalidar + montos principales en NULL

Síntoma reportado: tras capturar los montos reales de las FE adicionales, el KPI "facturado en rango" no los sumaba. Al verificar aparecieron **dos fallos independientes**, ninguno en la lógica del KPI (que estaba correcta).

### Fallo 1 — la caché de KPIs nunca se invalidaba
`cacheRespuesta(30 min)` (introducido en `16bc8d5` para bajar egress) servía la foto anterior tras cada edición. `invalidarCacheRespuesta()` existía en `utils/cacheMemoria.ts` pero **no se llamaba desde ningún punto del código**. Confirmado en el log de morgan: tras `POST/DELETE /facturas-adicionales` y `PATCH /facturar`, los `GET /api/dashboard/general` respondían en ~1.2 ms desde caché.
- `odp.controller.ts`: helper `invalidarCacheKPIs()` → `invalidarCacheRespuesta('/api/dashboard')`, llamado tras commit en `facturarODP`, `agregarFacturaAdicional`, `eliminarFacturaAdicional`, y en `updateODP` **solo si cambió `valor_total`** (capturado antes del `odp.update()`, que muta el modelo en memoria — mismo patrón que `proveedorAnterior`). Cubre las dos salidas con commit de `updateODP`, incluido el early-return por PedidoPV pendiente.
- Coste en egress: un recálculo tras un cambio real de facturación, no por cada guardado de ODP.

### Fallo 2 — 3 ODPs facturadas aportaban $0 al KPI en silencio
ODP-24000 (FE 7332), ODP-24031 (FE 7331) y ODP-24120 (FE 7333) quedaron con `monto_factura_principal` NULL. Como `sqlFacturadoEnRango` hace `SUM`, el NULL se ignora → **$223.740.481 fuera del KPI, sin error visible**.
- Script `scripts/2026-07-26_fix_monto_principal_null.ts` (idempotente, excluye ODPs con FE adicionales para no romper el tope). **Ejecutado: 3 filas, 0 restantes en NULL.**
- Red de seguridad: `COALESCE(monto_factura_principal, valor_total)` en `sqlFacturadoEnRango()` y en la rama principal de `getPedidosFacturados`. El `WHERE` ya exige `factura_electronica IS NOT NULL`, así que el fallback solo aplica a facturas reales.

**Causa raíz — NO era la ventana de despliegue de `2d95d57` (primera hipótesis, descartada).** `updateODP` (formulario general de ODP) acepta `estado_facturacion`/`factura_electronica`/`fecha_factura` en `odpSchema` y los escribe sin setear el monto; solo `facturarODP` (modal de Contabilidad) lo hace. La auditoría de ODP-24000 lo confirma: UPDATE del 24-jul 21:02, `PENDIENTE → FACTURADA` con FE 7332 y monto NULL. **La ruta sigue abierta** — documentada en `TECH_DEBT.md` (2026-07-26) con 3 opciones de corrección, a la espera de decisión.

### Corrección del propio fix — el KPI quedó inflado
Asignar `monto = valor_total` a las 3 ODPs llevó julio a $430.768.658; el usuario lo identificó como falso de inmediato. El culpable era ODP-24000 (LABORATORIOS ECAR SA): `valor_total` $220.754.096, en `PROGRAMADA`, crédito aprobado, **$0 abonado** — el fallback asumió una FE por el total de una obra ni siquiera instalada.
- Decisión del usuario: dejar la FE 7332 en **0 explícito** (no NULL, que con el COALESCE volvería a contar el total) hasta confirmar la cifra con contabilidad. Script `scripts/2026-07-26_ajustar_monto_fe7332_odp24000.ts`.
- **KPI julio final: $210.014.562** (79 FE) — coherente con junio ($187.990.212) y mayo ($254.192.964).
- ODP-24031 ($2.206.385) y ODP-24120 ($780.000, con $600.000 abonados) siguen con `monto = valor_total`, pendientes de confirmación.

### Verificación (backend local contra Supabase, JWT firmado para las pruebas)
- `tsc --noEmit` limpio.
- Endpoint `/dashboard/general`: `facturado_rango = 430.768.658`. Caché **MISS → HIT** confirmada.
- Invalidación probada end-to-end con `PATCH /facturar` sobre ODP-24203 (PENDIENTE sin FE = no-op de datos): **HIT → MISS**, y la ODP quedó byte a byte igual.
- Modal de detalle cuadra con la tarjeta: 79 FE = 76 principales ($357.648.542) + 3 adicionales ($73.120.116).

### Notas
- Los montos que capturó el usuario cuadran exactos con el `valor_total` de ambas ODPs (ODP-23997 y ODP-24066) — el reparto entre meses ya funciona como se diseñó.
- **Lección:** migración y despliegue no son atómicos; un backfill previo al deploy deja huecos en las filas escritas durante la ventana. `SUM` con NULL no falla, resta en silencio.

---

## 2026-07-27 — Accesos directos a FE y abonos desde la ficha de la ODP (tab Imprimir)

### Requerimiento
Desde Contabilidad → Estado Caja, al abrir una ODP se llega a `ODPFichaModal`. El usuario pidió que en la tab **Imprimir ODP** aparezcan los dos controles que hoy solo existen en esa fila de la tabla —**FE No./Fecha** y **Registrar Abono**— para roles con acceso a su CRUD, sin tener que volver a la tabla. Alcance explícito: *"prácticamente como un acceso directo a los modales solicitados"*.

### Decisiones tomadas con el usuario (antes de tocar código)
- **Ubicación:** solo la tab Imprimir (se descartó header del modal y tab Financiero).
- **CRUD de abonos:** completo — registrar, editar y eliminar, vía un modal "Abonos (n)" para no contaminar el área imprimible.
- **Roles:** `admin`, `contabilidad`, `gerencia` — alineado con el RBAC del backend, sin asimetría con lo que ya pueden hacer en `/contabilidad`.
- **Arquitectura:** extraer los modales inline de `ContabilidadPage` a componentes compartidos (una sola fuente de verdad) en vez de duplicarlos.
- **Visibilidad:** replicar las reglas de la tabla — FE oculto en OA y garantías, Registrar Abono oculto si `estado_caja = CANCELADO`, lista de abonos siempre visible.
- **Fuera de alcance:** selector de Estado Caja y edición de Monto Total siguen solo en la tabla.

### Backend
**1. `utils/notificaciones.ts` — bug latente corregido.** `getODPListaIncludes` decía en su comentario *"debe coincidir exactamente con getODPs"* pero le faltaba `facturas_adicionales`, que `getODPs` sí incluye (`odp.controller.ts:159`). Consecuencia previa a este cambio: cualquier `emitirODPPatch` sobre una ODP con FE adicionales reemplazaba la fila de Contabilidad con un objeto sin ese array — el badge `+N` desaparecía y el modal FE abría con la lista de adicionales vacía.

**2. `emitirODPPatch(id,'update')` agregado en 6 controladores** que antes no emitían nada: `facturarODP`, `agregarFacturaAdicional`, `eliminarFacturaAdicional` (`odp.controller.ts`) y `registrarPago`, `editarPago`, `eliminarPago` (`contabilidad.controller.ts`). El hook global (`App.tsx` → `useSocketNotifications`) hace `clearODPCache(id)` al recibirlo, así la ficha se recarga sola y las tablas en vivo se parchean sin refetch de lista.

En `editarPago`/`eliminarPago` se **conservó** el `emitirCambio('contabilidad')` existente: cubre la tab "Pagos Recientes", que el patch por ODP no alcanza. Redundancia consciente.

**Sin cambios de BD, migraciones ni RBAC** — los endpoints ya autorizaban `admin, gerencia, contabilidad` y `GET /api/odp/:id` ya devolvía `monto_factura_principal`, `abono`, `pendiente`, `facturas_adicionales` y `pagos`.

### Frontend
**Nuevos — `features/contabilidad/components/`:**
- `contabilidad.utils.ts` — `fmt`, `fmtFecha`, `formatMiles`, `parseMiles`, `calcPendiente`, `headers`, `BANCOS_COLOMBIA`, `METODOS_PAGO`, `puedeGestionarCobros`.
- `FacturaElectronicaModal.tsx` — FE principal + saldo por facturar + CRUD de adicionales.
- `AbonoFormModal.tsx` — unifica los dos modales casi idénticos que había (registrar / editar); la prop `pago` gobierna el modo.
- `ConfirmarEliminarAbonoModal.tsx`.
- `AbonosODPModal.tsx` — listado de abonos de una ODP con editar/eliminar y totales (solo lo usa la ficha).

**Modificados:**
- `ContabilidadPage.tsx` — consume los componentes. **1578 → 1058 líneas (−520 netas: +52/−572)**, comportamiento idéntico: los `setOdps` optimistas pasaron a los callbacks `onSaved`/`onAdicionalesChange`, y el refresco tras abono (`fetchOdps` + `fetchResumen`) se centralizó en `refrescarTrasAbono`.
- `ODPTabImprimir.tsx` — barra con `[FE ✎] [Registrar Abono] [Abonos (n)]` a la izquierda de IMPRIMIR. Los modales se montan **fuera de `#printable-area`** para que su HTML no entre en la ventana de impresión.
- `ODPFichaModal.tsx` — pasa `currentUser` al tab (una línea).

### Decisión técnica: refresco por socket, sin `onRefresh`
Desde la ficha no se llama a ningún refetch manual tras guardar. El backend emite `odp_patch`, el hook global limpia la cache Redux de esa ODP y `ODPFichaModal` la recarga sola. Se descartó añadir un `onRefresh()` explícito porque dispararía un segundo GET de detalle redundante casi simultáneo. **Egress: ~1 query puntual por acción, cero refetch de listas de 500 ODPs.**

### Verificación
- `tsc --noEmit` backend: limpio.
- `tsc --noEmit` frontend: limpio.
- Build CRA de producción: OK (`main.ee656f5f.js`, 867.34 kB gzip).
- ESLint sobre los archivos tocados: 0 errores. Los warnings que quedan son preexistentes (iconos sin usar en `ODPFichaModal`, `token` en los `useEffect` de `ODPTabImprimir`, `canSeeOA` en el `useCallback` de `ContabilidadPage`). Los 5 componentes nuevos: 0 warnings.
- Sin referencias huérfanas tras el refactor (grep de los 22 identificadores eliminados).
- **Pendiente de prueba manual dirigida** (no hay tests automatizados): los 4 flujos en `/contabilidad` (registrar FE, agregar/eliminar FE adicional, registrar abono, editar/eliminar abono) y los 3 accesos directos desde la ficha.

### Nota
`npm run build` del frontend no corre en cmd.exe: el script usa sintaxis POSIX (`CI=false ... && cp`). Desde Git Bash funciona.

### Documentado, no corregido
Deuda técnica del CDN de Tailwind en los 5 flujos de impresión → `TECH_DEBT.md` (2026-07-27). Decisión del usuario: solo documentar en esta pasada.

---

## 2026-07-27 (2) — Rol Marketing: acceso de solo lectura a 11 módulos

### Requerimiento
Que el rol `marketing` (etiquetado "Marketing (Solo Lectura CRM)") pueda **ver** Dashboard, Prospectos, Órdenes ODP, CRM & Leads, Producción, Toma de Medidas, Instalaciones, Compras, Inventario Perfilería, Pedidos PV y Facturas vs Salidas — sin crear, editar ni eliminar nada.

### Hallazgos de la auditoría previa
1. **Marketing ya tenía acceso por URL a 3 módulos no solicitados**: `/contabilidad`, `/configuracion` y `/clientes` estaban en `AppRoutes` aunque no aparecían en el menú. Agujero preexistente.
2. **"Solo lectura" no existía en el backend**: ~16 endpoints de escritura sin `requireRole` (prospectos ×4, pedidos-pv ×3, no-conformidad, notas-producción, capturas-cotización ×3, imágenes det-SAP ×2, odp revisar-daño y garantía) eran invocables por **cualquier** autenticado.
3. **Al revés, 4 módulos de la lista daban 403 en lectura**: instalaciones (`LECTURA_GESTION`), inventario, toma-medidas (`/tm/panel`) y facturas-salidas (`PUEDE_VER`).
4. **Sockets sin cambios**: `emitirEvento` usa `io.emit` global, así que marketing recibe `data_changed` y `odp_patch` pese a no estar en `ROLES_VALIDOS` de `server.ts`.

### Backend
**Barrera central en `middlewares/authMiddleware.ts`** — tras resolver `req.user`, si el rol está en `ROLES_SOLO_LECTURA` y el método no es GET/HEAD/OPTIONS → 403 con mensaje contextual por módulo (deducido de `req.originalUrl`). Se eligió este punto y no `app.ts` porque `req.user` solo existe tras autenticar; y no ruta por ruta porque así quedan cubiertos los ~16 endpoints abiertos **y** cualquier ruta futura, sin tocar los permisos de ningún otro rol. `POST /auth/logout` no pasa por el middleware, así que marketing puede cerrar sesión. Se auditó que ningún POST del backend sea de lectura (búsquedas y exports son GET).

**Lectura ampliada** (agregado `marketing`): `rutas.routes.ts` (`LECTURA_GESTION` + `/odps-para-gestion`, `/programacion`, `/historial`, `/`, `/:id`), `inventario_perfileria.routes.ts` (3 GET), `documentos.routes.ts` (`/tm/panel`), `salidas_almacen.routes.ts` (`PUEDE_VER`). CRM no requirió cambios: ya usaba `ROLES_CRM_LECTURA`.

### Frontend
- **`utils/permisos.ts`** (nuevo): `ROLES_SOLO_LECTURA`, `esSoloLectura(rol)`, `useSoloLectura()`. Deliberadamente **no** incluye `asistente_administrativo`: ese rol sí escribe en algunos módulos y sus restricciones siguen siendo locales.
- **`services/httpInterceptors.ts`** (nuevo, montado en `App.tsx`): traduce cualquier 403 de escritura con mensaje de solo lectura en un toast legible. Red de seguridad por si algún control se escapa del filtrado visual.
- **`Sidebar.tsx`**: `marketing` agregado a 9 ítems (los 11 menos Dashboard y CRM, que ya lo tenían).
- **`AppRoutes.tsx`**: agregado en `/toma-medidas` e `/inventario`; **revocado** en `/contabilidad`, `/configuracion` y `/clientes`. `/clientes` y `/prospectos` compartían un mismo `RoleRoute` y hubo que separarlos.
- **Controles ocultos por módulo**: Instalaciones, Prospectos y Toma de Medidas (1 línea cada uno, reutilizando su `isReadOnly`/`soloLectura` existente); Compras (**la prop `soloLectura` de `ODCCard` estaba huérfana — nadie se la pasaba nunca**, más botones de crear ODC y de existencia); ODP lista (3 gates negativos del tipo `!['produccion','asistente_administrativo'].includes(rol)` por los que marketing sí pasaba); Producción (guards en `handleAddNote`, `handleSetColor`, `toggleCheck` + controles); Pedidos PV (guards + botones); Inventario (ingreso y acciones de fila); CRM (`puedeEditar` blindado); ficha ODP (croquis, relacionar TM, crear SAP, revisar daño).
- **Se dejan visibles a propósito**: botones de Imprimir, "Ver SAP" y "Ver detalles" de TM — son consulta. Si el modal de TM intentara guardar, el backend responde 403 y el interceptor lo explica.

### Verificación (backend local contra Supabase, JWT firmado para rol marketing)
- `tsc --noEmit` backend y frontend: limpios. Build CRA de producción: OK.
- **11/11 lecturas → 200**: odp, rutas/programacion, inventario-perfileria/stats, documentos/tm/panel, facturas-salidas/facturadas, pedidos-pv, crm, prospectos, produccion, compras/panel, dashboard/general.
- **15/15 escrituras → 403** con el mensaje contextual correcto (prospectos, pedidos-pv, notas, NC, revisar-daño, garantía, det-sap, pagos, facturar, PUT/DELETE odp, crm crear y cambiar estado).
- **No regresión**: con JWT de `admin`, `PATCH /odp/999999/facturar` → 404 y `POST /prospectos` → 201. El middleware no afecta a otros roles.

### Incidente durante la verificación
El `POST /prospectos` de la prueba de no-regresión con rol admin **creó un prospecto real** (id 168, sin cliente ni ODP, estado `en_gestion`) en la BD de producción. Se eliminó por SQL en el momento, con guardas `cliente_id IS NULL AND odp_id IS NULL` — 1 fila borrada, verificado a 0. El INSERT y el DELETE quedaron registrados en `auditoria_log`. **Lección: para probar no-regresión, usar endpoints que fallen por validación antes de escribir (como el 404 del `facturar`), nunca un POST que pueda tener éxito.**

### Estado
1 usuario `marketing` activo en producción (id 68, `redes`): los cambios le aplican en el próximo despliegue, incluida la pérdida del acceso por URL a contabilidad, configuración y clientes.

---

## 2026-07-27 — TM-0178: retorno de "Realizadas" a "Solicitadas" + causa raíz documentada

### Solicitud
El usuario reportó que la TM-0178 aparecía en el panel "Realizadas" del módulo Toma de Medidas y quería devolverla a "Solicitadas".

### Diagnóstico
Consulta directa a Supabase reveló que el caso no era lo que la UI sugería:
- Estado real: **`convertida`**, no `realizada`. El panel "Realizadas" agrupa ambos (`toma_medidas.controller.ts`, `getTMPanel`).
- **Sin fotos**: `medidas_json = []`, `croquis_url = NULL` — la visita nunca se realizó.
- ODP-24201 (id 427) en `VISITA_TECNICA` con `chk_medicion = false` → la ODP nunca avanzó. Todo el sistema era coherente con "visita pendiente"; solo el estado de la TM mentía.
- `fecha_visita = 2026-07-27`, prospecto 158.

**Causa raíz:** al aprobar el prospecto, `prospecto.controller.ts` marca **todas** las TMs del prospecto como `convertida` sin verificar si la visita se realizó. La TM quedó atrapada: en el panel Realizadas no hay botón "Retornar" (solo existe para `programada`) y `updateTM`/`deleteTM` rechazan estados distintos de `solicitada`/`programada`.

### Cambio ejecutado
**`backend-api/src/scripts/fix_tm_0178_2026-07-27.ts`** (nuevo, one-off, ya ejecutado) — `toma_medidas(id=199)`: `estado → 'solicitada'`, `fecha_visita → NULL`, `hora_visita → NULL`.

Decisiones de diseño del script:
- **Guardas de aborto** antes de escribir: TM inexistente, estado distinto de `convertida`/`realizada` (idempotencia ante doble corrida), o presencia de fotos/croquis (perderlas no era decisión automatizable).
- **Modelo Sequelize en vez de raw SQL**, para que disparen los hooks de auditoría — a diferencia del precedente `fix_tm_0116.ts`.
- Envuelto en `requestContext.run()` con `usuario_nombre: 'SCRIPT fix_tm_0178_2026-07-27'` y `userId: null`: trazable como mantenimiento sin atribuir el cambio a una persona real.
- **No se tocó** `odp_id` (427) — necesario para que al subir la foto `uploadFotoTM` avance la ODP a MEDICION —, ni `prospecto_id`, ni la ODP-24201, ni el prospecto 158.

Alcance decidido con el usuario: **solo TM-0178**. Se descartó por ahora corregir la causa raíz y agregar botón "Retornar" en el panel Realizadas; ambas quedaron documentadas en `TECH_DEBT.md`.

### Verificación (post-ejecución, contra Supabase)
- TM-0178 aparece en `solicitadas` (2 TMs) y **ya no** en `realizada`/`convertida`.
- ODP-24201 **no** se duplica como "ODP sin TM": el filtro de `getTMPanel` excluye solo ODPs sin ninguna TM, y la TM sigue vinculada (`num_tms = 1`).
- ODP-24201 sin cambios: `VISITA_TECNICA`, `chk_medicion = false`.
- `auditoria_log` id 25213: UPDATE sobre `toma_medidas` 199, `convertida → solicitada`.
- `npx tsc --noEmit` backend: limpio.

### Hallazgos colaterales (documentados en TECH_DEBT.md, no corregidos)
1. **Causa raíz del `convertida` prematuro** (severidad media). Además, el update masivo que lo provoca no dispara hooks de instancia, así que ese salto de estado **no quedó en `auditoria_log`** — el rastro se corta justo en el cambio que originó el problema. 4 TMs históricas comparten la inconsistencia (TM-0015, TM-0048, TM-0107, TM-0178); las 3 primeras tienen ODPs ya ENTREGADA/INSTALADA con `chk_medicion = true`, histórico cerrado.
2. **`auditoria_log.usuario_nombre` siempre NULL** (severidad baja). `app.ts` lee `decoded.nombre_completo` del JWT, pero `auth.controller.ts` firma el token solo con `{ id, rol }`. De 2.378 registros de los últimos 7 días, 2.218 tienen `usuario_id` y solo 1 tiene nombre (el escrito por este script). La trazabilidad dura no se pierde; el campo denormalizado sí.

### Estado
Cambios en working tree, sin commit (pendiente orden explícita). El usuario solo debe pulsar "Actualizar" en el panel de Toma de Medidas para ver la TM en Solicitadas.

---

## 2026-07-27 (b) — Inventario Perfilería: búsqueda por descripción + acceso de jefe/auxiliar de producción

### Solicitud
Ampliar el buscador de la vista Lista (que hoy cubre `#`, código y ubicación) para que también busque por descripción.

### Contexto técnico
La "Descripción" **no es un campo de `inventario_perfileria`**: es `catalogo_productos.nombre`, cruzado por `codigo` (`InventarioPerfileria.belongsTo(CatalogoProducto, { foreignKey: 'codigo', targetKey: 'codigo', as: 'catalogo' })`). Hasta ahora el frontend la pintaba desde una caché de catálogo en cliente.

Eso obligaba a resolverlo en backend: la lista está **paginada server-side** (649 piezas, LIMIT 200 = 4 páginas), así que un filtro en cliente solo habría mirado la página cargada, devolviendo resultados incompletos sin ningún error visible.

Se descartó buscar también en `catalogo_productos.descripcion` (decisión del usuario): solo 31 de 1.243 productos lo tienen lleno y su contenido no se muestra en pantalla, así que habría producido filas cuya Descripción visible no contiene lo buscado.

### Cambios

**`backend-api/src/controllers/inventario_perfileria.controller.ts`** — `getInventario`: tercera condición en el `Op.or` apuntando a `$catalogo.nombre$` con `Op.iLike`, e include del catálogo **solo cuando hay `search`**.
- `attributes: []` — el JOIN filtra pero no trae columnas: la respuesta JSON no cambia y el **egress se mantiene idéntico** (verificado: los ítems siguen trayendo solo `id, consecutivo, codigo, mm, ubicacion, fecha_corte, creado_en`).
- `required: false` (LEFT JOIN) — las piezas con código fuera del catálogo (3 de 280) siguen apareciendo al buscar por código o ubicación; con INNER JOIN habrían desaparecido.
- `subQuery: false` — sin esto Sequelize envuelve en subconsulta y el WHERE no ve el JOIN ("missing FROM-clause entry").
- Include condicional: sin búsqueda, la consulta queda idéntica a la anterior.
- El conteo no se infla: `belongsTo` + índice `catalogo_productos_codigo_unique` (confirmado en `pg_indexes`) ⇒ cada pieza cruza con un producto como máximo.

**`backend-api/src/routes/inventario_perfileria.routes.ts`** — los 3 GET pasan a usar la constante `LECTURA_INVENTARIO`, que suma `jefe_produccion` y `auxiliar_produccion`. Motivo: `AppRoutes.tsx` ya les daba acceso a `/inventario`, así que cargaban la página y recibían 403 con el toast genérico "Error al cargar inventario". Confirmado por el usuario que deben verlo. El CRUD (POST/PATCH/DELETE) **no** se amplió.

**`backend-api/src/middlewares/rbacMiddleware.ts`** — `auxiliar_produccion` agregado al tipo `RolUsuario` (requisito para compilar el `requireRole` de arriba). Avance parcial del drift RBAC 2026-07-10, anotado en `TECH_DEBT.md`.

**`frontend-web/src/features/inventario/InventarioPage.tsx`** — placeholder → "Buscar #, código, descripción o ubicación...". Nada más: `search` ya viajaba al backend con debounce de 400 ms.

### Verificación (backend levantado en puerto 3005 contra Supabase, JWT firmado por rol)
El puerto 3001 estaba ocupado por otra instancia del usuario (PID 16768); se levantó la de pruebas en 3005 en vez de matarla.

- **14/14 términos** con el mismo total que un SQL de referencia independiente (LEFT JOIN manual): `mosquitero` 4, `perfil` 11, `zoc` 10, `P-01` 55, `vidrio` 21, `U57` 9, `752` 1, `10946` 1, `MOSQUITERO MATE` 2, `a` 625, y varios con 0.
- Sin búsqueda → 649 piezas, 200 por página: idéntico al comportamiento previo.
- Payload sin objeto `catalogo` → egress intacto.
- No regresión: búsqueda por código, por código parcial, por ubicación y por consecutivo numérico siguen funcionando.
- Paginación con búsqueda: sin solapamiento entre páginas, `total` estable.
- `search` + filtro de ubicación combinados: OK.
- **RBAC 9/9**: `jefe_produccion` y `auxiliar_produccion` → 200 (antes 403), incluidos `/stats` y `/export`; `produccion`, `compras`, `marketing` → 200 sin cambios; `instalador` y `contabilidad` → 403, siguen bloqueados.
- `tsc --noEmit` backend y frontend: limpios.

### Nota sobre un falso fallo
La primera pasada marcó FAIL en la búsqueda numérica: el caso de prueba usaba el consecutivo 100, que **no existe** (el rango real es 752–10946). Repetida con consecutivos reales (752 y 10946): PASS. El código nunca estuvo mal; el test sí.

### Estado
Cambios en working tree, sin commit. Junto con la corrección de TM-0178 de la sesión anterior.

---

## 2026-07-27 (c) — ODP-24000 invisible en "Listas para instalar": el listado no filtraba por estado

### Síntoma reportado
La ODP-24000 estaba en LISTO_INSTALAR pero no aparecía en la tab "Listas para instalar" del módulo ODP.

### Causa raíz
El listado **no filtra por estado en el servidor**. `fetchTabData` (ODPListPage.tsx) pedía `GET /api/odp?page=1&limit=200` —sin filtro— y **después** repartía las filas entre tabs con `.filter()` en el cliente. `getODPs` ordena por `fecha_creacion DESC` y topa el limit en 200 (`Math.min(200, ...)`).

Con 380 ODPs no-garantía, la ODP-24000 (creada 2026-05-20) ocupaba la **posición 218**: nunca llegaba al navegador, así que no podía aparecer en ninguna tab. Tampoco la rescataba el buscador: en esa tab filtra solo lo ya cargado; el único buscador server-side es el de "Completadas", que fuerza `estados=INSTALADA,ENTREGADA`. La ODP era **inalcanzable desde el módulo**.

**No era un caso aislado — 4 ODPs invisibles:** ODP-24017 (PROGRAMADA, pos 201), ODP-24000 (LISTO_INSTALAR, 218), ODP-23982 (LISTO_INSTALAR, 236), ODP-23925 (PAUSADA, 296). Y empeoraba solo: cada ODP nueva empujaba el corte y hundía una más.

**Efecto secundario del mismo diseño:** los badges de las tabs se calculaban sobre esas 200 filas, así que el de "Completadas" mostraba 121 cuando había 296.

### Solución aplicada (opción A de 3 evaluadas)
Excluir del listado las ODPs terminadas, que son ~78% del total (296 de 380) y ya se consultan por el buscador server-side de su propia tab. Quedan 84 ODPs en curso: caben con margen amplio y el bug desaparece.

Se descartó **subir el límite** (el backend topa en 200, sube el egress y el problema vuelve en meses) y se pospuso el **filtrado real por tab en el servidor** (diseño correcto a futuro, pero toca tabs, paginación, contadores y el hook de socket-patch: mucha más superficie de regresión).

**`backend-api/src/controllers/odp.controller.ts`** — `getODPs` acepta `?excluir_completadas=true`:
```ts
whereClause[Op.and] = [{ [Op.or]: [
  { estado_produccion: { [Op.notIn]: ESTADOS_COMPLETADAS } },
  { tiene_dano_instalacion: true },
]}];
```
- Constante `ESTADOS_COMPLETADAS = ['ENTREGADA','INSTALADA']` ahora también en backend (debe seguir espejada con la del frontend).
- **La excepción del daño es indispensable:** las 2 ODPs con `tiene_dano_instalacion=true` están en estado INSTALADA. Excluir por estado a secas habría **vaciado la tab "Con Daños"** — regresión detectada al revisar los datos antes de escribir el filtro, no después.
- Es aditivo: sin el parámetro el endpoint se comporta igual que antes. `estado`/`estados` explícitos siguen teniendo prioridad.
- Devuelve `count_completadas` (COUNT sin includes, barato) para el badge, contando solo las que caen en esa tab (excluye las que tienen daño, igual que la segmentación del cliente).

**`frontend-web/src/features/odp/ODPListPage.tsx`**
- `fetchTabData` manda `excluir_completadas: true`.
- Nuevo estado `countCompletadas`, alimentado por la respuesta; el badge de "Completadas" lo usa en vez de contar filas locales (pasa de 121 a 296, el número real).
- Limpieza de paso: eliminada la variable muerta `fecha` en el filtro (warning preexistente de ESLint). Archivo ahora sin warnings.

### Verificación (backend en puerto 3005 contra Supabase, JWT admin)
- `excluir_completadas=true` → **count 84, rows 84**: todas las ODPs en curso llegan, nada queda fuera del corte.
- Las 4 antes invisibles ahora presentes: ODP-24000, ODP-24017, ODP-23982, ODP-23925.
- Las 2 con daño (INSTALADA) preservadas: ODP-24037, ODP-23958.
- Ninguna completada sin daño se cuela en el listado (0 encontradas).
- Segmentación replicando el filtro del frontend: Activas 49, Visita 1, **Listas 32** (antes 29), Con Daños 2 (antes 1).
- `count_completadas` = 296 ✓.
- **No regresión (5/5):** sin el parámetro → count 380 y sin campo extra; tab Completadas (`?estados=`) → 298; búsqueda server-side "24000" la encuentra; `estado` explícito gana sobre la exclusión (24); paginación coherente (84 → 2 páginas de 50).
- **Egress: −50,7%** por carga del módulo (659,3 KB → 324,9 KB), medido sobre el payload real de `rows`.
- `tsc --noEmit` backend y frontend limpios; ESLint del archivo tocado sin warnings.

### Nota de proceso
La primera corrida de pruebas dio falsos negativos: `TaskStop` cerró el shell pero **no el proceso node nieto**, así que el puerto 3005 seguía ocupado por la instancia anterior (código viejo) y el server nuevo moría con EADDRINUSE mientras las pruebas pegaban contra el viejo. Se detectó por la incoherencia (`count 380` con el parámetro puesto). Lección: tras `TaskStop` de un servidor, verificar el puerto y matar el PID explícitamente.

### Pendiente
Filtrado real por tab en el servidor (opción B) si el volumen de ODPs en curso se acerca a 200. Hoy hay 84.

### Estado
Cambios en working tree, sin commit.

---

## 2026-07-28 — Limpieza de Pedidos PV basura (6958 y 6889) + causa raíz de ODPs borradas fuera de la app

### Solicitudes
1. Levantar los servicios en local.
2. Verificar qué número de Pedido PV tenía la ODP-24129 → **6958**.
3. Que esa ODP no tuviera ningún Pedido PV.
4. Verificar por qué el PV 6889 aparecía sin ODP → y eliminarlo.

### Contexto: no existe forma de borrar un PV desde la aplicación
`pedido_pv.routes.ts` expone `POST /` y los PUT de gestión, pero **ningún endpoint DELETE**. Ambas eliminaciones se hicieron con scripts one-off, operando **por instancia Sequelize** (no SQL crudo) para que los hooks de `MODELOS_AUDITADOS` registraran el borrado.

### Caso 1 — PV 6958 de la ODP-24129 (id 6)
PV `PENDIENTE`, origen SISTEMA, sin ítems asignados; la ODP tampoco tenía ítems.

Se eliminó el PV **y** se limpiaron `odp.proveedor_vidrio` y `odp.numero_pedido_proveedor`. Lo segundo es indispensable: `updateODP` auto-crea un PV cuando `data.proveedor_vidrio && !proveedorAnterior`, así que dejar el proveedor con valor permitía que una edición que lo borrara y lo reasignara **regenerara el pedido**. Además `updateODP` hace `if (!data.numero_pedido_proveedor) delete data.numero_pedido_proveedor` — el formulario no puede limpiar ese campo, solo un script.

Efecto de negocio: el helper `odpsConPedidoPVSinProcesar` (odc.controller.ts) oculta los vidrios de una ODP en Compras mientras exista un PV PENDIENTE sin procesar. Al borrarlo, la ODP pasa a la ruta de Compras — sin efecto visible hoy porque no tiene ítems.

Script: `backend-api/src/scripts/2026-07-28_eliminar_pedidopv_6958_odp24129.ts`

### Caso 2 — PV 6889 huérfano (`odp_id IS NULL`)
**Causa raíz reconstruida desde `auditoria_log`:**
- `2026-06-02 13:38:28.583` — se crea ODP id=**255**, número ODP-24037 (log 11584).
- `13:38:28.852` — auto-create genera el **PV 6889** (id 388) con `odp_id=255` (log 11585).
- `14:14:53` — último UPDATE de la 255: seguía viva (log 11598).
- `18:07:23` — se crea ODP id=**256** con el **mismo número ODP-24037** y su propio PV 6890.
- **No existe registro `DELETE` de la ODP 255.**

La ODP 255 se borró **con SQL directo en Supabase**, no por `deleteODP`: (1) `deleteODP` usa `odp.destroy()` por instancia, que sí audita, y (2) elimina explícitamente los PedidoPV (`odp.controller.ts:1173`), así que el 6889 no habría sobrevivido. La FK `pedido_pv_odp_id_fkey` es `ON DELETE SET NULL`, de modo que el PV perdió el vínculo en vez de borrarse.

Era visible en "Por Gestionar" porque `getPorGestionar` filtra por estado/origen y hace **LEFT JOIN** con ODP (include sin `required: true`), así que muestra PVs sin ODP.

Script: `backend-api/src/scripts/2026-07-28_eliminar_pedidopv_6889_huerfano.ts` (con guarda extra: aborta si el PV dejó de estar huérfano).

### Hallazgo abierto — ODPs borradas fuera de la aplicación
Huecos de id en `odp` **sin `DELETE` en auditoría**: **227** (ODP-24010), **255** (ODP-24037) y **325**. Las borradas vía app (78, 116) sí tienen registro. Evade auditoría y deja el cascade a medias (la FK sola solo hace `SET NULL`). Los dos PVs basura eran síntomas de esto. **Sin resolver — requiere decisión sobre la práctica de borrar en la consola de Supabase.**

### Trampa detectada: el hook de auditoría es fire-and-forget
`registrarAuditoria()` (models/index.ts) llama `AuditoriaLog.create()` **sin `await` y con `.catch()` silencioso**. Un script que cierre la conexión o haga `process.exit()` de inmediato **pierde el registro** y la mutación queda sin rastro. Ambos scripts esperan y verifican que la fila exista antes de salir, y envuelven la lógica en `requestContext.run({...})` para que `usuario_nombre` no quede en NULL (`getContext()` devuelve nulls fuera de un request HTTP). Aplica a **cualquier script futuro que mute datos**.

### Verificación (consultas crudas independientes del output de los scripts)
- PV 6958 y 6889: ambos ausentes; `pedido_pv` 277 → **275**.
- `WHERE odp_id IS NULL` → **0 huérfanos** en todo el sistema (era 1).
- ODP-24129: `proveedor_vidrio` y `numero_pedido_proveedor` en NULL, 0 PVs.
- ODP-24037 (id 256) intacta con su PV 6890 VERIFICADO.
- Barrido de integridad sobre las 26 columnas `odp_id` del esquema: **0 registros apuntando a una ODP inexistente**. Los `odp_id NULL` de `leads` (1678), `prospectos` (77), `ordenes_compra`/`odc_items` y `toma_medidas` (59) son normales por diseño, no huérfanos.
- `MAX(numero_base)` = 7013 sin cambios: ninguno de los dos era el máximo, así que la numeración futura no se altera (quedan huecos en 6889 y 6958).
- Auditoría: logs **25584** (DELETE pedido_pv 3), **25585** (UPDATE odp 6), **25586** (DELETE pedido_pv 388), los tres atribuidos al script y con snapshot completo. `pedido_pv` está en `TABLAS_AUDITABLES` → **revertibles desde panel ROOT → Auditoría**.

### Pendiente
- Decidir qué hacer con la práctica de borrar ODPs por SQL directo (origen del problema).
- Revisar si las ODPs 227 y 325 dejaron restos (el barrido global no encontró más huérfanos, pero no se verificaron puntualmente).
- 5 ODPs con el mismo patrón que la 24129 (PV PENDIENTE sin ítems): ODP-24168 (6987), ODP-24199 (7003), ODP-24201 (7005), ODP-24202 (7006), ODP-24211 (7012). **No tocadas** — dos están en MEDICION y VISITA_TECNICA, probablemente sí necesitan su PV.

### Estado
Scripts ya ejecutados contra Supabase. No volver a correr (son idempotentes: detectan que el registro no existe y salen sin escribir).

---

## 2026-07-28 (b) — Egress Supabase: diagnóstico por bytes y Fase 1 de recorte

### Solicitud
Bajar el egress de Supabase a una meta de **150 MB/día** (plan Free, cuota 5 GB/mes) con 13 usuarios activos de 8am a 5pm. El consumo real seguía en **250–350 MB/día** pese a las optimizaciones del 24-jul.

### Diagnóstico: medir bytes, no tiempo ni filas

Se midió `pg_stat_statements` **agregado** (no el top 25, que fragmentaba la misma consulta en decenas de formas por la cardinalidad variable del `IN`) cruzado con `pg_column_size` real de cada tabla. 28 días acumulados desde 2026-06-30: 7,38 M filas devueltas en 475 k llamadas.

**La tabla `odp` es ~65% del egress.** Tiene **392 filas** y pesa 0,58 MB, pero devuelve **76.477 filas/día** — leerla completa 195 veces al día. Y su fila es gorda: **924 B en 60 columnas**, de los cuales cinco campos de texto son el 76%:

| Columna | Bytes/fila |
|---|---|
| `servicios_detalle` | 289 |
| `descripcion_pedido` | 234 |
| `croquis_url` | 109 |
| `direccion_instalacion` | 38 |
| `observaciones` | 30 |

Tres causas verificadas en código, no supuestas:
1. El listado pedía las 60 columnas.
2. **`ODPListPage` descargaba cinco includes que no usa** (`items`, `pagos`, `tomas_medidas`, `saps`, `facturas_adicionales`) para 200 ODPs: cero referencias en todo el archivo.
3. **`fetchTabData` ignoraba el parámetro `tab`**: mandaba los mismos params para las 4 tabs no-especiales (la segmentación es client-side) y colgaba del efecto de `activeTab` junto con `fetchGarantias()`. Navegar entre pestañas multiplicaba ×4–6 el mismo payload.

### Dos hipótesis descartadas con números

- **`SELECT * FROM "auditoria_log"`** (3 llamadas, 64.014 filas): es el botón **Backup** de ROOT (`root.controller.ts:383`), no la pestaña Auditoría, que sí pagina. Pero la fila pesa **931 B**, no 2–5 KB → ~57 MB en 28 días ≈ **0,7%**. Tres eventos puntuales no explican una curva diaria sostenida.
- **El detalle de ODP con 15+ JOINs**: 19.205 filas ÷ 2.238 llamadas = **8,6 filas por llamada** ≈ 0,7 MB/día. Encarece CPU, no egress.
- **`pg_timezone_names`** (#1 por `total_exec_time`, 143 ms × 242): **no la emite el ERP** — verificado que ni `sequelize` ni `pg` la contienen en `node_modules`. La emite el **dashboard de Supabase Studio**, igual que `pg_available_extensions`. 289.432 filas de ~20 B ≈ 0,2 MB/día. Lección: **`total_exec_time` mide CPU, el egress se aproxima por filas × ancho de fila**.

### Cambios

**Backend**
- `odp.controller.ts` — `?vista=lista|produccion` en `getODPs` y `buscarODPsEspeciales`, vía `construirVistaODP()`. **Sin el parámetro la respuesta es idéntica a la histórica**, así que `PedidosPVPage` (que sí usa `odp.items` en su modal de crear) sigue igual. `lista` = allowlist de 18 columnas planas y ningún include separate; `produccion` = `exclude` de 8 columnas, con `items` reducido a 7 campos y sin `pagos`/`facturas_adicionales`.
- `notificaciones.ts` — `invalidarCacheListadosODP()` enganchado en `emitirODPPatch` y `notificarCambioEstadoODP`. Se eligieron esos dos puntos porque **ya pasa por ahí toda escritura de ODP** (17 llamadas en 3 controladores), así que cubre también los endpoints que se agreguen después.
- `odp.routes.ts` — `cacheListados(90 s)` en `GET /`, `/garantias/all` y `/nc-garantias`. Envuelve a `cacheRespuesta` **dejando pasar las búsquedas sin cachear**: el store se acota por número de entradas, no por peso, y cada término de búsqueda es una clave de un solo uso que desalojaría las entradas compartidas entre los 13 usuarios.
- `root.controller.ts` — `descargarBackup` excluye `auditoria_log` salvo `?incluir_auditoria=true`.

**Frontend**
- `ODPListPage.tsx` — un único estado `listado` en vez de `tabData` por tab; carga una vez al montar; `fetchGarantias` en su propio efecto. Pide `vista: 'lista'`.
- `ODPListPage.tsx` — `abrirConDetalle(id, setter)` refetchea por id (`fetchODPById`) antes de abrir **ODPForm, SAPModal, COTModal y TMModal**. **Imprescindible**: `ODPForm` reenvía en el `PUT` todo lo que recibe, así que abrirlo con el objeto ligero del listado habría **borrado** `descripcion_pedido`, `servicios_detalle` e `items` al guardar — el mismo bug que ocurrió con `descripcion_contexto` en el CRM. `COTModal` y `TMModal` además leen `direccion_instalacion`, `tipo_servicio` y los datos de quien recibe.
- `ProduccionPage.tsx` — `vista: 'produccion'` en el listado y en `nc-garantias`.

### Resultado medido (bytes HTTP reales contra la BD de producción)

| Endpoint | Antes | Después | Δ |
|---|---|---|---|
| ODPListPage (200 ODPs) | 336,8 KB | **64,5 KB** | **−81%** |
| Producción (tablero) | 652,0 KB | **416,2 KB** | **−36%** |
| `nc-garantias` | 58,0 KB | **43,3 KB** | **−25%** |
| Backup ROOT | — | — | **−32,7 MB por click** |

A eso se suma el recorte de **frecuencia**: ODPListPage pasa de 4–6 cargas por sesión a 1, y la caché colapsa las cargas concurrentes (2ª llamada: 1518 ms → 15 ms, `X-Cache: HIT`).

### Verificación ejecutada
- `tsc --noEmit` backend y frontend: **EXIT 0**. `npm run build` backend: **EXIT 0**.
- Payloads medidos contra la BD real (tabla de arriba), no estimados.
- Caché: `MISS → HIT → (invalidar) → MISS` con contador de lecturas confirmando que la 2ª no consulta la BD.
- Búsquedas (`?search=`): confirmado que **nunca** entran al store.
- Perfil `produccion`: los 9 `chk_*`, `descripcion_pedido`, `direccion_instalacion`, `observaciones`, `tipo_servicio`, `color_taller`, `tiene_aluminio`, `odp_padre_id` presentes; `servicios_detalle`/`croquis_url`/`nombre_recibe` ausentes; `items` con 7 campos, `tomas_medidas` y `saps` presentes, `pagos` ausente.
- Detalle por id (`GET /api/odp/:id`): conserva los 9 campos que `ODPForm` reenvía + los 28 campos del ítem → **editar no puede borrar datos**.
- Backup: 10,92 MB, sin un solo `INSERT INTO "auditoria_log"`.

### Pendiente de verificación manual (requiere navegador)
Recorrer las 6 pestañas de ODP y confirmar badges/orden/paginación; **editar una ODP con `descripcion_pedido`, `servicios_detalle` e ítems, guardar y confirmar que los tres sobreviven**; tablero de Producción (checks, panel de cristales, ODPMatrixModal) y liveness entre dos navegadores; modal de crear en Pedidos PV.

### Nota de entorno
`npm run build` de `frontend-web` **no corre en Windows**: el script es `CI=false react-scripts build`, sintaxis POSIX que cmd.exe no interpreta (falla con `"CI" no se reconoce`). Es **preexistente**, ajeno a estos cambios. Alternativa que sí funciona: `CI=false npx react-scripts build` desde Git Bash.

### Apéndice — regresión en la matriz de taller y retiro del formato

**Regresión introducida y corregida el mismo día (commits `dba64ee` → `e9490ac`).** El include de `items` del perfil `vista=produccion` se derivó de los campos que pinta el panel de cristales (`cantidad`, `tipo_vidrio`, `espesor`, `ancho_mm`, `alto_mm`), pero `ODPMatrixModal` recibía el objeto del listado y usaba cinco columnas más: `pulidos`, `perforaciones`, `boquetes`, `descuentos` y `otros`. La matriz imprimible habría salido con esas cuatro columnas vacías — y son **instrucciones de fabricación**, no adorno: un cristal cortado sin su perforación o con el canto equivocado se rehace.

**Causa del fallo de verificación:** al derivar las columnas del perfil se revisaron los campos de `odp` que consume ese modal, pero no los de la asociación `items`. **Regla para la próxima vez: al recortar un include hay que enumerar los campos de la entidad anidada en cada componente que la reciba, no solo los de la entidad principal.**

**Decisión posterior del usuario:** el enlace "Ficha completa →" del panel de Cristales no se usa. Se retiró el formato completo:
- Eliminado `frontend-web/src/features/produccion/components/ODPMatrixModal.tsx` (223 líneas), su import, el estado `selectedODPDetail` y el enlace del panel.
- Con eso quedaron sin consumidor 9 campos del perfil `produccion`: `descripcion_pedido`, `direccion_instalacion`, `observaciones` y `tipo_servicio` de la ODP, más los 5 acabados del ítem. Todos excluidos.
- Verificado que `ProgramacionWhatsAppModal` usa cuatro de esos campos pero los obtiene de **su propio endpoint** (`/api/rutas/programacion`), no del listado.

**Efecto:** el tablero de Producción pasa de 439,8 KB a **337,8 KB** por carga — **−48% frente a los 652,0 KB originales**, contra el −33% que tenía antes de este retiro.

---

## 2026-07-31 — Imprimibles: causa raíz del "formato incorrecto" y unificación de la Orden de Producción

### Síntoma reportado
Varios usuarios: "los imprimibles no están en el formato correcto". El dato que resolvió el caso lo dio el usuario: **se ve bien en el tab Imprimir, pero al dar clic en IMPRIMIR cambia el formato**; a una asesora le sale bien y a él no; y **con su mismo usuario le sale bien en la PC de casa y mal en la del trabajo**. Mismo código, mismos datos, mismo rol → el factor era la **red**, no las plantillas.

### Causa raíz
Los 5 puntos de impresión abrían una ventana nueva con `window.open` + `document.write` e inyectaban Tailwind desde **`https://cdn.tailwindcss.com`**, disparando `window.print()` con un **`setTimeout` fijo de 800 ms**. Esa ventana **no hereda el CSS de la app**. Si el CDN no respondía dentro de esos 800 ms (red corporativa que lo bloquea, proxy, caché fría), el documento se imprimía **sin estilos**: los bordes de tabla sobrevivían porque iban en un `<style>` incrustado, pero todo el maquetado (`flex`, anchos, tamaños) se perdía.

Dos fallos secundarios del mismo diseño:
- La ventana nace como `about:blank`, así que **`/assets/images/logotemplex.png` (el logo) no resolvía** de forma fiable.
- `min-h-[29cm]` es **alto A4** dentro de una hoja **Carta** (27,94 cm) → **hoja extra en blanco** en cada impresión. Solo `PrintableTalonario` lo neutralizaba.

### Cambios

**Nuevo `frontend-web/src/utils/printWindow.ts`** — helper único `abrirVentanaImpresion()`:
- **Clona los `<style>` y `<link rel=stylesheet>` que la app ya tiene cargados** (en prod `/static/css/main.*.css`, en dev los `<style>` de webpack). Mismo origen: sin dependencia de internet.
- Inyecta **`<base href="{origin}/">`** → el logo y los assets resuelven siempre.
- Imprime en el evento **`load`** (espera CSS **e imágenes**), con respaldo de 4 s; ya no a ciegas.
- Cierra en **`afterprint`**, no por temporizador → deja de cortar el diálogo de impresión.
- Si el navegador bloquea el popup, avisa con un toast en vez de fallar en silencio.

**Migrados los 5 puntos:** `ODPTabImprimir.tsx`, `ComprasPage.tsx`, `PedidosPVPage.tsx`, `InstaladorView.tsx` y `instalaciones/utils/printDocument.ts` — este último era el más expuesto: no llevaba **ningún** `<style>` propio, así que sin CDN salía como texto plano.

**Hoja a Carta** (decisión del usuario: todo Carta, ignorando el A4 apaisado que declara `ORDENES AZULES.xlsx` y el Legal de `FORMATO DE GARANTIA.xlsx`). Se generalizó la receta que ya funcionaba en `PrintableTalonario` — en `@media print`: `width: 100%` y `min-height: unset` — a `PrintableProduccion`, `PrintableGarantia`, `PrintableNoConformidad`, `PrintableDetalleTecnico`, `PrintableDetSAP`, `PrintableSAP` y `PrintableOA`. Los seis primeros **no declaraban `@page`**. `PedidosPVPage` pasó de `A4` a `letter`.

**Unificación de la Orden de Producción (a pedido del usuario).** Existían **dos** componentes para el mismo documento:
- `PrintableProduccion.tsx` → botón OP de la ficha ODP. Columna `VERIFICACIÓN`, **sin precios** (fiel a `Orden de Produccion.xlsx`).
- `PrintableOP.tsx` → OP de `InstaladorView` y `ConductorView`. Columna `VALOR` + `SUBTOTAL/IVA/VALOR TOTAL` + `FORMA DE PAGO`, es decir **mostraba el precio de venta al instalador y al conductor**, pese a rotular en el pie "SECCIÓN EXCLUSIVA PARA PRODUCCIÓN Y DESPACHO".

`InstaladorView` y `ConductorView` ahora apuntan a `PrintableProduccion`. **`PrintableOP.tsx` eliminado** (440 líneas, ya sin referencias). No se pierde información: `PROVEEDOR VIDRIO` y `PEDIDO N°` ya estaban en `PrintableProduccion` dentro de la grilla inferior (`PEDIDO EXTERNO`). Sí cambia la paginación: de 10 ítems por hoja a 10 en la primera y 18 en las siguientes.

### Lo que NO se tocó — y por qué
El usuario aportó capturas de su Ord. Compra y su OP reales. **Su formato ya es el correcto** y no coincide con ninguna de las dos plantillas de `Formatos/`: es una evolución de ambas (sin la columna `PLAN`, con `SUBTOTAL/IVA/TOTAL`, con una columna `PROV` que ninguna plantilla oficial tiene). Se descartó la fase de "alinear contra las plantillas Excel de 2021": habría roto un formato en uso. **Columnas, totales, textos y el pie `VTS-2026-003` quedan intactos.**

**Corrección a un diagnóstico previo dado en esta sesión:** se afirmó que el talonario "no imprime ningún total"; es falso — `PrintableTalonario.tsx:233-251` sí genera SUBTOTAL/IVA/VALOR TOTAL. El error salió de opinar sobre un tramo del archivo que no se había leído.

### Verificación ejecutada
- `npx tsc --noEmit` frontend: **EXIT 0**.
- `CI=false npx react-scripts build` (Git Bash): **OK**. Bundle **−3,69 kB** por el retiro de `PrintableOP`.
- `grep` confirma **cero** referencias a `cdn.tailwindcss.com` fuera del comentario que documenta el porqué.
- Confirmado en el CSS compilado (`main.0ba20770.css`) que las clases de los imprimibles (`21.5cm`, `29cm`, `27.9cm`, `print:min-h-0`, `print:overflow-visible`, `flex`, `w-1/3`) **están presentes** → al clonar el stylesheet, la ventana de impresión tiene el mismo Tailwind que la pantalla.
- Verificado que el warning `Unexpected Unicode BOM` de `PedidosPVPage.tsx` es **preexistente** (mismos bytes en HEAD).

### Pendiente de verificación manual (requiere navegador e impresora)
Imprimir de verdad cada formato **desde la PC del trabajo**, que es donde fallaba: Ord. Compra, OP, Det. Técnico, Det. SAP, Garantía, No Conformidad y SAP; ODC en Compras; Pedido PV; y OP/Det. Técnico/SAP/Det. SAP desde Instalador y Conductor. Confirmar en cada uno: **estilos correctos, logo visible y sin hoja extra en blanco**.

### Hallazgos documentados, NO corregidos (a la espera de decisión)
- `PrintableNoConformidad.tsx:85` imprime `ODC (Solicitud): {odp.numero_odp}` — **repite el número de ODP en el campo ODC**. La plantilla oficial lleva ahí el ODC y su proveedor (`ODC: 3995 VITELSA S. A`), y además tiene un campo `FE` que el componente no reproduce.
- `Formatos/FORMATO DE MANTENIMIENTOS.xlsx` ("ORDEN DE SERVICIO DE MANTENIMIENTO", con consecutivo propio) **no tiene imprimible en el sistema**.
- La ventana de impresión sigue clonando el `<link>` a Google Fonts (`Plus Jakarta Sans`). Es externo, pero si no carga solo cambia la tipografía, no el maquetado; el respaldo de 4 s evita que cuelgue.

### Apéndice — Control de Taller: el clic que no marcaba

**Reporte:** "en Producción, al dar clic en cambiar color o en un check (medición, aluminio, vidrio…) no lo está realizando".

**Descartado primero** (con datos reales, no por lectura): no era el recorte de egress — se pidió `GET /api/odp?vista=produccion` con un token de `jefe_produccion` y **todos** los campos que necesita `isColApplicable` llegan (`tiene_aluminio`, `matizado`, `pelicula`, `huacal`, `carton`, `chk_*`, `color_taller`, más `items`, `tomas_medidas` y `saps`). Tampoco era el esquema (`odpSchema` acepta los 9 `chk_*` y `color_taller`) ni el socket (`emitirODPPatch` hace `findByPk` sin `attributes`, devuelve la fila completa).

**Causa real:** en `ProduccionPage.tsx` la celda de una etapa **no aplicable** se pintaba como un `—` **sin `onClick`**. Como el `<tr>` sí tiene `onClick={() => handleSelectOdp(odp)}`, el clic **burbujeaba y abría el panel de detalle** en vez de marcar. Para el operario eso es exactamente "hice clic y no marcó".

**Magnitud medida sobre las 100 ODPs del tablero:** de 900 celdas, **665 (73,9%) no respondían**; **14 ODPs no tenían ni una sola celda marcable** — las mismas que en la captura del usuario salían con todo `—` (ODP-24221, 24215, 24211, 24181, 24177, 24129, OA-3836 y 7 ENTREGADAS). El motivo en todas: `items=0, tomas_medidas=0, saps=0` y las cuatro banderas de acabado en `false`.

**Corrección (decisión del usuario: explicar, no permitir):** nueva función `getMotivoNoAplica(odp, key)` — espejo de `isColApplicable` — y la celda `—` pasa a tener `title` + `onClick` con `stopPropagation()` que muestra el motivo concreto por toast (`toastId` por ODP+columna para no apilar duplicados si se insiste). **Ninguna regla de negocio cambió**: lo que no se podía marcar sigue sin poder marcarse. Efecto secundario buscado: el clic en una celda `—` ya no abre el panel de detalle; el resto de la fila sí lo sigue abriendo.

**Verificación:** `tsc --noEmit` **EXIT 0**; dev server "No issues found". Validación contra las 100 ODPs reales: de las **665** celdas mudas, **665 reciben el motivo correcto**, 0 incoherentes y 0 cayeron al mensaje genérico. Cobertura por columna: cartón 100, huacal 99, matizado 98, película 86, corte 71, ensamble 71, medición 65, herrajes 41, vidrio 34.

**Sin probar end-to-end a propósito:** el backend local apunta a **Supabase de producción** y marcar un `chk_*` dispara la transición automática de estado (`odp.controller.ts:998-1050`), que podría pasar una ODP real a `LISTO_INSTALAR` y emitir sockets. Queda pendiente que el taller confirme si en una ODP **con** ítems (p. ej. ODP-24182 u ODP-24190) el marcado funciona; si ahí también falla, hay una segunda causa aún no identificada.

**Hallazgo aparte, NO corregido (a la espera de decisión):** `asistente_administrativo` (1 usuario activo) entra al tablero por `AppRoutes.tsx:58` pero el backend le rechaza **todo** con 403 — ni checks ni color — porque no está en el `requireRole` de `odp.routes.ts:55`. A `root` le pasa lo mismo: falta en ese `requireRole` y en el `esAdminOGerencia` de `odp.controller.ts:726`. Confirmado además que **no existen usuarios con rol `auxiliar_produccion` ni `taller`** en la BD, así que el drift de RBAC documentado en `CLAUDE.md` no afecta a nadie hoy.

**Permisos del tablero — `asistente_administrativo` (decisión del usuario: no debe poder marcar).**

Al mapear las 8 escrituras del tablero se confirmó que **5 ya estaban correctamente ocultas** para ese rol: los flags `puedeMarcarEntregada`, `puedePV` y `puedeMarcarListo` (`ProduccionPage.tsx:280-282`) no lo incluyen y sí se aplican en el render (líneas 698, 800, 810, 1365, 1410). El alcance real era menor de lo estimado en el plan: solo **checks y color** quedaban expuestos, bloqueados únicamente por `soloLectura`, que cubre `marketing` pero no a este rol.

Agregado el flag `puedeEditarTaller`, **espejo del `requireRole` de `PUT /api/odp/:id`**: `['admin','gerencia','asesor_comercial','jefe_produccion','produccion']`, con `!soloLectura` por delante. Sustituye a `soloLectura` en `toggleCheck` y `handleSetColor`, y en el render del check y del selector de color. En vez de dejar el control muerto, ambos avisan por toast (`avisarSinEdicion`, con `toastId` único): «Tu rol puede consultar el tablero de producción, pero no modificar las etapas ni el color.» El cursor pasa a `cursor-help` y el `title` lo anticipa al pasar el mouse.

**Las notas siguen habilitadas** para el rol: `POST /api/notas-produccion` (`nota_produccion.routes.ts:8`) no declara `requireRole`, así que el backend sí las acepta; `handleAddNote` conserva su guard por `soloLectura` (solo frena a `marketing`).

No se tocó el backend: el 403 es el comportamiento deseado. El cambio es que la UI deja de ofrecer acciones condenadas a fallar.

**Verificación:** `tsc --noEmit` **EXIT 0**; dev server "No issues found". Script que cruza los roles reales de la BD contra el `requireRole` del backend y el nuevo flag: **6 roles activos, 0 desalineados** — `admin`(3), `gerencia`(1), `jefe_produccion`(1) y `produccion`(1) editan y el backend los acepta; `asistente_administrativo`(1) y `marketing`(1) solo consultan de forma coherente. `taller` y `auxiliar_produccion`, sin usuarios hoy, también quedan coherentes (UI=consulta / backend=403) si algún día se crean.

**Nota de proceso:** el apéndice anterior se escribió por error en `frontend-web/SESSION_LOG.md` porque el `Set-Location` del build dejó el cwd desplazado y el heredoc usó ruta relativa. Se movió el contenido a la raíz y se eliminó el archivo duplicado. Reincidencia de lo anotado en `memory/feedback_cwd_rutas_absolutas.md`: **usar siempre rutas absolutas también en los heredoc de Bash**, no solo en Write/Edit/Read.

### Apéndice — Compras: columna Asesor en el modal «Nueva ODC Consolidada»

**Petición:** agregar la columna del asesor de la ODP al modal de ODC consolidada.

**Archivo correcto identificado sin ambigüedad** (el módulo tiene tres modales parecidos): `ODCModal.tsx` es «Nueva ODC Consolidada»; los otros son `ODCSinSAPModal` («Nueva ODC sin SAP») y `ODCVidriosModal` («Nueva ODC de Vidrios»). Este último **ya tenía** la columna Asesor, así que se replicó su patrón en vez de inventar uno nuevo.

**Cambio (solo UI, un archivo):** columna `ASESOR` como última de la tabla de detalle —después de `CLIENTE`, igual que en el modal de Vidrios—, con `item.SAP?.ODP?.asesor?.nombre_completo`, mismo estilo (`text-slate-400 text-[10px] truncate max-w-[160px]`, `w-40` en el `th`), fallback `—` y `title` para ver el nombre completo si se trunca. La tabla queda: DIMENSIÓN · CANT. · UND · OBSERV. · SAP · ODP · CLIENTE · ASESOR.

**Sin backend, sin BD, sin impacto en egress:** el dato ya viajaba y se descartaba. El tipo `SAPItemConContexto` ya declaraba `asesor: { id, nombre_completo }` (línea 30) y `GET /api/compras/panel` ya lo incluye (`odc.controller.ts:234`).

**Verificación:** `tsc --noEmit` **EXIT 0**; dev server "No issues found". Contra la BD real vía el endpoint: **28 de 28 ítems pendientes (100%) traen asesor**, de 5 personas — Bryam Arrubla (22), Alejandro Ardila (2), Nataly Londoño Arias (2), Alba Lucia Castro (1), Paola González (1); nombres de 13 a 20 caracteres, holgados para `w-40`. Validación estructural de la tabla: **8 `<th>` = 8 `<td>`**, sin descuadre de columnas.

---

## 2026-08-01 — Impresión: el fix del 31-jul funcionaba en local y fallaba en producción

**Síntoma reportado:** la Orden de Producción sigue saliendo sin formato al imprimir, pero **solo desde producción**; en local se ve correcta. Sospecha inicial del usuario: que el commit del 31-jul no se hubiera subido o desplegado.

### Hipótesis del deploy: descartada con evidencia

`origin/main` y `HEAD` local coinciden en `57cc0a2`, sin commits pendientes. Verificado además contra el sitio real: el bundle `main.b205253d.js` de `vidriostemplex-system.pages.dev` **contiene** el toast nuevo («Habilita las ventanas emergentes para este sitio»), `afterprint` y `base href`, y **no contiene** `cdn.tailwindcss.com` ni `PrintableOP`. El build local reprodujo incluso el mismo hash de CSS (`main.0ba20770.css`) que está desplegado. El código nuevo estaba en producción.

### Causa raíz — se cambió el origen del CSS, no el momento del `print()`

El fix del 31-jul sustituyó el CDN de Tailwind por un clon del `outerHTML` de las hojas de la app. Eso se comporta distinto en cada entorno:

- **`npm start`:** webpack inyecta el CSS como `<style>` **inline**; clonar el `outerHTML` copia las reglas dentro del HTML → se aplican de forma síncrona. Siempre funciona.
- **Producción:** el CSS es `<link href="/static/css/main.*.css">` de **124 KB**; el clon copia solo la **referencia** y la ventana debe descargarla.

Y en `printWindow.ts:88-89` el disparo era:

```js
if (win.document.readyState === 'complete') imprimir();
else win.addEventListener('load', imprimir);
```

Una ventana `about:blank` **ya reporta `readyState === 'complete'`**, y tras el `document.write()`/`close()` síncrono lo sigue reportando: se tomaba siempre la rama inmediata y se imprimía antes de que la hoja existiera. El `load` que sí habría esperado el CSS nunca llegaba a registrarse.

**Reproducción determinista** (Brave headless + servidor local que sirve el CSS con 150 ms de retardo, replicando el `<link>` de producción):

```
[ANTES ] readyState tras document.close(): "complete"
[ANTES ] print() disparado por: rama readyState==="complete" (inmediata)
[ANTES ] font-size de .text-xs: 16px   (correcto = 12px)  -> SIN FORMATO
[DESPUES] font-size de .text-xs: 12px                     -> CON formato
```

### Cambio (un solo archivo: `frontend-web/src/utils/printWindow.ts`)

Se deja de clonar y de descargar: se leen las reglas que el navegador **ya tiene en memoria** (`document.styleSheets` → `cssRules`, accesible por ser del mismo origen) y se incrustan inline, respetando el orden del documento para no alterar la cascada.

- `recolectarEstilos()` — una pieza por hoja, en orden. Cada hoja en su `try/catch`: si es cross-origin y `cssRules` lanza `SecurityError`, se conserva su `<link>` original como respaldo.
- `neutralizarCierre()` — escapa `</` por si alguna regla contiene `</style>` dentro de un `content:`.
- `esperarImagenes()` — sustituye la comprobación de `readyState`. El CSS ya viaja incrustado, así que lo único que puede faltar es el logo; se espera a que las imágenes terminen (cargadas o fallidas), manteniendo el respaldo de 4 s.

Comprobado antes de inlinear que el CSS de producción **no contiene ninguna `url()`**, de modo que no hay rutas relativas que se rompan al sacar las reglas de su archivo.

### Verificación ejecutada

- `tsc --noEmit` **EXIT 0** · build de producción **EXIT 0**.
- Contra el **CSS real descargado de producción** (124 KB): `.text-xs` pasa de 16px (sin formato) a **12px**; **1520 de 1520 reglas** presentes en el documento destino; el bloque **`@media print` se preserva** (origen 1 = destino 1) — crítico porque ahí vive `@page`. Coste: 126,2 KB serializados en **18,6 ms**.
- Barrido de puntos de impresión: los 5 que usan el helper quedan cubiertos sin tocarlos (firma intacta). `Lightbox` y el croquis de `ODPTabProduccion` abren ventana pero solo con una imagen y estilos propios inline; `COTModal`, `TMModal` y `ProduccionPage` imprimen la página actual vía `@media print`. Ninguno sufre este bug.

### Lección

El fix del 31-jul se validó en local, donde el modo de entrega del CSS **oculta** la clase de fallo. Cuando un cambio depende de cómo el bundler entrega los assets, probarlo en `npm start` no es prueba: hay que servir el `build/` de producción. Anotado también que `npm run build` en Windows puede devolver exit 0 sin construir — usar `CI=false npx react-scripts build` desde Git Bash.

### Nota

En el comentario del código queda anotado que en producción emotion (MUI) inserta sus reglas por CSSOM dejando los `<style>` vacíos, con lo que clonar `outerHTML` tampoco copiaba nada de MUI; el cambio también lo cubre, pero **eso es razonamiento, no medición** — lo verificado es el Tailwind del `<link>`.

## 2026-08-01 — Ancho full width en 9 módulos, marca de factura anticipada y retiro de PEDIDO_PROVEEDOR

### 1. Layout: espacios laterales desperdiciados

**Diagnóstico.** El contenedor raíz de cada página limitaba el contenido con `max-w-* mx-auto`. En 1920px el `<main>` dispone de 1616px útiles (1920 − 256 de sidebar − 48 de padding), pero `max-w-7xl` recortaba a 1280px: ~168px muertos por lado, ~500px en 2560px. Convivían cinco criterios distintos sin unificar (`max-w-4xl`, `5xl`, `7xl`, `[1600px]`, `[1700px]`, y CRM sin límite).

**Cambio (commits `52072c1` y `fecb174`).** Contenedor raíz a `w-full`, conservando el padding original, en: ODP, contabilidad, inventario, facturas vs salidas, prospectos, usuarios, producción, dashboard (`GerenciaDashboard`) e instalaciones (`JefeView`).

**Excluidos a propósito:** `InstaladorView` y `ConductorView` siguen en `max-w-5xl` — son pantallas de campo que instaladores y conductores usan desde el celular; el límite no se activa en móvil y estirarlas en escritorio deforma las tarjetas de tarea. Clientes, configuración, manuales, toma de medidas, ROOT e informe ejecutivo quedaron sin tocar por decisión del usuario.

**Nota de rastreo:** el dashboard no vive en `features/` sino en `components/dashboard/`. `DashboardHome` solo enruta por rol; el contenedor real está en `GerenciaDashboard`. Se verificó que ninguno de los 6 paneles (`PanelGeneral`, `PanelVentas`, `PanelProduccion`, `PanelEquipo`, `PanelAlertas`, `PanelCotizaciones`) ni `AgendaTab` tienen contenedor limitante propio que anulara el cambio.

### 2. Facturas vs Salidas: marca de "factura anticipada" (commit `a664c4d`)

**Objetivo.** Identificar ODPs facturadas que aún no llegan a `LISTO_INSTALAR`, es decir cuya FE se emitió antes de que el producto estuviera listo.

**Backend.** `getFacturadas` (`salidas_almacen.controller.ts`) expone `estado_produccion` en `attributes`. Sin include ni JOIN nuevo; el impacto de egress es de ~80 bytes por request sobre un endpoint que hoy devuelve 4 filas.

**Frontend (`FacturasSalidasPage.tsx`).** Set `ESTADOS_PRE_LISTO` + helper `esFacturaAnticipada`, columna "Estado Producción" reusando el `BadgeEstado` existente, badge ámbar, fila resaltada con barra lateral, KPI clickeable que filtra, y chip "Solo anticipadas" con contador integrado al botón Limpiar. La grid de KPIs pasó a responsive (`2 → 3 → 6`).

**Decisiones de diseño.** `PAUSADA` se excluye: está fuera de la secuencia y una ODP puede pausarse por NC *después* de haber estado lista, así que marcarla daría falsos positivos. La marca es derivada del estado actual, no persistida — desaparece sola cuando la ODP avanza, sin columna nueva ni migración.

**Dos trampas esquivadas:**
- El filtro se aplica **antes** del bloque de búsqueda de `facturadasFiltradas`. Ese bloque hace `return` temprano; colocar el nuevo filtro después lo habría anulado en cuanto se escribiera algo en el buscador.
- El contador se calcula sobre el universo del período (`anticipadasDelPeriodo`), no sobre la lista ya filtrada, para que no se congele en sí mismo al activar el chip.

**Verificación contra Supabase (solo lectura).** De las 4 ODPs facturadas sin SA: ODP-24213 (MEDICION), ODP-24200 (ALUMINIO_CORTADO) y ODP-24168 (EN_ESPERA) son anticipadas; ODP-24000 (LISTO_INSTALAR) no. Universo global de 310 facturadas: 4 en estados pre-listo y 2 en PAUSADA.

### 3. Retiro de `PEDIDO_PROVEEDOR` del código

**Hallazgo que corrigió un diagnóstico inicial equivocado.** Se reportó como "estado fantasma" por no estar en el ENUM de Sequelize. La consulta a Supabase mostró lo contrario: **sí existe en el ENUM de Postgres** (posición 3) y **4 registros de `historial_estados_odp` lo referencian**. El desincronizado era el modelo, no el frontend — mismo patrón de drift que `auxiliar_produccion`/`taller`.

**Decisión del usuario:** el seguimiento al proveedor lo cubren Compras y Pedidos PV, así que el estado no vuelve al flujo de producción.

**Cambio.** Eliminada la constante `ESTADOS_NC_ACTIVOS` de `ProduccionPage.tsx:134` (quedaba idéntica a `activeStates`) y sustituida por `activeStates` en el filtro de `ncOdps`, con comentario explicativo. Esa línea se había añadido el 2026-07-07 (`ce77ebf`) como defensa preventiva; con 0 ODPs en ese estado, era innecesaria.

**No se toca la BD:** eliminar un valor de un ENUM en PG obliga a recrear el tipo y rompería los 4 registros históricos. Documentado en `TECH_DEBT.md` 2026-08-01 y `CLAUDE.md`.

### Verificación ejecutada

- `tsc --noEmit` en frontend y backend: **exit 0** en cada paso.
- Consultas de solo lectura contra Supabase para validar la regla de negocio y el estado real del ENUM (scripts temporales, eliminados tras usarse).
- Barrido de `max-w-* mx-auto` en los módulos tocados: los restantes son modales, truncados de celda y párrafos centrados en empty states — correctos e intactos.
- Diff escaneado en busca de secretos antes de cada commit: limpio.

### Pendientes

- **Redeploy del backend**: hasta que el contenedor Docker se actualice, la columna Estado Producción saldrá vacía y el KPI de anticipadas en 0. El frontend en Cloudflare Pages se reconstruye solo desde `main`.
- `getFacturadas` trae todo el histórico de facturadas sin SA y filtra el mes en el navegador — candidato a optimización de egress.
- Red de seguridad opcional: warning del backend al detectar ODPs en estados fuera de `ESTADOS_PRODUCCION_VISIBLES`, ante ediciones manuales en Supabase.
- Siguen sin commitear los 3 scripts del 31-jul: `2026-07-31_contexto_pico.ts`, `2026-07-31_egress_por_tabla.ts`, `2026-07-31_rutas_actividad.ts`.

## 2026-08-01 — Egress: `ruta_odp` era el 46% del consumo. Ejecutado el plan que quedó pendiente el 31-jul

Continuación del diagnóstico cerrado el 31-jul, que quedó documentado pero **sin ejecutar**. Se verificó primero que el código siguiera intacto: los cuatro defectos estaban tal cual.

### Medición de partida

Delta de 25 h con `2026-07-31_egress_por_tabla.ts`: **46,5 MB** totales, de los que `ruta_odp` se lleva **21,6 MB (46%)** con solo 139 llamadas — 18,9 filas por llamada sobre una tabla de 337 filas. El rol de conexión confirma que es el ERP (`postgres` 98,2%), no el Studio de Supabase.

Tres defectos encadenados, todos medidos:

1. **Producto cartesiano.** `INCLUDE_RUTA_COMPLETA` anidaba `pagos`, `cotizaciones`, `tomas_medidas` y `saps→sap_items→ordenes_compra→odc_items` sin `separate`, en un único JOIN. Sobre el histórico completo: **3.053 filas de `ruta_odp` en vez de 337 (9,1×)**; en la asignación de un instalador, **57 en vez de 5 (11,4×)**.
2. **`firma_receptor` en cada fila duplicada.** TEXT base64 que ocupa **2.790 kB de los 2.843 kB de la tabla (98%)**: la fila pasa de **8.639 B a 163 B** al excluirla. Ningún consumidor de rutas la muestra — la única pantalla que la pinta es `ODPTabInstalacion`, alimentada por `GET /api/odp/:id`, que la incluye por su cuenta y no se tocó.
3. **`getMiRutaConductor` sin filtro.** Calculaba `const hoy` y **nunca lo usaba**: devolvía todo el histórico con el include pesado. Un conductor con **161 rutas completadas y CERO activas** descargaba **2.523 KB en 5.870 ms** para pintar un tab vacío — y `ConductorView` reengancha esa carga a `useDataChangedSocket('compras')`, repitiéndola con cada movimiento en Compras.

**Coste combinado de una lectura completa: 25,2 MB → 0,05 MB (480×).**

### Decisión sobre el filtro: por estado, no por fecha

El usuario eligió "solo rutas de hoy + en curso". Se implementó filtrando por **estado** (`NOT IN cancelada, completada`) y no por `fecha_programada = CURRENT_DATE`, porque `rutas_instalacion` no tiene campo de fecha propio —vive en `ruta_odp.fecha_programada`— y el filtro estricto por fecha haría desaparecer una ruta de ayer que quedó sin cerrar, dejando al conductor sin forma de finalizarla. El ahorro es el mismo: hay **7 rutas activas en las 310 del sistema**.

Para no vaciar los tabs *Rutas Realizadas* y *Mi Rendimiento*, el histórico se movió a un endpoint propio de carga diferida y las métricas pasaron a calcularse con `COUNT` en SQL.

### Cambios

**`rutas.controller.ts`**
- `INCLUDE_RUTA_COMPLETA`: `separate: true` en las 7 colecciones anidadas + `exclude: ['firma_receptor']`.
- `INCLUDE_RUTA_CONDUCTOR_HISTORIAL` (nuevo): payload ligero para las tarjetas del historial, sin items/SAP/ODC/pagos.
- `getMiRutaConductor`: devuelve `{ activas, metricas }` en vez del histórico completo.
- `getMiHistorialConductor` (nuevo): histórico paginado (`limit` 50, tope 200).
- `createRuta` / `updateRuta`: responden con `INCLUDE_RUTA_LISTA`. **53,6 KB → 3,1 KB (−94%)**.
- `getMiAsignacion` y `getAsignacionInstalador`: mismo `separate` + exclusión de firma.

**`rutas.routes.ts`** — `GET /mi-ruta-conductor/historial` (rol `conductor`), declarada antes de `/:id`.

**`ConductorView.tsx`** — consume el shape nuevo, carga el historial solo al abrir su tab y lo invalida tras un refresco; métricas desde el backend; los `<Printable*>` ocultos dejan de renderizarse en el historial, donde no hay botón que los abra.

### El `order` explícito no es cosmético

La primera pasada del gate **falló**: el JSON de 3 de 5 rutas difería. No era pérdida de datos sino **orden** — sin `ORDER BY`, la secuencia dentro de cada colección la decidía el plan del optimizador, y cambia al pasar de un JOIN a una subconsulta. Como `PrintableSAP` lista esos ítems, se declaró `order: [['id','ASC']]` en todas las colecciones ahora `separate`. El orden anterior tampoco estaba garantizado; ahora sí lo está.

### Verificación ejecutada

- `tsc --noEmit` **EXIT 0** en backend y frontend.
- **Equivalencia de JSON** en las 5 rutas con más paradas (peor caso del cartesiano): contenido **idéntico** campo a campo tras normalizar, y orden **determinista** en todas las colecciones anidadas. Las únicas claves nuevas son las FK (`odp_id`) que `separate` obliga a pedir.
- **Métricas**: el `COUNT` SQL coincide exactamente con el cálculo JS anterior — `{totalRutas:161, rutasTerminadas:161, rutasMes:1, totalParadas:173, paradasLlegadas:160}`.
- **End-to-end HTTP** contra la BD real, con JWT por rol: `mi-ruta-conductor` **120 bytes / 0,31 s** (antes 2.523 KB / 5,87 s); `historial` 48,6 KB con todos los campos que la tarjeta necesita y sin firma; `rutas/75` 24,4 KB con las 7 colecciones pobladas (items, pagos, saps, 6 sap_items); `rutas` (listado del jefe, no tocado) sin cambios; `mi-asignacion` del instalador 48 con sus 5 paradas y conteos por colección **idénticos** a los del include anterior.
- **RBAC**: conductor→`/mi-asignacion` y instalador→`/mi-ruta-conductor/historial` devuelven **403**. El routing de `/:id` sigue intacto.
- **No se ejecutó ningún POST/PUT de ruta**: escribiría en la BD de producción (nueva ruta, ODPs a PROGRAMADA, auditoría y sockets). En su lugar se reprodujo la consulta exacta que el controlador hace tras el commit, comprobando que la respuesta trae los campos que `ProgramarRutaModal` leería. Ese modal, de hecho, **descarta la respuesta** (`await axios.post(...)` sin leer `.data`) y ningún otro cliente la consume — verificado en `frontend-web` y `mobile-app`.

### Riesgo y despliegue

Sin cambios de BD, sin migración, sin dependencias nuevas. El único efecto visible: el conductor ve su historial al entrar al tab en lugar de instantáneamente. **Backend y frontend deben desplegarse juntos**: `ConductorView` espera `{activas, metricas}` y la versión anterior del backend devuelve un array.

### Pendientes

- Commit + push (a la espera de orden del usuario) y **medir el egress 24-48 h después del deploy** con `2026-07-31_egress_por_tabla.ts`, que ya dejó snapshot.
- `salidas_almacen`: **82.603 filas/día en 310 llamadas (4,4 MB)** — `getFacturadas` trae todo el histórico y filtra el mes en el navegador. Queda como siguiente candidato.
- Siguen sin commitear los 3 scripts del 31-jul y `2026-08-01_leads_inactivos.ts`.

### Decisión: el historial del conductor se queda en 50 rutas

Se le planteó al usuario que el tab *Rutas Realizadas* pasa a mostrar las **últimas 50** en vez de las 161, con la consecuencia de que **el buscador de ese tab solo alcanza esas 50** (antes recorría todo el histórico). Se ofrecieron tres salidas —subir el tope a 200, botón "Cargar más" con el `offset` que el endpoint ya acepta, o mover la búsqueda al backend— y la decisión fue **dejarlo como está**.

No es un descuido pendiente de arreglo: es el comportamiento acordado. Las métricas no se ven afectadas (se calculan con `COUNT` en SQL sobre el total, no sobre las 50 cargadas). Si en el futuro se quiere ampliar, el backend ya soporta `?limit=` (tope 200) y `?offset=` sin tocar nada más.

## 2026-08-02 — Egress: `salidas_almacen` se descargaba entera 3 veces por carga de página

Siguiente candidato tras el trabajo en rutas. Anotado como pendiente desde el 2026-08-01.

### Causa raíz: un anti-patrón repetido en tres endpoints

`getFacturadas`, `getOAPendientes` y `getNcSinSalida` resolvían "ODPs que aún no tienen salida de almacén" así:

```ts
const conSalida = await SalidaAlmacen.findAll({ attributes: ['odp_id'], raw: true });
where.id = { [Op.notIn]: conSalida.map(s => s.odp_id) };
```

Es decir, **descargaban la tabla completa** para armar un `NOT IN` en memoria. Como `FacturasSalidasPage` pide los 5 endpoints en un `Promise.all` en cada carga, el coste por carga era **3 × 342 = 1.026 filas solo para construir los filtros**, más las 342 de `/con-salida` y `/con-salida-oa`: **1.710 filas**. Con ~60 cargas al día eso da ≈82.000 filas, que coincide con las **82.603 filas / 310 llamadas / 4,4 MB** que midió el diagnóstico — el modelo queda confirmado.

Lo desproporcionado: `/facturadas` responde con **4 ODPs** y `/nc` con **0**. Se leían 342 filas para devolver 4.

### Cambio

Una sola constante en `salidas_almacen.controller.ts`, usada por los tres endpoints:

```ts
const SIN_SALIDA_ALMACEN = literal(
  'NOT EXISTS (SELECT 1 FROM salidas_almacen sa WHERE sa.odp_id = "ODP"."id")'
);
```

**`NOT EXISTS` y no `NOT IN` a propósito:** si `odp_id` llegara a contener un NULL, un `NOT IN` devolvería siempre cero filas y los tres tabs se vaciarían sin error visible. Hoy la columna es `NOT NULL` y no hay nulos, pero esta forma es inmune por construcción.

`"ODP"."id"` es el alias que Sequelize asigna a la tabla principal en `ODP.findAll` (viene de `modelName: 'ODP'`), no el nombre real de la tabla (`odp`).

### Verificación ejecutada

- `tsc --noEmit` **EXIT 0**.
- **Equivalencia contra el método anterior**, ejecutando ambos sobre la misma BD: `/facturadas` 4 = 4 y `/oa-pendientes` 3 = 3 con **JSON idéntico**; `/nc` 0 = 0.
- **`/nc` con 0 resultados no prueba el alias**, y es el endpoint delicado porque incluye un self-join (`odp_padre`). Se forzó un caso no vacío quitando el filtro de estado: de **18 NC totales, 16 ya tienen SA**; el filtro nuevo devuelve exactamente las **2 restantes** y **0 con SA se colaron**. El alias resuelve correctamente pese al self-join.
- **End-to-end HTTP** con JWT de admin: los 5 endpoints responden 200 con los mismos conteos que antes del cambio (4, 3, 0, 322, 20).
- Sin imports muertos: `SalidaAlmacen` y `Op` siguen en uso; 0 restos del patrón anterior.

**Resultado: 1.026 filas por carga → 0.** Egress estimado de la página: 4,4 → ~1,8 MB/día.

### Propuesta B, analizada y NO ejecutada

Se probó también filtrar el mes en el backend (`/con-salida` devuelve 322 salidas y el navegador descarta casi todas con `mesCorrecto()`). Resultó **equivalente en los 6 meses probados** y llevaría la carga a ~105 filas (−94% sobre el total), pero exige cambiar el contrato, refetchear al cambiar de mes y cachear por mes en el frontend. **El usuario optó por aplicar solo A.**

**Trampa registrada durante esa prueba:** la primera pasada falló en junio y mayo por 1 registro, y la causa estaba **en el script de prueba**, no en la propuesta: se usó `new Date('2026-06-01')`, que Node interpreta como UTC y en Colombia (UTC−5) retrocede al 31 de mayo. El frontend usa `parseISO` de date-fns, que lo trata como fecha **local**. `fecha_sa` es `DATEONLY`, así que en la BD no hay zona horaria implicada. Al replicar la semántica correcta, coincidió en todos los meses.

### Pendientes

- Commit + push (a la espera de orden) y medir el egress tras el deploy.
- Propuesta B disponible si se quiere el 94%.
- Instaladores (`getMiAsignacion`): analizado el 2026-08-01, margen real ~2,6 MB/día (5,6%). El 71% del payload está bloqueado porque los 5 printables consumen esos campos. El margen está en la frecuencia: `emitirCambio('compras')` es un `io.emit` **global** y hace refetchear a los 9 instaladores y al conductor ante cambios que no les afectan (23 escrituras/día de media, picos de 55).
- **Hallazgo sin relación con el egress:** los printables referencian `odp.cliente?.ruc_rut` y esa columna **no existe** en el modelo `Cliente` — sale siempre vacía en los documentos impresos. Probablemente debería ser `numero_documento`.

## 2026-08-02 — Dashboard/Alertas: el panel ocultaba 25 alertas y describía mal las que mostraba

Partió de una propuesta del usuario —eliminar el tab por desuso— que al medirla resultó ser la forma más cara de ahorrar: el ahorro se conseguía igual con `attributes` selectivos, sin perder la función. Se optó por arreglarlo.

### Tres defectos, todos medidos

1. **Egress.** Las dos consultas de `getAlertas` usaban `ODP.findAll` sin `attributes` y con el include de `Cliente` completo: **35,6 KB leídos de la BD para devolver 2,4 KB** (15× de desperdicio). Agravante: `/alertas` es **el único de los 6 endpoints del dashboard sin `cacheRespuesta`** (se excluyó el 24-jul "por frescura"), así que cada carga golpeaba la base. Y `useDashboardData.fetchAll()` pide los 6 **al montar, sea cual sea el tab activo**, más un `setInterval` cada 60 min — o sea que el endpoint se consultaba aunque nadie abriera la pestaña. Eliminar solo el tab visual habría ahorrado **cero**.

2. **Ocultaba información.** Los `limit: 10` y `limit: 5` hacían invisibles **25 de las 40 alertas reales**: 6 ODPs fuera de plazo y **19 clientes en mora**. El badge decía 15. La cartera vencida real asciende a **$298.755.321** y solo se veían 5 clientes.

3. **El texto engañaba.** El backend emitía todo como `critico` con el mensaje "vence pronto", **incluidas las 14 ODPs que ya estaban vencidas** —una de ellas hacía 83 días—. No había forma de distinguir lo vencido de lo que aún tenía margen.

**Bug adicional encontrado:** el botón "Ver cliente" de las alertas de cartera no hacía nada. El handler exigía `alerta.odp_id` y esas alertas solo traían `cliente_id`.

### Backend — `getAlertas` reescrito

Dos consultas raw con columnas selectivas, sin `limit`, y los días calculados en SQL con `::date` (`fecha_entrega` es `DataTypes.DATE` → `TIMESTAMPTZ`; restar fechas en JS habría reintroducido el desfase de zona horaria). Severidad derivada del atraso real: vencida → `critico`, vence hoy → `alto`, 1-2 días → `medio`. Para cartera se reutilizan los cortes de riesgo de `getCarteraVencida` (2× y 1,5× el umbral) para no dar dos lecturas distintas del mismo dato. Se conserva el criterio original de `fecha_entrega` (no `fecha_factura`) para no alterar la regla de negocio. La respuesta sigue siendo un **array plano**, así que `alertasCriticas` en `GerenciaDashboard` no requirió cambios.

### Frontend — `PanelAlertas` rediseñado

Barra de resumen (total · vencidas · producción · en mora · monto en riesgo), agrupación colapsable por categoría y **filas de una línea** en lugar de tarjetas de ~70 px. Punto de color por severidad, plazo en lenguaje natural ("vencida hace 12 días", "vence mañana"), montos con formato COP y botón "Ver" que ahora funciona en las 40 (el backend envía `odp_id` también en cartera). El escalonado de la animación se acotó a 0,3 s: con 40 filas, un delay por índice sin tope dejaba las últimas en blanco varios segundos.

### Resultado medido

| | Antes | Después |
|---|---|---|
| Leído de la BD | 35,6 KB | **5,4 KB** (−85%) |
| Por fila | 2.430 B | **139 B** (−94%) |
| Alertas mostradas | 15 de 40 | **40 de 40** |
| Severidad | todo `critico` | 21 crítico · 3 alto · 16 medio |
| Botón funcional | 25 de 40 | **40 de 40** |

### Verificación ejecutada

- `tsc --noEmit` **EXIT 0** en backend y frontend.
- **HTTP real** con JWT: 200, 7.811 bytes, 40 alertas — 16 producción + 24 cartera, $298.755.321 en riesgo, `odp_id` presente en 40/40.
- Sin imports muertos: `Cliente`, `Op`, `QueryTypes` y `ODP` siguen en uso en el controlador.

**Nota para el usuario:** el badge del tab cuenta alertas críticas, así que pasa de 15 a **21**, mientras el panel muestra 40 en total. Es coherente (el badge señala lo urgente), pero si se prefiere que muestre el total, es una línea en `GerenciaDashboard.tsx:39`.

## 2026-08-02 — ODPFichaModal: el detalle de ODP repetía la firma hasta 320 veces

Consulta del usuario: "¿ODPFichaModal consume mucho egress?". La auditoría del 2026-07-28 lo había descartado ("8,6 filas/llamada, encarece CPU no egress"). Ese promedio era correcto — lo que no se vio entonces fue **la distribución**.

### Medición

`getODP` tiene ~15 includes; cinco usaban `separate` y **ocho no** (`no_conformidades`, `saps→items`, `cotizaciones`, `tomas_medidas`, `evidencias`, `notas_produccion`, `ruta_odps`, más los `ruta_odps` anidados de `odp_padre` y `garantias`). Se resolvían en un JOIN único.

| ODP | Filas del JOIN | Firma leída | Payload HTTP | Tiempo |
|---|---|---|---|---|
| ODP-23931 | **320** | **4.235 KB** | 60 KB | 3,32 s |
| ODP-24112 | 300 | 1.712 KB | 46 KB | 2,25 s |
| ODP-23957 | 128 | 0 KB | 25 KB | 1,88 s |
| ODP-23925 | 1 | 0 KB | 5,9 KB | 0,60 s |

Mediana de 9 filas, pero **14 ODPs superan las 50** y el peor caso llega a 320. Como `ruta_odps` trae `firma_receptor` (base64, ~12,6 KB de media), esas 320 filas repetían la misma imagen: **4,1 MB leídos de la base para devolver 60 KB** — cerca del 9% del egress diario en un solo clic.

**Por qué se había pasado por alto:** el payload HTTP es de 60 KB porque **Sequelize deduplica en memoria**. Mirando solo el JSON el problema es invisible; hay que contar las filas que devuelve Postgres. Es la misma trampa que ya había aparecido en `getMiAsignacion`.

### Cambio

`separate: true` + `order` explícito en las ocho asociaciones (todas verificadas `hasMany` en `models/index.ts`), incluidos los dos `ruta_odps` anidados. Se añadió `odp_id` a los `attributes` de `ruta_odps` y `tomas_medidas`, que `separate` necesita para agrupar. `salida_almacen` (`hasOne`) y `odp_padre` (`belongsTo`) quedan intactos: no admiten `separate`. `garantias` ya lo tenía.

`firma_receptor` se conserva —`ODPTabInstalacion` la muestra en el tab Instalación—, pero ahora viaja una vez por parada en lugar de una vez por fila del producto cartesiano.

### Resultado medido

| | Antes | Después |
|---|---|---|
| Filas devueltas (ODP-23931) | 320 | **48** (−85%) |
| Bytes de firma leídos | 4.235 KB | **26,5 KB** (−99%) |
| Tiempo de respuesta | 3,32 s | **1,64 s** (−51%) |
| ODP-24112 | 2,25 s | 1,30 s |
| Abrir las 403 fichas una vez | 22,47 MB | **2,72 MB** |

### Verificación ejecutada

- `tsc --noEmit` **EXIT 0**.
- **Equivalencia de JSON** en las 4 ODPs medidas (incluido el peor caso): **contenido idéntico** tras normalizar, con los mismos conteos en las 11 colecciones (`items`, `saps`, `cotizaciones`, `tomas_medidas`, `evidencias`, `ruta_odps`, `notas_produccion`, `no_conformidades`, `garantias`, `pagos`, `historial_estados`). La única diferencia es el `odp_id` que `separate` obliga a pedir.
- **HTTP real** con JWT: 200 en las 4, con payloads equivalentes (61.435 vs 61.396 bytes en ODP-23931 — la diferencia son los `odp_id` añadidos).
- Confirmado que el `scope: { es_garantia: true }` de la asociación `garantias` se sigue aplicando.

---

## 2026-08-02 — Diseño (sin código): módulo de Proveedores y comparador de precios

Sesión **exclusivamente documental** a petición del usuario: *"esto es para documentar, no para codificar… en un futuro lo implementaremos"*. **No se modificó ningún archivo del sistema.** Todo el contenido vive en `compras.md` (nuevo, raíz del repo), que es la fuente de verdad de este diseño — aquí solo queda el resumen y los hallazgos que afectan al ERP actual.

### Necesidad capturada

Maestro de proveedores con lista de precios comparable: al consultar un producto interno, ver qué proveedores lo venden y a qué precio. Conservando los 2 precios anteriores con fecha. Problema central: cada proveedor usa **código y descripción propios** para el mismo producto ("brazo hidráulico" vs "cierrapuertas").

### Hallazgos sobre el sistema actual (medidos en producción, read-only)

| Hallazgo | Detalle |
|---|---|
| **No existe entidad proveedor** | El nombre es texto libre en 3 tablas: `ordenes_compra.proveedor` (150), `odp.proveedor_vidrio` (100), `pedido_pv.proveedor` (100) |
| **Duplicados por tipeo confirmados** | 50 valores distintos ≈ **40 proveedores reales**: `VENTANAS Y PUERTAS`/`VyP`/`VYP` (63 registros), `VIDRIO EQUIPOS Y ACCESORIOS`/`VEA`/… (17), `ACCESORIOS PARA VIDRIO(S) DE COLOMBIA` (7). Normalizar mayúsculas **no** los une: son siglas y erratas |
| **Compras no maneja dinero** | Ni `ordenes_compra` ni `odc_items` guardan precio. El módulo gestiona qué se pide y si llegó, no cuánto costó |
| **`catalogo_productos` está sano** | 1.243 productos, **1.212 con código** (`ACC0106`, `TUB0103`, `PEL0106`…). El **96,8 %** de lo comprado (`odc_items`) ya existe en él. Solo **313 códigos** se compran realmente |
| **Categorías casi vacías** | **1.180 de 1.243 (95 %) sin categoría**; las 63 que hay son de venta (`Películas`, `Cabinas`, `Fachadas`), no de compra |
| **Catálogo mixto** | Los 31 productos sin código son terminados de venta (`CABINA GLASSVIT 8MM`), no insumos |
| Vidrio concentrado | `Vitelsa` = 266 de 269 registros en `odp.proveedor_vidrio` |

### Decisiones de diseño (22, detalladas en `compras.md` §8)

- **Origen de precios: XML DIAN** del `.zip` de la FE (el usuario archiva PDF+XML, ~20 FE/día). Descartado parsear el PDF, con o sin LLM: teniendo el XML es trabajar de más con datos peores. El NIT del emisor permite identificar al proveedor solo.
- **Precios sin IVA** + calculador del 19 %, con el porcentaje como **campo con default, no constante** (hay excluidos/exentos; el XML trae el % real por línea).
- **Alcance acotado a consultor de precios independiente**: no toca ODC, ODP ni Pedidos PV → riesgo de regresión bajo. Solo `catalogo_productos` recibiría `unidad_medida` y `porcentaje_iva`.
- **Histórico registra cambios, no apariciones** — con 20 FE/día registrar cada aparición llenaría los 2 slots de "precio anterior" con el mismo número repetido.
- **El precio vigente lo define la fecha de la factura, no el orden de carga** — sin esto el backfill se autodestruye al procesar facturas viejas después de las nuevas.
- **Mapeo `(proveedor, código)` → producto: siempre lo confirma un humano.** Un mapeo errado no falla, produce un precio equivocado con apariencia de dato correcto. Ayudas: diccionario de **alias** (aprende de cada mapeo), sugerencia semántica por LLM, orden por frecuencia/valor, y **backfill desde los `.zip` archivados**.
- **Perfilería:** unidad canónica = metro, tiras de **6 m para todos los proveedores**. La modalidad de compra entra en la clave — tira y metro fraccionado son **dos precios independientes** (el recargo por fraccionar existe "solo en algunos casos", así que no hay factor derivable).
- **UI:** feature propio `/proveedores` con `FolderTabs` y 5 tabs (Consultar precios · Cargar facturas · Por mapear · Proveedores · Equivalencias), no tabs dentro de `/compras`.
- **Backfill masivo como script one-off**, nunca dentro de un request: Node es mono-hilo y congelaría el resto del ERP.

### Impacto en egress (analizado a petición del usuario)

Despreciable y **no toca Supabase**: descomprimir y parsear es CPU local, el `.zip` viaja navegador→backend sin pasar por la BD, y lo que llega a Postgres son `INSERT` (escribir no genera egress). El riesgo real es otro: **bloqueo del event loop** si el parseo es síncrono.

### Pendiente para la próxima sesión

El usuario aportará dos Excel (especificados en `compras.md` §9): **proveedores con NIT** (llave para reconocerlos desde el XML y para unificar los duplicados) e **inventario por categoría con unidad de medida** (resolvería la clasificación de los 1.180 productos y la unidad de los 1.212 de una vez). Descartado derivar la categoría del prefijo de 3 letras del código: el usuario confirma que la estructura se perdió con el tiempo.

Quedan abiertas solo cuestiones menores: umbral de la alerta por variación de precio, roles que pueden ver costos, retención del `.zip` (completo / solo XML / nada), caducidad de precios y proveedor preferido.

---

## 2026-08-30 — Auditoría del módulo Proveedores y corrección de los 26 hallazgos

### Contexto

Sesión iniciada con `git pull` (llegaron los commits `9a39045` → `6f216f9`: Fase 2 completa — parser DIAN, ingesta de `.zip`/XML, bandeja de mapeo, equivalencias) y auditoría solicitada del módulo completo. Se auditaron backend, frontend, esquema de BD y datos reales de producción, contrastando contra las decisiones documentadas en `compras.md`.

**Resultado de la auditoría:** 26 hallazgos — 5 críticos, 9 altos, 10 medios, 2 menores. Detalle completo en `TECH_DEBT.md` (entrada 2026-08-30). El usuario autorizó corregirlos todos con autonomía de orden.

### Diagnóstico: por qué ninguno se veía

Los cinco críticos compartían un patrón: **no lanzaban excepción**. Producían datos plausibles pero equivocados en un módulo cuya salida es una decisión de compra. El más grave (C2) escribía el mismo precio en la modalidad "tira de 6 m" y en la "metro" del mismo perfil, y el comparador seguía marcando un "más bajo" con total aplomo — exactamente el riesgo que `compras.md §6` señala en rojo como *"induce a decisiones equivocadas con apariencia de dato duro"*.

C5 ya había ocurrido: el vidrio templado de 6 mm incoloro de VITELSA (visto 17 veces) llevaba semanas sin capturar precio, invisible tanto en equivalencias como en la bandeja.

### Cambios realizados

**Backend**
- `utils/dianXmlParser.ts` — reescrito: distingue `Invoice` / `CreditNote` / `DebitNote`, extrae moneda, marca si el `unitCode` es informativo o relleno genérico, deriva `SD-<hash de descripción>` cuando el XML no trae identificación de ítem (antes usaba el número de línea, que colisionaba entre facturas), aplica `BaseQuantity`, y acota la descompresión de `.zip` (40 XML, 12 MB por entrada).
- `controllers/proveedor.controller.ts` — reescrito: idempotencia real por CUFE contra tabla propia, orden cronológico del lote, resolución de proveedor por NIT normalizado exacto (antes `LIKE '%nit%'` emparejaba `900123` con `1900123456`), precarga de proveedores/equivalencias/bandeja en memoria (se eliminó el N+1 de tres consultas por línea más un recorrido del histórico por factura), una transacción por factura, esquemas Zod `.strict()`, caché del umbral, mensajes de error accionables sin `err.message` crudo, paginación y `attributes` selectivos en los listados.
- `controllers/catalogo.controller.ts` — el schema aceptaba `categoria`/`nombre`/`descripcion`/`activo` pero no `codigo`, que es `NOT NULL UNIQUE`: **crear productos de catálogo fallaba siempre**. Ahora acepta código, `es_aluminio`, `unidad_medida` y `porcentaje_iva`, y autogenera `PROD-NNNN` si no viene.
- `routes/proveedor.routes.ts` — rutas duplicadas eliminadas, orden corregido (las literales antes de `/:id`), traducción de errores de multer a mensajes que dicen qué corregir.
- Endpoints nuevos: `GET /codigos-pendientes/count`, `POST /codigos-pendientes/descartar-lote`, `GET /equivalencias/:id/historico`, `PATCH /:id/seguimiento`.
- Modelos: nuevo `FacturaProveedorProcesada` (auditado); campos añadidos a `Proveedor`, `ProveedorCodigoPendiente` y `ProveedorProductoPrecio`.

**Frontend**
- `httpInterceptors.ts` — interceptor de request que adjunta el token a las llamadas a la API propia (respeta cualquier `Authorization` explícita, así que las pantallas no migradas siguen igual). Se eliminó la repetición de `sessionStorage.getItem('token')` en los 7 puntos del módulo.
- `ProveedoresPage.tsx` — el maestro compacto se carga una vez y se comparte con las pestañas (antes "Por Mapear" y "Equivalencias" pedían cada una los 1.011 proveedores completos al montarse); el badge usa el endpoint de conteo en vez de descargar la bandeja entera; se refresca al terminar un lote.
- `PorMapearTab.tsx` — filtros y orden en servidor con debounce, selección múltiple con descarte en lote, botón "No seguir precios" por proveedor, muestra unidad detectada y marca de código deducido.
- `EquivalenciasTab.tsx` — corrección de precio y modalidad (el endpoint `PATCH /productos/:pp_id` existía y no lo llamaba nadie), visor de histórico completo, filtros KG y M².
- `VincularCodigoModal.tsx` — la unidad del XML llega preseleccionada, el precio corregido a mano ahora se respeta, la casilla "recordar como sinónimo" ahora tiene efecto, y se puede crear el producto en el catálogo sin salir del modal.
- `CargarFacturasTab.tsx` — panel de avisos que requieren criterio humano (unidad no coincide, IVA distinto al catálogo, moneda extranjera, proveedor nuevo, nota crédito), marca de precio archivado por retroactivo, y listado de archivos que no se pudieron procesar.
- `ConsultarPreciosTab.tsx` — cuando varios productos coinciden se ofrece elegir en vez de resolver a uno arbitrario; la heurística código-vs-nombre se movió al servidor; aviso cuando el listado mezcla modalidades, porque "el más bajo" solo es válido dentro de una.
- `ProveedoresTab.tsx` — interruptor de seguimiento de precios y distintivo para los proveedores creados por la ingesta.

### Base de datos

Script `2026_08_30_fix_ingesta_proveedores.ts` **ejecutado**: tabla nueva, 9 columnas añadidas, 1 índice, saneamiento del código en limbo y clasificación de `origen_registro` (972 `IMPORTACION_WO`, 38 `INGESTA_FE`, 1 `MANUAL`).

### Verificación

- Compilación limpia de `backend-api` y `frontend-web`; build de producción del frontend correcto.
- **26 comprobaciones end-to-end** contra el backend levantado y la BD real, con facturas DIAN sintéticas construidas para cada defecto: idempotencia por CUFE, orden cronológico, retroactividad, conflicto de unidad, nota crédito, código derivado, rescate de limbo, precio corregido en la vinculación, validación Zod y corte de ruido por proveedor. Todas pasaron. Los datos de prueba (NIT ficticio `999999999`) se eliminaron al terminar y se verificó que la BD quedó sin residuos.

### Decisiones técnicas

- **Baja lógica en vez de borrado físico al desvincular.** El histórico de precios es el activo del módulo; el `CASCADE` se lo llevaba entero.
- **El proveedor creado por ingesta nace con `seguir_precios = true`**, no en false: apagarlo por defecto habría hecho perder datos silenciosamente. Se marca su origen para que se vea y se pueda apagar de un clic.
- **El IVA del XML no sobrescribe el del catálogo**, avisa. La configuración por producto puede ser una decisión deliberada del usuario.
- **Con unidad ambigua y dos modalidades registradas no se toca ningún precio.** Es preferible un aviso a un dato contaminado.

### Pendientes

Los 49 códigos puramente numéricos previos al fix del parser requieren revisión humana (el script los lista). El backfill masivo, si se hace, debe ir por script one-off y no por HTTP.

---

## 2026-08-31 — ODP-24267: marcar chk_vidrio y chk_pelicula (corrección puntual)

### Contexto

La ODP-24267 (STOP SAS, id 502) estaba en `LISTO_INSTALAR` con el panel de componentes en 1/3: solo Herrajes marcado, Vidrio y Película en Pendiente. No había forma de corregirlo desde la UI.

### Hallazgo — hueco funcional

Los `chk_*` solo son editables desde la matriz del tablero de Producción (`toggleCheck`, `ProduccionPage.tsx:395`), y esa matriz se renderiza únicamente en las tabs **Activas** y **NC/Garantías**, cuyo origen (`filteredOdps` ← `activeOdps`) filtra por `activeStates` (EN_ESPERA…ACCESORIOS_SEPARADOS). Una ODP en `LISTO_INSTALAR` cae en "Pedido a mano"/despacho, donde no hay matriz; y el panel de la ficha (`ODPTabProduccion.tsx:296-304`) es solo lectura. **Conclusión: una vez que la ODP pasa a LISTO_INSTALAR, ningún rol puede corregir un check.**

### Cambio realizado

Script one-off `backend-api/src/scripts/2026-08-31_marcar_chk_vidrio_pelicula_odp24267.ts` — **ejecutado**. Marca ambos checks en un solo `.update()` de instancia (dispara hooks de auditoría), envuelto en `requestContext.run({ userId: 30 })` para que el registro quede atribuido a ROOT y no con `usuario_id: null`. Incluye guardas de aplicabilidad (espejo de `isColApplicable`): aborta si la ODP no tiene ítems o no lleva película.

Verificado en BD: `chk_vidrio=true`, `chk_pelicula=true`, `estado_produccion` sin cambios (`LISTO_INSTALAR`), `auditoria_log` id 36426 con `usuario_id=30`.

### Decisiones técnicas

- **Ambos checks en un mismo update.** La regla de dependencia del controlador (`odp.controller.ts:795`) rechaza película sin vidrio; marcándolos juntos se respeta el orden lógico del negocio.
- **No se tocó el estado.** El auto-avance a `LISTO_INSTALAR` (`odp.controller.ts:1012`) solo corre para `ESTADOS_PRODUCTIVOS` y el retroceso (`:1068`) solo con `chk = false`: la corrección es inocua respecto del flujo.
- **Script en vez de UPDATE directo en Supabase**, para no perder el rastro en `auditoria_log`.

### Pendientes

Decidir si se habilita la edición de los `chk_*` desde el panel de la ficha (`ODPTabProduccion`) para los roles con permiso de taller. Resolvería el hueco de raíz — hoy cada caso así exige un script.

---

## 2026-09-02 — ODP-24302: eliminación del Pedido PV 7076 (pedido externo inexistente)

### Contexto

La ODP-24302 (id 546, creada el mismo día, estado `MEDICION`) figuraba con Pedido PV 7076, pero no tiene pedido externo de vidrio: sus 3 ítems se cortan en casa (`prod = 'CR'`, `pedido_pv_id = null`). El PV se generó solo, por el auto-create de `createODP` (`odp.controller.ts:691-720`), al haberse dejado `proveedor_vidrio = 'Otros'` en el bloque "Pedido Externo (Vidrio)" del formulario (`ODPForm.tsx:828`).

### Impacto que tenía

`odp.controller.ts:1029` corta el auto-avance a `LISTO_INSTALAR` mientras exista un PV en `PENDIENTE`/`ENVIADO`/`CONFIRMADO_PROVEEDOR`: la ODP se habría quedado atascada aunque terminara toda la producción. Además figuraba como pendiente en el tablero de Pedidos PV y el proveedor salía impreso en talonario y orden de producción.

### Cambio realizado

Script one-off `backend-api/src/scripts/2026-09-02_eliminar_pedidopv_7076_odp24302.ts` — **ejecutado**. Calcado del precedente `2026-07-28_eliminar_pedidopv_6958_odp24129.ts`: valida precondiciones (PV en `PENDIENTE`, 0 ítems asignados, `numero_pedido`/`odp_id`/`numero_odp` coincidentes) y aborta sin escribir si alguna falla. En transacción: desasigna ítems (defensivo, 0 filas) → `pv.destroy()` → `odp.update({ proveedor_vidrio: null, numero_pedido_proveedor: null })`.

Verificado en BD: PV id 572 borrado, 0 pedidos PV en la ODP, ambos campos en `null`, estado `MEDICION` intacto, los 3 ítems de vidrio intactos. Auditoría: `auditoria_log` 37152 (DELETE `pedido_pv`) y 37153 (UPDATE `odp`).

### Decisiones técnicas

- **Se limpió también `proveedor_vidrio`, no solo el PV.** Si el campo queda con valor, una edición que lo borre y lo reasigne dispara el auto-create de `updateODP` (`odp.controller.ts:1121`) y reaparece un PV nuevo. En `null` el cambio es definitivo.
- **El checklist no se rompe.** `needsVidrio = itemCount > 0 || !!proveedor_vidrio` (`:1025`): con 3 ítems, el checkpoint "Vidrio" se sigue exigiendo. Solo desaparece el bloqueo por pedido externo.
- **Borrado, no cambio de estado.** 7076 era el `numero_base` más alto, así que el próximo PV automático reutilizará el 7076. Es correcto: nunca se envió al proveedor (sin `fecha_envio`, sin `factura_pv`, sin confirmación), no queda hueco ni número quemado en la numeración física.
- **Script por instancia, no SQL crudo**, para conservar el rastro en `auditoria_log` (revertible desde ROOT → Auditoría; `pedido_pv` está en `TABLAS_AUDITABLES`).

### Pendientes

Dos huecos de raíz, ambos reincidentes (mismo caso en ODP-24129 el 2026-07-28):

1. **No existe `DELETE` en `/api/pedidos-pv`** (`pedido_pv.routes.ts`): un PV auto-generado por error solo se puede quitar con script. Es la tercera vez que se hace a mano.
2. **El selector de proveedor de vidrio no advierte que genera un pedido.** La opción `Otros` se lee como "vidrio propio/otro origen" y dispara un PV real. Valdría un texto de ayuda en el bloque, o exigir confirmación al elegir proveedor en el formulario.

### Adenda — endpoint de eliminación de Pedidos PV (opción A)

Tras el arreglo puntual de la ODP-24302 se resolvió el hueco de raíz: `DELETE /api/pedidos-pv/:id`.

**Backend.** `eliminarPedidoPV` en `pedido_pv.controller.ts` + `router.delete('/:id')` en `pedido_pv.routes.ts`. Permiso `puede_gestionar_pv` verificado dentro del controlador, igual que `POST`/`PATCH`. Guardas con 409 y mensaje redactado para el usuario: `origen='EXCEL'` (histórico importado), estado ≠ `PENDIENTE`, `factura_pv` con valor, ítems asignados > 0, y extensión de la familia ya enviada. En transacción: desasignación defensiva de ítems → borrado de la familia completa (`numero_base` + `odp_id`, principal y extensiones `-1`, `-2`) **instancia por instancia** → desvinculación de la ODP. Sockets: `emitirCambio('pedidos_pv')` + `emitirODPPatch(odp_id, 'update')`.

**Frontend.** `PedidosPVPage.tsx`: botón de borrado en la tarjeta de la pestaña **Por Gestionar** (`puedeCrear && !soloLectura`), diálogo de confirmación que explica las tres consecuencias, `Alert` de éxito y propagación del mensaje del backend en caso de 409.

**Sin cambios de BD.** Ninguna migración, ENUM ni constraint.

### Decisiones técnicas

- **La desvinculación de la ODP es parte del endpoint, no un extra.** `odc.controller.ts:921` calcula `tieneRutaPV = !!(proveedor_vidrio || numero_pedido_proveedor)` y oculta de Compras los vidrios de toda ODP con ruta PV. Borrar solo la fila dejaría los ítems **invisibles en Compras para siempre**, colgando de campos que ya no apuntan a nada. Ningún script anterior lo había documentado.
- **Borrado por instancia, no `destroy({ where })`.** El destroy bulk no dispara los hooks de `MODELOS_AUDITADOS` y el borrado quedaría sin rastro (`TECH_DEBT.md` 2026-07-02).
- **Si quedan otros pedidos en la ODP no se desvincula**, solo se reapunta `numero_pedido_proveedor` al pedido vivo de mayor `numero_base`, para que la ficha no muestre un número inexistente.
- **El botón vive solo en "Por Gestionar".** `estaPorGestionar = PENDIENTE && 0 ítems` (`PedidosPVPage.tsx:359`) es exactamente el conjunto que el backend acepta; en "Gestión PV" el botón chocaría siempre contra una guarda.
- **Opción A sobre B (descartada):** no se permite borrar un PV `PENDIENTE` *con* ítems asignados desasignándolos en la transacción. Cubriría un caso más —pedido mal gestionado, no solo mal creado— a cambio de que alguien pueda desmontar por accidente un pedido ya trabajado. Los 3 incidentes históricos caen todos en la opción A.

### Verificación

- Compilación limpia de `backend-api` y `frontend-web` (`tsc --noEmit`).
- **32 comprobaciones end-to-end** por HTTP contra el backend levantado y la BD real, con JWT firmado para un usuario `admin` (`puede_gestionar_pv`), otro sin el flag y uno con rol `marketing`. Filas de prueba en `numero_base` 90001+ para no alterar la numeración real. Cubrieron: camino feliz con desvinculación, estado `ENVIADO`, origen `EXCEL`, ítems asignados con rollback intacto, familia con extensión, extensión enviada que bloquea a la familia, reapuntado con pedidos restantes, 403 sin permiso, 403 de `marketing`, y 404. Todas pasaron.
- Auditoría confirmada: `auditoria_log` 37226 registra el DELETE por HTTP con `usuario_id` del solicitante.
- Limpieza verificada: 0 filas residuales, 0 ítems colgados, `numero_base` máximo de vuelta en 7076 y ODP-24302 sin pedidos ni proveedor.

### Pendientes

Sigue abierta la recomendación 2 del arreglo de la ODP-24302: la opción `Otros` del selector de proveedor de vidrio se lee como "vidrio propio" y genera un pedido real. El endpoint permite deshacerlo en un clic, pero no evita la causa.

---

## 2026-09-02 — Cierre de 4 instalaciones entregadas que el sistema daba por pendientes

### Contexto

ODP-24228 (456), ODP-24171 (395), ODP-24106 (333) y ODP-24066 (286) ya se habían instalado y entregado al cliente, pero figuraban en `LISTO_INSTALAR`. Las cuatro son del asesor Bryam Arrubla, tres de LABORATORIOS ECAR y una de INGENIEROS DE ANTIOQUIA (79,6 M, abonada al 50 %); todas facturadas.

### Hallazgo — cómo caen en el limbo

El historial de las cuatro es idéntico: `LISTO_INSTALAR → PROGRAMADA → INSTALADA → LISTO_INSTALAR` con observación "Pausa: Termino dia". El instalador pausó al terminar la jornada y **la pausa retrocede el estado de la ODP a `LISTO_INSTALAR`**, dejando la parada en `pausada`. Nadie la retomó.

El resultado es un punto ciego: no salen en Instalaciones (no están programadas) ni en el panel "Pendientes de cierre" —`getODPsAtascadas` (`rutas.controller.ts:1367-1377`) solo levanta `INSTALANDO`, `PROGRAMADA` e `INSTALADA`, y `ESTADOS_RESCATABLES` (`:1391`) excluye `LISTO_INSTALAR`—. **No había forma de cerrarlas desde la aplicación.** Es el mismo limbo que motivó la separación INSTALANDO/INSTALADA, pero entrando por otra puerta: aquel arreglo cubría las que se quedaban en `INSTALADA`; estas retroceden un paso más.

### Cambio realizado

Script one-off `backend-api/src/scripts/2026-09-02_cerrar_entregadas_4odp.ts` — **ejecutado**. Replica `entregarAtascada` (`rutas.controller.ts:1481`) para cada ODP en su propia transacción: parada de la ruta viva → `completada` con `fin_instalacion`; ruta (379, 381, 380, 337) → `completada` con `fin_ruta`; ODP → `ENTREGADA`; registro en `historial_estados_odp` atribuido a ROOT.

Verificado en BD: las 4 en `ENTREGADA` con parada y ruta cerradas. 12 registros en `auditoria_log` (`odp`, `rutas_instalacion` y `ruta_odps`) con `usuario_id: 30`. Reejecución posterior confirma idempotencia: las salta sin escribir.

### Decisiones técnicas

- **Las 9 paradas residuales se dejaron abiertas.** Cuelgan de rutas ya canceladas o completadas, restos de reprogramaciones anteriores (24066: 4, 24106: 3, 24171: 2). El ENUM de `ruta_odp.estado` no tiene `cancelada` —solo `pendiente|en_curso|pausada|completada|con_dano`— y marcarlas `completada` afirmaría instalaciones que nunca ocurrieron. Con la ODP en `ENTREGADA` ninguna consulta viva las levanta.
- **Cerrar las rutas era seguro:** se verificó que cada una de las 4 contiene una sola parada, la de su ODP. El script lo revalida antes de escribir y aborta si encuentra más.
- **Una transacción por ODP**, no una global: un fallo aislado no arrastra a las otras tres.
- **Script en vez de mover a `INSTALADA` para usar el panel**, que habría metido un estado falso en el historial solo para sortear el filtro.

### Pendientes

Hay **5 ODP más en el mismo limbo** (`LISTO_INSTALAR` o `PAUSADA` con paradas abiertas), todas facturadas: `ODP-24000` (ECAR, 4 paradas), `ODP-24203` (Parque Comercial El Tesoro), `ODP-24248` (Parroquia San Pío), `G-0014` (Indumecanicer) y `ODP-24164` (Persa Medical, en `PAUSADA`). No se tocaron: falta confirmar con el usuario cuáles están efectivamente entregadas.

Arreglo de raíz por decidir: que la pausa de fin de jornada **no** retroceda la ODP a `LISTO_INSTALAR`, o que el panel de pendientes de cierre contemple ese estado cuando arrastra una parada abierta. Mientras no se resuelva, cada caso exige un script.

---

## 2026-09-03 — Proveedores: Fase 3 (listas de precios), alias operativos y 4 correcciones

### Contexto

Sesión iniciada con `git pull` (`5a96168` → `b67bcc3`: formato Templacol de Pedidos PV, propagación de proveedor desde la ODP, reactivación de padre de NC — nada del módulo Proveedores). El usuario pidió un análisis del módulo para saber si le faltaba alguna fase y qué se podía mejorar; tras entregarlo, autorizó ejecutar las recomendaciones en el orden que se considerara correcto.

### Diagnóstico del análisis

Fases 1 y 2 completas y endurecidas desde la auditoría del 2026-08-30. **Fase 3 (`compras.md §3.2`) nunca se construyó:** el `origen: 'LISTA'` estaba declarado en el modelo y ningún camino del código lo escribía. Y la ayuda que sostiene todo el diseño de mapeo (`§3.4`, el diccionario de alias) estaba **a medias**: cada vinculación guardaba la descripción del proveedor como alias, pero el buscador del modal llamaba a `/api/catalogo?q=`, que solo miraba `codigo`, `nombre` y `descripcion`. Los alias se acumulaban sin que nada los leyera, así que la promesa de "el segundo proveedor se sugiere solo" no ocurría: mapear el tercer proveedor costaba lo mismo que el primero.

### Cambios realizados

**Backend**
- `proveedor.controller.ts` — **bug corregido:** tras crear un pendiente, la bandeja en memoria guardaba `true` en vez de la instancia creada. Una factura con el mismo código en dos unidades (una línea `MTR` y otra con el relleno genérico `94`) llegaba en la segunda vuelta a `getDataValue` sobre un booleano y tumbaba la factura **entera** con `TypeError`. No corrompía datos —el CUFE no se registraba y era reprocesable—, pero el precio se perdía hasta que alguien leyera el listado de errores.
- Caso adyacente que destapó el fix: el mismo código repetido en un documento inflaba `veces_visto` y dejaba en la bandeja el precio de la otra modalidad. Ahora se conserva la primera lectura y se emite aviso `UNIDAD_DISTINTA`.
- Eliminado el N+1 residual del contraste de IVA: era un `findByPk` por línea actualizada (40 consultas en una factura de 40 líneas) para leer tres columnas. Los productos se precargan con las equivalencias.
- **Endpoint nuevo `POST /:id/importar-precios` (Fase 3)** — importación de lista de precios en Excel, con detección automática de columnas y **previsualización obligatoria**: el primer envío es `dry_run` y no escribe nada. Códigos sin equivalencia van a la bandeja con el mismo derivador `SD-<hash>` que usa la ingesta de facturas, para que lista y FE del mismo ítem caigan en la misma fila.
- **Endpoint nuevo `GET /facturas`** — bitácora de documentos ya procesados. La tabla `factura_proveedor_procesada` se escribía desde el primer día y no la leía nadie.
- `catalogo.controller.ts` — la búsqueda por `q` consulta ahora también `producto_alias` y marca cada resultado con el sinónimo que hizo la coincidencia (`coincide_por_alias`). Va como complemento: los aciertos por código o nombre conservan su orden y encabezan la lista.
- `configuracion.controller.ts` — `update({ ...req.body })` sin whitelist permitía escribir cualquier columna de `configuracion_global`, `id` incluido. Ahora hay lista explícita de campos, validación de rango para el umbral (1–200) e invalidación de la caché de `proveedor.controller` al guardarlo.
- `dianXmlParser.ts` — `derivarCodigo` exportado para compartirlo con la importación de listas.

**Frontend**
- `ImportarListaPreciosPanel.tsx` (nuevo) — selector de proveedor, fecha de vigencia, modalidad por defecto, casilla "los precios incluyen IVA" (descuenta para guardar la base comparable) y flujo previsualizar → aplicar, con las columnas reconocidas a la vista.
- `FacturasProcesadasPanel.tsx` (nuevo) — historial colapsable, con búsqueda por número, archivo o CUFE completo. Solo consulta al desplegarse.
- `ConfiguracionPage.tsx` — sección "Precios de Proveedores" con el umbral de variación, que era una decisión tomada el 2026-08-23 ("editable desde `/configuracion` sin tocar código") y no tenía pantalla.
- `ProveedoresTab.tsx` — debounce de 300 ms: `cargar` dependía de `busqueda` sin espera, así que escribir "vitelsa" disparaba siete descargas del maestro completo. Las otras pestañas ya lo hacían.
- `VincularCodigoModal.tsx` — los productos sugeridos por sinónimo se muestran marcados con el alias que los trajo.

### Verificación

**40 comprobaciones end-to-end** contra el backend levantado y la BD real, con proveedor y catálogo sintéticos (NIT `999999999`, código `ZZTEST001`): alias en el buscador, whitelist y rango del umbral con restauración del valor real del usuario, detección de encabezados bajo un título, lectura de "12.500" como doce mil quinientos, dry-run que no toca la BD, aplicación con corrimiento a `precio_anterior_1` e histórico `origen=LISTA`, reaplicación sin ensuciar el histórico, lista retroactiva, la factura de doble unidad que antes reventaba, la bitácora, y dos regresiones (idempotencia por CUFE y comparador). Todas pasaron; la BD quedó verificada sin residuos. Compilación limpia de backend y frontend (`tsc --noEmit`).

Durante la verificación falló una comprobación legítima: con `blankrows: false` la matriz del Excel se compactaba y el informe decía "encabezados en la fila 2" cuando en el archivo del usuario estaban en la 3 — y los "Fila N: sin precio" quedaban igual de desfasados. Corregido a `blankrows: true` saltando las filas vacías al iterar.

### Decisiones técnicas

- **La lista de precios previsualiza antes de aplicar.** Cada proveedor arma su Excel a su manera; mostrar qué columnas se reconocieron y qué haría con cada fila es más barato que deshacer una carga equivocada sobre precios que deciden compras.
- **La lista respeta las mismas reglas que la factura**: la fecha de vigencia manda sobre el orden de carga, una lista anterior se archiva como retroactiva, la modalidad decide qué precio se toca y un código desconocido va a la bandeja en vez de adivinarse.
- **Un código `DESCARTADO` no se reabre desde una lista.** Fue una decisión humana.
- **El alias complementa, no reemplaza.** Si el alias reordenara los resultados, un sinónimo viejo podría desplazar al producto correcto.

### Pendientes

- **Backfill de los `.zip` históricos** (`compras.md §3.4`, ayuda 4): sigue sin hacerse. Exige extraer la ingesta a un servicio compartido para no duplicar la lógica en un script, y el parseo continúa siendo síncrono dentro del request (riesgo 🔴 de `§5.4` para lotes masivos).
- **Categorías de producto** (requisito 2 original): sigue sin poder cumplirse, 95 % vacías.
- Sin fusión de proveedores duplicados (`VyP`/`VYP`), sin pantalla para corregir alias mal aprendidos, y sin el cálculo del sobrecosto de fraccionar (tira vs metro).
- Los 49 códigos puramente numéricos previos al fix del parser siguen esperando revisión humana.

---

## 2026-09-03 (2) — Proveedores: buscador transversal del módulo

### Contexto

El usuario pidió poder escribir en un solo lugar y que el sistema fuera relacionando código, producto, descripción y proveedor. Se levantó primero el estado real: **el módulo tenía seis buscadores con seis alcances distintos**, y el reparto estaba invertido — el más completo (Equivalencias, que ya cruzaba cinco campos) era el más escondido, mientras que el principal (Consultar Precios) era el más pobre de los seis **y el único que exigía Enter**.

Tres carencias concretas en la pantalla principal: escribir el código del proveedor no encontraba nada (justo el dato que uno tiene delante al mirar una factura de VEA o Vitelsa), escribir el nombre del proveedor tampoco, y las palabras sueltas no funcionaban ("vidrio incoloro 6" no encontraba "VIDRIO TEMPLADO 6MM INCOLORO", porque se buscaba la frase literal).

**Hallazgo lateral:** el sistema ya tiene un buscador global (`/api/search`, ODP + clientes + prospectos + leads) con exactamente este patrón, pero **ninguna pantalla lo consume**. Es un endpoint huérfano, como los tres módulos frontend que documenta `CLAUDE.md`. Se descartó extenderlo para proveedores: lo usan todos los roles y los precios de compra solo pueden verlos `root`/`admin`; meter costos ahí sería una fuga esperando ocurrir.

### Decisión de diseño que redujo el trabajo

En vez de reescribir la lógica de `consultarPrecios` —delicada y ya endurecida— se construyó **un solo motor de sugerencias que alimenta las dos piezas**: la barra del módulo y el autocompletado de la pantalla principal. Ambas entienden lo mismo por construcción, y `consultarPrecios` conserva su contrato.

### Cambios realizados

**Backend**
- `GET /api/proveedores/buscar` (nuevo) — devuelve cinco grupos (productos, proveedores, por mapear, equivalencias, documentos procesados), 5 resultados cada uno, mínimo 3 caracteres. Las palabras se cruzan en AND y los campos en OR, de modo que el orden en que se escriban no importa.
- Cada producto sugerido trae **por qué apareció** (`motivo`: código propio, código del proveedor con su nombre, sinónimo aprendido, o nombre) y su **precio de referencia con la modalidad**: se traen las filas de precio en una sola consulta en lugar de un `MIN()` agregado, porque decir "desde $8.000" sin aclarar que es por metro —cuando el resto se compra por tira de 6 m— induce peor error que no decir nada.
- `consultarPrecios` — se añadió el código y la descripción del proveedor como fuente de búsqueda, después del código propio y antes de los sinónimos. Sin cambios de contrato.

**Frontend**
- `hooks/useBusquedaModulo.ts` (nuevo) — mínimo de 3 letras, espera de 300 ms y **cancelación de la consulta anterior**: sin eso, la respuesta lenta de "vid" puede llegar después de la de "vidrio" y pisar en pantalla el resultado correcto.
- `BuscadorProveedores.tsx` (nuevo) — la barra única, con resultados agrupados y navegación por teclado (↑ ↓, Enter, Esc).
- `ProveedoresPage` — enruta cada tipo de resultado a su pestaña con el filtro puesto. Usa un `nonce` en la `key` para forzar el remontaje: sin él, elegir dos veces el mismo proveedor no volvería a aplicar el filtro porque el valor no habría cambiado.
- Las cinco pestañas aceptan un filtro de entrada opcional (`busquedaInicial` / `productoInicial`), inicializando también el valor ya "aplicado" para no gastar una consulta sin filtro antes del debounce.
- `ConsultarPreciosTab` — el input sugiere mientras se escribe; **el botón y el Enter siguen funcionando** para quien ya tiene el hábito.
- El panel de documentos procesados nace abierto y filtrado cuando se llega a él desde el buscador.

### Verificación

**28 comprobaciones end-to-end** contra el backend levantado y la BD real, con dos proveedores y un producto sintéticos vendido por ambos en modalidades distintas: umbral de 3 letras, búsqueda por código propio / palabras en desorden / sinónimo / código de proveedor con su motivo correcto en cada caso, precio mínimo con su modalidad (12.000 por metro frente a 45.000 por unidad), conteo de proveedores, grupos de proveedor por nombre y por NIT, bandeja que **no** resucita un código descartado, documentos por número, producto inactivo que no se propone, término sin coincidencias, y cuatro regresiones del comparador. Todas pasaron; BD verificada sin residuos. `tsc --noEmit` limpio en ambos proyectos.

### Pendientes

Sin cambios de esquema. Con los volúmenes actuales (1.212 productos, 1.011 proveedores) las búsquedas por texto no necesitan índices; si el catálogo crece mucho, habría que evaluar `pg_trgm`. El buscador global huérfano (`/api/search`) sigue sin consumidor: queda anotado por si algún día se decide revivirlo o retirarlo.

### Adenda — la tab "Pendientes de cierre" ya no se oculta

El usuario reportó que en Instalaciones había una pestaña desde la que cerraba instalaciones y ya no la veía. Diagnóstico: la tab existe —se llamaba "Atascadas" y el commit 5a96168 la renombró a "Pendientes de cierre"— pero `JefeView.tsx:536` solo la pintaba si `atascadas.length > 0`, y la consulta de `/api/rutas/atascadas` devolvía 0 filas (ninguna ODP en `INSTALANDO`, ninguna `PROGRAMADA` vencida, y ninguna de las 12 en `INSTALADA` con parada abierta). La regla de ocultamiento ya existía antes del renombrado.

**Cambio:** se quitó esa condición —la tab se comporta como las demás— y el aviso rojo que la encabeza ahora solo aparece cuando hay elementos, porque con la lista vacía contradecía al mensaje "No hay instalaciones pendientes de cierre". Solo frontend, sin backend ni BD. Compilación limpia.

El badge muestra "0" cuando no hay pendientes, igual que el resto de las tabs.

### Hallazgo colateral — no hay forma de marcar `INSTALADA` desde la interfaz

El commit 5a96168 definió `LISTO_INSTALAR → INSTALADA` como marcado manual de "trabajo culminado", pero ese control nunca se construyó. Las tres vías de cierre existentes llevan todas a `ENTREGADA`: finalizar parada en Programados (con foto y receptor), "Marcar entregada" en Pendientes de cierre (cierre administrativo con motivo) y "Marcar Entregada" en Producción → Pedido en la mano → Listos. Las 12 ODP que hoy están en `INSTALADA` provienen de la migración de datos de ese commit, ninguna se puso desde la aplicación.

Antes del commit sí se llegaba a `INSTALADA`, pero por el camino equivocado: el instalador pulsaba "Iniciar" y la ODP quedaba marcada como instalada aunque el trabajo apenas empezara — justo lo que se corrigió. Queda pendiente decidir si el marcado manual necesita interfaz propia, dónde vive y qué roles la ven.

---

## 2026-09-03 — NC huérfana en PAUSADA, formato Templacol y propagación del proveedor

Dos trabajos independientes, ambos disparados por una revisión que pidió el usuario sobre el widget "No Conformidades abiertas" del panel ROOT.

### Parte 1 — ODP-23925 llevaba 3 meses huérfana en `PAUSADA`

**Punto de partida.** El usuario afirmó que las 20 ODP del widget ya estaban instaladas y entregadas salvo ODP-24203 y ODP-24164, y pidió verificarlo. La columna "ODP" de ese widget sale de `no_conformidades.odp_id` (`root.controller.ts:832-841`), o sea la ODP **padre**, no la de reproceso.

**Resultado de la verificación.** 17 de 20 padres estaban en `INSTALADA` o `ENTREGADA`. ODP-24203 efectivamente seguía en curso (`LISTO_INSTALAR`, reproceso en `MEDICION`). Pero apareció una que el usuario no había señalado: **ODP-23925 (NC-0005) seguía en `PAUSADA` desde el 21-may-2026**, pese a que su reproceso ODP-24002 está `ENTREGADA` desde el 01-jun-2026.

**Causa raíz.** La regla de reactivación de `updateODP` (`odp.controller.ts:1161`) solo disparaba con `data.estado_produccion === 'INSTALADA'`, comparando el valor exacto que llega en la petición. El historial de ODP-24002 no tiene ningún registro con `estado_nuevo = INSTALADA`: saltó de `PROGRAMADA` a `ENTREGADA` en una sola actualización manual (observación `null`, o sea no vino de `rutas.controller.ts` ni de `evidencia.controller.ts`). Al no calzar el valor exacto, la regla nunca corrió.

**Mapa forense.** Cinco puntos del código mueven una ODP a `ENTREGADA`/`INSTALADA`. Tres ya reactivaban al padre correctamente —`finalizarInstalacion` (`rutas.controller.ts:822`), `entregarAtascada` (`:1481`) y el flujo de evidencias (`evidencia.controller.ts:11`)—; dos no: `updateODP` (solo con el valor exacto) y `terminarRutaConductor` (`rutas.controller.ts:1216`, cierre automático de acarreo puro, que no verificaba `es_no_conformidad` en absoluto).

El asunto dejó de ser un caso aislado el 2026-09-02: al separarse `INSTALANDO` de `INSTALADA`, el flujo por ruta pasó a ir `PROGRAMADA → INSTALANDO → ENTREGADA`, **sin tocar `INSTALADA`**. De ahí en adelante ninguna hija cerrada por ruta habría reactivado a su padre desde `updateODP`.

**Cambios.** Se amplió la condición a `['INSTALADA','ENTREGADA'].includes(...)` en `updateODP` y se añadió el mismo bloque de reactivación en `terminarRutaConductor`. El padre sigue aterrizando solo en `INSTALADA`, que es su estado terminal por diseño (ver `2026-09-02_agregar_estado_instalando.ts`: *"padre reactivado tras reproceso = terminada"*) y coincide con `ESTADOS_COMPLETADAS`. Script `2026-09-03_reactivar_odp23925_nc0005.ts` — **ejecutado**, verificado en `auditoria_log` (id 37578, ROOT).

**Commit:** `a408971`.

### Parte 2 — Formato Templacol y propagación del proveedor

**Punto de partida.** El usuario aportó `Formatos/PEDIDO TEMPLACOL #COPIA.xlsx` y pidió que al seleccionar Templacol en la ODP se usara ese formato en plantilla Excel, generador y printable.

**Estado previo.** Templacol ya existía como opción (`PROVEEDORES_PV`), pero solo Vitelsa tenía maquinaria: plantilla, generador (`generarExcelPedidoPV`, hoja hardcodeada) y printable. **Todos los proveedores recibían el formato Vitelsa**, incluido Templacol.

**El formato.** Una hoja, `B2:T54`, 89 celdas combinadas, 29 filas de ítem (`B16:B44`), carta vertical al **43 % de escala** con `printTitlesRow 13:15`. Columnas de acabados BPB/BPM/CHAFLÁN (anchos y altos) y maquinados PERF/BOQ/RADIOS/DSP.

**Cambios.** Plantilla `templacol.xlsx`; `generarExcelPedidoPV` dividido en `llenarPlantillaVitelsa`/`llenarPlantillaTemplacol` con ramificación por proveedor (Vidplex y Otros siguen en Vitelsa); nuevo `PrintablePedidoTemplacol.tsx` y selección del printable por proveedor; tope de ítems por formulario dependiente del proveedor (29 Templacol / 12 resto).

**Propagación del proveedor.** Cambiar `proveedor_vidrio` en una ODP existente no tocaba su Pedido PV: `updateODP` solo creaba el pedido cuando el proveedor se asignaba *por primera vez*. Como el módulo PV elige el formulario por `pedido_pv.proveedor`, se generaba el del proveedor viejo. **Había 4 casos reales**, dos activos (PV 7075 `ENVIADO` y PV 7071 `CONFIRMADO_PROVEEDOR`, ambos ODP en Templacol con PV en Vitelsa) y dos históricos (PV 6870 con el valor sucio `"PV"`, y PV 6763). Script `2026-09-03_alinear_proveedor_pedidos_pv.ts` — **ejecutado**, los 4 alineados, verificación posterior sin desalineados.

**Commit:** `b67bcc3`.

### Decisiones técnicas

- **La capacidad vive en `utils/pedidoPvCapacidad.ts`, no en el controlador.** Al ejecutar el script apareció `TypeError: argument handler must be a function`: `pedido_pv.controller` importa `../server` de forma **estática** y `server → app → routes → controller` cierra un ciclo. Entrando por `server.ts` se resuelve solo (las funciones se usan en runtime, no al cargar), pero entrando por un script el controlador se evalúa primero y las rutas reciben handlers `undefined`. Extraer la lógica a un módulo que solo depende de modelos elimina además el acoplamiento controlador→controlador que había introducido.
- **Propagación en cualquier estado del pedido**, decidido por el usuario: la ODP es la fuente de verdad. Reescribe pedidos ya `VERIFICADO`/`ENTREGADO`, pero queda en `auditoria_log` con autor y valor anterior, así que es reversible desde el panel ROOT.
- **Actualización por instancia, no bulk.** Los hooks de `MODELOS_AUDITADOS` no disparan en `Model.update({}, { where })`; un update masivo habría dejado el cambio sin registro.
- **Re-particionado solo cuando es necesario.** Rehacer un grupo elimina y recrea sus extensiones, perdiendo su estado y fechas. Solo corre si algún pedido excede el tope del formato nuevo (Templacol 29 → Vitelsa 12); el camino inverso nunca lo necesita.
- **Bloquear el vaciado del proveedor** (409) si la ODP ya tiene Pedido PV, en vez de borrar el pedido en cascada.
- **Celdas en cero van vacías** en los cuatro documentos, extendido a Vitelsa a pedido del usuario. En los printables `pulidos`/`espesor` son STRING y `"0"` es *truthy* en JS, así que `|| ''` no los vaciaba.
- **La plantilla se copió sin modificar.** Se planeaba limpiar `O4` y `E4`, pero el usuario ya había vaciado `O4` y el generador sobrescribe ambas siempre; evitar el round-trip por ExcelJS preserva el original intacto.

### Verificación

Compilación limpia en backend y frontend. Prueba real de generación del Excel Templacol con datos del PV 7075: cabecera, pie y los 29 renglones se escriben en las celdas correctas, **los 89 merges quedan intactos** y `O16`/`P16` salieron vacíos (perforaciones y boquetes en 0). Auditoría confirmada para los 5 UPDATE de los dos scripts.

### Pendientes

- **`PATCH /api/pedidos-pv/:id` sigue permitiendo cambiar `proveedor` directamente** (está en la lista blanca de campos, `pedido_pv.controller.ts`). Es la vía más probable por la que nacieron los 4 desalineados y sigue abierta. Fuera de alcance por decisión del usuario.
- **Propagación sin ejecutar en vivo:** verificada por compilación y revisión de lógica, no por corrida real — requiere sesión autenticada. Igual el re-particionado Templacol→Vitelsa: hoy ningún pedido supera 12 ítems.
- **Densidad del printable Templacol:** el Excel necesita 43 % de escala para caber en carta vertical, así que el impreso queda de fuente muy pequeña. Falta validarlo con una impresión real.
- **`pulidos`/`pulidos_h` no son metros lineales**, pese al rótulo de la columna en el formato Templacol. Ver `TECH_DEBT.md` 2026-09-03.

---

## 2026-09-04 — Permisos de herramientas: diagnóstico y reconfiguración

### Contexto

El usuario pidió revisar la configuración para dejar de recibir prompts de permiso en cada comando. Se escanearon **318 llamadas a Bash/PowerShell** en las 8 sesiones recientes de `~/.claude/projects/` y las tres capas de configuración (`.claude/settings.json`, `.claude/settings.local.json`, `~/.claude/settings.json`).

### Diagnóstico — la causa no era el allowlist

**El 32 % de las llamadas (101 de 318) tenían la forma `cd <ruta> && <comando>`.** Un comando compuesto con `cd` se evalúa como una unidad y pide permiso **aunque el comando final esté aprobado**: `Bash(npm run build:*)` nunca matchea `cd backend-api && npm run build`. Ninguna entrada del allowlist arregla eso. El propio `CLAUDE.md` documentaba los comandos de desarrollo con esa forma, que es de donde venía el hábito.

Causas secundarias: **cero patrones de PowerShell de lectura** pese a ser el shell primario en Windows (41 usos de `Get-ChildItem`, 11 de `Get-Content`, 10 de `Get-CimInstance`, 7 de `Select-String`), y **17 entradas muertas** fijadas al scratchpad de una sesión ya cerrada (`3a5eadc4-…`), que nunca volverán a matchear.

### Hallazgo de seguridad

`Bash(node:*)`, `Bash(npx:*)` y `Bash(curl:*)` estaban aprobados: equivalen a **ejecución de código arbitrario y llamadas de red arbitrarias sin prompt**. Por decisión del usuario se estrecharon. `ts-node` quedó limitado por prefijo a `src/scripts/` y al directorio scratchpad de la sesión, en vez de comodín abierto.

### Cambios

- **`CLAUDE.md`** — comandos de desarrollo reescritos con `npm --prefix <paquete> run <script>` (no hay `package.json` en la raíz del monorepo, por eso la tentación del `cd`), más la subsección *"Ejecución de comandos — nunca componer con `cd`"* con la regla y las alternativas (`git -C <ruta>` para git).
- **`.claude/settings.json`** — 36 → 55 entradas. Se quitaron `node:*`, `npx:*`, `curl:*`, `nodemon:*`, 6 entradas de git de solo lectura que Claude Code ya auto-permite de forma nativa, 6 duplicados de scripts npm y 4 one-offs muertos. Se agregaron los scripts npm del monorepo en forma `--prefix`, `tsc`/`eslint`, `ts-node` acotado, y 11 cmdlets de lectura de PowerShell.
- **`.claude/settings.local.json`** y **`~/.claude/settings.json`** — purgados de las 17 entradas muertas. No se tocó `defaultMode`, `model`, `effortLevel` ni el hook `SessionStart`.

**`git push` quedó deliberadamente fuera del allowlist.** `CLAUDE.md` prohíbe pushear por iniciativa propia y es la única acción que sale de la máquina: el prompt es la última red de seguridad. Cuesta una aprobación cuando el usuario dice "sube los cambios".

### Réplica en la otra máquina

`.claude/` está en `.gitignore` — **esta configuración no viaja por git**. En la máquina de casa/oficina hay que copiar `.claude/settings.json` a mano; mientras no se haga, allá siguen los prompts viejos. El archivo completo está en el repo local, no reproducido aquí para no duplicar una fuente que cambiará.

### Verificación

`npx tsc --noEmit` en `backend-api` y `frontend-web`: ambos exit 0 tras el merge del remoto (2.669 líneas de Fase 3 de Proveedores y buscador transversal).

### Pendientes

- **La configuración de permisos no está versionada.** Si se quiere que viaje entre máquinas habría que sacarla de `.gitignore` o mantener una copia en el repo; hoy es manual y silenciosamente diverge.
- **`Bash(git add *)` y `Bash(git commit *)` siguen aprobados.** Son locales y reversibles, y la regla de `CLAUDE.md` (no commitear sin orden explícita) es la que gobierna — pero es una regla de comportamiento, no un control técnico.

---

## 2026-09-04 (2) — Proveedores: precio unitario dividido por `BaseQuantity`, reset del módulo y aprobación de emisores

### El síntoma

Factura de **HI-TECH FILMS, FED-3171 (21-ago-2026)**. El PDF dice `SILVER 20% 72 SPECTRA · 2,2 · $52.185 · $114.807`. El modal de vinculación mostraba **$23.720,40**.

### Diagnóstico

`52.184,88 ÷ 2,2 = 23.720,40` — exacto, decimales incluidos. El único punto del sistema que divide un precio era `dianXmlParser.ts`:

```ts
const baseQty = parseFloat(...) || 1;
if (precio_unitario > 0 && baseQty > 1) precio_unitario /= baseQty;
```

UBL 2.1 define `cbc:PriceAmount` como el precio de `BaseQuantity` unidades — el caso legítimo *"$X por cada 100"*. Pero buena parte de los emisores colombianos **repite ahí la cantidad facturada** como relleno y deja `PriceAmount` ya unitario. La regla "si es > 1, divide" no distinguía los dos mundos, y el precio quedaba dividido entre la cantidad.

Confirmación aritmética con la segunda línea: `5,9 × $45.882 = $270.706` ⟹ unitario real `45.882,37`, detectado `7.776,67`.

### Corrección

El árbitro pasa a ser `LineExtensionAmount / cantidad`, que es lo que el proveedor cobra: entre las dos lecturas posibles gana **la que menos se aleja** de esa referencia. No se exige coincidencia exacta a propósito — en una línea con descuento el total viene neto y el precio bruto, y aun así la correcta es la que queda cerca. Sin total de línea no hay con qué arbitrar y se conserva la lectura UBL.

Verificado con `2026_09_04_verificar_parser_precio.ts`, 5 escenarios, todos en verde: el caso HI-TECH, el lote real *"$100.000 por cada 100"*, la línea normal sin `BaseQuantity`, el combinado relleno + 10 % de descuento, y la línea sin `LineExtensionAmount`.

### Por qué hubo que borrar y recargar

**El daño no es detectable a posteriori.** `proveedor_producto_precio` guarda el precio, no la cantidad ni el total de línea de donde salió: no hay forma de saber qué filas se dividieron. Y la idempotencia por CUFE impide reprocesar los mismos `.zip`. Decisión del usuario: **reset total del módulo** y recarga desde su archivo de facturas.

`2026_09_04_reset_ingesta_proveedores.ts` — dry-run por defecto, borra solo con `--ejecutar`. Vacía histórico, equivalencias, bandeja, alias y bitácora, y elimina los proveedores `INGESTA_FE`. **No toca `catalogo_productos`** (es el catálogo interno del tab ROOT) ni las fichas `MANUAL`/`IMPORTACION_WO`, que tienen contacto y datos tecleados a mano que ninguna recarga reconstruye; esas quedan en *sin decidir*.

### `seguir_precios` pasa a tri-estado

Segundo problema reportado: con ~20 FE diarias, cada emisor nuevo (combustible, peajes, papelería) ensuciaba la bandeja **antes** de poder apagarlo, porque `resolverProveedor` los creaba en `seguir_precios: true`.

`NULL` = sin decidir · `true` = seguir · `false` = ignorado. La ingesta crea los emisores nuevos en `NULL` y la pantalla de carga pide la decisión con casillas. Migración: `2026_09_04_seguir_precios_tri_estado.ts`.

**Regla unificada `siguePrecios()`:** `activo === true && seguir_precios === true`. Antes, un proveedor dado de baja **seguía alimentando la bandeja** — la pestaña mostraba dos interruptores parecidos ("Activo/Inactivo" y una campanita sin etiqueta) que hacían cosas distintas, y el que el usuario creía que servía para esto no hacía nada de eso.

### La fuga que hubo que cerrar

Un emisor "sin decidir" igual registra su CUFE. Al aprobarlo después, sus facturas **ya no se reprocesarían** (duplicado) y sus códigos no entrarían nunca a la bandeja: la función habría sido inútil en silencio. Al encender el seguimiento se borran sus `factura_proveedor_procesada` que tengan motivo de omisión —nunca las que sí movieron precios— y el mensaje pide volver a subirlas.

### Cambios

| Archivo | Cambio |
|---|---|
| `utils/dianXmlParser.ts` | Arbitraje del precio unitario contra el total de línea |
| `models/proveedor.model.ts` | `seguir_precios` → `allowNull: true`, default `NULL` |
| `controllers/proveedor.controller.ts` | `siguePrecios()` / `motivoOmision()`, `aplicarSeguimiento()`, endpoint masivo, emisores nuevos en `NULL`, `proveedores_por_decidir` en la respuesta del lote, filtro `?seguimiento=`, `activo` agregado al `attributes` del maestro |
| `routes/proveedor.routes.ts` | `PATCH /seguimiento-masivo`, antes de las rutas con `:id` |
| `tabs/ProveedoresTab.tsx` | Chip tri-estado con la regla real, un solo control, selección múltiple, filtro por seguimiento |
| `tabs/CargarFacturasTab.tsx` | Bloque "Proveedores nuevos: ¿cuáles te interesan?" con casillas |
| `tabs/PorMapearTab.tsx`, `ProveedoresPage.tsx` | Textos alineados, tipo `boolean \| null` |
| 3 scripts nuevos | Verificación del parser, migración, reset |

### Detalle que casi rompe todo el lote

`siguePrecios()` lee `activo`, y el `findAll` del maestro en la ingesta **no lo traía en su `attributes`**. Habría valido `undefined`, y con la regla `activo === true` se habrían omitido las líneas de **todas** las facturas del lote, en silencio y con la bitácora diciendo `PROVEEDOR_INACTIVO`. Es el riesgo que `CLAUDE.md` advierte sobre los `attributes` selectivos.

### Verificación

`npm --prefix backend-api run build` exit 0 · build de `frontend-web` exit 0 sin advertencias nuevas (los avisos de BOM son preexistentes en 4 archivos del módulo).

### Ejecutado contra Supabase (backup previo confirmado por el usuario)

**Migración:** `seguir_precios` quedó `is_nullable: YES`, `column_default: null`.

**Reset:** 40 precios (todos de origen `FACTURA` — no había ninguno manual ni de lista, así que nada irreconstruible se perdió), 24 equivalencias, 24 alias, 322 pendientes y 97 facturas borrados. 38 proveedores `INGESTA_FE` eliminados.

**Qué proveedores se salvaron, y por qué se cambió el criterio a mitad de camino.** El plan era conservar en `true` a los que "ya demostraron interés", con dos señales: tener equivalencias mapeadas o tener facturas procesadas. El dry-run imprimió los nombres y la segunda señal resultó inservible: como hasta hoy **todo emisor nacía seguido**, rescataba a `ALMACENES EXITO`, `POSTOBON`, `COMBUSTIBLES LA GRAN VIA`, `PARQUE COMERCIAL EL TESORO` y `ANTIOQUEÑA DE AUTOMOTORES` — el ruido exacto que el cambio buscaba eliminar. Se dejó solo la señal fuerte, el mapeo humano: **2 proveedores** (`CAUCHO VIDRIOS SAS`, `VENTANAS Y PUERTAS S.A.S`). Los otros 971 quedaron sin decidir.

Imprimir los nombres en el dry-run, y no solo los conteos, fue lo que hizo visible el problema: con un `18 proveedores conservados` nadie lo habría notado.

### Pendiente al cierre de la sesión

Redesplegar el backend con el parser corregido y **recargar los 97 `.zip`**. Verificación esperada: `SI2072-10` en $52.184,88 y `SI1560-12` en $45.882,37. Los emisores llegarán como *sin decidir*: se aprueban en el bloque de la pantalla de carga y **se vuelven a subir sus facturas** (al aprobarlos se borra su registro de omisión justamente para permitirlo).

---

## 2026-09-04 (3) — PV 7012 con el formato equivocado: el hueco de la propagación del proveedor

**Punto de partida.** El usuario reporta que **ODP-24211 tiene el Pedido PV 7012 de Templacol pero registra Vitelsa**, y pide que al cambiar el proveedor desde el modal de la ODP el cambio llegue también al módulo Pedidos PV, al impreso y al Excel.

### Lo que había en BD

| Registro | Proveedor | Estado | Detalle |
|---|---|---|---|
| ODP-24211 (id 437) | **Templacol** | MEDICION | cambiado el 04-sep 11:01 (usuario 74), antes Vitelsa |
| PV 7012 (id 508) | **Vitelsa** | ENVIADO | creado 28-jul con Vitelsa, 3 ítems, **enviado el 04-sep 11:51** |

El formulario salió al proveedor con la plantilla Vitelsa **50 minutos después** de que la ODP pasara a Templacol. No era un caso aislado: había **3 desalineados** — 7012 (ODP-24211), 7073 (ODP-24299) y 7077 (ODP-24305), todos Vitelsa con la ODP en Templacol.

### Por qué no propagó — dos causas, no una

**(1) El código nunca corrió en el servidor.** La propagación existe desde `b67bcc3` (03-sep 15:56). En todo `auditoria_log` **no hay un solo cambio de `pedido_pv.proveedor` hecho por la aplicación**: los únicos cuatro los hizo el script de mantenimiento de ayer. La cronología lo confirma — el script alineó a las 15:48, el commit entró a las 15:56, y ODP-24305 (16:47) y ODP-24299 (16:49) se desalinearon **después del commit** sin que nada las propagara. El backend seguía corriendo el build anterior; el propio cierre de la sesión anterior ya dejaba pendiente redesplegarlo.

**(2) Aun desplegado, quedaba un hueco.** Las dos caras del mismo hecho vivían en bloques independientes con condiciones que no cubrían todo el espacio:

```
auto-crear:  data.proveedor_vidrio && !proveedorAnterior
propagar:    data.proveedor_vidrio &&  proveedorAnterior && distinto (comparación estricta)
```

Con `proveedor_vidrio = ''` —**88 ODP en BD lo están**— y un Pedido PV ya creado, `!proveedorAnterior` mandaba al auto-create, que al encontrar el pedido existente no hacía nada, y la propagación se saltaba por exigir `proveedorAnterior` truthy. El pedido se quedaba con el proveedor viejo. La comparación estricta añadía lo suyo: `'vitelsa'` vs `'Vitelsa'` contaba como cambio y reescribía la fila con el valor sucio.

### Cambios

| Archivo | Cambio |
|---|---|
| `utils/pedidoPvCapacidad.ts` | `normalizarProveedor` / `mismoProveedor`; `propagarProveedorAPedidosPV()` (update por instancia + re-particionado); `proveedorParaFormato()` |
| `controllers/odp.controller.ts` | Los dos bloques fusionados en uno solo con comparación normalizada; log de error explícito cuando la propagación falla |
| `controllers/pedido_pv.controller.ts` | `proveedor_vidrio` agregado al `INCLUDE_COMPLETO`; el Excel elige plantilla por el proveedor efectivo y avisa por log si la fila diverge |
| `features/pedidos-pv/PedidosPVPage.tsx` | `proveedorFormato()` — espejo del backend — usado en printable, nombre del Excel, tope de ítems y encabezado del modal de gestión |

**Regla nueva, en una línea:** si el pedido nació de la ODP (`origen = 'SISTEMA'`), el **formato** lo manda la ODP. Un pedido `MANUAL` conserva su proveedor: puede apuntar a otro a propósito.

### Decisiones técnicas

- **La red de seguridad no reescribe la fila.** Imprimir y exportar son lecturas; que un GET corrija datos de paso esconde el problema en vez de mostrarlo. Se elige la plantilla correcta y se deja un `console.warn` con las dos versiones del proveedor.
- **Se preserva el "no recrear pedidos borrados".** Si ya hubo proveedor y no queda ningún pedido es porque se eliminó a propósito desde Pedidos PV; editar la ODP no lo resucita. El auto-create sigue reservado a la primera asignación.
- **La propagación sigue después del `commit`** y con `catch`: si falla, la ODP ya quedó guardada y el usuario no pierde su edición. Lo que cambió es que ahora el log dice qué ODP, qué proveedor y cuál era el anterior.
- **`asignarItems` no se tocó.** Reparte los ítems por `pedido.proveedor`; con la propagación arreglada ese valor ya es el de la ODP para los pedidos SISTEMA, y meterle una consulta más solo duplicaría la red sin un caso real detrás.

### Datos corregidos

`2026-09-03_alinear_proveedor_pedidos_pv.ts` re-ejecutado (es idempotente y detecta dinámicamente): **7077, 7073 y 7012 alineados a Templacol**. Revisión de capacidad sin cambios — los tres van de tope 12 a tope 29 con 1 y 3 ítems, así que no se rehízo ninguna extensión. Verificación posterior: **0 desalineados**. `pedido_pv` con Templacol pasó de 8 a 11 filas.

### Verificación

`npm --prefix backend-api run build` exit 0 · build de `frontend-web` exit 0 (+38 B en el bundle).

⚠️ `npm --prefix backend-api run lint` no corre en esta máquina: no hay `eslint` local y `npx` baja la v10, que rechaza el `.eslintrc` del proyecto. Preexistente, no relacionado con estos cambios.

### Pendiente al cierre de la sesión

**Redesplegar el backend.** Sin eso, ni la corrección de hoy ni la de ayer están activas y el próximo cambio de proveedor volverá a desalinearse. Y en el plano operativo: a Templacol se le mandaron 7012, 7073 y 7077 en formato Vitelsa — **reimprimir y reenviar los tres** desde el módulo, que ahora sí generan la plantilla correcta.

---

## 2026-09-04 (3) — Proveedores: rescate de códigos descartados, lista blanca de seguimiento y sub-pestañas

### De dónde salió

Una pregunta sobre el modal de vinculación: por qué decía *"Facturado por Por metro (fraccionado)"* si la representación gráfica de la factura FE206280 de Ventanas y Puertas dice "unidad" en la columna Unidad de Medida.

**Respuesta:** el chip no lee esa columna —el sistema nunca ve el PDF—, sino `proveedor_codigo_pendiente.unidad_detectada`, que solo se llena cuando el `@unitCode` del XML era informativo (`MTR`, `KGM`, `MTK`). Dos orígenes posibles para un `METRO`: que el XML realmente traiga `MTR` pese al rótulo impreso, o que la fila venga de `desvincularEquivalencia`, que estampa ahí el `unidad_compra` de un mapeo anterior y hace pasar por dato de la factura lo que fue una decisión humana. **Sin resolver:** falta el XML de esa factura. Prueba de 30 segundos: si los otros cinco códigos del mismo documento también dicen "por metro", es el emisor; si solo `389M`, es el desvinculado.

Importa porque `unidad_detectada = METRO` preselecciona esa modalidad **y anula** la sugerencia automática de `TIRA_6M` para aluminio, que solo corre cuando el campo es `null`. Un perfil de 6 m a $67.395 registrado como precio por metro deja el comparador ~6× arriba.

De ahí salió el recorrido por los estados del proveedor, y de ahí lo que se hizo.

### 1. Descartar un código era irreversible

La ingesta respeta `DESCARTADO` como decisión humana y **no lo reabre nunca** — ni al volver a seguir al proveedor, que es justo cuando el usuario espera recuperarlo. Y `PorMapearTab` nunca enviaba el parámetro `estado`, así que el backend siempre filtraba `PENDIENTE`. Los descartados existían en BD y ninguna pantalla los mostraba: el único deshacer era editar la tabla.

Pesa más de lo que parece porque "ignorar proveedor" descarta **todos** sus pendientes de un golpe.

| Archivo | Cambio |
|---|---|
| `controllers/proveedor.controller.ts` | `restaurarPendiente` (PATCH) y `restaurarLote` (POST); `ESTADOS_BANDEJA` valida el filtro `?estado=` |
| `routes/proveedor.routes.ts` | Ambas rutas, antes de las literales con `:id` |
| `components/tabs/PorMapearTab.tsx` | Selector "Por mapear / Descartados"; acciones por fila y en lote según la vista; textos y estado vacío adaptados |

**Decisiones:** solo se restaura desde `DESCARTADO` — un `MAPEADO` responde 409 pidiendo desvincular primero, porque ya tiene equivalencia activa. "Vincular" queda disponible también en la vista de descartados (`vincularPendiente` nunca validó el estado). Y el mensaje avisa cuando el proveedor sigue sin seguimiento: restaurar el código **no** reanuda al proveedor, son dos decisiones distintas y confundirlas deja esperando una factura que no va a traer nada.

### 2. Lista blanca de seguimiento

Se sustituyó el criterio automático del reset de la mañana ("tiene equivalencias mapeadas") por una lista explícita de proveedores de insumo. **Tenía que ser script:** no existe ninguna vía para devolver `seguir_precios` a `NULL` — `seguimientoMasivoSchema` y `proveedorUpdateSchema` exigen booleano.

`2026_09_04_seguimiento_lista_blanca.ts`, en dos fases porque cuatro de los nombres buscados (`avq`, `ppa`, `vea`, `soho`) son subcadenas cortas contra 1.011 filas. La fase 1 solo propone; la fase 2 exige `--ids` confirmados. Modo `--buscar=` para cerrar los que no matchean.

Dos no aparecieron con el nombre dado: **Todovidrios** es `TODOVIDRIO Y ALUMINIO SAS` (singular) y **Palacio de Aluminio** es `EL PALACIO DEL ALUMINIO S.A.S` ("DEL"). "VEA" tenía dos candidatos —`VEAIRE` y `VIDRIO EQUIPOS Y ACCESORIOS VEA & CIA`— y se eligió el segundo. Se sumaron a los 12 pedidos los tres que ya venían en seguimiento (`ALUMINIOS Y MAS`, `CAUCHO VIDRIOS`, `CIELOS Y VENTANAS`).

**Resultado:** 1.011 proveedores → **15 siguiendo, 0 ignorados, 996 sin decidir**. Y **74 facturas liberadas** (Vitelsa 45, Rapi Vidrios 8, Hi-Tech 8, Mundial de Tornillos 5, VEA 4, Todovidrio 2, PPA 1, Palacio 1): hay que **volver a subir esos `.zip`** para que sus códigos entren a Por Mapear. No hay alternativa — ver `TECH_DEBT.md` 2026-09-04 (2).

### 3. Sub-pestañas Activos / Pendientes / Ignorados

| Archivo | Cambio |
|---|---|
| `controllers/proveedor.controller.ts` | `resumenSeguimiento` (conteos con `FILTER`, una consulta); filtro `seguimiento` alineado con `siguePrecios()`; `limit`/`offset` en la vista de tabla |
| `routes/proveedor.routes.ts` | `GET /resumen-seguimiento` |
| `components/tabs/ProveedoresTab.tsx` | Sub-pestañas con contador en vez del `<select>`; paginación con "Mostrar 200 más"; estado vacío por pestaña |

**Dos correcciones de paso.** El filtro `seguimiento=ignorado` miraba solo `seguir_precios = false`, mientras la pantalla etiqueta IGNORADO también a los inactivos: un proveedor dado de baja con la bandera en `true` no salía en ninguna de las tres pestañas. Y las condiciones se acumulan ahora en `Op.and`: con seguimiento y búsqueda activos a la vez, el segundo `Op.or` pisaba al primero.

**Paginación:** la pestaña descargaba las ~1.000 filas completas en cada carga (`findAll` sin `limit`). Se pagina de a 200 y el conteo real de cada grupo sale del resumen. El modo `compacto` queda sin paginar a propósito: alimenta selectores que necesitan el maestro entero y ya viaja con tres columnas.

### Verificación

`npm --prefix backend-api run build` exit 0 · `tsc --noEmit` de `frontend-web` exit 0. Estado en BD confirmado con una segunda corrida en dry-run del script.

Sin migración de esquema: `proveedor_codigo_pendiente.estado` ya era `VARCHAR(20)` sin CHECK constraint y admitía los tres valores; solo faltaba pantalla.

### Pendiente

1. **Volver a subir las 74 facturas** de los 8 proveedores recién aprobados.
2. **Redesplegar backend y frontend** — sin eso no hay vista de descartados ni sub-pestañas.
3. **Cerrar el caso `389M`**: conseguir el XML de FE206280 y confirmar si el `MTR` es del emisor o del desvinculado.

---

## 2026-09-05 — PV 7085 por script y la causa del "Error al crear pedido PV": PUL A/PUL H mandaban número

**Punto de partida.** El usuario pide crear un Pedido PV para **ODP-24000** (Vitelsa, 3 cristales) pasando una captura del modal ya lleno. Al no poder enviarlo desde el navegador, se crea por script; **después** se descubre que la razón por la que no podía enviarlo era un bug del propio modal.

### 1. Dos verificaciones que cambiaron el pedido antes de crearlo

**Las medidas de la captura estaban incompletas.** El formulario mostraba `110×217`, `112×217`, `119×218` mm, un orden de magnitud por debajo de los 61 ítems ya cargados en la ODP (680–1420 × 2138–2483 mm). El `MTS PT` que el propio modal calculaba (2.401 / 2.453 / 2.598 m²) solo cuadra con las medidas ×10. Consultado, el usuario confirmó las reales: **1104×2175, 1128×2175, 1190×2183 (1 und. c/u)**. Sin ese cruce se habrían pedido 3 vidrios de 11 cm a Vitelsa.

**ODP-24000 ya tenía ruta PV avanzada:** `proveedor_vidrio = Vitelsa`, `LISTO_INSTALAR`, **8 Pedidos PV** (6857 + extensiones −1…−5, 7020, 7060), casi todos VERIFICADO. Se confirmó con el usuario que el noveno era intencional antes de escribir.

### 2. Creación por script

`crear_pedido_pv_odp24000_2026-09-05.ts` replica exactamente `crearPedido()` del frontend: `ODPItem.bulkCreate` (como `agregarItems`) y luego `PedidoPV.create` con la misma generación de consecutivo y reintento ante colisión. Todo en una transacción.

**Resultado:** ítems 1851-1853 y **PV 7085** (id 592), Vitelsa, PENDIENTE, entrega 2026-09-15, espesor 8, `creado_por = 76` (Alejandro Ardila). Los ítems quedan con `pedido_pv_id = null` — igual que en el flujo real, la asignación se hace después desde "Por Gestionar".

⚠️ Al ir por script no se emitió `emitirCambio('pedidos_pv')` (hay que recargar la página) y el `bulkCreate` no dejó rastro en `auditoria_log` — **mismo comportamiento que el endpoint real**, que tampoco pasa `individualHooks: true`.

### 3. La causa raíz del error del modal

`pulidos` y `pulidos_h` son **texto** en todo el sistema (`STRING(10)` en `odp_item.model.ts`, `z.string()` en `odpItemSchema`). Pero el modal los pintaba con `type: 'number'` y su `onChange` genérico hacía `parseInt(e.target.value) || 0`, guardando un **number**. Zod rechazaba → `POST /odp/:id/items` devolvía **400**, y el `catch` ciego de `crearPedido()` lo mostraba como el genérico *"Error al crear pedido PV"*.

**Basta con tocar PUL A o PUL H para romperlo**, incluso al borrarlos: `parseInt('') || 0` da el número `0`. Por eso la captura original —con PUL A=2 y PUL H=2— no se podía enviar, y por eso hubo que crear el 7085 por script.

**Reproducción determinista** (schema verbatim contra el payload real del modal):

| Payload | Antes | Después |
|---|---|---|
| Ítem sin tocar | ✅ | ✅ |
| Con medidas, sin tocar PUL | ✅ | ✅ |
| **PUL A/H = `2` (number)** | ❌ `expected string, received number` | ✅ |
| PUL A/H = `'2'` (string, modal corregido) | — | ✅ |
| PUL A/H borrados (`''`) | — | ✅ |

**Discriminador que evitó adivinar:** `crearPedido()` hace dos peticiones en secuencia. Cero ítems con `id > 1853` en BD ⇒ la primera nunca insertó ⇒ el fallo estaba ahí y no en `/pedidos-pv` (no era permiso `puede_gestionar_pv`).

**Antigüedad:** roto desde `a54e09c` (2026-05-01), el commit que creó el modal. `3a9bc85` (2026-08-25) corrigió el mismo desajuste para `ancho_mm`/`alto_mm` **pero no tocó pulidos**. `ODPForm` nunca falló porque usa `register()` de RHF sin `valueAsNumber`, así que manda string.

### Cambios (commit `712773f`)

| Archivo | Cambio |
|---|---|
| `features/pedidos-pv/PedidosPVPage.tsx` | Flag `guardaTexto` en el descriptor de campos: PUL A/PUL H se siguen pintando como número (teclado y alineación) pero se **guardan como string**. Borrar el campo deja `''`, no el `"0"` sucio |
| `controllers/odp.controller.ts` | `pulidos`/`pulidos_h` → `z.coerce.string()`, mismo patrón que ya tenía `espesor` |
| `features/pedidos-pv/PedidosPVPage.tsx` | `crearPedido()`: el catch ciego pasa a mostrar el mensaje del backend, filtrando por `string` porque el 400 de `createPedidoPV` devuelve `error` como array de issues de Zod |

### Decisiones técnicas

- **Los dos arreglos son complementarios a propósito, no redundantes.** El de backend acepta lo que manda cualquier cliente viejo (por eso el fix quedó activo en producción incluso antes de confirmar el redespliegue del backend); el de frontend evita guardar `"0"` al borrar el campo. Ninguno depende del otro.
- **`z.coerce.string()` verificado antes de proponerlo**, no asumido: acepta números y **conserva `null`/`undefined`** sin convertirlos a `"null"`, porque `ZodNullable`/`ZodOptional` cortan antes de la coerción.
- **`perforaciones` y `boquetes` conservan el `parseInt`**: sí son `INTEGER` en BD.
- Sin migración: el modelo ya era `STRING(10)`.

### Verificación

`npm --prefix backend-api run build` exit 0 · `tsc --noEmit` de `frontend-web` exit 0.

**En producción, comprobado contra los servicios reales:**
- **Frontend — prueba directa:** el bundle servido por Cloudflare Pages (`/static/js/main.f366a50b.js`) **contiene** la cadena `"No se pudo crear el pedido PV"`, que solo existe en este commit.
- **Backend — evidencia fuerte:** `/health` reportó `uptime` de 22.9 min ⇒ el proceso arrancó **18 min después del push**, con latencia de 0.55 s (no fue un despertar por inactividad).

### ⚠️ Corrección importante sobre el despliegue

**El backend NO se redespliega con `docker compose up -d --build`.** Corre en **Render** (`BACKEND_URL=https://vidriostemplex-system.onrender.com`, en `backend-api/.env.example`) y **auto-despliega al detectar el push a `main`**, construyendo desde el `Dockerfile`. El `docker-compose.yml` del repo es para local/autohospedado. Durante esta sesión se dio la instrucción equivocada antes de verificarlo; queda anotado para no repetirla.

Con este deploy **se fueron también los 9 commits de `backend-api/src` pendientes desde el 03-sep**, lo que destraba los pendientes operativos de las dos sesiones anteriores.

### Pendiente al cierre

1. **Volver a subir las 74 facturas** de los 8 proveedores aprobados (venía del 04-sep, ahora ya desplegado el backend que lo permite).
2. **Reimprimir y reenviar a Templacol los pedidos 7012, 7073 y 7077**, que salieron en formato Vitelsa (venía del 04-sep).
3. **Asignar los ítems 1851-1853 al PV 7085** desde "Por Gestionar".
4. **La creación de Pedido PV no es atómica:** `crearPedido()` hace dos peticiones sin transacción. Si la de ítems pasa y la del pedido falla (p. ej. 403 por `puede_gestionar_pv`), quedan **ítems huérfanos** en la ODP y cada reintento los duplica. Hoy no ocurrió porque falló la primera. Sin decidir: documentar en `TECH_DEBT.md`, invertir el orden (un pedido vacío sí es recuperable con `DELETE /api/pedidos-pv/:id`) o hacer un endpoint transaccional.
5. **Scripts de esta sesión sin commitear** en `backend-api/src/scripts/`: `consultar_odp24000_*`, `consultar_usuarios_pv_*`, `crear_pedido_pv_odp24000_*`, `diagnostico_crear_pedido_pv_*`, `verificar_coerce_zod_*`. Los tres últimos fueron diagnóstico desechable.

---

## 2026-09-07 — Nuevo módulo Cotizador: Etapa 1 de 4 (BD + migración de datos)

### Contexto

Se planificó (modo plan, aprobado por el usuario) traer al ERP como módulo nuevo el proyecto standalone **"PLANTILLA COTIZACIONES"** (`C:\Users\User\Desktop\ALCANET\PROYECTOS\Vidrios Templex\OTROS\Escritorio\PLANTILLA COTIZACIONES`, repo git independiente sin remote) — un cotizador de vidrio/aluminio que reemplaza la plantilla Excel `ORIGINAL PARA COPIAR.xlsb`: 6 módulos de producto, 430 productos de catálogo, despiece por diseño, plano a escala, PDF de cotización, hoja de trabajo, calibración y precios editables (~14.500 LOC construidas en 2 días, React+Vite+JSX puro sin BD real — persistencia en JSON con `writeFileSync`).

**Por qué migrar:** el backend del ERP corre en Docker sin volúmenes; la persistencia en JSON del standalone perdería cada cotización y precio editado en cada despliegue, y ni siquiera arrancaría (los JSON de origen no viajan a la imagen).

**Plan completo guardado en:** `C:\Users\User\.claude\plans\c-users-user-desktop-alcanet-proyectos-v-partitioned-puddle.md` (esquema de 21 tablas, estrategia de caché, mapa de archivos, 4 etapas, riesgos). Consultarlo antes de continuar la Etapa 2.

### Decisiones cerradas (con el usuario, en modo plan)

1. Port **completo y funcional**, pero **aislado**: no genera ODP, no lee clientes del ERP, no toca catálogo de Proveedores.
2. **Todo a Postgres** (incluidos los 138 diseños), con **caché en memoria** al arrancar — no es optimización de egress, es el adaptador que permite portar motores **síncronos** sin reescribirlos contra Sequelize (asíncrono).
3. UI **reescrita** en Tailwind/FolderTabs/lucide del ERP — no se porta el CSS artesanal (1.105 líneas).
4. **TypeScript estricto** en todo, sin `any` salvo el tipado propio de `pdfmake` (etapa 2).
5. Prefijo `cotizador` en todo (ruta, API, feature, tablas) — **choque de nombres confirmado** con `/api/cotizaciones`, `features/cotizaciones/`, tablas `cotizacion`/`cotizacion_items` y `cotizacionesSlice`, que ya existen y son el `COTModal` de la ODP.
6. `pdfmake@0.3.11` exacto (pendiente instalar, etapa 2) — única dependencia nueva.
7. Se migran catálogo/provisionales/diseños/parámetros/empresa; **no** las cotizaciones de prueba (numeración arranca en 1).
8. **Sin identidad de usuario**: `asesor`/`registrado_por` siguen como texto libre, sin FK a `usuarios`.
9. Auditoría **solo** en 5 tablas: `cotizador_producto`, `cotizador_precio_override`, `cotizador_cotizacion`, `cotizador_cotizacion_item`, `cotizador_parametro`.
10. Visible solo para `root`/`admin` (`RoleRoute` + Sidebar, sección `comercial`).
11. **El nombre del software externo de origen de los precios provisionales no puede aparecer en ningún dato ni código** — verificado y limpiado (ver más abajo).
12. Ejecución en **4 etapas verificables**: (1) BD+datos ✅, (2) backend/motores/endpoints, (3) frontend cotizar/guardar, (4) PDF/calibración/precios.

### Cambios realizados — Etapa 1

**Modelos nuevos (21):** `backend-api/src/models/cotizador_*.model.ts` — precios (`producto`, `precio_override`, `precio_historial`, `parametro`), cotizaciones (`cotizacion`, `cotizacion_item`, `consecutivo`), diseños (`diseno` + `_perfil`/`_vidrio`/`_accesorio` hijas, `mapeo_accesorio`, `accesorio_sistema_activo` vacía a propósito, `geometria_override` vacía), calibración (`calibracion_margen`, `_holgura`, `_contraste`, `_sistema`, `_historial`), empresa (`empresa`, `empresa_logo` separado del texto). Todo `DataTypes.DOUBLE` en numérico (nunca `DECIMAL`: `pg` devuelve `NUMERIC` como string).

**`models/index.ts`:** imports + "Bloque L: Módulo Cotizador" de asociaciones (deliberadamente sin FK a `Usuario`/`Cliente`/`ODP`) + 5 entradas en `MODELOS_AUDITADOS` + exports.

**`controllers/root.controller.ts`:** 5 tablas nuevas en `TABLAS_AUDITABLES`, con **nombres exactos en singular** — el módulo nace sin el bug ya conocido de revertir auditoría de `Cotizacion`/`SAP`/`RutaODP` (nombres en plural que no calzan con la tabla real).

**3 scripts en `backend-api/src/scripts/`:**
- `2026-09-07_crear_tablas_cotizador.ts` — `sync({alter:false})` + 2 índices únicos parciales (`ux_cotizador_margen_vigente`, `ux_cotizador_holgura_vigente`) + 4 `CHECK` (gramática de la cascada de márgenes + 3 filas-únicas), todo idempotente con `IF NOT EXISTS`/guardas de excepción.
- `2026-09-07_sembrar_datos_cotizador.ts` — lee los JSON copiados a `src/scripts/datos_cotizador/` (catálogo, provisional, diseños, parámetros, empresa, mapeo). Upsert en `cotizador_producto` (el catálogo sí se regenera), reemplazo completo en diseños (catálogo técnico derivado), `DO NOTHING` en mapeo/parámetros/empresa/consecutivo para no pisar ediciones futuras del usuario.
- `2026-09-07_verificar_datos_cotizador.ts` — asserta conteos exactos, ausencia del nombre del software de origen en los datos, y **round-trip de fidelidad** campo a campo contra los 3 archivos de origen.

**Limpieza del nombre del software externo:** 126 ocurrencias en `catalogo-provisional.json` (campo `fuente`) neutralizadas a `"referencia externa · <acabado>"` / `"...mediana de acabados"` al copiar los datos, antes de que tocaran el repo del ERP. El propio script de verificación arma el patrón de búsqueda por partes (`['alum','software'].join('')`) para no dejar el string ni en su propio código.

### Ejecutado contra Supabase (producción)

Solo aditivo — 21 tablas nuevas con prefijo `cotizador_`, ninguna tabla existente tocada. Verificado:
- `cotizador_producto` = 556 (430 catálogo + 126 provisional) · `cotizador_diseno` = 138 (120 cotizables) · `_perfil` = 983 · `_vidrio` = 218 · `_accesorio` = 1.049 · `_mapeo_accesorio` = 54
- `cotizador_empresa` + logo (23.342 chars) · `cotizador_parametro` (aiu=0.96, iva=0.19, flete=25000) · `cotizador_consecutivo` en 0
- Round-trip: **430/430, 126/126, 138/138** idénticos campo a campo contra los archivos de origen
- `grep -ri` sobre `backend-api/src` y consulta SQL sobre los datos: 0 coincidencias del nombre del software externo

`npm run build` del backend compila limpio, sin tocar ningún módulo existente.

### Bug encontrado y corregido en el propio proceso

El primer intento de verificación reportó **129 fallos falsos** (todos los perfiles de todos los diseños). Causa: comparé JSONB con `JSON.stringify(a) !== JSON.stringify(b)` — **Postgres no preserva el orden de las claves de un objeto JSON al guardarlo en JSONB**, así que el mismo contenido puede serializarse en distinto orden. Corregido con un `jsonIgual()` deep-equal insensible al orden de claves; los datos siempre estuvieron correctos, era la comparación la que fallaba. Anotado por si se repite el patrón en la Etapa 2 (comparación de `codigosPorColor`, `refs_sin_precio`, etc. contra los motores portados).

### Pendiente — próxima sesión

1. **Etapa 2** (la más grande, ~4.700 LOC ESM→TS sin cambios de lógica): motores de cálculo (`motorCalculo`, `motorDespiece`, `cotizarPorDiseno`, `aptitudOrden`, `calibracion`, `planoProducto`, `codigoDiseno`, `ordenCorte`, `accesoriosPorDiseno`), los 6 módulos de producto, `cache.ts` (precarga síncrona), `proveedorSequelize.ts` (mismo contrato de 5 métodos que `lib/catalogo.ts` ya esperaba), endpoints en `routes/cotizador.routes.ts`, instalar `pdfmake@0.3.11` exacto. Verificar con golden-master contra el standalone antes de dar por buena la conversión.
2. Etapa 3: frontend (cotizar/guardar). Etapa 4: PDF/calibración/precios/accesorios/empresa.
3. Working tree con cambios sin commitear (ver recordatorio de cierre de sesión) — agrupar en un solo commit cuando el usuario lo pida, probablemente al cerrar una etapa completa.

---

## 2026-09-09 — Checks automáticos de Vidrio y Herrajes: motor único, tiempo real y bitácora

### Requerimiento
Que el check de **Herrajes** se rija por la SAP (todas las líneas en existencia o en una ODC ya recibida) y el de **Vidrio** por Pedidos PV y ODC de vidrio, con actualización en vivo sin refrescar la página.

### Hallazgos de la auditoría previa
Los dos automatismos **ya existían y estaban rotos**:

1. **`verificarPedido` marcaba `chk_vidrio` pero no emitía `emitirODPPatch`** — solo `emitirCambio('pedidos_pv')`. El tablero de Producción únicamente escucha `odp_patch`: el check quedaba correcto en BD y la celda no cambiaba hasta un F5.
2. **`updateODP` tenía un `return` que se saltaba la emisión.** Si la ODP estaba en estado productivo y tenía un Pedido PV en `PENDIENTE/ENVIADO/CONFIRMADO_PROVEEDOR`, hacía `commit` y respondía **antes** del `emitirODPPatch` final. Afectaba a **los nueve checks**, no solo a estos dos, y también se saltaba el retroceso, la propagación de proveedor a PV, la regla VERIFICADO→ENTREGADO y la reactivación de la ODP padre. `toggleCheck` no hacía update optimista, así que no se repintaba ni para quien marcaba.
3. **`recibirItems` resolvía una sola ODP** tomando el primer `SAPItem` de la orden. Como una ODC de perfilería agrupa material de varias ODP: falso negativo en todas las demás, y falso positivo en esa (se marcaba con líneas pendientes en otra orden).
4. **Las otras tres vías a `en_existencia` no tocaban el check**: recepción desde la cabecera (`updateODC`), la "S" manual (`toggleExistencia`) y la cobertura por inventario (`asignarExistencia` / `dividirPorExistencia`).
5. **Ambos automatismos escribían con `Model.update({ where })`**, que no dispara hooks de instancia: sin auditoría, sin `fecha_chk_accesorios`, sin avance de estado y sin evaluación de `LISTO_INSTALAR`.

### Decisiones de negocio (confirmadas con el usuario)
- **Herrajes**: marcado ⇔ la ODP tiene ≥1 SAP, **ninguna** SAP vacía y **todas** las líneas de **todas** sus SAP en `en_existencia`. Una SAP en borrador sin ítems **bloquea**.
- **Vidrio**: dirigido por evento, no calculable. **Marca** cuando una vía se cierra (todos los PV verificados, o ODC de vidrio recibida) y **desmarca** cuando cualquier vía se reabre (PROBLEMA, reposición, ODC revertida). Optimista al marcar, pesimista al desmarcar.
- **El automático manda sobre la marca manual**: si el material se revierte, el check cae aunque lo hubiera puesto una persona, con notificación. Las celdas siguen siendo clicables a mano.
- **El retroceso solo ocurre desde `LISTO_INSTALAR`.** Una ODP ya `PROGRAMADA` o más allá pierde el check pero conserva el estado: sacarla de una ruta armada por un movimiento de bodega es peor que el problema que resuelve.
- Verificar un pedido **nunca desmarca**: si aún faltan PV por verificar, no toca nada.

### Backend
**Nuevo — `utils/checksAutomaticos.ts` (motor único).** Vive en `utils/` por el ciclo `server → app → routes → controller` que documenta CLAUDE.md; `../server` y `./notificaciones` entran por import dinámico. Expone `recalcularChecksODP()` como entrada única, más `herrajesCubiertos`, `odpIdsDeSapItems`, `odpIdsDeOdpItems`, `recalcularHerrajesDeSapItems` y `recalcularVidrioDeOdpItems`.

Secuencia: calcula → **si nada cambia se detiene** (sin escritura, sin auditoría, sin socket: se llama desde 19 puntos y no puede hacer ruido) → escribe con `odp.update()` de instancia → `fecha_chk_accesorios` → avance de estado → `LISTO_INSTALAR` o retroceso → historial → notificación → `emitirODPPatch`. Con transacción, la emisión se aplaza con `transaction.afterCommit` para no publicar una fila que aún no existe.

**Extracción desde `updateODP`:** `evaluarListoInstalar()` y `evaluarRetroceso()` salieron al motor **sin cambiar ninguna regla**, y `updateODP` pasa a llamarlas. El marcado manual y el automático comparten ahora el mismo criterio por construcción. El `return` del hallazgo 2 pasó a ser un `return false` dentro de la función: la regla de negocio se conserva y el flujo llega hasta la emisión.

**Avance `chk_vidrio → VIDRIO_RECIBIDO`** heredado de `verificarAvanceODP`, con su guarda original (`ESTADOS_POSTERIORES_A_VIDRIO`) y no `ESTADOS_PRODUCTIVOS`: desde `ACCESORIOS_SEPARADOS`, escribir `VIDRIO_RECIBIDO` sería mandar la orden hacia atrás.

**Puntos de llamada (19):**
- `odc.controller` — `createODC`, `updateODC`, `recibirItems`, `toggleExistencia`, `dividirPorExistencia`, `asignarExistencia`, `revertirExistencia`, `eliminarODC`, `editarItemsODC`, `createODCVidrios`.
- `sap.controller` — `createSAP`, `updateSAP`, `deleteSAP`.
- `pedido_pv.controller` — `verificarPedido`, `marcarProblema`, `registrarReposicion`, `eliminarPedidoPV`. `verificarAvanceODP` eliminada.
- `sincronizarItemODC` **no** se tocó: solo limpia `modificado`, no mueve `estado_compra`.

**Nuevo endpoint:** `GET /api/odp/movimientos-automaticos?limit=10`, declarado **antes** de `/:id`.

### Base de datos
`historial_estados_odp.automatico BOOLEAN NOT NULL DEFAULT false` + índice parcial `idx_historial_automatico_fecha`. Script `2026-09-09_agregar_automatico_historial.ts`, **ya ejecutado** (1762 registros históricos quedan en `false`: no se puede saber a posteriori cuáles fueron automáticos). Se descartó distinguirlos por `observacion LIKE 'Automático:%'` — funciona hasta que alguien reescriba un mensaje.

### Frontend
- `ProduccionPage.toggleCheck` — **update optimista** con reversión en error (mismo patrón que `handleSetColor`).
- Tooltip en las celdas Vidrio y Herrajes explicando que se mueven solas y que pueden **caer** solas.
- **Nueva pestaña "Automáticos"** en el tablero → `components/MovimientosAutomaticosTab.tsx`. Últimos 10 movimientos, refresco por socket con debounce de 600 ms, retrocesos resaltados en ámbar, clic abre la ficha.

### Verificación
- `tsc --noEmit` backend y frontend: limpio. `npm run build` backend: OK.
- Build CRA: OK (`main.c13d4d8f.js`, 974.89 kB gzip, +1.38 kB). Único warning: `HardHat` sin usar en `Sidebar.tsx`, **preexistente**. Los archivos tocados: 0 warnings.
- ⚠️ `npm run lint` del backend **no corre**: ESLint 10.0.3 instalado exige `eslint.config.js` y el repo tiene `.eslintrc`. Preexistente, no introducido aquí.
- **Sin pruebas manuales todavía** (no hay tests automatizados).

### Informe de reconciliación — pendiente de decisión del usuario
`2026-09-09_reconciliar_checks_automaticos.ts` corrido en **modo informe** (transacción revertida). 56 ODP vivas, **8 descuadres**:

| ODP | Cambio | Estado → después |
|---|---|---|
| G-0016 | marcar Herrajes | LISTO_INSTALAR (igual) |
| OA-3842 | marcar Herrajes | MEDICION → ACCESORIOS_SEPARADOS |
| ODP-24291 | marcar Herrajes | MEDICION → ACCESORIOS_SEPARADOS |
| ODP-24301 | desmarcar Herrajes | MEDICION (igual) |
| ODP-24309 | desmarcar Herrajes | MEDICION (igual) |
| ODP-24311 | desmarcar Herrajes | MEDICION (igual) |
| **ODP-24286** | desmarcar Herrajes | **LISTO_INSTALAR → VIDRIO_RECIBIDO** |
| **ODP-24316** | desmarcar Herrajes | **LISTO_INSTALAR → VIDRIO_RECIBIDO** |

Ninguna saltaría a LISTO_INSTALAR. **Dos saldrían de Instalaciones** (24286 y 24316).

**Decisión del usuario: NO se aplica la reconciliación.** Las 8 quedan como están; él las verifica y las gestiona a mano. El script se conserva commiteado y en modo informe por defecto.

⚠️ **Consecuencia a tener presente:** "dejarlas como están" no las congela. El motor ya está activo, así que **la primera acción de Compras o de Pedidos PV que toque una de esas ODP recalculará su check**. Concretamente, ODP-24286 y ODP-24316 saldrán de LISTO_INSTALAR en cuanto alguien mueva una línea de su SAP —recibir una ODC, marcar o quitar una "S", editar la SAP—, no antes. No hay proceso de fondo que las revise por su cuenta.

### Pendiente
1. Pruebas manuales dirigidas: recibir ODC completa y parcial, marcar/quitar la "S", cobertura parcial, revertir existencia, eliminar/editar ODC, verificar PV, marcar problema y reposición, y marcar un check en una ODP con PV pendiente (el hallazgo 2).
2. Revisión manual del usuario sobre las 8 ODP descuadradas (ver arriba).

---

## 2026-09-09 (tarde) — Producción: pestaña "Por Imprimir" e impresión de OP por lote

### Problema
El taller imprime a diario todas las órdenes de producción nuevas (5-7). Para saber cuáles ya
habían salido a papel, se pintaba la fila de amarillo a mano con el selector de `color_taller`.
Dos costos: se gastaba el único canal de color libre del tablero (6 colores, sin significado
propio) y no quedaba rastro de quién imprimió ni cuándo. Además imprimir era ~5 clics y un modal
por ODP: abrir la ficha → tab Imprimir ODP → formato OP → IMPRIMIR → cerrar.

### Decisiones de diseño
- **Campo propio, amarillo derivado.** `fecha_impresion_op` + `impresa_por_id` en `odp`. El
  amarillo del tablero se calcula desde el campo, no se guarda. Se ve idéntico a antes, pero
  `color_taller` queda libre otra vez y hay tooltip con autor y fecha.
- **Precedencia:** si hay `color_taller` manual, manda el manual. Pintar de rojo una ODP ya
  impresa debe seguir siendo posible.
- **Alcance de la pestaña:** solo la línea de producción (los 6 estados de `activeStates`) más
  NC/Garantías activas. Se excluyen `PAUSADA` y `LISTO_INSTALAR`: no bajan al taller.
- **Marcado al imprimir, no botón aparte.** Marcar a mano sería el mismo doble trabajo movido de
  sitio. Es optimista por necesidad: el navegador no confirma que el papel salió (`afterprint`
  dispara también al cancelar), así que lo único fiable es si la ventana llegó a abrirse.
  `abrirVentanaImpresion` devuelve `false` con el popup bloqueado → no se marca nada.
- **Impresión por lote:** N órdenes en un solo documento y un solo diálogo, reusando
  `GET /api/odp/:id` (el mismo que alimenta la ficha) para que el papel salga idéntico.
- Descartado: estado "Reimprimir" cuando la ODP cambia después de impresa — el usuario lo
  descartó explícitamente.

### Cambios

**BD** — `2026-09-09_impresion_op.ts` (con `--aplicar`; por defecto dry-run):
- `odp.fecha_impresion_op TIMESTAMPTZ NULL`, `odp.impresa_por_id INTEGER NULL`.
- Backfill: 414 ODP amarillas → `fecha_impresion_op = fecha_creacion`, `color_taller = NULL`.
  Un solo formato de hex en toda la tabla (`#FEF9C3`, 414 filas; 104 sin color). Quedaron 10 ODP
  pendientes en la línea de producción.
- `impresa_por_id` queda NULL en el backfill: no existe el dato histórico e inventarlo ensuciaría
  la trazabilidad.

**Backend**
- `odp.model.ts` — dos campos nuevos.
- `models/index.ts` — `ODP.belongsTo(Usuario, { as: 'impresa_por' })`.
- `odp.controller.ts` — include `impresa_por` en `vista=produccion`; nuevo `marcarImpresasODP`.
- `utils/notificaciones.ts` — mismo include en `getODPListaIncludes` (sin esto, el primer
  `odp_patch` borra el autor de la fila; es el bug que ya ocurrió con `facturas_adicionales`).
- `odp.routes.ts` — `PATCH /api/odp/marcar-impresas`, declarada **antes** de `/:id`.
- Endpoint propio y no un campo de `PUT /:id`: 7 PUT serían 7 pasadas completas de `updateODP`
  (motor de checks, transiciones, propagación de proveedor, creación de PV) para escribir un
  timestamp. `individualHooks: true` obligatorio o la auditoría no dispara en el update masivo.
  Tras el commit, un `emitirODPPatch` por id: invalida la caché de 90 s y reparte el socket, que
  es lo que hace la marca **global** entre usuarios.

**Frontend**
- `ProduccionPage.tsx` — pestaña "Por Imprimir" (2ª, con badge), tabla con selección múltiple,
  "Imprimir seleccionadas", "Imprimir" y "Ya impresa" por fila; amarillo derivado en Control
  Taller; ícono de impresora con tooltip y clic para devolver a la cola; chip de filtro
  "Sin imprimir".
- El bucket **deduplica por id**: las NC viven en los dos arrays (`/api/odp` y `/api/odp/nc-garantias`)
  y sin el `Set` saldrían dos veces en la lista y dos veces en el papel.
- `printStyles.ts` (nuevo) — el bloque CSS de impresión estaba duplicado literal en
  `ODPTabImprimir`; con un segundo emisor dejaba de ser un detalle.

### Hallazgo durante la implementación
Los dos imprimibles evitan el salto de página en su última hoja para no sacar una hoja en blanco
al final (`PrintableProduccion` con `.produccion-page:last-child { page-break-after: avoid }`,
`PrintableOA` no poniendo la clase `page-break`). En un lote eso pega el arranque de la siguiente
orden a la cola de la anterior. Solución: el salto lo impone el **contenedor** de cada orden salvo
la última — un salto forzado tiene precedencia sobre un `avoid`, y la última se queda sin salto.

### Verificación
- `tsc` backend: limpio. `tsc --noEmit` frontend: limpio (183 archivos).
- Build CRA: OK (`main.d16709dc.js`, 976.83 kB gzip, +45 B). Único warning en los archivos
  tocados: el `panelOdp` de `ProduccionPage`, **preexistente**.
- ⚠️ `npm --prefix frontend-web run build` **falla desde cmd**: el script empieza con `CI=false`,
  sintaxis POSIX que cmd.exe no acepta. Hay que pasar `--script-shell=bash`. Preexistente.
- **End-to-end contra el backend real** (servidor local + JWT firmado, 15 asserts, todos OK):
  ruta montada y protegida (401 sin token, no la captura `/:id`), campos nuevos en el listado,
  Zod `.strict()` rechaza body vacío y campo desconocido, marcado y desmarcado con persistencia
  verificada, `impresa_por` resuelto por el include, deduplicación de ids repetidos, 404 con ids
  inexistentes, y **estado del tablero restaurado** al terminar (la verificación no dejó rastro).
- Auditoría comprobada en `auditoria_log`: dos filas UPDATE con `datos_anteriores`/`datos_nuevos`
  correctos y `usuario_id` del actor → `individualHooks` funciona.

### Pendiente
1. Prueba manual del papel: imprimir un lote mixto (ODP + OA + NC) y confirmar que cada orden
   arranca en hoja nueva y que no sale hoja en blanco al final.
2. Confirmar que el popup no lo bloquee el navegador del taller en el primer intento (si pasa, el
   reintento abre al instante: el detalle queda en caché y no se marca nada en el intento fallido).

---

## 2026-09-10 — Pestaña "Consultar" del módulo ODP (explorador con 11 filtros)

### Origen
Pedido del usuario: una pestaña en `/odp` para filtrar por estado de taller, facturadas, estado
de pago, no conformidades y garantías — "ver las que están por facturar y en qué proceso están".

### Hallazgo que cambió el planteamiento
El motor ya existía. `BuscadorAvanzadoPanel.tsx` + `crm.controller.ts` tenían **13 filtros
funcionando** sobre ODP (fechas con selector de campo, asesor, producción, facturación, caja,
tipo, NC, garantías, forma de pago, cartera vencida, montos, texto) con export a Excel — pero
encerrados tras `router.use(requireRole('root'))` en `/supervision-crm`. Se decidió **extraer el
motor a un util compartido** en vez de construir de cero o duplicarlo.

Le faltaban al motor tres cosas para cubrir el pedido: multi-selección de estados (sin ella no se
puede pedir "INSTALADA + ENTREGADA", que es literalmente la consulta "por facturar"), "solo
garantías" (solo tenía incluir/excluir) y filtros por saldo.

### Decisiones del usuario
- Backend: extraer a util compartido.
- Filtros: núcleo operativo + comercial/tiempo + dinero (11). Se descartó el paquete "taller fino"
  (checks pendientes, proveedor de vidrio, con daño).
- Estado de taller: 13 estados multi-selección + 5 grupos rápidos.
- **Acceso: solo rol `admin`.** Sin export a Excel.
- Período **obligatorio**: la pestaña no consulta hasta elegir uno.
- Cartera vencida: atajo que pre-llena filtros a la vista, no filtro oculto.
- Resultados: columnas + barra de totales.

Dos avisos quedaron sin respuesta explícita y se resolvieron por supuesto declarado: **`root`
queda fuera** (coherente con "solo admin", y `root` tampoco está en los `allowedRoles` de `/odp`
en `AppRoutes.tsx`), y se **añadió el atajo "Todo el histórico"** como mitigación del rango
obligatorio — sin él, una ODP entregada en marzo y nunca facturada queda invisible, que es justo
el caso de uso que originó la pestaña.

### Cambios realizados

**Backend**
- `utils/rangoFechas.ts` (nuevo) — `construirFiltroFecha` movido desde `crm.controller`. Lo
  comparten el CRM y el explorador; dos copias significarían contar "agosto" con límites
  distintos según el módulo.
- `utils/odpFiltros.ts` (nuevo, ~290 líneas) — motor único: `construirWhereODP`,
  `includeBuscadorODP`, `mapearFilaBuscadorODP`, `calcularTotalesODP`, `CAMPOS_FECHA_ODP`
  (+`fecha_listo_instalar`), `CAMPOS_ORDEN_ODP`. Params nuevos, todos opcionales y sin efecto si
  no se envían: `estados_produccion[]`, `tipo_registro`, `solo_con_saldo`, `excluir_estado_caja`,
  `facturada_antes_de`, `orden_campo`/`orden_dir`.
- `crm.controller.ts` — borradas ~120 líneas del motor local; ahora importa del util. Los dos
  endpoints de supervisión quedan idénticos por fuera.
- `odp.controller.ts` — `getExploradorODP`. Totales del conjunto **completo** (no de la página) en
  consulta agregada paralela; por eso usa `findAll` + `calcularTotalesODP` y no `findAndCountAll`
  (ese COUNT sería trabajo duplicado).
- `odp.routes.ts` — `GET /api/odp/explorador` con `requireRole('admin')`, declarada **antes de
  `/:id`** y **sin `cacheListados`**.

**Frontend**
- `features/odp/exploradorService.ts` (nuevo) — cliente tipado con serializador de arrays sin
  corchetes (`estados_produccion=X&estados_produccion=Y`); con el `qs` por defecto de Axios el
  backend recibiría `estados_produccion[]` y filtraría por nada en silencio.
- `features/odp/components/ExploradorODPPanel.tsx` (nuevo, ~490 líneas).
- `ODPListPage.tsx` — 8ª pestaña `Consultar` condicionada a `userRole === 'admin'` y render del
  panel. No se tocó la lógica de las 7 pestañas existentes.

**BD:** cero migraciones. Todos los campos ya existían.

### Deuda resuelta de paso
`if (acarreo !== undefined) where.acarreo = acarreo === 'true'` filtraba por `false` ante un
`acarreo=''` (lo que manda un `<select>` sin elegir). No explotaba porque el único cliente mandaba
`undefined`, pero era una trampa para el siguiente consumidor. Sustituido por `leerBooleano()`,
que solo reconoce `'true'`/`'false'` explícitos.

### Detalles no obvios
- **Fechas locales, no UTC.** El panel usa un formateador propio en vez de
  `toISOString().slice(0,10)`: en Bogotá (UTC-5) esa conversión retrocede un día. Misma clase de
  bug que TECH_DEBT 2026-07-12.
- **`calcularTotalesODP` incluye `Cliente` con `attributes: []`** aunque no lea ninguna columna
  suya: el filtro de búsqueda referencia `$cliente.nombre_razon_social$` y sin el include ese
  `where` no resuelve. Y **no** incluye las asociaciones `separate: true`, porque
  `whereTieneFacturaEnRango` emite SQL literal contra el alias `"ODP"`.
- **El panel no se suscribe al socket** a propósito: es consulta puntual, y `useODPSocketPatch`
  pelearía con un estado que no es el `listado` de la página.
- El umbral de días de cartera se pide **una vez por montaje** a `GET /api/configuracion` (que ya
  admite `admin`), no en cada página de resultados.
- `PEDIDO_PROVEEDOR` **no** se ofrece como filtro pese a existir en el ENUM de Postgres: está
  retirado del código desde el 2026-08-01.

### Verificación
- `tsc` backend: limpio. `tsc --noEmit` frontend: limpio; confirmado con `--listFiles` que ambos
  archivos nuevos entran al programa.
- ESLint sobre los 3 archivos frontend tocados: limpio.
- Build CRA (`--script-shell=bash`): OK, 981.13 kB gzip (+4.3 kB). Los únicos warnings son
  preexistentes (`Sidebar.tsx`, `index.tsx`).
- **No-regresión del motor extraído** (2 scripts contra el artefacto compilado en `dist/`, sin
  tocar la BD): 18 combinaciones de filtros comparadas contra la semántica anterior — default,
  rango por `fecha_factura` (literal SQL idéntico), rango por `fecha_creacion`, estado singular,
  `incluir_garantias`, NC, acarreo/instalación, montos, search, tipo_odp. Todas correctas.
- **`cartera_vencida=true` verificado con `ConfiguracionGlobal.findOne` stubeado**: el `where`
  generado es **idéntico** al de la implementación anterior, y el atajo del explorador armado con
  filtros atómicos produce el mismo conjunto.
- Casos de regresión del fix: `acarreo=''` y `estados_produccion=[]` ya no filtran.

### Pendiente
1. **Prueba manual del usuario** — no hay tests automatizados. Confirmar sobre todo:
   "Terminadas + Facturación pendiente + Todo el histórico" (la consulta que originó la pestaña),
   y abrir `/supervision-crm` con filtros conocidos para verificar que los conteos no cambiaron.
2. Decidir si `root` debe ver la pestaña (hoy no: recibiría 403, y tampoco entra a `/odp`).
3. TECH_DEBT 2026-09-10: migrar `BuscadorAvanzadoPanel` al pre-llenado y retirar el parámetro
   `cartera_vencida` del util.

---

## 2026-09-10 (2) — ODC-9355: recepción revertida en silencio y des-recepción simétrica

### El incidente
La ODC-9355 (`ordenes_compra.id=398`, VEA, perfilería) figuraba como `pendiente` pero con
`fecha_recepcion` puesta, sus 4 ODCItem en `recibido=true` y sus 4 SAPItem en `en_existencia`.
La cabecera mentía. `auditoria_log` reconstruyó la secuencia exacta:

- **14:58:13** — `recibirItems` la recibió bien: SAPItems a `en_existencia`, motor de checks
  recalculado sobre las 3 ODP afectadas (499 / ODP-24264, 552 / ODP-24307, 554 / ODP-24309).
- **15:18:24** — un `PUT /api/compras/odc/398` la devolvió a `pendiente`. Acción deliberada del
  usuario (quiso des-recibirla), pero **`updateODC` no tenía rama de des-recepción**: no revirtió
  el material ni los checks. Resultado: cabecera en `pendiente`, almacén en existencia.

`sap_items` no aparece en la auditoría de ese día porque el paso a `en_existencia` es un
`Model.update({where})` sin `individualHooks` — los hooks de instancia no disparan en bulk
(TECH_DEBT 2026-07-02). Confirma por descarte que la vía fue `recibirItems`.

### Bug secundario: la UI no permitía arreglarlo
Con todos los ítems ya en `recibido=true`, elegir "Recibido" en el selector abría el modal de
recepción con **cero** ítems por marcar, y `handleConfirmarRecepcion` cortaba en
`if (itemsSeleccionados.size === 0) return`. Botón muerto: no había forma de reponer el estado
desde la interfaz.

### Cambios
1. **Script one-off** `2026-09-10_recibir_odc9355.ts` — repone `estado='recibido'` con
   precondiciones verificadas (aborta si el estado cambió, si hay ítems sin recibir o si algún
   SAPItem no está en `en_existencia`). **No toca `fecha_recepcion`**: conserva las 14:58 reales.
   Envuelto en `requestContext.run` para que la auditoría registre el actor y no `null`.
2. **`ComprasPage.tsx`** — `sinPendientesPorMarcar` destraba el modal cuando no queda nada que
   marcar; el backend ya aceptaba `items_recibidos: []` y recalcula `todosRecibidos` sobre la
   tabla. Botón "Marcar ODC como recibida" + aviso explicativo.
3. **`updateODC`** — reescrito con transacción y rama de des-recepción simétrica: ODCItems a
   `recibido=false` (`individualHooks: true`), SAPItems y ODPItems a `en_odc`,
   `fecha_recepcion=null` y motor de checks para que caiga lo que corresponda.
4. **Confirmación en UI** antes de revertir, nombrando el daño (N ítems y las ODP cuyo check
   de Herrajes puede caer). Antes revertía en silencio — la causa raíz del incidente.

### Decisiones técnicas
- **`en_odc`, no `pendiente`, al des-recibir.** La orden sigue viva y el material sigue asignado
  a ella; `pendiente` es la reversión correcta solo en `eliminarODC`, donde la ODC desaparece.
- **No se prohibió des-recibir.** El usuario confirmó que la usa a propósito; bloquearla con un
  409 le quitaba una herramienta. Se hizo funcionar de verdad.
- **Guarda contra `undefined`.** `odc.update({estado: undefined})` no toca el campo, pero una
  condición ingenua `estado !== 'recibido'` **sí** se dispararía con `undefined` y revertiría
  material en cualquier PUT que solo cambie proveedor/notas. La rama exige `typeof estado ===
  'string'` y valor no vacío.
- **Recibir por cabecera ahora marca los ODCItem como `recibido=true`.** Antes no lo hacía, y
  dejaba ODCs `recibido` con líneas en `recibido=false` — el estado inverso al de este incidente.
- **La notificación ya no resuelve una sola ODP.** El bloque anterior tomaba el primer SAPItem y
  avisaba solo a esa ODP; una ODC de perfilería agrupa material de varias (esta, 3). Ahora usa
  `odpIdsDeSapItems`, el mismo camino que `recibirItems`.
- **El script no emite sockets** a propósito: `emitirCambio`/`emitirODPPatch` importan `../server`
  y ejecutar ese módulo desde un script levantaría un segundo `http.Server` en el 3001.

### BD
Cero migraciones. Una sola columna escrita: `ordenes_compra.estado` de la fila 398.

### Verificación
- `tsc` backend: limpio. `tsc --noEmit` frontend: limpio.
- Estado final de la 398 releído contra Supabase: `recibido`, `fecha_recepcion` intacta (14:58),
  4 ítems recibidos, 4 SAPItems en existencia.
- **Ningún check se movió**, como se esperaba: ODP-24264 sigue en `chk_accesorios=false` (correcto:
  su línea 1817 de SAP-7964 está en otra ODC, `en_odc`); 24307 y 24309 siguen en `true`.
- Los dos únicos consumidores de `PUT /odc/:id` están en `ComprasPage`; el de la rama "ir a
  recibido" manda `estado: odc.estado` (sin cambio), así que no dispara ninguna rama nueva.

### Pendiente
1. **La des-recepción (cambio 3) no está probada en runtime.** Verificarla exige recibir y revertir
   una ODC real, lo que mueve material en producción. Falta prueba manual dirigida: recibir por
   cabecera → revertir → confirmar que los SAPItems vuelven a `en_odc` y el check de Herrajes cae →
   re-recibir y confirmar que sube.
2. `ODP-24309` tiene `chk_accesorios=true` con `fecha_chk_accesorios=null`: consistente con el
   motor (si el check ya estaba en `true`, retorna sin escribir y no sella la fecha), pero deja
   una fecha en blanco que el tablero podría querer mostrar.
---

## 2026-09-10 (3) — Cotizador Etapa 3: frontend completo + rediseño visual

### Contexto
Con la Etapa 1 (BD, 2026-09-07) y Etapa 2 (motores/caché/endpoints, commit `f6071f6`, sesión
anterior) ya cerradas, esta sesión implementó la Etapa 3 del plan de migración (frontend: cotizar
y guardar) y, a pedido del usuario tras revisar el resultado ("el diseño es pésimo"), un rediseño
visual completo del módulo antes de darla por cerrada.

### Etapa 3 — build funcional (4 agentes en paralelo + integración propia)
Contrato compartido escrito primero, a mano, para que los agentes no divergieran: `types.ts`
(espejo de los tipos del backend — `ResultadoCalculo`, `Plano`, `Cotizacion`, `Aptitud`...),
`services/cotizadorApi.ts`, `format.ts`. Encima, el shell `CotizadorPage.tsx` (3 pestañas
Cotizar/Actual/Guardadas vía `FolderTabs`, carrito y cabecera en estado local — **sin Redux**,
mismo criterio que el Explorador ODP de esta misma jornada) y `TabCotizar.tsx`, compuestos por mí
como punto de integración entre las piezas de los agentes.

4 agentes en paralelo, cada uno dueño de archivos que no se pisaban entre sí:
1. `CampoDinamico`/`SelectorDiseno`/`FormularioModulo` — formulario 100% data-driven desde
   `meta.campos` del backend (evita 6 formularios hardcodeados casi idénticos).
2. `usePlano`/`ResultadoCalculo`/`DiagramaProducto` — hook de previsualización del plano con
   debounce y cancelación de condición de carrera (contador de petición, sin `AbortController`
   porque `cotizadorApi.ts` no lo expone), tabla de BOM, SVG del plano dibujado a partir de
   `Plano` (exterior + paneles + paños de vidrio + cotas).
3. `TabActual` — carrito editable (cliente, comercial, ítems, totales, guardar).
4. `TabGuardadas`/`ModalDetalleCotizacion` — listado con filtros y orden client-side, vista
   Normal y vista Técnica (sin un solo dato de plata, mismo principio que `PrintableProduccion`
   de Producción), evaluación de aptitud para orden de corte.

Wiring en `AppRoutes.tsx` + `Sidebar.tsx` (ítem "Cotizador", sección comercial,
`allowedRoles: ['root','admin']`).

**Bug real encontrado en la propia verificación**: `ModalDetalleCotizacion` mostraba
`descuentoPct` (fracción 0-1) sin convertir — un descuento del 5% (`0.05`) se veía como
"0.05%". Corregido con el helper `fmtPct` que ya existía en `format.ts`.

### Feedback de campos y rediseño visual (a pedido del usuario)
1. **Bug de metadata en 2 módulos backend**: `ventanas.ts`/`proyectantes.ts` declaraban
   `segmentoCliente`/`sistema`/`colorPerfileria` como texto libre (`tipo:"string"`) en el `meta`
   que arma el formulario, pese a ser enumeraciones cerradas que `calcular()` valida contra una
   lista fija — corregido en los 6 módulos, cambiándolos a `tipo:"select"`. De paso, `codigoVidrio`
   pasó de campo de texto libre a select con las etiquetas legibles del catálogo ("Claro 4mm
   crudo" en vez de "CL4MM01CR"), limitado a la whitelist real que cada módulo acepta
   (`VIDRIOS_VALIDOS` — distinta por módulo, pedir cualquier otro código el backend lo ignoraba en
   silencio y caía al vidrio por defecto). Bug adicional encontrado de paso: en Proyectantes,
   "crudo" figuraba como color válido en la descripción del campo pero el catálogo no tiene código
   de jamba ni de nave para ese color — sacado de las opciones.
2. **Mockup en Claude Design**: 2 direcciones sobre un canvas ("Opción A", cercana al look actual
   del ERP; "Opción B", con tipografía propia, barra de contexto, riel de pasos, selector de
   módulo tipo "spotlight" y tarjetas agrupadas por tema) — el usuario eligió la Opción B tras
   verlas lado a lado, con dos rondas de ajuste (mm en vez de cm y medidas de vidrio visibles en el
   plano) y una revisión propia que encontró y corrigió inconsistencias entre las dos opciones
   antes de consolidar.
3. **Implementación de la Opción B en el código real**, otra vez con 4 agentes en paralelo +
   cambios propios:
   - Backend: campo nuevo `grupo` (`'cliente'|'medidas'|'vidrio'|'comercial'`) agregado a
     `meta.campos` de los 6 módulos — puramente visual, ningún motor de cálculo lo lee; si un
     campo llegara sin `grupo`, el frontend cae a un layout plano sin arriesgar dejarlo fuera del
     formulario. Etiquetas de medida cambiadas de "(cm)" a "(mm)".
   - **Unidades mm**: el vendedor ve y teclea milímetros, pero el campo sigue llamándose
     `anchoCm`/`altoCm`/etc. y viajando en centímetros hacia el backend — el motor de cálculo de
     la Etapa 2, verificado contra golden master, no se toca. La conversión ×10 (mostrar) / ÷10
     (guardar) vive **enteramente en `CampoDinamico.tsx`**, detectando
     `campo.nombre.endsWith('Cm')`; ningún otro archivo del árbol conoce la conversión.
   - Tipografía Space Grotesk (números/títulos) + Manrope (texto), cargadas en `public/index.html`
     y expuestas como `font-cotizador`/`font-cotizador-head` en `tailwind.config.js`, sin tocar la
     tipografía del resto del ERP.
   - `FormularioModulo` agrupa los campos por `grupo` en tarjetas con tinte propio (violeta para
     cliente, celeste para vidrio, blanco para medidas/comercial), con chips de especificación en
     vivo y de área calculada (`≈ X.XX m²`).
   - `TabCotizar` con riel de pasos (puramente orientativo, no bloquea nada) y selector de módulo
     "spotlight" (el activo en tarjeta grande con degradado, el resto como chips compactos).
   - `DiagramaProducto` con fondo de cuadrícula tipo plano técnico, badge de confianza (solo a
     partir de `plano.confianza`, sin inventar datos que el tipo no trae) y medidas de cada paño de
     vidrio visibles en mm dentro del propio dibujo.
   - `ResultadoCalculo` con zebra striping y un punto de color por categoría de línea (vidrio,
     aluminio, error).
   - `TabActual`/`TabGuardadas`/`ModalDetalleCotizacion` con la misma paleta y tipografía, tile de
     Total acentuado con degradado en `TabActual`.

### Verificación
- `tsc --noEmit` limpio en backend y frontend en cada punto de control (build base, arreglos de
  metadata, rediseño).
- Backend recargado en caliente (nodemon) sin errores tras cada tanda de cambios; caché del
  cotizador precargada correctamente.
- Frontend probado en vivo por el usuario contra la Supabase real (no hay entorno de prueba
  separado) en ambas rondas — confirmó que el nuevo diseño le gusta más.

### Pendiente — próxima sesión
1. **El usuario reportó "muchos detalles" a corregir** sobre el rediseño ya implementado, sin
   enumerarlos todavía — es lo primero que hay que recoger al retomar.
2. Etapa 4 del plan de migración (PDF, calibración, precios, accesorios, empresa) sigue sin
   empezar.
3. Working tree con los cambios de esta entrada, sin commitear al momento de escribirla — el
   commit de cierre de sesión debe recogerlos todos.

---

## 2026-09-11 — TM aprobada como "Realizada" sin visita al generar la ODP del prospecto

### Síntoma reportado
Un usuario reporta que al crear un prospecto y solicitar visita técnica, la TM queda en
`solicitada`, pero **al generar la ODP desde ahí la TM salta sola al panel "Realizadas"**. Se pidió
verificar si era real o mala percepción.

### Verificación — era real, y ya estaba documentado
Bug conocido desde el 2026-07-27 (`TECH_DEBT.md`), nunca corregido. Cadena confirmada por lectura
estática:
1. `createTM` deja la TM en `solicitada` (sin `fecha_visita`).
2. `aprobarProspecto` ejecutaba `TomaMedidas.update({ odp_id, estado: 'convertida' }, { where })`
   sobre **todas** las TMs del prospecto, sin mirar su estado previo.
3. `getTMPanel` agrupa `realizada` + `convertida` bajo "REALIZADAS", y `tmEstado.ts` rotula
   `convertida` con la misma etiqueta verde "✓ Realizada".

**El daño real no era el rótulo sino la pérdida de la cola operativa**: en `convertida` la tarjeta
pierde los botones Programar, Editar, Eliminar y Retornar (todos condicionados a
`solicitada`/`programada`), así que **la visita técnica ya no se podía agendar**. La ODP, en
cambio, nacía correcta en `VISITA_TECNICA` con `chk_medicion = false` — todo el sistema decía
"visita pendiente"; solo el estado de la TM mentía. Mismo cuadro que TM-0178/ODP-24201 en julio.

### Cambios realizados

**1. `prospecto.controller.ts` — causa raíz**
- El update masivo se partió en dos dentro de la misma transacción `t`: las TMs en `realizada`
  pasan a `convertida`; las de estado `solicitada`/`programada`/`archivada` **solo heredan
  `odp_id`** y conservan su estado.
- Ambos con `individualHooks: true` — los hooks de instancia no disparan en updates masivos, así
  que hasta hoy este cambio de estado **no quedaba en `auditoria_log`** (deuda 2026-07-02). El
  rastro se cortaba justo en el cambio que causaba el problema.
- Engranaje cerrado: `estadoInicialProspecto` ya usaba el mismo criterio, así que TM `solicitada`
  + ODP `VISITA_TECNICA` quedan coherentes, y al subir la foto `uploadFotoTM` avanza la ODP a
  `MEDICION` y marca `chk_medicion` sola.

**2. `toma_medidas.controller.ts` — válvula de escape**
- `retornarTM` acepta ahora `realizada`/`convertida` además de `programada`, pero **solo si no hay
  croquis ni fotos** (mismo criterio de guarda que `fix_tm_0178_2026-07-27.ts`); con archivos
  registrados devuelve 409 con mensaje contextual. Conserva `odp_id` y **no toca la ODP**.
- Deuda incremental del mismo archivo: `retornarTM` dejaba `hora_visita` colgada al retornar (solo
  limpiaba `fecha_visita`) — corregido. `retornarTM` y `programarTM` no emitían socket; se les
  agregó `emitirCambio('toma_medidas')` como ya hacían `createTM` y `vincularTMaODP`.

**3. Frontend**
- `tmEstado.ts`: helpers nuevos `tmSinRegistro()` y `tmRetornable()` — fuente única del criterio,
  espejo de la guarda del backend, para que front y back no diverjan.
- `TomaMedidasPage.tsx`: botón "Retornar" habilitado en el panel Realizadas para TMs sin registro;
  `medidas_json` agregado a la interfaz `TMItem` (el backend ya lo enviaba); texto del `confirm`
  diferenciado para el caso "figura como realizada pero no tiene fotos".
- Code smell corregido de paso: el panel Realizadas pasaba `onOpenTM` **sin el guard `isReadOnly`**
  que sí tenían Solicitadas y Programadas — `asistente_administrativo` y `marketing` podían abrir
  el modal de TM y toparse con un 403 del backend.

### Decisión técnica — datos históricos
Se ofreció script de corrección masiva; **el usuario eligió no correrlo**. Las TMs ya atrapadas en
`convertida` las destraba producción caso por caso con el botón nuevo, con criterio humano.
Asunción explícita heredada del script de julio: **retornar una TM no revierte `chk_medicion` de
su ODP** si ya estaba en `true`.

### Verificación
- `npm --prefix backend-api run build` limpio.
- `tsc --noEmit` limpio en frontend.
- Sin migración de BD: no hay cambios de ENUM, constraint ni columnas.
- Pendiente prueba manual dirigida del flujo prospecto → ODP (no hay entorno de prueba separado).

### Pendientes
- Probar en vivo: crear prospecto → solicitar TM → aprobar prospecto y confirmar que la TM sigue en
  "Solicitadas"; y retornar desde "Realizadas" una TM sin fotos.
- `TECH_DEBT.md` 2026-07-27 marcado como ✅ RESUELTO.

---

## 2026-09-11 — Cotizador: alineación con el Excel matriz

Se analizó `documentation/cotizador excel.xlsb` (20 hojas, 37.057 fórmulas), el Excel del que nació
el módulo, y se alineó el motor con él. El `.xlsb` se convirtió a `.xlsx` **sobre una copia** en el
scratchpad; el original en OneDrive no se tocó.

### Modelo de precios decodificado
`U (costo compra) → W = U×(1−%desc) → N = tipo="PERFILERIA" ? W/6 : W` (la barra de aluminio viene
de 6 m) y `precio_segmento = N × factor(tipo, segmento)`. Los factores **no son constantes**: salen
de los gastos fijos (PRODUCC 18,55 %, ADMON 20,39 %, VTAS 12,08 %, FNROS 3,99 %, UTILIDAD 11/10/9 %),
ponderados distinto por cada tipo de material. `PM = (PA+PB)/2`. AIU 0,96 e IVA 19 % ya coincidían.

### Catálogo — `catalogo.json` 430 → 432
415 códigos cambian precio y/o costo: el catálogo se había sembrado con factores viejos (−1,3 % a
−3,0 %) y costos sin refrescar. Mediana de perfilería **+13,0 %**. Altas: `KDG1106`, `KOP0102`.

**Regla de oro impuesta: nunca degradar a cero un precio que hoy funciona.** El Excel dejó 15
códigos sin costo derivable —incluido **`ES0001`, el único código de espejo**—; regenerar a ciegas
habría roto el módulo Espejo entero. En esos 15 se conserva la fila completa del catálogo anterior.

Filas contaminadas detectadas: 5 códigos duplicados en un bloque de cola con el `tipo` mal puesto
(a `HOR0408`, perfilería, le pusieron `VIDRIO` y sin el `/6` su precio salía **6,4× inflado**). Se
toma la primera aparición.

### SMO — de una tarifa a cuatro
El Excel nunca cobró un SMO único: SMO01 Cabinas 120.000, SMO02 Fachadas 85.000, SMO03 solo armada
ventanas 60.000, SMO04 Persiana 110.000. La app cobraba 58.000 para todo. Nuevo helper
`tarifaSMO()` en `motorCalculo.ts` (los 7 puntos de llamada tenían la misma línea repetida) y
`tipoObra` en `cotizarPorDiseno`. Flete `GTFA26` 25.000 → 40.000. Se agregan `alquiler_andamio` y
`huacal`, que no estaban modelados.

### Espejo biselado
El Excel distingue `ESP01` 146.000 de `ESP02` 168.000; la app cobraba lo mismo por ambos acabados.
Se aplica el **diferencial (15,07 %) sobre el precio ya segmentado**, no el precio plano del Excel:
meter los 168.000 tal cual haría que un PB pagara igual que un PA, rompiendo la segmentación que
rige todo el catálogo. Lo correcto de fondo es un SKU `ES0002` propio.

### Accesorios — 9 arbitrajes + guardarraíl nuevo
`MAPEADO` 9 → 18, `PENDIENTE` 36 → 26, `IGNORADO` 0 → 1. El Excel arbitró, entre otros: las guías
744/8025 se cobran `alasCorredizas × 2` (**4** en una XX, no 2 — el diseño extraído tenía razón y el
hardcodeado estaba mal), `Chapa de Impacto Alpha` → `CHJ0101` (el hardcodeado sí estaba bien),
`Cerrojo de Embutir` → `CPTOR` (`cuerpos/2`), elevadores `ancho ≥ 1,51 m ? 6 : 4`. `Manija 744-8025`
pasa a IGNORADO: el Excel tampoco la cobra.

**Campo nuevo `MapeoAccesorio.sistemas`.** El extractor dejó descripciones genéricas que significan
productos distintos según el sistema: `E.universa. Empaque Universal` es `EMP5020` en 5020,
`EMP1305/06` en 744 y `EMPA8025` en 8025. Mapearla sin restricción le cobraría el empaque equivocado
a los otros sistemas **en silencio**. Ahora un mapeo restringido **bloquea** fuera de sus sistemas.

Con eso, los **17 diseños** de `Sistema5020` + `Sistema5020Reforzado` quedan cotizables (0
bloqueados). Los demás siguen apagados: 12 accesorios no tienen candidato en los 432 productos y
`Sistema7038-Interior` necesita 5 SKU nuevos.

### Scripts de migración creados (NO ejecutados)
1. `2026-09-11_migrar_parametros_smo.ts` — `ALTER TABLE` +6 columnas, flete a 40.000.
2. `2026-09-11_regenerar_catalogo_cotizador.ts` — upsert de 432 productos, sólo `origen='CATALOGO'`,
   nunca toca `cotizador_precio_override`. Idempotente (2ª corrida: 0 escrituras).
3. `2026-09-11_migrar_mapeo_accesorios.ts` — `ALTER TABLE` +`sistemas` y empuja las 54 filas. Hacía
   falta porque la siembra usa `ignoreDuplicates: true` y no actualiza lo ya existente.

**Orden obligatorio: migraciones primero, reinicio del backend después.** La caché ahora hace
`SELECT` de las columnas nuevas; al revés, el módulo Cotizador arranca indisponible.

**No activan ningún sistema a propósito**: `cotizador_accesorio_sistema_activo` está vacía por regla
del proyecto y activar es un INSERT manual, deliberado y auditable. El script imprime el SQL.

### Hallazgo de negocio
**`MATI07` (Matizado Total) se vende casi al costo.** El costo subió 12.605 → 45.000 (×3,57) y el
precio quedó clavado a mano en 50.000 para PA, PM y PB por igual: margen 3,97× → **1,11×**. Es el
único producto bajo 1,25× del catálogo. No se tocó — es decisión de precio del usuario.

### Verificación
- `npm --prefix backend-api run build` limpio; `tsc --noEmit` limpio en frontend.
- Validación independiente contra `git show HEAD`: 0 precios vivos degradados a cero, `ES0001`
  intacto, 0 códigos perdidos, sin duplicados.
- 17/17 diseños de los sistemas activos resuelven sin bloqueo.
- Pruebas actualizadas: centinela de `humo.test` 430 → 432; `accesorios.test` reescrito (el ejemplo
  de PENDIENTE pasó a `Cerrojo Media Luna` porque `Cerrojo de Embutir` ya se mapeó) + test nuevo del
  guardarraíl por sistema.
- **Las 4 pruebas no se pudieron ejecutar**: conectan a Postgres y la caché ya lee las columnas
  nuevas, que no existen hasta correr la migración. `golden.test` se salta solo (sin
  `COTIZADOR_GOLDEN_DIR`).

### Pendientes
- Ejecutar las 3 migraciones contra Supabase, en orden, y luego `npm --prefix backend-api run test:cotizador`.
- Decidir el precio de `MATI07`.
- No existe pantalla de parámetros en el frontend: `PUT /api/cotizador/parametros` no tiene consumidor.
- `PELI31` sigue con dos productos bajo un mismo código (película normal y ultravisión).

---

## 2026-09-11 (3) — Permisos en bypass + auditoría y rediseño del módulo Proveedores

### 1. La sesión deja de pedir permiso

El usuario reportó fricción por los diálogos de permiso. El allowlist de `.claude/settings.json` ya
era casi total (`Bash`, `PowerShell(*)`, `Edit`, `Write`, `Skill` a secas), así que el problema no
era de reglas sino de **modo**: `~/.claude/settings.json` tenía `defaultMode: "auto"` pero
`skipAutoPermissionPrompt` no existía en ningún archivo — el diálogo de opt-in del modo auto nunca
se aceptó, así que la sesión caía a `default`.

Decisión del usuario, elegida sobre la alternativa que preservaba `git push`: **bypass total, sin
excepciones**, escrito en global y proyecto.

- `~/.claude/settings.json`: `defaultMode` → `bypassPermissions` + `skipDangerousModePermissionPrompt: true`
  (sin esto el modo pide confirmación al arrancar: se cambia un prompt por otro).
- `.claude/settings.json`: se elimina el bloque `ask` (las 2 reglas de `git push`) y se suman 9
  herramientas al `allow` (`ToolSearch`, `Cron*`, `RemoteTrigger`, `PushNotification`,
  `EnterWorktree`/`ExitWorktree`, `DesignSync`) como respaldo por si se vuelve a modo `default`.
- Se **conservan** los 4 `deny` (`rm -rf`, `git reset --hard`, `git clean`, `Remove-Item -Recurse`):
  bloquean, no preguntan, y son el único candado técnico contra un comando mal formado.
- El modo se fija al arrancar la sesión: editarlo no afecta a la sesión en curso.

⚠️ Ninguno de los dos archivos viaja por git (`.claude/` está en `.gitignore`, `~/.claude/` está
fuera del repo). **Hay que replicarlos a mano en la máquina de la oficina**, y sin el `defaultMode`
del global esa máquina seguirá preguntando.

### 2. Hallazgo: el sistema de tokens del módulo Proveedores no existe

Auditando el módulo para rediseñarlo apareció un bug real, no cosmético. Las siete variables CSS que
usa —`--surface`, `--border`, `--text`, `--text-muted`, `--primary`, `--bg`, `--surface-subtle`—
**no están definidas en ninguna parte del proyecto**: `index.css` solo carga Tailwind, no hay
`:root`, no hay `setProperty` y `tailwind.config.js` tampoco las declara. Los 12 archivos de
`features/proveedores/` son los únicos del ERP que las nombran.

- Donde el código escribió fallback (`var(--border, #cbd5e1)`) funciona por accidente.
- Donde no lo escribió, la declaración es **inválida al calcular el valor**: `background: var(--surface)`
  queda transparente y `border: 1px solid var(--border)` desaparece entero.

`ConsultarPreciosTab.tsx` usa la forma sin fallback casi en todo el archivo, igual que el shell de
`ProveedoresPage.tsx`. **La pestaña principal del módulo se renderiza hoy sin fondos ni bordes**, y
el botón «Consultar» sin color de fondo. No se corrigió en esta pasada — la definición propuesta
está en el artboard `Tokens.dc.html` y va en `index.css` bajo `:root`.

Otra deuda del mismo módulo, documentada pero no tocada: ~2.500 líneas de `style={{}}` inline con
`#6366f1` repetido decenas de veces, tres gramáticas de tabla distintas (grid / `<table>` / grid),
10 radios de borde, 16 tamaños de fuente, y 5 `window.confirm()` nativos para acciones destructivas.

### 3. Rediseño en `design/proveedores/`

Ocho artboards interactivos hechos con Claude Design, versionados en el repo. Dirección elegida por
el usuario: **mismo lenguaje visual del ERP** (carpetas manila de `FolderTabs`, índigo `#6366F1`,
escala slate, radios 12/16), ejecutado de forma coherente — no un salto visual que dejaría el módulo
desalineado con los otros 20.

Cuatro decisiones de fondo, más allá de repintar:

1. **Vincular sin modal** en Por Mapear: candidatos y modalidad caben en la propia fila.
2. **Ficha de proveedor** (`FichaProveedor.dc.html`): vista que hoy no existe. Productos con su
   posición frente al mejor precio, histórico, facturas con CUFE y pendientes, en un solo sitio.
3. **Cargar Facturas en tres pasos**: el scroll de ~900 líneas se parte en cargar → revisar →
   resolver. `POST /facturas/cargar` **ya devuelve el `ResumenLote` completo**, así que esto es
   reorganización pura: cero backend.
4. **El impacto se ve**: la bandeja ya ordenaba por `veces_visto`, pero el número iba en un badge
   igual que los demás. Ahora lleva barra proporcional.

Lo que **no** se tocó a propósito: ninguna regla de negocio. Fecha de factura sobre orden de carga,
idempotencia por CUFE completo, la modalidad decide qué precio se actualiza, notas crédito sin mover
precios, `siguePrecios() = activo && seguir_precios === true`, mapeo confirmado por humano.

**Marca `BACKEND NUEVO`** (rosa punteado en el canvas): lo que se dibujó y no existe todavía. Son
cinco cosas, detalladas en `design/proveedores/README.md`. La más importante: los candidatos con
porcentaje de confianza al vincular — hoy `VincularCodigoModal.tsx` hace `GET /api/catalogo?q=`, un
buscador de texto libre, no un rankeador.

### Verificación
- Canvas: 8 artboards con etiquetas `sc-if`/`sc-for` balanceadas, `x-dc` cerrado, `support.js` y
  clase `DCLogic` presentes en los 8, 0 bindings `innerHTML`, 27 handlers `onClick` resueltos desde
  `renderVals()`, `data-props` válidos. `seed-canvas.mjs --check` pasa.
- **No se pudo hacer clic en la versión publicada**: no hay navegador en el entorno. La verificación
  es estructural, no visual.
- Ningún archivo de `backend-api/` ni `frontend-web/` fue modificado. Impacto en BD: ninguno.

### Commits
- `26344fa` — `chore:` documentación del modo bypass en CLAUDE.md.

### Pendientes
- **Replicar los dos `settings.json` en la máquina de la oficina.**
- Definir los tokens en `index.css` bajo `:root` — arregla la pestaña Consultar Precios, que está
  rota ahora mismo. Alcance verificado: no afecta a ningún otro módulo.
- Decidir si se construye lo marcado `BACKEND NUEVO` (5 bloques) y con qué costo.
- El tema oscuro queda definido en `Tokens.dc.html` pero dormido: no hay interruptor en la app y los
  otros 20 módulos no lo soportan.

---

## 2026-09-11 (4) — Tokens de color aplicados + plantillas de configuración versionadas

Aplicación de dos de los tres pendientes que dejó la sesión anterior.

### 1. Los tokens existen (arregla ConsultarPreciosTab)

Antes de escribir nada se contaron los usos reales de cada variable en los 12 archivos del módulo, y
apareció el dato que decidía el diseño: **`--border` se usaba con tres fallbacks distintos** —
`#e2e8f0` (38×, tarjetas), `#cbd5e1` (17×, campos y botones) y `#f1f5f9` (14×, separadores de fila)—
y `--text-muted` con dos (`#64748b` 92× y `#94a3b8` 31×). Definir una sola variable por nombre habría
colapsado distinciones que hoy funcionan: los campos habrían perdido su contorno más oscuro.

Solución en dos movimientos:

**a) `frontend-web/src/index.css`** — bloque `:root` con 12 tokens de superficie/borde/texto en los
pesos que el módulo ya distinguía, más los semánticos (`--primary`, `--positive`, `--warning`,
`--danger` con sus `-soft`).

**b) 63 renombres quirúrgicos** en los 12 `.tsx`, cada uno **conservando su fallback**, así que son
provablemente neutros hoy y correctos una vez definidos los tokens:

| Antes | Después | Usos |
|---|---|---|
| `var(--border, #cbd5e1)` | `var(--border-strong, #cbd5e1)` | 17 |
| `var(--border, #f1f5f9)` | `var(--border-subtle, #f1f5f9)` | 14 |
| `var(--text-muted, #94a3b8)` | `var(--text-subtle, #94a3b8)` | 31 |
| `var(--text-muted, #cbd5e1)` | `var(--text-faint, #cbd5e1)` | 1 |
| `var(--surface-subtle, #f1f5f9)` | `var(--surface-sunken, #f1f5f9)` | 1 |

Tras esto, las 12 variables referenciadas están definidas y los cambios visibles se reducen a dos:
los ~155 usos **sin fallback** empiezan a funcionar (ConsultarPreciosTab recupera fondos, bordes y el
color del botón «Consultar»), y 23 usos de `var(--text, …)` con fallback slate-600/700/800 pasan a
slate-900 — la unificación buscada, coherente con el `text-slate-900` del resto del ERP.

⚠️ **El bloque oscuro cuelga de `[data-theme="dark"]`, no de `prefers-color-scheme`.**
`ProveedoresPage.tsx:14` usa `dark:bg-[var(--surface)]` y `tailwind.config.js` no declara `darkMode`,
así que Tailwind lo resuelve por preferencia del sistema: atarlo ahí habría dejado este módulo a
medio oscurecer para cualquiera con el SO en oscuro, mientras los otros 20 siguen claros. Nada
escribe ese atributo todavía — el bloque queda listo y dormido.

### 2. La configuración de Claude Code viaja por git

El pendiente «replicar los settings en la máquina de la oficina» no se puede ejecutar desde aquí. Lo
que sí se hizo es quitarle el filo: `tooling/claude-code/` versiona ambos archivos
(`user-settings.json`, `project-settings.json` con el hook `SessionStart`) y un README con el
procedimiento. Copiarlos sigue siendo manual y deliberado — nada se auto-aplica.

Del `user-settings.json` se podaron 9 reglas `allow` que eran residuo de sesiones viejas (dos
apuntaban a SHAs concretos, `9c72c1e..f6071f6`) y que además son redundantes bajo `bypassPermissions`.

### Verificación
- `react-scripts build` limpio. CSS +564 B (el bloque de tokens). Solo warnings de `no-unused-vars`
  preexistentes, ninguno introducido aquí.
- Recuento de variables posterior al `sed`: los cinco patrones dan exactamente 17/14/31/1/1.
- ⚠️ `npm --prefix frontend-web run build` **falla en Windows**, y es previo a este trabajo: el
  script es `CI=false react-scripts build`, sintaxis POSIX que npm pasa por `cmd.exe`. Funciona
  invocándolo desde Bash. No se tocó `package.json`.
- No se verificó en navegador: no hay uno en el entorno.

### Pendientes
- **Mirar el módulo Proveedores en el navegador.** Es la primera vez que sus paneles se pintan; el
  cambio es correcto por construcción pero nadie lo ha visto.
- Decidir los cinco bloques `BACKEND NUEVO` de `design/proveedores/` (ver su README).
- Extraer los componentes repetidos a `features/proveedores/components/ui/` usando ya los tokens:
  siguen ~2.500 líneas de `style={{}}` inline con hex duplicados.
- El tema oscuro sigue dormido: falta un selector de tema y el soporte de los otros 20 módulos.

---

## 2026-09-12 — Cotizador: las 21 tablas se mudan a su propio schema de Postgres

### Motivo
Pregunta del usuario: ¿hacen falta 21 tablas o se pueden reducir a 3? Tras analizarlo, la
respuesta fue que **el número de tablas no era el problema**: hay sobre-normalización real
(el árbol de diseño son 2.250 filas hijas para reconstruir 138 objetos, y hay 4 tablas con
una sola fila), pero lo que molestaba era **el desorden visual en el panel de Supabase**.
Para eso, cambiar la forma de los datos habría sido pagar riesgo de regresión por estética.
Se optó por un schema propio: `public.cotizador_producto` → `cotizador.producto`.

Consolidar a ~11 tablas sigue siendo defendible y quedó **descartado por ahora**, no
refutado; si algún día pesa el mantenimiento, los candidatos son el árbol de diseño
(4→1), las singleton (4→1) y las 7 vacías de calibración (7→2).

### Hallazgo crítico: el respaldo del panel ROOT se habría roto en silencio
`descargarBackup` listaba tablas con `WHERE schemaname = 'public'` y hacía
`SELECT * FROM "${tablename}"` sin calificar. Mover las tablas habría dejado las 21 fuera
del `.sql` **sin lanzar ningún error**: un respaldo que se presenta como completo al que le
faltan 3.010 filas, y que solo se descubre al intentar restaurar. Medido después del
cambio: la consulta vieja veía 0 tablas del cotizador, la nueva ve las 21.

Era una fragilidad preexistente — cualquier tabla creada fuera de `public` quedaba fuera
del respaldo. Se corrigió **antes** de mover nada, con `SCHEMAS_RESPALDADOS` como fuente de
verdad única (al crear un schema nuevo, agregarlo ahí) y el `.sql` ahora emite
`CREATE SCHEMA IF NOT EXISTS` y califica `"schema"."tabla"` en cada `SELECT`/`INSERT`.

### Segundo hallazgo: revertir auditoría del cotizador
`TABLAS_AUDITABLES` **sí** contenía las 5 tablas del cotizador (se había afirmado lo
contrario a partir de un grep truncado). Con el nombre nuevo, `auditoria_log.tabla` guarda
`cotizador.producto`, y las tres consultas de `revertirAuditoria` interpolan `"${tabla}"`:
`"cotizador.producto"` entrecomillado entero es **un identificador único**, no schema+tabla.
Se añadió `identificadorSql()`, que parte por el punto y cita cada segmento; un nombre sin
punto se comporta igual que antes. Verificado contra la BD, incluido el control negativo.

### Cambios
- **BD**: `CREATE SCHEMA cotizador` + 21 × (`SET SCHEMA` + `RENAME`), todo en una
  transacción con verificación previa al COMMIT. Los 8 ENUM `enum_cotizador_*` **se quedan
  en `public`** a propósito: el pooler en modo transacción no propaga `search_path` y
  `public` siempre resuelve. Índices, constraints y secuencias viajan solos con la tabla;
  las FK se resuelven por OID. Los nombres de índices (`cotizador_producto_pkey`) no se
  renombraron: superficie interna, renombrarlos solo añade riesgo.
- **Modelos** (21): `tableName` corto + `schema: 'cotizador'`. Archivos y clases intactos.
- **`cotizacionStore.ts`**: el único raw SQL del módulo (el UPDATE atómico del consecutivo).
- **`models/index.ts`**: los 5 strings de `MODELOS_AUDITADOS` a `cotizador.<tabla>`.
- **`root.controller.ts`**: los 6 puntos con `'public'` hardcodeado + `identificadorSql()`.
- **Script**: `2026-09-12_mover_cotizador_a_schema.ts`, idempotente y con `--revertir`.

### Verificación
- Conteo de filas idéntico en las **21 tablas** (558 productos, 138 diseños, 983 perfiles…).
- 4 FK vivas, 10 secuencias migradas, 8 ENUM en `public`, 7 filas de `auditoria_log`
  renombradas.
- `npm run build` limpio. **37/37** pruebas de `test:cotizador`.
- Servidor arranca: `[Cotizador] Caché lista: 558 productos, 138 diseños`. `sync()` no
  recreó nada (49 tablas en `public`, 21 en `cotizador`, 0 restos).
- Backup, consecutivo (con ROLLBACK) e `identificadorSql()` probados contra la BD: 0 fallos.

### Deuda detectada, no corregida
- **El golden master del cotizador está obsoleto desde el 2026-09-11**, no desde hoy: 6 de
  10 tests fallan por los cambios de datos de esa sesión (catálogo 430→432 con `KDG1106` y
  `KOP0102`, `flete_fijo` 25000→40000, la estructura `smo` aplanada en 6 campos nuevos).
  Esa sesión ya anotó que no pudo ejecutarlo. Los 4 que pasan son justo los independientes
  de precios (provisionales, `listarDisenos`, `parsearCodigo`, PLANO) y dan resultados
  byte-idénticos leyendo del schema nuevo. **Hay que regenerar el golden** o dejará de
  servir como red de seguridad. Los artefactos viven fuera del repo (`COTIZADOR_GOLDEN_DIR`).
- `npm run lint` está roto en todo el repo: ESLint 10 no encuentra `eslint.config.js`
  (la config sigue en formato `.eslintrc.*`). Preexistente.
- Sigue sin resolverse el bug de revertir `Cotizacion`/`SAP`/`RutaODP` (plural vs singular).

### Pendientes
- **Desplegar el backend cuanto antes**: la BD ya está migrada y el contenedor en
  producción corre código viejo, así que el módulo Cotizador responde `relation does not
  exist` hasta que salga este commit. El resto del ERP no se ve afectado.
- Regenerar el golden master del cotizador.
- Retomar el pulido visual del cotizador (el usuario tenía detalles pendientes sin enumerar).

---

## 2026-09-12 (2) — Cotizador: accesorios seleccionables (bisagra, chapeta, botón, manija)

### Motivo
Al pasar el código de Pomo-Haladera para el mapeo pendiente, el usuario pidió BHA1101 pero
señaló que el cliente podría querer otro. Se descubrió que **ese mecanismo ya existe**: 
`Cabinas Batientes` deja elegir bisagra/chapeta/botón desde 2026-09-10, cada opción con su
propio código. El resto de módulos no lo tiene. Se auditaron los 6 módulos comparando cada
`lineaCatalogo()` de código fijo contra el catálogo completo, para separar variantes reales
(mismo montaje, distinto material/estilo) de falsos positivos (misma palabra, otro producto:
"chapeta" incluye piezas de unión de perfil de aluminio y escudos de cerradura de puerta,
sin relación con la chapeta central de una cabina).

### Hallazgo de precio que descartó un candidato
`BIB0101` (Bisagra Bandera Mate) parecía una alternativa de bisagra sencilla hasta comparar
precios: cuesta 28× menos que las demás bisagras de cabina ($1.566 vs. ~$44.500). El precio
delató que es una pieza de mueble pequeña, no una bisagra de vidrio templado — se descartó.

### Cambios (6 de prioridad alta, mismo patrón: campo `select` + mapa `_POR_TIPO`)
- **`cabinasBatientes.ts`**: 3 opciones nuevas a selects ya existentes, sin tocar ninguna
  clave vieja — `sencillaAcero`→BSE1201, `doble180`→BDO0301 (bisagra), `acero3035`→CCE1101
  (chapeta), `acrilicoTransparente`→BHA0901 (botón, la 5ª que faltaba de las 5 del catálogo).
- **`cabinasCorredizas.ts`**: agregado el campo `tipoBoton` que no existía (antes cobraba
  `BHA0302` fijo sin opción, a diferencia de Batientes). Mismas 5 opciones que Batientes,
  mismo mapa duplicado a propósito (cada módulo mantiene el suyo, como ya hacían
  `VIDRIO_POR_ESPESOR`/`BPB_POR_ESPESOR`). Default `tamborCromo` reproduce el código de antes.
- **`proyectantes.ts`**: agregado `tipoManija` (`importada`→MBL0406 default, `nacional`→
  MAPR0101). Nacional es una alternativa real de precio/calidad que no tenía forma de
  elegirse — el asesor no sabía que existía.

### Verificación
- `tsc` limpio.
- Script de prueba directo contra los 3 módulos (sin mock, motor real + caché real):
  22/22 — el valor por defecto de cada campo nuevo reproduce exactamente el código que se
  cobraba antes (compatibilidad con cotizaciones ya guardadas), cada opción nueva resuelve
  al código correcto, un valor inválido lanza error explícito (nunca $0 en silencio, mismo
  criterio que el resto del motor), y el total cambia cuando el código cambia de precio.
- `npm run test:cotizador`: 37/37, sin regresión en el resto del motor.

### Las 4 opciones de baja confianza — confirmadas con el taller: NINGUNA aplica
Se repasaron una por una con el taller. Las 4 quedan descartadas, sin cambio de código:
- **Chapeta con cerrojo (CCC0101)** — no se usa en cabinas, es de vitrinas.
- **Chapeta esquinera (CES0301)** — tampoco aplica a cabinas.
- **Bisagra media luna (BME1101/1102)** — no se usan en cabinas. El precio ya lo insinuaba
  (2-4× las bisagras actuales): eran de otro tipo de puerta/vitrina, no de cabina de baño.
- **Brazo hidráulico Dorma (BHD0101)** — no se usa en el sistema 3831.

Confirma el criterio de la auditoría: cuando el precio de un "candidato" se dispara respecto
a las opciones ya activas de la misma familia, es señal de que es otro producto, no una
variante de lujo del mismo accesorio. Las 6 opciones que sí se activaron el 2026-09-12 (ver
entrada anterior) tenían precios en el mismo rango que su par ya ofrecido; estas 4 no.

Con esto se cierra el punto 1 de "Pendiente para retomar" de la entrada anterior. **Corrección
a esa misma entrada**: "Manija Proyectantes (prioridad media)" ahí aparecía listada también
como pendiente por error — ya estaba implementada (es el campo `tipoManija`, una de las 6 de
prioridad alta de esa misma sesión). No hay nada pendiente ahí.

### Sigue abierto: backlog de 26 accesorios de `cotizador_mapeo_accesorio`
Infraestructura inactiva (no afecta precios hoy — ver entrada del 2026-09-12 anterior),
**intacta**: el usuario dio BHA1101 para "Pomo-Haladera" (fila 2 de 26) pero el hilo se
desvió a la auditoría de arriba antes de guardarlo, y esa tabla no se tocó en esta sesión.
Retomar desde ahí, empezando por confirmar si BHA1101 sigue siendo la respuesta ahora que
Pomo-Haladera tiene 5 opciones en el motor real (¿la fila del backlog debería guardar una
sola respuesta, o reflejar que ahora es elegible?).

---

## 2026-09-12 (3) — Cotizador: triaje completo del backlog de 26 accesorios + servicios en local

### Contexto
Se retomó el backlog de `cotizador_mapeo_accesorio` con el taller al lado, en vivo, con backend
(puerto 3001) y frontend (puerto 3000) corriendo en local para verificar en el navegador
mientras se avanzaba. Resultado: **los 26 quedaron triados** — 3 nuevos resueltos en esta
sesión (más los 2 de la sesión anterior), 21 en pendiente explícito (el taller no tiene el
dato, no por omisión), 0 sin decisión.

### Resueltos en esta sesión (3, + Pomo-Haladera de la sesión anterior)
- **Guia 7038 → `GIN7038`** (nuevo). Costo $300, PA/PM/PB = 465.19/432.21/399.24.
- **Rodamiento 7038 → `ROD7038ABB`** (default) + **`ROD7038NY`** (nuevo, alternativa real
  de uso casi igual, según lo que pida el cliente — mismo patrón que Pomo-Haladera). Costos
  $36.891 y $29.582 respectivamente — **~10× más caros que ROD0401/744/8025** ($1.600-3.800);
  se verificó la magnitud con el taller antes de crear, confirmado como costo real.
- **Chapeta * 30 mm ref a15 → IGNORADO**. El taller aclaró que es un adicional de perfil
  genérico para varios sistemas, no una pieza propia de un sistema específico.

### Fórmula de precio verificada (importante para cualquier alta futura)
`precio_pa/pm/pb` **no son valores independientes**: son el costo × un multiplicador fijo
**por categoría**, verificado exacto contra 420 productos reales:
- **ACCESORIO**: ×1.55063 / ×1.44071 / ×1.33080 (PA/PM/PB)
- **PERFILERIA**: ×1.56... (grupo dominante 205 productos, no se necesitó hoy)
- **VIDRIO**: ×1.67... (35 productos)
Confirmado exacto contra `GIN0101`/`GIN8025` antes de aplicarlo a los 3 productos nuevos.
El endpoint `POST /api/cotizador/precios` (ya existente, `cotizador_precios.controller.ts`)
**no calcula esto solo** — espera los 3 precios ya calculados. Cualquier alta futura debe
aplicar la fórmula de la categoría correspondiente antes de llamarlo.

### 21 quedan en PENDIENTE, con razón — no es lo mismo "no se sabe" que "no aplica"
- **Familia Torino completa (8)**: Guía, Rodamiento, Sujeción Fijo, Tope, Chapeta Central,
  Manija Roma 40-20, Trinquete Inoxidable, Unión 90° — el taller no maneja esas referencias.
- **Sistema 7038, 2 de 4**: Chapa Overseas Doble Cilindro, Empaque monumental 6mm — sin dato.
- **11 sueltos** (Brazo 10", Manija Alpha, Chapetas/Rodamientos Primavera, Cerrojo Media Luna,
  Chapeta Anudal, Empaque de Cabina, Platina Rodamiento, Rodamiento Orquilla, Soporte
  Toallero, Unión VP010): el taller no tiene el dato a mano.

### Recordatorio: nada de esto mueve un precio en producción todavía
`cotizador_mapeo_accesorio` sigue siendo infraestructura inactiva — ningún sistema está en
`cotizador_accesorio_sistema_activo`. **Sistema7038-Interior en particular tiene un problema
aparte y más urgente**: `ventanas.ts` no tiene entrada para 7038 en su `CATALOGO_SISTEMAS`
interno, así que sus 23 diseños cotizan hoy con "no hay accesorios configurados" — cero
accesorios cobrados, sin importar qué diga esta tabla. Resolver el backlog no arregla eso.

### Verificación en vivo (no solo scripts)
Primera vez en la migración que se prueba contra el backend/frontend REALES corriendo en
local, en vez de solo contra Supabase por script:
- `npm --prefix backend-api run dev` (3001) + `npm --prefix frontend-web run start` (3000),
  ambos verificados con `curl` (401 en ruta protegida = middleware vivo, 200 en frontend).
- Los 3 productos nuevos se crearon con un JWT auto-firmado (`{id:30, rol:'root'}` con el
  `JWT_SECRET` real) contra el **endpoint HTTP real** `POST /api/cotizador/precios` — no un
  INSERT directo — para ejercitar la transacción completa (`CotizadorProducto` +
  `CotizadorPrecioHistorial`) y la invalidación de caché del proceso ya corriendo.
- El usuario navegó la app en paralelo (dashboard, proveedores) mientras se trabajaba —
  confirmado en los logs del backend.

### Pendiente
- Los 21 accesorios PENDIENTE quedan documentados en la BD (columna `nota`) — no repetirlos
  la próxima vez que se retome, ya está la razón de cada uno.
- El hueco de accesorios de Sistema7038-Interior en `ventanas.ts` (ver arriba) sigue sin
  resolverse — es el pendiente más urgente si se decide activar ese sistema.

---

## 2026-09-12 (4) — Cotizador Ventanas: 4 ajustes de catálogo + rediseño del selector de diseños

### Cambios pedidos (los 4 implementados)
1. **Sistema 7038 en el selector.** Entra, pero **sólo por diseño**: `calcular()` lanza un
   error explícito si llega 7038 sin `disenoId`. Sin ese corte, la línea
   `["5020","744","8025"].includes(sistema) ? sistema : "5020"` lo habría degradado a 5020
   y cotizado **otro sistema en silencio** — el riesgo real de este cambio.
2. **Color negro** en ventanas y proyectantes. Decisión del usuario: mostrarlo en todos los
   sistemas aunque el catálogo no lo cubra. Cobertura real medida: 5020 **0 de 66**, 744
   24/222, 8025 7/228, 7038 159/176, proyectantes 3831 **0 de 101**; y los 21 códigos negros
   existentes son todos de precio provisional. Las piezas sin código negro salen como
   **línea de ERROR visible** (regla del módulo: nunca $0 en silencio) y se agregó una
   advertencia que explica la cobertura.
3. **Diseños filtrados por sistema elegido** (5020 agrupa su variante Reforzado, 16 diseños).
4. **Vidrios**: crudo 4/5/6 + templado 4/5/6/8/10. Se eligió la línea **SP** y no `02TE`
   porque SP es la única que existe en 8 y 10mm; mezclarlas dejaría dos criterios de precio
   en el mismo selector. Las variantes `08SP` (STV) quedan fuera: están en catálogo con
   **precio 0**.

### Bug encontrado y corregido: la etiqueta "⚠ sin precio" mentía
El selector marcaba casi todos los diseños con "⚠ sin precio" usando `d.aptoParaCorte`. Pero
`aptoParaCorte` es `nivelCorte === "A"` (ver `motorDespiece.ts`): mide **la precisión del
despiece para mandar a cortar**, no si el diseño tiene precio. Todos esos diseños sí tienen
precio. Como sólo **2 de los 71** diseños de ventanas son nivel A, la etiqueta sembraba una
advertencia falsa en los otros 69.

### Rediseño del selector de diseños
Se reemplazó el `<select>` nativo por un dropdown propio: cada diseño son cuatro datos
(código, forma, paneles, nivel de corte) que un `option` de texto plano aplasta en una línea
ilegible, y con 25 diseños en 8025 hacía falta buscador. Incluye agrupación por sistema con
encabezado sticky, buscador por código/forma, código del diseño como chip destacado, chip de
nivel A/B/C **con su significado correcto** (A en verde como distintivo positivo, en vez de
advertir sobre los otros 69) y una leyenda al pie que lo explica. Cierra con click fuera y
con Escape.

### Otros arreglos de paso
- **Bug propio, detectado antes de darlo por bueno**: el efecto que limpia el diseño al
  cambiar de sistema lo borraba en el primer render, cuando la lista aún estaba vacía por el
  fetch pendiente. Se le agregó guard de `disenos.length` y `useMemo` para estabilizar la
  referencia.
- `cuerpos`/`alasCorredizas` se ocultan cuando hay diseño (el backend ya los deduce del
  código del diseño y los ignoraba) y se excluyen de la validación de requeridos: `cuerpos`
  era obligatorio y **bloqueaba el cálculo por un dato que no se usaba**.
- Se eliminó `COLORES` de `ventanas.ts`: código muerto, declarado y nunca usado.
- Centinela de `humo.test` actualizado 432 → 435 por los 3 productos dados de alta hoy.
- `Array.from(mapa.entries())` en vez de spread: el target de TS del frontend no permite
  iterar un Map con spread sin `downlevelIteration`.

### Verificación
`tsc` backend y frontend limpios; webpack sin errores ni advertencias nuevas. 19/19
comprobaciones propias contra el motor real (7038 sin diseño lanza error, 7038 con diseño
cotiza, negro genera 5 líneas de error en 5020 y sí cotiza en 7038, `cuerpos:99` no altera el
total cuando hay diseño, los 8 vidrios existen con precio > 0). 37/37 en `test:cotizador`.

### Pendiente
- **El templado de 4mm ($177.317) cuesta más que el de 6mm ($125.343) y que el de 5mm.** No
  tiene sentido físico: o el 4mm está sobrevalorado o los otros dos quedaron desactualizados.
- 7038 ya cotiza pero **sigue sin cobrar accesorios**: falta su entrada en
  `CATALOGO_SISTEMAS` de `ventanas.ts`. Ya existen `GIN7038` y `ROD7038ABB/NY`.

---

## 2026-09-12 (5) — Cotizador: el descuento admitía 500% y sacaba totales negativos

### El bug
Encontrado probando, no reportado. `descuentoPct` es una **fracción** (0,05 = 5%) pero el campo
del formulario la pedía en crudo, con la etiqueta "Descuento (fracción 0-1)". Un vendedor que
escribiera `5` queriendo un 5% obtenía un descuento del **500%**: la cotización salía con total
**−$2.083.681**, en **HTTP 200**, sin una sola advertencia, y se podía guardar y mandar al
cliente. No es el mismo bug que el de 2026-09-10 (allí el modal *mostraba* "0,05%"); éste es de
entrada y sí movía el dinero.

### El arreglo, en dos capas
- **Backend** (`motorCalculo.ts`, `totalizar`): rechaza cualquier `descuentoPct` fuera de 0-1 con
  un mensaje que dice qué escribir. Es el **único** punto donde se aplica el descuento, así que
  una sola guarda cubre los 6 módulos y el camino por diseño.
- **Frontend** (`CampoDinamico.tsx`): el campo pasa a pedir el **porcentaje real** con `min=0` y
  `max=100`, y convierte a fracción al enviar. Las cotizaciones ya guardadas siguen leyéndose
  igual porque lo que viaja al backend no cambió de unidad. El valor mostrado se redondea
  (`Math.round(v*10000)/100`) porque `0.05 * 100` da `5.000000000000001` en coma flotante.
- Etiqueta actualizada a "Descuento (%)" en los 4 módulos que la declaraban.

Enfoque confirmado con el usuario antes de implementar ("Porcentaje real + tope"). Verificado con
7 casos: 0, 0,05, 1, 1,5, 5, 50 y −0,1 — los cuatro inválidos ahora dan 400 en vez de 200.

---

## 2026-09-13 — Cotizador: el despiece deja de calcularse con una recta y pasa al modelo real

### De dónde salió esto
El usuario preguntó qué eran los "3 puntos y 3 incógnitas" de la advertencia que aparecía en
129 de 138 diseños, y después pasó la ruta del proyecto donde trabajó los despieces:
`C:\Users\User\Desktop\<proyecto externo de origen>`. Es el **origen** del catálogo:
1.992 extracciones reales del software de origen, 652 diseños, 561 con fórmulas. Se comprobó pieza
por pieza que los 137 diseños con perfiles del ERP tienen el despiece **idéntico** al de allí
(multiconjunto de fórmulas por diseño): cero drift desde la importación.

### El diagnóstico: la recta nunca fue el cálculo real
La extracción tomó 3 medidas por diseño (1000×1200, 500×1200, 1000×600) y ajustó por mínimos
cuadrados `medida = a*ancho + b*alto + c`. Con 3 puntos y 3 incógnitas el ajuste encaja por
álgebra, no por acierto — de ahí la advertencia.

Pero el problema de fondo era otro. El software de origen calcula `trunc((ancho − k) / nº de paneles)`.
**Las 3 medidas de extracción son todas múltiplos de 100**, así que esa división caía exacta y
el truncamiento nunca se hizo visible: se verificó que en las 3 medidas extraídas ninguna
fórmula del catálogo produce un decimal. La regresión absorbió el redondeo desplazando la
pendiente — donde el modelo real es 1/3 = 0,3333…, la recta quedó en **0,334** (59 usos en el
origen; 0,166 por 1/6, 19 usos). Ese desplazamiento produce un error que **crece con el tamaño
del vano**, y es el origen literal del "puede desviarse hasta 3,3 mm" del nivel C.

Ejemplo real, `Sistema5020::OXO`, paño de vidrio: vano 1000 → 297 mm ( = (1000−109)/3 exacto );
vano 500 → 130 mm ( = (500−109)/3 = 130,33 truncado ). R² del ajuste: 0,9942, no 1.

### Evidencia de que la forma del modelo sí generalizaba (validación cruzada, sin costo)
12 diseños del origen se extrajeron con **6** medidas en vez de 3. Eso permitió el experimento
que nunca se había hecho: ajustar con las 3 medidas base y **predecir** las otras 3, que el
ajuste no vio. Resultado: **234/234 cortes de perfil y 66/66 medidas de vidrio exactos, error
0,00 mm**, cubriendo un diseño de cada sistema (5020, 5020R, 744, 8025, 3831 ×3, 7038 int/ext,
Puerta Batiente). Lo que fallaba no era la forma del modelo: era representarla con una recta de
coeficientes continuos.

### Lo que se hizo
Se reconstruyó, por búsqueda entera acotada sobre las observaciones reales, el modelo
`op((p*ancho + q*alto + r) / n)` de cada pieza —`op ∈ {exacto, trunc, round, ceil}`— y se
guardó junto a la recta, que se conserva intacta.

- `scripts/2026-09-13_reconstruir_modelos_corte.ts` — genera
  `datos_cotizador/modelos_corte.json` (versionado, para que aplicar no exija tener el otro
  proyecto). **Candado de emparejamiento**: sólo acepta el modelo si la recta guardada en la BD
  reproduce las observaciones que se le están asignando; si no, la pieza queda sin modelo. Dio
  0 fallos sobre 1.201 piezas.
- `scripts/2026-09-13_aplicar_modelos_corte.ts` — columnas nuevas (`modelo_*` en
  `diseno_perfil`, `modelo_ancho_*`/`modelo_alto_*` en `diseno_vidrio`), aplica el JSON,
  recalcula niveles, verifica antes del COMMIT que no haya modelos a medias ni divisor 0.
  `--revertir` restaura desde `niveles_previos_2026-09-13.json`.
- `motorDespiece.ts` usa el modelo entero cuando existe y cae a la recta cuando no. Un `op`
  desconocido devuelve `null` (advertencia visible), nunca NaN.
- `cache.ts`: `modeloDesdeFila()` reconstruye el modelo; `modelo_n IS NULL` es la señal única
  de "sin modelo".

### Un fallo propio del espacio de búsqueda: las piezas constantes
La primera pasada dejaba 8 perfiles "sin modelo entero" y los mandaba a nivel C con el motivo
genérico "desviación no acotada". Al mirar sus observaciones, el motivo era otro: **su medida es
una constante** (`0*A + 0*H + 15`) — 15, 30, 4 y 13 mm en los cuatro casos, idéntica en las tres
medidas extraídas. La búsqueda excluía `p = q = 0`, así que no podía encontrarlas. Admitido ese
caso, los **983 perfiles tienen modelo** y ninguno cae ya a la recta.

Siguen en nivel C, pero por la razón correcta y dicha en voz alta: una pieza que no escala con la
ventana significa que el diseño se calcula con un parámetro que el formulario no pide (el ancho
del marco de los diseños "M"). `nivelDe()` las degrada aunque su dispersión sea 0 —la aritmética
es exacta, la medida no sirve para cortar— y `motorDespiece` emite una advertencia propia que lo
explica en vez de hablar de precisión. Afecta a 6 diseños: `Sistema7038-Interior::MXX/MXXX/XXM/XXXM`,
`Sistema744::MXX`, `Sistema8025::MXXX`.

### Un filtro que salió de mirar el HTML crudo
La primera pasada emitía medidas como **595,5 mm**. Un modelo `(ancho − 6)/2` sin redondeo
reproduce las 3 observaciones —en ellas la división cae exacta— pero en un vano cualquiera
devuelve medio milímetro. Se comprobó sobre los reportes originales (**844 celdas de medida en
60 reportes HTML: cero decimales**) que el software de origen nunca emite una medida de corte fraccionada,
así que esos candidatos son demostrablemente falsos y `siempreEntero()` los descarta. Ahora
`595,5 → 596`, y se verificó que **las 8.466 medidas de los 138 diseños × 6 vanos son enteras**.
Ninguna pieza se quedó sin modelo por el filtro.

### Resultados
| | antes | después |
|---|---|---|
| diseños nivel A | 12 | **14** |
| diseños nivel B | 74 | **118** |
| diseños nivel C | **52** | **6** |
| paños `C_MODELO_LINEAL_INCORRECTO` | 94 | **0** |

1.036 de 1.419 medidas quedan **determinadas** (todos los modelos compatibles dan el mismo
número) y 383 con **±1 mm**. Los 1.201 elementos del catálogo (983 perfiles + 218 paños) tienen
modelo entero: ninguno sigue calculándose con la recta. Los 6 diseños que siguen en nivel C son
los que llevan marco, por las piezas constantes descritas arriba.

**Evidencia estructural, no sólo numérica**: el divisor reconstruido coincide con el número de
paneles del diseño — `/2` en OX, `/3` en XOX y OXO, `/4` en OXXO (151 de ~175 piezas con
divisor > 1 coinciden exacto).

### Los niveles cambiaron de significado
Ya no describen "qué pinta tienen los coeficientes" sino **cuánto puede equivocarse la medida**:
A = determinada; B = ±1 mm en las piezas que dividen, el resto determinado; C = sin modelo,
error no acotado. Se actualizaron los rótulos y la leyenda de `SelectorDiseno.tsx`.

Las advertencias del motor ahora **nombran las piezas concretas** en vez de emitir un veredicto
sobre el diseño entero: en `Sistema744::XO` dice "Horizontal Inferior (390), Horizontal Superior
(389), paño de vidrio · ±1 mm; el resto está determinado". Se retiró la advertencia de "3
medidas / 3 incógnitas" (describía el ajuste por regresión, que ya no es cómo se calcula) y la
de nivel B/C con los milímetros viejos.

### Lo que este trabajo NO resuelve — leerlo antes de cortar
- **Queda ±1 mm** en las piezas que dividen. La reconstrucción acota la ambigüedad, no la
  elimina: con 3 observaciones en medidas redondas hay ~25-43 modelos compatibles y todos
  coinciden dentro de 1 mm, pero cuál es el verdadero no se sabe. **Se cierra con una sola
  observación en una medida no redonda** (el scraper del otro proyecto puede darla; el usuario
  no autorizó conectarse en esta sesión) o midiendo una pieza real.
- **`dispersionMm` acota dentro del espacio de búsqueda.** Si el software de origen hiciera algo fuera
  de esa familia (recorte condicional, tabla por tamaño), la cota no diría nada de ese caso.
- **Nivel A ≠ apto para cortar.** Habla de la aritmética del software de origen, no del taller:
  el margen de corte por perfil sigue sin calibrar y `calibracion_contraste` sigue vacía. La
  aptitud la decide `aptitudOrden.ts` con 8 condiciones.
- **`aptoParaCorte` sigue siendo `nivelCorte === "A"`**, así que los 118 diseños nivel B siguen
  sin poder emitir orden de corte pese a tener ±1 mm conocido. Cambiar ese umbral es decisión
  de negocio, no se tocó — pero ahora es una decisión que se puede tomar con un número delante,
  que antes no existía.
- **Los 6 diseños con marco necesitan un campo nuevo en el formulario** (el ancho del marco).
  Hasta entonces su despiece cotiza bien pero dos piezas no son cortables. No se abordó.
- Las **cotizaciones ya guardadas** marcarán "medida desactualizada" en las piezas que dividen
  (condición 8 de `aptitudOrden.ts`). Es el comportamiento correcto y esperado.

### Verificación
`tsc` backend y frontend limpios. 37/37 en `test:cotizador` — incluye la comprobación
geométrica de que en los 138 diseños cada fila suma el ancho exterior y las filas suman el alto
(±0,01 mm), ahora con las medidas nuevas. Script determinista: regenerado tras aplicar, los
1.193 modelos coinciden con la BD, 0 diferencias.

Verificación activa sobre los 138 diseños × 6 vanos (incluidos los "feos" y dos absurdos):
- 8.514 medidas emitidas: **0 no finitas, 0 no enteras**.
- **3.126 comparaciones contra las observaciones reales del software de origen: 0 discrepancias.** Los
  modelos reproducen exactamente lo que el software original devolvió.
- Desviación máxima respecto de la recta anterior: **3,00 mm**, en `Sistema3831::WWWWWW` a
  3000×2400. Es justo la magnitud que anunciaba la advertencia vieja ("hasta 3,3 mm"), lo que
  confirma que ese error era real y crecía con el tamaño del vano.
- 7 medidas negativas, todas en vanos absurdos (400×500 en un diseño de 6 cuerpos): el motor ya
  las marcaba como medida inválida con advertencia visible.

Prueba HTTP contra el backend levantado (`POST /api/cotizador/cotizar/ventanas`, token firmado
en local): 3 casos, HTTP 200, medidas enteras y una sola advertencia por ítem.

`test:cotizador:golden` sigue **saltándose los 10 tests** por falta de `COTIZADOR_GOLDEN_DIR`
(el scratchpad que lo generaba no existe): deuda preexistente desde 2026-09-11, no introducida
aquí. Mientras siga así, no protege de regresiones.

---

## 2026-09-13 (2) — Cotizador: Fase 1 de importación de diseños faltantes (25 diseños)

### Encargo
Importar los diseños faltantes de 3831, 3831-Reforzado, 3831-Persiana, 7038-Exterior, 744,
5020, 8025, 5020-Reforzado, 7038-Interior + Fachadas, Pasamanos, Koncept, Optiglass, Puertas
Batientes. Se hizo la Fase 1 (la que no requiere conseguir ningún dato nuevo).

### El análisis de viabilidad tumbó la cifra de "352 faltantes" a lo realmente importable
Un diseño sólo cotiza si cada perfil tiene su código Templex por color (`codigos_por_color`).
Ese mapeo NO vive en ningún archivo del repo (se hizo fuera; sólo quedó el resultado dentro de
`disenos.json`), así que para diseños nuevos sólo se puede REUTILIZAR el de diseños gemelos ya
en producción. Midiendo eso:
- De 352 "faltantes", sólo **141 cotizaban** con el mapeo existente; 134 parciales; 40 sin nada.
- Y de esos, muchos eran **degenerados**: el extractor del software de origen los dejó con un solo
  perfil (una "Alfajía") sin vidrio ni marco. Importarlos cotizaría un perfil suelto.

Filtrando por criterio estricto (≥4 perfiles con fórmula, ≥1 vidrio, todas las refs mapeadas en
el mismo sistema, códigos con precio, y la invariante del proyecto `parser.paneles === nº de
paños`), la Fase 1 quedó en **26 candidatos**, y una última verificación quitó 1 más:

### Los filtros, en orden (cada uno atrapó algo real)
1. **Completos**: descarta 76 degenerados (1 perfil/0 vidrios) + 5 sin perfiles (los "M" de marco).
2. **Refs mapeadas + con precio**: todas las de los candidatos ya existían en su sistema.
3. **`parser.paneles === nº de paños`**: descarta 12 diseños con batiente/proyectante EN LÍNEA
   (OB, OW, OBO, BOB…) donde el nº de paneles ≠ nº de paños facturables — divergencia legítima
   que rompería la invariante de `codigoDiseno.test.ts` y que `cotizarPorDiseno` (que deriva
   `cuerpos` de parsearCodigo) no repartiría bien. Se apartan para una decisión de modelo aparte.
4. **Perfil con medida válida a tamaño normal**: descarta `Sistema3831-Reforzado::WWWWWW`, cuyo
   perfil "Marco Nave" da 0 mm a medida estándar (necesita un parámetro que el formulario no pide).

Resultado: **25 diseños importados** — Sistema3831 (11), Sistema3831-Reforzado (13),
Sistema7038-Interior (1... en realidad 2: OXXXXXXO2, XXXXXXXX2). Los 25 cotizan con precio
correcto (perfilería + vidrio por fórmulas verificadas), copiando `codigos_por_color`,
`ref`/`ref_original` y `es_alfajia` de sus perfiles gemelos ya en producción.

### Un susto que resultó ser comportamiento preexistente
El gate de verificación marcó "área de vidrio = 0" en los 26. Resultó que **los 3831 que YA
estaban en producción (O, OO, OOO, W, WW) también dan área 0**: el sistema 3831 usa vidrio "Sin
Vidrio" y el área siempre sale 0 en este modelo (el vidrio se maneja aparte). Los nuevos se
comportan idéntico a sus hermanos. No era una regresión; era un criterio de gate equivocado.

### Mecánica y artefactos
- `scripts/2026-09-13_importar_disenos_fase1.ts` — dry-run por defecto, `--aplicar`, `--revertir`.
  Deriva la lista por criterio (no hardcodea), inserta en transacción con verificación pre-commit,
  registra los ids en `datos_cotizador/importados_fase1_2026-09-13.json`.
- **`paneles` y `etiqueta`**: se derivan aquí, no con parsearCodigo (que falla en apilados mixtos
  como W_O). `paneles` = nº de paños (invariante del proyecto); `etiqueta` = derivación propia por
  filas ("Proyectante + …  |  Fijo + …").
- Se amplió `cotizador.diseno.etiqueta` de VARCHAR(120) a **200**: la etiqueta de WWWWWW_OOOOOO
  llega a 125 chars. Cambio aditivo, no reescribe la tabla.
- Tras importar se re-corrió reconstruir + aplicar de modelos de corte (los 25 nuevos obtienen
  sus modelos y niveles). Muchos quedan en nivel B/C, igual que sus hermanos 3831.
- **`disenos.json` sincronizado**: se añadieron los 25 (de 138 a 163), preservando los 138
  byte a byte (diff +5510/−1, sólo al final). Es la semilla del sembrador: sin esto, un re-seed
  los borraría. No incluye `modelo_*` — igual que los 138, los modelos se aplican aparte a la BD.

### Estado tras la Fase 1
Catálogo: **163 diseños** (138 + 25). Niveles: A=15, B=124, C=24.

### Verificación
`tsc` OK. **37/37 en test:cotizador** con los centinelas actualizados a 163 — incluye las
invariantes sobre los 25 nuevos: `parser.paneles === paños`, `paneles guardado === parser`,
plano no lanza y su geometría suma el exterior (±0,01 mm) a 2400×1800 en los 163. Verificación
en memoria: los 25 cotizan con total>0 y sin ítems en error, del mismo orden que sus hermanos.

### Lo que queda para Fase 2 y 3 (no hecho)
- **Fase 2** (necesita datos): ~35 referencias de perfil nuevas de 744/5020/8025/5020-Reforzado.
  Con el código Templex por color de cada una, entran ~92 diseños más.
- **Apartados de Fase 1** (decisión de modelo): 12 diseños con batiente/proyectante en línea
  (OB, OW, OBO, BOB, OWO, WOW, OB_O, BO_O, O_W_O, OXXXXXXO_3P) — su nº de paneles ≠ nº de paños.
- **Fase 3** (proyectos de catálogo desde cero): 3831-Persiana, 7038-Exterior, Fachadas,
  Pasamanos, Koncept, Optiglass, Puertas Batientes — validar mapeo y armar precios sistema a
  sistema. Fachada de Acero NO tiene fórmulas en el origen (imposible importar).
- Los 25 nuevos, como sus hermanos 3831, cotizan área de vidrio 0 (el vidrio va aparte) y quedan
  mayormente en nivel B/C — sirven para cotizar, no directamente para orden de corte.

### Hallazgo sin explotar: hay 423 diseños sin importar
El origen tiene **561 diseños con fórmulas** frente a los 138 del ERP. Entre lo que falta:
`Sistema7038-Exterior` completo (29, cero importados), `Sistema3831-Persiana` (31, cero),
y la mitad larga de 744 (24/50), 8025 (25/47), 5020 (9/33), 3831 (15/75). Además el origen trae
el **despiece de accesorios por diseño** con cantidades — 54 accesorios distintos para los 138
diseños actuales, incluidos los del 7038 que hoy no se cobran (`Guia 7038`, `Rodamiento 7038`,
`E7038_6mm Empaque monumental 6mm`, felpa, tornillería). Hoy esos accesorios salen de mapas
escritos a mano por módulo (`CATALOGO_SISTEMAS`). No se tocó nada de esto.

---

## 2026-09-13 (3) — Cotizador: diagnóstico de la aptitud para orden de corte (cotización #5)

### Encargo
El usuario mostró la cotización #5 con mensajes en rojo y los botones "No imprimible", y pidió
"corregir esos errores".

### Diagnóstico: ninguno es un bug
Son el **semáforo de aptitud para orden de corte** (`cotizador/lib/aptitudOrden.ts`, 8 condiciones)
funcionando como se diseñó. La cotización está bien: cotiza, da precio y está APROBADA
($1.405.551). Lo único que esos mensajes bloquean es **imprimir la orden de corte definitiva**
para el taller, que exige garantías extra que una cotización comercial no necesita. Contrastado
contra la BD:

- **Ítem "proyectantes"** → `diseno_id = null`, sin despiece (`SIN_DESPIECE_POR_DISENO`, cond. 2).
  Se cotizó a medida libre / tablero, sin elegir un diseño con despiece. No hay piezas que cortar.
  Correcto.
- **Ítem "ventanas"** → diseño `Sistema5020::OX`, nivel **B**, holgura global aplicada. Tres
  motivos con una raíz única — **el Sistema5020 nunca se ha calibrado**:
  - `NIVEL_NO_VALIDADO` (cond. 3): el OX es nivel B porque 2 de sus 9 piezas (perfil Horizontal
    `148` y el paño de vidrio) salen de una división cuyo redondeo el sistema no conoce (±1 mm).
  - `NO_APTO_PARA_CORTE` (cond. 5): redundante — `motorDespiece.ts:360` define
    `aptoParaCorte = nivelCorte === "A"`; al ser B, cae solo.
  - `SISTEMA_NO_EN_PRODUCCION` (cond. 7): confirmado en BD — `calibracion_sistema` 0 filas,
    `calibracion_margen` 0, `calibracion_contraste` 0. Inventario 5020 = 8 perfiles + vidrio = 9
    piezas, 0 con margen → `EN_CALIBRACION`, "0 de 9 piezas calibradas".

### Hallazgo estructural → `TECH_DEBT.md` 2026-09-13
El módulo de calibración está **a medio construir**: existen tablas, matemática (`calibracion.ts`)
y getters de lectura (`calibracionStore.ts`/`cache`), pero **no hay controller de escritura, ni
rutas `/calibracion`, ni pantalla frontend**. Los mensajes remiten a "/calibracion", que no existe.
Hoy, desde la app, es imposible registrar contrastes del maestro, aprobar márgenes, identificar
fórmulas nivel B, firmar o marcar un sistema `EN_PRODUCCION`.

### Dos bloqueos distintos (no confundir)
Marcar el 5020 `EN_PRODUCCION` **no** haría imprimible el OX: seguiría bloqueado por su nivel B
(cond. 3 y 5) hasta identificar la fórmula. El nivel del diseño y el estado del sistema son
bloqueos independientes.

### Decisión del usuario
Ante las opciones de alcance (construir la calibración / desbloqueo mínimo piloto / dejar y
documentar), eligió **"dejarlo, sólo documentar"**. No se tocó código. Se documenta el estado y
lo que falta aquí y en `TECH_DEBT.md`. El semáforo es correcto; lo pendiente es real: completar
la capa de escritura de calibración (varios días + medidas del maestro).

---

## 2026-09-14 — Cotizador: cierre de los 5 SKU de accesorios de Sistema7038-Interior

### Encargo
Retomar el pendiente del 2026-09-12: `Sistema7038-Interior` (23 diseños) cotiza pero no cobra
ningún accesorio porque no tiene entrada en `CATALOGO_SISTEMAS` (`ventanas.ts`), y 2 de los 5 SKU
de accesorio del sistema seguían sin código real (`Chapa Overseas Doble Cilindro`, `Empaque
monumental 6mm`).

### Estado real verificado contra Supabase (no el JSON del repo)
`mapeo-accesorios.json` decía "PENDIENTE" para los 5, pero en la BD ya estaban `MAPEADO` **Guia
7038 → `GIN7038`** y **Rodamiento 7038 → `ROD7038ABB`** desde el 2026-09-12 — el archivo quedó
desincronizado esa sesión y nadie lo corrigió. Se sincronizó de paso.

### Los 2 códigos que faltaban
El usuario dio el costo real de proveedor de cada uno:
- **`COG0101`** (Cerradura Overseas Gancho), costo $84.542 → PA/PM/PB = 131.093,19/121.800,67/112.508,16
- **`EMP1312`** (Empaque 7038 Ref 6-8mm), costo $988/m → PA/PM/PB = 1.532,02/1.423,42/1.314,83

Multiplicador de categoría ACCESORIO **re-verificado con más precisión** contra 18+ productos
reales de `cotizador.producto` (incluidos `GIN7038`/`ROD7038ABB`, que reproduce exacto):
**×1.550628 / ×1.440712 / ×1.330796** — más fino que el ×1.55063/×1.44071/×1.33080 que había
quedado anotado en SESSION_LOG el 2026-09-12. Este valor de 6 decimales es el que se usó de aquí
en adelante en toda la sesión (incluida la Fase 0 de la integración con Proveedores, más abajo).

Ambos dados de alta vía el endpoint real `POST /api/cotizador/precios` (no INSERT directo), mismo
patrón que `GIN7038`/`ROD7038ABB` el 2026-09-12.

### Conexión del motor — el cambio que de verdad cobra los accesorios
`CATALOGO_SISTEMAS["7038-Interior"]` (`ventanas.ts`) — **la clave lleva el guion, no "7038"**:
`calcularPorDiseno` deriva el nombre del sistema quitando solo el prefijo `Sistema` y el sufijo
`Reforzado`, así que `Sistema7038-Interior` no encaja con ninguno de los dos.
```
"7038-Interior": {
  guia: { _: "GIN7038" },
  rodamiento: { _: "ROD7038ABB" },
  empaque: { _: "EMP1312" },
  chapa: { _: "COG0101" },
},
```
La fórmula de cantidades **ya existía** (genérica para todos los sistemas: `guia=cuerpos×2`,
`rodamiento=alasCorredizas×2`, `chapa=alasCorredizas`, `empaque=perímetro en metros`) — no hizo
falta inventar nada, solo conectar los códigos.

### Bug real encontrado en el camino (no se explotó, se documentó)
`hacerAgregarRol` (`cotizarPorDiseno.ts:337-344`): si un rol **no existe** en el mapa de un
sistema, retorna en silencio — sin advertencia, ni siquiera para los roles no marcados
`opcional`. Wiring parcial (p. ej. conectar solo guía+rodamiento sin tener aún chapa/empaque)
habría dejado esos dos accesorios sin cobrar **sin ningún aviso**, peor que el estado anterior
("No hay accesorios configurados", que al menos es visible). Por eso se esperó a tener los 4
códigos completos antes de escribir la entrada.

### Verificación
`tsc` limpio. `test:cotizador` 37/37 (sentinela de catálogo actualizado 435→437 por los 2
productos nuevos). Cotización de prueba real contra `Sistema7038-Interior::OX` (1m×1,2m, 2
cuerpos, 1 corrediza): guía=4, rodamiento=2, empaque=6,8m, chapa=1 — los 4 sin error, total
$1.337.793,94.

### Pendiente
`ROD7038NY` (alterna más barata) sigue creada pero sin usar — no hay campo seleccionable de tipo
de rodamiento para 7038, igual que hoy. Documentado como mejora futura, no construida (no se
pidió).

---

## 2026-09-14 (2) — Cotizador: integración con catalogo_productos y sincronización automática de costo con Proveedores

### Encargo
El usuario planteó la idea de fondo: el Cotizador (aislado desde su diseño original, ver memoria
`cotizador-aislado-hasta-orden-directa`, decisión 2026-09-10) debe dejar de inventar su propio
catálogo de 563 códigos a mano y en su lugar (1) usar `catalogo_productos` (maestro real de
Templex) como fuente de identidad, y (2) tomar el costo de `proveedor_producto` (módulo
Proveedores) en vez de que el taller lo confirme caso por caso. Es la primera vez que se autoriza
tocar la isla del Cotizador con datos reales del resto del ERP.

### Investigación previa (3 exploraciones en paralelo + números reales medidos)
- **Cotizador** (`cotizador.producto`, schema propio `cotizador`): 100% aislado hoy, `codigo`
  texto libre sin FK a nada externo. El archivo `cotizador/lib/precios/proveedorSequelize.ts` NO
  tiene relación con el módulo Proveedores pese al nombre — es el adaptador interno de lectura del
  propio Cotizador (patrón heredado del proyecto de origen), hallazgo que evitó una confusión de
  diseño real.
- **Catálogo maestro** (`catalogo_productos`, schema `public`): 1.243 filas, solo código+nombre,
  sin precio. **Drift real modelo↔BD**: Sequelize declara `codigo UNIQUE NOT NULL`, la tabla no
  tiene ese constraint (31 filas `codigo NULL`) — documentado en `TECH_DEBT.md` 2026-09-14.
- **Proveedores** (`proveedor_producto`): 147 filas activas, cubren solo 132 de 1.243 productos
  del maestro (10,6%). Existe un comparador de solo lectura (`GET /api/proveedores/precios`,
  `consultarPrecios`) pero ninguna función de servicio reutilizable para "dame el costo vigente de
  X" — había que construirla.
- **Solapamiento medido**: de los 563 códigos del Cotizador, 382 (68%) coincidían por texto exacto
  con `catalogo_productos.codigo`; 181 (32%) no existían ahí.

### Decisiones del usuario (plan aprobado en modo Plan, `ExitPlanMode`)
1. Códigos huérfanos: no bloquean nada — se entrega un Excel a Descargas para reconciliar a mano.
2. Selección de proveedor cuando hay varios: **el más barato activo** (`activo=true` y
   `seguir_precios=true`), mismo criterio que ya usa el comparador.
3. Sincronización: **automática** — al cambiar un precio en Proveedores, el Cotizador recalcula
   solo, sin paso manual. Decisión explícita pese al riesgo (un precio mal cargado se propaga de
   inmediato); se mitigó dejándolo 100% auditable vía `por='sync-proveedores'` en el historial.
4. Recosteo retroactivo de los 132 productos que ya cruzan Cotizador+Proveedores: **solo informe
   (dry-run), no aplicar todavía** — decisión pendiente, a la vista del informe.

### Qué se construyó
- **`2026-09-14_cotizador_vinculo_catalogo_maestro.ts`** (migración, patrón de
  `2026-09-12_mover_cotizador_a_schema.ts`): columna `cotizador.producto.catalogo_producto_id`
  (FK cross-schema hacia `catalogo_productos`, nullable) + índice + backfill por match exacto de
  código (382 vinculados en la primera corrida) + tabla nueva `cotizador.multiplicador_categoria`
  (formaliza el multiplicador PA/PM/PB por categoría, antes recalculado a mano en cada script;
  sembrada solo con ACCESORIO — PERFILERIA/VIDRIO quedan sin fila a propósito, ver `TECH_DEBT.md`).
  Idempotente, con `--revertir`.
- **`utils/proveedorReglas.ts`** (nuevo): se extrajo `siguePrecios()` de `proveedor.controller.ts`
  (vivía sin exportar y sin ningún llamador real dentro del archivo) para reusarla desde el
  Cotizador sin duplicar el criterio tri-estado `activo && seguir_precios`.
- **`cotizador/lib/sincronizacionProveedores.ts`** (nuevo): `recalcularCostoDesdeProveedor(id)` —
  no-op barato (un solo `findAll` indexado) si ningún producto del Cotizador apunta a ese
  `catalogo_producto_id`; si hay match, busca el proveedor más barato que pasa `siguePrecios`,
  deriva costo por unidad (`TIRA_6M` divide por `metros_por_unidad`), aplica el multiplicador de
  la categoría y escribe en `cotizador.producto` **base** (nunca en `CotizadorPrecioOverride`: esa
  capa "gana siempre" por diseño — si el sync escribiera ahí competiría con la edición humana sin
  precedencia clara). `programarRecalculo()`: cola coalescida por `setImmediate` para que un lote
  de facturas con 20 productos no dispare 20 recargas completas de la caché del Cotizador.
- **Enganche**: dentro de `actualizarPrecio()` (`proveedor.controller.ts:146-210`, el único punto
  de escritura de precio de Proveedores, cubre sus 6 call-sites), `transaction.afterCommit(() =>
  programarRecalculo(...))` — mismo patrón que `utils/checksAutomaticos.ts` para los checks
  automáticos de ODP.
- **`2026-09-14_exportar_codigos_huerfanos_cotizador.ts`**: Excel a `Downloads` con los códigos
  del Cotizador sin match. Iteración de formato pedida por el usuario: en vez de una columna
  `decision` de texto libre, dos columnas estructuradas — `accion` (lista desplegable
  HOMOLOGAR/ALTA_NUEVA/IGNORAR) + `codigo_homologo` —, con las coincidencias de texto exacto
  pre-llenadas como sugerencia verificable (5 de 181 la primera vez).
- **`2026-09-14_cotizador_recosteo_retroactivo_proveedor.ts`**: informe dry-run (reusa
  `recalcularCostoDesdeProveedor` con rollback en vez de commit, no reimplementa el cálculo). De
  382 vinculados: **35 cambiarían** de costo, 25 sin cambio (ya coinciden o sin multiplicador de
  categoría), 322 sin proveedor activo con precio todavía.

### Verificación en vivo contra Supabase real (no solo scripts)
Con el backend local corriendo, se subió el precio de un proveedor real de $28.740 a $28.741 vía
`PATCH /api/proveedores/productos/104` y se confirmó en la BD (no en la caché, para no depender de
timing): `cotizador.producto.costo_unitario` de `BSE1201` cambió solo de 28.740 a 28.741 (y sus 3
precios de venta), con `cotizador.precio_historial` registrando `por='sync-proveedores'`; al
revertir el precio del proveedor, se revirtió solo también. `test:cotizador` 37/37 tras todo el
trabajo (golden master de 9 claves del tipo `Producto` intacto, `catalogo_producto_id` nunca se
expone en la caché).

### Fricción operativa de la sesión (no es deuda del producto, nota para la próxima)
Trabajar con el backend local corriendo (`nodemon`) mientras se editan archivos y se corren
scripts one-off simultáneos contra el mismo Supabase (pooler de 15 conexiones en modo sesión) generó
varios `EMAXCONNSESSION`. El patrón de espera `tail -3 backend.log | grep "puerto 3001"` que se
venía usando para confirmar que nodemon terminó de reiniciar **dejó de servir** en cuanto el
usuario empezó a navegar la app en paralelo (el log sigue creciendo con requests reales, la frase
de arranque sale del tail) — quedó un proceso en background esperando una condición que ya nunca
se iba a cumplir. Se resolvió con `curl` directo en vez de grep de log, y con un patrón de
reintento acotado (`until ... || [ $i -ge N ]; do sleep 10; done`) para las conexiones a Supabase.

### Pendiente
- Multiplicador de PERFILERIA/VIDRIO sin verificar → `TECH_DEBT.md` 2026-09-14.
- Decisión sobre aplicar el recosteo retroactivo a los 35 productos identificados en el informe.
- Fase 2 (aplicar las decisiones del Excel de huérfanos reconciliado) — script aparte, depende de
  que el usuario devuelva el archivo lleno.

---

## 2026-09-14 (3) — Catálogo maestro: 14 códigos importados desde el inventario World Office

### Encargo
El usuario aportó `Inventarios_Por_Bodega_Acum.pdf` (reporte World Office de existencia por
bodega, 97 páginas) como fuente autorizada de códigos+descripciones de Templex, y pidió agregar a
`catalogo_productos` los que no estuvieran ya.

### Extracción
`pdftotext -layout -enc UTF-8` (sin `pdftoppm`/poppler completo instalado, pero `pdftotext` sí
disponible) + parseo en Node: las líneas `Total para <codigo> ...` (1.222 en el PDF) se usaron
como confirmación de "esto es un producto real", no un encabezado de sección
("ACCESORIOS", "INV MATERIAS PRIMAS"); la descripción completa se tomó de la primera línea del
bloque porque la línea `Total para` la trunca por el ancho fijo de columna del PDF (ej.
`ACCBP01`: header trae "...PISTOLA IZQUIERDA" completo, `Total para` corta en "...IZQUIERD").

### Cruce y resultado
1.222 códigos del PDF vs. 1.212 códigos no-nulos en `catalogo_productos`: **solo 14 faltaban**
(`CEP0102`, `LOG0101`, `PERK0104`, `INS001`, `PELI031`, `RAD0101`, `RAD0102`, `MATI07`, `MATI08`,
`1BPB10`, `BIESP01`, `BIESP02`, `BPB018`, `BPB04`). Dos correcciones a mano antes de insertar:
`MATI08` traía un número de costo pegado a la descripción por el mismo problema de columnas del
PDF ("MATIZADO DIBUJO CATALOGO -42.875,42"); se verificó que `PELI031` no chocaba con el `PELI31`
interno del Cotizador (universos de códigos distintos, coincidencia de nombre nada más).

**`MATI07` (Matizado Total) estaba entre los faltantes** — el mismo producto que SESSION_LOG
2026-09-11 identificó vendiéndose casi al costo (margen 1,11× en vez de 3,97×). No tenía código en
`catalogo_productos` hasta hoy.

`2026-09-14_agregar_codigos_faltantes_inventario.ts`: mismo criterio mínimo que `seed_catalogo.sql`
(solo `codigo`+`nombre`+`activo`), verificación explícita dentro de la transacción de que cada
código sigue sin existir antes de insertar (no confía en `ON CONFLICT`, por el drift de unicidad
documentado arriba). Bug propio corregido antes de correr: `WHERE codigo = ANY(:codigos)` con
Sequelize/replacements da error de sintaxis (expande el array a lista separada por comas, que
`ANY(...)` rechaza) — cambiado a `IN (:codigos)`, mismo problema y solución ya documentados en
`2026-09-12_mover_cotizador_a_schema.ts`.

`catalogo_productos`: 1.243 → 1.257, verificado.

### Efecto sobre el trabajo de la sesión anterior (mismo día)
Se volvió a correr `2026-09-14_cotizador_vinculo_catalogo_maestro.ts` (idempotente) para que el
backfill recogiera los códigos nuevos: **4 de los 181 huérfanos del Cotizador se resolvieron
solos** (`1BPB10`, `MATI07`, `MATI08`, `BPB04`) — 382 → 386 vinculados. El Excel de huérfanos se
regeneró a 177 filas. Como el usuario ya tenía el Excel de 181 abierto en Excel (archivo
bloqueado, `EBUSY` al intentar sobrescribirlo), se generó aparte como
`cotizador_codigos_huerfanos_2026-09-14_v2.xlsx` en vez de forzar el archivo abierto — el script
de exportación ganó un flag `--sufijo` para este caso.

### Pendiente
Igual que la entrada anterior — nada nuevo se resolvió del lado de Proveedores/multiplicadores en
esta pasada, solo del lado de identidad de catálogo.

---

## 2026-09-14 (4) — Proveedores: "No seguir precios" pasa a botón real, agrupado por proveedor

### Encargo
El usuario preguntó si el flujo que necesita está implementado: carga las facturas de **todos**
los emisores (incluidos papelería, combustible, seguros, que no son insumos del ERP) y quiere,
**desde Por Mapear**, apagar a un proveedor para que sus ítems no vuelvan a aparecer en cargas
futuras.

### Auditoría del flujo (antes de tocar nada)
Está implementado y es correcto, con **dos capas** independientes:
1. `bloqueaIngesta()` (`proveedor.controller.ts:2543`) se evalúa **antes** de agrupar las líneas
   de la factura: con `seguir_precios = false` el documento se registra en la bitácora con
   `motivo_omision='PROVEEDOR_NO_SEGUIDO'` y sus ítems ni se miran.
2. Un código en `DESCARTADO` no resucita nunca (`:2759-2762`), ni aunque se reactive al proveedor.

Al pulsar el control, `aplicarSeguimiento()` pone el proveedor en `false` **y** pasa sus códigos
`PENDIENTE` a `DESCARTADO` en la misma transacción. Verificado además que no hay fuga: **0
equivalencias activas** de proveedores ignorados o inactivos.

⚠️ **El mecanismo nunca se ha ejercitado en producción**: `factura_proveedor_procesada` no tiene
ni un registro con `motivo_omision='PROVEEDOR_NO_SEGUIDO'` (146 normales + 5 notas crédito). Los
8 proveedores ya ignorados aún no han vuelto a facturar. Correcto por lectura, no por evidencia.

### Hallazgos de datos (medidos contra Supabase)
- **1.009 de 1.018 proveedores en `seguir_precios = true`**, de los cuales 963 llegaron así desde
  la importación de World Office. Entre ellos ~29 no-insumo (papelerías, estaciones de servicio,
  aseguradoras, EPS, parqueaderos, Telefónica).
- **Solo 41 proveedores han facturado alguna vez**: el ruido por depurar está casi todo por venir.
- Se le propuso invertir el defecto a lista blanca (`NULL` + aprobación explícita) y **lo
  descartó**: cargar todos fue decisión suya, depura por lista negra reactiva.
- **Doc desactualizada**: `proveedor.model.ts:33-36` afirma que `NULL` impide entrar a la bandeja.
  Es falso desde el 2026-09-12 — `bloqueaIngesta()` solo corta con `activo != true` o
  `seguir_precios === false`. Manda el controlador. (No corregido en esta pasada.)
- Hueco conocido, no tocado: si el mismo emisor vuelve con **otro NIT o la razón social escrita
  distinto**, `resolverProveedor()` no lo reconoce, crea un registro nuevo con `NULL`, y `NULL` no
  bloquea. Explicaría un "ya lo había ignorado y volvió".

### El cambio (único archivo: `PorMapearTab.tsx`)
La causa real de la duda del usuario era de UI: el control existía pero era **texto plano de
11,5 px en gris claro** (`FONT.xs`, `#94a3b8`), sin borde ni fondo, repetido en cada fila. No lo
había visto nunca.

Se descartó ponerlo junto a "Vincular"/"Descartar": esos actúan sobre **un código** y éste sobre
**el proveedor entero**: vecinos y con el mismo aspecto, invitaban a un descarte masivo por error.

Elegido por el usuario: **agrupar las filas por proveedor**, con cabecera de grupo que lleva
identidad (nombre + NIT + conteo) y las acciones de proveedor como botones reales.

- **Agrupación en cliente** (`useMemo`), sin consultas nuevas ni egress: `listarPendientes` ya
  incluía el proveedor.
- **El orden del servidor se conserva**: cada grupo nace en la primera aparición de su proveedor,
  así que queda posicionado por su código mejor rankeado y el selector frecuencia/reciente/precio
  sigue significando lo mismo. Reordenar por nombre lo habría vaciado de sentido.
- **Checkbox de grupo**, integrado con el "Descartar seleccionados" ya existente.
- **Paginación honesta**: con la lista truncada (>200), el chip dice "5 aquí" y no "5 códigos",
  porque la acción descarta *todos* los del proveedor, no los visibles. El `confirm` no promete
  número.
- **Columna "Proveedor" eliminada** (su nombre vive en la cabecera): `minWidth` 900 → 720, se va
  el scroll horizontal en pantallas medianas.
- Colores con los tokens de `index.css`, como pide CLAUDE.md para este módulo.

### Verificación
`tsc --noEmit` 0 errores · `eslint` 0 warnings en el archivo · build CRA correcto (996 kB gzip,
sin cambio). **Sin verificación visual**: no hay navegador en el entorno; queda del lado del
usuario confirmar los 4 grupos reales (Vitelsa 5, Acvicol 4, Cielos y Ventanas 1, Ventanas y
Puertas 1).

### Fricción del entorno (nota para la próxima)
`npm run build` del frontend falló dos veces por memoria: la máquina tiene ~3,9 GB libres de 11,8
y el heap por defecto de Node 24 no cabe. Pasó con `NODE_OPTIONS=--max-old-space-size=3072`;
pedir 6144 lo empeora ("Committing semi space failed" = el SO no puede reservar, no que falte
heap). Además, `npm --prefix ... run build` desde PowerShell falla porque el script es POSIX
(`CI=false ... && cp`): hay que pasar `--script-shell=bash`.

### Pendiente
- Verificación visual del tab por el usuario.
- Probar el corte de ingesta de verdad (proveedor de prueba + XML DIAN), ya que nunca ha corrido.
- Decidir si se corrige el comentario obsoleto de `proveedor.model.ts:33-36`.

---

## 2026-09-15 — Dashboard: "Pedidos Facturados" pasa a medir abono, no monto de FE

### Reporte del usuario
KPI "Pedidos Facturados" (tarjeta + modal `facturadas_rango`) sumaba, según el usuario, el
`valor_total` de la ODP en vez del abono — ejemplo: ODP de 20M con abono de 5M, el KPI mostraba
20M.

### Diagnóstico
No era una suma ciega de `valor_total`: la query ya usaba `COALESCE(monto_factura_principal,
valor_total)` — `monto_factura_principal` es el monto real de la FE (por defecto el `valor_total`,
pero soporta facturación parcial). El comentario de `odp.model.ts:50` lo deja explícito:
*"Independiente de abono/pendiente (que son caja/cobros, no facturación)"*. El KPI medía devengo
(FE emitida), no caja — contablemente correcto, y ya existía una tarjeta separada ("Total
Recaudado") para el abono. No era un bug; era una definición distinta a la que el usuario
esperaba. Confirmado con el usuario: quiere que el KPI mida caja (abono), en todo el alcance
(tarjeta + los dos modos del modal), no solo el que motivó la duda.

### Cambio implementado
- **`utils/facturacion.ts`** — nueva función `sqlCobradoEnRango()`, hermana de
  `sqlFacturadoEnRango()` (que queda intacta: Informe Ejecutivo la sigue usando para su propio
  KPI de devengo, sin verse afectado por este cambio). Misma regla de reparto que
  `getPedidosFacturados`: FE principal aporta `o.abono`, FE adicional aporta `0` — evita
  triplicar el abono cuando principal + 2 adicionales caen en el mismo rango (el campo vive a
  nivel de ODP, no por FE).
- **`dashboard.controller.ts`**: `getGeneralData` — `facturado_con_factura`/`_oa` pasan de
  `ODP.sum('valor_total', …)` a `ODP.sum('abono', …)`; `facturado_rango`/`_oa` pasan a usar
  `sqlCobradoEnRango`. `getPedidosFacturados` — mismo criterio en ambos modos; el campo de
  respuesta se renombró `valor_total` → `monto_abonado` (dejarlo con el nombre viejo habría sido
  engañoso).
- **Frontend**: `PedidosFacturadosModal.tsx` (columna "Monto"→"Abonado", "Total facturado"→"Total
  cobrado", títulos/criterios de `MODO_CONFIG`) y `PanelGeneral.tsx` (tarjeta "Pedidos
  Facturados"→"Pedidos Cobrados", subtítulos). El resto del pipeline (% del ingresado, desglose
  Base/IVA) quedó igual — es la misma aproximación que ya usa "Total Recaudado" sobre el mismo
  campo `abono`.

### Casos borde documentados (no bloquean, quedan como comportamiento conocido)
- `abono` es saldo acumulado a hoy, no un monto fechado por pago: consultar un rango pasado
  muestra el abono *actual* de esas ODPs, no lo abonado específicamente en ese rango — mismo
  comportamiento que ya tenía "Total Recaudado".
- Si de una ODP solo la FE adicional cae en el rango (la principal quedó fuera), esa fila queda
  en $0 — consecuencia directa de la regla "abono a la principal".
- "Pedidos Cobrados" y "Total Recaudado" van a mostrar cifras parecidas pero no idénticas
  (filtros distintos: uno exige FE, el otro no) — quedan como tarjetas relacionadas, no
  redundantes.
- Cache de 30 min (`cacheRespuesta`) en estos endpoints: el número puede tardar en reflejar el
  cambio tras el deploy.

### Verificación
`npm run build` backend (tsc) y `tsc --noEmit` frontend, 0 errores. Sin verificación visual en
navegador (no hay entorno gráfico en esta sesión).

### Pendiente
- Verificación visual del usuario: abrir el dashboard, confirmar que "Pedidos Cobrados" y el
  modal muestran abono y no valor_total/monto de FE.

---

## 2026-09-15 (2) — Dashboard: verificación de "Pendiente" en Cartera Vencida (sin cambios de código)

### Reporte del usuario
Pidió confirmar que "Cartera Vencida" muestre el saldo restante del cliente, no el valor total
de la ODP — ejemplo: ODP de 10M con 2M abonados debe mostrar 8M, no 10M. Mismo patrón de duda
que motivó el cambio anterior de "Pedidos Facturados".

### Diagnóstico
`CarteraVencidaModal.tsx` ya consume `item.pendiente`, campo propio de la ODP (no `valor_total`)
que se recalcula en cada pago (`registrarPago`, `contabilidad.controller.ts`) como
`valor_total - abono - SUM(diferencia)`. A diferencia del caso anterior, acá el nombre del campo
ya coincidía con lo que se necesitaba mostrar.

Se encontró — y se descartó como explicación, por falta de evidencia del usuario — un gap
real pero no relacionado: el filtro de "vencida" (`getCarteraVencida`, `fecha_factura < umbral`)
solo mira la fecha de la FE **principal**, no las de `facturas_adicionales_odp` (a diferencia de
`whereTieneFacturaEnRango`, que sí las considera). Documentado para si aparece evidencia concreta
más adelante — no se tocó código sobre esto en esta sesión.

**Verificación contra datos reales** (script `2026-09-15_verificar_pendiente_cartera_vencida.ts`,
solo lectura, queda en el repo): sobre las 6 ODPs visibles en la captura del usuario, las 6
cuadran exacto contra `valor_total - abono - diferencia`. ODP-24000 parecía no cuadrar contra
`valor_total - abono` a secas ($146.204.610 vs pendiente real $143.490.633), pero la diferencia
exacta ($2.713.977) es la suma de `pagos.diferencia` de esa ODP (descuento que reduce el
pendiente sin contar como abono) — con ese término, cuadra exacto.

### Conclusión
No era un bug. El campo `pendiente` ya refleja el saldo restante real en el 100% de la muestra
verificada contra la BD. Sin cambios de código — solo el script de verificación queda en
`backend-api/src/scripts/`.

---

## 2026-09-15 (3) — Pedidos PV: KPIs reformados (vencidos, daño sin reponer, desglose por proveedor) y fix de m² Vendidos

### Reporte del usuario
Tres pedidos encadenados sobre la pantalla "Pedidos PV" (`/pedidos-pv`, tab Gestión PV):
1. El KPI "Con Retraso" debía sustituirse por pedidos vencidos según `fecha_entrega_prometida`
   (hora Bogotá) que aún no han llegado, con modal al hacer clic.
2. "Total Pedidos" y "m² Vendidos" debían mostrar un desglose por proveedor con filtro de fecha;
   "Verificados" debía mostrar los pedidos con daño sin reposición.
3. Al explicar el KPI "m² Vendidos", el usuario notó que la tabla sí mostraba m² en filas donde
   yo había dicho que el dato estaba vacío — llevó a encontrar un bug real de fondo.

### Cambio 1 — "Con Retraso" → "Vencidos sin Llegar"
`dias_diferencia` (KPI viejo) solo se calcula al `registrarLlegada`: medía pedidos que **ya
llegaron** tarde, no vencimiento activo. Se mantuvo intacto (sigue pintando de rojo filas y
alimentando el toggle "Mostrar solo retrasos" — concepto correcto y ya usado en otros 3 lugares
de la pantalla) y se agregó uno nuevo e independiente: `condicionVencidoSinLlegar()` en
`pedido_pv.controller.ts` — `fecha_llegada_real IS NULL AND fecha_entrega_prometida < hoyBogotaISO()`
(reutiliza `hoyBogotaISO()` de `utils/crmSupervision.ts`, UTC-5 fijo). Filtro nuevo
`vencido_sin_llegar` en `construirWherePedidosPV`/`getPedidosPV`. KPI clicable → modal con la
lista (ODP clicable a `ODPFichaModal`, días vencido calculado en frontend con el mismo criterio
Bogotá, solo para mostrar).

### Cambio 2 — "Verificados" → "Con Daño Sin Reponer" + desglose por proveedor
- `getPedidosPVKpis`: `verificados` (estado `VERIFICADO`) reemplazado por `conDanoSinReponer`
  (estado `PROBLEMA` — un pedido sale de ese estado apenas se completa la reposición, así que el
  estado solo ya es "tuvo daño y sigue sin resolver"). Se perdió la métrica de verificados a
  propósito, decisión del usuario tras comparar alternativas.
- Nuevo endpoint `GET /api/pedidos-pv/kpis/por-proveedor` (`GROUP BY proveedor`, rango opcional
  sobre `fecha_envio` — DATEONLY, comparación directa sin `::date`). "Total Pedidos" y "m²
  Vendidos" ahora son clicables y abren el mismo modal (date pickers Desde/Hasta + tabla
  Proveedor/Pedidos/m², fila de totales). Elegido `fecha_envio` sobre `creado_en` a pedido
  explícito del usuario, pese a que dejaba fuera del rango a los pedidos aún `PENDIENTE` (nota
  visible en el modal).
- "En Tránsito" recoloreado de naranja a azul para no repetir el naranja de la tarjeta nueva.

### Cambio 3 — m² Vendidos sumaba el campo equivocado
La columna "m²" de la tabla usa `calcM2Pedido` (frontend): si el pedido tiene ítems asignados,
calcula el metraje real de sus medidas (`ancho_mm × alto_mm × cantidad`); si no tiene ítems, cae
al campo manual `metraje_venta`. El KPI (y el desglose por proveedor recién agregado) sumaban
`SUM(metraje_venta)` a secas — ignoraban por completo el metraje calculado, que es la fuente real
para la mayoría de los pedidos (los que ya tienen ítems). Se agregó `M2_PEDIDO_SQL` en
`pedido_pv.controller.ts`, misma fórmula que `calcM2Pedido` traducida a SQL (subquery
correlacionada por pedido; `cantidad` usa el mismo fallback a 1 —no a 0— que el frontend cuando
viene NULL o en 0), y se reemplazó el `SUM` en ambos endpoints.

**Verificado contra Supabase (solo lectura, scripts descartados tras la corrida):** el m² real
salta de 14.90 a **1.661,73** (Vitelsa 1.591,28 sobre 351 pedidos, Templacol 70,46 sobre 18) — el
dato manual casi nunca se llenaba, así que el KPI venía subestimando el metraje vendido casi por
completo desde siempre, no fue una regresión de esta sesión.

### Casos borde documentados
- Pedidos `PROBLEMA` en reposición con `fecha_reposicion_prometida` vencida **no** cuentan como
  "vencidos sin llegar" (el vidrio original sí llegó) ni el KPI actual los alerta por esa fecha —
  decisión explícita: si hace falta, es un KPI aparte a futuro.
- El desglose por proveedor excluye pedidos aún sin `fecha_envio` en cuanto se aplica un rango.

### Verificación
`npm run build` backend (tsc) y `tsc --noEmit` frontend, 0 errores en ambos, en cada uno de los 3
cambios. Query de `getPedidosPVPorProveedor` y de `M2_PEDIDO_SQL` corridas en vivo contra Supabase
antes de dar el fix por cerrado (scripts temporales en `src/scripts/`, borrados tras la corrida —
no quedaron en el repo).

### Pendiente
- Verificación visual del usuario en navegador: los 3 modales nuevos y el salto del número de
  "m² Vendidos" (para que no lo lea como un dato raro al verlo el lunes).

---

## 2026-09-16 — ODP-24202, catálogo del Cotizador (Fase 2 completa), fix Estado Caja, CRM

Sesión con varios pedidos encadenados, sin relación entre sí salvo el catálogo maestro común.

### ODP-24202 — corrección de valor_total y monto de la FE 7469
El total quedó cargado en 67.877.368 (casi el doble del real) y debía quedar en 33.938.683 con
IVA; la FE 7469 estaba facturada por el total completo y debía quedar por 25.000.000 — justo el
abono ya registrado (Pago #471, anticipo Bancolombia 16/jul/2026), sin registrar un pago nuevo.
Aplicado en dos pasos por el guard de `odp.controller.ts` (~L954, no deja bajar `valor_total` por
debajo de lo ya facturado): primero se bajó `monto_factura_principal` a 25.000.000, después
`valor_total` a 33.938.683, recalculando `pendiente`/`estado_caja` con la misma fórmula de
`updateODP`. Script: `2026-09-16_odp24202_corregir_monto_fe.ts`. Verificado en `auditoria_log`
(2 UPDATE, usuario_id=30 ROOT).

### Cotizador — Fase 2 de homologación de códigos huérfanos, completa
Continuación de la Fase 1 (2026-09-14, ver esa entrada): el usuario devolvió el Excel de
reconciliación (`cotizador_codigos_huerfanos_2026-09-14.xlsx`, Descargas) con la columna
`codigo_homologo` llena para gran parte de los 181 huérfanos — la columna `accion` (dropdown)
quedó casi toda en blanco, así que la señal real terminó siendo "codigo_homologo no vacío", no
`accion`. Trabajo iterativo con el usuario (capturas del sistema real de inventario/contable)
para resolver ambigüedades:

- **12 códigos nuevos dados de alta en `catalogo_productos`** (confirmados contra el sistema real
  antes de crearlos, no adivinados): `BPB05`, `DIAMBPB`, `BOQN02`, `PERF01`, `PERF03`, `PERF04`,
  `BOQE01`, `BOQE03`, `1BPB07` (BPB REDONDO DIAMETRO — distinto del código junk homónimo que quedó
  huérfano, ver abajo), `MATI09`, `PERF02`. Scripts `2026-09-16_alta_catalogo_*.ts`.
- **Correcciones de datos cruzados/typo en el Excel**: `BOQN03`→`BOQE03` (decía `BOQE01` por
  error, eran productos distintos: interno vs perimetral), `MATI08`→`MATI07` ("MATIZADO RAYA" no
  tiene equivalente real, el usuario confirmó que se sustituye por MATI07 total), `MATI09`→`MATI09`
  (self, antes cruzado con MATI08), `RDU0102`→`RSDCF02` (es un rodamiento/accesorio, no el riel
  RDU0101 con el que se confundía).
- **Aplicación** (`2026-09-16_cotizador_aplicar_homologacion.ts`, idempotente — solo toca filas con
  `catalogo_producto_id IS NULL`): de 181 huérfanos originales, **116 quedaron vinculados** en
  total entre esta sesión y la anterior (382→498 de 563 productos del Cotizador).
- **65 huérfanos cerrados como IGNORAR, decisión explícita del usuario, no pendiente sin resolver**:
  36 son colores de perfiles reales que hoy no se manejan con esos códigos (familias DIV/ADA/CAB/
  JAM/SIL/HOR/TRA/ENG/PEP, ya parcialmente homologadas en otros colores); 18 son 3 productos
  (`PRVS234`/Toallero, `PRVT99`/Tubular, `PRVVP010`/Marco) que el usuario confirmó que no existen
  en el sistema; 5 son los "Kit Aluminio" `K1000`...`K2000` (cálculo interno, no código de compra
  — documentado en `TECH_DEBT.md` 2026-09-16); 2 (`BAR1101`, `CHT1001`) y 1 vidrio (`CL6MM03LM`) no
  existen; 3 (`1BPB07`, `1PERF01`, `1BOQN02`) son basura confirmada — su propia descripción en
  `cotizador.producto` dice literalmente "CODIGO NO EXISTE".
- Estado final: **498 vinculados / 65 huérfanos** (de 563 productos totales del Cotizador).

### Contabilidad — fix Estado Caja: ODP con saldo pendiente invisible a la búsqueda
Reporte del usuario: buscar ODP-23859 en el tab Estado Caja no la mostraba pese a tener
`pendiente=1.498.838`. Causa: `ContabilidadPage.tsx` pide `/api/contabilidad/odps?limit=500` una
sola vez y busca/filtra en el navegador — no hay búsqueda server-side. `getContabilidadODPs`
ordenaba por `fecha_creacion DESC` sin más, así que una ODP vieja con saldo abierto podía quedar
fuera del corte de 500 (esta cayó en el puesto 529 de 542) y desaparecer de toda búsqueda sin
importar el saldo real. De 542 ODP, solo 78 no están `CANCELADO`; de esas, únicamente esta caía
fuera del límite. Fix: orden cambiado a "no CANCELADO primero, luego fecha_creacion DESC" en
`contabilidad.controller.ts` — garantiza que ninguna ODP con saldo abierto quede nunca fuera del
listado, sin cambiar el contrato del endpoint (único consumidor verificado). Confirmado en vivo:
ODP-23859 pasó de la posición 529/542 a la 78/542.

### CRM — vincular lead aprobado a ODP existente
Lead 2110 ("GRUPO INTEGRA JS . S,A,S. ALEX PEDROSO", aprobado el mismo día) vinculado a
ODP-24304 (mismo cliente, GRUPO INTEGRA J.S S.A.S id 1688) replicando la lógica de
`vincularODPAlLead` (`crm.controller.ts`): `lead.odp_id` + `LeadEvento` tipo SEGUIMIENTO.

### Commit
`8b76cf2` — pusheado a `origin/main` a pedido del usuario, incluye el fix de Contabilidad y los
scripts one-off de esta sesión (más uno pendiente de la sesión anterior, `2026-09-15_odp24202_
cambiar_cliente.ts`, y otro sin ejecutar, `fix_pv_7099_revertir_llegada_2026-09-14.ts`). Los
cambios de catálogo/homologación posteriores al commit (12 altas + 4 homologaciones + TECH_DEBT.md)
quedaron sin subir — solo tocan BD y un `.md`, no hay script nuevo que commitear salvo `TECH_DEBT.md`.

### Pendiente
- `TECH_DEBT.md` con la entrada de los kits K1000-K2000 sigue sin commitear.
- Revisión general de qué más falta en el Cotizador, pedida por el usuario al cierre — ver próxima
  entrada de esta bitácora si se llega a ejecutar en la misma sesión.

---

## 2026-09-16 (2) — Cotizador: calibración (capa de escritura), hueco de colores, y pestaña Configuración

Continuación de la misma jornada, después del commit `8b76cf2`. Tres bloques encadenados: se cerró
la deuda de calibración, apareció un hueco de colores al probar una cotización real, y de ahí salió
la necesidad de volver configurable el motor de precios.

### Calibración — capa de escritura completa (cierra `TECH_DEBT.md` 2026-09-13)

El módulo existía a medias: tablas, matemática (`cotizador/lib/calibracion.ts`) y getters de
lectura, pero **sin ninguna forma de escribir** — así, todos los sistemas quedaban atrapados en
`EN_CALIBRACION` y ninguna cotización con diseño podía emitir orden de corte.

Antes de codificar se socializó el alcance con el usuario, que definió: por ahora solo `root`/`admin`
(a futuro asesores, compras y producción), formulario suelto (no wizard), todos los sistemas a la
vez, y las tres capas juntas.

- **Backend** `cotizador_calibracion.controller.ts` (nuevo) — 13 endpoints: inventario de sistemas,
  piezas por sistema, análisis de pieza, registrar/anular contraste, aprobar/anular margen, fijar y
  retirar holgura, cambiar estado del sistema, firma del maestro e historial. Todo en transacción y
  bajo el `requireRole('root','admin')` que ya gobierna el router.
- **Patrón respetado**: commit → `cache.recargar('calibracion')` → responder, en ese orden (el mismo
  que `editarPrecio`). Al revés, la caché se recarga desde una transacción que todavía puede fallar.
- **Matiz importante**: `EN_PRODUCCION` nunca se escribe a mano. "Reanudar" un sistema congelado
  escribe `'VALIDADO'` como centinela de no-congelado, porque `madurezDeSistema` solo trata de forma
  especial la cadena exacta `'EN_CALIBRACION'` — cualquier otro valor deja que la madurez la calcule
  la evidencia, que es el comportamiento buscado.
- **Frontend** `TabCalibracion.tsx` (nuevo, 4ª pestaña) con sub-navegación Sistemas / Holguras /
  Historial.
- **Bug real encontrado en verificación con navegador** (Playwright, instalado en esta sesión a
  pedido del usuario): registrar un contraste cerraba el panel de la pieza, porque `cargarPiezas`
  hacía `setPiezaSel(null)` y se la llamaba también al refrescar. El reset se movió a
  `seleccionarSistema`, que es donde la selección sí deja de tener sentido.

### Hueco de colores — el motor cobraba mate cuando pedías negro

Probando una cotización real, el usuario reportó: "en 5020 no existe ninguna referencia negra". El
aviso venía hardcodeado en `ventanas.ts` y **era falso**: los códigos negros sí existen en
`catalogo_productos` y con precio de proveedor activo. La cadena estaba rota en dos eslabones
distintos —faltaba la clave de color en `codigos_por_color` y faltaba el producto en
`cotizador.producto`— y el motor, al no encontrar el color, sustituía por mate **en silencio**.
Como el negro cuesta entre 20 % y 69 % más que el mate, cada una de esas cotizaciones salía por
debajo del costo.

Se revisaron los 13 sistemas, no solo el 5020: 184 combinaciones (sistema, ref, color) sin mapear.

- **22 combinaciones / 16 códigos únicos** tenían candidato único en catálogo **y** precio real de
  proveedor → dadas de alta (`2026-09-16_cotizador_altas_color_faltante.ts`, 343 filas de
  `diseno_perfil`). Método de precio confirmado por el usuario: heredar categoría, unidad y
  multiplicador PA/PM/PB del "hermano" (el mismo perfil en otro color, ya con costo real).
- **16 códigos más** (Sistema3831 y Sistema8025) existían en catálogo pero nunca tuvieron fila en
  `proveedor_producto`, ni siquiera en el histórico del WO exportado. El usuario dio precio inicial
  para cada uno; se cargaron como proveedor VENTANAS Y PUERTAS S.A.S (id 829), unidad `TIRA_6M`,
  origen `MANUAL` (`2026-09-16_alta_16_codigos_precio_manual.ts`, 291 filas de `diseno_perfil`). Se
  creó la fila real en `proveedor_producto` **a propósito**: el día que Compras cargue la factura de
  verdad, la ingesta la encuentra por `(proveedor_id, catalogo_producto_id, unidad_compra)` y la
  actualiza sola, sin duplicar.
- **58 sin precio**: no se crearon — decisión explícita del usuario, esperar el Excel. Crear el
  producto sin precio sería cobrar $0 en silencio, que es exactamente lo que este módulo no debe
  hacer (AUSENTE ≠ CERO).
- **104 sin código en catálogo**: exportadas a Excel en Descargas para que el usuario decida. Sin
  acción en código.
- Corregido el texto de `ventanas.ts` para que diga lo que es cierto hoy: 7038 casi completo,
  5020/5020Reforzado mayormente cubiertos, 744/8025/3831 parciales.

**Dato útil derivado:** PERFILERIA usa exactamente dos multiplicadores (1,561841 en 205 productos y
1,514500 en 126), con dispersión cero. Los 38 productos nuevos heredaron el de su hermano exacto.

### Pestaña Configuración — el motor de precios deja de estar hardcodeado

A pedido del usuario ("ese motor me gustaría que fuera configurable… así como configurar allí el
costo de mano de obra, acarreo, etc.").

- **Backend** `cotizador_multiplicadores.controller.ts` (nuevo): `GET /multiplicadores`,
  `PUT /multiplicadores/:categoria`, `POST /multiplicadores/:categoria/recalcular` (con `dry_run`).
  El listado **deriva las categorías de `cotizador.producto`**, no de una lista fija, y devuelve
  `configurado: boolean` en vez de fingir ceros para las que no tienen fila — de nuevo AUSENTE ≠
  CERO: un multiplicador en cero pondría todos los precios en cero. Valida PA ≥ PM ≥ PB,
  multiplicador ≥ 1, motivo obligatorio y que la categoría exista de verdad en el catálogo.
- **Frontend** `TabConfiguracion.tsx` (nuevo, 5ª pestaña): tabla de multiplicadores por categoría
  con previsualización antes de aplicar, y formulario de parámetros de negocio (AIU, IVA, flete
  fijo, alquiler de andamio, huacal y las 6 tarifas de mano de obra).
- **Bug peligroso introducido y corregido en la misma pasada — vale la pena recordarlo.** El texto
  de ayuda del campo AIU decía "fracción: 0.04 = 4 %". Es falso: `motorCalculo.ts:185` **divide**
  por ese número (`subtotal / aiu`), así que el 4 % se escribe `0.96`. Escribir `0.04` creyendo que
  era el porcentaje **multiplicaba el total por 25**. El primer guard del backend (`<= 0 || > 1`)
  dejaba pasar `0.04` sin problema, y durante la prueba llegó a guardarse en la BD unos segundos
  (queda en el historial de parámetros; el valor final verificado es el correcto, 0,96). El piso
  quedó en **0,5** —equivalente a +100 % de margen— en frontend y backend: el rango peligroso no es
  solo el cero, es todo lo que esté por debajo de un margen plausible. Los 4 casos peligrosos se
  verificaron rechazados.
- Verificación con navegador real: pantalla carga, validaciones avisan, previsualización funciona,
  cero errores de consola y de red.

### Pendiente
- **El recálculo de PERFILERIA no termina a tiempo** (81 s medidos en ACCESORIO, ~142 s proyectados
  en PERFILERIA, contra un límite de 100 s si el backend está tras el proxy de Cloudflare). Causa,
  medición y plan de arreglo en `TECH_DEBT.md` 2026-09-16 (2). Es lo próximo a atacar.
- Previsualización de ACCESORIO con caídas fuertes (`TSL0101` −73 %) sin revisar: podría ser otro
  desajuste tira/metro. **No se aplicó ningún recálculo.**
- Los 58 códigos sin precio, a la espera del Excel del usuario. Las 104 combinaciones sin código en
  catálogo, a la espera de su decisión.
- PERFILERIA, VIDRIO y ACABADO siguen sin multiplicador sembrado — ahora configurable desde la UI,
  pero nadie lo fijó todavía. Mientras tanto la sincronización automática solo mueve ACCESORIO
  (`TECH_DEBT.md` 2026-09-14).

---

## 2026-09-17 — Cotizador: el recálculo por categoría deja de ser N+1 (96,7 s → 0,46 s)

### Contexto

Sesión arrancada levantando los servicios en local. Sobre el pendiente que había quedado marcado
como "lo próximo a atacar" en la sesión anterior, el usuario pidió primero una explicación de qué
era el recálculo y planteó una duda de arquitectura que vale la pena dejar registrada:

> "si el cotizador tiene su propio catálogo creo que es doble esfuerzo, se puede usar el id del
> catalogo_productos del producto que corresponde"

**Respuesta, con números de la BD del día:** eso ya está hecho desde el 2026-09-14 —
`cotizador.producto.catalogo_producto_id`—, y hoy **530 de 595 productos del Cotizador ya son el
mismo producto que el del maestro, por id**: PERFILERIA 304/363, ACCESORIO 172/175, VIDRIO 39/40,
ACABADO 15/17. Las 530 filas apuntan a 516 ids distintos (un producto del maestro puede alimentar
más de una fila del Cotizador).

Lo que sigue separado —y debe seguirlo— son tres preguntas distintas: identidad
(`catalogo_productos`), costo de compra (`proveedor_producto`) y precio de venta en tres niveles
(`cotizador.producto`). Fundirlas rompería tres cosas concretas: hay filas del Cotizador que no son
productos comprables (los 5 Kit Aluminio son un cálculo, ver `TECH_DEBT.md` 2026-09-16), un id del
maestro puede alimentar varias filas, y el costo de compra es información restringida a
`root`/`admin` mientras el maestro lo lee medio sistema.

**Dato que sí conviene retener:** de 1.271 productos del maestro **solo 192 tienen precio de
proveedor activo**. El cuello de botella nunca fue el catálogo doble, es el precio. Queda anotada
una redundancia real y sin medir: `cotizador.producto` todavía repite `descripcion`, `categoria` y
`unidad` del maestro, y nadie ha verificado si ya divergieron.

### Cambio realizado — `cotizador/lib/sincronizacionProveedores.ts`

Pasos 1 y 2 de `TECH_DEBT.md` 2026-09-16 (2); el paso 3 (job asíncrono) no hizo falta y no se hizo.

- **Nuevo motor `recalcularCostosDesdeProveedor(ids[])`**: 3 lecturas fijas —productos, candidatos
  de proveedor y multiplicadores— sin importar cuántos ids entren. El `findByPk` del multiplicador
  salió del bucle de productos, donde releía siempre la misma fila (~304 viajes en PERFILERIA).
- **Una sola transacción de escritura, dos sentencias**: `UPDATE ... FROM unnest()` de 5 arrays
  paralelos (Sequelize no sabe actualizar N filas con N valores distintos en una sentencia) más un
  `bulkCreate` del histórico. Antes eran ~2N viajes, una transacción por producto.
- **`recalcularCostoDesdeProveedor(id)` queda como envoltorio delgado**, contrato original intacto
  (`null` si el id no tiene productos vinculados), para no alterar a sus dos consumidores ya
  probados: la cola de sincronización y el script one-off del 2026-09-14.
- **La cola conserva su bucle por id a propósito** — aísla el fallo de un id para que no tumbe al
  resto del lote, que era el diseño original.
- `cotizador_multiplicadores.controller.ts` ahora llama al batch **una vez** con todos los ids de
  la categoría.

### Verificación — A/B contra el algoritmo anterior

Se reimplementó la lógica vieja en un script temporal y se compararon **los códigos y los valores
calculados**, no solo los totales:

| Categoría | ids | Antes | Ahora | Aceleración | Resultado |
|---|---|---|---|---|---|
| ACCESORIO | 169 | 51,5 s | 0,46 s | 112× | IDÉNTICOS — mismos 48 códigos, mismos valores |
| PERFILERIA | 296 | **96,7 s** | 0,46 s | 208× | IDÉNTICOS — 0 cambios, 305 omitidos |

- El tiempo real de PERFILERIA (96,7 s) salió **por debajo de los ~142 s proyectados pero igual de
  pegado al corte de 100 s de Cloudflare**: el riesgo era cierto, con menos margen del que parecía.
- ACCESORIO muestra 48 cambios y el 2026-09-16 se habían medido 45. **No es regresión**: el
  algoritmo viejo también dice 48 hoy. Es dato que cambió en el medio.
- La sentencia `UPDATE ... unnest` se ejecutó de verdad contra la BD dentro de una transacción
  revertida, con valores idénticos a los actuales: 3 filas afectadas, rollback, nada escrito.
- `npm --prefix backend-api run build` limpio. Nodemon recargó sin errores.

### Decisiones de comportamiento, ambas deliberadas

1. **`dryRun` ya no abre transacción.** Antes escribía y hacía rollback —4 viajes por producto para
   descartarlo todo—; ahora la previsualización sale entera del cálculo en memoria. Se pierde la
   validación incidental de que el UPDATE fuera aceptable, por eso se verificó aparte.
2. **La corrida de una categoría entera va en una sola transacción: todo o nada.** Para una acción
   masiva y explícita es la semántica segura, y es exactamente lo que faltaba frente al 524 de
   Cloudflare, donde el corte llegaba después de escrituras ya confirmadas.

### Pendiente

- **El rendimiento ya no bloquea a PERFILERIA; el multiplicador sí.** La categoría no tiene fila en
  `cotizador.multiplicador_categoria`, así que el endpoint corta con 400 antes del bucle. El
  usuario quedó en conseguir los multiplicadores de PERFILERIA, VIDRIO y ACCESORIO.
- Al recibirlos, **verificar primero la correspondencia tira/metro** en `dry_run` antes de aplicar:
  si el Cotizador piensa en tiras y el proveedor en metros, el multiplicador sale bien y el precio
  igual queda 6× corrido (`TECH_DEBT.md` 2026-09-14). Es la sospecha sobre las caídas de ACCESORIO
  (`TSL0101` −73 %), todavía sin revisar.
- **ACCESORIO ya tiene multiplicador verificado** (×1,550628/×1,440712/×1,330796): si el usuario
  pasa uno nuevo, se pisa el actual y 172 productos quedan expuestos a recálculo.
- **ACABADO** (17 productos, 15 vinculados) no estaba en la lista del usuario y sigue invisible
  para la sincronización automática.
- `npm run lint` no corre: ESLint 10 ya no encuentra configuración (`.eslintrc.*` sin migrar a
  `eslint.config.js`). No se tocó — la verificación siguió siendo `tsc` + pruebas dirigidas.

---

## 2026-09-17 (2) — Cotizador: multiplicadores sembrados, 3 unidades corregidas y 113 precios recalculados

### Insumo del usuario y qué resultó ser

El usuario aportó la tabla de multiplicadores costo→precio de venta por categoría (PA/PM/PB), a 3
decimales. Antes de sembrarla se contrastó contra los datos ya cargados con el mismo método con que
se verificó ACCESORIO el 2026-09-14 (`precio_pa / costo_unitario` sobre productos reales). **La
tabla resultó ser el valor observado, redondeado.** Se sembraron los 6 decimales reales:

| Categoría | Aportado | Sembrado (observado) | Cobertura |
|---|---|---|---|
| ACABADO | 1,534 / 1,412 / 1,290 | 1,534301 / 1,412297 / 1,290293 | 12 de 14 |
| VIDRIO | 1,673 / 1,587 / 1,500 | 1,672800 / 1,586582 / 1,500364 | 35 de 37 |
| ACCESORIO | 1,551 / 1,441 / 1,331 | 1,550628 / 1,440712 / 1,330796 | 166 de 169 (ya existía) |
| PERFILERIA | 1,562 / 1,474 / 1,386 | 1,561841 / 1,474123 / 1,386405 | 221 de 363 |

Decisión del usuario: usar los 6 decimales. **Efecto medido:** con 3 decimales cambiaban 125
productos; con 6, sólo 113 — los otros 12 ya estaban en el precio correcto y no se tocaron. Con 3
decimales, los 49 productos costeables de ACCESORIO habrían cambiado de precio (hasta $200,72) por
puro ruido de redondeo.

Las cuatro categorías comparten una estructura que confirma que no son números sueltos: **PM es el
punto medio exacto entre PA y PB** (paso de 0,122 / 0,086 / 0,110 / 0,088 respectivamente).

### El `TSL0101 −73 %` que quedó sin explicar el 2026-09-16: era una unidad mal registrada

No era un precio que bajó. El proveedor ACVICOL describe el producto como *"Inox Manija redonda
48mm x 57mm pasante importado"* y la fila tenía `unidad_compra = TIRA_6M`. Como el motor divide
entre 6 cuando ve esa unidad, sacaba $5.282 en vez de $31.690. **Corregida la unidad, el producto
sube +64,7 %, no baja 73 %** — el signo estaba invertido.

Buscando el mismo patrón aparecieron 7 productos con la unidad del Cotizador y la del proveedor en
desacuerdo, más uno detectado por otra vía (ratio ≈6 entre costo viejo y nuevo). Son cuatro
problemas distintos, no uno:

**Corregidos** (`proveedor_producto.unidad_compra`, evidencia en la descripción del propio proveedor):
- `TSL0101` TIRA_6M → UNIDAD. Costo 19.244 → 31.690.
- `ZSE0104` METRO → TIRA_6M. El proveedor cobraba $91.680,67 "por metro", pero ÷6 = 15.280 ≈ el
  costo actual: era una tira puesta como metro. Sin esto, el PA saltaba a $143.205; con la
  corrección quedó en $23.865 (−6,4 %).
- `BPB04` M2 → METRO. **Ojo: esta corrección no cambia el costo** — el motor sólo divide para
  TIRA_6M, y METRO y M2 pasan igual. Es higiene del dato; su +100 % es una diferencia de precio
  real, todavía sin explicar.

**Excluidos del recálculo** (ver `TECH_DEBT.md` 2026-09-17): `TEN0101` (tensor por unidad vs varilla
roscada por metro: falta el factor de consumo, es lista de materiales) y `BOQN03` (el Cotizador, el
maestro y el proveedor nombran tres productos distintos; no está claro qué lado está mal, así que
no se tocó ninguno).

**Ruido sin impacto:** `PERF01` (el Cotizador lo tiene "X METRO" siendo una perforación por unidad,
pero el precio coincide exacto en ambos lados) y `EMP1301` (+5,3 %, los números cuadran).

### Ejecución — `2026-09-17_cotizador_multiplicadores_y_unidades.ts`

Script idempotente con `--dry-run`, `--sin-recalculo` y `--revertir`. Tres pasos: corregir
unidades, sembrar multiplicadores, recalcular.

**Detalle de diseño que vale recordar:** el `--dry-run` puro **miente** en este script, porque el
paso 3 depende de que los pasos 1 y 2 estén aplicados: sin fila de multiplicador el motor omite
todo, y sin la unidad corregida sigue calculando mal. La primera corrida en seco informó 0 cambios
para ACABADO, VIDRIO y PERFILERIA y mantenía el `TSL0101 −72,6 %`. Por eso se agregó
`--sin-recalculo`: aplica 1 y 2 (que por diseño no mueven ningún precio) y deja el 3 para una
corrida aparte, donde el `--dry-run` ya previsualiza la verdad. Secuencia real usada:
`--sin-recalculo` → `--dry-run` → aplicar.

**Resultado:** 113 precios actualizados (ACABADO 2, VIDRIO 7, ACCESORIO 47, PERFILERIA 57), 113
líneas en `cotizador.precio_historial`, toda la corrida en **2,2 s** gracias al batch de la sesión
anterior. Verificado contra la BD: los 4 multiplicadores sembrados, las 3 unidades corregidas, los
2 excluidos intactos, y el multiplicador real por categoría consistente en todos los recalculados.

**Tropiezo de entorno:** el `--dry-run` falló con `EMAXCONNSESSION` (tope de 15 conexiones del
pooler de Supabase en modo sesión). Causa: nodemon había reiniciado el backend varias veces al ir
creando scripts en `src/scripts/`, dejando conexiones tomadas. Se bajó el backend —el `npm` muere
pero el hijo `ts-node` sobrevive y hay que matarlo por PID— se corrió la migración y se volvió a
levantar.

### Pendientes que deja

- **116 productos de PERFILERIA siguen en el multiplicador viejo (1,514500)** porque no tienen
  proveedor con precio: el recálculo no los alcanza. La unificación que pidió el usuario sólo pudo
  aplicarse a los 10 que sí eran costeables. Se resolverán solos cuando Compras cargue su factura.
- **`ROD8025` +502,3 % y `TZO0301` +405,8 %** se aplicaron sin explicación. Las unidades coinciden
  en ambos lados (UNIDAD), así que el motor hizo lo correcto; la duda es si el precio del proveedor
  está bien. `ROD8025` tiene un factor de 6,02 exacto entre costo viejo y nuevo, que huele a
  paquete de 6. El `antes` de cada uno está en el histórico.
- **`BPB04` +100 %** y **`EMP1304` +31,6 %**: diferencias de precio reales, sin revisar.
- `TEN0101` y `BOQN03` pueden ser movidos por el sync automático en la próxima factura: la
  exclusión fue sólo de esta corrida.

---

## 2026-09-17 (3) — Cotizador: el motor elegía la modalidad de compra cara, y los productos sin proveedor no podían realinearse

### Dos planteos del usuario, los dos correctos

**1. "Los productos de perfilería que siguen el multiplicador viejo, pero tienen un precio
predeterminado, deberían regirse al multiplicador de su categoría."** Cierto, y no había forma de
hacerlo: el único camino existente (`recalcularCostosDesdeProveedor`) deriva el costo del
proveedor, así que un producto con costo cargado pero sin proveedor quedaba con el multiplicador
del día que entró. Medido: **120 productos con costo > 0 tenían el PA fuera del multiplicador de su
categoría** — PERFILERIA 116 (54 sin vínculo a catálogo, 62 vinculados pero sin proveedor
costeable), ACABADO 2, VIDRIO 1, ACCESORIO 1.

**2. "En perfilería el módulo Proveedores maneja precio por metro y por perfil; el Cotizador solo
debe tomar el precio de perfil, y con varios proveedores el más barato."** Esto no era una
preferencia: **era un error de cálculo.** El motor ordenaba los candidatos por el `precio_actual`
crudo, y un precio por metro es numéricamente menor que uno por tira, así que elegía siempre la
modalidad **cara**. Los 4 productos que tienen ambas modalidades cargadas lo muestran con una
regularidad que no es casualidad:

| Código | Perfil (6 m) | ÷6 | Por metro | Sobrecosto del metro |
|---|---|---|---|---|
| `CAB0306` | 71.596,64 | 11.932,77 | 15.546,22 | +30,3 % |
| `ENG0304` | 84.621,85 | 14.103,64 | 18.403,36 | +30,5 % |
| `JAM0306` | 70.924,37 | 11.820,73 | 15.462,18 | +30,8 % |
| `TRA0306` | 80.084,03 | 13.347,34 | 17.394,96 | +30,3 % |

Comprar la tira completa sale ~30 % más barato por metro, que es como se compra en la práctica.
**Consecuencia directa: los `+30,3 %` que el recálculo de la sesión (2) aplicó a `CAB0306`,
`ENG0304` y `TRA0306` estaban mal** — no era un ajuste de precio, era el motor tomando la modalidad
equivocada.

### Cambios

**`cotizador/lib/sincronizacionProveedores.ts`**
- **Los candidatos se comparan por `costoNormalizado`, nunca por precio crudo.** La tira se divide
  entre `metros_por_unidad` *antes* de comparar. Comparar precios de modalidades distintas por su
  número crudo es comparar cosas distintas.
- **`MODALIDAD_PREFERIDA`**: `{ PERFILERIA: ['TIRA_6M'] }`. Si el producto tiene filas en la
  modalidad preferida, sólo esas compiten; **si no tiene ninguna, se cae a las demás** en vez de
  quedarse sin costo — 14 perfiles reales (`5020 CABEZAL 144 NEGRO`, `744 SILLAR 387 CRUDO`,
  `3831 JAMBA 174 CRUDO`, `SILLAR MATE S-201`…) sólo tienen precio por metro, todos de Ventanas y
  Puertas, y dejarlos sin fuente sería perder dato real. Decisión del usuario entre las tres
  opciones planteadas.
- La elección de candidato **se movió dentro del bucle de productos** (memoizada por categoría),
  porque la modalidad preferida depende de la categoría del producto del Cotizador, no del id del
  maestro.
- `proveedorElegido` ahora incluye `unidadCompra`, y el motivo del histórico dice qué modalidad se
  usó y entre cuántos candidatos se eligió. Antes no quedaba registro de esa decisión.
- **Nueva `realinearPreciosAlMultiplicador(categoria, opts)`**: conserva `costo_unitario` y sólo
  realinea PA/PM/PB. Omite explícitamente los productos con costo 0 o nulo — 0 × multiplicador es
  0, y escribir un precio de venta en cero es justo lo que este módulo no debe hacer. Son 11
  (ACCESORIO 6, ACABADO 3, VIDRIO 2); PERFILERIA no tiene ninguno.
- Se extrajo `aplicarEscrituras()` para que las dos vías compartan la escritura agrupada
  (`UPDATE ... unnest` + `bulkCreate`) en una sola transacción. El histórico las distingue por
  `por`: `sync-proveedores` vs `realineacion-multiplicador`.

**`cotizador_multiplicadores.controller.ts`** — "Recalcular" corre **dos fases**: primero el costo
del proveedor donde haya, después la realineación de todos los demás, excluyendo los que ya movió
la fase 1 (quedaron alineados por construcción; volver a tocarlos sólo duplicaría historial). La
respuesta agrega `porProveedor`, `realineados` y un campo `fase` en cada cambio.

**`TabConfiguracion.tsx` + `types.ts`** — la previsualización distingue las dos fases con dos
contadores y una columna "Origen" (`proveedor` / `multiplicador`), y en la fase 2 la columna de
costo dice "sin cambio" en vez de repetir el mismo número dos veces. Decisión del usuario: un solo
botón, no dos — "Recalcular" pasa a significar "todo producto de la categoría con costo > 0 queda
regido por el multiplicador de su categoría".

### Fricción de entorno que conviene recordar

El pooler de Supabase en modo sesión (tope 15) se saturó dos veces. Causa: cada script nuevo en
`src/scripts/` hace que nodemon reinicie el backend, y **matar el proceso con `Stop-Process -Force`
deja la conexión abierta del lado del pooler** hasta que el servidor la recicla. Bajar el backend no
alcanza: hay que esperar el reciclado. Se resolvió con una sonda de una sola conexión
(`pg.Client` directo, sin pool) en bucle `until` hasta recuperar cupo. El pool del backend es
`max: 10, min: 2`, así que dos procesos simultáneos ya rozan el tope.

---

## 2026-09-17 (4) — Precio por perfil de Ventanas y Puertas: 13 tiras cargadas y la alineación cerrada en 0

### Insumo del usuario

Tras pedirle la lista de los 14 perfiles que sólo tenían precio por metro, el usuario consiguió el
precio por perfil de todos. Confirmado **sin IVA**, y con una verificación que valía la pena hacer:
`proveedor_producto.precio_actual` guarda precio sin IVA, y cargar precios con IVA incluido habría
inflado todo costo un 19 % propagándose a cada cotización nueva. La evidencia respaldó la
respuesta: comparados sin IVA, 9 de 13 caen dentro del ±2 % del precio por metro ya cargado; con
IVA incluido los 13 habrían quedado uniformemente 15,8 % por debajo, que sería una casualidad muy
rara.

**Corrección a una estimación propia que estaba mal.** Al entregar la lista se ofreció una
estimación del precio de tira aplicando el sobrecosto del metro (+30,3 %) medido en los 4 productos
con doble modalidad. Los precios reales la desmintieron: **en 9 de 13 el precio por metro ya era
prácticamente tira ÷ 6** (entre −4,6 % y +1,7 %). Ese 30 % es propio de esos 4 productos, no una
regla del proveedor, y las estimaciones salieron ~30 % altas. Quedó dicho al usuario.

| Código | $/metro previo | Tira | Tira ÷ 6 | Δ costo |
|---|---|---|---|---|
| `CAB0606` | 16.302,52 | 98.000 | 16.333,33 | +0,2 % |
| `HOI0302` | 15.798,32 | 95.000 | 15.833,33 | +0,2 % |
| `HOS0302` | 12.100,84 | 73.000 | 12.166,67 | +0,5 % |
| `JAM0605` | 16.050,42 | 97.000 | 16.166,67 | +0,7 % |
| `SIL0301` | 12.521,01 | 76.000 | 12.666,67 | +1,2 % |
| `SIL0304` | 16.554,62 | 101.000 | 16.833,33 | +1,7 % |
| `HOR0603` | 16.386,55 | 96.000 | 16.000,00 | −2,4 % |
| `SIL0603` | 17.647,06 | 101.000 | 16.833,33 | −4,6 % |
| `SIL0101` | 12.941,18 | 70.000 | 11.666,67 | −9,8 % |
| `TRA0604` | 10.336,13 | 80.000 | 13.333,33 | **+29,0 %** |
| `JAM0302` | 15.882,35 | 66.000 | 11.000,00 | **−30,8 %** |
| `ENG0607` | 28.235,29 | 87.500 | 14.583,33 | **−48,3 %** |
| `SIL0606` | 14.957,98 | 43.000 | 7.166,67 | **−52,1 %** |

### ⚠️ `SIL0606` a 43.000 — cargado por decisión explícita del usuario

Se le señaló antes de escribir: `SIL0606` es "3831 SILLAR CABEZAL 173 **NEGRO**" y `SIL0301` es el
mismo perfil en **CRUDO** a 76.000, así que el pintado saldría 43 % más barato que el crudo. En
todo el resto de la lista pasa lo contrario (`JAM0302` crudo 66.000 vs `JAM0605` negro 97.000) y su
propio precio por metro (14.957,98) era **mayor** que el del crudo (12.521,01). El usuario reafirmó
el valor y se cargó tal cual: su costo bajó 52 % y el precio de venta con él. Queda en
`proveedor_producto_precio` y en `cotizador.precio_historial` por si resulta ser un tecleo.

### Bug propio encontrado en el dry-run: la comparación exacta generaba 362 cambios fantasma

El primer dry-run informó **482 productos** en la fase 2 cuando la medición decía 120. Causa: los
precios viejos están guardados con la precisión completa del float
(`precio_pa: 9691.42502713599`) mientras el motor produce valores pasados por `round2`. Con
comparación exacta, 362 productos "cambiaban" por fracciones de centavo y habrían escrito 362
líneas de histórico sin un solo movimiento real de precio — el mismo ruido que se evitó al sembrar
los multiplicadores con 6 decimales.

Se agregó `EPSILON_PESOS` a `sinCambio()`. **El umbral no se eligió a dedo: se midió.** La
distribución de la desalineación es bimodal y sin zona gris:

- `pa_ok_pero_pm_o_pb_no` = **0** en las 4 categorías — nunca hay desalineación de PM/PB
  independiente de PA, así que el exceso no eran cambios reales.
- **34 productos** difieren entre 1 centavo y 1 peso (VIDRIO 23, ACCESORIO 6, ACABADO 3,
  PERFILERIA 2).
- **Ningún producto** difiere entre 1 y 100 pesos — esa consulta salió vacía. Toda desalineación
  real está por encima de 100 pesos.

Un peso de tolerancia separa las dos poblaciones con dos órdenes de magnitud de margen, y el peso
colombiano no se factura en centavos. Con el umbral corregido la fase 2 informó exactamente los 120
medidos.

**Lección de método, no de código:** el `--dry-run` fue lo que evitó escribir 362 líneas de
histórico basura. La medición previa (120) y la del motor (482) no coincidían, y esa discrepancia
era la señal.

### Ejecución — `2026-09-17_precios_tira_ventanas_y_puertas.ts`

Mismo patrón de tres pasos con `--dry-run`, `--sin-recalculo` y `--revertir` que la migración
anterior, por la misma razón: el paso 3 no puede previsualizarse de verdad hasta que los pasos 1 y 2
estén aplicados. Secuencia usada: `--sin-recalculo` → `--dry-run` → aplicar.

- **13 filas `TIRA_6M`** creadas para Ventanas y Puertas (id 829), `metros_por_unidad = 6`,
  `origen = MANUAL`, con su línea en `proveedor_producto_precio`. Las filas `METRO` **se
  conservaron activas** por decisión del usuario: son registro real de lo que se compró (3 son
  compras de RETAL, la única prueba de esa compra) y el motor ya no las elige para perfilería.
- `codigo_proveedor` queda en NULL, igual que en el precedente del 2026-09-16: el código que traerá
  la factura de la tira no se conoce, y derivarlo quitando el sufijo `MT` de las filas de metro
  (`144PNMT` → `144PN`) sería inventarlo. La ingesta encuentra la fila por
  `(proveedor_id, catalogo_producto_id, unidad_compra)`; si no la reconoce por código, la línea cae
  en la bandeja de mapeo, que es el comportamiento seguro.
- **`EMPA8025`** no es un perfil sino un empaque en rollo de 100 m: se queda en METRO y sólo se
  actualizó el precio (2.184,87 → 2.176, −0,41 %), replicando a mano el cascadeo
  actual → anterior_1 → anterior_2 de `actualizarPrecio()` —privada en `proveedor.controller` y no
  importable sin arrastrar el ciclo `server → app → routes → controller`.
- **Recálculo: 138 productos** — fase 1 (proveedor) 18, fase 2 (realineación) 120.

### Verificación contra la BD

- **Los 4 de doble modalidad ahora cuestan tira ÷ 6**, no el precio por metro: `CAB0306` 11.932,77
  (era 15.546,22), `ENG0304` 14.103,64, `JAM0306` 11.820,73, `TRA0306` 13.347,34. Los `+30,3 %` que
  la sesión (2) les había aplicado quedaron corregidos: bajaron ~23 %.
- **Desalineación restante: 0 en las cuatro categorías.** Sólo quedan fuera los 11 productos con
  costo en cero (ACCESORIO 6, ACABADO 3, VIDRIO 2), omitidos a propósito.
- **PERFILERIA quedó unificada**: los 363 productos en 1,561841 (±1 en el sexto decimal por
  redondeo). Ya no queda ninguno en 1,514500.
- Histórico del día: 131 líneas `sync-proveedores` + 120 `realineacion-multiplicador`.
- `TEN0101` y `BOQN03` intactos, como estaba previsto.
- `tsc` limpio en backend y frontend.

### Pendientes que siguen abiertos

- **`SIL0606` a 43.000** — cargado a pedido, pero la anomalía contra el mismo perfil en crudo sigue
  sin explicación.
- **`ROD8025` +502 % y `TZO0301` +406 %** de la sesión (2), todavía sin explicación de unidad.
- **`TEN0101` y `BOQN03`** siguen sin marca en la BD: la exclusión es por script, así que el sync
  automático puede moverlos en la próxima factura (ver `TECH_DEBT.md` 2026-09-17).
- Los 11 productos con costo en cero: no tienen precio de venta derivable hasta que alguien les
  cargue un costo.
- **Los 3 perfiles comprados como RETAL** (`CAB0606`, `SIL0304`, `SIL0603`) ahora tienen precio de
  lista por tira, así que el costo ya no sale de una compra de sobrantes. Conviene revisar si la
  fila METRO de retal debería archivarse alguna vez.

---

## 2026-09-17 (2) — Cotizador: por qué la orden de corte no se puede emitir, y limpieza de los motivos

### Punto de partida

En la ficha de la cotización N.º 6 (ítem `Sistema5020::XX`, vano 100×150), el botón "Evaluar
aptitud para orden de corte" devolvía tres líneas rojas. No eran errores: son tres de las ocho
condiciones de `cotizador/lib/aptitudOrden.ts` funcionando. El diagnóstico se hizo contra Supabase,
no contra el código solo.

### Estado real de la calibración (verificado en BD)

- `cotizador.calibracion_margen`: **0 filas**. `calibracion_contraste`: **0 filas**. El proceso de
  calibración no ha empezado nunca.
- `calibracion_holgura`: 1 fila global (3 mm / 3 mm), fijada hoy 20:18 — con eso la condición 4 ya
  pasa.
- Diseños por nivel: **15 A, 124 B, 24 C** de 163. Los 9 de Sistema5020 son B.
- Perfiles por nivel: 972 A, 222 B, 11 C. **Todos los B tienen `modelo_dispersion_mm` = 1 exacto.**
- `nivel_vidrio`: solo 15 diseños en A. El vidrio es el que arrastra el nivel en la mayoría.

### El callejón sin salida (lo importante)

`analizarPieza` (`calibracion.ts:219`) devuelve `puedeProponer:false` para toda pieza nivel B, y
`TabCalibracion.tsx:400` solo pinta el botón de aprobar margen cuando es true. Pero `evaluarMadurez`
cuenta las piezas B como **calibrables** (solo veta las C). Y no existe endpoint ni pantalla que
promueva una pieza de B a A: `nivel_corte` solo se escribe desde el script one-off
`2026-09-13_aplicar_modelos_corte.ts`.

Resultado: una pieza B exige margen, prohíbe proponerlo y no ofrece cómo dejar de ser B. Cruzando el
inventario por sistema (regla "peor nivel por ref" + nivel del vidrio del primer diseño), **solo 3 de
13 sistemas** pueden llegar a `EN_PRODUCCION` hoy: Sistema7038-Interior, Vidrios y Espejos y
Sistema3831-Semireforzado. Entre ellos suman 6 diseños nivel A de 163.

### Hallazgo que abarata el desbloqueo

El `multimedida.json` del software de origen no está en esta máquina y las 3 observaciones originales no se
guardaron (`medidas_respaldo` es solo el número `3`). Pero **son recuperables evaluando el modelo
representante en los vanos de extracción** (1000×1200, 500×1200, 1000×600): un modelo solo se aceptó
si las reproducía exactamente.

Verificado reimplementando `buscarModelos` y comparando contra `candidatos`/`dispersionMm` de
`datos_cotizador/modelos_corte.json`: **1143/1143 perfiles y 430/430 ejes de vidrio coinciden, 0
discrepancias**. Quedan 69 piezas con 6 observaciones (vanos no documentados), de las cuales 15 son
nivel B — esas sí necesitarían dato externo.

Para el caso concreto: perfil 148 (Horizontal) y el paño de 5020::XX tienen 60 candidatos cada uno y
en fabricación 997 mm predicen 483/484 y 463/464 respectivamente. **Una sola lectura en un ancho
impar deja 30 candidatos con dispersión 0** — la pieza pasa a nivel A.

### Decisión de método: el oráculo es el software de origen, no el taller

`analizarPieza` sugiere resolver el nivel B "con dos o tres cortes en anchos que no sean múltiplos
redondos". No funciona tal cual: los candidatos difieren 1 mm y el margen de corte del taller es
desconocido (es justo lo que la calibración quiere medir), así que una medida de taller confunde
fórmula y margen en un solo número. Decisión del usuario: la identificación se hace tecleando la
ventana en el software de origen y leyendo su medida, que es exacta y no lleva margen. El taller sigue siendo
el oráculo del margen, después, con la fórmula ya fija.

### Cambio ejecutado (Fase 0)

`backend-api/src/cotizador/lib/aptitudOrden.ts`, único archivo. Sin BD, sin frontend.

1. **Condición 5 ya no se emite cuando el nivel es B o C.** `aptoParaCorte` es
   `nivelCorte === "A" && !hayMedidasInvalidas` (`motorDespiece.ts:360`), así que en un diseño B era
   false por definición y el motivo repetía la condición 3 con peores palabras. Con B/C descartado,
   un false ahí significa inequívocamente "medida inválida" y así se redacta. Un nivel **desconocido**
   (blob viejo) no suprime nada: ahí no se sabe cuál de las dos causas fue.
2. **Condición 3 nombra las piezas culpables**, leídas de `cortes.perfiles[].nivelCorte` /
   `incertidumbreMm` y `cortes.vidrios[].nivelRiesgo` / `incertidumbreMm` — campos estructurados, no
   subcadenas del texto de `advertencias`. Un blob sin esos campos deja el motivo como estaba.

Antes (3 líneas) → después (2 líneas, verificado contra el blob real del ítem 7):

> Nivel B: la fórmula de este diseño no está validada, no se arregla calibrando — hace falta
> identificarla primero. **Las piezas que lo bajan son: Horizontal (148) ±1 mm, VIDRIO CLARO 5MM
> CRUDO ±1 mm.**

`CODIGOS_MOTIVO` no cambió (el contrato de códigos sigue intacto, solo cuándo se emite uno). El
frontend no ramifica por `codigo`, solo renderiza `texto` — verificado.

### Pendientes

- **Fase 1 (P1): identificador de fórmula**, plan completo acordado y a la espera de ejecución:
  columnas nuevas en `calibracion_contraste` (`diseno_id`, `pieza_orden`, `eje`, `proposito`,
  `fuente`; la tabla está vacía, ALTER sin backfill), lib `cotizador/lib/identificacionCorte.ts`
  portando la búsqueda entera desde el script de reconstrucción, dos endpoints y un bloque en
  `TabCalibracion.tsx`.
- Al cambiar `modelo_*` de una pieza, la condición 8 (`verificarVigencia`) marcará las cotizaciones
  viejas como desactualizadas. Es correcto, pero conviene anticiparlo.
- `inventarioPiezasDeSistema` toma el nivel del vidrio del **primer** diseño del sistema, no el peor
  (divergencia ya documentada en el propio archivo). Conviene alinearlo en la misma pasada.
- **`npm --prefix backend-api run lint:fix` está roto**: ESLint 10 no encuentra `eslint.config.js`
  (el repo sigue en formato `.eslintrc.*`). Preexistente, no lo introdujo este cambio.
- Sin commit: el cambio queda en el working tree a la espera de orden.

---

## 2026-09-19 — Proveedores: la FE traía descuento y el sistema registraba cualquier cosa menos el precio

**Disparador.** El usuario preguntó qué valor muestra el módulo cuando la factura trae un
descuento, a partir de un pantallazo del modal "Vincular Código de Proveedor" que mostraba
`$68.559` para un vidrio templado de 8 mm de Templacol.

**Diagnóstico sobre facturas reales.** El usuario aportó dos `.zip` (`DE_FA140922.zip` y
`z0890912995012260000766C.zip`). Parseados en frío, **13 de 14 líneas quedaban mal registradas**:

- El `$68.558,89` del pantallazo **no era ni el precio de lista ni el neto**: es
  `165.000 ÷ 2,40669`, el resultado de dividir por un `BaseQuantity` que la factura trae con la
  cantidad repetida. La lista real es `$165.000/m²` y el neto `$99.990` (39,40% de descuento).
- Prueba de que no era un precio: **la misma factura trae el vidrio en dos líneas** y producía
  `68.558,89` y `67.231,55` — dos cifras para el mismo producto al mismo precio. El neto era
  `$99.990` en ambas.
- En Grupo Roldán, 6 de 8 líneas registraban el **bruto**, 34–38% por encima del costo real.
- El error iba en las dos direcciones y cuál tocaba dependía de la cantidad: el vidrio quedaba
  **31% por debajo** del costo (cotizar sobre eso es vender con el margen destruido) y el aluminio
  **34–38% por encima** (cotizar caro y perder trabajos).

**Decisiones del usuario:** registrar el **neto** guardando bruto y descuento al lado; que el
único campo editable del modal sea el neto; y **no** recalcular lo ya cargado (se corrige solo con
la próxima factura de cada producto).

**El hallazgo que solo apareció mirando facturas reales.** `BPB` y `BOQUETE NORMAL` vienen al
**100% de descuento** — el proveedor los factura y los regala. Su neto es `$0`, y la regla
"guardar el neto", tal como estaba planteada en el plan aprobado, **los habría registrado en cero**,
borrando el costo del producto y propagando ese cero al Cotizador. Habría sido peor que el bug
original. Obligó a agregar la regla de bonificación antes de escribir una línea de código.

**Cambios:**
- `utils/dianXmlParser.ts` — lee `cac:AllowanceCharge` de línea (separando descuento de cargo),
  expone `precio_bruto`, `descuento_valor`, `cargo_valor`, `descuento_pct` y `bonificacion`, y
  `precio_unitario` pasa a ser el **neto**. El arbitraje de `BaseQuantity` deja de ser heurística
  de cercanía y pasa a **reconciliación exacta** contra el bruto de línea. `descuento_global`
  expone el descuento de documento sin repartirlo.
- Migración `2026-09-19_descuentos_linea_proveedores.ts` — 10 columnas nullable (5 + 5),
  **ejecutada contra Supabase**, verificada 10/10.
- `proveedor.controller.ts` — `LineaAgrupada` carga el desglose de **la línea ganadora** (no
  máximos independientes: con dos líneas del mismo producto, el bruto que se muestra debe ser el
  de la que ganó); bonificaciones excluidas con aviso; aviso de descuento ≥90% y de descuento de
  documento; desglose persistido en histórico y bandeja; `vincularPendiente` lo arrastra y lo
  descarta si el usuario corrigió el neto a mano; `desvincularEquivalencia` lo limpia.
- Falso positivo de anomalía suprimido cuando la caída de precio queda explicada por el descuento.
- `VincularCodigoModal.tsx` — cadena lista → descuento → neto, más verificación
  `cantidad × neto = total de línea` en verde/ámbar. `PorMapearTab.tsx` — badge de descuento.
- `2026-09-19_verificar_descuentos_linea.ts` — 12 escenarios, todos pasan.

**Consistencia entre los dos caminos de escritura.** El punto que más importaba del pedido del
usuario: el mapeo manual y la ingesta automática escriben la misma columna `precio_actual`. Si uno
guardara el neto y el otro el bruto, esa columna contendría dos cosas distintas según quién la
escribió. Por eso el descuento se resuelve en el parser, no en la pantalla.

**Verificado:** backend compila; frontend `tsc --noEmit` limpio; 12/12 escenarios sintéticos;
14/14 líneas reales correctas; simulación contra la BD confirmando el antes/después.

**Impacto al cargar esas dos facturas:** el vidrio templado 8 mm sube de `$68.558,89` a `$99.990`
(está en la bandeja, sin mapear). Los 8 perfiles de Roldán, que ya tienen equivalencia, bajan
~11–14% (no 38%: sus precios actuales corresponden a un descuento de ~27,5%, probablemente de una
lista, y esta factura trae 38%). Son correcciones, no cambios de precio del proveedor. 125 de 530
productos del Cotizador derivan su costo de proveedores y se recostean solos.

**Pendientes / riesgos:**
- Las filas de histórico anteriores a hoy quedan con el desglose en `NULL` y **no se pueden
  recalcular** (los XML no se persisten — `TECH_DEBT.md` 2026-09-04 (2), sigue abierta).
- `npm --prefix frontend-web run build` falla en Windows: el script usa `CI=false` con sintaxis
  Unix y cmd no lo reconoce. Preexistente. Se verificó con `tsc --noEmit`.
- Sin commit: el cambio queda en el working tree a la espera de orden.

---

## 2026-09-19 (2) — Cotizador: la orden de corte deja de estar bloqueada (se acepta ±1 mm y se retira la exigencia de calibración)

### Cómo empezó, y por qué el plan anterior se descartó entero

La sesión arrancó con un plan de "Fase 1 — identificador de fórmula": pantalla nueva, columnas
nuevas en `calibracion_contraste` y **318 ventanas tecleadas a mano** en el software de origen para
desambiguar las piezas nivel B. El usuario lo frenó en seco: *"no entiendo, requiero algo que creo
que es simple… además el software de origen es solo referencial"*. Tenía razón en el fondo, y el plan se tiró.

Dos cosas se aclararon ahí y conviene no volver a mezclarlas:

- **Cotizar ya funciona.** Verificado en vivo: Sistema5020, 1000×1500 mm, mate, vidrio claro 4 mm →
  **$465.854,56**, sin errores ni advertencias. Meter medidas y obtener precio nunca estuvo roto.
- **Lo bloqueado era la orden de corte**, que es otra cosa. Todo el aparato de calibración vivía ahí.

### La causa raíz del nivel B, que no era falta de información sino una mala pregunta

Se revisó `multimedida.json` (4,2 MB, **1.992 extracciones**, 652 diseños) en la carpeta del
proyecto externo de origen — el archivo que el `SESSION_LOG` del 2026-09-17 dio por perdido: **está donde
siempre estuvo**, en la ruta que el propio script de reconstrucción tiene por defecto.

Los vanos extraídos son **1000×1200, 1000×600 y 500×1200**. Los tres son múltiplos de 100, así que
toda división cae exacta y **el truncamiento nunca se manifiesta**. De ahí salen los 222 perfiles
nivel B: no falta el dato, se preguntó en medidas que no podían revelarlo.

### Lo que se intentó y no funcionó (queda dicho para no repetirlo)

1. **Extraer una medida impar automáticamente.** Se calculó la medida óptima por barrido —
   **903 × 601 mm**, que cierra 241 de 419 piezas (57,5 %); con una segunda (902×701) se llega al
   69,9 %— y se preparó la lista filtrada de los **139 diseños** afectados (los 139 están en
   `fix_mapa.json`, cobertura 100 %). Se llegó a ejecutar el login. **La cuenta está vencida:**
   `<dominio del software de origen>` redirige a `/inactivo.html` — *"Tu cuenta está pausada · SUSCRIPCIÓN
   VENCIDA"*. Sin acceso no hay extracción posible.
2. **Inferir la convención de redondeo** desde los perfiles ya confirmados. Descartado con datos:
   de los 980 nivel A, **975 usan `exacto` con n=1** — son piezas que no dividen (marco = ancho,
   jamba = alto − k), así que nunca redondean y no hay convención transferible. Forzar truncamiento
   en los dudosos resolvió **0 de 419**: la ambigüedad no está en la operación sino en la constante
   (`trunc((A−69)/2)` y `trunc((A−70)/2)` son ambas `trunc` y difieren 1 mm igual).

### Decisión del usuario: el milímetro es indiferente

Nivel B significa "los modelos candidatos coinciden dentro de **1 mm**" — error **acotado**. Con la
holgura de instalación en 3 mm (única fila vigente, global), cabe. El usuario lo dio por indiferente
**también en vidrio templado**, que era la pregunta que decidía el alcance:

| Si se acepta 1 mm en… | Diseños habilitados |
|---|---|
| Aluminio y vidrio | **163** (el vidrio arrastra el nivel en 130 de 163) |
| Solo aluminio | 33 |

### El segundo candado, que no estaba en el plan y lo habría invalidado

Rastreando las 8 condiciones de `aptitudOrden.ts` apareció que **la condición 7 bloqueaba el 100 %
de las órdenes de forma permanente**, con independencia del nivel: exige `madurezDeSistema` en
`EN_PRODUCCION`, y eso pide cobertura total de márgenes aprobados más firma del maestro. En BD:

```
calibracion_margen     0 filas
calibracion_contraste  0 filas
calibracion_sistema    0 filas
```

No era una red de seguridad, era un candado sin llave. Decisión del usuario: retirarla también.

### Cambios — 2 archivos, sin BD, sin frontend

- **`motorDespiece.ts`** — `NIVELES_APTOS_PARA_CORTE = {A, B}` sustituye a `nivelCorte === "A"`.
  **C sigue fuera y la diferencia no es de grado:** ahí el error *crece* con el vano (hasta 3,3 mm,
  sin tope) porque la pieza se calcula con la recta ajustada. Un error acotado se absorbe con
  holgura; uno que se agranda con la ventana, no.
- **`aptitudOrden.ts` — condición 3:** deja de reclamar en B. Sigue reclamando en C y en nivel
  **desconocido** (blob viejo sin `nivelCorte`: no saber no es estar bien).
- **`aptitudOrden.ts` — condición 7:** tras `EXIGIR_SISTEMA_EN_PRODUCCION = false`. El bloque se
  conserva entero a propósito — volver a exigirlo el día que el taller calibre es cambiar esa
  constante, no reescribir nada.
- **`aptitudOrden.ts` — condición 5, el bug que se habría introducido.** La supresión del motivo
  era `nivel === "B" || nivel === "C"` (puesta el 2026-09-17, cuando B era no-apto por definición).
  Con B apto, un `aptoParaCorte:false` en un diseño B ya solo puede venir de una medida inválida, y
  seguir callándolo habría dado **un bloqueo mudo**. Pasó a `nivel === "C"`.

### El artefacto que apareció en la verificación — lo más instructivo de la sesión

Con todo lo anterior aplicado, las 4 cotizaciones **seguían bloqueadas**. Causa:
`resultado.aptoParaCorte` es un **booleano grabado en el JSONB el día que se cotizó**, con la regla
de niveles de entonces. Cambiar el motor no reescribe los blobs ya guardados: los 4 ítems lo tenían
en `false` por su nivel B, **con cero líneas en error y cero perfiles sin modelo** (verificado uno
a uno contra la BD).

La condición 5 pasó a **reevaluar el criterio sobre los datos crudos del blob** (el nivel y si
alguna línea quedó en error), que son hechos del cálculo y no cambian cuando cambia la regla. Si el
blob es tan viejo que ni trae `items`, se respeta lo guardado: no inventar es preferible a suponer.
Es el mismo principio que la condición 8 — lo que se guardó describe un momento, no una verdad
permanente.

### Verificación

| Prueba | Resultado |
|---|---|
| `npm --prefix backend-api run build` | ✅ sin errores |
| Aptitud de las 4 cotizaciones APROBADAS | ✅ COT 4, 6 y 7 imprimibles; COT 5 bloqueada solo por un ítem **sin diseño** (legítimo) |
| Contra-prueba: nivel C | ✅ sigue bloqueado (`NIVEL_NO_VALIDADO`) |
| Contra-prueba: nivel desconocido | ✅ sigue bloqueado |
| Contra-prueba: nivel B **con** medida inválida | ✅ emite `NO_APTO_PARA_CORTE` — ya no es mudo |
| `npm --prefix backend-api run test:cotizador` | ⚠️ 36/37 — ver abajo |

**El test que fallaba era preexistente y ajeno, y quedó resuelto:** el centinela *"el catálogo tiene
los 437 productos"* daba 469. Son los **32 códigos dados de alta el 2026-09-16** (16 de color + 16
con precio manual). Se comprobó primero que los 126 `PROVISIONAL` seguían separados de los 464
`CATALOGO` + 5 `ALTA` —que es exactamente lo que ese centinela vigila, **no hubo contaminación**— y
con eso confirmado, el usuario autorizó actualizar el número. **Suite completa en verde: 37/37.**

La lección que deja: el centinela estuvo tres días en rojo y en ese estado **dejó de vigilar**, porque
el fallo que importa se confunde con el ruido de fondo. Al subir el conteo por una razón buena,
actualizar el número es parte del trabajo.

**Fricción operativa que mordió dos veces y conviene recordar:** las suites no se pueden correr con
`npm run dev` levantado — la caché de las pruebas abre su propia conexión y se agotan las 15 del
pooler de Supabase (`EMAXCONNSESSION`). Lo tramposo es que **no falla la suite del cambio**: fallan
las que dependen de la caché, que pueden ser cualquiera, y parece una regresión inexistente. Llegó a
mostrar 3 fallos justo después de tocar el centinela. Bajar el backend, correr, relanzar.

### Estado que queda

- **139 de 163 diseños** pueden emitir orden de corte (15 A + 124 B). Los 24 C siguen frenados.
- Toda la maquinaria de calibración queda **intacta y operativa**, solo deja de ser obligatoria.
- Las medidas pueden salir **±1 mm**; conviene que el maestro lo sepa.
- Sin commit: el cambio queda en el working tree a la espera de orden.

---

## 2026-09-21 — Generador de perfilería para SAP (aislado)

### Contexto
El usuario respondió las 6 preguntas pendientes al maestro del taller que dejó abierta la
conversación del 2026-09-20 (`cotizador-vision.md`). Con eso se pudo construir el generador de
`CANT.`/`DIMENSION` de una SAP a partir del despiece de una propuesta — pero **explícitamente
aislado**: "aun no vamos a vincular con el ERP, todo será aislado para poder ensayar bien ya que el
ERP está en producción y no quiero fallos luego".

### Respuestas del maestro (no volver a preguntar)
1. Barra comercial: **siempre 6 m**, cualquier perfil.
2. Cuántas barras pedir: **no importa optimizar** (sin bin-packing) — el retal se gestiona a mano,
   ingresándolo a inventario.
3. El 5 % de desperdicio: **real**, se aplica siempre.
4. Letras A, B, C de la SAP: **orden de entrada del asesor**, no geometría. (Distinto de la
   heurística horizontal/vertical de `ordenCorte.ts`, que sigue sin confirmar — no se tocó.)
5. Perfiles ya cortados por el proveedor: a criterio del asesor, sin tratamiento especial.
6. Qué mira primero en una SAP: nada puntual, "está todo".

### Cambios
- `motorDespiece.ts`: 2 campos aditivos (`codigo`, `desperdicioPct`) en cada elemento de
  `resultado.cortes.perfiles[]` — nada existente cambió.
- `cotizador/lib/generadorSapPerfileria.ts` (nuevo): función pura, agrupa cortes por código,
  `CANT.=ceil(metros con 5% desperdicio / 6m)`, `DIMENSION` consolidado por medida, letras por
  primera aparición. No toca Postgres, `sap_items` ni `ODP`; el llamador debe filtrar primero por
  `evaluarAptitudOrden(...).porItem[].imprimible`.
- 10 pruebas nuevas (`generadorSapPerfileria.test.ts`), sin precarga de caché (no las necesita).
- `test:cotizador`: 6 suites, **65 pruebas, 65/65 en verde** (verificado en corrida limpia; una
  corrida con el pool de Supabase ya ocupado dio 28 fallos falsos — mismo síntoma documentado antes).

### Decisión de diseño explícita
Blobs de cotización guardados **antes** de este cambio no traen `codigo`/`desperdicioPct`: el
generador los excluye con advertencia ("clona la propuesta para regenerar") en vez de asumir 0 % o
adivinar el código. Solo afecta a las ~4-5 cotizaciones existentes con propuestas.

### Estado que queda
- Generador construido y probado, **sin ningún punto de entrada real** (sin endpoint, sin botón en
  `SAPModal`). Sigue bloqueado por la falta de vínculo Cotización↔ODP, y **el usuario confirmó que
  eso se pospone a propósito** hasta poder ensayar el motor sin arriesgar el ERP en producción.
- `docs/modulos/cotizador.md` y `cotizador-vision.md` actualizados con las respuestas y la nueva
  sección del generador.
- Sin commit: el cambio queda en el working tree a la espera de orden.

---

## 2026-09-21 (2) — PDF de cotización (aislado)

### Contexto
Mismo día, siguiente paso dentro del Cotizador aislado: el usuario pidió replicar un formato de
referencia (imagen "Arquitectura") pero con la lógica de negocio real de Templex, T&C
predeterminados "por ahora, luego te paso los reales", logo y paleta de Templex.

### Hallazgo que cambió el plan a mitad de camino
El plan original proponía agregar `terminos_condiciones` a `cotizador.parametro` con placeholders.
Antes de tocar BD se encontró que **ya existe** `cotizador.empresa` / `cotizador.empresa_logo`
(`store/empresaStore.ts`), sembrada el 2026-09-07 desde el Excel origen con **datos reales de
Vidrios Templex**: razón social, NIT, cuenta Bancolombia, garantía, validez de oferta (8 días
hábiles) y **las 11 condiciones comerciales verbatim** del negocio — comentario de código
literalmente decía "el generador de PDF (Etapa 4) lo tomará de la caché". Se verificó contra
Supabase real antes de escribir una línea del generador. Resultado: **cero migración de BD**, y el
documento sale con contenido real desde el primer PDF, no con placeholders.

### Cambios
- `pdfmake@0.3.11` instalado exacto (`--save-exact`), sin `@types/pdfmake` (describe la 0.2; la 0.3
  reescribió la API sobre `pdfkit`).
- `src/types/pdfmake.d.ts` (nuevo) — tipos mínimos a mano para lo que usa el generador.
- `cotizador/lib/generadorPdfCotizacion.ts` (nuevo) — arma el `docDefinition` y renderiza a Buffer.
  Fuente Helvetica (sin embeber TTF); paleta estimada del logo real (`logotemplex.png`); ítems
  muestran `subtotalConAiu` (sin IVA) para cuadrar con `total_productos`, con un solo IVA agrupado
  al final — no `item.total`, que ya trae IVA "a precio lleno" sin el descuento de la propuesta.
- `descargarPdfPropuesta` en `cotizador_cotizaciones.controller.ts` +
  `GET /cotizaciones/:id/propuestas/:pid/pdf`.
- Botón "Descargar PDF" en `ModalDetalleCotizacion.tsx` (blob download, mismo patrón que
  `ManualVisor.tsx`/`PedidosPVPage.tsx`: error genérico, nunca se intenta leer `.error` de un Blob).

### Dos bugs de integración de pdfmake, atrapados al generar un PDF real (no por los tipos)
1. **`ts-node/register` no ve la declaración ambiental** si nada la importa (a diferencia de `tsc`,
   que usa el `include` del tsconfig entero) → TS7016 al correr un script, aunque `npm run build`
   compilaba limpio. Fix: `/// <reference path="../../types/pdfmake.d.ts" />` en el propio módulo.
2. **`setLocalAccessPolicy(() => false)` bloqueaba las fuentes estándar**: pdfkit resuelve
   `Helvetica-Bold` por el mismo camino que un archivo local. Fix: permitir sólo los 4 nombres que
   declara `standard-fonts/Helvetica`, negar cualquier otra ruta.

### Verificado
PDF real generado contra `cotizacion_id=11` / `propuesta_id=12` (la única que existe hoy con datos),
leído visualmente: logo, paleta, tabla de ítems, total destacado y las 11 condiciones reales, todo
correcto. `npm run test:cotizador` 65/65. `npm run build` (backend) y `tsc --noEmit` (frontend)
limpios. Backend real levantado con `npm run dev`, ruta nueva responde 401 (no 404) sin token, igual
que `/estado` — confirma que quedó montada.

### Pendiente / fuera de esta v1
- Paleta y garantía/T&C: ya son datos reales de `cotizador.empresa`, no placeholders — pero la
  paleta de color SÍ es estimada del logo a ojo, no un código de marca confirmado.
- Tipografía Space Grotesk/Manrope no se embebió (harían falta los TTF + `vfs_fonts` propio).
- Sección "Otras propuestas presentadas" sin probar contra un caso real con más de una propuesta
  (hoy solo existe una cotización con propuestas en la BD).
- **Siguiente paso, ya pedido por el usuario:** la Hoja de Trabajo, documento interno para el
  taller — sin plata, no pasa por `/aptitud`.
- Sin commit: el cambio queda en el working tree a la espera de orden.

---

## 2026-09-21 (3) — Hoja de Trabajo (interna, sin plata)

### Contexto
Siguiente paso ya acordado. Antes de diseñarla se encontró en `SESSION_LOG.md` (2026-09-10) que el
proyecto standalone original (`PLANTILLA COTIZACIONES`, máquina de casa, no accesible desde aquí) ya
tenía una Hoja de Trabajo construida — se preguntó al usuario en vez de adivinar el formato.
Respuestas: (1) resumen por producto sin despiece (diseño/sistema, color, vidrio, cantidad, vano tal
como lo tecleó el asesor); (2) es y será el **único** documento de taller — no habrá una Orden de
Corte separada con medidas exactas, por eso sale siempre sin pasar por `/aptitud`.

### Diseño resultante
100% frontend, sin BD ni endpoint nuevo: `cot.items` de la propuesta que se está mirando en
`ModalDetalleCotizacion.tsx` ya trae `input` completo. Los campos técnicos se resuelven de forma
**genérica** contra `modulo.campos` (`GET /modulos`), filtrando `grupo: 'medidas' | 'vidrio'` —
mismo contrato que ya usa el formulario de Cotizar, sin mapear los 6 módulos a mano. Impresión con
`window.print()` vía `abrirVentanaImpresion()` (patrón de `PrintableProduccion`/`PrintableOA` de la
ODP real), no pdfmake: es un documento que nunca sale del edificio.

### Cambios
- `frontend-web/src/features/cotizador/components/PrintableHojaTrabajo.tsx` (nuevo).
- `ModalDetalleCotizacion.tsx`: carga `apiGetModulos()` una vez, botón "Hoja de Trabajo" junto al de
  "Descargar PDF", área oculta (`display:none`) que alimenta `abrirVentanaImpresion`.

### Verificado
`tsc --noEmit` del frontend limpio. **No verificado visualmente** (sin herramienta de navegador en
esta sesión): el usuario debe probarlo en el frontend ya corriendo (hot-reload) y confirmar que el
layout impreso se ve bien.

### Pendiente
- Confirmación visual del usuario.
- Sin commit: el cambio queda en el working tree a la espera de orden.

---

## 2026-09-21 (4) — Hoja de Trabajo v2 (plano + despiece) y limpieza de procesos huérfanos

### Lo que pidió el usuario tras ver la v1
Al ver la Hoja de Trabajo impresa, pidió agregar: el plano al final de la página 1, y una página 2
con las especificaciones de corte por perfil y vidrio. Esto último es literalmente el despiece
pieza por pieza que la v1 excluía a propósito — se le señaló la tensión con el motor de aptitud
(un nivel C tiene error que crece sin tope con vidrio templado de por medio) antes de tocar código.
Decisión: la página 2 **sale siempre**, pero con aviso rojo cuando `nivelCorte` no es A/B o hay
errores — ni bloqueo ni silencio.

### Cambios
- Backend: `despieceDeItem` en `cotizador_plano.controller.ts` +
  `GET /cotizaciones/:id/items/:itemId/despiece` — reutiliza `ordenarParaTaller()` (`ordenCorte.ts`),
  no reimplementa el orden de piezas.
- Frontend: `ModalDetalleCotizacion.tsx` deja de gatear la carga de planos a "Vista técnica" (ahora
  se piden en cuanto se abre el detalle) y agrega la misma carga para despieces.
  `PrintableHojaTrabajo.tsx` gana el plano por ítem (página 1) y la página 2 completa con
  `page-break-before`, tabla de perfiles/vidrio y el aviso de confiabilidad (`esConfiable()`,
  espejo explícito de `NIVELES_APTOS_PARA_CORTE`).

### Incidente encontrado y resuelto: procesos de `backend-api run dev` huérfanos
Al verificar el nuevo endpoint se descubrió que **401 no prueba que una ruta específica exista** —
`authMiddleware`/`requireRole` corren para cualquier path bajo `/api/cotizador/*`, exista la ruta
o no (confirmado con una ruta inventada: también 401, mientras que fuera del prefijo da 404). El
método de verificación usado en las dos entradas anteriores de hoy (SAP y PDF) era más débil de lo
que parecía.

Al buscar una verificación real se encontró la causa de fondo de los `EMAXCONNSESSION` que vinieron
apareciendo toda la sesión: **4 generaciones distintas de `npm --prefix backend-api run dev` +
`nodemon`** acumuladas como procesos vivos (una incluso de antes del `/clear` con el que empezó
esta conversación), cada una habiendo abierto su propio pool de Sequelize antes de chocar por
puerto ocupado (`EADDRINUSE`) contra la anterior y quedarse esperando sin cerrar nunca esa
conexión. Se identificaron con `Get-CimInstance Win32_Process` (línea de comando completa, no sólo
`tasklist`) para no tocar por error los procesos de otras herramientas del IDE (playwright,
chrome-devtools-mcp, antigravity) ni el frontend real del usuario. Se mataron las 4 generaciones +
la actual, y se levantó una sola instancia limpia.

**Lección para la próxima vez que se levante el backend en esta sesión:** verificar primero con
`netstat` si el puerto 3001 ya está en uso, y si `npm run dev` falla o queda "esperando cambios de
archivo" sin llegar a "escuchando en el puerto", no asumir que quedó bien — revisar el log
completo y matar el proceso huérfano por PID antes de reintentar.

### Verificado
Despiece probado en proceso directo (sin HTTP, para evitar la falsa señal del 401) contra
`cotizacion_id=11`/`item_id=16`: `nivelCorte: "B"`, `hayErrores: false` → confiable, perfiles
ordenados por `ordenarParaTaller` (horizontales primero), vidrio con descripción real. `tsc --noEmit`
del frontend y `npm run build` del backend limpios. El log del backend limpio mostró en vivo al
usuario navegando el módulo (listado, detalle, plano) con peticiones autenticadas reales — la
carga de plano desde la vista Normal funciona.

### Pendiente
- Falta que el usuario confirme visualmente la página 2 impresa — puede necesitar refrescar el
  navegador (F5) para que el nuevo `useEffect` de despieces corra: React Fast Refresh no siempre
  reinicia los hooks de un componente que ya estaba montado cuando cambia el código.
- Sin commit: el cambio queda en el working tree a la espera de orden.

---

## 2026-09-21 — Proveedores: varios códigos del proveedor por producto interno

### Origen
El usuario detectó que `GRP701NG` (GRUPO ROLDAN) pedía mapeo cuando ese producto ya estaba mapeado.

### Diagnóstico
No era el mismo código: lo mapeado era **`GRE701NG`**; el proveedor usa dos códigos para el mismo
sillar 7038. El matching exacto por `codigo_proveedor` era correcto, pero el defecto estaba un paso
después — al vincular, `findOrCreate` encontraba la equivalencia existente y **descartaba el código
nuevo en silencio** (solo lo escribía si el campo estaba vacío). El pendiente quedaba `MAPEADO`, la
equivalencia conservaba el código viejo y la siguiente factura volvía a la bandeja: bucle de mapeo
sin señal de error.

Medido en producción: 5 colisiones GRE/GRP en ROLDAN, **15 mapeos huérfanos** en otros 5 proveedores
(VENTANAS Y PUERTAS, VEA, VITELSA, ACVICOL, AVQ) y 7 de 7 facturas de ROLDAN con
`lineas_actualizadas = 0`. El problema llevaba tiempo actuando en silencio.

### Decisiones del usuario
1. Dos códigos alias en la misma factura → aplicar el **precio mayor** y avisar.
2. Los 15 huérfanos → devolverlos a `PENDIENTE`.
3. GRP70xNG y GRE70xNG **son el mismo perfil**.

### Cambios
**BD:** tabla `proveedor_producto_codigo` (N códigos por equivalencia), UNIQUE
`(proveedor_producto_id, codigo_proveedor)` — no por proveedor, porque el 1029 usa el mismo código
en dos modalidades. `proveedor_id` denormalizado para el lookup por índice.
`proveedor_producto.codigo_proveedor` se conserva como copia de lectura del principal.

**Backend:** modelo nuevo + asociaciones + auditoría (41 modelos, 33 tablas revertibles); helper
`utils/proveedorCodigos.ts` que unifica el lookup antes duplicado en tres sitios; ingesta de FE e
importación de listas resolviendo por todos los códigos; `vincularPendiente` agrega en vez de
descartar; validación 409 si un código apunta a dos productos; `desvincularEquivalencia` devuelve
todos los códigos; 3 rutas nuevas de gestión (declaradas **antes** de `DELETE /equivalencias/:id`);
aviso `CODIGOS_ALIAS_MISMA_FACTURA` con pasada previa que decide el ganador antes de escribir.

**Frontend:** aviso en `VincularCodigoModal` ("se agregará como código adicional"), chips y
alta/baja de códigos en `EquivalenciasTab`, contador `+N` en `ConsultarPreciosTab`.

**Migración:** `2026-09-21_codigos_multiples_proveedor.ts`, ejecutada — 208 códigos migrados, 208
principales, 0 desalineados, 15 huérfanos devueltos a `PENDIENTE`.

### Verificado
`npm run build` del backend y `react-scripts build` + `tsc --noEmit` del frontend, limpios. Prueba
dirigida contra el código compilado y la BD real dentro de una transacción con **ROLLBACK**: 15/15
comprobaciones en verde (resolución por ambos códigos, tolerancia a caja y espacios, un solo
principal, detección del choque entre productos, promoción del principal al quitar uno,
sincronización de la copia de lectura). Integridad confirmada tras el rollback: 208/208 y
`GRP701NG` sin registrar.

### Pendiente
- Vincular desde "Por Mapear" los 5 pares GRE/GRP de ROLDAN y re-mapear los 15 huérfanos
  rescatados. Dato abierto: los pesos de tira difieren 9–15 % entre ambas referencias.
- Sin commit: backend y frontend van juntos, a la espera de orden.

---

## 2026-09-22 — Cotizador: extender el sistema de diseño, rediseñar la Hoja de Trabajo y compactar Cotizar

### Origen
El usuario pidió continuar el rediseño visual del Cotizador iniciado el 2026-09-20, extendiéndolo a
las pantallas que quedaron fuera esa vez, y luego una serie de ajustes puntuales guiados por
capturas reales de la app corriendo en local. Alcance acordado explícitamente: solo visual/
estructura de UI, sin tocar flujos ni lógica de negocio.

### Fase 0–5: extender `ui/index.tsx` al resto del módulo
El rediseño del 2026-09-20 solo había tocado 8 de 17 archivos del Cotizador (el flujo de cotizar).
Quedaban con estilos propios/antiguos: Guardadas, Calibración, Configuración, los 2 modales y los
selectores.

- **Primitivas nuevas en `ui/index.tsx`:** `Input`/`Select`/`Campo` (extraídos del estilo de
  `CampoDinamico`, el control más cuidado del módulo), `BotonPeligro` + variante `compacto` de
  `BotonPrimario`/`Secundario`, `ChipEstadoCotizacion`, `ChipNivelCorte` (unifica el estilo "ring" de
  `SelectorDiseno` con el de `TabCalibracion`, con `alertaEnC` porque en Calibración el nivel C sí
  bloquea y en el selector es solo informativo), `ModalShell` (chrome compartido de los 2 modales),
  `Tarjeta` con `descripcion`/`sinRelleno`.
- **Migrados:** `TabGuardadas`, `TabConfiguracion`, `TabCalibracion`, `ModalDetalleCotizacion`,
  `ModalClonarPropuesta`, `ComparadorPropuestas`, `SelectorDiseno`, `CampoDinamico`. Deduplicado
  `badgeEstado()` (copiada literal en 2 archivos) y el chrome de los modales (calcado carácter por
  carácter en los 2). `ETIQUETA_CARGO` resultó ser dos variantes reales (larga/corta), no un
  duplicado — quedaron como `ETIQUETA_CARGO`/`ETIQUETA_CARGO_CORTA` en `format.ts`.
- **Hallazgo, no corregido (fuera de alcance):** en la tabla de piezas de `TabCalibracion`,
  `nivelCorte: null` se pintaba como "A" (el mejor caso) en el ternario original. Se preservó ese
  comportamiento exacto al extraer `ChipNivelCorte` — documentado en `TECH_DEBT.md` 2026-09-22 para
  que el taller decida el tratamiento correcto.

### Hoja de Trabajo — rediseño completo, réplica de `PrintableDetalleTecnico` (ODP)
A pedido explícito del usuario: **una página Carta por ítem** (antes: página 1 con el resumen de
TODOS los ítems + página 2 con las specs de TODOS), en el mismo formato que la Hoja de Detalle
Técnico de la ODP real — cabecera logo/título centrado/caja con número, tabla `excel-table` de
bordes gruesos, dos cajas apiladas con borde: arriba el plano, abajo "Cortes del taller" (perfiles +
vidrios), reemplazando donde el ODP pone la observación de instalación.

- Ambas cajas con **altura fija** (decisión explícita del usuario, como el ODP). La del plano lleva
  `overflow:hidden` (imagen/SVG que se ajusta solo); la de cortes **no** — es una tabla de largo
  variable, y si un ítem trae más perfiles de los que caben la tabla se sale del borde en vez de
  truncar filas: perder una medida de corte sería peor que un borde imperfecto.
- **Ítems sin diseño** (medidas libres): no tienen ni plano ni despiece calculable (el backend
  rechaza `/despiece` con 400 sin `disenoId`). Tras preguntarlo, quedaron con su propia página
  también, con aviso en cada caja en vez de desaparecer del documento.
- Se eliminó la tabla de campos técnicos que existía en la v1 (sistema/color/vidrio/medidas
  tecleadas) — instrucción explícita del usuario ("solo eso": plano + cortes).
- `docs/modulos/cotizador.md` actualizado: la sección "Hoja de Trabajo" describía el esquema de 2
  páginas anterior.

### `DiagramaProducto` — cotas más legibles
Ancho, alto y medida del vidrio/paño: texto 40–53 % más grande, negro y negrita — antes gris/azul
sin negrita. Pedido explícito ("es el dato principal del diseño"). Es un componente compartido
(Vista técnica, Hoja de Trabajo, previsualización en Cotizar): el cambio se ve en los tres sitios.

### `TabCotizar` — compactación guiada por capturas reales
- **`PanelCargosObra`:** alturas de fila y de controles reducidas (`h-8`→`h-7`, `py-1.5`→`py-1` en
  cabecera/filas/subtotal), `rounded-2xl`→`rounded-xl` para consistencia con el resto del módulo.
- **Causa raíz del espacio desperdiciado**, encontrada tras una captura del usuario: la columna
  "Concepto" del grid era `minmax(0,1fr)` — se tragaba todo el ancho sobrante del contenedor antes
  de llegar a las columnas de plata, y como el panel vivía a lo ancho completo de la pantalla, ese
  sobrante era enorme. Se topó la columna a `18rem` y el panel completo a `max-w-4xl`.
- **Layout lado a lado:** Cargos de obra y el selector de tipo de producto, antes apilados (cada uno
  al 100 % del ancho), ahora van en una fila (`items-stretch` en escritorio; siguen apilados en
  pantallas angostas, la tabla de cargos no tiene a dónde encogerse más).
- **`SelectorProducto`:** grid `grid-cols-[repeat(auto-fit,minmax(120px,1fr))]` en vez de
  `sm:`/`lg:grid-cols-N` — esos breakpoints reaccionan al ancho del *viewport*, no del contenedor, y
  ahora este selector puede vivir con un ancho variable. Las 6 tarjetas quedan del mismo alto (se
  sacó la descripción truncada de adentro, que además solo aparecía en la activa). Panel nuevo
  debajo con la **descripción completa** del módulo activo, `flex-1` para llenar el espacio que
  antes quedaba vacío bajo las tarjetas cuando Cargos de obra es más alto.

### Verificado
`tsc --noEmit` del frontend limpio en cada paso (9 corridas durante la sesión, 0 errores en todas).
Verificación visual: el usuario, con capturas reales de cada iteración corriendo en local
(`localhost:3000`), no en un ambiente de prueba aislado.

### Pendiente
Ninguno abierto de esta sesión. `TECH_DEBT.md` 2026-09-22 documenta el hallazgo de `nivelCorte`
nulo en Calibración (no corregido, fuera del alcance visual acordado).

### Commit
- 17 archivos, +888/−750 líneas — todo dentro de `frontend-web/src/features/cotizador/`,
  `docs/modulos/cotizador.md` y `TECH_DEBT.md`. Sin cambios de backend ni de BD.

---

## 2026-09-22 (2) — Auditoría del Excel de los asesores y módulo "Ítem libre" (7º motor)

### Punto de partida

El usuario pidió comparar `ORIGINAL PARA COPIAR no tocar.xlsb` (el archivo con el que cotizan hoy
los asesores, en su OneDrive) contra el módulo Cotizador, para ver qué hay a fondo que sirva
implementar o que falte.

**Método:** copia al scratchpad y conversión con Excel COM con macros deshabilitadas
(`AutomationSecurity = 3`, `EnableEvents = false`). **El original nunca se abrió en modo escritura.**
El libro **no tiene VBA** (0 componentes): toda la lógica está en fórmulas, así que fue auditable al
100 %. 20 hojas — 6 motores de producto, el formato impreso, 4 maestras ocultas y 5 hojas muertas.

### Lo que la auditoría confirmó ya portado

Los 6 módulos 1:1, el AIU `0,96` (`COSTOS!G7`), los estados `PENDIENTE/APROBADA/CANCELADO/PERDIDO`
(`Parametros!G`, ENUM idéntico), los segmentos PA/PM/PB, las cuatro tarifas de SMO (cabinas 120k,
fachadas 85k, armada 60k, persiana 110k), los kits `K1000…K2000`, los cargos
`GTFA26`/`ALQU36`/`HUAC06` y los bugs #4/#5/#10 del Excel. El port es fiel hasta el piso de SMO del
tablero.

### Los 6 hallazgos nuevos

1. **El modelo de márgenes** (`COSTOS!A1:D16`): la estructura de gastos fijos (PRODUCC 18,55 %,
   ADMON 20,39 %, VTAS 12,08 %, FNROS 3,99 %, utilidad 11/10/9 %) y las ponderaciones por categoría
   que **generan los 12 multiplicadores** de `cotizador.multiplicador_categoria` — que estaban en BD
   obtenidos por ingeniería inversa estadística ("observado en 221 de 363 productos"). Coinciden
   dígito por dígito, y el modelo explica los outliers de la siembra.
2. **El ítem libre**: 13 bloques "PLANTILLAS" en `Formato Digital` sin contraparte en el ERP.
3. **La barra de 6 m ya estaba escrita** en el Excel (`COSTOS!N = IF(TIPO="PERFILERIA", W/6, W)`),
   pese a que `cotizador-vision.md` la daba por inexistente en todo el sistema.
4. **`Hoja3`**: compras reales con `Vr und Restado dscto` (neto de descuento) y **Centro de Costos =
   número de ODP** → costo real por ODP, que el ERP no puede calcular hoy.
5. **`Word Office` / `wo5_03_19`** (ocultas): existencia y **costo promedio ponderado**, frente al
   costo por última compra que usa el ERP.
6. **Campos del documento VR09** que el PDF no tiene: PRODUCTO/SERVICIO, TOMA DE MEDIDA, FECHA DE
   ENTREGA, APROBÓ SI/NO y **O.D.P. No** — el papel ya pedía el vínculo cotización↔ODP.

Y tres cosas **rotas** en el Excel: `Modificar_Cotización` con todas sus `SUMIFS` en `#REF!`,
`Resumen_Cotizaciones` (la estadística comercial existió y se rompió) y fórmulas que apuntan a
**copias externas del propio archivo** (`[3]`…`[8]`), incluido el FACTOR de `PRECIOS!G2`.

### Decisiones del usuario

- Implementar **el ítem libre + documentar**; el modelo de márgenes queda **sólo documentado**.
- La asimetría del factor de VIDRIO (única categoría con utilidad esperada y sin comisión) se
  **documenta tal cual, sin tocar**: los precios de venta vigentes salen de ahí.

### Cambios realizados

**Backend**
- `cotizador/modules/itemLibre.ts` (nuevo) — 7º motor. Valida, resuelve cada línea con
  `lineaCatalogo()`, totaliza con `totalizar()`. **No** emite `cortes`, **no** mete SMO/flete en el
  BOM (reproduciría el bug de los 5 fletes del 2026-09-20), **no** declara `descuentoPct`, **no**
  hace `unidadOverride`. Exporta `claseDeUnidad()`, que clasifica por contenido y no por lista
  exacta. Advierte por código repetido y por ítem sin nombre.
- `cotizador/modules/registry.ts` — `"item-libre"` al final del mapa (el orden es el de las
  tarjetas).
- **Sin migración de BD**: `modulo_id` es `STRING(30)` sin FK, `input` es JSONB, y
  `diseno_id`/`sistema`/`nivel_corte` son nullable.

**Frontend**
- `EditorLineasLibres.tsx` (nuevo) — tabla editable con buscador del catálogo, precio en vivo del
  segmento y subtotal por línea. Pide el catálogo entero una vez (excepción documentada en
  `apiGetCatalogo`: responde desde caché en memoria, no toca Postgres).
- `types.ts` — `'lineas'` en `TipoCampo` + interfaz `LineaLibre`.
- `CampoDinamico.tsx` — rama `lineas` que delega entera, y prop nueva `segmento`.
- `FormularioModulo.tsx` — `valorInicial` → `[]`, `esVacio` trata `[]` como vacío, pasa `segmento`,
  y `sm:col-span-2` para que la tabla no quede a media columna.
- `TabCotizar.tsx` — `descripcionItem` deja de ser `null` fijo: lee el campo si el módulo lo
  declara. Genérico, no específico del ítem libre.
- `SelectorProducto.tsx` — ícono `ListPlus`.

### Bugs y hallazgos durante la ejecución

1. **`PERF01`/`ELE1101` no son `UND` en el catálogo del ERP**, son `X METRO` — lo descubrió una
   prueba que los usaba como ejemplo de "unidades" y falló. Explica por qué `tablero.ts` los pide
   con `unidadOverride: "UND"`. Documentado con la advertencia de que en un ítem libre un código así
   cobra metros lineales.
2. **Centinela de `cargos.test.ts`**: afirmaba `listarModulos().length === 6`. Actualizado a **7**
   con el renglón que explica por qué, siguiendo la convención del centinela del catálogo.
3. **`npm run lint` del backend está roto de antes** — `package.json` declara ESLint `^10.0.3` pero
   la config es `.eslintrc.json` (formato eliminado en ESLint 9) y el script usa `--ext` (también
   eliminado). Ni `lint` ni `lint:fix` corren. **No lo rompió este cambio.** Documentado en
   `TECH_DEBT.md` con las dos salidas (migrar a flat config, 1-2 h; o fijar ESLint 8, minutos).

### Verificación

- `npm run build` del backend: **limpio**. `tsc --noEmit` del frontend: **limpio**.
- `test:cotizador`: **84/84**, de 65. Nueva suite `itemLibre.test.ts` con **19 pruebas**
  (contrato del módulo, las 4 clases de unidad, regresión del bug #10, ausencia de `cortes`,
  ausencia de SMO/flete, código inexistente, mensajes por número de línea).
- Se verificó **suite por suite sin bajar el backend dev**, hallazgo que quedó documentado en
  `cotizador.md`: corriendo las 7 seguidas fallan en bloque las 4 que precargan caché (`0/N` limpio)
  y pasan las 3 puras; de una en una, con ~12 s de drenaje, pasan todas. Un `0/N` sin una sola
  prueba en verde es agotamiento del pooler, no una regresión.

### Lo que NO hubo que tocar (verificado, no supuesto)

`clonarPropuesta` (data-driven vía `moduloAcepta()`: copia el ítem intacto con advertencia),
`aptitudOrden` (`!cortes` → `SIN_DESPIECE_POR_DISENO`), `PrintableHojaTrabajo` (ya imprime "Sin
plano"/"Sin despiece"), `generadorSapPerfileria` (el llamador filtra por `imprimible`), el PDF y el
controlador `cotizarItem` (despacha por `getModulo()`, sin lista fija).

### Consecuencia aceptada

`evaluarAptitudOrden` marca la cotización completa como `imprimible` sólo si **todos** sus ítems lo
son, así que un ítem libre apaga esa bandera agregada — igual que ya pasaba con un espejo o un
tablero. El taller usa `porItem`, ítem por ítem: no se pierde información.

### Pendientes

- El modelo de márgenes, si se decide implementarlo (hoy sólo documentado).
- Costo real por ODP (`Hoja3`) y costo promedio (`Word Office`): sin decisión.
- Los 5 campos del formato VR09 que el PDF no tiene.

---

## 2026-09-22 (3) — Retirar el nombre del software de origen del repositorio (cierra deuda del 2026-09-19)

### Contexto

Al terminar el ítem libre se reportó que la verificación de la **decisión 8** del Cotizador ("el
nombre del software externo de origen no puede aparecer en ningún dato ni código del ERP") daba 16
en vez de 0. El usuario ordenó corregirlo.

**Corrección de encuadre:** no era un hallazgo nuevo. `TECH_DEBT.md` **2026-09-19 (4)** ya lo había
diagnosticado archivo por archivo y prescrito la solución exacta. Se redescubrió por buscar el
nombre en `src/` y `docs/` sin comprobar antes si ya tenía entrada de deuda técnica. Lo que se hizo
hoy es ejecutar esa solución, no diseñarla.

### Alcance real, medido antes de tocar

| Dónde | Usos | Naturaleza |
|---|---|---|
| `2026-09-13_reconstruir_modelos_corte.ts` | 9 | 8 en comentarios + 1 ruta por defecto |
| `2026-09-13_importar_disenos_fase1.ts` | 4 | 2 en comentarios + **2 rutas absolutas** |
| `2026-09-13_aplicar_modelos_corte.ts` | 2 | comentarios |
| `datos_cotizador/modelos_corte.json` | 1 | ⚠️ campo `nota` — **dato**, no comentario |
| `docs/modulos/cotizador.md` · `TECH_DEBT.md` · `SESSION_LOG.md` | 18 | prosa, 2 comandos `grep`, 1 dominio |

### Lo primero fue descartar que estuviera en la BASE

El archivo era sólo la mitad del problema: si esa `nota` se había sembrado, el nombre estaría en
Postgres. Se corrió un barrido de solo lectura (script temporal en el scratchpad, borrado después)
con `ILIKE` sobre **327 columnas de texto y 22 JSONB** de los schemas `public` y `cotizador`:

```
=== RESULTADO para "<nombre del software de origen>" ===
  ✅ 0 apariciones en la base de datos.
```

Dos razones por las que estaba limpia: el `nota` sólo lo escribe el script en el JSON —nadie lo lee
para insertarlo— y `cotizador.producto.fuente`, que es el campo que el motor propaga al frontend
como `fuentePrecio` y por tanto el que un cliente podría llegar a ver, ya venía neutralizado desde la
siembra como `"referencia externa · <acabado>"`. Quien armó esa siembra fue cuidadoso.

### Cambios

- **Prosa (15 usos en 3 scripts):** a "el software de origen" / "el proyecto externo de origen",
  cuidando la preposición para no dejar *"de el"*.
- **Las 3 rutas absolutas** salieron del código: ahora la carpeta se pasa por
  **`COTIZADOR_DATOS_ORIGEN`**, o como argumento en `reconstruir_modelos_corte.ts`, con error
  explícito si falta. **Detalle que la entrada de deuda no señalaba:** esas rutas eran
  `C:/Users/User/Desktop/...` — el escritorio de OTRA máquina (esta es `PRODUCCION`), así que
  llevaban tiempo sin resolver. No era sólo un problema de nombre: era código muerto.
- **El `nota` del JSON** neutralizado, y también **el generador de esa nota**, para que no la vuelva
  a escribir con el nombre.
- **Documentación:** los 18 usos restantes, incluido el dominio de la aplicación externa. Los dos
  comandos de verificación pasaron a `grep -ri "<nombre del software de origen>" …` — quien conoce el
  nombre puede correr el grep y el repositorio deja de deletrearlo.
- **`TECH_DEBT.md` 2026-09-19 (4)** marcada como **RESUELTA** con la sección "Cómo se cerró".
- **Decisión 8 de `cotizador.md`** ampliada: registra el incumplimiento del 2026-09-13 al 2026-09-22,
  el barrido de la BD, y dónde es probable que reaparezca (comentarios de un script one-off nuevo).

### Riesgo y verificación

- **Un susto propio:** el `sed` que corregía la gramática de la `nota` se comió el `' +` del final de
  una línea y rompió la concatenación del string. Lo atrapó `tsc` de inmediato; reparado y
  recompilado.
- El JSON se reserializó con `json.dump(indent=2, ensure_ascii=False)` y **el diff salió de 2
  líneas**: el formato original ya era ése, así que no cambió ni un número ni una clave de los 163
  diseños. Se verificó con `git diff --stat` antes de seguir.
- `npm run build` del backend: limpio. `grep -ri` en todo el repositorio: **0**.
- Los 3 scripts tocados son **one-off ya ejecutados**; no se re-ejecutaron y no había por qué.

---

## 2026-09-22 (4) — Vincular el lead APROBADO "Leonardo Ardila Osorio" a ODP-24357

Cambio de DATOS en producción, no de código. Un solo registro.

### Verificación previa (solo lectura, antes de escribir)

| | Lead 2744 | ODP-24357 (id 608) |
|---|---|---|
| Nombre | `LEONARDO ARDILA OSORIO  - @neodiwhite` | cliente `LEONARDO ARDILA OSORIO` (id 1712, doc. 1088311500) · recibe `LEONARDO ARDILA` |
| Teléfono | `3148660966` | `telefono_recibe` y celular del cliente: `3148660966` — **exacto** |
| Estado | `APROBADO` (lo exige el endpoint) · `odp_id` NULL | `LISTO_INSTALAR`, creada 2026-09-21 |

Identidad confirmada por **tres señales independientes** (nombre del lead, nombre del cliente de la
ODP y teléfono idéntico). Se comprobó además que **ningún otro lead ni prospecto** apuntaba ya a la
ODP 608 — importa porque `vincularODPAlLead` **no valida unicidad**: nada impide que dos leads
apunten a la misma ODP.

### Cómo se hizo

`2026-09-22_vincular_lead_leonardo_ardila_odp24357.ts`, copiando el patrón de
`2026-09-21_vincular_leads_aprobados_odp.ts`: **vía el endpoint HTTP real**
`PATCH /api/crm/:id/vincular-odp` con un token `root` firmado al vuelo, no con un `UPDATE` directo,
para que corran la validación de estado, la escritura del `LeadEvento` y el `emitirCambio('crm')`.
(`root` no figura en el `requireRole` de esa ruta, pero `rbacMiddleware` lo deja pasar antes de mirar
la lista.)

El backend dev se había caído a mitad de sesión, así que hubo que levantarlo para poder usar el
endpoint. Quedó corriendo.

### Verificado después

- `leads.odp_id` = 608 → ODP-24357 (`LISTO_INSTALAR`).
- `LeadEvento` 10427: `SEGUIMIENTO` · *"Lead vinculado a ODP #608."* · `creado_por` 30.
- `ultima_actividad` actualizada por el hook `LeadEvento.afterCreate` (21:13:11.892).
- `auditoria_log`: `datos_anteriores {odp_id: null}` → `datos_nuevos.odp_id 608`, `usuario_id` 30.
- Un solo lead apunta a la ODP 608.

### Dos observaciones, sin tocar

1. **La acción queda atribuida a ROOT** (`usuario_id` 30), no al asesor del lead (Alejandro Ardila,
   id 13, que lo pasó a APROBADO diez minutos antes). Es correcto —fue una acción administrativa—
   pero así se lee en el historial del lead.
2. ~~**`leads.cliente_id` sigue en NULL**~~ — **CERRADO en el tramo (5)**, a petición del usuario.

---

## 2026-09-22 (5) — Conversión lead→cliente del CRM para el lead 2744

Cierra la observación 2 del tramo (4). Cambio de DATOS, un solo registro.

### El riesgo que había que descartar primero

El cliente **ya existía** en la base (id 1712, doc. 1088311500), así que la pregunta no era cómo
convertir sino **si el endpoint iba a duplicarlo**. No lo hace: `convertLeadToCliente` deduplica por
`numero_documento` —`Cliente.findOne({ where: { numero_documento } })`— y si lo encuentra toma la
rama de "cliente existente", que sólo vincula. Crea cliente únicamente cuando el documento no existe.
Por eso el dato que importa del body es el documento.

Se verificó antes de correr que ese documento devolviera **exactamente un** cliente: con documentos
repetidos, ese `findOne` no lleva `order` y elegiría cualquiera de ellos.

### Estado previo del lead 2744

`APROBADO` · `cliente_id` NULL (si tuviera, el endpoint responde 409 "ya fue convertido") ·
`cliente_es_nuevo` NULL · `fecha_cierre` NULL · `odp_id` 608.

### Cómo se hizo

`2026-09-22_convertir_lead_leonardo_ardila_cliente.ts`, vía
`POST /api/crm/:id/convertir` con token `root`, mismo criterio que los dos scripts anteriores: el
endpoint real, no un `UPDATE`.

### Verificado después

- `cliente_id` = **1712** · `cliente_es_nuevo` = **false** · `fecha_cierre` = 2026-09-22 22:05:32.
- `odp_id` 608 intacto: la conversión no toca el vínculo con la ODP.
- `LeadEvento` 10432: `CONVERSION` · *"Lead vinculado a cliente existente: LEONARDO ARDILA OSORIO
  (ID: 1712)"*.
- **`max(id)` de `clientes` sigue en 1712** y el documento sigue devolviendo una sola fila: prueba
  dura de que no se creó ningún cliente duplicado.

La cadena del lead queda completa: `APROBADO` → vinculado a ODP-24357 → convertido a cliente 1712.

### Nota de operación

El backend dev se cayó dos veces durante estos dos tramos y hubo que relanzarlo. El primer reintento
falló con `ECONNREFUSED` pese a que `netstat` mostraba el 3001 en LISTENING: era una entrada
transitoria del proceso anterior muriendo, no el nuevo ya listo. **Comprobar el puerto no basta para
saber que el backend está listo** — lo fiable es pedirle una respuesta HTTP (un 401 de una ruta
autenticada sirve) antes de lanzar el script.

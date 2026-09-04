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

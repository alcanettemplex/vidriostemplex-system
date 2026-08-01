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

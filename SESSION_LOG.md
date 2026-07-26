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

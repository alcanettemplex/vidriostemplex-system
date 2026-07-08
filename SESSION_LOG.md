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

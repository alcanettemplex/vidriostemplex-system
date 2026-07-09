# TECH_DEBT.md

Deuda técnica identificada durante el desarrollo. Formato: fecha, severidad, descripción, estimación.

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

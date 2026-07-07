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

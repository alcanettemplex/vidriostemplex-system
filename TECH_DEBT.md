# TECH_DEBT.md

Deuda técnica identificada durante el desarrollo. Formato: fecha, severidad, descripción, estimación.

---

## 2026-07-10 — Drift RBAC: roles `auxiliar_produccion` y `taller` fuera del ENUM de Sequelize

**Severidad:** Alta

**Descripción:**
`backend-api/src/models/usuario.model.ts` define el ENUM de Sequelize del campo `rol` con 13 valores. `auxiliar_produccion` y `taller` **no están incluidos**, pero ambos se usan activamente: `frontend-web/src/components/common/Sidebar.tsx` y `frontend-web/src/routes/AppRoutes.tsx` les asignan ítems de menú y rutas propias (`auxiliar_produccion` ve `/produccion`, `/inventario`, `/pedidos-pv`), `backend-api/src/seed.ts` crea un usuario con `rol: 'auxiliar_produccion'`, y `ROLES_VALIDOS` en `server.ts` (salas de Socket.io) también lo incluye. El CHECK CONSTRAINT de Postgres sí reconoce ambos roles (reincorporados el 2026-04-12 vía `fix_constraint.ts`), pero el ENUM de Sequelize nunca se actualizó de vuelta tras removerlos el 2026-04-05.

**Riesgo real:** crear o editar un usuario con `rol='auxiliar_produccion'` o `rol='taller'` vía Sequelize (incluyendo si se vuelve a correr `seed.ts` tal como está) muy probablemente falla con un error de validación ENUM antes de llegar a la BD, aunque el CHECK CONSTRAINT de Postgres lo aceptaría. No se ejecutó el seed para confirmar en runtime (acción no de solo-lectura) — hallazgo por lectura estática del código + reconstrucción de historial git, con alta confianza.

**Cómo se detectó:** Auditoría forense completa del sistema para actualizar `CLAUDE.md` (2026-07-10). `git log -p` sobre `usuario.model.ts` reconstruyó la secuencia: creación con `auxiliar_produccion` (2026-03-08) → se agrega `taller` (2026-03-11) → se remueven ambos + `gerente` en refactor RBAC (2026-04-05, mismo día que `fix_bd.js` borró físicamente esos usuarios) → CHECK CONSTRAINT los reincorpora una semana después (2026-04-12, `fix_constraint.ts`) sin sincronizar el modelo.

**Alcance conocido:** `usuario.model.ts` (ENUM a corregir), verificar también `ROLES_VALIDOS` en `server.ts` y el tipo `RolUsuario` en `rbacMiddleware.ts` para que las 5 listas de roles del sistema queden consistentes.

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

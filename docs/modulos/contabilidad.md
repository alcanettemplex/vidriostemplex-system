# Contabilidad / Caja

Control de facturación electrónica, estado de caja, abonos y cartera de las ODPs.

- **Frontend:** `frontend-web/src/features/contabilidad/` — `ContabilidadPage.tsx` (5 pestañas + buscador maestro) y `components/`: `BuscadorMaestro`, `ControlesListado` (`CampoBusqueda`, `Paginador`), `AbonoFormModal` (con `SelectorODP`), `FacturaElectronicaModal`, `ConfirmarEliminarAbonoModal`, `AbonosODPModal`, `contabilidad.utils.ts`.
- **Backend:** `backend-api/src/controllers/contabilidad.controller.ts`, rutas en `contabilidad.routes.ts` (`/api/contabilidad`). Los cambios de estado de caja y de facturación van por `/api/odp/:id/caja` y `/api/odp/:id/facturar` (en `odp.controller`).
- **Modelos:** `ODP` (campos `valor_total`, `abono`, `pendiente`, `estado_caja`, `estado_facturacion`, `factura_electronica`, `fecha_factura`, `fecha_vencimiento_credito`, `tipo_odp`), `Pago` (`pagos`), `FacturaAdicionalODP` (FE 2.ª y 3.ª).
- **Reutilización:** `AbonoFormModal` y `FacturaElectronicaModal` también se abren desde la ficha de la ODP.

## Permisos

| Acción | Roles (backend) |
|---|---|
| `GET /odps`, `GET /pagos/:odp_id`, `POST /pagos` | admin, gerencia, contabilidad, asistente_administrativo |
| `GET /resumen`, `GET /pagos`, `PUT/DELETE /pagos/:id` | admin, gerencia, contabilidad |

- **El asistente administrativo** solo ve la pestaña Órdenes Azules y solo puede abonar a OA (el backend valida `tipo_odp === 'OA'` al registrar el pago). Desde el 2026-10-03 la página ya no le pide `/resumen` ni `/pagos`, que le respondían 403.
- **Pestaña OA:** `canSeeOA` = admin, gerencia, jefe_produccion, asistente_administrativo. **El rol `contabilidad` no la ve**, aunque el backend sí le da acceso; pendiente de confirmar con el usuario si es intencional (ver `TECH_DEBT.md` 2026-10-03).

## Pestañas: en cuál cae cada ODP

Una sola regla, `pestanaDeODP()` en `contabilidad.utils.ts`, espejada en SQL por `SQL_COMPLETADA` en el controller:

| Pestaña | Regla | Carga |
|---|---|---|
| **Estado Caja** | no OA, no completada, no NC ni garantía | `GET /odps?vista=operativa&limit=500`, filtro local |
| **Proceso Completado** | no OA + FE registrada + caja `CANCELADO` | `GET /odps?vista=completado`, paginada (100), orden y búsqueda en el servidor |
| **Órdenes Azules** | `tipo_odp = 'OA'` | la misma carga `operativa`, filtro local |
| **Cartera Vencida** | pendiente > 0, no cancelada, y fecha de entrega vencida (o crédito aprobado con vencimiento pasado) | `cartera_detalle` de `GET /resumen`, **completa** (sin tope), las más vencidas primero, filtro local |
| **Pagos Recientes** | todos los pagos | `GET /pagos`, paginada (100), búsqueda en el servidor |

- **Cartera Vencida es adicional:** una ODP puede estar a la vez en Estado Caja y en Cartera Vencida.
- **NC y garantías** no cobran ni llevan FE, así que no están en ninguna pestaña. El buscador maestro las muestra como "No figura en Contabilidad".
- **Por qué `vista=operativa`:** hasta el 2026-10-03 la página pedía todas las ODPs con `limit=500`. Con 599 ODPs quedaban fuera las 99 canceladas más viejas (abril de 2026): 89 completadas, 7 de Estado Caja y 3 OA. Ahora la carga operativa excluye el histórico completado (155 filas al 2026-10-03). Si alguna vez supera las 500, la página muestra un aviso en lugar de ocultarlas.

## Búsqueda

**Regla única en el servidor:** `condicionBusquedaODP(odpIdExpr, q)` en el controller. Encuentra coincidencias en el número de ODP, la FE principal y las adicionales, el nombre del cliente, el NIT (tal como está guardado y también comparando solo dígitos, a partir de 3) y el asesor. La usan:
- `GET /odps?q=`, sobre `"ODP"."id"`;
- `GET /pagos?q=`, sobre `"Pago"."odp_id"`, sumando el recibo (`referencia_pago`) y las observaciones.

**Detalles de la implementación:**
- **Sin tildes:** la BD **no tiene `unaccent`** instalada, así que se usa `translate()` nativo de Postgres sobre `lower()`. El término llega normalizado igual (NFD sin diacríticos).
- **Seguridad:** el término va con `sequelize.escape` y los comodines `% _ !` se escapan con `ESCAPE '!'`. Buscar `%%` devuelve 0 resultados, no todo.
- **Validación:** Zod `.strict()` sobre la query. `q` necesita entre 2 y 100 caracteres; con menos responde 400 con un mensaje legible.
- **En el navegador:** `coincideODP()` en `contabilidad.utils.ts` aplica el mismo criterio sobre lo ya cargado (Estado Caja, OA y el selector de ODP del abono), con `normalizarTexto`/`coincideBusqueda` de `frontend-web/src/utils/busqueda.ts`.
- **Espera de escritura:** las búsquedas en el servidor esperan 300 ms sin escribir (`useValorDiferido`). Una respuesta vieja se descarta con un contador de consultas (`consultaRef`).

**Buscador maestro** (`BuscadorMaestro.tsx`, en el encabezado):
- Consulta `/odps?q=&limit=30` y `/pagos?q=&limit=8` en paralelo, y marca cada ODP con su pestaña y, si aplica, "Cartera Vencida · N días", cruzando con `cartera_detalle`.
- **Clic en una etiqueta:** cambia a esa pestaña y deja su buscador escrito con el número de ODP (`irAPestana`). **Clic en el número:** abre la ficha.
- **Respeta el rol:** oculta lo que el rol no puede ver y avisa cuántos resultados ocultó. Para el asistente no consulta pagos.

## Tiempo real

- `useDataChangedSocket('contabilidad')` recarga todo: operativas, resumen, pagos y la página actual de completadas.
- `useODPSocketPatch({ setOdps, setOdpsOA, setSoloActualizar: setCompletadas })`. `setSoloActualizar` se agregó el 2026-10-03: aplica los cambios y borrados de una ODP a la página de completadas, pero nunca le agrega ODPs nuevas.
- `aplicarPatchODP()` aplica un cambio local (estado de caja, FE, FE adicionales) en las tres listas y recarga Completado si la ODP entra o sale de esa pestaña.

## Bugs conocidos / decisiones

- **2026-09-16 (ODP-23859):** una ODP vieja con saldo abierto quedaba fuera del corte de 500. Se resolvió poniendo primero las no canceladas, orden que se conserva cuando no se pide otro.
- **2026-10-03:**
  - Cartera Vencida tenía `limit: 15`: mostraba 15 ODPs mientras el total en rojo sumaba las 28. Se quitó el límite y la consulta ahora pide solo las columnas que usa.
  - Proceso Completado paginado en el servidor (decisión del usuario: ver los 444 completos, no solo los recientes).
- `pendiente` guardado en BD manda sobre `valor_total - abono` (`calcPendiente`), porque ya descuenta diferencia y retención.
- `GET /resumen` devuelve `pagos_recientes`, que el frontend no usa (ver `TECH_DEBT.md` 2026-10-03).

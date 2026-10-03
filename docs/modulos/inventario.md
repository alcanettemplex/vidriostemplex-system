# Inventario de Perfilería

Piezas de perfil de aluminio sobrante (retazos y barras) que quedan en bodega, cada una con un **consecutivo** que es el número de su etiqueta física.

- **Tabla:** `inventario_perfileria` (`id`, `consecutivo`, `codigo`, `mm`, `ubicacion`, `fecha_corte`, `creado_en`). Sin timestamps de Sequelize.
- **Modelo:** `backend-api/src/models/inventario_perfileria.model.ts`. Auditado (`MODELOS_AUDITADOS`) y revertible desde ROOT.
- **Relación:** `codigo` cruza con `catalogo_productos.codigo` (`belongsTo … as 'catalogo'`). Sin validación contra catálogo: existen códigos legítimos fuera de él (JAM0201, SIL0204…).
- **Frontend:** `frontend-web/src/features/inventario/` — `InventarioPage.tsx` (Lista, Por código, Reporte) e `IngresarPerfilModal.tsx`.
- **Rutas:** `/api/inventario-perfileria` (`inventario_perfileria.routes.ts`).

## Permisos

| Acción | Roles |
|---|---|
| Ver, resumen, exportar | admin, gerencia, compras, produccion, jefe_produccion, auxiliar_produccion, marketing |
| Ingresar, editar, eliminar | admin, gerencia, compras |

Los botones de ingreso en `InventarioPage.tsx` usan la misma lista (`puedeIngresar`). Hasta el 2026-10-03 se mostraban también a producción, jefe y auxiliar, que recibían 403 al guardar.

## Consecutivo

- **Índice único** `inventario_perfileria_consecutivo_key` desde el 2026-10-03 (script `2026-10-03_unique_consecutivo_inventario.ts`). Antes el modelo decía `unique: true` pero la tabla real no tenía la restricción.
- **Numeración no continua:** al 2026-10-03 había 707 piezas entre el 752 y el 11318, con 321 rangos libres. Los huecos son piezas consumidas o borradas.

### Dos formas de ingresar

| Botón | Endpoint | Consecutivo | Si el número choca |
|---|---|---|---|
| **Ingresar Perfilería** | `POST /bulk` | El sistema: `MAX + 1` por fila | Error 500 (solo ocurre si dos ingresos corren a la vez) |
| **Ingresar con consecutivo** (2026-10-03) | `POST /bulk-manual` | Lo escribe el usuario; la fila siguiente propone +1 | Guarda las filas válidas y devuelve las rechazadas con su motivo |

- `POST /verificar-consecutivos` `{ consecutivos: number[] }` devuelve `ocupados` (con código y ubicación) y `ultimo_consecutivo`. El modal lo llama al abrir (lista vacía, para mostrar el último) y al salir de cada campo de consecutivo (advertencia en vivo).
- `bulk-manual` inserta pieza por pieza dentro de una transacción, con savepoint por fila: si otro ingreso toma el número entre la verificación y el INSERT, el índice único rechaza solo esa fila ("Lo acaba de tomar otro ingreso"). Cada pieza dispara el hook de auditoría.
- **Decisiones del usuario (2026-10-03):** un número ocupado no bloquea el lote; los consecutivos consumidos por Compras quedan libres para reutilizar; mismos roles que el ingreso normal.
- **Efecto sobre la numeración automática:** `MAX + 1` sigue al número más alto, incluido uno manual. Un consecutivo manual alto (p. ej. 20000) hace saltar la numeración automática a 20001.

## Interacción con Compras (existencia de perfilería)

Compras cubre ítems de SAP con piezas del inventario (`odc.controller.ts`):
- **Consumir:** borra las piezas por consecutivo (`InventarioPerfileria.destroy`) y guarda un snapshot en `sap_items.existencia_piezas` (JSONB).
- **Revertir:** recrea las piezas con su **mismo consecutivo** desde el snapshot. Si el número ya está ocupado, responde 409 "uno o más consecutivos ya existen". Esa respuesta depende del índice único: sin él, el duplicado entraba en silencio.
- Al 2026-10-03 había 206 consecutivos consumidos en snapshots (del 6587 al 11224), ninguno ocupado en el inventario. Si el usuario reutiliza uno de ellos, la reversión de esa asignación queda bloqueada hasta liberar el número.
- `GET /api/compras/inventario-perfileria/:codigo` lista piezas por código para asignarlas.

## Otros consumidores

- Panel ROOT → alertas: "códigos con menos de 5 piezas" (`root.controller.ts`).
- Script `fix_inventario_10789_10812_2026-07-07.ts`, histórico.

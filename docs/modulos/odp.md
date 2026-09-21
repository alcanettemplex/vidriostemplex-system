# ODP — Documentación de Módulo

> Entidad central del sistema. Este archivo concentra el detalle forense (motores de lógica,
> puntos de llamada, bugs conocidos, decisiones del usuario) para no rehacer el rastreo completo
> cada vez que se toca el módulo. El resumen de alto nivel y el link de vuelta viven en
> `CLAUDE.md` → "Entidad Central: ODP". Ver también `docs/modulos/compras.md` para SAP/ODC/PedidoPV,
> que interactúan directamente con el motor de checks descrito abajo.

Modelo: `backend-api/src/models/odp.model.ts`. **Sin timestamps** (`timestamps: false`) — usa `fecha_creacion` manual.

## Estados de Producción
```
EN_ESPERA → VISITA_TECNICA → MEDICION → ALUMINIO_CORTADO
→ VIDRIO_RECIBIDO → ACCESORIOS_SEPARADOS → LISTO_INSTALAR → PROGRAMADA
→ INSTALADA → ENTREGADA | PAUSADA
```

⚠️ **`PEDIDO_PROVEEDOR` existe en el ENUM de Postgres (posición 3) pero NO se usa.** No está en el ENUM de Sequelize (`odp.model.ts`) —lo que impide asignarlo desde el backend— ni lo referencia ya ningún archivo del código (retirado de `ESTADOS_NC_ACTIVOS` el 2026-08-01). El seguimiento al proveedor vive en Compras y Pedidos PV. El valor permanece en la BD porque 4 registros de `historial_estados_odp` lo referencian; eliminarlo obligaría a recrear el tipo. Si una ODP llegara a ese estado por edición directa en Supabase, **desaparecería del tablero de Producción** (no está en `ESTADOS_PRODUCCION_VISIBLES` ni en `activeStates`). Ver `TECH_DEBT.md` 2026-08-01.

## Estados Facturación / Caja
- Facturación: `PENDIENTE → FACTURADA`
- Caja: `PENDIENTE → ABONADO → CANCELADO | CREDITO_APROBADO`

## Campos chk_* (booleanos de progreso, independientes del estado)
`chk_medicion`, `chk_corte`, `chk_vidrio`, `chk_accesorios`, `chk_ensamble`, `chk_matizado`, `chk_pelicula`, `chk_huacal`, `chk_carton`

⚠️ **Toda la lógica de checks vive en `utils/checksAutomaticos.ts` — no duplicarla.** Desde el 2026-09-09 hay un motor único (`recalcularChecksODP`) que concentra: cálculo del check, `fecha_chk_accesorios`, avance de estado, auto-transición a `LISTO_INSTALAR`, retroceso, `historial_estados_odp` y `emitirODPPatch`. `updateODP` consume de ahí `evaluarListoInstalar()` y `evaluarRetroceso()`, así que el marcado manual y el automático comparten criterio por construcción. Vive en `utils/` por el mismo ciclo que `pedidoPvCapacidad.ts` (`server → app → routes → controller`); `../server` y `./notificaciones` entran por import dinámico.

- **`chk_accesorios` (Herrajes) es calculable**: marcado ⇔ la ODP tiene ≥1 SAP, ninguna SAP vacía y **todas** las líneas de **todas** sus SAP en `estado_compra = 'en_existencia'`. Recibir una ODC ya pasa sus `SAPItem` a `en_existencia`, así que "todos en S" y "todos en una ODC recibida" son la misma condición. Una SAP en borrador sin ítems **bloquea**.
- **`chk_vidrio` es dirigido por evento, no calculable**: marca cuando una vía se cierra (todos los `PedidoPV` en `VERIFICADO`, o una ODC `tipo='vidrio'` recibida) y desmarca cuando cualquier vía se reabre (`PROBLEMA`, reposición, ODC revertida o eliminada). Verificar un PV cuando aún faltan otros **no toca nada** — el desmarcado está reservado a los eventos que reabren la vía.
- **El automático manda sobre la marca manual** (decisión del usuario, 2026-09-09): el check cae aunque lo hubiera puesto una persona. Las celdas siguen siendo clicables a mano.
- **El retroceso de estado solo ocurre desde `LISTO_INSTALAR`.** Una ODP ya `PROGRAMADA` o más allá pierde el check pero conserva el estado.
- **19 puntos de llamada** en `odc.controller` (10), `sap.controller` (3) y `pedido_pv.controller` (4), más los dos consumos de `updateODP`. `sincronizarItemODC` queda fuera a propósito: solo limpia `modificado`, no mueve `estado_compra`.
- El motor **se detiene sin escribir si nada cambia** — se llama desde 19 sitios y no puede generar auditoría ni sockets en cada guardado. Con transacción, la emisión se aplaza vía `transaction.afterCommit`.
- `historial_estados_odp.automatico` (BOOLEAN, 2026-09-09) marca estos movimientos. Los alimenta a `GET /api/odp/movimientos-automaticos` → pestaña **"Automáticos"** del tablero de Producción (últimos 10).

## Impresión de la OP (pestaña "Por Imprimir")
`fecha_impresion_op` (NULL = pendiente) + `impresa_por_id`, 2026-09-09. **El amarillo del tablero
es derivado, no un color guardado**: antes el taller pintaba `color_taller = '#FEF9C3'` a mano para
marcar "ya impresa" y la migración tradujo esas 414 filas. Si hay `color_taller` manual, manda el
manual. Se marca solo al abrir la ventana de impresión —el navegador no confirma que el papel
salió (`afterprint` dispara también al cancelar)— y se revierte con el ícono de impresora de la
fila. Escribe por `PATCH /api/odp/marcar-impresas` (endpoint propio, declarado **antes** de `/:id`;
`individualHooks: true` o la auditoría no dispara) y **no** por `PUT /:id`: pasar por `updateODP`
arrastraría el motor de checks, las transiciones de estado y la creación de Pedidos PV para
escribir un timestamp. La marca es global vía `emitirODPPatch`. ⚠️ Al imprimir en lote, el salto
de página entre órdenes lo impone el contenedor de cada una salvo la última: los dos imprimibles
evitan el salto en su última hoja para no sacar una página en blanco, y concatenados sin eso la
siguiente orden arranca pegada a la anterior.

## ODP No Conformidad
Hija con `odp_padre_id` + `es_no_conformidad: true`. Padre → PAUSADA. Se reactiva a **INSTALADA** cuando la hija llega a `INSTALADA` **o a `ENTREGADA`** — ese es su estado terminal, no avanza a ENTREGADA. NC no cobran al cliente → `estado_caja = CANCELADO`.

⚠️ **La reactivación está implementada en cinco puntos distintos** y todos deben mantenerse en sincronía: `updateODP` (`odp.controller.ts`), `finalizarInstalacion` y `entregarAtascada` y `terminarRutaConductor` (`rutas.controller.ts`), y el flujo de evidencias (`evidencia.controller.ts`). Desde que existe `INSTALANDO` (2026-09-02) el flujo por ruta va `PROGRAMADA → INSTALANDO → ENTREGADA` **sin pasar por `INSTALADA`**, así que cualquier regla que compare contra el valor exacto `'INSTALADA'` deja al padre huérfano en PAUSADA para siempre — fue el bug de ODP-23925, corregido el 2026-09-03. `finalizarInstalacionODP` (`odp.controller.ts`, endpoint huérfano) sigue sin esta verificación: ver `TECH_DEBT.md` 2026-09-03.

**NC creada directamente, sin flujo formal ni padre:** `createODP` acepta `es_no_conformidad: true` sin exigir `odp_padre_id` (`odp.controller.ts:741-754`, pensado para reprocesos donde la ODP origen no existe en el sistema) — fuerza igual `estado_caja: 'CANCELADO'`. El PUT de edición (`updateODP`) también acepta el campo sin bloqueo extra, aunque el formulario del frontend (`ODPForm.tsx:920`) solo muestra el checkbox al crear; marcar una ODP ya existente como NC hoy solo es posible por API/script directo, no hay UI para eso. Así se marcaron ODP-23891 y ODP-23857 el 2026-09-21 (mal elaboradas originalmente, sin ODP padre real, por decisión del usuario) — ver `scripts/marcar_nc_odp23891_23857_2026-09-21.ts`.

⚠️ **Contabilidad no tenía ningún concepto de NC/garantía hasta el 2026-09-21** — `contabilidad.controller.ts` (contador `pendientes_factura` y `getContabilidadODPs`) y `ContabilidadPage.tsx` (pestaña "Estado Caja", que sale del filtro `factura_electronica && estado_caja==='CANCELADO'`) filtraban solo por `estado_facturacion`/`factura_electronica`, nunca por `es_no_conformidad`/`es_garantia`. Efecto: **toda** ODP hija de NC —incluida la creada por el flujo formal con padre, no solo las marcadas a mano— se quedaba para siempre en "pendiente por factura" porque nunca llega a tener FE. Corregido agregando la exclusión en ambos lados (backend: `where` del contador + `attributes`; frontend: filtro de la pestaña y el fallback del contador). Como ninguna NC tiene FE, tampoco caían en "Completado" (exige FE): con el fix, las NC simplemente dejan de listarse en Contabilidad salvo búsqueda directa — coherente con que no cobran al cliente.

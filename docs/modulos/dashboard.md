# Dashboard Gerencial

Ruta `/` (Dashboard del área superior). Componente `frontend-web/src/components/dashboard/GerenciaDashboard.tsx`
con un panel por tab en `components/dashboard/panels/`. Datos por `hooks/useDashboardData.ts`.

Backend: `routes/dashboard.routes.ts` → `controllers/dashboard.controller.ts` (+ `dashboard_cotizaciones.controller.ts`
para el tab Cotizaciones, que lee el schema `cotizador`).

| Tab | Endpoint | Handler | Caché |
|---|---|---|---|
| Visión general | `GET /api/dashboard/general` | `getGeneralData` | 30 min |
| Ventas & cartera | `GET /api/dashboard/ventas` | `getVentasData` | 30 min |
| Producción | `GET /api/dashboard/produccion` | `getProduccionData` | 30 min |
| Equipo | `GET /api/dashboard/equipo` | `getEquipoData` | 30 min |
| Alertas | `GET /api/dashboard/alertas` | `getAlertas` | **sin caché** |
| Cotizaciones | `GET /api/dashboard/cotizaciones` | `getPanelCotizaciones` | 5 min, por alcance |
| (modal) Cartera Vencida | `GET /api/dashboard/cartera-vencida` | `getCarteraVencida` | 30 min |
| (modal) Pedidos Cobrados / Facturados | `GET /api/dashboard/pedidos-facturados?modo=&medida=` | `getPedidosFacturados` | 30 min |

Período: `mes_inicio/anio_inicio/mes_fin/anio_fin`, cortado en medianoche de Bogotá (`parsePeriod` →
`rangoMesesBogota`). Las cifras "del período" filtran por `odp.fecha_creacion`.

---

## Caché e invalidación (2026-10-08)

`cacheRespuesta(ttl)` (`utils/cacheMemoria.ts`) guarda la respuesta por método + URL, **compartida entre
usuarios** y por proceso. El botón de refrescar del frontend NO la salta.

Se purga con `invalidarCacheDashboard()` después de cada escritura que mueve las cifras (siempre después
del commit de la transacción):

| Dónde | Por qué |
|---|---|
| `odp.controller` `createODP`, `crearGarantia` | ODP nueva |
| `crm.controller` crear ODP desde lead | ODP nueva |
| `no_conformidad.controller` ODP de reproceso | ODP nueva |
| `odp.controller` `updateODP` (si cambia `valor_total`), `facturarODP`, FE adicional (alta/baja) | Montos / facturación |
| `configuracion.controller` `updateConfiguracion`, `actualizarMetasUsuariosMes` | Meta global, umbral de cartera, metas por asesor |

**No** invalidan (siguen con TTL): anular / reactivar / borrar ODP, pagos y cambios de `estado_caja`.

Caso real que lo motivó: se cargaron las metas de octubre y el tab Ventas siguió mostrando la caché previa
— meta global $5M (respaldo de Configuración) → "2522%" y $0 en cada asesor.

---

## Visión general — "Pedidos Cobrados" vs "Facturados" (2026-10-16)

Dos tarjetas hermanas, con la misma anatomía (selector de criterio propio, desglose Base/IVA sin
las OA, barra "Del monto ingresado", "Ver detalle" al mismo modal `PedidosFacturadosModal`):

| Tarjeta | Mide | Creadas y facturadas | Todas facturadas (rango) |
|---|---|---|---|
| **Pedidos Cobrados** | **abono** (caja, decisión 2026-09-15) | `abono` de ODPs creadas en el período con FE | `sqlCobradoEnRango`: abono a la fila de la FE principal, adicionales $0 |
| **Facturados** | **monto de las FE** (devengo) | `sqlFacturadoCreadasEnRango`: principal + **todas** sus adicionales de las ODPs creadas en el período, sin importar la fecha de cada FE | `sqlFacturadoEnRango`: cada FE con fecha en el período y su propio monto — **misma cifra que el Informe Ejecutivo** |

- Campos de `/general`: Cobrados = `facturado_con_factura[_oa]` / `facturado_rango[_oa]` (nombres
  históricos); Facturados = `fe_monto_creadas[_oa]` / `fe_monto_rango[_oa]`.
- El modal recibe `medida=abono|monto_fe` (por defecto `abono`) y responde el campo `monto`. Cada
  combinación replica la regla de su tarjeta: la suma del modal **cuadra con la tarjeta** (verificado
  2026-10-16 en oct-2026: creadas $9.159.949 / 14 ODPs, rango $93.931.727 / 50 FE).
- Monto de la FE principal = `COALESCE(monto_factura_principal, valor_total)` (red por TECH_DEBT 2026-07-26).
- La barra de Facturados se llena hasta 100% pero el número muestra el real: en modo rango puede pasar
  de 100% (se facturan ODPs de meses anteriores). La de Cobrados conserva el tope en 100%.
- "Total Recaudado" (abono de todas las ODPs del período, con o sin FE) salió de Visión general el
  2026-10-16; `total_abonado` sigue en la respuesta y el dato vive en el tab Ventas ("Recaudado").

---

## Cartera vencida — regla ÚNICA del dashboard (2026-10-08)

`utils/carteraVencida.ts` → `consultarCarteraVencida(umbral?)`. **Toda vista de cartera del dashboard pasa
por aquí**: tarjeta de Visión general, modal Cartera Vencida, tab Ventas y la parte de cartera del tab Alertas.

Regla contable (decisión del usuario): `forma_pago='credito'`, `pendiente > 0`, `factura_electronica` no
nula, `estado_caja <> 'CANCELADO'` y `fecha_factura < hoy(Bogotá) − dias_alerta_cartera_vencida`.

- **Foto de hoy**, nunca filtrada por período.
- `dias_vencido` = días desde la fecha de la **FE principal**.
- Riesgo: `> 2×umbral` crítico, `> 1,5×umbral` alerta, si no normal (`riesgoCartera`). Alertas lo traduce
  a `critico/alto/medio`.
- Rangos de antigüedad con clave fija (`normal/alerta/critico`); el texto (`">60 días"`) se arma con el umbral,
  así que el frontend busca por `clave`, nunca por el texto.
- Una ODP a crédito **sin FE no es cartera** (todavía no hay documento que cobrar).

Antes convivían tres reglas: Visión general/modal con `fecha_factura`; Alertas con `fecha_entrega` sin
exigir FE; Ventas con `fecha_entrega` **y filtrado por mes de creación** con `limit: 10` — el tab mostraba
"Sin cartera crítica" con 9 ODPs / $168,3M vencidos (verificado 2026-10-08; Alertas mostraba 12 / $172,6M).

**Fuera del dashboard siguen otras reglas** (ver `TECH_DEBT.md` 2026-10-08): Cartera de Contabilidad
(`fecha_vencimiento_credito` / `fecha_entrega`), Informe Ejecutivo (`fecha_entrega`) y el filtro
`cartera_vencida=true` de `utils/odpFiltros.ts` (Supervisión CRM).

---

## Tab Ventas & cartera (`PanelVentas.tsx` / `getVentasData`)

- **"Vendido / Contratado"** (antes rotulado "Facturado", 2026-10-08) = `SUM(valor_total)` de las ODPs
  **creadas** en el período, tengan o no FE. No es facturación. El campo del API conserva el nombre
  `total_facturado_mes` por compatibilidad. En Visión general "Facturados" sí es monto de FE y "Pedidos
  Cobrados" es abono de ODPs con FE (ver sección de arriba) — no confundir.
- **Meta del período** (`metaDelPeriodo`, compartida con Visión general): suma de `metas_usuario_mensual`
  de los meses del período; si nadie tiene meta, `configuracion_global.meta_facturacion_mensual`; si tampoco,
  0 y el panel dice "No hay meta configurada". Ya no hay respaldo fijo de 120.000.000.
- **Ranking** (roles `asesor_comercial`, `gerencia`, `jefe_produccion`): vendido = `valor_total`,
  recaudado = `abono`, meta = suma de sus metas del período. **Meta 0 es intencional** (decisión del usuario:
  Alejandro Ardila y Nataly Londoño en oct-2026): se muestra "Sin meta" en neutro, guion en la columna Meta
  y sin barra — no "0%" en rojo.
- Recaudado / Pendiente / Ticket promedio / Sin facturar / Top cliente: del período por `fecha_creacion`.
- Desglose Base/IVA calculado en el frontend al 19%, descontando la porción de OAs (sin IVA).
- "ODPs vencidas sin entregar": snapshot, `fecha_entrega < hoy`, excluye ENTREGADA/INSTALANDO/INSTALADA/ANULADA
  **y las ya pagadas** (`estado_caja = CANCELADO`).

## Inconsistencias conocidas, sin corregir (decisión pendiente)

1. Las ODPs `ANULADA` suman en vendido, recaudado, pendiente, ticket, top cliente y ranking.
2. "ODPs vencidas sin entregar" (Ventas) y "producción fuera de plazo" (Alertas) usan exclusiones distintas
   (la primera excluye pagadas; la segunda excluye LISTO_INSTALAR e incluye a 2 días de vencer).
3. El ranking del tab **Equipo** usa `abono + pendiente` y solo `asesor_comercial`; el de Ventas usa
   `valor_total` y suma gerencia y jefe de producción.
4. Top cliente suma `abono + pendiente`; el resto del tab `valor_total` (hoy coinciden: 0 descuadres).

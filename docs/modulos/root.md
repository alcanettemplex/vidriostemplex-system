# Módulo Panel ROOT

Panel exclusivo del rol `root` (`/root`): capacidad de la infraestructura, diagnóstico del flujo de ODP, alertas operativas, seguridad, auditoría con revertir, backup, mantenimiento y catálogo. **Solo lo usa `root`**, así que sus cambios no afectan la operación de los demás roles, pero varias de sus acciones escriben en producción.

> Análisis forense completo y correcciones: **2026-10-23** (13 pestañas, 15 endpoints, cifras medidas contra la BD real).

## Dónde vive

- **Backend:** `controllers/root.controller.ts`, rutas en `routes/root.routes.ts` (`authMiddleware` + chequeo inline `rol === 'root'`, no `rbacMiddleware`).
- **Frontend:** `features/root/RootPage.tsx` (un solo archivo, ~2.200 líneas, `fetch` en vez de Axios; ver TECH_DEBT.md 2026-10-23).
- Pestañas: Resumen, Diagnóstico, Operativo, Monitoreo, Seguridad, Base de Datos, Almacenamiento, Servicios, Auditoría, Backup, Mantenimiento, Catálogo. **Alertas se retiró el 2026-10-23.**

## Endpoints (`/api/root`)

| Ruta | Qué devuelve |
|---|---|
| `GET /metricas/supabase` | Tamaño de la BD (límite plan Free 500 MB), tablas de `public` + `cotizador`, conexiones. `conexiones.del_pool` = las de la aplicación (`application_name = 'Supavisor'`) contra `SUPABASE_POOL_SIZE` (15 por defecto); `total` incluye los servicios internos de Supabase (PostgREST, pg_cron, exporter...) |
| `GET /metricas/cloudinary` | Uso de la API `/usage`. **`creditos`** es el tope real del plan Free (créditos combinados); storage, ancho de banda y transformaciones son datos, sin límite propio |
| `GET /servicios/health` | Backend `/health`, frontend, Supabase con `SELECT 1`, Cloudinary/GitHub/Render por su página de estado |
| `GET /auditoria` | Paginado (máx. 200). Completa `usuario_nombre` con el nombre actual del usuario cuando la fila no lo guardó |
| `POST /auditoria/:id/revertir` | Ver «Revertir» |
| `GET /backup/descargar` | `.sql` de `public` + `cotizador`, **sin `auditoria_log`** salvo `?incluir_auditoria=true` |
| `GET` o `POST /mantenimiento/:tarea` | Tareas de diagnóstico; las destructivas solo por POST con `confirmar: true` |
| `GET /diagnostico/odp` | 5 consultas de flujo de ODP; devuelve `dias_estancada` |
| `GET /operativo/resumen` | NC abiertas, PV en PROBLEMA, entregadas sin facturar, créditos vencidos sin pagar, rutas en curso |
| `GET /seguridad/actividad`, `/seguridad/detalle-usuario/:id` | Actividad 7 días, IPs, DELETEs, usuarios sin actividad 90 días |
| `GET /monitoreo` | Atascadas, PV por estado, cotizaciones > 30 d, sin evidencias, tablas grandes, auditoría, cartera, prospectos, login fallidos, cron PV, WebSocket, rate limit |

## Reglas (2026-10-23)

- **Días de alerta desde Configuración:** «ODP atascadas» (Monitoreo) y «EN_ESPERA estancada» (Diagnóstico) usan `configuracion_global.dias_alerta_odp_estancada` (`diasOdpEstancada()`); las ANULADAS no cuentan. Antes: 7 días fijos, y el título de EN_ESPERA decía 30.
- **Cartera vencida = la regla única del Dashboard** (`consultarCarteraVencida()`, `utils/carteraVencida.ts`). Antes el panel usaba la fecha de entrega y 30 días fijos.
- **Créditos vencidos** = vencimiento pasado y caja distinta de CANCELADO. Antes filtraba «no facturada» y escondía las facturadas sin pagar (0 en vez de 4).
- **Usuarios sin actividad 90 días** = usuarios **activos** sin ninguna fila propia (`usuario_id`) en la auditoría (`usuariosSinActividad90d()`, compartida por Seguridad y Mantenimiento). Antes contaba a quién le editaron la ficha (16 en vez de 2-3).
- **Sin evidencias** = ODP instaladas/entregadas sin foto que llegaron a ese estado en los últimos 30 días.
- Quitadas: «SAPs sin ODC» (`ordenes_compra.sap_id` es un vínculo heredado: 428 de 439 SAP marcadas), «Inventario < 5 piezas» (inventario de sobrantes: 247 de 276 códigos) y la card de Egress escrita a mano en mayo.
- Cron PV, clientes WebSocket y rate limit viven en memoria: se reinician con cada despliegue (la card lo dice).

## Revertir (reescrito 2026-10-23)

- Allow-list `TABLAS_AUDITABLES` (no es 1:1 con `MODELOS_AUDITADOS`). Las etiquetas `saps` / `ruta_odps` que graban los hooks se traducen a las tablas reales (`TABLA_REAL`); `cotizador.producto` y `cotizador.precio_override` usan `codigo` como clave (`PK_TABLA`). Antes esos 4 casos fallaban siempre con 500.
- Si el registro tiene cambios posteriores en la auditoría: **409** con `posteriores`; la pantalla pide una segunda confirmación y reintenta con `?forzar=true`.
- Corre en una transacción y graba su propia fila `operacion = 'REVERT'` (estado previo en `datos_anteriores`, `revierte_auditoria_id` en `datos_nuevos`, usuario e IP del contexto). Las filas `REVERT` y `LOGIN_FAIL` no muestran botón de revertir.
- Verificado solo el camino 409 (no escribe). El camino que escribe no se ejecutó contra producción.

## Backup

- Descargar: ~25 MB sin auditoría (medido 2026-10-23). La auditoría pesa 59 MB de los 95 MB de la BD.
- **Restaurar se retiró del panel** (decisión del usuario, 2026-10-23): partía por «;», insertaba en orden alfabético, no reajustaba secuencias (incidente 2026-07-02), con `ON CONFLICT DO NOTHING` no cambiaba nada sobre una BD con datos y el archivo supera el límite de 10 MB del body. Para restaurar: respaldos de Supabase o `pg_restore`.

## Mantenimiento

- `limpiar_auditoria` es la única destructiva (`TAREAS_DESTRUCTIVAS`): confirmación en pantalla + POST con `confirmar: true`; mínimo 30 días aunque el cuerpo pida menos. Antes también corría por GET.

## Bugs conocidos / pendientes

- `usuario_nombre` casi nunca se graba: el JWT solo lleva `id` y `rol`, y el middleware de contexto (`app.ts`) busca `nombre_completo` en el token. El panel lo compensa al leer (TECH_DEBT.md 2026-10-23).
- El pool de la aplicación estaba en **14 de 15** al medir (con el backend local abierto): vigilar.
- Tabla `alertas_umbral` sin uso desde que se retiró la pestaña.
- Refactor del frontend (Axios, un archivo por pestaña) pendiente.

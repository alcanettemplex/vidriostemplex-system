# Rutas e Instalaciones

Programación y seguimiento de las instalaciones en obra: el jefe arma **rutas** con ODPs listas, el **oficial** las inicia y finaliza desde su app, el **conductor** (opcional) registra el transporte.

- **Modelos:** `RutaInstalacion` (`rutas_instalacion`), `RutaODP` (`ruta_odp`, una fila por **parada**), tabla puente `ruta_instaladores` (M:M, sin modelo), `AgendaInstalacion` (planeación tentativa, sin auditoría), `Vehiculo`. `RutaODP` es tabla **singular**: revertirla desde ROOT falla (ver `TECH_DEBT.md` 2026-07-10).
- **Backend:** `controllers/rutas.controller.ts` (todo) y `controllers/agenda.controller.ts`; rutas en `routes/rutas.routes.ts` bajo `/api/rutas`.
- **Frontend:** `features/instalaciones/` — `JefeView` (gestión), `InstaladorView`, `ConductorView`, `InstaladorGestionTab`, `AgendaTab`, `ProgramarRutaModal` (lo abren JefeView, Agenda, Instaladores y la Zona de Despacho de `ProduccionPage`), `ProgramadosTab` + `RutaCard` (pestaña Programados), `CerrarAtascadaModal`. Utilidades: `utils/estadoInstalacion.ts` (etiquetas y fechas de ruta) y `utils/hojaRuta.ts` (Hoja de Ruta impresa).

## Ciclo de vida

**Ruta** (`rutas_instalacion.estado`): `programada → en_curso → completada | cancelada`.
**Parada** (`ruta_odp.estado`): `pendiente → en_curso → completada | pausada | con_dano`.
**ODP** (`estado_produccion`): `LISTO_INSTALAR → PROGRAMADA → INSTALANDO → ENTREGADA` (o `INSTALADA` por otros caminos).

| Evento | Quién | Parada | ODP | Ruta |
|---|---|---|---|---|
| Crear ruta | jefe | `pendiente` | → `PROGRAMADA` | `programada` |
| Iniciar ruta | conductor | — | — | → `en_curso` (`inicio_ruta`) |
| Iniciar instalación | oficial (instalador) | → `en_curso` | → `INSTALANDO` | → `en_curso` si estaba `programada` |
| Finalizar (foto obligatoria) | oficial o jefe | → `completada` | → `ENTREGADA` | se cierra si no le quedan paradas vivas |
| Pausar | oficial o jefe | → `pausada` | → `LISTO_INSTALAR` | se cierra si no le quedan paradas vivas |
| Reportar daño | instalador | → `con_dano` | sigue `INSTALANDO` (+ `tiene_dano_instalacion`) | — |
| Terminar ruta | conductor (llegada en todas) | — | acarreo puro → `ENTREGADA` | → `completada` |
| Cancelar | jefe | sin cambio | pendientes en `PROGRAMADA` → `LISTO_INSTALAR` | → `cancelada` |
| Unir (2026-10-05) | jefe | se mueven a la destino | sin cambio | origen → `cancelada` |

- **Paradas vivas** = `pendiente`, `en_curso`, `con_dano` (constante `PARADAS_VIVAS`). Mientras una ruta tenga una, sigue abierta y la ODP está "tomada" por ella. `cerrarRutaSiSinPendientes()` la cierra cuando no queda ninguna.
- **El conductor es opcional** (decisión del usuario 2026-10-05; 43 % del historial no lo tiene). Sin conductor nadie corre `iniciar-ruta`/`terminar-ruta`: la ruta pasa a `en_curso` cuando el oficial inicia la primera parada y se cierra con la última parada cerrada.
- **El oficial no es opcional en la práctica:** en `InstaladorView` solo el oficial ve "Iniciar trabajo" y las acciones en curso. Sin oficial nadie puede trabajar la ruta desde la app; el modal lo advierte.
- La fecha vive en cada **parada** (`ruta_odp.fecha_programada`, DATEONLY); la ruta no tiene fecha propia. Al 2026-10-05 ninguna ruta mezclaba días. El frontend usa `fechaRuta()` = primera fecha de las paradas vivas.

## Pausa (decisión del usuario, 2026-10-05 — opción A)

**Pausar saca la ODP de la ruta.** La ODP vuelve a `LISTO_INSTALAR` y reaparece en su bandeja (Listo / Espera de pago / Espera de factura) con la etiqueta **"Pausada en Ruta #X — retomar"** (campo `ultima_pausa` de `getODPsParaGestion`: solo si la **última** parada de la ODP es la pausada). Retomar = programarla en una ruta nueva. La parada queda en `pausada` como **registro** (motivo y horas), no como parada viva.

Consecuencias en el código:
- `iniciarInstalacion` solo acepta `pendiente` (antes reanudaba desde `pausada`).
- `getODPsParaGestion`, `validarODPsLibres` y `estaEnRutaActiva` (agenda) no cuentan la pausada como ocupación.
- `getODPsAtascadas` y `buscarParadaActiva` ignoran la pausada. El motivo `PAUSADA_SIN_RETOMAR` ya no se genera. Sin esto, cerrar una ODP desde "Pendientes de cierre" marcaba la parada pausada vieja y dejaba abierta la nueva.
- `getAsignacionInstalador` muestra una pausada solo mientras su ODP sigue en `LISTO_INSTALAR` (sección "Pausadas — por reprogramar").

Antes de este cambio la pausada seguía ocupando la ruta: la ODP no salía en ninguna bandeja ni en "Pendientes de cierre" y la ruta quedaba en curso para siempre (rutas #393 y #505, ODP-24203 y ODP-24313; cerradas con `scripts/2026-10-05_cerrar_rutas_sin_pendientes.ts`).

## Programar, editar, cancelar y unir

- **Zod `.strict()`** en crear y editar (`crearRutaSchema` / `editarRutaSchema`): fechas `YYYY-MM-DD`, sin ODP repetida en la misma ruta.
- **`validarODPsLibres`**: toda ODP que entra debe estar en `LISTO_INSTALAR` y sin parada viva en otra ruta abierta → 409 con el número de la ruta. Antes dos jefes podían programar la misma ODP a la vez.
- **`validarElegibilidadProgramacion`**: pago (`PAGO_OK`) y factura (`FACTURA_OK`). El frontend replica ambas en `estadoInstalacion.ts` (`estadoPago`, `estadoFactura`): **si cambian aquí, cambiarlas allá**. Crédito por `forma_pago = 'credito'` cuenta como pago aprobado aunque `estado_caja` sea `ABONADO` (caso ODP-24345).
- Editar y cancelar exigen ruta `programada`/`en_curso`. Solo las paradas `pendiente` son editables. Quitar todas las pendientes de una ruta sin otras paradas → 400 ("usa Cancelar ruta").
- **`liberarODPsDeRuta`** (quitar o cancelar): devuelve a `LISTO_INSTALAR` solo las ODPs que siguen en `PROGRAMADA`, con historial y notificación. Una parada `con_dano` no se libera: su ODP sigue `INSTALANDO` y se resuelve en "Pendientes de cierre".
- **Unir** (`POST /api/rutas/:id/unir { origen_id }`): la origen debe estar `programada` con todas sus paradas `pendiente`; la destino, abierta. Mueve las paradas al final de la destino, suma instaladores (el oficial de la origen entra como instalador si es distinto), completa oficial/conductor/vehículo vacíos, concatena observaciones y cancela la origen. Historial `PROGRAMADA → PROGRAMADA` con la nota del movimiento. Bloquea las dos rutas en orden de id.
- **Aviso de choque** (`ProgramarRutaModal`): otra ruta abierta con parada viva el mismo día que comparte oficial, instalador, conductor o vehículo. Solo avisa. Al crear ofrece "Agregar a la ruta #X", que convierte el modal en edición de esa ruta con las ODPs sumadas. El modal pide `GET /api/rutas` por su cuenta para que los 4 lugares que lo abren tengan el aviso.

## Pantalla del jefe — pestaña Programados

- Fuente: `GET /api/rutas` (rutas `programada` + `en_curso`, `INCLUDE_RUTA_LISTA`). Incluye `forma_pago`, `estado_facturacion`, `nombre_recibe`, `telefono_recibe`, `descripcion_pedido` para etiquetas y Hoja de Ruta.
- **Lista:** subpestañas Programada / En curso, agrupadas por día (Vencidas, Hoy, Mañana, …). Una ruta con fecha pasada y paradas pendientes va con borde rojo; sus ODPs también salen en "Pendientes de cierre" (`PARADA_VENCIDA`).
- **Por equipo:** un día a la vez, una columna por oficial con todas sus paradas, botón **Hoja de ruta** y **Unir en una ruta** cuando el equipo tiene varias rutas sin salir. La vista elegida se recuerda en `localStorage` (`instalaciones.programados.vista`).
- **Hoja de Ruta** (`imprimirHojaRuta`): equipo, paradas, dirección, contacto en obra, servicio, estado de pago (sin valores), descripción, columnas para hora y firma. Carta horizontal.
- **Informe del día** (2026-10-06, `InformeRutasModal` + `utils/informeRutas.ts`): texto para pegar en los grupos de WhatsApp. Lo abren el botón de Programados y el de Control de Taller ("Compartir programación"): **un solo modal**, que reemplazó a `ProgramacionWhatsAppModal` de Producción. Fuente: `GET /api/rutas/programacion?fecha=YYYY-MM-DD` (Zod `.strict()`, por defecto hoy en Bogotá), que trae las paradas de ese `fecha_programada` de toda ruta no cancelada, en cualquier estado, con solo los campos que usa el texto (sin vehículo, conductor, firma ni ítems). Decisiones del usuario:
  - Sin vehículo, conductor, teléfonos de clientes ni estado de pago. Un bloque por oficial (+ ayudantes), como la vista "Por equipo".
  - Línea 🔧 corta, versión "tipo completo": `resumirDescripcion` saca de `descripcion_pedido` (`Nx <Tipo>: <texto>`, ver `ODPForm`) el tipo + producto (hasta la primera coma/punto o "en", "con", "incluye") + espesor buscado antes de "MEDIDA". Ej.: "Suministro e instalación puerta batiente 8mm (x2) (+1 más)". Reprocesos → "Reproceso NC-0010 (ODP-23958)"; garantías sin patrón → "Garantía …". Probado contra las 243 ODP de rutas de 90 días: ninguna vacía, mediana 45 caracteres, máx. 71.
  - Días pasados: cada parada marcada ✅ instalada · ⚠️ con daño · ⏸️ pausada · ⏳ no se hizo, con totales por marca. Hoy y futuro: sin marcas y sin las paradas pausadas (pausar saca la ODP de la ruta).
  - Navegación ‹ › por día hacia atrás y hacia adelante; el texto es editable antes de copiar.
  - Roles del endpoint: `LECTURA_GESTION` + `auxiliar_produccion` (antes Control de Taller le mostraba el botón a ese rol y el endpoint le respondía 403). `taller` sigue sin acceso: no está en `RolUsuario` (drift de RBAC).

## Resultado real de cada parada y rutas cerradas con paradas sin hacer (2026-10-06)

Decisiones del usuario tras el caso de las rutas #516/#517/#518:
1. **Acarreo puro:** se sigue dando por entregado automáticamente al terminar la ruta, pero
   `terminarRutaConductor` cierra también la **parada** (`completada`, fin = cierre de la ruta).
   Antes solo la ODP pasaba a ENTREGADA y la parada quedaba `pendiente` (27 casos, corregidos
   con `2026-10-06_cerrar_paradas_acarreo_entregado.ts`). Todo el cierre va en una transacción.
2. **El conductor puede seguir cerrando la ruta con instalaciones sin hacer** (solo se le exige
   haber marcado llegada en todas). La ODP que quedó `PROGRAMADA` aparece **el mismo día** en
   "Pendientes de cierre" (`getODPsAtascadas` incluye `estado_ruta = completada`); antes
   esperaba a que la fecha venciera (ODP-24345).
3. **Reprogramar** (Pendientes de cierre) deja las paradas abiertas de la ODP en `pausada` con
   `motivo_pausa` "Reprogramada desde…", no en `completada` (se leían "Entregada"). Cierra todas
   sus paradas abiertas, no solo la más reciente. 18 históricas corregidas con
   `2026-10-06_reprogramadas_a_pausada.ts` (cruce exacto historial ↔ `fin_instalacion`).
4. **Completados muestra el resultado real** (`resultadoParada` en `RutaCard`): Instalada /
   Entregada / No se hizo · devuelta a bandeja / No se hizo · en Pendientes de cierre / No se
   hizo · ruta cancelada / Con daño. El encabezado de una ruta cerrada dice "2 hechas · 1 sin
   hacer". `INCLUDE_RUTA_LISTA` trae `estado_produccion` de la ODP para eso.

⚠️ `rutas_instalacion.fin_ruta` es `timestamp` SIN zona (ver TECH_DEBT 2026-10-06): leerla con
`AT TIME ZONE UTC` en SQL crudo.

## Reportar entrega (finalizar) — incidente del 2026-10-06

Javier (ODP-24322) reportó que "se queda cargando y no sube las evidencias". Rastreo con auditoría y
Cloudinary: la entrega **se guardó** a las 8:54:49 (2 fotos, firma, GPS), pero la respuesta no llegó al
celular; la app no tenía límite de espera y quedó "Subiendo…". Reintentó 6 veces (9:01–9:03): cada
intento subía las 2 fotos a Cloudinary —multer corre antes del controlador— y recibía un 400 que no
entendía. Quedaron 12 fotos huérfanas (borradas el mismo día).

Lo que quedó (`POST /ruta-odp/:id/finalizar`):
- **`prevalidarFinalizacion` antes de multer:** parada existente, `en_curso` y, para el rol
  `instalador`, asignado a la ruta (antes no se validaba al finalizar). Un intento inválido no sube nada.
- **Idempotente:** una parada ya `completada` responde **200 `ya_registrada`** con la hora ("ya quedó
  registrada a las 8:54 a. m."); la app lo trata como éxito. Revalidado con `FOR UPDATE` en la transacción.
- **`subirFotosEntrega`:** errores de multer/Cloudinary (más de 10 MB, HEIC, más de 10 fotos) como 400
  legible en vez de la página HTML de Express.
- **Limpieza:** si algo falla después de subir, las fotos se borran de Cloudinary (`descartarFotosSubidas`).
- **`GET /ruta-odp/:id/estado`:** consulta liviana para saber si una entrega quedó.
- **Frontend** (`utils/enviarEntrega.ts`, usado por `ReportarEntregaModal` y el "Marcar como entregada" de
  `JefeView`): compresión en el navegador a 1600 px JPEG 0,8 (`utils/comprimirImagen.ts`, sin
  dependencias; si no puede abrir la imagen envía la original), límite de 90 s, progreso en el botón y,
  si la respuesta se pierde, consulta `/estado` antes de dar error.

⚠️ La carpeta `templex_instalaciones` de Cloudinary la comparten `uploadConfig` de varias rutas
(croquis de ODP, foto de TM, evidencias sueltas): una imagen que no esté en `evidencias_instalacion`
no es necesariamente huérfana.

## Tiempo real

`emitirCambioRutas()` (`utils/notificaciones.ts`) emite `data_changed { modulo: 'rutas' }` en crear, editar, cancelar, unir, iniciar, finalizar, pausar, daño, iniciar/terminar ruta, llegada, pendientes de cierre y escrituras de agenda. Escuchan con `useDataChangedSocket('rutas', …)`: `JefeView` (y el historial si está abierto), `InstaladorGestionTab`, `InstaladorView`, `ConductorView`. Las dos últimas escuchaban `'compras'` hasta el 2026-10-05 (sin relación con rutas).

## Datos y bugs conocidos

- **28 paradas `pendiente` en rutas `completada`** (2026-10-05): el conductor cerró la ruta sin que la parada se atendiera. Ya no bloquean nada (las validaciones solo miran rutas abiertas), pero aparecen en la sección "Pendientes" de `InstaladorGestionTab`. Ver `TECH_DEBT.md` 2026-10-05.
- Rutas con una sola parada: 474 de 515 al 2026-10-05. El equipo crea una ruta por ODP; de ahí el aviso de choque y la acción de unir.
- `getRutasHistorial` filtra por `creado_en` de la ruta, no por la fecha de instalación.

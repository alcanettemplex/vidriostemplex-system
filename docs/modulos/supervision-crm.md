# Supervisión CRM y reporte diario de asesores

Ruta `/supervision-crm`, pantalla completa fuera del `AppShell`. Desde el 2026-10-12 entran
**root y admin** (antes solo root): `navegacion.ts` → `roles: ['admin']` (root pasa siempre) y
`supervision.routes.ts` → `requireRole('admin')`. Admin ve **todo** el módulo, incluido el ranking y
los Excel del buscador con teléfonos (decisión del usuario).

- Frontend: `frontend-web/src/features/supervision-crm/` — `SupervisionCRMPage.tsx` (pestañas),
  `components/ReporteDelDia.tsx`, `LineamientoDelDia.tsx`, `LeadRadarPanel.tsx`, `BuscadorAvanzadoPanel.tsx`.
- Backend: `routes/supervision.routes.ts` → `controllers/crm.controller.ts` (mismo archivo que `/crm`).
- **Reglas: `backend-api/src/utils/reporteAsesores.ts`** (fuente única) + `utils/diasHabiles.ts`.

## Pestañas

| Pestaña | Endpoint | Regla |
|---|---|---|
| **Reporte del Día** (por defecto) | `GET /reporte-diario`, `POST /reporte-diario/registrar` | `reporteAsesores.ts` completo |
| Primer Contacto | `GET /primer-contacto` | `leadsSinContacto()` |
| Cola Seguimiento | `GET /seguimiento` | `leadsSinSeguimiento()` |
| Alto Valor | `GET /alto-valor` | propia (monto ≥ umbral, días de calendario) — no cambió |
| Lineamiento del Día | `GET/POST /lineamiento`, `PATCH /lineamiento/item/:id` | ítems del generador + ítems del reporte |
| Motivos / Buscador | `/resumen`, `/buscador/*` | sin cambios |

Desde el 2026-10-12 **Primer Contacto y Seguimiento usan las mismas funciones que el reporte** (decisión
13a del usuario): pantalla y mensaje de WhatsApp siempre coinciden. `dias_en_etapa` de esas colas son
**días hábiles**, y traen `horas_habiles` (el panel muestra horas si aún no cumple un día).

## Reglas del reporte (decisiones del usuario, 2026-10-12)

Horario hábil: **L-V 8:00–17:00, sábado 8:00–12:00**, sin domingos ni festivos de Colombia (calculados en
`diasHabiles.ts`: Ley Emiliani + Pascua, sin dependencias; verificados los 18 de 2026). El sábado cuenta
como día hábil para la regla de 2 días.

**Leads** — excluye `FRIO` y `respondio = 'No responde'` (ojo: el filtro conserva los `respondio` NULL;
un `<> 'No responde'` en SQL los descartaría):

| Tipo | Condición | Reloj |
|---|---|---|
| `SIN_ASIGNAR` | `NUEVO` sin asesor | > 2 h hábiles desde `createdAt`. Va a la **asistente administrativa** (rol, hoy Sandra Arrubla, id 56; si hay varias, la de menor id) |
| `PRIMER_CONTACTO` | `NUEVO`/`ASIGNADO` con asesor y **ningún evento en `lead_eventos` distinto de `CREACION`/`ASIGNACION`** desde la asignación | > 2 h hábiles desde `fecha_asignado` (o `createdAt`) |
| `SEGUIMIENTO` | `EN_CONTACTO`/`COTIZANDO`/`SEGUIMIENTO`/`VISITA_TECNICA` | ≥ 2 días hábiles desde la más reciente entre `ultima_actividad`, la fecha de entrada a la etapa y `createdAt` |

La asignación también deja evento en la bitácora: por eso no cuenta como contacto.

**ODP** — solo `tipo_odp='ODP'`; fuera `es_garantia`, `es_no_conformidad`, `sin_items`:

| Tipo | Condición | Días (calendario) |
|---|---|---|
| `FACTURAR` | `LISTO_INSTALAR`/`PROGRAMADA` sin FE | desde `fecha_listo_instalar`, o el historial |
| `FACTURAR_INSTALADA` | `INSTALANDO`/`INSTALADA`/`ENTREGADA` sin FE — **una sola vez**, con su saldo | desde la instalación/entrega (historial: INSTALADA › ENTREGADA › INSTALANDO) |
| `COBRAR` | mismos estados, con FE, caja `PENDIENTE`/`ABONADO`/`CREDITO_APROBADO`, saldo > 0 | igual; los créditos muestran vencimiento ("vence dd/mm" o "vencido hace N días") |

"Sin FE" = ni `estado_facturacion='FACTURADA'` ni `factura_electronica`. Saldo = `valor_total − abono`
(el mismo de Contabilidad). Saldo 0 se escribe "pagada". Responsable = `odp.asesor_id`, cualquiera que sea
su rol (hay ODP de jefe de producción, gerencia, admin). Los asesores inactivos **aparecen** marcados
"(inactivo)"; los que no tienen pendientes se omiten. Dos cuentas con el mismo nombre (Alba Lucía
Castro: gerencia id 33 y admin id 71) se distinguen con el rol.

## Envíos y "partes" del día

`registrarEnvio()` guarda cada pendiente como `supervision_lineamiento_items` en el lineamiento del día
del responsable (`supervision_lineamientos`, UNIQUE `(fecha, asesor_id)` — sin cambios):

- `envio` = parte del día (1, 2…). `NULL` = ítem del generador de lineamiento por asesor.
- La **parte 2** solo trae lo nuevo: se descuentan las claves ya registradas hoy (`L:<lead_id>` —un lead
  ya enviado no se repite aunque cambie de regla— y `O:<odp_id>:<origen>`, así una ODP que pasa de
  facturar a cobrar sí vuelve a salir).
- Se registran **las claves que el usuario vio en la vista previa** y que siguen vigentes; el texto
  editado no se guarda. Un `pg_advisory_xact_lock` serializa registros simultáneos (doble clic: probado,
  el segundo devuelve 0).
- `detalle` (JSONB) guarda lo que se dijo ese día (saldo, días, estado).

## Cumplimiento automático

`evaluarCumplimiento()` corre al abrir el reporte, un lineamiento o la adherencia (máx. 1 vez por minuto
por proceso; sin cron). Revisa ítems con `envio` no nulo, sin marcar, de los últimos 30 días:

| Origen | Se da por resuelto si… |
|---|---|
| `SIN_ASIGNAR` | el lead ya tiene asesor o dejó `NUEVO` |
| `PRIMER_CONTACTO` | hay un evento de contacto posterior al envío, o el lead salió de `NUEVO`/`ASIGNADO` |
| `SEGUIMIENTO` | hay un evento de contacto posterior, o cambió de etapa |
| `FACTURAR*` | la ODP ya tiene FE |
| `COBRAR` | saldo ≤ 0 o caja `CANCELADO` |

Marca `cumplido_automatico = true`. Si una persona marca o desmarca el ítem, queda `marcado_manual = true`
y el sistema **no lo vuelve a tocar**. El update usa `individualHooks: true` para quedar en `auditoria_log`.

## Skill `/reporte-asesores`

`.claude/skills/reporte-asesores/SKILL.md` (copia versionada en `tooling/claude-code/skills/`, porque
`.claude/` no viaja por git) corre `npm --prefix backend-api run reporte:asesores` →
`scripts/reporte_asesores.ts`. Solo lee: no registra el envío ni marca cumplimientos. Flags `--asesor`,
`--nuevos`, `--json`. ~15 s (casi todo es compilar TypeScript).

## BD

Migración `scripts/2026-10-12_reporte_diario_asesores.ts` (**aplicada el 2026-10-12**): columnas `odp_id`
(FK `odp`, `ON DELETE SET NULL`), `envio`, `detalle`, `cumplido_automatico`, `marcado_manual`, e índice
parcial por `odp_id`. Valores de ENUM `SIN_ASIGNAR`, `FACTURAR`, `FACTURAR_INSTALADA`, `COBRAR`.
`origen` no tiene CHECK CONSTRAINT.

⚠️ Al correr la migración, los valores del ENUM **ya existían**: el backend de desarrollo, reiniciado por
nodemon tras editar el modelo, los agregó solo con `sync()` — sobre la BD de producción, porque la base
local apunta a ella. `sync({ alter: false })` no agrega columnas pero sí sincroniza valores de ENUM
existentes. Tenerlo presente al editar un ENUM en un modelo con el backend dev arriba.

## Pendientes conocidos

- El selector de asesor de **Lineamiento del Día** (`useAsesoresCRM`) no lista a la asistente
  administrativa: sus ítems "Sin asignar" se guardan y cuentan en la adherencia, pero no se ven en esa
  pestaña.
- `crm.controller.ts` supera las 2.700 líneas; las reglas nuevas ya viven en utils.

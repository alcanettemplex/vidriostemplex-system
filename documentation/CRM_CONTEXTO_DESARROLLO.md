# 📋 Contexto de Desarrollo — Módulo CRM Vidrios Templex
## Fecha: 2026-04-05 | Commit: `8c76098` (feat(crm): implementacion completa Modulo CRM y Leads Fases 1-3)

---

## ✅ ESTADO ACTUAL: MÓDULO CRM 100% IMPLEMENTADO

### Sistema en producción local:
- **Backend:** `http://localhost:3001` (nodemon corriendo con ts-node)
- **Frontend:** `http://localhost:3000`  
- **Base de datos:** PostgreSQL (Supabase)
- **Comando backend:** `cd backend-api && npm run dev`

---

## 🏗️ ARQUITECTURA DEL MÓDULO CRM

### Backend (`backend-api/src/`)
| Archivo | Descripción |
|---|---|
| `models/lead.model.ts` | Modelo Lead con campos: telefono, nombre, mensaje_entrada, segmento, respondio, producto_interes, descripcion_contexto, estado_crm (ENUM 8 estados), intentos_seguimiento, monto_proyectado_cotizacion, motivo_perdida, fecha_cierre, **cliente_id** (conversión) |
| `models/lead_evento.model.ts` | Trazabilidad: tipo ENUM (CREACION, ASIGNACION, SEGUIMIENTO, CAMBIO_ESTADO, PASE_A_FRIO, CONVERSION) |
| `controllers/crm.controller.ts` | 7 funciones: getLeads, createLead, updateLeadStatus, assignLeadToMe, getLeadTimeline, **convertLeadToCliente**, **getCRMStats** |
| `routes/crm.routes.ts` | Rutas bajo `/api/crm`, autenticadas con authMiddleware + requireRole |

### Rutas API disponibles:
```
GET    /api/crm                    → Lista leads (filtrado por rol)
POST   /api/crm                    → Crear lead (asistente, asesor, gerencia, admin)
PUT    /api/crm/:id/estado         → Cambiar estado (DnD Kanban)
PUT    /api/crm/:id/reclamar       → Asesor toma de bolsa común
GET    /api/crm/:id/eventos        → Timeline de un lead
POST   /api/crm/:id/convertir      → Convertir lead APROBADO → Cliente real
GET    /api/crm/stats/resumen      → Estadísticas gerenciales (KPIs financieros)
```

### Frontend (`frontend-web/src/features/crm/`)
| Archivo | Descripción |
|---|---|
| `CRMPage.tsx` | Hub principal con 3 tabs: Pipeline, Métricas, Dashboard Gerencial |
| `crmSlice.ts` | Redux slice: leads[], actividades[], loading, error |
| `crmService.ts` | Capa API centralizada con token automático |
| `components/KanbanBoard.tsx` | DnD completo con @hello-pangea/dnd, carga API real, optimistic updates |
| `components/LeadCard.tsx` | Tarjeta con acciones contextuales: Tomar Lead / Convertir a Cliente |
| `components/NewLeadModal.tsx` | Formulario completo conectado a API (con asignación directa) |
| `components/MotivoPerdidaModal.tsx` | Obligatorio al mover a PERDIDO |
| `components/ConvertirClienteModal.tsx` | Conversión Lead→Cliente con datos fiscales |
| `components/CRMMetrics.tsx` | KPIs visuales por rol (personal vs global) |
| `components/DashboardGerencial.tsx` | Dashboard financiero: KPIs COP + ranking asesores + salud pipeline |

---

## 🔐 REGLAS DE NEGOCIO IMPLEMENTADAS

### Flujo de estados:
```
NUEVO (Bolsa Común) → ASIGNADO → EN_CONTACTO → COTIZANDO → VISITA_TECNICA → APROBADO → [convertir a Cliente]
                                                                                       ↘ PERDIDO (motivo obligatorio)
                ↓ (3 intentos sin respuesta)
              FRIO (automático por sistema)
```

### Política "3-Touch Anti-Fantasma":
- Cada vez que se mueve un lead dentro de la misma columna (EN_CONTACTO/COTIZANDO) → incrementa `intentos_seguimiento`
- Al llegar a 3 → el sistema AUTO mueve a FRIO con evento registrado

### Control de roles:
| Rol | Permisos CRM |
|---|---|
| `asistente_administrativo` | Crear leads, ver pipeline, métricas globales, dashboard |
| `asesor_comercial` | Ver tablero (filtra solo sus leads), Tomar de bolsa, mover cards, métricas propias |
| `gerencia` | Todo + Dashboard Gerencial completo |
| `admin` | Todo |

---

## 📦 PARCHES DE BASE DE DATOS APLICADOS (BD Productiva)

```sql
-- 1. ENUM rol usuario (ya aplicado)
ALTER TYPE enum_usuarios_rol ADD VALUE 'asistente_administrativo';

-- 2. CHECK constraint (ya aplicado) 
ALTER TABLE usuarios DROP CONSTRAINT usuarios_rol_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check CHECK (rol IN (
  'root','admin','gerencia','jefe_produccion','asesor_comercial',
  'produccion','instalador','conductor','contabilidad','compras','asistente_administrativo'
));

-- 3. Columna conversión (aplicada vía Sequelize sync alter)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS cliente_id INTEGER;
```

---

## 🚀 POSIBLES PRÓXIMOS PASOS (para mañana)

1. **Monto Proyectado en cotización**: Agregar campo editable de `monto_proyectado_cotizacion` desde el modal de detalle del lead, para que el dashboard financiero muestre cifras reales (actualmente muestra $0 si no se registra).

2. **Timeline de Lead**: Vista de detalle al hacer clic en una tarjeta — muestra el historial de eventos (`/api/crm/:id/eventos`): creación, asignaciones, cambios de estado, conversión.

3. **Filtros del Pipeline**: Activar el botón "Filtros" del toolbar para filtrar por asesor, segmento, producto o rango de fechas.

4. **Notificaciones en tiempo real**: Usando el socket WebSocket existente del sistema, notificar cuando llegue un nuevo lead a la bolsa común.

5. **Limpiar scripts de debug**: Eliminar `patch_constraint.ts`, `patch_rol.ts`, `debug_db.ts`, `debug_query.ts` del repo (están en .gitignore efectivamente, no fueron commiteados).

---

## ⚠️ COSAS A TENER EN CUENTA

- El campo `asistente_id` en `Lead` es `allowNull: false`. Para crear leads desde roles que no sean asistente, verificar que el backend toma el `user.id` correctamente como `asistente_id`.
- El servidor corre en modo `sequelize.sync({ alter: false })` — los cambios de esquema se hacen manualmente con scripts o migrations.
- El lint en `debug_query.ts` (archivo de prueba) tiene errores de tipo `Includeable` — no es código de producción, ignorar.

---

## 🗂️ ARCHIVOS IMPORTANTES DEL SISTEMA (no CRM)

- `backend-api/src/models/index.ts` → Registro central de todos los modelos + asociaciones
- `backend-api/src/app.ts` → Registro de todas las rutas Express
- `frontend-web/src/store/rootReducer.ts` → Registro de todos los slices Redux
- `frontend-web/src/routes/AppRoutes.tsx` → Registro de todas las rutas React
- `frontend-web/src/components/common/Sidebar.tsx` → Navegación lateral con control de roles

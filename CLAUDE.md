# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Descripción del Proyecto

Sistema ERP empresarial para **Vidrios Templex**, empresa de instalación y fabricación de vidrios y aluminio. Gestiona el ciclo completo: cotización → producción → instalación → facturación → cobro.

**Monorepo** con tres sub-proyectos independientes:
- `backend-api/` — API REST + WebSockets (Express + TypeScript + Sequelize)
- `frontend-web/` — Aplicación web de gestión (React 19 + MUI + Redux Toolkit)
- `mobile-app/` — App móvil para instaladores (Expo + React Native)

---

## Comandos de Desarrollo

### Backend (`cd backend-api`)
```bash
npm run dev      # Desarrollo con nodemon (hot-reload), puerto 3001
npm run build    # Compilar TypeScript → dist/
npm run start    # Producción (node dist/server.js)
npm run lint     # ESLint
npm run lint:fix # Arreglar ESLint automáticamente
npm run format   # Prettier
```

### Frontend (`cd frontend-web`)
```bash
npm start        # Dev server http://localhost:3000
npm run build    # Build producción (CI=false para ignorar warnings)
```

### Mobile (`cd mobile-app`)
```bash
expo start           # Iniciar Expo
expo start --android # Emulador Android
```

---

## Migraciones de Base de Datos — CRÍTICO

**Sequelize `sync({ alter: false })` no agrega columnas a tablas existentes.** Solo crea tablas nuevas si no existen. Al agregar campos a modelos existentes, ejecutar manualmente el `ALTER TABLE` en el SQL editor de Supabase. No hay ORM migration runner configurado.

El `sync` solo corre en desarrollo (`NODE_ENV !== 'production'`), nunca en producción.

```sql
-- Ejemplo:
ALTER TABLE odp ADD COLUMN nueva_columna VARCHAR(100);
```

---

## Entidad Central: ODP (Orden de Producción)

La ODP (`backend-api/src/models/odp.model.ts`) es el núcleo del sistema. Tiene tres estados independientes:

### Estados de Producción (flujo secuencial)
```
EN_ESPERA → VISITA_TECNICA → MEDICION → PEDIDO_PROVEEDOR → ALUMINIO_CORTADO
→ VIDRIO_RECIBIDO → ACCESORIOS_SEPARADOS → LISTO_INSTALAR → PROGRAMADA
→ INSTALADA → ENTREGADA | PAUSADA
```

### Estados de Facturación
`PENDIENTE` → `FACTURADA`

### Estados de Caja
`PENDIENTE` → `ABONADO` → `CANCELADO` | `CREDITO_APROBADO`

### Campos booleanos de progreso (chk_*)
La ODP tiene campos `chk_medicion`, `chk_corte`, `chk_vidrio`, `chk_accesorios`, `chk_ensamble`, `chk_matizado`, `chk_pelicula`, `chk_huacal`, `chk_carton` que se actualizan independientemente del `estado_produccion`.

### ODP derivada (No Conformidad)
Cuando se reporta una `No_Conformidad`, puede generarse una nueva ODP hija con `odp_padre_id` apuntando a la ODP original y `es_no_conformidad: true`.

---

## Arquitectura Backend

### Patrón de middlewares
Todas las rutas protegidas siguen: `authMiddleware → rbacMiddleware → controller`

### Flujo de módulos clave

**SAP (Solicitud de Aprovisionamiento de Perfilería):**
- `SAP` es un documento intermedio entre ODP y compras
- `SAP` → `SAPItem` → `OrdenCompra` (`ODC`) → `ODCItem`
- El controlador `sap.controller.ts` genera la lista de materiales de aluminio

**Prospectos → ODP:**
- Un `Prospecto` puede tener una `TomaMedidas` asociada (antes de ser ODP)
- Al aprobarse, el prospecto se convierte en ODP (`Prospecto.odp_id`)

**Rutas de Instalación:**
- `RutaInstalacion` agrupa múltiples ODPs vía `RutaODP` (tabla join)
- Tiene conductor, vehículo, e instaladores (M:M via tabla `ruta_instaladores`)

### API Endpoints (prefijo `/api`)
| Prefijo | Controlador |
|---------|-------------|
| `/auth` | auth.controller |
| `/usuarios` | usuario.controller |
| `/clientes` | cliente.controller |
| `/odp` | odp.controller |
| `/produccion` | produccion.controller |
| `/instalaciones` | instalacion.controller |
| `/evidencias` | evidencia.controller |
| `/compras` | odc.controller (el archivo `compras.controller.ts` existe pero no está en uso) |
| `/contabilidad` | contabilidad.controller |
| `/no-conformidad` | no_conformidad.controller |
| `/configuracion` | configuracion.controller |
| `/notas-produccion` | nota_produccion.controller |
| `/catalogo` | catalogo.controller |
| `/prospectos` | prospecto.controller |
| `/inventario-perfileria` | inventario_perfileria.controller |
| `/rutas` | rutas.controller |
| `/dashboard` | dashboard.controller |
| `/documentos` | documentos (PDF/Excel generados server-side) |

---

## Modelos de Base de Datos (25 modelos en `backend-api/src/models/`)

Las asociaciones están centralizadas en `models/index.ts` (importar siempre desde ahí, no desde el archivo individual).

| Modelo | Tabla | Descripción |
|--------|-------|-------------|
| `ODP` ⭐ | `odp` | Entidad central, sin timestamps |
| `ODPItem` | `odp_items` | Items de aluminio/vidrio de una ODP |
| `Cliente` | `clientes` | Clientes/empresas |
| `Usuario` | `usuarios` | Usuarios con rol RBAC |
| `Cotizacion` | `cotizaciones` | Cotizaciones por ODP |
| `TomaMedidas` | `toma_medidas` | Mediciones (ligada a ODP o Prospecto) |
| `SAP` | `saps` | Solicitud de Aprovisionamiento de Perfilería |
| `SAPItem` | `sap_items` | Items de aluminio del SAP |
| `OrdenCompra` | `ordenes_compra` | ODC a proveedores |
| `ODCItem` | `odc_items` | Items de una ODC (ligados a SAPItem) |
| `Pago` | `pagos` | Registros de abonos/pagos |
| `EvidenciaInstalacion` | `evidencias_instalacion` | Fotos subidas a Cloudinary |
| `NoConformidad` | `no_conformidades` | Reportes de defectos |
| `NotaProduccion` | `notas_produccion` | Notas internas de producción |
| `HistorialEstadoODP` | `historial_estados_odp` | Auditoría de cambios de estado |
| `Vehiculo` | `vehiculos` | Vehículos para instalación |
| `RutaInstalacion` | `rutas_instalacion` | Ruta diaria de instalaciones |
| `RutaODP` | `ruta_odps` | Join entre RutaInstalacion y ODP |
| `Prospecto` | `prospectos` | Leads comerciales previos a ODP |
| `CatalogoProducto` | `catalogo_productos` | Catálogo de productos/perfiles |
| `InventarioPerfileria` | `inventario_perfileria` | Stock de perfiles de aluminio |
| `MetaMensual` | `metas_mensuales` | Metas por usuario |
| `ConfiguracionGlobal` | `configuracion_global` | Configuraciones del sistema |
| `Produccion` | `produccion` | Control adicional de producción (importado directamente en `produccion.controller.ts`, no en index.ts) |
| `ProgramacionInstalacion` | `programacion_instalaciones` | Calendario de instalaciones (importado directamente en `instalacion.controller.ts`, no en index.ts) |

---

## Arquitectura Frontend

### Estructura de features
Cada módulo en `frontend-web/src/features/<nombre>/` tiene:
- Página principal (ej. `ComprasPage.tsx`)
- `components/` con modales y sub-componentes
- Slice Redux si maneja estado global

### Módulos frontend
| Feature | Ruta | Descripción |
|---------|------|-------------|
| `auth` | `/login` | Login con JWT |
| `odp` ⭐ | `/odp` | CRUD de ODPs + modal detalle completo |
| `produccion` | `/produccion` | Vista Kanban/tabla del estado de producción |
| `instalaciones` | `/instalaciones` | Vistas por rol: JefeView, InstaladorView, ConductorView |
| `compras` | `/compras` | ODC con tabs: SAPs, Órdenes, Perfilería |
| `contabilidad` | `/contabilidad` | Facturación y caja |
| `clientes` | `/clientes` | CRUD clientes |
| `prospectos` | `/prospectos` | Pipeline comercial |
| `toma-medidas` | `/toma-medidas` | Gestión de mediciones |
| `inventario` | `/inventario` | Inventario de perfilería |
| `evidencias` | `/evidencias` | Galería de fotos de instalación |
| `usuarios` | `/usuarios` | Administración de usuarios |
| `reportes` | `/reportes` | Reportes y exportación |
| `configuracion` | `/configuracion` | Configuración global del sistema |

### Componentes clave del módulo ODP
- `ODPDetailModal.tsx` — Modal maestro con todos los tabs de una ODP
- `ODPForm.tsx` — Formulario de creación/edición
- `TMModal.tsx` — Modal de Toma de Medidas (dos momentos: antes y después)
- `SAPModal.tsx` — Modal de solicitud de perfilería
- `COTModal.tsx` — Modal de cotización
- Printables (`PrintableOP`, `PrintableSAP`, `PrintableProduccion`, etc.) — Generación de PDFs cliente-side

### Estado global (Redux)
- Store en `store/store.ts` con slices por feature
- Notificaciones en tiempo real via `useSocketNotifications` hook
- `socket.ts` configura la conexión Socket.io compartida

---

## Roles de Usuario (RBAC)

```
admin | gerencia | jefe_produccion | asesor_comercial |
produccion | auxiliar_produccion | instalador | conductor | contabilidad | compras
```

Definidos en `rbacMiddleware.ts` como tipo `RolUsuario`. Los permisos se aplican por ruta. El rol `conductor` es exclusivo del módulo de rutas de instalación (`/api/rutas`).

---

## Infraestructura y Despliegue

### Variables de Entorno

**Backend (raíz o `backend-api/`):**
```env
PORT=3001
JWT_SECRET=...
DATABASE_URL=postgresql://usuario:password@host:5432/database
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
FRONTEND_URL=http://localhost:3000
```

**Frontend (`frontend-web/`):**
```env
REACT_APP_API_URL=http://localhost:3001
CI=false
```

### Base de Datos
- **DBMS**: PostgreSQL en Supabase (AWS us-east-1)
- **SSL**: Obligatorio con `rejectUnauthorized: false`
- Conexión configurada en `backend-api/src/config/database.ts`

### Almacenamiento de Archivos
- **Proveedor**: Cloudinary, folder `templex_instalaciones`
- Configurado en `backend-api/src/config/upload.ts` (Multer + Cloudinary storage)

### Producción
- **Frontend**: Netlify o Vercel (`CI=false` para no fallar por warnings)
- **Backend**: Docker multi-stage (node:20-alpine), puerto 3001
- **CORS**: Whitelist + patrones `*.netlify.app`, `*.vercel.app`
- **Nginx** (Docker): reverse proxy `/api/` → backend, SPA routing para frontend

### WebSockets (Socket.io)
- Configurado en `backend-api/src/server.ts`
- Al conectarse, el cliente envía `join({ userId, rol })` para unirse a rooms `user_{id}` y `role_{rol}`
- El helper `emitirNotificacion()` envía a rooms específicas por userId o rol
- Frontend: hook `useSocketNotifications` en `store/`
- CORS del WS: más restrictivo que el HTTP — solo `localhost:3000` + `FRONTEND_URL` + `*.netlify.app` + `*.vercel.app`

---

## Metodología de Trabajo — OBLIGATORIO

**Definir → Acordar → Ejecutar.** Siempre en ese orden, sin saltarse pasos.

1. El usuario describe lo que quiere (puede ser vago o detallado)
2. Claude entrevista, hace preguntas, propone la estructura completa de lo que se va a implementar
3. Se concreta el plan: BD, backend, frontend, lógica, casos borde — todo
4. El usuario aprueba explícitamente ("adelante", "hazlo", "sí")
5. Solo entonces Claude toca archivos

**Nunca codificar durante la fase de definición**, aunque el usuario ya haya respondido todas las preguntas. Esperar la autorización explícita.

Cuando el usuario dice "concretemos antes de ejecutar" o similar, eso significa: solo conversar, cero ediciones de archivos hasta nueva orden.

---

## Convenciones de Código

### Backend
- TypeScript estricto (`"strict": true`); no usar `any` explícito
- Solo `console.error` y `console.warn` permitidos (no `console.log`)
- Validación de entrada con **Zod** en los controladores
- Transacciones Sequelize para operaciones multi-tabla

### Frontend
- Tema MUI centralizado en `theme/theme.ts`
- HTTP via Axios; no fetch directamente
- Componentes de impresión (`Printable*.tsx`) se renderizan en un div oculto y se imprimen con `window.print()`

---

## Notas Importantes

1. **No hay tests** automatizados en backend ni frontend
2. **`replace_urls.js`** en raíz: reemplaza URLs hardcodeadas al cambiar entre entornos
3. **ODP.timestamps = false** — la tabla `odp` no tiene `createdAt`/`updatedAt`; usa `fecha_creacion` manual
4. **Módulo `mobile-app/`** usa Expo Router (file-based routing en `app/`), no React Navigation
5. **Importar modelos siempre desde `models/index.ts`** para que las asociaciones estén cargadas

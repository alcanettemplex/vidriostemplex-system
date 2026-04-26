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
- ODPs con `forma_pago='credito'` se consideran pago OK para instalación automáticamente (sin requerir `CREDITO_APROBADO`)

**PedidoPV (vidrios templados):**
- Al crear ODP con `proveedor_vidrio`, el backend auto-genera un `PedidoPV` (número consecutivo, base 6733 si no hay ninguno) **fuera** de la transacción principal para no bloquear la ODP
- Alejandro (usuario con `puede_gestionar_pv=true`) asigna ítems de ODP al PedidoPV desde la pestaña "Por Gestionar"
- Si >12 ítems seleccionados → se crean extensiones con sufijo `-1`, `-2`, etc.
- Ítems **no asignados** por Alejandro aparecen en tab "Vidrios" de Compras para gestión directa (ODC sin SAP)
- ODPs **sin** `proveedor_vidrio` → todos sus ítems de vidrio van directo a Compras

**Salidas de Almacén:**
- `SalidaAlmacen` vincula una ODP facturada con su número SA (formato `SA-XXXX`, libre)
- Una sola SA por ODP (UNIQUE en `odp_id`)
- Al registrar SA, la ODP sale del tab "Facturadas" y pasa a "Con Salidas de Almacén"

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
| `/pedidos-pv` | pedido_pv.controller |
| `/facturas-salidas` | salidas_almacen.controller |
| `/root` | root.controller — exclusivo rol `root` |

---

## Modelos de Base de Datos (28 modelos en `backend-api/src/models/`)

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
| `PedidoPV` | `pedido_pv` | Pedidos de vidrios templados a proveedor PV; estados: `PENDIENTE→ENVIADO→CONFIRMADO_PROVEEDOR→LLEGADO→VERIFICADO\|PROBLEMA`; cron diario 8am para alertas de tardanza; soporta importación desde Excel |
| `SalidaAlmacen` | `salidas_almacen` | Registro de salida de almacén (SA-XXXX) por ODP facturada; una SA por ODP; gestionada por compras/produccion |
| `AuditoriaLog` | `auditoria_log` | Log de auditoría global — INSERT/UPDATE/DELETE de todos los modelos; campos: tabla, operacion, registro_id, datos_anteriores (JSONB), datos_nuevos (JSONB), usuario_id, ip_address, fecha |
| `AlertasUmbral` | `alertas_umbral` | Umbrales configurables para alertas del módulo ROOT (db_storage_pct, cloud_storage_pct, etc.) |

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
| `compras` | `/compras` | ODC con tabs: SAPs, Órdenes, Perfilería, Vidrios |
| `contabilidad` | `/contabilidad` | Facturación y caja |
| `clientes` | `/clientes` | CRUD clientes |
| `prospectos` | `/prospectos` | Pipeline comercial |
| `toma-medidas` | `/toma-medidas` | Gestión de mediciones |
| `inventario` | `/inventario` | Inventario de perfilería |
| `evidencias` | `/evidencias` | Galería de fotos de instalación |
| `usuarios` | `/usuarios` | Administración de usuarios |
| `pedidos-pv` | `/pedidos-pv` | Gestión de pedidos de vidrios templados a proveedor PV; tab "Por Gestionar" solo para `puede_gestionar_pv=true` |
| `facturas-salidas` | `/facturas-salidas` | Control interno Facturas vs Salidas de Almacén (SA-XXXX); edición solo compras/produccion |
| `reportes` | `/reportes` | Reportes y exportación |
| `configuracion` | `/configuracion` | Configuración global del sistema (sin catálogo — movido a ROOT) |
| `root` | `/root` | Panel de control total — solo rol `root`; tabs: Resumen, Base de Datos, Almacenamiento, Servicios, Auditoría, Backup, Mantenimiento, Alertas, Catálogo |

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
root | admin | gerencia | jefe_produccion | asesor_comercial |
produccion | auxiliar_produccion | instalador | conductor | contabilidad | compras
```

Definidos en `rbacMiddleware.ts` como tipo `RolUsuario`. Los permisos se aplican por ruta. El rol `conductor` es exclusivo del módulo de rutas de instalación (`/api/rutas`).

**Rol `root`:** superior a todos. Acceso exclusivo al módulo ROOT (`/api/root/*`, `/root`). En el sidebar solo ve la sección "Sistema". Usuario: `ROOT`, id=30. **CRÍTICO:** la tabla `usuarios` tiene un CHECK CONSTRAINT (`usuarios_rol_check`) que lista los roles explícitamente — al agregar un rol nuevo hay que: (1) `ALTER TYPE enum_usuarios_rol ADD VALUE 'nuevo_rol'`, (2) DROP + recrear el CHECK CONSTRAINT incluyendo el nuevo valor.

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

### Separación de archivos de entrada (backend)
- `app.ts` — configura Express, middlewares y rutas; exporta `app`
- `server.ts` — punto de entrada real; crea `http.Server`, adjunta Socket.io, arranca puerto; exporta `emitirNotificacion()`
- `socketServer.ts` — lógica de rooms y eventos Socket.io

### WebSockets (Socket.io)
- Configurado en `backend-api/src/server.ts`
- Al conectarse, el cliente envía `join({ userId, rol })` para unirse a rooms `user_{id}` y `role_{rol}`
- El helper `emitirNotificacion()` envía a rooms específicas por userId o rol
- `utils/notificaciones.ts` — wrapper `notificarCambioEstadoODP()`: notifica al asesor de la ODP + roles `jefe_produccion` y `compras` cuando cambia el estado de producción; importar desde aquí, no llamar `emitirNotificacion` directamente en los controladores de ODP
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

### Verificación de impacto antes de commit — OBLIGATORIO

Antes de hacer cualquier commit, generar explícitamente la lista de módulos afectados y verificar cada uno. Compilar TypeScript sin errores **no es suficiente**.

**Reglas de trazabilidad:**
- Cambió un **controlador** → revisar TODAS las vistas/componentes que consumen ese endpoint
- Cambió un **modelo** → revisar todos los controladores que usan ese modelo
- Cambió un **ENUM o valor de estado** → verificar que Sequelize ENUM, PG ENUM y CHECK CONSTRAINT sean consistentes
- Cambió lógica de **estado de ODP** → revisar dashboard, producción, instalaciones, rutas, contabilidad
- Cambió un **endpoint de permisos** → verificar que los roles en `requireRole()` coincidan con los controles de UI

**Formato obligatorio al reportar avance:**
```
Módulos verificados:
✅ backend: controlador X — lógica Y correcta
✅ frontend: componente Z — consume endpoint con parámetros correctos
✅ BD: constraint/enum actualizado y consistente con modelo
⚠️ pendiente: [si algo no se pudo verificar, explicar por qué]
```

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
2. **Scripts one-off en `backend-api/src/`**: `seed.ts`, `seed_odps.ts`, `migrate_nc.ts`, `db_master_fix.ts`, `fix_name.ts`, `insertar_asesores.ts` — son migraciones puntuales ya ejecutadas; no forman parte del flujo normal ni se corren con `npm run dev`
3. **`replace_urls.js`** en raíz: reemplaza URLs hardcodeadas al cambiar entre entornos
3. **ODP.timestamps = false** — la tabla `odp` no tiene `createdAt`/`updatedAt`; usa `fecha_creacion` manual
4. **Módulo `mobile-app/`** usa Expo Router (file-based routing en `app/`), no React Navigation
5. **Importar modelos siempre desde `models/index.ts`** para que las asociaciones estén cargadas
6. **`puede_gestionar_pv`** en modelo `Usuario` — campo booleano que controla acceso al tab "Por Gestionar" en Pedidos PV. Debe estar definido en el modelo Sequelize o `toJSON()` no lo incluirá en el login
7. **ODPItem.`color`** y **ODPItem.`tipo_vidrio`**: `color` es el campo principal (select con opciones fijas); `tipo_vidrio` se usa como campo libre cuando `color='Otro'`. El campo `prod` (PROD) es el tipo de proceso (CR, PV, LAM, etc.)
8. **`odp_items.estado_compra`**: `pendiente | en_odc | en_existencia` — tracking de ítems de vidrio sin pasar por SAP
9. **`ordenes_compra.tipo`**: `'perfileria' | 'vidrio'` — ODC de vidrio tienen `sap_id=null` y usan `odc_items.odp_item_id`
10. **Módulo ROOT:** `backend-api/src/utils/requestContext.ts` usa `AsyncLocalStorage` para inyectar `userId`, `userName` e `ip` en cada request — los hooks Sequelize de auditoría lo leen para grabar quién hizo qué. Los hooks están en `models/index.ts` al final, cubriendo 25 modelos.
11. **Auditoría — hook `beforeUpdate`:** guarda `instance.previous()` en `instance._auditAntes` antes del update; `afterUpdate` lo usa para grabar `datos_anteriores`. Si `datos_anteriores` es null en un UPDATE, el revert no puede ejecutarse.
12. **Health checks ROOT:** Supabase se verifica con `SELECT 1` directo a la BD (no HTTP). Cloudinary usa `status.cloudinary.com/api/v2/status.json`. Ambos más confiables que pings a endpoints protegidos.
13. **Catálogo de productos:** movido de `ConfiguracionPage` al tab "Catálogo" del módulo ROOT. La ruta `/api/catalogo/all` (y POST/PUT/DELETE) ahora incluye rol `root` además de `admin` y `gerencia`.

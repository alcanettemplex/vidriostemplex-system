# CLAUDE.md — Vidrios Templex System

Contexto persistente del proyecto para Claude Code. Actualizar cuando cambien aspectos significativos de la arquitectura.

---

## Descripción del Proyecto

Sistema ERP empresarial para **Vidrios Templex**, empresa de instalación y fabricación de vidrios y aluminio. Gestiona el ciclo completo: cotización → producción → instalación → facturación → cobro.

**Monorepo** con tres sub-proyectos independientes:
- `backend-api/` — API REST + WebSockets
- `frontend-web/` — Aplicación web de gestión
- `mobile-app/` — App móvil para instaladores

---

## Stack Tecnológico

### Backend (`backend-api/`)
| Capa | Tecnología |
|------|-----------|
| Runtime | Node.js 20 (Alpine en Docker) |
| Framework | Express.js 5.1.0 |
| Lenguaje | TypeScript 5.9.3 |
| ORM | Sequelize 6.37.7 |
| Base de datos | PostgreSQL (Supabase en producción) |
| Auth | JWT (jsonwebtoken 9.0.2) + bcrypt 6.0.0 |
| WebSockets | Socket.io 4.8.1 |
| Archivos | Cloudinary + Multer 2.1.1 |
| Seguridad | Helmet, CORS, express-rate-limit 8.3.1 |
| Validación | Zod 4.3.6 |
| Correo | Nodemailer 7.0.10 |

### Frontend (`frontend-web/`)
| Capa | Tecnología |
|------|-----------|
| Framework | React 19.2.0 |
| UI | Material-UI (MUI) 7.3.5 |
| Estado | Redux Toolkit 2.10.1 + React-Redux 9.2.0 |
| Routing | React Router DOM 7.13.1 |
| Estilos | Tailwind CSS 3.4.19 + Emotion |
| HTTP | Axios 1.13.2 |
| WebSockets | socket.io-client 4.8.3 |
| Gráficos | Recharts 3.7.0 |
| Mapas | Leaflet 1.9.4 + react-leaflet 5.0.0 |
| Formularios | React Hook Form 7.71.2 + Zod |
| PDF | jspdf 4.2.0 + jspdf-autotable |
| Excel | xlsx 0.18.5 |
| Animaciones | Framer Motion 12.35.0 |
| Drag & Drop | @hello-pangea/dnd 18.0.1 |
| QR | qrcode.react 4.2.0 |
| Iconos | Lucide React 0.577.0 |
| Fechas | date-fns 4.1.0 |

### Mobile (`mobile-app/`)
| Capa | Tecnología |
|------|-----------|
| Framework | Expo 54.0.22 + Expo Router 6.0.14 |
| Runtime | React Native 0.81.5 |
| Estado | Redux Toolkit 2.10.1 |
| Cámara | react-native-camera 4.2.1 |
| Mapas | react-native-maps 1.26.18 |
| Storage | @react-native-async-storage 2.2.0 |
| WebSockets | socket.io-client 4.8.1 |
| Firma | react-native-signature-capture 0.4.12 |

### Base de Datos
- **DBMS**: PostgreSQL (Supabase, AWS us-east-1)
- **Host producción**: `aws-1-us-east-1.pooler.supabase.com:5432`
- **SSL**: Obligatorio (`rejectUnauthorized: false`)

### Almacenamiento de Archivos
- **Proveedor**: Cloudinary
- **Folder**: `templex_instalaciones`
- **Formatos**: JPG, JPEG, PNG, WebP
- **Redimensión**: 1200px máximo, compresión automática

---

## Estructura de Carpetas

```
vidrios-templex-system/
├── backend-api/
│   └── src/
│       ├── app.ts                 # Configuración Express
│       ├── server.ts              # Entrada + Socket.io
│       ├── config/
│       │   ├── database.ts        # Sequelize + PostgreSQL
│       │   └── upload.ts          # Cloudinary + Multer
│       ├── controllers/           # 16 controladores
│       ├── models/                # 19 modelos Sequelize
│       ├── routes/                # 15 archivos de rutas
│       ├── middlewares/
│       │   ├── authMiddleware.ts  # JWT Bearer
│       │   ├── rbacMiddleware.ts  # Control por roles
│       │   ├── errorHandler.ts
│       │   └── rateLimiter.ts
│       └── scripts/               # Migraciones y seeds
├── frontend-web/
│   └── src/
│       ├── components/
│       │   ├── common/            # Navbar, Sidebar, ProtectedRoute
│       │   ├── dashboard/         # Charts, KPIs, Panels
│       │   └── ui/
│       ├── features/              # Módulos con slices Redux
│       │   ├── auth/
│       │   ├── clientes/
│       │   ├── odp/               # ⭐ Módulo central
│       │   ├── produccion/
│       │   ├── instalaciones/
│       │   ├── evidencias/
│       │   ├── compras/
│       │   ├── contabilidad/
│       │   ├── usuarios/
│       │   ├── reportes/
│       │   └── configuracion/
│       ├── routes/
│       │   └── AppRoutes.tsx
│       ├── store/
│       │   ├── store.ts
│       │   ├── rootReducer.ts
│       │   ├── notificationsSlice.ts
│       │   ├── useSocketNotifications.ts
│       │   └── socket.ts
│       └── theme/
│           └── theme.ts           # Tema MUI
├── mobile-app/
│   ├── app/                       # Expo Router (file-based)
│   └── src/
│       ├── navigation/
│       ├── screens/
│       └── store/
├── database/
│   ├── init.sql
│   └── add_compras_pagos.sql
├── deployment/
│   ├── docker-compose.yml
│   └── nginx.conf
├── Formatos/                      # Documentos Excel/Word
├── docker-compose.yml
├── .env.example
└── replace_urls.js
```

---

## Entidad Central: ODP (Orden de Producción)

La ODP es el núcleo del sistema. Tiene tres estados independientes:

### Estados de Producción
`EN_ESPERA` → `MEDICION` → `PEDIDO_PROVEEDOR` → `ALUMINIO_CORTADO` → `VIDRIO_RECIBIDO` → `ACCESORIOS_SEPARADOS` → `LISTO_INSTALAR` → `PROGRAMADA` → `INSTALADA` → `ENTREGADA` | `PAUSADA`

### Estados de Facturación
`PENDIENTE` → `FACTURADA`

### Estados de Caja
`PENDIENTE` → `ABONADO` → `CANCELADO` | `CREDITO_APROBADO`

---

## Modelos de Base de Datos (19 modelos)

| Modelo | Descripción |
|--------|-------------|
| `Usuario` | Usuarios del sistema con roles |
| `Cliente` | Clientes/empresas |
| `ODP` ⭐ | Orden de Producción (entidad central) |
| `ODP_Item` | Items dentro de una ODP |
| `Cotizacion` | Cotizaciones por ODP |
| `Toma_Medidas` | Mediciones de instalación |
| `Orden_Compra` | Órdenes a proveedores |
| `Pago` | Registros de pagos |
| `Evidencia_Instalacion` | Fotos de instalación (Cloudinary) |
| `No_Conformidad` | Reportes de defectos (puede generar nueva ODP) |
| `Nota_Produccion` | Notas internas de producción |
| `SAP` | Integración SAP (potencial) |
| `SAP_Item` | Items de SAP |
| `Programacion_Instalacion` | Calendario de instalaciones |
| `Vehiculo` | Vehículos para instalación |
| `Historial_Estado_ODP` | Auditoría de cambios de estado |
| `Meta_Mensual` | Metas por usuario |
| `Configuracion_Global` | Configuraciones del sistema |
| `Produccion` | Control adicional de producción |

---

## Roles de Usuario (RBAC)

```
admin | gerencia | jefe_produccion | asesor_comercial |
produccion | auxiliar_produccion | instalador | contabilidad | compras
```

**Ejemplos de permisos ODP:**
- GET: todos los autenticados
- POST: admin, gerencia, asesor_comercial
- PUT: admin, gerencia, asesor_comercial, jefe_produccion, produccion, auxiliar_produccion
- DELETE: admin, gerencia

---

## Variables de Entorno

### Raíz / Backend
```env
PORT=3001
JWT_SECRET=...
DATABASE_URL=postgresql://usuario:password@host:5432/database
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
FRONTEND_URL=http://localhost:3000
```

### Frontend
```env
REACT_APP_API_URL=http://localhost:3001
REACT_APP_SUPABASE_URL=...
REACT_APP_SUPABASE_ANON_KEY=...
CI=false
```

---

## Scripts Principales

### Backend
```bash
npm run dev      # Desarrollo con nodemon (hot-reload)
npm run build    # Compilar TypeScript → dist/
npm run start    # Producción (node dist/server.js)
npm run lint     # ESLint
npm run lint:fix # Arreglar ESLint automáticamente
npm run format   # Prettier
```

### Frontend
```bash
npm start    # Dev server http://localhost:3000
npm run build # Build producción
npm test     # Tests
```

### Mobile
```bash
expo start           # Iniciar Expo
expo start --android # Emulador Android
expo start --ios     # Simulador iOS
```

---

## Despliegue

### Producción actual
- **Frontend**: Netlify o Vercel (CORS configurado para `*.netlify.app` y `*.vercel.app`)
- **Backend**: Docker (node:20-alpine)
- **Base de datos**: Supabase PostgreSQL (AWS us-east-1)
- **Archivos**: Cloudinary

### Docker Compose
```yaml
# Servicios: backend (3001) + frontend (80/nginx)
# Backend: multi-stage build (builder + node:20-alpine)
# Frontend: multi-stage build (builder + nginx:alpine)
```

### Nginx
- Reverse proxy: `/api/` → backend:3001
- SPA routing: `try_files $uri $uri/ /index.html`

---

## Seguridad

- **JWT**: Expiración 8 horas, Bearer token en Authorization header
- **Rate limiting**: 200 req/15min global, 10 intentos/15min en /auth/login
- **Helmet**: Headers HTTP de seguridad
- **CORS**: Whitelist explícita + patrones `*.netlify.app`, `*.vercel.app`
- **bcrypt**: Hash de contraseñas
- **SSL**: Obligatorio en conexión a Supabase

---

## WebSockets (Socket.io)

- Configurado en `backend-api/src/server.ts`
- Frontend escucha eventos via `useSocketNotifications` hook
- Mobile tiene `src/store/socket.ts`
- Uso: notificaciones en tiempo real de cambios de estado

---

## Rutas del Frontend

| Ruta | Página | Acceso |
|------|--------|--------|
| `/login` | LoginPage | Público |
| `/` | Dashboard | Protegido |
| `/clientes` | ClientesListPage | Protegido |
| `/odp` | ODPListPage | Protegido |
| `/produccion` | ProduccionPage | Protegido |
| `/instalaciones` | InstalacionesPage | Protegido |
| `/evidencias` | EvidenciasPage | Protegido |
| `/compras` | ComprasPage | Protegido |
| `/contabilidad` | ContabilidadPage | Protegido |
| `/usuarios` | UsuariosPage | Protegido |
| `/reportes` | ReportesPage | Protegido |
| `/configuracion` | ConfiguracionPage | Protegido |

---

## Convenciones de Código

### Backend
- TypeScript estricto (`"strict": true`)
- ESLint con `@typescript-eslint` + Prettier
- No usar `any` explícito (warn)
- No `console.log` (solo `console.error` y `console.warn` permitidos)
- Patrón MVC: controllers → models → routes
- Middlewares encadenados: auth → rbac → controller

### Frontend
- Cada módulo en `features/<nombre>/` con su slice Redux y páginas
- Componentes comunes en `components/common/`
- Tema MUI centralizado en `theme/theme.ts`
- Axios para HTTP, socket.io-client para WS

### Commits recientes relevantes
- CORS actualizado para soportar `*.netlify.app` y `*.vercel.app`
- `_redirects` para Netlify SPA routing
- `CI=false` en frontend para permitir warnings en build de Vercel

---

## Notas Importantes

1. **No hay tests** en backend actualmente (`echo 'Error: no test specified'`)
2. **`replace_urls.js`** en raíz: script para reemplazar URLs hardcodeadas en desarrollo
3. **`mobile-app/`** usa Expo Router (file-based routing), no React Navigation directo
4. **No_Conformidad** puede generar una nueva ODP derivada (`odp_padre_id` en ODP)
5. **Historial_Estado_ODP** registra cada cambio de estado para auditoría
6. La base de datos usa SSL obligatorio con `rejectUnauthorized: false` (Supabase)
7. **`CI=false`** en el `.env` del frontend para que los warnings no rompan el build

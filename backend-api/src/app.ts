import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { globalLimiter } from './middlewares/rateLimiter';
import usuarioRoutes from './routes/usuario.routes';
import authRoutes from './routes/auth.routes';
import clienteRoutes from './routes/cliente.routes';
import odpRoutes from './routes/odp.routes';
import instalacionRoutes from './routes/instalacion.routes';
import evidenciaRoutes from './routes/evidencia.routes';
import produccionRoutes from './routes/produccion.routes';
import indexRoutes from './routes/index';
import dashboardRoutes from './routes/dashboard.routes';
import documentosRoutes from './routes/documentos.routes';
import comprasRoutes from './routes/compras.routes';
import contabilidadRoutes from './routes/contabilidad.routes';
import noConformidadRoutes from './routes/no_conformidad.routes';
import configuracionRoutes from './routes/configuracion.routes';
import notaProduccionRoutes from './routes/nota_produccion.routes';
import catalogoRoutes from './routes/catalogo.routes';
import prospectosRoutes from './routes/prospectos.routes';
import inventarioPerfileriaRoutes from './routes/inventario_perfileria.routes';
import rutasRoutes from './routes/rutas.routes';
import pedidoPVRoutes from './routes/pedido_pv.routes';
import salidasAlmacenRoutes from './routes/salidas_almacen.routes';
import rootRoutes from './routes/root.routes';
import cotizacionesRoutes from './routes/cotizaciones.routes';
import cotizacionCapturasRoutes from './routes/cotizacion_capturas.routes';
import { requestContext } from './utils/requestContext';

const app = express();

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  process.env.FRONTEND_URL,
].filter(Boolean) as string[];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const cleanOrigin = origin.replace(/\/$/, "");
    const isAllowed = allowedOrigins.some(allowed => allowed.replace(/\/$/, "") === cleanOrigin) || 
                      cleanOrigin.endsWith('.netlify.app') || 
                      cleanOrigin.endsWith('.vercel.app');
    if (isAllowed) return callback(null, true);
    return callback(new Error(`Origen no autorizado por CORS: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(helmet());
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));

app.use(globalLimiter);

// Middleware de contexto de request (para auditoría)
app.use((req, res, next) => {
  const jwt = req.headers.authorization?.split(' ')[1];
  let userId: number | null = null;
  let userName: string | null = null;
  try {
    if (jwt) {
      const decoded: any = require('jsonwebtoken').decode(jwt);
      if (decoded?.id) userId = decoded.id;
      if (decoded?.nombre_completo) userName = decoded.nombre_completo;
    }
  } catch { /* silencioso */ }
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || null;
  requestContext.run({ userId, userName, ip }, next);
});

app.use('/', indexRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/usuarios', usuarioRoutes);
app.use('/api/clientes', clienteRoutes);
app.use('/api/odp', odpRoutes);
app.use('/api/instalaciones', instalacionRoutes);
app.use('/api/evidencias', evidenciaRoutes);
app.use('/api/produccion', produccionRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/documentos', documentosRoutes);
app.use('/api/compras', comprasRoutes);
app.use('/api/contabilidad', contabilidadRoutes);
app.use('/api/no-conformidad', noConformidadRoutes);
app.use('/api/configuracion', configuracionRoutes);
app.use('/api/notas-produccion', notaProduccionRoutes);
app.use('/api/catalogo', catalogoRoutes);
app.use('/api/prospectos', prospectosRoutes);
app.use('/api/inventario-perfileria', inventarioPerfileriaRoutes);
app.use('/api/rutas', rutasRoutes);
app.use('/api/pedidos-pv', pedidoPVRoutes);
app.use('/api/facturas-salidas', salidasAlmacenRoutes);
app.use('/api/root', rootRoutes);
app.use('/api/cotizaciones', cotizacionesRoutes);
app.use('/api/cotizacion-capturas', cotizacionCapturasRoutes);

import { errorHandler } from './middlewares/errorHandler';
app.use(errorHandler);

export default app;

import app from './app';
import { sequelize } from './models';
import http from 'http';
import { Server } from 'socket.io';
import cron from 'node-cron';
import { Op } from 'sequelize';
import PedidoPV from './models/pedido_pv.model';

const PORT = process.env.PORT || 3001;
const server = http.createServer(app);

// ─── Seguridad: Socket.io con CORS restringido ──────────────────────────────
const allowedOrigins = [
  'http://localhost:3000',
  process.env.FRONTEND_URL,
].filter(Boolean) as string[];

export const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const cleanOrigin = origin.replace(/\/$/, "");
      const isAllowed = allowedOrigins.some(allowed => allowed.replace(/\/$/, "") === cleanOrigin) || 
                        cleanOrigin.endsWith('.netlify.app') ||
                        cleanOrigin.endsWith('.vercel.app') ||
                        cleanOrigin.endsWith('.pages.dev');
      if (isAllowed) return callback(null, true);
      return callback(new Error(`Origen no autorizado por CORS en Socket.io: ${origin}`));
    },
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

const ROLES_VALIDOS = new Set([
  'root', 'admin', 'gerencia', 'jefe_produccion', 'asesor_comercial',
  'produccion', 'auxiliar_produccion', 'instalador', 'conductor',
  'contabilidad', 'compras', 'asistente_administrativo',
]);

io.on('connection', (socket) => {
  socket.on('join', (data: unknown) => {
    if (!data || typeof data !== 'object') return;
    const { userId, rol } = data as Record<string, unknown>;
    if (typeof userId === 'number' && Number.isInteger(userId) && userId > 0) {
      socket.join(`user_${userId}`);
    }
    if (typeof rol === 'string' && ROLES_VALIDOS.has(rol)) {
      socket.join(`role_${rol}`);
    }
  });

  socket.on('disconnect', () => {
    // rooms se limpian automáticamente
  });
});

// ─── Helper para broadcast de cambios de datos (sincronización en tiempo real) ─
export const emitirCambio = (modulo: string) => {
  io.emit('data_changed', { modulo });
};

// ─── Helper genérico para emitir eventos con payload arbitrario ──────────────
export const emitirEvento = (evento: string, data: unknown) => {
  io.emit(evento, data);
};

// ─── Helper para emitir notificaciones dirigidas ─────────────────────────────
export const emitirNotificacion = (
  destinatarios: { userId?: number; roles?: string[] },
  payload: { titulo: string; mensaje: string; odp_id?: number; numero_odp?: string; tipo?: string }
) => {
  if (destinatarios.userId) {
    io.to(`user_${destinatarios.userId}`).emit('notification', payload);
  }
  if (destinatarios.roles) {
    destinatarios.roles.forEach(rol => {
      io.to(`role_${rol}`).emit('notification', payload);
    });
  }
};

// ─── Estado del cron PV (en memoria, visible desde root.controller) ──────────
export const cronPVStatus = {
  ultima_ejecucion: null as Date | null,
  resultado: 'sin_ejecutar' as 'ok' | 'error' | 'sin_ejecutar',
  alertas_enviadas: 0,
  error_mensaje: null as string | null,
};

export const getWSCount = () => io.sockets.sockets.size;

// ─── Cron: alertas de tardanza de pedidos PV (diario a las 8am) ─────────────
cron.schedule('0 8 * * *', async () => {
  cronPVStatus.ultima_ejecucion = new Date();
  cronPVStatus.error_mensaje = null;
  try {
    const manana = new Date();
    manana.setDate(manana.getDate() + 1);
    const mananaStr = manana.toISOString().split('T')[0];

    const pedidosPorVencer = await PedidoPV.findAll({
      where: {
        estado: { [Op.in]: ['ENVIADO', 'CONFIRMADO_PROVEEDOR'] },
        fecha_entrega_prometida: { [Op.lte]: mananaStr },
        alerta_enviada: false,
      },
    });

    for (const pedido of pedidosPorVencer) {
      const numeroPedido = pedido.getDataValue('numero_pedido');
      const fechaPrometida = pedido.getDataValue('fecha_entrega_prometida');

      emitirNotificacion(
        { roles: ['asesor_comercial', 'jefe_produccion', 'produccion', 'compras', 'gerencia'] },
        {
          titulo: `⏰ Pedido PV ${numeroPedido} — Vence mañana`,
          mensaje: `El pedido PV ${numeroPedido} tiene entrega prometida para ${fechaPrometida} y aún no ha llegado.`,
          tipo: 'PV_ALERTA_TARDANZA',
        }
      );

      await pedido.update({ alerta_enviada: true });
    }

    cronPVStatus.resultado = 'ok';
    cronPVStatus.alertas_enviadas = pedidosPorVencer.length;
    if (pedidosPorVencer.length > 0) {
      console.warn(`[Cron PV] ${pedidosPorVencer.length} alerta(s) de tardanza enviadas`);
    }
  } catch (err: any) {
    cronPVStatus.resultado = 'error';
    cronPVStatus.error_mensaje = err?.message || 'Error desconocido';
    console.error('[Cron PV] Error en alerta de tardanza:', err);
  }
});

(async () => {
  try {
    await sequelize.authenticate();

    // Seguridad: Solo sincronizar schema en desarrollo, NUNCA en producción
    if (process.env.NODE_ENV !== 'production') {
      await sequelize.sync({ alter: false });
      console.log('Schema sincronizado (modo desarrollo).');
    }

    console.log('Conexión a la base de datos exitosa.');
    server.listen(PORT, () => {
      console.log(`Servidor backend (REST + WS) escuchando en puerto ${PORT}`);
    });
  } catch (error) {
    console.error('Error al conectar a la base de datos:', error);
    process.exit(1);
  }
})();

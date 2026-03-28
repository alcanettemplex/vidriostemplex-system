import app from './app';
import { sequelize } from './models';
import http from 'http';
import { Server } from 'socket.io';

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
                        cleanOrigin.endsWith('.vercel.app');
      if (isAllowed) return callback(null, true);
      return callback(new Error(`Origen no autorizado por CORS en Socket.io: ${origin}`));
    },
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

io.on('connection', (socket) => {
  // El cliente envía su userId y rol al conectarse para unirse a sus rooms
  socket.on('join', ({ userId, rol }: { userId: number; rol: string }) => {
    if (userId) socket.join(`user_${userId}`);
    if (rol) socket.join(`role_${rol}`);
  });

  socket.on('disconnect', () => {
    // rooms se limpian automáticamente
  });
});

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

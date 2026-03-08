import app from './app';
import { sequelize } from './models';
import http from 'http';
import { Server } from 'socket.io';

const PORT = process.env.PORT || 3001;
const server = http.createServer(app);

export const io = new Server(server, {
  cors: { origin: '*' }
});

io.on('connection', (socket) => {
  console.log('Socket conectado:', socket.id);
  socket.on('disconnect', () => {
    console.log('Socket desconectado:', socket.id);
  });
});

(async () => {
  try {
    await sequelize.authenticate();
    await sequelize.sync();
    console.log('Conexión a la base de datos exitosa.');
    server.listen(PORT, () => {
      console.log(`Servidor backend (REST + WS) escuchando en puerto ${PORT}`);
    });
  } catch (error) {
    console.error('Error al conectar a la base de datos:', error);
  }
})();

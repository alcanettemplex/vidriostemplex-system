import { Server } from 'socket.io';
import http from 'http';
import app from './app';

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

io.on('connection', (socket) => {
  console.log('Usuario conectado:', socket.id);
  socket.on('join', (room) => socket.join(room));
  socket.on('notify', (data) => {
    io.to(data.room).emit('notification', data);
  });
  socket.on('disconnect', () => {
    console.log('Usuario desconectado:', socket.id);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Servidor backend con Socket.IO en puerto ${PORT}`);
});

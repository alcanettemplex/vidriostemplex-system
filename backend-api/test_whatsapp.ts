import { WhatsappService } from './src/services/whatsapp.service';

async function test() {
  const ws = new WhatsappService();
  await ws.initialize();
  console.log('¡Autenticado con éxito! Presiona Ctrl+C para salir.');
}

test();

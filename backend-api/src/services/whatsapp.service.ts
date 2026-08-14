import { Client, LocalAuth } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';

export class WhatsappService {
  private client: Client;
  private isReady: boolean = false;

  constructor() {
    this.client = new Client({
      authStrategy: new LocalAuth(),
      puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      }
    });

    this.client.on('qr', (qr) => {
      console.log('Escanea este código QR con tu WhatsApp:');
      qrcode.generate(qr, { small: true });
    });

    this.client.on('ready', () => {
      console.log('Cliente de WhatsApp conectado y listo.');
      this.isReady = true;
    });

    this.client.on('auth_failure', (msg) => {
      console.error('Fallo de autenticación en WhatsApp:', msg);
    });
  }

  public async initialize(): Promise<void> {
    console.log('Inicializando cliente de WhatsApp...');
    await this.client.initialize();
    
    // Esperar a que esté listo
    return new Promise((resolve) => {
      const interval = setInterval(() => {
        if (this.isReady) {
          clearInterval(interval);
          resolve();
        }
      }, 500);
    });
  }

  public async enviarMensaje(numero: string, mensaje: string): Promise<void> {
    try {
      if (!this.isReady) {
        console.log('El cliente no está listo aún.');
        return;
      }
      
      // Formato para whatsapp-web.js: numero@c.us
      // Limpiamos el número por si trae el + o espacios
      const numLimpio = numero.replace(/\D/g, '');
      const chatId = `${numLimpio}@c.us`;

      await this.client.sendMessage(chatId, mensaje);
      console.log(`Mensaje enviado correctamente a ${numero}`);
    } catch (error) {
      console.error(`Error enviando mensaje a ${numero}:`, error);
    }
  }
  
  public async close(): Promise<void> {
    await this.client.destroy();
    console.log('Conexión a WhatsApp cerrada.');
  }
}

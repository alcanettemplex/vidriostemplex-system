import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
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

const app = express();

app.use(cors());
app.use(helmet());
app.use(morgan('dev'));
app.use(express.json());

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

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('SERVER ERROR CAUGHT:', err);
    res.status(500).json({ error: 'Error interno de servidor', message: err.message || err });
});

export default app;

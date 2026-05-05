import { Router } from 'express';
import authMiddleware from '../middlewares/authMiddleware';
import {
  getResumen,
  getAsesores,
  getProduccionCritica,
  getFinanciero,
  getCalidad,
  getRecomendaciones,
} from '../controllers/informe_ejecutivo.controller';

const router = Router();

const requireRoot = (req: any, res: any, next: any) => {
  if (!req.user || req.user.rol !== 'root') {
    return res.status(403).json({ error: 'Acceso exclusivo para rol ROOT' });
  }
  next();
};

router.use(authMiddleware, requireRoot);

router.get('/resumen',            getResumen);
router.get('/asesores',           getAsesores);
router.get('/produccion-critica', getProduccionCritica);
router.get('/financiero',         getFinanciero);
router.get('/calidad',            getCalidad);
router.get('/recomendaciones',    getRecomendaciones);

export default router;

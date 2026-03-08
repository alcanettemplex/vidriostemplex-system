import { Request, Response } from 'express';

export const getDashboardData = async (_req: Request, res: Response) => {
  // Aquí se puede agregar lógica real de KPIs y métricas
  res.json({
    ventas: 120,
    odps: 45,
    eficiencia: 0.91,
    produccion: 33,
    instaladas: 27,
    no_conformidades: 2,
    asesores: [
      { nombre: 'Juan', ventas: 50 },
      { nombre: 'Ana', ventas: 70 }
    ]
  });
};

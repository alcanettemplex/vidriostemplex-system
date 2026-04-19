import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';

const DOCS_DIR = path.resolve(__dirname, '..', 'assets');

const PDFS: Record<string, { file: string; roles: string[] }> = {
  usuario: {
    file: 'Manual_Usuario_Vidrios_Templex_ERP.pdf',
    roles: [], // vacío = todos los roles autenticados
  },
  tecnico: {
    file: 'Manual_Tecnico_Vidrios_Templex_ERP.pdf',
    roles: ['root', 'admin', 'gerencia', 'jefe_produccion'],
  },
};

export const servirManual = (tipo: 'usuario' | 'tecnico') => {
  return (req: Request, res: Response): void => {
    const config = PDFS[tipo];
    const userRol = (req as any).user?.rol as string | undefined;

    if (config.roles.length > 0 && (!userRol || !config.roles.includes(userRol))) {
      res.status(403).json({ error: 'Acceso denegado' });
      return;
    }

    const filePath = path.join(DOCS_DIR, config.file);

    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Manual no encontrado' });
      return;
    }

    const stat = fs.statSync(filePath);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Disposition', `attachment; filename="${config.file}"`);
    fs.createReadStream(filePath).pipe(res);
  };
};

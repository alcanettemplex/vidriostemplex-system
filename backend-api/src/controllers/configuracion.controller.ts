import { Request, Response } from 'express';
import { ConfiguracionGlobal, MetaMensual, MetaUsuarioMensual, Usuario } from '../models';

export const obtenerConfiguracion = async (req: Request, res: Response) => {
  try {
    let config = await ConfiguracionGlobal.findOne({ where: { id: 1 } });
    
    // Si no existe, crear la configuración por defecto
    if (!config) {
      config = await ConfiguracionGlobal.create({
        id: 1,
        meta_facturacion_mensual:   120000000.00,
        meta_ciclo_produccion_dias: 8,
        dias_alerta_odp_estancada:  2,
        dias_alerta_cartera_vencida: 60,
        meta_odps_cerradas_asesor:  12
      });
    }

    res.json(config);
  } catch (error: any) {
    res.status(500).json({ error: 'Error obteniendo configuración: ' + error.message });
  }
};

export const actualizarConfiguracion = async (req: Request, res: Response) => {
  try {
    const data = req.body;
    
    let config = await ConfiguracionGlobal.findOne({ where: { id: 1 } });
    if (!config) {
      config = await ConfiguracionGlobal.create({ id: 1, ...data });
    } else {
      await config.update({ ...data, ultima_modificacion: new Date() });
    }

    res.json({ message: 'Configuración actualizada exitosamente', config });
  } catch (error: any) {
    res.status(500).json({ error: 'Error actualizando configuración: ' + error.message });
  }
};

export const obtenerMetasMes = async (req: Request, res: Response) => {
  try {
    const { anio, mes } = req.params;
    let meta = await MetaMensual.findOne({ where: { anio, mes } });
    
    // Si no hay meta mensual específica, crear con valor global de respaldo
    if (!meta) {
      const globalConfig       = await ConfiguracionGlobal.findOne({ where: { id: 1 } });
      const facturacionDefault = globalConfig ? globalConfig.getDataValue('meta_facturacion_mensual') : 120000000;
      meta = await MetaMensual.create({ anio, mes, meta_facturacion: facturacionDefault });
    }

    res.json(meta);
  } catch (error: any) {
    res.status(500).json({ error: 'Error obteniendo metas del mes: ' + error.message });
  }
};

export const actualizarMetasMes = async (req: Request, res: Response) => {
  try {
    const { anio, mes }      = req.params;
    const { meta_facturacion } = req.body;

    let meta = await MetaMensual.findOne({ where: { anio, mes } });
    if (meta) {
      await meta.update({ meta_facturacion });
    } else {
      meta = await MetaMensual.create({ anio, mes, meta_facturacion });
    }

    res.json({ message: 'Metas mensuales actualizadas', meta });
  } catch (error: any) {
    res.status(500).json({ error: 'Error actualizando metas del mes: ' + error.message });
  }
};

// ─── Metas individuales por usuario ──────────────────────────────────────────

const ROLES_META = ['asesor_comercial', 'jefe_produccion', 'gerencia'];

export const obtenerMetasUsuariosMes = async (req: Request, res: Response) => {
  try {
    const { anio, mes } = req.params;

    const usuarios = await Usuario.findAll({
      where: { rol: ROLES_META },
      attributes: ['id', 'nombre_completo', 'rol'],
      order: [['nombre_completo', 'ASC']]
    });

    const metas = await MetaUsuarioMensual.findAll({
      where: { anio: Number(anio), mes: Number(mes) }
    });

    const result = usuarios.map(u => {
      const meta = metas.find(m => m.getDataValue('usuario_id') === u.getDataValue('id'));
      return {
        usuario_id:       u.getDataValue('id'),
        nombre_completo:  u.getDataValue('nombre_completo'),
        rol:              u.getDataValue('rol'),
        meta_facturacion: meta ? Number(meta.getDataValue('meta_facturacion')) : 0
      };
    });

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: 'Error obteniendo metas de usuarios: ' + error.message });
  }
};

export const actualizarMetasUsuariosMes = async (req: Request, res: Response) => {
  try {
    const { anio, mes } = req.params;
    const items: { usuario_id: number; meta_facturacion: number }[] = req.body;

    for (const item of items) {
      await MetaUsuarioMensual.upsert({
        usuario_id:       item.usuario_id,
        anio:             Number(anio),
        mes:              Number(mes),
        meta_facturacion: item.meta_facturacion ?? 0
      });
    }

    res.json({ message: 'Metas de usuarios actualizadas exitosamente' });
  } catch (error: any) {
    res.status(500).json({ error: 'Error actualizando metas de usuarios: ' + error.message });
  }
};

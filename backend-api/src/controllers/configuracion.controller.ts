import { Request, Response } from 'express';
import { ConfiguracionGlobal, MetaMensual } from '../models';

export const obtenerConfiguracion = async (req: Request, res: Response) => {
  try {
    let config = await ConfiguracionGlobal.findOne({ where: { id: 1 } });
    
    // Si no existe, crear la configuración por defecto
    if (!config) {
      config = await ConfiguracionGlobal.create({
        id: 1,
        meta_facturacion_mensual: 120000000.00,
        meta_odps_cerradas_asesor: 12,
        meta_ciclo_produccion_dias: 8,
        dias_alerta_odp_estancada: 2,
        dias_alerta_cartera_vencida: 60
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
    
    // Si no hay meta mensual especifica, leemos configuración global de respaldo
    if (!meta) {
      const globalConfig = await ConfiguracionGlobal.findOne({ where: { id: 1 } });
      const facturacionDefault = globalConfig ? globalConfig.getDataValue('meta_facturacion_mensual') : 120000000;
      const odpsDefault = globalConfig ? globalConfig.getDataValue('meta_odps_cerradas_asesor') : 12;
      
      meta = await MetaMensual.create({
        anio,
        mes,
        meta_facturacion: facturacionDefault,
        meta_odps_asesor: odpsDefault
      });
    }

    res.json(meta);
  } catch (error: any) {
    res.status(500).json({ error: 'Error obteniendo metas del mes: ' + error.message });
  }
};

export const actualizarMetasMes = async (req: Request, res: Response) => {
  try {
    const { anio, mes } = req.params;
    const { meta_facturacion, meta_odps_asesor } = req.body;
    
    let meta = await MetaMensual.findOne({ where: { anio, mes } });
    if (meta) {
      await meta.update({ meta_facturacion, meta_odps_asesor });
    } else {
      meta = await MetaMensual.create({ anio, mes, meta_facturacion, meta_odps_asesor });
    }

    res.json({ message: 'Metas mensuales actualizadas', meta });
  } catch (error: any) {
    res.status(500).json({ error: 'Error actualizando metas del mes: ' + error.message });
  }
};

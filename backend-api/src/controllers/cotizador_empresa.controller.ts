// Datos de la empresa que encabezan cada cotización impresa.
import { Request, Response } from 'express';
import { z } from 'zod';
import * as empresaStore from '../cotizador/store/empresaStore';

const empresaSchema = z
  .object({
    razonSocial: z.string().max(120).optional(),
    nombreComercial: z.string().max(120).optional(),
    eslogan: z.string().max(200).optional(),
    nit: z.string().max(30).optional(),
    telefono: z.string().max(60).optional(),
    direccion: z.string().max(150).optional(),
    web: z.string().max(120).optional(),
    cuentaBancaria: z.record(z.string(), z.unknown()).optional(),
    garantia: z.string().optional(),
    validezOfertaDias: z.number().int().min(0).optional(),
    validezOfertaTexto: z.string().max(200).optional(),
    condicionesComerciales: z.array(z.string()).optional(),
    logoDataUri: z
      .string()
      .startsWith('data:image/', 'El logo debe ser una imagen en formato data URI.')
      .optional(),
    por: z.string().max(80).optional(),
  })
  .strict();

/**
 * GET /empresa
 *
 * El logo NO viene por defecto: son 23 KB de data URI que la mayoría de
 * pantallas no necesita. Se pide con `?incluirLogo=1`.
 */
export const obtenerEmpresa = async (req: Request, res: Response) => {
  try {
    const empresa = await empresaStore.leer(req.query.incluirLogo === '1');
    if (!empresa) {
      return res.status(404).json({ error: 'No hay datos de empresa configurados todavía.' });
    }
    res.json(empresa);
  } catch (e) {
    console.error('obtenerEmpresa:', e instanceof Error ? e.message : e);
    res.status(500).json({ error: 'No se pudieron leer los datos de la empresa.' });
  }
};

export const actualizarEmpresa = async (req: Request, res: Response) => {
  try {
    const { por, ...campos } = empresaSchema.parse(req.body ?? {});
    const actualizado = await empresaStore.guardar(campos, { por });
    // La empresa no vive en la caché: ningún motor la lee de forma síncrona.
    // El generador de PDF (Etapa 4) sí la necesitará en cada documento — si
    // entonces conviene cachearla, se añade el bucket y se invalida aquí.
    res.json(actualizado);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return res.status(400).json({ error: e.issues[0]?.message ?? 'Datos inválidos.' });
    }
    console.error('actualizarEmpresa:', e instanceof Error ? e.message : e);
    res.status(500).json({ error: 'No se pudieron guardar los datos de la empresa.' });
  }
};

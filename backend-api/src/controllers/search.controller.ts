import { Request, Response } from 'express';
import { Op } from 'sequelize';
import { ODP, Cliente, Prospecto, Lead, Usuario } from '../models';

export const globalSearch = async (req: Request, res: Response) => {
  try {
    const q = (req.query.q as string || '').trim();
    if (q.length < 2) {
      return res.json({ odps: [], clientes: [], prospectos: [], leads: [] });
    }

    const like = { [Op.iLike]: `%${q}%` };

    const [odps, clientes, prospectos, leads] = await Promise.all([
      ODP.findAll({
        where: {
          [Op.or]: [
            { numero_odp: like },
            { descripcion_pedido: like },
            { '$cliente.nombre_razon_social$': like },
          ],
        },
        include: [{ model: Cliente, as: 'cliente', attributes: ['nombre_razon_social'] }],
        attributes: ['id', 'numero_odp', 'estado_produccion', 'descripcion_pedido'],
        limit: 5,
        subQuery: false,
      }),

      Cliente.findAll({
        where: {
          [Op.or]: [
            { nombre_razon_social: like },
            { telefono: like },
            { nit_cedula: like },
          ],
        },
        attributes: ['id', 'nombre_razon_social', 'telefono', 'nit_cedula'],
        limit: 5,
      }),

      Prospecto.findAll({
        where: {
          [Op.or]: [
            { nombre_contacto: like },
            { telefono_contacto: like },
            { descripcion: like },
            { numero_prospecto: like },
          ],
        },
        include: [{ model: Usuario, as: 'asesor', attributes: ['nombre_completo'] }],
        attributes: ['id', 'numero_prospecto', 'nombre_contacto', 'telefono_contacto', 'descripcion', 'estado'],
        limit: 5,
      }),

      Lead.findAll({
        where: {
          [Op.or]: [
            { nombre: like },
            { telefono: like },
            { descripcion_contexto: like },
            { producto_interes: like },
          ],
        },
        include: [{ model: Usuario, as: 'asesor', attributes: ['nombre_completo'] }],
        attributes: ['id', 'nombre', 'telefono', 'estado_crm', 'producto_interes', 'descripcion_contexto'],
        limit: 5,
      }),
    ]);

    const formatODP = (o: any) => ({
      id: o.id,
      numero_odp: o.numero_odp,
      estado_produccion: o.estado_produccion,
      cliente_nombre: o.cliente?.nombre_razon_social || '—',
      descripcion: o.descripcion_pedido || '',
    });

    const formatCliente = (c: any) => ({
      id: c.id,
      nombre: c.nombre_razon_social,
      telefono: c.telefono || '—',
      nit: c.nit_cedula || '',
    });

    const formatProspecto = (p: any) => ({
      id: p.id,
      numero: p.numero_prospecto,
      nombre: p.nombre_contacto,
      telefono: p.telefono_contacto || '—',
      descripcion: p.descripcion || '',
      estado: p.estado,
      asesor: p.asesor?.nombre_completo || '',
    });

    const formatLead = (l: any) => ({
      id: l.id,
      nombre: l.nombre,
      telefono: l.telefono,
      estado_crm: l.estado_crm,
      producto: l.producto_interes || '',
      descripcion: l.descripcion_contexto || '',
      asesor: l.asesor?.nombre_completo || '',
    });

    res.json({
      odps:       odps.map(formatODP),
      clientes:   clientes.map(formatCliente),
      prospectos: prospectos.map(formatProspecto),
      leads:      leads.map(formatLead),
    });
  } catch (error: any) {
    console.error('Error en búsqueda global:', error);
    res.status(500).json({ error: 'Error en búsqueda global' });
  }
};

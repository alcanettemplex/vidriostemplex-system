import { Request, Response } from 'express';
import Usuario from '../models/usuario.model';
import bcrypt from 'bcrypt';

export const getUsuarios = async (_req: Request, res: Response) => {
  const usuarios = await Usuario.findAll();
  res.json(usuarios);
};

export const createUsuario = async (req: Request, res: Response) => {
  const { username, password, rol, nombre_completo, email } = req.body;
  const password_hash = await bcrypt.hash(password, 12);
  const usuario = await Usuario.create({ username, password_hash, rol, nombre_completo, email });
  res.status(201).json(usuario);
};

export const updateUsuario = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { username, rol, nombre_completo, email } = req.body;
  const usuario = await Usuario.findByPk(id);
  if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });
  await usuario.update({ username, rol, nombre_completo, email });
  res.json(usuario);
};

export const deleteUsuario = async (req: Request, res: Response) => {
  const { id } = req.params;
  const usuario = await Usuario.findByPk(id);
  if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });
  await usuario.destroy();
  res.json({ status: 'Usuario eliminado' });
};

export const setupAdmin = async (req: Request, res: Response) => {
  try {
    const adminExists = await Usuario.findOne({ where: { rol: 'admin' } });
    if (adminExists) return res.status(403).json({ error: 'El administrador ya existe' });

    const { username, password, nombre_completo, email } = req.body;
    if (!username || !password || !nombre_completo) {
      return res.status(400).json({ error: 'Faltan datos obligatorios' });
    }

    const password_hash = await bcrypt.hash(password, 12);
    const admin = await Usuario.create({ username, password_hash, rol: 'admin', nombre_completo, email });
    res.status(201).json({ message: 'Administrador base creado correctamente', username: admin.getDataValue('username') });
  } catch (error) {
    res.status(500).json({ error: 'Error al inicializar el administrador' });
  }
};

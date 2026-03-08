import { Request, Response } from 'express';
import Usuario from '../models/usuario.model';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey';

export const login = async (req: Request, res: Response) => {
  const { username, password } = req.body;
  const user = await Usuario.findOne({ where: { username } });
  if (!user) return res.status(401).json({ error: 'Usuario no encontrado' });
  const valid = await bcrypt.compare(password, user.getDataValue('password_hash'));
  if (!valid) return res.status(401).json({ error: 'Credenciales inválidas' });
  const token = jwt.sign({ id: user.getDataValue('id'), rol: user.getDataValue('rol') }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ token, user });
};

export const me = async (req: Request, res: Response) => {
  res.json({ user: req.user });
};

export const logout = async (_req: Request, res: Response) => {
  res.json({ status: 'logout' });
};

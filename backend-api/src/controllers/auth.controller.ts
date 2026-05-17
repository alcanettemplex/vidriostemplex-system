import { Request, Response } from 'express';
import Usuario from '../models/usuario.model';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET no configurado.');
}

export const login = async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });
    }

    const user = await Usuario.findOne({ where: { username } });
    if (!user) {
       return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const valid = await bcrypt.compare(password, user.getDataValue('password_hash'));
    
    if (!valid) return res.status(401).json({ error: 'Credenciales inválidas' });

    const token = jwt.sign(
      { id: user.getDataValue('id'), rol: user.getDataValue('rol') },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    // No exponer password_hash en la respuesta
    const userData = user.toJSON();
    delete userData.password_hash;

    res.json({ token, user: userData });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

export const me = async (req: Request, res: Response) => {
  res.json({ user: req.user });
};

export const logout = async (_req: Request, res: Response) => {
  res.json({ status: 'logout' });
};

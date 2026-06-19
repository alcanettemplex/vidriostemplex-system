import { Request, Response } from 'express';
import { Op } from 'sequelize';
import Usuario from '../models/usuario.model';
import bcrypt from 'bcrypt';

export const getUsuarios = async (_req: Request, res: Response) => {
  try {
    const usuarios = await Usuario.findAll({ where: { rol: { [Op.ne]: 'root' } } });
    res.json(usuarios);
  } catch (error: any) {
    console.error('Error al obtener usuarios:', error);
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
};

export const createUsuario = async (req: Request, res: Response) => {
  try {
    const { username, password, rol, nombre_completo, email, puede_gestionar_pv } = req.body;
    if (!username || !password || !rol || !nombre_completo) {
      return res.status(400).json({ error: 'Faltan campos obligatorios: username, password, rol, nombre_completo' });
    }
    const password_hash = await bcrypt.hash(password, 12);
    const emailNormalizado = email && email.trim() !== '' ? email.trim() : null;
    const usuario = await Usuario.create({ username, password_hash, rol, nombre_completo, email: emailNormalizado, puede_gestionar_pv: Boolean(puede_gestionar_pv) });
    res.status(201).json(usuario);
  } catch (error: any) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ error: 'El username o email ya está en uso' });
    }
    console.error('Error al crear usuario:', error);
    res.status(500).json({ error: 'Error al crear usuario' });
  }
};

export const updateUsuario = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { username, rol, nombre_completo, email, password, puede_gestionar_pv, activo } = req.body;
    const usuario = await Usuario.findByPk(id);
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });
    const emailNormalizado = email && email.trim() !== '' ? email.trim() : null;
    const updates: Record<string, unknown> = { username, rol, nombre_completo, email: emailNormalizado };
    if (puede_gestionar_pv !== undefined) updates.puede_gestionar_pv = Boolean(puede_gestionar_pv);
    if (activo !== undefined) updates.activo = Boolean(activo);
    if (password && password.trim() !== '') {
      updates.password_hash = await bcrypt.hash(password, 12);
    }
    await usuario.update(updates);
    res.json(usuario);
  } catch (error: any) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ error: 'El username o email ya está en uso' });
    }
    console.error('Error al actualizar usuario:', error);
    res.status(500).json({ error: 'Error al actualizar usuario' });
  }
};

// Baja lógica: no se borra físicamente (rompería historial, evidencias y auditoría
// por las FK en CASCADE). Se marca activo=false para impedir login y ocultarlo de
// los selectores de asignación. Reactivable vía updateUsuario con { activo: true }.
export const deleteUsuario = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const usuario = await Usuario.findByPk(id);
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

    const rol = usuario.getDataValue('rol');
    if (rol === 'admin' || rol === 'root') {
      return res.status(403).json({ error: `No se puede desactivar a un usuario con rol ${rol}` });
    }
    if (Number(id) === req.user!.id) {
      return res.status(400).json({ error: 'No puedes desactivar tu propia cuenta' });
    }

    await usuario.update({ activo: false });
    res.json({ status: 'Usuario desactivado' });
  } catch (error: unknown) {
    console.error('Error al desactivar usuario:', error);
    res.status(500).json({ error: 'Error al desactivar usuario' });
  }
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

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { Users, Plus, Pencil, Trash2, X, Eye, EyeOff } from 'lucide-react';
import { toast } from 'react-toastify';

const ROLES = [
  { value: 'admin', label: 'Administrador', color: 'bg-rose-100 text-rose-700' },
  { value: 'gerencia', label: 'Gerencia', color: 'bg-purple-100 text-purple-700' },
  { value: 'asesor_comercial', label: 'Asesor Comercial', color: 'bg-blue-100 text-blue-700' },
  { value: 'jefe_produccion', label: 'Jefe de Producción', color: 'bg-indigo-100 text-indigo-700' },
  { value: 'produccion', label: 'Producción', color: 'bg-cyan-100 text-cyan-700' },
  { value: 'auxiliar_produccion', label: 'Auxiliar de Producción', color: 'bg-slate-100 text-slate-700' },
  { value: 'instalador', label: 'Instalador', color: 'bg-amber-100 text-amber-700' },
  { value: 'conductor', label: 'Conductor', color: 'bg-orange-100 text-orange-700' },
  { value: 'contabilidad', label: 'Contabilidad', color: 'bg-emerald-100 text-emerald-700' },
  { value: 'compras', label: 'Compras', color: 'bg-violet-100 text-violet-700' },
];

const UsuariosPage: React.FC = () => {
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editUser, setEditUser] = useState<any | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ username: '', password: '', nombre_completo: '', email: '', rol: 'asesor_comercial', puede_gestionar_pv: false });

  const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';
  const token = localStorage.getItem('token');

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API}/api/usuarios`, { headers: { Authorization: `Bearer ${token}` } });
      setUsuarios(res.data);
    } catch { toast.error('Error al cargar usuarios'); }
    finally { setLoading(false); }
  };

  const openCreate = () => {
    setEditUser(null);
    setForm({ username: '', password: '', nombre_completo: '', email: '', rol: 'asesor_comercial', puede_gestionar_pv: false });
    setShowForm(true);
  };
  const openEdit = (u: any) => {
    setEditUser(u);
    setForm({ username: u.username, password: '', nombre_completo: u.nombre_completo, email: u.email || '', rol: u.rol, puede_gestionar_pv: u.puede_gestionar_pv || false });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editUser) {
        await axios.put(`${API}/api/usuarios/${editUser.id}`, form, { headers: { Authorization: `Bearer ${token}` } });
        toast.success('Usuario actualizado');
      } else {
        await axios.post(`${API}/api/usuarios`, form, { headers: { Authorization: `Bearer ${token}` } });
        toast.success('Usuario creado');
      }
      setShowForm(false);
      fetchData();
    } catch { toast.error('Error al guardar usuario'); }
  };

  const handleDelete = async (id: number, nombre: string) => {
    if (!window.confirm(`¿Eliminar a ${nombre}?`)) return;
    try {
      await axios.delete(`${API}/api/usuarios/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      toast.success('Usuario eliminado');
      fetchData();
    } catch { toast.error('Error al eliminar'); }
  };

  const getRolConfig = (rol: string) => ROLES.find(r => r.value === rol) || { label: rol, color: 'bg-slate-100 text-slate-700' };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 flex items-center gap-3"><Users className="w-8 h-8 text-indigo-600" />Gestión de Usuarios</h1>
          <p className="text-slate-500 font-medium mt-1">Administra los roles y accesos al sistema</p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white font-bold rounded-xl shadow-md shadow-indigo-200 hover:bg-indigo-700 transition">
          <Plus className="w-5 h-5" /> Nuevo Usuario
        </button>
      </div>

      {/* Resumen por Rol */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {ROLES.map(rol => {
          const count = usuarios.filter(u => u.rol === rol.value).length;
          return (
            <div key={rol.value} className={`p-4 rounded-xl border flex justify-between items-center ${rol.color} border-current/20`}>
              <p className="text-xs font-bold truncate">{rol.label}</p>
              <span className="text-xl font-black">{count}</span>
            </div>
          );
        })}
      </div>

      {/* TABLA */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {['Usuario', 'Nombre Completo', 'Email', 'Rol', 'Gestión PV', 'Acciones'].map(h => (
                <th key={h} className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? Array.from({length: 5}).map((_,i)=>(
              <tr key={i}><td colSpan={6} className="px-5 py-4"><div className="h-4 bg-slate-100 rounded animate-pulse"/></td></tr>
            )) : usuarios.map(u => {
              const cfg = getRolConfig(u.rol);
              return (
                <motion.tr key={u.id} initial={{opacity:0}} animate={{opacity:1}} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-4 font-mono text-sm font-bold text-slate-700">{u.username}</td>
                  <td className="px-5 py-4 font-semibold text-slate-800">{u.nombre_completo}</td>
                  <td className="px-5 py-4 text-slate-500">{u.email || '—'}</td>
                  <td className="px-5 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold border border-current/20 ${cfg.color}`}>{cfg.label}</span>
                  </td>
                  <td className="px-5 py-4">
                    {u.puede_gestionar_pv
                      ? <span className="px-2 py-1 rounded-full text-xs font-bold bg-orange-100 text-orange-700 border border-orange-200">Sí</span>
                      : <span className="text-slate-300 text-xs">—</span>
                    }
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex gap-2">
                      <button onClick={() => openEdit(u)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition">
                        <Pencil className="w-4 h-4"/>
                      </button>
                      {u.rol !== 'admin' && (
                        <button onClick={() => handleDelete(u.id, u.nombre_completo)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition">
                          <Trash2 className="w-4 h-4"/>
                        </button>
                      )}
                    </div>
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* MODAL */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <motion.div initial={{opacity:0, scale:0.95}} animate={{opacity:1, scale:1}}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200">
            <div className="flex justify-between items-center px-6 py-5 border-b border-slate-100">
              <h2 className="text-xl font-bold text-slate-800">{editUser ? 'Editar Usuario' : 'Nuevo Usuario'}</h2>
              <button onClick={()=>setShowForm(false)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 transition"><X className="w-5 h-5"/></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1 uppercase">Nombre Completo *</label>
                <input value={form.nombre_completo} onChange={e=>setForm(p=>({...p,nombre_completo:e.target.value}))} required
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1 uppercase">Username *</label>
                  <input value={form.username} onChange={e=>setForm(p=>({...p,username:e.target.value}))} required
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1 uppercase">Contraseña {editUser ? '(deja vacío p/no cambiar)' : '*'}</label>
                  <div className="relative">
                    <input type={showPassword ? 'text' : 'password'} value={form.password} onChange={e=>setForm(p=>({...p,password:e.target.value}))} required={!editUser}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
                    <button type="button" onClick={()=>setShowPassword(p=>!p)} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400">
                      {showPassword ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
                    </button>
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1 uppercase">Email</label>
                <input type="email" value={form.email} onChange={e=>setForm(p=>({...p,email:e.target.value}))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1 uppercase">Rol *</label>
                <select value={form.rol} onChange={e=>setForm(p=>({...p,rol:e.target.value}))} required
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  {ROLES.map(r=><option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.puede_gestionar_pv}
                    onChange={e => setForm(p => ({ ...p, puede_gestionar_pv: e.target.checked }))}
                    className="w-4 h-4 rounded text-orange-600 border-slate-300 focus:ring-orange-500"
                  />
                  <div>
                    <p className="text-sm font-bold text-slate-800">Puede gestionar Pedidos PV</p>
                    <p className="text-xs text-slate-500">Acceso a la pestaña "Por Gestionar" en el módulo Pedidos PV</p>
                  </div>
                </label>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={()=>setShowForm(false)} className="flex-1 py-2.5 font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition">Cancelar</button>
                <button type="submit" className="flex-1 py-2.5 font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition shadow-md shadow-indigo-200">
                  {editUser ? 'Guardar Cambios' : 'Crear Usuario'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default UsuariosPage;

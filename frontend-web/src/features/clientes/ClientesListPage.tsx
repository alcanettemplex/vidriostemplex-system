import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import axios from 'axios';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'react-toastify';
import { Plus, Search, User, Mail, Phone, MapPin, Building, AlertCircle, Edit2, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Schema para Zod
const clienteSchema = z.object({
  nombre_razon_social: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  tipo_documento: z.enum(['NIT', 'C.C', 'C.E', 'PPT', 'Otros', 'DNI', 'RUC']),
  numero_documento: z.string().min(5, 'Documento inválido (Mínimo 5 caracteres)'),
  direccion: z.string().optional(),
  telefono: z.string().optional(),
  celular: z.string().optional(),
  segmento: z.string().optional(),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  correo_comercial: z.string().email('Correo comercial inválido').optional().or(z.literal(''))
});

type ClienteFormValues = z.infer<typeof clienteSchema>;

const ClientesListPage: React.FC = () => {
  const authUser = useSelector((state: any) => state.auth?.user);
  const isReadOnly = authUser?.rol === 'asistente_administrativo';

  const [clientes, setClientes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingClienteId, setEditingClienteId] = useState<number | null>(null);
  const [deletingCliente, setDeletingCliente] = useState<any | null>(null);

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<ClienteFormValues>({
    resolver: zodResolver(clienteSchema)
  });

  const fetchClientes = async () => {
    try {
      const token = sessionStorage.getItem('token');
      const res = await axios.get(`${process.env.REACT_APP_API_URL || "http://localhost:3001"}/api/clientes`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setClientes(res.data);
    } catch (error) {
      console.error('Error fetching clientes', error);
      // Fallback para testing local
      if (clientes.length === 0) {
        setClientes([{
          id: 1,
          nombre_razon_social: 'Constructora Beta SAC',
          tipo_documento: 'RUC',
          numero_documento: '20123456789',
          telefono: '987654321',
          email: 'contacto@beta.com'
        }]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClientes();
  }, []);

  const onSubmit = async (data: ClienteFormValues) => {
    try {
      const token = sessionStorage.getItem('token');
      if (editingClienteId) {
        await axios.put(`${process.env.REACT_APP_API_URL || "http://localhost:3001"}/api/clientes/${editingClienteId}`, data, {
          headers: { Authorization: `Bearer ${token}` }
        });
        toast.success('Cliente actualizado exitosamente');
      } else {
        await axios.post(`${process.env.REACT_APP_API_URL || "http://localhost:3001"}/api/clientes`, data, {
          headers: { Authorization: `Bearer ${token}` }
        });
        toast.success('Cliente registrado exitosamente');
      }
      setIsFormOpen(false);
      setEditingClienteId(null);
      reset({});
      fetchClientes();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Error al guardar cliente');
    }
  };

  const handleEdit = (cliente: any) => {
    setEditingClienteId(cliente.id);
    reset({
      nombre_razon_social: cliente.nombre_razon_social,
      tipo_documento: cliente.tipo_documento,
      numero_documento: cliente.numero_documento,
      direccion: cliente.direccion || '',
      telefono: cliente.telefono || '',
      celular: cliente.celular || '',
      segmento: cliente.segmento || '',
      email: cliente.email || '',
      correo_comercial: cliente.correo_comercial || ''
    });
    setIsFormOpen(true);
  };

  const confirmDelete = async () => {
    if (!deletingCliente) return;
    try {
      const token = sessionStorage.getItem('token');
      await axios.delete(`${process.env.REACT_APP_API_URL || "http://localhost:3001"}/api/clientes/${deletingCliente.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Cliente eliminado exitosamente');
      setDeletingCliente(null);
      fetchClientes();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Error al eliminar cliente');
    }
  };

  const filteredClientes = clientes.filter(c =>
    c.nombre_razon_social.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.numero_documento.includes(searchTerm)
  );

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Directorio de Clientes</h1>
          <p className="text-slate-500 text-sm mt-1">Administra la base de datos de personas y empresas</p>
        </div>
        {!isReadOnly && (
        <button
          onClick={() => {
            setEditingClienteId(null);
            reset({
              nombre_razon_social: '',
              tipo_documento: 'NIT',
              numero_documento: '',
              direccion: '',
              telefono: '',
              celular: '',
              segmento: '',
              email: '',
              correo_comercial: ''
            });
            setIsFormOpen(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition shadow-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          Nuevo Cliente
        </button>
        )}
      </div>

      <div className="glass-panel overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-white/50">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nombre o documento..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 text-slate-500 text-xs uppercase tracking-wider">
                <th className="px-6 py-4 font-medium">Nombre / Razón Social</th>
                <th className="px-6 py-4 font-medium">Documento</th>
                <th className="px-6 py-4 font-medium">Contacto</th>
                <th className="px-6 py-4 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white/30">
              {loading ? (
                <tr className="animate-pulse">
                  <td className="px-6 py-4"><div className="h-4 bg-slate-200 rounded w-48"></div></td>
                  <td className="px-6 py-4"><div className="h-4 bg-slate-200 rounded w-24"></div></td>
                  <td className="px-6 py-4"><div className="h-4 bg-slate-200 rounded w-32"></div></td>
                  <td className="px-6 py-4"><div className="h-4 bg-slate-200 rounded w-8 ml-auto"></div></td>
                </tr>
              ) : filteredClientes.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                    <User className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    No se encontraron clientes.
                  </td>
                </tr>
              ) : (
                filteredClientes.map((cliente) => (
                  <motion.tr
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    key={cliente.id}
                    className="hover:bg-slate-50/80 transition group"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
                          {cliente.tipo_documento === 'RUC' ? <Building className="w-5 h-5" /> : <User className="w-5 h-5" />}
                        </div>
                        <div>
                          <p className="font-bold text-slate-800">{cliente.nombre_razon_social}</p>
                          {cliente.direccion && <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5"><MapPin className="w-3 h-3" /> {cliente.direccion}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs font-bold bg-slate-100 text-slate-600 px-2 py-1 rounded inline-block mb-1">{cliente.tipo_documento}</span>
                      <p className="text-slate-700 font-medium font-mono">{cliente.numero_documento}</p>
                    </td>
                    <td className="px-6 py-4">
                      {cliente.email && <p className="text-sm text-slate-600 flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> {cliente.email}</p>}
                      {cliente.correo_comercial && <p className="text-sm text-indigo-600 flex items-center gap-1.5 mt-0.5" title="Correo Comercial"><Mail className="w-3.5 h-3.5" /> <span className="text-xs">{cliente.correo_comercial}</span></p>}
                      {cliente.telefono && <p className="text-sm text-slate-600 flex items-center gap-1.5 mt-1"><Phone className="w-3.5 h-3.5" /> {cliente.telefono}</p>}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        {!isReadOnly && (<>
                        <button
                          onClick={() => handleEdit(cliente)}
                          className="text-slate-400 hover:text-blue-600 transition p-1.5 hover:bg-blue-50 rounded"
                          title="Editar Cliente"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeletingCliente(cliente)}
                          className="text-slate-400 hover:text-red-500 transition p-1.5 hover:bg-red-50 rounded"
                          title="Eliminar Cliente"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        </>)}
                      </div>
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {isFormOpen && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-panel w-full max-w-lg p-6"
            >
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                <User className="w-5 h-5 text-blue-600" />
                {editingClienteId ? 'Editar Cliente' : 'Registrar Nuevo Cliente'}
              </h2>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nombre / Razón Social *</label>
                  <input
                    {...register('nombre_razon_social')}
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                  {errors.nombre_razon_social && <p className="text-red-500 text-xs mt-1">{errors.nombre_razon_social.message}</p>}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Tipo Doc.</label>
                    <select
                      {...register('tipo_documento')}
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="NIT">NIT</option>
                      <option value="C.C">C.C</option>
                      <option value="C.E">C.E</option>
                      <option value="PPT">PPT</option>
                      <option value="Otros">Otros</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Número Doc. *</label>
                    <input
                      {...register('numero_documento')}
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono"
                    />
                    {errors.numero_documento && <p className="text-red-500 text-xs mt-1">{errors.numero_documento.message}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Teléfono Fijo</label>
                    <input
                      {...register('telefono')}
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Célular *</label>
                    <input
                      {...register('celular')}
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Correo Factura Electrónica</label>
                    <input
                      type="email"
                      {...register('email')}
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                    {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Correo Comercial</label>
                    <input
                      type="email"
                      {...register('correo_comercial')}
                      placeholder="contacto@empresa.com"
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                    {errors.correo_comercial && <p className="text-red-500 text-xs mt-1">{errors.correo_comercial.message}</p>}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Segmento</label>
                  <select
                    {...register('segmento')}
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Seleccione Segmento...</option>
                    <option value="CLIENTE FINAL">Cliente Final</option>
                    <option value="INSTITUCIONAL">Institucional</option>
                    <option value="INTERVID">Intervid</option>
                    <option value="ARQUITECTO">Arquitecto</option>
                    <option value="INDUSTRIAL">Industrial</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Dirección Recomendada</label>
                  <input
                    {...register('direccion')}
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsFormOpen(false)}
                    className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition disabled:opacity-50"
                  >
                    {isSubmitting ? 'Guardando...' : 'Guardar Cliente'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )
        }
      </AnimatePresence>

      <AnimatePresence>
        {deletingCliente && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl"
            >
              <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-6 h-6" />
              </div>

              <h2 className="text-xl font-bold text-center text-slate-900 mb-2">
                ¿Eliminar Cliente?
              </h2>
              <p className="text-slate-500 text-center mb-6">
                Estás a punto de eliminar a <span className="font-bold text-slate-800">{deletingCliente.nombre_razon_social}</span>. Esta acción no se puede deshacer y podría afectar las órdenes de producción asociadas.
              </p>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  onClick={() => setDeletingCliente(null)}
                  className="px-4 py-2 font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmDelete}
                  className="px-4 py-2 font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" /> Sí, Eliminar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ClientesListPage;

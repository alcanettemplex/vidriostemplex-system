import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { X, Building2, User, Ruler } from 'lucide-react';

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';

interface Cliente { id: number; nombre_razon_social: string; numero_documento?: string; telefono: string | null; celular: string | null; email: string | null; }

interface Props {
  prospecto?: any;
  onClose: () => void;
  onSaved: (prospectoCreado?: any) => void;
  modoTM?: boolean; // cuando se abre desde "Nueva Solicitud TM"
}

const ProspectoModal: React.FC<Props> = ({ prospecto, onClose, onSaved, modoTM }) => {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteBusqueda, setClienteBusqueda] = useState('');
  const [dropdownAbierto, setDropdownAbierto] = useState(false);
  // 'nuevo' | 'existente'
  const [tipo, setTipo] = useState<'nuevo' | 'existente'>(prospecto?.cliente_id ? 'existente' : 'nuevo');
  const [contactoDiferente, setContactoDiferente] = useState(
    !!(prospecto?.nombre_contacto && prospecto?.cliente_id)
  );

  const [form, setForm] = useState({
    cliente_id: prospecto?.cliente_id || '',
    nombre_contacto: prospecto?.nombre_contacto || '',
    telefono_contacto: prospecto?.telefono_contacto || '',
    email_contacto: prospecto?.email_contacto || '',
    direccion: prospecto?.direccion || '',
    descripcion: prospecto?.descripcion || '',
  });
  const [loading, setLoading] = useState(false);
  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    axios.get(`${API}/api/clientes`, { headers }).then(r => setClientes(r.data)).catch(() => {});
  }, []); // eslint-disable-line

  const set = (k: string, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  // Al seleccionar cliente existente, precargar teléfono/email del cliente
  const handleSelectCliente = (id: string) => {
    set('cliente_id', id);
    if (!contactoDiferente && id) {
      const c = clientes.find(c => String(c.id) === id);
      if (c) {
        set('telefono_contacto', c.telefono || c.celular || '');
        set('email_contacto', c.email || '');
      }
    }
  };

  const handleSubmit = async () => {
    if (tipo === 'nuevo' && !form.nombre_contacto.trim()) {
      toast.error('Ingresa el nombre del contacto'); return;
    }
    if (tipo === 'existente' && !form.cliente_id) {
      toast.error('Selecciona un cliente'); return;
    }
    if (!form.descripcion.trim()) { toast.error('Ingresa una descripción del proyecto'); return; }

    setLoading(true);
    try {
      const body = {
        descripcion: form.descripcion,
        direccion: form.direccion,
        // Contacto nuevo: sin cliente_id, todos los datos de contacto
        // Cliente existente: con cliente_id + datos de contacto en obra si es diferente
        cliente_id: tipo === 'existente' ? form.cliente_id || null : null,
        nombre_contacto: tipo === 'nuevo' || contactoDiferente ? form.nombre_contacto : null,
        telefono_contacto: form.telefono_contacto || null,
        email_contacto: form.email_contacto || null,
      };

      if (prospecto) {
        const { data: updated } = await axios.put(`${API}/api/prospectos/${prospecto.id}`, body, { headers });
        toast.success('Prospecto actualizado');
        onSaved(updated);
      } else {
        const { data: creado } = await axios.post(`${API}/api/prospectos`, body, { headers });
        toast.success('Prospecto creado');
        onSaved(creado);
      }
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Error al guardar');
    } finally { setLoading(false); }
  };

  const clienteSeleccionado = clientes.find(c => String(c.id) === String(form.cliente_id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200">
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-800">{prospecto ? 'Editar Prospecto' : modoTM ? 'Nueva Solicitud de Toma de Medidas' : 'Nuevo Prospecto'}</h2>
            {modoTM && !prospecto && (
              <p className="text-xs text-amber-600 mt-0.5">Se creará el prospecto y se generará la TM automáticamente</p>
            )}
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400" /></button>
        </div>

        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">

          {/* Banner modo TM */}
          {modoTM && !prospecto && (
            <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
              <Ruler className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-amber-800">Solicitud de Toma de Medidas</p>
                <p className="text-xs text-amber-600 mt-0.5">Al crear este prospecto se generará automáticamente una TM pendiente de programar.</p>
              </div>
            </div>
          )}

          {/* Tipo de contacto */}
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Tipo de contacto</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => { setTipo('nuevo'); setContactoDiferente(false); }}
                className={`py-2.5 text-sm font-bold rounded-xl border transition flex items-center justify-center gap-2 ${
                  tipo === 'nuevo' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <User className="w-4 h-4" /> Contacto nuevo
              </button>
              <button
                type="button"
                onClick={() => setTipo('existente')}
                className={`py-2.5 text-sm font-bold rounded-xl border transition flex items-center justify-center gap-2 ${
                  tipo === 'existente' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <Building2 className="w-4 h-4" /> Cliente existente
              </button>
            </div>
          </div>

          {/* ── CONTACTO NUEVO ── */}
          {tipo === 'nuevo' && (
            <div className="space-y-3 p-4 bg-slate-50 rounded-xl border border-slate-100">
              <p className="text-xs text-slate-500 italic">
                El cliente se definirá al momento de aprobar el prospecto.
              </p>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">
                  Nombre contacto <span className="text-red-400">*</span>
                </label>
                <input
                  value={form.nombre_contacto}
                  onChange={e => set('nombre_contacto', e.target.value)}
                  placeholder="Nombre completo..."
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">Teléfono</label>
                  <input
                    value={form.telefono_contacto}
                    onChange={e => set('telefono_contacto', e.target.value)}
                    placeholder="3001234567"
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">Email</label>
                  <input
                    value={form.email_contacto}
                    onChange={e => set('email_contacto', e.target.value)}
                    placeholder="correo@ejemplo.com"
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── CLIENTE EXISTENTE ── */}
          {tipo === 'existente' && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">
                  Cliente <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={dropdownAbierto ? clienteBusqueda : (clienteSeleccionado?.nombre_razon_social || clienteBusqueda)}
                    onChange={e => { setClienteBusqueda(e.target.value); setDropdownAbierto(true); }}
                    onFocus={() => { setClienteBusqueda(''); setDropdownAbierto(true); }}
                    placeholder="Buscar cliente..."
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  {dropdownAbierto && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setDropdownAbierto(false)} />
                      <div className="absolute top-full mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg z-20 max-h-52 overflow-y-auto">
                        {clientes
                          .filter(c => {
                            const q = clienteBusqueda.toLowerCase();
                            return c.nombre_razon_social.toLowerCase().includes(q) ||
                              (c.numero_documento && c.numero_documento.toLowerCase().includes(q));
                          })
                          .map(c => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => { handleSelectCliente(String(c.id)); setClienteBusqueda(''); setDropdownAbierto(false); }}
                              className="w-full text-left px-4 py-2.5 text-sm hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
                            >
                              <span className="block font-medium">{c.nombre_razon_social}</span>
                              {c.numero_documento && <span className="block text-xs text-slate-400">{c.numero_documento}</span>}
                            </button>
                          ))}
                        {clientes.filter(c => {
                          const q = clienteBusqueda.toLowerCase();
                          return c.nombre_razon_social.toLowerCase().includes(q) ||
                            (c.numero_documento && c.numero_documento.toLowerCase().includes(q));
                        }).length === 0 && (
                          <p className="px-4 py-3 text-sm text-slate-400 text-center">Sin resultados</p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Datos del cliente seleccionado */}
              {clienteSeleccionado && (
                <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl text-xs text-indigo-700 space-y-0.5">
                  {(clienteSeleccionado.telefono || clienteSeleccionado.celular) && (
                    <p>📞 {clienteSeleccionado.telefono || clienteSeleccionado.celular}</p>
                  )}
                  {clienteSeleccionado.email && <p>✉️ {clienteSeleccionado.email}</p>}
                </div>
              )}

              {/* Toggle: contacto en obra diferente */}
              <label className="flex items-center gap-3 cursor-pointer p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <div className="relative flex-shrink-0">
                  <input
                    type="checkbox"
                    checked={contactoDiferente}
                    onChange={e => {
                      setContactoDiferente(e.target.checked);
                      if (!e.target.checked) {
                        // Restaurar datos del cliente
                        if (clienteSeleccionado) {
                          set('nombre_contacto', '');
                          set('telefono_contacto', clienteSeleccionado.telefono || clienteSeleccionado.celular || '');
                          set('email_contacto', clienteSeleccionado.email || '');
                        }
                      }
                    }}
                    className="peer sr-only"
                  />
                  <div className="w-5 h-5 bg-white border-2 border-amber-300 rounded peer-checked:bg-amber-500 peer-checked:border-amber-500 transition flex items-center justify-center">
                    <svg className="w-3 h-3 text-white opacity-0 peer-checked:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-bold text-amber-800">Contacto en obra diferente al cliente</p>
                  <p className="text-xs text-amber-600 mt-0.5">Portero, residente de obra, maestro, etc.</p>
                </div>
              </label>

              {/* Campos contacto en obra diferente */}
              {contactoDiferente && (
                <div className="space-y-3 p-4 bg-slate-50 rounded-xl border border-slate-100">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">
                      Nombre contacto en obra <span className="text-red-400">*</span>
                    </label>
                    <input
                      value={form.nombre_contacto}
                      onChange={e => set('nombre_contacto', e.target.value)}
                      placeholder="Nombre de quien atiende en obra..."
                      className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">Teléfono</label>
                      <input
                        value={form.telefono_contacto}
                        onChange={e => set('telefono_contacto', e.target.value)}
                        placeholder="3001234567"
                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">Email</label>
                      <input
                        value={form.email_contacto}
                        onChange={e => set('email_contacto', e.target.value)}
                        placeholder="correo@ejemplo.com"
                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Dirección del proyecto — siempre */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">Dirección del proyecto</label>
            <input
              value={form.direccion}
              onChange={e => set('direccion', e.target.value)}
              placeholder="Dirección de la obra..."
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Descripción — siempre */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">
              Descripción del proyecto <span className="text-red-400">*</span>
            </label>
            <textarea
              value={form.descripcion}
              onChange={e => set('descripcion', e.target.value)}
              rows={3}
              placeholder="Describe el proyecto que solicita el cliente..."
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="flex-1 py-3 font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition text-sm">
            Cancelar
          </button>
          <button onClick={handleSubmit} disabled={loading}
            className="flex-1 py-3 font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition disabled:opacity-40 text-sm">
            {loading ? 'Guardando...' : prospecto ? 'Guardar cambios' : 'Crear prospecto'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProspectoModal;

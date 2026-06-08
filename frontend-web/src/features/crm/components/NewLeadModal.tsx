import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, UserPlus, Phone, AlignLeft, Info, User, ChevronDown, Camera, Trash2, ImageOff } from 'lucide-react';
import { useDispatch } from 'react-redux';
import { toast } from 'react-toastify';
import { addLead } from '../crmSlice';
import { apiCreateLead, apiGetAsesores, apiUploadLeadImagen } from '../crmService';

interface ImagenLocal {
  file: File;
  preview: string;
  nota: string;
}

const MAX_IMAGENES_LEAD = 5;

interface NewLeadModalProps {
  onClose: () => void;
}

const PRODUCTOS = [
  'Cabina de baño', 'División oficina', 'Espejos', 'Fachadas', 
  'Mantenimiento', 'Pasamanos', 'Pérgola', 'Puerta batiente', 
  'Puerta corrediza', 'Puertas de vidrio', 'Puertas vidrieras', 
  'Reposición vidrios', 'Tablero', 'Ventanas aluminio', 
  'Ventanería', 'Ventas en la mano', 'Vidrio crudo', 'Vidrio Templado', 
  'Producto no disponible', 'Otros'
];

const FUENTES = [
  'WhatsApp', 'Web', 'Facebook', 'Instagram', 'Llamada', 'Presencial', 'Otro'
];

const NewLeadModal: React.FC<NewLeadModalProps> = ({ onClose }) => {
  const dispatch = useDispatch();
  const [loading, setLoading] = useState(false);
  const [asesores, setAsesores] = useState<any[]>([]);
  const [imagenesLocales, setImagenesLocales] = useState<ImagenLocal[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    telefono: '',
    nombre: '',
    mensaje_entrada: '',
    segmento: 'Cliente final',
    fuente_lead: 'WhatsApp',
    producto_interes: '',
    producto_otro: '',
    descripcion_contexto: '',
    respondio: 'Espera de información',
    asesor_id: '',
  });

  // Cargar asesores disponibles para asignación directa
  useEffect(() => {
    apiGetAsesores()
      .then(res => {
        const soloAsesores = res.data.filter((u: any) =>
          ['asesor_comercial', 'gerencia', 'jefe_produccion'].includes(u.rol)
        );
        setAsesores(soloAsesores);
      })
      .catch(() => {}); // No bloquear si falla
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const agregarImagen = (file: File) => {
    if (imagenesLocales.length >= MAX_IMAGENES_LEAD) {
      toast.warning(`Máximo ${MAX_IMAGENES_LEAD} imágenes por lead.`);
      return;
    }
    setImagenesLocales(prev => [...prev, { file, preview: URL.createObjectURL(file), nota: '' }]);
  };

  const handlePaste = useCallback((e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const f = items[i].getAsFile();
        if (f) { agregarImagen(f); toast.info('Imagen pegada desde el portapapeles'); break; }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imagenesLocales.length]);

  useEffect(() => {
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [handlePaste]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(f => agregarImagen(f));
    e.target.value = '';
  };

  const quitarImagen = (idx: number) => {
    setImagenesLocales(prev => prev.filter((_, i) => i !== idx));
  };

  const actualizarNota = (idx: number, nota: string) => {
    setImagenesLocales(prev => prev.map((img, i) => i === idx ? { ...img, nota } : img));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nombre.trim() || !formData.telefono.trim()) {
      toast.warning('Nombre y teléfono son obligatorios.');
      return;
    }
    setLoading(true);
    try {
      const payload = {
        ...formData,
        producto_interes: formData.producto_interes === 'Otros' ? formData.producto_otro : formData.producto_interes,
        asesor_id: formData.asesor_id ? parseInt(formData.asesor_id) : null,
      };
      const { data } = await apiCreateLead(payload);

      // Subir imágenes secuencialmente si hay alguna en cola
      if (imagenesLocales.length > 0) {
        for (const img of imagenesLocales) {
          try {
            await apiUploadLeadImagen(data.id, img.file, img.nota || undefined);
          } catch {
            toast.warning(`No se pudo subir una imagen. El lead fue creado.`);
          }
        }
      }

      dispatch(addLead(data));
      toast.success(`Lead "${data.nombre}" registrado${imagenesLocales.length > 0 ? ` con ${imagenesLocales.length} imagen(es)` : ''}.`);
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error al crear el lead. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-purple-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-800">Capturar Nuevo Lead</h2>
              <p className="text-[11px] text-slate-500 font-medium uppercase tracking-wider">Módulo Asistente Administrativo</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Banner informativo — cambia según respondio */}
          {formData.respondio === 'No responde' ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-3 text-sm text-amber-800">
              <Info className="w-4 h-4 shrink-0 text-amber-500 mt-0.5" />
              <p>Este lead se registrará en el tab <strong>Sin Respuesta</strong>. No entrará al pipeline hasta que responda. Igual quedará guardado el mensaje y la fuente para métricas.</p>
            </div>
          ) : (
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 flex gap-3 text-sm text-indigo-800">
              <Info className="w-4 h-4 shrink-0 text-indigo-500 mt-0.5" />
              <p>El lead irá a la <strong>Bolsa Común</strong> automáticamente, salvo que asignes un asesor al final.</p>
            </div>
          )}

          {/* Fila 1: Nombre + Teléfono */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-widest flex items-center gap-1.5">
                <User className="w-3.5 h-3.5" /> Nombre del Contacto *
              </label>
              <input
                required name="nombre" value={formData.nombre} onChange={handleChange}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm font-medium text-slate-800 transition-all"
                placeholder="Ej. Juan Pérez"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-widest flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5" /> Teléfono *
              </label>
              <input
                required name="telefono" value={formData.telefono} onChange={handleChange}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm font-medium text-slate-800 transition-all"
                placeholder="+57 300 000 0000"
              />
            </div>
          </div>

          {/* Mensaje de entrada */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-600 uppercase tracking-widest flex items-center gap-1.5">
              <AlignLeft className="w-3.5 h-3.5" /> Mensaje de Entrada (pega el mensaje exacto)
            </label>
            <textarea
              name="mensaje_entrada" value={formData.mensaje_entrada} onChange={handleChange}
              rows={3} placeholder="Pega aquí exactamente lo que el cliente escribió..."
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm resize-none text-slate-700 transition-all"
            />
          </div>

          {/* Fila 2: Fuente + Segmento */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-widest">Fuente del Lead *</label>
              <select required name="fuente_lead" value={formData.fuente_lead} onChange={handleChange}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:outline-none focus:border-indigo-500 transition-all">
                {FUENTES.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-widest">Segmento *</label>
              <select required name="segmento" value={formData.segmento} onChange={handleChange}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:outline-none focus:border-indigo-500 transition-all">
                <option value="Arquitecto">Arquitecto</option>
                <option value="Cliente final">Cliente final</option>
                <option value="Industrial">Industrial</option>
                <option value="Institucional">Institucional</option>
                <option value="Intervid">Intervid</option>
              </select>
            </div>
          </div>

          {/* Fila 3: Producto + Respondió */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-widest">Producto *</label>
              <select required name="producto_interes" value={formData.producto_interes} onChange={handleChange}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:outline-none focus:border-indigo-500 transition-all">
                <option value="">Seleccionar producto...</option>
                {PRODUCTOS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-widest">Respondió</label>
              <select name="respondio" value={formData.respondio} onChange={handleChange}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:outline-none focus:border-indigo-500 transition-all">
                <option value="Espera de información">Espera de información</option>
                <option value="Si">Sí</option>
                <option value="No responde">No responde</option>
              </select>
            </div>
          </div>

          {formData.producto_interes === 'Otros' && (
            <div className="space-y-1.5 animate-in fade-in slide-in-from-top-2">
              <label className="text-xs font-bold text-indigo-600 uppercase tracking-widest">Especifique el producto</label>
              <input
                required name="producto_otro" value={formData.producto_otro} onChange={handleChange}
                className="w-full px-3 py-2.5 bg-indigo-50/50 border border-indigo-100 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm font-medium text-slate-800 transition-all"
                placeholder="Escribe el nombre del producto aquí..."
              />
            </div>
          )}

          {/* Contexto adicional */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-600 uppercase tracking-widest">Descripción / Contexto Adicional</label>
            <textarea
              name="descripcion_contexto" value={formData.descripcion_contexto} onChange={handleChange}
              rows={2} placeholder="Notas adicionales para el asesor que tome el lead..."
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm resize-none transition-all"
            />
          </div>

          {/* Sección de imágenes adjuntas */}
          <div className="space-y-2 pt-2 border-t border-dashed border-slate-200">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-widest flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5 text-indigo-400" />
                Imágenes Adjuntas
                <span className="px-1.5 py-0.5 text-[10px] font-black bg-slate-100 text-slate-500 rounded-full">
                  {imagenesLocales.length}/{MAX_IMAGENES_LEAD}
                </span>
              </label>
              {imagenesLocales.length < MAX_IMAGENES_LEAD && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 underline underline-offset-2 transition"
                >
                  + Agregar imagen
                </button>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileSelect} />

            {imagenesLocales.length === 0 ? (
              <div className="border border-dashed border-slate-200 rounded-xl p-4 text-center text-slate-400">
                <ImageOff className="w-6 h-6 mx-auto mb-1 text-slate-200" />
                <p className="text-[11px]">Sin imágenes · Selecciona archivos o pega con Ctrl+V</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {imagenesLocales.map((img, idx) => (
                  <div key={idx} className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
                    <div className="relative">
                      <img src={img.preview} alt="" className="w-full aspect-square object-cover" />
                      <button
                        type="button"
                        onClick={() => quitarImagen(idx)}
                        className="absolute top-1.5 right-1.5 bg-red-500 text-white rounded-full p-1 shadow hover:bg-red-600 transition"
                      >
                        <Trash2 className="w-2.5 h-2.5" />
                      </button>
                    </div>
                    <div className="p-2">
                      <input
                        type="text"
                        value={img.nota}
                        onChange={e => actualizarNota(idx, e.target.value)}
                        placeholder="Nota opcional..."
                        className="w-full border border-slate-200 rounded-lg px-2 py-1 text-[10px] focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-slate-50"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Asignación directa (oculta si no responde) */}
          {asesores.length > 0 && formData.respondio !== 'No responde' && (
            <div className="space-y-1.5 pt-2 border-t border-dashed border-slate-200">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-widest flex items-center gap-1.5">
                <ChevronDown className="w-3.5 h-3.5" /> Asignar Directamente a (opcional)
              </label>
              <select name="asesor_id" value={formData.asesor_id} onChange={handleChange}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:outline-none focus:border-indigo-500 transition-all">
                <option value="">Bolsa Común (sin asignar)</option>
                {asesores.map(a => (
                  <option key={a.id} value={a.id}>{a.nombre_completo} — {a.rol}</option>
                ))}
              </select>
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3">
          <button type="button" onClick={onClose}
            className="px-5 py-2.5 text-sm font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors">
            Cancelar
          </button>
          <button onClick={handleSubmit} disabled={loading}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl shadow-sm flex items-center justify-center min-w-[130px] transition-colors disabled:opacity-60">
            {loading
              ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : '💾 Guardar Lead'
            }
          </button>
        </div>
      </div>
    </div>
  );
};

export default NewLeadModal;

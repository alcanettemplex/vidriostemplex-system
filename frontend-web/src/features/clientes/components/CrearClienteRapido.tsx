import React, { useState } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { Loader2, UserPlus } from '../../../components/ui/icons';

import API from '../../../services/config';

// ─────────────────────────────────────────────────────────────────────────────
// "+ Crear cliente" dentro de otro formulario (2026-10-28).
//
// Salió del modal rápido "Crear ODP" del Cotizador (retirado ese día) para que
// el formulario de ODP también pueda dar de alta al cliente que no está
// registrado, sin ir al módulo Clientes. Es el mismo `POST /api/clientes` de
// Clientes: mismas validaciones y el 409 si el documento, el teléfono o el
// correo ya existen. El token lo pone el interceptor global.
// ─────────────────────────────────────────────────────────────────────────────

export const TIPOS_DOCUMENTO = ['CC', 'NIT', 'CE', 'DNI'] as const;
export const FUENTES_CLIENTE = ['WhatsApp', 'Web', 'Facebook', 'Instagram', 'Llamada', 'Presencial', 'Show Room', 'Referidos', 'Visita Asesor', 'Cliente'];

export interface ClienteCreado {
    id: number;
    nombre_razon_social: string;
    numero_documento?: string;
    fuente?: string | null;
    telefono?: string | null;
    direccion?: string | null;
}

interface Props {
    /** Datos ya conocidos (los de la cotización o el lead) para no reescribirlos. */
    inicial?: { nombre?: string; telefono?: string | null; direccion?: string | null };
    onCreado: (cliente: ClienteCreado) => void;
    onCancelar: () => void;
}

const CAMPO = 'h-10 w-full min-w-0 rounded-lg border border-slate-400 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500';

const CrearClienteRapido: React.FC<Props> = ({ inicial, onCreado, onCancelar }) => {
    const [nuevo, setNuevo] = useState({
        nombre: inicial?.nombre ?? '',
        tipoDocumento: 'CC',
        documento: '',
        telefono: inicial?.telefono ?? '',
        email: '',
        direccion: inicial?.direccion ?? '',
        fuente: '',
    });
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const cambiar = (campo: keyof typeof nuevo) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
        setNuevo(n => ({ ...n, [campo]: e.target.value }));

    const valido = nuevo.nombre.trim().length > 0 && nuevo.documento.trim().length > 0 && Boolean(nuevo.fuente);

    const guardar = async () => {
        if (!valido) return;
        setGuardando(true);
        setError(null);
        try {
            const documento = nuevo.documento.trim();
            const { data } = await axios.post<ClienteCreado>(`${API}/api/clientes`, {
                nombre_razon_social: nuevo.nombre.trim(),
                tipo_documento: nuevo.tipoDocumento,
                numero_documento: documento,
                telefono: nuevo.telefono.trim() || undefined,
                email: nuevo.email.trim() || undefined,
                direccion: nuevo.direccion.trim() || undefined,
                fuente: nuevo.fuente,
            });
            toast.success(`Cliente ${data.nombre_razon_social} creado.`);
            onCreado({
                ...data,
                numero_documento: data.numero_documento ?? documento,
                fuente: data.fuente ?? nuevo.fuente,
                telefono: data.telefono ?? (nuevo.telefono.trim() || null),
                direccion: data.direccion ?? (nuevo.direccion.trim() || null),
            });
        } catch (e: any) {
            const msg = e?.response?.data?.error;
            setError(
                e?.response?.status === 409
                    ? `${msg}. Búscalo en el campo Cliente y elígelo.`
                    : e?.response?.status === 403
                        ? 'Tu rol no puede crear clientes. Pídele a un asesor comercial o a un administrador que lo cree.'
                        : msg || 'No se pudo crear el cliente. Revisa los datos e inténtalo de nuevo.'
            );
        } finally {
            setGuardando(false);
        }
    };

    return (
        <div className="rounded-xl border border-slate-300 bg-slate-50 p-3 space-y-2">
            <p className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <UserPlus className="w-4 h-4 text-blue-600" /> Cliente nuevo
            </p>
            <div className="grid grid-cols-2 gap-2">
                <input className={`${CAMPO} col-span-2`} value={nuevo.nombre} maxLength={150} placeholder="Nombre o razón social *" onChange={cambiar('nombre')} />
                <div className="flex gap-2 col-span-2">
                    <select className={`${CAMPO} !w-24`} value={nuevo.tipoDocumento} onChange={cambiar('tipoDocumento')} aria-label="Tipo de documento">
                        {TIPOS_DOCUMENTO.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <input className={`${CAMPO} flex-1`} value={nuevo.documento} maxLength={30} placeholder="Cédula o NIT *" onChange={cambiar('documento')} />
                </div>
                <input className={CAMPO} value={nuevo.telefono} maxLength={20} placeholder="Teléfono" onChange={cambiar('telefono')} />
                <input className={CAMPO} type="email" value={nuevo.email} maxLength={120} placeholder="Correo" onChange={cambiar('email')} />
                <input className={`${CAMPO} col-span-2`} value={nuevo.direccion} maxLength={200} placeholder="Dirección" onChange={cambiar('direccion')} />
                <select className={`${CAMPO} col-span-2`} value={nuevo.fuente} onChange={cambiar('fuente')} aria-label="Fuente del cliente">
                    <option value="">¿Cómo llegó el cliente? *</option>
                    {FUENTES_CLIENTE.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
            </div>
            {error && <p className="text-xs font-semibold text-rose-700">{error}</p>}
            <div className="flex items-center justify-end gap-2">
                <button type="button" onClick={onCancelar} className="h-9 px-3 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-800 hover:bg-slate-100">
                    Cancelar
                </button>
                <button
                    type="button"
                    onClick={guardar}
                    disabled={!valido || guardando}
                    className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                    {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />} Guardar cliente
                </button>
            </div>
        </div>
    );
};

export default CrearClienteRapido;

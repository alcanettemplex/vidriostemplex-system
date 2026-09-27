import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { AlertTriangle, CheckCircle2, Link2, Loader2, FileCheck, UserPlus } from '../../../../components/ui/icons';

import { fmtCOP } from '../../format';
import { apiCrearCliente, apiCrearOdpDesdeCotizacion, apiPreviaCrearOdp } from '../../services/cotizadorApi';
import { FichaVinculo, FORMAS_PAGO_ODP, FormaPagoODP, PlanCrearODP } from '../../vinculo';
import BuscadorVinculo, { ChipVinculo } from '../BuscadorVinculo';
import { BotonPrimario, BotonSecundario, claseControl, CONTROL_LABEL_CLASS, ModalShell } from '../ui';

// ─────────────────────────────────────────────────────────────────────────────
// "Crear ODP" desde una cotización APROBADA (2026-09-27).
//
// El backend decide el camino según el vínculo y reutiliza el flujo que ya
// existe (ver `backend-api/src/cotizador/lib/vinculos.ts`):
//   prospecto → se aprueba el prospecto (como en Prospectos);
//   lead      → "Crear ODP" del CRM;
//   cliente   → la ODP del formulario.
// Aquí primero se pide la PREVISUALIZACIÓN (GET, no escribe) y se muestra qué
// va a pasar; solo el botón final escribe. La forma de pago se pide siempre:
// después de creada la ODP solo gerencia o un administrador pueden cambiarla.
//
// "+ Crear cliente" (2026-09-27): si el cliente no existe se da de alta aquí
// mismo, con el POST de Clientes, y queda elegido. Sirve en los tres caminos
// (antes el de prospecto mandaba a crearlo en Clientes y el de lead solo
// aceptaba nombre y teléfono).
// ─────────────────────────────────────────────────────────────────────────────

const TIPOS_DOCUMENTO = ['CC', 'NIT', 'CE', 'DNI'] as const;
const FUENTES_CLIENTE = ['Web', 'Facebook', 'Instagram', 'WhatsApp', 'Llamada', 'Presencial', 'Show Room', 'Referidos', 'Visita Asesor', 'Cliente'] as const;

interface Props {
    cotizacionId: number;
    /** Nombre y teléfono del cliente de la cotización, para "cliente nuevo". */
    clienteNombre: string;
    clienteTelefono: string;
    onCerrar: () => void;
    onCreada: (odp: { odpId: number; numeroOdp: string }) => void;
    /** La cotización ya tiene (o su lead/prospecto ya tiene) ODP: vincularla. */
    onVincularExistente: (odp: { id: number; numero: string }) => Promise<void>;
}

const ModalCrearODP: React.FC<Props> = ({ cotizacionId, clienteNombre, clienteTelefono, onCerrar, onCreada, onVincularExistente }) => {
    const [plan, setPlan] = useState<PlanCrearODP | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [formaPago, setFormaPago] = useState<FormaPagoODP | ''>('');
    const [cliente, setCliente] = useState<FichaVinculo | null>(null);
    const [modoNuevo, setModoNuevo] = useState(false);
    const [nuevo, setNuevo] = useState({
        nombre: clienteNombre, tipoDocumento: 'CC', documento: '', telefono: clienteTelefono,
        email: '', direccion: '', fuente: '',
    });
    const [creandoCliente, setCreandoCliente] = useState(false);
    const [errorCliente, setErrorCliente] = useState<string | null>(null);
    const [enviando, setEnviando] = useState(false);

    const clienteNuevoValido = nuevo.nombre.trim().length > 0 && nuevo.documento.trim().length > 0 && Boolean(nuevo.fuente);

    const guardarClienteNuevo = async () => {
        if (!clienteNuevoValido) return;
        setCreandoCliente(true);
        setErrorCliente(null);
        try {
            const { data } = await apiCrearCliente({
                nombre_razon_social: nuevo.nombre.trim(),
                tipo_documento: nuevo.tipoDocumento,
                numero_documento: nuevo.documento.trim(),
                telefono: nuevo.telefono.trim() || undefined,
                email: nuevo.email.trim() || undefined,
                direccion: nuevo.direccion.trim() || undefined,
                fuente: nuevo.fuente,
            });
            setCliente({
                tipo: 'cliente', id: data.id, titulo: data.nombre_razon_social, subtitulo: `${nuevo.tipoDocumento} ${nuevo.documento.trim()}`,
                estado: null, nombre: data.nombre_razon_social, telefono: data.telefono ?? (nuevo.telefono.trim() || null),
                direccion: data.direccion ?? (nuevo.direccion.trim() || null), clienteId: data.id, asesorId: null, odpId: null,
            });
            setModoNuevo(false);
            toast.success(`Cliente ${data.nombre_razon_social} creado.`);
        } catch (e: any) {
            const msg = e?.response?.data?.error;
            setErrorCliente(
                e?.response?.status === 409
                    ? `${msg}. Búscalo con "Buscar un cliente existente" y elígelo.`
                    : e?.response?.status === 403
                        ? 'Tu rol no puede crear clientes. Pídele a un asesor comercial o a un administrador que lo cree.'
                        : msg || 'No se pudo crear el cliente. Revisa los datos e inténtalo de nuevo.'
            );
        } finally {
            setCreandoCliente(false);
        }
    };

    useEffect(() => {
        apiPreviaCrearOdp(cotizacionId)
            .then(r => setPlan(r.data))
            .catch(e => setError(e?.response?.data?.error || 'No se pudo preparar la ODP. Revisa tu conexión.'));
    }, [cotizacionId]);

    const faltaCliente = Boolean(plan?.requiereCliente) && !cliente;
    const puedeEnviar = Boolean(plan?.puede) && Boolean(formaPago) && !faltaCliente;

    const crear = async () => {
        if (!plan || !formaPago) return;
        setEnviando(true);
        try {
            const { data } = await apiCrearOdpDesdeCotizacion(cotizacionId, {
                formaPago,
                ...(cliente ? { clienteId: cliente.id } : {}),
            });
            onCreada(data);
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'No se pudo crear la ODP. No se modificó nada.');
        } finally {
            setEnviando(false);
        }
    };

    const vincular = async () => {
        if (!plan?.odpExistente) return;
        setEnviando(true);
        try { await onVincularExistente(plan.odpExistente); } finally { setEnviando(false); }
    };

    return (
        <ModalShell
            titulo="Crear ODP"
            subtitulo={plan ? `Desde la cotización N.° ${plan.cotizacion.numero}${plan.cotizacion.etiqueta ? ` · Opción ${plan.cotizacion.etiqueta}` : ''}` : undefined}
            anchoMaximo="max-w-xl"
            onClose={onCerrar}
            pie={
                <>
                    <BotonSecundario compacto onClick={onCerrar}>Cancelar</BotonSecundario>
                    {plan && !plan.puede && plan.odpExistente && !/ya está vinculada/.test(plan.motivo ?? '') && (
                        <BotonPrimario compacto icono={Link2} cargando={enviando} onClick={vincular}>
                            Vincular a {plan.odpExistente.numero}
                        </BotonPrimario>
                    )}
                    {plan?.puede && (
                        <BotonPrimario compacto icono={FileCheck} cargando={enviando} disabled={!puedeEnviar} onClick={crear}>
                            Crear ODP
                        </BotonPrimario>
                    )}
                </>
            }
        >
            <div className="px-6 py-5 space-y-4 text-[13px] text-slate-900">
                {!plan && !error && (
                    <p className="flex items-center gap-2 text-slate-700"><Loader2 className="w-4 h-4 animate-spin" /> Revisando la cotización…</p>
                )}
                {error && <p className="text-rose-700 font-semibold">{error}</p>}
                {plan && !plan.puede && (
                    <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-amber-900">
                        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> {plan.motivo}
                    </p>
                )}
                {plan?.puede && (
                    <>
                        <p className="flex items-start gap-2 rounded-xl border border-templex-100 bg-templex-50 px-3 py-2.5 leading-snug">
                            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-templex-600" /> {plan.explicacion}
                        </p>
                        <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-3 gap-y-1.5">
                            <dt className="font-semibold">Valor</dt>
                            <dd className="tabular-nums font-bold">{fmtCOP(plan.cotizacion.total)} <span className="font-normal text-slate-700">(total con IVA)</span></dd>
                            <dt className="font-semibold">Asesor</dt>
                            <dd>{plan.asesor.nombre || '—'}</dd>
                            {plan.cliente && (<><dt className="font-semibold">Cliente</dt><dd>{plan.cliente.nombre}</dd></>)}
                        </dl>

                        {plan.requiereCliente && (
                            <div className="space-y-2">
                                <p className={CONTROL_LABEL_CLASS}>Cliente de la ODP <span className="text-rose-500">*</span></p>
                                {cliente ? (
                                    <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
                                        <ChipVinculo ficha={cliente} className="flex-1" />
                                        <button type="button" className="text-[12px] font-semibold text-templex-700 hover:underline" onClick={() => setCliente(null)}>Cambiar</button>
                                    </div>
                                ) : !modoNuevo ? (
                                    <div className="flex flex-wrap items-start gap-2">
                                        <div className="flex-1 min-w-[240px]">
                                            <BuscadorVinculo tipos={['cliente']} onElegir={setCliente} placeholder="Busca el cliente por nombre, documento o teléfono" />
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => { setModoNuevo(true); setErrorCliente(null); }}
                                            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-templex-300 bg-white px-3 text-[13px] font-semibold text-templex-700 hover:bg-templex-50"
                                        >
                                            <UserPlus className="w-4 h-4" /> Crear cliente
                                        </button>
                                    </div>
                                ) : (
                                    <div className="rounded-xl border border-slate-300 bg-slate-50 p-3 space-y-2">
                                        <p className="text-[12.5px] font-bold text-slate-900 flex items-center gap-1.5"><UserPlus className="w-4 h-4 text-templex-600" /> Cliente nuevo</p>
                                        <div className="grid grid-cols-2 gap-2">
                                            <input className={`${claseControl()} col-span-2`} value={nuevo.nombre} maxLength={150} placeholder="Nombre o razón social *" onChange={e => setNuevo(n => ({ ...n, nombre: e.target.value }))} />
                                            <div className="flex gap-2 col-span-2">
                                                <select className={`${claseControl()} w-24`} value={nuevo.tipoDocumento} onChange={e => setNuevo(n => ({ ...n, tipoDocumento: e.target.value }))} aria-label="Tipo de documento">
                                                    {TIPOS_DOCUMENTO.map(t => <option key={t} value={t}>{t}</option>)}
                                                </select>
                                                <input className={`${claseControl()} flex-1`} value={nuevo.documento} maxLength={30} placeholder="Cédula o NIT *" onChange={e => setNuevo(n => ({ ...n, documento: e.target.value }))} />
                                            </div>
                                            <input className={claseControl()} value={nuevo.telefono} maxLength={20} placeholder="Teléfono" onChange={e => setNuevo(n => ({ ...n, telefono: e.target.value }))} />
                                            <input className={claseControl()} type="email" value={nuevo.email} maxLength={120} placeholder="Correo" onChange={e => setNuevo(n => ({ ...n, email: e.target.value }))} />
                                            <input className={`${claseControl()} col-span-2`} value={nuevo.direccion} maxLength={200} placeholder="Dirección" onChange={e => setNuevo(n => ({ ...n, direccion: e.target.value }))} />
                                            <select className={`${claseControl()} col-span-2`} value={nuevo.fuente} onChange={e => setNuevo(n => ({ ...n, fuente: e.target.value }))} aria-label="Fuente del cliente">
                                                <option value="">¿Cómo llegó el cliente? *</option>
                                                {FUENTES_CLIENTE.map(f => <option key={f} value={f}>{f}</option>)}
                                            </select>
                                        </div>
                                        {errorCliente && <p className="text-[12px] font-semibold text-rose-700">{errorCliente}</p>}
                                        <div className="flex items-center justify-end gap-2">
                                            <BotonSecundario compacto onClick={() => { setModoNuevo(false); setErrorCliente(null); }}>Buscar un cliente existente</BotonSecundario>
                                            <BotonPrimario compacto icono={UserPlus} cargando={creandoCliente} disabled={!clienteNuevoValido} onClick={guardarClienteNuevo}>
                                                Guardar cliente
                                            </BotonPrimario>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        <div>
                            <label className={CONTROL_LABEL_CLASS} htmlFor="crear-odp-forma-pago">Forma de pago <span className="text-rose-500">*</span></label>
                            <select
                                id="crear-odp-forma-pago"
                                className={claseControl()}
                                value={formaPago}
                                onChange={e => setFormaPago(e.target.value as FormaPagoODP)}
                            >
                                <option value="">Seleccionar…</option>
                                {FORMAS_PAGO_ODP.map(f => <option key={f.valor} value={f.valor}>{f.rotulo}</option>)}
                            </select>
                            <p className="text-[12px] text-slate-700 mt-0.5">Después de creada la ODP solo gerencia o un administrador pueden cambiarla.</p>
                        </div>
                        <p className="text-[12px] text-slate-700">
                            La ODP nace con la descripción de los productos de la opción elegida. Fecha de entrega, dirección de
                            instalación y vidrios se completan después en el módulo ODP.
                        </p>
                    </>
                )}
            </div>
        </ModalShell>
    );
};

export default ModalCrearODP;

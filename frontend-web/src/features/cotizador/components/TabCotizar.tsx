import React, { useState } from 'react';
import {
    Plus, CheckCircle2,
    LayoutGrid, PanelTop, DoorOpen, DoorClosed, Square, Sparkles, Package,
} from 'lucide-react';
import { toast } from 'react-toastify';

import { apiGetModulos } from '../services/cotizadorApi';
import { ItemCarrito, ModuloMeta, ResultadoCalculo as TResultadoCalculo, SegmentoCliente } from '../types';
import FormularioModulo from './FormularioModulo';
import ResultadoCalculo from './ResultadoCalculo';
import DiagramaProducto from './DiagramaProducto';
import { usePlanoPrevisualizacion } from '../hooks/usePlano';

// ─────────────────────────────────────────────────────────────────────────────
// Pestaña "Cotizar": elegir módulo -> llenar el formulario propio de ese
// módulo (FormularioModulo, data-driven desde meta.campos) -> ver el resultado
// (BOM + totales + plano si aplica) -> agregarlo al carrito de la pestaña
// "Actual". No guarda nada por sí sola: cada cálculo es local hasta que el
// usuario aprieta "Agregar a la cotización".
// ─────────────────────────────────────────────────────────────────────────────

// Íconos del selector "spotlight" por id de módulo (backend-api/src/cotizador
// /modules/registry.ts). No viene de meta.campos — es puramente decorativo,
// así que si aparece un módulo nuevo cae al ícono genérico en vez de romper.
const ICONOS_MODULO: Record<string, React.ComponentType<{ className?: string }>> = {
    ventanas: LayoutGrid,
    proyectantes: PanelTop,
    'cabinas-corredizas': DoorOpen,
    'cabinas-batientes': DoorClosed,
    tablero: Square,
    espejo: Sparkles,
};

/** Recorta la descripción del módulo (puede ser un párrafo largo) a su primera
 * oración, o a ~70 caracteres si esa "oración" sigue siendo muy larga —
 * la tarjeta spotlight es angosta, no un lugar para el texto completo. */
function descripcionCorta(descripcion: string): string {
    const primeraOracion = descripcion.match(/^[^.!?]*[.!?]/)?.[0]?.trim() || descripcion;
    if (primeraOracion.length <= 90) return primeraOracion;
    return `${descripcion.slice(0, 70).trimEnd()}…`;
}

interface Props {
    segmentoDefault: SegmentoCliente;
    onAgregarItem: (item: ItemCarrito) => void;
}

const TabCotizar: React.FC<Props> = ({ segmentoDefault, onAgregarItem }) => {
    const [modulos, setModulos] = useState<ModuloMeta[]>([]);
    const [moduloId, setModuloId] = useState<string>('');
    const [ultimoInput, setUltimoInput] = useState<Record<string, unknown> | null>(null);
    const [ultimoResultado, setUltimoResultado] = useState<TResultadoCalculo | null>(null);

    React.useEffect(() => {
        apiGetModulos()
            .then(res => {
                setModulos(res.data);
                if (res.data.length > 0) setModuloId(res.data[0].id);
            })
            .catch(() => toast.error('No se pudo cargar la lista de módulos del cotizador.'));
    }, []);

    const moduloActivo = modulos.find(m => m.id === moduloId) || null;

    const cambiarModulo = (id: string) => {
        setModuloId(id);
        setUltimoInput(null);
        setUltimoResultado(null);
    };

    const handleResultado = (resultado: TResultadoCalculo, input: Record<string, unknown>) => {
        setUltimoResultado(resultado);
        setUltimoInput(input);
    };

    const agregarAlCarrito = () => {
        if (!ultimoResultado || !ultimoInput || !moduloActivo) return;
        onAgregarItem({
            idTemp: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            moduloId: moduloActivo.id,
            moduloNombre: moduloActivo.nombre,
            descripcionItem: null,
            input: ultimoInput,
            resultado: ultimoResultado,
        });
        toast.success('Ítem agregado a la cotización actual.');
        setUltimoResultado(null);
        setUltimoInput(null);
    };

    const disenoId = typeof ultimoInput?.disenoId === 'string' ? ultimoInput.disenoId : undefined;
    const anchoCm = Number(ultimoInput?.anchoCm ?? ultimoInput?.anchoNaveCm) || undefined;
    const altoCm = Number(ultimoInput?.altoCm ?? ultimoInput?.altoNaveCm) || undefined;
    const { plano, cargando: cargandoPlano } = usePlanoPrevisualizacion(disenoId, anchoCm, altoCm);

    return (
        <div className="p-4 space-y-4">
            {/* Riel de pasos: puramente orientativo, no bloquea nada — el
                formulario completo sigue siempre visible debajo. */}
            <div className="flex items-center gap-2 px-1">
                <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center flex-shrink-0">
                        <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <span className="text-[12px] font-bold text-indigo-700 font-cotizador-head whitespace-nowrap">Producto</span>
                </div>
                <div className="flex-1 h-[1.5px] bg-indigo-200" />
                <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="w-7 h-7 rounded-full bg-white border-2 border-indigo-600 text-indigo-700 flex items-center justify-center flex-shrink-0 text-[12px] font-extrabold font-cotizador-head">
                        2
                    </div>
                    <span className="text-[12px] font-bold text-indigo-700 font-cotizador-head whitespace-nowrap">Detalles</span>
                </div>
                <div className="flex-1 h-[1.5px] bg-slate-200" />
                <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center flex-shrink-0 text-[12px] font-extrabold font-cotizador-head">
                        3
                    </div>
                    <span className="text-[12px] font-bold text-slate-400 font-cotizador-head whitespace-nowrap">Resultado</span>
                </div>
            </div>

            {/* Selector de módulo "spotlight": el activo se destaca en grande,
                el resto queda como chips compactos. */}
            <div className="flex flex-wrap sm:flex-nowrap gap-2.5">
                {modulos.map(m => {
                    const activo = moduloId === m.id;
                    const Icono = ICONOS_MODULO[m.id] || Package;
                    if (activo) {
                        return (
                            <button
                                key={m.id}
                                onClick={() => cambiarModulo(m.id)}
                                className="flex-1 min-w-[220px] text-left bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-2xl shadow-lg shadow-indigo-600/25 px-4 py-3.5 flex items-start gap-3"
                            >
                                <span className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center flex-shrink-0">
                                    <Icono className="w-5 h-5 text-white" />
                                </span>
                                <span className="min-w-0">
                                    <span className="block text-white font-extrabold text-sm font-cotizador-head">{m.nombre}</span>
                                    <span className="block text-violet-100 text-[11.5px] mt-0.5">{descripcionCorta(m.descripcion)}</span>
                                </span>
                            </button>
                        );
                    }
                    return (
                        <button
                            key={m.id}
                            onClick={() => cambiarModulo(m.id)}
                            className="bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 flex items-center gap-2 hover:bg-slate-50 transition flex-shrink-0"
                        >
                            <Icono className="w-4 h-4 text-slate-400" />
                            <span className="text-slate-600 text-[12.5px] font-bold whitespace-nowrap">{m.nombre}</span>
                        </button>
                    );
                })}
            </div>

            {moduloActivo && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="bg-white border border-slate-200 rounded-xl p-4">
                        <FormularioModulo
                            key={moduloActivo.id}
                            modulo={moduloActivo}
                            segmentoDefault={segmentoDefault}
                            onResultado={handleResultado}
                        />
                    </div>

                    <div className="space-y-4">
                        {disenoId && (
                            <div className="bg-white border border-slate-200 rounded-xl p-4">
                                <DiagramaProducto plano={plano} cargando={cargandoPlano} />
                            </div>
                        )}

                        {ultimoResultado && (
                            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                                <ResultadoCalculo resultado={ultimoResultado} />
                                <button
                                    onClick={agregarAlCarrito}
                                    disabled={ultimoResultado.hayErrores}
                                    title={ultimoResultado.hayErrores ? 'Corrige las líneas en error antes de agregar el ítem.' : ''}
                                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    <Plus className="w-4 h-4" />
                                    Agregar a la cotización actual
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default TabCotizar;

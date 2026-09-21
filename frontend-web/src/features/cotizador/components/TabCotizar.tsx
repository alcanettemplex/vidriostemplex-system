import React, { useState } from 'react';
import { Plus, Layers, Calculator, PencilRuler } from 'lucide-react';
import { toast } from 'react-toastify';

import { apiGetModulos } from '../services/cotizadorApi';
import { ItemCarrito, ModuloMeta, ResultadoCalculo as TResultadoCalculo, SegmentoCliente } from '../types';
import FormularioModulo from './FormularioModulo';
import ResultadoCalculo from './ResultadoCalculo';
import DiagramaProducto from './DiagramaProducto';
import FichaProducto from './FichaProducto';
import SelectorProducto from './SelectorProducto';
import { BotonPrimario, EstadoVacio, Tarjeta } from './ui';
import { usePlanoPrevisualizacion } from '../hooks/usePlano';

// ─────────────────────────────────────────────────────────────────────────────
// Pestaña "Cotizar" — el configurador.
//
// Dos columnas que se ven a la vez en escritorio: CONFIGURACIÓN a la izquierda
// (2/5) y RESULTADO a la derecha (3/5). Antes del rediseño (2026-09-20) el
// resultado vivía debajo del formulario y el vendedor tenía que bajar para
// saber cuánto costaba lo que acababa de armar; ahora el precio nunca sale de
// la pantalla.
//
// El panel derecho NUNCA desaparece: sin cálculo todavía explica qué falta, en
// vez de dejar medio lienzo en blanco que parece una pantalla rota.
//
// Sigue sin guardar nada: cada cálculo es local hasta que se pulsa "Agregar",
// y quien es dueño del carrito y de la propuesta activa es CotizadorPage.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
    segmentoDefault: SegmentoCliente;
    onAgregarItem: (item: ItemCarrito) => void;
    /** Panel de cargos de obra, inyectado por el padre: pertenece a la
     * PROPUESTA, no al ítem que se está configurando, y por eso va arriba del
     * todo y no dentro de la columna de configuración. */
    panelCargos?: React.ReactNode;
    /** Etiqueta de la propuesta a la que se agregará lo que se calcule aquí. */
    destino?: string;
}

const TabCotizar: React.FC<Props> = ({ segmentoDefault, onAgregarItem, panelCargos, destino }) => {
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

    const hayResultado = Boolean(ultimoResultado && ultimoInput);

    return (
        // El fondo `bg-slate-50` lo pone el cuerpo de la carpeta en
        // CotizadorPage, para las dos pestañas a la vez. Aquí sería redundante.
        <div className="p-4 space-y-3">
            {/* Destino y cargos van arriba del todo porque no pertenecen al ítem
                que se está configurando sino a la propuesta entera: el flete y la
                mano de obra se cobran una vez, no una por producto. */}
            {destino && (
                <div className="flex items-center gap-2 text-[12.5px] text-slate-500 px-1">
                    <Layers className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                    Lo que calcules aquí se agrega a{' '}
                    <span className="font-bold text-indigo-700">{destino}</span>
                </div>
            )}

            {panelCargos}

            <SelectorProducto modulos={modulos} moduloId={moduloId} onCambiar={cambiarModulo} />

            {moduloActivo && (
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 items-start">
                    {/* ── Configuración (2/5) ─────────────────────────────── */}
                    {/* Sin tarjeta envolvente: cada grupo de campos trae la suya
                        (ver FormularioModulo) y anidarlas daría blanco sobre
                        blanco con doble borde. */}
                    <div className="lg:col-span-2 space-y-3">
                        <FormularioModulo
                            key={moduloActivo.id}
                            modulo={moduloActivo}
                            segmentoDefault={segmentoDefault}
                            onResultado={handleResultado}
                        />
                    </div>

                    {/* ── Resultado (3/5) ─────────────────────────────────── */}
                    <div className="lg:col-span-3 space-y-3">
                        {/* El diagrama trae su propio marco y resuelve solo los
                            casos "cargando" y "sin plano" (medidas libres), así
                            que aquí sólo le pone el título de sección. */}
                        <Tarjeta titulo="Vista técnica" icono={PencilRuler}>
                            <DiagramaProducto plano={plano} cargando={cargandoPlano} />
                        </Tarjeta>

                        {hayResultado ? (
                            <>
                                {/* Ficha y despiece traen su propia Tarjeta: envolverlos
                                    otra vez daría doble borde. */}
                                <FichaProducto
                                    input={ultimoInput as Record<string, unknown>}
                                    resultado={ultimoResultado}
                                    modulo={moduloActivo}
                                />

                                <ResultadoCalculo resultado={ultimoResultado as TResultadoCalculo} />

                                {/* Anclado al fondo de la ventana mientras se recorre
                                    el despiece: con 15-20 líneas de materiales, el
                                    botón quedaba fuera de pantalla justo cuando el
                                    vendedor termina de revisarlas y quiere agregarlo.
                                    La franja de fondo evita que el texto de la tabla
                                    se lea por debajo del botón al desplazarse. */}
                                <div className="sticky bottom-0 -mx-1 px-1 pt-2 pb-1 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent">
                                    <BotonPrimario
                                        ancho
                                        icono={Plus}
                                        onClick={agregarAlCarrito}
                                        disabled={ultimoResultado?.hayErrores}
                                        title={ultimoResultado?.hayErrores ? 'Corrige las líneas en error antes de agregar el ítem.' : ''}
                                        className="py-3 shadow-lg shadow-indigo-600/25"
                                    >
                                        {destino ? `Agregar a ${destino}` : 'Agregar a la cotización actual'}
                                    </BotonPrimario>
                                </div>
                            </>
                        ) : (
                            <Tarjeta>
                                <EstadoVacio
                                    icono={Calculator}
                                    titulo="Todavía no hay nada calculado"
                                    detalle="Completa la configuración de la izquierda y pulsa Calcular. Aquí aparecerán la ficha del producto, el despiece de materiales y el total."
                                />
                            </Tarjeta>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default TabCotizar;

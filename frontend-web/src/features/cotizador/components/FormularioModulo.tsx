import React, { useState } from 'react';
import { Calculator, Loader2, Users, Ruler, Droplet, Percent } from 'lucide-react';
import { toast } from 'react-toastify';

import { apiCotizarItem } from '../services/cotizadorApi';
import { CampoMeta, GrupoCampo, ModuloMeta, OpcionCampo, ResultadoCalculo, SegmentoCliente } from '../types';
import CampoDinamico from './CampoDinamico';
import SelectorDiseno from './SelectorDiseno';

// ─────────────────────────────────────────────────────────────────────────────
// Formulario data-driven de UN módulo de producto (meta.campos). El padre
// (TabCotizar) remonta este componente con `key={modulo.id}` al cambiar de
// módulo, así que el estado se inicializa una sola vez por módulo activo.
//
// Los campos se agrupan visualmente por `campo.grupo` en tarjetas (cliente,
// medidas, vidrio, comercial), en ese orden fijo, mostrando sólo las tarjetas
// que de verdad tienen campos — cabinas, por ejemplo, no declara 'cliente' ni
// 'comercial'. Si algún módulo llegara a tener un campo SIN grupo (hoy los 6
// módulos declaran grupo en todos sus campos), se cae al layout plano de
// siempre en vez de arriesgar dejar ese campo fuera del formulario.
// ─────────────────────────────────────────────────────────────────────────────

const GRUPOS_ORDEN: GrupoCampo[] = ['cliente', 'medidas', 'vidrio', 'comercial'];

const GRUPO_CONFIG: Record<GrupoCampo, {
    titulo: string;
    Icono: React.ComponentType<{ className?: string }>;
    contenedorClass: string;
    iconoClass: string;
}> = {
    cliente: {
        titulo: 'Cliente y sistema',
        Icono: Users,
        contenedorClass: 'bg-violet-50/60 border border-violet-100 rounded-2xl p-4',
        iconoClass: 'text-indigo-600',
    },
    medidas: {
        titulo: 'Medidas',
        Icono: Ruler,
        contenedorClass: 'bg-white border border-slate-200 rounded-2xl p-4',
        iconoClass: 'text-indigo-600',
    },
    vidrio: {
        titulo: 'Vidrio y acabados',
        Icono: Droplet,
        contenedorClass: 'bg-sky-50/60 border border-sky-100 rounded-2xl p-4',
        iconoClass: 'text-sky-600',
    },
    comercial: {
        titulo: 'Comercial',
        Icono: Percent,
        contenedorClass: 'bg-white border border-slate-200 rounded-2xl p-4',
        iconoClass: 'text-indigo-600',
    },
};

function valorInicial(campo: ModuloMeta['campos'][number], segmentoDefault: SegmentoCliente): unknown {
    if (campo.nombre === 'segmentoCliente') return segmentoDefault;
    if (campo.nombre === 'cantidadPiezas') return 1;
    if (campo.nombre === 'descuentoPct') return 0;
    if (campo.tipo === 'boolean') return false;
    return '';
}

function esVacio(valor: unknown): boolean {
    return valor === '' || valor === undefined || valor === null;
}

/** Etiqueta legible de un valor de campo `select` (para los chips de spec en
 * vivo): busca la opción que matchea el value y devuelve su label; si no la
 * encuentra (dato viejo, opción retirada del catálogo) muestra el valor crudo. */
function labelDeOpcion(campo: CampoMeta, valor: unknown): string | null {
    if (esVacio(valor)) return null;
    const opciones = campo.opciones || [];
    const encontrada = opciones.find(o => (typeof o === 'object' && o !== null ? (o as OpcionCampo).value : o) === valor);
    if (!encontrada) return String(valor);
    return typeof encontrada === 'object' ? (encontrada as OpcionCampo).label : String(encontrada);
}

// Cubre anchoCm/altoCm (ventanas, cabinas, tablero, espejo) y anchoNaveCm/
// altoNaveCm (proyectantes) con la misma regla, sin hardcodear los dos pares.
function esCampoAncho(campo: CampoMeta): boolean {
    return campo.tipo === 'number' && /^ancho.*Cm$/i.test(campo.nombre);
}
function esCampoAlto(campo: CampoMeta): boolean {
    return campo.tipo === 'number' && /^alto.*Cm$/i.test(campo.nombre);
}

interface Props {
    modulo: ModuloMeta;
    segmentoDefault: SegmentoCliente;
    onResultado: (resultado: ResultadoCalculo, input: Record<string, unknown>) => void;
}

const FormularioModulo: React.FC<Props> = ({ modulo, segmentoDefault, onResultado }) => {
    const [input, setInput] = useState<Record<string, unknown>>(() => {
        const inicial: Record<string, unknown> = {};
        modulo.campos.forEach(campo => { inicial[campo.nombre] = valorInicial(campo, segmentoDefault); });
        return inicial;
    });
    const [cargando, setCargando] = useState(false);

    const setCampo = (nombre: string) => (value: unknown) => setInput(prev => ({ ...prev, [nombre]: value }));

    const calcular = async () => {
        const faltante = modulo.campos.find(c => c.requerido && esVacio(input[c.nombre]));
        if (faltante) {
            toast.error(`Completa: ${faltante.etiqueta}`);
            return;
        }

        setCargando(true);
        try {
            const { data } = await apiCotizarItem(modulo.id, input);
            onResultado(data, input);
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'No se pudo calcular el ítem.');
        } finally {
            setCargando(false);
        }
    };

    const hayCampoSinGrupo = modulo.campos.some(c => !c.grupo);

    const botonCalcular = (
        <button
            onClick={calcular}
            disabled={cargando}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
            {cargando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}
            Calcular
        </button>
    );

    // Red de seguridad: `grupo` es un campo opcional del contrato (ver types.ts)
    // y hoy los 6 módulos lo declaran en todos sus campos, pero si alguno
    // llegara a omitirlo se prefiere el layout plano de siempre (todo visible,
    // sin dividir) antes que perder ese campo del formulario.
    if (hayCampoSinGrupo) {
        return (
            <div className="space-y-3">
                {modulo.id === 'ventanas' && (
                    <SelectorDiseno
                        modulo="ventanas"
                        value={input.disenoId as string | undefined}
                        onChange={id => setInput(prev => ({ ...prev, disenoId: id }))}
                    />
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {modulo.campos.map(campo => (
                        <CampoDinamico
                            key={campo.nombre}
                            campo={campo}
                            value={input[campo.nombre]}
                            onChange={setCampo(campo.nombre)}
                        />
                    ))}
                </div>
                {botonCalcular}
            </div>
        );
    }

    const camposPorGrupo = new Map<GrupoCampo, CampoMeta[]>();
    modulo.campos.forEach(campo => {
        const grupo = campo.grupo as GrupoCampo;
        if (!camposPorGrupo.has(grupo)) camposPorGrupo.set(grupo, []);
        camposPorGrupo.get(grupo)!.push(campo);
    });

    const camposCliente = camposPorGrupo.get('cliente') || [];
    const chipsCliente = camposCliente
        .filter(c => c.tipo === 'select')
        .map(c => labelDeOpcion(c, input[c.nombre]))
        .filter((v): v is string => v !== null)
        .slice(0, 3);

    const camposMedidas = camposPorGrupo.get('medidas') || [];
    const campoAncho = camposMedidas.find(esCampoAncho);
    const campoAlto = camposMedidas.find(esCampoAlto);
    const anchoVal = campoAncho ? Number(input[campoAncho.nombre]) : NaN;
    const altoVal = campoAlto ? Number(input[campoAlto.nombre]) : NaN;
    const areaCalculada = (Number.isFinite(anchoVal) && anchoVal > 0 && Number.isFinite(altoVal) && altoVal > 0)
        ? Math.round((anchoVal / 100) * (altoVal / 100) * 100) / 100
        : null;

    return (
        <div className="space-y-3">
            {GRUPOS_ORDEN.filter(g => (camposPorGrupo.get(g) || []).length > 0).map(grupo => {
                const campos = camposPorGrupo.get(grupo)!;
                const cfg = GRUPO_CONFIG[grupo];
                const Icono = cfg.Icono;
                return (
                    <div key={grupo} className={cfg.contenedorClass}>
                        <div className="flex items-center justify-between gap-2 mb-3">
                            <h3 className="flex items-center gap-1.5 text-[12px] font-extrabold uppercase tracking-wide text-slate-600 font-cotizador-head">
                                <Icono className={`w-3.5 h-3.5 ${cfg.iconoClass}`} />
                                {cfg.titulo}
                            </h3>
                            {grupo === 'cliente' && chipsCliente.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 justify-end">
                                    {chipsCliente.map(chip => (
                                        <span key={chip} className="bg-indigo-50 text-indigo-700 text-[10.5px] font-extrabold px-2.5 py-0.5 rounded-full font-cotizador-head">
                                            {chip}
                                        </span>
                                    ))}
                                </div>
                            )}
                            {grupo === 'medidas' && areaCalculada !== null && (
                                <span className="bg-emerald-50 text-emerald-700 text-[10.5px] font-extrabold px-2.5 py-0.5 rounded-full font-cotizador-head">
                                    ≈ {areaCalculada.toFixed(2)} m²
                                </span>
                            )}
                        </div>

                        {grupo === 'medidas' && modulo.id === 'ventanas' && (
                            <div className="mb-3">
                                <SelectorDiseno
                                    modulo="ventanas"
                                    value={input.disenoId as string | undefined}
                                    onChange={id => setInput(prev => ({ ...prev, disenoId: id }))}
                                />
                            </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {campos.map(campo => (
                                <div key={campo.nombre}>
                                    <CampoDinamico
                                        campo={campo}
                                        value={input[campo.nombre]}
                                        onChange={setCampo(campo.nombre)}
                                    />
                                    {campo.nombre === 'sistema' && campo.tipo === 'select' && (campo.opciones?.length ?? 0) > 1 && (
                                        <p className="text-[10.5px] text-slate-400 mt-1">Ver catálogo para disponibilidad por color.</p>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })}

            {botonCalcular}
        </div>
    );
};

export default FormularioModulo;

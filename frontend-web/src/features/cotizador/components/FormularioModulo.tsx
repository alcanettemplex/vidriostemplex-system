import React, { useState } from 'react';
import { Calculator, Users, Ruler, Droplet, Percent } from 'lucide-react';
import { toast } from 'react-toastify';

import { apiCotizarItem } from '../services/cotizadorApi';
import { CampoMeta, GrupoCampo, ModuloMeta, OpcionCampo, PersonalizacionItem, ResultadoCalculo, SegmentoCliente } from '../types';
import CampoDinamico from './CampoDinamico';
import SelectorDiseno from './SelectorDiseno';
import { BotonPrimario, Chip, Tarjeta } from './ui';

// ─────────────────────────────────────────────────────────────────────────────
// Panel de configuración: formulario data-driven de UN módulo de producto
// (meta.campos). El padre (TabCotizar) remonta este componente con
// `key={modulo.id}` al cambiar de módulo, así que el estado se inicializa una
// sola vez por módulo activo.
//
// Los campos se agrupan visualmente por `campo.grupo` en tarjetas (cliente,
// medidas, vidrio, comercial), en ese orden fijo, mostrando sólo las tarjetas
// que de verdad tienen campos — cabinas, por ejemplo, no declara 'cliente' ni
// 'comercial'. Si algún módulo llegara a tener un campo SIN grupo (hoy los 6
// módulos declaran grupo en todos sus campos), se cae al layout plano de
// siempre en vez de arriesgar dejar ese campo fuera del formulario.
//
// NADA de esto está hardcodeado por producto: la única lista fija es el ORDEN
// de los cuatro grupos. Cualquier campo nuevo que declare el backend aparece
// solo, en su tarjeta, sin tocar este archivo.
// ─────────────────────────────────────────────────────────────────────────────

const GRUPOS_ORDEN: GrupoCampo[] = ['cliente', 'medidas', 'vidrio', 'comercial'];

const GRUPO_CONFIG: Record<GrupoCampo, {
    titulo: string;
    Icono: React.ComponentType<{ className?: string }>;
}> = {
    cliente: { titulo: 'Cliente y sistema', Icono: Users },
    medidas: { titulo: 'Medidas', Icono: Ruler },
    vidrio: { titulo: 'Vidrio y acabados', Icono: Droplet },
    comercial: { titulo: 'Comercial', Icono: Percent },
};

/** Lo que se pinta bajo el campo que bloqueó el cálculo. El toast dice cuál es
 * (y sigue igual que antes); esto dice por qué, ahí donde hay que arreglarlo. */
const MENSAJE_REQUERIDO = 'Este dato es obligatorio para calcular.';

function valorInicial(campo: ModuloMeta['campos'][number]): unknown {
    if (campo.nombre === 'cantidadPiezas') return 1;
    if (campo.nombre === 'descuentoPct') return 0;
    if (campo.tipo === 'boolean') return false;
    // El campo `lineas` (módulo "Ítem libre") vale un arreglo, no una cadena:
    // arrancar en '' haría que el editor recibiera algo que no puede recorrer.
    if (campo.tipo === 'lineas') return [];
    return '';
}

function esVacio(valor: unknown): boolean {
    // Un arreglo vacío es un campo sin llenar: sin esto, un ítem libre sin una
    // sola línea pasaba la validación de `requerido` y el 400 lo daba el motor,
    // con el toast genérico en vez del "Completa: …" que señala el campo.
    if (Array.isArray(valor)) return valor.length === 0;
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

// Campos que el backend deduce del código del diseño y deja de leer del input
// cuando llega `disenoId` (ver calcularPorDiseno en ventanas.ts). Mientras haya
// un diseño elegido se ocultan, porque pedirlos sugiere que influyen en el
// precio — y `cuerpos` es además obligatorio, así que bloqueaba el cálculo por
// un dato que se iba a ignorar.
const CAMPOS_DERIVADOS_DEL_DISENO = ['cuerpos', 'alasCorredizas'];

// El segmento (PA/PM/PB) es de la COTIZACIÓN desde el 2026-09-23: lo decide la
// cabecera y se inyecta al calcular. Pedirlo por ítem permitía mezclar precios
// de dos listas en la misma cotización sin que nadie lo notara.
const CAMPOS_DE_LA_COTIZACION = ['segmentoCliente'];

interface Props {
    modulo: ModuloMeta;
    /** Segmento vigente de la cotización: con el que se calcula este ítem. */
    segmento: SegmentoCliente;
    /** Input de un ítem ya agregado, cuando se está editando. */
    inputInicial?: Record<string, unknown> | null;
    /** Componentes cambiados / quitados / agregados (2026-09-23). Los gobierna
     * TabCotizar desde la tabla de materiales; aquí sólo viajan al calcular,
     * para que volver a pulsar Calcular (p. ej. tras cambiar una medida) no los
     * pierda. */
    personalizacion?: PersonalizacionItem | null;
    onResultado: (resultado: ResultadoCalculo, input: Record<string, unknown>) => void;
}

const FormularioModulo: React.FC<Props> = ({ modulo, segmento, inputInicial, personalizacion, onResultado }) => {
    const [input, setInput] = useState<Record<string, unknown>>(() => {
        const inicial: Record<string, unknown> = {};
        modulo.campos.forEach(campo => { inicial[campo.nombre] = valorInicial(campo); });
        return inputInicial ? { ...inicial, ...inputInicial } : inicial;
    });
    const [cargando, setCargando] = useState(false);
    // Nombre del campo que hizo fallar el último intento de calcular. Es sólo
    // el marcado visual del aviso que ya daba el toast: no añade validaciones
    // ni cambia cuándo se validan.
    const [campoConError, setCampoConError] = useState<string | null>(null);

    const setCampo = (nombre: string) => (value: unknown) => {
        // El error se limpia al tocar ese campo, no al volver a calcular: dejarlo
        // en rojo mientras el vendedor ya está escribiendo la corrección es ruido.
        setCampoConError(prev => (prev === nombre ? null : prev));
        setInput(prev => ({ ...prev, [nombre]: value }));
    };

    const hayDiseno = Boolean(input.disenoId);
    const campoOculto = (nombre: string) =>
        CAMPOS_DE_LA_COTIZACION.includes(nombre) || (hayDiseno && CAMPOS_DERIVADOS_DEL_DISENO.includes(nombre));
    const camposVisibles = (campos: CampoMeta[]) => campos.filter(c => !campoOculto(c.nombre));

    const calcular = async () => {
        const faltante = modulo.campos.find(
            c => c.requerido && !campoOculto(c.nombre) && esVacio(input[c.nombre])
        );
        if (faltante) {
            setCampoConError(faltante.nombre);
            toast.error(`Completa: ${faltante.etiqueta}`);
            return;
        }
        setCampoConError(null);

        setCargando(true);
        try {
            // El input del formulario puede traer una personalización vieja (la del
            // ítem al abrirlo en edición): manda la vigente, que es la de TabCotizar.
            const enviado: Record<string, unknown> = { ...input, segmentoCliente: segmento };
            delete enviado.personalizacion;
            if (personalizacion) enviado.personalizacion = personalizacion;
            const { data } = await apiCotizarItem(modulo.id, enviado);
            onResultado(data, enviado);
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'No se pudo calcular el ítem.');
        } finally {
            setCargando(false);
        }
    };

    const errorDe = (nombre: string) => (campoConError === nombre ? MENSAJE_REQUERIDO : null);

    const hayCampoSinGrupo = modulo.campos.some(c => !c.grupo);

    const botonCalcular = (
        <BotonPrimario ancho icono={Calculator} cargando={cargando} onClick={calcular}>
            Calcular
        </BotonPrimario>
    );

    const selectorDiseno = (
        <SelectorDiseno
            modulo="ventanas"
            value={input.disenoId as string | undefined}
            onChange={id => setInput(prev => ({ ...prev, disenoId: id }))}
            sistema={input.sistema as string | undefined}
        />
    );

    // Red de seguridad: `grupo` es un campo opcional del contrato (ver types.ts)
    // y hoy los 7 módulos lo declaran en todos sus campos, pero si alguno
    // llegara a omitirlo se prefiere el layout plano de siempre (todo visible,
    // sin dividir) antes que perder ese campo del formulario.
    if (hayCampoSinGrupo) {
        return (
            <div className="space-y-3">
                <Tarjeta cuerpoClassName="space-y-3">
                    {modulo.id === 'ventanas' && selectorDiseno}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {camposVisibles(modulo.campos).map(campo => (
                            <CampoDinamico
                                key={campo.nombre}
                                campo={campo}
                                value={input[campo.nombre]}
                                onChange={setCampo(campo.nombre)}
                                error={errorDe(campo.nombre)}
                                segmento={segmento}
                            />
                        ))}
                    </div>
                </Tarjeta>
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
    const chipsCliente = camposVisibles(camposCliente)
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
            {/* Por campos VISIBLES: un grupo cuyo único campo era el segmento
                quedaría como tarjeta vacía ahora que el segmento no se pide aquí. */}
            {GRUPOS_ORDEN.filter(g => camposVisibles(camposPorGrupo.get(g) || []).length > 0).map(grupo => {
                const campos = camposPorGrupo.get(grupo)!;
                const cfg = GRUPO_CONFIG[grupo];

                // El hueco a la derecha del rótulo: los chips de spec en vivo
                // (cliente) y el área aproximada (medidas). Son lectura, no
                // controles: ninguno cambia el input.
                const accion = grupo === 'cliente' && chipsCliente.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 justify-end">
                        {chipsCliente.map(chip => (
                            <Chip key={chip} tono="indigo">{chip}</Chip>
                        ))}
                    </div>
                ) : grupo === 'medidas' && areaCalculada !== null ? (
                    <Chip tono="esmeralda">≈ {areaCalculada.toFixed(2)} m²</Chip>
                ) : undefined;

                return (
                    <Tarjeta key={grupo} titulo={cfg.titulo} icono={cfg.Icono} accion={accion}>
                        {grupo === 'medidas' && modulo.id === 'ventanas' && (
                            <div className="mb-3">{selectorDiseno}</div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {camposVisibles(campos).map(campo => (
                                <div key={campo.nombre} className={campo.tipo === 'lineas' ? 'sm:col-span-2' : undefined}>
                                    <CampoDinamico
                                        campo={campo}
                                        value={input[campo.nombre]}
                                        onChange={setCampo(campo.nombre)}
                                        error={errorDe(campo.nombre)}
                                        segmento={segmento}
                                    />
                                    {campo.nombre === 'sistema' && campo.tipo === 'select' && (campo.opciones?.length ?? 0) > 1 && (
                                        <p className="text-[10.5px] text-slate-400 mt-1">Ver catálogo para disponibilidad por color.</p>
                                    )}
                                </div>
                            ))}
                        </div>
                    </Tarjeta>
                );
            })}

            {botonCalcular}
        </div>
    );
};

export default FormularioModulo;

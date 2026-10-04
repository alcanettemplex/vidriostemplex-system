import React, { useEffect, useRef, useState } from 'react';
import { Calculator, Users, Ruler, Droplet, Percent } from '../../../components/ui/icons';
import { toast } from 'react-toastify';

import { apiCotizarItem } from '../services/cotizadorApi';
import { CampoMeta, GrupoCampo, ModuloMeta, OpcionCampo, PersonalizacionItem, ResultadoCalculo, SegmentoCliente } from '../types';
import { CAMPOS_DERIVADOS_DEL_DISENO, ETIQUETAS_CON_DISENO, MODULOS_CON_DISENO, campoAplica } from '../fichaProducto';
import CampoDinamico from './CampoDinamico';
import { ajustarAlfajia, opcionesAlfajia } from '../alfajiaFormulario';
import SelectorDiseno from './SelectorDiseno';
import { BotonSecundario, Chip, Tarjeta } from './ui';

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
//
// MESA DE TRABAJO (2026-09-26, rediseño integral, pedido del usuario):
//   · CÁLCULO AUTOMÁTICO. Cada cambio de un campo vuelve a pedir el precio
//     al motor tras una espera corta (ESPERA_CALCULO_MS). Solo se pide si ya
//     están todos los obligatorios; si falta alguno no se molesta con toasts,
//     se informa por `onEstado` y el padre lo muestra. Una respuesta vieja que
//     llega tarde se descarta (`secuencia`). El botón queda como "Calcular
//     ahora", para forzar un reintento. La validación y la llamada al motor
//     son las de siempre (`calcular`).
//   · Los grupos dejan de ser tarjetas sueltas: van dentro del panel central
//     de TabCotizar, separados por un rótulo con línea.
// ─────────────────────────────────────────────────────────────────────────────

/** Estado del cálculo automático, para el indicador del panel central. */
export type EstadoCalculo =
    | { tipo: 'incompleto'; faltante: string }
    | { tipo: 'calculando' }
    | { tipo: 'listo' }
    | { tipo: 'error'; mensaje: string };

/** Espera tras la última tecla antes de pedir el precio: evita una petición
 * por tecla al escribir una medida de cuatro cifras. */
const ESPERA_CALCULO_MS = 500;

const GRUPOS_ORDEN: GrupoCampo[] = ['cliente', 'medidas', 'vidrio', 'comercial'];

const GRUPO_CONFIG: Record<GrupoCampo, {
    titulo: string;
    Icono: React.ComponentType<{ className?: string }>;
}> = {
    cliente: { titulo: 'Sistema', Icono: Users },
    medidas: { titulo: 'Medidas', Icono: Ruler },
    vidrio: { titulo: 'Vidrio y acabados', Icono: Droplet },
    comercial: { titulo: 'Obra y cantidad', Icono: Percent },
};

/** Lo que se pinta bajo el campo que bloqueó el cálculo. El toast dice cuál es
 * (y sigue igual que antes); esto dice por qué, ahí donde hay que arreglarlo. */
const MENSAJE_REQUERIDO = 'Este dato es obligatorio para calcular.';

function valorInicial(campo: ModuloMeta['campos'][number]): unknown {
    if (campo.defecto !== undefined) return campo.defecto;
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

// Qué módulos admiten diseño, qué campos deduce el diseño (se ocultan mientras
// haya uno elegido: pedirlos sugería que influyen en el precio, y varios son
// obligatorios, así que bloqueaban el cálculo) y qué etiquetas cambian: viven
// en fichaProducto.ts, compartidas con la Hoja de Trabajo.

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
    /** Avisa si el precio está al día, calculándose, incompleto o con error. */
    onEstado?: (estado: EstadoCalculo) => void;
}

const FormularioModulo: React.FC<Props> = ({ modulo, segmento, inputInicial, personalizacion, onResultado, onEstado }) => {
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

    const admiteDiseno = MODULOS_CON_DISENO.has(modulo.id);
    const hayDiseno = admiteDiseno && Boolean(input.disenoId);
    const derivados = CAMPOS_DERIVADOS_DEL_DISENO[modulo.id] ?? [];
    const campoOculto = (nombre: string) => {
        if (CAMPOS_DE_LA_COTIZACION.includes(nombre) || (hayDiseno && derivados.includes(nombre))) return true;
        // `soloSi` (2026-09-27, una casilla: lado Y ↔ "en L") y `soloSiValor`
        // (2026-10-04, el valor de otro campo: ancho de puerta ↔ batiente).
        const campo = modulo.campos.find(c => c.nombre === nombre);
        if (campo && !campoAplica(campo, input)) return true;
        // `soloSiACotizar` (2026-09-27): el costo de una película solo se pide
        // si la elegida no tiene precio de catálogo.
        const deSelect = campo?.soloSiACotizar;
        if (deSelect) {
            const opciones = modulo.campos.find(c => c.nombre === deSelect)?.opciones ?? [];
            const elegida = opciones.find(o => typeof o === 'object' && String(o.value) === String(input[deSelect] ?? ''));
            return !(typeof elegida === 'object' && elegida.precioACotizar);
        }
        return false;
    };
    const etiquetasDiseno = hayDiseno ? ETIQUETAS_CON_DISENO[modulo.id] : undefined;
    // Alfajía (2026-10-01): el selector solo ofrece las del color de la
    // perfilería, con la recomendada del sistema primero.
    const campoAlfajia = modulo.campos.find(c => c.filtroAlfajia) ?? null;
    const listaAlfajia = campoAlfajia ? opcionesAlfajia(campoAlfajia, input.sistema, input.colorPerfileria) : null;
    const camposVisibles = (campos: CampoMeta[]) => campos
        .filter(c => !campoOculto(c.nombre))
        .map(c => (c.filtroAlfajia && listaAlfajia ? { ...c, opciones: listaAlfajia.opciones } : c))
        .map(c => (etiquetasDiseno?.[c.nombre] ? { ...c, etiqueta: etiquetasDiseno[c.nombre] } : c));

    // Al marcar la alfajía, o al cambiar el sistema o el color con ella marcada,
    // queda elegida la recomendada (o la misma referencia en el color nuevo). Al
    // desmarcarla se limpia, para que el input no arrastre un código sin uso.
    const marcadaAlfajia = input.alfajia === true || input.alfajia === 'true';
    const codigoAjustado = !campoAlfajia || !listaAlfajia ? null
        : marcadaAlfajia ? ajustarAlfajia(input[campoAlfajia.nombre], campoAlfajia, listaAlfajia) : '';
    useEffect(() => {
        if (!campoAlfajia || codigoAjustado === null) return;
        if ((input[campoAlfajia.nombre] ?? '') === codigoAjustado) return;
        setInput(prev => ({ ...prev, [campoAlfajia.nombre]: codigoAjustado }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [codigoAjustado]);

    const buscarFaltante = () => modulo.campos.find(
        c => c.requerido && !campoOculto(c.nombre) && esVacio(input[c.nombre])
    );

    /** Número del último pedido: una respuesta de un pedido anterior que llega
     * tarde no pisa la del más reciente. */
    const secuencia = useRef(0);

    /** `silencioso` = lo lanzó el cálculo automático: sin toasts ni campo en
     * rojo, el resultado viaja por `onEstado`. El botón usa el modo normal. */
    const calcular = async ({ silencioso = false }: { silencioso?: boolean } = {}) => {
        const faltante = buscarFaltante();
        if (faltante) {
            if (!silencioso) {
                setCampoConError(faltante.nombre);
                toast.error(`Completa: ${faltante.etiqueta}`);
            }
            onEstado?.({ tipo: 'incompleto', faltante: faltante.etiqueta });
            return;
        }
        setCampoConError(null);

        const pedido = ++secuencia.current;
        setCargando(true);
        onEstado?.({ tipo: 'calculando' });
        try {
            // El input del formulario puede traer una personalización vieja (la del
            // ítem al abrirlo en edición): manda la vigente, que es la de TabCotizar.
            const enviado: Record<string, unknown> = { ...input, segmentoCliente: segmento };
            delete enviado.personalizacion;
            if (personalizacion) enviado.personalizacion = personalizacion;
            if (modulo.id === 'proyectantes') {
                // Ver ETIQUETAS_CON_DISENO. Sin diseño se quitan: un anchoCm
                // viejo haría que la mano de obra ignorara las naves.
                if (hayDiseno) {
                    enviado.anchoCm = enviado.anchoNaveCm;
                    enviado.altoCm = enviado.altoNaveCm;
                } else {
                    delete enviado.anchoCm;
                    delete enviado.altoCm;
                }
            }
            const { data } = await apiCotizarItem(modulo.id, enviado);
            if (pedido !== secuencia.current) return;
            onResultado(data, enviado);
            onEstado?.({ tipo: 'listo' });
        } catch (e: any) {
            if (pedido !== secuencia.current) return;
            const mensaje = e?.response?.data?.error || 'No se pudo calcular el ítem.';
            if (!silencioso) toast.error(mensaje);
            onEstado?.({ tipo: 'error', mensaje });
        } finally {
            if (pedido === secuencia.current) setCargando(false);
        }
    };

    // Cálculo automático: cada cambio del formulario (y el montaje, que en modo
    // edición trae el ítem completo) pide el precio tras una espera corta. El
    // segmento y la personalización no están en las dependencias a propósito:
    // esos recálculos los hace TabCotizar por su cuenta y aquí se duplicarían.
    useEffect(() => {
        const faltante = buscarFaltante();
        if (faltante) {
            // Invalida cualquier pedido en vuelo: su precio ya no corresponde.
            secuencia.current++;
            setCargando(false);
            onEstado?.({ tipo: 'incompleto', faltante: faltante.etiqueta });
            return;
        }
        onEstado?.({ tipo: 'calculando' });
        const espera = window.setTimeout(() => { calcular({ silencioso: true }); }, ESPERA_CALCULO_MS);
        return () => window.clearTimeout(espera);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [input]);

    const errorDe = (nombre: string) => (campoConError === nombre ? MENSAJE_REQUERIDO : null);

    const hayCampoSinGrupo = modulo.campos.some(c => !c.grupo);

    // Respaldo del cálculo automático: fuerza un reintento y, si falta un
    // dato, lo marca en rojo con su aviso.
    const botonCalcular = (
        <div className="flex justify-end">
            <BotonSecundario compacto icono={Calculator} cargando={cargando} onClick={() => calcular()}>
                Calcular ahora
            </BotonSecundario>
        </div>
    );

    const selectorDiseno = (
        <SelectorDiseno
            modulo={modulo.id}
            value={input.disenoId as string | undefined}
            onChange={id => setInput(prev => ({ ...prev, disenoId: id }))}
            // Solo ventanas filtra por el campo "Sistema"; el resto lista todos
            // los diseños de su módulo, agrupados por sistema.
            sistema={modulo.id === 'ventanas' ? input.sistema as string | undefined : undefined}
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
                    {admiteDiseno && selectorDiseno}
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
        <div className="space-y-5">
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
                            <Chip key={chip} tono="marca">{chip}</Chip>
                        ))}
                    </div>
                ) : grupo === 'medidas' && areaCalculada !== null ? (
                    <Chip tono="esmeralda">≈ {areaCalculada.toFixed(2)} m²</Chip>
                ) : undefined;

                return (
                    <section key={grupo} aria-label={cfg.titulo} className="space-y-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                            <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                                <cfg.Icono className="w-3.5 h-3.5" />
                                {cfg.titulo}
                            </h3>
                            <span aria-hidden="true" className="flex-1 h-px bg-slate-200 min-w-[24px]" />
                            {accion}
                        </div>
                        {grupo === 'medidas' && admiteDiseno && selectorDiseno}

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
                                        <p className="text-[11px] text-slate-700 mt-1">Ver catálogo para disponibilidad por color.</p>
                                    )}
                                </div>
                            ))}
                        </div>
                    </section>
                );
            })}

            {botonCalcular}
        </div>
    );
};

export default FormularioModulo;

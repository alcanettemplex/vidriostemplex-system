import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { Copy, AlertTriangle, Info } from '../../../../components/ui/icons';

import { apiClonarPropuesta, apiGetCatalogo, apiGetModulos } from '../../services/cotizadorApi';
import { OpcionCampo, ProductoCatalogo, Propuesta, RespuestaPropuesta, SegmentoCliente } from '../../types';
import { fmtCOP } from '../../format';
import { BotonPrimario, BotonSecundario, Campo, Input, ModalShell, Select } from '../ui';

// ─────────────────────────────────────────────────────────────────────────────
// "La misma obra, con otro vidrio" — la razón de ser de las propuestas.
//
// Clonar recalcula TODOS los ítems de la propuesta origen con el motor, a
// partir de su `input` original más los tres cambios que este modal permite:
// vidrio, película y matizado. Es lo que evita el bug que originó el módulo de
// propuestas: agregar la variante al carrito la SUMABA, como si el cliente
// comprara las dos.
//
// NO BLOQUEA, AVISA. Dos vidrios del catálogo están hoy en $0 (CL4MM03LM y
// CL4MM08SP): elegirlos no impide clonar —el vendedor no puede arreglar el
// catálogo— pero se le dice antes, y el backend devuelve además sus propias
// `advertencias` por ítem, que el padre muestra.
//
// Overlay/panel calcado de ModalDetalleCotizacion (fixed inset-0 + backdrop
// oscuro + panel blanco redondeado), sin framer-motion.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
    cotizacionId: number;
    propuesta: Propuesta;
    /** Para leer el precio con el que se le cotiza a ESTE cliente; si no llega,
     * se mira el PA, que es el que usa el catálogo por defecto. */
    segmentoCliente?: SegmentoCliente;
    onClose: () => void;
    onClonada: (respuesta: RespuestaPropuesta) => void;
}

const SIN_CAMBIO = '';

type OpcionPelicula = '' | 'si' | 'no';
type OpcionMatizado = '' | 'sin' | 'total' | 'raya' | 'dibujo';

const precioDe = (p: ProductoCatalogo, segmento?: SegmentoCliente): number => {
    if (segmento === 'PM') return Number(p.precio_pm) || 0;
    if (segmento === 'PB') return Number(p.precio_pb) || 0;
    return Number(p.precio_pa) || 0;
};

const ModalClonarPropuesta: React.FC<Props> = ({ cotizacionId, propuesta, segmentoCliente, onClose, onClonada }) => {
    const [vidrios, setVidrios] = useState<ProductoCatalogo[]>([]);
    const [cargandoVidrios, setCargandoVidrios] = useState(true);
    const [clonando, setClonando] = useState(false);

    const [nombre, setNombre] = useState('');
    const [nota, setNota] = useState('');
    const [codigoVidrio, setCodigoVidrio] = useState<string>(SIN_CAMBIO);
    const [pelicula, setPelicula] = useState<OpcionPelicula>('');
    const [matizado, setMatizado] = useState<OpcionMatizado>('');

    useEffect(() => {
        // Sólo la categoría VIDRIO (40 filas). El catálogo completo son 430
        // productos y este selector no necesita ni uno más.
        //
        // Y de esas 40 se ofrecen ÚNICAMENTE las que los módulos declaran en su
        // campo `codigoVidrio`: hoy son 8. El motor valida contra esa misma
        // whitelist y un código fuera de ella cae al claro 4 mm crudo, así que
        // ofrecer las 40 significaba que 32 producían una "variante" con el
        // mismo precio que el original. Desde el 2026-09-20 el backend además
        // lo advierte, pero es mejor no ofrecer lo que no se puede cotizar.
        // `meta.campos` es el contrato del módulo — la misma fuente que usa
        // `moduloAcepta` en el store para decidir si un cambio aplica.
        Promise.all([apiGetCatalogo('VIDRIO'), apiGetModulos()])
            .then(([resCatalogo, resModulos]) => {
                const admitidos = new Set<string>();
                for (const m of resModulos.data) {
                    const campo = m.campos?.find((c) => c.nombre === 'codigoVidrio');
                    for (const o of campo?.opciones ?? []) {
                        const valor = typeof o === 'object' && o !== null ? (o as OpcionCampo).value : o;
                        if (valor) admitidos.add(String(valor));
                    }
                }
                setVidrios(resCatalogo.data.filter((p) => p.activo && admitidos.has(p.codigo)));
            })
            .catch(() => toast.error('No se pudo cargar la lista de vidrios del catálogo.'))
            .finally(() => setCargandoVidrios(false));
    }, []);

    const vidrioElegido = useMemo(
        () => vidrios.find((v) => v.codigo === codigoVidrio) || null,
        [vidrios, codigoVidrio]
    );
    const vidrioSinPrecio = Boolean(vidrioElegido && precioDe(vidrioElegido, segmentoCliente) <= 0);

    const hayCambios = codigoVidrio !== SIN_CAMBIO || pelicula !== '' || matizado !== '';

    const clonar = async () => {
        setClonando(true);
        try {
            // Sólo se envía lo que el vendedor decidió cambiar: una clave con
            // `undefined` no viaja, y el backend distingue "no lo toques" de
            // "ponlo en false". El esquema es `.strict()`, así que nada de más.
            const { data } = await apiClonarPropuesta(cotizacionId, propuesta.id, {
                nombre: nombre.trim() || undefined,
                nota: nota.trim() || undefined,
                ...(codigoVidrio !== SIN_CAMBIO ? { codigoVidrio } : {}),
                ...(pelicula !== '' ? { pelicula: pelicula === 'si' } : {}),
                // "Sin matizado" viaja como `false`: el motor lo traduce a "ninguno".
                ...(matizado !== '' ? { matizado: matizado === 'sin' ? false : matizado } : {}),
            });
            onClonada(data);
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'No se pudo duplicar la propuesta.');
        } finally {
            setClonando(false);
        }
    };

    return (
        <ModalShell
            titulo="Duplicar con otro vidrio"
            subtitulo={`Desde la propuesta ${propuesta.etiqueta}${propuesta.nombre ? ` · ${propuesta.nombre}` : ''}`}
            onClose={onClose}
            pie={
                <>
                    <BotonSecundario onClick={onClose}>Cancelar</BotonSecundario>
                    <BotonPrimario icono={Copy} cargando={clonando} onClick={clonar}>Crear propuesta</BotonPrimario>
                </>
            }
        >
            <div className="p-6 space-y-4">
                <div className="flex items-start gap-2 rounded-xl border border-indigo-100 bg-indigo-50/60 px-3 py-2.5 text-[12.5px] text-indigo-800">
                    <Info className="w-4 h-4 mt-0.5 shrink-0" />
                    <p>
                        Se crea una propuesta nueva con los mismos ítems, recalculados con el cambio que elijas.
                        Los cargos de obra se copian tal cual: cambiar el vidrio no cambia lo que cuesta instalarlo
                        ni el flete.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Campo etiqueta="Nombre (opcional)" className="md:col-span-1">
                        <Input
                            maxLength={80}
                            placeholder={`Variante de ${propuesta.etiqueta}`}
                            value={nombre}
                            onChange={(e) => setNombre(e.target.value)}
                        />
                    </Campo>
                    <Campo etiqueta="Nota (opcional)" className="md:col-span-2">
                        <Input
                            maxLength={2000}
                            placeholder="Para qué es esta variante"
                            value={nota}
                            onChange={(e) => setNota(e.target.value)}
                        />
                    </Campo>
                </div>

                <div className="border border-slate-200 rounded-xl p-4 space-y-3">
                    <span className="text-sm font-bold text-slate-700 block">Qué cambiar en todos los ítems</span>

                    <Campo etiqueta="Tipo de vidrio">
                        <Select
                            value={codigoVidrio}
                            disabled={cargandoVidrios}
                            onChange={(e) => setCodigoVidrio(e.target.value)}
                        >
                            <option value={SIN_CAMBIO}>{cargandoVidrios ? 'Cargando vidrios…' : 'Dejar el que tiene cada ítem'}</option>
                            {vidrios.map((v) => (
                                <option key={v.codigo} value={v.codigo}>
                                    {v.descripcion} ({v.codigo}){precioDe(v, segmentoCliente) <= 0 ? ' — sin precio' : ''}
                                </option>
                            ))}
                        </Select>
                        {vidrioElegido && !vidrioSinPrecio && (
                            <p className="mt-1 text-[11px] text-slate-500">
                                Precio en catálogo: <span className="font-cotizador-head font-bold">{fmtCOP(precioDe(vidrioElegido, segmentoCliente))}</span> por {vidrioElegido.unidad.toLowerCase()}.
                            </p>
                        )}
                        {vidrioSinPrecio && (
                            <p className="mt-1 flex items-start gap-1.5 text-[11.5px] text-amber-700 font-semibold">
                                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                Este vidrio está en $0 en el catálogo: la propuesta se creará, pero sus ítems saldrán
                                con líneas en error y no se podrán cobrar hasta que Compras le cargue el precio.
                            </p>
                        )}
                    </Campo>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <Campo etiqueta="Película">
                            <Select value={pelicula} onChange={(e) => setPelicula(e.target.value as OpcionPelicula)}>
                                <option value="">Dejar como está</option>
                                <option value="si">Incluir película</option>
                                <option value="no">Quitar película</option>
                            </Select>
                        </Campo>
                        <Campo etiqueta="Matizado">
                            <Select value={matizado} onChange={(e) => setMatizado(e.target.value as OpcionMatizado)}>
                                <option value="">Dejar como está</option>
                                <option value="sin">Sin matizado</option>
                                <option value="total">Matizado total</option>
                                <option value="raya">Matizado raya</option>
                                <option value="dibujo">Matizado dibujo</option>
                            </Select>
                        </Campo>
                    </div>

                    {!hayCambios && (
                        <p className="text-[11.5px] text-slate-400">
                            Sin ningún cambio marcado, la propuesta nueva es una copia exacta: los ítems se copian
                            con su precio actual, sin volver a pasarlos por el motor.
                        </p>
                    )}
                    <p className="text-[11px] text-slate-400 leading-snug">
                        Un ítem cuyo producto no ofrezca la opción (las cabinas y los espejos sacan el vidrio del
                        espesor, no de un código) se copia tal como estaba y se avisa al terminar.
                    </p>
                </div>
            </div>
        </ModalShell>
    );
};

export default ModalClonarPropuesta;

import React, { useEffect, useMemo, useState } from 'react';
import { Search, Replace, Plus, PackageSearch } from '../../../../components/ui/icons';
import { toast } from 'react-toastify';

import { apiGetCatalogo } from '../../services/cotizadorApi';
import { ExtraComponente, LineaBOM, ProductoCatalogo, SegmentoCliente } from '../../types';
import { fmtCOP } from '../../format';
import { buscarEnCatalogo, claseDeUnidad, MIN_BUSQUEDA, precioDe, rotuloCantidad } from '../../catalogoUtil';
import { BotonPrimario, Campo, Input, ModalShell } from '../ui';
import ModalCatalogoGeneral from './ModalCatalogoGeneral';

// ─────────────────────────────────────────────────────────────────────────────
// Elegir un componente para un ítem ya calculado (2026-09-23):
//
//   · modo "cambiar": reemplazar una línea del despiece por otro producto que
//     se cobre en la MISMA clase de unidad (una chapa por otra chapa, un vidrio
//     por otro vidrio). La lista ya viene filtrada; el backend lo vuelve a
//     validar.
//   · modo "agregar": cualquier producto del catálogo. Un perfil se pide como
//     medida (mm) × piezas y el backend le suma el 5 % de desperdicio; el resto,
//     en la unidad del catálogo.
//
// Un producto de precio a cotizar (KVE001, vidrios sobre pedido) pide además el
// COSTO que dio el proveedor, en los dos modos: sin él no se puede confirmar.
//
// Si el producto no está en el catálogo del Cotizador, el enlace de abajo abre
// "Traer del catálogo general" sin salir de aquí, y al volver queda elegido.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_SUGERENCIAS = 12;

export type AccionComponente =
    | { tipo: 'cambio'; de: string; a: string; costo?: number }
    | { tipo: 'extra'; extra: ExtraComponente };

interface Props {
    modo: 'cambiar' | 'agregar';
    /** La línea que se reemplaza (modo cambiar). */
    linea?: LineaBOM | null;
    segmento: SegmentoCliente;
    onClose: () => void;
    onConfirmar: (accion: AccionComponente) => void;
}

const esPerfilLineal = (p: ProductoCatalogo | null) =>
    Boolean(p && String(p.categoria).toUpperCase() === 'PERFILERIA' && claseDeUnidad(p.unidad) === 'lineal');

const ModalComponente: React.FC<Props> = ({ modo, linea, segmento, onClose, onConfirmar }) => {
    const [catalogo, setCatalogo] = useState<ProductoCatalogo[]>([]);
    const [cargando, setCargando] = useState(true);
    const [busqueda, setBusqueda] = useState('');
    const [elegido, setElegido] = useState<ProductoCatalogo | null>(null);
    const [cantidad, setCantidad] = useState('');
    const [medidaMm, setMedidaMm] = useState('');
    const [piezas, setPiezas] = useState('1');
    const [costo, setCosto] = useState('');
    const [traerGeneral, setTraerGeneral] = useState(false);

    const cargarCatalogo = () =>
        apiGetCatalogo()
            .then(({ data }) => setCatalogo(Array.isArray(data) ? data : []))
            .catch(() => toast.error('No se pudo cargar el catálogo del Cotizador.'))
            .finally(() => setCargando(false));

    useEffect(() => { cargarCatalogo(); }, []);

    // En "cambiar" sólo se ofrece lo que se cobra en la misma clase de unidad:
    // cambiar una chapa (unidad) por un vidrio (m²) dejaría una cantidad sin
    // sentido, y el backend lo rechazaría igual.
    const claseLinea = linea ? claseDeUnidad(linea.unidad) : null;
    const filtro = (p: ProductoCatalogo) =>
        p.activo !== false &&
        (modo === 'agregar' || (claseDeUnidad(p.unidad) === claseLinea && p.codigo !== linea?.codigo));

    const sugerencias = useMemo(
        () => buscarEnCatalogo(catalogo, busqueda, MAX_SUGERENCIAS, filtro),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [catalogo, busqueda, modo, linea?.codigo]
    );

    const perfil = esPerfilLineal(elegido);
    const aCotizar = Boolean(elegido?.precioACotizar);

    const confirmar = () => {
        if (!elegido) return;
        const costoProveedor = Number(costo);
        if (aCotizar && !(costoProveedor > 0)) {
            toast.error(`Escribe el costo que te dio el proveedor para ${elegido.codigo}.`);
            return;
        }
        const conCosto = aCotizar ? { costo: costoProveedor } : {};
        if (modo === 'cambiar' && linea) {
            onConfirmar({ tipo: 'cambio', de: String(linea.codigoOriginal ?? linea.codigo), a: elegido.codigo, ...conCosto });
            return;
        }
        if (perfil) {
            const mm = Number(medidaMm);
            const pz = Number(piezas);
            if (!(mm > 0) || !Number.isInteger(pz) || pz <= 0) {
                toast.error('Escribe la medida de cada pieza en milímetros y cuántas piezas.');
                return;
            }
            onConfirmar({ tipo: 'extra', extra: { codigo: elegido.codigo, medidaMm: mm, piezas: pz, ...conCosto } });
            return;
        }
        const cant = Number(cantidad);
        if (!(cant > 0)) {
            toast.error('Escribe una cantidad mayor a 0.');
            return;
        }
        onConfirmar({ tipo: 'extra', extra: { codigo: elegido.codigo, cantidad: cant, ...conCosto } });
    };

    const metrosPerfil = perfil && Number(medidaMm) > 0 && Number(piezas) > 0
        ? ((Number(medidaMm) * Number(piezas)) / 1000) * 1.05
        : null;

    if (traerGeneral) {
        return (
            <ModalCatalogoGeneral
                busquedaInicial={busqueda}
                onClose={() => setTraerGeneral(false)}
                onImportado={p => {
                    setTraerGeneral(false);
                    setCatalogo(c => [...c, p]);
                    const encaja = filtro(p);
                    if (encaja) { setElegido(p); setCosto(''); }
                    else toast.warn(`${p.codigo} se cobra en otra unidad que la línea que estás cambiando: no se puede usar aquí.`);
                }}
            />
        );
    }

    return (
        <ModalShell
            titulo={modo === 'cambiar' ? 'Cambiar componente' : 'Agregar componente'}
            subtitulo={modo === 'cambiar' && linea
                ? `Reemplaza ${linea.codigo} — ${linea.descripcion} (se cobra por ${rotuloCantidad(linea.unidad)})`
                : 'Se suma al despiece de este ítem.'}
            onClose={onClose}
            pie={
                <div className="flex justify-end">
                    <BotonPrimario
                        icono={modo === 'cambiar' ? Replace : Plus}
                        disabled={!elegido}
                        onClick={confirmar}
                    >
                        {modo === 'cambiar' ? 'Cambiar y recalcular' : 'Agregar y recalcular'}
                    </BotonPrimario>
                </div>
            }
        >
            <div className="p-6 space-y-4">
                <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                    <Input
                        autoFocus
                        className="pl-9"
                        placeholder={cargando ? 'Cargando catálogo…' : 'Código o descripción…'}
                        disabled={cargando}
                        value={busqueda}
                        onChange={e => { setBusqueda(e.target.value); setElegido(null); setCosto(''); }}
                    />
                </div>

                {busqueda.trim().length >= MIN_BUSQUEDA && !elegido && (
                    <ul className="max-h-72 overflow-auto divide-y divide-slate-100 rounded-xl border border-slate-200">
                        {sugerencias.length === 0 && (
                            <li className="px-4 py-3 text-[12.5px] text-slate-700">
                                Sin coincidencias{modo === 'cambiar' ? ' que se cobren en la misma unidad' : ''}.
                            </li>
                        )}
                        {sugerencias.map(p => (
                            <li key={p.codigo}>
                                <button
                                    type="button"
                                    onClick={() => { setElegido(p); setCosto(''); }}
                                    className="w-full text-left px-4 py-2.5 hover:bg-templex-50 flex items-start justify-between gap-3"
                                >
                                    <span className="min-w-0">
                                        <span className="block text-[12.5px] font-semibold text-slate-900">{p.codigo}</span>
                                        <span className="block text-[12px] text-slate-800">{p.descripcion}</span>
                                    </span>
                                    <span className="text-right shrink-0 text-[12px] text-slate-900 font-semibold tabular-nums">
                                        {p.precioACotizar ? 'Precio a cotizar' : `${fmtCOP(precioDe(p, segmento))} / ${rotuloCantidad(p.unidad)}`}
                                        <span className="block font-normal text-slate-700">{p.categoria}</span>
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}

                {elegido && (
                    <div className="rounded-xl border border-templex-200 bg-templex-50 px-4 py-3">
                        <p className="text-[13px] font-bold text-slate-900">{elegido.codigo} — {elegido.descripcion}</p>
                        <p className="text-[12px] text-slate-800 mt-0.5 tabular-nums">
                            {aCotizar
                                ? `Precio a cotizar con el proveedor · ${elegido.categoria}`
                                : `${fmtCOP(precioDe(elegido, segmento))} por ${rotuloCantidad(elegido.unidad)} · precio ${segmento} · ${elegido.categoria}`}
                        </p>
                    </div>
                )}

                {elegido && aCotizar && (
                    <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 space-y-2">
                        <p className="text-[12px] text-amber-900">
                            <strong className="font-semibold">Este producto se cotiza aparte.</strong> Pide el precio al
                            proveedor y escribe su costo por {rotuloCantidad(elegido.unidad)}: el precio de venta se
                            calcula con el margen del tipo de cliente ({segmento}).
                        </p>
                        <Campo etiqueta={`Costo del proveedor por ${rotuloCantidad(elegido.unidad)}`} requerido>
                            <Input type="number" min={0} step="any" value={costo} onChange={e => setCosto(e.target.value)} />
                        </Campo>
                    </div>
                )}

                {elegido && modo === 'agregar' && (
                    perfil ? (
                        <div className="grid grid-cols-2 gap-3">
                            <Campo etiqueta="Medida de cada pieza (mm)" requerido>
                                <Input type="number" min={1} value={medidaMm} onChange={e => setMedidaMm(e.target.value)} />
                            </Campo>
                            <Campo etiqueta="Piezas" requerido>
                                <Input type="number" min={1} step={1} value={piezas} onChange={e => setPiezas(e.target.value)} />
                            </Campo>
                            <p className="col-span-2 text-[12px] text-slate-700">
                                {metrosPerfil !== null
                                    ? <>Se cobran <strong className="font-semibold text-slate-900">{metrosPerfil.toFixed(2)} m</strong> (incluye 5 % de desperdicio, como los perfiles del diseño).</>
                                    : 'Se cobra en metros, con el 5 % de desperdicio.'}{' '}
                                Tocar la perfilería deja el ítem fuera de la orden de corte y de la SAP automática.
                            </p>
                        </div>
                    ) : (
                        <Campo etiqueta={`Cantidad (${rotuloCantidad(elegido.unidad)})`} requerido>
                            <Input type="number" min={0} step="any" value={cantidad} onChange={e => setCantidad(e.target.value)} />
                        </Campo>
                    )
                )}

                {elegido && modo === 'cambiar' && String(elegido.categoria).toUpperCase() === 'PERFILERIA' && (
                    <p className="text-[12px] text-amber-800 font-semibold">
                        Cambiar un perfil deja el ítem fuera de la orden de corte y de la SAP automática.
                    </p>
                )}

                <button
                    type="button"
                    onClick={() => setTraerGeneral(true)}
                    className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-templex-700 hover:text-templex-800 hover:underline"
                >
                    <PackageSearch className="w-3.5 h-3.5" />
                    ¿No aparece? Tráelo del catálogo general
                </button>
            </div>
        </ModalShell>
    );
};

export default ModalComponente;

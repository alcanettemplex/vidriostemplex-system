import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { Loader2, Save, Calculator, AlertTriangle, RefreshCw, Percent, SlidersHorizontal, PackageSearch } from '../../../components/ui/icons';

import {
    apiListarMultiplicadores, apiGuardarMultiplicador, apiRecalcularCategoria,
    apiGetParametros, apiEditarParametros,
} from '../services/cotizadorApi';
import { MultiplicadorCategoria, ProductoCatalogo, ResultadoRecalculoCategoria } from '../types';
import ModalCatalogoGeneral from './modals/ModalCatalogoGeneral';
import { fmtCOP, fmtFecha } from '../format';
import { BotonPrimario, BotonSecundario, Campo, Chip, Input, Tarjeta } from './ui';

// ─────────────────────────────────────────────────────────────────────────────
// Pestaña "Configuración" del Cotizador — solo root/admin (gate heredado del
// router). Dos cosas que hasta hoy sólo se podían tocar por script o por SQL:
//
//   1. Multiplicador costo→precio de venta por categoría. Sólo ACCESORIO estaba
//      sembrado; sin fila, el sync automático de precios de proveedor se
//      abstiene de tocar esa categoría (ver TECH_DEBT.md 2026-09-14).
//   2. Parámetros de negocio (AIU, IVA, flete, andamio, huacal y —desde el
//      2026-09-26— las 4 tarifas de mano de obra por producto; antes, las 6 tarifas
//      de mano de obra). El endpoint existía desde siempre; nunca hubo pantalla.
//
// Guardar un multiplicador NO mueve precios ya cargados — eso es el botón
// "Recalcular", aparte y con previsualización.
//
// "Recalcular" corre en dos fases y la previsualización las distingue, porque
// no significan lo mismo (decisión del usuario, 2026-09-17):
//   · proveedor     — el costo se deriva del proveedor más barato y de ahí sale
//                     el precio de venta.
//   · multiplicador — el producto no tiene proveedor del que derivar costo, así
//                     que el costo se conserva y sólo se realinea PA/PM/PB.
//                     Sin esta fase, 116 productos de PERFILERIA quedaban
//                     atascados en un multiplicador viejo (1,514500) para
//                     siempre.
// ─────────────────────────────────────────────────────────────────────────────

const TabConfiguracion: React.FC = () => (
    <div className="p-4 space-y-6">
        <SeccionCatalogoGeneral />
        <SeccionMultiplicadores />
        <SeccionParametros />
    </div>
);

// ─── Traer productos del catálogo general (2026-09-23) ──────────────────────
// Lo que existe en el catálogo del ERP pero no en el del Cotizador (caso real:
// VMINIBOR, vidrio miniboreal) se trae desde aquí, vinculado a Proveedores. El
// mismo modal se abre desde "Cambiar / Agregar componente" en Cotizar.

const SeccionCatalogoGeneral: React.FC = () => {
    const [abierto, setAbierto] = useState(false);
    const [traidos, setTraidos] = useState<ProductoCatalogo[]>([]);

    return (
        <Tarjeta
            titulo="Productos del catálogo general"
            icono={PackageSearch}
            descripcion="Trae al Cotizador un producto que sólo existe en el catálogo del ERP. Queda vinculado: su precio sale del proveedor más barato × el multiplicador de su categoría, y se actualiza solo."
            accion={
                <BotonPrimario compacto icono={PackageSearch} className="shrink-0 whitespace-nowrap" onClick={() => setAbierto(true)}>
                    Traer del catálogo general
                </BotonPrimario>
            }
        >
            {traidos.length === 0 ? (
                <p className="text-[12.5px] text-slate-700">Nada traído en esta sesión.</p>
            ) : (
                <ul className="space-y-1 text-[12.5px] text-slate-800">
                    {traidos.map(p => (
                        <li key={p.codigo} className="flex justify-between gap-3">
                            <span>
                                <strong className="font-semibold text-slate-900">{p.codigo}</strong> — {p.descripcion}{' '}
                                <span className="text-slate-700">({p.categoria}, {p.unidad})</span>
                            </span>
                            <span className="tabular-nums whitespace-nowrap font-semibold text-slate-900">PA {fmtCOP(p.precio_pa)}</span>
                        </li>
                    ))}
                </ul>
            )}
            {abierto && (
                <ModalCatalogoGeneral
                    onClose={() => setAbierto(false)}
                    onImportado={p => { setAbierto(false); setTraidos(t => [p, ...t]); }}
                />
            )}
        </Tarjeta>
    );
};

// ─── Multiplicadores por categoría ──────────────────────────────────────────

const SeccionMultiplicadores: React.FC = () => {
    const [filas, setFilas] = useState<MultiplicadorCategoria[]>([]);
    const [cargando, setCargando] = useState(true);
    const [edicion, setEdicion] = useState<Record<string, { pa: string; pm: string; pb: string; motivo: string }>>({});
    const [guardando, setGuardando] = useState<string | null>(null);
    const [recalculando, setRecalculando] = useState<string | null>(null);
    const [previsualizacion, setPrevisualizacion] = useState<ResultadoRecalculoCategoria | null>(null);

    const cargar = useCallback(async () => {
        setCargando(true);
        try {
            const { data } = await apiListarMultiplicadores();
            setFilas(data);
            setEdicion(
                Object.fromEntries(
                    data.map((f) => [
                        f.categoria,
                        {
                            pa: f.multiplicadorPa?.toString() ?? '',
                            pm: f.multiplicadorPm?.toString() ?? '',
                            pb: f.multiplicadorPb?.toString() ?? '',
                            motivo: '',
                        },
                    ])
                )
            );
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'No se pudieron cargar los multiplicadores.');
        } finally {
            setCargando(false);
        }
    }, []);

    useEffect(() => { cargar(); }, [cargar]);

    const guardar = async (categoria: string) => {
        const ed = edicion[categoria];
        if (!ed?.motivo.trim()) {
            toast.error('Escribí un motivo para el cambio.');
            return;
        }
        const pa = Number(ed.pa), pm = Number(ed.pm), pb = Number(ed.pb);
        if (![pa, pm, pb].every((n) => Number.isFinite(n) && n >= 1)) {
            toast.error('Los tres multiplicadores deben ser números mayores o iguales a 1.');
            return;
        }
        setGuardando(categoria);
        try {
            await apiGuardarMultiplicador(categoria, {
                multiplicadorPa: pa, multiplicadorPm: pm, multiplicadorPb: pb, motivo: ed.motivo.trim(),
            });
            toast.success(`Multiplicador de ${categoria} guardado. No se movió ningún precio existente.`);
            cargar();
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'No se pudo guardar el multiplicador.');
        } finally {
            setGuardando(null);
        }
    };

    const previsualizar = async (categoria: string) => {
        setRecalculando(categoria);
        try {
            const { data } = await apiRecalcularCategoria(categoria, true);
            setPrevisualizacion(data);
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'No se pudo previsualizar el recálculo.');
        } finally {
            setRecalculando(null);
        }
    };

    const aplicar = async (categoria: string) => {
        setRecalculando(categoria);
        try {
            const { data } = await apiRecalcularCategoria(categoria, false);
            toast.success(data.resumen);
            setPrevisualizacion(null);
            cargar();
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'No se pudo recalcular la categoría.');
        } finally {
            setRecalculando(null);
        }
    };

    return (
        <Tarjeta
            titulo="Multiplicador costo → precio de venta, por categoría"
            icono={Percent}
            descripcion={'Una categoría sin multiplicador no es "×1": el motor que actualiza precios desde Proveedores se abstiene de tocarla por completo.'}
            sinRelleno
        >
            {cargando ? (
                <div className="p-8 flex justify-center text-slate-500"><Loader2 className="w-5 h-5 animate-spin" /></div>
            ) : (
                // Scroll horizontal propio: en pantallas angostas la tabla se desplaza
                // dentro de la tarjeta en vez de empujar el ancho de la página.
                <div className="overflow-x-auto">
                <table className="w-full min-w-[960px] text-sm">
                    <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-900 border-b border-slate-100">
                        <tr>
                            <th className="text-left px-4 py-2">Categoría</th>
                            <th className="text-left px-3 py-2">Productos</th>
                            <th className="text-left px-3 py-2">PA</th>
                            <th className="text-left px-3 py-2">PM</th>
                            <th className="text-left px-3 py-2">PB</th>
                            <th className="text-left px-3 py-2">Motivo del cambio</th>
                            <th><span className="sr-only">Acciones</span></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {filas.map((f) => (
                            <tr key={f.categoria} className={f.configurado ? '' : 'bg-amber-50/40'}>
                                <td className="px-4 py-2.5 align-middle">
                                    <div className="font-semibold text-slate-900">{f.categoria}</div>
                                    {!f.configurado && (
                                        <div className="text-[11px] font-semibold text-amber-800 flex items-center gap-1 mt-0.5 whitespace-nowrap">
                                            <AlertTriangle className="w-3 h-3" /> sin configurar
                                        </div>
                                    )}
                                    {/* Metadato de la última edición, en una sola línea. `actualizadoPor`
                                        se muestra tal cual (un usuario o una etiqueta de script como
                                        "migracion-2026-09-17"), sin interpretarlo; si no cabe se trunca
                                        y el valor completo queda en el tooltip. */}
                                    {(f.actualizadoEn || f.actualizadoPor) && (
                                        <div
                                            className="text-[11.5px] text-slate-700 mt-0.5 whitespace-nowrap truncate max-w-[260px]"
                                            title={[f.actualizadoEn && `Actualizado ${fmtFecha(f.actualizadoEn)}`, f.actualizadoPor && `por ${f.actualizadoPor}`]
                                                .filter(Boolean)
                                                .join(' · ')}
                                        >
                                            {f.actualizadoEn && `Actualizado ${fmtFecha(f.actualizadoEn)}`}
                                            {f.actualizadoEn && f.actualizadoPor && ' · '}
                                            {f.actualizadoPor && `por ${f.actualizadoPor}`}
                                        </div>
                                    )}
                                </td>
                                <td className="px-3 py-2.5 align-middle whitespace-nowrap">
                                    <div className="text-slate-800">
                                        <span className="font-semibold text-slate-900">{f.productos}</span> productos
                                    </div>
                                    <div className="text-[11.5px] text-slate-700">{f.vinculados} con proveedor</div>
                                </td>
                                {(['pa', 'pm', 'pb'] as const).map((k) => (
                                    <td key={k} className="px-3 py-2.5 align-middle">
                                        <Input
                                            className="w-24"
                                            inputMode="decimal"
                                            value={edicion[f.categoria]?.[k] ?? ''}
                                            placeholder="—"
                                            onChange={(e) =>
                                                setEdicion((s) => ({ ...s, [f.categoria]: { ...s[f.categoria], [k]: e.target.value } }))
                                            }
                                        />
                                    </td>
                                ))}
                                <td className="px-3 py-2.5 align-middle min-w-[180px]">
                                    <Input
                                        value={edicion[f.categoria]?.motivo ?? ''}
                                        placeholder="Por qué cambia"
                                        onChange={(e) =>
                                            setEdicion((s) => ({ ...s, [f.categoria]: { ...s[f.categoria], motivo: e.target.value } }))
                                        }
                                    />
                                </td>
                                <td className="px-4 py-2.5 align-middle whitespace-nowrap">
                                    {/* Anchos fijos: con el spinner de "cargando" o el estado
                                        deshabilitado los dos botones no cambian de tamaño y las
                                        columnas quedan alineadas fila a fila. */}
                                    <div className="flex items-center gap-1.5 justify-end">
                                        <BotonPrimario
                                            compacto
                                            className="w-[100px]"
                                            icono={Save}
                                            cargando={guardando === f.categoria}
                                            onClick={() => guardar(f.categoria)}
                                        >
                                            Guardar
                                        </BotonPrimario>
                                        <BotonSecundario
                                            compacto
                                            className="w-[116px]"
                                            icono={Calculator}
                                            cargando={recalculando === f.categoria}
                                            disabled={!f.configurado}
                                            onClick={() => previsualizar(f.categoria)}
                                            title={f.configurado ? 'Ver qué precios cambiarían' : 'Configurá un multiplicador primero'}
                                        >
                                            Recalcular
                                        </BotonSecundario>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                </div>
            )}

            {previsualizacion && (
                <div className="border-t border-templex-200 bg-templex-50/40 p-4 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-bold text-slate-900">
                            Previsualización — {previsualizacion.categoria}
                        </div>
                        <div className="flex gap-2">
                            <BotonSecundario compacto onClick={() => setPrevisualizacion(null)}>Cancelar</BotonSecundario>
                            <BotonPrimario
                                compacto
                                icono={RefreshCw}
                                disabled={previsualizacion.cambios.length === 0 || recalculando !== null}
                                onClick={() => aplicar(previsualizacion.categoria)}
                            >
                                Aplicar a {previsualizacion.cambios.length} producto(s)
                            </BotonPrimario>
                        </div>
                    </div>
                    <p className="text-[12.5px] text-slate-800">{previsualizacion.resumen}</p>

                    <div className="flex flex-wrap gap-2">
                        <Chip tono="marca">{previsualizacion.porProveedor} con costo nuevo del proveedor</Chip>
                        <Chip tono="ambar">{previsualizacion.realineados} realineado(s) al multiplicador, costo intacto</Chip>
                    </div>

                    {previsualizacion.cambios.length > 0 && (
                        <div className="max-h-72 overflow-auto border border-slate-200 rounded-lg bg-white">
                            <table className="w-full min-w-[560px] text-[12.5px] text-slate-800">
                                <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-900 sticky top-0">
                                    <tr>
                                        <th className="text-left px-2 py-1.5">Código</th>
                                        <th className="text-left px-2 py-1.5">Origen</th>
                                        <th className="text-left px-2 py-1.5">Costo antes → después</th>
                                        <th className="text-left px-2 py-1.5">PA antes → después</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {previsualizacion.cambios.map((c) => (
                                        <tr key={c.codigo}>
                                            <td className="px-2 py-1.5 font-semibold text-slate-900">{c.codigo}</td>
                                            <td className="px-2 py-1.5">
                                                <Chip
                                                    tono={c.fase === 'proveedor' ? 'marca' : 'ambar'}
                                                    title={
                                                        c.fase === 'proveedor'
                                                            ? 'El costo se derivó del proveedor más barato'
                                                            : 'Sin proveedor: se conserva el costo y sólo se realinea el precio de venta'
                                                    }
                                                >
                                                    {c.fase === 'proveedor' ? 'proveedor' : 'multiplicador'}
                                                </Chip>
                                            </td>
                                            <td className="px-2 py-1.5 whitespace-nowrap">
                                                {c.antes.costo_unitario === c.despues.costo_unitario
                                                    ? `${fmtCOP(c.antes.costo_unitario)} (sin cambio)`
                                                    : `${fmtCOP(c.antes.costo_unitario)} → ${fmtCOP(c.despues.costo_unitario)}`}
                                            </td>
                                            <td className="px-2 py-1.5 whitespace-nowrap">{fmtCOP(c.antes.precio_pa)} → {fmtCOP(c.despues.precio_pa)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {previsualizacion.omitidos.length > 0 && (
                        <details className="text-[12.5px] text-slate-800">
                            <summary className="cursor-pointer font-semibold text-slate-900">
                                {previsualizacion.omitidos.length} producto(s) omitido(s) — ver motivos
                            </summary>
                            <ul className="mt-1 space-y-0.5 max-h-40 overflow-y-auto">
                                {previsualizacion.omitidos.map((o, i) => (
                                    <li key={`${o.codigo}-${i}`}><span className="font-mono font-semibold text-slate-900">{o.codigo}</span>: {o.motivo}</li>
                                ))}
                            </ul>
                        </details>
                    )}
                </div>
            )}
        </Tarjeta>
    );
};

// ─── Parámetros de negocio ──────────────────────────────────────────────────

/** `min`/`max` NO son cosmética: el motor divide por `aiu` (motorCalculo.ts:185),
 * así que un 0 da precio infinito y un 0.04 multiplica el total por 25. El IVA,
 * en cambio, sí se usa como fracción (`baseIva * ivaPct`). Son dos convenciones
 * distintas en campos que se ven iguales — por eso cada uno lleva su ayuda. */
const CAMPOS_RAIZ: Array<{
    clave: 'aiu' | 'iva' | 'flete_fijo' | 'alquiler_andamio' | 'huacal';
    label: string;
    ayuda?: string;
    min?: number;
    max?: number;
}> = [
    { clave: 'aiu', label: 'AIU', ayuda: 'divisor: 0.96 ≈ +4%', min: 0.5, max: 1 },
    { clave: 'iva', label: 'IVA', ayuda: 'fracción: 0.19 = 19%', min: 0, max: 1 },
    { clave: 'flete_fijo', label: 'Flete fijo' },
    { clave: 'alquiler_andamio', label: 'Alquiler de andamio' },
    { clave: 'huacal', label: 'Huacal' },
];

/** Mano de obra por producto (2026-09-26). Montos ANTES de AIU e IVA: el
 * sistema les aplica AIU, el descuento de la propuesta e IVA. Reemplazan a las
 * tarifas SMO por tipo de obra, que siguen en la BD solo para las propuestas
 * guardadas antes de ese día y ya no se muestran aquí. */
const CAMPOS_MANO_OBRA: Array<{
    clave: 'mo_ensamble_ventana_m2' | 'mo_instalacion_ventana_m2' | 'mo_instalacion_cabina_und' | 'mo_instalacion_espejo_tablero_m2';
    label: string;
    ayuda: string;
}> = [
    { clave: 'mo_ensamble_ventana_m2', label: 'Ensamble ventanas y proyectantes', ayuda: 'por m², siempre' },
    { clave: 'mo_instalacion_ventana_m2', label: 'Instalación ventanas y proyectantes', ayuda: 'por m², si llevan instalación' },
    { clave: 'mo_instalacion_cabina_und', label: 'Instalación cabinas', ayuda: 'por unidad; en L, el doble' },
    { clave: 'mo_instalacion_espejo_tablero_m2', label: 'Instalación espejos y tableros', ayuda: 'por m², si llevan instalación' },
];

const SeccionParametros: React.FC = () => {
    const [valores, setValores] = useState<Record<string, string>>({});
    const [cargando, setCargando] = useState(true);
    const [guardando, setGuardando] = useState(false);
    const [motivo, setMotivo] = useState('');

    const cargar = useCallback(async () => {
        setCargando(true);
        try {
            const { data } = await apiGetParametros();
            const plano: Record<string, string> = {};
            for (const c of CAMPOS_RAIZ) plano[c.clave] = String(data[c.clave] ?? '');
            for (const c of CAMPOS_MANO_OBRA) plano[c.clave] = String(data[c.clave] ?? '');
            setValores(plano);
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'No se pudieron cargar los parámetros.');
        } finally {
            setCargando(false);
        }
    }, []);

    useEffect(() => { cargar(); }, [cargar]);

    const guardar = async (ev: React.FormEvent) => {
        ev.preventDefault();
        if (!motivo.trim()) {
            toast.error('Escribí un motivo para el cambio.');
            return;
        }
        const datos: Record<string, unknown> = { motivo: motivo.trim() };
        for (const c of CAMPOS_RAIZ) {
            const n = Number(valores[c.clave]);
            if (!Number.isFinite(n) || n < 0) {
                toast.error(`"${c.label}" debe ser un número mayor o igual a 0.`);
                return;
            }
            if (c.min !== undefined && n < c.min) {
                toast.error(`"${c.label}" no puede ser menor que ${c.min} (${c.ayuda}).`);
                return;
            }
            if (c.max !== undefined && n > c.max) {
                toast.error(`"${c.label}" no puede ser mayor que ${c.max} (${c.ayuda}).`);
                return;
            }
            datos[c.clave] = n;
        }
        for (const c of CAMPOS_MANO_OBRA) {
            const n = Number(valores[c.clave]);
            if (!Number.isFinite(n) || n < 0) {
                toast.error(`La tarifa "${c.label}" debe ser un número mayor o igual a 0.`);
                return;
            }
            datos[c.clave] = n;
        }

        setGuardando(true);
        try {
            await apiEditarParametros(datos as any);
            toast.success('Parámetros guardados.');
            setMotivo('');
            cargar();
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'No se pudieron guardar los parámetros.');
        } finally {
            setGuardando(false);
        }
    };

    if (cargando) {
        return (
            <Tarjeta className="p-8 flex justify-center text-slate-500">
                <Loader2 className="w-5 h-5 animate-spin" />
            </Tarjeta>
        );
    }

    return (
        <Tarjeta
            titulo="Parámetros de negocio"
            icono={SlidersHorizontal}
            descripcion="Afectan el cálculo de toda cotización nueva. Las cotizaciones ya guardadas conservan los valores con los que se calcularon."
        >
            <form onSubmit={guardar} className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-x-3 gap-y-4">
                    {CAMPOS_RAIZ.map((c) => (
                        <Campo key={c.clave} etiqueta={c.label} ayuda={c.ayuda}>
                            <Input
                                inputMode="decimal"
                                value={valores[c.clave] ?? ''}
                                onChange={(e) => setValores((s) => ({ ...s, [c.clave]: e.target.value }))}
                            />
                        </Campo>
                    ))}
                </div>

                <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-900 mb-1">
                        Mano de obra por producto — antes de AIU e IVA
                    </div>
                    <p className="text-[12px] text-slate-800 mb-2 leading-snug">
                        Se calcula sola desde los productos de la propuesta, con mínimo 1 m² por pieza. Lleva AIU, el
                        descuento de la propuesta e IVA, igual que un producto.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        {CAMPOS_MANO_OBRA.map((c) => (
                            <Campo key={c.clave} etiqueta={c.label} ayuda={c.ayuda}>
                                <Input
                                    inputMode="decimal"
                                    value={valores[c.clave] ?? ''}
                                    onChange={(e) => setValores((s) => ({ ...s, [c.clave]: e.target.value }))}
                                />
                            </Campo>
                        ))}
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                    <Campo etiqueta="Motivo del cambio" className="flex-1">
                        <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Queda en el historial" />
                    </Campo>
                    <BotonPrimario type="submit" icono={Save} cargando={guardando} className="whitespace-nowrap">
                        Guardar parámetros
                    </BotonPrimario>
                </div>
            </form>
        </Tarjeta>
    );
};

export default TabConfiguracion;

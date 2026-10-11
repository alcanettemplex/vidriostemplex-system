import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Camera, FileText, Images, Loader2, Minus, Plus, Printer, ShieldCheck, X } from '../../../components/ui/icons';
import PrintableProduccion from '../../odp/components/PrintableProduccion';
import PrintableOA from '../../odp/components/PrintableOA';
import PrintableDetalleTecnico from '../../odp/components/PrintableDetalleTecnico';
import PrintableSAP from '../../odp/components/PrintableSAP';
import { ESTILOS_DOCUMENTO } from '../utils/printDocument';
import API from '../../../services/config';
import { fmtDia } from '../../../utils/fechas';

// ─────────────────────────────────────────────────────────────────────────────
// Visor de documentos para el CELULAR (2026-10-11, decisión del usuario).
//
// En el celular los botones ODP, Ficha técnica, SAP y Det. SAP lanzaban la
// impresión: la ventana emergente se bloquea y la hoja carta sale diminuta. Aquí
// se VEN: los mismos imprimibles de siempre (no hay una segunda versión que
// mantener), escalados al ancho de la pantalla, con zoom y desplazamiento. Det.
// SAP son fotos: se muestran como galería y una se toca para verla en grande.
// Sin botón de imprimir: en computador los botones siguen imprimiendo directo.
// La pestaña Medidas (fotos de la toma de medidas, solo instalador) es la única
// que se abre también en computador: son fotos, no hay nada que imprimir.
// ─────────────────────────────────────────────────────────────────────────────

export type TipoVisor = 'op' | 'tecnico' | 'sap' | 'det_sap' | 'medidas';

/** Fotos de las tomas de medidas de una ODP, agrupadas por toma. Vienen en el
 * payload de `mi-asignacion` (`odp.tomas_medidas[].medidas_json`); solo cuentan
 * las URLs, igual que en la ficha ODP (así las guarda `uploadFotoTM`). */
export const fotosDeTomas = (odp: any): { titulo: string; fotos: string[] }[] =>
  (Array.isArray(odp?.tomas_medidas) ? odp.tomas_medidas : [])
    .map((tm: any) => ({
      titulo: [tm.numero_tm, tm.fecha_visita ? fmtDia(tm.fecha_visita) : null].filter(Boolean).join(' · '),
      fotos: Array.isArray(tm.medidas_json) ? tm.medidas_json.filter((f: unknown) => typeof f === 'string' && f) : [],
    }))
    .filter((g: { fotos: string[] }) => g.fotos.length > 0);

interface Props {
  odp: any;
  sap?: any;
  tipoInicial: TipoVisor;
  /** Solo el instalador tiene el botón Det. SAP. */
  conDetSap?: boolean;
  /** Solo el instalador ve las fotos de la toma de medidas (2026-10-11). */
  conMedidas?: boolean;
  onClose: () => void;
}

const PESTANAS: { id: TipoVisor; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'op', label: 'ODP', icon: Printer },
  { id: 'tecnico', label: 'Ficha técnica', icon: FileText },
  { id: 'sap', label: 'SAP', icon: ShieldCheck },
  { id: 'det_sap', label: 'Det. SAP', icon: Images },
  { id: 'medidas', label: 'Medidas', icon: Camera },
];

const ZOOM_MIN = 1;
const ZOOM_MAX = 4;

/** La hoja a escala: el ancho natural del imprimible se ajusta al de la pantalla
 * (zoom 1 = "Ajustar") y se puede ampliar. Se escala con `transform` y se reserva
 * el tamaño ya escalado, así el desplazamiento cubre la hoja entera. */
const HojaEscalada: React.FC<{ zoom: number; children: React.ReactNode }> = ({ zoom, children }) => {
  const marco = useRef<HTMLDivElement>(null);
  const hoja = useRef<HTMLDivElement>(null);
  const [medidas, setMedidas] = useState({ marco: 0, ancho: 0, alto: 0 });

  useLayoutEffect(() => {
    const medir = () => setMedidas({
      marco: marco.current?.clientWidth ?? 0,
      ancho: hoja.current?.offsetWidth ?? 0,
      alto: hoja.current?.offsetHeight ?? 0,
    });
    medir();
    const obs = new ResizeObserver(medir);
    if (marco.current) obs.observe(marco.current);
    if (hoja.current) obs.observe(hoja.current);
    return () => obs.disconnect();
  }, []);

  const ajuste = medidas.ancho > 0 && medidas.marco > 0 ? Math.min(1, medidas.marco / medidas.ancho) : 1;
  const escala = ajuste * zoom;

  return (
    <div ref={marco} className="w-full">
      <div style={{ width: medidas.ancho * escala || undefined, height: medidas.alto * escala || undefined, position: 'relative' }}>
        <div
          ref={hoja}
          style={{ transform: `scale(${escala})`, transformOrigin: 'top left', position: 'absolute', top: 0, left: 0, width: 'max-content' }}
          className="bg-white"
        >
          {children}
        </div>
      </div>
    </div>
  );
};

/** Fotos en lista, agrupadas con un título opcional; tocar una la abre en grande. */
const ListaFotos: React.FC<{ grupos: { titulo?: string; fotos: string[] }[]; nombre: string }> = ({ grupos, nombre }) => {
  const [abierta, setAbierta] = useState<string | null>(null);
  return (
    <>
      <div className="space-y-4 p-3">
        {grupos.map((g, gi) => (
          <section key={`${g.titulo ?? ''}-${gi}`}>
            {g.titulo && <h3 className="mb-2 text-[12px] font-bold uppercase tracking-wider text-slate-700">{g.titulo}</h3>}
            <ul className="space-y-3">
              {g.fotos.map((url, i) => (
                <li key={`${url}-${i}`}>
                  <button type="button" onClick={() => setAbierta(url)} className="block w-full overflow-hidden rounded-xl border border-slate-200 bg-white">
                    <img src={url} alt={`${nombre}, foto ${i + 1}`} className="w-full h-auto" loading="lazy" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {abierta && (
        <div className="fixed inset-0 z-[70] bg-black/95 flex flex-col" role="dialog" aria-label="Foto en grande">
          <button type="button" onClick={() => setAbierta(null)} className="self-end m-3 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full bg-white/15 text-white" aria-label="Cerrar foto">
            <X className="w-6 h-6" />
          </button>
          {/* `touch-action` por defecto: el pellizco del navegador amplía la foto. */}
          <div className="flex-1 overflow-auto flex items-center justify-center p-2">
            <img src={abierta} alt={nombre} className="max-w-none w-full h-auto" />
          </div>
        </div>
      )}
    </>
  );
};

/** Fotos del Det. SAP de la ODP. */
const GaleriaDetSap: React.FC<{ odpId: number }> = ({ odpId }) => {
  const [imagenes, setImagenes] = useState<{ id?: number; url: string }[] | null>(null);

  useEffect(() => {
    let vivo = true;
    axios.get(`${API}/api/detalle-sap-imagenes?odp_id=${odpId}`)
      .then(r => { if (vivo) setImagenes(Array.isArray(r.data) ? r.data : []); })
      .catch(() => { if (vivo) setImagenes([]); });
    return () => { vivo = false; };
  }, [odpId]);

  if (imagenes === null) {
    return <p className="flex items-center justify-center gap-2 py-16 text-sm text-slate-700"><Loader2 className="w-4 h-4 animate-spin" /> Cargando fotos…</p>;
  }
  if (imagenes.length === 0) {
    return <p className="py-16 text-center text-sm text-slate-700">Esta ODP no tiene fotos de Det. SAP.</p>;
  }
  return <ListaFotos grupos={[{ fotos: imagenes.map(i => i.url) }]} nombre="Det. SAP" />;
};

const VisorDocumentos: React.FC<Props> = ({ odp, sap, tipoInicial, conDetSap = false, conMedidas = false, onClose }) => {
  const medidas = conMedidas ? fotosDeTomas(odp) : [];
  const disponibles = PESTANAS.filter(p => (
    p.id === 'sap' ? Boolean(sap)
      : p.id === 'det_sap' ? conDetSap
        : p.id === 'medidas' ? medidas.length > 0
          : true
  ));
  const [tipo, setTipo] = useState<TipoVisor>(disponibles.some(p => p.id === tipoInicial) ? tipoInicial : 'op');
  const [zoom, setZoom] = useState(1);

  // Sin desplazamiento de la página de fondo mientras el visor está abierto.
  useEffect(() => {
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = anterior; };
  }, []);

  const cambiarTipo = (t: TipoVisor) => { setTipo(t); setZoom(1); };
  const esHoja = tipo !== 'det_sap' && tipo !== 'medidas';

  return (
    <div className="fixed inset-0 z-[60] bg-slate-100 flex flex-col" role="dialog" aria-modal="true" aria-label={`Documentos de ${odp?.numero_odp ?? 'la ODP'}`}>
      <style>{ESTILOS_DOCUMENTO}</style>

      <header className="bg-white border-b border-slate-200 px-3 pt-2.5 pb-2 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">Documentos</p>
            <p className="text-base font-bold text-slate-900 truncate">{odp?.numero_odp}</p>
          </div>
          <button type="button" onClick={onClose} className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-900" aria-label="Cerrar documentos">
            <X className="w-5 h-5" />
          </button>
        </div>
        <nav className="mt-2 flex gap-1.5 overflow-x-auto" aria-label="Documento">
          {disponibles.map(p => {
            const activa = p.id === tipo;
            const Icono = p.icon;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => cambiarTipo(p.id)}
                aria-pressed={activa}
                className={`shrink-0 min-h-[40px] inline-flex items-center gap-1.5 px-3 rounded-xl text-xs font-semibold uppercase tracking-wide border
                  ${activa ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
              >
                <Icono className="w-4 h-4" /> {p.label}
              </button>
            );
          })}
        </nav>
      </header>

      <main className="flex-1 overflow-auto">
        {esHoja ? (
          <div className="p-2">
            <HojaEscalada key={tipo} zoom={zoom}>
              {tipo === 'op' && (odp?.tipo_odp === 'OA' ? <PrintableOA odp={odp} /> : <PrintableProduccion odp={odp} />)}
              {tipo === 'tecnico' && <PrintableDetalleTecnico odp={odp} />}
              {tipo === 'sap' && sap && <PrintableSAP odp={odp} sap={sap} />}
            </HojaEscalada>
          </div>
        ) : tipo === 'medidas' ? (
          <ListaFotos grupos={medidas} nombre="Toma de medidas" />
        ) : (
          <GaleriaDetSap odpId={odp.id} />
        )}
      </main>

      {esHoja && (
        <footer className="bg-white border-t border-slate-200 px-3 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] flex items-center justify-center gap-2">
          <button type="button" onClick={() => setZoom(z => Math.max(ZOOM_MIN, +(z - 0.5).toFixed(1)))} disabled={zoom <= ZOOM_MIN}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-900 disabled:opacity-40" aria-label="Alejar">
            <Minus className="w-5 h-5" />
          </button>
          <button type="button" onClick={() => setZoom(1)}
            className="min-h-[44px] px-4 rounded-xl border border-slate-300 bg-white text-xs font-semibold uppercase tracking-wide text-slate-900">
            Ajustar · {Math.round(zoom * 100)}%
          </button>
          <button type="button" onClick={() => setZoom(z => Math.min(ZOOM_MAX, +(z + 0.5).toFixed(1)))} disabled={zoom >= ZOOM_MAX}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-900 disabled:opacity-40" aria-label="Acercar">
            <Plus className="w-5 h-5" />
          </button>
        </footer>
      )}
    </div>
  );
};

export default VisorDocumentos;

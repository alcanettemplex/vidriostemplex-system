import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { AlertTriangle, Link2, Loader2 } from '../../../../components/ui/icons';

import API from '../../../../services/config';
import ODPForm from '../../../odp/components/ODPForm';
import SeleccionarTipoODPModal from '../../../odp/components/SeleccionarTipoODPModal';
import AprobarProspectoModal from '../../../prospectos/components/AprobarProspectoModal';
import { numeroCotizacion } from '../../format';
import { apiPreviaCrearOdp } from '../../services/cotizadorApi';
import { OrigenCotizacion, PreviaCrearODP } from '../../vinculo';
import { BotonPrimario, BotonSecundario, ModalShell } from '../ui';

// ─────────────────────────────────────────────────────────────────────────────
// "Crear ODP" desde una cotización APROBADA con el formulario COMPLETO
// (2026-10-28, decisión del usuario). Reemplaza al modal rápido de 2026-09-27,
// que creaba una ODP básica y dejaba fecha, dirección y vidrios para después.
//
//   1. Vista previa (GET, no escribe): por qué camino sale la ODP y la precarga.
//      Si no se puede, se dice por qué; si el lead o el prospecto ya tienen ODP,
//      se ofrece vincular la cotización a ella (como antes).
//   2. ODP u OA, con el mismo selector del módulo ODP.
//   3. El formulario que corresponde, ya lleno con la cotización:
//        prospecto → "Aprobar prospecto" (pasa sus tomas de medidas);
//        lead o cliente → "Nueva Orden de Producción", con «+ Crear cliente».
//      Los dos guardan por `POST /cotizaciones/:id/crear-odp`, que crea la ODP
//      por el flujo de su vínculo y la enlaza a la cotización con el candado.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
    cotizacionId: number;
    onCerrar: () => void;
    onCreada: (odp: { odpId: number; numeroOdp: string }) => void;
    /** La cotización ya tiene (o su lead/prospecto ya tiene) ODP: vincularla. */
    onVincularExistente: (odp: { id: number; numero: string }) => Promise<void>;
}

type Paso = 'revisando' | 'bloqueado' | 'tipo' | 'formulario';

const CrearODPDesdeCotizacion: React.FC<Props> = ({ cotizacionId, onCerrar, onCreada, onVincularExistente }) => {
    const [paso, setPaso] = useState<Paso>('revisando');
    const [previa, setPrevia] = useState<PreviaCrearODP | null>(null);
    const [prospecto, setProspecto] = useState<any | null>(null);
    const [tipoOdp, setTipoOdp] = useState<'ODP' | 'OA'>('ODP');
    const [error, setError] = useState<string | null>(null);
    const [vinculando, setVinculando] = useState(false);

    useEffect(() => {
        let vivo = true;
        (async () => {
            try {
                const { data } = await apiPreviaCrearOdp(cotizacionId);
                if (!vivo) return;
                setPrevia(data);
                if (!data.puede || !data.precarga) { setPaso('bloqueado'); return; }
                if (data.camino === 'prospecto' && data.prospecto) {
                    // El formulario de aprobar necesita el prospecto completo (tomas de medidas, cliente).
                    const { data: p } = await axios.get(`${API}/api/prospectos/${data.prospecto.id}`);
                    if (!vivo) return;
                    setProspecto(p);
                }
                setPaso('tipo');
            } catch (e: any) {
                if (!vivo) return;
                setError(e?.response?.data?.error || 'No se pudo preparar la ODP. Revisa tu conexión e inténtalo de nuevo.');
                setPaso('bloqueado');
            }
        })();
        return () => { vivo = false; };
    }, [cotizacionId]);

    const vincular = async () => {
        if (!previa?.odpExistente) return;
        setVinculando(true);
        try { await onVincularExistente(previa.odpExistente); } finally { setVinculando(false); }
    };

    if (paso === 'tipo') {
        return <SeleccionarTipoODPModal onCancel={onCerrar} onConfirm={(t) => { setTipoOdp(t); setPaso('formulario'); }} />;
    }

    if (paso === 'formulario' && previa?.precarga) {
        const origen: OrigenCotizacion = {
            cotizacionId,
            numero: previa.cotizacion.numero,
            plan: previa,
            precarga: previa.precarga,
        };
        const alCrear = (odp?: { id: number; numero: string }) => {
            if (odp) onCreada({ odpId: odp.id, numeroOdp: odp.numero });
            else onCerrar();
        };
        return prospecto ? (
            <AprobarProspectoModal prospecto={prospecto} tipoOdp={tipoOdp} desdeCotizacion={origen} onClose={onCerrar} onAprobado={alCrear} />
        ) : (
            <ODPForm tipoOdp={tipoOdp} desdeCotizacion={origen} onClose={onCerrar} onSuccess={alCrear} />
        );
    }

    // Revisando, o no se puede crear: aviso corto con la salida que haya.
    const yaVinculada = /ya está vinculada/.test(previa?.motivo ?? '');
    return (
        <ModalShell
            titulo="Crear ODP"
            subtitulo={previa ? `Desde la cotización ${numeroCotizacion(previa.cotizacion.numero)}` : undefined}
            anchoMaximo="max-w-xl"
            onClose={onCerrar}
            pie={
                <>
                    <BotonSecundario compacto onClick={onCerrar}>Cerrar</BotonSecundario>
                    {previa && !previa.puede && previa.odpExistente && !yaVinculada && (
                        <BotonPrimario compacto icono={Link2} cargando={vinculando} onClick={vincular}>
                            Vincular a {previa.odpExistente.numero}
                        </BotonPrimario>
                    )}
                </>
            }
        >
            <div className="px-6 py-5 text-[13px] text-slate-900">
                {paso === 'revisando' && (
                    <p className="flex items-center gap-2 text-slate-700"><Loader2 className="w-4 h-4 animate-spin" /> Revisando la cotización…</p>
                )}
                {paso === 'bloqueado' && (
                    <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-amber-900">
                        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> {error ?? previa?.motivo ?? 'No se puede crear la ODP de esta cotización.'}
                    </p>
                )}
            </div>
        </ModalShell>
    );
};

export default CrearODPDesdeCotizacion;

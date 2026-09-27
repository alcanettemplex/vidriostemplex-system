// Vínculo de la cotización con el ERP (2026-09-27): tipos y utilidades de
// pantalla. Espejo de `backend-api/src/cotizador/lib/vinculos.ts`.
//
// Toda cotización es "para" un lead, un prospecto, un cliente o una ODP. El
// contrato de enlaces que usan los demás módulos para abrir el Cotizador vive
// aquí (`enlaceCotizador`), para que nadie arme la URL a mano.

import type { MotivoPerdida, TipoVinculo } from './types';

export type { TipoVinculo };

export interface FichaVinculo {
    tipo: TipoVinculo;
    id: number;
    titulo: string;
    subtitulo: string;
    estado: string | null;
    nombre: string;
    telefono: string | null;
    direccion: string | null;
    clienteId: number | null;
    asesorId: number | null;
    odpId: number | null;
}

export interface ResultadosVinculo {
    leads: FichaVinculo[];
    prospectos: FichaVinculo[];
    clientes: FichaVinculo[];
    odps: FichaVinculo[];
}

export interface AsesorCotizador {
    id: number;
    nombre: string;
    rol: string;
}

export type CaminoODP = 'prospecto' | 'lead' | 'cliente';

export interface PlanCrearODP {
    puede: boolean;
    motivo: string | null;
    camino: CaminoODP | null;
    explicacion: string;
    cotizacion: { id: number; numero: number; total: number; etiqueta: string | null };
    asesor: { id: number | null; nombre: string };
    cliente: { id: number; nombre: string } | null;
    requiereCliente: boolean;
    permiteClienteNuevo: boolean;
    odpExistente: { id: number; numero: string } | null;
    prospecto: { id: number; numero: string } | null;
    lead: { id: number; nombre: string; estado: string } | null;
}

export type FormaPagoODP = 'contado' | 'credito' | '50_50';

/** Mismas opciones y rótulos que el formulario de ODP (`ODPForm`). */
export const FORMAS_PAGO_ODP: { valor: FormaPagoODP; rotulo: string }[] = [
    { valor: 'contado', rotulo: 'Pago anticipado' },
    { valor: 'credito', rotulo: 'Crédito' },
    { valor: '50_50', rotulo: '50% anticipo / 50% entrega' },
];

export const FUENTES_LEAD = [
    'Presencial', 'WhatsApp', 'Llamada', 'Web', 'Facebook', 'Instagram', 'Show Room', 'Referidos', 'Visita Asesor', 'Cliente',
] as const;
export type FuenteLead = (typeof FUENTES_LEAD)[number];

export const MOTIVOS_PERDIDA: { valor: MotivoPerdida; rotulo: string; detalle: string }[] = [
    { valor: 'PRECIO', rotulo: 'Precio', detalle: 'Le pareció caro o consiguió uno más barato.' },
    { valor: 'TIEMPO_ENTREGA', rotulo: 'Tiempo de entrega', detalle: 'Lo necesitaba antes de lo que podíamos.' },
    { valor: 'COMPETENCIA', rotulo: 'Competencia', detalle: 'Se fue con otra empresa.' },
    { valor: 'NO_RESPONDIO', rotulo: 'No respondió', detalle: 'Dejó de contestar.' },
    { valor: 'DESISTIO', rotulo: 'Desistió', detalle: 'Canceló o aplazó el proyecto.' },
    { valor: 'OTRO', rotulo: 'Otro', detalle: 'Escribe el motivo en el detalle.' },
];

export const ROTULO_TIPO: Record<TipoVinculo, string> = {
    lead: 'Lead',
    prospecto: 'Prospecto',
    cliente: 'Cliente',
    odp: 'ODP',
};

/** Estados del lead en que "¿Marcar también el lead como perdido?" tiene sentido. */
export const leadSePuedePerder = (estado: string | null | undefined) =>
    Boolean(estado) && estado !== 'APROBADO' && estado !== 'PERDIDO';

/**
 * Contrato de enlaces del Cotizador (lo usan CRM, Prospectos, ODP y el Dashboard):
 *   /cotizador?abrir=<cotizacionId>                   → abre esa cotización
 *   /cotizador?nuevo=1&vinculo=<tipo>:<id>            → cotización nueva ya vinculada
 */
export function enlaceCotizador(
    destino: { abrir: number } | { nuevo: { tipo: TipoVinculo; id: number } }
): string {
    if ('abrir' in destino) return `/cotizador?abrir=${destino.abrir}`;
    return `/cotizador?nuevo=1&vinculo=${destino.nuevo.tipo}:${destino.nuevo.id}`;
}

/** Lee `vinculo=<tipo>:<id>` de la URL. null si no es válido. */
export function leerVinculoDeUrl(valor: string | null): { tipo: TipoVinculo; id: number } | null {
    if (!valor) return null;
    const [tipo, idTxt] = valor.split(':');
    const id = Number(idTxt);
    if (!['lead', 'prospecto', 'cliente', 'odp'].includes(tipo) || !Number.isInteger(id) || id <= 0) return null;
    return { tipo: tipo as TipoVinculo, id };
}

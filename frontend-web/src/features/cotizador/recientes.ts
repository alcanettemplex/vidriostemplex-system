// Cotizaciones abiertas hace poco, para "Cambiar a otra cotización" en la barra
// de trabajo (2026-09-26, flujo de varios clientes a la vez).
//
// Vive en el navegador de cada asesor (`localStorage`) a propósito: es una
// comodidad personal —"las que yo tenía abiertas"—, no un dato del negocio. Si
// el almacenamiento no está disponible (ventana privada, bloqueado), la lista
// queda vacía y "Ver todas mis cotizaciones" sigue funcionando.

export interface CotizacionReciente {
    id: number;
    numero: number;
    cliente: string;
}

const CLAVE = 'cotizador.recientes.v1';
const MAXIMO = 5;

export function leerRecientes(): CotizacionReciente[] {
    try {
        const crudo = JSON.parse(localStorage.getItem(CLAVE) ?? '[]');
        return Array.isArray(crudo)
            ? crudo.filter((r): r is CotizacionReciente => Number.isInteger(r?.id) && Number.isInteger(r?.numero)).slice(0, MAXIMO)
            : [];
    } catch {
        return [];
    }
}

function escribir(lista: CotizacionReciente[]): CotizacionReciente[] {
    const recortada = lista.slice(0, MAXIMO);
    try {
        localStorage.setItem(CLAVE, JSON.stringify(recortada));
    } catch {
        /* sin almacenamiento: la lista dura lo que la pantalla */
    }
    return recortada;
}

/** La pone de primera (o actualiza su nombre si ya estaba). */
export function registrarReciente(r: CotizacionReciente): CotizacionReciente[] {
    return escribir([r, ...leerRecientes().filter(x => x.id !== r.id)]);
}

/** Para una cotización que ya no existe (se borró). */
export function quitarReciente(id: number): CotizacionReciente[] {
    return escribir(leerRecientes().filter(x => x.id !== id));
}

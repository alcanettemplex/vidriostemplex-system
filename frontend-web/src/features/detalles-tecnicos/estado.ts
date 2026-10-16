import { useCallback, useEffect, useRef, useState } from 'react';
import { clonarPieza, nuevoId, piezaConMedidas, plantillaPorId } from './modelo/plantillas';
import type { Pedido, Plano, Plantilla } from './modelo/tipos';
import { hoyBogotaISO } from '../../utils/fechas';

// Modo libre (solo admin, desde el menú): un pedido de práctica que vive en el navegador,
// para organizar planos sin ODP. El modo pedido (desde Gestión PV) guarda en la BD y usa
// `usePlanosPedido` (modoPedido/useDisenoPedido.ts) sobre el mismo `useHistorial`.
const CLAVE = 'erp-detalles-tecnicos-v1';
/** Versión del formato guardado. Lo anterior (sin envoltorio) se lee como versión 1. */
const VERSION_GUARDADO = 2;
/** Pasos de deshacer que se guardan. */
const MAX_HISTORIAL = 100;
/** Cambios con la misma clave dentro de este tiempo cuentan como un solo paso (p. ej. escribir un número). */
const VENTANA_FUSION_MS = 1500;
/** Espera antes de escribir en localStorage: arrastrar un herraje cambia el pedido en cada cuadro. */
const ESPERA_GUARDADO_MS = 400;

/** Datos que se piden al agregar un plano o cambiarle la plantilla. */
export interface DatosPlano {
  ancho: number;
  alto: number;
  cantidad: number;
  color: string;
  espesor: string;
}

export function planoDesde(pl: Plantilla, datos?: DatosPlano, letra?: string): Plano {
  return {
    id: nuevoId(),
    letra,
    plantillaId: pl.id,
    nombre: pl.nombre,
    cantidad: datos?.cantidad ?? 1,
    color: datos?.color ?? 'INC',
    espesor: datos?.espesor ?? pl.espesor ?? '8',
    selloEnCanto: pl.selloEnCanto ?? false,
    observaciones: '',
    pieza: datos ? piezaConMedidas(pl.pieza, datos.ancho, datos.alto) : clonarPieza(pl.pieza),
  };
}

/** Valores del pedido de ejemplo: el aviso previo a exportar los reconoce para no mandarlos. */
export const EJEMPLO = { numero: '5700', odp: '22318', cliente: 'CLIENTE DE EJEMPLO S.A.S' };

export function pedidoEjemplo(): Pedido {
  return {
    numero: EJEMPLO.numero,
    proveedor: 'VITELSA',
    fecha: hoyBogotaISO(),
    odp: EJEMPLO.odp,
    cliente: EJEMPLO.cliente,
    obra: '',
    asesor: 'AA',
    planos: ['bat-2840-boton', 'fijo-bat-2cha3530'].map((id) => planoDesde(plantillaPorId(id)!)),
  };
}

export function pedidoVacio(): Pedido {
  return { numero: '', proveedor: 'VITELSA', fecha: hoyBogotaISO(), odp: '', cliente: '', obra: '', asesor: '', planos: [] };
}

// ── Lectura defensiva de localStorage ────────────────────────────────────────
// Un JSON dañado o de otra versión dejaba la página en blanco (`pedido.planos.map` sobre
// undefined). Se valida la forma mínima que el editor necesita; si no cuadra, se guarda una
// copia del texto y se arranca vacío avisando.

const esNumero = (v: unknown) => typeof v === 'number';
const esPiezaValida = (p: any) =>
  p && esNumero(p.ancho) && esNumero(p.alto) && p.contorno && typeof p.contorno.tipo === 'string' &&
  p.esquinas && ['si', 'sd', 'id', 'ii'].every((k) => p.esquinas[k] && typeof p.esquinas[k].tipo === 'string') &&
  Array.isArray(p.operaciones);
const esPlanoValido = (pl: any) => pl && typeof pl.id === 'string' && typeof pl.nombre === 'string' && esPiezaValida(pl.pieza);
const esPedidoValido = (p: any): p is Pedido =>
  p && typeof p === 'object' && Array.isArray(p.planos) && p.planos.every(esPlanoValido) && typeof p.proveedor === 'string';

function normalizar(p: Pedido): Pedido {
  return {
    numero: String(p.numero ?? ''),
    proveedor: p.proveedor === 'TEMPLACOL' ? 'TEMPLACOL' : 'VITELSA',
    fecha: typeof p.fecha === 'string' && p.fecha ? p.fecha : hoyBogotaISO(),
    odp: String(p.odp ?? ''),
    cliente: String(p.cliente ?? ''),
    obra: String(p.obra ?? ''),
    asesor: String(p.asesor ?? ''),
    planos: p.planos.map((pl) => ({
      ...pl,
      cantidad: Number.isFinite(pl.cantidad) ? pl.cantidad : 1,
      color: String(pl.color ?? 'INC'),
      espesor: String(pl.espesor ?? '8'),
      selloEnCanto: !!pl.selloEnCanto,
      observaciones: String(pl.observaciones ?? ''),
    })),
  };
}

type ResultadoCarga = { pedido: Pedido; aviso?: string };

function cargar(): ResultadoCarga {
  let crudo: string | null = null;
  try {
    crudo = localStorage.getItem(CLAVE);
  } catch {
    return { pedido: pedidoVacio() };
  }
  if (!crudo) return { pedido: pedidoVacio() };
  try {
    const dato = JSON.parse(crudo);
    // v2: { version, pedido }. v1 (prototipo y primera versión del ERP): el pedido suelto.
    const pedido = dato && dato.version === VERSION_GUARDADO ? dato.pedido : dato;
    if (esPedidoValido(pedido)) return { pedido: normalizar(pedido) };
  } catch {
    /* JSON roto: se trata igual que un formato desconocido */
  }
  try {
    localStorage.setItem(`${CLAVE}:danado`, crudo);
  } catch {
    /* sin espacio: el aviso igual sale */
  }
  return {
    pedido: pedidoVacio(),
    aviso: 'El pedido guardado en este navegador estaba dañado y no se pudo abrir. Se empezó uno vacío (se guardó una copia del anterior).',
  };
}

const serializar = (p: Pedido) => JSON.stringify({ version: VERSION_GUARDADO, pedido: p });

// ── Deshacer / rehacer genérico ──────────────────────────────────────────────

interface Historial<T> {
  pasado: T[];
  presente: T;
  futuro: T[];
  ultimaClave?: string;
  ultimoCambio: number;
}

export interface HistorialApi<T> {
  presente: T;
  ultimoCambio: number;
  puedeDeshacer: boolean;
  puedeRehacer: boolean;
  cambiar: (fn: (p: T) => T, clave?: string) => void;
  deshacer: () => void;
  rehacer: () => void;
  reiniciarCon: (valor: T) => void;
}

/**
 * Historial con deshacer/rehacer. `cambiar` es el único punto de escritura; `clave` agrupa
 * cambios seguidos en un solo paso (escribir un número, un arrastre). Lo usan el modo libre
 * y el modo pedido.
 */
export function useHistorial<T>(inicial: () => T): HistorialApi<T> {
  const [h, setH] = useState<Historial<T>>(() => ({ pasado: [], presente: inicial(), futuro: [], ultimoCambio: 0 }));

  const cambiar = useCallback((fn: (p: T) => T, clave?: string) => {
    setH((prev) => {
      const nuevo = fn(prev.presente);
      if (nuevo === prev.presente) return prev;
      const ahora = Date.now();
      const mismoArrastre = !!clave && clave.startsWith('arrastre:') && clave === prev.ultimaClave;
      const fusionar = mismoArrastre || (!!clave && clave === prev.ultimaClave && ahora - prev.ultimoCambio < VENTANA_FUSION_MS);
      return {
        pasado: fusionar ? prev.pasado : [...prev.pasado, prev.presente].slice(-MAX_HISTORIAL),
        presente: nuevo,
        futuro: [],
        ultimaClave: clave,
        ultimoCambio: ahora,
      };
    });
  }, []);

  const deshacer = useCallback(() => {
    setH((prev) =>
      prev.pasado.length
        ? { pasado: prev.pasado.slice(0, -1), presente: prev.pasado[prev.pasado.length - 1], futuro: [prev.presente, ...prev.futuro], ultimoCambio: 0 }
        : prev,
    );
  }, []);

  const rehacer = useCallback(() => {
    setH((prev) => (prev.futuro.length ? { pasado: [...prev.pasado, prev.presente], presente: prev.futuro[0], futuro: prev.futuro.slice(1), ultimoCambio: 0 } : prev));
  }, []);

  /** Reemplaza el estado y borra el historial (cargar de otra pestaña o del servidor). */
  const reiniciarCon = useCallback((valor: T) => setH({ pasado: [], presente: valor, futuro: [], ultimoCambio: 0 }), []);

  return {
    presente: h.presente,
    ultimoCambio: h.ultimoCambio,
    puedeDeshacer: h.pasado.length > 0,
    puedeRehacer: h.futuro.length > 0,
    cambiar,
    deshacer,
    rehacer,
    reiniciarCon,
  };
}

// ── Operaciones sobre la lista de planos (compartidas por los dos modos) ─────

export function usePlanos<T extends { planos: Plano[] }>(hist: HistorialApi<T>) {
  const { cambiar } = hist;
  const planos = hist.presente.planos;
  const [seleccion, setSeleccion] = useState<string | null>(() => planos[0]?.id ?? null);

  const actualizarPlano = useCallback(
    (id: string, fn: (pl: Plano) => Plano, clave?: string) => {
      cambiar((p) => ({ ...p, planos: p.planos.map((pl) => (pl.id === id ? fn(pl) : pl)) }), clave);
    },
    [cambiar],
  );

  const agregarPlano = useCallback(
    (pl: Plantilla, datos: DatosPlano, letra?: string) => {
      const nuevo = planoDesde(pl, datos, letra);
      cambiar((p) => ({ ...p, planos: [...p.planos, nuevo] }));
      setSeleccion(nuevo.id);
    },
    [cambiar],
  );

  /** Cambia el dibujo por el de otra plantilla, llevándolo a las medidas indicadas. */
  const reemplazarPlantilla = useCallback(
    (id: string, pl: Plantilla, datos: DatosPlano) => {
      const pieza = piezaConMedidas(pl.pieza, datos.ancho, datos.alto);
      cambiar((p) => ({
        ...p,
        planos: p.planos.map((x) =>
          x.id === id
            ? { ...x, plantillaId: pl.id, nombre: pl.nombre, cantidad: datos.cantidad, color: datos.color, espesor: datos.espesor, selloEnCanto: pl.selloEnCanto ?? x.selloEnCanto, pieza }
            : x,
        ),
      }));
    },
    [cambiar],
  );

  const eliminarPlano = useCallback(
    (id: string) => {
      const restantes = planos.filter((x) => x.id !== id);
      cambiar((p) => ({ ...p, planos: p.planos.filter((x) => x.id !== id) }));
      setSeleccion((s) => (s === id ? (restantes[0]?.id ?? null) : s));
    },
    [planos, cambiar],
  );

  return { seleccion, setSeleccion, actualizarPlano, agregarPlano, reemplazarPlantilla, eliminarPlano };
}

// ── Modo libre ───────────────────────────────────────────────────────────────

export function usePedido() {
  const [carga] = useState(cargar);
  const hist = useHistorial<Pedido>(() => carga.pedido);
  const ops = usePlanos(hist);
  const pedido = hist.presente;
  const { cambiar, reiniciarCon } = hist;
  const { setSeleccion } = ops;
  /** Aviso para la página (pedido dañado, cambios de otra pestaña). */
  const [avisoEstado, setAvisoEstado] = useState<string | null>(carga.aviso ?? null);

  // Se comprueba una vez si el navegador deja guardar (modo privado, almacenamiento bloqueado…).
  const [puedeGuardar] = useState(() => {
    try {
      localStorage.setItem(CLAVE + ':prueba', '1');
      localStorage.removeItem(CLAVE + ':prueba');
      return true;
    } catch {
      return false;
    }
  });

  // Guardado con espera: un arrastre no escribe en cada cuadro. Lo último escrito se recuerda
  // para distinguir el eco propio de un cambio hecho en otra pestaña.
  const ultimoEscrito = useRef<string | null>(null);
  const pendiente = useRef<string | null>(null);
  const escribir = useCallback(() => {
    if (pendiente.current === null) return;
    try {
      localStorage.setItem(CLAVE, pendiente.current);
      ultimoEscrito.current = pendiente.current;
    } catch {
      /* sin espacio o bloqueado: el indicador ya avisa que no se guarda */
    }
    pendiente.current = null;
  }, []);

  useEffect(() => {
    pendiente.current = serializar(pedido);
    const t = setTimeout(escribir, ESPERA_GUARDADO_MS);
    return () => clearTimeout(t);
  }, [pedido, escribir]);

  // Al cerrar la pestaña o salir del módulo, lo pendiente se escribe ya.
  useEffect(() => {
    window.addEventListener('pagehide', escribir);
    return () => {
      window.removeEventListener('pagehide', escribir);
      escribir();
    };
  }, [escribir]);

  // Otra pestaña con el mismo pedido: antes se pisaban en silencio. Ahora esta pestaña toma
  // la versión más nueva y lo avisa.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== CLAVE || e.newValue === null || e.newValue === ultimoEscrito.current) return;
      try {
        const dato = JSON.parse(e.newValue);
        const otro = dato && dato.version === VERSION_GUARDADO ? dato.pedido : dato;
        if (!esPedidoValido(otro)) return;
        ultimoEscrito.current = e.newValue;
        pendiente.current = null;
        const p = normalizar(otro);
        reiniciarCon(p);
        setSeleccion((s) => (p.planos.some((x) => x.id === s) ? s : (p.planos[0]?.id ?? null)));
        setAvisoEstado('Este pedido se cambió en otra pestaña: se cargó esa versión. Trabaja en una sola pestaña para no perder cambios.');
      } catch {
        /* JSON ajeno: se ignora */
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [reiniciarCon, setSeleccion]);

  const actualizarPedido = useCallback((cambios: Partial<Pedido>) => cambiar((p) => ({ ...p, ...cambios }), `pedido:${Object.keys(cambios).join(',')}`), [cambiar]);

  const duplicarPlano = useCallback(
    (id: string) => {
      const i = pedido.planos.findIndex((x) => x.id === id);
      if (i < 0) return;
      const copia: Plano = { ...pedido.planos[i], id: nuevoId(), pieza: clonarPieza(pedido.planos[i].pieza) };
      cambiar((p) => {
        const j = p.planos.findIndex((x) => x.id === id);
        return { ...p, planos: [...p.planos.slice(0, j + 1), copia, ...p.planos.slice(j + 1)] };
      });
      setSeleccion(copia.id);
    },
    [pedido.planos, cambiar, setSeleccion],
  );

  const moverPlano = useCallback(
    (id: string, delta: number) => {
      cambiar((p) => {
        const i = p.planos.findIndex((x) => x.id === id);
        const j = i + delta;
        if (i < 0 || j < 0 || j >= p.planos.length) return p;
        const planos = [...p.planos];
        [planos[i], planos[j]] = [planos[j], planos[i]];
        return { ...p, planos };
      });
    },
    [cambiar],
  );

  /** Reemplaza el pedido (vacío o de ejemplo); se puede deshacer. */
  const empezar = useCallback(
    (tipo: 'vacio' | 'ejemplo') => {
      const p = tipo === 'vacio' ? pedidoVacio() : pedidoEjemplo();
      cambiar(() => p);
      setSeleccion(p.planos[0]?.id ?? null);
    },
    [cambiar, setSeleccion],
  );

  return {
    pedido,
    ...ops,
    puedeGuardar,
    avisoEstado,
    limpiarAvisoEstado: () => setAvisoEstado(null),
    /** Hora del último cambio (se guarda automáticamente al cambiar). */
    ultimoCambio: hist.ultimoCambio ? new Date(hist.ultimoCambio) : null,
    puedeDeshacer: hist.puedeDeshacer,
    puedeRehacer: hist.puedeRehacer,
    deshacer: hist.deshacer,
    rehacer: hist.rehacer,
    actualizarPedido,
    duplicarPlano,
    moverPlano,
    empezar,
  };
}

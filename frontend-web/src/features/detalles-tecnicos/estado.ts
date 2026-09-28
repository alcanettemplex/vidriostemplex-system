import { useCallback, useEffect, useState } from 'react';
import { clonarPieza, nuevoId, piezaConMedidas, plantillaPorId } from './modelo/plantillas';
import type { Pedido, Plano, Plantilla } from './modelo/tipos';

// Clave propia del ERP (2026-09-27): distinta de la del prototipo standalone.
// Mientras el módulo esté aislado, el pedido vive sólo en este navegador.
const CLAVE = 'erp-detalles-tecnicos-v1';
/** Pasos de deshacer que se guardan. */
const MAX_HISTORIAL = 100;
/** Cambios con la misma clave dentro de este tiempo cuentan como un solo paso (p. ej. escribir un número). */
const VENTANA_FUSION_MS = 1500;

const hoy = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Datos que se piden al agregar un plano o cambiarle la plantilla. */
export interface DatosPlano {
  ancho: number;
  alto: number;
  cantidad: number;
  color: string;
  espesor: string;
}

export function planoDesde(pl: Plantilla, datos?: DatosPlano): Plano {
  return {
    id: nuevoId(),
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

function pedidoEjemplo(): Pedido {
  return {
    numero: '5700',
    proveedor: 'VITELSA',
    fecha: hoy(),
    odp: '22318',
    cliente: 'CLIENTE DE EJEMPLO S.A.S',
    obra: '',
    asesor: 'AA',
    planos: ['bat-2840-boton', 'fijo-bat-2cha3530'].map((id) => planoDesde(plantillaPorId(id)!)),
  };
}

function cargar(): Pedido {
  try {
    const s = localStorage.getItem(CLAVE);
    if (s) return JSON.parse(s) as Pedido;
  } catch {
    /* sin almacenamiento: se arranca con el ejemplo */
  }
  return pedidoEjemplo();
}

interface Historial {
  pasado: Pedido[];
  presente: Pedido;
  futuro: Pedido[];
  ultimaClave?: string;
  ultimoCambio: number;
}

export function usePedido() {
  const [h, setH] = useState<Historial>(() => ({ pasado: [], presente: cargar(), futuro: [], ultimoCambio: 0 }));
  const pedido = h.presente;
  const [seleccion, setSeleccion] = useState<string | null>(() => pedido.planos[0]?.id ?? null);
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

  useEffect(() => {
    try {
      localStorage.setItem(CLAVE, JSON.stringify(pedido));
    } catch {
      /* sin espacio o bloqueado: el indicador ya avisa que no se guarda */
    }
  }, [pedido]);

  /**
   * Único punto de escritura. `clave` agrupa cambios seguidos en un solo paso de deshacer:
   * si llega la misma clave poco después (o es el mismo arrastre), no se crea un paso nuevo.
   */
  const cambiar = useCallback((fn: (p: Pedido) => Pedido, clave?: string) => {
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

  const actualizarPedido = useCallback((cambios: Partial<Pedido>) => cambiar((p) => ({ ...p, ...cambios }), `pedido:${Object.keys(cambios).join(',')}`), [cambiar]);

  const actualizarPlano = useCallback(
    (id: string, fn: (pl: Plano) => Plano, clave?: string) => {
      cambiar((p) => ({ ...p, planos: p.planos.map((pl) => (pl.id === id ? fn(pl) : pl)) }), clave);
    },
    [cambiar],
  );

  const agregarPlano = useCallback(
    (pl: Plantilla, datos: DatosPlano) => {
      const nuevo = planoDesde(pl, datos);
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
    [pedido.planos, cambiar],
  );

  const eliminarPlano = useCallback(
    (id: string) => {
      const restantes = pedido.planos.filter((x) => x.id !== id);
      cambiar((p) => ({ ...p, planos: p.planos.filter((x) => x.id !== id) }));
      setSeleccion((s) => (s === id ? (restantes[0]?.id ?? null) : s));
    },
    [pedido.planos, cambiar],
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

  const reiniciar = useCallback(() => {
    const p = pedidoEjemplo();
    cambiar(() => p);
    setSeleccion(p.planos[0]?.id ?? null);
  }, [cambiar]);

  return {
    pedido,
    seleccion,
    setSeleccion,
    puedeGuardar,
    /** Hora del último cambio (se guarda automáticamente al cambiar). */
    ultimoCambio: h.ultimoCambio ? new Date(h.ultimoCambio) : null,
    puedeDeshacer: h.pasado.length > 0,
    puedeRehacer: h.futuro.length > 0,
    deshacer,
    rehacer,
    actualizarPedido,
    actualizarPlano,
    agregarPlano,
    reemplazarPlantilla,
    duplicarPlano,
    eliminarPlano,
    moverPlano,
    reiniciar,
  };
}

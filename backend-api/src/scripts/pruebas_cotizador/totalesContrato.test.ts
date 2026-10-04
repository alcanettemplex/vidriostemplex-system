// Contrato de totales: pantalla vs backend (2026-10-03).
//
// El total en vivo del frontend (`calcularTotalesPrevistos`, en
// `frontend-web/src/features/cotizador/totalesContrato.ts`) es una RÉPLICA
// deliberada de `calcularTotalesPropuesta()` de `lib/cargos.ts`: mientras hay
// cambios sin guardar no existe en el servidor una propuesta a la que pedirle el
// número. Si las dos cuentas divergen, el asesor ve un total en pantalla y el
// cliente recibe otro en el PDF.
//
// Esta prueba importa el archivo REAL del frontend (no una copia) y compara las
// dos cuentas con los mismos datos. Por eso `totalesContrato.ts` no puede
// importar React ni nada fuera de `./types`, y por eso las pruebas quedaron
// fuera del `tsc` de producción (`exclude` de tsconfig.json): el contenedor del
// backend no trae `frontend-web/`.
//
// Pura: no toca Postgres (se pasa `ivaPct`, así `getParametros()` no se llama).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularTotalesPropuesta, type CargoParaTotales } from '../../cotizador/lib/cargos';
import {
  calcularTotalesPrevistos,
  cargosADTO,
  type EstadoCargos,
} from '../../../../frontend-web/src/features/cotizador/totalesContrato';
import type { LineaManoObra } from '../../../../frontend-web/src/features/cotizador/types';

const IVA = 0.19;

interface Caso {
  nombre: string;
  items: Array<{ subtotalConAiu: number; iva?: number; total?: number }>;
  manoObra?: Array<Pick<LineaManoObra, 'tipo' | 'cantidad' | 'valorUnitario'>>;
  cargos?: Partial<EstadoCargos>;
  descuentoPct?: number;
  legado?: boolean;
}

const sinCargos = (): EstadoCargos => ({
  andamio: { activo: false, dias: 1, valorUnitario: 0, aplicaIva: true },
  huacal: { activo: false, unidades: 1, valorUnitario: 0, aplicaIva: true },
  flete: { activo: false, valor: 0, origen: 'SUGERIDO', aplicaIva: true },
  otros: [],
});

const mo = (tipo: 'ENSAMBLE' | 'INSTALACION', cantidad: number, valorUnitario: number) => ({
  tipo,
  cantidad,
  valorUnitario,
});

const CASOS: Caso[] = [
  { nombre: 'un ítem, sin nada más', items: [{ subtotalConAiu: 465854.56 }] },
  { nombre: 'sin ítems', items: [] },
  {
    nombre: 'varios ítems con céntimos',
    items: [{ subtotalConAiu: 100000.333 }, { subtotalConAiu: 0.005 }, { subtotalConAiu: 289372.35 }],
  },
  {
    nombre: 'mano de obra de ensamble e instalación (ya con AIU)',
    items: [{ subtotalConAiu: 912908.32 }],
    manoObra: [mo('ENSAMBLE', 3, 62500), mo('INSTALACION', 3, 26041.67)],
  },
  {
    nombre: 'descuento 5 % sobre productos + mano de obra',
    items: [{ subtotalConAiu: 1000000 }],
    manoObra: [mo('ENSAMBLE', 1.37, 62500)],
    descuentoPct: 0.05,
  },
  {
    nombre: 'descuento que deja medio centavo en el borde',
    items: [{ subtotalConAiu: 333333.33 }],
    descuentoPct: 0.075,
  },
  {
    nombre: 'flete con IVA (fuera del AIU y del descuento)',
    items: [{ subtotalConAiu: 500000 }],
    descuentoPct: 0.1,
    cargos: { flete: { activo: true, valor: 65000, origen: 'SUGERIDO', aplicaIva: true } },
  },
  {
    nombre: 'andamio SIN IVA (proveedor que factura sin IVA)',
    items: [{ subtotalConAiu: 500000 }],
    cargos: { andamio: { activo: true, dias: 3, valorUnitario: 45000, aplicaIva: false } },
  },
  {
    nombre: 'huacal con cantidad fraccionaria',
    items: [{ subtotalConAiu: 120000 }],
    cargos: { huacal: { activo: true, unidades: 2.5, valorUnitario: 33333.33, aplicaIva: true } },
  },
  {
    nombre: 'IVA por línea: dos cargos que redondean distinto que su suma',
    items: [{ subtotalConAiu: 10 }],
    cargos: {
      otros: [
        { key: 'a', descripcion: 'Servicio A', valor: 0.05, aplicaIva: true },
        { key: 'b', descripcion: 'Servicio B', valor: 0.05, aplicaIva: true },
      ],
    },
  },
  {
    nombre: 'todo junto: mano de obra, descuento y los cuatro cargos',
    items: [{ subtotalConAiu: 1876543.21 }, { subtotalConAiu: 98765.43 }],
    manoObra: [mo('ENSAMBLE', 4.2, 62500), mo('INSTALACION', 2, 125000)],
    descuentoPct: 0.12,
    cargos: {
      andamio: { activo: true, dias: 2, valorUnitario: 50000, aplicaIva: false },
      huacal: { activo: true, unidades: 1, valorUnitario: 87000, aplicaIva: true },
      flete: { activo: true, valor: 65000, origen: 'MANUAL', aplicaIva: true },
      otros: [{ key: 'x', descripcion: 'Desmonte', valor: 150000, aplicaIva: true }],
    },
  },
  {
    nombre: 'descuento del 100 %',
    items: [{ subtotalConAiu: 250000 }],
    manoObra: [mo('INSTALACION', 1, 85000)],
    descuentoPct: 1,
    cargos: { flete: { activo: true, valor: 40000, origen: 'SUGERIDO', aplicaIva: true } },
  },
  {
    nombre: 'una línea "otros" vacía no se cobra',
    items: [{ subtotalConAiu: 1000 }],
    cargos: { otros: [{ key: 'v', descripcion: '   ', valor: 0, aplicaIva: true }] },
  },
  {
    nombre: 'propuesta LEGADA: suma pura, sin descuento ni cargos',
    items: [
      { subtotalConAiu: 419372.35, iva: 79680.75, total: 499053.1 },
      { subtotalConAiu: 100000, iva: 19000, total: 119000 },
    ],
    descuentoPct: 0.1,
    cargos: { flete: { activo: true, valor: 65000, origen: 'SUGERIDO', aplicaIva: true } },
    legado: true,
  },
];

for (const c of CASOS) {
  test(`contrato de totales — ${c.nombre}`, () => {
    const estado: EstadoCargos = { ...sinCargos(), ...(c.cargos ?? {}) };
    const manoObra = (c.manoObra ?? []).map(
      (l): LineaManoObra => ({ ...l, descripcion: '', unidad: 'M2', aplicaIva: true, origen: 'AUTOMATICO' })
    );

    const pantalla = calcularTotalesPrevistos({
      items: c.items,
      manoObra,
      cargos: estado,
      descuentoPct: c.descuentoPct ?? 0,
      ivaPct: IVA,
      legado: c.legado ?? false,
    });

    // El backend recibe lo mismo que guardaría el PUT: la mano de obra como
    // filas ENSAMBLE/INSTALACION y el resto con la MISMA traducción que usa la
    // pantalla para mandar los cargos (`cargosADTO`).
    const cargosBackend: CargoParaTotales[] = [
      ...manoObra.map((l) => ({ tipo: l.tipo, cantidad: l.cantidad, valorUnitario: l.valorUnitario, aplicaIva: true })),
      ...cargosADTO(estado).map((f) => ({
        tipo: f.tipo,
        cantidad: f.cantidad,
        valorUnitario: f.valorUnitario,
        aplicaIva: f.aplicaIva,
      })),
    ];
    const servidor = calcularTotalesPropuesta({
      items: c.items.map((it) => ({ resultado: it })),
      cargos: cargosBackend,
      descuentoPct: c.descuentoPct ?? 0,
      legadoCargosEnItems: c.legado ?? false,
      ivaPct: IVA,
    });

    assert.deepStrictEqual(
      {
        productos: pantalla.productos,
        manoObra: pantalla.manoObra,
        descuento: pantalla.descuento,
        cargos: pantalla.cargos,
        iva: pantalla.iva,
        total: pantalla.total,
      },
      {
        productos: servidor.totalProductos,
        manoObra: servidor.totalManoObra,
        descuento: servidor.totalDescuento,
        cargos: servidor.totalCargos,
        iva: servidor.totalIva,
        total: servidor.totalTotal,
      },
      'el total en pantalla no coincide con el que guarda el backend (y sale en el PDF)'
    );
  });
}

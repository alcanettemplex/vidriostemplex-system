// Alta de los 2 SKU de accesorio que le faltaban a Sistema7038-Interior
// (Chapa Overseas Doble Cilindro -> COG0101, Empaque monumental 6mm -> EMP1312).
// Mismo patrón que la sesión 2026-09-12 (GIN7038, ROD7038ABB, ROD7038NY):
// se crean vía el endpoint HTTP real POST /api/cotizador/precios (backend
// corriendo en local, puerto 3001) para ejercitar la transacción completa
// (CotizadorProducto + CotizadorPrecioHistorial) y la invalidación de caché
// del proceso ya corriendo -- no un INSERT directo.
//
// Costos reales de proveedor confirmados por el taller (2026-09-14):
//   COG0101 (Cerradura Overseas Gancho): $84.542, unidad
//   EMP1312 (Empaque 7038 Ref 6-8mm):    $988, metro lineal
//
// Multiplicador de categoría ACCESORIO verificado empíricamente contra 18+
// productos reales de cotizador_producto (incluidos GIN7038/ROD7038ABB, que
// reproduce exacto): PA x1.550628 / PM x1.440712 / PB x1.330796.
//
// Uso: npx ts-node backend-api/src/scripts/2026-09-14_alta_accesorios_7038_restantes.ts
// Requiere el backend corriendo en local (puerto 3001). No se ejecuta con npm run dev.
import 'dotenv/config';
import jwt from 'jsonwebtoken';

const MULT = { pa: 1.550628, pm: 1.440712, pb: 1.330796 };
const round2 = (n: number) => Math.round(n * 100) / 100;

const PRODUCTOS = [
  {
    codigo: 'COG0101',
    descripcion: 'CERRADURA OVERSEAS GANCHO',
    categoria: 'ACCESORIO',
    unidad: 'UND',
    costo_unitario: 84542,
  },
  {
    codigo: 'EMP1312',
    descripcion: 'EMPAQUE 7038 REF 6-8MM',
    categoria: 'ACCESORIO',
    unidad: 'X METRO',
    costo_unitario: 988,
  },
];

async function main() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('Falta JWT_SECRET en el entorno (backend-api/.env)');
  const token = jwt.sign({ id: 30, rol: 'root' }, secret, { expiresIn: '10m' });

  for (const p of PRODUCTOS) {
    const costo = p.costo_unitario;
    const body = {
      ...p,
      precio_pa: round2(costo * MULT.pa),
      precio_pm: round2(costo * MULT.pm),
      precio_pb: round2(costo * MULT.pb),
      por: 'sesion-2026-09-14-taller',
    };
    console.log(`Creando ${p.codigo}...`, body);
    const res = await fetch('http://localhost:3001/api/cotizador/precios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`HTTP ${res.status} creando ${p.codigo}: ${JSON.stringify(data)}`);
    console.log(`OK ${p.codigo}:`, JSON.stringify(data));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

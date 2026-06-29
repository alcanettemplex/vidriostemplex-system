const XLSX = require('xlsx');
const path = require('path');

const archivo = 'C:\\Users\\User\\Downloads\\INVENTARIO PERFILERIA ACTUAL 2026.xlsx';
const wb = XLSX.readFile(archivo);

console.log('Hojas disponibles:', wb.SheetNames);

const hoja = wb.Sheets['INV 30 MAYO 2026'];
if (!hoja) { console.error('Hoja no encontrada'); process.exit(1); }

const datos = XLSX.utils.sheet_to_json(hoja, { defval: null });
console.log(`Total filas: ${datos.length}`);
console.log('Columnas:', Object.keys(datos[0] || {}));
console.log('\nPrimeras 5 filas:');
datos.slice(0, 5).forEach((r, i) => console.log(i + 1, JSON.stringify(r)));
console.log('\nÚltimas 3 filas:');
datos.slice(-3).forEach((r, i) => console.log(datos.length - 2 + i, JSON.stringify(r)));

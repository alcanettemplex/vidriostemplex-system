const XLSX = require('xlsx');
const path = require('path');

const FILE = 'C:/Users/User/Downloads/Documentos/Hojas de Calculo/Películas.xlsx';

const wb = XLSX.readFile(FILE);
console.log('Hojas:', wb.SheetNames);

const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

console.log('\nTotal filas:', rows.length);
console.log('Columnas:', Object.keys(rows[0] || {}));
console.log('\nPrimeras 5 filas:');
rows.slice(0, 5).forEach((r, i) => console.log(i, r));

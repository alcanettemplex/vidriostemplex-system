import * as xlsx from 'xlsx';

const filePath = 'C:\\Users\\User\\Desktop\\AlcanetPro\\Aplicaciones\\vidrios-templex-system\\codigos de inventario por categoria.xlsx';
const workbook = xlsx.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];

const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
console.log('First 10 rows of Excel:');
for (let i = 0; i < Math.min(10, data.length); i++) {
  console.log(`Row ${i}:`, data[i]);
}

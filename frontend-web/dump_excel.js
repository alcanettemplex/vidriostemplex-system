const xlsx = require('xlsx');
const wb = xlsx.readFile('C:/Users/User/Desktop/vidrios-templex-system/Formatos/TALONARIOS ODP TEMPLEX.xlsx');
console.log(wb.SheetNames);
['ORDEN DE PRODUCCION', 'DETALLE TECNICO ODP', 'GARANTIA'].forEach(s => {
    const sheet = wb.Sheets[s];
    if (sheet) {
        console.log('\n--- ' + s + ' ---\n');
        console.log(JSON.stringify(xlsx.utils.sheet_to_json(sheet, {header: 1}).slice(0, 40), null, 2));
    }
});

const xlsx = require('xlsx');
const wb = xlsx.readFile('C:/Users/User/Desktop/vidrios-templex-system/Formatos/TALONARIOS ODP TEMPLEX.xlsx');

['ORDEN DE PRODUCCION', 'DETALLE TECNICO ODP'].forEach(s => {
    console.log('\n--- ' + s + ' ---\n');
    const sheet = wb.Sheets[s];
    if (sheet) {
        for (const cellAddress in sheet) {
            if (cellAddress[0] === '!') continue;
            const cell = sheet[cellAddress];
            if (cell && cell.v !== undefined && cell.v !== null && cell.v.toString().trim() !== '') {
                console.log(`${cellAddress}: ${cell.v}`);
            }
        }
    }
});

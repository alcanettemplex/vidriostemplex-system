import * as xlsx from 'xlsx';
import * as fs from 'fs';
import path from 'path';
import sequelize from '../config/database';
import CatalogoProducto from '../models/catalogo_producto.model';

async function run() {
  try {
    await sequelize.authenticate();
    const productosDb = (await CatalogoProducto.findAll({ raw: true })) as any[];
    const dbMap = new Map();
    for (const p of productosDb) {
      if (p.codigo) {
        dbMap.set(p.codigo.toUpperCase(), p);
      }
    }

    const filePath = 'C:\\Users\\User\\Desktop\\AlcanetPro\\Aplicaciones\\vidrios-templex-system\\codigos de inventario por categoria.xlsx';
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

    const reportLines: string[] = [];
    reportLines.push('# Análisis Comparativo de Inventario');
    reportLines.push('');
    reportLines.push('## Resumen');
    reportLines.push(`- **Productos en Base de Datos (CatalogoProducto):** ${productosDb.length}`);
    reportLines.push(`- **Filas analizadas en Excel (excluyendo encabezado):** ${data.length - 1}`);
    reportLines.push('');

    const missingInDb: any[] = [];
    const missingInExcel: any[] = [];
    const categoryMismatch: any[] = [];
    
    const excelCodes = new Set<string>();

    for (let i = 1; i < data.length; i++) {
      const row = data[i] as any[];
      if (!row || !row[1]) continue; // Skip empty rows or rows without description

      const categoriaExcel = row[0] ? String(row[0]).trim().toUpperCase() : 'SIN CATEGORIA';
      const colB = String(row[1]).trim();
      
      const firstSpaceIndex = colB.indexOf(' ');
      let codigoExcel = colB;
      let descExcel = '';
      if (firstSpaceIndex !== -1) {
        codigoExcel = colB.substring(0, firstSpaceIndex).trim().toUpperCase();
        descExcel = colB.substring(firstSpaceIndex + 1).trim();
      } else {
        codigoExcel = codigoExcel.toUpperCase();
      }

      excelCodes.add(codigoExcel);

      if (!dbMap.has(codigoExcel)) {
        missingInDb.push({ codigo: codigoExcel, categoria: categoriaExcel, desc: descExcel });
      } else {
        const pDb = dbMap.get(codigoExcel);
        const catDb = pDb.categoria ? pDb.categoria.toUpperCase().trim() : 'SIN CATEGORIA';
        if (catDb !== categoriaExcel) {
          categoryMismatch.push({ codigo: codigoExcel, catDb, catExcel: categoriaExcel, descDb: pDb.nombre });
        }
      }
    }

    for (const [code, p] of dbMap.entries()) {
      if (!excelCodes.has(code)) {
        missingInExcel.push(p);
      }
    }

    reportLines.push(`## Resultados`);
    reportLines.push(`- ❌ **Códigos en Excel que no están en la Base de Datos:** ${missingInDb.length}`);
    reportLines.push(`- ⚠️ **Códigos en ambos lados con discrepancia de categoría:** ${categoryMismatch.length}`);
    reportLines.push(`- ℹ️ **Códigos en Base de Datos que no están en el Excel:** ${missingInExcel.length}`);
    reportLines.push('');

    if (missingInDb.length > 0) {
      reportLines.push(`### Códigos Faltantes en Base de Datos (Muestra de primeros 50)`);
      reportLines.push('| Código | Categoría Excel | Descripción Excel |');
      reportLines.push('|---|---|---|');
      missingInDb.slice(0, 50).forEach(item => {
        reportLines.push(`| ${item.codigo} | ${item.categoria} | ${item.desc} |`);
      });
      reportLines.push('');
    }

    if (categoryMismatch.length > 0) {
      reportLines.push(`### Discrepancias de Categoría (Muestra de primeros 50)`);
      reportLines.push('| Código | Categoría BD | Categoría Excel | Descripción BD |');
      reportLines.push('|---|---|---|---|');
      categoryMismatch.slice(0, 50).forEach(item => {
        reportLines.push(`| ${item.codigo} | ${item.catDb} | ${item.catExcel} | ${item.descDb} |`);
      });
      reportLines.push('');
    }

    if (missingInExcel.length > 0) {
      reportLines.push(`### Códigos Faltantes en Excel (Muestra de primeros 50)`);
      reportLines.push('| Código | Categoría BD | Descripción BD |');
      reportLines.push('|---|---|---|');
      missingInExcel.slice(0, 50).forEach(item => {
        reportLines.push(`| ${item.codigo} | ${item.categoria || '-'} | ${item.nombre} |`);
      });
      reportLines.push('');
    }

    const artifactPath = 'C:\\Users\\User\\.gemini\\antigravity-ide\\brain\\91b2342a-3b24-415e-9ecc-502ecf792c0e\\analisis_inventario.md';
    fs.writeFileSync(artifactPath, reportLines.join('\n'));
    console.log(`Report generated at: ${artifactPath}`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await sequelize.close();
  }
}

run();

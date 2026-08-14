import * as xlsx from 'xlsx';
import * as fs from 'fs';
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

    const discrepancias: any[] = [];
    const correctos: any[] = [];

    for (let i = 1; i < data.length; i++) {
      const row = data[i] as any[];
      if (!row || !row[1]) continue;

      const categoriaExcel = row[0] ? String(row[0]).trim().toUpperCase() : 'SIN CATEGORIA';
      if (categoriaExcel !== 'PERFILERIA') continue;

      const colB = String(row[1]).trim();
      const firstSpaceIndex = colB.indexOf(' ');
      let codigoExcel = colB;
      if (firstSpaceIndex !== -1) {
        codigoExcel = colB.substring(0, firstSpaceIndex).trim().toUpperCase();
      } else {
        codigoExcel = codigoExcel.toUpperCase();
      }

      if (dbMap.has(codigoExcel)) {
        const pDb = dbMap.get(codigoExcel);
        if (pDb.es_aluminio === true || pDb.es_aluminio === 1) {
          correctos.push(pDb);
        } else {
          discrepancias.push(pDb);
        }
      }
    }

    const reportLines: string[] = [];
    reportLines.push('# Análisis de Perfilería vs es_aluminio');
    reportLines.push('');
    reportLines.push(`Se encontraron **${correctos.length + discrepancias.length}** códigos de PERFILERIA en el Excel que existen en la BD.`);
    reportLines.push(`- **Correctos (es_aluminio = TRUE):** ${correctos.length}`);
    reportLines.push(`- ⚠️ **Discrepancias (es_aluminio = FALSE y deberían ser TRUE):** ${discrepancias.length}`);
    reportLines.push('');

    if (discrepancias.length > 0) {
      reportLines.push(`### Códigos que deben actualizarse a es_aluminio = TRUE`);
      reportLines.push('| Código | Nombre BD | es_aluminio actual |');
      reportLines.push('|---|---|---|');
      discrepancias.forEach(item => {
        reportLines.push(`| ${item.codigo} | ${item.nombre} | ${item.es_aluminio} |`);
      });
      reportLines.push('');
    }

    const artifactPath = 'C:\\Users\\User\\.gemini\\antigravity-ide\\brain\\91b2342a-3b24-415e-9ecc-502ecf792c0e\\analisis_perfileria.md';
    fs.writeFileSync(artifactPath, reportLines.join('\n'));
    console.log(`Report generated at: ${artifactPath}`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await sequelize.close();
  }
}

run();

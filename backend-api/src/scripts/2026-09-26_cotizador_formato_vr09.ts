// Documento de cotización con el formato VR09 del negocio (decisión del
// usuario, 2026-09-26, sobre la imagen del formato impreso):
//
//   - Las 12 condiciones comerciales del formato, con la ortografía corregida y
//     "**NO asumimos**" en negrilla (el PDF interpreta `**…**`). Hasta ese día la
//     base tenía 11: faltaba la de desmontes y la primera tenía otra redacción.
//   - Garantía y validez de la oferta con la ortografía corregida.
//   - El logo actual del ERP (`frontend-web/public/assets/images/logotemplex.png`,
//     copiado en `datos_cotizador/logo-templex.png` porque el contenedor del
//     backend no trae el frontend). El que tenía la base era el antiguo.
//
// Pasa por `empresaStore.guardar`, el mismo camino que PUT /api/cotizador/empresa
// y la sección "Documento de cotización" de Configuración. Imprime los valores
// anteriores por si hay que revertir.
//
// Idempotente. NO se ejecuta con `npm run dev`. Correr a mano tras desplegar:
//   npx ts-node --files src/scripts/2026-09-26_cotizador_formato_vr09.ts
import * as fs from 'fs';
import * as path from 'path';
import { sequelize } from '../models';
import * as empresaStore from '../cotizador/store/empresaStore';

const CONDICIONES = [
  'Para iniciar el pedido se debe tener el anticipo; si el cliente desiste de continuar con la Orden de Compra, asumirá un 40% del valor total del pedido como cláusula por incumplimiento.',
  'Forma de pago: 50% de anticipo; se debe cancelar la totalidad para enviar el material y, a partir de allí, se programa la instalación. Consignación a la cuenta corriente BANCOLOMBIA número 32138791469, a nombre de Vidrios Templex S.A.S., identificada con NIT 900.192.869-0.',
  'Tiempo de entrega para programar la instalación: 10 días hábiles. Se cuentan como hábiles de lunes a viernes, siempre y cuando el soporte del anticipo se haya recibido antes de las 11:00 a. m.; de lo contrario, se empieza a contar desde el día siguiente.',
  'La cotización está sujeta a cambios después de verificar medidas, teniendo en cuenta las condiciones de instalación.',
  'Este precio no incluye trabajos en horarios especiales (nocturno, fines de semana y/o días festivos).',
  'Para la instalación, los vanos deben estar completamente terminados con acabados. No se realizan trabajos de obra civil (arreglo de baldosas o de drywall, entre otros). Los vanos deben estar completamente a plomo; Vidrios Templex S.A.S. no se hace responsable por luces o imperfectos en los vanos que afecten la parte estética y funcional del producto instalado.',
  'En caso de daños por perforación de tubos de agua o eléctricos al momento de realizar la instalación, estos serán casos fortuitos, ajenos a nuestra competencia, y debe repararlos una persona calificada para esta labor; el costo de la reparación lo asume la parte contratante.',
  'Si por necesidad de la obra se debe hacer un desmonte y por consiguiente se deriva un daño o la rotura de un vidrio o cualquier otro elemento, **NO asumimos** la responsabilidad por estos daños.',
  'La protección del contenido interno del inmueble durante los trabajos a realizar es responsabilidad de la parte contratante.',
  'La parte contratante debe proveer un espacio adecuado para el almacenamiento del material.',
  'Esta cotización no incluye el valor de pólizas de cumplimiento o de manejo de anticipo; en caso de ser requeridas, se incrementará el valor porcentualmente a cada ítem.',
  'Esta cotización no incluye el valor de desmontes y/o disposición final de elementos desmontados (vidrios y perfilería).',
];

const GARANTIA =
  'Seis (6) meses por instalación. Esta garantía no cobija fallas por uso inadecuado o en contra de su diseño y funcionalidad. No incluye ruptura accidental o espontánea de vidrios, ni fallas ocasionadas por vandalismo.';
const VALIDEZ = 'VALIDEZ DE LA OFERTA: 8 días hábiles.';

async function main() {
  const logo = fs.readFileSync(path.join(__dirname, 'datos_cotizador', 'logo-templex.png'));
  const logoDataUri = `data:image/png;base64,${logo.toString('base64')}`;

  const antes = await empresaStore.leer(false);
  console.log('ANTES (para revertir):', JSON.stringify({
    condicionesComerciales: antes?.condicionesComerciales,
    garantia: antes?.garantia,
    validezOfertaTexto: antes?.validezOfertaTexto,
  }, null, 1));

  await empresaStore.guardar(
    { condicionesComerciales: CONDICIONES, garantia: GARANTIA, validezOfertaTexto: VALIDEZ, logoDataUri },
    { por: 'script 2026-09-26_cotizador_formato_vr09' }
  );
  console.log(`Guardado: ${CONDICIONES.length} condiciones, garantía, validez y logo (${logo.length} bytes).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  // Los hooks de auditoría escriben sin await: dar un respiro antes de cerrar.
  .finally(() => setTimeout(() => sequelize.close(), 1500));

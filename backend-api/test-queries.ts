import {
  PedidoPV, NoConformidad, SAP, OrdenCompra, SalidaAlmacen, AuditoriaLog, AlertasUmbral,
  Vehiculo, RutaInstalacion, CatalogoProducto, InventarioPerfileria, MetaMensual, ConfiguracionGlobal
} from './src/models';
import sequelize from './src/config/database';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '.env') });

async function run() {
  const modelsToTest = [
    { name: 'PedidoPV', model: PedidoPV },
    { name: 'NoConformidad', model: NoConformidad },
    { name: 'SAP', model: SAP },
    { name: 'OrdenCompra', model: OrdenCompra },
    { name: 'SalidaAlmacen', model: SalidaAlmacen },
    { name: 'AuditoriaLog', model: AuditoriaLog },
    { name: 'AlertasUmbral', model: AlertasUmbral },
    { name: 'Vehiculo', model: Vehiculo },
    { name: 'RutaInstalacion', model: RutaInstalacion },
    { name: 'CatalogoProducto', model: CatalogoProducto },
    { name: 'InventarioPerfileria', model: InventarioPerfileria },
    { name: 'MetaMensual', model: MetaMensual },
    { name: 'ConfiguracionGlobal', model: ConfiguracionGlobal }
  ];

  for (const { name, model } of modelsToTest) {
    try {
      console.log(`Testing ${name}...`);
      await model.findAll({ limit: 1 });
      console.log(`${name} OK`);
    } catch (e: any) {
      console.error(`ERROR in ${name}:`, e?.parent?.message || e.message);
      // We don't exit to see ALL errors!
    }
  }
  process.exit(0);
}
run();

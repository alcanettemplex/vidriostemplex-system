import dotenv from 'dotenv';
dotenv.config();

import { 
    ODP, Cliente, Usuario, ODPItem, SAP, SAPItem, Cotizacion, TomaMedidas, 
    EvidenciaInstalacion, ProgramacionInstalacion, HistorialEstadoODP 
} from './src/models';

async function test() { 
    try { 
        console.log('Test connecting...');
        const odp = await ODP.findOne({ 
            include: [
                { model: Cliente, as: 'cliente' }, 
                { model: Usuario, as: 'asesor' }, 
                { model: ODPItem, as: 'items' }, 
                { model: SAP, as: 'saps', include: [{ model: SAPItem, as: 'items' }, { model: Usuario, as: 'asesor' }] }, 
                { model: Cotizacion, as: 'cotizaciones', include: [{ model: Usuario, as: 'asesor' }] }, 
                { model: TomaMedidas, as: 'tomas_medidas', include: [{ model: Usuario, as: 'realizador' }] }, 
                { model: EvidenciaInstalacion, as: 'evidencias', include: [{ model: Usuario, as: 'instalador' }] }, 
                { model: ProgramacionInstalacion, as: 'programaciones', include: [{ model: Usuario, as: 'instalador' }] }, 
                { model: HistorialEstadoODP, as: 'historial_estados', include: [{ model: Usuario, as: 'usuario' }] }
            ] 
        }); 
        console.log('Exito, ODP:', odp ? odp.toJSON().id : 'No hay ODP'); 
    } catch (err) { 
        console.error('Error in Sequelize includes:', err); 
    } 
    process.exit(0); 
}; 

test();

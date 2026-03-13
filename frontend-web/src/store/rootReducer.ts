import { combineReducers } from '@reduxjs/toolkit';
import authReducer from '../features/auth/authSlice';
import clientesReducer from '../features/clientes/clientesSlice';
import odpReducer from '../features/odp/odpSlice';
import produccionReducer from '../features/produccion/produccionSlice';
import instalacionesReducer from '../features/instalaciones/instalacionesSlice';
import evidenciasReducer from '../features/evidencias/evidenciasSlice';
import reportesReducer from '../features/reportes/reportesSlice';
import comprasReducer from '../features/compras/comprasSlice';
import contabilidadReducer from '../features/contabilidad/contabilidadSlice';
import usuariosReducer from '../features/usuarios/usuariosSlice';
import notificationsReducer from './notificationsSlice';

const rootReducer = combineReducers({
  auth: authReducer,
  clientes: clientesReducer,
  odp: odpReducer,
  produccion: produccionReducer,
  instalaciones: instalacionesReducer,
  evidencias: evidenciasReducer,
  reportes: reportesReducer,
  compras: comprasReducer,
  contabilidad: contabilidadReducer,
  usuarios: usuariosReducer,
  notifications: notificationsReducer,
});

export default rootReducer;

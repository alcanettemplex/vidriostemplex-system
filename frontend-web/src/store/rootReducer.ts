import { combineReducers } from '@reduxjs/toolkit';
import authReducer from '../features/auth/authSlice';
import comprasReducer from '../features/compras/comprasSlice';
import contabilidadReducer from '../features/contabilidad/contabilidadSlice';
import usuariosReducer from '../features/usuarios/usuariosSlice';
import notificationsReducer from './notificationsSlice';
import cotizacionesReducer from '../features/cotizaciones/cotizacionesSlice';
import crmReducer from '../features/crm/crmSlice';

const rootReducer = combineReducers({
  auth: authReducer,
  compras: comprasReducer,
  contabilidad: contabilidadReducer,
  usuarios: usuariosReducer,
  notifications: notificationsReducer,
  cotizaciones: cotizacionesReducer,
  crm: crmReducer,
});

export default rootReducer;

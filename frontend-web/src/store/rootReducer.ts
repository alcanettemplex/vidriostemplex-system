import { combineReducers } from '@reduxjs/toolkit';
import authReducer from '../features/auth/authSlice';
import contabilidadReducer from '../features/contabilidad/contabilidadSlice';
import usuariosReducer from '../features/usuarios/usuariosSlice';
import notificationsReducer from './notificationsSlice';
import cotizacionesReducer from '../features/cotizaciones/cotizacionesSlice';
import crmReducer from '../features/crm/crmSlice';
import odpReducer from '../features/odp/odpSlice';

const rootReducer = combineReducers({
  auth: authReducer,
  contabilidad: contabilidadReducer,
  usuarios: usuariosReducer,
  notifications: notificationsReducer,
  cotizaciones: cotizacionesReducer,
  crm: crmReducer,
  odp: odpReducer,
});

export default rootReducer;

import React from 'react';
import { ThemeProvider } from '@mui/material/styles';
import { Provider } from 'react-redux';
import { Toaster } from 'sileo';
import 'sileo/styles.css';
import store from '../store/store';
import theme from '../theme/theme';
import AppRoutes from '../routes/AppRoutes';
import { useSocketNotifications } from '../store/useSocketNotifications';
import { instalarInterceptores } from '../services/httpInterceptors';
import { configurarNotificaciones } from '../services/configurarNotificaciones';

instalarInterceptores();
configurarNotificaciones();

const AppRoot: React.FC = () => {
  useSocketNotifications();
  return (
    <ThemeProvider theme={theme}>
      <AppRoutes />
      {/* Los avisos los pinta Sileo; las llamadas siguen siendo `toast.*` y las
          traduce configurarNotificaciones(). La duración va por tipo desde ahí. */}
      <Toaster position="top-center" />
    </ThemeProvider>
  );
};

const App: React.FC = () => {
  return (
    <Provider store={store}>
      <AppRoot />
    </Provider>
  );
};

export default App;

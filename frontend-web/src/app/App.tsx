import React from 'react';
import { ThemeProvider } from '@mui/material/styles';
import { Provider } from 'react-redux';
import { Toaster } from 'sileo';
import 'sileo/styles.css';
import '../styles/avisos.css'; // después del CSS de Sileo: ajusta el contraste del texto
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
          traduce configurarNotificaciones(). La duración va por tipo desde ahí.

          `theme` describe el tema de la APLICACIÓN, no el del aviso: la isla se
          pinta en contraste (light -> #1a1a1a, dark -> #f2f2f2). Va fijo en
          "light" porque el ERP es claro siempre; sin este valor Sileo lo deduce
          del `prefers-color-scheme` del sistema y a quien tenga Windows en modo
          oscuro le salían islas blancas sobre una interfaz clara. */}
      <Toaster position="top-center" theme="light" />
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

import React from 'react';
import { ThemeProvider } from '@mui/material/styles';
import { Provider } from 'react-redux';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import store from '../store/store';
import theme from '../theme/theme';
import AppRoutes from '../routes/AppRoutes';
import { useSocketNotifications } from '../store/useSocketNotifications';

const AppRoot: React.FC = () => {
  useSocketNotifications();
  return (
    <ThemeProvider theme={theme}>
      <AppRoutes />
      <ToastContainer position="top-right" autoClose={3000} />
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

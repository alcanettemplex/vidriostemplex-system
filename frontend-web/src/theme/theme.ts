import { createTheme } from '@mui/material/styles';

/*
 * Tema MUI alineado con el sistema visual "Cristal y Aluminio" (2026-09-25).
 * Los valores son los mismos de tailwind.config.js — azul Templex como primario,
 * escala "aluminio" para neutros — para que los módulos escritos con MUI
 * (Pedidos PV, modales del dashboard) no se vean de otro producto.
 * Ver design/sistema-visual/README.md.
 */
const FUENTE = "'Geist Variable', ui-sans-serif, system-ui, 'Segoe UI', Roboto, Arial, sans-serif";

const aluminio = {
  50: '#f6f7f9',
  100: '#eef0f4',
  200: '#e1e5eb',
  300: '#c7cdd7',
  400: '#6f7a8c',
  500: '#555f71',
  600: '#3f4858',
  700: '#2f3746',
  800: '#1d232e',
  900: '#111620',
};

const theme = createTheme({
  palette: {
    primary: {
      main: '#1f5ad6',
      light: '#3474f2',
      dark: '#1a47ad',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#2f3746',
    },
    success: { main: '#059669' },
    warning: { main: '#d97706' },
    error: { main: '#dc2626' },
    text: {
      primary: aluminio[900],
      // Regla tipográfica del usuario (2026-09-25): el texto secundario también es
      // oscuro; la jerarquía la da el peso (negrita en títulos), no el gris.
      secondary: aluminio[700],
      disabled: aluminio[400],
    },
    divider: aluminio[200],
    background: {
      default: aluminio[50],
      paper: '#ffffff',
    },
    grey: aluminio,
  },
  typography: {
    fontFamily: FUENTE,
    h4: { fontWeight: 700, letterSpacing: '-0.02em' },
    h5: { fontWeight: 700, letterSpacing: '-0.018em' },
    h6: { fontWeight: 650, letterSpacing: '-0.012em' },
    subtitle1: { fontWeight: 600 },
    subtitle2: { fontWeight: 600 },
    button: { fontWeight: 600, textTransform: 'none', letterSpacing: 0 },
    caption: { fontSize: '0.75rem' },
  },
  shape: {
    borderRadius: 10,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: { body: { fontVariantNumeric: 'tabular-nums' } },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 10, paddingInline: 16 },
        sizeSmall: { paddingInline: 12 },
      },
    },
    MuiPaper: {
      styleOverrides: {
        rounded: { borderRadius: 14 },
        elevation1: {
          boxShadow: '0 1px 2px rgba(17,22,32,0.05), 0 1px 3px rgba(17,22,32,0.04)',
          border: `1px solid ${aluminio[200]}`,
        },
      },
    },
    MuiCard: {
      defaultProps: { elevation: 1 },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 18,
          boxShadow: '0 4px 8px -2px rgba(17,22,32,0.08), 0 24px 48px -12px rgba(17,22,32,0.22)',
        },
      },
    },
    MuiDialogTitle: {
      styleOverrides: { root: { fontWeight: 700, letterSpacing: '-0.015em' } },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { borderBottomColor: aluminio[100] },
        head: {
          fontSize: '0.75rem',
          fontWeight: 600,
          color: aluminio[900],
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          backgroundColor: aluminio[50],
          borderBottomColor: aluminio[200],
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 600, borderRadius: 8 },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          backgroundColor: '#ffffff',
          '& .MuiOutlinedInput-notchedOutline': { borderColor: aluminio[300] },
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: aluminio[400] },
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: { textTransform: 'none', fontWeight: 600, minHeight: 44 },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: aluminio[900],
          fontSize: '0.75rem',
          fontWeight: 500,
          borderRadius: 8,
          padding: '6px 10px',
        },
      },
    },
  },
});

export default theme;

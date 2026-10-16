// Detalles técnicos — editor de planos de vidrio templado (FOR-005) para VITELSA / TEMPLACOL.
// Dos modos (2026-10-16, ver docs/modulos/detalles-tecnicos.md):
//  - /detalles-tecnicos/:pedidoId — MODO PEDIDO, desde «Diseñar» en Gestión PV: datos del
//    Pedido PV y su ODP, un plano por letra DT, guardado en la BD.
//  - /detalles-tecnicos — MODO LIBRE, solo admin desde el menú: un pedido de práctica que vive
//    en este navegador, para organizar planos sin ODP.
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  Alert,
  AppBar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  IconButton,
  ListItemIcon,
  Menu,
  MenuItem,
  Snackbar,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material';
import { EJEMPLO, usePedido, type DatosPlano } from './estado';
import { letraPlano, medidasCaja } from './modelo/geometria';
import { validarPlano } from './modelo/validaciones';
import type { Plantilla } from './modelo/tipos';
import { useAtajos } from './useAtajos';
import { PanelPedido } from './components/PanelPedido';
import { HojaDetalle, ESTILOS_HOJA_IMPRESA, type EncabezadoHoja } from './components/HojaDetalle';
import { EditorPlano } from './components/EditorPlano';
import { Galeria } from './components/Galeria';
import { DialogoMedidas } from './components/DialogoMedidas';
import DisenoPedidoPage from './modoPedido/DisenoPedidoPage';
import { abrirVentanaImpresion } from '../../utils/printWindow';
import type { RootState } from '../../store/store';
import { FileSpreadsheet as TableChartIcon, Printer as PrintIcon, RefreshCw as RestartAltIcon, Undo2 as UndoIcon, Redo2 as RedoIcon, MoreVertical as MoreVertIcon, Cloud as CloudDoneOutlinedIcon, FileText as EjemploIcon } from '../../components/ui/icons';

/** Hoja carta para la ventana de impresión (reemplaza el @media print del prototipo). */
const ESTILOS_IMPRESION = `@page { size: letter portrait; margin: 8mm; } body { margin: 0; background: #fff; } ${ESTILOS_HOJA_IMPRESA}`;

export default function DetallesTecnicosPage() {
  const { pedidoId } = useParams();
  const user = useSelector((s: RootState) => s.auth.user);
  if (pedidoId) {
    const id = Number(pedidoId);
    if (!Number.isInteger(id) || id <= 0) {
      return <Box sx={{ p: 4 }}><Alert severity="error">El enlace no corresponde a un pedido PV.</Alert></Box>;
    }
    // La ruta admite los roles de Pedidos PV; diseñar exige además admin o `puede_gestionar_pv`.
    // Los demás pueden abrir en solo lectura: el backend responde `puede_editar: false`.
    return <DisenoPedidoPage key={id} pedidoId={id} />;
  }
  // El modo libre es solo admin (root entra por el bypass general). Aquí se repite el control
  // porque la ruta con :pedidoId comparte componente y admite más roles.
  if (user?.rol !== 'admin' && user?.rol !== 'root') {
    return <Box sx={{ p: 4 }}><Alert severity="info">Los detalles técnicos se abren desde Pedidos PV, con la acción «Diseñar» de cada pedido.</Alert></Box>;
  }
  return <ModoLibre />;
}

function ModoLibre() {
  const st = usePedido();
  const { pedido } = st;
  const [galeria, setGaleria] = useState<'agregar' | 'cambiar' | null>(null);
  const [elegida, setElegida] = useState<{ plantilla: Plantilla; modo: 'agregar' | 'cambiar' } | null>(null);
  const [resaltarId, setResaltarId] = useState<string | null>(null);
  const [seleccionOp, setSeleccionOp] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);
  const [aviso, setAviso] = useState<{ texto: string; deshacer?: boolean } | null>(null);
  const [confirmarEmpezar, setConfirmarEmpezar] = useState<'vacio' | 'ejemplo' | null>(null);
  const [problemasExportar, setProblemasExportar] = useState<string[] | null>(null);
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const [menuImprimir, setMenuImprimir] = useState<HTMLElement | null>(null);

  // Si el plano seleccionado ya no existe (p. ej. tras deshacer), se muestra el primero.
  const idxSel = pedido.planos.findIndex((p) => p.id === st.seleccion);
  const idx = idxSel >= 0 ? idxSel : pedido.planos.length ? 0 : -1;
  const plano = idx >= 0 ? pedido.planos[idx] : null;
  const conErrores = pedido.planos.filter((p) => validarPlano(p).some((o) => o.nivel === 'error')).length;
  const seleccionValida = plano && seleccionOp && plano.pieza.operaciones.some((o) => o.id === seleccionOp) ? seleccionOp : null;

  const encabezado: EncabezadoHoja = {
    numero: pedido.numero,
    fecha: pedido.fecha,
    proveedor: pedido.proveedor,
    odp: pedido.odp,
    obra: pedido.obra || pedido.cliente,
    asesor: pedido.asesor,
  };
  const filasDe = (p: NonNullable<typeof plano>) => [{ cantidad: p.cantidad, color: p.color, espesor: p.espesor, ...medidasCaja(p.pieza) }];

  const seleccionarPlano = (id: string) => {
    st.setSeleccion(id);
    setSeleccionOp(null);
  };

  const eliminarOps = (ids: string[], descripcion: string) => {
    if (!plano) return;
    st.actualizarPlano(plano.id, (pl) => ({ ...pl, pieza: { ...pl.pieza, operaciones: pl.pieza.operaciones.filter((o) => !ids.includes(o.id)) } }));
    setSeleccionOp(null);
    setAviso({ texto: descripcion, deshacer: true });
  };

  useAtajos({
    plano,
    seleccionId: seleccionValida,
    editable: true,
    deshacer: st.deshacer,
    rehacer: st.rehacer,
    cambiarPieza: (fn, clave) => plano && st.actualizarPlano(plano.id, (pl) => ({ ...pl, pieza: fn(pl.pieza) }), clave),
    eliminar: eliminarOps,
    limpiarSeleccion: () => setSeleccionOp(null),
  });

  /** Lo que conviene revisar antes de exportar: encabezado vacío o de ejemplo, planos con errores. */
  const revisarAntesDeExportar = (): string[] => {
    const p: string[] = [];
    if (!pedido.numero.trim()) p.push('Falta el número de pedido.');
    if (!pedido.odp.trim()) p.push('Falta la ODP.');
    if (pedido.numero === EJEMPLO.numero || pedido.odp === EJEMPLO.odp || pedido.cliente === EJEMPLO.cliente) {
      p.push('El encabezado tiene datos del pedido de ejemplo (número, ODP o cliente).');
    }
    if (conErrores) p.push(`${conErrores} plano(s) tienen errores.`);
    return p;
  };

  const exportar = async () => {
    setProblemasExportar(null);
    setExportando(true);
    try {
      // ExcelJS pesa ~1 MB: se carga sólo cuando se exporta.
      const { exportarExcel } = await import('./exportar/excel');
      await exportarExcel(pedido);
      setAviso({ texto: `Excel descargado: ${pedido.planos.length} plano(s) y la hoja RESUMEN.` });
    } catch (e) {
      console.error(e);
      setAviso({ texto: 'No se pudo generar el Excel. Intenta de nuevo.' });
    } finally {
      setExportando(false);
    }
  };
  const pedirExportar = () => {
    const p = revisarAntesDeExportar();
    if (p.length) setProblemasExportar(p);
    else exportar();
  };

  // Dentro del ERP `window.print()` imprimiría también el menú y la barra: se usa
  // la ventana de impresión común (regla del CLAUDE.md, utils/printWindow.ts).
  const imprimir = (todos: boolean) => {
    setMenuImprimir(null);
    const lista = todos ? pedido.planos.map((p, i) => ({ p, i })) : plano ? [{ p: plano, i: idx }] : [];
    if (!lista.length) return;
    // Las hojas se arman sin edición, en un contenedor fuera del DOM visible.
    import('react-dom/server').then(({ renderToStaticMarkup }) => {
      const html = renderToStaticMarkup(
        <>
          {lista.map(({ p, i }) => <HojaDetalle key={p.id} encabezado={encabezado} plano={p} letra={letraPlano(i)} filas={filasDe(p)} />)}
        </>,
      );
      abrirVentanaImpresion({
        titulo: `Detalle técnico ${pedido.proveedor} ${pedido.numero}${todos ? '' : ` · Plano ${letraPlano(idx)}`}`,
        contenidoHtml: html,
        estilos: ESTILOS_IMPRESION,
      });
    });
  };

  /** Valores con los que arranca el diálogo de medidas. */
  const datosIniciales = (pl: Plantilla, modo: 'agregar' | 'cambiar'): DatosPlano => {
    if (modo === 'cambiar' && plano) return { ancho: plano.pieza.ancho, alto: plano.pieza.alto, cantidad: plano.cantidad, color: plano.color, espesor: plano.espesor };
    // Al agregar, color y espesor se toman del último plano: casi siempre todo el pedido es igual.
    const ultimo = pedido.planos[pedido.planos.length - 1];
    return { ancho: pl.pieza.ancho, alto: pl.pieza.alto, cantidad: 1, color: ultimo?.color ?? 'INC', espesor: ultimo?.espesor ?? pl.espesor ?? '8' };
  };

  return (
    <Box sx={{ height: 'calc(100dvh - 64px)', display: 'flex', flexDirection: 'column', bgcolor: 'grey.100' }}>
      <AppBar position="static" elevation={0} color="inherit" sx={{ borderBottom: 1, borderColor: 'divider' }} className="no-imprimir">
        <Toolbar variant="dense" sx={{ gap: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, fontSize: 17 }}>
            Detalles técnicos
          </Typography>
          <Tooltip title="Para diseñar los planos de un pedido real, usa «Diseñar» en Pedidos PV → Gestión PV.">
            <Chip size="small" label="Modo libre · sin ODP · en este navegador" variant="outlined" />
          </Tooltip>
          <Typography variant="body2" color="text.secondary" sx={{ ml: 1, display: { xs: 'none', md: 'block' } }}>
            {pedido.proveedor} #{pedido.numero || '—'}
          </Typography>
          {st.puedeGuardar ? (
            <Tooltip title={st.ultimoCambio ? `Último cambio guardado a las ${st.ultimoCambio.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' })}` : 'Los cambios se guardan solos en este navegador'}>
              <Chip size="small" icon={<CloudDoneOutlinedIcon size={18} />} label="Guardado" variant="outlined" color="success" sx={{ display: { xs: 'none', md: 'flex' } }} />
            </Tooltip>
          ) : (
            <Tooltip title="Este navegador no permite guardar (¿ventana privada?). Exporta el Excel antes de cerrar.">
              <Chip size="small" label="Sin guardar" color="warning" variant="outlined" />
            </Tooltip>
          )}
          <Box sx={{ flex: 1 }} />
          <Tooltip title="Deshacer (Ctrl+Z)">
            <span>
              <IconButton size="small" onClick={st.deshacer} disabled={!st.puedeDeshacer} aria-label="Deshacer">
                <UndoIcon size={18} />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Rehacer (Ctrl+Y)">
            <span>
              <IconButton size="small" onClick={st.rehacer} disabled={!st.puedeRehacer} aria-label="Rehacer">
                <RedoIcon size={18} />
              </IconButton>
            </span>
          </Tooltip>
          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
          <Button size="small" variant="outlined" startIcon={<PrintIcon size={18} />} onClick={(e) => setMenuImprimir(e.currentTarget)} disabled={!plano}>
            Imprimir
          </Button>
          <Menu anchorEl={menuImprimir} open={!!menuImprimir} onClose={() => setMenuImprimir(null)}>
            <MenuItem onClick={() => imprimir(false)}>Plano {idx >= 0 ? letraPlano(idx) : ''}</MenuItem>
            <MenuItem onClick={() => imprimir(true)}>Todos los planos ({pedido.planos.length})</MenuItem>
          </Menu>
          <Button
            size="small"
            variant="contained"
            startIcon={exportando ? <CircularProgress size={16} color="inherit" /> : <TableChartIcon size={18} />}
            onClick={pedirExportar}
            disabled={exportando || pedido.planos.length === 0}
          >
            Exportar Excel
          </Button>
          <IconButton size="small" onClick={(e) => setMenu(e.currentTarget)} aria-label="Más opciones">
            <MoreVertIcon size={18} />
          </IconButton>
          <Menu anchorEl={menu} open={!!menu} onClose={() => setMenu(null)}>
            <MenuItem onClick={() => { setMenu(null); setConfirmarEmpezar('vacio'); }}>
              <ListItemIcon>
                <RestartAltIcon size={18} />
              </ListItemIcon>
              Empezar un pedido vacío
            </MenuItem>
            <MenuItem onClick={() => { setMenu(null); setConfirmarEmpezar('ejemplo'); }}>
              <ListItemIcon>
                <EjemploIcon size={18} />
              </ListItemIcon>
              Cargar el pedido de ejemplo
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: '300px minmax(0, 1fr) 460px' },
          overflow: { xs: 'auto', lg: 'hidden' },
        }}
      >
        <Box className="no-imprimir" sx={{ bgcolor: 'background.paper', borderRight: 1, borderColor: 'divider', p: 2, overflow: 'hidden', minHeight: { xs: 420, lg: 0 } }}>
          <PanelPedido
            pedido={pedido}
            seleccion={plano?.id ?? null}
            onSeleccionar={seleccionarPlano}
            onCambiarPedido={st.actualizarPedido}
            onAgregar={() => setGaleria('agregar')}
            onDuplicar={st.duplicarPlano}
            onEliminar={(id) => {
              const i = pedido.planos.findIndex((p) => p.id === id);
              st.eliminarPlano(id);
              setAviso({ texto: `Plano ${letraPlano(i)} eliminado`, deshacer: true });
            }}
            onMover={st.moverPlano}
          />
        </Box>

        <Box className="zona-hoja" sx={{ overflow: 'auto', p: { xs: 1.5, md: 3 } }}>
          {plano ? (
            <HojaDetalle
              encabezado={encabezado}
              plano={plano}
              letra={letraPlano(idx)}
              filas={filasDe(plano)}
              resaltarId={resaltarId}
              edicion={{
                seleccionId: seleccionValida,
                onSeleccionar: setSeleccionOp,
                onCambiarPieza: (fn, clave) => st.actualizarPlano(plano.id, (pl) => ({ ...pl, pieza: fn(pl.pieza) }), clave),
              }}
            />
          ) : (
            <Box sx={{ textAlign: 'center', mt: 12, color: 'text.secondary' }}>
              <Typography variant="h6">Este pedido todavía no tiene planos</Typography>
              <Typography sx={{ mb: 2 }}>Elige una plantilla para empezar.</Typography>
              <Button variant="contained" onClick={() => setGaleria('agregar')}>
                Agregar plano
              </Button>
            </Box>
          )}
          {conErrores > 0 && (
            <Typography variant="caption" color="error" sx={{ display: 'block', textAlign: 'center', mt: 1.5 }} className="no-imprimir">
              {conErrores} plano(s) con errores. Puedes exportar igual, pero revísalos antes de enviarlos.
            </Typography>
          )}
        </Box>

        <Box className="no-imprimir" sx={{ bgcolor: 'background.paper', borderLeft: 1, borderColor: 'divider', p: 2, overflowY: 'auto' }}>
          {plano ? (
            <EditorPlano
              key={plano.id}
              plano={plano}
              letra={letraPlano(idx)}
              onCambiar={(fn, clave) => st.actualizarPlano(plano.id, fn, clave)}
              onCambiarPlantilla={() => setGaleria('cambiar')}
              onResaltar={setResaltarId}
              seleccionId={seleccionValida}
              onSeleccionar={setSeleccionOp}
              onEliminar={eliminarOps}
            />
          ) : (
            <Typography color="text.secondary">Selecciona o agrega un plano para editarlo.</Typography>
          )}
        </Box>
      </Box>

      <Galeria
        abierta={galeria !== null}
        titulo={galeria === 'cambiar' ? `Cambiar la plantilla del plano ${letraPlano(idx)}` : 'Agregar plano al pedido'}
        onCerrar={() => setGaleria(null)}
        onElegir={(pl) => {
          setElegida({ plantilla: pl, modo: galeria === 'cambiar' ? 'cambiar' : 'agregar' });
          setGaleria(null);
        }}
      />

      {elegida && (
        <DialogoMedidas
          plantilla={elegida.plantilla}
          modo={elegida.modo}
          inicial={datosIniciales(elegida.plantilla, elegida.modo)}
          onCancelar={() => setElegida(null)}
          onConfirmar={(datos) => {
            if (elegida.modo === 'cambiar' && plano) st.reemplazarPlantilla(plano.id, elegida.plantilla, datos);
            else st.agregarPlano(elegida.plantilla, datos);
            setSeleccionOp(null);
            setElegida(null);
          }}
        />
      )}

      <Dialog open={confirmarEmpezar !== null} onClose={() => setConfirmarEmpezar(null)}>
        <DialogTitle>{confirmarEmpezar === 'vacio' ? '¿Empezar un pedido vacío?' : '¿Cargar el pedido de ejemplo?'}</DialogTitle>
        <DialogContent>
          <DialogContentText>Se reemplaza el pedido actual. Si te arrepientes, puedes usar Deshacer.</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmarEmpezar(null)}>Cancelar</Button>
          <Button
            color="error"
            onClick={() => {
              if (confirmarEmpezar) st.empezar(confirmarEmpezar);
              setSeleccionOp(null);
              setConfirmarEmpezar(null);
            }}
          >
            {confirmarEmpezar === 'vacio' ? 'Empezar vacío' : 'Cargar ejemplo'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={problemasExportar !== null} onClose={() => setProblemasExportar(null)}>
        <DialogTitle>Antes de exportar</DialogTitle>
        <DialogContent>
          {problemasExportar?.map((p) => (
            <DialogContentText key={p}>• {p}</DialogContentText>
          ))}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setProblemasExportar(null)}>Revisar</Button>
          <Button variant="contained" onClick={exportar}>
            Exportar igual
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={aviso !== null || st.avisoEstado !== null}
        autoHideDuration={st.avisoEstado ? 10000 : aviso?.deshacer ? 6000 : 4000}
        onClose={(_, razon) => {
          if (razon === 'clickaway') return;
          setAviso(null);
          st.limpiarAvisoEstado();
        }}
        message={st.avisoEstado ?? aviso?.texto}
        action={
          !st.avisoEstado && aviso?.deshacer ? (
            <Button
              color="inherit"
              size="small"
              onClick={() => {
                st.deshacer();
                setAviso(null);
              }}
            >
              DESHACER
            </Button>
          ) : undefined
        }
      />
    </Box>
  );
}

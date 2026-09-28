// Detalles técnicos — editor de planos de vidrio templado (FOR-005) para VITELSA /
// TEMPLACOL. Traído al ERP el 2026-09-27 desde el prototipo standalone
// `editor-detalles-tecnicos` (Compra VITELSA), AISLADO: sin backend ni base de
// datos, el pedido se guarda en localStorage y no toca Pedidos PV. Solo admin.
// Cómo integrarlo lo decide el usuario (plan en docs/modulos/detalles-tecnicos.md).
import { useEffect, useRef, useState } from 'react';
import {
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
import { usePedido, type DatosPlano } from './estado';
import { letraPlano } from './modelo/geometria';
import { idsDelGrupo, moverOperaciones } from './modelo/mover';
import { validarPlano } from './modelo/validaciones';
import type { Plantilla } from './modelo/tipos';
import { PanelPedido } from './components/PanelPedido';
import { HojaDetalle } from './components/HojaDetalle';
import { EditorPlano } from './components/EditorPlano';
import { Galeria } from './components/Galeria';
import { DialogoMedidas } from './components/DialogoMedidas';
import { abrirVentanaImpresion } from '../../utils/printWindow';
import { FileSpreadsheet as TableChartIcon, Printer as PrintIcon, RefreshCw as RestartAltIcon, Undo2 as UndoIcon, Redo2 as RedoIcon, MoreVertical as MoreVertIcon, Cloud as CloudDoneOutlinedIcon } from '../../components/ui/icons';

const esCampoDeTexto = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);

/** Hoja carta para la ventana de impresión (reemplaza el @media print del prototipo). */
const ESTILOS_IMPRESION = `
@page { size: letter portrait; margin: 8mm; }
body { margin: 0; background: #fff; }
.hoja-imprimible { box-shadow: none !important; max-width: none !important; padding: 0 !important; }
`;

export default function DetallesTecnicosPage() {
  const st = usePedido();
  const { pedido } = st;
  const [galeria, setGaleria] = useState<'agregar' | 'cambiar' | null>(null);
  const [elegida, setElegida] = useState<{ plantilla: Plantilla; modo: 'agregar' | 'cambiar' } | null>(null);
  const [resaltarId, setResaltarId] = useState<string | null>(null);
  const [seleccionOp, setSeleccionOp] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);
  const [aviso, setAviso] = useState<{ texto: string; deshacer?: boolean } | null>(null);
  const [confirmarReinicio, setConfirmarReinicio] = useState(false);
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  // Copia sin edición de la hoja, oculta: de aquí sale el HTML que se imprime.
  const hojaImpresionRef = useRef<HTMLDivElement>(null);

  // Si el plano seleccionado ya no existe (p. ej. tras deshacer), se muestra el primero.
  const idxSel = pedido.planos.findIndex((p) => p.id === st.seleccion);
  const idx = idxSel >= 0 ? idxSel : pedido.planos.length ? 0 : -1;
  const plano = idx >= 0 ? pedido.planos[idx] : null;
  const conErrores = pedido.planos.filter((p) => validarPlano(p).some((o) => o.nivel === 'error')).length;
  const seleccionValida = plano && seleccionOp && plano.pieza.operaciones.some((o) => o.id === seleccionOp) ? seleccionOp : null;

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

  // Atajos: deshacer/rehacer, mover con flechas, suprimir y Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'z' && !e.shiftKey) {
        e.preventDefault();
        st.deshacer();
        return;
      }
      if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) {
        e.preventDefault();
        st.rehacer();
        return;
      }
      if (esCampoDeTexto(e.target) || !plano || !seleccionValida) return;
      const paso = e.shiftKey ? 10 : 1;
      const delta = { ArrowLeft: { x: -paso, y: 0 }, ArrowRight: { x: paso, y: 0 }, ArrowUp: { x: 0, y: -paso }, ArrowDown: { x: 0, y: paso } }[e.key];
      if (delta) {
        e.preventDefault();
        const ids = idsDelGrupo(plano.pieza, seleccionValida);
        st.actualizarPlano(plano.id, (pl) => ({ ...pl, pieza: moverOperaciones(pl.pieza, pl.pieza, ids, delta, 1) }), `teclado:${seleccionValida}`);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        const n = plano.pieza.operaciones.findIndex((o) => o.id === seleccionValida) + 1;
        eliminarOps([seleccionValida], `Elemento ${n} eliminado`);
      } else if (e.key === 'Escape') {
        setSeleccionOp(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const exportar = async () => {
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

  // Dentro del ERP `window.print()` imprimiría también el menú y la barra: se usa
  // la ventana de impresión común (regla del CLAUDE.md, utils/printWindow.ts).
  const imprimir = () => {
    if (!plano || !hojaImpresionRef.current) return;
    abrirVentanaImpresion({
      titulo: `Detalle técnico ${pedido.proveedor} ${pedido.numero} · Plano ${letraPlano(idx)}`,
      contenidoHtml: hojaImpresionRef.current.innerHTML,
      estilos: ESTILOS_IMPRESION,
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
          <Chip size="small" label="Módulo aislado · sin vínculo con Pedidos PV" variant="outlined" />
          <Typography variant="body2" color="text.secondary" sx={{ ml: 1, display: { xs: 'none', md: 'block' } }}>
            {pedido.proveedor} #{pedido.numero}
          </Typography>
          {st.puedeGuardar ? (
            <Tooltip title={st.ultimoCambio ? `Último cambio guardado a las ${st.ultimoCambio.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}` : 'Los cambios se guardan solos en este navegador'}>
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
          <Button size="small" variant="outlined" startIcon={<PrintIcon size={18} />} onClick={imprimir} disabled={!plano}>
            Imprimir plano
          </Button>
          <Button
            size="small"
            variant="contained"
            startIcon={exportando ? <CircularProgress size={16} color="inherit" /> : <TableChartIcon size={18} />}
            onClick={exportar}
            disabled={exportando || pedido.planos.length === 0}
          >
            Exportar Excel
          </Button>
          <IconButton size="small" onClick={(e) => setMenu(e.currentTarget)} aria-label="Más opciones">
            <MoreVertIcon size={18} />
          </IconButton>
          <Menu anchorEl={menu} open={!!menu} onClose={() => setMenu(null)}>
            <MenuItem
              onClick={() => {
                setMenu(null);
                setConfirmarReinicio(true);
              }}
            >
              <ListItemIcon>
                <RestartAltIcon size={18} />
              </ListItemIcon>
              Empezar un pedido nuevo de ejemplo
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
              pedido={pedido}
              plano={plano}
              letra={letraPlano(idx)}
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

      <Dialog open={confirmarReinicio} onClose={() => setConfirmarReinicio(false)}>
        <DialogTitle>¿Empezar un pedido nuevo de ejemplo?</DialogTitle>
        <DialogContent>
          <DialogContentText>Se reemplaza el pedido actual. Si te arrepientes, puedes usar Deshacer.</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmarReinicio(false)}>Cancelar</Button>
          <Button
            color="error"
            onClick={() => {
              st.reiniciar();
              setSeleccionOp(null);
              setConfirmarReinicio(false);
            }}
          >
            Empezar de nuevo
          </Button>
        </DialogActions>
      </Dialog>

      {plano && (
        <div ref={hojaImpresionRef} style={{ display: 'none' }} aria-hidden>
          <HojaDetalle pedido={pedido} plano={plano} letra={letraPlano(idx)} />
        </div>
      )}

      <Snackbar
        open={aviso !== null}
        autoHideDuration={aviso?.deshacer ? 6000 : 4000}
        onClose={(_, razon) => razon !== 'clickaway' && setAviso(null)}
        message={aviso?.texto}
        action={
          aviso?.deshacer ? (
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

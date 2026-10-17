// Detalles técnicos — modo pedido (2026-10-16). Se abre desde Gestión PV con «Diseñar»:
// encabezado y vidrios del Pedido PV, un plano por letra DT, guardado en la BD con su imagen
// en Cloudinary. El Excel es el formulario oficial del proveedor con las hojas «PLANO X».
// Detalle en docs/modulos/detalles-tecnicos.md.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useBlocker, useNavigate } from 'react-router-dom';
import {
  Alert, AppBar, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
  Divider, IconButton, Menu, MenuItem, Snackbar, Toolbar, Tooltip, Typography,
} from '@mui/material';
import { useDataChangedSocket } from '../../../store/useSocketNotifications';
import ODPFichaModal from '../../odp/components/ODPFichaModal';
import { abrirVentanaImpresion } from '../../../utils/printWindow';
import { fmtMomento } from '../../../utils/fechas';
import { medidasCaja } from '../modelo/geometria';
import type { Plano, Plantilla } from '../modelo/tipos';
import type { DatosPlano } from '../estado';
import { useAtajos } from '../useAtajos';
import { HojaDetalle, ESTILOS_HOJA_IMPRESA } from '../components/HojaDetalle';
import { EditorPlano } from '../components/EditorPlano';
import { Galeria } from '../components/Galeria';
import { DialogoMedidas } from '../components/DialogoMedidas';
import { descargarExcelPedidoPV, encabezadoDe, filasDe, mensajeError, type PedidoDelGrupo } from './api';
import { datosDeItems, itemsDeLetra, letrasDe, medidasDistintas, validarLetra } from './planos';
import { PanelLetras } from './PanelLetras';
import { HojasPedido } from './HojasPedido';
import { useDisenoPedido } from './useDisenoPedido';
import {
  ArrowLeft, Eye, FileSpreadsheet, Lock, Printer, Redo2, Save, Trash2, Undo2, Unlock,
} from '../../../components/ui/icons';

const ESTILOS_IMPRESION = `@page { size: letter portrait; margin: 8mm; } body { margin: 0; background: #fff; } ${ESTILOS_HOJA_IMPRESA}`;

export default function DisenoPedidoPage({ pedidoId }: { pedidoId: number }) {
  const navigate = useNavigate();
  const st = useDisenoPedido(pedidoId);
  const { datos, planos, pendientes } = st;
  const [letraSel, setLetraSel] = useState<string | null>(null);
  const [seleccionOp, setSeleccionOp] = useState<string | null>(null);
  const [resaltarId, setResaltarId] = useState<string | null>(null);
  const [galeria, setGaleria] = useState<'agregar' | 'cambiar' | null>(null);
  const [elegida, setElegida] = useState<{ plantilla: Plantilla; modo: 'agregar' | 'cambiar' } | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; deshacer?: boolean; error?: boolean } | null>(null);
  const [verFicha, setVerFicha] = useState(false);
  const [menuExcel, setMenuExcel] = useState<HTMLElement | null>(null);
  const [menuImprimir, setMenuImprimir] = useState<HTMLElement | null>(null);
  const [descargaPendiente, setDescargaPendiente] = useState<{ pedido: PedidoDelGrupo; problemas: string[] } | null>(null);
  const [descargando, setDescargando] = useState(false);
  const [impresion, setImpresion] = useState<'actual' | 'todos' | null>(null);
  const hojasImpresionRef = useRef<HTMLDivElement>(null);

  useDataChangedSocket('pedidos_pv', st.refrescarDatos);

  const letras = useMemo(() => (datos ? letrasDe(datos, planos) : []), [datos, planos]);
  // La primera letra se elige sola al cargar; si la elegida desaparece, vuelve a la primera.
  useEffect(() => {
    if (letras.length && (!letraSel || !letras.includes(letraSel))) setLetraSel(letras[0]);
  }, [letras, letraSel]);

  const plano = planos.find((p) => p.letra === letraSel) ?? null;
  const itemsLetra = datos && letraSel ? itemsDeLetra(datos.items, letraSel) : [];
  const bloqueada = !!datos && !!letraSel && datos.letras_bloqueadas.includes(letraSel);
  const editable = !!datos?.puede_editar && !bloqueada;
  const seleccionValida = plano && seleccionOp && plano.pieza.operaciones.some((o) => o.id === seleccionOp) ? seleccionOp : null;
  // Un plano sirve para todos los vidrios de su letra: se valida contra cada medida (2026-10-17).
  const validarConLetra = (pl: Plano) => validarLetra(pl, itemsLetra);

  const eliminarOps = (ids: string[], descripcion: string) => {
    if (!plano || !editable) return;
    st.actualizarPlano(plano.id, (pl) => ({ ...pl, pieza: { ...pl.pieza, operaciones: pl.pieza.operaciones.filter((o) => !ids.includes(o.id)) } }));
    setSeleccionOp(null);
    setAviso({ texto: descripcion, deshacer: true });
  };

  useAtajos({
    plano,
    seleccionId: seleccionValida,
    editable,
    deshacer: st.deshacer,
    rehacer: st.rehacer,
    cambiarPieza: (fn, clave) => plano && st.actualizarPlano(plano.id, (pl) => ({ ...pl, pieza: fn(pl.pieza) }), clave),
    eliminar: eliminarOps,
    limpiarSeleccion: () => setSeleccionOp(null),
  });

  // ── Salir con cambios sin guardar ──
  const bloqueoSalida = useBlocker(({ currentLocation, nextLocation }) => pendientes.hay && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (!pendientes.hay) return;
    const alSalir = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', alSalir);
    return () => window.removeEventListener('beforeunload', alSalir);
  }, [pendientes.hay]);

  // ── Impresión: se monta la copia oculta y, en el siguiente render, se imprime ──
  useEffect(() => {
    if (!impresion || !datos || !hojasImpresionRef.current) return;
    abrirVentanaImpresion({
      titulo: `Detalles técnicos · Pedido PV ${datos.encabezado.numero_pedido}`,
      contenidoHtml: hojasImpresionRef.current.innerHTML,
      estilos: ESTILOS_IMPRESION,
    });
    setImpresion(null);
  }, [impresion, datos]);

  const guardar = async () => {
    const errores = await st.guardar();
    setAviso(errores.length ? { texto: errores.join(' · '), error: true } : { texto: 'Planos guardados. PERF y BOQ de los vidrios quedaron actualizados.' });
  };

  /** Antes de descargar: letras de ese pedido sin plano o con errores (decisión A: se avisa y se descarga igual). */
  const pedirDescarga = (pedido: PedidoDelGrupo) => {
    setMenuExcel(null);
    if (!datos) return;
    const letrasPedido = Array.from(new Set(datos.items.filter((i) => i.pedido_pv_id === pedido.id && i.letra).map((i) => i.letra!)));
    const problemas: string[] = [];
    for (const l of letrasPedido) {
      const pl = planos.find((p) => p.letra === l);
      if (!pl) problemas.push(`La letra ${l} no tiene plano: el Excel sale sin su hoja.`);
      else if (validarLetra(pl, itemsDeLetra(datos.items, l)).some((o) => o.nivel === 'error')) problemas.push(`El plano ${l} tiene errores: revísalo antes de enviarlo.`);
    }
    if (problemas.length) setDescargaPendiente({ pedido, problemas });
    else descargar(pedido);
  };
  const descargar = async (pedido: PedidoDelGrupo) => {
    setDescargaPendiente(null);
    setDescargando(true);
    try {
      await descargarExcelPedidoPV(pedido);
    } catch (e) {
      setAviso({ texto: mensajeError(e, `No se pudo generar el Excel del pedido ${pedido.numero_pedido}`), error: true });
    } finally {
      setDescargando(false);
    }
  };

  if (st.cargando) {
    return <Box sx={{ display: 'grid', placeItems: 'center', height: 'calc(100dvh - 64px)' }}><CircularProgress /></Box>;
  }
  if (!datos) {
    return (
      <Box sx={{ p: 4, maxWidth: 640, mx: 'auto' }}>
        <Alert severity="error" action={<Button color="inherit" onClick={() => navigate('/pedidos-pv')}>Volver a Pedidos PV</Button>}>
          {st.errorCarga}
        </Alert>
      </Box>
    );
  }

  const enc = encabezadoDe(datos);
  const letrasBloqueadas = datos.letras_bloqueadas;
  const distintas = medidasDistintas(itemsLetra);
  const caja = plano ? medidasCaja(plano.pieza) : null;
  const primero = itemsLetra[0];
  const cajaDistinta = !!caja && !!primero && (caja.ancho !== primero.ancho_mm || caja.alto !== primero.alto_mm);
  const datosIniciales = (): DatosPlano => ({
    ancho: primero?.ancho_mm || 1000,
    alto: primero?.alto_mm || 1000,
    ...datosDeItems(itemsLetra),
  });

  return (
    <Box sx={{ height: 'calc(100dvh - 64px)', display: 'flex', flexDirection: 'column', bgcolor: 'grey.100' }}>
      <AppBar position="static" elevation={0} color="inherit" sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Toolbar variant="dense" sx={{ gap: 1, flexWrap: 'wrap', py: 0.5 }}>
          <Tooltip title="Volver a Pedidos PV">
            <IconButton size="small" onClick={() => navigate('/pedidos-pv')} aria-label="Volver a Pedidos PV">
              <ArrowLeft size={18} />
            </IconButton>
          </Tooltip>
          <Typography variant="h6" sx={{ fontWeight: 700, fontSize: 17 }}>
            Detalles técnicos · PV {datos.encabezado.numero_pedido}
          </Typography>
          <Chip size="small" variant="outlined" label={`${enc.proveedor} · ODP ${datos.encabezado.numero_odp || '—'} · ${enc.asesor || '—'}`} />
          {pendientes.hay ? (
            <Chip size="small" color="warning" label={`Sin guardar: ${[...pendientes.cambiados, ...pendientes.quitados].join(', ')}`} />
          ) : (
            <Chip size="small" color="success" variant="outlined" label="Todo guardado" />
          )}
          <Box sx={{ flex: 1 }} />
          {datos.encabezado.odp_id && (
            <Button size="small" startIcon={<Eye size={18} />} onClick={() => setVerFicha(true)}>
              Ver ficha ODP
            </Button>
          )}
          <Tooltip title="Deshacer (Ctrl+Z)">
            <span>
              <IconButton size="small" onClick={st.deshacer} disabled={!st.puedeDeshacer || !datos.puede_editar} aria-label="Deshacer">
                <Undo2 size={18} />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Rehacer (Ctrl+Y)">
            <span>
              <IconButton size="small" onClick={st.rehacer} disabled={!st.puedeRehacer || !datos.puede_editar} aria-label="Rehacer">
                <Redo2 size={18} />
              </IconButton>
            </span>
          </Tooltip>
          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
          <Button size="small" variant="outlined" startIcon={<Printer size={18} />} onClick={(e) => setMenuImprimir(e.currentTarget)} disabled={planos.length === 0}>
            Imprimir
          </Button>
          <Menu anchorEl={menuImprimir} open={!!menuImprimir} onClose={() => setMenuImprimir(null)}>
            <MenuItem disabled={!plano} onClick={() => { setMenuImprimir(null); setImpresion('actual'); }}>Plano {letraSel}</MenuItem>
            <MenuItem onClick={() => { setMenuImprimir(null); setImpresion('todos'); }}>Todos los planos</MenuItem>
          </Menu>
          <Tooltip title={pendientes.hay ? 'Guarda los cambios antes de descargar: el Excel sale con lo guardado' : ''}>
            <span>
              <Button
                size="small"
                variant="outlined"
                startIcon={descargando ? <CircularProgress size={16} color="inherit" /> : <FileSpreadsheet size={18} />}
                disabled={pendientes.hay || descargando}
                onClick={(e) => (datos.pedidos.length > 1 ? setMenuExcel(e.currentTarget) : pedirDescarga(datos.pedidos[0]))}
              >
                Descargar Excel
              </Button>
            </span>
          </Tooltip>
          <Menu anchorEl={menuExcel} open={!!menuExcel} onClose={() => setMenuExcel(null)}>
            {datos.pedidos.map((p) => (
              <MenuItem key={p.id} onClick={() => pedirDescarga(p)}>
                Pedido {p.numero_pedido}
              </MenuItem>
            ))}
          </Menu>
          {datos.puede_editar && (
            <Button
              size="small"
              variant="contained"
              startIcon={st.guardando ? <CircularProgress size={16} color="inherit" /> : <Save size={18} />}
              disabled={!pendientes.hay || st.guardando}
              onClick={guardar}
            >
              Guardar
            </Button>
          )}
        </Toolbar>
      </AppBar>

      {!datos.puede_editar && (
        <Alert severity="info" square>Solo lectura: diseñan los planos los administradores y quienes gestionan Pedidos PV.</Alert>
      )}
      {datos.desbloqueo ? (
        <Alert
          severity="warning"
          square
          action={datos.puede_desbloquear && (
            <Button color="inherit" size="small" startIcon={<Lock size={16} />} disabled={pendientes.hay} onClick={() => st.cambiarBloqueo(false).catch((e) => setAviso({ texto: mensajeError(e, 'No se pudo bloquear'), error: true }))}>
              Volver a bloquear
            </Button>
          )}
        >
          Desbloqueado por {datos.desbloqueo.por || 'un administrador'} el {fmtMomento(datos.desbloqueo.en)}: los planos del pedido ya enviado se pueden editar. Lo que cambies ya no coincide con el papel que tiene el proveedor.
        </Alert>
      ) : letrasBloqueadas.length > 0 && (
        <Alert
          severity="info"
          square
          icon={<Lock size={18} />}
          action={datos.puede_desbloquear && (
            <Button color="inherit" size="small" startIcon={<Unlock size={16} />} onClick={() => st.cambiarBloqueo(true).catch((e) => setAviso({ texto: mensajeError(e, 'No se pudo desbloquear'), error: true }))}>
              Desbloquear
            </Button>
          )}
        >
          {letrasBloqueadas.length === 1 ? `La letra ${letrasBloqueadas[0]} está bloqueada` : `Las letras ${letrasBloqueadas.join(', ')} están bloqueadas`}: su pedido ya se envió al proveedor.
          {!datos.puede_desbloquear && ' Solo un administrador puede desbloquearlas.'}
        </Alert>
      )}

      <Box sx={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '300px minmax(0, 1fr) 460px' }, overflow: { xs: 'auto', lg: 'hidden' } }}>
        <Box sx={{ bgcolor: 'background.paper', borderRight: 1, borderColor: 'divider', p: 2, overflow: 'hidden', minHeight: { xs: 420, lg: 0 } }}>
          <PanelLetras
            datos={datos}
            letras={letras}
            planos={planos}
            letraSel={letraSel}
            pendientes={[...pendientes.cambiados, ...pendientes.quitados]}
            onSeleccionar={(l) => { setLetraSel(l); setSeleccionOp(null); }}
            onCambiarLetra={datos.puede_editar ? async (item, letra) => {
              try {
                await st.cambiarLetras([{ item_id: item.id, letra }]);
              } catch (e) {
                setAviso({ texto: mensajeError(e, 'No se pudo cambiar la letra'), error: true });
                throw e;
              }
            } : null}
          />
        </Box>

        <Box sx={{ overflow: 'auto', p: { xs: 1.5, md: 3 } }}>
          {letraSel && distintas && (
            <Alert severity="info" sx={{ mb: 1.5, maxWidth: 780, mx: 'auto' }}>
              Los vidrios con la letra {letraSel} no miden lo mismo. El dibujo usa {primero?.ancho_mm} × {primero?.alto_mm} (el primero); cada vidrio sale con su medida en la tabla.
            </Alert>
          )}
          {cajaDistinta && caja && (
            <Alert severity="warning" sx={{ mb: 1.5, maxWidth: 780, mx: 'auto' }}>
              El dibujo mide {caja.ancho} × {caja.alto} y el vidrio del pedido {primero?.ancho_mm} × {primero?.alto_mm}: revisa la forma (desplome).
            </Alert>
          )}
          {plano && letraSel ? (
            <HojaDetalle
              encabezado={enc}
              plano={plano}
              letra={letraSel}
              filas={filasDe(itemsLetra, plano.pieza)}
              resaltarId={resaltarId}
              edicion={editable ? {
                seleccionId: seleccionValida,
                onSeleccionar: setSeleccionOp,
                onCambiarPieza: (fn, clave) => st.actualizarPlano(plano.id, (pl) => ({ ...pl, pieza: fn(pl.pieza) }), clave),
              } : undefined}
            />
          ) : letraSel ? (
            <Box sx={{ textAlign: 'center', mt: 12, color: 'text.secondary' }}>
              <Typography variant="h6">La letra {letraSel} todavía no tiene plano</Typography>
              <Typography sx={{ mb: 2 }}>
                {itemsLetra.length === 0 ? 'Ningún vidrio tiene esta letra.' : `Elige una plantilla: se dibuja a ${primero?.ancho_mm} × ${primero?.alto_mm}, la medida del vidrio.`}
              </Typography>
              {editable && itemsLetra.length > 0 && (
                <Button variant="contained" onClick={() => setGaleria('agregar')}>Diseñar plano {letraSel}</Button>
              )}
            </Box>
          ) : (
            <Box sx={{ textAlign: 'center', mt: 12, color: 'text.secondary' }}>
              <Typography variant="h6">Este pedido no tiene letras DT</Typography>
              <Typography>Escribe una letra (A, B, C…) en los vidrios que llevan plano, en la lista de la izquierda.</Typography>
            </Box>
          )}
        </Box>

        <Box sx={{ bgcolor: 'background.paper', borderLeft: 1, borderColor: 'divider', p: 2, overflowY: 'auto' }}>
          {plano && letraSel ? (
            <>
              {editable && (
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
                  <Button
                    size="small"
                    color="error"
                    startIcon={<Trash2 size={16} />}
                    onClick={() => {
                      st.eliminarPlano(plano.id);
                      setAviso({ texto: `Plano ${letraSel} quitado (se borra al guardar)`, deshacer: true });
                    }}
                  >
                    Quitar plano
                  </Button>
                </Box>
              )}
              {/* `fieldset disabled` deja todo el editor en solo lectura con una sola línea. */}
              <fieldset disabled={!editable} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
                <EditorPlano
                  key={plano.id}
                  plano={plano}
                  letra={letraSel}
                  modoPedido
                  validar={validarConLetra}
                  onCambiar={(fn, clave) => st.actualizarPlano(plano.id, fn, clave)}
                  onCambiarPlantilla={() => setGaleria('cambiar')}
                  onResaltar={setResaltarId}
                  seleccionId={seleccionValida}
                  onSeleccionar={setSeleccionOp}
                  onEliminar={eliminarOps}
                />
              </fieldset>
            </>
          ) : (
            <Typography color="text.secondary">Elige una letra con plano para editarlo.</Typography>
          )}
        </Box>
      </Box>

      <Galeria
        abierta={galeria !== null}
        titulo={galeria === 'cambiar' ? `Cambiar la plantilla del plano ${letraSel}` : `Plantilla para el plano ${letraSel}`}
        onCerrar={() => setGaleria(null)}
        onElegir={(pl) => {
          setElegida({ plantilla: pl, modo: galeria === 'cambiar' ? 'cambiar' : 'agregar' });
          setGaleria(null);
        }}
      />

      {elegida && letraSel && (
        <DialogoMedidas
          plantilla={elegida.plantilla}
          modo={elegida.modo}
          inicial={datosIniciales()}
          medidasDelPedido={`Medidas, cantidad, color y espesor de los vidrios con la letra ${letraSel}. El dibujo usa la medida del primero.`}
          validar={validarConLetra}
          onCancelar={() => setElegida(null)}
          onConfirmar={(d) => {
            if (elegida.modo === 'cambiar' && plano) st.reemplazarPlantilla(plano.id, elegida.plantilla, d);
            else st.agregarPlano(elegida.plantilla, d, letraSel);
            setSeleccionOp(null);
            setElegida(null);
          }}
        />
      )}

      <Dialog open={!!descargaPendiente} onClose={() => setDescargaPendiente(null)}>
        <DialogTitle>Antes de descargar el pedido {descargaPendiente?.pedido.numero_pedido}</DialogTitle>
        <DialogContent>
          {descargaPendiente?.problemas.map((p) => (
            <DialogContentText key={p}>• {p}</DialogContentText>
          ))}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDescargaPendiente(null)}>Cancelar</Button>
          <Button variant="contained" onClick={() => descargaPendiente && descargar(descargaPendiente.pedido)}>
            Descargar igual
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={bloqueoSalida.state === 'blocked'} onClose={() => bloqueoSalida.reset?.()}>
        <DialogTitle>Hay planos sin guardar</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Si sales ahora se pierden los cambios de: {[...pendientes.cambiados, ...pendientes.quitados].join(', ')}.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => bloqueoSalida.reset?.()}>Seguir editando</Button>
          <Button color="error" onClick={() => bloqueoSalida.proceed?.()}>
            Salir sin guardar
          </Button>
        </DialogActions>
      </Dialog>

      {verFicha && datos.encabezado.odp_id && <ODPFichaModal odpId={datos.encabezado.odp_id} onClose={() => setVerFicha(false)} />}

      {/* Copia oculta para imprimir: lo que está en pantalla, incluido lo no guardado. Una hoja
          por letra y por pedido del grupo, con el número de cada pedido, igual que el Excel. */}
      {impresion && (
        <div ref={hojasImpresionRef} style={{ display: 'none' }} aria-hidden>
          {impresion === 'actual' && letraSel
            ? <HojasPedido diseno={datos} planos={planos} letra={letraSel} />
            : datos.pedidos.map((p) => <HojasPedido key={p.id} diseno={datos} planos={planos} pedidoId={p.id} />)}
        </div>
      )}

      <Snackbar
        open={aviso !== null}
        autoHideDuration={aviso?.error ? 9000 : aviso?.deshacer ? 6000 : 4000}
        onClose={(_, razon) => razon !== 'clickaway' && setAviso(null)}
        message={aviso?.texto}
        action={
          aviso?.deshacer ? (
            <Button color="inherit" size="small" onClick={() => { st.deshacer(); setAviso(null); }}>
              DESHACER
            </Button>
          ) : undefined
        }
      />
    </Box>
  );
}

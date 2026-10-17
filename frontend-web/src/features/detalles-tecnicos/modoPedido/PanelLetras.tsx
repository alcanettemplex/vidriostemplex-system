import { useState } from 'react';
import { Box, Chip, Divider, List, ListItemButton, Stack, TextField, Tooltip, Typography } from '@mui/material';
import type { Plano } from '../modelo/tipos';
import { PlanoSVG } from '../components/PlanoSVG';
import type { DisenoPedido, ItemDT } from './api';
import { itemsDeLetra, validarLetra } from './planos';
import { AlertCircle as ErrorIcon, AlertTriangle as AvisoIcon, Lock as LockIcon } from '../../../components/ui/icons';

interface Props {
  datos: DisenoPedido;
  letras: string[];
  planos: Plano[];
  letraSel: string | null;
  pendientes: string[];
  onSeleccionar: (letra: string) => void;
  /** Cambia la letra de un vidrio en el servidor. Null = sin permiso o bloqueado. */
  onCambiarLetra: ((item: ItemDT, letra: string | null) => Promise<void>) | null;
}

/** Campo de la letra de un vidrio: se envía al salir del campo o con Enter. */
function CampoLetra({ item, onCambiar }: { item: ItemDT; onCambiar: Props['onCambiarLetra'] }) {
  const [valor, setValor] = useState(item.letra ?? '');
  const [enviando, setEnviando] = useState(false);
  const deshabilitado = !onCambiar || item.bloqueado || enviando;
  const enviar = async () => {
    const nueva = valor.trim().toUpperCase() || null;
    if (!onCambiar || nueva === item.letra) {
      setValor(item.letra ?? '');
      return;
    }
    setEnviando(true);
    try {
      await onCambiar(item, nueva);
    } catch {
      setValor(item.letra ?? '');
    } finally {
      setEnviando(false);
    }
  };
  return (
    <Tooltip title={item.bloqueado ? 'Va en un pedido ya enviado: solo un administrador puede desbloquearlo' : 'Letra DT de este vidrio'}>
      <TextField
        size="small"
        value={valor}
        disabled={deshabilitado}
        onChange={(e) => setValor(e.target.value.toUpperCase().slice(0, 10))}
        onBlur={enviar}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') setValor(item.letra ?? '');
        }}
        placeholder="—"
        sx={{ width: 56, '& input': { textAlign: 'center', fontWeight: 700, py: 0.5 } }}
        slotProps={{ htmlInput: { 'aria-label': `Letra DT del vidrio ${item.ancho_mm}×${item.alto_mm}` } }}
      />
    </Tooltip>
  );
}

export function PanelLetras({ datos, letras, planos, letraSel, pendientes, onSeleccionar, onCambiarLetra }: Props) {
  const numeroDe = (pedidoPvId: number) => datos.pedidos.find((p) => p.id === pedidoPvId)?.numero_pedido ?? '';
  return (
    <Stack spacing={1.5} sx={{ height: '100%', minHeight: 0 }}>
      <Typography variant="overline" color="text.secondary">
        Planos por letra ({letras.length})
      </Typography>
      {letras.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          Ningún vidrio tiene letra DT todavía. Escríbela en la lista de abajo.
        </Typography>
      )}
      <List dense disablePadding sx={{ mx: -1 }}>
        {letras.map((l) => {
          const plano = planos.find((p) => p.letra === l);
          const items = itemsDeLetra(datos.items, l);
          const obs = plano ? validarLetra(plano, items) : [];
          const hayError = obs.some((o) => o.nivel === 'error');
          const bloqueada = datos.letras_bloqueadas.includes(l);
          return (
            <ListItemButton key={l} selected={l === letraSel} onClick={() => onSeleccionar(l)} sx={{ borderRadius: 1, mb: 0.5, gap: 1, alignItems: 'flex-start' }}>
              <Box sx={{ width: 40, height: 50, flexShrink: 0, bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: 0.5, display: 'grid', placeItems: 'center' }}>
                {plano ? <PlanoSVG pieza={plano.pieza} conCotas={false} /> : <Typography variant="caption" color="text.secondary">—</Typography>}
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" alignItems="center" spacing={0.5}>
                  <Typography variant="subtitle2" color="primary" sx={{ fontWeight: 800 }}>
                    {l}
                  </Typography>
                  <Typography variant="body2" noWrap sx={{ fontWeight: 500, color: plano ? 'text.primary' : 'text.secondary' }}>
                    {plano ? plano.nombre : 'Sin plano'}
                  </Typography>
                  {bloqueada && <LockIcon size={14} aria-label="Bloqueado" />}
                </Stack>
                <Typography variant="caption" color="text.secondary" component="div">
                  {items.length === 0 ? 'Sin vidrios con esta letra' : `${items.length} vidrio${items.length === 1 ? '' : 's'} · ${items.reduce((s, i) => s + (i.cantidad || 0), 0)} und.`}
                </Typography>
                <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.25 }}>
                  {pendientes.includes(l) && <Chip label="Sin guardar" size="small" color="warning" variant="outlined" sx={{ height: 18, fontSize: 11 }} />}
                  {obs.length > 0 && (
                    <Stack direction="row" alignItems="center" spacing={0.25} sx={{ color: hayError ? 'error.main' : 'warning.main' }}>
                      {hayError ? <ErrorIcon size={13} /> : <AvisoIcon size={13} />}
                      <Typography variant="caption">{obs.length}</Typography>
                    </Stack>
                  )}
                </Stack>
              </Box>
            </ListItemButton>
          );
        })}
      </List>

      <Divider />
      <Typography variant="overline" color="text.secondary">
        Vidrios del pedido ({datos.items.length})
      </Typography>
      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', mx: -1, px: 1 }}>
        <Stack spacing={0.75}>
          {datos.items.map((it) => (
            <Stack key={it.id} direction="row" spacing={1} alignItems="center">
              <CampoLetra key={`${it.id}-${it.letra ?? ''}`} item={it} onCambiar={onCambiarLetra} />
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" noWrap>
                  {it.cantidad ?? 1} × {it.ancho_mm}×{it.alto_mm}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap component="div">
                  {[it.prod, it.color, it.espesor && `${it.espesor} mm`].filter(Boolean).join(' · ')}
                  {datos.pedidos.length > 1 && ` · PV ${numeroDe(it.pedido_pv_id)}`}
                </Typography>
              </Box>
            </Stack>
          ))}
        </Stack>
      </Box>
    </Stack>
  );
}

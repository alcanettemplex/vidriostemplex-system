import {
  Box,
  Button,
  Divider,
  IconButton,
  List,
  ListItemButton,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { conteosDe, letraPlano } from '../modelo/geometria';
import { validarPlano } from '../modelo/validaciones';
import type { Pedido, Proveedor } from '../modelo/tipos';
import { PlanoSVG } from './PlanoSVG';
import { Plus as AddIcon, Copy as ContentCopyIcon, Trash2 as DeleteOutlineIcon, ArrowUp as ArrowUpwardIcon, ArrowDown as ArrowDownwardIcon, AlertCircle as ErrorOutlineIcon, AlertTriangle as WarningAmberIcon } from '../../../components/ui/icons';

interface Props {
  pedido: Pedido;
  seleccion: string | null;
  onSeleccionar: (id: string) => void;
  onCambiarPedido: (c: Partial<Pedido>) => void;
  onAgregar: () => void;
  onDuplicar: (id: string) => void;
  onEliminar: (id: string) => void;
  onMover: (id: string, delta: number) => void;
}

export function PanelPedido({ pedido, seleccion, onSeleccionar, onCambiarPedido, onAgregar, onDuplicar, onEliminar, onMover }: Props) {
  const campo = (label: string, k: 'numero' | 'odp' | 'cliente' | 'obra' | 'asesor', ancho?: number) => (
    <TextField label={label} size="small" value={pedido[k]} onChange={(e) => onCambiarPedido({ [k]: e.target.value })} sx={{ width: ancho }} fullWidth={!ancho} />
  );
  const totalM2 = pedido.planos.reduce((s, p) => s + conteosDe(p.pieza).m2 * (p.cantidad || 0), 0);

  return (
    <Stack spacing={2} sx={{ height: '100%' }}>
      <Box>
        <Typography variant="overline" color="text.secondary">
          Pedido PV
        </Typography>
        <Stack spacing={1.25} sx={{ mt: 0.5 }}>
          <Stack direction="row" spacing={1}>
            <TextField select label="Proveedor" size="small" value={pedido.proveedor} onChange={(e) => onCambiarPedido({ proveedor: e.target.value as Proveedor })} sx={{ flex: 1 }}>
              <MenuItem value="VITELSA">VITELSA</MenuItem>
              <MenuItem value="TEMPLACOL">TEMPLACOL</MenuItem>
            </TextField>
            {campo('Pedido N°', 'numero', 110)}
          </Stack>
          <Stack direction="row" spacing={1}>
            <TextField label="Fecha" type="date" size="small" value={pedido.fecha} onChange={(e) => onCambiarPedido({ fecha: e.target.value })} sx={{ flex: 1 }} slotProps={{ inputLabel: { shrink: true } }} />
            {campo('ODP', 'odp', 110)}
          </Stack>
          {campo('Cliente', 'cliente')}
          <Stack direction="row" spacing={1}>
            {campo('Obra', 'obra')}
            {campo('Asesor', 'asesor', 90)}
          </Stack>
        </Stack>
      </Box>

      <Divider />

      <Stack direction="row" alignItems="baseline" justifyContent="space-between">
        <Typography variant="overline" color="text.secondary">
          Planos ({pedido.planos.length})
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {totalM2.toFixed(2)} m² en total
        </Typography>
      </Stack>

      <List dense disablePadding sx={{ flex: 1, overflowY: 'auto', mx: -1 }}>
        {pedido.planos.map((pl, i) => {
          const obs = validarPlano(pl);
          const hayError = obs.some((o) => o.nivel === 'error');
          const activo = pl.id === seleccion;
          return (
            <ListItemButton
              key={pl.id}
              selected={activo}
              onClick={() => onSeleccionar(pl.id)}
              sx={{ borderRadius: 1, mb: 0.5, alignItems: 'flex-start', gap: 1, '&:hover .acciones': { opacity: 1 } }}
            >
              <Box sx={{ width: 44, height: 56, flexShrink: 0, bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: 0.5 }}>
                <PlanoSVG pieza={pl.pieza} conCotas={false} />
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" alignItems="center" spacing={0.5}>
                  <Typography variant="subtitle2" color="primary" sx={{ fontWeight: 800 }}>
                    {letraPlano(i)}
                  </Typography>
                  <Typography variant="body2" noWrap sx={{ fontWeight: 500 }}>
                    {pl.nombre}
                  </Typography>
                </Stack>
                <Typography variant="caption" color="text.secondary" component="div">
                  {pl.cantidad} × {pl.pieza.ancho}×{pl.pieza.alto} · {pl.color} {pl.espesor} mm
                </Typography>
                {obs.length > 0 && (
                  <Stack direction="row" alignItems="center" spacing={0.5} sx={{ color: hayError ? 'error.main' : 'warning.main' }}>
                    {hayError ? <ErrorOutlineIcon size={14} /> : <WarningAmberIcon size={14} />}
                    <Typography variant="caption">
                      {obs.length} observaci{obs.length === 1 ? 'ón' : 'ones'}
                    </Typography>
                  </Stack>
                )}
              </Box>
              <Stack className="acciones" sx={{ opacity: activo ? 1 : 0, transition: 'opacity .15s' }} onClick={(e) => e.stopPropagation()}>
                <Tooltip title="Subir" placement="left">
                  <span>
                    <IconButton size="small" disabled={i === 0} onClick={() => onMover(pl.id, -1)} aria-label="Subir plano">
                      <ArrowUpwardIcon size={16} />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title="Bajar" placement="left">
                  <span>
                    <IconButton size="small" disabled={i === pedido.planos.length - 1} onClick={() => onMover(pl.id, 1)} aria-label="Bajar plano">
                      <ArrowDownwardIcon size={16} />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title="Duplicar" placement="left">
                  <IconButton size="small" onClick={() => onDuplicar(pl.id)} aria-label="Duplicar plano">
                    <ContentCopyIcon size={16} />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Eliminar" placement="left">
                  <IconButton size="small" onClick={() => onEliminar(pl.id)} aria-label="Eliminar plano">
                    <DeleteOutlineIcon size={16} />
                  </IconButton>
                </Tooltip>
              </Stack>
            </ListItemButton>
          );
        })}
      </List>

      <Button variant="contained" startIcon={<AddIcon size={18} />} onClick={onAgregar}>
        Agregar plano
      </Button>
    </Stack>
  );
}

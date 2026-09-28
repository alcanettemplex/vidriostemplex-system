import { useState } from 'react';
import {
  Autocomplete,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type { DatosPlano } from '../estado';
import { piezaConMedidas } from '../modelo/plantillas';
import type { Plantilla } from '../modelo/tipos';
import { COLORES, ESPESORES } from '../modelo/opciones';
import { PlanoSVG } from './PlanoSVG';

interface Props {
  plantilla: Plantilla;
  /** Valores con los que arranca el formulario. */
  inicial: DatosPlano;
  modo: 'agregar' | 'cambiar';
  onCancelar: () => void;
  onConfirmar: (datos: DatosPlano) => void;
}

const MIN_MM = 50;

/**
 * Se abre al elegir una plantilla. La plantilla trae medidas de ejemplo, que casi nunca son las del
 * pedido: aquí se piden las reales antes de crear el plano.
 */
export function DialogoMedidas({ plantilla, inicial, modo, onCancelar, onConfirmar }: Props) {
  const [ancho, setAncho] = useState(String(inicial.ancho));
  const [alto, setAlto] = useState(String(inicial.alto));
  const [cantidad, setCantidad] = useState(String(inicial.cantidad));
  const [color, setColor] = useState(inicial.color);
  const [espesor, setEspesor] = useState(inicial.espesor);

  const a = Number(ancho);
  const h = Number(alto);
  const n = Number(cantidad);
  const errAncho = !(a >= MIN_MM) ? `Mínimo ${MIN_MM} mm` : '';
  const errAlto = !(h >= MIN_MM) ? `Mínimo ${MIN_MM} mm` : '';
  const errCant = !(Number.isInteger(n) && n >= 1) ? 'Al menos 1' : '';
  const valido = !errAncho && !errAlto && !errCant && !!espesor.trim();
  const vista = valido ? piezaConMedidas(plantilla.pieza, a, h) : plantilla.pieza;

  const confirmar = () => {
    if (valido) onConfirmar({ ancho: a, alto: h, cantidad: n, color: color.trim().toUpperCase() || 'INC', espesor: espesor.trim() });
  };
  const mm = { input: { endAdornment: <InputAdornment position="end">mm</InputAdornment> } };

  return (
    <Dialog open onClose={onCancelar} maxWidth="sm" fullWidth>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          confirmar();
        }}
      >
        <DialogTitle>
          {modo === 'agregar' ? 'Medidas del vidrio' : 'Cambiar a esta plantilla'}
          <Typography variant="body2" color="text.secondary">
            {plantilla.nombre} · {plantilla.descripcion}
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2.5}>
            <Stack spacing={2} sx={{ flex: 1, pt: 0.5 }}>
              <Stack direction="row" spacing={1.5}>
                <TextField
                  label="Ancho"
                  type="number"
                  value={ancho}
                  onChange={(e) => setAncho(e.target.value)}
                  error={!!errAncho}
                  helperText={errAncho || ' '}
                  autoFocus
                  onFocus={(e) => e.target.select()}
                  slotProps={mm}
                />
                <TextField label="Alto" type="number" value={alto} onChange={(e) => setAlto(e.target.value)} error={!!errAlto} helperText={errAlto || ' '} onFocus={(e) => e.target.select()} slotProps={mm} />
              </Stack>
              <Stack direction="row" spacing={1.5}>
                <TextField label="Cantidad" type="number" value={cantidad} onChange={(e) => setCantidad(e.target.value)} error={!!errCant} helperText={errCant || ' '} onFocus={(e) => e.target.select()} sx={{ width: 110 }} />
                <Autocomplete
                  freeSolo
                  options={COLORES}
                  inputValue={color}
                  onInputChange={(_, v) => setColor(v)}
                  renderInput={(params) => <TextField {...params} label="Color" helperText=" " />}
                  sx={{ flex: 1 }}
                />
                <Autocomplete
                  freeSolo
                  options={ESPESORES}
                  inputValue={espesor}
                  onInputChange={(_, v) => setEspesor(v)}
                  renderInput={(params) => <TextField {...params} label="Espesor (mm)" helperText=" " />}
                  sx={{ width: 130 }}
                />
              </Stack>
              <Typography variant="caption" color="text.secondary">
                {modo === 'agregar'
                  ? `La plantilla trae ${plantilla.pieza.ancho} × ${plantilla.pieza.alto} mm como ejemplo. Las perforaciones y boquetes se reubican solos según las medidas.`
                  : 'Se reemplaza el dibujo por el de esta plantilla, con las medidas que indiques.'}
              </Typography>
            </Stack>
            <Box sx={{ width: { xs: '100%', sm: 170 }, height: 220, bgcolor: 'grey.50', border: 1, borderColor: 'divider', borderRadius: 1, p: 1 }}>
              <PlanoSVG pieza={vista} conCotas={false} />
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onCancelar}>Cancelar</Button>
          <Button type="submit" variant="contained" disabled={!valido}>
            {modo === 'agregar' ? 'Agregar plano' : 'Aplicar'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

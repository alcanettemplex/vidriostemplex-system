import { useState } from 'react';
import {
  Alert,
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
import type { Plano, Plantilla } from '../modelo/tipos';
import { COLORES, ESPESORES } from '../modelo/opciones';
import { validarPlano, type Observacion } from '../modelo/validaciones';
import { PlanoSVG } from './PlanoSVG';

interface Props {
  plantilla: Plantilla;
  /** Valores con los que arranca el formulario. */
  inicial: DatosPlano;
  modo: 'agregar' | 'cambiar';
  onCancelar: () => void;
  onConfirmar: (datos: DatosPlano) => void;
  /** Modo pedido: las medidas, la cantidad, el color y el espesor vienen de los vidrios del
   *  Pedido PV y no se editan aquí. El texto explica de dónde salen. */
  medidasDelPedido?: string;
  /** Modo pedido: valida contra todas las medidas de la letra (`validarLetra`). Sin esto, solo el dibujo. */
  validar?: (plano: Plano) => Observacion[];
}

const MIN_MM = 50;

/**
 * Se abre al elegir una plantilla. La plantilla trae medidas de ejemplo, que casi nunca son las del
 * pedido: aquí se piden las reales antes de crear el plano.
 */
export function DialogoMedidas({ plantilla, inicial, modo, onCancelar, onConfirmar, medidasDelPedido, validar = validarPlano }: Props) {
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
  // La plantilla llevada a estas medidas puede dejar herrajes fuera del vidrio (un botón a
  // 1000 mm en una hoja de 600): se avisa antes de crear el plano, no después.
  const observaciones = valido
    ? validar({ id: '', plantillaId: plantilla.id, nombre: plantilla.nombre, cantidad: n, color, espesor, selloEnCanto: false, observaciones: '', pieza: vista })
    : [];
  const errores = observaciones.filter((o) => o.nivel === 'error');
  const fijo = !!medidasDelPedido;

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
                  disabled={fijo}
                  autoFocus={!fijo}
                  onFocus={(e) => e.target.select()}
                  slotProps={mm}
                />
                <TextField label="Alto" type="number" value={alto} onChange={(e) => setAlto(e.target.value)} error={!!errAlto} helperText={errAlto || ' '} onFocus={(e) => e.target.select()} slotProps={mm} disabled={fijo} />
              </Stack>
              <Stack direction="row" spacing={1.5}>
                <TextField label="Cantidad" type="number" value={cantidad} onChange={(e) => setCantidad(e.target.value)} error={!!errCant} helperText={errCant || ' '} onFocus={(e) => e.target.select()} sx={{ width: 110 }} disabled={fijo} />
                <Autocomplete
                  freeSolo
                  options={COLORES}
                  disabled={fijo}
                  inputValue={color}
                  onInputChange={(_, v) => setColor(v)}
                  renderInput={(params) => <TextField {...params} label="Color" helperText=" " />}
                  sx={{ flex: 1 }}
                />
                <Autocomplete
                  freeSolo
                  options={ESPESORES}
                  disabled={fijo}
                  inputValue={espesor}
                  onInputChange={(_, v) => setEspesor(v)}
                  renderInput={(params) => <TextField {...params} label="Espesor (mm)" helperText=" " />}
                  sx={{ width: 130 }}
                />
              </Stack>
              {errores.length > 0 && (
                <Alert severity="error" variant="outlined" sx={{ py: 0, fontSize: 13 }}>
                  Con estas medidas: {errores[0].texto}
                  {errores.length > 1 && ` (y ${errores.length - 1} problema${errores.length > 2 ? 's' : ''} más)`} Puedes crearlo y corregirlo en el editor.
                </Alert>
              )}
              <Typography variant="caption" color="text.secondary">
                {fijo
                  ? medidasDelPedido
                  : modo === 'agregar'
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

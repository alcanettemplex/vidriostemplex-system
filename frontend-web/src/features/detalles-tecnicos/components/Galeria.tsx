import { useMemo, useState } from 'react';
import {
  Box,
  Card,
  CardActionArea,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { conteosDe } from '../modelo/geometria';
import { FAMILIAS, PLANTILLAS } from '../modelo/plantillas';
import type { Plantilla } from '../modelo/tipos';
import { PlanoSVG } from './PlanoSVG';
import { X as CloseIcon, Search as SearchIcon } from '../../../components/ui/icons';

interface Props {
  abierta: boolean;
  titulo: string;
  onCerrar: () => void;
  onElegir: (p: Plantilla) => void;
}

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function Galeria({ abierta, titulo, onCerrar, onElegir }: Props) {
  const [busqueda, setBusqueda] = useState('');
  const [familia, setFamilia] = useState<string | null>(null);

  const visibles = useMemo(() => {
    const q = normalizar(busqueda.trim());
    return PLANTILLAS.filter(
      (p) => (!familia || p.familia === familia) && (!q || normalizar(`${p.nombre} ${p.hoja} ${p.descripcion}`).includes(q)),
    );
  }, [busqueda, familia]);

  return (
    <Dialog open={abierta} onClose={onCerrar} maxWidth="lg" fullWidth scroll="paper">
      <DialogTitle sx={{ pr: 6 }}>
        {titulo}
        <Typography variant="body2" color="text.secondary">
          {PLANTILLAS.length} plantillas migradas de «1.1 DETALLES TECNICOS.xlsx». Todo se puede ajustar después.
        </Typography>
        <IconButton onClick={onCerrar} sx={{ position: 'absolute', right: 12, top: 12 }} aria-label="Cerrar">
          <CloseIcon size={18} />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }} alignItems={{ md: 'center' }}>
          <TextField
            size="small"
            placeholder="Buscar: batiente, toallero, 28-40, boquete…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            autoFocus
            sx={{ minWidth: 300 }}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon size={18} /></InputAdornment> } }}
          />
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            <Chip label="Todas" color={familia === null ? 'primary' : 'default'} onClick={() => setFamilia(null)} />
            {FAMILIAS.map((f) => (
              <Chip key={f} label={f} color={familia === f ? 'primary' : 'default'} onClick={() => setFamilia(f)} />
            ))}
          </Stack>
        </Stack>

        {visibles.length === 0 && (
          <Typography color="text.secondary" sx={{ py: 6, textAlign: 'center' }}>
            Ninguna plantilla coincide. Prueba «En blanco» y agrega los procesos a mano.
          </Typography>
        )}

        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 2 }}>
          {visibles.map((p) => {
            const c = conteosDe(p.pieza);
            const resumen = [c.perf && `${c.perf} perf.`, c.boq && `${c.boq} boq.`, c.dsp && `${c.dsp} desp.`, c.radios && `${c.radios} radios`]
              .filter(Boolean)
              .join(' · ');
            return (
              <Card key={p.id} variant="outlined">
                <CardActionArea onClick={() => onElegir(p)} sx={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
                  <Box sx={{ height: 150, bgcolor: 'grey.50', p: 1, borderBottom: 1, borderColor: 'divider' }}>
                    <PlanoSVG pieza={p.pieza} conCotas={false} />
                  </Box>
                  <Box sx={{ p: 1.25, flex: 1 }}>
                    <Typography variant="subtitle2" sx={{ lineHeight: 1.25 }}>
                      {p.nombre}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 0.5 }}>
                      Hoja «{p.hoja.trim()}» · {p.familia}
                    </Typography>
                    <Typography variant="caption" component="div" sx={{ lineHeight: 1.3 }}>
                      {p.descripcion}
                    </Typography>
                    {resumen && (
                      <Typography variant="caption" color="primary" component="div" sx={{ mt: 0.5, fontWeight: 600 }}>
                        {resumen}
                      </Typography>
                    )}
                  </Box>
                </CardActionArea>
              </Card>
            );
          })}
        </Box>
      </DialogContent>
    </Dialog>
  );
}

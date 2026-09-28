import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  Collapse,
  FormControlLabel,
  IconButton,
  InputAdornment,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { conteosDe } from '../modelo/geometria';
import { HERRAJES } from '../modelo/herrajes';
import { COLORES, DIAMETROS, ESPESORES } from '../modelo/opciones';
import { nuevoId } from '../modelo/plantillas';
import { validarPlano } from '../modelo/validaciones';
import type { BordeId, Contorno, EsquinaId, Operacion, Pieza, Plano, TratamientoEsquina } from '../modelo/tipos';
import { ChevronDown as ExpandMoreIcon, Trash2 as DeleteOutlineIcon, Plus as AddIcon, Wrench as BuildOutlinedIcon, CheckCircle as CheckCircleOutlineIcon, LinkBreak as LinkOffIcon, Hand as PanToolOutlinedIcon } from '../../../components/ui/icons';

// ── Campos reutilizables ─────────────────────────────────────────────────────

/** Letra de 14 px y sin las flechitas del campo numérico: así «1000 mm» cabe en campos angostos. */
const CAMPO_COMPACTO = {
  '& .MuiInputBase-input': { fontSize: 14 },
  '& input[type=number]': { MozAppearance: 'textfield' },
  '& input[type=number]::-webkit-inner-spin-button, & input[type=number]::-webkit-outer-spin-button': { WebkitAppearance: 'none', margin: 0 },
} as const;

/** Número en milímetros. Deja el campo vacío mientras se escribe en vez de convertirlo en 0. */
function Mm({ value, onChange, label, width = 100, min, ayuda }: { value: number; onChange: (n: number) => void; label?: string; width?: number; min?: number; ayuda?: string }) {
  return (
    <TextField
      label={label}
      type="number"
      size="small"
      value={Number.isFinite(value) ? value : ''}
      onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))}
      onFocus={(e) => e.target.select()}
      error={!Number.isFinite(value)}
      helperText={ayuda}
      sx={{ width, ...CAMPO_COMPACTO }}
      slotProps={{ htmlInput: { min, step: 1 }, input: { endAdornment: <InputAdornment position="end">mm</InputAdornment> } }}
    />
  );
}

function Sel<T extends string>({ value, onChange, opciones, width = 170, label }: { value: T; onChange: (v: T) => void; opciones: { v: T; t: string }[]; width?: number; label?: string }) {
  return (
    <TextField select size="small" label={label} value={value} onChange={(e) => onChange(e.target.value as T)} sx={{ width, ...CAMPO_COMPACTO }}>
      {opciones.map((o) => (
        <MenuItem key={o.v} value={o.v}>
          {o.t}
        </MenuItem>
      ))}
    </TextField>
  );
}

/** Fila tipo frase: «Centro a [28 mm] del [borde izquierdo]». */
function Frase({ children }: { children: ReactNode }) {
  return (
    <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap" sx={{ '& > .MuiTypography-root': { color: 'text.secondary', fontSize: 14 } }}>
      {children}
    </Stack>
  );
}

function Seccion({ titulo, resumen, children, abierta, onCambiar, defecto = false }: { titulo: string; resumen?: string; children: ReactNode; abierta?: boolean; onCambiar?: (v: boolean) => void; defecto?: boolean }) {
  return (
    <Accordion
      defaultExpanded={defecto}
      expanded={abierta}
      onChange={onCambiar ? (_, v) => onCambiar(v) : undefined}
      disableGutters
      variant="outlined"
      sx={{ '&:before': { display: 'none' } }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon size={18} />}>
        <Typography variant="subtitle2" sx={{ flex: 1 }}>
          {titulo}
        </Typography>
        {resumen && (
          <Typography variant="caption" color="text.secondary" sx={{ mr: 1 }}>
            {resumen}
          </Typography>
        )}
      </AccordionSummary>
      <AccordionDetails sx={{ pt: 0 }}>{children}</AccordionDetails>
    </Accordion>
  );
}

/** Pequeño rectángulo con la esquina marcada, para no tener que leer «superior izquierda». */
function IconoEsquina({ e }: { e: EsquinaId }) {
  const x = e === 'si' || e === 'ii' ? 3 : 15;
  const y = e === 'si' || e === 'sd' ? 3 : 21;
  return (
    <svg width="18" height="24" viewBox="0 0 18 24" aria-hidden>
      <rect x="3" y="3" width="12" height="18" fill="#e3f1fa" stroke="#6b7280" strokeWidth="1.2" />
      <circle cx={x} cy={y} r="3" fill="#1565c0" />
    </svg>
  );
}

// ── Textos ───────────────────────────────────────────────────────────────────

const ESQUINAS: { id: EsquinaId; nombre: string; bordeH: string; bordeV: string }[] = [
  { id: 'si', nombre: 'Arriba a la izquierda', bordeH: 'superior', bordeV: 'izquierdo' },
  { id: 'sd', nombre: 'Arriba a la derecha', bordeH: 'superior', bordeV: 'derecho' },
  { id: 'ii', nombre: 'Abajo a la izquierda', bordeH: 'inferior', bordeV: 'izquierdo' },
  { id: 'id', nombre: 'Abajo a la derecha', bordeH: 'inferior', bordeV: 'derecho' },
];
const BORDES: { v: BordeId; t: string }[] = [
  { v: 'sup', t: 'superior' },
  { v: 'der', t: 'derecho' },
  { v: 'inf', t: 'inferior' },
  { v: 'izq', t: 'izquierdo' },
];
const NOMBRE_OP: Record<Operacion['tipo'], string> = { perforacion: 'Perforación', boquete: 'Boquete', chaflan: 'Chaflán', nota: 'Texto' };
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

interface Props {
  plano: Plano;
  letra: string;
  onCambiar: (fn: (p: Plano) => Plano, clave?: string) => void;
  onCambiarPlantilla: () => void;
  onResaltar: (id: string | null) => void;
  seleccionId: string | null;
  onSeleccionar: (id: string | null) => void;
  /** Elimina procesos avisando con opción de deshacer. */
  onEliminar: (ids: string[], descripcion: string) => void;
}

export function EditorPlano({ plano, letra, onCambiar, onCambiarPlantilla, onResaltar, seleccionId, onSeleccionar, onEliminar }: Props) {
  const [verTodo, setVerTodo] = useState(false);
  const [procesosAbierto, setProcesosAbierto] = useState(true);
  const [menuHerraje, setMenuHerraje] = useState<HTMLElement | null>(null);
  const [gruposAbiertos, setGruposAbiertos] = useState<Set<string>>(new Set());
  const tarjetas = useRef(new Map<string, HTMLDivElement>());
  const p = plano.pieza;
  const obs = validarPlano(plano);
  const c = conteosDe(p);
  const numero = (id: string) => p.operaciones.findIndex((o) => o.id === id) + 1;
  const clave = (campo: string) => `campo:${plano.id}:${campo}`;

  const setPieza = (cambios: Partial<Pieza>, campo?: string) => onCambiar((pl) => ({ ...pl, pieza: { ...pl.pieza, ...cambios } }), campo && clave(campo));
  const setEsquina = (e: EsquinaId, t: TratamientoEsquina, campo?: string) => setPieza({ esquinas: { ...p.esquinas, [e]: t } }, campo);
  const setOp = (id: string, cambios: Partial<Operacion>, campo: string) =>
    setPieza({ operaciones: p.operaciones.map((o) => (o.id === id ? ({ ...o, ...cambios } as Operacion) : o)) }, `${id}:${campo}`);
  const agregarOps = (fn: (pz: Pieza) => Pieza) => {
    const antes = new Set(p.operaciones.map((o) => o.id));
    const nueva = fn(p);
    onCambiar((pl) => ({ ...pl, pieza: nueva }));
    const primera = nueva.operaciones.find((o) => !antes.has(o.id));
    if (primera) onSeleccionar(primera.id);
  };

  // Al seleccionar algo en el plano: abrir la sección, desplegar su herraje y mostrar su tarjeta.
  useEffect(() => {
    if (!seleccionId) return;
    setProcesosAbierto(true);
    const g = p.operaciones.find((o) => o.id === seleccionId)?.grupo;
    if (g) setGruposAbiertos((s) => (s.has(g.id) ? s : new Set(s).add(g.id)));
    const t = setTimeout(() => tarjetas.current.get(seleccionId)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 180);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seleccionId]);

  const cambiarForma = (tipo: Contorno['tipo']) => {
    if (tipo === 'rectangular') setPieza({ contorno: { tipo } });
    if (tipo === 'desplome-lateral') setPieza({ contorno: { tipo, lado: 'der', anchoSup: Math.round(p.ancho * 0.95) } });
    if (tipo === 'desplome-superior') setPieza({ contorno: { tipo, lado: 'der', altoLado: Math.round(p.alto * 0.85) } });
  };

  const errores = obs.filter((o) => o.nivel === 'error');
  const avisos = obs.filter((o) => o.nivel === 'aviso');
  const mostrados = verTodo ? obs : [...errores, ...avisos].slice(0, 3);

  const resumenConteos = [
    [c.perf, 'perforación', 'perforaciones', 'PERF'],
    [c.boq, 'boquete', 'boquetes', 'BOQ'],
    [c.dsp, 'despunte', 'despuntes', 'DSP'],
    [c.radios, 'radio', 'radios', 'RADIOS'],
  ] as const;

  // ── Tarjeta de cada proceso ────────────────────────────────────────────────
  const tarjeta = (o: Operacion, dentroDeGrupo: boolean) => {
    const activo = seleccionId === o.id;
    return (
      <Box
        key={o.id}
        ref={(el: HTMLDivElement | null) => {
          if (el) tarjetas.current.set(o.id, el);
          else tarjetas.current.delete(o.id);
        }}
        onMouseEnter={() => onResaltar(o.id)}
        onMouseLeave={() => onResaltar(null)}
        onClick={() => onSeleccionar(o.id)}
        sx={{
          p: 1.25,
          borderRadius: 1,
          border: 1,
          borderColor: activo ? 'primary.main' : dentroDeGrupo ? 'transparent' : 'divider',
          bgcolor: activo ? 'rgba(21,101,192,.05)' : dentroDeGrupo ? 'grey.50' : 'transparent',
          boxShadow: activo ? '0 0 0 1px #1565c0' : 'none',
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
          <Box sx={{ width: 22, height: 22, borderRadius: '50%', bgcolor: activo ? 'primary.main' : 'grey.200', color: activo ? '#fff' : 'text.secondary', fontSize: 12, fontWeight: 700, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            {numero(o.id)}
          </Box>
          <Typography variant="body2" sx={{ fontWeight: 600, flex: 1 }}>
            {NOMBRE_OP[o.tipo]}
            {o.tipo === 'perforacion' && Number.isFinite(o.d) && ` Ø${o.d}`}
            {o.tipo === 'boquete' && ` ${o.largo}×${o.prof}`}
          </Typography>
          <Tooltip title="Quitar">
            <IconButton
              size="small"
              aria-label={`Quitar ${NOMBRE_OP[o.tipo].toLowerCase()} ${numero(o.id)}`}
              onClick={(e) => {
                e.stopPropagation();
                onEliminar([o.id], `${NOMBRE_OP[o.tipo]} ${numero(o.id)} eliminada`);
              }}
            >
              <DeleteOutlineIcon size={18} />
            </IconButton>
          </Tooltip>
        </Stack>

        {o.tipo === 'perforacion' && (
          <Stack spacing={1}>
            <Frase>
              <Typography>Diámetro</Typography>
              <Autocomplete
                freeSolo
                disableClearable
                options={DIAMETROS.map(String)}
                inputValue={Number.isFinite(o.d) ? String(o.d) : ''}
                onInputChange={(_, v) => setOp(o.id, { d: v === '' ? NaN : Number(v) }, 'd')}
                renderInput={(params) => <TextField {...params} size="small" type="number" error={!Number.isFinite(o.d)} />}
                sx={{ width: 96 }}
              />
              <Typography>mm</Typography>
            </Frase>
            <Frase>
              <Typography>Centro a</Typography>
              <Mm value={o.x} onChange={(x) => setOp(o.id, { x }, 'x')} />
              <Sel value={o.refX} width={176} onChange={(refX) => setOp(o.id, { refX }, 'refX')} opciones={[{ v: 'izq', t: 'del borde izquierdo' }, { v: 'der', t: 'del borde derecho' }, { v: 'centro', t: 'del centro' }]} />
            </Frase>
            <Frase>
              <Typography>y a</Typography>
              <Mm value={o.y} onChange={(y) => setOp(o.id, { y }, 'y')} />
              <Sel value={o.refY} width={176} onChange={(refY) => setOp(o.id, { refY }, 'refY')} opciones={[{ v: 'sup', t: 'del borde superior' }, { v: 'inf', t: 'del piso' }, { v: 'centro', t: 'del centro' }]} />
            </Frase>
            {(o.refX === 'centro' || o.refY === 'centro') && (
              <Typography variant="caption" color="text.secondary">
                Desde el centro: un número negativo va hacia la izquierda o hacia arriba.
              </Typography>
            )}
          </Stack>
        )}

        {o.tipo === 'boquete' && (
          <Stack spacing={1}>
            <Frase>
              <Typography>En el borde</Typography>
              <Sel value={o.borde} width={130} onChange={(borde) => setOp(o.id, { borde }, 'borde')} opciones={BORDES} />
            </Frase>
            <Frase>
              <Typography>Empieza a</Typography>
              <Mm value={o.pos} onChange={(pos) => setOp(o.id, { pos }, 'pos')} />
              <Sel
                value={o.desde}
                width={176}
                onChange={(desde) => setOp(o.id, { desde }, 'desde')}
                opciones={o.borde === 'sup' || o.borde === 'inf' ? [{ v: 'inicio', t: 'del extremo izquierdo' }, { v: 'fin', t: 'del extremo derecho' }] : [{ v: 'inicio', t: 'desde arriba' }, { v: 'fin', t: 'desde el piso' }]}
              />
            </Frase>
            <Frase>
              <Typography>Mide</Typography>
              <Mm value={o.largo} onChange={(largo) => setOp(o.id, { largo }, 'largo')} />
              <Typography>a lo largo y entra</Typography>
              <Mm value={o.prof} onChange={(prof) => setOp(o.id, { prof }, 'prof')} />
            </Frase>
            <Frase>
              <Typography>Esquinas de adentro redondeadas</Typography>
              <Mm value={o.radio} min={0} onChange={(radio) => setOp(o.id, { radio }, 'radio')} />
            </Frase>
            <Typography variant="caption" color="text.secondary">
              0 mm = esquinas en escuadra.
            </Typography>
          </Stack>
        )}

        {o.tipo === 'chaflan' && (
          <Frase>
            <Typography>En el borde</Typography>
            <Sel value={o.borde} width={130} onChange={(borde) => setOp(o.id, { borde }, 'borde')} opciones={BORDES} />
            <Typography>de</Typography>
            <Mm value={o.ancho} onChange={(ancho) => setOp(o.id, { ancho }, 'ancho')} />
            <Typography>de ancho</Typography>
          </Frase>
        )}

        {o.tipo === 'nota' && (
          <Stack spacing={0.75}>
            <TextField size="small" label="Texto" value={o.texto} onChange={(e) => setOp(o.id, { texto: e.target.value.toUpperCase() }, 'texto')} fullWidth />
            <Typography variant="caption" color="text.secondary">
              Arrástralo en el plano para ubicarlo.
            </Typography>
          </Stack>
        )}
      </Box>
    );
  };

  // Procesos en el orden de la lista, con los de un mismo herraje juntos.
  const bloques: ({ tipo: 'solo'; op: Operacion } | { tipo: 'grupo'; id: string; nombre: string; ops: Operacion[] })[] = [];
  for (const o of p.operaciones) {
    if (!o.grupo) {
      bloques.push({ tipo: 'solo', op: o });
      continue;
    }
    const existente = bloques.find((b) => b.tipo === 'grupo' && b.id === o.grupo!.id);
    if (existente && existente.tipo === 'grupo') existente.ops.push(o);
    else bloques.push({ tipo: 'grupo', id: o.grupo.id, nombre: o.grupo.nombre, ops: [o] });
  }

  return (
    <Stack spacing={1.5}>
      <Paper variant="outlined" sx={{ p: 1.5 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Chip label={`PLANO ${letra}`} color="primary" size="small" sx={{ fontWeight: 700 }} />
          <TextField
            variant="standard"
            value={plano.nombre}
            onChange={(e) => onCambiar((pl) => ({ ...pl, nombre: e.target.value }), clave('nombre'))}
            sx={{ flex: 1 }}
            slotProps={{ htmlInput: { 'aria-label': 'Nombre del plano' } }}
          />
          <Button size="small" onClick={onCambiarPlantilla}>
            Cambiar plantilla
          </Button>
        </Stack>
        <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 1.25 }}>
          {resumenConteos.map(([n, uno, varios, col]) => (
            <Tooltip key={col} title={`Va en la columna ${col} de la orden de pedido`}>
              <Chip size="small" variant="outlined" color={n ? 'primary' : 'default'} label={plural(n, uno, varios)} />
            </Tooltip>
          ))}
          {c.chaflanMl > 0 && (
            <Tooltip title="Va en la columna CHAFLÁN de la orden de pedido">
              <Chip size="small" variant="outlined" color="primary" label={`${c.chaflanMl.toFixed(2)} m de chaflán`} />
            </Tooltip>
          )}
          <Tooltip title="Ancho × alto × cantidad">
            <Chip size="small" variant="outlined" label={`${(c.m2 * (plano.cantidad || 0)).toFixed(2)} m²`} />
          </Tooltip>
        </Stack>
      </Paper>

      {obs.length === 0 ? (
        <Alert icon={<CheckCircleOutlineIcon size={18} />} severity="success" variant="outlined">
          Todo en orden para templar.
        </Alert>
      ) : (
        <Stack spacing={0.75}>
          {mostrados.map((o, i) => (
            <Alert
              key={i}
              severity={o.nivel === 'error' ? 'error' : 'warning'}
              variant="outlined"
              onClick={o.opId ? () => onSeleccionar(o.opId!) : undefined}
              sx={{ py: 0, fontSize: 13, cursor: o.opId ? 'pointer' : 'default' }}
            >
              {o.texto}
            </Alert>
          ))}
          {obs.length > 3 && (
            <Button size="small" onClick={() => setVerTodo((v) => !v)} sx={{ alignSelf: 'flex-start' }}>
              {verTodo ? 'Ver menos' : `Ver los ${obs.length} avisos`}
            </Button>
          )}
          <Typography variant="caption" color="text.secondary">
            Son recomendaciones generales: confírmalas con el proveedor. Haz clic en un aviso para ver de qué se trata.
          </Typography>
        </Stack>
      )}

      <Seccion titulo="Datos del vidrio" resumen={`${plano.cantidad} × ${plano.color} ${plano.espesor} mm`} defecto>
        <Stack spacing={1.5}>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            <TextField
              label="Cantidad"
              type="number"
              size="small"
              value={Number.isFinite(plano.cantidad) ? plano.cantidad : ''}
              onChange={(e) => onCambiar((pl) => ({ ...pl, cantidad: e.target.value === '' ? NaN : Number(e.target.value) }), clave('cantidad'))}
              onFocus={(e) => e.target.select()}
              sx={{ width: 96 }}
              slotProps={{ htmlInput: { min: 1 } }}
            />
            <Autocomplete
              freeSolo
              disableClearable
              options={COLORES}
              inputValue={plano.color}
              onInputChange={(_, v) => onCambiar((pl) => ({ ...pl, color: v.toUpperCase() }), clave('color'))}
              renderInput={(params) => <TextField {...params} label="Color" size="small" />}
              sx={{ width: 140 }}
            />
            <Autocomplete
              freeSolo
              disableClearable
              options={ESPESORES}
              inputValue={plano.espesor}
              onInputChange={(_, v) => onCambiar((pl) => ({ ...pl, espesor: v }), clave('espesor'))}
              renderInput={(params) => <TextField {...params} label="Espesor (mm)" size="small" />}
              sx={{ width: 130 }}
            />
          </Stack>
          <FormControlLabel
            control={<Switch checked={plano.selloEnCanto} onChange={(e) => onCambiar((pl) => ({ ...pl, selloEnCanto: e.target.checked }))} />}
            label="Sello del templado en el canto"
          />
          <TextField
            label="Observaciones para el proveedor"
            size="small"
            multiline
            minRows={2}
            value={plano.observaciones}
            onChange={(e) => onCambiar((pl) => ({ ...pl, observaciones: e.target.value }), clave('observaciones'))}
          />
        </Stack>
      </Seccion>

      <Seccion titulo="Medidas y forma" resumen={`${p.ancho} × ${p.alto} mm`} defecto>
        <Stack spacing={1.5}>
          <Sel
            label="Forma del vidrio"
            width={330}
            value={p.contorno.tipo}
            onChange={cambiarForma}
            opciones={[
              { v: 'rectangular', t: 'Rectangular' },
              { v: 'desplome-lateral', t: 'Con un lado inclinado (desplome)' },
              { v: 'desplome-superior', t: 'Con el borde de arriba inclinado (descuadre)' },
            ]}
          />
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            <Mm label={p.contorno.tipo === 'desplome-lateral' ? 'Ancho abajo' : 'Ancho'} width={130} value={p.ancho} onChange={(n) => setPieza({ ancho: n }, 'ancho')} />
            {p.contorno.tipo === 'desplome-lateral' && (
              <Mm label="Ancho arriba" width={130} value={p.contorno.anchoSup} onChange={(n) => setPieza({ contorno: { ...(p.contorno as Extract<Contorno, { tipo: 'desplome-lateral' }>), anchoSup: n } }, 'anchoSup')} />
            )}
            <Mm
              label={p.contorno.tipo === 'desplome-superior' ? `Alto (lado ${p.contorno.lado === 'der' ? 'izquierdo' : 'derecho'})` : 'Alto'}
              width={p.contorno.tipo === 'desplome-superior' ? 170 : 130}
              value={p.alto}
              onChange={(n) => setPieza({ alto: n }, 'alto')}
            />
            {p.contorno.tipo === 'desplome-superior' && (
              <Mm label={`Alto (lado ${p.contorno.lado === 'der' ? 'derecho' : 'izquierdo'})`} width={170} value={p.contorno.altoLado} onChange={(n) => setPieza({ contorno: { ...(p.contorno as Extract<Contorno, { tipo: 'desplome-superior' }>), altoLado: n } }, 'altoLado')} />
            )}
          </Stack>
          {p.contorno.tipo === 'desplome-lateral' && (
            <Frase>
              <Typography>El lado inclinado es el</Typography>
              <Sel value={p.contorno.lado} width={130} opciones={[{ v: 'izq', t: 'izquierdo' }, { v: 'der', t: 'derecho' }]} onChange={(lado) => setPieza({ contorno: { ...(p.contorno as Extract<Contorno, { tipo: 'desplome-lateral' }>), lado } })} />
            </Frase>
          )}
          {p.contorno.tipo === 'desplome-superior' && (
            <Frase>
              <Typography>El lado más bajo es el</Typography>
              <Sel value={p.contorno.lado} width={130} opciones={[{ v: 'izq', t: 'izquierdo' }, { v: 'der', t: 'derecho' }]} onChange={(lado) => setPieza({ contorno: { ...(p.contorno as Extract<Contorno, { tipo: 'desplome-superior' }>), lado } })} />
            </Frase>
          )}
        </Stack>
      </Seccion>

      <Seccion titulo="Esquinas" resumen={plural(ESQUINAS.filter((e) => p.esquinas[e.id].tipo !== 'recta').length, 'con corte', 'con corte')}>
        <Stack spacing={1.5}>
          {ESQUINAS.map(({ id, nombre, bordeH, bordeV }) => {
            const t = p.esquinas[id];
            return (
              <Stack key={id} spacing={1}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <IconoEsquina e={id} />
                  <Typography variant="body2" sx={{ width: 150 }}>
                    {nombre}
                  </Typography>
                  <Sel
                    value={t.tipo}
                    width={210}
                    opciones={[
                      { v: 'recta', t: 'Recta' },
                      { v: 'despunte', t: 'Despunte (corte en diagonal)' },
                      { v: 'radio', t: 'Redondeada' },
                      { v: 'muesca', t: 'Recorte rectangular' },
                    ]}
                    onChange={(tipo) => setEsquina(id, tipo === 'recta' ? { tipo } : tipo === 'radio' ? { tipo, r: 20 } : { tipo, a: 30, b: 30 })}
                  />
                </Stack>
                {t.tipo === 'radio' && (
                  <Frase>
                    <Box sx={{ width: 26 }} />
                    <Typography>Radio de</Typography>
                    <Mm value={t.r} onChange={(r) => setEsquina(id, { ...t, r }, `${id}:r`)} />
                  </Frase>
                )}
                {(t.tipo === 'despunte' || t.tipo === 'muesca') && (
                  <Frase>
                    <Box sx={{ width: 26 }} />
                    <Mm value={t.a} onChange={(a) => setEsquina(id, { ...t, a }, `${id}:a`)} />
                    <Typography>sobre el borde {bordeH} y</Typography>
                    <Mm value={t.b} onChange={(b) => setEsquina(id, { ...t, b }, `${id}:b`)} />
                    <Typography>sobre el {bordeV}</Typography>
                  </Frase>
                )}
              </Stack>
            );
          })}
        </Stack>
      </Seccion>

      <Seccion titulo="Perforaciones y cortes" resumen={plural(p.operaciones.length, 'elemento', 'elementos')} abierta={procesosAbierto} onCambiar={setProcesosAbierto}>
        <Stack spacing={1}>
          <Alert icon={<PanToolOutlinedIcon size={18} />} severity="info" variant="outlined" sx={{ py: 0, fontSize: 13 }}>
            Arrastra en el plano para mover. Las medidas saltan de 5 en 5 mm; con <b>Shift</b>, de 1 en 1. Las flechas del teclado mueven 1 mm (con Shift, 10).
          </Alert>

          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            <Button size="small" variant="contained" startIcon={<BuildOutlinedIcon size={18} />} onClick={(e) => setMenuHerraje(e.currentTarget)}>
              Herraje
            </Button>
            <Button
              size="small"
              variant="outlined"
              startIcon={<AddIcon size={18} />}
              onClick={() => agregarOps((pz) => ({ ...pz, operaciones: [...pz.operaciones, { id: nuevoId(), tipo: 'perforacion', d: 8, x: Math.round(pz.ancho / 2), refX: 'izq', y: Math.round(pz.alto / 2), refY: 'sup' }] }))}
            >
              Perforación
            </Button>
            <Button
              size="small"
              variant="outlined"
              startIcon={<AddIcon size={18} />}
              onClick={() => agregarOps((pz) => ({ ...pz, operaciones: [...pz.operaciones, { id: nuevoId(), tipo: 'boquete', borde: 'der', pos: Math.round(pz.alto / 2), desde: 'inicio', largo: 30, prof: 30, radio: 0 }] }))}
            >
              Boquete
            </Button>
            <Button size="small" variant="outlined" startIcon={<AddIcon size={18} />} onClick={() => agregarOps((pz) => ({ ...pz, operaciones: [...pz.operaciones, { id: nuevoId(), tipo: 'chaflan', borde: 'sup', ancho: 10 }] }))}>
              Chaflán
            </Button>
            <Button size="small" variant="outlined" startIcon={<AddIcon size={18} />} onClick={() => agregarOps((pz) => ({ ...pz, operaciones: [...pz.operaciones, { id: nuevoId(), tipo: 'nota', texto: 'NOTA', x: 50, y: 40 }] }))}>
              Texto
            </Button>
          </Stack>
          <Menu anchorEl={menuHerraje} open={!!menuHerraje} onClose={() => setMenuHerraje(null)} slotProps={{ paper: { sx: { maxWidth: 380 } } }}>
            {HERRAJES.map((h) => (
              <MenuItem
                key={h.id}
                onClick={() => {
                  setMenuHerraje(null);
                  agregarOps(h.aplicar);
                }}
              >
                <ListItemText primary={h.nombre} secondary={h.descripcion} slotProps={{ secondary: { sx: { whiteSpace: 'normal', fontSize: 12 } } }} />
              </MenuItem>
            ))}
          </Menu>

          {p.operaciones.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
              Este vidrio no tiene perforaciones ni cortes. Agrega un herraje completo o una perforación suelta.
            </Typography>
          )}

          {bloques.map((b) => {
            if (b.tipo === 'solo') return tarjeta(b.op, false);
            const abierto = gruposAbiertos.has(b.id);
            const activo = b.ops.some((o) => o.id === seleccionId);
            const conteo = b.ops.every((o) => o.tipo === 'perforacion') ? plural(b.ops.length, 'perforación', 'perforaciones') : plural(b.ops.length, 'elemento', 'elementos');
            return (
              <Paper key={b.id} variant="outlined" sx={{ borderColor: activo ? 'primary.main' : 'divider', overflow: 'hidden' }}>
                <Stack
                  direction="row"
                  alignItems="center"
                  spacing={1}
                  sx={{ px: 1.25, py: 0.75, bgcolor: activo ? 'rgba(21,101,192,.05)' : 'grey.50', cursor: 'pointer' }}
                  onClick={() => setGruposAbiertos((s) => {
                    const n = new Set(s);
                    if (n.has(b.id)) n.delete(b.id);
                    else n.add(b.id);
                    return n;
                  })}
                  onMouseEnter={() => onResaltar(b.ops[0].id)}
                  onMouseLeave={() => onResaltar(null)}
                >
                  <BuildOutlinedIcon size={18} color={activo ? '#1565c0' : 'rgba(0, 0, 0, 0.54)'} />
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {b.nombre}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {conteo} · n.º {b.ops.map((o) => numero(o.id)).join(', ')} · se mueven juntas
                    </Typography>
                  </Box>
                  <Tooltip title="Separar para mover cada una por su cuenta">
                    <IconButton
                      size="small"
                      aria-label="Separar herraje"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPieza({ operaciones: p.operaciones.map((o) => (o.grupo?.id === b.id ? { ...o, grupo: undefined } : o)) });
                      }}
                    >
                      <LinkOffIcon size={18} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Quitar el herraje completo">
                    <IconButton
                      size="small"
                      aria-label="Quitar herraje"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEliminar(b.ops.map((o) => o.id), `${b.nombre} eliminado`);
                      }}
                    >
                      <DeleteOutlineIcon size={18} />
                    </IconButton>
                  </Tooltip>
                  <ExpandMoreIcon size={18} style={{ transform: abierto ? 'rotate(180deg)' : 'none', transition: 'transform .2s', color: 'rgba(0, 0, 0, 0.6)' }} />
                </Stack>
                <Collapse in={abierto}>
                  <Stack spacing={0.75} sx={{ p: 0.75 }}>
                    {b.ops.map((o) => tarjeta(o, true))}
                  </Stack>
                </Collapse>
              </Paper>
            );
          })}
        </Stack>
      </Seccion>
    </Stack>
  );
}

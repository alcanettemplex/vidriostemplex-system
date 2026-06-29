import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import axios from 'axios';
import { toast } from 'react-toastify';
import { Plus, Trash2, X } from 'lucide-react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Select, MenuItem, FormControl,
  InputLabel, IconButton, Typography, Box, Divider,
  Grid, Paper, Tabs, Tab, CircularProgress, Autocomplete,
} from '@mui/material';
import { useSelector } from 'react-redux';
import {
  CotizacionType, CotizacionItemType, SeccionItem,
  FORMAS_PAGO, LABEL_SECCION, TODAS_UNIDADES,
} from '../cotizacionesTypes';
import { getClientesCached } from '../../../services/listasCache';

import API from '../../../services/config';

// ─── Esquema Zod ─────────────────────────────────────────────────────────────

const itemSchema = z.object({
  seccion: z.enum(['vidrio', 'acabado', 'gasto_instalacion']),
  descripcion: z.string().min(1, 'Requerido'),
  codigo: z.string().optional().nullable(),
  cantidad: z.coerce.number().positive('Mayor a 0'),
  unidad: z.enum(['M2', 'ML', 'UND', 'GL', 'HR', 'X M2', 'X METRO']),
  precio_unitario: z.coerce.number().nonnegative('≥ 0'),
  producto_ref: z.string().optional().nullable(),
  orden: z.number().int().optional().default(0),
});

const formSchema = z.object({
  cliente_id: z.coerce.number().positive('Seleccione un cliente'),
  nombre_proyecto: z.string().optional().nullable(),
  tipo_cliente: z.enum(['PA', 'PM', 'PB', '']).optional(),
  descuento: z.coerce.number().min(0).max(100).default(0),
  forma_pago: z.string().optional().nullable(),
  validez_dias: z.coerce.number().int().positive().default(30),
  notas: z.string().optional().nullable(),
  estado: z.enum(['borrador', 'enviada']).default('borrador'),
  items: z.array(itemSchema).min(1, 'Agregue al menos un ítem'),
});

type FormValues = z.infer<typeof formSchema>;

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
  cotizacion?: CotizacionType | null;
  onSaved: (cot: CotizacionType) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ITEM_VACIO = (seccion: SeccionItem): Partial<CotizacionItemType> & { seccion: SeccionItem } => ({
  seccion,
  descripcion: '',
  codigo: '',
  cantidad: 1,
  unidad: seccion === 'vidrio' ? 'X M2' : seccion === 'gasto_instalacion' ? 'UND' : 'UND',
  precio_unitario: 0,
  producto_ref: '',
  orden: 0,
});

const formatCOP = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n);

// ─── Componente ───────────────────────────────────────────────────────────────

const CotizacionFormModal: React.FC<Props> = ({ open, onClose, cotizacion, onSaved }) => {
  const token = useSelector((s: any) => s.auth.token);
  const [clientes, setClientes] = useState<any[]>([]);
  const [clientesBuscando, setClientesBuscando] = useState(false);
  const [clienteInput, setClienteInput] = useState('');
  const clienteSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [tabSeccion, setTabSeccion] = useState(0);
  const [saving, setSaving] = useState(false);

  const editing = !!cotizacion;

  const { register, control, handleSubmit, reset, setValue, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(formSchema) as any,
    defaultValues: {
      cliente_id: 0,
      nombre_proyecto: '',
      tipo_cliente: '',
      descuento: 0,
      forma_pago: '',
      validez_dias: 30,
      notas: '',
      estado: 'borrador',
      items: [{ ...ITEM_VACIO('vidrio') } as any],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const watchedItems = useWatch({ control, name: 'items' }) || [];
  const watchedDescuento = useWatch({ control, name: 'descuento' }) || 0;
  const watchedClienteId = useWatch({ control, name: 'cliente_id' });

  // Calcular totales en tiempo real
  const calcTotalSeccion = (seccion: SeccionItem) =>
    watchedItems
      .filter(i => i.seccion === seccion)
      .reduce((acc, i) => acc + (Number(i.cantidad) || 0) * (Number(i.precio_unitario) || 0), 0);

  const totalVidrio = calcTotalSeccion('vidrio');
  const totalAcabados = calcTotalSeccion('acabado');
  const totalGastos = calcTotalSeccion('gasto_instalacion');
  const subtotal = totalVidrio + totalAcabados + totalGastos;
  const descuentoMonto = subtotal * ((Number(watchedDescuento) || 0) / 100);
  const baseGravable = subtotal - descuentoMonto;
  const iva = baseGravable * 0.19;
  const totalNeto = baseGravable + iva;

  // Búsqueda server-side de clientes para el Autocomplete
  useEffect(() => {
    if (clienteSearchRef.current) clearTimeout(clienteSearchRef.current);
    if (clienteInput.trim().length < 2) { setClientes([]); return; }
    setClientesBuscando(true);
    clienteSearchRef.current = setTimeout(async () => {
      try { setClientes(await getClientesCached(clienteInput) || []); }
      catch { setClientes([]); }
      finally { setClientesBuscando(false); }
    }, 300);
    return () => { if (clienteSearchRef.current) clearTimeout(clienteSearchRef.current); };
  }, [clienteInput]);

  // Cargar datos al editar
  useEffect(() => {
    if (open && cotizacion) {
      reset({
        cliente_id: cotizacion.cliente_id,
        nombre_proyecto: cotizacion.nombre_proyecto || '',
        tipo_cliente: (cotizacion.tipo_cliente || '') as any,
        descuento: cotizacion.descuento,
        forma_pago: cotizacion.forma_pago || '',
        validez_dias: cotizacion.validez_dias,
        notas: cotizacion.notas || '',
        estado: cotizacion.estado as 'borrador' | 'enviada',
        items: cotizacion.items?.length
          ? cotizacion.items.map(i => ({
              seccion: i.seccion,
              descripcion: i.descripcion,
              codigo: i.codigo || '',
              cantidad: Number(i.cantidad),
              unidad: i.unidad,
              precio_unitario: Number(i.precio_unitario),
              producto_ref: i.producto_ref || '',
              orden: i.orden,
            }))
          : [{ ...ITEM_VACIO('vidrio') } as any],
      });
    } else if (open && !cotizacion) {
      reset({
        cliente_id: 0,
        nombre_proyecto: '',
        tipo_cliente: '',
        descuento: 0,
        forma_pago: '',
        validez_dias: 30,
        notas: '',
        estado: 'borrador',
        items: [{ ...ITEM_VACIO('vidrio') } as any],
      });
    }
  }, [open, cotizacion, reset]);

  const onSubmit = async (data: FormValues) => {
    setSaving(true);
    try {
      const payload = {
        ...data,
        tipo_cliente: data.tipo_cliente || null,
        items: data.items.map((item, idx) => ({ ...item, orden: idx })),
      };
      let res;
      if (editing) {
        res = await axios.put(`${API}/api/cotizaciones/${cotizacion!.id}`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
      } else {
        res = await axios.post(`${API}/api/cotizaciones`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }
      toast.success(editing ? 'Cotización actualizada' : 'Cotización creada');
      onSaved(res.data);
      onClose();
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Error al guardar cotización';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  // Filtrar items por sección activa
  const SECCIONES: SeccionItem[] = ['vidrio', 'acabado', 'gasto_instalacion'];
  const seccionActiva = SECCIONES[tabSeccion];

  const itemsDeLaSeccion = fields
    .map((f, idx) => ({ ...f, _idx: idx }))
    .filter(f => f.seccion === seccionActiva);

  const addItem = () => append({ ...ITEM_VACIO(seccionActiva) } as any);
  const totalSeccionActiva = [totalVidrio, totalAcabados, totalGastos][tabSeccion];

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xl" fullWidth PaperProps={{ sx: { height: '95vh' } }}>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
        <Typography variant="h6" fontWeight={700}>
          {editing ? `Editar ${cotizacion!.numero_cot}` : 'Nueva Cotización'}
        </Typography>
        <IconButton onClick={onClose} size="small"><X size={18} /></IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ display: 'flex', gap: 2, p: 2, overflow: 'hidden' }}>
        {/* Panel izquierdo: datos generales */}
        <Box sx={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto', pr: 1 }}>
          <Typography variant="subtitle2" color="text.secondary" textTransform="uppercase" fontSize={11}>
            Datos Generales
          </Typography>

          {/* Cliente */}
          <Autocomplete
            options={clientes}
            getOptionLabel={(c: any) => c.nombre_razon_social || ''}
            value={clientes.find(c => c.id === Number(watchedClienteId)) || null}
            onChange={(_, v) => setValue('cliente_id', v?.id || 0, { shouldValidate: true })}
            onInputChange={(_, v) => setClienteInput(v)}
            loading={clientesBuscando}
            noOptionsText={clienteInput.trim().length >= 2 ? 'Sin resultados' : 'Escribe al menos 2 caracteres'}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Cliente *"
                size="small"
                error={!!errors.cliente_id}
                helperText={errors.cliente_id?.message}
                InputProps={{
                  ...params.InputProps,
                  endAdornment: (
                    <>
                      {clientesBuscando ? <CircularProgress color="inherit" size={20} /> : null}
                      {params.InputProps.endAdornment}
                    </>
                  ),
                }}
              />
            )}
          />

          <TextField
            label="Nombre del Proyecto / Obra"
            size="small"
            {...register('nombre_proyecto')}
            error={!!errors.nombre_proyecto}
          />

          <FormControl size="small">
            <InputLabel>Tipo de Cliente</InputLabel>
            <Select label="Tipo de Cliente" {...register('tipo_cliente')} defaultValue="">
              <MenuItem value="">Sin clasificar</MenuItem>
              <MenuItem value="PA">PA — Cliente Alto</MenuItem>
              <MenuItem value="PM">PM — Cliente Medio</MenuItem>
              <MenuItem value="PB">PB — Cliente Bajo</MenuItem>
            </Select>
          </FormControl>

          <FormControl size="small">
            <InputLabel>Forma de Pago</InputLabel>
            <Select label="Forma de Pago" {...register('forma_pago')} defaultValue="">
              <MenuItem value="">— Seleccionar —</MenuItem>
              {FORMAS_PAGO.map(fp => <MenuItem key={fp} value={fp}>{fp}</MenuItem>)}
            </Select>
          </FormControl>

          <TextField
            label="Válida por (días)"
            size="small"
            type="number"
            {...register('validez_dias')}
          />

          <FormControl size="small">
            <InputLabel>Estado inicial</InputLabel>
            <Select label="Estado inicial" {...register('estado')} defaultValue="borrador">
              <MenuItem value="borrador">Borrador</MenuItem>
              <MenuItem value="enviada">Enviada al cliente</MenuItem>
            </Select>
          </FormControl>

          <TextField
            label="Notas / Condiciones adicionales"
            size="small"
            multiline
            rows={4}
            {...register('notas')}
          />

          <Divider />

          {/* Panel de totales */}
          <Typography variant="subtitle2" color="text.secondary" textTransform="uppercase" fontSize={11}>
            Resumen de Totales
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {[
              { label: 'Total Vidrios', value: totalVidrio },
              { label: 'Total Acabados', value: totalAcabados },
              { label: 'Total Gastos Inst.', value: totalGastos },
            ].map(({ label, value }) => (
              <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="caption" color="text.secondary">{label}</Typography>
                <Typography variant="caption">{formatCOP(value)}</Typography>
              </Box>
            ))}

            <Divider sx={{ my: 0.5 }} />

            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="caption" color="text.secondary">Subtotal</Typography>
              <Typography variant="caption">{formatCOP(subtotal)}</Typography>
            </Box>

            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="caption" color="text.secondary">Descuento</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <TextField
                  size="small"
                  type="number"
                  {...register('descuento')}
                  inputProps={{ style: { width: 50, textAlign: 'right', padding: '2px 4px' } }}
                  sx={{ '& .MuiOutlinedInput-root': { height: 24 } }}
                />
                <Typography variant="caption">%</Typography>
              </Box>
            </Box>

            {Number(watchedDescuento) > 0 && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="caption" color="error.main">- Descuento</Typography>
                <Typography variant="caption" color="error.main">-{formatCOP(descuentoMonto)}</Typography>
              </Box>
            )}

            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="caption" color="text.secondary">Base Gravable</Typography>
              <Typography variant="caption">{formatCOP(baseGravable)}</Typography>
            </Box>

            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="caption" color="text.secondary">IVA (19%)</Typography>
              <Typography variant="caption">+{formatCOP(iva)}</Typography>
            </Box>

            <Divider sx={{ my: 0.5 }} />

            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2" fontWeight={700}>TOTAL NETO</Typography>
              <Typography variant="body2" fontWeight={700} color="primary.main">{formatCOP(totalNeto)}</Typography>
            </Box>
          </Box>
        </Box>

        <Divider orientation="vertical" flexItem />

        {/* Panel derecho: tabla de items */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Tabs value={tabSeccion} onChange={(_, v) => setTabSeccion(v)} sx={{ mb: 1 }}>
            {SECCIONES.map((s, i) => (
              <Tab
                key={s}
                label={`${LABEL_SECCION[s]} (${fields.filter(f => f.seccion === s).length})`}
                sx={{ fontSize: 12 }}
              />
            ))}
          </Tabs>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="caption" color="text.secondary">
              Subtotal {LABEL_SECCION[seccionActiva]}: <strong>{formatCOP(totalSeccionActiva)}</strong>
            </Typography>
            <Button
              size="small"
              variant="outlined"
              startIcon={<Plus size={14} />}
              onClick={addItem}
            >
              Agregar ítem
            </Button>
          </Box>

          {/* Encabezado de la tabla */}
          <Box sx={{ display: 'grid', gridTemplateColumns: '120px 1fr 80px 100px 120px 110px 32px', gap: 1, mb: 0.5, px: 0.5 }}>
            {['Código', 'Descripción', 'Cant.', 'Unidad', 'P. Unitario', 'P. Venta', ''].map(h => (
              <Typography key={h} variant="caption" color="text.secondary" fontWeight={600}>{h}</Typography>
            ))}
          </Box>

          <Divider sx={{ mb: 1 }} />

          {/* Filas de items */}
          <Box sx={{ flex: 1, overflowY: 'auto' }}>
            {itemsDeLaSeccion.length === 0 ? (
              <Typography variant="body2" color="text.secondary" textAlign="center" mt={4}>
                Sin ítems en esta sección. Haz clic en "Agregar ítem".
              </Typography>
            ) : (
              itemsDeLaSeccion.map(({ _idx }) => {
                const cant = Number(watchedItems[_idx]?.cantidad) || 0;
                const precio = Number(watchedItems[_idx]?.precio_unitario) || 0;
                const pventa = cant * precio;

                return (
                  <Box
                    key={_idx}
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: '120px 1fr 80px 100px 120px 110px 32px',
                      gap: 1,
                      mb: 1,
                      alignItems: 'center',
                      backgroundColor: seccionActiva === 'gasto_instalacion' ? 'amber.50' : 'transparent',
                      px: 0.5,
                    }}
                  >
                    <TextField
                      size="small"
                      placeholder="Código"
                      {...register(`items.${_idx}.codigo`)}
                      inputProps={{ style: { fontSize: 12 } }}
                    />
                    <TextField
                      size="small"
                      placeholder="Descripción *"
                      {...register(`items.${_idx}.descripcion`)}
                      error={!!errors.items?.[_idx]?.descripcion}
                      inputProps={{ style: { fontSize: 12 } }}
                    />
                    <TextField
                      size="small"
                      type="number"
                      placeholder="Cant."
                      {...register(`items.${_idx}.cantidad`)}
                      inputProps={{ min: 0, step: 0.001, style: { fontSize: 12 } }}
                    />
                    <FormControl size="small">
                      <Select {...register(`items.${_idx}.unidad`)} defaultValue="UND" sx={{ fontSize: 12 }}>
                        {TODAS_UNIDADES.map(u => <MenuItem key={u} value={u} sx={{ fontSize: 12 }}>{u}</MenuItem>)}
                      </Select>
                    </FormControl>
                    <TextField
                      size="small"
                      type="number"
                      placeholder="$ Unitario"
                      {...register(`items.${_idx}.precio_unitario`)}
                      inputProps={{ min: 0, step: 100, style: { fontSize: 12 } }}
                    />
                    <Typography variant="caption" fontWeight={600} textAlign="right" pr={1}>
                      {formatCOP(pventa)}
                    </Typography>
                    <IconButton size="small" color="error" onClick={() => remove(_idx)}>
                      <Trash2 size={14} />
                    </IconButton>
                  </Box>
                );
              })
            )}
          </Box>
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={saving}>Cancelar</Button>
        <Button
          variant="contained"
          onClick={handleSubmit(onSubmit as any)}
          disabled={saving}
          startIcon={saving ? <CircularProgress size={16} /> : undefined}
        >
          {saving ? 'Guardando...' : editing ? 'Actualizar' : 'Crear Cotización'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CotizacionFormModal;

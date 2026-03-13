import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface MovimientoContable {
  id: number;
  odp_id?: number;
  tipo: 'ingreso' | 'egreso';
  concepto: string;
  monto: number;
  fecha: string;
  metodo_pago: string;
  comprobante_url?: string;
  registrado_por: string;
  estado: 'registrado' | 'verificado' | 'anulado';
}

interface ResumenContable {
  total_ingresos: number;
  total_egresos: number;
  saldo_neto: number;
  por_cobrar: number;
}

interface ContabilidadState {
  movimientos: MovimientoContable[];
  resumen: ResumenContable;
  loading: boolean;
  error: string | null;
  filtroTipo: string;
  filtroMes: string;
}

const initialState: ContabilidadState = {
  movimientos: [],
  resumen: {
    total_ingresos: 0,
    total_egresos: 0,
    saldo_neto: 0,
    por_cobrar: 0,
  },
  loading: false,
  error: null,
  filtroTipo: 'todos',
  filtroMes: '',
};

const contabilidadSlice = createSlice({
  name: 'contabilidad',
  initialState,
  reducers: {
    fetchContabilidadStart(state) {
      state.loading = true;
      state.error = null;
    },
    fetchContabilidadSuccess(state, action: PayloadAction<{ movimientos: MovimientoContable[]; resumen: ResumenContable }>) {
      state.loading = false;
      state.movimientos = action.payload.movimientos;
      state.resumen = action.payload.resumen;
    },
    fetchContabilidadFailure(state, action: PayloadAction<string>) {
      state.loading = false;
      state.error = action.payload;
    },
    setFiltroTipo(state, action: PayloadAction<string>) {
      state.filtroTipo = action.payload;
    },
    setFiltroMes(state, action: PayloadAction<string>) {
      state.filtroMes = action.payload;
    },
    addMovimiento(state, action: PayloadAction<MovimientoContable>) {
      state.movimientos.unshift(action.payload);
    },
    updateMovimiento(state, action: PayloadAction<MovimientoContable>) {
      const idx = state.movimientos.findIndex((m) => m.id === action.payload.id);
      if (idx !== -1) state.movimientos[idx] = action.payload;
    },
  },
});

export const {
  fetchContabilidadStart,
  fetchContabilidadSuccess,
  fetchContabilidadFailure,
  setFiltroTipo,
  setFiltroMes,
  addMovimiento,
  updateMovimiento,
} = contabilidadSlice.actions;
export default contabilidadSlice.reducer;

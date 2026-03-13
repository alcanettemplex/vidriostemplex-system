import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface Compra {
  id: number;
  odp_id?: number;
  proveedor: string;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  total: number;
  estado: 'pendiente' | 'aprobada' | 'recibida' | 'cancelada';
  fecha_solicitud: string;
  fecha_recepcion?: string;
  solicitado_por: string;
}

interface ComprasState {
  list: Compra[];
  loading: boolean;
  error: string | null;
  filtroEstado: string;
}

const initialState: ComprasState = {
  list: [],
  loading: false,
  error: null,
  filtroEstado: 'todas',
};

const comprasSlice = createSlice({
  name: 'compras',
  initialState,
  reducers: {
    fetchComprasStart(state) {
      state.loading = true;
      state.error = null;
    },
    fetchComprasSuccess(state, action: PayloadAction<Compra[]>) {
      state.loading = false;
      state.list = action.payload;
    },
    fetchComprasFailure(state, action: PayloadAction<string>) {
      state.loading = false;
      state.error = action.payload;
    },
    setFiltroEstado(state, action: PayloadAction<string>) {
      state.filtroEstado = action.payload;
    },
    addCompra(state, action: PayloadAction<Compra>) {
      state.list.unshift(action.payload);
    },
    updateCompra(state, action: PayloadAction<Compra>) {
      const idx = state.list.findIndex((c) => c.id === action.payload.id);
      if (idx !== -1) state.list[idx] = action.payload;
    },
    removeCompra(state, action: PayloadAction<number>) {
      state.list = state.list.filter((c) => c.id !== action.payload);
    },
  },
});

export const {
  fetchComprasStart,
  fetchComprasSuccess,
  fetchComprasFailure,
  setFiltroEstado,
  addCompra,
  updateCompra,
  removeCompra,
} = comprasSlice.actions;
export default comprasSlice.reducer;

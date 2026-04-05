import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { CotizacionType } from './cotizacionesTypes';

interface CotizacionesState {
  list: CotizacionType[];
  loading: boolean;
  error: string | null;
}

const initialState: CotizacionesState = {
  list: [],
  loading: false,
  error: null,
};

const cotizacionesSlice = createSlice({
  name: 'cotizaciones',
  initialState,
  reducers: {
    fetchCotizacionesStart(state) {
      state.loading = true;
      state.error = null;
    },
    fetchCotizacionesSuccess(state, action: PayloadAction<CotizacionType[]>) {
      state.loading = false;
      state.list = action.payload;
    },
    fetchCotizacionesFailure(state, action: PayloadAction<string>) {
      state.loading = false;
      state.error = action.payload;
    },
    addCotizacion(state, action: PayloadAction<CotizacionType>) {
      state.list.unshift(action.payload);
    },
    updateCotizacionInList(state, action: PayloadAction<CotizacionType>) {
      const idx = state.list.findIndex(c => c.id === action.payload.id);
      if (idx >= 0) state.list[idx] = action.payload;
    },
    removeCotizacion(state, action: PayloadAction<number>) {
      state.list = state.list.filter(c => c.id !== action.payload);
    },
  },
});

export const {
  fetchCotizacionesStart,
  fetchCotizacionesSuccess,
  fetchCotizacionesFailure,
  addCotizacion,
  updateCotizacionInList,
  removeCotizacion,
} = cotizacionesSlice.actions;

export default cotizacionesSlice.reducer;

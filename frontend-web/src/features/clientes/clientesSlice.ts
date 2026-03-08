import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  list: [],
  loading: false,
  error: null,
};

const clientesSlice = createSlice({
  name: 'clientes',
  initialState,
  reducers: {
    fetchClientesStart(state) { state.loading = true; },
    fetchClientesSuccess(state, action) { state.loading = false; state.list = action.payload; },
    fetchClientesFailure(state, action) { state.loading = false; state.error = action.payload; },
  },
});

export const { fetchClientesStart, fetchClientesSuccess, fetchClientesFailure } = clientesSlice.actions;
export default clientesSlice.reducer;

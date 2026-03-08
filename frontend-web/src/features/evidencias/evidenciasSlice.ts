import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  list: [],
  loading: false,
  error: null,
};

const evidenciasSlice = createSlice({
  name: 'evidencias',
  initialState,
  reducers: {
    fetchEvidenciasStart(state) { state.loading = true; },
    fetchEvidenciasSuccess(state, action) { state.loading = false; state.list = action.payload; },
    fetchEvidenciasFailure(state, action) { state.loading = false; state.error = action.payload; },
  },
});

export const { fetchEvidenciasStart, fetchEvidenciasSuccess, fetchEvidenciasFailure } = evidenciasSlice.actions;
export default evidenciasSlice.reducer;

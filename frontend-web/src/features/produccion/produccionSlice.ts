import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  list: [],
  loading: false,
  error: null,
};

const produccionSlice = createSlice({
  name: 'produccion',
  initialState,
  reducers: {
    fetchProduccionStart(state) { state.loading = true; },
    fetchProduccionSuccess(state, action) { state.loading = false; state.list = action.payload; },
    fetchProduccionFailure(state, action) { state.loading = false; state.error = action.payload; },
  },
});

export const { fetchProduccionStart, fetchProduccionSuccess, fetchProduccionFailure } = produccionSlice.actions;
export default produccionSlice.reducer;

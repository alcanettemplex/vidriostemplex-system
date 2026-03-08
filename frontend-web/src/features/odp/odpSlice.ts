import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  list: [],
  loading: false,
  error: null,
};

const odpSlice = createSlice({
  name: 'odp',
  initialState,
  reducers: {
    fetchODPsStart(state) { state.loading = true; },
    fetchODPsSuccess(state, action) { state.loading = false; state.list = action.payload; },
    fetchODPsFailure(state, action) { state.loading = false; state.error = action.payload; },
  },
});

export const { fetchODPsStart, fetchODPsSuccess, fetchODPsFailure } = odpSlice.actions;
export default odpSlice.reducer;

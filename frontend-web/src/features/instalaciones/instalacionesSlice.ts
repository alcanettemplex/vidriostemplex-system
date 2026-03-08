import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  list: [],
  loading: false,
  error: null,
};

const instalacionesSlice = createSlice({
  name: 'instalaciones',
  initialState,
  reducers: {
    fetchInstalacionesStart(state) { state.loading = true; },
    fetchInstalacionesSuccess(state, action) { state.loading = false; state.list = action.payload; },
    fetchInstalacionesFailure(state, action) { state.loading = false; state.error = action.payload; },
  },
});

export const { fetchInstalacionesStart, fetchInstalacionesSuccess, fetchInstalacionesFailure } = instalacionesSlice.actions;
export default instalacionesSlice.reducer;

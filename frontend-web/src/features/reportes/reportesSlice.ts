import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  list: [],
  loading: false,
  error: null,
};

const reportesSlice = createSlice({
  name: 'reportes',
  initialState,
  reducers: {
    fetchReportesStart(state) { state.loading = true; },
    fetchReportesSuccess(state, action) { state.loading = false; state.list = action.payload; },
    fetchReportesFailure(state, action) { state.loading = false; state.error = action.payload; },
  },
});

export const { fetchReportesStart, fetchReportesSuccess, fetchReportesFailure } = reportesSlice.actions;
export default reportesSlice.reducer;

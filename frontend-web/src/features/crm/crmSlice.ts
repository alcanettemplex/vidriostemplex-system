import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface CRMState {
  leads: any[];
  actividades: any[];
  loading: boolean;
  error: string | null;
}

const initialState: CRMState = {
  leads: [],
  actividades: [],
  loading: false,
  error: null,
};

const crmSlice = createSlice({
  name: 'crm',
  initialState,
  reducers: {
    fetchLeadsStart(state) {
      state.loading = true;
      state.error = null;
    },
    fetchLeadsSuccess(state, action: PayloadAction<any[]>) {
      state.loading = false;
      state.leads = action.payload;
    },
    fetchLeadsFailure(state, action: PayloadAction<string>) {
      state.loading = false;
      state.error = action.payload;
    },
    addLead(state, action: PayloadAction<any>) {
      state.leads.unshift(action.payload);
    },
    updateLead(state, action: PayloadAction<any>) {
      const index = state.leads.findIndex(l => l.id === action.payload.id);
      if (index !== -1) {
        state.leads[index] = action.payload;
      }
    },
    fetchActividadesSuccess(state, action: PayloadAction<any[]>) {
      state.actividades = action.payload;
    }
  },
});

export const { 
  fetchLeadsStart, 
  fetchLeadsSuccess, 
  fetchLeadsFailure,
  addLead,
  updateLead,
  fetchActividadesSuccess
} = crmSlice.actions;

export default crmSlice.reducer;

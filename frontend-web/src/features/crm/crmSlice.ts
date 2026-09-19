import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface CRMState {
  leads: any[];
  leadsSinRespuesta: any[];
  loadingSinRespuesta: boolean;
  actividades: any[];
  loading: boolean;
  error: string | null;
  selectedLeadId: number | null;
}

const initialState: CRMState = {
  leads: [],
  leadsSinRespuesta: [],
  loadingSinRespuesta: false,
  actividades: [],
  loading: false,
  error: null,
  selectedLeadId: null,
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
    fetchLeadsSinRespuestaStart(state) {
      state.loadingSinRespuesta = true;
    },
    fetchLeadsSinRespuestaSuccess(state, action: PayloadAction<any[]>) {
      state.loadingSinRespuesta = false;
      state.leadsSinRespuesta = action.payload;
    },
    addLeadSinRespuesta(state, action: PayloadAction<any>) {
      state.leadsSinRespuesta.unshift(action.payload);
    },
    moverLeadAlPipeline(state, action: PayloadAction<any>) {
      // Quitar del tab sin-respuesta y agregar al pipeline
      state.leadsSinRespuesta = state.leadsSinRespuesta.filter(l => l.id !== action.payload.id);
      state.leads.unshift(action.payload);
    },
    addLead(state, action: PayloadAction<any>) {
      // Rutear según respondio
      if (action.payload.respondio === 'No responde') {
        state.leadsSinRespuesta.unshift(action.payload);
      } else {
        state.leads.unshift(action.payload);
      }
    },
    updateLead(state, action: PayloadAction<any>) {
      const index = state.leads.findIndex(l => l.id === action.payload.id);
      if (index !== -1) {
        state.leads[index] = action.payload;
      }
    },
    fetchActividadesSuccess(state, action: PayloadAction<any[]>) {
      state.actividades = action.payload;
    },
    setSelectedLead(state, action: PayloadAction<number | null>) {
      state.selectedLeadId = action.payload;
    },
  },
});

export const {
  fetchLeadsStart,
  fetchLeadsSuccess,
  fetchLeadsFailure,
  addLead,
  updateLead,
  fetchActividadesSuccess,
  setSelectedLead,
  fetchLeadsSinRespuestaStart,
  fetchLeadsSinRespuestaSuccess,
  addLeadSinRespuesta,
  moverLeadAlPipeline,
} = crmSlice.actions;

export default crmSlice.reducer;

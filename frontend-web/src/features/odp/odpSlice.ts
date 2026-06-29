import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import axios from 'axios';
import API from '../../services/config';

interface ODPState {
  cache: Record<number, any>;
  loading: Record<number, boolean>;
  errors: Record<number, string | null>;
}

const initialState: ODPState = {
  cache: {},
  loading: {},
  errors: {},
};

export const fetchODPById = createAsyncThunk(
  'odp/fetchById',
  async (id: number, { rejectWithValue }) => {
    try {
      const token = sessionStorage.getItem('token');
      const { data } = await axios.get(`${API}/api/odp/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      return data;
    } catch (err: any) {
      return rejectWithValue(err?.response?.data?.error || 'Error al cargar ODP');
    }
  }
);

const odpSlice = createSlice({
  name: 'odp',
  initialState,
  reducers: {
    setCachedODP(state, action: PayloadAction<{ id: number; data: any }>) {
      state.cache[action.payload.id] = action.payload.data;
    },
    clearODPCache(state, action: PayloadAction<number | undefined>) {
      if (action.payload !== undefined) {
        delete state.cache[action.payload];
        delete state.loading[action.payload];
        delete state.errors[action.payload];
      } else {
        state.cache = {};
        state.loading = {};
        state.errors = {};
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchODPById.pending, (state, action) => {
        state.loading[action.meta.arg] = true;
        state.errors[action.meta.arg] = null;
      })
      .addCase(fetchODPById.fulfilled, (state, action) => {
        state.cache[action.meta.arg] = action.payload;
        state.loading[action.meta.arg] = false;
      })
      .addCase(fetchODPById.rejected, (state, action) => {
        state.loading[action.meta.arg] = false;
        state.errors[action.meta.arg] = action.payload as string;
      });
  },
});

export const { setCachedODP, clearODPCache } = odpSlice.actions;
export default odpSlice.reducer;

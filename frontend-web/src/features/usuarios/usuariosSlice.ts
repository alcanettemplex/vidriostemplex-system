import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface Usuario {
  id: number;
  username: string;
  nombre_completo: string;
  email: string;
  celular?: string;
  rol: string;
  creado_en: string;
}

interface UsuariosState {
  list: Usuario[];
  loading: boolean;
  error: string | null;
  filtroRol: string;
}

const initialState: UsuariosState = {
  list: [],
  loading: false,
  error: null,
  filtroRol: 'todos',
};

const usuariosSlice = createSlice({
  name: 'usuarios',
  initialState,
  reducers: {
    fetchUsuariosStart(state) {
      state.loading = true;
      state.error = null;
    },
    fetchUsuariosSuccess(state, action: PayloadAction<Usuario[]>) {
      state.loading = false;
      state.list = action.payload;
    },
    fetchUsuariosFailure(state, action: PayloadAction<string>) {
      state.loading = false;
      state.error = action.payload;
    },
    setFiltroRol(state, action: PayloadAction<string>) {
      state.filtroRol = action.payload;
    },
    addUsuario(state, action: PayloadAction<Usuario>) {
      state.list.unshift(action.payload);
    },
    updateUsuario(state, action: PayloadAction<Usuario>) {
      const idx = state.list.findIndex((u) => u.id === action.payload.id);
      if (idx !== -1) state.list[idx] = action.payload;
    },
    removeUsuario(state, action: PayloadAction<number>) {
      state.list = state.list.filter((u) => u.id !== action.payload);
    },
  },
});

export const {
  fetchUsuariosStart,
  fetchUsuariosSuccess,
  fetchUsuariosFailure,
  setFiltroRol,
  addUsuario,
  updateUsuario,
  removeUsuario,
} = usuariosSlice.actions;
export default usuariosSlice.reducer;

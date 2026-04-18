import { createSlice } from '@reduxjs/toolkit';

const storedToken = sessionStorage.getItem('token');
const storedUser = sessionStorage.getItem('user');

const initialState = {
  user: storedUser ? JSON.parse(storedUser) : null,
  token: storedToken || null,
  loading: false,
  error: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    loginStart(state) { state.loading = true; },
    loginSuccess(state, action) { state.loading = false; state.user = action.payload.user; state.token = action.payload.token; },
    loginFailure(state, action) { state.loading = false; state.error = action.payload; },
    logout(state) {
      state.user = null;
      state.token = null;
      sessionStorage.removeItem('token');
      sessionStorage.removeItem('user');
    },
  },
});

export const { loginStart, loginSuccess, loginFailure, logout } = authSlice.actions;
export default authSlice.reducer;

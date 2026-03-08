import { createSlice } from '@reduxjs/toolkit';

interface NotificationsState {
  notifications: any[];
}

const initialState: NotificationsState = {
  notifications: [],
};

const notificationsSlice = createSlice({
  name: 'notifications',
  initialState,
  reducers: {
    received(state, action) {
      state.notifications.unshift(action.payload);
    },
    clear(state) {
      state.notifications = [];
    },
  },
});

export const { received, clear } = notificationsSlice.actions;
export default notificationsSlice.reducer;

import api from './api.js';

export const registerUser = (payload) => api.post('/auth/register', payload);
export const loginUser = (payload) => api.post('/auth/login', payload);
export const loginAdministrator = (payload) => api.post('/admin/login', payload);
export const logoutUser = (token) => api.post('/auth/logout', {}, { headers: { Authorization: `Bearer ${token}` } });
export const getCurrentUser = () => api.get('/auth/me');
export const requestPasswordReset = (email) => api.post('/auth/forgot-password', { email });
export const resetPassword = ({ token, password, confirmPassword }) => api.post('/auth/reset-password', {
  token,
  password,
  confirmPassword,
});
export const verifyEmail = (token) => api.post('/auth/verify-email', { token });

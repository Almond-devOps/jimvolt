import axios from 'axios';

const getStoredToken = () => localStorage.getItem('jimvolt_token') || sessionStorage.getItem('jimvolt_token');
const clearStoredAuth = () => {
  localStorage.removeItem('jimvolt_token');
  localStorage.removeItem('jimvolt_user');
  sessionStorage.removeItem('jimvolt_token');
  sessionStorage.removeItem('jimvolt_user');
};

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const requestUrl = error.config?.url || '';
    const isCredentialSubmission = /\/(?:auth\/login|admin\/login)\/?$/.test(requestUrl);
    if (error.response?.status === 401 && !isCredentialSubmission) {
      clearStoredAuth();
      window.dispatchEvent(new Event('jimvolt:unauthorized'));
    }
    return Promise.reject(error);
  },
);

export default api;

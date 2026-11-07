import api from './api.js';

export const getConversations = (params = {}) => api.get('/messages/conversations', { params });
export const startConversation = (advertisementId) => api.post('/messages/conversations', { advertisementId });
export const getConversation = (id) => api.get(`/messages/conversations/${id}`);
export const getConversationMessages = (id, params = {}) => api.get(`/messages/conversations/${id}/messages`, { params });
export const sendConversationMessage = (id, payload) => api.post(`/messages/conversations/${id}/messages`, payload);
export const markConversationRead = (id) => api.put(`/messages/conversations/${id}/read`);
export const archiveConversation = (id) => api.delete(`/messages/conversations/${id}`);
export const reportConversation = (id, payload) => api.post(`/messages/conversations/${id}/report`, payload);
export async function uploadMessageImages(files) {
  const formData = new FormData();
  files.forEach((file) => formData.append('images', file));
  const { data } = await api.post('/messages/uploads', formData, { timeout: 60000 });
  return data.attachments;
}

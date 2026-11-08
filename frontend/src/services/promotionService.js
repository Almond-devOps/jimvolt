import api from './api.js';

export const getPromotionPackages = () => api.get('/payments/packages');
export const getMyPromotions = () => api.get('/payments/my-promotions');
export const initializePromotion = ({ advertisementId, packageId }) => api.post('/payments/initialize', { advertisementId, packageId });
export const verifyPromotion = (reference) => api.get(`/payments/verify/${encodeURIComponent(reference)}`);
export const trackPromotionEvent = (advertisementId, event) => api.post(`/payments/track/${advertisementId}`, { event });

export const getAdminMonetization = (params = {}) => api.get('/admin/monetization', { params });
export const getAdminPromotionPackages = () => api.get('/admin/promotion-packages');
export const getAdminPromotions = (params = {}) => api.get('/admin/promotions', { params });
export const saveAdminPromotionPackage = (payload, id) => id ? api.put(`/admin/promotion-packages/${id}`, payload) : api.post('/admin/promotion-packages', payload);
export const updateAdminPromotionStatus = (id, status) => api.patch(`/admin/promotions/${id}/status`, { status });

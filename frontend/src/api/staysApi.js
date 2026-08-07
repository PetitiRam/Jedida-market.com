import client from './client';

// Public browse/search
export const searchProperties = (params) => client.get('/stays/properties', { params });
export const getProperty = (id) => client.get(`/stays/properties/${id}`);

// Host: property CRUD
export const myProperties = () => client.get('/stays/my-properties');
export const createProperty = (payload) => client.post('/stays/properties', payload);
export const updateProperty = (id, payload) => client.patch(`/stays/properties/${id}`, payload);
export const setPropertyVisibility = (id, paused) => client.patch(`/stays/properties/${id}/visibility`, { paused });
export const deleteProperty = (id) => client.delete(`/stays/properties/${id}`);

// Host: media
export const addMedia = (propertyId, payload) => client.post(`/stays/properties/${propertyId}/media`, payload);
export const deleteMedia = (propertyId, mediaId) => client.delete(`/stays/properties/${propertyId}/media/${mediaId}`);
export const setCoverMedia = (propertyId, mediaId) => client.patch(`/stays/properties/${propertyId}/media/${mediaId}/cover`);
export const reorderMedia = (propertyId, order) => client.patch(`/stays/properties/${propertyId}/media/reorder`, { order });

// Availability
export const getAvailability = (propertyId, start, end) =>
  client.get(`/stays/properties/${propertyId}/availability`, { params: { start, end } });
export const setAvailability = (propertyId, dates) =>
  client.put(`/stays/properties/${propertyId}/availability`, { dates });

// Pricing rules
export const listPricingRules = (propertyId) => client.get(`/stays/properties/${propertyId}/pricing-rules`);
export const createPricingRule = (propertyId, payload) => client.post(`/stays/properties/${propertyId}/pricing-rules`, payload);
export const updatePricingRule = (propertyId, ruleId, payload) => client.patch(`/stays/properties/${propertyId}/pricing-rules/${ruleId}`, payload);
export const deletePricingRule = (propertyId, ruleId) => client.delete(`/stays/properties/${propertyId}/pricing-rules/${ruleId}`);

// Special offers
export const listOffers = (propertyId) => client.get(`/stays/properties/${propertyId}/offers`);
export const createOffer = (propertyId, payload) => client.post(`/stays/properties/${propertyId}/offers`, payload);
export const deleteOffer = (propertyId, offerId) => client.delete(`/stays/properties/${propertyId}/offers/${offerId}`);

// Admin
export const adminListPending = () => client.get('/stays/admin/pending');
export const adminReviewProperty = (id, action, notes) => client.patch(`/stays/admin/properties/${id}/review`, { action, notes });

// Bookings (Phase B)
export const createBooking = (propertyId, payload) => client.post(`/stays/properties/${propertyId}/bookings`, payload);
export const submitBookingPayment = (bookingId, payload) => client.post(`/stays/bookings/${bookingId}/submit-payment`, payload);
export const myBookingsAsGuest = () => client.get('/stays/my-bookings');
export const myBookingsAsHost = () => client.get('/stays/host/bookings');
export const cancelBooking = (bookingId, reason) => client.patch(`/stays/bookings/${bookingId}/cancel`, { reason });
export const completeBooking = (bookingId) => client.patch(`/stays/bookings/${bookingId}/complete`);

// Admin: bookings
export const adminListPendingBookingPayments = () => client.get('/stays/admin/bookings/pending-payments');
export const adminConfirmBookingPayment = (bookingId) => client.patch(`/stays/admin/bookings/${bookingId}/confirm-payment`);
export const adminRejectBookingPayment = (bookingId, reason) => client.patch(`/stays/admin/bookings/${bookingId}/reject-payment`, { reason });

// Digital Stay Pass (Phase C)
export const getStayPass = (bookingId) => client.get(`/stays/bookings/${bookingId}/pass`);
export const downloadStayPassPdf = (bookingId) => client.get(`/stays/bookings/${bookingId}/pass/pdf`, { responseType: 'blob' });
export const createPassShareLink = (passId, payload) => client.post(`/stays/passes/${passId}/share`, payload);
export const listPassShareLinks = (passId) => client.get(`/stays/passes/${passId}/shares`);
export const revokePassShareLink = (passId, shareId) => client.patch(`/stays/passes/${passId}/shares/${shareId}/revoke`);

// Public verification (no auth)
export const verifyPassByCode = (code) => client.get(`/stays/verify/${code}`);
export const verifyPassByShareToken = (token) => client.get(`/stays/verify/share/${token}`);

// Dashboards (Phase D)
export const toggleSavedProperty = (propertyId) => client.post(`/stays/saved/${propertyId}/toggle`);
export const listSavedProperties = () => client.get('/stays/saved');
export const getGuestOverview = () => client.get('/stays/guest/overview');
export const getHostOverview = () => client.get('/stays/host/overview');

// Reviews + Trust Badges (Phase E)
export const listPropertyReviews = (propertyId) => client.get(`/stays/properties/${propertyId}/reviews`);
export const getReviewEligibility = (bookingId) => client.get(`/stays/bookings/${bookingId}/review-eligibility`);
export const createReview = (bookingId, payload) => client.post(`/stays/bookings/${bookingId}/review`, payload);
export const replyToReview = (reviewId, reply) => client.patch(`/stays/reviews/${reviewId}/reply`, { reply });
export const listHostReviews = () => client.get('/stays/host/reviews');
export const getHostTrust = (userId) => client.get(`/stays/hosts/${userId}/trust`);

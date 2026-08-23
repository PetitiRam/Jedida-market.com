import client from './client';

// ---- Provider directory ----
export const listProviders = (params) => client.get('/logistics-hub/providers', { params });
export const adminCreateProvider = (payload) => client.post('/logistics-hub/admin/providers', payload);
export const adminUpdateProvider = (id, payload) => client.patch(`/logistics-hub/admin/providers/${id}`, payload);

// ---- Quotes ----
export const requestShippingQuote = (payload) => client.post('/logistics-hub/quotes', payload);
export const myShippingQuotes = () => client.get('/logistics-hub/quotes/mine');
export const getShippingQuoteOptions = (id) => client.get(`/logistics-hub/quotes/${id}/options`);
export const adminSubmitQuoteOption = (payload) => client.post('/logistics-hub/admin/quotes/options', payload);

// ---- Bookings + tracking ----
export const createBooking = (payload) => client.post('/logistics-hub/bookings', payload);
export const myBookings = () => client.get('/logistics-hub/bookings/mine');
export const getBookingTracking = (id) => client.get(`/logistics-hub/bookings/${id}/tracking`);
export const adminAddTrackingEvent = (id, payload) => client.post(`/logistics-hub/admin/bookings/${id}/tracking`, payload);
export const adminListBookings = (status) => client.get('/logistics-hub/admin/bookings', { params: { status } });

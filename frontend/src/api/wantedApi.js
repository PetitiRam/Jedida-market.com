import client from './client';

// ---- Buyer side — "Post What I Want" ----
export const createWantedRequest = (payload) => client.post('/wanted', payload);
export const myWantedRequests = () => client.get('/wanted/mine');
export const getWantedRequest = (id) => client.get(`/wanted/${id}`);
export const cancelWantedRequest = (id) => client.patch(`/wanted/${id}/cancel`);
export const acceptWantedQuote = (quoteId) => client.post(`/wanted/quotes/${quoteId}/accept`);
export const declineWantedQuote = (quoteId) => client.post(`/wanted/quotes/${quoteId}/decline`);

// ---- Business side — manufacturer/supplier/farmer accounts ----
export const incomingWantedMatches = () => client.get('/wanted/matches/incoming');
export const respondToWantedMatch = (matchId, status) => client.patch(`/wanted/matches/${matchId}/respond`, { status });
export const submitWantedQuote = (payload) => client.post('/wanted/quotes', payload);

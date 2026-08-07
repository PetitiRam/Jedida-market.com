import client from './client';

export const getHomeFeed = (coords) => client.get('/home', { params: coords ? { lat: coords.lat, lng: coords.lng } : {} });
export const getAdsByPlacement = (placement) => client.get('/ads', { params: { placement } });
export const trackAdClick = (adId) => client.post(`/ads/${adId}/click`).catch(() => {});
export const getFeaturedShops = (limit) => client.get('/shops/featured', { params: { limit } });
export const searchProducts = (search, limit = 6) => client.get('/products', { params: { search, limit } });

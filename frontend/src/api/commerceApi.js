import client from './client';

export const toggleWishlist = (productId) => client.post(`/wishlist/${productId}/toggle`);
export const getWishlistStatus = (productId) => client.get(`/wishlist/${productId}/status`);

export const toggleFollow = (shopId) => client.post(`/shops/${shopId}/follow/toggle`);
export const getShopFollowInfo = (shopId) => client.get(`/shops/${shopId}/follow/info`);

export const addToCart = (productId, quantity) => client.post('/cart', { productId, quantity });
export const getCart = () => client.get('/cart');
export const updateCartItem = (itemId, quantity) => client.patch(`/cart/${itemId}`, { quantity });
export const removeCartItem = (itemId) => client.delete(`/cart/${itemId}`);

export const requestQuote = (productId, payload) => client.post(`/products/${productId}/quote`, payload);

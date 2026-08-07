import client from './client';

export const getReviews = (productId) => client.get(`/reviews/${productId}/reviews`);
export const submitReview = (productId, payload) => client.post(`/reviews/${productId}/reviews`, payload);
export const markReviewHelpful = (reviewId) => client.post(`/reviews/reviews/${reviewId}/helpful`);

export const getQuestions = (productId) => client.get(`/reviews/${productId}/questions`);
export const askQuestion = (productId, questionText) => client.post(`/reviews/${productId}/questions`, { questionText });

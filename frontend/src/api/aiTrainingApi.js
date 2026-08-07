import client from './client';

const base = '/ai-training';

export const aiTrainingApi = {
  submitSuggestion: (body) => client.post(`${base}/suggestions`, body),
  mySuggestions: () => client.get(`${base}/suggestions/mine`),
  submitCorrection: (body) => client.post(`${base}/corrections`, body),
  submitFeedback: (body) => client.post(`${base}/feedback`, body),
};

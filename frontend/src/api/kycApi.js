import client from './client';

export const getDraft = () => client.get('/kyc/draft');

// step: 'account' | 'identity' | 'documents' | 'face' | 'business' | 'payment'
export const saveDraftStep = (step, data, currentStep) =>
  client.patch('/kyc/draft', { step, data, currentStep });

export const submitFull = () => client.post('/kyc/submit-full', {});

export const myStatus = () => client.get('/kyc/status');

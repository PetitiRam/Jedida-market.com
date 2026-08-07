import client from './client';

export const sendAssistantMessage = (message, history, deepMode, audience, conversationId) =>
  client.post('/ai-assistant/chat', { message, history, deepMode, audience, conversationId });

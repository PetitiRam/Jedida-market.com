import client from './client';

export const sendAssistantMessage = (
  message,
  history,
  deepMode,
  audience,
  conversationId
) =>
  client.post('/ai-assistant/chat', {
    message,
    history,
    deepMode,
    audience,
    conversationId,
  });

export const teachAssistant = (
  message,
  conversationId,
  audience
) =>
  client.post('/ai-assistant/teach', {
    message,
    conversationId,
    audience,
  });

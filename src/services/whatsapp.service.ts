import { env } from '../config/env';

const GRAPH_API_BASE = 'https://graph.facebook.com/v18.0';

/**
 * Send a plain text message via WhatsApp Cloud API.
 */
export async function sendWhatsAppMessage(to: string, text: string): Promise<void> {
  const url = `${GRAPH_API_BASE}/${env.whatsapp.phoneNumberId}/messages`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.whatsapp.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`WhatsApp send failed (${response.status}): ${errorBody}`);
  }
}

/**
 * Mark a message as read (optional – improves UX by showing double blue ticks).
 */
export async function markMessageRead(messageId: string): Promise<void> {
  const url = `${GRAPH_API_BASE}/${env.whatsapp.phoneNumberId}/messages`;

  await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.whatsapp.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    }),
  }).catch(err => {
    // Non-critical – log and continue
    console.warn('Failed to mark message as read:', (err as Error).message);
  });
}

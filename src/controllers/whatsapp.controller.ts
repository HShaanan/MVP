import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { env } from '../config/env';
import { WhatsAppWebhookBody } from '../models/types';
import { searchBusinesses } from '../services/search.service';
import { sendWhatsAppMessage, markMessageRead } from '../services/whatsapp.service';
import { formatWhatsAppResponse, formatHelpMessage } from '../utils/format';
import { isHelpQuery } from '../services/query-parser.service';

interface VerifyQuery {
  'hub.mode': string;
  'hub.verify_token': string;
  'hub.challenge': string;
}

export async function whatsappRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /webhook/whatsapp
   * Meta webhook verification handshake.
   */
  app.get<{ Querystring: VerifyQuery }>(
    '/webhook/whatsapp',
    async (req: FastifyRequest<{ Querystring: VerifyQuery }>, reply: FastifyReply) => {
      const mode      = req.query['hub.mode'];
      const token     = req.query['hub.verify_token'];
      const challenge = req.query['hub.challenge'];

      if (mode === 'subscribe' && token === env.whatsapp.webhookVerifyToken) {
        app.log.info('WhatsApp webhook verified');
        return reply.send(challenge);
      }

      app.log.warn('Webhook verification failed – token mismatch');
      return reply.status(403).send('Forbidden');
    }
  );

  /**
   * POST /webhook/whatsapp
   * Receives incoming messages from Meta Cloud API.
   * Must always return 200 quickly; do processing async-ish.
   */
  app.post(
    '/webhook/whatsapp',
    async (req: FastifyRequest, reply: FastifyReply) => {
      // Respond immediately to Meta (they retry on non-200)
      reply.send('OK');

      const body = req.body as WhatsAppWebhookBody;

      // Validate basic structure
      if (body?.object !== 'whatsapp_business_account') return;

      for (const entry of body.entry ?? []) {
        for (const change of entry.changes ?? []) {
          if (change.field !== 'messages') continue;

          const messages = change.value.messages ?? [];

          for (const msg of messages) {
            if (msg.type !== 'text' || !msg.text?.body) continue;

            const userPhone = msg.from;
            const queryText = msg.text.body.trim();

            // Mark as read (fire-and-forget)
            markMessageRead(msg.id);

            try {
              let responseText: string;

              if (isHelpQuery(queryText)) {
                responseText = formatHelpMessage();
              } else {
                const result = await searchBusinesses(queryText);
                responseText = formatWhatsAppResponse(result);
              }

              await sendWhatsAppMessage(userPhone, responseText);
            } catch (err) {
              app.log.error({ err, userPhone, queryText }, 'Error handling WhatsApp message');

              // Send a graceful error message so user isn't left hanging
              await sendWhatsAppMessage(
                userPhone,
                'אירעה שגיאה. אנא נסה שוב בעוד מספר שניות.'
              ).catch(() => { /* suppress send errors in error handler */ });
            }
          }
        }
      }
    }
  );
}

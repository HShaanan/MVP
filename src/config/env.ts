import 'dotenv/config';

function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

function optional(key: string, defaultValue = ''): string {
  return process.env[key] ?? defaultValue;
}

export const env = {
  supabase: {
    url: required('SUPABASE_URL'),
    serviceKey: required('SUPABASE_SERVICE_KEY'),
  },
  google: {
    placesApiKey: optional('GOOGLE_PLACES_API_KEY'),
  },
  whatsapp: {
    accessToken: required('WHATSAPP_ACCESS_TOKEN'),
    phoneNumberId: required('PHONE_NUMBER_ID'),
    businessId: optional('WHATSAPP_BUSINESS_ID'),
    webhookVerifyToken: required('WEBHOOK_VERIFY_TOKEN'),
  },
  server: {
    port: parseInt(optional('PORT', '3000'), 10),
    nodeEnv: optional('NODE_ENV', 'development'),
  },
};

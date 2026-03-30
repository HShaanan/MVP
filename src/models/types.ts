// -------- Database Models --------

export interface Business {
  id: string;
  name: string;
  name_en?: string;
  city: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  phone?: string;
  phone_secondary?: string;
  category: string;
  subcategory?: string;
  tags?: string[];
  opening_hours?: OpeningHours;
  source: 'google_places' | 'manual' | 'claimed';
  google_place_id?: string;
  is_paying: boolean;
  pricing_tier?: 'biz_high_vol' | 'biz_low_vol' | 'service_high_vol' | 'service_low_vol';

  // רוטציה
  last_appeared_at?: string;
  appearance_count: number;

  created_at: string;
  updated_at: string;
  last_verified_at?: string;
  is_active: boolean;
}

export interface OpeningHours {
  sunday?: DayHours;
  monday?: DayHours;
  tuesday?: DayHours;
  wednesday?: DayHours;
  thursday?: DayHours;
  friday?: DayHours;
  saturday?: DayHours;
}

export interface DayHours {
  open: string;   // "09:00"
  close: string;  // "18:00"
  closed?: boolean;
}

export interface SearchLog {
  id: string;
  query_text: string;
  parsed_category?: string;
  parsed_city?: string;
  results_paying: number;
  results_google: number;
  total_results: number;
  source_channel: 'whatsapp' | 'voice' | 'web';
  user_phone?: string;
  response_time_ms?: number;
  created_at: string;
}

export interface PayingSubscription {
  id: string;
  business_id: string;
  contact_name?: string;
  contact_phone?: string;
  pricing_tier: 'biz_high_vol' | 'biz_low_vol' | 'service_high_vol' | 'service_low_vol';
  monthly_fee?: number;
  started_at: string;
  expires_at?: string;
  is_active: boolean;
  created_at: string;
}

// -------- Search / Query --------

export interface ParsedQuery {
  category: string;
  city: string;
  tags: string[];
  rawQuery: string;
}

export interface SearchResult {
  results: Business[];
  layersUsed: Array<'paying' | 'google'>;
  payingCount: number;
  googleCount: number;
}

// -------- Google Places API --------

export interface GooglePlace {
  id: string;
  displayName?: { text: string; languageCode: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  regularOpeningHours?: GoogleOpeningHours;
  location?: { latitude: number; longitude: number };
  primaryType?: string;
  types?: string[];
}

export interface GoogleOpeningHours {
  openNow?: boolean;
  periods?: Array<{
    open: { day: number; hour: number; minute: number };
    close?: { day: number; hour: number; minute: number };
  }>;
  weekdayDescriptions?: string[];
}

// -------- WhatsApp / Meta API --------

export interface WhatsAppWebhookBody {
  object: string;
  entry: WhatsAppEntry[];
}

export interface WhatsAppEntry {
  id: string;
  changes: WhatsAppChange[];
}

export interface WhatsAppChange {
  field: string;
  value: {
    messaging_product: string;
    metadata: { display_phone_number: string; phone_number_id: string };
    contacts?: Array<{ profile: { name: string }; wa_id: string }>;
    messages?: WhatsAppMessage[];
    statuses?: unknown[];
  };
}

export interface WhatsAppMessage {
  from: string;
  id: string;
  timestamp: string;
  type: 'text' | 'image' | 'audio' | 'document' | 'location' | 'sticker';
  text?: { body: string };
}

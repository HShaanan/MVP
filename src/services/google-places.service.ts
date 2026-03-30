import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';
import { Business, GooglePlace, ParsedQuery } from '../models/types';
import { mapGoogleTypeToCategoryKey } from '../utils/hebrew-categories';

const FIELDS_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.nationalPhoneNumber',
  'places.internationalPhoneNumber',
  'places.regularOpeningHours',
  'places.location',
  'places.primaryType',
  'places.types',
].join(',');

const GOOGLE_PLACES_URL = 'https://places.googleapis.com/v1/places:searchText';

/**
 * Search Google Places API for businesses matching the parsed query.
 */
export async function searchGooglePlaces(parsed: ParsedQuery): Promise<GooglePlace[]> {
  const textQuery = parsed.city
    ? `${parsed.category} ב${parsed.city}`
    : parsed.category || parsed.rawQuery;

  const response = await fetch(GOOGLE_PLACES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': env.google.placesApiKey,
      'X-Goog-FieldMask': FIELDS_MASK,
    },
    body: JSON.stringify({
      textQuery,
      languageCode: 'he',
      regionCode: 'IL',
      maxResultCount: 5,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google Places API error ${response.status}: ${errorText}`);
  }

  const data = await response.json() as { places?: GooglePlace[] };
  return data.places ?? [];
}

/**
 * Convert a Google Place to our Business shape (without id / timestamps).
 */
export function mapGooglePlaceToBusiness(place: GooglePlace): Omit<Business, 'id' | 'created_at' | 'updated_at'> {
  return {
    name: place.displayName?.text ?? '',
    name_en: undefined,
    city: '',               // filled in from the query context after saving
    address: place.formattedAddress ?? '',
    latitude: place.location?.latitude,
    longitude: place.location?.longitude,
    phone: place.nationalPhoneNumber ?? '',
    phone_secondary: undefined,
    category: mapGoogleTypeToCategoryKey(place.primaryType ?? ''),
    subcategory: undefined,
    tags: place.types ?? [],
    opening_hours: mapGoogleOpeningHours(place.regularOpeningHours),
    source: 'google_places',
    google_place_id: place.id,
    is_paying: false,
    plan_type: undefined,
    plan_expires_at: undefined,
    priority_score: 0,
    last_verified_at: new Date().toISOString(),
    is_active: true,
  };
}

/**
 * Map Google's opening hours format to our JSONB format.
 */
function mapGoogleOpeningHours(
  googleHours?: GooglePlace['regularOpeningHours']
): Business['opening_hours'] | undefined {
  if (!googleHours?.periods) return undefined;

  const DAY_KEYS = [
    'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
  ] as const;

  const result: Business['opening_hours'] = {};

  for (const period of googleHours.periods) {
    const dayKey = DAY_KEYS[period.open.day];
    if (!dayKey) continue;

    const open = `${String(period.open.hour).padStart(2, '0')}:${String(period.open.minute).padStart(2, '0')}`;
    const close = period.close
      ? `${String(period.close.hour).padStart(2, '0')}:${String(period.close.minute).padStart(2, '0')}`
      : '23:59';

    result[dayKey] = { open, close };
  }

  return result;
}

/**
 * Upsert a Google Place into the businesses table.
 * Uses google_place_id as the conflict key.
 * Returns the saved Business row.
 */
export async function saveBusinessFromGoogle(
  place: GooglePlace,
  city: string,
  supabase: ReturnType<typeof createClient>
): Promise<Business | null> {
  const mapped = mapGooglePlaceToBusiness(place);
  mapped.city = city || mapped.city;

  const { data, error } = await supabase
    .from('businesses')
    .upsert(mapped, { onConflict: 'google_place_id', ignoreDuplicates: false })
    .select()
    .single();

  if (error) {
    console.error('Failed to save Google Place to DB:', error.message);
    return null;
  }

  return data as Business;
}

import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';
import { Business, SearchResult } from '../models/types';
import { parseQuery } from './query-parser.service';
import { searchGooglePlaces, saveBusinessFromGoogle } from './google-places.service';

const MAX_RESULTS = 5;

// Single Supabase client instance (service role key bypasses RLS)
const supabase = createClient(env.supabase.url, env.supabase.serviceKey);

/**
 * Main entry point: search businesses using 2-layer strategy with equal rotation.
 *
 * Layer 1 – paying businesses in DB (rotation: last_appeared_at ASC)
 * Layer 2 – Google Places API fallback (only when no paying businesses found)
 *           results are saved to DB for future queries
 */
export async function searchBusinesses(queryText: string): Promise<SearchResult> {
  const startTime = Date.now();
  const parsed = parseQuery(queryText);

  let payingResults: Business[] = [];
  let googleResults: Business[] = [];
  const layersUsed: SearchResult['layersUsed'] = [];

  // ── Layer 1: Paying businesses (equal rotation) ───────────────────────────
  let q = supabase
    .from('businesses')
    .select('*')
    .eq('is_paying', true)
    .eq('is_active', true);

  if (parsed.category) {
    q = q.ilike('category', `%${parsed.category}%`);
  }
  if (parsed.city) {
    q = q.eq('city', parsed.city);
  }

  q = q.order('last_appeared_at', { ascending: true, nullsFirst: true })
    .limit(MAX_RESULTS);

  const { data: paying, error: payingErr } = await q;

  if (payingErr) console.error('Layer 1 query error:', payingErr.message);
  payingResults = (paying as Business[]) ?? [];
  if (payingResults.length > 0) layersUsed.push('paying');

  // ── Layer 2: Google Places fallback ──────────────────────────────────────
  if (payingResults.length === 0 && env.google.placesApiKey) {
    try {
      const places = await searchGooglePlaces(parsed);
      const saved = await Promise.all(
        places.map(p => saveBusinessFromGoogle(p, parsed.city, supabase))
      );
      googleResults = saved.filter((b): b is Business => b !== null);
      if (googleResults.length > 0) layersUsed.push('google');
    } catch (err) {
      console.error('Layer 2 Google Places error:', (err as Error).message);
    }
  }

  const results = [...payingResults, ...googleResults];

  // ── Update rotation for shown businesses ──────────────────────────────────
  if (payingResults.length > 0) {
    const shownIds = payingResults.map(b => b.id);
    await supabase
      .from('businesses')
      .update({ last_appeared_at: new Date().toISOString() })
      .in('id', shownIds);
  }

  // ── Log the search ────────────────────────────────────────────────────────
  const responseMs = Date.now() - startTime;
  await logSearch({
    queryText,
    parsed,
    payingCount: payingResults.length,
    googleCount: googleResults.length,
    responseMs,
  });

  return {
    results,
    layersUsed,
    payingCount: payingResults.length,
    googleCount: googleResults.length,
  };
}

// ── Logging ──────────────────────────────────────────────────────────────────

interface LogParams {
  queryText: string;
  parsed: ReturnType<typeof parseQuery>;
  payingCount: number;
  googleCount: number;
  responseMs: number;
  userPhone?: string;
}

async function logSearch(params: LogParams): Promise<void> {
  const { error } = await supabase.from('search_logs').insert({
    query_text: params.queryText,
    parsed_category: params.parsed.category || null,
    parsed_city: params.parsed.city || null,
    results_paying: params.payingCount,
    results_google: params.googleCount,
    total_results: params.payingCount + params.googleCount,
    source_channel: 'whatsapp',
    user_phone: params.userPhone ?? null,
    response_time_ms: params.responseMs,
  });

  if (error) console.error('Failed to log search:', error.message);
}

export { supabase };

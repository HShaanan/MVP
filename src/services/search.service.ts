import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';
import { Business, SearchResult } from '../models/types';
import { parseQuery } from './query-parser.service';
import { searchGooglePlaces, saveBusinessFromGoogle } from './google-places.service';

const MAX_RESULTS = 5;

// Single Supabase client instance (service role key bypasses RLS)
const supabase = createClient(env.supabase.url, env.supabase.serviceKey);

/**
 * Main entry point: search businesses using 3-layer strategy.
 *
 * Layer 1 – paying businesses in DB (ordered by priority_score)
 * Layer 2 – free businesses in DB (fills up to MAX_RESULTS)
 * Layer 3 – Google Places API fallback (only when DB has 0 results)
 *           results are saved to DB for future queries
 */
export async function searchBusinesses(queryText: string): Promise<SearchResult> {
  const startTime = Date.now();
  const parsed = parseQuery(queryText);

  let payingResults: Business[] = [];
  let freeResults: Business[] = [];
  let googleResults: Business[] = [];
  const layersUsed: SearchResult['layersUsed'] = [];

  // ── Layer 1: Paying businesses ────────────────────────────────────────────
  const { data: paying, error: payingErr } = await buildBusinessQuery(true)
    .limit(MAX_RESULTS);

  if (payingErr) console.error('Layer 1 query error:', payingErr.message);
  payingResults = (paying as Business[]) ?? [];
  if (payingResults.length > 0) layersUsed.push('paying');

  // ── Layer 2: Free businesses ──────────────────────────────────────────────
  const remaining = MAX_RESULTS - payingResults.length;
  if (remaining > 0) {
    const { data: free, error: freeErr } = await buildBusinessQuery(false)
      .limit(remaining);

    if (freeErr) console.error('Layer 2 query error:', freeErr.message);
    freeResults = (free as Business[]) ?? [];
    if (freeResults.length > 0) layersUsed.push('free');
  }

  // ── Layer 3: Google Places fallback ──────────────────────────────────────
  if (payingResults.length === 0 && freeResults.length === 0 && env.google.placesApiKey) {
    try {
      const places = await searchGooglePlaces(parsed);
      const saved = await Promise.all(
        places.map(p => saveBusinessFromGoogle(p, parsed.city, supabase))
      );
      googleResults = saved.filter((b): b is Business => b !== null);
      if (googleResults.length > 0) layersUsed.push('google');
    } catch (err) {
      console.error('Layer 3 Google Places error:', (err as Error).message);
    }
  }

  const results = [...payingResults, ...freeResults, ...googleResults];

  // ── Log the search ────────────────────────────────────────────────────────
  const responseMs = Date.now() - startTime;
  await logSearch({
    queryText,
    parsed,
    payingCount: payingResults.length,
    freeCount: freeResults.length,
    googleCount: googleResults.length,
    responseMs,
  });

  return {
    results,
    layersUsed,
    payingCount: payingResults.length,
    freeCount: freeResults.length,
    googleCount: googleResults.length,
  };

  // ── Helper: build base query ───────────────────────────────────────────────
  function buildBusinessQuery(isPaying: boolean) {
    let q = supabase
      .from('businesses')
      .select('*')
      .eq('is_paying', isPaying)
      .eq('is_active', true);

    if (parsed.category) {
      q = q.ilike('category', `%${parsed.category}%`);
    }

    if (parsed.city) {
      q = q.eq('city', parsed.city);
    }

    if (isPaying) {
      q = q.order('priority_score', { ascending: false });
    }

    return q;
  }
}

// ── Logging ──────────────────────────────────────────────────────────────────

interface LogParams {
  queryText: string;
  parsed: ReturnType<typeof parseQuery>;
  payingCount: number;
  freeCount: number;
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
    results_free: params.freeCount,
    results_google: params.googleCount,
    total_results: params.payingCount + params.freeCount + params.googleCount,
    source_channel: 'whatsapp',
    user_phone: params.userPhone ?? null,
    response_time_ms: params.responseMs,
  });

  if (error) console.error('Failed to log search:', error.message);
}

export { supabase };

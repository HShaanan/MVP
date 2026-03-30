import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { supabase } from '../services/search.service';
import { searchBusinesses } from '../services/search.service';
import { searchGooglePlaces, saveBusinessFromGoogle } from '../services/google-places.service';
import { parseQuery } from '../services/query-parser.service';
import { Business } from '../models/types';

export async function businessRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /api/search
   * Internal search endpoint – useful for testing and web/voice integrations.
   * Body: { query: string }
   */
  app.post<{ Body: { query: string } }>(
    '/api/search',
    async (req: FastifyRequest<{ Body: { query: string } }>, reply: FastifyReply) => {
      const { query } = req.body;

      if (!query?.trim()) {
        return reply.status(400).send({ error: 'query is required' });
      }

      const result = await searchBusinesses(query);
      return reply.send(result);
    }
  );

  /**
   * GET /api/businesses
   * List businesses with optional filters.
   * Query params: city, category, is_paying, limit (default 20)
   */
  app.get<{
    Querystring: {
      city?: string;
      category?: string;
      is_paying?: string;
      limit?: string;
    };
  }>(
    '/api/businesses',
    async (req, reply) => {
      const { city, category, is_paying, limit = '20' } = req.query;

      let q = supabase
        .from('businesses')
        .select('*')
        .eq('is_active', true)
        .order('priority_score', { ascending: false })
        .limit(Math.min(parseInt(limit, 10), 100));

      if (city)      q = q.eq('city', city);
      if (category)  q = q.ilike('category', `%${category}%`);
      if (is_paying !== undefined) q = q.eq('is_paying', is_paying === 'true');

      const { data, error } = await q;
      if (error) return reply.status(500).send({ error: error.message });

      return reply.send({ results: data, count: data?.length ?? 0 });
    }
  );

  /**
   * GET /api/businesses/:id
   * Fetch a single business by UUID.
   */
  app.get<{ Params: { id: string } }>(
    '/api/businesses/:id',
    async (req, reply) => {
      const { data, error } = await supabase
        .from('businesses')
        .select('*')
        .eq('id', req.params.id)
        .single();

      if (error || !data) return reply.status(404).send({ error: 'Not found' });
      return reply.send(data);
    }
  );

  /**
   * POST /api/businesses
   * Manually add a new business.
   */
  app.post<{ Body: Partial<Business> }>(
    '/api/businesses',
    async (req, reply) => {
      const { name, city, category } = req.body;

      if (!name || !city || !category) {
        return reply.status(400).send({ error: 'name, city, and category are required' });
      }

      const { data, error } = await supabase
        .from('businesses')
        .insert({ ...req.body, source: req.body.source ?? 'manual' })
        .select()
        .single();

      if (error) return reply.status(500).send({ error: error.message });
      return reply.status(201).send(data);
    }
  );

  /**
   * PUT /api/businesses/:id
   * Update an existing business.
   */
  app.put<{ Params: { id: string }; Body: Partial<Business> }>(
    '/api/businesses/:id',
    async (req, reply) => {
      const { data, error } = await supabase
        .from('businesses')
        .update(req.body)
        .eq('id', req.params.id)
        .select()
        .single();

      if (error) return reply.status(500).send({ error: error.message });
      if (!data)  return reply.status(404).send({ error: 'Not found' });
      return reply.send(data);
    }
  );

  /**
   * POST /api/businesses/import
   * Import businesses from Google Places for a given query+city.
   * Body: { query: string, city: string }
   */
  app.post<{ Body: { query: string; city: string } }>(
    '/api/businesses/import',
    async (req, reply) => {
      const { query, city } = req.body;

      if (!query || !city) {
        return reply.status(400).send({ error: 'query and city are required' });
      }

      const parsed = parseQuery(`${query} ב${city}`);
      const places = await searchGooglePlaces(parsed);

      const saved = await Promise.all(
        places.map(p => saveBusinessFromGoogle(p, city, supabase))
      );
      const results = saved.filter(Boolean);

      return reply.send({ imported: results.length, results });
    }
  );

  /**
   * GET /api/analytics/searches
   * Basic search analytics (last 7 days).
   */
  app.get(
    '/api/analytics/searches',
    async (_req, reply) => {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from('search_logs')
        .select('parsed_category, parsed_city, total_results, created_at')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) return reply.status(500).send({ error: error.message });
      return reply.send({ count: data?.length ?? 0, logs: data });
    }
  );
}

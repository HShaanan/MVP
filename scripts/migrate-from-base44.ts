/**
 * Data Migration Script: Base44 → Supabase
 *
 * Exports all business data from Base44's REST API and upserts it into
 * the MVP Supabase database, preserving url_slug values to keep
 * Google-indexed URLs working.
 *
 * Usage:
 *   npx ts-node scripts/migrate-from-base44.ts
 *
 * Required env vars:
 *   BASE44_SERVER_URL   – Base44 backend URL
 *   BASE44_APP_ID       – Base44 app ID
 *   BASE44_TOKEN        – Base44 access token (admin)
 *   SUPABASE_URL        – Supabase project URL
 *   SUPABASE_SERVICE_KEY – Supabase service role key (NOT anon key)
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const BASE44_URL = process.env.BASE44_SERVER_URL!;
const BASE44_APP_ID = process.env.BASE44_APP_ID!;
const BASE44_TOKEN = process.env.BASE44_TOKEN!;
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ─── Base44 REST helpers ─────────────────────────────────────────────
async function base44Fetch(entityName: string): Promise<any[]> {
  const url = `${BASE44_URL}/api/apps/${BASE44_APP_ID}/entities/${entityName}/rows`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${BASE44_TOKEN}`,
      'X-App-Id': BASE44_APP_ID,
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${entityName}: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? data : data.rows || data.data || [];
}

// ─── Field mapping: Base44 BusinessPage → Supabase businesses ─────────
function mapBusiness(b44: any): Record<string, any> {
  return {
    // Preserve url_slug for Google-indexed URLs
    url_slug: b44.url_slug || null,
    serial_number: b44.serial_number || null,

    // Basic info
    name: b44.business_name || b44.name || 'Unnamed',
    display_title: b44.display_title || null,
    description: b44.description || null,

    // Location
    city: b44.city || '',
    address: b44.address || null,
    latitude: b44.lat || null,
    longitude: b44.lng || null,

    // Contact
    phone: b44.contact_phone || b44.phone || null,
    contact_phone: b44.contact_phone || null,
    website_url: b44.website_url || null,

    // Classification
    category: b44.category || b44.category_name || '',
    category_slug: b44.category_slug || null,
    subcategory_slugs: b44.subcategory_slugs || [],
    category_id: null, // Will be linked after categories are migrated
    subcategory_id: null,
    subcategory_ids: b44.subcategory_ids || [],
    subsubcategory_id: b44.subsubcategory_id || null,
    tags: b44.special_fields?.tags || b44.tags || [],

    // Media
    images: b44.images || [],
    brands_logos: b44.brands_logos || [],

    // Kashrut
    kashrut_authority_name: b44.kashrut_authority_name || null,
    kashrut_authority_type: b44.kashrut_authority_type || null,
    kashrut_rabbinate_city: b44.kashrut_rabbinate_city || null,
    kashrut_logo_url: b44.kashrut_logo_url || null,
    kashrut_certificate_urls: b44.kashrut_certificate_urls || [],

    // Business details
    price_range: b44.price_range || null,
    has_delivery: b44.has_delivery || false,
    has_pickup: b44.has_pickup || false,
    hours: b44.hours ? (typeof b44.hours === 'string' ? JSON.parse(b44.hours) : b44.hours) : null,
    opening_hours: b44.hours ? (typeof b44.hours === 'string' ? JSON.parse(b44.hours) : b44.hours) : null,
    special_fields: b44.special_fields || {},
    metadata: b44.metadata || {},
    theme_settings: b44.theme_settings || {},

    // Status
    is_active: b44.is_active ?? true,
    approval_status: b44.approval_status || 'approved',
    is_frozen: b44.is_frozen || false,
    frozen_reason: b44.frozen_reason || null,
    is_promoted: b44.is_promoted || false,

    // Custom category flags
    is_custom_category: b44.is_custom_category || false,
    custom_category_name: b44.custom_category_name || null,
    custom_subcategory_name: b44.custom_subcategory_name || null,
    custom_subsubcategory_name: b44.custom_subsubcategory_name || null,
    custom_notes: b44.custom_notes || null,

    // Ratings
    smart_rating: b44.smart_rating || 0,
    reviews_count: b44.reviews_count || 0,
    view_count: b44.view_count || 0,
    ai_executive_summary: b44.ai_executive_summary || null,

    // Owner
    business_owner_email: b44.business_owner_email || null,
    subscription_level: b44.subscription_level || null,

    // Monetization (set defaults for web-only businesses)
    is_paying: false,
    priority_score: 0,
    source: 'manual',

    // Dates
    created_date: b44.created_date || b44.created_at || new Date().toISOString(),
  };
}

// ─── Category mapping ─────────────────────────────────────────────────
function mapCategory(b44: any): Record<string, any> {
  return {
    name: b44.name,
    slug: b44.slug,
    icon: b44.icon || null,
    parent_id: null, // Will be linked in a second pass
    type: b44.type || null,
    sort_order: b44.sort_order || 0,
    is_active: b44.is_active ?? true,
  };
}

// ─── Kashrut mapping ──────────────────────────────────────────────────
function mapKashrut(b44: any): Record<string, any> {
  return {
    name: b44.name,
    type: b44.type || null,
    logo_url: b44.logo_url || null,
    is_active: b44.is_active ?? true,
  };
}

// ─── Upsert helper ────────────────────────────────────────────────────
async function upsertBatch(
  table: string,
  rows: Record<string, any>[],
  conflictColumn: string,
  batchSize = 100
) {
  let inserted = 0;
  let updated = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { data, error } = await supabase
      .from(table)
      .upsert(batch, { onConflict: conflictColumn, ignoreDuplicates: false })
      .select('id');

    if (error) {
      console.error(`  Error upserting batch ${i / batchSize + 1} into ${table}:`, error.message);
      // Try individual inserts for the failed batch
      for (const row of batch) {
        const { error: singleError } = await supabase
          .from(table)
          .upsert(row, { onConflict: conflictColumn, ignoreDuplicates: false });
        if (singleError) {
          console.error(`  Skipping row:`, singleError.message, row[conflictColumn]);
        } else {
          inserted++;
        }
      }
    } else {
      inserted += data?.length || batch.length;
    }
  }

  return { inserted, updated };
}

// ─── Main migration ──────────────────────────────────────────────────
async function main() {
  console.log('=== Base44 → Supabase Migration ===\n');

  // 1. Migrate categories
  console.log('1. Migrating categories...');
  try {
    const categories = await base44Fetch('Category');
    console.log(`   Found ${categories.length} categories in Base44`);
    if (categories.length > 0) {
      const mapped = categories.map(mapCategory);
      const result = await upsertBatch('categories', mapped, 'slug');
      console.log(`   Migrated ${result.inserted} categories`);

      // Second pass: link parent_id for subcategories
      const { data: dbCats } = await supabase.from('categories').select('id, slug');
      const slugToId = Object.fromEntries((dbCats || []).map(c => [c.slug, c.id]));

      for (const cat of categories) {
        if (cat.parent_id) {
          const parentSlug = categories.find(c => c.id === cat.parent_id)?.slug;
          if (parentSlug && slugToId[parentSlug] && slugToId[cat.slug]) {
            await supabase
              .from('categories')
              .update({ parent_id: slugToId[parentSlug] })
              .eq('id', slugToId[cat.slug]);
          }
        }
      }
      console.log('   Linked parent categories');
    }
  } catch (err: any) {
    console.error('   Categories migration failed:', err.message);
  }

  // 2. Migrate kashrut authorities
  console.log('2. Migrating kashrut authorities...');
  try {
    const kashrut = await base44Fetch('Kashrut');
    console.log(`   Found ${kashrut.length} kashrut authorities in Base44`);
    if (kashrut.length > 0) {
      const mapped = kashrut.map(mapKashrut);
      const result = await upsertBatch('kashrut_authorities', mapped, 'name');
      console.log(`   Migrated ${result.inserted} kashrut authorities`);
    }
  } catch (err: any) {
    console.error('   Kashrut migration failed:', err.message);
  }

  // 3. Migrate businesses
  console.log('3. Migrating businesses...');
  try {
    const businesses = await base44Fetch('BusinessPage');
    console.log(`   Found ${businesses.length} businesses in Base44`);
    if (businesses.length > 0) {
      const mapped = businesses
        .map(mapBusiness)
        .filter(b => b.url_slug); // Only migrate businesses with a slug (Google-indexed)

      console.log(`   ${mapped.length} businesses have url_slug (will be migrated)`);
      const skipped = businesses.length - mapped.length;
      if (skipped > 0) {
        console.log(`   ${skipped} businesses without url_slug (skipped)`);
      }

      const result = await upsertBatch('businesses', mapped, 'url_slug');
      console.log(`   Migrated ${result.inserted} businesses`);

      // Link category_id based on category_slug
      const { data: dbCats } = await supabase.from('categories').select('id, slug');
      const slugToId = Object.fromEntries((dbCats || []).map(c => [c.slug, c.id]));

      let linked = 0;
      for (const biz of mapped) {
        if (biz.category_slug && slugToId[biz.category_slug]) {
          await supabase
            .from('businesses')
            .update({ category_id: slugToId[biz.category_slug] })
            .eq('url_slug', biz.url_slug);
          linked++;
        }
      }
      console.log(`   Linked ${linked} businesses to categories`);
    }
  } catch (err: any) {
    console.error('   Businesses migration failed:', err.message);
  }

  console.log('\n=== Migration complete ===');
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});

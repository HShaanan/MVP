-- Enable fuzzy search extension for Hebrew text
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================
-- Table: businesses
-- ============================================================
CREATE TABLE businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Basic info
  name TEXT NOT NULL,
  name_en TEXT,

  -- Location
  city TEXT NOT NULL,
  address TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,

  -- Contact
  phone TEXT,
  phone_secondary TEXT,

  -- Classification
  category TEXT NOT NULL,
  subcategory TEXT,
  tags TEXT[],

  -- Hours
  opening_hours JSONB,

  -- Data source
  source TEXT DEFAULT 'google_places',
  google_place_id TEXT UNIQUE,

  -- Monetization
  is_paying BOOLEAN DEFAULT false,
  pricing_tier TEXT CHECK (pricing_tier IN (
    'biz_high_vol', 'biz_low_vol', 'service_high_vol', 'service_low_vol'
  )),

  -- Rotation
  last_appeared_at TIMESTAMPTZ,
  appearance_count INT DEFAULT 0,

  -- Meta
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  last_verified_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true
);

-- Indexes for search performance
CREATE INDEX idx_businesses_city ON businesses(city);
CREATE INDEX idx_businesses_category ON businesses(category);
CREATE INDEX idx_businesses_paying ON businesses(is_paying);
CREATE INDEX idx_businesses_active ON businesses(is_active);
CREATE INDEX idx_businesses_rotation ON businesses(city, category, last_appeared_at NULLS FIRST);
CREATE INDEX idx_businesses_tags ON businesses USING GIN(tags);
CREATE INDEX idx_businesses_google_id ON businesses(google_place_id);
CREATE INDEX idx_businesses_name_trgm ON businesses USING GIN(name gin_trgm_ops);
CREATE INDEX idx_businesses_category_trgm ON businesses USING GIN(category gin_trgm_ops);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER businesses_updated_at
  BEFORE UPDATE ON businesses
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Table: search_logs
-- ============================================================
CREATE TABLE search_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  query_text TEXT NOT NULL,
  parsed_category TEXT,
  parsed_city TEXT,

  results_paying INT DEFAULT 0,
  results_google INT DEFAULT 0,
  total_results INT DEFAULT 0,

  source_channel TEXT DEFAULT 'whatsapp',
  user_phone TEXT,
  response_time_ms INT,

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_search_logs_date ON search_logs(created_at);
CREATE INDEX idx_search_logs_category ON search_logs(parsed_category);
CREATE INDEX idx_search_logs_city ON search_logs(parsed_city);

-- ============================================================
-- Table: paying_subscriptions
-- ============================================================
CREATE TABLE paying_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,

  contact_name TEXT,
  contact_phone TEXT,

  pricing_tier TEXT NOT NULL CHECK (pricing_tier IN (
    'biz_high_vol', 'biz_low_vol', 'service_high_vol', 'service_low_vol'
  )),
  monthly_fee DECIMAL(10,2),

  started_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_subscriptions_business ON paying_subscriptions(business_id);
CREATE INDEX idx_subscriptions_active ON paying_subscriptions(is_active);

-- ============================================================
-- Migration 002: Extend schema for web application (project '1')
-- Adds website-specific fields to businesses table
-- and creates supporting tables for the web frontend.
-- ============================================================

-- ============================================================
-- Extend: businesses table (website fields)
-- ============================================================
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS url_slug TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS display_title TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS website_url TEXT,
  ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS brands_logos JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS kashrut_authority_name TEXT,
  ADD COLUMN IF NOT EXISTS kashrut_authority_type TEXT,
  ADD COLUMN IF NOT EXISTS kashrut_rabbinate_city TEXT,
  ADD COLUMN IF NOT EXISTS kashrut_logo_url TEXT,
  ADD COLUMN IF NOT EXISTS kashrut_certificate_urls JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS price_range TEXT,
  ADD COLUMN IF NOT EXISTS has_delivery BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_pickup BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS hours JSONB,
  ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS is_frozen BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS frozen_reason TEXT,
  ADD COLUMN IF NOT EXISTS is_promoted BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS serial_number TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS subscription_level TEXT,
  ADD COLUMN IF NOT EXISTS business_owner_email TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS special_fields JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS theme_settings JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS category_id UUID,
  ADD COLUMN IF NOT EXISTS subcategory_id UUID,
  ADD COLUMN IF NOT EXISTS subcategory_ids UUID[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS subsubcategory_id UUID,
  ADD COLUMN IF NOT EXISTS category_slug TEXT,
  ADD COLUMN IF NOT EXISTS subcategory_slugs TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_custom_category BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS custom_category_name TEXT,
  ADD COLUMN IF NOT EXISTS custom_subcategory_name TEXT,
  ADD COLUMN IF NOT EXISTS custom_subsubcategory_name TEXT,
  ADD COLUMN IF NOT EXISTS custom_notes TEXT,
  ADD COLUMN IF NOT EXISTS smart_rating NUMERIC(3,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reviews_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS view_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_executive_summary TEXT,
  ADD COLUMN IF NOT EXISTS created_date TIMESTAMPTZ DEFAULT now();

-- Indexes for web queries
CREATE INDEX IF NOT EXISTS idx_businesses_url_slug ON businesses(url_slug);
CREATE INDEX IF NOT EXISTS idx_businesses_approval ON businesses(approval_status);
CREATE INDEX IF NOT EXISTS idx_businesses_frozen ON businesses(is_frozen);
CREATE INDEX IF NOT EXISTS idx_businesses_promoted ON businesses(is_promoted);
CREATE INDEX IF NOT EXISTS idx_businesses_owner ON businesses(business_owner_email);
CREATE INDEX IF NOT EXISTS idx_businesses_category_slug ON businesses(category_slug);
CREATE INDEX IF NOT EXISTS idx_businesses_subcategory_slugs ON businesses USING GIN(subcategory_slugs);
CREATE INDEX IF NOT EXISTS idx_businesses_category_id ON businesses(category_id);
CREATE INDEX IF NOT EXISTS idx_businesses_created_date ON businesses(created_date DESC);

-- ============================================================
-- Table: categories (hierarchical with parent_id)
-- ============================================================
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  icon TEXT,
  parent_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  type TEXT CHECK (type IN ('food', 'shopping', 'services')),
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);
CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_active ON categories(is_active);
CREATE INDEX IF NOT EXISTS idx_categories_sort ON categories(sort_order);

CREATE TRIGGER categories_updated_at
  BEFORE UPDATE ON categories
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- FK from businesses to categories
ALTER TABLE businesses
  ADD CONSTRAINT fk_businesses_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL;

-- ============================================================
-- Table: kashrut_authorities
-- ============================================================
CREATE TABLE IF NOT EXISTS kashrut_authorities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  type TEXT,
  logo_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kashrut_active ON kashrut_authorities(is_active);

-- ============================================================
-- Table: profiles (extends Supabase auth.users)
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE,
  full_name TEXT,
  user_type TEXT DEFAULT 'user' CHECK (user_type IN ('user', 'business', 'admin')),
  role TEXT DEFAULT 'user',
  subscription_type TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_user_type ON profiles(user_type);

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- Table: favorites
-- ============================================================
CREATE TABLE IF NOT EXISTS favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  business_page_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_email, business_page_id)
);

CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_email);
CREATE INDEX IF NOT EXISTS idx_favorites_business ON favorites(business_page_id);

-- ============================================================
-- Table: reviews
-- ============================================================
CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_page_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_email TEXT,
  user_name TEXT,
  rating NUMERIC(2,1),
  content TEXT,
  created_date TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reviews_business ON reviews(business_page_id);
CREATE INDEX IF NOT EXISTS idx_reviews_date ON reviews(created_date DESC);

-- ============================================================
-- Table: dynamic_page_views (analytics)
-- ============================================================
CREATE TABLE IF NOT EXISTS dynamic_page_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city TEXT,
  category TEXT,
  subcategory TEXT,
  category_name TEXT,
  user_email TEXT,
  session_id TEXT,
  referrer TEXT,
  results_count INT DEFAULT 0,
  has_results BOOLEAN DEFAULT false,
  time_on_page INT,
  converted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dpv_session ON dynamic_page_views(session_id);
CREATE INDEX IF NOT EXISTS idx_dpv_date ON dynamic_page_views(created_at DESC);

-- ============================================================
-- Table: orders
-- ============================================================
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_page_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_email TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  items JSONB DEFAULT '[]',
  total DECIMAL(10,2),
  status TEXT DEFAULT 'pending',
  preparation_status TEXT,
  cancellation_reason TEXT,
  notes TEXT,
  created_date TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_business ON orders(business_page_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(created_date DESC);

CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Table: restaurant_settings
-- ============================================================
CREATE TABLE IF NOT EXISTS restaurant_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_page_id UUID UNIQUE NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  is_open BOOLEAN DEFAULT true,
  min_order DECIMAL(10,2),
  delivery_fee DECIMAL(10,2),
  delivery_time TEXT,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER restaurant_settings_updated_at
  BEFORE UPDATE ON restaurant_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Table: reports
-- ============================================================
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_page_id UUID REFERENCES businesses(id) ON DELETE SET NULL,
  reporter_email TEXT,
  reason TEXT,
  details TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- Table: store_pages
-- ============================================================
CREATE TABLE IF NOT EXISTS store_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  content JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  view_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_store_pages_slug ON store_pages(slug);

CREATE TRIGGER store_pages_updated_at
  BEFORE UPDATE ON store_pages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Table: footer_links
-- ============================================================
CREATE TABLE IF NOT EXISTS footer_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- Table: user_agreements
-- ============================================================
CREATE TABLE IF NOT EXISTS user_agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  agreement_type TEXT DEFAULT 'terms',
  accepted_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_agreements_email ON user_agreements(user_email);

-- ============================================================
-- Table: referral_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS referral_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_id TEXT NOT NULL,
  referrer_email TEXT,
  referred_email TEXT,
  status TEXT DEFAULT 'pending',
  created_date TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referral_logs_ref ON referral_logs(ref_id);

-- ============================================================
-- Table: referral_stats
-- ============================================================
CREATE TABLE IF NOT EXISTS referral_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT UNIQUE NOT NULL,
  total_points INT DEFAULT 0,
  total_referrals INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- Table: app_settings (key-value store)
-- ============================================================
CREATE TABLE IF NOT EXISTS app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT UNIQUE NOT NULL,
  setting_value TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER app_settings_updated_at
  BEFORE UPDATE ON app_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Table: email_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient TEXT,
  subject TEXT,
  template TEXT,
  status TEXT DEFAULT 'sent',
  sent_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- Table: notification_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT,
  recipient TEXT,
  message TEXT,
  status TEXT DEFAULT 'sent',
  metadata JSONB DEFAULT '{}',
  created_date TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_logs_date ON notification_logs(created_date DESC);

-- ============================================================
-- Table: business_page_impressions (analytics)
-- ============================================================
CREATE TABLE IF NOT EXISTS business_page_impressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_page_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  user_email TEXT,
  source TEXT,
  metadata JSONB DEFAULT '{}',
  created_date TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bpi_business ON business_page_impressions(business_page_id);
CREATE INDEX IF NOT EXISTS idx_bpi_date ON business_page_impressions(created_date DESC);

-- ============================================================
-- Table: business_page_analytics (events)
-- ============================================================
CREATE TABLE IF NOT EXISTS business_page_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_page_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  event_type TEXT,
  user_email TEXT,
  metadata JSONB DEFAULT '{}',
  created_date TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bpa_business ON business_page_analytics(business_page_id);
CREATE INDEX IF NOT EXISTS idx_bpa_date ON business_page_analytics(created_date DESC);

-- ============================================================
-- Table: couriers
-- ============================================================
CREATE TABLE IF NOT EXISTS couriers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  email TEXT,
  phone TEXT,
  status TEXT DEFAULT 'available',
  current_location JSONB,
  metadata JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER couriers_updated_at
  BEFORE UPDATE ON couriers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Table: delivery_records
-- ============================================================
CREATE TABLE IF NOT EXISTS delivery_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  courier_id UUID REFERENCES couriers(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'pending',
  pickup_time TIMESTAMPTZ,
  delivery_time TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delivery_courier ON delivery_records(courier_id);

CREATE TRIGGER delivery_records_updated_at
  BEFORE UPDATE ON delivery_records
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Table: landing_pages
-- ============================================================
CREATE TABLE IF NOT EXISTS landing_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT,
  slug TEXT UNIQUE,
  content JSONB DEFAULT '{}',
  view_count INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_landing_pages_slug ON landing_pages(slug);

CREATE TRIGGER landing_pages_updated_at
  BEFORE UPDATE ON landing_pages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Table: users (managed users, not auth.users)
-- For admin listing of registered users
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE,
  full_name TEXT,
  user_type TEXT DEFAULT 'user',
  role TEXT DEFAULT 'user',
  subscription_type TEXT,
  phone TEXT,
  is_active BOOLEAN DEFAULT true,
  created_date TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- RLS Policies
-- ============================================================
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE kashrut_authorities ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE dynamic_page_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE footer_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_stats ENABLE ROW LEVEL SECURITY;

-- Public read for active businesses
CREATE POLICY businesses_public_read ON businesses
  FOR SELECT USING (true);

-- Business owners can update their own businesses
CREATE POLICY businesses_owner_update ON businesses
  FOR UPDATE USING (
    business_owner_email = (SELECT email FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Authenticated users can create businesses
CREATE POLICY businesses_auth_insert ON businesses
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Categories: public read
CREATE POLICY categories_public_read ON categories
  FOR SELECT USING (true);

-- Kashrut: public read
CREATE POLICY kashrut_public_read ON kashrut_authorities
  FOR SELECT USING (true);

-- Profiles: users manage their own, admins read all
CREATE POLICY profiles_own_read ON profiles
  FOR SELECT USING (id = auth.uid() OR role = 'admin');

CREATE POLICY profiles_own_update ON profiles
  FOR UPDATE USING (id = auth.uid());

-- Favorites: users manage their own
CREATE POLICY favorites_own ON favorites
  FOR ALL USING (
    user_email = (SELECT email FROM profiles WHERE id = auth.uid())
  );

-- Reviews: public read, auth insert
CREATE POLICY reviews_public_read ON reviews
  FOR SELECT USING (true);

CREATE POLICY reviews_auth_insert ON reviews
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Dynamic page views: public insert (analytics), admin read
CREATE POLICY dpv_public_insert ON dynamic_page_views
  FOR INSERT WITH CHECK (true);

CREATE POLICY dpv_public_update ON dynamic_page_views
  FOR UPDATE USING (true);

CREATE POLICY dpv_public_read ON dynamic_page_views
  FOR SELECT USING (true);

-- Orders: business owner reads, customer creates
CREATE POLICY orders_public_insert ON orders
  FOR INSERT WITH CHECK (true);

CREATE POLICY orders_read ON orders
  FOR SELECT USING (true);

CREATE POLICY orders_update ON orders
  FOR UPDATE USING (true);

-- Restaurant settings: public read
CREATE POLICY restaurant_settings_read ON restaurant_settings
  FOR SELECT USING (true);

CREATE POLICY restaurant_settings_write ON restaurant_settings
  FOR ALL USING (true);

-- Reports: anyone can create
CREATE POLICY reports_insert ON reports
  FOR INSERT WITH CHECK (true);

-- Store pages: public read
CREATE POLICY store_pages_read ON store_pages
  FOR SELECT USING (true);

CREATE POLICY store_pages_update ON store_pages
  FOR UPDATE USING (true);

-- Footer links: public read
CREATE POLICY footer_links_read ON footer_links
  FOR SELECT USING (true);

-- User agreements: users manage their own
CREATE POLICY user_agreements_own ON user_agreements
  FOR ALL USING (true);

-- Referrals: public read
CREATE POLICY referral_logs_all ON referral_logs
  FOR ALL USING (true);

CREATE POLICY referral_stats_all ON referral_stats
  FOR ALL USING (true);

-- New tables RLS
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_page_impressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_page_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE couriers ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE landing_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY app_settings_all ON app_settings FOR ALL USING (true);
CREATE POLICY email_logs_all ON email_logs FOR ALL USING (true);
CREATE POLICY notification_logs_all ON notification_logs FOR ALL USING (true);
CREATE POLICY bpi_all ON business_page_impressions FOR ALL USING (true);
CREATE POLICY bpa_all ON business_page_analytics FOR ALL USING (true);
CREATE POLICY couriers_all ON couriers FOR ALL USING (true);
CREATE POLICY delivery_records_all ON delivery_records FOR ALL USING (true);
CREATE POLICY landing_pages_read ON landing_pages FOR SELECT USING (true);
CREATE POLICY landing_pages_update ON landing_pages FOR UPDATE USING (true);
CREATE POLICY users_all ON users FOR ALL USING (true);

# תוכנית MVP — משלנו: חיפוש עסקים בוואטסאפ

## סקירה כללית

**חזון המוצר:** בוט וואטסאפ שמאפשר לקהילה החרדית לחפש עסקים מקומיים בהודעה פשוטה בעברית, עם עדיפות לעסקים משלמים.

**Stack טכנולוגי:**

| רכיב | כלי | סיבה |
|---|---|---|
| Database | Supabase (PostgreSQL) | חיפוש עברית, API מובנה, Auth |
| Backend | TypeScript + Fastify | SDKs בוגרים, שפה אחת |
| WhatsApp | Meta Cloud API (ישיר) | חינם ל-1,000 שיחות, שליטה מלאה |
| נתונים | Google Places API (New) | מידע עסקי עדכני ומקיף |
| Hosting | Railway | Deploy פשוט, $5/חודש |
| AI (עתידי) | Claude API | סוכן קולי בעברית |

---

## ארכיטקטורה

```
┌──────────────────────────────────────────────────────────┐
│                    WhatsApp User                         │
│              "מסעדה כשרה בבני ברק"                       │
└───────────────┬──────────────────────────────────────────┘
                │ Webhook (HTTPS POST)
                ▼
┌──────────────────────────────────────────────────────────┐
│              Meta Cloud API (WhatsApp)                   │
│         receives message → forwards to webhook           │
└───────────────┬──────────────────────────────────────────┘
                │
                ▼
┌──────────────────────────────────────────────────────────┐
│           Fastify Server (TypeScript)                    │
│                                                          │
│  ┌─────────────────────────────────────────────────┐     │
│  │         Query Parser / Intent Engine             │     │
│  │   "מסעדה כשרה בבני ברק"                         │     │
│  │    → category: "restaurant"                      │     │
│  │    → city: "בני ברק"                             │     │
│  │    → keywords: ["כשרה"]                          │     │
│  └──────────────┬──────────────────────────────────┘     │
│                 │                                         │
│                 ▼                                         │
│  ┌─────────────────────────────────────────────────┐     │
│  │         Search Service (3 Layers)                │     │
│  │                                                   │     │
│  │  Layer 1: Paying businesses (DB)                  │     │
│  │     → SELECT * FROM businesses                    │     │
│  │       WHERE is_paying = true                      │     │
│  │       AND category ILIKE '%restaurant%'           │     │
│  │       AND city = 'בני ברק'                        │     │
│  │                                                   │     │
│  │  Layer 2: Non-paying businesses (DB)              │     │
│  │     → Same query, is_paying = false               │     │
│  │     → Only if Layer 1 < max_results               │     │
│  │                                                   │     │
│  │  Layer 3: Google Places API (Fallback)            │     │
│  │     → Only if Layer 1 + 2 = 0 results             │     │
│  │     → Save results to DB (is_paying=false)        │     │
│  └──────────────┬──────────────────────────────────┘     │
│                 │                                         │
│                 ▼                                         │
│  ┌─────────────────────────────────────────────────┐     │
│  │         Response Formatter                       │     │
│  │   Formats results for WhatsApp message           │     │
│  │   (business name, address, phone, hours)          │     │
│  └──────────────┬──────────────────────────────────┘     │
│                 │                                         │
└─────────────────┼────────────────────────────────────────┘
                  │ WhatsApp API Reply
                  ▼
┌──────────────────────────────────────────────────────────┐
│                    WhatsApp User                         │
│         receives formatted business results              │
└──────────────────────────────────────────────────────────┘
```

---

## סכמת Database (Supabase)

### טבלת businesses (ליבה)

```sql
CREATE TABLE businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- מידע בסיסי
  name TEXT NOT NULL,              -- שם העסק
  name_en TEXT,                    -- שם באנגלית (אם קיים)
  
  -- מיקום
  city TEXT NOT NULL,              -- עיר בעברית
  address TEXT,                    -- כתובת מלאה
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  
  -- יצירת קשר
  phone TEXT,                      -- טלפון ראשי
  phone_secondary TEXT,            -- טלפון נוסף
  
  -- קטגוריזציה
  category TEXT NOT NULL,          -- קטגוריה ראשית (מסעדה, מכולת, רופא...)
  subcategory TEXT,                -- תת-קטגוריה
  tags TEXT[],                     -- תגיות חופשיות ["כשר", "משלוחים", "חלבי"]
  
  -- שעות פעילות
  opening_hours JSONB,             -- {"sunday": {"open":"09:00","close":"18:00"}, ...}
  
  -- מקור נתונים
  source TEXT DEFAULT 'google_places',  -- 'google_places' | 'manual' | 'claimed'
  google_place_id TEXT UNIQUE,     -- מפתח חיצוני לגוגל
  
  -- מסחרי
  is_paying BOOLEAN DEFAULT false, -- עסק משלם?
  plan_type TEXT,                  -- 'basic' | 'premium' | null
  plan_expires_at TIMESTAMPTZ,     -- תוקף המנוי
  priority_score INT DEFAULT 0,   -- ניקוד עדיפות בתוצאות (גבוה = קודם)
  
  -- מטא
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  last_verified_at TIMESTAMPTZ,    -- מתי אומתו הנתונים לאחרונה
  is_active BOOLEAN DEFAULT true
);

-- אינדקסים לחיפוש מהיר
CREATE INDEX idx_businesses_city ON businesses(city);
CREATE INDEX idx_businesses_category ON businesses(category);
CREATE INDEX idx_businesses_paying ON businesses(is_paying, priority_score DESC);
CREATE INDEX idx_businesses_tags ON businesses USING GIN(tags);
CREATE INDEX idx_businesses_google_id ON businesses(google_place_id);

-- אינדקס לחיפוש טקסט חופשי בעברית
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_businesses_name_trgm ON businesses USING GIN(name gin_trgm_ops);
CREATE INDEX idx_businesses_category_trgm ON businesses USING GIN(category gin_trgm_ops);
```

### טבלת search_logs (אנליטיקס)

```sql
CREATE TABLE search_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  query_text TEXT NOT NULL,        -- מה המשתמש חיפש
  parsed_category TEXT,            -- הקטגוריה שזוהתה
  parsed_city TEXT,                -- העיר שזוהתה
  
  results_paying INT DEFAULT 0,    -- כמה תוצאות משלמים
  results_free INT DEFAULT 0,      -- כמה תוצאות חינם
  results_google INT DEFAULT 0,    -- כמה מגוגל (fallback)
  total_results INT DEFAULT 0,
  
  source_channel TEXT DEFAULT 'whatsapp',  -- 'whatsapp' | 'voice' | 'web'
  user_phone TEXT,                 -- מספר טלפון (hashed)
  response_time_ms INT,            -- זמן תגובה
  
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_search_logs_date ON search_logs(created_at);
CREATE INDEX idx_search_logs_category ON search_logs(parsed_category);
```

### טבלת paying_subscriptions (ניהול מנויים)

```sql
CREATE TABLE paying_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id),
  
  contact_name TEXT,               -- שם איש קשר
  contact_phone TEXT,              -- טלפון ליצירת קשר
  
  plan_type TEXT NOT NULL,         -- 'basic' | 'premium'
  monthly_fee DECIMAL(10,2),       -- עלות חודשית
  
  started_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## API Routes (Fastify)

```
POST /webhook/whatsapp          ← Meta Cloud API webhook (receives messages)
GET  /webhook/whatsapp           ← Webhook verification (Meta handshake)

POST /api/search                 ← Internal search endpoint
  Body: { query: string, city?: string, category?: string }
  Response: { results: Business[], source: "paying"|"free"|"google" }

POST /api/businesses             ← הוספת עסק ידנית
GET  /api/businesses/:id         ← פרטי עסק
PUT  /api/businesses/:id         ← עדכון עסק

POST /api/businesses/import      ← ייבוא מ-Google Places API
  Body: { query: string, city: string }

GET  /api/analytics/searches     ← סטטיסטיקות חיפושים (דשבורד עתידי)
```

---

## זרימת חיפוש — לוגיקה מפורטת

```typescript
// search.service.ts — פסאודו-קוד

async function searchBusinesses(query: string): Promise<SearchResult> {
  // שלב 1: פרסור השאילתה
  const parsed = parseQuery(query);
  // "מסעדה כשרה בבני ברק" → { category: "מסעדה", city: "בני ברק", tags: ["כשרה"] }

  const MAX_RESULTS = 5;
  let results: Business[] = [];

  // שלב 2: חיפוש עסקים משלמים
  const payingResults = await supabase
    .from('businesses')
    .select('*')
    .eq('is_paying', true)
    .eq('is_active', true)
    .ilike('category', `%${parsed.category}%`)
    .eq('city', parsed.city)
    .order('priority_score', { ascending: false })
    .limit(MAX_RESULTS);

  results.push(...payingResults.data);

  // שלב 3: חיפוש עסקים לא משלמים (אם צריך עוד)
  if (results.length < MAX_RESULTS) {
    const freeResults = await supabase
      .from('businesses')
      .select('*')
      .eq('is_paying', false)
      .eq('is_active', true)
      .ilike('category', `%${parsed.category}%`)
      .eq('city', parsed.city)
      .limit(MAX_RESULTS - results.length);

    results.push(...freeResults.data);
  }

  // שלב 4: Fallback ל-Google Places (אם אין תוצאות)
  if (results.length === 0) {
    const googleResults = await searchGooglePlaces(parsed);
    
    // שמירה ב-DB לשימוש עתידי
    for (const place of googleResults) {
      await saveBusinessFromGoogle(place);
    }
    
    results.push(...googleResults);
  }

  // שלב 5: לוג
  await logSearch(query, parsed, results);

  return { results, layers_used: getLayersUsed(results) };
}
```

---

## Google Places API — שדות נדרשים בלבד

```typescript
// google-places.service.ts

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

async function searchGooglePlaces(parsed: ParsedQuery): Promise<GooglePlace[]> {
  const response = await fetch(
    'https://places.googleapis.com/v1/places:searchText',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': process.env.GOOGLE_PLACES_API_KEY!,
        'X-Goog-FieldMask': FIELDS_MASK,
      },
      body: JSON.stringify({
        textQuery: `${parsed.category} ב${parsed.city}`,
        languageCode: 'he',
        regionCode: 'IL',
        maxResultCount: 5,
      }),
    }
  );

  const data = await response.json();
  return data.places || [];
}

// המרה מ-Google Place לסכמת ה-DB שלנו
function mapGooglePlaceToBusiness(place: GooglePlace): Partial<Business> {
  return {
    name: place.displayName?.text || '',
    address: place.formattedAddress || '',
    phone: place.nationalPhoneNumber || '',
    latitude: place.location?.latitude,
    longitude: place.location?.longitude,
    category: mapGoogleTypesToCategory(place.primaryType),
    opening_hours: mapOpeningHours(place.regularOpeningHours),
    google_place_id: place.id,
    source: 'google_places',
    is_paying: false,
  };
}
```

---

## WhatsApp Integration — Meta Cloud API

### הגדרה ראשונית

1. **יצירת Meta App** → developers.facebook.com → Create App → Business
2. **הוספת WhatsApp** → Add Product → WhatsApp
3. **הגדרת מספר טלפון** → WhatsApp → Getting Started → הוספת המספר העסקי
4. **הגדרת Webhook** → WhatsApp → Configuration → Webhook URL: `https://your-domain.com/webhook/whatsapp`
5. **Verify Token** → בחירת טוקן אימות (WEBHOOK_VERIFY_TOKEN בקוד)

### קוד Webhook

```typescript
// whatsapp.controller.ts

// Webhook verification (GET)
app.get('/webhook/whatsapp', (req, reply) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WEBHOOK_VERIFY_TOKEN) {
    return reply.send(challenge);
  }
  return reply.status(403).send('Forbidden');
});

// Receive messages (POST)
app.post('/webhook/whatsapp', async (req, reply) => {
  const { entry } = req.body;
  
  for (const e of entry) {
    for (const change of e.changes) {
      if (change.field !== 'messages') continue;
      
      const messages = change.value.messages || [];
      for (const msg of messages) {
        if (msg.type !== 'text') continue;
        
        const userPhone = msg.from;
        const queryText = msg.text.body;
        
        // חיפוש
        const searchResult = await searchBusinesses(queryText);
        
        // עיצוב תגובה
        const responseText = formatWhatsAppResponse(searchResult);
        
        // שליחת תשובה
        await sendWhatsAppMessage(userPhone, responseText);
      }
    }
  }
  
  return reply.send('OK');
});

// שליחת הודעה
async function sendWhatsAppMessage(to: string, text: string) {
  await fetch(
    `https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text },
      }),
    }
  );
}

// עיצוב תוצאות
function formatWhatsAppResponse(result: SearchResult): string {
  if (result.results.length === 0) {
    return '😔 לא מצאתי עסקים מתאימים. נסה לחפש במילים אחרות.';
  }

  let response = `🔍 מצאתי ${result.results.length} עסקים:\n\n`;

  for (const [i, biz] of result.results.entries()) {
    const star = biz.is_paying ? '⭐ ' : '';
    response += `${star}${i + 1}. *${biz.name}*\n`;
    if (biz.address) response += `📍 ${biz.address}\n`;
    if (biz.phone) response += `📞 ${biz.phone}\n`;
    if (biz.opening_hours) {
      const today = getTodayHours(biz.opening_hours);
      if (today) response += `🕐 ${today}\n`;
    }
    response += '\n';
  }

  return response.trim();
}
```

---

## מבנה הפרויקט

```
meshelanu-bot/
├── src/
│   ├── index.ts                    # Fastify server entry
│   ├── config/
│   │   └── env.ts                  # Environment variables
│   ├── controllers/
│   │   ├── whatsapp.controller.ts  # Webhook handlers
│   │   └── business.controller.ts  # Business CRUD API
│   ├── services/
│   │   ├── search.service.ts       # 3-layer search logic
│   │   ├── google-places.service.ts # Google Places integration
│   │   ├── whatsapp.service.ts     # WhatsApp message sending
│   │   └── query-parser.service.ts # Hebrew query parsing
│   ├── models/
│   │   └── types.ts                # TypeScript interfaces
│   └── utils/
│       ├── hebrew-categories.ts    # Category mapping (עברית → English)
│       └── format.ts               # Response formatting
├── supabase/
│   └── migrations/
│       └── 001_init.sql            # Database schema
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

---

## משתני סביבה (.env)

```env
# Supabase
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=xxxxx
SUPABASE_SERVICE_KEY=xxxxx

# Google Places API
GOOGLE_PLACES_API_KEY=xxxxx

# WhatsApp (Meta Cloud API)
WHATSAPP_ACCESS_TOKEN=xxxxx
PHONE_NUMBER_ID=xxxxx
WHATSAPP_BUSINESS_ID=xxxxx
WEBHOOK_VERIFY_TOKEN=your-custom-verify-token

# Server
PORT=3000
NODE_ENV=production
```

---

## Roadmap — 4 שבועות ל-MVP

### שבוע 1: תשתית + DB
- [ ] הקמת פרויקט TypeScript + Fastify
- [ ] הקמת Supabase project + סכמת DB
- [ ] מיפוי קטגוריות עברית (מסעדה, מכולת, רופא, חנות בגדים...)
- [ ] שירות Google Places — חיפוש וייבוא עסקים
- [ ] ייבוא ראשוני: 500 עסקים מבני ברק + ביתר עילית

### שבוע 2: לוגיקת חיפוש
- [ ] Query Parser — פרסור שאילתות בעברית (קטגוריה + עיר + תגיות)
- [ ] Search Service — 3 שכבות עם fallback
- [ ] בדיקות יחידה לחיפוש
- [ ] API endpoint: POST /api/search
- [ ] טיוב תוצאות והוספת פילטרים

### שבוע 3: WhatsApp Bot
- [ ] הקמת Meta App + WhatsApp Business API
- [ ] Webhook — קבלת הודעות
- [ ] חיבור לשירות החיפוש
- [ ] עיצוב הודעות תגובה
- [ ] Deploy ל-Railway
- [ ] בדיקות end-to-end

### שבוע 4: שיפור + השקה רכה
- [ ] טיפול במקרי קצה (שאילתות לא ברורות, שגיאות)
- [ ] הודעת "ברוכים הבאים" למשתמש חדש
- [ ] Search analytics — לוגים וסטטיסטיקות
- [ ] ייבוא נתונים נוספים (ערים נוספות)
- [ ] השקה רכה — 50 משתמשי בטא מהקהילה

---

## אומדן עלויות חודשיות (MVP)

| שירות | תוכנית | עלות/חודש |
|---|---|---|
| Supabase | Free tier (500MB, 50K rows) | $0 |
| Railway | Starter (512MB RAM) | $5 |
| Google Places API | ~1,000 requests/month | ~$10-20 |
| WhatsApp (Meta) | 1,000 שיחות חינם | $0 |
| Domain + SSL | Railway subdomain | $0 |
| **סה"כ** | | **$15-25/חודש** |

### סקייל (1,000+ משתמשים)

| שירות | תוכנית | עלות/חודש |
|---|---|---|
| Supabase | Pro (8GB, unlimited rows) | $25 |
| Railway | Pro (2GB RAM) | $20 |
| Google Places API | ~10,000 requests/month | ~$100 |
| WhatsApp (Meta) | ~5,000 שיחות | ~$100-200 |
| **סה"כ** | | **~$250-350/חודש** |

---

## שלב הבא: Vocal AI Agent (לאחר MVP)

כשה-WhatsApp Bot עובד ומוכח, הוספת סוכן קולי:

```
טלפון כשר → מספר ייעודי → Twilio Voice
  → Speech-to-Text (Google/Whisper)
    → אותה לוגיקת חיפוש (Search Service)
      → Text-to-Speech (Google TTS בעברית)
        → תשובה קולית למשתמש
```

**כלים מומלצים:** Twilio Voice + Claude API (להבנת שאילתה) + Google Cloud TTS (עברית)

**עלות נוספת משוערת:** $50-100/חודש (תלוי בנפח שיחות)

---

## סיכום החלטות מפתח

1. **WhatsApp קודם** — הערוץ עם הערך הגבוה ביותר לקהל היעד
2. **3 שכבות חיפוש** — עדיפות למשלמים, fallback לגוגל
3. **Google Places = נתונים יבשים בלבד** — שם, כתובת, טלפון, שעות. בלי דירוגים
4. **שמירה ב-DB** — כל תוצאה מגוגל נשמרת, לא מביאים פעמיים
5. **TypeScript + Fastify** — שפה אחת, SDKs בוגרים, קל לסקייל
6. **Supabase** — PostgreSQL מנוהל עם חיפוש עברית (pg_trgm)
7. **Railway** — Deploy פשוט, מחיר נמוך, auto-scaling

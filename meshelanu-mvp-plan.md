# תוכנית MVP — משלנו: חיפוש עסקים בוואטסאפ

## סקירה כללית

**חזון המוצר:** בוט וואטסאפ שמאפשר לקהילה החרדית לחפש עסקים מקומיים בהודעה פשוטה בעברית, עם רוטציה שווה בין עסקים משלמים.

**Stack טכנולוגי:**

| רכיב | כלי | סיבה |
|---|---|---|
| Database + Backend | Supabase (PostgreSQL + Edge Functions) | חיפוש עברית, API מובנה, Auth, serverless — הכל במקום אחד |
| WhatsApp | Meta Cloud API (ישיר) | ~$0.01/שיחה (user-initiated), 1,000 ראשונות חינם |
| נתונים | Google Places API (New) | מידע עסקי עדכני ומקיף |
| Hosting | Supabase Edge Functions | ₪0 — חלק מ-Supabase, ללא שרת נפרד |
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
│           Supabase Edge Function                         │
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
│  │         Search Service (רוטציה שווה)             │     │
│  │                                                   │     │
│  │  Layer 1: עסקים משלמים (DB)                       │     │
│  │     → SELECT * FROM businesses                    │     │
│  │       WHERE is_paying = true                      │     │
│  │       AND category ILIKE '%restaurant%'           │     │
│  │       AND city = 'בני ברק'                        │     │
│  │       ORDER BY last_appeared_at ASC               │     │
│  │     → רוטציה שווה — מי שלא הוצג הכי הרבה זמן    │     │
│  │       מופיע ראשון                                 │     │
│  │                                                   │     │
│  │  Layer 2: Google Places API (Fallback)            │     │
│  │     → רק אם אין עסקים משלמים בקטגוריה+עיר       │     │
│  │     → שמירה ב-DB לשימוש עתידי                     │     │
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

## מודל עסקי ותמחור

### עיקרון: מסלול אחד, רוטציה שווה

- **אין חלוקה basic/premium ב-MVP** — מסלול תשלום אחד לכל קטגוריית עסק
- כל העסקים המשלמים מקבלים **חשיפה שווה** — רוטציה מבוססת `last_appeared_at`
- פרמיום יתווסף **רק כשיש 4-5 עסקים באותה קטגוריה+עיר** כשדרוג אופציונלי

### 4 מסלולי תמחור (לחודש)

| מסלול | דוגמאות | מחיר/חודש |
|---|---|---|
| 🏪 עסק, נפח גדול, סכום קטן | מסעדה, מכולת, מאפייה | ₪99 |
| 💎 עסק, נפח קטן, סכום גדול | ריהוט, תכשיטים, מחשבים | ₪149 |
| ✂️ שירות, נפח גדול, סכום קטן | ספר, מאפרת, קוסמטיקה | ₪129 |
| ⚖️ שירות, נפח קטן, סכום גדול | עו"ד, חשמאי, רופא, שיפוץ | ₪179 |

### מנגנון רוטציה

- כל חיפוש ממוין לפי `last_appeared_at ASC` — מי שהוצג מזמן מופיע ראשון
- אחרי כל חיפוש — עדכון `last_appeared_at` + `appearance_count` לעסקים שהוצגו
- **דוגמה:** 3 חשמאים בבני ברק → חיפוש 1: כהן, לוי, גולד → חיפוש 2: לוי, גולד, כהן → חיפוש 3: גולד, כהן, לוי

### טיעוני מכירה

- **מול מקומון:** מקומון ₪650 ל-~4 ימים חשיפה (₪162/יום) → משלנו ₪99–179 ל-30 יום, 24/7 (₪3.30–6/יום)
- **לבד בקטגוריה:** "אתה לבד? כולם יזרמו אליך"
- **עם תחרות:** "כל עסק מקבל חלק שווה מכל החיפושים"

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
  pricing_tier TEXT CHECK (pricing_tier IN (
    'biz_high_vol',      -- עסק נפח גדול, סכום קטן (₪99)
    'biz_low_vol',       -- עסק נפח קטן, סכום גדול (₪149)
    'service_high_vol',  -- שירות נפח גדול, סכום קטן (₪129)
    'service_low_vol'    -- שירות נפח קטן, סכום גדול (₪179)
  )),

  -- רוטציה
  last_appeared_at TIMESTAMPTZ,    -- מתי הוצג לאחרונה בחיפוש
  appearance_count INT DEFAULT 0,  -- כמה פעמים הוצג סה"כ

  -- מטא
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  last_verified_at TIMESTAMPTZ,    -- מתי אומתו הנתונים לאחרונה
  is_active BOOLEAN DEFAULT true
);

-- אינדקסים לחיפוש מהיר
CREATE INDEX idx_businesses_city ON businesses(city);
CREATE INDEX idx_businesses_category ON businesses(category);
CREATE INDEX idx_businesses_paying ON businesses(is_paying);
CREATE INDEX idx_businesses_tags ON businesses USING GIN(tags);
CREATE INDEX idx_businesses_google_id ON businesses(google_place_id);
CREATE INDEX idx_businesses_rotation ON businesses(city, category, last_appeared_at NULLS FIRST);

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

  pricing_tier TEXT NOT NULL CHECK (pricing_tier IN (
    'biz_high_vol', 'biz_low_vol', 'service_high_vol', 'service_low_vol'
  )),
  monthly_fee DECIMAL(10,2),       -- 99 / 129 / 149 / 179

  started_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## זרימת חיפוש — לוגיקה מפורטת

```typescript
// search edge function — פסאודו-קוד

async function searchBusinesses(query: string): Promise<SearchResult> {
  // שלב 1: פרסור השאילתה
  const parsed = parseQuery(query);
  // "מסעדה כשרה בבני ברק" → { category: "מסעדה", city: "בני ברק", tags: ["כשרה"] }

  const MAX_RESULTS = 5;

  // שלב 2: חיפוש עסקים משלמים — רוטציה שווה
  const { data: payingResults } = await supabase
    .from('businesses')
    .select('*')
    .eq('is_paying', true)
    .eq('is_active', true)
    .ilike('category', `%${parsed.category}%`)
    .eq('city', parsed.city)
    .order('last_appeared_at', { ascending: true, nullsFirst: true })
    .limit(MAX_RESULTS);

  let results = payingResults || [];

  // שלב 3: Fallback ל-Google Places (רק אם אין עסקים משלמים)
  if (results.length === 0) {
    const googleResults = await searchGooglePlaces(parsed);
    for (const place of googleResults) {
      await saveBusinessFromGoogle(place);
    }
    results = googleResults;
  }

  // שלב 4: עדכון רוטציה לעסקים שהוצגו
  if (results.length > 0) {
    const shownIds = results.map(b => b.id);
    await supabase
      .from('businesses')
      .update({
        last_appeared_at: new Date().toISOString()
      })
      .in('id', shownIds);
  }

  // שלב 5: לוג
  await logSearch(query, parsed, results);

  return { results };
}
```

---

## Google Places API — שדות נדרשים בלבד

```typescript
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
        'X-Goog-Api-Key': Deno.env.get('GOOGLE_PLACES_API_KEY')!,
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
```

---

## WhatsApp Integration — Meta Cloud API

### הגדרה ראשונית

1. **יצירת Meta App** → developers.facebook.com → Create App → Business
2. **הוספת WhatsApp** → Add Product → WhatsApp
3. **הגדרת מספר טלפון** → WhatsApp → Getting Started → הוספת המספר העסקי
4. **הגדרת Webhook** → WhatsApp → Configuration → Webhook URL: `https://<project>.supabase.co/functions/v1/whatsapp-webhook`
5. **Verify Token** → בחירת טוקן אימות (WEBHOOK_VERIFY_TOKEN בקוד)

---

## דפי רישום (HTML)

### דף ציבורי — רישום עסק

דף פומבי שבו בעל עסק ממלא:
- שם העסק, עיר, כתובת
- טלפון ראשי + משני
- קטגוריה (dropdown) + תגיות
- שעות פעילות
- בחירת מסלול תמחור (1 מ-4)
- פרטי איש קשר לתשלום

### דף אדמין — רישום עבור לקוח

ממשק פנימי לצוות משלנו הכולל את כל השדות של הדף הציבורי + שדות נוספים:
- סטטוס תשלום (is_paying)
- מקור הנתונים (source)
- שדות מטא (last_verified_at, is_active)
- הערות פנימיות

שני הטפסים שולחים ל-Supabase API ישירות (supabase-js client).

---

## מבנה הפרויקט

```
meshelanu-bot/
├── src/
│   ├── config/
│   │   └── env.ts                  # Environment variables
│   ├── services/
│   │   ├── search.service.ts       # Search logic + rotation
│   │   ├── google-places.service.ts # Google Places integration
│   │   ├── whatsapp.service.ts     # WhatsApp message sending
│   │   └── query-parser.service.ts # Hebrew query parsing
│   ├── models/
│   │   └── types.ts                # TypeScript interfaces
│   └── utils/
│       ├── hebrew-categories.ts    # Category mapping (עברית → English)
│       └── format.ts               # Response formatting
├── supabase/
│   ├── functions/
│   │   └── whatsapp-webhook/       # Edge Function — webhook handler
│   │       └── index.ts
│   └── migrations/
│       ├── 001_init.sql            # Database schema
│       └── 002_rotation.sql        # Rotation fields
├── web/
│   ├── public/
│   │   └── register.html           # דף רישום ציבורי
│   ├── admin/
│   │   └── index.html              # דף אדמין
│   ├── package.json
│   ├── tailwind.config.js
│   ├── vite.config.ts
│   └── tsconfig.json
├── .env.example
├── package.json
└── tsconfig.json
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
NODE_ENV=production
```

---

## אומדן עלויות חודשיות (MVP)

| שירות | תוכנית | עלות/חודש |
|---|---|---|
| Supabase | Free tier (500MB, 50K rows) | $0 |
| Supabase Edge Functions | חלק מ-free tier | $0 |
| Google Places API | ~1,000 requests/month | ~$10-20 |
| WhatsApp (Meta) | ~$0.01/שיחה, 1,000 ראשונות חינם | ~$0-10 |
| **סה"כ** | | **$10-30/חודש (~₪37-110)** |

### עלות לעסק משלם: ~₪2-4/חודש
### מרווח: 96-98% בכל מסלול

### סקייל (1,000+ משתמשים)

| שירות | תוכנית | עלות/חודש |
|---|---|---|
| Supabase | Pro (8GB, unlimited rows) | $25 |
| Google Places API | ~10,000 requests/month | ~$100 |
| WhatsApp (Meta) | ~5,000 שיחות | ~$50 |
| **סה"כ** | | **~$175/חודש (~₪650)** |

---

## Roadmap — 4 שבועות ל-MVP

### שבוע 1: תשתית + DB
- [ ] הקמת Supabase project + סכמת DB (כולל שדות רוטציה)
- [ ] הגדרת Edge Functions
- [ ] מיפוי קטגוריות עברית (מסעדה, מכולת, רופא, חנות בגדים...)
- [ ] שירות Google Places — חיפוש וייבוא עסקים
- [ ] ייבוא ראשוני: 500 עסקים מבני ברק + ביתר עילית

### שבוע 2: לוגיקת חיפוש + רוטציה
- [ ] Query Parser — פרסור שאילתות בעברית (קטגוריה + עיר + תגיות)
- [ ] Search Service — חיפוש עם רוטציה שווה + fallback לגוגל
- [ ] בדיקות יחידה לחיפוש ולרוטציה
- [ ] דפי רישום HTML (ציבורי + אדמין)

### שבוע 3: WhatsApp Bot
- [ ] הקמת Meta App + WhatsApp Business API
- [ ] Edge Function — webhook לקבלת הודעות
- [ ] חיבור לשירות החיפוש
- [ ] עיצוב הודעות תגובה
- [ ] בדיקות end-to-end

### שבוע 4: שיפור + השקה רכה
- [ ] טיפול במקרי קצה (שאילתות לא ברורות, שגיאות)
- [ ] הודעת "ברוכים הבאים" למשתמש חדש
- [ ] Search analytics — לוגים וסטטיסטיקות
- [ ] ייבוא נתונים נוספים (ערים נוספות)
- [ ] השקה רכה — 50 משתמשי בטא מהקהילה

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

**עלות נוספת משוערת:** ~₪1.10/שיחה (Twilio + STT + TTS + Claude)

כשמגיע ה-Vocal AI — התמחור יעודכן: המחיר יעלה ליצור מסלול "פרמיום" שכולל Voice.

---

## סיכום החלטות מפתח

1. **WhatsApp קודם** — הערוץ עם הערך הגבוה ביותר לקהל היעד
2. **מסלול אחד, רוטציה שווה** — פשוט למכור, הוגן לכל העסקים
3. **4 מסלולי תמחור** — לפי סוג עסק ונפח/ערך עסקאות (₪99–₪179)
4. **Supabase Edge Functions** — ללא שרת נפרד, ₪0 hosting
5. **Google Places = fallback בלבד** — רק כשאין עסקים משלמים בקטגוריה
6. **שמירה ב-DB** — כל תוצאה מגוגל נשמרת, לא מביאים פעמיים
7. **פרמיום בעתיד** — רק כשיש 4-5 עסקים באותה קטגוריה+עיר
8. **עלות תפעול ~₪2-4/עסק** — מרווח 96-98%

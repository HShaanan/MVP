// Maps Hebrew search keywords → normalized category key
// The category key is stored in the DB and used for Google Places queries

export interface CategoryEntry {
  key: string;           // stored in DB / sent to Google
  hebrewLabel: string;   // display name in responses
  googleType: string;    // Google Places primaryType
}

export const CATEGORIES: CategoryEntry[] = [
  { key: 'restaurant',     hebrewLabel: 'מסעדה',         googleType: 'restaurant' },
  { key: 'pharmacy',       hebrewLabel: 'בית מרקחת',     googleType: 'pharmacy' },
  { key: 'supermarket',    hebrewLabel: 'סופרמרקט',      googleType: 'supermarket' },
  { key: 'grocery',        hebrewLabel: 'מכולת',          googleType: 'grocery_store' },
  { key: 'synagogue',      hebrewLabel: 'בית כנסת',       googleType: 'synagogue' },
  { key: 'school',         hebrewLabel: 'בית ספר',        googleType: 'school' },
  { key: 'kindergarten',   hebrewLabel: 'גן ילדים',       googleType: 'preschool' },
  { key: 'doctor',         hebrewLabel: 'רופא',           googleType: 'doctor' },
  { key: 'clinic',         hebrewLabel: 'קופת חולים',     googleType: 'medical_clinic' },
  { key: 'dentist',        hebrewLabel: 'רופא שיניים',    googleType: 'dentist' },
  { key: 'lawyer',         hebrewLabel: 'עורך דין',       googleType: 'lawyer' },
  { key: 'accountant',     hebrewLabel: 'רואה חשבון',     googleType: 'accounting' },
  { key: 'bakery',         hebrewLabel: 'מאפייה',         googleType: 'bakery' },
  { key: 'butcher',        hebrewLabel: 'קצביה',          googleType: 'butcher_shop' },
  { key: 'clothing',       hebrewLabel: 'בגדים',          googleType: 'clothing_store' },
  { key: 'electronics',    hebrewLabel: 'אלקטרוניקה',     googleType: 'electronics_store' },
  { key: 'bank',           hebrewLabel: 'בנק',            googleType: 'bank' },
  { key: 'post_office',    hebrewLabel: 'דואר',           googleType: 'post_office' },
  { key: 'gym',            hebrewLabel: 'חדר כושר',        googleType: 'gym' },
  { key: 'hair_salon',     hebrewLabel: 'מספרה',          googleType: 'hair_salon' },
  { key: 'car_repair',     hebrewLabel: 'מוסך',           googleType: 'car_repair' },
  { key: 'gas_station',    hebrewLabel: 'תחנת דלק',       googleType: 'gas_station' },
  { key: 'hotel',          hebrewLabel: 'מלון',           googleType: 'lodging' },
  { key: 'synagogue',      hebrewLabel: 'שול',            googleType: 'synagogue' },
  { key: 'mikveh',         hebrewLabel: 'מקווה',          googleType: 'spa' },
  { key: 'judaica',        hebrewLabel: 'חנות יודאיקה',   googleType: 'book_store' },
];

// Keyword → category key mapping
// Multiple Hebrew words can map to the same category
const KEYWORD_MAP: Record<string, string> = {
  // Restaurants & food
  'מסעדה': 'restaurant',
  'מסעדות': 'restaurant',
  'אוכל': 'restaurant',
  'מזון': 'restaurant',
  'שיפודייה': 'restaurant',
  'פיצרייה': 'restaurant',
  'פיצה': 'restaurant',
  'פלאפל': 'restaurant',
  'שווארמה': 'restaurant',
  'המבורגר': 'restaurant',
  'סושי': 'restaurant',
  'קפה': 'cafe',
  'בית קפה': 'cafe',

  // Bakery
  'מאפייה': 'bakery',
  'לחם': 'bakery',
  'עוגות': 'bakery',
  'פטיסרי': 'bakery',

  // Supermarket / grocery
  'סופרמרקט': 'supermarket',
  'סופר': 'supermarket',
  'שופרסל': 'supermarket',
  'רמי לוי': 'supermarket',
  'מכולת': 'grocery',
  'מינימרקט': 'grocery',

  // Medical
  'רופא': 'doctor',
  'רופאים': 'doctor',
  'רופא משפחה': 'doctor',
  'קופת חולים': 'clinic',
  'קופ"ח': 'clinic',
  'מרפאה': 'clinic',
  'בית חולים': 'hospital',
  'רופא שיניים': 'dentist',
  'שיניים': 'dentist',
  'דנטיסט': 'dentist',
  'אורטופד': 'doctor',
  'רופא עיניים': 'doctor',
  'עיניים': 'doctor',

  // Pharmacy
  'בית מרקחת': 'pharmacy',
  'תרופות': 'pharmacy',
  'פארם': 'pharmacy',

  // Education
  'בית ספר': 'school',
  'חיידר': 'school',
  'ישיבה': 'school',
  'תלמוד תורה': 'school',
  'גן ילדים': 'kindergarten',
  'גן': 'kindergarten',
  'צהרון': 'kindergarten',

  // Legal & finance
  'עורך דין': 'lawyer',
  'עו"ד': 'lawyer',
  'עורכי דין': 'lawyer',
  'רואה חשבון': 'accountant',
  'רו"ח': 'accountant',
  'בנק': 'bank',
  'בנקים': 'bank',
  'כספומט': 'bank',

  // Judaica & religion
  'בית כנסת': 'synagogue',
  'כנסת': 'synagogue',
  'שול': 'synagogue',
  'בית מדרש': 'synagogue',
  'מקווה': 'mikveh',
  'יודאיקה': 'judaica',
  'ספרים': 'judaica',
  'ספרי קודש': 'judaica',
  'מזוזות': 'judaica',

  // Services
  'מספרה': 'hair_salon',
  'ספר': 'hair_salon',
  'תספורת': 'hair_salon',
  'מוסך': 'car_repair',
  'מכונאי': 'car_repair',
  'תחנת דלק': 'gas_station',
  'דלק': 'gas_station',
  'חדר כושר': 'gym',
  'כושר': 'gym',
  'דואר': 'post_office',
  'סניף דואר': 'post_office',

  // Clothing
  'בגדים': 'clothing',
  'חנות בגדים': 'clothing',
  'בוטיק': 'clothing',

  // Electronics
  'אלקטרוניקה': 'electronics',
  'מחשבים': 'electronics',
  'טלפונים': 'electronics',
  'סלולר': 'electronics',

  // Accommodation
  'מלון': 'hotel',
  'צימר': 'hotel',
  'פנסיון': 'hotel',
  'אירוח': 'hotel',

  // Butcher
  'קצביה': 'butcher',
  'קצב': 'butcher',
  'בשר': 'butcher',
};

/**
 * Given a raw Hebrew query string, extract the most likely category key.
 * Returns empty string if no category is detected.
 */
export function extractCategory(query: string): string {
  const lower = query.trim();

  // Try longest-match first (multi-word phrases before single words)
  const keywords = Object.keys(KEYWORD_MAP).sort((a, b) => b.length - a.length);
  for (const keyword of keywords) {
    if (lower.includes(keyword)) {
      return KEYWORD_MAP[keyword];
    }
  }

  return '';
}

/**
 * Given a category key, return the Hebrew display label.
 */
export function getCategoryLabel(key: string): string {
  const entry = CATEGORIES.find(c => c.key === key);
  return entry?.hebrewLabel ?? key;
}

/**
 * Given a Google Places primaryType, return the closest category key.
 */
export function mapGoogleTypeToCategoryKey(primaryType: string): string {
  const entry = CATEGORIES.find(c => c.googleType === primaryType);
  return entry?.key ?? primaryType;
}

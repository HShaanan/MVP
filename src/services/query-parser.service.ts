import { ParsedQuery } from '../models/types';
import { extractCategory } from '../utils/hebrew-categories';

// Major Israeli cities in Hebrew
const ISRAELI_CITIES: string[] = [
  'ירושלים',
  'תל אביב',
  'תל-אביב',
  'חיפה',
  'ראשון לציון',
  'פתח תקווה',
  'אשדוד',
  'נתניה',
  'באר שבע',
  'בני ברק',
  'חולון',
  'בת ים',
  'רמת גן',
  'אשקלון',
  'רחובות',
  'הרצליה',
  'כפר סבא',
  'מודיעין',
  'מודיעין עלית',
  'בית שמש',
  'ביתר עילית',
  'ביתר',
  'אלעד',
  'רמת בית שמש',
  'קריית גת',
  'קריית ים',
  'קריית אתא',
  'קריית מוצקין',
  'קריית ביאליק',
  'נהריה',
  'עכו',
  'טבריה',
  'צפת',
  'חדרה',
  'יבנה',
  'לוד',
  'רמלה',
  'פתח תקוה',
  'גבעת שמואל',
  'גבעתיים',
  'אור יהודה',
  'אריאל',
  'מעלה אדומים',
  'עמנואל',
  'טירת צבי',
  'נצרת',
  'נצרת עילית',
  'אום אל פחם',
  'שפרעם',
  'קצרין',
  'דימונה',
  'ירוחם',
  'מצפה רמון',
  'אילת',
];

// Search tags (adjectives / qualifiers)
const TAG_KEYWORDS: Record<string, string> = {
  'כשר': 'כשר',
  'כשרה': 'כשר',
  'כשרות': 'כשר',
  'מהדרין': 'מהדרין',
  'זול': 'זול',
  'זולה': 'זול',
  'מומלץ': 'מומלץ',
  'מומלצת': 'מומלץ',
  'פתוח': 'פתוח עכשיו',
  'פתוחה': 'פתוח עכשיו',
  'מהיר': 'מהיר',
  'בית': 'ביתי',
  'ביתי': 'ביתי',
  'חלק': 'חלק',
  '24': 'פתוח 24 שעות',
};

/**
 * Normalizes a Hebrew query string:
 * - Strips trailing punctuation
 * - Collapses whitespace
 */
function normalize(query: string): string {
  return query.replace(/[.,!?;:]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Tries to extract a city name from the query.
 * Returns the matched city string or empty string.
 */
function extractCity(query: string): string {
  // Sort by length descending so "תל אביב" matches before "אביב"
  const sorted = [...ISRAELI_CITIES].sort((a, b) => b.length - a.length);
  for (const city of sorted) {
    if (query.includes(city)) return city;
  }
  // Try "ב<city>" prefix pattern (e.g. "בירושלים", "בבני ברק")
  for (const city of sorted) {
    if (query.includes(`ב${city}`)) return city;
  }
  return '';
}

/**
 * Extracts search qualifier tags from the query.
 */
function extractTags(query: string): string[] {
  const found = new Set<string>();
  for (const [keyword, tag] of Object.entries(TAG_KEYWORDS)) {
    if (query.includes(keyword)) found.add(tag);
  }
  return Array.from(found);
}

/**
 * Returns true if the query looks like a help/greeting request.
 */
export function isHelpQuery(query: string): boolean {
  const lower = query.trim();
  const helpWords = ['עזרה', 'שלום', 'היי', 'הי', 'hello', 'help', 'מה אתה', 'איך'];
  return helpWords.some(w => lower.startsWith(w) || lower === w);
}

/**
 * Parses a free-form Hebrew query into structured fields.
 */
export function parseQuery(rawQuery: string): ParsedQuery {
  const query = normalize(rawQuery);

  const category = extractCategory(query);
  const city = extractCity(query);
  const tags = extractTags(query);

  return { category, city, tags, rawQuery };
}

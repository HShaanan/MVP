import { Business, OpeningHours, SearchResult } from '../models/types';

// Day index (0=Sunday ... 6=Saturday) → key in OpeningHours
const DAY_KEYS: Array<keyof OpeningHours> = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
];

const DAY_LABELS_HE: Record<keyof OpeningHours, string> = {
  sunday:    'ראשון',
  monday:    'שני',
  tuesday:   'שלישי',
  wednesday: 'רביעי',
  thursday:  'חמישי',
  friday:    'שישי',
  saturday:  'שבת',
};

/**
 * Returns today's opening hours as a Hebrew string, e.g. "יום רביעי: 09:00–22:00"
 * Returns null if no data for today.
 */
export function getTodayHours(hours: OpeningHours): string | null {
  const dayIndex = new Date().getDay(); // 0=Sun
  const key = DAY_KEYS[dayIndex];
  const day = hours[key];
  if (!day) return null;
  if (day.closed) return `יום ${DAY_LABELS_HE[key]}: סגור`;
  return `יום ${DAY_LABELS_HE[key]}: ${day.open}–${day.close}`;
}

/**
 * Format a single business as a WhatsApp-friendly block.
 */
export function formatBusiness(business: Business, index: number): string {
  const star = business.is_paying ? '⭐ ' : '';
  let block = `${star}${index}. *${business.name}*\n`;

  if (business.address) block += `📍 ${business.address}\n`;
  if (business.phone)   block += `📞 ${business.phone}\n`;

  if (business.opening_hours) {
    const todayHours = getTodayHours(business.opening_hours);
    if (todayHours) block += `🕐 ${todayHours}\n`;
  }

  return block;
}

/**
 * Format the full search result into a WhatsApp message string.
 */
export function formatWhatsAppResponse(result: SearchResult): string {
  if (result.results.length === 0) {
    return 'לא נמצאו עסקים תואמים. נסה לחפש במילות מפתח שונות, כמו שם העיר או סוג העסק.';
  }

  let response = `נמצאו ${result.results.length} עסקים:\n\n`;

  result.results.forEach((biz, i) => {
    response += formatBusiness(biz, i + 1) + '\n';
  });

  response = response.trimEnd();

  // Footer hint for paying results
  if (result.payingCount > 0) {
    response += '\n\n⭐ = עסק ממומן';
  }

  return response;
}

/**
 * Welcome / help message sent when a user first contacts the bot or sends "עזרה".
 */
export function formatHelpMessage(): string {
  return [
    'שלום! אני בוט חיפוש עסקים.',
    '',
    'שלח לי הודעה כמו:',
    '• "מסעדה כשרה בבני ברק"',
    '• "רופא שיניים בירושלים"',
    '• "קצביה בביתר עילית"',
    '',
    'אמצא עבורך את העסקים המתאימים ביותר.',
  ].join('\n');
}

// Operational Awareness — the contextual layer between calendar/weather/news
// and Vigmis decisions. A real marketing manager knows Black Friday is coming,
// it's raining all week, the office is closed Friday, and a competitor just
// announced layoffs. Vigmis needs the same situational awareness.
//
// What's in scope (Session 5/finishing):
//   - Calendar awareness (holidays, peak seasons by country)
//   - Business hours awareness (don't generate leads when no one answers)
//   - High-pressure shopping windows (BF/CM/back-to-school)
//
// Not yet in scope:
//   - Weather (requires per-business weather sensitivity flag)
//   - News monitoring (heavy, needs a news API + relevance LLM)

import { db } from '@vigmis/db';
import { getLatestWeatherRecommendation } from './weather.js';

export interface OperationalContext {
  today: string;
  iso_week: number;
  is_business_hours: boolean;
  upcoming_event: { name: string; date: string; days_until: number; type: 'holiday' | 'shopping_peak' | 'religious' } | null;
  active_event: { name: string; ends_on: string; type: 'holiday' | 'shopping_peak' | 'religious' } | null;
  weather_note: string | null;
  recent_news_alerts: number;
  recommendation: string;
}

// Israeli + Western calendar events. Per-tenant overrides via business_country.
// Dates are ISO month-day or computed (Black Friday = 4th Friday of November).
interface CalendarEvent {
  name: string;
  type: 'holiday' | 'shopping_peak' | 'religious';
  match: (date: Date) => boolean;
  // ad pressure: 'high' = run hot, 'low' = quiet, 'pause' = pause if you can
  pressure: 'high' | 'medium' | 'low' | 'pause';
  countries?: string[]; // if undefined, applies globally
}

function nthWeekdayOfMonth(date: Date, n: number, weekday: number, month0: number): boolean {
  if (date.getMonth() !== month0) return false;
  const day = date.getDate();
  if (date.getDay() !== weekday) return false;
  return Math.ceil(day / 7) === n;
}

const EVENTS: CalendarEvent[] = [
  // Black Friday — 4th Thursday of November (US/global)
  {
    name: 'Black Friday',
    type: 'shopping_peak',
    match: (d) => nthWeekdayOfMonth(d, 4, 5, 10) || nthWeekdayOfMonth(new Date(d.getTime() - 24 * 3600_000), 4, 4, 10),
    pressure: 'high',
  },
  {
    name: 'Cyber Monday',
    type: 'shopping_peak',
    match: (d) => d.getMonth() === 10 && d.getDay() === 1 && d.getDate() >= 28,
    pressure: 'high',
  },
  // Christmas / New Year window
  {
    name: 'Christmas season',
    type: 'shopping_peak',
    match: (d) => d.getMonth() === 11 && d.getDate() >= 1 && d.getDate() <= 24,
    pressure: 'high',
  },
  // Israeli — Rosh Hashana, Yom Kippur, Passover, Independence Day (approx — to be improved with hebcal API)
  {
    name: 'High Holidays (אלול-תשרי)',
    type: 'religious',
    match: (d) => (d.getMonth() === 8 || d.getMonth() === 9) && d.getDate() <= 15,
    pressure: 'low',
    countries: ['IL'],
  },
  {
    name: 'Yom Kippur (closed market)',
    type: 'religious',
    match: (d) => d.getMonth() === 8 && d.getDate() >= 22 && d.getDate() <= 25,
    pressure: 'pause',
    countries: ['IL'],
  },
  {
    name: 'Passover (פסח)',
    type: 'religious',
    match: (d) => d.getMonth() === 3 && d.getDate() >= 5 && d.getDate() <= 20,
    pressure: 'low',
    countries: ['IL'],
  },
  // Back-to-school (US/IL — late August)
  {
    name: 'Back-to-school',
    type: 'shopping_peak',
    match: (d) => d.getMonth() === 7 && d.getDate() >= 15,
    pressure: 'high',
  },
  // Valentine's Day
  {
    name: "Valentine's Day",
    type: 'shopping_peak',
    match: (d) => d.getMonth() === 1 && d.getDate() === 14,
    pressure: 'high',
  },
];

// Default business hours per country (local time). Customers can override
// in business_settings (future addition).
const DEFAULT_BUSINESS_HOURS: Record<string, { start: number; end: number; closedDays: number[] }> = {
  IL: { start: 9, end: 17, closedDays: [5, 6] }, // Fri afternoon-Sat
  US: { start: 9, end: 17, closedDays: [0, 6] },
  GB: { start: 9, end: 17, closedDays: [0, 6] },
  DE: { start: 9, end: 17, closedDays: [0, 6] },
};

function isBusinessHours(country: string, date: Date): boolean {
  const cfg = DEFAULT_BUSINESS_HOURS[country] ?? DEFAULT_BUSINESS_HOURS.US;
  const day = date.getDay();
  if (cfg.closedDays.includes(day)) return false;
  const hour = date.getHours();
  return hour >= cfg.start && hour < cfg.end;
}

export async function getOperationalContext(tenantId: string): Promise<OperationalContext> {
  const { data } = await db.from('client_settings')
    .select('business_country, geo_include')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  const country = data?.business_country
    ?? (Array.isArray(data?.geo_include) && data?.geo_include.includes('Israel') ? 'IL' : 'US');

  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  // Active event today
  let active: OperationalContext['active_event'] = null;
  for (const ev of EVENTS) {
    if (ev.countries && !ev.countries.includes(country)) continue;
    if (ev.match(now)) {
      // Approximate end-of-event: scan forward up to 14 days
      let endsOn = today;
      for (let i = 1; i <= 14; i++) {
        const future = new Date(now.getTime() + i * 24 * 3600_000);
        if (!ev.match(future)) break;
        endsOn = future.toISOString().slice(0, 10);
      }
      active = { name: ev.name, ends_on: endsOn, type: ev.type };
      break;
    }
  }

  // Next upcoming event in the next 30 days
  let upcoming: OperationalContext['upcoming_event'] = null;
  for (let i = 1; i <= 30 && !upcoming; i++) {
    const future = new Date(now.getTime() + i * 24 * 3600_000);
    for (const ev of EVENTS) {
      if (ev.countries && !ev.countries.includes(country)) continue;
      if (ev.match(future)) {
        upcoming = {
          name: ev.name,
          date: future.toISOString().slice(0, 10),
          days_until: i,
          type: ev.type,
        };
        break;
      }
    }
  }

  // Recommendation — combine calendar + weather + news signals
  const parts: string[] = [];
  if (active) {
    const ev = EVENTS.find((e) => e.name === active!.name);
    if (ev?.pressure === 'pause') {
      parts.push(`${active.name} — pause non-essential campaigns; cultural sensitivity.`);
    } else if (ev?.pressure === 'low') {
      parts.push(`${active.name} — reduce spend; market is distracted/closed.`);
    } else if (ev?.pressure === 'high') {
      parts.push(`${active.name} — high shopping pressure; consider increasing budget by 20-50%.`);
    }
  } else if (upcoming && upcoming.days_until <= 7) {
    parts.push(`${upcoming.name} in ${upcoming.days_until} day(s) — prepare creatives + ramp budget if a shopping peak.`);
  }

  // Weather signal
  const weatherNote = await getLatestWeatherRecommendation(tenantId).catch(() => null);
  if (weatherNote) parts.push(`Weather: ${weatherNote}`);

  // Recent news alerts count (last 24h, relevance ≥0.7)
  const since24h = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count: newsCount } = await db.from('news_alerts')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('status', 'new')
    .gte('relevance_score', 0.7)
    .gte('fetched_at', since24h);
  if (newsCount && newsCount > 0) {
    parts.push(`${newsCount} fresh news alert(s) flagged — review in Intelligence tab.`);
  }

  const rec = parts.length > 0 ? parts.join(' ') : 'No special operational signals — standard operation.';

  // ISO week
  const tmp = new Date(now);
  tmp.setHours(0, 0, 0, 0);
  tmp.setDate(tmp.getDate() + 4 - (tmp.getDay() || 7));
  const yearStart = new Date(tmp.getFullYear(), 0, 1);
  const week = Math.ceil((((tmp.getTime() - yearStart.getTime()) / 86400_000) + 1) / 7);

  return {
    today,
    iso_week: week,
    is_business_hours: isBusinessHours(country, now),
    upcoming_event: upcoming,
    active_event: active,
    weather_note: weatherNote,
    recent_news_alerts: newsCount ?? 0,
    recommendation: rec,
  };
}

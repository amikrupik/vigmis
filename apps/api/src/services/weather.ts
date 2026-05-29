// Weather Service — pulls 3-day forecast for weather-sensitive businesses.
//
// Provider: OpenWeatherMap "One Call" or "Forecast" API. Env var: OPENWEATHER_API_KEY.
// Degrade: no key → no-op.
//
// Used by operational-awareness to bump or dampen ad spend based on weather.

import { db } from '@vigmis/db';
import { isThrottled } from './usage.js';

const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY ?? '';

const CITY_TO_COORDS: Record<string, { lat: number; lon: number }> = {
  'Tel Aviv': { lat: 32.0853, lon: 34.7818 },
  'Jerusalem': { lat: 31.7683, lon: 35.2137 },
  'Haifa':     { lat: 32.7940, lon: 34.9896 },
  'New York':  { lat: 40.7128, lon: -74.0060 },
  'Los Angeles': { lat: 34.0522, lon: -118.2437 },
  'London':    { lat: 51.5074, lon: -0.1278 },
  'Berlin':    { lat: 52.5200, lon: 13.4050 },
  'Paris':     { lat: 48.8566, lon: 2.3522 },
};

interface WeatherSensitivity {
  hot_boost?: boolean;       // hot weather increases business (ice cream, AC, sunscreen)
  rain_dampens?: boolean;    // rain reduces business (foot traffic, outdoor)
  rain_boosts?: boolean;     // rain increases business (umbrellas, food delivery)
  cold_dampens?: boolean;
  cold_boosts?: boolean;     // hot drinks, heating
}

interface DailyForecast {
  date: string;
  temp_max: number;
  temp_min: number;
  weather_main: string;        // e.g. "Rain", "Clear", "Snow"
  rain_mm: number;
}

interface ForecastResult {
  location: string;
  days: DailyForecast[];
  recommendation: string;
  applied: boolean;
}

async function fetchOpenWeatherForecast(lat: number, lon: number): Promise<DailyForecast[]> {
  if (!OPENWEATHER_API_KEY) return [];
  // /forecast endpoint returns 3-hour intervals for 5 days; we'll aggregate to daily
  const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=metric&appid=${OPENWEATHER_API_KEY}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = await res.json() as {
      list: Array<{
        dt: number;
        main: { temp_min: number; temp_max: number };
        weather: Array<{ main: string }>;
        rain?: { '3h'?: number };
      }>;
    };
    // Group by date
    const byDate = new Map<string, DailyForecast>();
    for (const entry of json.list) {
      const date = new Date(entry.dt * 1000).toISOString().slice(0, 10);
      const cur = byDate.get(date) ?? {
        date,
        temp_max: -Infinity,
        temp_min: Infinity,
        weather_main: 'Clear',
        rain_mm: 0,
      };
      cur.temp_max = Math.max(cur.temp_max, entry.main.temp_max);
      cur.temp_min = Math.min(cur.temp_min, entry.main.temp_min);
      // Prefer "extreme" labels — Rain/Snow > Clouds > Clear
      const m = entry.weather[0]?.main ?? 'Clear';
      const rank: Record<string, number> = { Thunderstorm: 5, Snow: 4, Rain: 3, Drizzle: 3, Clouds: 2, Clear: 1 };
      if ((rank[m] ?? 0) > (rank[cur.weather_main] ?? 0)) cur.weather_main = m;
      cur.rain_mm += entry.rain?.['3h'] ?? 0;
      byDate.set(date, cur);
    }
    return Array.from(byDate.values()).slice(0, 3);
  } catch {
    return [];
  }
}

function recommendFromForecast(days: DailyForecast[], sens: WeatherSensitivity): { recommendation: string; should_apply: boolean } {
  if (days.length === 0) return { recommendation: '', should_apply: false };
  const tomorrow = days[1] ?? days[0];

  const reasons: string[] = [];
  if (sens.hot_boost && tomorrow.temp_max >= 28) {
    reasons.push(`tomorrow ${tomorrow.temp_max.toFixed(0)}°C — high temps favor this business; consider +budget`);
  }
  if (sens.cold_boosts && tomorrow.temp_min <= 5) {
    reasons.push(`tomorrow ${tomorrow.temp_min.toFixed(0)}°C — cold favors this business; consider +budget`);
  }
  const rainy = ['Rain', 'Drizzle', 'Thunderstorm'].includes(tomorrow.weather_main) || tomorrow.rain_mm > 2;
  if (sens.rain_boosts && rainy) {
    reasons.push(`tomorrow rain (${tomorrow.rain_mm.toFixed(1)}mm) — rain favors this business; consider +budget`);
  }
  if (sens.rain_dampens && rainy) {
    reasons.push(`tomorrow rain — reduces business; consider -budget`);
  }
  if (sens.cold_dampens && tomorrow.temp_min <= 5) {
    reasons.push(`tomorrow cold — reduces business; consider -budget`);
  }

  return { recommendation: reasons.join('; '), should_apply: reasons.length > 0 };
}

/**
 * Fetch + score forecast for a tenant. Persists a snapshot.
 */
export async function refreshWeatherForTenant(tenantId: string): Promise<ForecastResult | null> {
  if (!OPENWEATHER_API_KEY) return null;

  const { data: settings } = await db.from('client_settings')
    .select('weather_sensitive, weather_sensitivity, geo_include, business_country')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (!settings?.weather_sensitive) return null;

  const sens = (settings.weather_sensitivity as WeatherSensitivity | null) ?? {};
  // Pick the first city we recognize from geo_include
  const geo: string[] = settings.geo_include ?? [];
  let coords: { lat: number; lon: number } | undefined;
  let location = '';
  for (const g of geo) {
    if (CITY_TO_COORDS[g]) { coords = CITY_TO_COORDS[g]; location = g; break; }
  }
  if (!coords && settings.business_country === 'IL') {
    coords = CITY_TO_COORDS['Tel Aviv'];
    location = 'Tel Aviv (default)';
  }
  if (!coords) return null;

  const days = await fetchOpenWeatherForecast(coords.lat, coords.lon);
  if (days.length === 0) return null;

  const { recommendation, should_apply } = recommendFromForecast(days, sens);

  await db.from('weather_snapshot').insert({
    tenant_id: tenantId,
    location,
    forecast: { days, sensitivity: sens },
    recommendation,
    applied: false,
  });

  return { location, days, recommendation, applied: should_apply };
}

/**
 * Cron — fires daily for every weather-sensitive tenant.
 */
export async function dispatchWeatherCron(): Promise<{ tenants: number; updated: number }> {
  if (!OPENWEATHER_API_KEY) return { tenants: 0, updated: 0 };
  const { data: tenants } = await db.from('client_settings')
    .select('tenant_id')
    .eq('weather_sensitive', true);
  if (!tenants?.length) return { tenants: 0, updated: 0 };
  let updated = 0;
  let checked = 0;
  for (const t of tenants) {
    if (await isThrottled(t.tenant_id).catch(() => false)) continue; // degrade/freeze → skip non-essential
    const r = await refreshWeatherForTenant(t.tenant_id).catch(() => null);
    if (r) updated++;
    checked++;
  }
  return { tenants: checked, updated };
}

/**
 * Helper for operational-awareness to query latest weather snapshot.
 */
export async function getLatestWeatherRecommendation(tenantId: string): Promise<string | null> {
  const { data } = await db.from('weather_snapshot')
    .select('recommendation, fetched_at')
    .eq('tenant_id', tenantId)
    .order('fetched_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.recommendation) return null;
  // Snapshot must be fresh (last 24h)
  if (Date.now() - new Date(data.fetched_at).getTime() > 24 * 3600_000) return null;
  return data.recommendation;
}

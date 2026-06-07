export const RTL_LOCALES = new Set(['he', 'ar']);

export const SUPPORTED_LOCALES = [
  'en', 'he', 'ar', 'es', 'pt', 'fr', 'de', 'ru', 'it', 'tr', 'ja', 'ko', 'el',
] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export function isSupported(lang: string): lang is SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(lang);
}

export function normalizeLocale(raw: string | undefined): SupportedLocale {
  if (!raw) return 'en';
  const lower = raw.toLowerCase().split('-')[0];
  return isSupported(lower) ? lower : 'en';
}

export async function getMessages(locale: SupportedLocale): Promise<Record<string, unknown>> {
  try {
    const messages = (await import(`../messages/${locale}.json`)) as { default: Record<string, unknown> };
    return messages.default;
  } catch {
    const fallback = (await import('../messages/en.json')) as { default: Record<string, unknown> };
    return fallback.default;
  }
}

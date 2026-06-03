// Lightweight i18n helper — no external library needed for the infrastructure layer.
// useTranslations() will be wired to next-intl once installed; for now this
// provides the server-side getMessages() helper and the RTL locale list.

export const RTL_LOCALES = new Set(['he', 'ar']);

export const SUPPORTED_LOCALES = [
  'en', 'he', 'ar', 'es', 'pt', 'fr', 'ru', 'de', 'tr', 'it',
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

/** Load the messages JSON for the given locale. */
export async function getMessages(locale: SupportedLocale): Promise<Record<string, unknown>> {
  try {
    // Dynamic import keeps bundles split per locale.
    const messages = (await import(`../messages/${locale}.json`)) as { default: Record<string, unknown> };
    return messages.default;
  } catch {
    // Fallback to English if a locale file is missing.
    const fallback = (await import('../messages/en.json')) as { default: Record<string, unknown> };
    return fallback.default;
  }
}

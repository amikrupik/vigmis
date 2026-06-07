'use client';

import { SUPPORTED_LOCALES } from '../../lib/i18n';

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  he: 'עברית',
  ar: 'العربية',
  es: 'Español',
  pt: 'Português',
  fr: 'Français',
  de: 'Deutsch',
  ru: 'Русский',
  it: 'Italiano',
  tr: 'Türkçe',
  ja: '日本語',
  ko: '한국어',
  el: 'Ελληνικά',
};

export default function LanguageSwitcher({ locale }: { locale: string }) {
  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newLocale = e.target.value;
    document.cookie = `vigmis_lang=${newLocale}; max-age=${60 * 60 * 24 * 365}; path=/; SameSite=Lax`;
    window.location.reload();
  }

  return (
    <div className="relative inline-flex items-center">
      <select
        value={locale}
        onChange={handleChange}
        aria-label="Select language"
        className="appearance-none bg-transparent border border-slate-200 rounded-lg pl-3 pr-7 py-1.5 text-sm text-slate-700 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
      >
        {SUPPORTED_LOCALES.map((l) => (
          <option key={l} value={l}>
            {LANGUAGE_NAMES[l]}
          </option>
        ))}
      </select>
      <svg
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2.5}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
    </div>
  );
}

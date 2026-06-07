'use client';

import { useState, useEffect, useRef } from 'react';

const LANGUAGES = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'he', label: 'עברית', flag: '🇮🇱' },
  { code: 'ar', label: 'العربية', flag: '🇸🇦' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'pt', label: 'Português', flag: '🇧🇷' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'ru', label: 'Русский', flag: '🇷🇺' },
  { code: 'it', label: 'Italiano', flag: '🇮🇹' },
  { code: 'tr', label: 'Türkçe', flag: '🇹🇷' },
  { code: 'ja', label: '日本語', flag: '🇯🇵' },
  { code: 'ko', label: '한국어', flag: '🇰🇷' },
  { code: 'el', label: 'Ελληνικά', flag: '🇬🇷' },
] as const;

function getCookieLang(): string {
  if (typeof document === 'undefined') return 'en';
  const match = document.cookie.match(/(?:^|;\s*)vigmis_lang=([^;]+)/);
  return match ? match[1] : 'en';
}

function setLangCookie(lang: string) {
  const maxAge = 60 * 60 * 24 * 365; // 1 year
  document.cookie = `vigmis_lang=${lang}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

export default function LanguageSelector() {
  const [current, setCurrent] = useState('en');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCurrent(getCookieLang());
  }, []);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const currentLang = LANGUAGES.find((l) => l.code === current) ?? LANGUAGES[0];

  function selectLang(code: string) {
    setLangCookie(code);
    setCurrent(code);
    setOpen(false);
    window.location.reload();
  }

  return (
    <div ref={ref} className="relative inline-block text-sm">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span aria-hidden="true">{currentLang.flag}</span>
        <span className="hidden sm:inline">{currentLang.label}</span>
        <svg
          className={`w-3.5 h-3.5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute z-50 mt-1 w-44 rounded-md border border-slate-200 bg-white shadow-lg py-1 end-0"
        >
          {LANGUAGES.map((lang) => (
            <li key={lang.code}>
              <button
                role="option"
                aria-selected={lang.code === current}
                onClick={() => selectLang(lang.code)}
                className={`w-full text-start px-3 py-1.5 flex items-center gap-2 hover:bg-slate-50 ${
                  lang.code === current ? 'font-medium text-indigo-600' : 'text-slate-700'
                }`}
              >
                <span aria-hidden="true">{lang.flag}</span>
                {lang.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

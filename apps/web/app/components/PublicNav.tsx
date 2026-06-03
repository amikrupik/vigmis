'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import LanguageSelector from './LanguageSelector';

const NAV_LINKS = [
  { href: '/pricing', label: 'Pricing' },
  { href: '/about', label: 'About' },
  { href: '/faq', label: 'FAQ' },
  { href: '/contact', label: 'Contact' },
];

export default function PublicNav() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="px-6 py-4 flex items-center justify-between border-b border-slate-100 sticky top-0 bg-white/90 backdrop-blur z-20">
      <Link href="/" onClick={() => setOpen(false)}>
        <Image src="/logo_nav.png" alt="Vigmis" width={200} height={44} priority />
      </Link>

      {/* Desktop links */}
      <div className="hidden sm:flex items-center gap-5">
        {NAV_LINKS.map(l => (
          <Link key={l.href} href={l.href} className="text-sm text-slate-500 hover:text-slate-800 font-medium">{l.label}</Link>
        ))}
        <LanguageSelector />
        <Link href="/sign-in" className="text-sm text-slate-600 hover:text-slate-900 font-semibold">Sign in</Link>
        <Link href="/sign-up" className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">
          Get Started →
        </Link>
      </div>

      {/* Mobile: Sign up + hamburger */}
      <div className="flex sm:hidden items-center gap-3">
        <Link href="/sign-up" className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors">
          Get Started →
        </Link>
        <button
          onClick={() => setOpen(o => !o)}
          className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
          aria-label="Toggle menu"
        >
          {open ? (
            <svg className="w-5 h-5 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-5 h-5 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile dropdown */}
      {open && (
        <div className="absolute top-full left-0 right-0 bg-white border-b border-slate-200 shadow-lg sm:hidden z-30">
          <div className="flex flex-col px-6 py-4 gap-4">
            {NAV_LINKS.map(l => (
              <Link key={l.href} href={l.href} className="text-sm text-slate-700 font-medium hover:text-indigo-600" onClick={() => setOpen(false)}>{l.label}</Link>
            ))}
            <hr className="border-slate-100" />
            <Link href="/sign-in" className="text-sm text-slate-700 font-semibold hover:text-indigo-600" onClick={() => setOpen(false)}>Sign in</Link>
          </div>
        </div>
      )}
    </nav>
  );
}

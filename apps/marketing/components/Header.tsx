"use client";

import { useTranslations, useLocale } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import Link from "next/link";

export default function Header() {
  const t = useTranslations("nav");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const switchLocale = (newLocale: string) => {
    // Replace the locale segment in the pathname
    const segments = pathname.split("/");
    segments[1] = newLocale;
    router.push(segments.join("/"));
  };

  const navLinks = [
    { label: t("features"), href: `/${locale}/#features` },
    { label: t("howItWorks"), href: `/${locale}/#how-it-works` },
    { label: t("pricing"), href: `/${locale}/#pricing` },
    { label: t("faq"), href: `/${locale}/#faq` },
  ];

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? "bg-white/95 backdrop-blur-sm shadow-sm border-b border-gray-100" : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 lg:h-20">
          {/* Logo */}
          <Link
            href={`/${locale}`}
            className="flex items-center gap-2 group"
            aria-label={t("logoAlt")}
          >
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center shadow-md group-hover:shadow-primary/40 transition-shadow">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <path
                  d="M9 2L15.5 5.5V12.5L9 16L2.5 12.5V5.5L9 2Z"
                  fill="white"
                  fillOpacity="0.9"
                />
                <path
                  d="M6 9L8.5 11.5L12.5 7"
                  stroke="white"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              </svg>
            </div>
            <span className="text-xl font-bold text-dark tracking-tight">Vigmis</span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-8" aria-label="Main navigation">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="text-sm font-medium text-gray-600 hover:text-primary transition-colors"
              >
                {link.label}
              </a>
            ))}
          </nav>

          {/* Right side actions */}
          <div className="hidden lg:flex items-center gap-3">
            {/* Language switcher */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1" role="group" aria-label="Language selector">
              <button
                onClick={() => switchLocale("en")}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                  locale === "en"
                    ? "bg-white text-primary shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
                aria-pressed={locale === "en"}
              >
                {t("langEn")}
              </button>
              <button
                onClick={() => switchLocale("he")}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                  locale === "he"
                    ? "bg-white text-primary shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
                aria-pressed={locale === "he"}
              >
                {t("langHe")}
              </button>
            </div>

            <a
              href="https://app.vigmis.com/sign-in"
              className="text-sm font-medium text-gray-700 hover:text-primary transition-colors px-3 py-2"
            >
              {t("signIn")}
            </a>
            <a
              href="https://app.vigmis.com/sign-up"
              className="inline-flex items-center gap-2 bg-primary hover:bg-primary-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-all hover:shadow-lg hover:shadow-primary/30 active:scale-95"
            >
              {t("startFree")}
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M1 7h12M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </a>
          </div>

          {/* Mobile menu button */}
          <button
            className="lg:hidden p-2 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            aria-label="Toggle menu"
          >
            {menuOpen ? (
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M4 4l12 12M16 4L4 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div
          id="mobile-menu"
          className="lg:hidden bg-white border-t border-gray-100 shadow-lg"
        >
          <nav className="max-w-7xl mx-auto px-4 py-4 flex flex-col gap-1" aria-label="Mobile navigation">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="text-base font-medium text-gray-700 hover:text-primary px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors"
                onClick={() => setMenuOpen(false)}
              >
                {link.label}
              </a>
            ))}
            <div className="mt-2 pt-4 border-t border-gray-100 flex flex-col gap-3">
              {/* Language switcher mobile */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">Language:</span>
                <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                  <button
                    onClick={() => { switchLocale("en"); setMenuOpen(false); }}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                      locale === "en" ? "bg-white text-primary shadow-sm" : "text-gray-500"
                    }`}
                  >
                    EN
                  </button>
                  <button
                    onClick={() => { switchLocale("he"); setMenuOpen(false); }}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                      locale === "he" ? "bg-white text-primary shadow-sm" : "text-gray-500"
                    }`}
                  >
                    HE
                  </button>
                </div>
              </div>
              <a
                href="https://app.vigmis.com/sign-in"
                className="text-center text-sm font-medium text-gray-700 border border-gray-200 rounded-xl py-2.5 hover:bg-gray-50 transition-colors"
              >
                {t("signIn")}
              </a>
              <a
                href="https://app.vigmis.com/sign-up"
                className="text-center text-sm font-semibold bg-primary text-white rounded-xl py-2.5 hover:bg-primary-600 transition-colors"
              >
                {t("startFree")}
              </a>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}

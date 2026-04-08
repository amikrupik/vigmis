import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";

export default function Footer() {
  const t = useTranslations("footer");
  const locale = useLocale();

  return (
    <footer className="bg-dark text-gray-400">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-12">
          {/* Brand */}
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                  <path d="M9 2L15.5 5.5V12.5L9 16L2.5 12.5V5.5L9 2Z" fill="white" fillOpacity="0.9"/>
                  <path d="M6 9L8.5 11.5L12.5 7" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                </svg>
              </div>
              <span className="text-xl font-bold text-white">Vigmis</span>
            </div>
            <p className="text-gray-400 text-sm leading-relaxed max-w-xs mb-6">
              {t("tagline")}
            </p>
            {/* Social links */}
            <div className="flex items-center gap-3">
              <a
                href="https://twitter.com/vigmis"
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
                aria-label="Twitter"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
              </a>
              <a
                href="https://linkedin.com/company/vigmis"
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
                aria-label="LinkedIn"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                </svg>
              </a>
            </div>
          </div>

          {/* Product */}
          <div>
            <h3 className="text-white font-semibold text-sm mb-4">{t("product")}</h3>
            <ul className="space-y-3">
              <li>
                <a href={`/${locale}/#features`} className="text-sm hover:text-white transition-colors">{t("features")}</a>
              </li>
              <li>
                <a href={`/${locale}/#pricing`} className="text-sm hover:text-white transition-colors">{t("pricing")}</a>
              </li>
              <li>
                <a href={`/${locale}/#how-it-works`} className="text-sm hover:text-white transition-colors">{t("howItWorks")}</a>
              </li>
              <li>
                <a href={`/${locale}/#faq`} className="text-sm hover:text-white transition-colors">{t("faq")}</a>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="text-white font-semibold text-sm mb-4">{t("legal")}</h3>
            <ul className="space-y-3">
              <li>
                <Link href={`/${locale}/privacy`} className="text-sm hover:text-white transition-colors">{t("privacy")}</Link>
              </li>
              <li>
                <Link href={`/${locale}/terms`} className="text-sm hover:text-white transition-colors">{t("terms")}</Link>
              </li>
              <li>
                <a href="mailto:hello@vigmis.com" className="text-sm hover:text-white transition-colors">{t("contact")}</a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-8 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-gray-500">{t("copyright")}</p>
          <p className="text-sm text-gray-600">{t("madeWith")}</p>
        </div>
      </div>
    </footer>
  );
}

import { useTranslations } from "next-intl";

export default function CTABanner() {
  const t = useTranslations("ctaBanner");

  return (
    <section className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative bg-primary rounded-3xl overflow-hidden">
          {/* Background decorations */}
          <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
            {/* Gradient orbs */}
            <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full bg-white/5 blur-3xl" />
            <div className="absolute -bottom-20 -left-20 w-80 h-80 rounded-full bg-primary-700/50 blur-3xl" />
            {/* Pattern */}
            <svg className="absolute inset-0 w-full h-full opacity-5" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="cta-dots" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
                  <circle cx="2" cy="2" r="1.5" fill="white"/>
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#cta-dots)" />
            </svg>
          </div>

          <div className="relative px-8 py-16 sm:px-16 sm:py-20 text-center">
            {/* Floating icon */}
            <div className="inline-flex items-center justify-center w-16 h-16 bg-white/10 rounded-2xl mb-6 mx-auto">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                <path d="M16 4L24 8V16L16 28L8 16V8L16 4Z" fill="white" fillOpacity="0.2" stroke="white" strokeWidth="1.5" strokeLinejoin="round"/>
                <path d="M11 16L14 19L21 12" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>

            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white tracking-tight mb-4 max-w-3xl mx-auto leading-tight">
              {t("headline")}
            </h2>
            <p className="text-lg text-white/70 mb-10 max-w-lg mx-auto">
              {t("subheadline")}
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a
                href="https://app.vigmis.com/sign-up"
                className="inline-flex items-center gap-2.5 bg-white text-primary hover:bg-gray-50 font-bold text-base px-8 py-4 rounded-2xl transition-all hover:shadow-2xl active:scale-[0.98] w-full sm:w-auto justify-center"
              >
                {t("cta")}
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M1 8h14M9 3l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </a>
            </div>
            <p className="text-white/40 text-sm mt-4">{t("ctaNote")}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

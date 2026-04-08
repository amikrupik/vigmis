import { useTranslations } from "next-intl";

const steps = [
  {
    key: "step1",
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
        <rect x="3" y="5" width="22" height="16" rx="3" stroke="currentColor" strokeWidth="1.8"/>
        <path d="M9 9h10M9 13h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        <path d="M19 17l3 4M22 17l-3 4" stroke="#F59E0B" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="21" cy="21" r="4" fill="#6366F1" fillOpacity="0.15" stroke="#6366F1" strokeWidth="1.5"/>
        <path d="M19.5 21h3M21 19.5v3" stroke="#6366F1" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    key: "step2",
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
        <circle cx="14" cy="10" r="5" stroke="currentColor" strokeWidth="1.8"/>
        <path d="M5 23c0-4.418 4.03-8 9-8s9 3.582 9 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        <path d="M20 6l2-2M22 8h2M20 10l2 2" stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    key: "step3",
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
        <path d="M5 14a9 9 0 0118 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        <circle cx="14" cy="14" r="3" fill="#6366F1" fillOpacity="0.2" stroke="#6366F1" strokeWidth="1.8"/>
        <path d="M14 14l4-7" stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round"/>
        <circle cx="14" cy="14" r="1.5" fill="#6366F1"/>
        <path d="M7 20h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    ),
  },
];

export default function HowItWorks() {
  const t = useTranslations("howItWorks");

  return (
    <section id="how-it-works" className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-amber/10 text-amber-600 text-sm font-semibold px-4 py-2 rounded-full mb-4">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M7 1l1.5 3.5L12 5.5l-2.5 2.5.5 3.5L7 10l-3 1.5.5-3.5L2 5.5l3.5-1z" fill="currentColor"/>
            </svg>
            {t("badge")}
          </div>
          <h2 className="text-4xl sm:text-5xl font-extrabold text-dark tracking-tight mb-4">
            {t("headline")}
          </h2>
          <p className="text-lg text-gray-500 max-w-xl mx-auto">{t("subheadline")}</p>
        </div>

        {/* Steps */}
        <div className="relative">
          {/* Connector line (desktop) */}
          <div className="hidden lg:block absolute top-16 left-1/2 -translate-x-1/2 w-full max-w-2xl h-px" aria-hidden="true">
            <svg width="100%" height="2" viewBox="0 0 700 2" preserveAspectRatio="none">
              <line x1="80" y1="1" x2="620" y2="1" stroke="#E5E7EB" strokeWidth="2" strokeDasharray="6 4"/>
            </svg>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-6">
            {steps.map((step, index) => (
              <div key={step.key} className="flex flex-col items-center text-center group">
                {/* Step number + icon */}
                <div className="relative mb-6">
                  <div className="w-20 h-20 rounded-2xl bg-white border-2 border-gray-100 group-hover:border-primary/30 shadow-sm group-hover:shadow-lg group-hover:shadow-primary/10 flex items-center justify-center text-gray-700 transition-all duration-300">
                    {step.icon}
                  </div>
                  <div className="absolute -top-3 -right-3 w-7 h-7 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center shadow-md">
                    {index + 1}
                  </div>
                </div>
                <h3 className="text-xl font-bold text-dark mb-3">
                  {t(`${step.key}Title` as "step1Title" | "step2Title" | "step3Title")}
                </h3>
                <p className="text-gray-500 leading-relaxed text-sm max-w-xs">
                  {t(`${step.key}Desc` as "step1Desc" | "step2Desc" | "step3Desc")}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="mt-16 text-center">
          <a
            href="https://app.vigmis.com/sign-up"
            className="inline-flex items-center gap-2 bg-primary hover:bg-primary-600 text-white font-bold px-8 py-4 rounded-2xl transition-all hover:shadow-lg hover:shadow-primary/30 active:scale-[0.98]"
          >
            Get started — it&apos;s free
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M1 8h14M9 3l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </a>
        </div>
      </div>
    </section>
  );
}

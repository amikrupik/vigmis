import { useTranslations } from "next-intl";

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="flex-shrink-0 mt-0.5" aria-hidden="true">
    <circle cx="8" cy="8" r="7" fill="currentColor" fillOpacity="0.15"/>
    <path d="M5 8l2.5 2.5L11 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export default function Pricing() {
  const t = useTranslations("pricing");

  const freeFeatures = [
    t("freeFeature1"),
    t("freeFeature2"),
    t("freeFeature3"),
    t("freeFeature4"),
    t("freeFeature5"),
    t("freeFeature6"),
  ];

  const proFeatures = [
    t("proFeature1"),
    t("proFeature2"),
    t("proFeature3"),
    t("proFeature4"),
    t("proFeature5"),
    t("proFeature6"),
    t("proFeature7"),
    t("proFeature8"),
  ];

  return (
    <section id="pricing" className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-primary/8 border border-primary/20 text-primary text-sm font-semibold px-4 py-2 rounded-full mb-4">
            {t("badge")}
          </div>
          <h2 className="text-4xl sm:text-5xl font-extrabold text-dark tracking-tight mb-4">
            {t("headline")}
          </h2>
          <p className="text-lg text-gray-500 max-w-xl mx-auto">{t("subheadline")}</p>
        </div>

        {/* Pricing cards */}
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch">
          {/* Free plan */}
          <div className="relative bg-white rounded-3xl border-2 border-gray-200 p-8 flex flex-col hover:border-gray-300 transition-colors">
            <div className="mb-6">
              <h3 className="text-2xl font-bold text-dark mb-1">{t("freePlan")}</h3>
              <p className="text-sm text-gray-500 mb-4">For businesses getting started</p>
              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-extrabold text-dark">{t("freePrice")}</span>
                <span className="text-gray-500 text-sm">{t("freePriceSub")}</span>
              </div>
              <p className="text-sm font-semibold text-primary mt-2">{t("freeFee")}</p>
            </div>

            <a
              href="https://app.vigmis.com/sign-up"
              className="block text-center font-bold py-3.5 px-6 rounded-xl border-2 border-primary text-primary hover:bg-primary/5 transition-colors mb-8"
            >
              {t("freeCta")}
            </a>

            <ul className="space-y-3 flex-1">
              {freeFeatures.map((feature) => (
                <li key={feature} className="flex items-start gap-3 text-sm text-gray-600">
                  <span className="text-primary"><CheckIcon /></span>
                  {feature}
                </li>
              ))}
            </ul>

            {/* Example */}
            <div className="mt-6 pt-6 border-t border-gray-100">
              <p className="text-xs text-gray-400 leading-relaxed">{t("example")}</p>
            </div>
          </div>

          {/* Pro plan */}
          <div className="relative bg-primary rounded-3xl border-2 border-primary p-8 flex flex-col shadow-2xl shadow-primary/25">
            {/* Popular badge */}
            <div className="absolute -top-4 left-1/2 -translate-x-1/2">
              <span className="inline-flex items-center gap-1.5 bg-amber-400 text-dark text-xs font-bold px-4 py-1.5 rounded-full shadow-md">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <path d="M6 1l1.2 2.8 3 .3-2.2 2 .7 3L6 7.5 3.3 9.1l.7-3L1.8 4.1l3-.3L6 1z" fill="currentColor"/>
                </svg>
                {t("popular")}
              </span>
            </div>

            <div className="mb-6">
              <h3 className="text-2xl font-bold text-white mb-1">{t("proPlan")}</h3>
              <p className="text-sm text-primary-200 mb-4 text-white/60">For serious growth</p>
              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-extrabold text-white">{t("proPrice")}</span>
                <span className="text-white/60 text-sm">{t("proPriceSub")}</span>
              </div>
              <p className="text-sm font-semibold text-white/80 mt-2">{t("proFee")}</p>
            </div>

            <a
              href="https://app.vigmis.com/sign-up"
              className="block text-center font-bold py-3.5 px-6 rounded-xl bg-white text-primary hover:bg-gray-50 transition-colors mb-8 shadow-md"
            >
              {t("proCta")}
            </a>

            <ul className="space-y-3 flex-1">
              {proFeatures.map((feature) => (
                <li key={feature} className="flex items-start gap-3 text-sm text-white/90">
                  <span className="text-white"><CheckIcon /></span>
                  {feature}
                </li>
              ))}
            </ul>

            {/* Example */}
            <div className="mt-6 pt-6 border-t border-white/20">
              <p className="text-xs text-white/50 leading-relaxed">{t("examplePro")}</p>
            </div>
          </div>
        </div>

        {/* Fee note */}
        <div className="mt-10 max-w-2xl mx-auto text-center">
          <div className="inline-flex items-start gap-3 bg-gray-50 rounded-2xl px-6 py-4 text-left">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="flex-shrink-0 mt-0.5 text-primary" aria-hidden="true">
              <circle cx="9" cy="9" r="8" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M9 8v5M9 6v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <p className="text-sm text-gray-500 leading-relaxed">{t("feeNote")}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

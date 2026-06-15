import { useTranslations } from "next-intl";

const featureIcons = [
  // AI-powered optimization
  <svg key="f1" width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 2L8 6H4v4L2 12l2 2v4h4l4 4 4-4h4v-4l2-2-2-2V6h-4L12 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    <circle cx="12" cy="12" r="3" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="1.5"/>
  </svg>,
  // Google & Meta
  <svg key="f2" width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="2" y="3" width="9" height="9" rx="2" stroke="currentColor" strokeWidth="1.5"/>
    <rect x="13" y="3" width="9" height="9" rx="2" stroke="currentColor" strokeWidth="1.5"/>
    <rect x="2" y="14" width="9" height="7" rx="2" stroke="currentColor" strokeWidth="1.5"/>
    <rect x="13" y="14" width="9" height="7" rx="2" stroke="currentColor" strokeWidth="1.5"/>
  </svg>,
  // Dashboard
  <svg key="f3" width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M8 16V12M12 16V8M16 16V11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M2 8h20" stroke="currentColor" strokeWidth="1.5"/>
  </svg>,
  // Smart budgeting
  <svg key="f4" width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M12 6v2M12 16v2M9 12h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M9.5 9.5C10 8.5 10.9 8 12 8c1.5 0 2.5 1 2.5 2.5 0 2-2.5 2-2.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>,
  // 24/7 automation
  <svg key="f5" width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M5 5l1.5 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M19 5l-1.5 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>,
  // Performance reports
  <svg key="f6" width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M4 4v16h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M7 14l4-4 3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="19" cy="8" r="2" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="1.5"/>
  </svg>,
  // Incrementality — three-column measurement
  <svg key="f7" width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M3 17l4-6 4 3 4-8 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="7" cy="11" r="1.5" fill="currentColor"/>
    <circle cx="11" cy="14" r="1.5" fill="currentColor"/>
    <circle cx="15" cy="6" r="1.5" fill="currentColor"/>
    <circle cx="19" cy="10" r="1.5" fill="currentColor"/>
    <path d="M3 20h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>,
  // Portfolio allocation — split arrow
  <svg key="f8" width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M12 3v9m0 0l-4-4m4 4l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M7 15h3m4 0h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>,
];

const featureKeys = ["f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8"] as const;

export default function Features() {
  const t = useTranslations("features");

  return (
    <section id="features" className="py-24 bg-gray-50">
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

        {/* Features grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {featureKeys.map((key, index) => (
            <div
              key={key}
              className="bg-white rounded-2xl p-6 border border-gray-100 hover:border-primary/20 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 group"
            >
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-colors ${
                  index === 0
                    ? "bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white"
                    : index === 3
                    ? "bg-amber/10 text-amber-600 group-hover:bg-amber-500 group-hover:text-white"
                    : "bg-primary/8 text-primary group-hover:bg-primary group-hover:text-white"
                }`}
              >
                {featureIcons[index]}
              </div>
              <h3 className="text-lg font-bold text-dark mb-2">
                {t(`${key}Title` as "f1Title")}
              </h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                {t(`${key}Desc` as "f1Desc")}
              </p>
            </div>
          ))}
        </div>

        {/* Platform logos row */}
        <div className="mt-16 text-center">
          <p className="text-sm text-gray-400 font-medium mb-6 uppercase tracking-wide">Works with your existing accounts</p>
          <div className="flex flex-wrap items-center justify-center gap-8">
            {/* Google Ads */}
            <div className="flex items-center gap-2 text-gray-400 hover:text-gray-600 transition-colors">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-label="Google Ads">
                <path d="M12 5l6.5 11.25H5.5L12 5z" fill="#FBBC04"/>
                <circle cx="18.5" cy="16.5" r="3.5" fill="#34A853"/>
                <circle cx="5.5" cy="16.5" r="3.5" fill="#EA4335"/>
              </svg>
              <span className="text-base font-semibold">Google Ads</span>
            </div>
            <div className="w-px h-6 bg-gray-200" aria-hidden="true"/>
            {/* Meta Ads */}
            <div className="flex items-center gap-2 text-gray-400 hover:text-gray-600 transition-colors">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-label="Meta Ads">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h-2V9h2v8zm4 0h-2V9h2v8z" fill="#1877F2"/>
              </svg>
              <span className="text-base font-semibold">Meta Ads</span>
            </div>
            <div className="w-px h-6 bg-gray-200" aria-hidden="true"/>
            {/* Facebook */}
            <div className="flex items-center gap-2 text-gray-400 hover:text-gray-600 transition-colors">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="#1877F2" aria-label="Facebook">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
              <span className="text-base font-semibold">Facebook</span>
            </div>
            <div className="w-px h-6 bg-gray-200" aria-hidden="true"/>
            {/* Instagram */}
            <div className="flex items-center gap-2 text-gray-400 hover:text-gray-600 transition-colors">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-label="Instagram">
                <defs>
                  <linearGradient id="ig-grad" x1="0" y1="1" x2="1" y2="0">
                    <stop offset="0%" stopColor="#F58529"/>
                    <stop offset="50%" stopColor="#DD2A7B"/>
                    <stop offset="100%" stopColor="#8134AF"/>
                  </linearGradient>
                </defs>
                <rect x="2" y="2" width="20" height="20" rx="5" fill="url(#ig-grad)"/>
                <circle cx="12" cy="12" r="4" stroke="white" strokeWidth="1.5" fill="none"/>
                <circle cx="17.5" cy="6.5" r="1.2" fill="white"/>
              </svg>
              <span className="text-base font-semibold">Instagram</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

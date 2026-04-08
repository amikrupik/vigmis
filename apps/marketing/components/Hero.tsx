import { useTranslations } from "next-intl";

export default function Hero() {
  const t = useTranslations("hero");

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-white pt-20">
      {/* Background decorations */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        {/* Radial gradient */}
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] rounded-full bg-amber/10 blur-3xl" />
        {/* Grid pattern */}
        <svg
          className="absolute inset-0 w-full h-full opacity-[0.03]"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern id="hero-grid" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#6366F1" strokeWidth="1"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#hero-grid)" />
        </svg>
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 bg-primary/8 border border-primary/20 text-primary text-sm font-semibold px-4 py-2 rounded-full mb-8 animate-fade-in">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse" aria-hidden="true" />
          {t("badge")}
        </div>

        {/* Main headline */}
        <h1 className="text-5xl sm:text-6xl lg:text-7xl xl:text-8xl font-extrabold text-dark tracking-tight leading-[1.05] mb-6 animate-slide-up">
          {t("headline")}
          <br />
          <span className="text-primary relative inline-block">
            {t("headlineAccent")}
            {/* Underline decoration */}
            <svg
              className="absolute -bottom-3 left-0 w-full"
              height="12"
              viewBox="0 0 300 12"
              fill="none"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path
                d="M1 8C50 3 150 1 299 8"
                stroke="#F59E0B"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>
          </span>
        </h1>

        {/* Subheadline */}
        <p className="text-lg sm:text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed mb-10 animate-slide-up">
          {t("subheadline")}
        </p>

        {/* CTA buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-6">
          <a
            href="https://app.vigmis.com/sign-up"
            className="inline-flex items-center gap-2.5 bg-primary hover:bg-primary-600 text-white font-bold text-base px-8 py-4 rounded-2xl transition-all hover:shadow-xl hover:shadow-primary/30 active:scale-[0.98] w-full sm:w-auto justify-center"
          >
            {t("ctaPrimary")}
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M1 8h14M9 3l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </a>
          <a
            href="#how-it-works"
            className="inline-flex items-center gap-2.5 bg-white hover:bg-gray-50 text-dark font-semibold text-base px-8 py-4 rounded-2xl border border-gray-200 hover:border-gray-300 transition-all w-full sm:w-auto justify-center"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <circle cx="9" cy="9" r="7.5" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M7.5 6l4.5 3-4.5 3V6z" fill="currentColor"/>
            </svg>
            {t("ctaSecondary")}
          </a>
        </div>
        <p className="text-sm text-gray-400">{t("ctaNote")}</p>

        {/* Stats */}
        <div className="mt-16 inline-flex flex-col sm:flex-row items-center gap-0 sm:gap-0 bg-gray-50 rounded-2xl border border-gray-100 overflow-hidden divide-y sm:divide-y-0 sm:divide-x divide-gray-200">
          {[
            { num: t("statTrusted"), label: t("statTrustedLabel") },
            { num: t("statSpend"), label: t("statSpendLabel") },
            { num: t("statSaved"), label: t("statSavedLabel") },
          ].map((stat) => (
            <div key={stat.num} className="flex flex-col items-center px-8 py-5">
              <span className="text-2xl font-extrabold text-dark">{stat.num}</span>
              <span className="text-xs text-gray-500 mt-0.5 font-medium">{stat.label}</span>
            </div>
          ))}
        </div>

        {/* Hero visual — abstract dashboard mockup */}
        <div className="mt-16 relative max-w-4xl mx-auto" aria-hidden="true">
          <div className="relative bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">
            {/* Browser chrome */}
            <div className="bg-gray-50 border-b border-gray-200 px-4 py-3 flex items-center gap-2">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-400" />
                <div className="w-3 h-3 rounded-full bg-yellow-400" />
                <div className="w-3 h-3 rounded-full bg-green-400" />
              </div>
              <div className="flex-1 mx-4 bg-white border border-gray-200 rounded-md px-3 py-1 text-xs text-gray-400 text-left">
                app.vigmis.com/dashboard
              </div>
            </div>
            {/* Dashboard content */}
            <div className="p-6 bg-gray-50/50">
              {/* Top metrics row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                {[
                  { label: "Total Spend", value: "$2,840", change: "+12%", color: "text-green-500" },
                  { label: "Conversions", value: "184", change: "+28%", color: "text-green-500" },
                  { label: "Cost/Conv.", value: "$15.43", change: "-8%", color: "text-green-500" },
                  { label: "ROAS", value: "4.2x", change: "+0.6x", color: "text-green-500" },
                ].map((metric) => (
                  <div key={metric.label} className="bg-white rounded-xl p-4 border border-gray-100">
                    <p className="text-xs text-gray-500 mb-1">{metric.label}</p>
                    <p className="text-lg font-bold text-dark">{metric.value}</p>
                    <p className={`text-xs font-semibold ${metric.color}`}>{metric.change} vs last week</p>
                  </div>
                ))}
              </div>
              {/* Chart placeholder */}
              <div className="bg-white rounded-xl border border-gray-100 p-4">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-semibold text-dark">Campaign Performance</p>
                  <div className="flex gap-2">
                    <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">Google</span>
                    <span className="text-xs bg-amber/10 text-amber-600 px-2 py-0.5 rounded-full font-medium">Meta</span>
                  </div>
                </div>
                {/* SVG chart */}
                <svg viewBox="0 0 600 120" className="w-full" aria-label="Performance chart">
                  <defs>
                    <linearGradient id="chartGrad1" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366F1" stopOpacity="0.2"/>
                      <stop offset="100%" stopColor="#6366F1" stopOpacity="0"/>
                    </linearGradient>
                    <linearGradient id="chartGrad2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.2"/>
                      <stop offset="100%" stopColor="#F59E0B" stopOpacity="0"/>
                    </linearGradient>
                  </defs>
                  {/* Google line */}
                  <path d="M0,90 C60,80 120,70 180,60 C240,50 300,40 360,35 C420,30 480,25 600,15" fill="none" stroke="#6366F1" strokeWidth="2.5" strokeLinecap="round"/>
                  <path d="M0,90 C60,80 120,70 180,60 C240,50 300,40 360,35 C420,30 480,25 600,15 L600,120 L0,120 Z" fill="url(#chartGrad1)"/>
                  {/* Meta line */}
                  <path d="M0,100 C60,95 120,85 180,80 C240,75 300,65 360,55 C420,45 480,40 600,30" fill="none" stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round"/>
                  <path d="M0,100 C60,95 120,85 180,80 C240,75 300,65 360,55 C420,45 480,40 600,30 L600,120 L0,120 Z" fill="url(#chartGrad2)"/>
                  {/* X axis labels */}
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => (
                    <text key={d} x={i * 85 + 30} y="118" fontSize="9" fill="#9CA3AF" textAnchor="middle">{d}</text>
                  ))}
                </svg>
              </div>
            </div>
          </div>
          {/* Floating badge */}
          <div className="absolute -top-4 -right-4 sm:top-8 sm:-right-8 bg-white rounded-xl shadow-lg border border-gray-100 px-4 py-3 flex items-center gap-3 animate-fade-in">
            <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M2 7l3.5 3.5L12 3" stroke="#22C55E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <p className="text-xs font-bold text-dark">AI Optimized</p>
              <p className="text-xs text-gray-500">Just now</p>
            </div>
          </div>
          <div className="absolute -bottom-4 -left-4 sm:bottom-8 sm:-left-8 bg-white rounded-xl shadow-lg border border-gray-100 px-4 py-3 flex items-center gap-3 animate-fade-in">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M7 1v12M1 7l3-3m6 0l3 3" stroke="#6366F1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <p className="text-xs font-bold text-dark">+28% conversions</p>
              <p className="text-xs text-gray-500">This week</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

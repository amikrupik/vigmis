import { useTranslations } from "next-intl";

export default function LearningCurve() {
  const t = useTranslations("learningCurve");

  return (
    <section className="py-24 bg-dark text-white overflow-hidden relative">
      {/* Subtle grid background */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
        aria-hidden="true"
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 text-white/80 text-sm font-semibold px-4 py-2 rounded-full mb-4">
            {t("badge")}
          </div>
          <h2 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-6">
            {t("headline")}
          </h2>
          <p className="text-lg text-white/60 max-w-2xl mx-auto">{t("subheadline")}</p>
        </div>

        {/* Learning curve illustration */}
        <div className="max-w-3xl mx-auto mb-16">
          <div className="relative h-40">
            <svg viewBox="0 0 600 160" fill="none" className="w-full h-full" aria-hidden="true">
              {/* Flat competitor line */}
              <path
                d="M20 120 Q200 118 580 115"
                stroke="white"
                strokeWidth="1.5"
                strokeDasharray="6 4"
                opacity="0.2"
              />
              <text x="420" y="108" fill="white" fillOpacity="0.3" fontSize="11" fontFamily="sans-serif">
                Other tools
              </text>
              {/* Vigmis learning curve */}
              <path
                d="M20 130 Q80 128 140 120 Q220 108 300 88 Q380 62 460 38 Q520 20 580 12"
                stroke="url(#lc-grad)"
                strokeWidth="3"
                strokeLinecap="round"
              />
              {/* Milestone dots */}
              <circle cx="140" cy="120" r="5" fill="#6366f1"/>
              <circle cx="300" cy="88" r="5" fill="#6366f1"/>
              <circle cx="460" cy="38" r="5" fill="#6366f1"/>
              {/* Labels */}
              <text x="130" y="142" fill="white" fillOpacity="0.5" fontSize="10" fontFamily="sans-serif" textAnchor="middle">Week 2</text>
              <text x="300" y="110" fill="white" fillOpacity="0.5" fontSize="10" fontFamily="sans-serif" textAnchor="middle">Month 1</text>
              <text x="460" y="60" fill="white" fillOpacity="0.5" fontSize="10" fontFamily="sans-serif" textAnchor="middle">Month 3</text>
              <defs>
                <linearGradient id="lc-grad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#818cf8"/>
                  <stop offset="100%" stopColor="#38bdf8"/>
                </linearGradient>
              </defs>
            </svg>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 mb-16">
          {(["stat1", "stat2", "stat3"] as const).map((key) => (
            <div key={key} className="text-center">
              <p className="text-white/50 text-sm mb-1">{t(`${key}Desc`)}</p>
              <p className="text-xl font-bold text-white/90">{t(key)}</p>
            </div>
          ))}
        </div>

        {/* How the loop works */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-16">
          {[
            { step: "1", title: "Decision made", desc: "Vigmis suggests a budget shift or creative swap. You approve." },
            { step: "2", title: "Action taken", desc: "The change is applied to your live campaigns immediately." },
            { step: "3", title: "Outcome measured", desc: "10 days later, Vigmis checks whether performance actually improved." },
            { step: "4", title: "Pattern learned", desc: "Successful decision types get more weight. Failed ones get flagged." },
          ].map(({ step, title, desc }) => (
            <div key={step} className="bg-white/5 border border-white/10 rounded-2xl p-5">
              <div className="w-8 h-8 rounded-full bg-primary/30 text-primary font-bold text-sm flex items-center justify-center mb-3">
                {step}
              </div>
              <h3 className="font-bold text-white mb-1">{title}</h3>
              <p className="text-white/50 text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>

        <div className="text-center">
          <a
            href="/signup"
            className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-white font-semibold px-8 py-4 rounded-full transition-colors text-base"
          >
            {t("cta")}
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </a>
        </div>
      </div>
    </section>
  );
}

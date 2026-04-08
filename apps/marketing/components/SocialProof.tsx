import { useTranslations } from "next-intl";

// Placeholder brand logos as SVG text marks
const brandLogos = [
  {
    name: "PizzaLocal",
    svg: (
      <div key="pizza" className="flex items-center gap-2 text-gray-400">
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
          <circle cx="14" cy="14" r="11" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M14 3v22M3 14h22" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2"/>
          <circle cx="10" cy="11" r="1.5" fill="currentColor"/>
          <circle cx="16" cy="15" r="1.5" fill="currentColor"/>
          <circle cx="12" cy="17" r="1.5" fill="currentColor"/>
        </svg>
        <span className="text-base font-bold tracking-tight">PizzaLocal</span>
      </div>
    ),
  },
  {
    name: "FitStudio",
    svg: (
      <div key="fit" className="flex items-center gap-2 text-gray-400">
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
          <path d="M4 14h3l2-5 3 10 3-14 3 9h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span className="text-base font-bold tracking-tight">FitStudio</span>
      </div>
    ),
  },
  {
    name: "GreenCart",
    svg: (
      <div key="green" className="flex items-center gap-2 text-gray-400">
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
          <path d="M4 6h2l3 12h12l2-8H8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="12" cy="22" r="1.5" fill="currentColor"/>
          <circle cx="19" cy="22" r="1.5" fill="currentColor"/>
        </svg>
        <span className="text-base font-bold tracking-tight">GreenCart</span>
      </div>
    ),
  },
  {
    name: "BluePlumb",
    svg: (
      <div key="blue" className="flex items-center gap-2 text-gray-400">
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
          <path d="M8 22c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          <path d="M14 16V6M14 6C14 4 16 4 16 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          <path d="M10 10h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
        <span className="text-base font-bold tracking-tight">BluePlumb</span>
      </div>
    ),
  },
  {
    name: "StyleHaus",
    svg: (
      <div key="style" className="flex items-center gap-2 text-gray-400">
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
          <path d="M6 22V8l8-4 8 4v14H6z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
          <rect x="11" y="14" width="6" height="8" stroke="currentColor" strokeWidth="1.5"/>
        </svg>
        <span className="text-base font-bold tracking-tight">StyleHaus</span>
      </div>
    ),
  },
  {
    name: "DentalCare+",
    svg: (
      <div key="dental" className="flex items-center gap-2 text-gray-400">
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
          <path d="M10 6C8 6 6 8 6 10c0 6 4 12 8 12s8-6 8-12c0-2-2-4-4-4-1.5 0-2.5 1-4 1s-2.5-1-4-1z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
          <path d="M14 10v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <path d="M11 13h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
        <span className="text-base font-bold tracking-tight">DentalCare+</span>
      </div>
    ),
  },
];

// Star rating component
const Stars = ({ rating = 5 }: { rating?: number }) => (
  <div className="flex gap-0.5" aria-label={`${rating} out of 5 stars`}>
    {Array.from({ length: 5 }).map((_, i) => (
      <svg
        key={i}
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill={i < rating ? "#F59E0B" : "#E5E7EB"}
        aria-hidden="true"
      >
        <path d="M7 1l1.5 3.5 3.5.5-2.5 2.5.5 3.5L7 9.5 4 11l.5-3.5L2 5l3.5-.5z"/>
      </svg>
    ))}
  </div>
);

const testimonials = [
  {
    quote: "Vigmis cut our cost per lead in half within the first month. I haven't touched the campaigns since — the AI just handles everything.",
    author: "Sarah M.",
    role: "Owner, FitStudio Austin",
    rating: 5,
    avatar: "SM",
  },
  {
    quote: "I was spending 10 hours a week managing ads. Now I spend zero. Vigmis actually gets better results than I did manually.",
    author: "James T.",
    role: "Founder, GreenCart Market",
    rating: 5,
    avatar: "JT",
  },
  {
    quote: "Setup was insanely easy. I answered a few questions about my plumbing business and within 24 hours I was getting more calls.",
    author: "Mike D.",
    role: "Owner, BluePlumb Services",
    rating: 5,
    avatar: "MD",
  },
];

export default function SocialProof() {
  const t = useTranslations("socialProof");

  return (
    <section className="py-16 bg-gray-50 border-y border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Trust bar */}
        <div className="text-center mb-10">
          <p className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-8">
            {t("headline")}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-8 lg:gap-12">
            {brandLogos.map((logo) => (
              <div
                key={logo.name}
                className="opacity-50 hover:opacity-80 transition-opacity grayscale hover:grayscale-0"
              >
                {logo.svg}
              </div>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div className="my-14 h-px bg-gray-200" aria-hidden="true" />

        {/* Testimonials */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {testimonials.map((testimonial) => (
            <div
              key={testimonial.author}
              className="bg-white rounded-2xl border border-gray-100 p-6 hover:shadow-md hover:border-gray-200 transition-all"
            >
              <Stars rating={testimonial.rating} />
              <blockquote className="mt-4 text-gray-700 text-sm leading-relaxed">
                &ldquo;{testimonial.quote}&rdquo;
              </blockquote>
              <div className="mt-5 flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center flex-shrink-0"
                  aria-hidden="true"
                >
                  {testimonial.avatar}
                </div>
                <div>
                  <p className="text-sm font-semibold text-dark">{testimonial.author}</p>
                  <p className="text-xs text-gray-400">{testimonial.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

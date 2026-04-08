"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

const faqKeys = ["1", "2", "3", "4", "5", "6"] as const;

export default function FAQ() {
  const t = useTranslations("faq");
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggle = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section id="faq" className="py-24 bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 bg-primary/8 border border-primary/20 text-primary text-sm font-semibold px-4 py-2 rounded-full mb-4">
            {t("badge")}
          </div>
          <h2 className="text-4xl sm:text-5xl font-extrabold text-dark tracking-tight mb-4">
            {t("headline")}
          </h2>
        </div>

        {/* Accordion */}
        <div className="space-y-3">
          {faqKeys.map((key, index) => {
            const isOpen = openIndex === index;
            const question = t(`q${key}` as "q1");
            const answer = t(`a${key}` as "a1");

            return (
              <div
                key={key}
                className={`bg-white rounded-2xl border-2 transition-all duration-200 overflow-hidden ${
                  isOpen ? "border-primary/30 shadow-lg shadow-primary/5" : "border-gray-100 hover:border-gray-200"
                }`}
              >
                <button
                  className="w-full text-left px-6 py-5 flex items-center justify-between gap-4"
                  onClick={() => toggle(index)}
                  aria-expanded={isOpen}
                  aria-controls={`faq-answer-${index}`}
                  id={`faq-question-${index}`}
                >
                  <span className="text-base font-semibold text-dark leading-snug">
                    {question}
                  </span>
                  <span
                    className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                      isOpen ? "bg-primary text-white rotate-180" : "bg-gray-100 text-gray-500"
                    }`}
                    aria-hidden="true"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </span>
                </button>

                <div
                  id={`faq-answer-${index}`}
                  role="region"
                  aria-labelledby={`faq-question-${index}`}
                  className={`transition-all duration-300 ease-in-out ${
                    isOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
                  } overflow-hidden`}
                >
                  <div className="px-6 pb-5">
                    <div className="h-px bg-gray-100 mb-4" />
                    <p className="text-gray-600 text-sm leading-relaxed">{answer}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom help */}
        <div className="mt-10 text-center">
          <p className="text-gray-500 text-sm">
            Still have questions?{" "}
            <a href="mailto:hello@vigmis.com" className="text-primary font-semibold hover:underline">
              Email us
            </a>{" "}
            — we reply within 24 hours.
          </p>
        </div>
      </div>
    </section>
  );
}

import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Vigmis Terms of Service — the rules and conditions for using our platform.",
};

function Section({ title, body }: { title: string; body: string }) {
  const parts = body.split("\n");

  return (
    <div className="mb-10">
      <h2 className="text-xl font-bold text-dark mb-4">{title}</h2>
      <div className="space-y-3 text-gray-600 text-base leading-relaxed">
        {parts.map((part, i) => {
          if (part.startsWith("•")) {
            return (
              <div key={i} className="flex items-start gap-3 ml-4">
                <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2.5 flex-shrink-0" aria-hidden="true"/>
                <p>{part.replace("• ", "")}</p>
              </div>
            );
          }
          if (part.trim() === "") return null;
          return <p key={i}>{part}</p>;
        })}
      </div>
    </div>
  );
}

export default function TermsPage() {
  const t = useTranslations("terms");

  const sections = [
    { title: t("section1Title"), body: t("section1Body") },
    { title: t("section2Title"), body: t("section2Body") },
    { title: t("section3Title"), body: t("section3Body") },
    { title: t("section4Title"), body: t("section4Body") },
    { title: t("section5Title"), body: t("section5Body") },
    { title: t("section6Title"), body: t("section6Body") },
    { title: t("section7Title"), body: t("section7Body") },
    { title: t("section8Title"), body: t("section8Body") },
    { title: t("section9Title"), body: t("section9Body") },
    { title: t("section10Title"), body: t("section10Body") },
    { title: t("section11Title"), body: t("section11Body") },
    { title: t("section12Title"), body: t("section12Body") },
    { title: t("section13Title"), body: t("section13Body") },
  ];

  return (
    <>
      <Header />
      <main>
        {/* Hero */}
        <div className="bg-gray-50 border-b border-gray-200 pt-28 pb-12">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
              <Link href="/" className="hover:text-primary transition-colors">Home</Link>
              <span aria-hidden="true">/</span>
              <span>{t("title")}</span>
            </div>
            <h1 className="text-4xl sm:text-5xl font-extrabold text-dark tracking-tight mb-3">
              {t("title")}
            </h1>
            <p className="text-gray-500 text-sm">{t("lastUpdated")}</p>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          {/* Intro */}
          <div className="mb-10 p-6 bg-amber/5 border border-amber/20 rounded-2xl">
            <p className="text-gray-700 leading-relaxed">{t("intro")}</p>
          </div>

          {/* Sections */}
          {sections.map((section) => (
            <Section key={section.title} title={section.title} body={section.body} />
          ))}
        </div>
      </main>
      <Footer />
    </>
  );
}

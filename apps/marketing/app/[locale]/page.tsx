import type { Metadata } from "next";
import Header from "@/components/Header";
import Hero from "@/components/Hero";
import HowItWorks from "@/components/HowItWorks";
import Features from "@/components/Features";
import Pricing from "@/components/Pricing";
import FAQ from "@/components/FAQ";
import CTABanner from "@/components/CTABanner";
import Footer from "@/components/Footer";
import SocialProof from "@/components/SocialProof";
import LearningCurve from "@/components/LearningCurve";

export const metadata: Metadata = {
  title: "Vigmis — Your Ads. On Autopilot.",
};

export default function HomePage() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <SocialProof />
        <HowItWorks />
        <Features />
        <LearningCurve />
        <Pricing />
        <FAQ />
        <CTABanner />
      </main>
      <Footer />
    </>
  );
}

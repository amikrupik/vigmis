import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/routing";
import "../globals.css";

export const metadata: Metadata = {
  title: {
    default: "Vigmis — AI-Powered Ad Automation for Small Businesses",
    template: "%s | Vigmis",
  },
  description:
    "Vigmis uses AI to automatically run and optimize your Google Ads and Meta Ads. No marketing expertise needed. Start for free.",
  keywords: [
    "Google Ads automation",
    "Meta Ads automation",
    "AI advertising",
    "small business marketing",
    "ad management software",
  ],
  authors: [{ name: "Vigmis" }],
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://vigmis.com",
    siteName: "Vigmis",
    title: "Vigmis — AI-Powered Ad Automation for Small Businesses",
    description:
      "Your ads, on autopilot. Vigmis uses AI to run and optimize Google & Meta Ads so you can focus on your business.",
    images: [
      {
        url: "https://vigmis.com/og-image.png",
        width: 1200,
        height: 630,
        alt: "Vigmis — AI Ad Automation",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Vigmis — AI-Powered Ad Automation",
    description: "Your ads, on autopilot. AI-powered Google & Meta Ads for small businesses.",
    site: "@vigmis",
  },
  robots: {
    index: true,
    follow: true,
  },
  metadataBase: new URL("https://vigmis.com"),
};

interface Props {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;

  // Validate that the incoming locale is supported
  if (!routing.locales.includes(locale as "en" | "he")) {
    notFound();
  }

  const messages = await getMessages();

  return (
    <html lang={locale} dir={locale === "he" ? "rtl" : "ltr"}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
        <link rel="icon" href="/favicon.ico" sizes="any" />
      </head>
      <body className="min-h-screen bg-white antialiased">
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

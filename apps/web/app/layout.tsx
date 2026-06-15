import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import "./globals.css";
import { ClerkProviderWrapper } from "./clerk-provider";
import CookieBanner from "./components/CookieBanner";
import ChatDrawer from "./components/ChatDrawer";
import PostHogProvider from "./components/PostHogProvider";
import { normalizeLocale, RTL_LOCALES, getMessages } from "../lib/i18n";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Vigmis — AI Ad Campaign Manager",
  description: "Vigmis manages your Google, Meta, and TikTok ad campaigns automatically with AI.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { userId } = await auth();
  const cookieStore = await cookies();
  const locale = normalizeLocale(cookieStore.get('vigmis_lang')?.value);
  const dir = RTL_LOCALES.has(locale) ? 'rtl' : 'ltr';
  const messages = await getMessages(locale);

  return (
    <html lang={locale} dir={dir} className={`${inter.variable} h-full`}>
      <body className="min-h-full flex flex-col antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ClerkProviderWrapper>
            <PostHogProvider>
              {children}
              {userId ? <ChatDrawer /> : null}
            </PostHogProvider>
          </ClerkProviderWrapper>
          <CookieBanner />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

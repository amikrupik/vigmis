import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { auth } from "@clerk/nextjs/server";
import "./globals.css";
import { ClerkProviderWrapper } from "./clerk-provider";
import CookieBanner from "./components/CookieBanner";
import ChatDrawer from "./components/ChatDrawer";

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

  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="min-h-full flex flex-col antialiased">
        <ClerkProviderWrapper>
          {children}
          {userId ? <ChatDrawer /> : null}
        </ClerkProviderWrapper>
        <CookieBanner />
      </body>
    </html>
  );
}

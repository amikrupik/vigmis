"use client";

import { SignIn } from "@clerk/nextjs";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function DeletedBanner() {
  const params = useSearchParams();
  if (params.get('deleted') !== '1') return null;
  return (
    <div className="max-w-sm w-full bg-slate-100 border border-slate-200 rounded-2xl px-5 py-4 text-center">
      <p className="text-sm font-semibold text-slate-700">Your account has been deleted</p>
      <p className="text-xs text-slate-500 mt-1">All campaigns have been paused and your data has been removed. Vigmis has been disconnected from your ad platforms.</p>
      <p className="text-xs text-slate-400 mt-2">If you&apos;d like to come back, you can sign up again at any time.</p>
    </div>
  );
}

export default function SignInPage() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
        <Link href="/">
          <Image src="/logo.png" alt="Vigmis" width={120} height={44} priority />
        </Link>
        <Suspense>
          <DeletedBanner />
        </Suspense>
        <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" />
      </div>
      <footer className="border-t border-slate-200 px-6 py-5">
        <div className="max-w-2xl mx-auto flex flex-wrap items-center justify-center gap-4 text-xs text-slate-400">
          <Link href="/about" className="hover:text-slate-600">About</Link>
          <Link href="/contact" className="hover:text-slate-600">Contact</Link>
          <Link href="/privacy" className="hover:text-slate-600">Privacy</Link>
          <Link href="/terms" className="hover:text-slate-600">Terms</Link>
          <Link href="/refund" className="hover:text-slate-600">Refund</Link>
          <Link href="/cookies" className="hover:text-slate-600">Cookies</Link>
          <Link href="/acceptable-use" className="hover:text-slate-600">Acceptable Use</Link>
          <Link href="/faq" className="hover:text-slate-600">FAQ</Link>
        </div>
        <p className="text-center text-xs text-slate-400 mt-3">© {new Date().getFullYear()} Taurus Management and Investments Ltd.</p>
      </footer>
    </div>
  );
}

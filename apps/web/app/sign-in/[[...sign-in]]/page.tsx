"use client";

import { SignIn } from "@clerk/nextjs";
import Image from "next/image";
import Link from "next/link";

export default function SignInPage() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
        <Link href="/">
          <Image src="/logo.png" alt="Vigmis" width={120} height={44} priority />
        </Link>
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

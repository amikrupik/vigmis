"use client";

import { SignUp } from "@clerk/nextjs";
import Image from "next/image";

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6 gap-6">
      <Image src="/logo.png" alt="Vigmis" width={120} height={44} priority />
      <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" />
    </div>
  );
}

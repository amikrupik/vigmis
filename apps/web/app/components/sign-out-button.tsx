"use client";

import { SignOutButton } from "@clerk/nextjs";

export function ClerkSignOutButton() {
  return (
    <SignOutButton>
      <button className="rounded-full bg-slate-950 px-4 py-2 text-white hover:bg-slate-800">
        Sign out
      </button>
    </SignOutButton>
  );
}

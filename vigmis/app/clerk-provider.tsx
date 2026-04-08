"use client";

import { ClerkProvider } from "@clerk/nextjs";
import type { ReactNode } from "react";

type ClerkProviderProps = {
  children: ReactNode;
};

export function ClerkProviderWrapper({ children }: ClerkProviderProps) {
  return <ClerkProvider>{children}</ClerkProvider>;
}

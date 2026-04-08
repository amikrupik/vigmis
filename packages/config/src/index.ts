export const APP_ENV = (process.env.APP_ENV || "local") as "local" | "staging" | "production";

export const PLATFORMS = {
  googleAds: process.env.GOOGLE_ADS_ENABLED === "true",
  metaAds:   process.env.META_ADS_ENABLED === "true",
} as const;

export const OPTIMIZATION = {
  intervalMinutes: {
    base: 60,
    pro:  30,
  },
  maxDailyBudgetChangePercent: 20,
  minDataPointsForChange: 50,
} as const;

export const PRICING = {
  base: { perClickUsd: 0.15 },
  pro:  { monthlyUsd: 15, perClickUsd: 0.12 },
} as const;

import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

// Baseline security headers applied to every response.
// NOTE: a Content-Security-Policy is intentionally omitted here — it needs to be
// tuned against Clerk + any inline/3rd-party scripts before enabling, otherwise it
// breaks auth. Tracked as a follow-up.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

const nextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default withNextIntl(nextConfig as any);

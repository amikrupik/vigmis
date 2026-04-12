import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/about(.*)",
  "/contact(.*)",
  "/privacy(.*)",
  "/terms(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks(.*)",
  "/tiktok(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  // Explicitly exclude: _next, tiktok*.txt files, and any static file with extension
  matcher: [
    "/((?!_next|tiktok.*\\.txt|favicon\\.ico|robots\\.txt|sitemap\\.xml|[^/]+\\.[a-zA-Z0-9]+$).*)",
  ],
};

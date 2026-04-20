import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isPublic = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/terms(.*)',
  '/privacy(.*)',
  '/refund(.*)',
  '/cookies(.*)',
  '/acceptable-use(.*)',
  '/about(.*)',
  '/contact(.*)',
  '/faq(.*)',
  '/unsubscribe(.*)',
  '/api/cron(.*)',
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublic(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.png|.*\\.jpg|.*\\.svg|.*\\.ico|.*\\.txt).*)',
  ],
};

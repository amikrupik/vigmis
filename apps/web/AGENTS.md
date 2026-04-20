<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

## Critical rules for this project

### Middleware → proxy.ts (NOT middleware.ts)
In Next.js 16, the middleware file is `proxy.ts`, not `middleware.ts`.
**NEVER create `middleware.ts`** — having both files causes a silent build failure on Vercel.
All auth/routing logic goes in `apps/web/proxy.ts` only.

### useSearchParams requires Suspense
Any component using `useSearchParams()` must be wrapped in a `<Suspense>` boundary in its page file, otherwise static build fails.

### Run the build before pushing
After any change to routing, middleware, or new pages: `npx next build` from `apps/web/` to catch build errors before they silently break Vercel.
<!-- END:nextjs-agent-rules -->

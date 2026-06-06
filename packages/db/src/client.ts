import { createClient } from "@supabase/supabase-js";

// ⚠️ This module instantiates a privileged Supabase client and is SERVER-ONLY.
// The web app imports only *types* from @vigmis/db (`import type { … }`), so this
// runtime code never reaches the browser bundle. The API (Node) is the only runtime
// that executes it, and it must use the service-role key — every route enforces
// tenant isolation in application code via `.eq('tenant_id', request.tenantId)`.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;

const isBrowser = typeof window !== "undefined";

// Server prefers the service-role key (the API's intended identity); the anon key is
// only a fallback. In a browser context we would NEVER use service-role.
const supabaseKey = isBrowser
  ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  : process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing Supabase environment variables");
}

// Hard guard: never let the service-role key be used from a browser, even if it
// somehow ended up in the client environment.
if (isBrowser && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Refusing to use the Supabase service-role key in a browser context");
}

export const db = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

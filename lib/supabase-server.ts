import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

type CookieSet = { name: string; value: string; options: CookieOptions };

// Server-side Supabase client for use in Server Components, Route Handlers,
// and Server Actions. Uses the Next.js cookies() API so the session travels
// with requests. In middleware, use the NextRequest-based client inlined
// there instead — this helper relies on next/headers which only works in
// the App Router server contexts.

export async function createServerSupabase(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Components can't mutate cookies — swallow silently.
            // Mutations only happen during middleware / Route Handlers.
          }
        },
      },
    }
  );
}

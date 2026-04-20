import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieSet = { name: string; value: string; options: CookieOptions };

// Route protection matrix (mirrors SECURITY.md)
const ROLE_GATES: { prefix: string; allowed: string[] }[] = [
  { prefix: "/analyst/", allowed: ["analyst", "sales_agent", "manager"] },
  { prefix: "/analyst",  allowed: ["analyst", "sales_agent", "manager"] },
  { prefix: "/drafts",   allowed: ["analyst", "manager"] },
  { prefix: "/sales",    allowed: ["sales_agent", "manager"] },
  { prefix: "/admin",       allowed: ["manager"] },
  { prefix: "/enrollments", allowed: ["analyst", "manager"] },
  { prefix: "/sessions",    allowed: ["analyst", "manager"] },
  { prefix: "/hr",          allowed: ["hr", "manager"] },
  { prefix: "/teachers",    allowed: ["analyst", "manager", "hr"] },
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Initial response — cookies may be written to it by supabase client below
  let response = NextResponse.next({ request: req });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet: CookieSet[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set({ name, value, ...options });
          });
        },
      },
    }
  );

  // getUser() (not getSession) validates with Supabase Auth and refreshes cookies
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Unauthenticated + not on /login → redirect to /login
  if (!user && !pathname.startsWith("/login")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Authenticated + on /login → bounce to dashboard
  if (user && pathname === "/login") {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Role-based gating
  if (user) {
    const gate = ROLE_GATES.find((g) => pathname.startsWith(g.prefix));
    if (gate) {
      // Primary: read role from JWT custom claim (set by custom_access_token_hook
      // migration 20260415000008_add_role_to_jwt.sql — requires manual hook
      // registration in Supabase dashboard after the migration is applied).
      // Fallback: DB lookup for sessions that pre-date the hook registration.
      let role: string | undefined =
        (user.app_metadata as Record<string, unknown> | null)?.app_role as string | undefined;

      if (!role) {
        const { data: profile } = await supabase
          .from("users")
          .select("role")
          .eq("id", user.id)
          .single();
        role = (profile as { role: string } | null)?.role;
      }

      if (!role || !gate.allowed.includes(role)) {
        const url = req.nextUrl.clone();
        url.pathname = "/";
        url.searchParams.set("denied", gate.prefix.slice(1));
        return NextResponse.redirect(url);
      }
    }
  }

  return response;
}

// Skip middleware for static assets and favicon
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

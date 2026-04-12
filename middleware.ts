import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieSet = { name: string; value: string; options: CookieOptions };

// Route protection matrix (mirrors SECURITY.md)
const ROLE_GATES: { prefix: string; allowed: string[] }[] = [
  { prefix: "/analyst", allowed: ["analyst", "manager"] },
  { prefix: "/sales",   allowed: ["sales_agent", "manager"] },
  { prefix: "/admin",   allowed: ["manager"] },
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
      const { data: profile } = await supabase
        .from("users")
        .select("role")
        .eq("id", user.id)
        .single();
      const role = (profile as { role: string } | null)?.role;
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

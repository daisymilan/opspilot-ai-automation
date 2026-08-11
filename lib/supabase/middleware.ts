import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { decideRoute } from "@/lib/auth/route-guard";
import type { Database } from "./database.types";

/**
 * Refreshes the Supabase session cookie on every request and enforces the
 * route-protection decision from lib/auth/route-guard.ts. Called from the
 * root middleware.ts.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  // Always re-validate against Supabase Auth (do not trust the cookie's
  // decoded payload alone) — this is what actually refreshes an expiring
  // session and detects a revoked one.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const decision = decideRoute(request.nextUrl.pathname, user !== null);

  if (decision === "redirect-to-login") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirectTo", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  if (decision === "redirect-to-dashboard") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

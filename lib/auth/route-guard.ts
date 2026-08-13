// Pure routing decisions, kept free of Next.js/Supabase runtime so they can
// be unit tested directly. middleware.ts is the only caller.

const PUBLIC_ROUTES = new Set(["/", "/login", "/signup"]);
const AUTH_ROUTES = new Set(["/login", "/signup"]);

export function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.has(pathname);
}

export type RouteDecision = "allow" | "redirect-to-login" | "redirect-to-dashboard";

/**
 * API routes authenticate themselves (session cookie, webhook secret,
 * etc. — see e.g. app/api/leads/[id]/analyze) and must never be redirected
 * to the /login page: an HTML redirect response is meaningless to a
 * server-to-server caller like n8n, which expects JSON. Redirecting them
 * anyway silently swallowed every unauthenticated API call as a 200 HTML
 * login page instead of the route's own response — caught via a real
 * end-to-end n8n webhook test, not a mock.
 */
function isApiRoute(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

/**
 * Decides what middleware should do for a given request, given only the
 * path and whether the request has an authenticated session.
 */
export function decideRoute(pathname: string, isAuthenticated: boolean): RouteDecision {
  if (isApiRoute(pathname)) {
    return "allow";
  }
  if (!isAuthenticated && !isPublicRoute(pathname)) {
    return "redirect-to-login";
  }
  if (isAuthenticated && AUTH_ROUTES.has(pathname)) {
    return "redirect-to-dashboard";
  }
  return "allow";
}

const DEFAULT_POST_LOGIN_PATH = "/dashboard";

/**
 * Validates a `redirectTo` value came from our own middleware (a bare
 * internal path) before using it as a post-login destination, so a crafted
 * `?redirectTo=` value can't be used as an open redirect.
 */
export function safeRedirectPath(candidate: FormDataEntryValue | null): string {
  if (typeof candidate !== "string") return DEFAULT_POST_LOGIN_PATH;
  if (!candidate.startsWith("/")) return DEFAULT_POST_LOGIN_PATH;
  if (candidate.startsWith("//")) return DEFAULT_POST_LOGIN_PATH;
  if (candidate.includes("://")) return DEFAULT_POST_LOGIN_PATH;
  return candidate;
}

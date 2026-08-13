import { describe, expect, it } from "vitest";
import { decideRoute, isPublicRoute, safeRedirectPath } from "@/lib/auth/route-guard";

describe("isPublicRoute", () => {
  it("treats /, /login, and /signup as public", () => {
    expect(isPublicRoute("/")).toBe(true);
    expect(isPublicRoute("/login")).toBe(true);
    expect(isPublicRoute("/signup")).toBe(true);
  });

  it("treats app routes as not public", () => {
    expect(isPublicRoute("/dashboard")).toBe(false);
    expect(isPublicRoute("/leads")).toBe(false);
  });
});

describe("decideRoute", () => {
  it("redirects unauthenticated requests to protected routes to login", () => {
    expect(decideRoute("/dashboard", false)).toBe("redirect-to-login");
    expect(decideRoute("/leads/123", false)).toBe("redirect-to-login");
    expect(decideRoute("/settings", false)).toBe("redirect-to-login");
  });

  it("allows unauthenticated requests to public routes", () => {
    expect(decideRoute("/", false)).toBe("allow");
    expect(decideRoute("/login", false)).toBe("allow");
    expect(decideRoute("/signup", false)).toBe("allow");
  });

  it("allows authenticated requests to protected routes", () => {
    expect(decideRoute("/dashboard", true)).toBe("allow");
    expect(decideRoute("/leads/123", true)).toBe("allow");
  });

  it("redirects an already-authenticated user away from login/signup", () => {
    expect(decideRoute("/login", true)).toBe("redirect-to-dashboard");
    expect(decideRoute("/signup", true)).toBe("redirect-to-dashboard");
  });

  it("allows an authenticated user to view the marketing home page", () => {
    expect(decideRoute("/", true)).toBe("allow");
  });

  it("never redirects API routes to login, authenticated or not", () => {
    // Regression test: a real end-to-end n8n webhook call was previously
    // silently redirected to an HTML /login page (200, not JSON) because
    // this case wasn't excluded — n8n has no session cookie and treated
    // the redirect response as an invalid AI pipeline response.
    expect(decideRoute("/api/leads/123/analyze", false)).toBe("allow");
    expect(decideRoute("/api/leads/123/analyze", true)).toBe("allow");
    expect(decideRoute("/api", false)).toBe("allow");
  });
});

describe("safeRedirectPath", () => {
  it("accepts a bare internal path", () => {
    expect(safeRedirectPath("/leads/123")).toBe("/leads/123");
  });

  it("falls back to /dashboard for missing input", () => {
    expect(safeRedirectPath(null)).toBe("/dashboard");
  });

  it("rejects protocol-relative URLs (open redirect)", () => {
    expect(safeRedirectPath("//evil.example.com")).toBe("/dashboard");
  });

  it("rejects absolute URLs to another host", () => {
    expect(safeRedirectPath("https://evil.example.com")).toBe("/dashboard");
  });

  it("rejects values that aren't strings", () => {
    const file = new File(["x"], "x.txt");
    expect(safeRedirectPath(file)).toBe("/dashboard");
  });
});

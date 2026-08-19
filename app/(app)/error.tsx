"use client";

import { useEffect } from "react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Logged server-side by Next.js already; this is just a local dev/ops
    // breadcrumb — never rendered to the user (no stack trace, no message
    // detail that could contain secrets).
    console.error("Unhandled error in app route:", error.digest ?? error.message);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-24 text-center">
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="max-w-sm text-sm text-black/60 dark:text-white/60">
        This page hit an unexpected error. It has been logged — try again, or head back to the
        dashboard.
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-md bg-black text-white dark:bg-white dark:text-black px-4 py-2 text-sm font-medium"
        >
          Try again
        </button>
        <a
          href="/dashboard"
          className="rounded-md border border-black/10 dark:border-white/15 px-4 py-2 text-sm font-medium"
        >
          Back to dashboard
        </a>
      </div>
    </div>
  );
}

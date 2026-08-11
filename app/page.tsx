import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <span className="rounded-full border border-black/10 dark:border-white/10 px-3 py-1 text-xs text-black/50 dark:text-white/50">
        Phase 0 — Foundation
      </span>
      <h1 className="text-4xl font-semibold tracking-tight">OpsPilot</h1>
      <p className="max-w-xl text-black/60 dark:text-white/60">
        An AI-powered business operations automation platform: event-driven workflows, AI-assisted
        lead intelligence, meeting intelligence, document intelligence, and automated reporting —
        with human approval on every sensitive action.
      </p>
      <Link
        href="/dashboard"
        className="rounded-md bg-black text-white dark:bg-white dark:text-black px-5 py-2.5 text-sm font-medium"
      >
        Open dashboard
      </Link>
    </main>
  );
}

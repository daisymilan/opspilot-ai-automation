import { signOut } from "@/services/auth/actions";
import type { CurrentProfile } from "@/services/auth/getCurrentProfile";

export function AppTopbar({ profile }: { profile: CurrentProfile | null }) {
  return (
    <header className="flex items-center justify-between border-b border-black/10 dark:border-white/10 px-8 py-3">
      <span className="text-sm font-medium text-black/70 dark:text-white/70">
        {profile?.organizationName ?? "OpsPilot"}
      </span>

      {profile ? (
        <div className="flex items-center gap-4">
          <span className="text-sm text-black/60 dark:text-white/60">
            {profile.fullName} · {profile.role}
          </span>
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-md border border-black/10 dark:border-white/15 px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/10"
            >
              Sign out
            </button>
          </form>
        </div>
      ) : null}
    </header>
  );
}

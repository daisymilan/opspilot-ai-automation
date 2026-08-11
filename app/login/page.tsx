import Link from "next/link";
import { LoginForm } from "@/components/auth/LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string }>;
}) {
  const { redirectTo } = await searchParams;

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <Link href="/" className="text-lg font-semibold">
            OpsPilot
          </Link>
          <h1 className="text-xl font-semibold">Sign in</h1>
        </div>

        <LoginForm redirectTo={redirectTo} />

        <p className="text-sm text-black/60 dark:text-white/60">
          Don&apos;t have a workspace yet?{" "}
          <Link href="/signup" className="font-medium underline">
            Create one
          </Link>
        </p>
      </div>
    </main>
  );
}

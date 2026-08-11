import Link from "next/link";
import { SignupForm } from "@/components/auth/SignupForm";

export default function SignupPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <Link href="/" className="text-lg font-semibold">
            OpsPilot
          </Link>
          <h1 className="text-xl font-semibold">Create your workspace</h1>
          <p className="text-sm text-black/60 dark:text-white/60">
            Signing up creates a new organization with you as its owner.
          </p>
        </div>

        <SignupForm />

        <p className="text-sm text-black/60 dark:text-white/60">
          Already have a workspace?{" "}
          <Link href="/login" className="font-medium underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}

import type { ReactNode } from "react";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { getCurrentProfile } from "@/services/auth/getCurrentProfile";

export default async function AppShellLayout({ children }: { children: ReactNode }) {
  const profile = await getCurrentProfile();

  return (
    <div className="flex flex-1 flex-col">
      <AppTopbar profile={profile} />
      <div className="flex flex-1">
        <AppSidebar />
        <main className="flex-1 p-8">{children}</main>
      </div>
    </div>
  );
}

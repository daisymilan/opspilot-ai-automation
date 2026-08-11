import type { ReactNode } from "react";
import { AppSidebar } from "@/components/layout/AppSidebar";

export default function AppShellLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1">
      <AppSidebar />
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}

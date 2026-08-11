"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "./nav-items";

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 shrink-0 border-r border-black/10 dark:border-white/10 p-4">
      <Link href="/" className="block text-lg font-semibold mb-6">
        OpsPilot
      </Link>
      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-md px-3 py-2 text-sm transition-colors ${
                isActive
                  ? "bg-black/5 dark:bg-white/10 font-medium"
                  : "hover:bg-black/5 dark:hover:bg-white/10 text-black/70 dark:text-white/70"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

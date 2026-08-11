export interface NavItem {
  label: string;
  href: string;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Leads", href: "/leads" },
  { label: "Meetings", href: "/meetings" },
  { label: "Documents", href: "/documents" },
  { label: "Approvals", href: "/approvals" },
  { label: "Executions", href: "/executions" },
  { label: "Analytics", href: "/analytics" },
  { label: "Settings", href: "/settings" },
];

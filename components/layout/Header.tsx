"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Search, Bell, Plus, Activity, Menu, X } from "lucide-react";
import { useUI } from "@/context/UIContext";
import { useCurrentUser } from "@/context/CurrentUserContext";
import UserMenu from "@/components/layout/UserMenu";
import { cn } from "@/lib/utils";

type Role = "admin" | "manager" | "telemarketer";
const navItems: { href: string; label: string; roles?: Role[] }[] = [
  { href: "/dashboard", label: "Dashboard", roles: ["admin", "manager"] },
  { href: "/queue", label: "My Day" },
  { href: "/leads", label: "Leads" },
  { href: "/follow-ups", label: "Follow-ups" },
  { href: "/meetings", label: "Meetings" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/reports", label: "Reports" },
  { href: "/users", label: "Users", roles: ["admin"] },
  { href: "/settings", label: "Settings", roles: ["admin"] },
];

export default function Header() {
  const { setCommandPaletteOpen, setNotificationsOpen, openAddLead, refreshKey, isNotificationsOpen } = useUI();
  const { currentUser } = useCurrentUser();
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!currentUser) return;
    const load = () =>
      fetch("/api/notifications?countOnly=1", { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => j.success && setUnread(j.data.unread))
        .catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [currentUser, refreshKey, isNotificationsOpen]);

  useEffect(() => setMobileOpen(false), [pathname]);

  const items = navItems.filter((i) => !i.roles || (currentUser && i.roles.includes(currentUser.role)));

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-surface-border bg-surface/90 px-4 backdrop-blur supports-[backdrop-filter]:bg-surface/70">
        <button className="btn-ghost !p-1.5 lg:hidden" onClick={() => setMobileOpen((v) => !v)} aria-label="Menu">
          {mobileOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
        <Link href="/" className="flex items-center gap-2 pr-1">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-600">
            <Activity size={16} className="text-white" />
          </div>
          <span className="hidden font-semibold tracking-tight text-ink sm:inline">SalesPulse</span>
        </Link>

        <nav className="hidden shrink-0 items-center gap-0.5 lg:flex">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors",
                pathname.startsWith(item.href) ? "bg-surface-hover/10 text-ink" : "text-ink-muted hover:bg-surface-hover/5 hover:text-ink"
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <button onClick={() => setCommandPaletteOpen(true)} className="btn-secondary min-w-0 max-w-xs !justify-start text-ink-muted sm:flex-1" aria-label="Find a lead">
          <Search size={14} className="shrink-0" />
          <span className="hidden min-w-0 flex-1 truncate text-left sm:inline">Find a lead…</span>
          <kbd className="hidden shrink-0 rounded border border-surface-border bg-surface-inset px-1.5 py-0.5 text-[10px] sm:inline">⌘K</kbd>
        </button>

        <div className="flex-1" />

        <div className="flex shrink-0 items-center gap-2">
          <button onClick={openAddLead} className="btn-primary">
            <Plus size={15} />
            <span className="hidden sm:inline">Add Lead</span>
          </button>
          <button onClick={() => setNotificationsOpen(true)} className="btn-ghost relative" aria-label="Notifications">
            <Bell size={17} />
            {unread > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-critical-500 px-1 text-[10px] font-semibold text-white">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </button>
          <UserMenu />
        </div>
      </header>
      {mobileOpen && (
        <nav className="sticky top-14 z-20 grid grid-cols-2 gap-1 border-b border-surface-border bg-surface-panel p-2 lg:hidden">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn("rounded-lg px-3 py-2 text-sm font-medium", pathname.startsWith(item.href) ? "bg-surface-hover/10 text-ink" : "text-ink-muted")}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      )}
    </>
  );
}

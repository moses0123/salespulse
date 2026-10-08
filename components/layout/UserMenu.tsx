"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, LogOut, ShieldCheck, Users, User as UserIcon, Moon, Sun } from "lucide-react";
import { useCurrentUser } from "@/context/CurrentUserContext";
import { useTheme } from "@/context/ThemeContext";
import Avatar from "@/components/ui/Avatar";
import type { UserRole } from "@/models/User";

const roleMeta: Record<UserRole, { label: string; icon: typeof ShieldCheck }> = {
  admin: { label: "Super Admin", icon: ShieldCheck },
  manager: { label: "Manager", icon: Users },
  telemarketer: { label: "Telemarketer", icon: UserIcon },
};

/** Signed-in user's account menu — identity + sign out. */
export default function UserMenu() {
  const { currentUser, logout } = useCurrentUser();
  const { theme, toggleTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  if (!currentUser) {
    return <div className="h-8 w-32 animate-pulse rounded-lg bg-surface-hover/5" />;
  }

  const RoleIcon = roleMeta[currentUser.role].icon;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg border border-surface-border bg-surface-hover/5 px-2 py-1.5 text-sm hover:bg-surface-hover/10 transition-colors"
      >
        <Avatar name={currentUser.name} role={currentUser.role} size="xs" />
        <span className="hidden sm:inline text-ink-secondary font-medium">{currentUser.name}</span>
        <span className="hidden md:inline-flex items-center gap-1 text-[11px] text-ink-muted rounded-full bg-surface-inset px-1.5 py-0.5">
          <RoleIcon size={11} />
          {roleMeta[currentUser.role].label}
        </span>
        <ChevronDown size={14} className="text-ink-muted" />
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-56 panel py-1.5 animate-fade-in">
          <div className="px-3 py-2 border-b border-surface-border">
            <p className="truncate text-sm font-medium text-ink">{currentUser.name}</p>
            <p className="truncate text-xs text-ink-muted">{currentUser.email}</p>
          </div>
          <button
            onClick={toggleTheme}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink-secondary hover:bg-surface-hover/5"
          >
            {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
          <button
            onClick={logout}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink-secondary hover:bg-surface-hover/5"
          >
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import type { UserDTO } from "@/lib/types";
import type { UserRole } from "@/models/User";

/** Fetch the user directory (optionally filtered by role / active only) for pickers. */
export function useUsers(role?: UserRole, opts: { activeOnly?: boolean } = {}) {
  const [users, setUsers] = useState<UserDTO[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    const qs = new URLSearchParams();
    if (role) qs.set("role", role);
    if (opts.activeOnly) qs.set("active", "1");
    fetch(`/api/users?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled && json.success) setUsers(json.data);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [role, opts.activeOnly]);
  return { users, loading };
}

/** Everyone who can own leads (telemarketers + managers), active only. */
export function useAssignees() {
  const { users, loading } = useUsers(undefined, { activeOnly: true });
  return { users, loading };
}

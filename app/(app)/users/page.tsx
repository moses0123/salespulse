"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, ShieldOff, ShieldCheck, Pencil, Check, X, Trash2, Loader2, MessageCircle } from "lucide-react";
import { useUI } from "@/context/UIContext";
import { useCurrentUser } from "@/context/CurrentUserContext";
import Avatar from "@/components/ui/Avatar";
import EmptyState from "@/components/ui/EmptyState";
import { Users as UsersIcon } from "lucide-react";
import type { UserDTO } from "@/lib/types";

const roleLabel: Record<string, string> = {
  admin: "Super Admin",
  manager: "Sales Manager",
  telemarketer: "Telemarketer",
};

export default function UsersPage() {
  const { currentUser, loading: userLoading } = useCurrentUser();
  const { openAddUser, refreshKey, triggerRefresh } = useUI();
  const [users, setUsers] = useState<UserDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPhoneId, setEditingPhoneId] = useState<string | null>(null);
  const [phoneDraft, setPhoneDraft] = useState("");
  const [savingPhone, setSavingPhone] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/users", { cache: "no-store" });
    const json = await res.json();
    if (json.success) setUsers(json.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers, refreshKey]);

  const toggleActive = async (user: UserDTO) => {
    await fetch(`/api/users/${user._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !user.isActive }),
    });
    triggerRefresh();
  };

  const patchUser = async (id: string, body: Record<string, unknown>) => {
    const res = await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!json.success) setDeleteError(json.error ?? "Update failed");
    triggerRefresh();
  };

  const startEditPhone = (user: UserDTO) => {
    setEditingPhoneId(user._id);
    setPhoneDraft(user.phone ?? "");
  };

  const savePhone = async (userId: string) => {
    setSavingPhone(true);
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phoneDraft }),
      });
      const json = await res.json();
      if (json.success) {
        setEditingPhoneId(null);
        triggerRefresh();
      }
    } finally {
      setSavingPhone(false);
    }
  };

  const deleteUser = async (user: UserDTO) => {
    if (!window.confirm(`Delete ${user.name}? This can't be undone.`)) return;
    setDeletingId(user._id);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/users/${user._id}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) {
        setDeleteError(json.error ?? "Failed to delete user");
        return;
      }
      triggerRefresh();
    } catch {
      setDeleteError("Failed to delete user");
    } finally {
      setDeletingId(null);
    }
  };

  if (!userLoading && currentUser && currentUser.role !== "admin") {
    return (
      <div className="panel p-8">
        <EmptyState
          icon={ShieldOff}
          title="Super Admin access required"
          description="Only a Super Admin can view or manage the user directory."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Users</h1>
          <p className="mt-0.5 text-sm text-ink-muted">Add and manage every account — Admins, Sales Managers and Telemarketers.</p>
        </div>
        <button onClick={openAddUser} className="btn-primary">
          <Plus size={15} />
          Add User
        </button>
      </div>

      {deleteError && (
        <div className="rounded-lg border border-critical-500/30 bg-critical-500/10 px-3 py-2 text-xs text-critical-500">
          {deleteError}
        </div>
      )}

      <div className="panel overflow-hidden">
        {loading ? (
          <div className="space-y-2 p-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-surface-hover/5" />
            ))}
          </div>
        ) : users.length === 0 ? (
          <EmptyState icon={UsersIcon} title="No users yet" description="Add your first team member to get started." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-border text-left text-[11px] uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Email</th>
                <th className="px-4 py-2.5 font-medium">WhatsApp Number</th>
                <th className="px-4 py-2.5 font-medium">Role</th>
                <th className="px-4 py-2.5 font-medium">Daily target</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u._id} className="border-b border-surface-border/50 last:border-0">
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-2 text-ink">
                      <Avatar name={u.name} role={u.role} size="xs" />
                      {u.name}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-ink-muted">{u.email}</td>
                  <td className="px-4 py-2.5">
                    {editingPhoneId === u._id ? (
                      <span className="flex items-center gap-1">
                        <input
                          autoFocus
                          className="input !w-36 !py-1 sm:!text-xs"
                          placeholder="+260..."
                          value={phoneDraft}
                          onChange={(e) => setPhoneDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") savePhone(u._id);
                            if (e.key === "Escape") setEditingPhoneId(null);
                          }}
                        />
                        <button
                          className="btn-ghost !p-1"
                          onClick={() => savePhone(u._id)}
                          disabled={savingPhone}
                          title="Save"
                        >
                          {savingPhone ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Check size={12} className="text-healthy-500" />
                          )}
                        </button>
                        <button className="btn-ghost !p-1" onClick={() => setEditingPhoneId(null)} title="Cancel">
                          <X size={12} />
                        </button>
                      </span>
                    ) : (
                      <button
                        className="group flex items-center gap-1.5 text-ink-secondary hover:text-ink"
                        onClick={() => startEditPhone(u)}
                        title="Edit WhatsApp number"
                      >
                        {u.phone ? (
                          <>
                            <MessageCircle size={12} className="text-healthy-500" />
                            {u.phone}
                          </>
                        ) : (
                          <span className="text-ink-muted">Not set</span>
                        )}
                        <Pencil size={11} className="opacity-0 transition-opacity group-hover:opacity-60" />
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-ink-secondary">
                    <select
                      className="bg-transparent text-sm focus:outline-none"
                      value={u.role}
                      disabled={u._id === currentUser?._id}
                      onChange={(e) => patchUser(u._id, { role: e.target.value })}
                      aria-label={`Role for ${u.name}`}
                    >
                      {Object.entries(roleLabel).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2.5">
                    {u.role === "admin" ? (
                      <span className="text-ink-muted">—</span>
                    ) : (
                      <input
                        type="number"
                        min={0}
                        defaultValue={u.dailyCallTarget}
                        onBlur={(e) => Number(e.target.value) !== u.dailyCallTarget && patchUser(u._id, { dailyCallTarget: Number(e.target.value) || 0 })}
                        className="input !w-20 !py-1 sm:!text-xs tabular-nums"
                        aria-label={`Daily call target for ${u.name}`}
                      />
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={
                        u.isActive
                          ? "badge bg-healthy-500/15 text-healthy-500 ring-1 ring-healthy-500/30"
                          : "badge bg-surface-hover/10 text-ink-muted ring-1 ring-surface-border"
                      }
                    >
                      {u.isActive ? "Active" : "Suspended"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {currentUser && u._id !== currentUser._id && (
                      <span className="inline-flex items-center gap-1">
                        <button
                          onClick={() => toggleActive(u)}
                          className="btn-ghost !p-1.5"
                          title={u.isActive ? "Suspend account" : "Reactivate account"}
                        >
                          {u.isActive ? <ShieldOff size={14} /> : <ShieldCheck size={14} />}
                        </button>
                        <button
                          onClick={() => deleteUser(u)}
                          disabled={deletingId === u._id}
                          className="btn-ghost !p-1.5 hover:text-critical-500"
                          title="Delete account"
                        >
                          {deletingId === u._id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Trash2 size={14} />
                          )}
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

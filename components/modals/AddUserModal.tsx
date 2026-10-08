"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useUI } from "@/context/UIContext";
import { useUsers } from "@/hooks/useUsers";
import Modal from "@/components/ui/Modal";
import type { UserRole } from "@/models/User";

/** Super Admin only: provision a new account (Super Admin, Sales Manager, or Telemarketer). */
export default function AddUserModal() {
  const { isAddUserOpen, closeAddUser, triggerRefresh } = useUI();
  const { users } = useUsers("manager");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<UserRole>("telemarketer");
  const [target, setTarget] = useState("40");
  const [managerId, setManagerId] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAddUserOpen) return;
    setName("");
    setEmail("");
    setPhone("");
    setRole("telemarketer");
    setTarget("40");
    setManagerId("");
    setPassword("");
    setError(null);
  }, [isAddUserOpen]);

  const canSubmit = name.trim() && email.trim() && password.length >= 8;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          phone: phone || undefined,
          role,
          managerId: managerId || null,
          dailyCallTarget: Number(target) || 0,
          password,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error ?? "Failed to create user");
        return;
      }
      triggerRefresh();
      closeAddUser();
    } catch {
      setError("Failed to create user");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={isAddUserOpen}
      onClose={closeAddUser}
      title="Add User"
      description="Provision a new account. Share the password with them securely — they can't self-register."
      footer={
        <>
          <button className="btn-secondary" onClick={closeAddUser}>
            Cancel
          </button>
          <button className="btn-primary" disabled={!canSubmit || submitting} onClick={handleSubmit}>
            {submitting && <Loader2 size={14} className="animate-spin" />}
            Create User
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="rounded-lg border border-critical-500/30 bg-critical-500/10 px-3 py-2 text-xs text-critical-500">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Full Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label">Email</label>
            <input
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">WhatsApp Number (optional)</label>
            <input
              className="input"
              placeholder="+260..."
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <p className="mt-1 text-[11px] text-ink-muted">With country code — where WhatsApp alerts go.</p>
          </div>
          <div>
            <label className="label">Temporary Password</label>
            <input
              type="text"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Role</label>
            <select className="input" value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
              <option value="telemarketer">Telemarketer</option>
              <option value="manager">Sales Manager / Team Leader</option>
              <option value="admin">Super Admin</option>
            </select>
          </div>
          {role === "telemarketer" && (
            <div>
              <label className="label">Team leader (optional)</label>
              <select className="input" value={managerId} onChange={(e) => setManagerId(e.target.value)}>
                <option value="">Unassigned</option>
                {users.map((m) => (
                  <option key={m._id} value={m._id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        {role !== "admin" && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Daily call target</label>
              <input className="input" inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value.replace(/\D/g, ""))} />
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useUI } from "@/context/UIContext";
import { useCurrentUser } from "@/context/CurrentUserContext";
import { useUsers } from "@/hooks/useUsers";
import Modal from "@/components/ui/Modal";
import ErrorNote from "@/components/ui/ErrorNote";
import { api } from "@/lib/client";
import { suggestDateTimeLocal } from "@/lib/utils";

/** Schedule a follow-up on a lead without logging a call. */
export default function FollowUpModal() {
  const { followUpLeadId, closeFollowUp, triggerRefresh } = useUI();
  const { currentUser } = useCurrentUser();
  const isMgr = currentUser?.role !== "telemarketer";
  const { users } = useUsers(undefined, { activeOnly: true });
  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [channel, setChannel] = useState("call");
  const [assignedTo, setAssignedTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!followUpLeadId) return;
    setTitle("Follow up");
    setDueAt(suggestDateTimeLocal(24));
    setChannel("call");
    setAssignedTo("");
    setError(null);
  }, [followUpLeadId]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/leads/${followUpLeadId}/follow-ups`, {
        body: { title, dueAt: new Date(dueAt).toISOString(), channel, assignedTo: assignedTo || null },
      });
      triggerRefresh();
      closeFollowUp();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!followUpLeadId}
      onClose={closeFollowUp}
      title="Schedule follow-up"
      size="sm"
      footer={
        <>
          <button className="btn-secondary" onClick={closeFollowUp}>Cancel</button>
          <button className="btn-primary" disabled={!title.trim() || !dueAt || busy} onClick={submit}>
            {busy && <Loader2 size={14} className="animate-spin" />} Schedule
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <ErrorNote>{error}</ErrorNote>
        <div>
          <label className="label">What</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Follow up regarding VisitFlow demo" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">When</label>
            <input type="datetime-local" className="input" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </div>
          <div>
            <label className="label">How</label>
            <select className="input" value={channel} onChange={(e) => setChannel(e.target.value)}>
              <option value="call">Call</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="email">Email</option>
              <option value="visit">Visit</option>
            </select>
          </div>
        </div>
        {isMgr && (
          <div>
            <label className="label">Who (defaults to the lead's owner)</label>
            <select className="input" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
              <option value="">Lead owner</option>
              {users.map((u) => (
                <option key={u._id} value={u._id}>{u.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>
    </Modal>
  );
}

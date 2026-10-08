"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useUI } from "@/context/UIContext";
import { useCurrentUser } from "@/context/CurrentUserContext";
import { useUsers } from "@/hooks/useUsers";
import { useProducts } from "@/hooks/useCatalog";
import Modal from "@/components/ui/Modal";
import ErrorNote from "@/components/ui/ErrorNote";
import { api } from "@/lib/client";
import { suggestDateTimeLocal } from "@/lib/utils";

export default function BookMeetingModal() {
  const { meetingLeadId, closeBookMeeting, triggerRefresh } = useUI();
  const { currentUser } = useCurrentUser();
  const isMgr = currentUser?.role !== "telemarketer";
  const { users } = useUsers(undefined, { activeOnly: true });
  const products = useProducts();
  const [f, setF] = useState({ scheduledAt: "", type: "Demo", durationMins: 60, location: "", agenda: "", productId: "", ownerId: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!meetingLeadId) return;
    setF({ scheduledAt: suggestDateTimeLocal(48), type: "Demo", durationMins: 60, location: "", agenda: "", productId: "", ownerId: "" });
    setError(null);
  }, [meetingLeadId]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/leads/${meetingLeadId}/meetings`, {
        body: { ...f, scheduledAt: new Date(f.scheduledAt).toISOString(), productId: f.productId || null, ownerId: f.ownerId || null },
      });
      triggerRefresh();
      closeBookMeeting();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!meetingLeadId}
      onClose={closeBookMeeting}
      title="Book meeting"
      footer={
        <>
          <button className="btn-secondary" onClick={closeBookMeeting}>Cancel</button>
          <button className="btn-primary" disabled={!f.scheduledAt || busy} onClick={submit}>
            {busy && <Loader2 size={14} className="animate-spin" />} Book meeting
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><ErrorNote>{error}</ErrorNote></div>
        <div>
          <label className="label">Date & time</label>
          <input type="datetime-local" className="input" value={f.scheduledAt} onChange={(e) => setF({ ...f, scheduledAt: e.target.value })} />
        </div>
        <div>
          <label className="label">Type</label>
          <select className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
            {["Demo", "Discovery", "Proposal Review", "Negotiation", "Other"].map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Location / link</label>
          <input className="input" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} />
        </div>
        <div>
          <label className="label">Duration (min)</label>
          <input type="number" className="input" value={f.durationMins} onChange={(e) => setF({ ...f, durationMins: Number(e.target.value) || 60 })} />
        </div>
        <div>
          <label className="label">Product</label>
          <select className="input" value={f.productId} onChange={(e) => setF({ ...f, productId: e.target.value })}>
            <option value="">Lead's product</option>
            {products.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
          </select>
        </div>
        {isMgr && (
          <div>
            <label className="label">Owner</label>
            <select className="input" value={f.ownerId} onChange={(e) => setF({ ...f, ownerId: e.target.value })}>
              <option value="">Lead owner</option>
              {users.map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}
            </select>
          </div>
        )}
        <div className="sm:col-span-2">
          <label className="label">Agenda</label>
          <textarea className="input min-h-[60px]" value={f.agenda} onChange={(e) => setF({ ...f, agenda: e.target.value })} />
        </div>
      </div>
    </Modal>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useUI } from "@/context/UIContext";
import { useCurrentUser } from "@/context/CurrentUserContext";
import { useUsers } from "@/hooks/useUsers";
import { useProducts, useFacets } from "@/hooks/useCatalog";
import Modal from "@/components/ui/Modal";
import ErrorNote from "@/components/ui/ErrorNote";
import DuplicateList from "@/components/leads/DuplicateList";
import { api, ApiError } from "@/lib/client";
import { LEAD_SOURCES } from "@/lib/sales";
import type { DuplicateMatchDTO, LeadDTO } from "@/lib/types";

const empty = {
  name: "",
  phone: "",
  companyName: "",
  email: "",
  industry: "",
  location: "",
  website: "",
  productId: "",
  source: "Internet research",
  notes: "",
  assignedTo: "__me",
};

/** Add a single lead — with a live duplicate check as the phone/company/email is typed. */
export default function AddLeadModal() {
  const { isAddLeadOpen, closeAddLead, triggerRefresh, openLead } = useUI();
  const { currentUser } = useCurrentUser();
  const isMgr = currentUser?.role !== "telemarketer";
  const { users } = useUsers(undefined, { activeOnly: true });
  const products = useProducts();
  const facets = useFacets();
  const [f, setF] = useState(empty);
  const [dups, setDups] = useState<DuplicateMatchDTO[]>([]);
  const [canForce, setCanForce] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!isAddLeadOpen) return;
    setF(empty);
    setDups([]);
    setError(null);
  }, [isAddLeadOpen]);

  useEffect(() => {
    if (!isAddLeadOpen) return;
    clearTimeout(timer.current);
    if (f.phone.replace(/\D/g, "").length < 7 && f.companyName.trim().length < 3 && !f.email.includes("@")) {
      setDups([]);
      return;
    }
    timer.current = setTimeout(async () => {
      const qs = new URLSearchParams({ phone: f.phone, company: f.companyName, email: f.email });
      try {
        const matches = await api<DuplicateMatchDTO[]>(`/api/leads/check-duplicate?${qs}`);
        setDups(matches);
        const phoneDup = matches.some((m) => m.matchedOn.includes("phone"));
        setCanForce(!phoneDup || isMgr);
      } catch {}
    }, 400);
  }, [f.phone, f.companyName, f.email, isAddLeadOpen, isMgr]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const lead = await api<LeadDTO>("/api/leads", {
        body: {
          ...f,
          productId: f.productId || null,
          assignedTo: f.assignedTo === "__me" ? undefined : f.assignedTo || null,
          force: dups.length > 0,
        },
      });
      triggerRefresh();
      closeAddLead();
      openLead(lead._id);
    } catch (e: any) {
      if (e instanceof ApiError && e.status === 409 && e.details?.duplicates) {
        setDups(e.details.duplicates);
        setCanForce(e.details.canForce);
      }
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const ok = f.name.trim() && f.phone.replace(/\D/g, "").length >= 5 && (!dups.length || canForce);

  return (
    <Modal
      open={isAddLeadOpen}
      onClose={closeAddLead}
      size="lg"
      title="Add lead"
      description="Only the name and phone number are required. SalesPulse checks the number isn't already being worked."
      footer={
        <>
          <button className="btn-secondary" onClick={closeAddLead}>Cancel</button>
          <button className="btn-primary" disabled={!ok || busy} onClick={submit}>
            {busy && <Loader2 size={14} className="animate-spin" />}
            {dups.length ? "Add anyway" : "Add lead"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <ErrorNote>{error}</ErrorNote>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Lead name *</label>
            <input className="input" value={f.name} onChange={set("name")} autoFocus placeholder="e.g. John Banda" />
          </div>
          <div>
            <label className="label">Phone *</label>
            <input className="input" value={f.phone} onChange={set("phone")} placeholder="0977 123456 or +260…" />
          </div>
        </div>
        <DuplicateList matches={dups} />
        <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">Optional details</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Company</label>
            <input className="input" value={f.companyName} onChange={set("companyName")} />
          </div>
          <div>
            <label className="label">Email</label>
            <input type="email" className="input" value={f.email} onChange={set("email")} />
          </div>
        </div>
        {dups.length > 0 && !canForce && (
          <p className="text-xs text-ink-muted">This number is already owned by someone else — ask your manager to reassign it if it should be yours.</p>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="label">Industry</label>
            <input className="input" list="dl-add-industries" value={f.industry} onChange={set("industry")} />
          </div>
          <div>
            <label className="label">Location</label>
            <input className="input" list="dl-add-locations" value={f.location} onChange={set("location")} />
          </div>
          <div>
            <label className="label">Website</label>
            <input className="input" value={f.website} onChange={set("website")} />
          </div>
          <div>
            <label className="label">Product of interest</label>
            <select className="input" value={f.productId} onChange={set("productId")}>
              <option value="">—</option>
              {products.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Source</label>
            <select className="input" value={f.source} onChange={set("source")}>
              {LEAD_SOURCES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          {isMgr && (
            <div>
              <label className="label">Assign to</label>
              <select className="input" value={f.assignedTo} onChange={set("assignedTo")}>
                <option value="__me">Me</option>
                <option value="">Unassigned</option>
                {users.filter((u) => u._id !== currentUser?._id).map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}
              </select>
            </div>
          )}
        </div>
        <div>
          <label className="label">Notes</label>
          <textarea className="input min-h-[60px]" value={f.notes} onChange={set("notes")} />
        </div>
        <datalist id="dl-add-industries">{facets.industries.map((i) => <option key={i} value={i} />)}</datalist>
        <datalist id="dl-add-locations">{facets.locations.map((i) => <option key={i} value={i} />)}</datalist>
      </div>
    </Modal>
  );
}

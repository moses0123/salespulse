"use client";

import { Phone, MessageCircle, Eye } from "lucide-react";
import { useUI } from "@/context/UIContext";
import { useCurrentUser } from "@/context/CurrentUserContext";
import { useSalesConfig } from "@/hooks/useCatalog";
import { DEFAULT_WHATSAPP_TEMPLATE, fillWhatsAppTemplate, whatsAppLink } from "@/lib/sales";
import { cn } from "@/lib/utils";

interface Props {
  lead: { _id: string; phone: string; phoneKey: string; name: string; companyName?: string; product?: { name: string } | null };
  followUpId?: string;
  showView?: boolean;
  size?: "sm" | "md";
  disabled?: boolean;
}

/**
 * Call → WhatsApp → View, the three actions on every lead card (§7).
 * "Call" dials via tel: (phone, softphone, or desktop dialer app) and opens
 * the outcome form at the same time, so the call can't end without a result.
 * "WhatsApp" opens wa.me pre-filled from the Settings template and logs the
 * touch on the lead's timeline.
 */
export default function ContactActions({ lead, followUpId, showView = true, size = "sm", disabled }: Props) {
  const { openLogCall, openLead, triggerRefresh } = useUI();
  const { currentUser } = useCurrentUser();
  const config = useSalesConfig();

  const message = fillWhatsAppTemplate(config?.whatsappTemplate ?? DEFAULT_WHATSAPP_TEMPLATE, {
    contact: lead.name?.split(" ")[0] || "there",
    company: lead.companyName ?? "",
    agent: currentUser?.name.split(" ")[0] ?? "",
    product: lead.product?.name ?? "",
  });

  const onWhatsApp = () => {
    window.open(whatsAppLink(lead.phoneKey, message), "_blank", "noopener");
    fetch(`/api/leads/${lead._id}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "whatsapp", summary: "WhatsApp message sent", notes: message }),
    }).then(() => triggerRefresh());
  };

  const btn = size === "sm" ? "!px-2 !py-1 text-xs" : "";
  return (
    <div className="flex items-center gap-1.5">
      <a
        href={disabled ? undefined : `tel:${lead.phone.replace(/[^\d+]/g, "")}`}
        onClick={(e) => {
          e.stopPropagation();
          if (disabled) return e.preventDefault();
          openLogCall(lead._id, followUpId);
        }}
        className={cn("btn-primary", btn, disabled && "pointer-events-none opacity-50")}
        title={`Call ${lead.phone}`}
      >
        <Phone size={13} />
        Call
      </a>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onWhatsApp();
        }}
        disabled={disabled}
        className={cn("btn-secondary", btn)}
        title="Open WhatsApp with the follow-up message"
      >
        <MessageCircle size={13} className="text-healthy-600" />
        <span className="hidden sm:inline">WhatsApp</span>
      </button>
      {showView && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            openLead(lead._id);
          }}
          className={cn("btn-ghost", btn)}
          title="View lead"
        >
          <Eye size={13} />
          <span className="hidden sm:inline">View</span>
        </button>
      )}
    </div>
  );
}

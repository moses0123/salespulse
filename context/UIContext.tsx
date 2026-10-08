"use client";

import { createContext, useCallback, useContext, useState } from "react";

/** Every global modal/drawer's open state, plus a cross-component refresh signal. */
interface UIContextValue {
  leadDrawerId: string | null;
  openLead: (id: string) => void;
  closeLead: () => void;

  /** startedAt = when the Call button was pressed — prefills the call duration. */
  logCall: { leadId: string; followUpId?: string; startedAt: number } | null;
  openLogCall: (leadId: string, followUpId?: string) => void;
  closeLogCall: () => void;

  followUpLeadId: string | null;
  openFollowUp: (leadId: string) => void;
  closeFollowUp: () => void;

  meetingLeadId: string | null;
  openBookMeeting: (leadId: string) => void;
  closeBookMeeting: () => void;

  meetingOutcomeId: string | null;
  openMeetingOutcome: (meetingId: string) => void;
  closeMeetingOutcome: () => void;

  isAddLeadOpen: boolean;
  openAddLead: () => void;
  closeAddLead: () => void;

  isImportOpen: boolean;
  openImport: () => void;
  closeImport: () => void;

  assignLeadIds: string[] | null;
  openAssign: (leadIds: string[]) => void;
  closeAssign: () => void;

  isAddUserOpen: boolean;
  openAddUser: () => void;
  closeAddUser: () => void;

  isCommandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
  isNotificationsOpen: boolean;
  setNotificationsOpen: (open: boolean) => void;

  refreshKey: number;
  triggerRefresh: () => void;
}

const UIContext = createContext<UIContextValue | undefined>(undefined);

export function UIProvider({ children }: { children: React.ReactNode }) {
  const [leadDrawerId, setLeadDrawerId] = useState<string | null>(null);
  const [logCall, setLogCall] = useState<{ leadId: string; followUpId?: string; startedAt: number } | null>(null);
  const [followUpLeadId, setFollowUpLeadId] = useState<string | null>(null);
  const [meetingLeadId, setMeetingLeadId] = useState<string | null>(null);
  const [meetingOutcomeId, setMeetingOutcomeId] = useState<string | null>(null);
  const [isAddLeadOpen, setAddLeadOpen] = useState(false);
  const [isImportOpen, setImportOpen] = useState(false);
  const [assignLeadIds, setAssignLeadIds] = useState<string[] | null>(null);
  const [isAddUserOpen, setAddUserOpen] = useState(false);
  const [isCommandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [isNotificationsOpen, setNotificationsOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const value: UIContextValue = {
    leadDrawerId,
    openLead: useCallback((id: string) => setLeadDrawerId(id), []),
    closeLead: useCallback(() => setLeadDrawerId(null), []),
    logCall,
    openLogCall: useCallback((leadId: string, followUpId?: string) => setLogCall({ leadId, followUpId, startedAt: Date.now() }), []),
    closeLogCall: useCallback(() => setLogCall(null), []),
    followUpLeadId,
    openFollowUp: useCallback((id: string) => setFollowUpLeadId(id), []),
    closeFollowUp: useCallback(() => setFollowUpLeadId(null), []),
    meetingLeadId,
    openBookMeeting: useCallback((id: string) => setMeetingLeadId(id), []),
    closeBookMeeting: useCallback(() => setMeetingLeadId(null), []),
    meetingOutcomeId,
    openMeetingOutcome: useCallback((id: string) => setMeetingOutcomeId(id), []),
    closeMeetingOutcome: useCallback(() => setMeetingOutcomeId(null), []),
    isAddLeadOpen,
    openAddLead: useCallback(() => setAddLeadOpen(true), []),
    closeAddLead: useCallback(() => setAddLeadOpen(false), []),
    isImportOpen,
    openImport: useCallback(() => setImportOpen(true), []),
    closeImport: useCallback(() => setImportOpen(false), []),
    assignLeadIds,
    openAssign: useCallback((ids: string[]) => setAssignLeadIds(ids), []),
    closeAssign: useCallback(() => setAssignLeadIds(null), []),
    isAddUserOpen,
    openAddUser: useCallback(() => setAddUserOpen(true), []),
    closeAddUser: useCallback(() => setAddUserOpen(false), []),
    isCommandPaletteOpen,
    setCommandPaletteOpen,
    isNotificationsOpen,
    setNotificationsOpen,
    refreshKey,
    triggerRefresh: useCallback(() => setRefreshKey((k) => k + 1), []),
  };

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI() {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error("useUI must be used within UIProvider");
  return ctx;
}

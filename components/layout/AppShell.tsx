"use client";

import Header from "@/components/layout/Header";
import CommandPalette from "@/components/layout/CommandPalette";
import NotificationDrawer from "@/components/layout/NotificationDrawer";
import LeadDrawer from "@/components/modals/LeadDrawer";
import LogCallModal from "@/components/modals/LogCallModal";
import FollowUpModal from "@/components/modals/FollowUpModal";
import BookMeetingModal from "@/components/modals/BookMeetingModal";
import MeetingOutcomeModal from "@/components/modals/MeetingOutcomeModal";
import AddLeadModal from "@/components/modals/AddLeadModal";
import ImportLeadsModal from "@/components/modals/ImportLeadsModal";
import AssignLeadsModal from "@/components/modals/AssignLeadsModal";
import AddUserModal from "@/components/modals/AddUserModal";

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface">
      <Header />
      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">{children}</main>

      {/* Drawers sit under modals (z-40 vs z-50) so a modal opened from the lead drawer stacks on top. */}
      <LeadDrawer />
      <NotificationDrawer />
      <CommandPalette />
      <LogCallModal />
      <FollowUpModal />
      <BookMeetingModal />
      <MeetingOutcomeModal />
      <AddLeadModal />
      <ImportLeadsModal />
      <AssignLeadsModal />
      <AddUserModal />
    </div>
  );
}

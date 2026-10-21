"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
}

const sizeClasses: Record<NonNullable<ModalProps["size"]>, string> = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
};

export default function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    // Phones: a full-screen sheet with a pinned footer, so the Save button is always reachable above the keyboard.
    // Larger screens: the centred dialog.
    <div className="fixed inset-0 z-50 flex items-stretch justify-center overflow-y-auto animate-fade-in sm:items-start sm:p-4 sm:pt-[8vh]">
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "relative flex h-[100dvh] w-full flex-col overflow-hidden rounded-none border-0 bg-surface-panel p-0 sm:h-auto sm:panel",
          sizeClasses[size]
        )}
      >
        <div className="flex shrink-0 items-start justify-between border-b border-surface-border px-4 py-3.5 pt-[max(0.875rem,env(safe-area-inset-top))] sm:px-5 sm:py-4">
          <div>
            <h2 className="text-base font-semibold text-ink">{title}</h2>
            {description && (
              <p className="mt-0.5 text-sm text-ink-muted">{description}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="btn-ghost !p-1.5 -mr-1.5 -mt-1"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:max-h-[65vh] sm:flex-none sm:px-5">{children}</div>
        {footer && (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-surface-border bg-surface-inset px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5 sm:py-3.5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect } from "react";

/**
 * Registers the service worker so the app is installable as a PWA (Chrome
 * on Android/desktop shows an install prompt once a manifest + a SW with a
 * fetch handler are both present; iOS Safari picks up the manifest for
 * "Add to Home Screen" without needing this, but registering is harmless
 * there too). Rendered once from the root layout — renders nothing itself.
 */
export default function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Installability is a nice-to-have, not a hard requirement — a failed
      // registration (e.g. running over plain HTTP in dev) shouldn't block
      // or error out the rest of the app.
    });
  }, []);

  return null;
}

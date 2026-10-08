"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/context/CurrentUserContext";

/** Managers land on the dashboard; telemarketers on their daily queue. */
export default function Home() {
  const { currentUser } = useCurrentUser();
  const router = useRouter();
  useEffect(() => {
    if (!currentUser) return;
    router.replace(currentUser.role === "telemarketer" ? "/queue" : "/dashboard");
  }, [currentUser, router]);
  return <div className="h-40 animate-pulse rounded-xl bg-surface-hover/5" />;
}

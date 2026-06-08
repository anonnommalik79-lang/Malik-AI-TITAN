"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

function hasSession() {
  if (typeof window === "undefined") return false;

  const keys = [
    "malik_user",
    "malik_session",
    "malik_auth_snapshot",
    "malik_ai_session",
    "sovereign_session",
    "sovereign_v7_auth",
    "auth_session",
  ];

  for (const key of keys) {
    const raw = window.localStorage.getItem(key) || window.sessionStorage.getItem(key);
    if (!raw) continue;
    if (raw === "true") return true;

    try {
      const value = JSON.parse(raw);
      if (value?.ok || value?.authenticated || value?.isAuthenticated || value?.loggedIn || value?.email || value?.user?.email) {
        return true;
      }
    } catch {
      if (raw.includes("@") || raw.toLowerCase().includes("guest")) return true;
    }
  }

  return (
    window.localStorage.getItem("malik_guest_unlocked") === "true" ||
    window.localStorage.getItem("malik_is_authenticated") === "true" ||
    window.localStorage.getItem("sovereign_authenticated") === "true" ||
    window.localStorage.getItem("isAuthenticated") === "true"
  );
}

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace(hasSession() ? "/dashboard" : "/auth");
  }, [router]);

  return <main className="min-h-[100dvh] bg-black" />;
}

"use client";

import { useEffect } from "react";

export function AuthBodyLock() {
  useEffect(() => {
    document.documentElement.classList.add("malik-auth-active");
    document.body.classList.add("malik-auth-active");
    return () => {
      document.documentElement.classList.remove("malik-auth-active");
      document.body.classList.remove("malik-auth-active");
    };
  }, []);

  return null;
}

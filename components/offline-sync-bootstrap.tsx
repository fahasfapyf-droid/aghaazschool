"use client";

import { useEffect } from "react";
import { synchronize } from "@/lib/offline-sync";

export default function OfflineSyncBootstrap() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    const run = () => void synchronize().catch(() => {});
    run();
    window.addEventListener("online", run);
    const interval = window.setInterval(run, 60_000);
    return () => {
      window.removeEventListener("online", run);
      window.clearInterval(interval);
    };
  }, []);
  return null;
}

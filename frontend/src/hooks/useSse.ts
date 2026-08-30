import { useEffect, useState } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { demoMode } from "../api/client";

export function useSse(
  queryClient: QueryClient,
  enabled = !demoMode,
): "connected" | "reconnecting" {
  const [status, setStatus] = useState<"connected" | "reconnecting">("connected");

  useEffect(() => {
    if (!enabled || typeof EventSource === "undefined") return;
    let source: EventSource | undefined;
    let timer: number | undefined;
    let stopped = false;

    const connect = () => {
      source = new EventSource(`${import.meta.env.VITE_API_BASE ?? "/api"}/events`, { withCredentials: true });
      source.onopen = () => setStatus("connected");
      source.onmessage = () => {
        void queryClient.invalidateQueries();
      };
      source.onerror = () => {
        setStatus("reconnecting");
        source?.close();
        if (!stopped) timer = window.setTimeout(connect, 2_500);
      };
    };
    connect();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      source?.close();
    };
  }, [enabled, queryClient]);

  return status;
}

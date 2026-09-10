import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ConfigScope } from "../api/systemSettings";

export function useConfigStream(
  scopes: ConfigScope[] | ["ALL"] = ["ALL"],
): void {
  const queryClient = useQueryClient();
  const scopeKey = scopes.join(",");

  useEffect(() => {
    const stored = localStorage.getItem("cf_config_client_id");
    const clientId = stored ?? crypto.randomUUID();
    if (!stored) localStorage.setItem("cf_config_client_id", clientId);
    const source = new EventSource(
      `/api/v1/public/config/stream?clientId=${encodeURIComponent(clientId)}&scopes=${encodeURIComponent(scopeKey)}`,
    );
    source.addEventListener("config.published", (event) => {
      const data = JSON.parse((event as MessageEvent).data) as {
        scopes?: ConfigScope[];
      };
      void queryClient.invalidateQueries({ queryKey: ["public-config"] });
      for (const scope of data.scopes ?? [])
        void queryClient.invalidateQueries({ queryKey: ["config", scope] });
    });
    return () => source.close();
  }, [queryClient, scopeKey]);
}

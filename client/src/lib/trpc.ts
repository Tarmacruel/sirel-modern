import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";

import type { AppRouter } from "@sirel/server/routers/index";
import { getCsrfToken } from "./auth-session";

export const trpc = createTRPCReact<AppRouter>();

function resolveApiUrl() {
  const configuredUrl = String(import.meta.env.VITE_API_URL ?? "").trim();
  if (configuredUrl) return configuredUrl;

  if (typeof window !== "undefined") {
    return "/api/trpc";
  }

  return "http://localhost:3030/api/trpc";
}

const apiUrl = resolveApiUrl();

export const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: apiUrl,
      transformer: superjson,
      fetch(url, options) {
        return globalThis.fetch(url, {
          ...options,
          credentials: "include",
        });
      },
      headers() {
        const csrfToken = getCsrfToken();
        return csrfToken ? { "x-sirel-csrf": csrfToken } : {};
      },
    })
  ]
});

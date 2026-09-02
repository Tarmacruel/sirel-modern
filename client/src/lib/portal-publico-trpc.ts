import { QueryClient } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import superjson from "superjson";

import type { AppRouter } from "@sirel/server/routers/index";

/**
 * Public-only tRPC boundary. It intentionally omits browser credentials so a
 * `.sirel.com.br` session cookie is never sent while browsing transparency.
 */
export const portalPublicoTrpc = createTRPCReact<AppRouter>();

function resolvePortalPublicoApiUrl() {
  if (typeof window !== "undefined") {
    return "/api/trpc";
  }

  return "http://localhost:3030/api/trpc";
}

export function fetchPortalPublico(
  input: RequestInfo | URL,
  init?: RequestInit,
) {
  const { headers, ...requestInit } = init ?? {};
  const safeHeaders = new Headers(headers);
  safeHeaders.delete("x-sirel-csrf");

  return globalThis.fetch(input, {
    ...requestInit,
    ...(safeHeaders.keys().next().done ? {} : { headers: safeHeaders }),
    credentials: "omit",
  });
}

export const portalPublicoTrpcClient = portalPublicoTrpc.createClient({
  links: [
    httpBatchLink({
      url: resolvePortalPublicoApiUrl(),
      transformer: superjson,
      fetch: fetchPortalPublico,
    }),
  ],
});

export const portalPublicoQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

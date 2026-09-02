export function configuredArquivosHostname() {
  return String(import.meta.env.VITE_ARQUIVOS_HOSTNAME ?? "arquivos.sirel.com.br")
    .trim()
    .toLowerCase();
}

export function matchesArquivosHostname(
  hostname: string,
  configured = configuredArquivosHostname(),
) {
  return hostname.trim().toLowerCase() === configured.trim().toLowerCase();
}

export function shouldRedirectArquivosRoot(
  hostname: string,
  pathname: string,
  configured = configuredArquivosHostname(),
) {
  return matchesArquivosHostname(hostname, configured) && pathname === "/";
}

export function isArquivosHostname() {
  if (typeof window === "undefined") return false;
  return matchesArquivosHostname(window.location.hostname);
}

export function redirectArquivosRootIfNeeded() {
  if (typeof window === "undefined") return false;
  if (!shouldRedirectArquivosRoot(window.location.hostname, window.location.pathname)) return false;
  window.history.replaceState(null, "", "/arquivos");
  window.dispatchEvent(new PopStateEvent("popstate"));
  return true;
}

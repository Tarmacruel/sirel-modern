const DEFAULT_HOSTS = ["folgas.sirel.com.br", "folga.sirel.com.br"];

function configuredHosts() {
  const raw = String(import.meta.env.VITE_FOLGAS_HOSTNAMES ?? "").trim();
  if (!raw) return DEFAULT_HOSTS;
  return raw
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function isFolgasHost(hostname?: string) {
  const host = String(
    hostname ?? (typeof window !== "undefined" ? window.location.hostname : ""),
  )
    .trim()
    .toLowerCase();
  return configuredHosts().includes(host);
}

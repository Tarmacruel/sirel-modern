/**
 * Hostnames que identificam a fronteira pública de transparência.
 *
 * Eles não pertencem a `subsystemDefinitions`: o portal não é um ambiente
 * operacional e nunca deve receber acesso de sessão nem entrar na allowlist
 * CORS autenticada dos subsistemas internos.
 */
export const TRANSPARENCIA_PORTAL_HOST = "transparencia.sirel.com.br";

export const transparenciaPortalLocalHosts = [
  "transparencia.localhost",
  "transparencia.127.0.0.1.nip.io",
] as const;

function normalizeHostname(value: string | null | undefined) {
  const firstValue =
    String(value ?? "")
      .split(",")[0]
      ?.trim()
      .toLowerCase() ?? "";
  if (!firstValue) return "";

  const withoutProtocol = firstValue.replace(/^[a-z][a-z\d+.-]*:\/\//, "");
  const withoutPath = withoutProtocol.split("/")[0] ?? "";

  if (withoutPath.startsWith("[") && withoutPath.includes("]")) {
    return withoutPath.slice(1, withoutPath.indexOf("]"));
  }

  // DNS permite o ponto final canônico em FQDNs. Ele não pode fazer o
  // hostname público cair no app interno nem contornar a allowlist do host.
  return (withoutPath.split(":")[0] ?? "").replace(/\.+$/, "");
}

export function isTransparencyPortalHost(value: string | null | undefined) {
  const hostname = normalizeHostname(value);
  return (
    hostname === TRANSPARENCIA_PORTAL_HOST ||
    transparenciaPortalLocalHosts.includes(
      hostname as (typeof transparenciaPortalLocalHosts)[number],
    )
  );
}

export function isTransparencyPortalOrigin(value: string | null | undefined) {
  if (!value) return false;

  try {
    return isTransparencyPortalHost(new URL(value).hostname);
  } catch {
    return false;
  }
}

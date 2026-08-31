const sensitiveAuditKeys = new Set([
  "password",
  "passwordhash",
  "password_hash",
  "sessionversion",
  "session_version",
  "openid",
  "open_id",
  "token",
  "accesstoken",
  "access_token",
  "refreshtoken",
  "refresh_token",
]);

function isSensitiveAuditKey(key: string) {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  return (
    sensitiveAuditKeys.has(key.toLowerCase()) ||
    normalized.includes("password") ||
    normalized.includes("senha") ||
    normalized.includes("token") ||
    normalized === "secret" ||
    normalized.endsWith("secret") ||
    normalized.endsWith("secretkey") ||
    normalized === "openid" ||
    normalized === "sessionversion" ||
    normalized === "authorization" ||
    normalized === "cookie"
  );
}

/**
 * Defesa central para impedir que segredos sejam duplicados em JSON de
 * auditoria ou reapareçam ao consultar registros históricos antigos.
 */
export function sanitizeAuditData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeAuditData);
  if (!value || typeof value !== "object" || value instanceof Date) return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !isSensitiveAuditKey(key))
      .map(([key, nestedValue]) => [key, sanitizeAuditData(nestedValue)]),
  );
}

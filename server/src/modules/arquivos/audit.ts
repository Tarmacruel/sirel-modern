import { sql } from "drizzle-orm";

import { requireDb } from "../../db/client.js";

export type ArquivoAuditAction =
  | "LIST"
  | "SEARCH"
  | "VIEW"
  | "DOWNLOAD"
  | "FAVORITE"
  | "UNFAVORITE"
  | "DENIED"
  | "REINDEX";

export function resolveClientIp(req: { headers?: Record<string, any>; socket?: { remoteAddress?: string | null } } | null | undefined) {
  const headers = req?.headers ?? {};
  const cf = String(headers["cf-connecting-ip"] ?? "").trim();
  if (cf) return cf;
  const forwarded = String(headers["x-forwarded-for"] ?? "").split(",")[0]?.trim();
  if (forwarded) return forwarded;
  return String(req?.socket?.remoteAddress ?? "").trim() || null;
}

export async function logArquivoAudit(params: {
  userId: number | null;
  action: ArquivoAuditAction;
  relativePath?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  success?: boolean;
  detail?: string | null;
}) {
  try {
    const db = requireDb();
    await db.execute(sql`
      INSERT INTO arquivo_audit_log
        (user_id, action, relative_path, file_name, file_size, ip_address, user_agent, success, detail)
      VALUES
        (${params.userId}, ${params.action}, ${params.relativePath ?? null},
         ${params.fileName ?? null}, ${params.fileSize ?? null}, ${params.ipAddress ?? null},
         ${params.userAgent ?? null}, ${params.success ?? true}, ${params.detail ?? null})
    `);
  } catch (error) {
    console.error("[SIREL Arquivos] Falha ao registrar auditoria:", error);
  }
}

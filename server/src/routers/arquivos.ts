import { mkdir } from "node:fs/promises";

import { sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { requireDb } from "../db/client.js";
import { adminProcedure, auditorProcedure, operadorProcedure, protectedProcedure, router } from "../trpc.js";
import { logArquivoAudit, resolveClientIp } from "../modules/arquivos/audit.js";
import { arquivosConfig } from "../modules/arquivos/config.js";
import { listDirectory } from "../modules/arquivos/filesystem.js";
import { reindexArquivos } from "../modules/arquivos/indexer.js";
import { kindFor, previewableFor } from "../modules/arquivos/mime.js";
import { officePreviewPath } from "../modules/arquivos/preview.js";
import { normalizeNewFolderName, safeResolve } from "../modules/arquivos/security.js";
import { createArquivosTicket } from "../modules/arquivos/tickets.js";

const pathInput = z.object({
  path: z.string().max(4000).optional().default(""),
});

const ticketInput = z.object({
  path: z.string().min(1).max(4000),
  mode: z.enum(["download", "preview"]),
});

function reqMeta(ctx: any) {
  return {
    ipAddress: resolveClientIp(ctx.req),
    userAgent: String(ctx.req?.headers?.["user-agent"] ?? "") || null,
  };
}

function rowsFromResult(result: any): any[] {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.rows)) return result.rows;
  return [];
}

async function logDenied(ctx: any, relativePath: string, error: unknown) {
  await logArquivoAudit({
    userId: ctx.user?.id ?? null,
    action: "DENIED",
    relativePath,
    success: false,
    detail: error instanceof Error ? error.message : "Acesso negado/ inválido.",
    ...reqMeta(ctx),
  });
}

export const arquivosRouter = router({
  summary: protectedProcedure.query(async ({ ctx }) => {
    const db = requireDb();
    const result = await db.execute(sql`
      SELECT
        count(*) FILTER (WHERE kind <> 'folder')::int AS files,
        count(*) FILTER (WHERE kind = 'folder')::int AS folders,
        coalesce(sum(size) FILTER (WHERE kind <> 'folder'), 0)::bigint AS bytes,
        max(indexed_at) AS last_indexed_at
      FROM arquivo_index
    `);
    const row = rowsFromResult(result)[0] ?? {};
    return {
      files: Number(row.files ?? 0),
      folders: Number(row.folders ?? 0),
      bytes: Number(row.bytes ?? 0),
      lastIndexedAt: row.last_indexed_at ?? null,
      canAudit: ["admin", "auditor"].includes(String(ctx.user?.role)),
      canReindex: String(ctx.user?.role) === "admin",
      canUpload: ["admin", "gestor", "operador"].includes(String(ctx.user?.role)),
      canCreateFolder: ["admin", "gestor", "operador"].includes(String(ctx.user?.role)),
    };
  }),

  list: protectedProcedure.input(pathInput).query(async ({ ctx, input }) => {
    let items;
    try {
      items = await listDirectory(input.path);
    } catch (error) {
      await logDenied(ctx, input.path || "", error);
      throw error;
    }
    const db = requireDb();

    const favoritesResult = await db.execute(sql`
      SELECT relative_path
      FROM arquivo_favoritos
      WHERE user_id = ${ctx.user!.id}
    `);
    const favoritePaths = new Set(rowsFromResult(favoritesResult).map((row) => String(row.relative_path)));

    await logArquivoAudit({
      userId: ctx.user!.id,
      action: "LIST",
      relativePath: input.path || "",
      ...reqMeta(ctx),
    });

    return items.map((item) => ({ ...item, favorite: favoritePaths.has(item.relativePath) }));
  }),

  search: protectedProcedure
    .input(z.object({ q: z.string().trim().min(2).max(200), limit: z.number().int().min(1).max(200).default(80) }))
    .query(async ({ ctx, input }) => {
      const db = requireDb();
      const pattern = `%${input.q}%`;
      const result = await db.execute(sql`
        SELECT
          i.relative_path, i.parent_path, i.name, i.extension, i.kind, i.size, i.modified_at,
          EXISTS (
            SELECT 1 FROM arquivo_favoritos f
            WHERE f.user_id = ${ctx.user!.id} AND f.relative_path = i.relative_path
          ) AS favorite
        FROM arquivo_index i
        WHERE i.name ILIKE ${pattern} OR i.relative_path ILIKE ${pattern}
        ORDER BY
          CASE WHEN i.name ILIKE ${input.q + "%"} THEN 0 ELSE 1 END,
          i.kind = 'folder' DESC,
          i.name ASC
        LIMIT ${input.limit}
      `);

      await logArquivoAudit({
        userId: ctx.user!.id,
        action: "SEARCH",
        detail: input.q,
        ...reqMeta(ctx),
      });

      return rowsFromResult(result).map((row) => ({
        name: String(row.name),
        relativePath: String(row.relative_path),
        parentPath: String(row.parent_path ?? ""),
        extension: String(row.extension ?? ""),
        kind: String(row.kind),
        size: row.size == null ? null : Number(row.size),
        modifiedAt: row.modified_at ?? null,
        previewable: row.kind === "folder" ? false : previewableFor(String(row.name)),
        downloadable: row.kind !== "folder",
        favorite: Boolean(row.favorite),
      }));
    }),

  favorites: protectedProcedure.query(async ({ ctx }) => {
    const db = requireDb();
    const result = await db.execute(sql`
      SELECT f.relative_path, f.created_at, i.name, i.parent_path, i.extension, i.kind, i.size, i.modified_at
      FROM arquivo_favoritos f
      LEFT JOIN arquivo_index i ON i.relative_path = f.relative_path
      WHERE f.user_id = ${ctx.user!.id}
      ORDER BY f.created_at DESC
      LIMIT 100
    `);
    return rowsFromResult(result).map((row) => ({
      relativePath: String(row.relative_path),
      createdAt: row.created_at,
      name: String(row.name ?? row.relative_path ?? ""),
      parentPath: String(row.parent_path ?? ""),
      extension: String(row.extension ?? ""),
      kind: String(row.kind ?? "other"),
      size: row.size == null ? null : Number(row.size),
      modifiedAt: row.modified_at ?? null,
      previewable: row.kind === "folder" ? false : previewableFor(String(row.name ?? "")),
      downloadable: row.kind !== "folder",
      favorite: true,
    }));
  }),

  recent: protectedProcedure.query(async ({ ctx }) => {
    const db = requireDb();
    const result = await db.execute(sql`
      WITH recent_by_path AS (
        SELECT DISTINCT ON (relative_path)
          relative_path, file_name, file_size, action, created_at
        FROM arquivo_audit_log
        WHERE user_id = ${ctx.user!.id}
          AND action IN ('VIEW', 'DOWNLOAD')
          AND success = true
          AND relative_path IS NOT NULL
        ORDER BY relative_path, created_at DESC
      )
      SELECT
        r.relative_path,
        coalesce(i.name, r.file_name) AS name,
        coalesce(i.size, r.file_size) AS size,
        i.parent_path,
        i.extension,
        i.kind,
        i.modified_at,
        r.action,
        r.created_at,
        EXISTS (
          SELECT 1 FROM arquivo_favoritos f
          WHERE f.user_id = ${ctx.user!.id} AND f.relative_path = r.relative_path
        ) AS favorite
      FROM recent_by_path r
      INNER JOIN arquivo_index i ON i.relative_path = r.relative_path
      ORDER BY r.created_at DESC
      LIMIT 20
    `);
    return rowsFromResult(result)
      .map((row) => ({
        relativePath: String(row.relative_path),
        name: String(row.name ?? row.relative_path ?? ""),
        parentPath: String(row.parent_path ?? ""),
        extension: String(row.extension ?? ""),
        kind: String(row.kind ?? "other"),
        size: row.size == null ? null : Number(row.size),
        modifiedAt: row.modified_at ?? null,
        previewable: row.kind ? previewableFor(String(row.name ?? "")) : false,
        downloadable: true,
        favorite: Boolean(row.favorite),
        action: String(row.action),
        createdAt: row.created_at,
      }));
  }),

  toggleFavorite: protectedProcedure
    .input(z.object({ path: z.string().min(1).max(4000) }))
    .mutation(async ({ ctx, input }) => {
      let resolved;
      try {
        resolved = await safeResolve(input.path, { mustExist: true });
      } catch (error) {
        await logDenied(ctx, input.path, error);
        throw error;
      }
      const db = requireDb();
      const existingResult = await db.execute(sql`
        SELECT id FROM arquivo_favoritos
        WHERE user_id = ${ctx.user!.id} AND relative_path = ${resolved.relativePath}
        LIMIT 1
      `);
      const exists = rowsFromResult(existingResult).length > 0;

      if (exists) {
        await db.execute(sql`
          DELETE FROM arquivo_favoritos
          WHERE user_id = ${ctx.user!.id} AND relative_path = ${resolved.relativePath}
        `);
      } else {
        await db.execute(sql`
          INSERT INTO arquivo_favoritos (user_id, relative_path)
          VALUES (${ctx.user!.id}, ${resolved.relativePath})
          ON CONFLICT (user_id, relative_path) DO NOTHING
        `);
      }

      await logArquivoAudit({
        userId: ctx.user!.id,
        action: exists ? "UNFAVORITE" : "FAVORITE",
        relativePath: resolved.relativePath,
        ...reqMeta(ctx),
      });

      return { favorite: !exists };
    }),

  createFolder: operadorProcedure
    .input(z.object({
      path: z.string().max(4000).optional().default(""),
      name: z.string().trim().min(1).max(180),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const parent = await safeResolve(input.path, { allowDirectory: true });
        if (!parent.stat?.isDirectory()) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "O destino informado não é uma pasta." });
        }

        const name = normalizeNewFolderName(input.name);
        if (arquivosConfig.ignoredNames.has(name.toLowerCase())) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Este nome de pasta é reservado pelo acervo." });
        }

        const relativePath = [parent.relativePath, name].filter(Boolean).join("/");
        const target = await safeResolve(relativePath, { mustExist: false, allowDirectory: true });
        if (target.stat) {
          throw new TRPCError({ code: "CONFLICT", message: "Já existe um arquivo ou pasta com esse nome." });
        }

        try {
          await mkdir(target.absolutePath);
        } catch (error: any) {
          if (error?.code === "EEXIST") {
            throw new TRPCError({ code: "CONFLICT", message: "Já existe um arquivo ou pasta com esse nome." });
          }
          throw error;
        }

        await logArquivoAudit({
          userId: ctx.user!.id,
          action: "CREATE_FOLDER",
          relativePath,
          fileName: name,
          ...reqMeta(ctx),
          success: true,
          detail: "Pasta criada.",
        });

        return { success: true, name, relativePath };
      } catch (error) {
        await logDenied(ctx, input.path || "", error);
        throw error;
      }
    }),

  issueTicket: protectedProcedure.input(ticketInput).mutation(async ({ ctx, input }) => {
    let resolved;
    try {
      resolved = await safeResolve(input.path, { allowDirectory: false });
    } catch (error) {
      await logDenied(ctx, input.path, error);
      throw error;
    }
    if (!resolved.stat?.isFile()) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "O caminho não é um arquivo." });
    }

    if (input.mode === "preview" && !previewableFor(resolved.relativePath)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Preview não disponível." });
    }

    // Para Office, prepare o cache antes de entregar o ticket para que falhas
    // do LibreOffice cheguem à UI como erro controlado, não como JSON dentro do iframe.
    if (input.mode === "preview" && kindFor(resolved.relativePath) === "office") {
      try {
        await officePreviewPath(resolved.absolutePath, resolved.relativePath);
      } catch (error: any) {
        console.warn(
          "[SIREL Arquivos] Falha ao preparar preview Office:",
          error instanceof Error ? error.message : String(error),
        );
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Não foi possível preparar a visualização deste documento Office.",
        });
      }
    }

    const ticket = createArquivosTicket({
      userId: ctx.user!.id,
      relativePath: resolved.relativePath,
      mode: input.mode,
    });

    const endpoint =
      input.mode === "download"
        ? "/api/arquivos/download"
        : "/api/arquivos/preview";

    return {
      url: `${endpoint}?ticket=${encodeURIComponent(ticket)}`,
      expiresInSeconds:
        input.mode === "preview"
          ? arquivosConfig.previewTicketTtlSeconds
          : arquivosConfig.ticketTtlSeconds,
    };
  }),

  audit: auditorProcedure
    .input(z.object({
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(10).max(100).default(25),
      action: z.string().trim().max(30).optional(),
      search: z.string().trim().max(200).optional(),
    }))
    .query(async ({ input }) => {
      const db = requireDb();
      const offset = (input.page - 1) * input.pageSize;
      const action = input.action || null;
      const pattern = input.search ? `%${input.search}%` : null;

      const result = await db.execute(sql`
        SELECT a.*, u.name AS user_name, u.username
        FROM arquivo_audit_log a
        LEFT JOIN users u ON u.id = a.user_id
        WHERE (${action}::text IS NULL OR a.action = ${action})
          AND (
            ${pattern}::text IS NULL OR
            a.relative_path ILIKE ${pattern} OR
            a.file_name ILIKE ${pattern} OR
            a.detail ILIKE ${pattern} OR
            u.name ILIKE ${pattern} OR
            u.username ILIKE ${pattern}
          )
        ORDER BY a.created_at DESC
        LIMIT ${input.pageSize}
        OFFSET ${offset}
      `);

      const countResult = await db.execute(sql`
        SELECT count(*)::int AS total
        FROM arquivo_audit_log a
        LEFT JOIN users u ON u.id = a.user_id
        WHERE (${action}::text IS NULL OR a.action = ${action})
          AND (
            ${pattern}::text IS NULL OR
            a.relative_path ILIKE ${pattern} OR
            a.file_name ILIKE ${pattern} OR
            a.detail ILIKE ${pattern} OR
            u.name ILIKE ${pattern} OR
            u.username ILIKE ${pattern}
          )
      `);

      return {
        items: rowsFromResult(result),
        total: Number(rowsFromResult(countResult)[0]?.total ?? 0),
        page: input.page,
        pageSize: input.pageSize,
      };
    }),

  reindex: adminProcedure.mutation(async ({ ctx }) => {
    const result = await reindexArquivos();
    await logArquivoAudit({
      userId: ctx.user!.id,
      action: "REINDEX",
      detail: JSON.stringify(result),
      ...reqMeta(ctx),
    });
    return result;
  }),
});

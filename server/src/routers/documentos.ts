import { TRPCError } from "@trpc/server";
import {
  and,
  asc,
  count,
  countDistinct,
  desc,
  eq,
  ilike,
  inArray,
  or,
  sql,
} from "drizzle-orm";
import { z } from "zod";

import {
  documentoAccessInputSchema,
  documentoDetailInputSchema,
  documentoListInputSchema,
  documentoMetadataInputSchema,
  documentoProcessOptionsInputSchema,
  documentoPublicationActionInputSchema,
  documentoTipoOptions,
} from "@sirel/shared/schemas/documentos";

import { logAuditoria } from "../db/auditoria.js";
import { requireDb } from "../db/client.js";
import { documentos, processos } from "../db/schema.js";
import { normalizeDocumentoAccessRoles } from "../lib/document-publication.js";
import { searchAtaSessaoProcessOptions } from "../lib/ata-sessao-sync.js";
import {
  gestorProcedure,
  operadorProcedure,
  publicProcedure,
  router,
} from "../trpc.js";

const processoInput = z.object({ processoId: z.number().int().positive() });
const STATUS_PODE_SOLICITAR_REVISAO = [
  "RASCUNHO",
  "REJEITADO",
  "RETIRADO",
] as const;

function normalizeKeywords(values: string[] | null | undefined) {
  return Array.from(new Set((values ?? []).map((item) => item.trim()).filter(Boolean)));
}

function buildDocumentoUrl(documentoId: number) {
  return `/api/planejamento/documentos/${documentoId}/download`;
}

function hasSameRoles(left: readonly string[], right: readonly string[]) {
  if (left.length !== right.length) return false;
  return left.every((role, index) => role === right[index]);
}

function requireDocumentoPublicacaoState(
  status: string,
  expected: readonly string[],
  message: string,
) {
  if (!expected.includes(status)) {
    throw new TRPCError({ code: "BAD_REQUEST", message });
  }
}

export const documentosRouter = router({
  summary: publicProcedure.query(async () => {
    const db = requireDb();
    const [total] = await db.select({ total: count() }).from(documentos);
    const [processosComDocumentos] = await db
      .select({ total: countDistinct(documentos.processoId) })
      .from(documentos);
    const [publicos] = await db
      .select({ total: count() })
      .from(documentos)
      .where(
        and(
          eq(documentos.publico, true),
          eq(documentos.statusPublicacao, "APROVADO"),
          sql`coalesce(jsonb_array_length(${documentos.restritoA}), 0) = 0`,
        ),
      );
    const [semMetadados] = await db
      .select({ total: count() })
      .from(documentos)
      .where(
        sql`${documentos.dataReferencia} IS NULL AND coalesce(jsonb_array_length(${documentos.palavrasChave}), 0) = 0`,
      );

    return {
      total: Number(total?.total ?? 0),
      processosComDocumentos: Number(processosComDocumentos?.total ?? 0),
      publicos: Number(publicos?.total ?? 0),
      semMetadados: Number(semMetadados?.total ?? 0),
    };
  }),

  list: publicProcedure.input(documentoListInputSchema).query(async ({ input }) => {
    const db = requireDb();
    const offset = (input.page - 1) * input.pageSize;
    const filters: any[] = [];

    if (input.processoId) filters.push(eq(documentos.processoId, input.processoId));
    if (input.tipo) filters.push(eq(documentos.tipo, input.tipo));
    if (input.categoria) filters.push(ilike(documentos.categoria, `%${input.categoria}%`));
    if (typeof input.publico === "boolean") filters.push(eq(documentos.publico, input.publico));
    if (input.statusPublicacao) {
      filters.push(eq(documentos.statusPublicacao, input.statusPublicacao));
    }
    if (input.dataInicial) filters.push(sql`${documentos.dataReferencia} >= ${input.dataInicial}`);
    if (input.dataFinal) filters.push(sql`${documentos.dataReferencia} <= ${input.dataFinal}`);
    if (input.search) {
      const pattern = `%${input.search}%`;
      filters.push(
        or(
          ilike(documentos.titulo, pattern),
          ilike(documentos.descricao, pattern),
          ilike(documentos.categoria, pattern),
          ilike(processos.numeroSirel, pattern),
          sql`coalesce(${documentos.palavrasChave}::text, '') ilike ${pattern}`,
        ),
      );
    }

    const whereClause = filters.length ? and(...filters) : undefined;

    const items = await db
      .select({
        id: documentos.id,
        processoId: documentos.processoId,
        processoNumeroSirel: processos.numeroSirel,
        titulo: documentos.titulo,
        descricao: documentos.descricao,
        tipo: documentos.tipo,
        categoria: documentos.categoria,
        versao: documentos.versao,
        arquivoUrl: documentos.arquivoUrl,
        mimeType: documentos.mimeType,
        dataReferencia: documentos.dataReferencia,
        publico: documentos.publico,
        statusPublicacao: documentos.statusPublicacao,
        palavrasChave: documentos.palavrasChave,
        criadoEm: documentos.criadoEm,
        atualizadoEm: documentos.atualizadoEm,
      })
      .from(documentos)
      .innerJoin(processos, eq(processos.id, documentos.processoId))
      .where(whereClause)
      .orderBy(desc(documentos.criadoEm), desc(documentos.id))
      .limit(input.pageSize)
      .offset(offset);

    const [totalRow] = await db
      .select({ total: count() })
      .from(documentos)
      .innerJoin(processos, eq(processos.id, documentos.processoId))
      .where(whereClause);

    return {
      page: input.page,
      pageSize: input.pageSize,
      total: Number(totalRow?.total ?? 0),
      items: items.map((item) => ({
        ...item,
        arquivoUrl: buildDocumentoUrl(item.id),
        palavrasChave: normalizeKeywords(item.palavrasChave as string[] | null | undefined),
      })),
    };
  }),

  processOptions: publicProcedure
    .input(documentoProcessOptionsInputSchema.optional())
    .query(async ({ input }) => {
      return searchAtaSessaoProcessOptions({ search: input?.search });
    }),

  detail: publicProcedure.input(documentoDetailInputSchema).query(async ({ input }) => {
    const db = requireDb();
    const [documento] = await db
      .select({
        id: documentos.id,
        processoId: documentos.processoId,
        processoNumeroSirel: processos.numeroSirel,
        titulo: documentos.titulo,
        descricao: documentos.descricao,
        tipo: documentos.tipo,
        categoria: documentos.categoria,
        versao: documentos.versao,
        arquivoUrl: documentos.arquivoUrl,
        arquivoChave: documentos.arquivoChave,
        mimeType: documentos.mimeType,
        dataReferencia: documentos.dataReferencia,
        palavrasChave: documentos.palavrasChave,
        publico: documentos.publico,
        statusPublicacao: documentos.statusPublicacao,
        aprovadoPor: documentos.aprovadoPor,
        aprovadoEm: documentos.aprovadoEm,
        justificativa: documentos.justificativa,
        restritoA: documentos.restritoA,
        criadoPor: documentos.criadoPor,
        criadoEm: documentos.criadoEm,
        atualizadoEm: documentos.atualizadoEm,
      })
      .from(documentos)
      .innerJoin(processos, eq(processos.id, documentos.processoId))
      .where(eq(documentos.id, input.documentoId))
      .limit(1);

    if (!documento) return null;

    const related = await db
      .select({
        id: documentos.id,
        titulo: documentos.titulo,
        versao: documentos.versao,
        statusPublicacao: documentos.statusPublicacao,
        publico: documentos.publico,
        criadoEm: documentos.criadoEm,
        arquivoUrl: documentos.arquivoUrl,
      })
      .from(documentos)
      .where(and(eq(documentos.processoId, documento.processoId), eq(documentos.tipo, documento.tipo)))
      .orderBy(desc(documentos.versao), desc(documentos.criadoEm))
      .limit(12);

    return {
      ...documento,
      arquivoUrl: buildDocumentoUrl(documento.id),
      palavrasChave: normalizeKeywords(documento.palavrasChave as string[] | null | undefined),
      restritoA: normalizeDocumentoAccessRoles(documento.restritoA as string[] | null | undefined),
      related: related.map((item) => ({ ...item, arquivoUrl: buildDocumentoUrl(item.id) })),
    };
  }),

  updateMetadata: operadorProcedure.input(documentoMetadataInputSchema).mutation(async ({ ctx, input }) => {
    const db = requireDb();
    const [before] = await db.select().from(documentos).where(eq(documentos.id, input.documentoId)).limit(1);
    if (!before) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Documento não encontrado." });
    }

    const revogaRevisao =
      before.statusPublicacao === "APROVADO" ||
      before.statusPublicacao === "EM_REVISAO";
    const [updated] = await db
      .update(documentos)
      .set({
        titulo: input.titulo.trim(),
        descricao: input.descricao?.trim() || null,
        categoria: input.categoria?.trim() || null,
        dataReferencia: input.dataReferencia || null,
        palavrasChave: normalizeKeywords(input.palavrasChave),
        ...(revogaRevisao
          ? {
              publico: false,
              statusPublicacao: "RASCUNHO" as const,
              aprovadoPor: null,
              aprovadoEm: null,
              justificativa:
                "Aprovação revogada automaticamente após alteração de metadados.",
            }
          : {}),
        atualizadoEm: new Date(),
      })
      .where(eq(documentos.id, input.documentoId))
      .returning();

    await logAuditoria(ctx, {
      tabela: "documentos",
      registroId: updated.id,
      acao: "UPDATE",
      dadosAnteriores: before,
      dadosNovos: updated,
      descricao: revogaRevisao
        ? `Metadados do documento ${updated.titulo} atualizados; publicação revogada para nova revisão.`
        : `Metadados do documento ${updated.titulo} atualizados`,
    });

    return updated;
  }),

  updateAccess: gestorProcedure.input(documentoAccessInputSchema).mutation(async ({ ctx, input }) => {
    const db = requireDb();
    const [before] = await db.select().from(documentos).where(eq(documentos.id, input.documentoId)).limit(1);
    if (!before) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Documento não encontrado." });
    }

    const restritoA = normalizeDocumentoAccessRoles(input.restritoA);
    if (input.publico && restritoA.length > 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Um documento público não pode ter perfis restritos.",
      });
    }

    const previousRoles = normalizeDocumentoAccessRoles(before.restritoA as string[] | null | undefined);
    const accessIsUnchanged =
      before.publico === input.publico &&
      hasSameRoles(previousRoles, restritoA);
    if (accessIsUnchanged && before.statusPublicacao === "RASCUNHO") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "A configuração de acesso informada já está em vigor.",
      });
    }

    const [updated] = await db
      .update(documentos)
      .set({
        publico: input.publico,
        restritoA,
        statusPublicacao: "RASCUNHO",
        aprovadoPor: null,
        aprovadoEm: null,
        justificativa: input.justificativa,
        atualizadoEm: new Date(),
      })
      .where(eq(documentos.id, input.documentoId))
      .returning();

    await logAuditoria(ctx, {
      tabela: "documentos",
      registroId: updated.id,
      acao: "UPDATE",
      dadosAnteriores: before,
      dadosNovos: updated,
      descricao: accessIsUnchanged
        ? `Classificação interna do documento ${updated.titulo} confirmada; revisão pendente encerrada.`
        : `Publicidade/restrições do documento ${updated.titulo} alteradas; aprovação revogada.`,
    });

    return updated;
  }),

  submitForReview: gestorProcedure
    .input(documentoPublicationActionInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = requireDb();
      const [before] = await db.select().from(documentos).where(eq(documentos.id, input.documentoId)).limit(1);
      if (!before) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Documento não encontrado." });
      }
      requireDocumentoPublicacaoState(
        before.statusPublicacao,
        STATUS_PODE_SOLICITAR_REVISAO,
        "O documento precisa estar como rascunho, rejeitado ou retirado para solicitar revisão.",
      );
      if (normalizeDocumentoAccessRoles(before.restritoA as string[] | null | undefined).length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Remova as restrições por perfil antes de solicitar publicação pública.",
        });
      }

      const [updated] = await db
        .update(documentos)
        .set({
          publico: true,
          statusPublicacao: "EM_REVISAO",
          aprovadoPor: null,
          aprovadoEm: null,
          justificativa: input.justificativa,
          atualizadoEm: new Date(),
        })
        .where(
          and(
            eq(documentos.id, input.documentoId),
            inArray(documentos.statusPublicacao, STATUS_PODE_SOLICITAR_REVISAO),
          ),
        )
        .returning();
      if (!updated) {
        throw new TRPCError({ code: "CONFLICT", message: "O estado do documento foi alterado. Atualize a página e tente novamente." });
      }

      await logAuditoria(ctx, {
        tabela: "documentos",
        registroId: updated.id,
        acao: "UPDATE",
        dadosAnteriores: before,
        dadosNovos: updated,
        descricao: `Publicação pública do documento ${updated.titulo} encaminhada para revisão.`,
      });
      return updated;
    }),

  approvePublication: gestorProcedure
    .input(documentoPublicationActionInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = requireDb();
      const [before] = await db.select().from(documentos).where(eq(documentos.id, input.documentoId)).limit(1);
      if (!before) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Documento não encontrado." });
      }
      requireDocumentoPublicacaoState(
        before.statusPublicacao,
        ["EM_REVISAO"],
        "Somente documentos em revisão podem ser aprovados.",
      );
      if (!before.publico || normalizeDocumentoAccessRoles(before.restritoA as string[] | null | undefined).length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A publicação exige intenção pública e ausência de perfis restritos.",
        });
      }

      const [updated] = await db
        .update(documentos)
        .set({
          publico: true,
          restritoA: [],
          statusPublicacao: "APROVADO",
          aprovadoPor: ctx.user!.id,
          aprovadoEm: new Date(),
          justificativa: input.justificativa,
          atualizadoEm: new Date(),
        })
        .where(and(eq(documentos.id, input.documentoId), eq(documentos.statusPublicacao, "EM_REVISAO")))
        .returning();
      if (!updated) {
        throw new TRPCError({ code: "CONFLICT", message: "O estado do documento foi alterado. Atualize a página e tente novamente." });
      }

      await logAuditoria(ctx, {
        tabela: "documentos",
        registroId: updated.id,
        acao: "UPDATE",
        dadosAnteriores: before,
        dadosNovos: updated,
        descricao: `Publicação pública do documento ${updated.titulo} aprovada.`,
      });
      return updated;
    }),

  rejectPublication: gestorProcedure
    .input(documentoPublicationActionInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = requireDb();
      const [before] = await db.select().from(documentos).where(eq(documentos.id, input.documentoId)).limit(1);
      if (!before) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Documento não encontrado." });
      }
      requireDocumentoPublicacaoState(
        before.statusPublicacao,
        ["EM_REVISAO"],
        "Somente documentos em revisão podem ser rejeitados.",
      );

      const [updated] = await db
        .update(documentos)
        .set({
          publico: false,
          restritoA: [],
          statusPublicacao: "REJEITADO",
          aprovadoPor: null,
          aprovadoEm: null,
          justificativa: input.justificativa,
          atualizadoEm: new Date(),
        })
        .where(and(eq(documentos.id, input.documentoId), eq(documentos.statusPublicacao, "EM_REVISAO")))
        .returning();
      if (!updated) {
        throw new TRPCError({ code: "CONFLICT", message: "O estado do documento foi alterado. Atualize a página e tente novamente." });
      }

      await logAuditoria(ctx, {
        tabela: "documentos",
        registroId: updated.id,
        acao: "UPDATE",
        dadosAnteriores: before,
        dadosNovos: updated,
        descricao: `Publicação pública do documento ${updated.titulo} rejeitada.`,
      });
      return updated;
    }),

  withdrawPublication: gestorProcedure
    .input(documentoPublicationActionInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = requireDb();
      const [before] = await db.select().from(documentos).where(eq(documentos.id, input.documentoId)).limit(1);
      if (!before) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Documento não encontrado." });
      }
      requireDocumentoPublicacaoState(
        before.statusPublicacao,
        ["APROVADO"],
        "Somente documentos aprovados podem ter a publicação retirada.",
      );

      const [updated] = await db
        .update(documentos)
        .set({
          publico: false,
          statusPublicacao: "RETIRADO",
          aprovadoPor: null,
          aprovadoEm: null,
          justificativa: input.justificativa,
          atualizadoEm: new Date(),
        })
        .where(and(eq(documentos.id, input.documentoId), eq(documentos.statusPublicacao, "APROVADO")))
        .returning();
      if (!updated) {
        throw new TRPCError({ code: "CONFLICT", message: "O estado do documento foi alterado. Atualize a página e tente novamente." });
      }

      await logAuditoria(ctx, {
        tabela: "documentos",
        registroId: updated.id,
        acao: "UPDATE",
        dadosAnteriores: before,
        dadosNovos: updated,
        descricao: `Publicação pública do documento ${updated.titulo} retirada.`,
      });
      return updated;
    }),

  listByProcesso: publicProcedure.input(processoInput).query(async ({ input }) => {
    const db = requireDb();
    const rows = await db
      .select()
      .from(documentos)
      .where(eq(documentos.processoId, input.processoId))
      .orderBy(asc(documentos.criadoEm), asc(documentos.id));
    return rows.map((row) => ({
      ...row,
      arquivoUrl: buildDocumentoUrl(row.id),
      palavrasChave: normalizeKeywords(row.palavrasChave as string[] | null | undefined),
      restritoA: normalizeDocumentoAccessRoles(row.restritoA as string[] | null | undefined),
    }));
  }),

  createVersion: operadorProcedure.input(z.object({
    processoId: z.number().int().positive(),
    titulo: z.string().min(3),
    tipo: z.enum(documentoTipoOptions),
    categoria: z.string().optional(),
    arquivoUrl: z.string().url().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = requireDb();
    const latest = await db.select().from(documentos).where(eq(documentos.processoId, input.processoId)).orderBy(desc(documentos.versao)).limit(1);
    const nextVersion = Number(latest[0]?.versao ?? 0) + 1;

    const [created] = await db.insert(documentos).values({
      processoId: input.processoId,
      titulo: input.titulo,
      tipo: input.tipo,
      categoria: input.categoria,
      versao: nextVersion,
      arquivoUrl: input.arquivoUrl,
      criadoPor: ctx.user?.id ?? null,
      publico: false,
      statusPublicacao: "RASCUNHO",
      aprovadoPor: null,
      aprovadoEm: null,
      palavrasChave: [],
      restritoA: [],
    }).returning();

    await logAuditoria(ctx, { tabela: "documentos", registroId: created.id, acao: "CREATE", dadosNovos: created, descricao: `Documento ${created.titulo} v${created.versao} criado como rascunho` });

    return created;
  }),
});

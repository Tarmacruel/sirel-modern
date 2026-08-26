import { and, asc, count, eq, ilike, or } from "drizzle-orm";
import { z } from "zod";

import { documentos, modalidades, processos, secretarias } from "../db/schema.js";
import { requireDb } from "../db/client.js";
import { createPublicDocumentLink } from "../lib/public-document-link.js";
import { anonymousProcedure, router } from "../trpc.js";

const listInput = z.object({
  pagina: z.number().int().min(1).default(1),
  limite: z.number().int().min(1).max(50).default(20),
  busca: z.string().trim().max(160).optional(),
});

/** Intentionally distinct DTOs: never reuse internal process/document records here. */
export const portalPublicoRouter = router({
  processos: anonymousProcedure.input(listInput).query(async ({ input }) => {
    const db = requireDb();
    const term = input.busca ? `%${input.busca}%` : null;
    const where = and(
      eq(processos.publicado, true),
      eq(processos.ativo, true),
      term ? or(ilike(processos.numeroSirel, term), ilike(processos.numeroEdital, term), ilike(processos.objeto, term)) : undefined,
    );
    const [total] = await db.select({ total: count() }).from(processos).where(where);
    const rows = await db
      .select({ numero: processos.numeroSirel, edital: processos.numeroEdital, objeto: processos.objeto, dataPublicacao: processos.dataPublicacao, secretaria: secretarias.nome, modalidade: modalidades.nome })
      .from(processos)
      .leftJoin(secretarias, eq(secretarias.id, processos.secretariaId))
      .leftJoin(modalidades, eq(modalidades.id, processos.modalidadeId))
      .where(where)
      .orderBy(asc(processos.numeroSirel))
      .limit(input.limite)
      .offset((input.pagina - 1) * input.limite);
    return { pagina: input.pagina, limite: input.limite, total: Number(total?.total ?? 0), itens: rows };
  }),
  documentos: anonymousProcedure
    .input(z.object({ numeroProcesso: z.string().trim().min(1).max(64) }))
    .query(async ({ input }) => {
      const db = requireDb();
      const rows = await db
        .select({ id: documentos.id, titulo: documentos.titulo, tipo: documentos.tipo, categoria: documentos.categoria, versao: documentos.versao, dataReferencia: documentos.dataReferencia, criadoEm: documentos.criadoEm })
        .from(documentos)
        .innerJoin(processos, eq(processos.id, documentos.processoId))
        .where(and(eq(processos.numeroSirel, input.numeroProcesso), eq(processos.publicado, true), eq(processos.ativo, true), eq(documentos.publico, true)))
        .orderBy(asc(documentos.tipo), asc(documentos.versao));
      return rows.map(({ id, ...documento }) => ({ ...documento, downloadUrl: createPublicDocumentLink(id) }));
    }),
});

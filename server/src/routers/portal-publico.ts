import { and, asc, count, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";

import { documentoTipoOptions } from "@sirel/shared/schemas/documentos";

import {
  documentoClassificacoes,
  documentos,
  modalidades,
  processos,
  secretarias,
} from "../db/schema.js";
import { requireDb } from "../db/client.js";
import { createPublicDocumentLink } from "../lib/public-document-link.js";
import { anonymousProcedure, router } from "../trpc.js";

const pageInput = z.object({
  pagina: z.number().int().min(1).default(1),
  limite: z.number().int().min(1).max(50).default(20),
});

const processosInput = pageInput.extend({
  busca: z.string().trim().max(160).optional(),
});

const documentosInput = pageInput.extend({
  numeroProcesso: z.string().trim().min(1).max(64).optional(),
  busca: z.string().trim().max(160).optional(),
  tipo: z.enum(documentoTipoOptions).optional(),
  classificacao: z.string().trim().min(2).max(120).optional(),
  ano: z.number().int().min(2000).max(2200).optional(),
});

/**
 * The portal shows the latest publicly approved version in each logical
 * document lineage. A draft/review version does not hide the last approved
 * version; approval of a later public version supersedes it.
 */
function isLatestPublicDocumentVersion() {
  return sql`not exists (
    select 1
    from "documentos" as "documentos_posteriores"
    where coalesce("documentos_posteriores"."documento_raiz_id", "documentos_posteriores"."id") = coalesce(${documentos.documentoRaizId}, ${documentos.id})
      and "documentos_posteriores"."versao" > ${documentos.versao}
      and "documentos_posteriores"."publico" = true
      and "documentos_posteriores"."status_publicacao" = 'APROVADO'
      and coalesce(jsonb_array_length("documentos_posteriores"."restrito_a"), 0) = 0
  )`;
}

/**
 * Intentionally distinct public DTOs: no internal IDs, protocol, people,
 * workflow, deadlines, tasks or storage paths leave this router.
 */
export const portalPublicoRouter = router({
  processos: anonymousProcedure
    .input(processosInput)
    .query(async ({ input }) => {
      const db = requireDb();
      const term = input.busca ? `%${input.busca}%` : undefined;
      const where = and(
        eq(processos.publicado, true),
        eq(processos.ativo, true),
        term
          ? or(
              ilike(processos.numeroSirel, term),
              ilike(processos.numeroEdital, term),
              ilike(processos.objeto, term),
            )
          : undefined,
      );
      const [total] = await db
        .select({ total: count() })
        .from(processos)
        .where(where);
      const rows = await db
        .select({
          numero: processos.numeroSirel,
          edital: processos.numeroEdital,
          objeto: processos.objeto,
          dataPublicacao: processos.dataPublicacao,
          secretaria: secretarias.nome,
          modalidade: modalidades.nome,
        })
        .from(processos)
        .leftJoin(secretarias, eq(secretarias.id, processos.secretariaId))
        .leftJoin(modalidades, eq(modalidades.id, processos.modalidadeId))
        .where(where)
        .orderBy(asc(processos.numeroSirel))
        .limit(input.limite)
        .offset((input.pagina - 1) * input.limite);

      return {
        pagina: input.pagina,
        limite: input.limite,
        total: Number(total?.total ?? 0),
        itens: rows,
      };
    }),

  documentos: anonymousProcedure
    .input(documentosInput)
    .query(async ({ input }) => {
      const db = requireDb();
      const term = input.busca ? `%${input.busca}%` : undefined;
      const classificacao = input.classificacao
        ? `%${input.classificacao}%`
        : undefined;
      const where = and(
        eq(processos.publicado, true),
        eq(processos.ativo, true),
        eq(documentos.publico, true),
        eq(documentos.statusPublicacao, "APROVADO"),
        sql`coalesce(jsonb_array_length(${documentos.restritoA}), 0) = 0`,
        isLatestPublicDocumentVersion(),
        input.numeroProcesso
          ? eq(processos.numeroSirel, input.numeroProcesso)
          : undefined,
        input.tipo ? eq(documentos.tipo, input.tipo) : undefined,
        classificacao
          ? or(
              ilike(documentoClassificacoes.codigo, classificacao),
              ilike(documentoClassificacoes.nome, classificacao),
            )
          : undefined,
        input.ano
          ? sql`extract(year from coalesce(${documentos.dataReferencia}, ${documentos.criadoEm})) = ${input.ano}`
          : undefined,
        term
          ? or(
              ilike(processos.numeroSirel, term),
              ilike(processos.numeroEdital, term),
              ilike(processos.objeto, term),
              ilike(documentos.titulo, term),
              ilike(documentoClassificacoes.codigo, term),
              ilike(documentoClassificacoes.nome, term),
            )
          : undefined,
      );
      const [total] = await db
        .select({ total: count() })
        .from(documentos)
        .innerJoin(processos, eq(processos.id, documentos.processoId))
        .leftJoin(
          documentoClassificacoes,
          eq(documentoClassificacoes.id, documentos.classificacaoId),
        )
        .where(where);
      const rows = await db
        .select({
          id: documentos.id,
          processoNumero: processos.numeroSirel,
          titulo: documentos.titulo,
          tipo: documentos.tipo,
          categoria: documentoClassificacoes.nome,
          classificacao: documentoClassificacoes.codigo,
          versao: documentos.versao,
          dataReferencia: documentos.dataReferencia,
          publicadoEm: documentos.aprovadoEm,
        })
        .from(documentos)
        .innerJoin(processos, eq(processos.id, documentos.processoId))
        .leftJoin(
          documentoClassificacoes,
          eq(documentoClassificacoes.id, documentos.classificacaoId),
        )
        .where(where)
        .orderBy(
          asc(processos.numeroSirel),
          asc(documentos.tipo),
          asc(documentos.versao),
        )
        .limit(input.limite)
        .offset((input.pagina - 1) * input.limite);

      return {
        pagina: input.pagina,
        limite: input.limite,
        total: Number(total?.total ?? 0),
        itens: rows.map(({ id, ...documento }) => ({
          ...documento,
          downloadUrl: createPublicDocumentLink(id),
        })),
      };
    }),

  classificacoes: anonymousProcedure.query(async () => {
    const db = requireDb();
    return db
      .select({
        codigo: documentoClassificacoes.codigo,
        nome: documentoClassificacoes.nome,
      })
      .from(documentoClassificacoes)
      .where(eq(documentoClassificacoes.ativo, true))
      .orderBy(asc(documentoClassificacoes.nome))
      .limit(100);
  }),
});

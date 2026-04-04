import { and, asc, count, desc, eq, ilike, lte, or } from "drizzle-orm";
import { z } from "zod";

import { contratos, contratosPncp, fornecedores, processos } from "../db/schema.js";
import { publicProcedure, router } from "../trpc.js";
import { requireDb } from "../db/client.js";

const contratosListInputSchema = z.object({
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(10),
  status: z.enum(["ATIVO", "ENCERRADO", "SUSPENSO", "RESCINDIDO"]).optional(),
  search: z.string().trim().optional(),
});

export const contratosRouter = router({
  summary: publicProcedure.query(async () => {
    const db = requireDb();
    const [ativos] = await db.select({ total: count() }).from(contratos).where(eq(contratos.status, "ATIVO"));
    const [total] = await db.select({ total: count() }).from(contratos);
    const [totalPncp] = await db.select({ total: count() }).from(contratosPncp);
    const [expirando] = await db
      .select({ total: count() })
      .from(contratos)
      .where(and(eq(contratos.status, "ATIVO"), lte(contratos.dataVigenciaFim, new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))));

    return {
      total: Number(total?.total ?? 0) + Number(totalPncp?.total ?? 0),
      totalInternos: Number(total?.total ?? 0),
      totalPncp: Number(totalPncp?.total ?? 0),
      ativos: Number(ativos?.total ?? 0),
      expirandoEm30Dias: Number(expirando?.total ?? 0),
    };
  }),

  list: publicProcedure.input(contratosListInputSchema).query(async ({ input }) => {
    const db = requireDb();
    const filters: any[] = [];

    if (input.status) filters.push(eq(contratos.status, input.status));
    if (input.search) {
      filters.push(
        or(
          ilike(contratos.numeroContrato, `%${input.search}%`),
          ilike(contratos.objeto, `%${input.search}%`),
          ilike(processos.numeroSirel, `%${input.search}%`),
          ilike(fornecedores.razaoSocial, `%${input.search}%`),
        ),
      );
    }

    const whereClause = filters.length ? and(...filters) : undefined;

    const internalRows = await db
      .select({
        id: contratos.id,
        numeroContrato: contratos.numeroContrato,
        processoNumeroSirel: processos.numeroSirel,
        fornecedor: fornecedores.razaoSocial,
        valorContrato: contratos.valorContrato,
        dataVigenciaInicio: contratos.dataVigenciaInicio,
        dataVigenciaFim: contratos.dataVigenciaFim,
        status: contratos.status,
        objeto: contratos.objeto,
      })
      .from(contratos)
      .innerJoin(processos, eq(processos.id, contratos.processoId))
      .innerJoin(fornecedores, eq(fornecedores.id, contratos.fornecedorId))
      .where(whereClause)
      .orderBy(asc(contratos.dataVigenciaFim), desc(contratos.criadoEm))
      .limit(500);

    const pncpRows = await db
      .select({
        id: contratosPncp.id,
        numeroContrato: contratosPncp.numeroContrato,
        processoNumeroSirel: processos.numeroSirel,
        fornecedor: contratosPncp.fornecedorNome,
        valorContrato: contratosPncp.valorTotalContrato,
        dataVigenciaInicio: contratosPncp.dataInicioVigencia,
        dataVigenciaFim: contratosPncp.dataFimVigencia,
        status: contratosPncp.statusContrato,
        objeto: contratosPncp.objetoContrato,
        pncpUrl: contratosPncp.pncpUrl,
        pncpApiUrl: contratosPncp.pncpApiUrl,
        documentoUrl: contratosPncp.urlDocumentoContrato,
        pncpContractId: contratosPncp.pncpContractId,
      })
      .from(contratosPncp)
      .innerJoin(processos, eq(processos.id, contratosPncp.processoId))
      .orderBy(desc(contratosPncp.dataAssinatura), desc(contratosPncp.id))
      .limit(500);

    const normalizedSearch = String(input.search ?? "").trim().toLowerCase();
    const filteredPncpRows = pncpRows.filter((row) => {
      if (normalizedSearch) {
        const haystack = [
          row.numeroContrato,
          row.pncpContractId,
          row.objeto,
          row.processoNumeroSirel,
          row.fornecedor,
        ]
          .map((value) => String(value ?? "").toLowerCase())
          .join(" ");
        if (!haystack.includes(normalizedSearch)) return false;
      }

      if (!input.status) return true;
      const statusText = String(row.status ?? "").toUpperCase();
      if (input.status === "ATIVO") {
        return /ATIV|VIGEN|EXECU/.test(statusText) || Boolean(row.dataVigenciaFim);
      }
      if (input.status === "ENCERRADO") {
        return /ENCERR|FINALIZ|CONCLU/.test(statusText);
      }
      if (input.status === "SUSPENSO") {
        return /SUSPENS/.test(statusText);
      }
      if (input.status === "RESCINDIDO") {
        return /RESCIND/.test(statusText);
      }
      return true;
    });

    const mergedItems = [
      ...internalRows.map((row) => ({
        ...row,
        origem: "INTERNO" as const,
        pncpUrl: null,
        pncpApiUrl: null,
        documentoUrl: null,
        pncpContractId: null,
      })),
      ...filteredPncpRows.map((row) => ({
        ...row,
        origem: "PNCP" as const,
      })),
    ].sort((left, right) => {
      const leftDate = String(left.dataVigenciaFim ?? left.dataVigenciaInicio ?? "");
      const rightDate = String(right.dataVigenciaFim ?? right.dataVigenciaInicio ?? "");
      return rightDate.localeCompare(leftDate);
    });

    const offset = (input.page - 1) * input.pageSize;
    const items = mergedItems.slice(offset, offset + input.pageSize);

    return {
      page: input.page,
      pageSize: input.pageSize,
      total: mergedItems.length,
      items,
    };
  }),

  listVigentes: publicProcedure.query(async () => {
    const db = requireDb();
    return db.select().from(contratos).where(eq(contratos.status, "ATIVO")).orderBy(asc(contratos.dataVigenciaFim));
  }),

  expirando: publicProcedure.input(z.object({ ate: z.string() })).query(async ({ input }) => {
    const db = requireDb();
    return db.select().from(contratos).where(lte(contratos.dataVigenciaFim, input.ate)).orderBy(asc(contratos.dataVigenciaFim));
  }),
});

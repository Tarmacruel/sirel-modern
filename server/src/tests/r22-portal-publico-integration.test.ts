import { and, eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { databaseEnabled, requireDb } from "../db/client.js";
import {
  auditoriaLog,
  documentoClassificacoes,
  documentos,
  modalidades,
  processos,
  secretarias,
  users,
} from "../db/schema.js";
import { appRouter } from "../routers/index.js";

// Esta suite nunca recebe DATABASE_URL: `db/client` exige a flag e uma URL de
// teste isolada. Sem isso, ela fica explicitamente ignorada como as suites R2.1.
const suite = databaseEnabled ? describe.sequential : describe.skip;

type TestIds = {
  secretariaId?: number;
  modalidadeId?: number;
  gestorId?: number;
  classificacaoAtivaId?: number;
  classificacaoInativaId?: number;
  processoIds: number[];
  documentoIds: number[];
};

function createCaller(db: any, user?: any) {
  return appRouter.createCaller({
    req: { headers: {} },
    res: {},
    db,
    databaseEnabled: true,
    user,
  } as any);
}

async function createDocumento(
  db: any,
  ids: TestIds,
  values: Record<string, unknown>,
) {
  const [created] = await db
    .insert(documentos)
    .values({
      tipo: "EDITAL",
      versao: 1,
      publico: false,
      statusPublicacao: "RASCUNHO",
      restritoA: [],
      ...values,
    })
    .returning();
  ids.documentoIds.push(created.id);
  return created;
}

async function limparDados(db: any, ids: TestIds) {
  if (ids.documentoIds.length) {
    await db
      .delete(auditoriaLog)
      .where(
        and(
          eq(auditoriaLog.tabela, "documentos"),
          inArray(auditoriaLog.registroId, ids.documentoIds),
        ),
      );
    // Quebra apenas os ponteiros internos dos dados descartaveis antes de
    // removê-los, preservando a ordem de FKs do banco real.
    await db
      .update(documentos)
      .set({ documentoRaizId: null, versaoAnteriorId: null })
      .where(inArray(documentos.id, ids.documentoIds));
    await db.delete(documentos).where(inArray(documentos.id, ids.documentoIds));
  }
  if (ids.gestorId) {
    await db
      .delete(auditoriaLog)
      .where(eq(auditoriaLog.usuarioId, ids.gestorId));
  }
  if (ids.classificacaoAtivaId) {
    await db
      .delete(documentoClassificacoes)
      .where(eq(documentoClassificacoes.id, ids.classificacaoAtivaId));
  }
  if (ids.classificacaoInativaId) {
    await db
      .delete(documentoClassificacoes)
      .where(eq(documentoClassificacoes.id, ids.classificacaoInativaId));
  }
  if (ids.processoIds.length) {
    await db.delete(processos).where(inArray(processos.id, ids.processoIds));
  }
  if (ids.gestorId) await db.delete(users).where(eq(users.id, ids.gestorId));
  if (ids.modalidadeId) {
    await db.delete(modalidades).where(eq(modalidades.id, ids.modalidadeId));
  }
  if (ids.secretariaId) {
    await db.delete(secretarias).where(eq(secretarias.id, ids.secretariaId));
  }
}

suite("R2.2 - portal publico e publicacao (PostgreSQL isolado)", () => {
  it("filtra a consulta publica e audita aprovacao, versao e retirada", async () => {
    const db = requireDb();
    const suffix = `${Date.now()}${Math.floor(Math.random() * 10_000)}`;
    const ids: TestIds = { processoIds: [], documentoIds: [] };
    const previousSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET =
      "r22-integration-test-secret-with-more-than-32-characters";

    try {
      const [secretaria] = await db
        .insert(secretarias)
        .values({
          sigla: `R22${suffix.slice(-12)}`,
          nome: `Secretaria R2.2 ${suffix}`,
          ativo: true,
        })
        .returning();
      ids.secretariaId = secretaria.id;

      const [modalidade] = await db
        .insert(modalidades)
        .values({
          codigo: `R22${suffix.slice(-12)}`,
          nome: `Modalidade R2.2 ${suffix}`,
          ativo: true,
        })
        .returning();
      ids.modalidadeId = modalidade.id;

      const [gestor] = await db
        .insert(users)
        .values({
          username: `r22_gestor_${suffix}`,
          name: `Gestor R2.2 ${suffix}`,
          role: "gestor",
          secretariaId: secretaria.id,
          ativo: true,
        })
        .returning();
      ids.gestorId = gestor.id;

      const [classificacaoAtiva] = await db
        .insert(documentoClassificacoes)
        .values({
          codigo: `R22_PUBLICO_${suffix}`,
          nome: `Classificacao publica R2.2 ${suffix}`,
          ativo: true,
        })
        .returning();
      ids.classificacaoAtivaId = classificacaoAtiva.id;
      const [classificacaoInativa] = await db
        .insert(documentoClassificacoes)
        .values({
          codigo: `R22_INATIVA_${suffix}`,
          nome: `Classificacao inativa R2.2 ${suffix}`,
          ativo: false,
        })
        .returning();
      ids.classificacaoInativaId = classificacaoInativa.id;

      const createProcesso = async (
        name: string,
        overrides: Record<string, unknown> = {},
      ) => {
        const [processo] = await db
          .insert(processos)
          .values({
            numeroSirel: `R22-${name}-${suffix}`,
            numeroEdital: `ED-${suffix}`,
            anoReferencia: 2026,
            secretariaId: secretaria.id,
            modalidadeId: modalidade.id,
            objeto: `Objeto publico R2.2 ${name} ${suffix}`,
            escopoDisputa: "GLOBAL",
            tipoObjeto: "PRODUTO",
            tipoContratacao: "AQUISICAO",
            foraDoFluxo: false,
            ativo: true,
            publicado: true,
            dataPublicacao: new Date("2026-01-15T12:00:00.000Z"),
            criadoPor: gestor.id,
            ...overrides,
          })
          .returning();
        ids.processoIds.push(processo.id);
        return processo;
      };

      const processoPublico = await createProcesso("PUBLICO");
      const processoNaoPublicado = await createProcesso("INTERNO", {
        publicado: false,
      });
      await createProcesso("INATIVO", { ativo: false });

      const versaoUm = await createDocumento(db, ids, {
        processoId: processoPublico.id,
        titulo: `Edital publico versao 1 ${suffix}`,
        categoria: classificacaoAtiva.nome,
        classificacaoId: classificacaoAtiva.id,
        versao: 1,
        publico: true,
        statusPublicacao: "APROVADO",
        restritoA: [],
        dataReferencia: "2026-01-15",
        aprovadoPor: gestor.id,
        aprovadoEm: new Date(),
        criadoPor: gestor.id,
      });
      await db
        .update(documentos)
        .set({ documentoRaizId: versaoUm.id })
        .where(eq(documentos.id, versaoUm.id));

      const versaoDois = await createDocumento(db, ids, {
        processoId: processoPublico.id,
        titulo: `Edital publico versao 2 ${suffix}`,
        categoria: classificacaoAtiva.nome,
        classificacaoId: classificacaoAtiva.id,
        versao: 2,
        documentoRaizId: versaoUm.id,
        versaoAnteriorId: versaoUm.id,
        dataReferencia: "2026-01-15",
        criadoPor: gestor.id,
      });
      await createDocumento(db, ids, {
        processoId: processoPublico.id,
        titulo: `Documento restrito ${suffix}`,
        classificacaoId: classificacaoAtiva.id,
        publico: true,
        statusPublicacao: "APROVADO",
        restritoA: ["gestor"],
        criadoPor: gestor.id,
      });
      await createDocumento(db, ids, {
        processoId: processoPublico.id,
        titulo: `Documento em revisao ${suffix}`,
        classificacaoId: classificacaoAtiva.id,
        publico: true,
        statusPublicacao: "EM_REVISAO",
        restritoA: [],
        criadoPor: gestor.id,
      });
      const documentoProcessoInterno = await createDocumento(db, ids, {
        processoId: processoNaoPublicado.id,
        titulo: `Documento processo interno ${suffix}`,
        classificacaoId: classificacaoAtiva.id,
        publico: false,
        statusPublicacao: "RASCUNHO",
        restritoA: [],
        criadoPor: gestor.id,
      });

      const publico = createCaller(db);
      const processosPublicos = await publico.portalPublico.processos({
        pagina: 1,
        limite: 50,
        busca: suffix,
      });
      expect(processosPublicos.itens).toHaveLength(1);
      expect(processosPublicos.itens[0]).toMatchObject({
        numero: processoPublico.numeroSirel,
        edital: processoPublico.numeroEdital,
        secretaria: secretaria.nome,
        modalidade: modalidade.nome,
      });
      expect(processosPublicos.itens[0]).not.toHaveProperty("id");
      expect(processosPublicos.itens[0]).not.toHaveProperty("protocolo");

      const classificacoesPublicas =
        await publico.portalPublico.classificacoes();
      expect(classificacoesPublicas).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ codigo: classificacaoAtiva.codigo }),
        ]),
      );
      expect(classificacoesPublicas).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ codigo: classificacaoInativa.codigo }),
        ]),
      );

      const antesDaNovaVersao = await publico.portalPublico.documentos({
        pagina: 1,
        limite: 50,
        busca: suffix,
        classificacao: classificacaoAtiva.codigo,
        tipo: "EDITAL",
        ano: 2026,
      });
      expect(antesDaNovaVersao.itens.map((item) => item.titulo)).toEqual([
        versaoUm.titulo,
      ]);
      expect(antesDaNovaVersao.itens[0]).not.toHaveProperty("id");
      expect(antesDaNovaVersao.itens[0]?.downloadUrl).toMatch(
        /^\/api\/publico\/documentos\/v1\.[^/]+\/download$/,
      );

      const gestorCaller = createCaller(db, {
        id: gestor.id,
        username: gestor.username,
        name: gestor.name,
        email: gestor.email,
        role: gestor.role,
        secretariaId: gestor.secretariaId,
        sessionVersion: gestor.sessionVersion,
      });
      await gestorCaller.documentos.submitForReview({
        documentoId: versaoDois.id,
        justificativa: "Nova versao pronta para revisao publica.",
      });
      await gestorCaller.documentos.approvePublication({
        documentoId: versaoDois.id,
        justificativa: "Versao revisada e aprovada para o portal.",
      });

      const depoisDaAprovacao = await publico.portalPublico.documentos({
        pagina: 1,
        limite: 50,
        busca: suffix,
      });
      expect(depoisDaAprovacao.itens.map((item) => item.titulo)).toEqual([
        versaoDois.titulo,
      ]);

      await gestorCaller.documentos.submitForReview({
        documentoId: documentoProcessoInterno.id,
        justificativa: "Tentativa controlada de publicacao.",
      });
      await expect(
        gestorCaller.documentos.approvePublication({
          documentoId: documentoProcessoInterno.id,
          justificativa: "Processo ainda nao foi publicado.",
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });

      await gestorCaller.documentos.withdrawPublication({
        documentoId: versaoDois.id,
        justificativa: "Retirada de teste da versao mais recente.",
      });
      const depoisDaRetirada = await publico.portalPublico.documentos({
        pagina: 1,
        limite: 50,
        busca: suffix,
      });
      expect(depoisDaRetirada.itens.map((item) => item.titulo)).toEqual([
        versaoUm.titulo,
      ]);

      const auditoria = await db
        .select({ descricao: auditoriaLog.descricao, acao: auditoriaLog.acao })
        .from(auditoriaLog)
        .where(
          and(
            eq(auditoriaLog.tabela, "documentos"),
            eq(auditoriaLog.registroId, versaoDois.id),
          ),
        );
      expect(
        auditoria.filter((item) => item.acao === "UPDATE").length,
      ).toBeGreaterThanOrEqual(3);
    } finally {
      await limparDados(db, ids);
      if (previousSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = previousSecret;
    }
  });
});

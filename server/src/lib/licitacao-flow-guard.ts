import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import type { LicitacaoGuidedPhaseKey } from "@sirel/shared/licitacao-guided-flow";
import type { requireDb } from "../db/client.js";
import { documentos, itensProcesso, licitacaoChecklistExcecoes, licitacoes, licitantes, modalidades, processos, propostasLicitacao, recursosLicitacao } from "../db/schema.js";
import { getLicitacaoFlowEnforcement } from "./licitacao-flow-policy.js";
import { evaluateLicitacaoFlow, phaseForLicitacaoStatus, type LicitacaoFlowSnapshot } from "./licitacao-flow-state.js";

type Db = ReturnType<typeof requireDb>;
export async function loadLicitacaoFlow(db: Db, processoId: number, fields: Record<string, unknown> = {}) {
  const [base] = await db.select({ processo: processos, modalidade: modalidades }).from(processos)
    .leftJoin(modalidades, eq(modalidades.id, processos.modalidadeId)).where(eq(processos.id, processoId)).limit(1);
  if (!base) throw new TRPCError({ code: "NOT_FOUND", message: "Processo nao encontrado." });
  const [licitacao] = await db.select().from(licitacoes).where(eq(licitacoes.processoId, processoId)).limit(1);
  const [docs, exceptions, items] = await Promise.all([
    db.select({ categoria: documentos.categoria, arquivoUrl: documentos.arquivoUrl }).from(documentos).where(eq(documentos.processoId, processoId)),
    db.select().from(licitacaoChecklistExcecoes).where(eq(licitacaoChecklistExcecoes.processoId, processoId)),
    db.select({ id: itensProcesso.id }).from(itensProcesso).where(eq(itensProcesso.processoId, processoId)),
  ]);
  const bidders = licitacao ? await db.select().from(licitantes).where(eq(licitantes.licitacaoId, licitacao.id)) : [];
  const proposals = licitacao ? await db.select({ itemId: propostasLicitacao.itemId, licitanteId: propostasLicitacao.licitanteId, situacao: propostasLicitacao.situacao, classificacao: propostasLicitacao.classificacao })
    .from(propostasLicitacao).innerJoin(licitantes, eq(licitantes.id, propostasLicitacao.licitanteId)).where(eq(licitantes.licitacaoId, licitacao.id)) : [];
  const appeals = licitacao ? await db.select({ id: recursosLicitacao.id }).from(recursosLicitacao)
    .where(and(eq(recursosLicitacao.licitacaoId, licitacao.id), eq(recursosLicitacao.resultado, "PENDENTE"))) : [];
  const effectiveFields = { ...licitacao, condutorProcessoId: base.processo.condutorProcessoId, ...Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)) };
  const snapshot: LicitacaoFlowSnapshot = {
    context: { modalidadeCodigo: base.modalidade?.codigo, modoDisputa: base.processo.modoDisputa,
      exigeDeclaracaoNaoFracionamento: licitacao?.exigeDeclaracaoNaoFracionamento,
      publicarNoDou: licitacao?.publicarNoDou, publicarEmJornal: licitacao?.publicarEmJornal,
      fundamentoLegalInciso: licitacao?.fundamentoLegalInciso, inversaoFasesHabilitada: licitacao?.inversaoFasesHabilitada },
    publicado: base.processo.publicado, homologado: base.processo.homologado,
    status: licitacao?.statusLicitacao ?? "PREPARACAO", fields: effectiveFields,
    documents: docs, exceptions, bidders, proposals, itemIds: items.map((item) => item.id), pendingAppeals: appeals.length,
  };
  return { snapshot, state: evaluateLicitacaoFlow(snapshot, getLicitacaoFlowEnforcement()) };
}

export function assertLicitacaoFlowState(
  { snapshot, state }: Awaited<ReturnType<typeof loadLicitacaoFlow>>,
  action: "publish" | "homologar" | "phase" | "close",
  status?: string,
) {
  if (state.enforcement !== "BLOCKING") return;
  if (action === "phase" && ["CANCELADA", "FRACASSADA"].includes(status ?? "")) return;
  let target: LicitacaoGuidedPhaseKey | null = action === "close" ? "FECHAMENTO" : phaseForLicitacaoStatus(status ?? "", snapshot.context);
  if (action === "publish" || action === "homologar") {
    const blockers = state.actions[action].blockers;
    if (!blockers.length) return;
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: blockers.map((item) => `${item.phase}: ${item.label}`).join("; ") });
  }
  // Recursos excepcionais continuam registráveis sem inventar uma fase competitiva.
  if (status === "RECURSOS" && !state.phases.some((phase) => phase.key === "RECURSOS")) target = "CONTROLE_INTERNO";
  const index = state.phases.findIndex((phase) => phase.key === target);
  if (index < 0 || (status === "LANCES" && !state.phases.some((phase) => phase.key === "DISPUTA"))) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Fase nao aplicavel ao processo." });
  }
  const blockers = state.phases.slice(0, index).flatMap((phase) => phase.pending);
  if (blockers.length) throw new TRPCError({ code: "PRECONDITION_FAILED", message: blockers.map((item) => `${item.phase}: ${item.label}`).join("; ") });
}

export async function assertLicitacaoFlow(db: Db, processoId: number, action: "publish" | "homologar" | "phase" | "close", status?: string, fields?: Record<string, unknown>) {
  // A verificação não cria licitação, documentos nem movimentações.
  if (getLicitacaoFlowEnforcement() !== "BLOCKING") return;
  const flow = await loadLicitacaoFlow(db, processoId, fields);
  assertLicitacaoFlowState(flow, action, status);
  return flow.state;
}

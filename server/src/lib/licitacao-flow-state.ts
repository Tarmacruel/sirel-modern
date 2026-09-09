import {
  getLicitacaoDocumentRequirements, getLicitacaoGuidedPhaseSequence,
  hasLicitacaoDispute, licitacaoGuidedPhaseCatalog,
  type LicitacaoFlowContext, type LicitacaoFlowEnforcement, type LicitacaoGuidedPhaseKey,
} from "@sirel/shared/licitacao-guided-flow";

export interface FlowException {
  categoria: string;
  statusFlexivel?: string | null;
  naoAplicavel?: boolean | null;
  justificativa?: string | null;
  processoFisicoNumero?: string | null;
  localArquivamento?: string | null;
}

export function isCompletedFlowException(exception?: FlowException) {
  if (!exception?.justificativa?.trim()) return false;
  const status = exception.statusFlexivel || (exception.naoAplicavel ? "NAO_APLICAVEL" : "PADRAO");
  return status === "NAO_APLICAVEL" || (status === "CONCLUIDO_FISICO" &&
    Boolean(exception.processoFisicoNumero?.trim() && exception.localArquivamento?.trim()));
}

export interface LicitacaoFlowSnapshot {
  context: LicitacaoFlowContext;
  publicado: boolean;
  homologado: boolean;
  status: string;
  fields: Record<string, unknown>;
  documents: { categoria: string | null; arquivoUrl: string | null }[];
  exceptions: FlowException[];
  bidders: { id: number; statusHabilitacao: string; ativo?: boolean }[];
  proposals: { itemId: number; licitanteId: number; situacao: string; classificacao: number | null }[];
  itemIds: number[];
  pendingAppeals: number;
}

export type FlowPending = { category: string; label: string; detalhe: string; phase: LicitacaoGuidedPhaseKey };

export function phaseForLicitacaoStatus(status: string, context: LicitacaoFlowContext): LicitacaoGuidedPhaseKey | null {
  if (["RECEBIMENTO_PROPOSTAS", "ABERTURA_PROPOSTAS", "LANCES"].includes(status)) {
    return hasLicitacaoDispute(context) ? "DISPUTA" : "JULGAMENTO";
  }
  return Object.hasOwn(licitacaoGuidedPhaseCatalog, status) ? status as LicitacaoGuidedPhaseKey : null;
}

export function evaluateLicitacaoFlow(snapshot: LicitacaoFlowSnapshot, enforcement: LicitacaoFlowEnforcement) {
  const sequence = getLicitacaoGuidedPhaseSequence(snapshot.context);
  const phases = sequence.map((phase) => phase.key);
  const requirements = getLicitacaoDocumentRequirements(snapshot.context);
  const overrides = new Map(snapshot.exceptions.map((item) => [item.categoria, item]));
  const fieldCategories: Record<string, string> = {
    LICITACAO_DECRETO_COMISSAO: "comissaoId", LICITACAO_DECRETO_EQUIPE_APOIO: "equipeApoioId",
    LICITACAO_DECRETO_ORDENADOR_DESPESAS: "ordenadorDespesaId",
    LICITACAO_FUNDAMENTO_INEXIGIBILIDADE: "fundamentoLegalInciso",
    LICITACAO_PUBLIC_LINK_PNCP: "linkPncpPublico", LICITACAO_PUBLIC_LINK_BLL: "linkBllPublico",
  };
  const validUrl = (value: unknown) => {
    try { return ["http:", "https:"].includes(new URL(String(value)).protocol); } catch { return false; }
  };
  const evidence = requirements.map((requirement) => {
    const categories = [requirement.category, ...(requirement.aliases ?? [])];
    const document = snapshot.documents.some((item) => categories.includes(item.categoria ?? "") && Boolean(item.arquivoUrl?.trim()));
    const field = fieldCategories[requirement.category];
    const system = field ? (field.startsWith("link") ? validUrl(snapshot.fields[field]) : Boolean(snapshot.fields[field])) : false;
    const exception = isCompletedFlowException(overrides.get(requirement.category));
    const completed = requirement.completionStrategy === "CATALOG_SELECTION" ? system
      : field ? system : document || exception;
    return { ...requirement, concluido: completed, statusOrigem: completed ? system ? "Cadastro do sistema" : document ? "Documento anexado" : "Declaracao auditada" : "Pendente" };
  });
  const pending: FlowPending[] = evidence.filter((item) => item.obrigatorio && !item.concluido)
    .map((item) => ({ category: item.category, label: item.label, detalhe: item.description, phase: item.phase }));
  const add = (phase: LicitacaoGuidedPhaseKey, category: string, label: string) => pending.push({ phase, category, label, detalhe: label });
  if (!snapshot.fields.condutorProcessoId) add("PUBLICACAO", "publication-conductor", "Selecione o condutor do processo");
  if (!snapshot.fields.dataPublicacaoEdital) add("PUBLICACAO", "publication-date", "Informe a data de publicacao");
  if (!snapshot.publicado) add("PUBLICACAO", "publication-record", "Registre a publicacao do processo");

  const selected = snapshot.itemIds.map((id) => {
    const proposals = snapshot.proposals.filter((item) => item.itemId === id &&
      !["DESCLASSIFICADA", "INABILITADA"].includes(item.situacao) &&
      snapshot.bidders.some((bidder) => bidder.id === item.licitanteId && bidder.ativo !== false));
    return proposals.find((item) => item.situacao === "VENCEDORA") ?? proposals.find((item) => item.classificacao === 1);
  });
  if (!selected.length || selected.some((item) => !item)) add("JULGAMENTO", "judgment-ranking", "Defina a proposta selecionada para cada item do processo");
  const inverted = Boolean(snapshot.context.inversaoFasesHabilitada && hasLicitacaoDispute(snapshot.context));
  const qualification = inverted
    ? snapshot.bidders.some((bidder) => bidder.ativo !== false && bidder.statusHabilitacao === "HABILITADO")
    : selected.length > 0 && selected.every((proposal) => proposal && snapshot.bidders.some((bidder) =>
      bidder.id === proposal.licitanteId && bidder.ativo !== false && bidder.statusHabilitacao === "HABILITADO"));
  if (!qualification) add("HABILITACAO", "qualification-review", "Conclua a habilitacao favoravel do fornecedor selecionado");
  if (inverted && selected.some((proposal) => proposal && !snapshot.bidders.some((bidder) => bidder.id === proposal.licitanteId && bidder.statusHabilitacao === "HABILITADO"))) {
    add("JULGAMENTO", "judgment-qualified", "Selecione apenas propostas de fornecedores habilitados");
  }
  if (snapshot.pendingAppeals) add(phases.includes("RECURSOS") ? "RECURSOS" : "HOMOLOGACAO", "appeals", `${snapshot.pendingAppeals} recurso(s) sem decisao final`);
  if (!snapshot.homologado) add("HOMOLOGACAO", "homologation", "Registre a homologacao do processo");

  const recordedPhase = snapshot.homologado ? "FECHAMENTO" : !snapshot.publicado ? "PREPARACAO"
    : phaseForLicitacaoStatus(snapshot.status, snapshot.context) ?? "PREPARACAO";
  const currentPhase = phases.includes(recordedPhase) ? recordedPhase : "CONTROLE_INTERNO";
  const firstPending = phases.findIndex((phase) => pending.some((item) => item.phase === phase));
  const states = sequence.map((phase, index) => ({
    ...phase, pending: pending.filter((item) => item.phase === phase.key),
    accessible: enforcement === "ADVISORY" || index <= Math.max(phases.indexOf(currentPhase), firstPending < 0 ? phases.length - 1 : firstPending),
    complete: !pending.some((item) => item.phase === phase.key),
  }));
  const blockersFor = (target: LicitacaoGuidedPhaseKey, inclusive = false, ignored: string[] = []) => {
    const index = phases.indexOf(target);
    return pending.filter((item) => !ignored.includes(item.category) && (inclusive ? phases.indexOf(item.phase) <= index : phases.indexOf(item.phase) < index));
  };
  return {
    enforcement, currentPhase, phases: states, evidence,
    actions: {
      publish: { allowed: enforcement === "ADVISORY" || blockersFor("PUBLICACAO", true, ["publication-record"]).length === 0, blockers: blockersFor("PUBLICACAO", true, ["publication-record"]) },
      homologar: { allowed: enforcement === "ADVISORY" || blockersFor("HOMOLOGACAO", true, ["homologation"]).length === 0, blockers: blockersFor("HOMOLOGACAO", true, ["homologation"]) },
    },
  };
}

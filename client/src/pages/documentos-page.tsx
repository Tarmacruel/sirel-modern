import {
  Download,
  FileCog,
  FileStack,
  History,
  Search,
  ShieldCheck,
  Stamp,
  Upload,
} from "lucide-react";
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import type {
  AtaSessaoDiscoveryResult,
  AtaSessaoPreview,
} from "@sirel/shared/schemas/ata-sessao";
import { documentoAccessRoleOptions } from "@sirel/shared/schemas/documentos";

import { AtaSessaoProcessingOverlay } from "@/components/licitacao/ata-sessao-processing-overlay";
import { AtaSessaoSyncModal } from "@/components/licitacao/ata-sessao-sync-modal";
import { Modal } from "@/components/shared/modal";
import { SectionCard } from "@/components/shared/section-card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import {
  applyAtaSessaoSyncPreview,
  createAtaSessaoPreviewFromDiscovery,
  deleteProcessoDocumento,
  discoverAtaSessaoProcess,
  isPdfFile,
  processAtaSessaoDocumento,
  resolveServerAssetUrl,
  uploadProcessoDocumento,
  type AtaSessaoEstimatedValueReconciliation,
  type AtaSessaoStandaloneProcessResult,
  type DocumentoTipo,
  type UploadProcessoDocumentoResult,
} from "@/lib/document-upload";
import { formatShortDateBR, formatShortDateTimeBR } from "@/lib/formatters";
import { trpc } from "@/lib/trpc";

const pillars = [
  {
    title: "Versionamento",
    icon: FileStack,
    body: "Cada documento mantém processo, tipo, versão, data de referência e vínculo com o acervo.",
  },
  {
    title: "Busca operacional",
    icon: Search,
    body: "Filtros por processo, tipo, categoria, publicidade e palavras-chave para localizar rápido o documento certo.",
  },
  {
    title: "Controle de acesso",
    icon: ShieldCheck,
    body: "Metadados de publicidade e restrição por perfil já preparados para operação interna e portal público.",
  },
  {
    title: "Padrão institucional",
    icon: Stamp,
    body: "O módulo centraliza documentos gerados pelo sistema e anexos externos em um único acervo operacional.",
  },
];

const documentoTipos: DocumentoTipo[] = [
  "DFD",
  "ETP",
  "TR",
  "EDITAL",
  "COMUNICACAO_INTERNA",
  "RESULTADO",
  "CONTRATO",
  "OUTRO",
];
type DocumentoAccessRole = (typeof documentoAccessRoleOptions)[number];
const accessRoles =
  documentoAccessRoleOptions as readonly DocumentoAccessRole[];

type DocumentoPublicacaoStatus =
  | "RASCUNHO"
  | "EM_REVISAO"
  | "APROVADO"
  | "REJEITADO"
  | "RETIRADO";

const publicacaoStatusLabels: Record<DocumentoPublicacaoStatus, string> = {
  RASCUNHO: "Rascunho",
  EM_REVISAO: "Em revisão",
  APROVADO: "Aprovado",
  REJEITADO: "Rejeitado",
  RETIRADO: "Retirado do portal",
};

const publicacaoStatusVariants: Record<
  DocumentoPublicacaoStatus,
  "info" | "success" | "warning" | "error"
> = {
  RASCUNHO: "info",
  EM_REVISAO: "warning",
  APROVADO: "success",
  REJEITADO: "error",
  RETIRADO: "warning",
};

function getPublicacaoStatus(value: unknown): DocumentoPublicacaoStatus {
  switch (value) {
    case "EM_REVISAO":
    case "APROVADO":
    case "REJEITADO":
    case "RETIRADO":
    case "RASCUNHO":
      return value;
    default:
      return "RASCUNHO";
  }
}

function getDocumentoPublicacaoStatus(documento: {
  statusPublicacao?: unknown;
}) {
  return getPublicacaoStatus(documento.statusPublicacao);
}

function getDocumentoPublicacaoInfo(documento: unknown) {
  const value = documento as {
    statusPublicacao?: unknown;
    aprovadoPor?: number | null;
    aprovadoEm?: Date | string | null;
    justificativa?: string | null;
  };
  return {
    status: getPublicacaoStatus(value.statusPublicacao),
    aprovadoPor: value.aprovadoPor ?? null,
    aprovadoEm: value.aprovadoEm ?? null,
    justificativa: value.justificativa?.trim() || null,
  };
}

const initialUploadForm = {
  processoId: "",
  documentoAnteriorId: "",
  tipo: "OUTRO" as DocumentoTipo,
  titulo: "",
  categoria: "",
  classificacaoId: "",
  descricao: "",
  dataReferencia: "",
  palavrasChave: "",
  arquivo: null as File | null,
};

const initialMetadataForm = {
  titulo: "",
  categoria: "",
  classificacaoId: "",
  descricao: "",
  dataReferencia: "",
  palavrasChave: "",
};

const initialClassificacaoForm = {
  id: null as number | null,
  codigo: "",
  nome: "",
  descricao: "",
  ativo: true,
};

const initialAccessForm = {
  publico: false,
  restritoA: [] as DocumentoAccessRole[],
};

function parseKeywords(value: string) {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function sortLotNumbers(lots: number[]) {
  return Array.from(new Set(lots)).sort((left, right) => left - right);
}

function EstimatedValueCoverage({
  reconciliation,
}: {
  reconciliation: AtaSessaoEstimatedValueReconciliation | null | undefined;
}) {
  if (!reconciliation) {
    return (
      <Alert variant="warning" title="Cobertura dos valores indisponível">
        O processamento terminou, mas não informou a cobertura da conciliação
        com a Solicitação de Despesa.
      </Alert>
    );
  }

  const isComplete =
    reconciliation.fullyMatchedLots === reconciliation.totalFailedLots &&
    reconciliation.partiallyMatchedLots === 0 &&
    reconciliation.unmatchedLots.length === 0 &&
    reconciliation.ambiguousLots.length === 0 &&
    reconciliation.matchedItems === reconciliation.totalFailedItems &&
    reconciliation.ambiguousItems === 0 &&
    reconciliation.unmatchedItems === 0;
  const sdLabel = reconciliation.sdNumber
    ? `SD ${reconciliation.sdNumber}`
    : "SD sem número identificado";
  const unmatchedLots = sortLotNumbers(reconciliation.unmatchedLots);
  const ambiguousLots = sortLotNumbers(reconciliation.ambiguousLots);

  return (
    <Alert
      variant={isComplete ? "success" : "warning"}
      title={
        isComplete
          ? "Cobertura completa dos valores estimados"
          : "Cobertura parcial dos valores estimados"
      }
    >
      <div className="space-y-2">
        <p>
          {reconciliation.totalFailedLots === 0
            ? `${sdLabel} lida; não há lotes malsucedidos para conciliar.`
            : `${reconciliation.fullyMatchedLots} de ${reconciliation.totalFailedLots} lotes e ${reconciliation.matchedItems} de ${reconciliation.totalFailedItems} itens foram conciliados com a ${sdLabel}.`}
        </p>

        {!isComplete ? (
          <ul className="list-disc space-y-1 pl-5">
            {reconciliation.partiallyMatchedLots > 0 ? (
              <li>
                Lotes parcialmente conciliados:{" "}
                {reconciliation.partiallyMatchedLots}
              </li>
            ) : null}
            {unmatchedLots.length > 0 ? (
              <li>
                Lotes com itens sem correspondência: {unmatchedLots.join(", ")}
              </li>
            ) : null}
            {ambiguousLots.length > 0 ? (
              <li>
                Lotes com correspondência ambígua: {ambiguousLots.join(", ")}
              </li>
            ) : null}
            {reconciliation.unmatchedItems > 0 ? (
              <li>
                Itens sem correspondência: {reconciliation.unmatchedItems}
              </li>
            ) : null}
            {reconciliation.ambiguousItems > 0 ? (
              <li>Itens ambíguos: {reconciliation.ambiguousItems}</li>
            ) : null}
          </ul>
        ) : null}

        {reconciliation.warnings.length > 0 ? (
          <div className="border-t border-current/15 pt-2">
            <p className="font-semibold">Avisos da conciliação</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {reconciliation.warnings.map((warning, index) => (
                <li key={`${index}-${warning}`}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Alert>
  );
}

export function DocumentosPage() {
  const utils = trpc.useUtils();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [tipo, setTipo] = useState<"" | DocumentoTipo>("");
  const [search, setSearch] = useState("");
  const [categoria, setCategoria] = useState("");
  const [classificacaoFilter, setClassificacaoFilter] = useState("");
  const [publicoFilter, setPublicoFilter] = useState("todos");
  const [selectedDocumentId, setSelectedDocumentId] = useState<number | null>(
    null,
  );
  const [uploadForm, setUploadForm] = useState(initialUploadForm);
  const [metadataForm, setMetadataForm] = useState(initialMetadataForm);
  const [classificacaoForm, setClassificacaoForm] = useState(
    initialClassificacaoForm,
  );
  const [classificacaoModalOpen, setClassificacaoModalOpen] = useState(false);
  const [classificacaoFeedback, setClassificacaoFeedback] = useState<
    string | null
  >(null);
  const [classificacaoError, setClassificacaoError] = useState<string | null>(
    null,
  );
  const [accessForm, setAccessForm] = useState(initialAccessForm);
  const [workflowJustificativa, setWorkflowJustificativa] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ataSyncEnabled, setAtaSyncEnabled] = useState(false);
  const [ataDiscovery, setAtaDiscovery] =
    useState<AtaSessaoDiscoveryResult | null>(null);
  const [ataDiscoveryLoading, setAtaDiscoveryLoading] = useState(false);
  const [ataDiscoverySearch, setAtaDiscoverySearch] = useState("");
  const [ataDiscoverySelectedProcessId, setAtaDiscoverySelectedProcessId] =
    useState<number | null>(null);
  const [ataSyncPreview, setAtaSyncPreview] = useState<AtaSessaoPreview | null>(
    null,
  );
  const [ataSyncApplyLoading, setAtaSyncApplyLoading] = useState(false);
  const [ataFile, setAtaFile] = useState<File | null>(null);
  const [sdFile, setSdFile] = useState<File | null>(null);
  const [ataInputResetKey, setAtaInputResetKey] = useState(0);
  const [ataFeedback, setAtaFeedback] = useState<string | null>(null);
  const [ataError, setAtaError] = useState<string | null>(null);
  const [ataProcessing, setAtaProcessing] = useState(false);
  const [ataResult, setAtaResult] =
    useState<AtaSessaoStandaloneProcessResult | null>(null);
  const deferredSearch = useDeferredValue(search.trim());
  const deferredCategory = useDeferredValue(categoria.trim());
  const deferredAtaDiscoverySearch = useDeferredValue(
    ataDiscoverySearch.trim(),
  );

  const summaryQuery = trpc.documentos.summary.useQuery(undefined, {
    retry: false,
  });
  const processOptionsQuery = trpc.documentos.processOptions.useQuery(
    undefined,
    { retry: false },
  );
  const classificacaoOptionsQuery =
    trpc.documentos.classificacoes.options.useQuery(undefined, {
      retry: false,
    });
  const meQuery = trpc.auth.me.useQuery(undefined, { retry: false });
  const canManageClassificacoes = ["admin", "gestor"].includes(
    meQuery.data?.user.role ?? "",
  );
  const classificacaoListQuery = trpc.documentos.classificacoes.list.useQuery(
    { page: 1, pageSize: 100 },
    { retry: false, enabled: canManageClassificacoes },
  );
  const ataDiscoveryProcessOptionsQuery =
    trpc.documentos.processOptions.useQuery(
      { search: deferredAtaDiscoverySearch || undefined },
      { retry: false, enabled: ataDiscovery !== null },
    );
  const filters = useMemo(
    () => ({
      page,
      pageSize,
      tipo: tipo || undefined,
      search: deferredSearch || undefined,
      categoria: deferredCategory || undefined,
      classificacaoId: classificacaoFilter
        ? Number(classificacaoFilter)
        : undefined,
      publico:
        publicoFilter === "todos" ? undefined : publicoFilter === "publicos",
    }),
    [
      classificacaoFilter,
      deferredCategory,
      deferredSearch,
      page,
      pageSize,
      publicoFilter,
      tipo,
    ],
  );
  const listQuery = trpc.documentos.list.useQuery(filters, {
    retry: false,
    placeholderData: (previous) => previous,
  });
  const detailQuery = trpc.documentos.detail.useQuery(
    { documentoId: selectedDocumentId ?? 0 },
    { enabled: Boolean(selectedDocumentId), retry: false },
  );
  const documentAuditQuery = trpc.auditoria.list.useQuery(
    {
      page: 1,
      pageSize: 12,
      documentoId: selectedDocumentId ?? undefined,
    },
    {
      enabled: Boolean(selectedDocumentId),
      retry: false,
    },
  );
  const rows = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const selectedDocumentPublication = detailQuery.data
    ? getDocumentoPublicacaoInfo(detailQuery.data)
    : null;

  useEffect(() => {
    if (!rows.length) {
      setSelectedDocumentId(null);
      return;
    }
    if (
      !selectedDocumentId ||
      !rows.some((item) => item.id === selectedDocumentId)
    ) {
      setSelectedDocumentId(rows[0].id);
    }
  }, [rows, selectedDocumentId]);

  useEffect(() => {
    if (!detailQuery.data) return;
    setMetadataForm({
      titulo: detailQuery.data.titulo,
      categoria: detailQuery.data.categoria ?? "",
      classificacaoId: detailQuery.data.classificacaoId
        ? String(detailQuery.data.classificacaoId)
        : "",
      descricao: detailQuery.data.descricao ?? "",
      dataReferencia: detailQuery.data.dataReferencia
        ? String(detailQuery.data.dataReferencia).slice(0, 10)
        : "",
      palavrasChave: Array.isArray(detailQuery.data.palavrasChave)
        ? detailQuery.data.palavrasChave.join(", ")
        : "",
    });
    setAccessForm({
      publico: detailQuery.data.publico,
      restritoA: Array.isArray(detailQuery.data.restritoA)
        ? detailQuery.data.restritoA.filter(
            (item): item is DocumentoAccessRole =>
              accessRoles.includes(item as DocumentoAccessRole),
          )
        : [],
    });
    setWorkflowJustificativa("");
  }, [detailQuery.data]);

  const updateMetadataMutation = trpc.documentos.updateMetadata.useMutation({
    onSuccess: async () => {
      await handleDocumentMutationSuccess(
        "Metadados do documento atualizados. Um documento aprovado pode exigir nova revisão.",
      );
    },
    onError: (mutationError) => {
      handleDocumentMutationError(mutationError);
    },
  });

  const updateAccessMutation = trpc.documentos.updateAccess.useMutation({
    onSuccess: async () => {
      await handleDocumentMutationSuccess("Configuração de acesso atualizada.");
    },
    onError: handleDocumentMutationError,
  });

  const submitForReviewMutation = trpc.documentos.submitForReview.useMutation({
    onSuccess: async () => {
      await handleDocumentMutationSuccess(
        "Documento enviado para revisão de publicação.",
      );
    },
    onError: handleDocumentMutationError,
  });

  const approvePublicationMutation =
    trpc.documentos.approvePublication.useMutation({
      onSuccess: async () => {
        await handleDocumentMutationSuccess(
          "Documento aprovado para publicação no portal.",
        );
      },
      onError: handleDocumentMutationError,
    });

  const rejectPublicationMutation =
    trpc.documentos.rejectPublication.useMutation({
      onSuccess: async () => {
        await handleDocumentMutationSuccess(
          "Publicação do documento rejeitada.",
        );
      },
      onError: handleDocumentMutationError,
    });

  const withdrawPublicationMutation =
    trpc.documentos.withdrawPublication.useMutation({
      onSuccess: async () => {
        await handleDocumentMutationSuccess(
          "Documento retirado do portal público.",
        );
      },
      onError: handleDocumentMutationError,
    });

  const saveClassificacaoMutation =
    trpc.documentos.classificacoes.save.useMutation({
      onSuccess: async () => {
        await refreshClassificacaoQueries();
        setClassificacaoFeedback(
          classificacaoForm.id
            ? "Classificação institucional atualizada."
            : "Classificação institucional criada.",
        );
        setClassificacaoError(null);
        setClassificacaoForm(initialClassificacaoForm);
        setClassificacaoModalOpen(false);
      },
      onError: (mutationError) => {
        setClassificacaoFeedback(null);
        setClassificacaoError(mutationError.message);
      },
    });

  const archiveClassificacaoMutation =
    trpc.documentos.classificacoes.archive.useMutation({
      onSuccess: async () => {
        await refreshClassificacaoQueries();
        setClassificacaoFeedback("Classificação institucional arquivada.");
        setClassificacaoError(null);
      },
      onError: (mutationError) => {
        setClassificacaoFeedback(null);
        setClassificacaoError(mutationError.message);
      },
    });

  const workflowMutationPending =
    updateAccessMutation.isPending ||
    submitForReviewMutation.isPending ||
    approvePublicationMutation.isPending ||
    rejectPublicationMutation.isPending ||
    withdrawPublicationMutation.isPending;

  async function refreshDocumentQueries() {
    await Promise.all([
      utils.documentos.list.invalidate(),
      utils.documentos.detail.invalidate(),
      utils.documentos.summary.invalidate(),
      utils.documentos.listByProcesso.invalidate(),
      utils.auditoria.list.invalidate(),
      utils.auditoria.summary.invalidate(),
    ]);
  }

  async function refreshClassificacaoQueries() {
    await Promise.all([
      utils.documentos.classificacoes.list.invalidate(),
      utils.documentos.classificacoes.options.invalidate(),
      utils.documentos.list.invalidate(),
      utils.documentos.detail.invalidate(),
      utils.auditoria.list.invalidate(),
      utils.auditoria.summary.invalidate(),
    ]);
  }

  async function handleDocumentMutationSuccess(message: string) {
    await refreshDocumentQueries();
    setWorkflowJustificativa("");
    setFeedback(message);
    setError(null);
  }

  function handleDocumentMutationError(mutationError: { message: string }) {
    setFeedback(null);
    setError(mutationError.message);
  }

  function getWorkflowJustificativa() {
    const justificativa = workflowJustificativa.trim();
    if (justificativa) return justificativa;

    setFeedback(null);
    setError("Informe uma justificativa para registrar esta decisão.");
    return null;
  }

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    setError(null);

    if (!uploadForm.titulo.trim() || !uploadForm.arquivo) {
      setError("Informe título e arquivo para anexar o documento.");
      return;
    }

    try {
      if (ataSyncEnabled) {
        if (!uploadForm.arquivo.name.toLowerCase().endsWith(".pdf")) {
          setError(
            "Envie um PDF de ata de sessão para iniciar a atualização da licitação.",
          );
          return;
        }
        setAtaDiscoveryLoading(true);
        const discovery = await discoverAtaSessaoProcess({
          arquivo: uploadForm.arquivo,
          providedProcessoId: uploadForm.processoId
            ? Number(uploadForm.processoId)
            : undefined,
        });
        setAtaDiscovery(discovery);
        setAtaDiscoverySelectedProcessId(
          discovery.suggestedProcesses[0]?.processId ??
            (uploadForm.processoId ? Number(uploadForm.processoId) : null),
        );
        setAtaDiscoverySearch("");
        setFeedback(
          "Ata lida com sucesso. Confirme o processo sugerido para continuar.",
        );
        return;
      }

      if (!uploadForm.processoId) {
        setError("Selecione um processo para anexar o documento.");
        return;
      }

      await uploadProcessoDocumento({
        processoId: Number(uploadForm.processoId),
        documentoAnteriorId: uploadForm.documentoAnteriorId
          ? Number(uploadForm.documentoAnteriorId)
          : undefined,
        tipo: uploadForm.tipo,
        titulo: uploadForm.titulo,
        categoria: uploadForm.categoria || undefined,
        classificacaoId: uploadForm.classificacaoId
          ? Number(uploadForm.classificacaoId)
          : undefined,
        descricao: uploadForm.descricao || undefined,
        dataReferencia: uploadForm.dataReferencia || undefined,
        palavrasChave: parseKeywords(uploadForm.palavrasChave),
        arquivo: uploadForm.arquivo,
      });
      await Promise.all([
        utils.documentos.list.invalidate(),
        utils.documentos.summary.invalidate(),
        utils.documentos.processOptions.invalidate(),
        utils.auditoria.list.invalidate(),
        utils.auditoria.summary.invalidate(),
      ]);
      setUploadForm(initialUploadForm);
      setFeedback("Documento anexado ao acervo com sucesso.");
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Falha ao enviar o documento.",
      );
    } finally {
      setAtaDiscoveryLoading(false);
    }
  }

  async function handleCreatePreviewFromDiscovery() {
    if (!ataDiscovery || !ataDiscoverySelectedProcessId) {
      setError(
        "Selecione o processo que deve receber a ata antes de continuar.",
      );
      return;
    }

    try {
      setAtaDiscoveryLoading(true);
      const preview = await createAtaSessaoPreviewFromDiscovery({
        discoveryId: ataDiscovery.discoveryId,
        processoId: ataDiscoverySelectedProcessId,
        selectionMode: ataDiscovery.suggestedProcesses.some(
          (item) => item.processId === ataDiscoverySelectedProcessId,
        )
          ? "SUGERIDO"
          : "MANUAL",
        document: {
          tipo: uploadForm.tipo,
          categoria: uploadForm.categoria || undefined,
          titulo: uploadForm.titulo,
          descricao: uploadForm.descricao || undefined,
          dataReferencia: uploadForm.dataReferencia || undefined,
          palavrasChave: parseKeywords(uploadForm.palavrasChave),
        },
      });
      await Promise.all([
        utils.documentos.list.invalidate(),
        utils.documentos.summary.invalidate(),
        utils.documentos.processOptions.invalidate(),
      ]);
      setAtaDiscovery(null);
      setAtaSyncPreview(preview);
      setUploadForm(initialUploadForm);
      setFeedback(
        "Documento criado no processo. Revise a prévia e baixe os relatórios desta leitura antes de aplicar a sincronização.",
      );
    } catch (previewError) {
      setError(
        previewError instanceof Error
          ? previewError.message
          : "Falha ao montar a prévia da sincronização da ata.",
      );
    } finally {
      setAtaDiscoveryLoading(false);
    }
  }

  async function handleApplyAtaSync() {
    if (!ataSyncPreview) return;
    try {
      setAtaSyncApplyLoading(true);
      await applyAtaSessaoSyncPreview(ataSyncPreview.runId);
      await Promise.all([
        utils.documentos.list.invalidate(),
        utils.documentos.summary.invalidate(),
        utils.documentos.detail.invalidate(),
        utils.auditoria.list.invalidate(),
        utils.auditoria.summary.invalidate(),
      ]);
      setAtaSyncPreview(null);
      setAtaSyncEnabled(false);
      setFeedback(
        "Ata aplicada com sucesso. As informações do processo foram atualizadas.",
      );
      setError(null);
    } catch (applyError) {
      setError(
        applyError instanceof Error
          ? applyError.message
          : "Falha ao aplicar a sincronização da ata.",
      );
    } finally {
      setAtaSyncApplyLoading(false);
    }
  }

  async function handleUpdateMetadata(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedDocumentId) return;
    setFeedback(null);
    setError(null);

    try {
      await updateMetadataMutation.mutateAsync({
        documentoId: selectedDocumentId,
        titulo: metadataForm.titulo,
        categoria: metadataForm.categoria || undefined,
        classificacaoId: metadataForm.classificacaoId
          ? Number(metadataForm.classificacaoId)
          : null,
        descricao: metadataForm.descricao || undefined,
        dataReferencia: metadataForm.dataReferencia || undefined,
        palavrasChave: parseKeywords(metadataForm.palavrasChave),
      });
    } catch {
      // A mensagem da mutação já é exibida no painel do acervo.
    }
  }

  async function handleUpdateAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedDocumentId) return;
    const justificativa = getWorkflowJustificativa();
    if (!justificativa) return;
    if (accessForm.publico && accessForm.restritoA.length > 0) {
      setFeedback(null);
      setError(
        "Um documento público não pode manter restrição por perfil interno.",
      );
      return;
    }

    setFeedback(null);
    setError(null);
    try {
      await updateAccessMutation.mutateAsync({
        documentoId: selectedDocumentId,
        publico: accessForm.publico,
        restritoA: accessForm.restritoA,
        justificativa,
      });
    } catch {
      // A mensagem da mutação já é exibida no painel do acervo.
    }
  }

  async function handlePublicationWorkflow(
    action: "submit" | "approve" | "reject" | "withdraw",
  ) {
    if (!selectedDocumentId) return;
    const justificativa = getWorkflowJustificativa();
    if (!justificativa) return;

    setFeedback(null);
    setError(null);
    try {
      if (action === "submit") {
        await submitForReviewMutation.mutateAsync({
          documentoId: selectedDocumentId,
          justificativa,
        });
        return;
      }
      if (action === "approve") {
        await approvePublicationMutation.mutateAsync({
          documentoId: selectedDocumentId,
          justificativa,
        });
        return;
      }
      if (action === "reject") {
        await rejectPublicationMutation.mutateAsync({
          documentoId: selectedDocumentId,
          justificativa,
        });
        return;
      }
      await withdrawPublicationMutation.mutateAsync({
        documentoId: selectedDocumentId,
        justificativa,
      });
    } catch {
      // A mensagem da mutação já é exibida no painel do acervo.
    }
  }

  async function handleDeleteSelected() {
    if (!selectedDocumentId || !detailQuery.data) return;
    if (
      !window.confirm(`Deseja remover o documento ${detailQuery.data.titulo}?`)
    )
      return;

    try {
      await deleteProcessoDocumento(selectedDocumentId);
      await Promise.all([
        utils.documentos.list.invalidate(),
        utils.documentos.summary.invalidate(),
        utils.documentos.detail.invalidate(),
        utils.auditoria.list.invalidate(),
        utils.auditoria.summary.invalidate(),
      ]);
      setSelectedDocumentId(null);
      setFeedback("Documento removido do acervo.");
      setError(null);
    } catch (deleteError) {
      setFeedback(null);
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Falha ao remover o documento.",
      );
    }
  }

  function handleStartNewVersion() {
    if (!detailQuery.data) return;

    setAtaSyncEnabled(false);
    setUploadForm({
      ...initialUploadForm,
      processoId: String(detailQuery.data.processoId),
      documentoAnteriorId: String(detailQuery.data.id),
      tipo: detailQuery.data.tipo,
      titulo: detailQuery.data.titulo,
      categoria: detailQuery.data.categoria ?? "",
      classificacaoId: detailQuery.data.classificacaoId
        ? String(detailQuery.data.classificacaoId)
        : "",
      descricao: detailQuery.data.descricao ?? "",
      dataReferencia: detailQuery.data.dataReferencia
        ? String(detailQuery.data.dataReferencia).slice(0, 10)
        : "",
      palavrasChave: Array.isArray(detailQuery.data.palavrasChave)
        ? detailQuery.data.palavrasChave.join(", ")
        : "",
    });
    setFeedback(
      `Nova versão preparada a partir de ${detailQuery.data.titulo}. Selecione o arquivo atualizado para continuar.`,
    );
    setError(null);
  }

  function openClassificacaoEditor(item?: {
    id: number;
    codigo: string;
    nome: string;
    descricao: string | null;
    ativo: boolean;
  }) {
    setClassificacaoForm(
      item
        ? {
            id: item.id,
            codigo: item.codigo,
            nome: item.nome,
            descricao: item.descricao ?? "",
            ativo: item.ativo,
          }
        : initialClassificacaoForm,
    );
    setClassificacaoFeedback(null);
    setClassificacaoError(null);
    setClassificacaoModalOpen(true);
  }

  async function handleSaveClassificacao(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setClassificacaoFeedback(null);
    setClassificacaoError(null);

    try {
      await saveClassificacaoMutation.mutateAsync({
        id: classificacaoForm.id ?? undefined,
        codigo: classificacaoForm.codigo,
        nome: classificacaoForm.nome,
        descricao: classificacaoForm.descricao || undefined,
        ativo: classificacaoForm.ativo,
      });
    } catch {
      // A mensagem da mutação já fica visível no catálogo.
    }
  }

  async function handleArchiveClassificacao(item: {
    id: number;
    codigo: string;
    nome: string;
  }) {
    if (
      !window.confirm(
        `Arquivar a classificação ${item.codigo} — ${item.nome}? Ela não poderá mais ser selecionada em novos documentos.`,
      )
    ) {
      return;
    }

    setClassificacaoFeedback(null);
    setClassificacaoError(null);
    try {
      await archiveClassificacaoMutation.mutateAsync({ id: item.id });
    } catch {
      // A mensagem da mutação já fica visível no catálogo.
    }
  }

  async function handleProcessAta(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAtaFeedback(null);
    setAtaError(null);
    setAtaResult(null);

    if (!ataFile && !sdFile) {
      setAtaError(
        "Selecione os PDFs da ata e da Solicitação de Despesa para gerar os relatórios avulsos.",
      );
      return;
    }

    if (!ataFile) {
      setAtaError("Selecione o PDF da ata para gerar os relatórios avulsos.");
      return;
    }

    if (!sdFile) {
      setAtaError(
        "Selecione o PDF da Solicitação de Despesa para informar os valores estimados.",
      );
      return;
    }

    if (!isPdfFile(ataFile)) {
      setAtaError("Envie um arquivo PDF de ata de sessão.");
      return;
    }

    if (!isPdfFile(sdFile)) {
      setAtaError("Envie um arquivo PDF de Solicitação de Despesa.");
      return;
    }

    try {
      setAtaProcessing(true);
      const result = await processAtaSessaoDocumento(ataFile, sdFile);
      setAtaResult(result);
      setAtaFeedback(
        "Ata e SD processadas com sucesso. Os relatórios foram gerados sem vínculo com o acervo do processo.",
      );
      setAtaFile(null);
      setSdFile(null);
      setAtaInputResetKey((current) => current + 1);
    } catch (processingError) {
      setAtaFeedback(null);
      setAtaError(
        processingError instanceof Error
          ? processingError.message
          : "Falha ao processar a ata de sessão.",
      );
    } finally {
      setAtaProcessing(false);
    }
  }

  return (
    <SectionCard
      title="Central de Documentos"
      description="Acervo único da SIREL com metadados, filtros operacionais, upload local e edição do documento selecionado."
    >
      <Tabs
        items={[
          {
            value: "visao-geral",
            label: "Visão geral",
            content: (
              <div className="space-y-4">
                <div className="grid gap-4 lg:grid-cols-4">
                  {pillars.map((pillar) => {
                    const Icon = pillar.icon;
                    return (
                      <article
                        key={pillar.title}
                        className="rounded-3xl border border-slate-200 bg-slate-50 p-5"
                      >
                        <div className="inline-flex rounded-2xl bg-slate-900 p-3 text-white">
                          <Icon className="h-5 w-5" />
                        </div>
                        <h4 className="mt-4 text-lg font-black text-slate-950">
                          {pillar.title}
                        </h4>
                        <p className="mt-2 text-sm leading-6 text-slate-600">
                          {pillar.body}
                        </p>
                      </article>
                    );
                  })}
                </div>
                {summaryQuery.error ? (
                  <Alert variant="error">
                    Falha ao consultar o resumo documental.
                  </Alert>
                ) : null}
                <div className="grid gap-4 md:grid-cols-4">
                  {[
                    { label: "Documentos", value: summaryQuery.data?.total },
                    {
                      label: "Processos com acervo",
                      value: summaryQuery.data?.processosComDocumentos,
                    },
                    {
                      label: "Documentos públicos",
                      value: summaryQuery.data?.publicos,
                    },
                    {
                      label: "Pendentes de metadados",
                      value: summaryQuery.data?.semMetadados,
                    },
                  ].map((item) => (
                    <article
                      key={item.label}
                      className="rounded-3xl border border-slate-200 bg-white px-4 py-4"
                    >
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                        {item.label}
                      </p>
                      {summaryQuery.isLoading ? (
                        <Skeleton className="mt-3 h-10 w-20" />
                      ) : (
                        <p className="mt-3 text-3xl font-black text-slate-950">
                          {item.value ?? 0}
                        </p>
                      )}
                    </article>
                  ))}
                </div>
                {canManageClassificacoes ? (
                  <div className="rounded-3xl border border-slate-200 bg-white p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                          Catálogo institucional
                        </p>
                        <h3 className="mt-1 text-xl font-black text-slate-950">
                          Classificações de documentos
                        </h3>
                        <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
                          Mantenha os códigos institucionais usados nos
                          metadados, na busca e no portal público. Arquivar não
                          altera documentos já vinculados.
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => openClassificacaoEditor()}
                      >
                        Nova classificação
                      </Button>
                    </div>

                    {classificacaoFeedback ? (
                      <Alert className="mt-4" variant="success">
                        {classificacaoFeedback}
                      </Alert>
                    ) : null}
                    {classificacaoError ? (
                      <Alert className="mt-4" variant="error">
                        {classificacaoError}
                      </Alert>
                    ) : null}
                    {classificacaoListQuery.isLoading ? (
                      <Skeleton className="mt-4 h-36 w-full" />
                    ) : classificacaoListQuery.error ? (
                      <Alert className="mt-4" variant="error">
                        Não foi possível consultar o catálogo institucional.
                      </Alert>
                    ) : (
                      <div className="mt-4 divide-y divide-slate-200 rounded-2xl border border-slate-200">
                        {classificacaoListQuery.data?.items.map((item) => (
                          <div
                            key={item.id}
                            className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between"
                          >
                            <div>
                              <p className="font-semibold text-slate-900">
                                {item.codigo} — {item.nome}
                              </p>
                              <p className="mt-1 text-sm text-slate-500">
                                {item.descricao || "Sem descrição adicional."}
                                {!item.ativo ? " · Arquivada" : ""}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => openClassificacaoEditor(item)}
                              >
                                Editar
                              </Button>
                              {item.ativo ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={
                                    archiveClassificacaoMutation.isPending
                                  }
                                  onClick={() =>
                                    void handleArchiveClassificacao(item)
                                  }
                                >
                                  Arquivar
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        ))}
                        {!classificacaoListQuery.data?.items.length ? (
                          <p className="px-4 py-6 text-sm text-slate-600">
                            Nenhuma classificação cadastrada.
                          </p>
                        ) : null}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            ),
          },
          {
            value: "ata-sessao",
            label: "Ata de sessão",
            content: (
              <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
                <div className="space-y-4">
                  {ataFeedback ? (
                    <div role="status" aria-live="polite" aria-atomic="true">
                      <Alert variant="success">{ataFeedback}</Alert>
                    </div>
                  ) : null}
                  {ataError ? (
                    <div role="alert" aria-live="assertive" aria-atomic="true">
                      <Alert variant="error">{ataError}</Alert>
                    </div>
                  ) : null}

                  <SectionCard
                    title="Processamento avulso de Ata + SD"
                    description="Envie a Ata BLL e a Solicitação de Despesa em PDF para gerar os relatórios com os valores estimados dos lotes malsucedidos."
                  >
                    <form className="space-y-4" onSubmit={handleProcessAta}>
                      <Alert
                        variant="info"
                        title="A SD é a fonte oficial dos valores estimados"
                      >
                        Os valores dos lotes fracassados, desertos e cancelados
                        serão conciliados com a SD enviada. Os dois arquivos e
                        os relatórios gerados não serão cadastrados no acervo do
                        processo.
                      </Alert>
                      <div className="grid gap-4 md:grid-cols-2">
                        <FormField
                          label="Ata de sessão BLL (PDF)"
                          description="Define os lotes, participantes e resultados da sessão."
                        >
                          <Input
                            key={`ata-sessao-input-${ataInputResetKey}`}
                            type="file"
                            accept=".pdf,application/pdf"
                            aria-required="true"
                            disabled={ataProcessing}
                            onChange={(event) =>
                              setAtaFile(event.target.files?.[0] ?? null)
                            }
                          />
                        </FormField>
                        <FormField
                          label="Solicitação de Despesa (PDF)"
                          description="Fornece os valores estimados usados na conciliação."
                        >
                          <Input
                            key={`sd-input-${ataInputResetKey}`}
                            type="file"
                            accept=".pdf,application/pdf"
                            aria-required="true"
                            disabled={ataProcessing}
                            onChange={(event) =>
                              setSdFile(event.target.files?.[0] ?? null)
                            }
                          />
                        </FormField>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-600">
                        <p className="font-semibold text-slate-900">
                          Regras desta leitura
                        </p>
                        <p className="mt-2">
                          <span className="font-semibold text-slate-900">
                            Em andamento:
                          </span>{" "}
                          lotes em{" "}
                          <span className="font-semibold text-slate-900">
                            JULGAMENTO
                          </span>
                          ,{" "}
                          <span className="font-semibold text-slate-900">
                            HABILITAÇÃO
                          </span>{" "}
                          e{" "}
                          <span className="font-semibold text-slate-900">
                            EM HABILITAÇÃO
                          </span>
                          .
                        </p>
                        <p>
                          <span className="font-semibold text-slate-900">
                            Adjudicados:
                          </span>{" "}
                          lotes em{" "}
                          <span className="font-semibold text-slate-900">
                            EM ADJUDICAÇÃO
                          </span>{" "}
                          e{" "}
                          <span className="font-semibold text-slate-900">
                            ADJUDICADO
                          </span>
                          .
                        </p>
                        <p>
                          <span className="font-semibold text-slate-900">
                            Fase recursal:
                          </span>{" "}
                          lotes em{" "}
                          <span className="font-semibold text-slate-900">
                            INTERPOSIÇÃO DE RECURSOS
                          </span>
                          ,{" "}
                          <span className="font-semibold text-slate-900">
                            RECEPÇÃO DE CONTRARRAZÕES
                          </span>{" "}
                          e{" "}
                          <span className="font-semibold text-slate-900">
                            JULGAMENTO DE RECURSOS
                          </span>
                          .
                        </p>
                        <p>
                          <span className="font-semibold text-slate-900">
                            Malsucedidos:
                          </span>{" "}
                          lotes{" "}
                          <span className="font-semibold text-slate-900">
                            FRACASSADO
                          </span>
                          ,{" "}
                          <span className="font-semibold text-slate-900">
                            DESERTO
                          </span>{" "}
                          e{" "}
                          <span className="font-semibold text-slate-900">
                            CANCELADO
                          </span>
                          .
                        </p>
                      </div>
                      <Button
                        type="submit"
                        loading={ataProcessing}
                        icon={<FileCog className="h-4 w-4" />}
                      >
                        {ataProcessing
                          ? "Conciliando Ata e SD..."
                          : "Gerar relatórios com valores estimados"}
                      </Button>
                    </form>
                  </SectionCard>
                </div>

                <div className="space-y-4">
                  <SectionCard
                    title="Arquivos gerados"
                    description="Resumo da última execução com os downloads diretos dos PDFs, planilhas e logs do processamento."
                  >
                    {!ataResult ? (
                      <Alert variant="info">
                        Nenhuma ata foi processada ainda nesta tela. Depois do
                        envio, os arquivos gerados aparecerão aqui.
                      </Alert>
                    ) : (
                      <div className="space-y-5">
                        <EstimatedValueCoverage
                          reconciliation={
                            ataResult.estimatedValueReconciliation
                          }
                        />

                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                          {[
                            {
                              label: "Lotes totais",
                              value: ataResult.summary.totalLotes,
                            },
                            {
                              label: "Em andamento",
                              value: ataResult.summary.emAndamento,
                            },
                            {
                              label: "Adjudicados",
                              value: ataResult.summary.adjudicados,
                            },
                            {
                              label: "Fase recursal",
                              value: ataResult.summary.faseRecursal,
                            },
                            {
                              label: "Malsucedidos",
                              value: ataResult.summary.malsucedidos,
                            },
                            {
                              label: "Warnings",
                              value: ataResult.summary.warnings,
                            },
                            {
                              label: "Erros de parsing",
                              value: ataResult.summary.parsingErrors,
                            },
                          ].map((item) => (
                            <article
                              key={item.label}
                              className="rounded-3xl border border-slate-200 bg-white px-4 py-4"
                            >
                              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                                {item.label}
                              </p>
                              <p className="mt-3 text-3xl font-black text-slate-950">
                                {item.value}
                              </p>
                            </article>
                          ))}
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-600">
                          <p>
                            <span className="font-semibold text-slate-900">
                              Ata de origem:
                            </span>{" "}
                            {ataResult.originalFileName ??
                              ataResult.sourceFile.split(/[\\/]/).pop()}
                          </p>
                          <p>
                            <span className="font-semibold text-slate-900">
                              Solicitação de Despesa:
                            </span>{" "}
                            {ataResult.originalSdFileName ??
                              (ataResult.estimatedValueReconciliation?.sdNumber
                                ? `SD ${ataResult.estimatedValueReconciliation.sdNumber}`
                                : "Nome não informado")}
                          </p>
                          <p>
                            <span className="font-semibold text-slate-900">
                              Gerado em:
                            </span>{" "}
                            {formatShortDateTimeBR(ataResult.generatedAt)}
                          </p>
                        </div>

                        <div className="grid gap-3">
                          {ataResult.artifacts.map((artifact) => (
                            <div
                              key={artifact.relativePath}
                              className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 md:flex-row md:items-center md:justify-between"
                            >
                              <div>
                                <p className="font-semibold text-slate-900">
                                  {artifact.label}
                                </p>
                                <p className="text-sm text-slate-500">
                                  {artifact.type.toUpperCase()}
                                </p>
                              </div>
                              <a
                                href={
                                  resolveServerAssetUrl(artifact.downloadUrl) ??
                                  "#"
                                }
                                target="_blank"
                                rel="noreferrer"
                              >
                                <Button
                                  type="button"
                                  variant="outline"
                                  icon={<Download className="h-4 w-4" />}
                                >
                                  Baixar
                                </Button>
                              </a>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </SectionCard>
                </div>
              </div>
            ),
          },
          {
            value: "acervo",
            label: "Acervo",
            content: (
              <div className="grid gap-6 xl:grid-cols-[1.2fr_0.85fr]">
                <div className="space-y-4">
                  <div className="grid gap-3 xl:grid-cols-[minmax(0,1.1fr)_160px_180px_220px_180px]">
                    <FormField label="Buscar">
                      <Input
                        value={search}
                        onChange={(event) => {
                          setPage(1);
                          setSearch(event.target.value);
                        }}
                        placeholder="Processo, título, categoria ou palavra-chave"
                      />
                    </FormField>
                    <FormField label="Tipo">
                      <Select
                        value={tipo}
                        onChange={(event) => {
                          setPage(1);
                          setTipo(event.target.value as typeof tipo);
                        }}
                      >
                        <option value="">Todos</option>
                        {documentoTipos.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </Select>
                    </FormField>
                    <FormField label="Categoria">
                      <Input
                        value={categoria}
                        onChange={(event) => {
                          setPage(1);
                          setCategoria(event.target.value);
                        }}
                        placeholder="Ex.: parecer, ata"
                      />
                    </FormField>
                    <FormField label="Classificação institucional">
                      <Select
                        value={classificacaoFilter}
                        onChange={(event) => {
                          setPage(1);
                          setClassificacaoFilter(event.target.value);
                        }}
                      >
                        <option value="">Todas</option>
                        {classificacaoOptionsQuery.data?.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.codigo} — {item.nome}
                          </option>
                        ))}
                      </Select>
                    </FormField>
                    <FormField label="Intenção de publicação">
                      <Select
                        value={publicoFilter}
                        onChange={(event) => {
                          setPage(1);
                          setPublicoFilter(event.target.value);
                        }}
                      >
                        <option value="todos">Todos</option>
                        <option value="publicos">Com intenção pública</option>
                        <option value="restritos">Sem intenção pública</option>
                      </Select>
                    </FormField>
                  </div>

                  <div className="overflow-x-auto rounded-[28px] border border-slate-200 bg-white">
                    <Table className="min-w-[860px]">
                      <TableHead>
                        <tr>
                          <TableHeaderCell>Documento</TableHeaderCell>
                          <TableHeaderCell>Processo</TableHeaderCell>
                          <TableHeaderCell>Tipo</TableHeaderCell>
                          <TableHeaderCell>Referência</TableHeaderCell>
                          <TableHeaderCell>
                            Status de publicação
                          </TableHeaderCell>
                          <TableHeaderCell>Atualizado em</TableHeaderCell>
                        </tr>
                      </TableHead>
                      <TableBody>
                        {listQuery.isLoading
                          ? Array.from({ length: 6 }).map((_, index) => (
                              <TableRow key={index}>
                                <TableCell colSpan={6}>
                                  <Skeleton className="h-12 w-full" />
                                </TableCell>
                              </TableRow>
                            ))
                          : rows.map((row) => (
                              <TableRow
                                key={row.id}
                                className={[
                                  "cursor-pointer transition",
                                  row.id === selectedDocumentId
                                    ? "bg-sky-50/80"
                                    : "hover:bg-slate-50",
                                ].join(" ")}
                                onClick={() => setSelectedDocumentId(row.id)}
                              >
                                <TableCell>
                                  <div className="font-semibold text-slate-900">
                                    {row.titulo}
                                  </div>
                                  <div className="text-xs text-slate-500">
                                    {[
                                      row.classificacaoCodigo
                                        ? `${row.classificacaoCodigo}${row.classificacaoNome ? ` · ${row.classificacaoNome}` : ""}`
                                        : null,
                                      row.categoria,
                                      `v${row.versao}`,
                                    ]
                                      .filter(Boolean)
                                      .join(" · ") || "Sem classificação"}
                                  </div>
                                </TableCell>
                                <TableCell>{row.processoNumeroSirel}</TableCell>
                                <TableCell>{row.tipo}</TableCell>
                                <TableCell>
                                  {formatShortDateBR(row.dataReferencia)}
                                </TableCell>
                                <TableCell>
                                  {row.publico &&
                                  getDocumentoPublicacaoStatus(row) ===
                                    "APROVADO"
                                    ? "Publicado"
                                    : publicacaoStatusLabels[
                                        getDocumentoPublicacaoStatus(row)
                                      ]}
                                </TableCell>
                                <TableCell>
                                  {formatShortDateTimeBR(row.atualizadoEm)}
                                </TableCell>
                              </TableRow>
                            ))}
                        {!listQuery.isLoading && !rows.length ? (
                          <TableRow>
                            <TableCell
                              colSpan={6}
                              className="py-8 text-center text-slate-500"
                            >
                              Nenhum documento encontrado.
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-slate-600">
                      Exibindo{" "}
                      <span className="font-bold text-slate-950">
                        {rows.length}
                      </span>{" "}
                      de{" "}
                      <span className="font-bold text-slate-950">{total}</span>{" "}
                      registros.
                    </p>
                    <div className="flex items-center gap-3">
                      <Select
                        value={String(pageSize)}
                        onChange={(event) =>
                          setPageSize(Number(event.target.value))
                        }
                        className="w-[140px]"
                      >
                        {[10, 20, 50].map((option) => (
                          <option key={option} value={option}>
                            {option} por página
                          </option>
                        ))}
                      </Select>
                      <Pagination
                        page={page}
                        totalPages={totalPages}
                        onPageChange={setPage}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  {feedback ? (
                    <Alert variant="success">{feedback}</Alert>
                  ) : null}
                  {error ? <Alert variant="error">{error}</Alert> : null}

                  <SectionCard
                    title="Upload no acervo"
                    description="Anexe documentos novos com metadados operacionais já na entrada do sistema."
                  >
                    <form className="space-y-4" onSubmit={handleUpload}>
                      <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                        <Checkbox
                          checked={ataSyncEnabled}
                          onChange={(event) =>
                            setAtaSyncEnabled(event.target.checked)
                          }
                        />
                        Ata de sessão com atualização da licitação
                      </label>
                      {ataSyncEnabled ? (
                        <Alert
                          variant="info"
                          title="Fluxo com identificação do processo"
                        >
                          O arquivo será lido primeiro para extrair edital e
                          processo administrativo. Depois você confirma o
                          processo interno e aprova a prévia antes de aplicar a
                          atualização.
                        </Alert>
                      ) : null}
                      <FormField
                        label={
                          ataSyncEnabled
                            ? "Processo pré-selecionado (opcional)"
                            : "Processo"
                        }
                      >
                        <Select
                          value={uploadForm.processoId}
                          onChange={(event) =>
                            setUploadForm((current) => ({
                              ...current,
                              processoId: event.target.value,
                            }))
                          }
                        >
                          <option value="">
                            {ataSyncEnabled
                              ? "Deixar para identificar pela ata"
                              : "Selecione um processo"}
                          </option>
                          {processOptionsQuery.data?.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.numeroSirel}
                              {item.numeroEdital
                                ? ` | Edital ${item.numeroEdital}`
                                : ""}
                              {item.numeroAdministrativo
                                ? ` | PA ${item.numeroAdministrativo}`
                                : ""}
                            </option>
                          ))}
                        </Select>
                      </FormField>
                      {uploadForm.documentoAnteriorId ? (
                        <Alert variant="info" title="Nova versão em preparação">
                          O arquivo enviado substituirá logicamente o documento
                          #{uploadForm.documentoAnteriorId}, preservando a
                          linhagem e exigindo nova revisão de publicação.
                          <div className="mt-3">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setUploadForm((current) => ({
                                  ...current,
                                  documentoAnteriorId: "",
                                }))
                              }
                            >
                              Enviar como documento independente
                            </Button>
                          </div>
                        </Alert>
                      ) : null}
                      <div className="grid gap-3 md:grid-cols-2">
                        <FormField label="Tipo">
                          <Select
                            value={uploadForm.tipo}
                            onChange={(event) =>
                              setUploadForm((current) => ({
                                ...current,
                                tipo: event.target.value as DocumentoTipo,
                              }))
                            }
                          >
                            {documentoTipos.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </Select>
                        </FormField>
                        <FormField label="Data de referência">
                          <Input
                            type="date"
                            value={uploadForm.dataReferencia}
                            onChange={(event) =>
                              setUploadForm((current) => ({
                                ...current,
                                dataReferencia: event.target.value,
                              }))
                            }
                          />
                        </FormField>
                      </div>
                      <FormField label="Título">
                        <Input
                          value={uploadForm.titulo}
                          onChange={(event) =>
                            setUploadForm((current) => ({
                              ...current,
                              titulo: event.target.value,
                            }))
                          }
                        />
                      </FormField>
                      <div className="grid gap-3 md:grid-cols-2">
                        <FormField
                          label="Classificação institucional"
                          description="Use o catálogo controlado para a classificação oficial."
                        >
                          <Select
                            value={uploadForm.classificacaoId}
                            onChange={(event) =>
                              setUploadForm((current) => ({
                                ...current,
                                classificacaoId: event.target.value,
                              }))
                            }
                          >
                            <option value="">Não classificado</option>
                            {classificacaoOptionsQuery.data?.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.codigo} — {item.nome}
                              </option>
                            ))}
                          </Select>
                        </FormField>
                        <FormField label="Categoria">
                          <Input
                            value={uploadForm.categoria}
                            onChange={(event) =>
                              setUploadForm((current) => ({
                                ...current,
                                categoria: event.target.value,
                              }))
                            }
                            placeholder="Ex.: parecer jurídico"
                          />
                        </FormField>
                        <FormField label="Palavras-chave">
                          <Input
                            value={uploadForm.palavrasChave}
                            onChange={(event) =>
                              setUploadForm((current) => ({
                                ...current,
                                palavrasChave: event.target.value,
                              }))
                            }
                            placeholder="Ex.: licitação, edital, parecer"
                          />
                        </FormField>
                      </div>
                      <FormField label="Descrição">
                        <Input
                          value={uploadForm.descricao}
                          onChange={(event) =>
                            setUploadForm((current) => ({
                              ...current,
                              descricao: event.target.value,
                            }))
                          }
                        />
                      </FormField>
                      <FormField label="Arquivo">
                        <Input
                          type="file"
                          onChange={(event) =>
                            setUploadForm((current) => ({
                              ...current,
                              arquivo: event.target.files?.[0] ?? null,
                            }))
                          }
                        />
                      </FormField>
                      <Alert variant="info" title="Entrada segura">
                        Todo envio entra como rascunho. A restrição interna e a
                        publicação no portal são decididas no fluxo de revisão.
                      </Alert>
                      <Button type="submit">
                        <Upload className="mr-2 h-4 w-4" />
                        {ataSyncEnabled
                          ? "Identificar processo pela ata"
                          : "Anexar documento"}
                      </Button>
                    </form>
                  </SectionCard>

                  <SectionCard
                    title="Metadados do selecionado"
                    description="Revise os dados descritivos. A publicidade e as restrições seguem um fluxo separado de revisão."
                  >
                    {!selectedDocumentId || detailQuery.isLoading ? (
                      <Skeleton className="h-72 w-full rounded-[24px]" />
                    ) : !detailQuery.data ? (
                      <Alert variant="info">
                        Selecione um documento para revisar os metadados.
                      </Alert>
                    ) : (
                      <form
                        className="space-y-4"
                        onSubmit={handleUpdateMetadata}
                      >
                        <FormField label="Título">
                          <Input
                            value={metadataForm.titulo}
                            onChange={(event) =>
                              setMetadataForm((current) => ({
                                ...current,
                                titulo: event.target.value,
                              }))
                            }
                          />
                        </FormField>
                        <div className="grid gap-3 md:grid-cols-2">
                          <FormField label="Classificação institucional">
                            <Select
                              value={metadataForm.classificacaoId}
                              onChange={(event) =>
                                setMetadataForm((current) => ({
                                  ...current,
                                  classificacaoId: event.target.value,
                                }))
                              }
                            >
                              <option value="">Não classificado</option>
                              {classificacaoOptionsQuery.data?.map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.codigo} — {item.nome}
                                </option>
                              ))}
                            </Select>
                          </FormField>
                          <FormField label="Categoria">
                            <Input
                              value={metadataForm.categoria}
                              onChange={(event) =>
                                setMetadataForm((current) => ({
                                  ...current,
                                  categoria: event.target.value,
                                }))
                              }
                            />
                          </FormField>
                          <FormField label="Data de referência">
                            <Input
                              type="date"
                              value={metadataForm.dataReferencia}
                              onChange={(event) =>
                                setMetadataForm((current) => ({
                                  ...current,
                                  dataReferencia: event.target.value,
                                }))
                              }
                            />
                          </FormField>
                        </div>
                        <FormField label="Descrição">
                          <Input
                            value={metadataForm.descricao}
                            onChange={(event) =>
                              setMetadataForm((current) => ({
                                ...current,
                                descricao: event.target.value,
                              }))
                            }
                          />
                        </FormField>
                        <FormField label="Palavras-chave">
                          <Input
                            value={metadataForm.palavrasChave}
                            onChange={(event) =>
                              setMetadataForm((current) => ({
                                ...current,
                                palavrasChave: event.target.value,
                              }))
                            }
                            placeholder="Separar por vírgula"
                          />
                        </FormField>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                          <p>
                            <span className="font-semibold text-slate-800">
                              Processo:
                            </span>{" "}
                            {detailQuery.data.processoNumeroSirel}
                          </p>
                          <p className="mt-1">
                            <span className="font-semibold text-slate-800">
                              Criado em:
                            </span>{" "}
                            {formatShortDateTimeBR(detailQuery.data.criadoEm)}
                          </p>
                          <p className="mt-1">
                            <span className="font-semibold text-slate-800">
                              Versão:
                            </span>{" "}
                            v{detailQuery.data.versao}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                            Linhagem de versões
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {detailQuery.data.related.map((item) => (
                              <Button
                                key={item.id}
                                type="button"
                                size="sm"
                                variant={
                                  item.id === selectedDocumentId
                                    ? "default"
                                    : "outline"
                                }
                                onClick={() => setSelectedDocumentId(item.id)}
                              >
                                v{item.versao} ·{" "}
                                {getPublicacaoStatus(item.statusPublicacao)}
                              </Button>
                            ))}
                          </div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                          <div className="flex items-center gap-2">
                            <History className="h-4 w-4 text-slate-600" />
                            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                              Rastreabilidade de publicação e acesso
                            </p>
                          </div>
                          {documentAuditQuery.isLoading ? (
                            <Skeleton className="mt-3 h-16 w-full" />
                          ) : documentAuditQuery.error ? (
                            <Alert className="mt-3" variant="error">
                              Não foi possível carregar a trilha de auditoria
                              deste documento.
                            </Alert>
                          ) : documentAuditQuery.data?.items.length ? (
                            <ol className="mt-3 space-y-2">
                              {documentAuditQuery.data.items.map((item) => (
                                <li
                                  key={item.id}
                                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                                >
                                  <p className="font-semibold text-slate-800">
                                    {item.descricao ||
                                      `${item.acao} registrado`}
                                  </p>
                                  <p className="mt-1 text-xs text-slate-500">
                                    {formatShortDateTimeBR(item.criadoEm)} ·{" "}
                                    {item.usuarioNome || "Sistema"}
                                  </p>
                                </li>
                              ))}
                            </ol>
                          ) : (
                            <p className="mt-3 text-sm text-slate-600">
                              Nenhum evento de auditoria foi registrado para
                              este documento.
                            </p>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="submit"
                            disabled={updateMetadataMutation.isPending}
                          >
                            {updateMetadataMutation.isPending
                              ? "Salvando..."
                              : "Salvar metadados"}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={handleStartNewVersion}
                          >
                            Criar nova versão
                          </Button>
                          {detailQuery.data.arquivoUrl ? (
                            <a
                              href={
                                resolveServerAssetUrl(
                                  detailQuery.data.arquivoUrl,
                                ) ?? "#"
                              }
                              target="_blank"
                              rel="noreferrer"
                            >
                              <Button type="button" variant="outline">
                                Abrir arquivo
                              </Button>
                            </a>
                          ) : null}
                          <Button
                            type="button"
                            variant="outline"
                            onClick={handleDeleteSelected}
                          >
                            Excluir
                          </Button>
                        </div>
                      </form>
                    )}
                  </SectionCard>

                  <SectionCard
                    title="Acesso e publicação"
                    description="Registre a restrição interna e encaminhe o documento para a decisão de publicação."
                  >
                    {!selectedDocumentId ||
                    detailQuery.isLoading ||
                    !detailQuery.data ||
                    !selectedDocumentPublication ? (
                      <Skeleton className="h-80 w-full rounded-[24px]" />
                    ) : (
                      <div className="space-y-4">
                        <Alert
                          variant={
                            publicacaoStatusVariants[
                              selectedDocumentPublication.status
                            ]
                          }
                          title={`Status: ${publicacaoStatusLabels[selectedDocumentPublication.status]}`}
                        >
                          <p>
                            {detailQuery.data.publico &&
                            selectedDocumentPublication.status === "APROVADO"
                              ? "Este documento está disponível no portal público."
                              : "Este documento não está disponível no portal público."}
                          </p>
                          {selectedDocumentPublication.aprovadoEm ? (
                            <p>
                              Decisão registrada em{" "}
                              {formatShortDateTimeBR(
                                selectedDocumentPublication.aprovadoEm,
                              )}
                              {selectedDocumentPublication.aprovadoPor
                                ? ` pelo usuário #${selectedDocumentPublication.aprovadoPor}`
                                : ""}
                              .
                            </p>
                          ) : null}
                          {selectedDocumentPublication.justificativa ? (
                            <p>
                              Última justificativa:{" "}
                              {selectedDocumentPublication.justificativa}
                            </p>
                          ) : null}
                        </Alert>

                        <form
                          className="space-y-4"
                          onSubmit={handleUpdateAccess}
                        >
                          <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                            <Checkbox
                              checked={accessForm.publico}
                              onChange={(event) =>
                                setAccessForm((current) => ({
                                  ...current,
                                  publico: event.target.checked,
                                  restritoA: event.target.checked
                                    ? []
                                    : current.restritoA,
                                }))
                              }
                            />
                            Solicitar disponibilização no portal após aprovação
                          </label>
                          <div className="grid gap-2 md:grid-cols-2">
                            {accessRoles.map((role) => (
                              <label
                                key={role}
                                className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
                              >
                                <Checkbox
                                  checked={accessForm.restritoA.includes(role)}
                                  disabled={accessForm.publico}
                                  onChange={(event) =>
                                    setAccessForm((current) => ({
                                      ...current,
                                      restritoA: event.target.checked
                                        ? [...current.restritoA, role]
                                        : current.restritoA.filter(
                                            (item) => item !== role,
                                          ),
                                    }))
                                  }
                                />
                                Restrito a {role}
                              </label>
                            ))}
                          </div>
                          {accessForm.publico ? (
                            <Alert variant="info">
                              A restrição por perfil é removida da solicitação
                              pública. O backend confirma a regra antes de
                              registrar a decisão.
                            </Alert>
                          ) : null}
                          <FormField
                            label="Justificativa da decisão"
                            description="Obrigatória para alterar acesso, encaminhar, aprovar, rejeitar ou retirar a publicação."
                          >
                            <Textarea
                              value={workflowJustificativa}
                              onChange={(event) =>
                                setWorkflowJustificativa(event.target.value)
                              }
                              placeholder="Descreva o motivo e as condições da decisão."
                            />
                          </FormField>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="submit"
                              variant="outline"
                              disabled={workflowMutationPending}
                            >
                              {updateAccessMutation.isPending
                                ? "Registrando acesso..."
                                : "Registrar acesso"}
                            </Button>
                            {["RASCUNHO", "REJEITADO", "RETIRADO"].includes(
                              selectedDocumentPublication.status,
                            ) ? (
                              <Button
                                type="button"
                                disabled={workflowMutationPending}
                                onClick={() =>
                                  void handlePublicationWorkflow("submit")
                                }
                              >
                                {submitForReviewMutation.isPending
                                  ? "Encaminhando..."
                                  : "Encaminhar para revisão"}
                              </Button>
                            ) : null}
                            {selectedDocumentPublication.status ===
                            "EM_REVISAO" ? (
                              <>
                                <Button
                                  type="button"
                                  disabled={workflowMutationPending}
                                  onClick={() =>
                                    void handlePublicationWorkflow("approve")
                                  }
                                >
                                  {approvePublicationMutation.isPending
                                    ? "Aprovando..."
                                    : "Aprovar publicação"}
                                </Button>
                                <Button
                                  type="button"
                                  variant="destructive"
                                  disabled={workflowMutationPending}
                                  onClick={() =>
                                    void handlePublicationWorkflow("reject")
                                  }
                                >
                                  {rejectPublicationMutation.isPending
                                    ? "Rejeitando..."
                                    : "Rejeitar"}
                                </Button>
                              </>
                            ) : null}
                            {selectedDocumentPublication.status ===
                            "APROVADO" ? (
                              <Button
                                type="button"
                                variant="destructive"
                                disabled={workflowMutationPending}
                                onClick={() =>
                                  void handlePublicationWorkflow("withdraw")
                                }
                              >
                                {withdrawPublicationMutation.isPending
                                  ? "Retirando..."
                                  : "Retirar do portal"}
                              </Button>
                            ) : null}
                          </div>
                        </form>
                      </div>
                    )}
                  </SectionCard>
                </div>
              </div>
            ),
          },
        ]}
      />
      <Modal
        open={classificacaoModalOpen}
        onClose={() => {
          setClassificacaoModalOpen(false);
          setClassificacaoError(null);
        }}
        title={
          classificacaoForm.id
            ? "Editar classificação institucional"
            : "Nova classificação institucional"
        }
        description="O código é único e passa a compor os filtros internos e públicos quando a classificação estiver ativa."
        size="md"
      >
        <form className="space-y-4" onSubmit={handleSaveClassificacao}>
          {classificacaoError ? (
            <Alert variant="error">{classificacaoError}</Alert>
          ) : null}
          <FormField
            label="Código"
            description="Use uma sigla estável, por exemplo EDITAL ou LICITACAO_PARECER_JURIDICO."
          >
            <Input
              value={classificacaoForm.codigo}
              onChange={(event) =>
                setClassificacaoForm((current) => ({
                  ...current,
                  codigo: event.target.value,
                }))
              }
              maxLength={120}
              required
            />
          </FormField>
          <FormField label="Nome">
            <Input
              value={classificacaoForm.nome}
              onChange={(event) =>
                setClassificacaoForm((current) => ({
                  ...current,
                  nome: event.target.value,
                }))
              }
              maxLength={255}
              required
            />
          </FormField>
          <FormField label="Descrição">
            <Textarea
              value={classificacaoForm.descricao}
              onChange={(event) =>
                setClassificacaoForm((current) => ({
                  ...current,
                  descricao: event.target.value,
                }))
              }
              maxLength={2000}
              rows={4}
            />
          </FormField>
          <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
            <Checkbox
              checked={classificacaoForm.ativo}
              onChange={(event) =>
                setClassificacaoForm((current) => ({
                  ...current,
                  ativo: event.target.checked,
                }))
              }
            />
            Classificação ativa e disponível para novos documentos
          </label>
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setClassificacaoModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={saveClassificacaoMutation.isPending}
            >
              {saveClassificacaoMutation.isPending
                ? "Salvando..."
                : "Salvar classificação"}
            </Button>
          </div>
        </form>
      </Modal>
      <Modal
        open={ataDiscovery !== null}
        onClose={() => setAtaDiscovery(null)}
        title="Identificação do processo pela ata"
        description="Confira os identificadores extraídos, escolha o processo correto e siga para a prévia obrigatória."
        size="xl"
        actions={
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setAtaDiscovery(null)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => void handleCreatePreviewFromDiscovery()}
              disabled={!ataDiscoverySelectedProcessId || ataDiscoveryLoading}
            >
              {ataDiscoveryLoading
                ? "Criando prévia..."
                : "Confirmar processo e gerar prévia"}
            </Button>
          </div>
        }
      >
        {!ataDiscovery ? null : (
          <div className="space-y-5">
            <div className="grid gap-4 lg:grid-cols-3">
              <article className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                  Arquivo
                </p>
                <p className="mt-3 text-sm font-semibold text-slate-950">
                  {ataDiscovery.originalFileName}
                </p>
              </article>
              <article className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                  Edital
                </p>
                <p className="mt-3 text-sm font-semibold text-slate-950">
                  {ataDiscovery.metadata.edital ?? "Não identificado"}
                </p>
              </article>
              <article className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                  Processo administrativo
                </p>
                <p className="mt-3 text-sm font-semibold text-slate-950">
                  {ataDiscovery.metadata.processoAdministrativo ??
                    "Não identificado"}
                </p>
              </article>
            </div>

            {(ataDiscovery.artifacts?.length ?? 0) > 0 ? (
              <Alert variant="info" title="Relatórios e JSON disponíveis">
                <div className="space-y-3">
                  <p>
                    A leitura da ata já gerou os arquivos desta execução. Você
                    pode baixá-los agora ou seguir para a prévia da
                    sincronização.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(ataDiscovery.artifacts ?? []).map((artifact) => (
                      <a
                        key={artifact.relativePath}
                        href={
                          resolveServerAssetUrl(artifact.downloadUrl) ??
                          artifact.downloadUrl
                        }
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Button type="button" variant="outline">
                          {artifact.label}
                        </Button>
                      </a>
                    ))}
                  </div>
                </div>
              </Alert>
            ) : null}

            {ataDiscovery.metadata.providedProcessoId &&
            ataDiscovery.suggestedProcesses[0] &&
            ataDiscovery.metadata.providedProcessoId !==
              ataDiscovery.suggestedProcesses[0].processId ? (
              <Alert
                variant="error"
                title="Divergência com o processo pré-selecionado"
              >
                A ata sugere o processo{" "}
                {ataDiscovery.suggestedProcesses[0].numeroSirel}, mas o
                formulário estava com{" "}
                {ataDiscovery.metadata.providedProcessoNumeroSirel}. Confirme a
                escolha antes de continuar.
              </Alert>
            ) : null}

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">
                  Processos sugeridos
                </h4>
                <span className="text-sm text-slate-500">
                  {ataDiscovery.suggestedProcesses.length} sugestão(ões)
                </span>
              </div>
              {ataDiscovery.suggestedProcesses.length ? (
                <div className="space-y-3">
                  {ataDiscovery.suggestedProcesses.map((item) => (
                    <button
                      key={item.processId}
                      type="button"
                      onClick={() =>
                        setAtaDiscoverySelectedProcessId(item.processId)
                      }
                      className={[
                        "w-full rounded-3xl border px-4 py-4 text-left transition",
                        ataDiscoverySelectedProcessId === item.processId
                          ? "border-sky-500 bg-sky-50"
                          : "border-slate-200 bg-white hover:border-slate-300",
                      ].join(" ")}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-black text-slate-950">
                            {item.numeroSirel}
                          </p>
                          <p className="mt-1 text-sm text-slate-600">
                            {item.objeto}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {item.numeroEdital
                              ? `Edital ${item.numeroEdital}`
                              : "Sem edital"}{" "}
                            {item.numeroAdministrativo
                              ? `| PA ${item.numeroAdministrativo}`
                              : ""}
                            {item.moduloAtual ? ` | ${item.moduloAtual}` : ""}
                          </p>
                        </div>
                        <div className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">
                          {item.level} • {Math.round(item.score)}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <Alert variant="info">
                  Nenhum processo foi sugerido automaticamente. Faça a busca
                  manual abaixo.
                </Alert>
              )}
            </div>

            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <div className="grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
                <FormField label="Buscar processo manualmente">
                  <Input
                    value={ataDiscoverySearch}
                    onChange={(event) =>
                      setAtaDiscoverySearch(event.target.value)
                    }
                    placeholder="Número SIREL, edital, administrativo ou objeto"
                  />
                </FormField>
                <FormField label="Processo escolhido">
                  <Select
                    value={
                      ataDiscoverySelectedProcessId
                        ? String(ataDiscoverySelectedProcessId)
                        : ""
                    }
                    onChange={(event) =>
                      setAtaDiscoverySelectedProcessId(
                        event.target.value ? Number(event.target.value) : null,
                      )
                    }
                  >
                    <option value="">Selecione um processo</option>
                    {ataDiscoveryProcessOptionsQuery.data?.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.numeroSirel}
                        {item.numeroEdital
                          ? ` | Edital ${item.numeroEdital}`
                          : ""}
                        {item.numeroAdministrativo
                          ? ` | PA ${item.numeroAdministrativo}`
                          : ""}
                      </option>
                    ))}
                  </Select>
                </FormField>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <AtaSessaoSyncModal
        open={ataSyncPreview !== null}
        preview={ataSyncPreview}
        applyLoading={ataSyncApplyLoading}
        onClose={() => setAtaSyncPreview(null)}
        onApply={() => void handleApplyAtaSync()}
      />

      <AtaSessaoProcessingOverlay
        open={ataProcessing || ataDiscoveryLoading}
        fileName={ataProcessing ? ataFile?.name : uploadForm.arquivo?.name}
        sdFileName={ataProcessing ? sdFile?.name : undefined}
        context={
          ataProcessing ? "reports" : ataDiscovery ? "preview" : "discovery"
        }
      />
    </SectionCard>
  );
}

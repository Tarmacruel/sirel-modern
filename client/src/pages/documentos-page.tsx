import {
  Download,
  FileCog,
  FileStack,
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

const initialUploadForm = {
  processoId: "",
  tipo: "OUTRO" as DocumentoTipo,
  titulo: "",
  categoria: "",
  descricao: "",
  dataReferencia: "",
  publico: false,
  palavrasChave: "",
  restritoA: [] as DocumentoAccessRole[],
  arquivo: null as File | null,
};

const initialMetadataForm = {
  titulo: "",
  categoria: "",
  descricao: "",
  dataReferencia: "",
  publico: false,
  palavrasChave: "",
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
  const [publicoFilter, setPublicoFilter] = useState("todos");
  const [selectedDocumentId, setSelectedDocumentId] = useState<number | null>(
    null,
  );
  const [uploadForm, setUploadForm] = useState(initialUploadForm);
  const [metadataForm, setMetadataForm] = useState(initialMetadataForm);
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
      publico:
        publicoFilter === "todos" ? undefined : publicoFilter === "publicos",
    }),
    [deferredCategory, deferredSearch, page, pageSize, publicoFilter, tipo],
  );
  const listQuery = trpc.documentos.list.useQuery(filters, {
    retry: false,
    placeholderData: (previous) => previous,
  });
  const detailQuery = trpc.documentos.detail.useQuery(
    { documentoId: selectedDocumentId ?? 0 },
    { enabled: Boolean(selectedDocumentId), retry: false },
  );
  const rows = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

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
      descricao: detailQuery.data.descricao ?? "",
      dataReferencia: detailQuery.data.dataReferencia
        ? String(detailQuery.data.dataReferencia).slice(0, 10)
        : "",
      publico: detailQuery.data.publico,
      palavrasChave: Array.isArray(detailQuery.data.palavrasChave)
        ? detailQuery.data.palavrasChave.join(", ")
        : "",
      restritoA: Array.isArray(detailQuery.data.restritoA)
        ? detailQuery.data.restritoA.filter(
            (item): item is DocumentoAccessRole =>
              accessRoles.includes(item as DocumentoAccessRole),
          )
        : [],
    });
  }, [detailQuery.data]);

  const updateMetadataMutation = trpc.documentos.updateMetadata.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.documentos.list.invalidate(),
        utils.documentos.detail.invalidate(),
        utils.documentos.summary.invalidate(),
      ]);
      setFeedback("Metadados do documento atualizados.");
      setError(null);
    },
    onError: (mutationError) => {
      setFeedback(null);
      setError(mutationError.message);
    },
  });

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
        tipo: uploadForm.tipo,
        titulo: uploadForm.titulo,
        categoria: uploadForm.categoria || undefined,
        descricao: uploadForm.descricao || undefined,
        dataReferencia: uploadForm.dataReferencia || undefined,
        publico: uploadForm.publico,
        palavrasChave: parseKeywords(uploadForm.palavrasChave),
        restritoA: uploadForm.restritoA,
        arquivo: uploadForm.arquivo,
      });
      await Promise.all([
        utils.documentos.list.invalidate(),
        utils.documentos.summary.invalidate(),
        utils.documentos.processOptions.invalidate(),
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
          publico: uploadForm.publico,
          palavrasChave: parseKeywords(uploadForm.palavrasChave),
          restritoA: uploadForm.restritoA,
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

    await updateMetadataMutation.mutateAsync({
      documentoId: selectedDocumentId,
      titulo: metadataForm.titulo,
      categoria: metadataForm.categoria || undefined,
      descricao: metadataForm.descricao || undefined,
      dataReferencia: metadataForm.dataReferencia || undefined,
      publico: metadataForm.publico,
      palavrasChave: parseKeywords(metadataForm.palavrasChave),
      restritoA: metadataForm.restritoA,
    });
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
                  <div className="grid gap-3 xl:grid-cols-[minmax(0,1.1fr)_180px_180px_180px]">
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
                    <FormField label="Publicidade">
                      <Select
                        value={publicoFilter}
                        onChange={(event) => {
                          setPage(1);
                          setPublicoFilter(event.target.value);
                        }}
                      >
                        <option value="todos">Todos</option>
                        <option value="publicos">Somente públicos</option>
                        <option value="restritos">Somente restritos</option>
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
                          <TableHeaderCell>Publicidade</TableHeaderCell>
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
                                    {row.categoria ?? "Sem categoria"}
                                  </div>
                                </TableCell>
                                <TableCell>{row.processoNumeroSirel}</TableCell>
                                <TableCell>{row.tipo}</TableCell>
                                <TableCell>
                                  {formatShortDateBR(row.dataReferencia)}
                                </TableCell>
                                <TableCell>
                                  {row.publico ? "Público" : "Restrito"}
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
                      <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                        <Checkbox
                          checked={uploadForm.publico}
                          onChange={(event) =>
                            setUploadForm((current) => ({
                              ...current,
                              publico: event.target.checked,
                            }))
                          }
                        />
                        Documento público no portal
                      </label>
                      <div className="grid gap-2 md:grid-cols-2">
                        {accessRoles.map((role) => (
                          <label
                            key={role}
                            className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
                          >
                            <Checkbox
                              checked={uploadForm.restritoA.includes(role)}
                              onChange={(event) =>
                                setUploadForm((current) => ({
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
                    description="Revise e ajuste o documento selecionado na lista do acervo."
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
                        <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                          <Checkbox
                            checked={metadataForm.publico}
                            onChange={(event) =>
                              setMetadataForm((current) => ({
                                ...current,
                                publico: event.target.checked,
                              }))
                            }
                          />
                          Documento público
                        </label>
                        <div className="grid gap-2 md:grid-cols-2">
                          {accessRoles.map((role) => (
                            <label
                              key={role}
                              className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
                            >
                              <Checkbox
                                checked={metadataForm.restritoA.includes(role)}
                                onChange={(event) =>
                                  setMetadataForm((current) => ({
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
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="submit"
                            disabled={updateMetadataMutation.isPending}
                          >
                            {updateMetadataMutation.isPending
                              ? "Salvando..."
                              : "Salvar metadados"}
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
                </div>
              </div>
            ),
          },
        ]}
      />
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

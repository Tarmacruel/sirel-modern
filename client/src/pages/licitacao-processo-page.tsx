import {
  Suspense,
  lazy,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type RefObject,
} from "react";
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Clock3,
  ChevronRight,
  ExternalLink,
  FileCheck2,
  FileStack,
  FolderKanban,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { useLocation } from "wouter";

import {
  habilitacaoStatusLabels,
  habilitacaoStatusOptions,
  licitacaoStatusLabels,
  getLicitacaoFlowConfig,
  getLicitacaoModalidadeHelp,
  licitacaoChecklistFlexStatusLabels,
  licitacaoChecklistFlexStatusOptions,
  licitacaoFluxoLabels,
  licitacaoStepCatalog,
  modoDisputaLabels,
  propostaSituacaoLabels,
  propostaSituacaoOptions,
  recursoResultadoLabels,
  recursoResultadoOptions,
} from "@sirel/shared/const";
import { calcularPrazoLegalMinimo } from "@sirel/shared/prazos-legais";
import { CollapsibleSectionCard } from "@/components/shared/collapsible-section-card";
import { DatePickerLegal } from "@/components/licitacao/date-picker-legal";
import { MacroTransitionModal } from "@/components/shared/macro-transition-modal";
import { Modal } from "@/components/shared/modal";
import { SectionCard } from "@/components/shared/section-card";
import {
  getLicitacaoDocumentBlueprint,
  type LicitacaoDocumentRequirement,
} from "@/lib/licitacao-phase-config";
import { Alert } from "@/components/ui/alert";
import { Breadcrumb } from "@/components/ui/breadcrumb";
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
import { Textarea } from "@/components/ui/textarea";
import { ToastStack, type ToastStackItem } from "@/components/ui/toast-stack";
import {
  deleteProcessoDocumento,
  resolveServerAssetUrl,
  uploadProcessoDocumento,
} from "@/lib/document-upload";
import {
  formatCurrencyBRL,
  formatNumberBR,
  formatShortDateBR,
  formatShortDateTimeBR,
  maskCurrencyInputBR,
  normalizeCurrencyInputBR,
} from "@/lib/formatters";
import {
  processLicitacaoSd,
  type SdParseResult,
  vincularSdAoProcesso,
} from "@/lib/sd-parser";
import {
  getCriticalStatusKind,
  getCriticalStatusKindLabel,
} from "@/lib/process-status-critical";
import { cleanDisplayText } from "@/lib/text";
import { trpc } from "@/lib/trpc";

interface LicitacaoProcessoPageProps {
  processoId: number;
}

interface UploadFormState {
  titulo: string;
  descricao: string;
  arquivo: File | null;
}

type ChecklistFlexStatus = (typeof licitacaoChecklistFlexStatusOptions)[number];

interface ChecklistFlexFormState {
  statusFlexivel: ChecklistFlexStatus;
  justificativa: string;
  departamentoResponsavel: string;
  previsaoRecebimento: string;
  processoFisicoNumero: string;
  localArquivamento: string;
  digitalizarDepois: boolean;
}

interface ChecklistCardItem extends LicitacaoDocumentRequirement {
  concluido: boolean;
  naoAplicavel?: boolean;
  statusFlexivel?: ChecklistFlexStatus;
  justificativaNaoAplicavel?: string | null;
  departamentoResponsavel?: string | null;
  previsaoRecebimento?: string | null;
  processoFisicoNumero?: string | null;
  localArquivamento?: string | null;
  digitalizarDepois?: boolean;
  documentos: {
    id: number;
    categoria: string | null;
    titulo: string;
    arquivoUrl: string | null;
    criadoEm: string | Date;
  }[];
  statusOrigem?: string;
}

const initialUploadForm: UploadFormState = {
  titulo: "",
  descricao: "",
  arquivo: null,
};

const initialChecklistFlexFormState: ChecklistFlexFormState = {
  statusFlexivel: "PADRAO",
  justificativa: "",
  departamentoResponsavel: "",
  previsaoRecebimento: "",
  processoFisicoNumero: "",
  localArquivamento: "",
  digitalizarDepois: false,
};

const initialPropostaForm = {
  licitanteId: "",
  itemId: "",
  valorUnitarioProposto: "",
  dataProposta: "",
  classificacao: "",
  situacao: "VALIDA",
  justificativa: "",
};

const initialLanceForm = {
  propostaId: "",
  valorLance: "",
  dataLance: "",
  observacao: "",
};

const initialHabilitacaoForm = {
  licitanteId: "",
  statusHabilitacao: "PENDENTE",
  observacaoHabilitacao: "",
};

const initialRecursoForm = {
  licitanteId: "",
  dataInterposicao: "",
  dataJulgamento: "",
  resultado: "PENDENTE",
  descricao: "",
  decisao: "",
};

const initialHomologacaoForm = {
  dataHomologacao: "",
  statusId: "",
  dataStatus: "",
  observacao: "",
};

type SdItemDraft = {
  numero: string;
  descricao: string;
  unidade: string;
  quantidade: string;
  preco_unitario: string;
  preco_total: string;
};

type SdItemView = {
  numero?: number;
  descricao?: string;
  unidade?: string;
  quantidade?: number;
  preco_unitario?: number;
  preco_total?: number;
  fonte?: "parser" | "manual";
  manualIndex?: number;
};

type LicitacaoLinearPhaseKey =
  | "PREPARACAO"
  | "PUBLICACAO"
  | "DISPUTA"
  | "JULGAMENTO_HABILITACAO"
  | "RECURSOS_HOMOLOGACAO"
  | "FECHAMENTO";

type LicitacaoOperationModalKey =
  | "proposta"
  | "lance"
  | "habilitacao"
  | "recurso"
  | "homologacao";

const licitacaoLinearPhaseOrder: LicitacaoLinearPhaseKey[] = [
  "PREPARACAO",
  "PUBLICACAO",
  "DISPUTA",
  "JULGAMENTO_HABILITACAO",
  "RECURSOS_HOMOLOGACAO",
  "FECHAMENTO",
];

const LICITACAO_TABLE_PAGE_SIZE = 8;

const LicitacaoProcessoAuditoriaContent = lazy(
  () => import("@/components/licitacao/licitacao-processo-auditoria-content"),
);
const LicitacaoProcessoHistoryContent = lazy(
  () => import("@/components/licitacao/licitacao-processo-history-content"),
);
const LicitacaoProcessoDocumentosModalContent = lazy(
  () =>
    import("@/components/licitacao/licitacao-processo-documentos-modal-content"),
);
const CIReservaOrcamentariaModal = lazy(
  () => import("@/components/licitacao/ci-reserva-orcamentaria-modal"),
);

type LicitacaoToastTone = ToastStackItem["tone"];
const CI_RESERVA_ORCAMENTARIA_CATEGORY =
  "LICITACAO_COMUNICACAO_RESERVA_ORCAMENTARIA";

const DEFAULT_SD_ITEM_DRAFT: SdItemDraft = {
  numero: "",
  descricao: "",
  unidade: "",
  quantidade: "",
  preco_unitario: "",
  preco_total: "",
};

function toDateInputValue(value: string | Date | null | undefined) {
  if (!value) return "";
  const source =
    value instanceof Date
      ? value
      : /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? new Date(`${value}T12:00:00`)
        : new Date(value);
  if (Number.isNaN(source.getTime())) return "";
  const year = source.getFullYear();
  const month = String(source.getMonth() + 1).padStart(2, "0");
  const day = String(source.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toDateTimeStart(value?: string) {
  return value?.trim() ? `${value}T08:00:00` : undefined;
}

function toDateTimeLocalValue(value: string | Date | null | undefined) {
  if (!value) return "";
  const source =
    value instanceof Date
      ? value
      : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)
        ? new Date(value)
        : /^\d{4}-\d{2}-\d{2}$/.test(value)
          ? new Date(`${value}T12:00:00`)
          : new Date(value);
  if (Number.isNaN(source.getTime())) return "";
  const year = source.getFullYear();
  const month = String(source.getMonth() + 1).padStart(2, "0");
  const day = String(source.getDate()).padStart(2, "0");
  const hours = String(source.getHours()).padStart(2, "0");
  const minutes = String(source.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function toTimeInputValue(value: string | Date | null | undefined) {
  if (!value) return "08:30";
  const source =
    value instanceof Date
      ? value
      : /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? new Date(`${value}T12:00:00`)
        : new Date(value);
  if (Number.isNaN(source.getTime())) return "08:30";
  return `${String(source.getHours()).padStart(2, "0")}:${String(source.getMinutes()).padStart(2, "0")}`;
}

function combineDateAndTime(date: Date, hours = 8, minutes = 0) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    hours,
    minutes,
    0,
    0,
  );
}

function parseTimeInput(value?: string) {
  const match = String(value ?? "").match(/^(\d{2}):(\d{2})$/);
  if (!match) {
    return { hours: 8, minutes: 30 };
  }

  return {
    hours: Number(match[1]),
    minutes: Number(match[2]),
  };
}

function normalizeHolidayDates(values: Array<string | Date> = []) {
  return values
    .map((value) => {
      if (value instanceof Date) return value;
      const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? new Date(`${value}T12:00:00`)
        : new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    })
    .filter((value): value is Date => Boolean(value));
}

function formatAuditValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function isStepAtOrBeyond(
  currentStatus: string | undefined,
  targets: string[],
) {
  if (!currentStatus) return false;
  const current = mapStatusToVisualStep(currentStatus);
  const order = [
    "PREPARACAO_INTERNA",
    "PUBLICACAO",
    "RECEBIMENTO_PROPOSTAS",
    "LANCES",
    "JULGAMENTO",
    "HABILITACAO",
    "RECURSOS",
    "HOMOLOGACAO",
  ];
  const currentIndex = order.indexOf(current);
  return targets.some(
    (target) =>
      order.indexOf(target) > -1 && currentIndex >= order.indexOf(target),
  );
}

function buildSchedulePreview(params: {
  modalidadeCodigo?: string | null;
  tipoObjeto?: string | null;
  criterioJulgamento?: string | null;
  dataPublicacaoEdital?: string;
  publicarNoDou?: boolean;
  publicarEmJornal?: boolean;
  horaDisputa?: string;
  acrescimoMunicipal?: number;
  feriadosLocais?: Array<string | Date>;
}) {
  if (!params.modalidadeCodigo || !params.dataPublicacaoEdital) return null;

  const publicacaoDia = new Date(`${params.dataPublicacaoEdital}T12:00:00`);
  const holidayDates = normalizeHolidayDates(params.feriadosLocais);
  const legalWindow = calcularPrazoLegalMinimo({
    dataPublicacaoPNCP: publicacaoDia,
    modalidadeCodigo: params.modalidadeCodigo,
    tipoObjeto: params.tipoObjeto,
    criterioJulgamento: params.criterioJulgamento,
    feriadosLocais: holidayDates,
    acrescimoMunicipal: params.acrescimoMunicipal ?? 1,
    publicarNoDou: params.publicarNoDou,
    publicarEmJornal: params.publicarEmJornal,
  });
  const disputeTime = parseTimeInput(params.horaDisputa);
  const abertura = combineDateAndTime(
    legalWindow.dataMinima,
    disputeTime.hours,
    disputeTime.minutes,
  );
  const encerramento = new Date(abertura.getTime() - 15 * 60 * 1000);

  return {
    baseDays: legalWindow.diasUteisLegais,
    municipioExtra: legalWindow.acrescimoMunicipal,
    canaisExtra: legalWindow.acrescimoCanais,
    startOffset:
      1 + legalWindow.acrescimoMunicipal + legalWindow.acrescimoCanais,
    totalBusinessDays: legalWindow.diasUteisTotais,
    regraAplicada: legalWindow.regraAplicada,
    dataMinimaLegal: legalWindow.dataMinima,
    dataInicioContagem: legalWindow.dataInicioContagem,
    dataPublicacaoEdital: publicacaoDia,
    horaDisputa: `${String(disputeTime.hours).padStart(2, "0")}:${String(disputeTime.minutes).padStart(2, "0")}`,
    dataRecebimentoPropostasInicio: combineDateAndTime(
      legalWindow.dataInicioContagem,
      8,
      0,
    ),
    dataRecebimentoPropostasFim: encerramento,
    dataAberturaPropostas: abertura,
  };
}

function getUploadState(
  state: Record<string, UploadFormState>,
  category: string,
) {
  return state[category] ?? initialUploadForm;
}

function mapStatusToVisualStep(status: string) {
  switch (status) {
    case "PREPARACAO":
      return "PREPARACAO_INTERNA";
    case "PUBLICACAO":
      return "PUBLICACAO";
    case "RECEBIMENTO_PROPOSTAS":
    case "ABERTURA_PROPOSTAS":
      return "RECEBIMENTO_PROPOSTAS";
    case "LANCES":
      return "LANCES";
    case "JULGAMENTO":
      return "JULGAMENTO";
    case "HABILITACAO":
      return "HABILITACAO";
    case "RECURSOS":
      return "RECURSOS";
    case "HOMOLOGACAO":
    case "CONTRATACAO":
      return "HOMOLOGACAO";
    default:
      return "PREPARACAO_INTERNA";
  }
}

function isLicitacaoLinearPhaseKey(
  value: string | null | undefined,
): value is LicitacaoLinearPhaseKey {
  return (
    value === "PREPARACAO" ||
    value === "PUBLICACAO" ||
    value === "DISPUTA" ||
    value === "JULGAMENTO_HABILITACAO" ||
    value === "RECURSOS_HOMOLOGACAO" ||
    value === "FECHAMENTO"
  );
}

function resolveLinearPhaseFromVisualStep(
  step: string,
  homologado: boolean,
): LicitacaoLinearPhaseKey {
  if (homologado) {
    return "FECHAMENTO";
  }

  switch (step) {
    case "PREPARACAO_INTERNA":
      return "PREPARACAO";
    case "PUBLICACAO":
      return "PUBLICACAO";
    case "RECEBIMENTO_PROPOSTAS":
    case "LANCES":
      return "DISPUTA";
    case "JULGAMENTO":
    case "HABILITACAO":
      return "JULGAMENTO_HABILITACAO";
    case "RECURSOS":
    case "HOMOLOGACAO":
      return "RECURSOS_HOMOLOGACAO";
    default:
      return "PREPARACAO";
  }
}

function paginateItems<T>(
  items: T[],
  page: number,
  pageSize = LICITACAO_TABLE_PAGE_SIZE,
) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const startIndex = (safePage - 1) * pageSize;

  return {
    items: items.slice(startIndex, startIndex + pageSize),
    page: safePage,
    totalPages,
    totalItems: items.length,
  };
}

function isChecklistItemAddressed(item: ChecklistCardItem) {
  return (
    item.concluido ||
    item.naoAplicavel ||
    (item.statusFlexivel != null && item.statusFlexivel !== "PADRAO")
  );
}

function getChecklistItemStatusLabel(item: ChecklistCardItem) {
  if (item.statusFlexivel && item.statusFlexivel !== "PADRAO") {
    return licitacaoChecklistFlexStatusLabels[item.statusFlexivel];
  }

  return item.concluido ? "Anexado" : "Pendente";
}

function getChecklistItemStatusClassName(item: ChecklistCardItem) {
  if (item.statusFlexivel === "OUTRO_SETOR") {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }

  if (item.statusFlexivel === "CONCLUIDO_FISICO") {
    return "border-violet-200 bg-violet-50 text-violet-700";
  }

  if (item.naoAplicavel) {
    return "border-slate-200 bg-slate-100 text-slate-700";
  }

  if (item.concluido) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  return "border-amber-200 bg-amber-50 text-amber-700";
}

export function LicitacaoProcessoPage({
  processoId,
}: LicitacaoProcessoPageProps) {
  const utils = trpc.useUtils();
  const [, setLocation] = useLocation();
  const detailQuery = trpc.licitacao.detail.useQuery(
    { processoId },
    { retry: false },
  );
  const documentosQuery = trpc.documentos.listByProcesso.useQuery(
    { processoId },
    { retry: false },
  );
  const catalogsQuery = trpc.cadastros.formOptions.useQuery(undefined, {
    retry: false,
  });
  const acrescimoMunicipalQuery = trpc.parametros.obterValor.useQuery(
    { chave: "PRAZOS.MUNICIPIO.ACRESCIMO_DIAS_UTEIS" },
    { retry: false },
  );
  const feriadosLocaisQuery = trpc.parametros.obterValor.useQuery(
    { chave: "PRAZOS.MUNICIPIO.FERIADOS_LOCAIS" },
    { retry: false },
  );

  const [currentPhase, setCurrentPhase] =
    useState<LicitacaoLinearPhaseKey>("PREPARACAO");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toastItems, setToastItems] = useState<ToastStackItem[]>([]);
  const [deletingDocumentoId, setDeletingDocumentoId] = useState<number | null>(
    null,
  );
  const [showAllDocsModal, setShowAllDocsModal] = useState(false);
  const [showCIReservaModal, setShowCIReservaModal] = useState(false);
  const [contractTransitionOpen, setContractTransitionOpen] = useState(false);
  const [operationModal, setOperationModal] =
    useState<LicitacaoOperationModalKey | null>(null);
  const [uploadForms, setUploadForms] = useState<
    Record<string, UploadFormState>
  >({});
  const [sectionOpen, setSectionOpen] = useState({
    overview: true,
    internal: false,
    external: false,
    docs: false,
    publication: false,
    licitantes: false,
    propostas: false,
    lances: false,
    julgamento: false,
    habilitacao: false,
    recursos: false,
    homologacao: false,
    auditoria: false,
    history: false,
  });
  type SectionKey = keyof typeof sectionOpen;
  const [configForm, setConfigForm] = useState({
    criterioJulgamento: "",
    modoDisputa: "NAO_SE_APLICA",
    exigeDeclaracaoNaoFracionamento: false,
    publicarNoDou: false,
    publicarEmJornal: false,
    inversaoFasesHabilitada: false,
    inversaoFasesJustificativa: "",
    observacoes: "",
  });
  const [manualScheduleForm, setManualScheduleForm] = useState({
    dataRecebimentoPropostasInicio: "",
    dataRecebimentoPropostasFim: "",
    dataAberturaPropostas: "",
    dataInicioLances: "",
    dataFimLances: "",
    dataJulgamento: "",
  });
  const [checklistNaoAplicavelForm, setChecklistNaoAplicavelForm] = useState<
    Record<string, ChecklistFlexFormState>
  >({});
  const [legalDateOverrideJustification, setLegalDateOverrideJustification] =
    useState("");
  const [auditJustification, setAuditJustification] = useState("");
  const [auditActionFilter, setAuditActionFilter] = useState("");
  const [auditUserFilter, setAuditUserFilter] = useState("");
  const [
    selectedInternalChecklistCategory,
    setSelectedInternalChecklistCategory,
  ] = useState<string | null>(null);
  const [internalChecklistRevealCount, setInternalChecklistRevealCount] =
    useState(3);
  const [showResolvedInternalChecklist, setShowResolvedInternalChecklist] =
    useState(false);
  const [publishForm, setPublishForm] = useState({
    condutorProcessoId: "",
    statusId: "",
    dataStatus: "",
    dataPublicacaoEdital: "",
    horaDisputa: "08:30",
    linkBllPublico: "",
    linkPncpPublico: "",
    descricao: "",
    observacao: "",
  });
  const [licitanteFornecedorId, setLicitanteFornecedorId] = useState("");
  const [propostaForm, setPropostaForm] = useState(initialPropostaForm);
  const [lanceForm, setLanceForm] = useState(initialLanceForm);
  const [habilitacaoForm, setHabilitacaoForm] = useState(
    initialHabilitacaoForm,
  );
  const [recursoForm, setRecursoForm] = useState(initialRecursoForm);
  const [homologacaoForm, setHomologacaoForm] = useState(
    initialHomologacaoForm,
  );
  const [propostasPage, setPropostasPage] = useState(1);
  const [lancesPage, setLancesPage] = useState(1);
  const [habilitacaoPage, setHabilitacaoPage] = useState(1);
  const [recursosPage, setRecursosPage] = useState(1);
  const [auditoriaPage, setAuditoriaPage] = useState(1);
  const [sdFile, setSdFile] = useState<File | null>(null);
  const [sdParsing, setSdParsing] = useState(false);
  const [sdError, setSdError] = useState<string | null>(null);
  const [sdResult, setSdResult] = useState<SdParseResult | null>(null);
  const [manualSdItems, setManualSdItems] = useState<SdItemView[]>([]);
  const [sdItemDraft, setSdItemDraft] = useState<SdItemDraft>(
    DEFAULT_SD_ITEM_DRAFT,
  );
  const [manualSdItemError, setManualSdItemError] = useState<string | null>(
    null,
  );
  const [sdVinculando, setSdVinculando] = useState(false);
  const [sdVinculacaoError, setSdVinculacaoError] = useState<string | null>(
    null,
  );

  const overviewRef = useRef<HTMLElement | null>(null);
  const internalRef = useRef<HTMLElement | null>(null);
  const externalRef = useRef<HTMLElement | null>(null);
  const docsRef = useRef<HTMLElement | null>(null);
  const publicationRef = useRef<HTMLElement | null>(null);
  const licitantesRef = useRef<HTMLElement | null>(null);
  const propostasRef = useRef<HTMLElement | null>(null);
  const lancesRef = useRef<HTMLElement | null>(null);
  const julgamentoRef = useRef<HTMLElement | null>(null);
  const habilitacaoRef = useRef<HTMLElement | null>(null);
  const recursosRef = useRef<HTMLElement | null>(null);
  const homologacaoRef = useRef<HTMLElement | null>(null);
  const auditoriaRef = useRef<HTMLElement | null>(null);
  const historyRef = useRef<HTMLElement | null>(null);
  const toastIdRef = useRef(1);
  const toastTimersRef = useRef<Record<number, ReturnType<typeof setTimeout>>>(
    {},
  );

  function dismissToast(id: number) {
    const timer = toastTimersRef.current[id];
    if (timer) {
      clearTimeout(timer);
      delete toastTimersRef.current[id];
    }

    setToastItems((current) => current.filter((item) => item.id !== id));
  }

  function queueToast(
    tone: LicitacaoToastTone,
    title: string,
    message: string,
  ) {
    const id = toastIdRef.current;
    toastIdRef.current += 1;

    setToastItems((current) => {
      const next = [...current, { id, tone, title, message }];
      if (next.length <= 4) return next;

      const removed = next.slice(0, next.length - 4);
      removed.forEach((item) => {
        const timer = toastTimersRef.current[item.id];
        if (timer) {
          clearTimeout(timer);
          delete toastTimersRef.current[item.id];
        }
      });
      return next.slice(-4);
    });

    toastTimersRef.current[id] = setTimeout(
      () => dismissToast(id),
      tone === "error" ? 7200 : 4800,
    );
  }

  useEffect(() => {
    if (!feedback) return;
    queueToast("success", "Atualizacao registrada", feedback);
    setFeedback(null);
  }, [feedback]);

  useEffect(() => {
    if (!errorMessage) return;
    queueToast("error", "Operacao com atencao", errorMessage);
    setErrorMessage(null);
  }, [errorMessage]);

  useEffect(
    () => () => {
      Object.values(toastTimersRef.current).forEach((timer) =>
        clearTimeout(timer),
      );
      toastTimersRef.current = {};
    },
    [],
  );

  useEffect(() => {
    const detail = detailQuery.data;
    if (!detail) return;

    setConfigForm({
      criterioJulgamento: detail.processo.criterioJulgamento ?? "",
      modoDisputa: detail.processo.modoDisputa ?? "NAO_SE_APLICA",
      exigeDeclaracaoNaoFracionamento:
        detail.licitacao.exigeDeclaracaoNaoFracionamento ?? false,
      publicarNoDou: detail.licitacao.publicarNoDou ?? false,
      publicarEmJornal: detail.licitacao.publicarEmJornal ?? false,
      inversaoFasesHabilitada:
        detail.licitacao.inversaoFasesHabilitada ?? false,
      inversaoFasesJustificativa:
        detail.licitacao.inversaoFasesJustificativa ?? "",
      observacoes: detail.licitacao.observacoes ?? "",
    });

    setManualScheduleForm({
      dataRecebimentoPropostasInicio: toDateTimeLocalValue(
        detail.licitacao.dataRecebimentoPropostasInicio,
      ),
      dataRecebimentoPropostasFim: toDateTimeLocalValue(
        detail.licitacao.dataRecebimentoPropostasFim,
      ),
      dataAberturaPropostas: toDateTimeLocalValue(
        detail.licitacao.dataAberturaPropostas,
      ),
      dataInicioLances: toDateTimeLocalValue(detail.licitacao.dataInicioLances),
      dataFimLances: toDateTimeLocalValue(detail.licitacao.dataFimLances),
      dataJulgamento: toDateTimeLocalValue(detail.licitacao.dataJulgamento),
    });

    setPublishForm({
      condutorProcessoId: detail.processo.condutorProcesso?.id
        ? String(detail.processo.condutorProcesso.id)
        : "",
      statusId: detail.processo.statusId
        ? String(detail.processo.statusId)
        : "",
      dataStatus: "",
      dataPublicacaoEdital: toDateInputValue(
        detail.licitacao.dataPublicacaoEdital,
      ),
      horaDisputa: toTimeInputValue(detail.licitacao.dataAberturaPropostas),
      linkBllPublico: detail.licitacao.linkBllPublico ?? "",
      linkPncpPublico: detail.licitacao.linkPncpPublico ?? "",
      descricao: detail.processo.numeroEdital
        ? `Publicacao do edital ${detail.processo.numeroEdital}`
        : `Publicacao do processo ${detail.processo.numeroSirel}`,
      observacao: detail.licitacao.observacoes ?? "",
    });

    setLicitanteFornecedorId(
      (current) =>
        current ||
        (catalogsQuery.data?.fornecedores[0]?.id
          ? String(catalogsQuery.data.fornecedores[0].id)
          : ""),
    );
    setPropostaForm((current) => ({
      ...current,
      licitanteId:
        current.licitanteId ||
        (detail.licitantes[0]?.id ? String(detail.licitantes[0].id) : ""),
      itemId:
        current.itemId ||
        (detail.itens[0]?.id ? String(detail.itens[0].id) : ""),
    }));
    setLanceForm((current) => ({
      ...current,
      propostaId:
        current.propostaId ||
        (detail.propostas[0]?.id ? String(detail.propostas[0].id) : ""),
    }));
    setHabilitacaoForm((current) => ({
      ...current,
      licitanteId:
        current.licitanteId ||
        (detail.licitantes[0]?.id ? String(detail.licitantes[0].id) : ""),
    }));
    setRecursoForm((current) => ({
      ...current,
      licitanteId:
        current.licitanteId ||
        (detail.licitantes[0]?.id ? String(detail.licitantes[0].id) : ""),
    }));
    setHomologacaoForm((current) => ({
      ...current,
      statusId:
        current.statusId ||
        (detail.processo.statusId ? String(detail.processo.statusId) : ""),
      dataHomologacao:
        current.dataHomologacao ||
        toDateInputValue(detail.licitacao.dataHomologacao),
      dataStatus: "",
    }));

    setChecklistNaoAplicavelForm((current) => {
      const next = { ...current };
      detail.checklistInterno?.itens?.forEach((item) => {
        next[item.category] = {
          statusFlexivel:
            item.statusFlexivel ??
            (item.naoAplicavel ? "NAO_APLICAVEL" : "PADRAO"),
          justificativa: item.justificativaNaoAplicavel ?? "",
          departamentoResponsavel: item.departamentoResponsavel ?? "",
          previsaoRecebimento: toDateInputValue(item.previsaoRecebimento),
          processoFisicoNumero: item.processoFisicoNumero ?? "",
          localArquivamento: item.localArquivamento ?? "",
          digitalizarDepois: item.digitalizarDepois ?? false,
        };
      });
      return next;
    });

    setAuditJustification("");
  }, [catalogsQuery.data, detailQuery.data]);

  useEffect(() => {
    setSdFile(null);
    setSdParsing(false);
    setSdError(null);
    setSdResult(null);
    setManualSdItems([]);
    setSdItemDraft(DEFAULT_SD_ITEM_DRAFT);
    setManualSdItemError(null);
    setSdVinculando(false);
    setSdVinculacaoError(null);
  }, [processoId]);

  const saveConfiguracaoMutation = trpc.licitacao.saveConfiguracao.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.licitacao.detail.invalidate({ processoId }),
        utils.licitacao.list.invalidate(),
        utils.licitacao.summary.invalidate(),
        utils.prazos.list.invalidate(),
        utils.prazos.summary.invalidate(),
        utils.workflow.byProcesso.invalidate({ processoId }),
        utils.processos.overview.invalidate({ processoId }),
      ]);
      setErrorMessage(null);
      setFeedback("Configuracao interna da Licitacao salva com sucesso.");
    },
    onError: (error) => {
      setFeedback(null);
      setErrorMessage(error.message);
    },
  });

  const publishMutation = trpc.licitacao.publish.useMutation({
    onSuccess: async (payload) => {
      await Promise.all([
        utils.licitacao.detail.invalidate({ processoId }),
        utils.licitacao.list.invalidate(),
        utils.licitacao.summary.invalidate(),
        utils.prazos.list.invalidate(),
        utils.prazos.summary.invalidate(),
        utils.workflow.byProcesso.invalidate({ processoId }),
        utils.workflow.list.invalidate(),
        utils.processos.list.invalidate(),
        utils.processos.overview.invalidate({ processoId }),
      ]);
      setErrorMessage(null);
      setFeedback(
        `Processo publicado com sucesso. Edital gerado: ${payload.numeroEdital}.`,
      );
    },
    onError: (error) => {
      setFeedback(null);
      setErrorMessage(error.message);
    },
  });
  const setChecklistNaoAplicavelMutation =
    trpc.licitacao.setChecklistNaoAplicavel.useMutation({
      onSuccess: async () => {
        await refreshAll();
        setErrorMessage(null);
        setFeedback("Checklist atualizado com sucesso.");
      },
      onError: (error) => {
        setFeedback(null);
        setErrorMessage(error.message);
      },
    });
  const saveLicitanteMutation = trpc.licitacao.saveLicitante.useMutation({
    onSuccess: async () => {
      await refreshAll();
      setFeedback("Licitante vinculado a Licitacao com sucesso.");
      setErrorMessage(null);
    },
    onError: (error) => {
      setFeedback(null);
      setErrorMessage(error.message);
    },
  });
  const deleteLicitanteMutation = trpc.licitacao.deleteLicitante.useMutation({
    onSuccess: async () => {
      await refreshAll();
      setFeedback("Licitante retirado da disputa.");
      setErrorMessage(null);
    },
    onError: (error) => {
      setFeedback(null);
      setErrorMessage(error.message);
    },
  });
  const savePropostaMutation = trpc.licitacao.saveProposta.useMutation({
    onSuccess: async () => {
      await refreshAll();
      setPropostaForm((current) => ({
        ...initialPropostaForm,
        licitanteId: current.licitanteId,
        itemId: current.itemId,
      }));
      setOperationModal(null);
      setFeedback("Proposta registrada com sucesso.");
      setErrorMessage(null);
    },
    onError: (error) => {
      setFeedback(null);
      setErrorMessage(error.message);
    },
  });
  const saveLanceMutation = trpc.licitacao.saveLance.useMutation({
    onSuccess: async () => {
      await refreshAll();
      setLanceForm((current) => ({
        ...initialLanceForm,
        propostaId: current.propostaId,
      }));
      setOperationModal(null);
      setFeedback("Lance registrado com sucesso.");
      setErrorMessage(null);
    },
    onError: (error) => {
      setFeedback(null);
      setErrorMessage(error.message);
    },
  });
  const saveHabilitacaoMutation = trpc.licitacao.saveHabilitacao.useMutation({
    onSuccess: async () => {
      await refreshAll();
      setOperationModal(null);
      setFeedback("Situacao de habilitacao atualizada.");
      setErrorMessage(null);
    },
    onError: (error) => {
      setFeedback(null);
      setErrorMessage(error.message);
    },
  });
  const saveRecursoMutation = trpc.licitacao.saveRecurso.useMutation({
    onSuccess: async () => {
      await refreshAll();
      setRecursoForm((current) => ({
        ...initialRecursoForm,
        licitanteId: current.licitanteId,
      }));
      setOperationModal(null);
      setFeedback("Recurso administrativo registrado.");
      setErrorMessage(null);
    },
    onError: (error) => {
      setFeedback(null);
      setErrorMessage(error.message);
    },
  });
  const advanceStageMutation = trpc.licitacao.advanceStage.useMutation({
    onSuccess: async () => {
      await refreshAll();
      setFeedback("Etapa da Licitacao atualizada.");
      setErrorMessage(null);
    },
    onError: (error) => {
      setFeedback(null);
      setErrorMessage(error.message);
    },
  });
  const homologarMutation = trpc.licitacao.homologar.useMutation({
    onSuccess: async () => {
      await refreshAll();
      setOperationModal(null);
      setFeedback("Licitacao homologada com sucesso.");
      setErrorMessage(null);
    },
    onError: (error) => {
      setFeedback(null);
      setErrorMessage(error.message);
    },
  });
  const advanceMacroPhaseMutation =
    trpc.processos.advanceMacroPhase.useMutation({
      onSuccess: async () => {
        await Promise.all([
          refreshAll(),
          utils.processos.list.invalidate(),
          utils.processos.summary.invalidate(),
          utils.processos.macroPhaseGate.invalidate({
            processoId,
            moduloDestino: "CONTRATOS",
          }),
          utils.workflow.list.invalidate(),
          utils.contratos.list.invalidate(),
          utils.contratos.summary.invalidate(),
        ]);
        setErrorMessage(null);
        setFeedback("Processo encaminhado para Contratos com sucesso.");
        setContractTransitionOpen(false);
      },
      onError: (error) => {
        setFeedback(null);
        setErrorMessage(error.message);
      },
    });
  const detalhe = detailQuery.data;
  const documentos = documentosQuery.data ?? [];
  const mergedSdItems = useMemo<SdItemView[]>(() => {
    if (!sdResult) return [];
    const parsedItems = sdResult.itens.map((item) => ({
      ...item,
      fonte: "parser" as const,
    }));
    const localManualItems = manualSdItems.map((item, index) => ({
      ...item,
      manualIndex: index,
    }));
    return [...parsedItems, ...localManualItems];
  }, [manualSdItems, sdResult]);
  const itensVinculadosValorTotal = useMemo(
    () =>
      (detalhe?.itens ?? []).reduce(
        (acc, item) => acc + Number(item.valorTotalEstimado ?? 0),
        0,
      ),
    [detalhe?.itens],
  );
  const isForaDoFluxo = detalhe?.processo.foraDoFluxo ?? false;
  const inversaoFasesAtiva = configForm.inversaoFasesHabilitada;
  const flowConfig = getLicitacaoFlowConfig({
    modalidadeCodigo: detalhe?.processo.modalidadeCodigo,
    modoDisputa: detalhe?.processo.modoDisputa,
    suportaLances: detalhe?.processo.suportaLances,
  });
  const fluxoLicitacao = flowConfig.fluxo;
  const showCompetitivoSteps = flowConfig.showCompetitivoSteps;
  const showLances = flowConfig.showLances;
  const showRecursos = flowConfig.showRecursos;
  const flowStepKeys = flowConfig.stepKeys;
  const modalidadeHelp = getLicitacaoModalidadeHelp(
    detalhe?.processo.modalidadeCodigo,
    detalhe?.processo.modoDisputa,
  );
  const auditoriaQuery = trpc.auditoria.list.useQuery(
    {
      page: 1,
      pageSize: 25,
      processoId,
      acao: auditActionFilter
        ? (auditActionFilter as "CREATE" | "UPDATE" | "DELETE")
        : undefined,
      usuarioId: auditUserFilter ? Number(auditUserFilter) : undefined,
    },
    { enabled: isForaDoFluxo },
  );
  const orderedFlowStepKeys = (() => {
    if (!inversaoFasesAtiva) return flowStepKeys;
    if (!flowStepKeys.includes("HABILITACAO")) return flowStepKeys;
    const withoutHabilitacao = flowStepKeys.filter(
      (key) => key !== "HABILITACAO",
    );
    const publicationIndex = withoutHabilitacao.indexOf("PUBLICACAO");
    if (publicationIndex === -1) return flowStepKeys;
    return [
      ...withoutHabilitacao.slice(0, publicationIndex + 1),
      "HABILITACAO",
      ...withoutHabilitacao.slice(publicationIndex + 1),
    ];
  })();
  const flowSteps = orderedFlowStepKeys
    .map((key) => licitacaoStepCatalog.find((item) => item.key === key))
    .filter((item): item is (typeof licitacaoStepCatalog)[number] =>
      Boolean(item),
    );
  const docsByCategory = useMemo(() => {
    const grouped = new Map<string, typeof documentos>();
    documentos.forEach((documento) => {
      const category = documento.categoria?.trim() || "__SEM_CATEGORIA__";
      grouped.set(category, [...(grouped.get(category) ?? []), documento]);
    });
    return grouped;
  }, [documentos]);

  const blueprint = useMemo(
    () =>
      getLicitacaoDocumentBlueprint({
        modalidadeCodigo: detalhe?.processo.modalidadeCodigo,
        exigeDeclaracaoNaoFracionamento:
          configForm.exigeDeclaracaoNaoFracionamento,
      }),
    [
      configForm.exigeDeclaracaoNaoFracionamento,
      detalhe?.processo.modalidadeCodigo,
    ],
  );

  const serverChecklistMap = useMemo(() => {
    const map = new Map<
      string,
      {
        category: string;
        concluido: boolean;
        naoAplicavel?: boolean;
        statusFlexivel?: ChecklistFlexStatus;
        justificativaNaoAplicavel?: string | null;
        departamentoResponsavel?: string | null;
        previsaoRecebimento?: string | null;
        processoFisicoNumero?: string | null;
        localArquivamento?: string | null;
        digitalizarDepois?: boolean;
        documentos?: ChecklistCardItem["documentos"];
      }
    >();
    (detalhe?.checklistInterno.itens ?? []).forEach((item) => {
      map.set(item.category, item);
    });
    return map;
  }, [detalhe?.checklistInterno.itens]);

  const checklistItems = useMemo<ChecklistCardItem[]>(
    () =>
      blueprint.internal.map((item) => {
        const serverItem = serverChecklistMap.get(item.category);
        const documentosCategoria =
          docsByCategory.get(item.category) ?? serverItem?.documentos ?? [];
        return {
          ...item,
          concluido: serverItem?.concluido ?? documentosCategoria.length > 0,
          naoAplicavel: serverItem?.naoAplicavel ?? false,
          statusFlexivel:
            serverItem?.statusFlexivel ??
            (serverItem?.naoAplicavel ? "NAO_APLICAVEL" : "PADRAO"),
          justificativaNaoAplicavel:
            serverItem?.justificativaNaoAplicavel ?? null,
          departamentoResponsavel: serverItem?.departamentoResponsavel ?? null,
          previsaoRecebimento: serverItem?.previsaoRecebimento ?? null,
          processoFisicoNumero: serverItem?.processoFisicoNumero ?? null,
          localArquivamento: serverItem?.localArquivamento ?? null,
          digitalizarDepois: serverItem?.digitalizarDepois ?? false,
          documentos: documentosCategoria,
        };
      }),
    [blueprint.internal, docsByCategory, serverChecklistMap],
  );

  const pendingRequired = checklistItems.filter(
    (item) => item.obrigatorio && !item.concluido,
  );
  const progressCount = checklistItems.filter((item) => item.concluido).length;
  const addressedChecklistItems = checklistItems.filter(
    isChecklistItemAddressed,
  );
  const unresolvedChecklistItems = checklistItems.filter(
    (item) => !isChecklistItemAddressed(item),
  );
  const internalChecklistLeadIndex = unresolvedChecklistItems.length
    ? checklistItems.findIndex(
        (item) => item.category === unresolvedChecklistItems[0]?.category,
      )
    : Math.max(0, checklistItems.length - internalChecklistRevealCount);
  const visibleInternalChecklistItems = checklistItems.slice(
    Math.max(0, internalChecklistLeadIndex),
    Math.max(0, internalChecklistLeadIndex) + internalChecklistRevealCount,
  );
  const hiddenInternalChecklistCount = Math.max(
    0,
    checklistItems.length -
      (Math.max(0, internalChecklistLeadIndex) + internalChecklistRevealCount),
  );
  const resolvedInternalChecklistPreview = showResolvedInternalChecklist
    ? addressedChecklistItems
    : addressedChecklistItems.slice(
        Math.max(0, addressedChecklistItems.length - 3),
      );
  const selectedInternalChecklistItem =
    checklistItems.find(
      (item) => item.category === selectedInternalChecklistCategory,
    ) ??
    unresolvedChecklistItems[0] ??
    visibleInternalChecklistItems[0] ??
    checklistItems[0] ??
    null;
  const selectedInternalChecklistIndex = selectedInternalChecklistItem
    ? checklistItems.findIndex(
        (item) => item.category === selectedInternalChecklistItem.category,
      ) + 1
    : 0;
  const selectedInternalLatestDocumento = selectedInternalChecklistItem
    ? (selectedInternalChecklistItem.documentos
        .slice()
        .sort(
          (left, right) =>
            new Date(right.criadoEm).getTime() -
            new Date(left.criadoEm).getTime(),
        )[0] ?? null)
    : null;
  const selectedInternalUploadState = selectedInternalChecklistItem
    ? getUploadState(uploadForms, selectedInternalChecklistItem.category)
    : null;
  const selectedInternalChecklistUsesCIModal =
    selectedInternalChecklistItem?.category ===
    CI_RESERVA_ORCAMENTARIA_CATEGORY;
  const selectedInternalChecklistFlexState = selectedInternalChecklistItem
    ? (checklistNaoAplicavelForm[selectedInternalChecklistItem.category] ?? {
        statusFlexivel:
          selectedInternalChecklistItem.statusFlexivel ??
          (selectedInternalChecklistItem.naoAplicavel
            ? "NAO_APLICAVEL"
            : "PADRAO"),
        justificativa:
          selectedInternalChecklistItem.justificativaNaoAplicavel ?? "",
        departamentoResponsavel:
          selectedInternalChecklistItem.departamentoResponsavel ?? "",
        previsaoRecebimento: toDateInputValue(
          selectedInternalChecklistItem.previsaoRecebimento,
        ),
        processoFisicoNumero:
          selectedInternalChecklistItem.processoFisicoNumero ?? "",
        localArquivamento:
          selectedInternalChecklistItem.localArquivamento ?? "",
        digitalizarDepois:
          selectedInternalChecklistItem.digitalizarDepois ?? false,
      })
    : null;

  const externalChecklistItems = useMemo<ChecklistCardItem[]>(() => {
    const statusAtual = detalhe?.licitacao.statusLicitacao;
    return blueprint.external.map((item) => {
      const documentosCategoria = docsByCategory.get(item.category) ?? [];
      const concluidoPorDocumento = documentosCategoria.length > 0;
      const concluidoPorSistema = (() => {
        switch (item.category) {
          case "LICITACAO_CONFIRMACAO_PNCP":
            return Boolean(detalhe?.processo.publicado);
          case "LICITACAO_PROPOSTAS_PARTICIPANTES":
            return (detalhe?.propostas.length ?? 0) > 0;
          case "LICITACAO_HABILITACAO_EMPRESAS":
            return (
              detalhe?.licitantes.some(
                (licitante) => licitante.statusHabilitacao !== "PENDENTE",
              ) ?? false
            );
          case "LICITACAO_RECURSOS":
            return (detalhe?.recursos.length ?? 0) > 0;
          case "LICITACAO_JULGAMENTO_PROPOSTA_TECNICA":
            return isStepAtOrBeyond(statusAtual, [
              "JULGAMENTO",
              "HABILITACAO",
              "RECURSOS",
              "HOMOLOGACAO",
            ]);
          case "LICITACAO_ATAS_SESSAO_ADJUDICACAO":
            return isStepAtOrBeyond(statusAtual, ["RECURSOS", "HOMOLOGACAO"]);
          case "LICITACAO_ATA_RELATORIO_FINAL":
            return isStepAtOrBeyond(statusAtual, ["HOMOLOGACAO"]);
          case "LICITACAO_ATA_HOMOLOGACAO":
          case "LICITACAO_TERMO_HOMOLOGACAO":
            return Boolean(detalhe?.processo.homologado);
          case "LICITACAO_AVISO_PREGAO":
          case "LICITACAO_AVISO_DISPENSA":
            return Boolean(detalhe?.processo.publicado);
          default:
            return false;
        }
      })();

      return {
        ...item,
        concluido: concluidoPorDocumento || concluidoPorSistema,
        documentos: documentosCategoria,
        statusOrigem: concluidoPorDocumento
          ? "Documento anexado"
          : concluidoPorSistema
            ? "Evidencia sistemica"
            : "Pendente",
      };
    });
  }, [
    blueprint.external,
    detalhe?.licitacao.statusLicitacao,
    detalhe?.licitantes,
    detalhe?.processo.homologado,
    detalhe?.processo.publicado,
    detalhe?.propostas,
    detalhe?.recursos,
    docsByCategory,
  ]);
  const externalPendingRequired = externalChecklistItems.filter(
    (item) => item.obrigatorio && !item.concluido,
  );
  const auditoriaItems = auditoriaQuery.data?.items ?? [];
  const auditoriaUserOptions = useMemo(() => {
    const map = new Map<number, string>();
    auditoriaItems.forEach((item) => {
      if (!item.usuarioId) return;
      map.set(item.usuarioId, item.usuarioNome ?? `Usuario #${item.usuarioId}`);
    });
    return Array.from(map, ([id, nome]) => ({ id, nome })).sort((a, b) =>
      a.nome.localeCompare(b.nome),
    );
  }, [auditoriaItems]);
  const acrescimoMunicipal = useMemo(() => {
    const raw = acrescimoMunicipalQuery.data?.valor;
    return typeof raw === "number" && Number.isFinite(raw) ? raw : 1;
  }, [acrescimoMunicipalQuery.data?.valor]);
  const feriadosLocais = useMemo(() => {
    const raw = feriadosLocaisQuery.data?.valor;
    if (!Array.isArray(raw)) return [] as string[];
    return raw.map((item) => String(item ?? "").trim()).filter(Boolean);
  }, [feriadosLocaisQuery.data?.valor]);
  const legalScheduleWindow = useMemo(() => {
    if (!publishForm.dataPublicacaoEdital) return null;
    return buildSchedulePreview({
      modalidadeCodigo: detalhe?.processo.modalidadeCodigo ?? null,
      tipoObjeto: detalhe?.processo.tipoObjeto ?? null,
      criterioJulgamento:
        (configForm.criterioJulgamento ||
          detalhe?.processo.criterioJulgamento) ??
        null,
      dataPublicacaoEdital: publishForm.dataPublicacaoEdital,
      publicarNoDou: configForm.publicarNoDou,
      publicarEmJornal: configForm.publicarEmJornal,
      horaDisputa: publishForm.horaDisputa,
      acrescimoMunicipal,
      feriadosLocais,
    });
  }, [
    acrescimoMunicipal,
    configForm.criterioJulgamento,
    configForm.publicarEmJornal,
    configForm.publicarNoDou,
    detalhe?.processo.modalidadeCodigo,
    detalhe?.processo.tipoObjeto,
    detalhe?.processo.criterioJulgamento,
    feriadosLocais,
    publishForm.dataPublicacaoEdital,
    publishForm.horaDisputa,
  ]);
  const schedulePreview = isForaDoFluxo ? null : legalScheduleWindow;
  const manualScheduleViolatesLegalMinimum = Boolean(
    isForaDoFluxo &&
    legalScheduleWindow &&
    manualScheduleForm.dataAberturaPropostas &&
    new Date(manualScheduleForm.dataAberturaPropostas).getTime() <
      legalScheduleWindow.dataMinimaLegal.getTime(),
  );
  const selectedPublishStatusId = publishForm.statusId
    ? Number(publishForm.statusId)
    : null;
  const selectedPublishStatus = useMemo(
    () =>
      selectedPublishStatusId
        ? (catalogsQuery.data?.statusProcesso.find(
            (item) => item.id === selectedPublishStatusId,
          ) ?? null)
        : null,
    [catalogsQuery.data?.statusProcesso, selectedPublishStatusId],
  );
  const selectedPublishCriticalStatusKind = useMemo(
    () => getCriticalStatusKind(selectedPublishStatus),
    [selectedPublishStatus],
  );
  const publishCriticalStatusDateRequired = Boolean(
    selectedPublishStatus &&
    selectedPublishCriticalStatusKind &&
    selectedPublishStatus.id !== detalhe?.processo.statusId,
  );
  const selectedHomologStatusId = homologacaoForm.statusId
    ? Number(homologacaoForm.statusId)
    : null;
  const selectedHomologStatus = useMemo(
    () =>
      selectedHomologStatusId
        ? (catalogsQuery.data?.statusProcesso.find(
            (item) => item.id === selectedHomologStatusId,
          ) ?? null)
        : null,
    [catalogsQuery.data?.statusProcesso, selectedHomologStatusId],
  );
  const selectedHomologCriticalStatusKind = useMemo(
    () => getCriticalStatusKind(selectedHomologStatus),
    [selectedHomologStatus],
  );
  const homologCriticalStatusDateRequired = Boolean(
    selectedHomologStatus &&
    selectedHomologCriticalStatusKind &&
    selectedHomologCriticalStatusKind !== "HOMOLOGACAO" &&
    selectedHomologStatus.id !== detalhe?.processo.statusId,
  );

  useEffect(() => {
    setInternalChecklistRevealCount(3);
    setShowResolvedInternalChecklist(false);
    setSelectedInternalChecklistCategory(null);
  }, [processoId]);

  useEffect(() => {
    if (!selectedInternalChecklistItem && checklistItems[0]) {
      setSelectedInternalChecklistCategory(
        unresolvedChecklistItems[0]?.category ?? checklistItems[0].category,
      );
      return;
    }

    if (
      selectedInternalChecklistCategory &&
      !checklistItems.some(
        (item) => item.category === selectedInternalChecklistCategory,
      )
    ) {
      setSelectedInternalChecklistCategory(
        unresolvedChecklistItems[0]?.category ??
          checklistItems[0]?.category ??
          null,
      );
    }
  }, [
    checklistItems,
    selectedInternalChecklistCategory,
    selectedInternalChecklistItem,
    unresolvedChecklistItems,
  ]);

  useEffect(() => {
    if (!manualScheduleViolatesLegalMinimum && legalDateOverrideJustification) {
      setLegalDateOverrideJustification("");
    }
  }, [legalDateOverrideJustification, manualScheduleViolatesLegalMinimum]);

  async function refreshAll() {
    await Promise.all([
      utils.licitacao.detail.invalidate({ processoId }),
      utils.licitacao.list.invalidate(),
      utils.licitacao.summary.invalidate(),
      utils.documentos.listByProcesso.invalidate({ processoId }),
      utils.documentos.list.invalidate(),
      utils.documentos.summary.invalidate(),
      utils.workflow.byProcesso.invalidate({ processoId }),
      utils.processos.overview.invalidate({ processoId }),
      utils.auditoria.list.invalidate(),
    ]);
  }

  async function handleProcessarSd() {
    if (!sdFile || sdParsing) return;

    setSdParsing(true);
    setSdError(null);
    setSdVinculacaoError(null);
    setSdResult(null);
    setManualSdItems([]);
    setSdItemDraft(DEFAULT_SD_ITEM_DRAFT);
    setManualSdItemError(null);
    setFeedback(null);
    setErrorMessage(null);

    try {
      const result = await processLicitacaoSd({
        processoId,
        arquivo: sdFile,
      });
      setSdResult(result);
    } catch (error) {
      setSdError(
        error instanceof Error ? error.message : "Falha ao processar a SD.",
      );
    } finally {
      setSdParsing(false);
    }
  }

  function handleAdicionarItemManualSd() {
    setManualSdItemError(null);

    const descricao = sdItemDraft.descricao.trim();
    if (!descricao) {
      setManualSdItemError("Informe ao menos a descrição do item manual.");
      return;
    }

    const numero = Number(sdItemDraft.numero);
    const item: SdItemView = {
      numero: Number.isFinite(numero) && numero > 0 ? numero : undefined,
      descricao,
      unidade: sdItemDraft.unidade.trim() || undefined,
      quantidade: normalizeCurrencyInputBR(sdItemDraft.quantidade),
      preco_unitario: normalizeCurrencyInputBR(sdItemDraft.preco_unitario),
      preco_total: normalizeCurrencyInputBR(sdItemDraft.preco_total),
      fonte: "manual",
    };

    setManualSdItems((current) => [...current, item]);
    setSdItemDraft(DEFAULT_SD_ITEM_DRAFT);
  }

  function handleRemoverItemManualSd(index: number) {
    setManualSdItems((current) =>
      current.filter((_, itemIndex) => itemIndex !== index),
    );
  }

  async function handleVincularSd() {
    if (!sdResult?.artifact?.relativePath || sdVinculando) return;

    setSdVinculando(true);
    setSdVinculacaoError(null);
    setFeedback(null);
    setErrorMessage(null);

    try {
      const result = await vincularSdAoProcesso({
        processoId,
        relativePath: sdResult.artifact.relativePath,
        manualItems: manualSdItems.map((item) => ({
          numero: item.numero,
          descricao: item.descricao,
          unidade: item.unidade,
          quantidade: item.quantidade,
          preco_unitario: item.preco_unitario,
          preco_total: item.preco_total,
        })),
      });

      await refreshAll();
      setSdFile(null);
      setSdResult(result);
      setManualSdItems([]);
      setSdItemDraft(DEFAULT_SD_ITEM_DRAFT);
      setFeedback(
        `SD vinculada ao processo com ${result.vinculacao?.total ?? mergedSdItems.length} item(ns), ${result.vinculacao?.created ?? 0} novo(s) e ${result.vinculacao?.updated ?? 0} atualizado(s).`,
      );
    } catch (error) {
      setSdVinculacaoError(
        error instanceof Error
          ? error.message
          : "Falha ao vincular a SD ao processo.",
      );
    } finally {
      setSdVinculando(false);
    }
  }

  function ensureAuditJustification(actionLabel: string) {
    if (!isForaDoFluxo) return true;
    if (auditJustification.trim()) return true;
    setFeedback(null);
    setErrorMessage(
      `Informe a justificativa de auditoria para ${actionLabel}.`,
    );
    return false;
  }

  function setUploadState(
    category: string,
    updater: (current: UploadFormState) => UploadFormState,
  ) {
    setUploadForms((current) => ({
      ...current,
      [category]: updater(getUploadState(current, category)),
    }));
  }

  function setChecklistNaoAplicavelState(
    category: string,
    updater: (current: ChecklistFlexFormState) => ChecklistFlexFormState,
  ) {
    setChecklistNaoAplicavelForm((current) => ({
      ...current,
      [category]: updater(current[category] ?? initialChecklistFlexFormState),
    }));
  }

  function handleFileChange(
    category: string,
    event: ChangeEvent<HTMLInputElement>,
    suggestedTitle: string,
  ) {
    const nextFile = event.target.files?.[0] ?? null;
    setUploadState(category, (current) => ({
      ...current,
      arquivo: nextFile,
      titulo: current.titulo || nextFile?.name || suggestedTitle,
    }));
  }

  async function handleChecklistNaoAplicavel(
    item: Pick<ChecklistCardItem, "category" | "label">,
  ) {
    if (!isForaDoFluxo) return;
    const state =
      checklistNaoAplicavelForm[item.category] ?? initialChecklistFlexFormState;
    const actionLabel =
      state.statusFlexivel === "PADRAO"
        ? "reativar o item no checklist"
        : `registrar ${licitacaoChecklistFlexStatusLabels[state.statusFlexivel].toLowerCase()}`;
    if (!ensureAuditJustification(actionLabel)) return;
    if (state.statusFlexivel !== "PADRAO" && !state.justificativa.trim()) {
      setFeedback(null);
      setErrorMessage(
        "Informe a justificativa para registrar este status especial.",
      );
      return;
    }
    if (
      state.statusFlexivel === "OUTRO_SETOR" &&
      !state.departamentoResponsavel.trim()
    ) {
      setFeedback(null);
      setErrorMessage("Informe o departamento responsavel pelo documento.");
      return;
    }
    if (
      state.statusFlexivel === "CONCLUIDO_FISICO" &&
      !state.localArquivamento.trim()
    ) {
      setFeedback(null);
      setErrorMessage("Informe o local de arquivamento do processo fisico.");
      return;
    }

    await setChecklistNaoAplicavelMutation.mutateAsync({
      processoId,
      categoria: item.category,
      naoAplicavel: state.statusFlexivel === "NAO_APLICAVEL",
      statusFlexivel: state.statusFlexivel,
      justificativa:
        state.statusFlexivel !== "PADRAO"
          ? state.justificativa.trim()
          : undefined,
      departamentoResponsavel:
        state.statusFlexivel === "OUTRO_SETOR"
          ? state.departamentoResponsavel.trim()
          : undefined,
      previsaoRecebimento:
        state.statusFlexivel === "OUTRO_SETOR"
          ? state.previsaoRecebimento || undefined
          : undefined,
      processoFisicoNumero:
        state.statusFlexivel === "CONCLUIDO_FISICO"
          ? state.processoFisicoNumero.trim()
          : undefined,
      localArquivamento:
        state.statusFlexivel === "CONCLUIDO_FISICO"
          ? state.localArquivamento.trim()
          : undefined,
      digitalizarDepois:
        state.statusFlexivel === "CONCLUIDO_FISICO"
          ? state.digitalizarDepois
          : undefined,
      justificativaAuditoria: auditJustification.trim(),
    });
  }

  async function handleUploadChecklistDocumento(
    item: Pick<ChecklistCardItem, "category" | "label" | "description"> & {
      tipo?: string;
    },
  ) {
    const current = getUploadState(uploadForms, item.category);
    if (!current.arquivo) {
      setFeedback(null);
      setErrorMessage(`Selecione o arquivo para ${item.label.toLowerCase()}.`);
      return;
    }

    try {
      setFeedback(null);
      setErrorMessage(null);
      await uploadProcessoDocumento({
        processoId,
        tipo:
          (item.tipo as
            | "DFD"
            | "ETP"
            | "TR"
            | "EDITAL"
            | "COMUNICACAO_INTERNA"
            | "RESULTADO"
            | "CONTRATO"
            | "OUTRO"
            | undefined) ?? "OUTRO",
        categoria: item.category,
        titulo: current.titulo.trim() || item.label,
        descricao: current.descricao.trim() || item.description,
        arquivo: current.arquivo,
      });
      setUploadForms((currentState) => {
        const nextState = { ...currentState };
        delete nextState[item.category];
        return nextState;
      });
      await refreshAll();
      setFeedback(`${item.label} anexado com sucesso.`);
    } catch (error) {
      setFeedback(null);
      setErrorMessage(
        error instanceof Error ? error.message : "Falha ao anexar o documento.",
      );
    }
  }

  async function handleDeleteDocumento(documentoId: number) {
    const confirmed = window.confirm(
      "Deseja remover este documento do processo?",
    );
    if (!confirmed) return;

    try {
      setDeletingDocumentoId(documentoId);
      setFeedback(null);
      setErrorMessage(null);
      await deleteProcessoDocumento(documentoId);
      await refreshAll();
      setFeedback("Documento removido com sucesso.");
    } catch (error) {
      setFeedback(null);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Falha ao remover o documento.",
      );
    } finally {
      setDeletingDocumentoId(null);
    }
  }

  async function handleCIReservaDocumentoSalvo(message: string) {
    await refreshAll();
    setFeedback(message);
  }

  function handleCIReservaOperacaoErro(message: string) {
    setFeedback(null);
    setErrorMessage(message);
  }

  async function persistConfiguracao() {
    const legalOverrideAudit = manualScheduleViolatesLegalMinimum
      ? [auditJustification.trim(), legalDateOverrideJustification.trim()]
          .filter(Boolean)
          .join(" | ")
      : auditJustification.trim();

    await saveConfiguracaoMutation.mutateAsync({
      processoId,
      criterioJulgamento: configForm.criterioJulgamento || undefined,
      modoDisputa: configForm.modoDisputa,
      exigeDeclaracaoNaoFracionamento:
        configForm.exigeDeclaracaoNaoFracionamento,
      publicarNoDou: configForm.publicarNoDou,
      publicarEmJornal: configForm.publicarEmJornal,
      inversaoFasesHabilitada: configForm.inversaoFasesHabilitada,
      inversaoFasesJustificativa:
        configForm.inversaoFasesJustificativa || undefined,
      justificativaAuditoria: isForaDoFluxo
        ? legalOverrideAudit || undefined
        : undefined,
      dataPublicacaoEdital: publishForm.dataPublicacaoEdital
        ? `${publishForm.dataPublicacaoEdital}T00:00:00`
        : undefined,
      dataRecebimentoPropostasInicio:
        manualScheduleForm.dataRecebimentoPropostasInicio || undefined,
      dataRecebimentoPropostasFim:
        manualScheduleForm.dataRecebimentoPropostasFim || undefined,
      dataAberturaPropostas:
        manualScheduleForm.dataAberturaPropostas ||
        (publishForm.dataPublicacaoEdital
          ? `${publishForm.dataPublicacaoEdital}T${publishForm.horaDisputa || "08:30"}:00`
          : undefined),
      dataInicioLances: manualScheduleForm.dataInicioLances || undefined,
      dataFimLances: manualScheduleForm.dataFimLances || undefined,
      dataJulgamento: manualScheduleForm.dataJulgamento || undefined,
      observacoes: configForm.observacoes || undefined,
    });
  }

  async function handleSalvarConfiguracao(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      configForm.inversaoFasesHabilitada &&
      !configForm.inversaoFasesJustificativa.trim()
    ) {
      setFeedback(null);
      setErrorMessage("Informe a justificativa para a inversao de fases.");
      return;
    }
    if (!ensureAuditJustification("salvar a configuracao interna")) return;
    if (
      manualScheduleViolatesLegalMinimum &&
      !legalDateOverrideJustification.trim()
    ) {
      setFeedback(null);
      setErrorMessage(
        "Informe a justificativa do prazo extemporaneo para salvar o cronograma manual abaixo do minimo legal.",
      );
      return;
    }
    await persistConfiguracao();
  }

  async function handlePublish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!publishForm.condutorProcessoId) {
      setFeedback(null);
      setErrorMessage("Selecione o condutor do processo antes de publicar.");
      return;
    }
    if (publishCriticalStatusDateRequired && !publishForm.dataStatus) {
      setFeedback(null);
      setErrorMessage(
        `Informe a data do status critico (${getCriticalStatusKindLabel(selectedPublishCriticalStatusKind!)}).`,
      );
      return;
    }
    if (!ensureAuditJustification("publicar o processo")) return;
    if (
      isForaDoFluxo &&
      (!publishForm.dataPublicacaoEdital ||
        !manualScheduleForm.dataRecebimentoPropostasFim ||
        !manualScheduleForm.dataAberturaPropostas)
    ) {
      setFeedback(null);
      setErrorMessage(
        "Informe as datas manuais de publicacao, recebimento final e abertura para publicar o processo fora do fluxo.",
      );
      return;
    }
    if (
      manualScheduleViolatesLegalMinimum &&
      !legalDateOverrideJustification.trim()
    ) {
      setFeedback(null);
      setErrorMessage(
        "Informe a justificativa do prazo extemporaneo antes de publicar com data inferior ao minimo legal.",
      );
      return;
    }

    const legalOverrideAudit = manualScheduleViolatesLegalMinimum
      ? [auditJustification.trim(), legalDateOverrideJustification.trim()]
          .filter(Boolean)
          .join(" | ")
      : auditJustification.trim();

    await publishMutation.mutateAsync({
      processoId,
      condutorProcessoId: Number(publishForm.condutorProcessoId),
      statusId: publishForm.statusId ? Number(publishForm.statusId) : undefined,
      dataStatus: publishForm.dataStatus || undefined,
      justificativaAuditoria: isForaDoFluxo
        ? legalOverrideAudit || undefined
        : undefined,
      linkBllPublico: publishForm.linkBllPublico || undefined,
      linkPncpPublico: publishForm.linkPncpPublico || undefined,
      dataPublicacaoEdital: publishForm.dataPublicacaoEdital
        ? `${publishForm.dataPublicacaoEdital}T00:00:00`
        : undefined,
      dataRecebimentoPropostasInicio:
        manualScheduleForm.dataRecebimentoPropostasInicio || undefined,
      dataRecebimentoPropostasFim:
        manualScheduleForm.dataRecebimentoPropostasFim || undefined,
      dataAberturaPropostas:
        manualScheduleForm.dataAberturaPropostas ||
        (publishForm.dataPublicacaoEdital
          ? `${publishForm.dataPublicacaoEdital}T${publishForm.horaDisputa || "08:30"}:00`
          : undefined),
      dataInicioLances: manualScheduleForm.dataInicioLances || undefined,
      dataFimLances: manualScheduleForm.dataFimLances || undefined,
      descricao: publishForm.descricao || undefined,
      observacao:
        [
          publishForm.observacao,
          manualScheduleViolatesLegalMinimum
            ? `Prazo extemporaneo: ${legalDateOverrideJustification.trim()}`
            : null,
        ]
          .filter(Boolean)
          .join(" | ") || undefined,
    });
  }

  async function handleAddLicitante() {
    if (!licitanteFornecedorId) {
      setFeedback(null);
      setErrorMessage("Selecione um fornecedor para incluir como licitante.");
      return;
    }
    await saveLicitanteMutation.mutateAsync({
      processoId,
      fornecedorId: Number(licitanteFornecedorId),
    });
  }

  async function handleSaveProposta(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !propostaForm.licitanteId ||
      !propostaForm.itemId ||
      !propostaForm.valorUnitarioProposto
    ) {
      setFeedback(null);
      setErrorMessage("Informe licitante, item e valor unitario da proposta.");
      return;
    }
    const valorUnitarioProposto = normalizeCurrencyInputBR(
      propostaForm.valorUnitarioProposto,
    );
    if (valorUnitarioProposto === undefined) {
      setFeedback(null);
      setErrorMessage("Informe um valor unitario valido para a proposta.");
      return;
    }
    await savePropostaMutation.mutateAsync({
      processoId,
      licitanteId: Number(propostaForm.licitanteId),
      itemId: Number(propostaForm.itemId),
      valorUnitarioProposto,
      dataProposta: toDateTimeStart(propostaForm.dataProposta),
      classificacao: propostaForm.classificacao
        ? Number(propostaForm.classificacao)
        : undefined,
      situacao: propostaForm.situacao as
        | "VALIDA"
        | "DESCLASSIFICADA"
        | "VENCEDORA",
      justificativa: propostaForm.justificativa || undefined,
    });
  }

  async function handleSaveLance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lanceForm.propostaId || !lanceForm.valorLance) {
      setFeedback(null);
      setErrorMessage("Selecione a proposta e informe o valor do lance.");
      return;
    }
    const valorLance = normalizeCurrencyInputBR(lanceForm.valorLance);
    if (valorLance === undefined) {
      setFeedback(null);
      setErrorMessage("Informe um valor de lance valido.");
      return;
    }
    await saveLanceMutation.mutateAsync({
      propostaId: Number(lanceForm.propostaId),
      valorLance,
      dataLance: toDateTimeStart(lanceForm.dataLance),
      observacao: lanceForm.observacao || undefined,
    });
  }

  async function handleSaveHabilitacao(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!habilitacaoForm.licitanteId) {
      setFeedback(null);
      setErrorMessage("Selecione o licitante para atualizar a habilitacao.");
      return;
    }
    await saveHabilitacaoMutation.mutateAsync({
      licitanteId: Number(habilitacaoForm.licitanteId),
      statusHabilitacao: habilitacaoForm.statusHabilitacao as
        | "PENDENTE"
        | "HABILITADO"
        | "INABILITADO",
      observacaoHabilitacao: habilitacaoForm.observacaoHabilitacao || undefined,
    });
  }

  async function handleSaveRecurso(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!recursoForm.licitanteId || !recursoForm.descricao.trim()) {
      setFeedback(null);
      setErrorMessage(
        "Selecione o licitante e descreva o recurso administrativo.",
      );
      return;
    }
    await saveRecursoMutation.mutateAsync({
      processoId,
      licitanteId: Number(recursoForm.licitanteId),
      dataInterposicao: recursoForm.dataInterposicao || undefined,
      dataJulgamento: recursoForm.dataJulgamento || undefined,
      resultado: recursoForm.resultado as
        | "PENDENTE"
        | "PROVIDO"
        | "IMPROVIDO"
        | "PARCIALMENTE_PROVIDO",
      descricao: recursoForm.descricao,
      decisao: recursoForm.decisao || undefined,
    });
  }

  async function handleAdvanceStage(
    statusLicitacao:
      | "RECEBIMENTO_PROPOSTAS"
      | "LANCES"
      | "JULGAMENTO"
      | "HABILITACAO"
      | "RECURSOS",
    etapaAtual: string,
    observacao: string,
  ) {
    if (!ensureAuditJustification("alterar a etapa da licitacao")) return;
    await advanceStageMutation.mutateAsync({
      processoId,
      statusLicitacao,
      etapaAtual,
      observacao,
      justificativaAuditoria: isForaDoFluxo
        ? auditJustification.trim()
        : undefined,
    });
  }

  async function handleHomologar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!homologacaoForm.dataHomologacao) {
      setFeedback(null);
      setErrorMessage(
        "Informe a data de homologacao antes de concluir a homologacao.",
      );
      return;
    }
    if (homologCriticalStatusDateRequired && !homologacaoForm.dataStatus) {
      setFeedback(null);
      setErrorMessage(
        `Informe a data do status critico (${getCriticalStatusKindLabel(selectedHomologCriticalStatusKind!)}).`,
      );
      return;
    }
    if (!ensureAuditJustification("homologar o processo")) return;
    await homologarMutation.mutateAsync({
      processoId,
      dataHomologacao: homologacaoForm.dataHomologacao || undefined,
      dataStatus: homologacaoForm.dataStatus || undefined,
      observacao: homologacaoForm.observacao || undefined,
      statusId: homologacaoForm.statusId
        ? Number(homologacaoForm.statusId)
        : undefined,
      justificativaAuditoria: isForaDoFluxo
        ? auditJustification.trim()
        : undefined,
    });
  }

  const navItems: Array<{
    key: SectionKey;
    label: string;
    ref: RefObject<HTMLElement | null>;
  }> = (() => {
    const makeNavItem = (
      key: SectionKey,
      label: string,
      ref: RefObject<HTMLElement | null>,
    ) => ({ key, label, ref });
    const items: Array<{
      key: SectionKey;
      label: string;
      ref: RefObject<HTMLElement | null>;
    }> = [
      makeNavItem("overview", "Visao geral", overviewRef),
      makeNavItem("internal", "Fase interna", internalRef),
      makeNavItem("external", "Fase externa", externalRef),
      makeNavItem("docs", "Documentos do processo", docsRef),
      makeNavItem("publication", "Publicacao", publicationRef),
      ...(showCompetitivoSteps
        ? [makeNavItem("licitantes", "Licitantes", licitantesRef)]
        : []),
      ...(showCompetitivoSteps
        ? [makeNavItem("propostas", "Propostas", propostasRef)]
        : []),
      ...(showLances ? [makeNavItem("lances", "Lances", lancesRef)] : []),
      ...(showCompetitivoSteps
        ? [makeNavItem("julgamento", "Julgamento", julgamentoRef)]
        : []),
      makeNavItem("habilitacao", "Habilitacao", habilitacaoRef),
      ...(showRecursos
        ? [makeNavItem("recursos", "Recursos", recursosRef)]
        : []),
      makeNavItem("homologacao", "Homologacao", homologacaoRef),
      ...(isForaDoFluxo
        ? [makeNavItem("auditoria", "Auditoria", auditoriaRef)]
        : []),
      makeNavItem("history", "Movimentacoes", historyRef),
    ];

    if (inversaoFasesAtiva) {
      const currentIndex = items.findIndex(
        (item) => item.key === "habilitacao",
      );
      const publicationIndex = items.findIndex(
        (item) => item.key === "publication",
      );
      if (
        currentIndex > -1 &&
        publicationIndex > -1 &&
        currentIndex > publicationIndex
      ) {
        const [habilitacaoItem] = items.splice(currentIndex, 1);
        items.splice(publicationIndex + 1, 0, habilitacaoItem);
      }
    }

    return items;
  })();
  const currentVisualStep = !(detalhe?.processo.publicado ?? false)
    ? "PREPARACAO_INTERNA"
    : mapStatusToVisualStep(detalhe?.licitacao.statusLicitacao ?? "PREPARACAO");
  const currentVisualStepIndex = Math.max(
    0,
    flowSteps.findIndex((item) => item.key === currentVisualStep),
  );
  const currentProcessPhase = resolveLinearPhaseFromVisualStep(
    currentVisualStep,
    detalhe?.processo.homologado ?? false,
  );
  const contractGateQuery = trpc.processos.macroPhaseGate.useQuery(
    { processoId, moduloDestino: "CONTRATOS" },
    {
      enabled: Boolean(detalhe) && currentProcessPhase !== "PREPARACAO",
      retry: false,
    },
  );
  const responsavelAtual =
    detalhe?.processo.condutorProcesso?.nome ?? "Responsavel em definicao";
  const publicationPendingItems = [
    !publishForm.dataPublicacaoEdital
      ? {
          category: "publication-date",
          label: "Data de publicacao",
          detalhe: "Defina a publicacao oficial do edital no PNCP.",
        }
      : null,
    !publishForm.condutorProcessoId
      ? {
          category: "publication-conductor",
          label: "Condutor do processo",
          detalhe: "Associe o responsavel operacional da fase externa.",
        }
      : null,
    !detalhe?.processo.publicado
      ? {
          category: "publication-submit",
          label: "Publicacao pendente",
          detalhe: "Conclua a publicacao para liberar a disputa.",
        }
      : null,
  ].filter(
    (
      item,
    ): item is {
      category: string;
      label: string;
      detalhe: string;
    } => Boolean(item),
  );
  const propostasSemClassificacao = detalhe?.propostas.filter(
    (item) => item.classificacao == null,
  ).length;
  const habilitacoesPendentes = detalhe?.licitantes.filter(
    (item) => item.statusHabilitacao === "PENDENTE",
  ).length;
  const julgamentoHabilitacaoPendings = [
    showCompetitivoSteps && propostasSemClassificacao
      ? {
          category: "judgment-ranking",
          label: `${propostasSemClassificacao} proposta(s) sem classificacao`,
          detalhe: "Consolide a classificacao para fechar o julgamento.",
        }
      : null,
    habilitacoesPendentes
      ? {
          category: "qualification-review",
          label: `${habilitacoesPendentes} licitante(s) com habilitacao pendente`,
          detalhe: "Finalize a conferencia documental do classificado.",
        }
      : null,
  ].filter(
    (
      item,
    ): item is {
      category: string;
      label: string;
      detalhe: string;
    } => Boolean(item),
  );
  const recursosPendentes = detalhe?.recursos.filter(
    (item) => item.resultado === "PENDENTE",
  ).length;
  const recursoHomologacaoPendings = [
    showRecursos && recursosPendentes
      ? {
          category: "appeals",
          label: `${recursosPendentes} recurso(s) sem decisao final`,
          detalhe: "Finalize o tratamento recursal antes da homologacao.",
        }
      : null,
    !detalhe?.processo.homologado
      ? {
          category: "homologation",
          label: "Homologacao pendente",
          detalhe: "Formalize a conclusao da fase licitatoria.",
        }
      : null,
  ].filter(
    (
      item,
    ): item is {
      category: string;
      label: string;
      detalhe: string;
    } => Boolean(item),
  );
  const fechamentoPendings = (contractGateQuery.data?.blockers ?? []).map(
    (item, index) => ({
      category: `contract-${index}`,
      label: item.label,
      detalhe: item.detalhe ?? "Resolva este ponto antes de encaminhar.",
    }),
  );
  const phaseCatalog = {
    PREPARACAO: {
      label: "Preparacao Interna",
      shortLabel: "Preparacao",
      eyebrow: "Fundacao do processo",
      description:
        "Checklist interno, configuracoes estaticas e acervo documental antes da abertura.",
      icon: ShieldCheck,
    },
    PUBLICACAO: {
      label: "Publicacao e Cronograma",
      shortLabel: "Publicacao",
      eyebrow: "Janelas legais",
      description:
        "Publicacao oficial, cronograma da sessao e regras de contagem de prazo.",
      icon: CalendarClock,
    },
    DISPUTA: {
      label: "Disputa",
      shortLabel: "Disputa",
      eyebrow: "Operacao externa",
      description:
        "Rito da sessao, participantes, propostas e lances com foco em operacao.",
      icon: FolderKanban,
    },
    JULGAMENTO_HABILITACAO: {
      label: "Julgamento e Habilitacao",
      shortLabel: "Julgamento",
      eyebrow: "Decisao tecnica",
      description:
        "Classificacao das propostas e verificacao documental do classificado.",
      icon: FileCheck2,
    },
    RECURSOS_HOMOLOGACAO: {
      label: "Recursos e Homologacao",
      shortLabel: "Homologacao",
      eyebrow: "Conclusao formal",
      description:
        "Tratamento recursal e encerramento formal da fase licitatoria.",
      icon: CheckCircle2,
    },
    FECHAMENTO: {
      label: "Fechamento",
      shortLabel: "Fechamento",
      eyebrow: "Rastreabilidade final",
      description:
        "Auditoria reforcada, historico recente e encaminhamento para Contratos.",
      icon: Clock3,
    },
  } as const;
  const phasePendingItems = {
    PREPARACAO: pendingRequired.map((item) => ({
      category: item.category,
      label: item.label,
      detalhe: item.completionHint ?? item.description ?? undefined,
    })),
    PUBLICACAO: publicationPendingItems,
    DISPUTA: externalPendingRequired.map((item) => ({
      category: item.category,
      label: item.label,
      detalhe: item.completionHint ?? item.description ?? undefined,
    })),
    JULGAMENTO_HABILITACAO: julgamentoHabilitacaoPendings,
    RECURSOS_HOMOLOGACAO: recursoHomologacaoPendings,
    FECHAMENTO: fechamentoPendings,
  } as const satisfies Record<
    LicitacaoLinearPhaseKey,
    Array<{ category: string; label: string; detalhe?: string }>
  >;
  const phasePendingCounts = {
    PREPARACAO: pendingRequired.length,
    PUBLICACAO: publicationPendingItems.length,
    DISPUTA: externalPendingRequired.length,
    JULGAMENTO_HABILITACAO: julgamentoHabilitacaoPendings.length,
    RECURSOS_HOMOLOGACAO: recursoHomologacaoPendings.length,
    FECHAMENTO: fechamentoPendings.length,
  } as const satisfies Record<LicitacaoLinearPhaseKey, number>;
  const currentProcessPhaseIndex =
    licitacaoLinearPhaseOrder.indexOf(currentProcessPhase);
  const maxAccessiblePhaseIndex = Math.min(
    licitacaoLinearPhaseOrder.length - 1,
    currentProcessPhaseIndex +
      (phasePendingCounts[currentProcessPhase] === 0 ? 1 : 0),
  );
  const phaseCompletedBySystem = {
    PREPARACAO: currentVisualStep !== "PREPARACAO_INTERNA",
    PUBLICACAO:
      Boolean(detalhe?.processo.publicado) &&
      currentVisualStep !== "PUBLICACAO",
    DISPUTA:
      Boolean(detalhe?.processo.homologado) ||
      (inversaoFasesAtiva
        ? ["JULGAMENTO", "RECURSOS", "HOMOLOGACAO"].includes(currentVisualStep)
        : ["JULGAMENTO", "HABILITACAO", "RECURSOS", "HOMOLOGACAO"].includes(
            currentVisualStep,
          )),
    JULGAMENTO_HABILITACAO:
      Boolean(detalhe?.processo.homologado) ||
      ["RECURSOS", "HOMOLOGACAO"].includes(currentVisualStep),
    RECURSOS_HOMOLOGACAO: Boolean(detalhe?.processo.homologado),
    FECHAMENTO: false,
  } as const satisfies Record<LicitacaoLinearPhaseKey, boolean>;
  const sectionRefs: Record<SectionKey, RefObject<HTMLElement | null>> = {
    overview: overviewRef,
    internal: internalRef,
    external: externalRef,
    docs: docsRef,
    publication: publicationRef,
    licitantes: licitantesRef,
    propostas: propostasRef,
    lances: lancesRef,
    julgamento: julgamentoRef,
    habilitacao: habilitacaoRef,
    recursos: recursosRef,
    homologacao: homologacaoRef,
    auditoria: auditoriaRef,
    history: historyRef,
  };
  const phaseBySection = {
    overview: "PREPARACAO",
    internal: "PREPARACAO",
    external: "DISPUTA",
    docs: "PREPARACAO",
    publication: "PUBLICACAO",
    licitantes: "DISPUTA",
    propostas: "DISPUTA",
    lances: "DISPUTA",
    julgamento: "JULGAMENTO_HABILITACAO",
    habilitacao: "JULGAMENTO_HABILITACAO",
    recursos: "RECURSOS_HOMOLOGACAO",
    homologacao: "RECURSOS_HOMOLOGACAO",
    auditoria: "FECHAMENTO",
    history: "FECHAMENTO",
  } as const satisfies Record<SectionKey, LicitacaoLinearPhaseKey>;
  const getDefaultSectionForPhase = (
    phase: LicitacaoLinearPhaseKey,
  ): SectionKey => {
    switch (phase) {
      case "PREPARACAO":
        return "internal";
      case "PUBLICACAO":
        return "publication";
      case "DISPUTA":
        return "external";
      case "JULGAMENTO_HABILITACAO":
        return inversaoFasesAtiva || !showCompetitivoSteps
          ? "habilitacao"
          : "julgamento";
      case "RECURSOS_HOMOLOGACAO":
        return showRecursos ? "recursos" : "homologacao";
      case "FECHAMENTO":
        return isForaDoFluxo ? "auditoria" : "history";
      default:
        return "internal";
    }
  };
  const jumpToSection = (item: {
    key: SectionKey;
    ref: RefObject<HTMLElement | null>;
  }) => {
    const phase = legalPhaseBySection[item.key];
    if (!canAccessLegalPhase(phase)) return;
    setCurrentPhase(phase);
    setSectionOpen((current) => ({
      ...current,
      [item.key]: true,
    }));
    requestAnimationFrame(() =>
      item.ref.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      }),
    );
  };
  const legalPhaseBySection = {
    overview: "PREPARACAO",
    internal: "PREPARACAO",
    external: "DISPUTA",
    docs: "PREPARACAO",
    publication: "PUBLICACAO",
    licitantes: "DISPUTA",
    propostas: "DISPUTA",
    lances: "DISPUTA",
    julgamento: "JULGAMENTO_HABILITACAO",
    habilitacao: "JULGAMENTO_HABILITACAO",
    recursos: "RECURSOS_HOMOLOGACAO",
    homologacao: "RECURSOS_HOMOLOGACAO",
    auditoria: "FECHAMENTO",
    history: "FECHAMENTO",
  } as const satisfies Record<SectionKey, LicitacaoLinearPhaseKey>;
  const getSectionsForPhase = (
    phase: LicitacaoLinearPhaseKey,
  ): SectionKey[] => {
    switch (phase) {
      case "PREPARACAO":
        return ["overview", "internal", "docs"];
      case "PUBLICACAO":
        return ["publication"];
      case "DISPUTA":
        return [
          "external",
          ...(showCompetitivoSteps
            ? (["licitantes", "propostas"] as const)
            : []),
          ...(showLances ? (["lances"] as const) : []),
        ];
      case "JULGAMENTO_HABILITACAO":
        return [
          ...(showCompetitivoSteps ? (["julgamento"] as const) : []),
          "habilitacao",
        ];
      case "RECURSOS_HOMOLOGACAO":
        return [
          ...(showRecursos ? (["recursos"] as const) : []),
          "homologacao",
        ];
      case "FECHAMENTO":
        return [...(isForaDoFluxo ? (["auditoria"] as const) : []), "history"];
      default:
        return ["internal"];
    }
  };
  const canAccessLegalPhase = (phase: LicitacaoLinearPhaseKey) =>
    licitacaoLinearPhaseOrder.indexOf(phase) <= maxAccessiblePhaseIndex;
  const selectLegalPhase = (phase: LicitacaoLinearPhaseKey) => {
    if (!canAccessLegalPhase(phase)) return;
    const targetSection = getDefaultSectionForPhase(phase);
    setCurrentPhase(phase);
    setSectionOpen((current) => ({
      ...current,
      [targetSection]: true,
    }));
    requestAnimationFrame(() =>
      sectionRefs[targetSection].current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      }),
    );
  };
  const selectedPhaseNavItems = navItems.filter((item) =>
    getSectionsForPhase(currentPhase).includes(item.key),
  );
  const selectedPhaseInfo = phaseCatalog[currentPhase];
  const runtimePhaseInfo = phaseCatalog[currentProcessPhase];
  const SelectedPhaseIcon = selectedPhaseInfo.icon;
  const selectedPhasePendingItems = phasePendingItems[currentPhase];
  const selectedPhaseLeadSection = getDefaultSectionForPhase(currentPhase);
  const stickyColumnHeaderClass =
    "sticky left-0 z-10 bg-[var(--surface-soft)] shadow-[inset_-1px_0_0_var(--border-subtle)]";
  const stickyColumnCellClass =
    "sticky left-0 z-[1] bg-[var(--surface-card)] shadow-[inset_-1px_0_0_var(--border-subtle)]";
  const deferredSectionFallback = (
    <div className="mt-4 grid gap-3">
      {[0, 1].map((item) => (
        <Skeleton key={item} className="h-24 rounded-[28px]" />
      ))}
    </div>
  );
  const deferredModalFallback = (
    <div className="grid gap-3">
      {[0, 1, 2].map((item) => (
        <Skeleton key={item} className="h-16 rounded-[24px]" />
      ))}
    </div>
  );
  const propostasPagination = paginateItems(
    detalhe?.propostas ?? [],
    propostasPage,
  );
  const lancesPagination = paginateItems(detalhe?.lances ?? [], lancesPage);
  const habilitacaoPagination = paginateItems(
    detalhe?.licitantes ?? [],
    habilitacaoPage,
  );
  const recursosPagination = paginateItems(
    detalhe?.recursos ?? [],
    recursosPage,
  );
  const auditoriaPagination = paginateItems(auditoriaItems, auditoriaPage);
  const primaryPhaseAction = (() => {
    if (currentPhase === "PREPARACAO") {
      return {
        label: "Avancar para publicacao",
        helper:
          phasePendingCounts.PREPARACAO === 0
            ? "Checklist pronto para abrir a etapa de publicacao."
            : "Conclua o checklist interno antes de liberar a publicacao.",
        disabled: phasePendingCounts.PREPARACAO > 0,
        onClick: () => selectLegalPhase("PUBLICACAO"),
      };
    }

    if (currentPhase === "PUBLICACAO") {
      return detalhe?.processo.publicado
        ? {
            label: "Abrir disputa",
            helper:
              "A publicacao foi registrada. Siga para a operacao externa.",
            disabled: !canAccessLegalPhase("DISPUTA"),
            onClick: () => selectLegalPhase("DISPUTA"),
          }
        : {
            label: publishMutation.isPending
              ? "Publicando..."
              : "Publicar e liberar disputa",
            helper: "Submete o cronograma e libera a fase externa.",
            disabled: publishMutation.isPending,
            formId: "licitacao-publicacao-form",
          };
    }

    if (currentPhase === "RECURSOS_HOMOLOGACAO") {
      return {
        label: detalhe?.processo.homologado
          ? "Revisar homologacao"
          : "Concluir homologacao",
        helper: "Abre um painel focado para finalizar a etapa formal.",
        disabled: homologarMutation.isPending,
        onClick: () => setOperationModal("homologacao"),
      };
    }

    if (currentPhase === "FECHAMENTO") {
      return {
        label: "Encaminhar para Contratos",
        helper: "Valida bloqueios finais antes da transicao de modulo.",
        disabled:
          contractGateQuery.isLoading || advanceMacroPhaseMutation.isPending,
        onClick: () => setContractTransitionOpen(true),
      };
    }

    return {
      label: "Abrir secao principal",
      helper: "Foco rapido na area ativa desta etapa.",
      disabled: false,
      onClick: () =>
        jumpToSection({
          key: selectedPhaseLeadSection,
          ref: sectionRefs[selectedPhaseLeadSection],
        }),
    };
  })();
  const isLegalSectionVisible = (sectionKey: SectionKey) =>
    getSectionsForPhase(currentPhase).includes(sectionKey);

  useEffect(() => {
    if (typeof window === "undefined") {
      setCurrentPhase(currentProcessPhase);
      return;
    }

    const storageKey = `sirel:licitacao-phase:${processoId}`;
    const queryPhase = new URLSearchParams(window.location.search).get("fase");
    const storedPhase = window.sessionStorage.getItem(storageKey);
    const preferredPhase = isLicitacaoLinearPhaseKey(queryPhase)
      ? queryPhase
      : isLicitacaoLinearPhaseKey(storedPhase)
        ? storedPhase
        : currentProcessPhase;
    const nextPhase = canAccessLegalPhase(preferredPhase)
      ? preferredPhase
      : currentProcessPhase;

    setCurrentPhase(nextPhase);
    setSectionOpen((current) => ({
      ...current,
      [getDefaultSectionForPhase(nextPhase)]: true,
    }));
  }, [
    currentProcessPhase,
    inversaoFasesAtiva,
    isForaDoFluxo,
    processoId,
    showCompetitivoSteps,
    showLances,
    showRecursos,
    maxAccessiblePhaseIndex,
  ]);

  useEffect(() => {
    if (typeof window === "undefined" || !canAccessLegalPhase(currentPhase)) {
      return;
    }

    const storageKey = `sirel:licitacao-phase:${processoId}`;
    window.sessionStorage.setItem(storageKey, currentPhase);

    const url = new URL(window.location.href);
    url.searchParams.set("fase", currentPhase);
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, [currentPhase, maxAccessiblePhaseIndex, processoId]);

  const habilitacaoSection = (
    <section
      ref={habilitacaoRef}
      className={isLegalSectionVisible("habilitacao") ? "" : "hidden"}
    >
      <CollapsibleSectionCard
        title="Habilitacao"
        description="Registro da situacao documental do licitante classificado e observacoes da comissao."
        open={sectionOpen.habilitacao}
        onToggle={(nextOpen) =>
          setSectionOpen((current) => ({ ...current, habilitacao: nextOpen }))
        }
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => setOperationModal("habilitacao")}
            >
              Atualizar habilitacao
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                void handleAdvanceStage(
                  "HABILITACAO",
                  "Licitacao / habilitacao",
                  "Verificacao documental do licitante classificado.",
                )
              }
              disabled={advanceStageMutation.isPending}
            >
              Definir etapa atual
            </Button>
          </div>
        }
        collapsedSummary={
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="rounded-full bg-[var(--color-primary-50)] px-3 py-1 font-semibold text-[var(--color-primary-700)]">
              {detalhe?.licitantes.length ?? 0} licitante(s) para conferencia
            </span>
          </div>
        }
      >
        <div className="rounded-[24px] border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--color-primary-600)]">
                Operacao focada
              </div>
              <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
                A decisao documental foi movida para um modal dedicado.
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                A area principal fica reservada para conferencia da situacao dos
                licitantes e leitura do historico de habilitacao.
              </p>
            </div>
            <Button
              type="button"
              onClick={() => setOperationModal("habilitacao")}
            >
              Atualizar habilitacao
            </Button>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="text-sm text-[var(--text-secondary)]">
            {habilitacaoPagination.totalItems} licitante(s) com status de
            habilitacao.
          </div>
          {habilitacaoPagination.totalPages > 1 ? (
            <Pagination
              page={habilitacaoPagination.page}
              totalPages={habilitacaoPagination.totalPages}
              onPageChange={setHabilitacaoPage}
            />
          ) : null}
        </div>

        <div className="mt-4 overflow-x-auto rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-white shadow-[0_12px_24px_-24px_rgba(15,26,109,0.22)]">
          <Table className="min-w-[920px]">
            <TableHead>
              <tr>
                <TableHeaderCell className={stickyColumnHeaderClass}>
                  Licitante
                </TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Observacao</TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {habilitacaoPagination.totalItems ? (
                habilitacaoPagination.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className={stickyColumnCellClass}>
                      {item.razaoSocial}
                    </TableCell>
                    <TableCell>
                      {habilitacaoStatusLabels[
                        item.statusHabilitacao as keyof typeof habilitacaoStatusLabels
                      ] ?? item.statusHabilitacao}
                    </TableCell>
                    <TableCell>{item.observacaoHabilitacao ?? "-"}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={3}
                    className="text-[var(--color-neutral-500)]"
                  >
                    Nenhum licitante cadastrado para habilitacao.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CollapsibleSectionCard>
    </section>
  );

  if (detailQuery.isLoading) {
    return (
      <div className="space-y-4">
        {[0, 1, 2].map((item) => (
          <Skeleton key={item} className="h-40 rounded-[28px]" />
        ))}
      </div>
    );
  }

  if (detailQuery.error || !detalhe) {
    return (
      <Alert variant="error">
        Nao foi possivel carregar a etapa da Licitacao para este processo.
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <ToastStack items={toastItems} onDismiss={dismissToast} />

      <Breadcrumb
        items={[
          { label: "Licitacao", href: "/licitacao" },
          { label: detalhe.processo.numeroSirel },
        ]}
      />

      <SectionCard
        title={`Licitacao do processo ${detalhe.processo.numeroSirel}`}
        description="Tela operacional da fase licitatoria com checklist documental interno, acervo completo do processo e cronograma automatico de publicacao."
        action={
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setLocation(`/dossie/${processoId}`)}
            >
              <FileCheck2 className="h-4 w-4" />
              Dossiê do processo
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowAllDocsModal(true)}
            >
              <FileStack className="h-4 w-4" />
              Documentos do processo
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setLocation("/licitacao")}
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar a fila
            </Button>
          </div>
        }
      >
        <div className="sticky top-4 z-30 mb-6 space-y-3">
          {isForaDoFluxo ? (
            <div className="rounded-[24px] border border-amber-200 bg-amber-50/95 px-4 py-4 backdrop-blur">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div className="max-w-2xl">
                  <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-700">
                    Barra de auditoria
                  </div>
                  <p className="mt-1 text-sm leading-6 text-amber-900">
                    A justificativa desta barra acompanha as acoes sensiveis do
                    processo fora do fluxo e evita repeticao em cada checklist.
                  </p>
                </div>
                <div className="rounded-2xl border border-amber-200 bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-950">
                  Reaproveitada nas proximas acoes criticas
                </div>
              </div>
              <div className="mt-3">
                <FormField label="Justificativa de auditoria (obrigatoria)">
                  <Textarea
                    rows={2}
                    value={auditJustification}
                    onChange={(event) =>
                      setAuditJustification(event.target.value)
                    }
                    placeholder="Explique o motivo das alteracoes extemporaneas."
                  />
                </FormField>
              </div>
            </div>
          ) : null}

          <div className="overflow-hidden rounded-[28px] border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-[var(--shadow-card)]">
            <div className="border-b border-[var(--border-subtle)] px-5 py-5 xl:px-6">
              <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                <div className="max-w-3xl">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">
                    <span className="rounded-full bg-[var(--surface-soft)] px-3 py-1 text-[var(--text-primary)]">
                      Fluxo linear da Lei 14.133
                    </span>
                    <span className="rounded-full bg-[var(--surface-soft)] px-3 py-1">
                      {runtimePhaseInfo.label}
                    </span>
                    {inversaoFasesAtiva ? (
                      <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-800">
                        Inversao de fases ativa
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-3 flex flex-wrap items-end gap-3">
                    <h2 className="text-3xl font-black tracking-tight text-[var(--text-primary)]">
                      {detalhe.processo.numeroSirel}
                    </h2>
                    <span className="rounded-full bg-[var(--surface-soft)] px-3 py-1 text-sm font-semibold text-[var(--text-secondary)]">
                      {detalhe.processo.modalidade ?? "Modalidade em definicao"}
                    </span>
                  </div>
                  <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--text-secondary)]">
                    {licitacaoStatusLabels[
                      detalhe.licitacao
                        .statusLicitacao as keyof typeof licitacaoStatusLabels
                    ] ?? detalhe.licitacao.statusLicitacao}
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[420px]">
                  <div className="rounded-[22px] bg-[var(--surface-soft)] px-4 py-3">
                    <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                      Responsavel
                    </div>
                    <div className="mt-1 font-semibold text-[var(--text-primary)]">
                      {responsavelAtual}
                    </div>
                  </div>
                  <div className="rounded-[22px] bg-[var(--surface-soft)] px-4 py-3">
                    <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                      Pendencias da etapa
                    </div>
                    <div className="mt-1 font-semibold text-[var(--text-primary)]">
                      {phasePendingCounts[currentProcessPhase]}
                    </div>
                  </div>
                  <div className="rounded-[22px] bg-[var(--surface-soft)] px-4 py-3">
                    <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                      Checklist interno
                    </div>
                    <div className="mt-1 font-semibold text-[var(--text-primary)]">
                      {progressCount}/{checklistItems.length} concluidos
                    </div>
                  </div>
                  <div className="rounded-[22px] bg-[var(--surface-soft)] px-4 py-3">
                    <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                      Documentos vinculados
                    </div>
                    <div className="mt-1 font-semibold text-[var(--text-primary)]">
                      {documentos.length}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-4 py-4 xl:px-6">
              <div className="flex gap-3 overflow-x-auto pb-1">
                {licitacaoLinearPhaseOrder.map((phaseKey) => {
                  const phase = phaseCatalog[phaseKey];
                  const isCurrent = phaseKey === currentProcessPhase;
                  const isSelected = phaseKey === currentPhase;
                  const isDone = phaseCompletedBySystem[phaseKey];
                  const isLocked = !canAccessLegalPhase(phaseKey);
                  const statusLabel = isCurrent
                    ? "Em andamento"
                    : isDone
                      ? "Concluida"
                      : isLocked
                        ? "Bloqueada"
                        : "Pendente";
                  const Icon = phase.icon;

                  return (
                    <button
                      key={phaseKey}
                      type="button"
                      onClick={() => selectLegalPhase(phaseKey)}
                      disabled={isLocked}
                      className={[
                        "min-w-[210px] rounded-[24px] border px-4 py-4 text-left transition",
                        isSelected
                          ? "border-[var(--border-strong)] bg-[var(--surface-highlight)]"
                          : isDone
                            ? "border-emerald-200 bg-emerald-50/80"
                            : isLocked
                              ? "border-[var(--border-subtle)] bg-[var(--surface-soft)] opacity-70"
                              : "border-[var(--border-subtle)] bg-[var(--surface-card)] hover:border-[var(--border-strong)]",
                      ].join(" ")}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="inline-flex h-10 w-10 items-center justify-center rounded-[18px] border border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--accent-color)]">
                          <Icon className="h-4 w-4" />
                        </div>
                        <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                          {statusLabel}
                        </span>
                      </div>
                      <div className="mt-4 text-sm font-black text-[var(--text-primary)]">
                        {phase.label}
                      </div>
                      <div className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">
                        {phasePendingCounts[phaseKey] === 0
                          ? "Sem pendencias abertas"
                          : `${phasePendingCounts[phaseKey]} pendencia(s) ou validacao(oes) abertas`}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <aside className="space-y-4 xl:sticky xl:top-[220px] xl:self-start xl:order-2">
            <div className="rounded-[28px] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 shadow-[var(--shadow-card)]">
              <div className="flex items-center gap-3">
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-[18px] border border-[var(--border-subtle)] bg-[var(--surface-soft)] text-[var(--accent-color)]">
                  <SelectedPhaseIcon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">
                    Etapa selecionada
                  </p>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">
                    {selectedPhaseInfo.label}
                  </p>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                {selectedPhaseNavItems.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => jumpToSection(item)}
                    className={[
                      "flex w-full items-center justify-between rounded-2xl border px-3 py-3 text-left text-sm font-semibold transition",
                      item.key === selectedPhaseLeadSection ||
                      sectionOpen[item.key]
                        ? "border-[var(--border-strong)] bg-[var(--surface-highlight)] text-[var(--text-primary)]"
                        : "border-[var(--border-subtle)] bg-[var(--surface-soft)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]",
                    ].join(" ")}
                  >
                    <span>{item.label}</span>
                    <ChevronRight className="h-4 w-4 flex-none" />
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-[28px] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 shadow-[var(--shadow-card)]">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">
                Bloqueios legais
              </p>
              {selectedPhasePendingItems.length ? (
                <ul className="mt-3 space-y-3 text-sm text-[var(--text-secondary)]">
                  {selectedPhasePendingItems.slice(0, 5).map((item) => (
                    <li
                      key={item.category}
                      className="rounded-2xl bg-[var(--surface-soft)] px-3 py-3"
                    >
                      <div className="font-semibold text-[var(--text-primary)]">
                        {item.label}
                      </div>
                      {item.detalhe ? (
                        <div className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
                          {item.detalhe}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-3 rounded-2xl bg-emerald-50 px-4 py-4 text-sm font-semibold text-emerald-700">
                  Sem bloqueios abertos para a etapa selecionada.
                </div>
              )}
            </div>

            <div className="rounded-[28px] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 shadow-[var(--shadow-card)]">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">
                Contexto operacional
              </p>
              <div className="mt-3 grid gap-2 text-sm text-[var(--text-secondary)]">
                <div className="rounded-2xl bg-[var(--surface-soft)] px-3 py-3">
                  <div className="text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">
                    Fluxo
                  </div>
                  <div className="mt-1 font-bold text-[var(--text-primary)]">
                    {licitacaoFluxoLabels[fluxoLicitacao]}
                  </div>
                </div>
                <div className="rounded-2xl bg-[var(--surface-soft)] px-3 py-3">
                  <div className="text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">
                    Disputa
                  </div>
                  <div className="mt-1 font-bold text-[var(--text-primary)]">
                    {showCompetitivoSteps
                      ? showLances
                        ? "Com disputa"
                        : "Sem disputa"
                      : "Nao se aplica"}
                  </div>
                </div>
                {modalidadeHelp ? (
                  <div className="rounded-2xl bg-[var(--surface-soft)] px-3 py-3 text-sm leading-6 text-[var(--text-secondary)]">
                    {modalidadeHelp}
                  </div>
                ) : null}
              </div>
            </div>
          </aside>

          <div className="space-y-6 xl:order-1">
            <div className="rounded-[28px] border border-[var(--border-subtle)] bg-[var(--surface-card)] px-5 py-5 shadow-[var(--shadow-card)]">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="max-w-3xl">
                  <div className="flex items-center gap-3">
                    <div className="inline-flex h-12 w-12 items-center justify-center rounded-[20px] border border-[var(--border-subtle)] bg-[var(--surface-soft)] text-[var(--accent-color)]">
                      <SelectedPhaseIcon className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">
                        {selectedPhaseInfo.eyebrow}
                      </div>
                      <h3 className="text-2xl font-black text-[var(--text-primary)]">
                        {selectedPhaseInfo.label}
                      </h3>
                    </div>
                  </div>
                  <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--text-secondary)]">
                    {selectedPhaseInfo.description}
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[22px] bg-[var(--surface-soft)] px-4 py-3 text-sm">
                    <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                      Etapa em execucao
                    </div>
                    <div className="mt-1 font-semibold text-[var(--text-primary)]">
                      {runtimePhaseInfo.shortLabel}
                    </div>
                  </div>
                  <div className="rounded-[22px] bg-[var(--surface-soft)] px-4 py-3 text-sm">
                    <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                      Secao principal
                    </div>
                    <div className="mt-1 font-semibold capitalize text-[var(--text-primary)]">
                      {selectedPhaseLeadSection.replaceAll("_", " ")}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="sticky bottom-4 z-20 rounded-[24px] border border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-4 shadow-[var(--shadow-card)]">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--color-primary-600)]">
                    Acao principal da etapa
                  </div>
                  <div className="mt-1 text-sm text-[var(--text-secondary)]">
                    {primaryPhaseAction.helper}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      jumpToSection({
                        key: selectedPhaseLeadSection,
                        ref: sectionRefs[selectedPhaseLeadSection],
                      })
                    }
                  >
                    Ir para secao principal
                  </Button>
                  <Button
                    type={primaryPhaseAction.formId ? "submit" : "button"}
                    form={primaryPhaseAction.formId}
                    onClick={
                      primaryPhaseAction.formId
                        ? undefined
                        : primaryPhaseAction.onClick
                    }
                    disabled={primaryPhaseAction.disabled}
                  >
                    {primaryPhaseAction.label}
                  </Button>
                </div>
              </div>
            </div>
            <section
              ref={overviewRef}
              className={isLegalSectionVisible("overview") ? "" : "hidden"}
            >
              <CollapsibleSectionCard
                title="Visao geral da Licitacao"
                description="Resumo do processo, da fase atual e das proximas etapas da Lei no 14.133/2021."
                open={sectionOpen.overview}
                onToggle={(nextOpen) =>
                  setSectionOpen((current) => ({
                    ...current,
                    overview: nextOpen,
                  }))
                }
                defaultOpen
                collapsedSummary={
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-2xl border border-[rgba(204,225,255,0.92)] bg-[var(--color-primary-50)] px-4 py-3 text-sm">
                      <span className="font-semibold text-[var(--color-primary-900)]">
                        {detalhe.processo.numeroSirel}
                      </span>
                      <div className="text-[var(--color-neutral-500)]">
                        {detalhe.processo.modalidade ?? "Licitacao"}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-[rgba(204,225,255,0.92)] bg-[var(--color-primary-50)] px-4 py-3 text-sm">
                      <span className="font-semibold text-[var(--color-primary-900)]">
                        {detalhe.licitacao.statusLicitacao}
                      </span>
                      <div className="text-[var(--color-neutral-500)]">
                        Etapa atual
                      </div>
                    </div>
                    <div className="rounded-2xl border border-[rgba(204,225,255,0.92)] bg-[var(--color-primary-50)] px-4 py-3 text-sm">
                      <span className="font-semibold text-[var(--color-primary-900)]">
                        {detalhe.processo.numeroEdital ?? "Sem edital"}
                      </span>
                      <div className="text-[var(--color-neutral-500)]">
                        Edital
                      </div>
                    </div>
                    <div className="rounded-2xl border border-[rgba(204,225,255,0.92)] bg-[var(--color-primary-50)] px-4 py-3 text-sm">
                      <span className="font-semibold text-[var(--color-primary-900)]">
                        {formatShortDateBR(
                          detalhe.processo.dataEntradaLicitacao,
                        )}
                      </span>
                      <div className="text-[var(--color-neutral-500)]">
                        Entrada na licitacao
                      </div>
                    </div>
                    <div className="rounded-2xl border border-[rgba(204,225,255,0.92)] bg-[var(--color-primary-50)] px-4 py-3 text-sm">
                      <span className="font-semibold text-[var(--color-primary-900)]">
                        {documentos.length}
                      </span>
                      <div className="text-[var(--color-neutral-500)]">
                        Documentos
                      </div>
                    </div>
                  </div>
                }
              >
                <div className="grid gap-3 lg:grid-cols-4">
                  <article className="rounded-3xl border border-[rgba(204,225,255,0.92)] bg-white px-4 py-4">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">
                      Processo
                    </p>
                    <p className="mt-2 text-lg font-black text-[var(--color-primary-900)]">
                      {detalhe.processo.numeroSirel}
                    </p>
                    <p className="mt-1 text-sm text-[var(--color-neutral-600)]">
                      {detalhe.processo.secretaria}
                    </p>
                  </article>
                  <article className="rounded-3xl border border-[rgba(204,225,255,0.92)] bg-white px-4 py-4">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">
                      Modalidade
                    </p>
                    <p className="mt-2 text-lg font-black text-[var(--color-primary-900)]">
                      {detalhe.processo.modalidade ?? "Nao definida"}
                    </p>
                    <p className="mt-1 text-sm text-[var(--color-neutral-600)]">
                      {detalhe.processo.numeroEdital ??
                        "Edital ainda nao gerado"}
                    </p>
                  </article>
                  <article className="rounded-3xl border border-[rgba(204,225,255,0.92)] bg-white px-4 py-4">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">
                      Criterio / modo
                    </p>
                    <p className="mt-2 text-lg font-black text-[var(--color-primary-900)]">
                      {detalhe.processo.criterioJulgamento ?? "Nao informado"}
                    </p>
                    <p className="mt-1 text-sm text-[var(--color-neutral-600)]">
                      {modoDisputaLabels[
                        (detalhe.processo
                          .modoDisputa as keyof typeof modoDisputaLabels) ??
                          "NAO_SE_APLICA"
                      ] ?? "Nao se aplica"}
                    </p>
                  </article>
                  <article className="rounded-3xl border border-[rgba(204,225,255,0.92)] bg-white px-4 py-4">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">
                      Valor estimado
                    </p>
                    <p className="mt-2 text-lg font-black text-[var(--color-primary-900)]">
                      {formatCurrencyBRL(detalhe.processo.valorEstimado)}
                    </p>
                    <p className="mt-1 text-sm text-[var(--color-neutral-600)]">
                      Condutor:{" "}
                      {detalhe.processo.condutorProcesso?.nome ??
                        "Definido na publicacao"}
                    </p>
                  </article>
                </div>

                <div className="mt-4 grid gap-3 xl:grid-cols-4">
                  {flowSteps.map((item, index) => {
                    const current = item.key === currentVisualStep;
                    const completed =
                      item.key === "PREPARACAO_INTERNA"
                        ? pendingRequired.length === 0 &&
                          currentVisualStepIndex > index
                        : currentVisualStepIndex > index;

                    return (
                      <article
                        key={item.key}
                        onClick={() => {
                          if (item.key === "LANCES" && !showLances) {
                            return;
                          }
                          const sectionByStep: Record<
                            string,
                            keyof typeof sectionOpen
                          > = {
                            PREPARACAO_INTERNA: "internal",
                            PUBLICACAO: "publication",
                            RECEBIMENTO_PROPOSTAS: "propostas",
                            LANCES: "lances",
                            JULGAMENTO: "julgamento",
                            HABILITACAO: "habilitacao",
                            RECURSOS: "recursos",
                            HOMOLOGACAO: "homologacao",
                          };
                          const targetSection = sectionByStep[item.key];
                          const targetRefMap: Record<
                            string,
                            RefObject<HTMLElement | null>
                          > = {
                            internal: internalRef,
                            publication: publicationRef,
                            propostas: propostasRef,
                            lances: lancesRef,
                            julgamento: julgamentoRef,
                            habilitacao: habilitacaoRef,
                            recursos: recursosRef,
                            homologacao: homologacaoRef,
                          };

                          if (targetSection) {
                            const phase = legalPhaseBySection[targetSection];
                            if (canAccessLegalPhase(phase)) {
                              setCurrentPhase(phase);
                            }
                            setSectionOpen((current) => ({
                              ...current,
                              [targetSection]: true,
                            }));
                            requestAnimationFrame(() =>
                              targetRefMap[
                                targetSection
                              ]?.current?.scrollIntoView({
                                behavior: "smooth",
                                block: "start",
                              }),
                            );
                          }
                        }}
                        className={[
                          "rounded-3xl border px-4 py-4 transition",
                          item.key === "LANCES" && !showLances
                            ? "opacity-60"
                            : "cursor-pointer hover:-translate-y-0.5",
                          current
                            ? "border-[rgba(102,165,255,0.9)] bg-[var(--color-primary-50)]"
                            : completed
                              ? "border-emerald-200 bg-emerald-50"
                              : "border-[rgba(204,225,255,0.92)] bg-white",
                        ].join(" ")}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-bold text-[var(--color-primary-900)]">
                            {item.label}
                          </p>
                          {completed ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          ) : null}
                        </div>
                        <p className="mt-2 text-sm leading-6 text-[var(--color-neutral-600)]">
                          {item.description}
                        </p>
                      </article>
                    );
                  })}
                </div>
              </CollapsibleSectionCard>
            </section>

            <section
              ref={internalRef}
              className={isLegalSectionVisible("internal") ? "" : "hidden"}
            >
              <CollapsibleSectionCard
                title="Fase interna documental"
                description={
                  isForaDoFluxo
                    ? "Checklist orientativo com auditoria reforcada para processos fora do fluxo."
                    : "Todos os documentos obrigatorios antes da publicidade. O processo so pode ser publicado quando o checklist estiver completo."
                }
                open={sectionOpen.internal}
                onToggle={(nextOpen) =>
                  setSectionOpen((current) => ({
                    ...current,
                    internal: nextOpen,
                  }))
                }
                action={
                  <div className="inline-flex items-center gap-2 rounded-full bg-[var(--color-primary-900)] px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-white">
                    <ShieldCheck className="h-4 w-4" />
                    {progressCount}/{checklistItems.length} concluidos
                  </div>
                }
                collapsedSummary={
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="rounded-full bg-[var(--color-primary-50)] px-3 py-1 font-semibold text-[var(--color-primary-700)]">
                      Checklist: {progressCount}/{checklistItems.length}
                    </span>
                    <span className="rounded-full bg-[var(--color-primary-50)] px-3 py-1 font-semibold text-[var(--color-primary-700)]">
                      Itens: {detalhe?.itens.length ?? 0}
                    </span>
                    <span className="rounded-full bg-[var(--color-primary-50)] px-3 py-1 font-semibold text-[var(--color-primary-700)]">
                      Pendentes: {pendingRequired.length}
                    </span>
                    <span className="rounded-full bg-[var(--color-primary-50)] px-3 py-1 font-semibold text-[var(--color-primary-700)]">
                      DOU: {configForm.publicarNoDou ? "Sim" : "Nao"}
                    </span>
                    <span className="rounded-full bg-[var(--color-primary-50)] px-3 py-1 font-semibold text-[var(--color-primary-700)]">
                      Jornal: {configForm.publicarEmJornal ? "Sim" : "Nao"}
                    </span>
                  </div>
                }
              >
                <div className="space-y-4">
                  <div className="rounded-2xl border border-[rgba(204,225,255,0.92)] bg-white px-4 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">
                          Parser da SD
                        </div>
                        <h4 className="mt-1 text-lg font-black text-[var(--color-primary-900)]">
                          Vincular itens da Solicitação de Despesa ao processo
                        </h4>
                        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--color-neutral-600)]">
                          Faça o upload do PDF da SD, revise os itens extraídos,
                          complemente o que faltar e vincule o resultado aos
                          itens do processo sem depender da tela de relatórios.
                        </p>
                      </div>
                      <div className="rounded-2xl bg-[var(--color-primary-50)] px-4 py-3 text-right">
                        <div className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-primary-600)]">
                          Processo
                        </div>
                        <div className="mt-1 text-lg font-black text-[var(--color-primary-900)]">
                          {detalhe?.itens.length ?? 0} item(ns)
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <article className="rounded-2xl border border-[rgba(204,225,255,0.92)] bg-[var(--color-primary-50)] px-4 py-3">
                        <div className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-primary-600)]">
                          Itens atuais
                        </div>
                        <div className="mt-1 text-lg font-black text-[var(--color-primary-900)]">
                          {detalhe?.itens.length ?? 0}
                        </div>
                      </article>
                      <article className="rounded-2xl border border-[rgba(204,225,255,0.92)] bg-[var(--color-primary-50)] px-4 py-3">
                        <div className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-primary-600)]">
                          Valor estimado atual
                        </div>
                        <div className="mt-1 text-lg font-black text-[var(--color-primary-900)]">
                          {formatCurrencyBRL(
                            itensVinculadosValorTotal ||
                              detalhe?.processo.valorEstimado,
                          )}
                        </div>
                      </article>
                      <article className="rounded-2xl border border-[rgba(204,225,255,0.92)] bg-[var(--color-primary-50)] px-4 py-3">
                        <div className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-primary-600)]">
                          Prévia da SD
                        </div>
                        <div className="mt-1 text-lg font-black text-[var(--color-primary-900)]">
                          {mergedSdItems.length}
                        </div>
                      </article>
                      <article className="rounded-2xl border border-[rgba(204,225,255,0.92)] bg-[var(--color-primary-50)] px-4 py-3">
                        <div className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-primary-600)]">
                          Warnings do parser
                        </div>
                        <div className="mt-1 text-lg font-black text-[var(--color-primary-900)]">
                          {sdResult?.summary.warnings ?? 0}
                        </div>
                      </article>
                    </div>

                    <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                      <FormField label="Arquivo PDF da SD">
                        <Input
                          type="file"
                          accept="application/pdf,.pdf"
                          onChange={(event) =>
                            setSdFile(event.target.files?.[0] ?? null)
                          }
                        />
                      </FormField>
                      <div className="flex items-end">
                        <Button
                          type="button"
                          onClick={() => void handleProcessarSd()}
                          disabled={!sdFile || sdParsing}
                        >
                          {sdParsing ? "Processando SD..." : "Processar SD"}
                        </Button>
                      </div>
                    </div>

                    <p className="mt-3 text-xs text-[var(--color-neutral-500)]">
                      Itens com o mesmo número atualizam o processo; itens sem
                      correspondência são adicionados. A vinculação é bloqueada
                      quando já existem propostas cadastradas para evitar
                      inconsistências na fase externa.
                    </p>

                    {sdError ? (
                      <Alert variant="error" className="mt-3">
                        {sdError}
                      </Alert>
                    ) : null}

                    {sdResult ? (
                      <div className="mt-4 space-y-4">
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                          <article className="rounded-2xl border border-[rgba(204,225,255,0.92)] bg-white px-4 py-3">
                            <div className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-primary-600)]">
                              Número da SD
                            </div>
                            <div className="mt-1 text-lg font-black text-[var(--color-primary-900)]">
                              {sdResult.metadata.numero_sd ?? "-"}
                            </div>
                          </article>
                          <article className="rounded-2xl border border-[rgba(204,225,255,0.92)] bg-white px-4 py-3">
                            <div className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-primary-600)]">
                              Itens na prévia
                            </div>
                            <div className="mt-1 text-lg font-black text-[var(--color-primary-900)]">
                              {mergedSdItems.length}
                            </div>
                          </article>
                          <article className="rounded-2xl border border-[rgba(204,225,255,0.92)] bg-white px-4 py-3">
                            <div className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-primary-600)]">
                              Valor total da SD
                            </div>
                            <div className="mt-1 text-lg font-black text-[var(--color-primary-900)]">
                              {typeof sdResult.metadata.valor_total === "number"
                                ? formatCurrencyBRL(
                                    sdResult.metadata.valor_total,
                                  )
                                : "-"}
                            </div>
                          </article>
                          <article className="rounded-2xl border border-[rgba(204,225,255,0.92)] bg-white px-4 py-3">
                            <div className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-primary-600)]">
                              Itens manuais
                            </div>
                            <div className="mt-1 text-lg font-black text-[var(--color-primary-900)]">
                              {manualSdItems.length}
                            </div>
                          </article>
                        </div>

                        <div className="rounded-2xl border border-dashed border-[rgba(47,84,196,0.32)] bg-[var(--color-primary-50)] px-4 py-4">
                          <p className="text-sm font-bold text-[var(--color-primary-900)]">
                            Complementar item manual
                          </p>
                          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                            <FormField label="Item">
                              <Input
                                value={sdItemDraft.numero}
                                inputMode="numeric"
                                onChange={(event) =>
                                  setSdItemDraft((current) => ({
                                    ...current,
                                    numero: event.target.value,
                                  }))
                                }
                                placeholder="Ex.: 22"
                              />
                            </FormField>
                            <FormField label="Descrição *">
                              <Input
                                value={sdItemDraft.descricao}
                                onChange={(event) =>
                                  setSdItemDraft((current) => ({
                                    ...current,
                                    descricao: event.target.value,
                                  }))
                                }
                                placeholder="Descrição do item"
                              />
                            </FormField>
                            <FormField label="Unid">
                              <Input
                                value={sdItemDraft.unidade}
                                onChange={(event) =>
                                  setSdItemDraft((current) => ({
                                    ...current,
                                    unidade: event.target.value,
                                  }))
                                }
                                placeholder="UND"
                              />
                            </FormField>
                            <FormField label="Qtd">
                              <Input
                                value={sdItemDraft.quantidade}
                                onChange={(event) =>
                                  setSdItemDraft((current) => ({
                                    ...current,
                                    quantidade: event.target.value,
                                  }))
                                }
                                placeholder="0,00"
                              />
                            </FormField>
                            <FormField label="Vlr. unit.">
                              <Input
                                value={sdItemDraft.preco_unitario}
                                onChange={(event) =>
                                  setSdItemDraft((current) => ({
                                    ...current,
                                    preco_unitario: event.target.value,
                                  }))
                                }
                                placeholder="0,00"
                              />
                            </FormField>
                            <FormField label="Total">
                              <Input
                                value={sdItemDraft.preco_total}
                                onChange={(event) =>
                                  setSdItemDraft((current) => ({
                                    ...current,
                                    preco_total: event.target.value,
                                  }))
                                }
                                placeholder="0,00"
                              />
                            </FormField>
                          </div>

                          <div className="mt-3 flex flex-wrap items-center gap-3">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={handleAdicionarItemManualSd}
                            >
                              Adicionar item manual
                            </Button>
                            <Button
                              type="button"
                              onClick={() => void handleVincularSd()}
                              disabled={
                                !sdResult.artifact?.relativePath || sdVinculando
                              }
                            >
                              {sdVinculando
                                ? "Vinculando..."
                                : "Vincular itens ao processo"}
                            </Button>
                            {sdResult.artifact?.downloadUrl ? (
                              <a
                                href={sdResult.artifact.downloadUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center rounded-full border border-[var(--color-primary-300)] px-3 py-1.5 text-sm font-semibold text-[var(--color-primary-700)] hover:bg-[var(--color-primary-50)]"
                              >
                                <FileStack className="mr-2 h-4 w-4" />
                                Baixar JSON da SD
                              </a>
                            ) : null}
                          </div>

                          {manualSdItemError ? (
                            <Alert variant="error" className="mt-3">
                              {manualSdItemError}
                            </Alert>
                          ) : null}
                          {sdVinculacaoError ? (
                            <Alert variant="error" className="mt-3">
                              {sdVinculacaoError}
                            </Alert>
                          ) : null}
                        </div>

                        <div className="overflow-x-auto rounded-2xl border border-[rgba(204,225,255,0.92)] bg-white">
                          <Table className="min-w-[920px]">
                            <TableHead>
                              <tr>
                                <TableHeaderCell>Item</TableHeaderCell>
                                <TableHeaderCell>Descrição</TableHeaderCell>
                                <TableHeaderCell>Unid</TableHeaderCell>
                                <TableHeaderCell>Qtd</TableHeaderCell>
                                <TableHeaderCell>Vlr. unit.</TableHeaderCell>
                                <TableHeaderCell>Total</TableHeaderCell>
                                <TableHeaderCell>Ações</TableHeaderCell>
                              </tr>
                            </TableHead>
                            <TableBody>
                              {mergedSdItems.length ? (
                                mergedSdItems
                                  .slice(0, 30)
                                  .map((item, index) => (
                                    <TableRow
                                      key={`${item.numero ?? "sd"}-${index}`}
                                    >
                                      <TableCell>
                                        {item.numero ?? "-"}
                                      </TableCell>
                                      <TableCell className="max-w-[520px] whitespace-normal">
                                        {item.descricao ?? "-"}
                                      </TableCell>
                                      <TableCell>
                                        {item.unidade ?? "-"}
                                      </TableCell>
                                      <TableCell>
                                        {formatNumberBR(item.quantidade, 3)}
                                      </TableCell>
                                      <TableCell>
                                        {formatCurrencyBRL(item.preco_unitario)}
                                      </TableCell>
                                      <TableCell>
                                        <div className="flex items-center gap-2">
                                          <span>
                                            {formatCurrencyBRL(
                                              item.preco_total,
                                            )}
                                          </span>
                                          {item.fonte === "manual" ? (
                                            <span className="rounded-full bg-[var(--color-warning-100)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--color-warning-700)]">
                                              Manual
                                            </span>
                                          ) : null}
                                        </div>
                                      </TableCell>
                                      <TableCell>
                                        {item.fonte === "manual" ? (
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            onClick={() =>
                                              handleRemoverItemManualSd(
                                                item.manualIndex ?? -1,
                                              )
                                            }
                                            disabled={
                                              (item.manualIndex ?? -1) < 0
                                            }
                                          >
                                            Remover
                                          </Button>
                                        ) : (
                                          "-"
                                        )}
                                      </TableCell>
                                    </TableRow>
                                  ))
                              ) : (
                                <TableRow>
                                  <TableCell
                                    colSpan={7}
                                    className="py-8 text-center text-[var(--color-neutral-500)]"
                                  >
                                    Faça o processamento da SD para visualizar a
                                    prévia dos itens.
                                  </TableCell>
                                </TableRow>
                              )}
                            </TableBody>
                          </Table>
                        </div>

                        {mergedSdItems.length > 30 ? (
                          <p className="text-xs text-[var(--color-neutral-500)]">
                            Exibindo 30 de {mergedSdItems.length} itens da SD.
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex items-center justify-between gap-3 px-1">
                    <div>
                      <div className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-primary-600)]">
                        Itens do processo
                      </div>
                      <div className="mt-1 text-sm text-[var(--color-neutral-600)]">
                        Conferência do que já está efetivamente vinculado após o
                        import da SD.
                      </div>
                    </div>
                    <div className="rounded-full bg-[var(--color-primary-50)] px-3 py-1 text-xs font-semibold text-[var(--color-primary-700)]">
                      {detalhe?.itens.length ?? 0} item(ns)
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-2xl border border-[rgba(204,225,255,0.92)] bg-white shadow-[0_12px_24px_-24px_rgba(15,26,109,0.22)]">
                    <Table className="min-w-[920px]">
                      <TableHead>
                        <tr>
                          <TableHeaderCell>Item</TableHeaderCell>
                          <TableHeaderCell>Descrição</TableHeaderCell>
                          <TableHeaderCell>Quantidade</TableHeaderCell>
                          <TableHeaderCell>Valor unitário</TableHeaderCell>
                          <TableHeaderCell>Total</TableHeaderCell>
                        </tr>
                      </TableHead>
                      <TableBody>
                        {detalhe?.itens.length ? (
                          detalhe.itens.map((item) => (
                            <TableRow key={item.id}>
                              <TableCell className="align-top font-semibold text-[var(--color-primary-900)]">
                                {item.numeroItem}
                              </TableCell>
                              <TableCell className="align-top">
                                {item.descricao}
                              </TableCell>
                              <TableCell className="align-top">
                                {formatNumberBR(item.quantidade, 3)}{" "}
                                {item.unidade}
                              </TableCell>
                              <TableCell className="align-top">
                                {formatCurrencyBRL(item.valorUnitarioEstimado)}
                              </TableCell>
                              <TableCell className="align-top">
                                {formatCurrencyBRL(item.valorTotalEstimado)}
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell
                              colSpan={5}
                              className="py-8 text-center text-[var(--color-neutral-500)]"
                            >
                              Este processo ainda não possui itens vinculados.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <form className="space-y-5" onSubmit={handleSalvarConfiguracao}>
                  <div className="grid gap-3 lg:grid-cols-2">
                    <FormField label="Criterio de julgamento">
                      <Input
                        value={configForm.criterioJulgamento}
                        onChange={(event) =>
                          setConfigForm((current) => ({
                            ...current,
                            criterioJulgamento: event.target.value,
                          }))
                        }
                        placeholder="Ex.: Menor preco por lote"
                      />
                    </FormField>
                    <FormField label="Modo de disputa">
                      <Select
                        value={configForm.modoDisputa}
                        onChange={(event) =>
                          setConfigForm((current) => ({
                            ...current,
                            modoDisputa: event.target.value,
                          }))
                        }
                      >
                        {Object.entries(modoDisputaLabels).map(
                          ([key, label]) => (
                            <option key={key} value={key}>
                              {label}
                            </option>
                          ),
                        )}
                      </Select>
                    </FormField>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-3">
                    <label className="inline-flex items-center gap-3 rounded-2xl border border-[rgba(204,225,255,0.92)] bg-[var(--color-primary-50)] px-4 py-3 text-sm font-semibold text-[var(--color-neutral-700)]">
                      <Checkbox
                        checked={configForm.exigeDeclaracaoNaoFracionamento}
                        onChange={(event) =>
                          setConfigForm((current) => ({
                            ...current,
                            exigeDeclaracaoNaoFracionamento:
                              event.target.checked,
                          }))
                        }
                      />
                      Exigir declaração de não fracionamento
                    </label>
                    <label className="inline-flex items-center gap-3 rounded-2xl border border-[rgba(204,225,255,0.92)] bg-[var(--color-primary-50)] px-4 py-3 text-sm font-semibold text-[var(--color-neutral-700)]">
                      <Checkbox
                        checked={configForm.publicarNoDou}
                        onChange={(event) =>
                          setConfigForm((current) => ({
                            ...current,
                            publicarNoDou: event.target.checked,
                          }))
                        }
                      />
                      Publicar tambem no DOU
                    </label>
                    <label className="inline-flex items-center gap-3 rounded-2xl border border-[rgba(204,225,255,0.92)] bg-[var(--color-primary-50)] px-4 py-3 text-sm font-semibold text-[var(--color-neutral-700)]">
                      <Checkbox
                        checked={configForm.publicarEmJornal}
                        onChange={(event) =>
                          setConfigForm((current) => ({
                            ...current,
                            publicarEmJornal: event.target.checked,
                          }))
                        }
                      />
                      Publicar tambem em jornal
                    </label>
                  </div>

                  {showCompetitivoSteps ? (
                    <div className="rounded-2xl border border-[rgba(204,225,255,0.92)] bg-white px-4 py-4">
                      <div className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">
                        Configuracao de fluxo
                      </div>
                      <label className="mt-3 inline-flex items-center gap-3 rounded-2xl border border-[rgba(204,225,255,0.92)] bg-[var(--color-primary-50)] px-4 py-3 text-sm font-semibold text-[var(--color-neutral-700)]">
                        <Checkbox
                          checked={configForm.inversaoFasesHabilitada}
                          onChange={(event) =>
                            setConfigForm((current) => ({
                              ...current,
                              inversaoFasesHabilitada: event.target.checked,
                            }))
                          }
                        />
                        Inverter ordem das fases (habilitacao antes da disputa)
                      </label>
                      {configForm.inversaoFasesHabilitada ? (
                        <FormField
                          label="Justificativa da inversao"
                          className="mt-3"
                        >
                          <Textarea
                            rows={3}
                            value={configForm.inversaoFasesJustificativa}
                            onChange={(event) =>
                              setConfigForm((current) => ({
                                ...current,
                                inversaoFasesJustificativa: event.target.value,
                              }))
                            }
                            placeholder="Explique o motivo e o impacto esperado da inversao."
                          />
                        </FormField>
                      ) : null}
                      <div className="mt-2 text-xs text-[var(--color-neutral-500)]">
                        Ao ativar a inversao, o sistema reordena a navegacao
                        para iniciar a habilitacao antes das fases competitivas.
                      </div>
                    </div>
                  ) : null}

                  <div className="grid gap-3">
                    <FormField label="Observacoes internas">
                      <Textarea
                        rows={3}
                        value={configForm.observacoes}
                        onChange={(event) => {
                          setConfigForm((current) => ({
                            ...current,
                            observacoes: event.target.value,
                          }));
                          setPublishForm((current) => ({
                            ...current,
                            observacao: event.target.value,
                          }));
                        }}
                      />
                    </FormField>
                  </div>

                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      type="submit"
                      disabled={saveConfiguracaoMutation.isPending}
                    >
                      {saveConfiguracaoMutation.isPending
                        ? "Salvando..."
                        : "Salvar configuracao interna"}
                    </Button>
                  </div>
                </form>

                <div className="mt-5 grid gap-4 2xl:grid-cols-[minmax(0,0.84fr)_minmax(0,1.16fr)]">
                  <div className="space-y-4">
                    <article className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-5 py-5 shadow-[0_12px_28px_-28px_rgba(15,26,109,0.38)]">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-primary-600)]">
                            Acervo da fase interna
                          </div>
                          <h4 className="mt-2 text-lg font-semibold text-[var(--color-primary-950)]">
                            {pendingRequired.length
                              ? isForaDoFluxo
                                ? "Atos com evidencia pendente, mas liberados por auditoria."
                                : "Ainda ha atos obrigatorios antes da publicacao."
                              : "Checklist interno pronto para seguir ao cronograma."}
                          </h4>
                          <p className="mt-1 text-sm leading-6 text-[var(--color-neutral-600)]">
                            A sequencia abaixo libera os atos de forma gradual e
                            mantem aberto apenas o detalhe ativo.
                          </p>
                        </div>
                        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-3 text-right shadow-[0_10px_24px_-24px_rgba(15,26,109,0.28)]">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-neutral-500)]">
                            Progresso
                          </div>
                          <div className="mt-1 text-2xl font-semibold text-[var(--color-primary-950)]">
                            {progressCount}/{checklistItems.length}
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-3">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-neutral-500)]">
                            Pendentes
                          </div>
                          <div className="mt-1 text-xl font-semibold text-[var(--color-primary-950)]">
                            {pendingRequired.length}
                          </div>
                        </div>
                        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-3">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-neutral-500)]">
                            Tratados
                          </div>
                          <div className="mt-1 text-xl font-semibold text-[var(--color-primary-950)]">
                            {addressedChecklistItems.length}
                          </div>
                        </div>
                        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-3">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-neutral-500)]">
                            Proximo ato
                          </div>
                          <div className="mt-1 text-sm font-semibold text-[var(--color-primary-950)]">
                            {selectedInternalChecklistItem?.label ?? "Nenhum"}
                          </div>
                        </div>
                      </div>

                      {pendingRequired.length ? (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {pendingRequired.slice(0, 4).map((item) => (
                            <button
                              key={item.category}
                              type="button"
                              className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 transition hover:border-amber-300 hover:bg-amber-100"
                              onClick={() =>
                                setSelectedInternalChecklistCategory(
                                  item.category,
                                )
                              }
                            >
                              <Clock3 className="h-3.5 w-3.5" />
                              {item.label}
                            </button>
                          ))}
                          {pendingRequired.length > 4 ? (
                            <span className="inline-flex items-center rounded-full border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-3 py-1.5 text-xs font-medium text-[var(--color-neutral-600)]">
                              +{pendingRequired.length - 4} outros
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </article>

                    <article className="rounded-3xl border border-[rgba(204,225,255,0.92)] bg-white px-4 py-4 shadow-[0_10px_24px_-28px_rgba(15,26,109,0.28)]">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-primary-600)]">
                            Sequencia de atos
                          </div>
                          <p className="mt-1 text-sm text-[var(--color-neutral-600)]">
                            Fila enxuta com liberacao progressiva.
                          </p>
                        </div>
                        <span className="inline-flex items-center rounded-full border border-[rgba(204,225,255,0.92)] bg-[var(--color-primary-50)] px-3 py-1 text-xs font-semibold text-[var(--color-primary-700)]">
                          {visibleInternalChecklistItems.length} de{" "}
                          {checklistItems.length}
                        </span>
                      </div>

                      <div className="mt-4 space-y-2">
                        {visibleInternalChecklistItems.map((item, index) => {
                          const active =
                            item.category ===
                            selectedInternalChecklistItem?.category;

                          return (
                            <button
                              key={item.category}
                              type="button"
                              className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                                active
                                  ? "border-[var(--color-primary-500)] bg-[var(--color-primary-50)] shadow-[0_12px_24px_-28px_rgba(15,26,109,0.42)]"
                                  : "border-[rgba(204,225,255,0.92)] bg-[var(--color-neutral-0)] hover:border-[var(--color-primary-300)] hover:bg-[var(--color-primary-50)]/60"
                              }`}
                              onClick={() =>
                                setSelectedInternalChecklistCategory(
                                  item.category,
                                )
                              }
                            >
                              <div className="flex items-start gap-3">
                                <div
                                  className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl text-sm font-semibold ${
                                    isChecklistItemAddressed(item)
                                      ? "bg-emerald-100 text-emerald-700"
                                      : "bg-amber-100 text-amber-800"
                                  }`}
                                >
                                  {index + internalChecklistLeadIndex + 1}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm font-semibold text-[var(--color-primary-950)]">
                                      {item.label}
                                    </span>
                                    <span
                                      className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getChecklistItemStatusClassName(item)}`}
                                    >
                                      {getChecklistItemStatusLabel(item)}
                                    </span>
                                  </div>
                                  <p className="mt-1 text-sm leading-6 text-[var(--color-neutral-600)]">
                                    {item.description}
                                  </p>
                                </div>
                                <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-[var(--color-neutral-400)]" />
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      {hiddenInternalChecklistCount > 0 ? (
                        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-[rgba(204,225,255,0.92)] bg-[var(--color-neutral-50)] px-4 py-3">
                          <div className="text-sm text-[var(--color-neutral-600)]">
                            Ainda restam {hiddenInternalChecklistCount} ato(s)
                            fora da visualizacao principal.
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() =>
                              setInternalChecklistRevealCount(
                                (current) => current + 2,
                              )
                            }
                          >
                            Mostrar proximos atos
                          </Button>
                        </div>
                      ) : null}

                      {addressedChecklistItems.length ? (
                        <div className="mt-4 flex flex-wrap gap-2 border-t border-[rgba(204,225,255,0.92)] pt-4">
                          {resolvedInternalChecklistPreview.map((item) => (
                            <button
                              key={item.category}
                              type="button"
                              className="inline-flex items-center gap-2 rounded-full border border-[rgba(204,225,255,0.92)] bg-[var(--color-neutral-50)] px-3 py-1.5 text-xs font-medium text-[var(--color-neutral-700)] transition hover:border-[var(--color-primary-300)] hover:bg-[var(--color-primary-50)] hover:text-[var(--color-primary-800)]"
                              onClick={() =>
                                setSelectedInternalChecklistCategory(
                                  item.category,
                                )
                              }
                            >
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                              {item.label}
                            </button>
                          ))}
                          {addressedChecklistItems.length > 3 ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                setShowResolvedInternalChecklist(
                                  (current) => !current,
                                )
                              }
                            >
                              {showResolvedInternalChecklist
                                ? "Mostrar menos"
                                : "Ver todos"}
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                    </article>
                  </div>

                  <article className="rounded-3xl border border-[rgba(204,225,255,0.92)] bg-white px-5 py-5 shadow-[0_16px_34px_-30px_rgba(15,26,109,0.34)]">
                    {selectedInternalChecklistItem &&
                    selectedInternalUploadState &&
                    selectedInternalChecklistFlexState ? (
                      <>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-primary-600)]">
                              Ato {selectedInternalChecklistIndex} de{" "}
                              {checklistItems.length}
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <h4 className="text-lg font-semibold text-[var(--color-primary-950)]">
                                {selectedInternalChecklistItem.label}
                              </h4>
                              <span
                                className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold ${getChecklistItemStatusClassName(selectedInternalChecklistItem)}`}
                              >
                                {getChecklistItemStatusLabel(
                                  selectedInternalChecklistItem,
                                )}
                              </span>
                            </div>
                            <p className="mt-2 text-sm leading-6 text-[var(--color-neutral-600)]">
                              {selectedInternalChecklistItem.description}
                            </p>
                          </div>
                          <div className="rounded-2xl bg-[var(--color-primary-900)] p-3 text-white">
                            <FileCheck2 className="h-5 w-5" />
                          </div>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          <span className="inline-flex rounded-full border border-[rgba(204,225,255,0.92)] bg-[var(--color-primary-50)] px-3 py-1 text-xs font-semibold text-[var(--color-primary-700)]">
                            {selectedInternalChecklistItem.obrigatorio
                              ? "Obrigatorio"
                              : "Condicional"}
                          </span>
                          {selectedInternalChecklistItem.completionHint ? (
                            <span className="inline-flex rounded-full border border-[rgba(204,225,255,0.92)] bg-[var(--color-neutral-50)] px-3 py-1 text-xs font-medium text-[var(--color-neutral-600)]">
                              {selectedInternalChecklistItem.completionHint}
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-5 rounded-2xl border border-[rgba(204,225,255,0.92)] bg-[var(--color-neutral-50)] px-4 py-4">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-primary-600)]">
                            Ultima evidencia
                          </div>
                          {selectedInternalLatestDocumento ? (
                            <>
                              <div className="mt-2 text-sm font-semibold text-[var(--color-primary-950)]">
                                {selectedInternalLatestDocumento.titulo}
                              </div>
                              <div className="mt-1 text-sm text-[var(--color-neutral-600)]">
                                Anexado em{" "}
                                {formatShortDateTimeBR(
                                  selectedInternalLatestDocumento.criadoEm,
                                )}
                              </div>
                              <div className="mt-3 flex flex-wrap gap-2">
                                <a
                                  href={
                                    resolveServerAssetUrl(
                                      selectedInternalLatestDocumento.arquivoUrl,
                                    ) ?? "#"
                                  }
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={
                                      !selectedInternalLatestDocumento.arquivoUrl
                                    }
                                  >
                                    Abrir documento
                                  </Button>
                                </a>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="destructive"
                                  disabled={
                                    deletingDocumentoId ===
                                    selectedInternalLatestDocumento.id
                                  }
                                  onClick={() =>
                                    void handleDeleteDocumento(
                                      selectedInternalLatestDocumento.id,
                                    )
                                  }
                                >
                                  {deletingDocumentoId ===
                                  selectedInternalLatestDocumento.id
                                    ? "Removendo..."
                                    : "Remover"}
                                </Button>
                              </div>
                            </>
                          ) : (
                            <p className="mt-2 text-sm text-[var(--color-neutral-600)]">
                              Nenhum documento vinculado a este ato ainda.
                            </p>
                          )}
                        </div>

                        {isForaDoFluxo ? (
                          <div className="mt-4 rounded-2xl border border-[rgba(204,225,255,0.92)] bg-[var(--color-neutral-50)] px-4 py-4">
                            <FormField label="Tratamento fora do fluxo">
                              <Select
                                value={
                                  selectedInternalChecklistFlexState.statusFlexivel
                                }
                                onChange={(event) =>
                                  setChecklistNaoAplicavelState(
                                    selectedInternalChecklistItem.category,
                                    (current) => ({
                                      ...current,
                                      statusFlexivel: event.target
                                        .value as ChecklistFlexStatus,
                                    }),
                                  )
                                }
                              >
                                {licitacaoChecklistFlexStatusOptions.map(
                                  (status) => (
                                    <option key={status} value={status}>
                                      {
                                        licitacaoChecklistFlexStatusLabels[
                                          status
                                        ]
                                      }
                                    </option>
                                  ),
                                )}
                              </Select>
                            </FormField>

                            {selectedInternalChecklistFlexState.statusFlexivel ===
                            "OUTRO_SETOR" ? (
                              <div className="mt-3 grid gap-3 md:grid-cols-2">
                                <FormField label="Departamento responsavel">
                                  <Input
                                    value={
                                      selectedInternalChecklistFlexState.departamentoResponsavel
                                    }
                                    onChange={(event) =>
                                      setChecklistNaoAplicavelState(
                                        selectedInternalChecklistItem.category,
                                        (current) => ({
                                          ...current,
                                          departamentoResponsavel:
                                            event.target.value,
                                        }),
                                      )
                                    }
                                  />
                                </FormField>
                                <FormField label="Previsao de recebimento">
                                  <Input
                                    type="date"
                                    value={
                                      selectedInternalChecklistFlexState.previsaoRecebimento
                                    }
                                    onChange={(event) =>
                                      setChecklistNaoAplicavelState(
                                        selectedInternalChecklistItem.category,
                                        (current) => ({
                                          ...current,
                                          previsaoRecebimento:
                                            event.target.value,
                                        }),
                                      )
                                    }
                                  />
                                </FormField>
                              </div>
                            ) : null}

                            {selectedInternalChecklistFlexState.statusFlexivel ===
                            "CONCLUIDO_FISICO" ? (
                              <div className="mt-3 grid gap-3 md:grid-cols-2">
                                <FormField label="Numero do processo fisico">
                                  <Input
                                    value={
                                      selectedInternalChecklistFlexState.processoFisicoNumero
                                    }
                                    onChange={(event) =>
                                      setChecklistNaoAplicavelState(
                                        selectedInternalChecklistItem.category,
                                        (current) => ({
                                          ...current,
                                          processoFisicoNumero:
                                            event.target.value,
                                        }),
                                      )
                                    }
                                  />
                                </FormField>
                                <FormField label="Local de arquivamento">
                                  <Input
                                    value={
                                      selectedInternalChecklistFlexState.localArquivamento
                                    }
                                    onChange={(event) =>
                                      setChecklistNaoAplicavelState(
                                        selectedInternalChecklistItem.category,
                                        (current) => ({
                                          ...current,
                                          localArquivamento: event.target.value,
                                        }),
                                      )
                                    }
                                  />
                                </FormField>
                                <div className="md:col-span-2">
                                  <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[rgba(204,225,255,0.92)] bg-white px-3 py-3">
                                    <Checkbox
                                      checked={
                                        selectedInternalChecklistFlexState.digitalizarDepois
                                      }
                                      onCheckedChange={(checked) =>
                                        setChecklistNaoAplicavelState(
                                          selectedInternalChecklistItem.category,
                                          (current) => ({
                                            ...current,
                                            digitalizarDepois: Boolean(checked),
                                          }),
                                        )
                                      }
                                    />
                                    <span className="text-sm font-medium text-[var(--color-neutral-700)]">
                                      Documento fisico ainda sera digitalizado
                                      depois
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ) : null}

                            {selectedInternalChecklistFlexState.statusFlexivel !==
                            "PADRAO" ? (
                              <FormField label="Justificativa" className="mt-3">
                                <Textarea
                                  rows={3}
                                  value={
                                    selectedInternalChecklistFlexState.justificativa
                                  }
                                  onChange={(event) =>
                                    setChecklistNaoAplicavelState(
                                      selectedInternalChecklistItem.category,
                                      (current) => ({
                                        ...current,
                                        justificativa: event.target.value,
                                      }),
                                    )
                                  }
                                />
                              </FormField>
                            ) : null}

                            <div className="mt-4 flex justify-end">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={
                                  setChecklistNaoAplicavelMutation.isPending
                                }
                                onClick={() =>
                                  void handleChecklistNaoAplicavel(
                                    selectedInternalChecklistItem,
                                  )
                                }
                              >
                                {setChecklistNaoAplicavelMutation.isPending
                                  ? "Salvando..."
                                  : selectedInternalChecklistFlexState.statusFlexivel ===
                                      "PADRAO"
                                    ? "Reativar ato"
                                    : "Salvar tratamento"}
                              </Button>
                            </div>
                          </div>
                        ) : null}

                        <div className="mt-4 rounded-2xl border border-[rgba(204,225,255,0.92)] bg-white px-4 py-4">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-primary-600)]">
                            Nova evidencia
                          </div>
                          {selectedInternalChecklistUsesCIModal ? (
                            <div className="mt-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-4">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="max-w-2xl">
                                  <div className="text-sm font-semibold text-[var(--text-primary)]">
                                    Gere a CI pelo próprio processo
                                  </div>
                                  <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
                                    Monte a comunicação interna com os dados
                                    atuais do processo, revise no editor e salve
                                    direto neste ato do checklist.
                                  </p>
                                </div>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  onClick={() => setShowCIReservaModal(true)}
                                  icon={<FileStack className="h-4 w-4" />}
                                >
                                  Gerar CI de reserva
                                </Button>
                              </div>
                            </div>
                          ) : null}
                          <div className="mt-3 grid gap-3 2xl:grid-cols-2">
                            <FormField label="Titulo">
                              <Input
                                value={selectedInternalUploadState.titulo}
                                onChange={(event) =>
                                  setUploadState(
                                    selectedInternalChecklistItem.category,
                                    (current) => ({
                                      ...current,
                                      titulo: event.target.value,
                                    }),
                                  )
                                }
                                placeholder={
                                  selectedInternalChecklistItem.label
                                }
                              />
                            </FormField>
                            <FormField label="Descricao">
                              <Input
                                value={selectedInternalUploadState.descricao}
                                onChange={(event) =>
                                  setUploadState(
                                    selectedInternalChecklistItem.category,
                                    (current) => ({
                                      ...current,
                                      descricao: event.target.value,
                                    }),
                                  )
                                }
                                placeholder={
                                  selectedInternalChecklistItem.description
                                }
                              />
                            </FormField>
                            <FormField
                              label="Arquivo"
                              className="2xl:col-span-2"
                            >
                              <Input
                                type="file"
                                onChange={(event) =>
                                  handleFileChange(
                                    selectedInternalChecklistItem.category,
                                    event,
                                    selectedInternalChecklistItem.label,
                                  )
                                }
                              />
                            </FormField>
                          </div>
                          <div className="mt-4 flex justify-end">
                            <Button
                              type="button"
                              onClick={() =>
                                void handleUploadChecklistDocumento(
                                  selectedInternalChecklistItem,
                                )
                              }
                            >
                              <Upload className="h-4 w-4" />
                              Anexar documento
                            </Button>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-[rgba(204,225,255,0.92)] bg-[var(--color-neutral-50)] px-4 py-6 text-sm text-[var(--color-neutral-600)]">
                        Nenhum ato interno disponivel para detalhamento.
                      </div>
                    )}
                  </article>
                </div>

                <div className="hidden">
                  {checklistItems.map((item) => {
                    const uploadState = getUploadState(
                      uploadForms,
                      item.category,
                    );
                    const latestDocumento = (
                      docsByCategory.get(item.category) ?? []
                    )
                      .slice()
                      .sort(
                        (left, right) =>
                          new Date(right.criadoEm).getTime() -
                          new Date(left.criadoEm).getTime(),
                      )[0];
                    const naoAplicavelState = checklistNaoAplicavelForm[
                      item.category
                    ] ?? {
                      statusFlexivel:
                        item.statusFlexivel ??
                        (item.naoAplicavel ? "NAO_APLICAVEL" : "PADRAO"),
                      justificativa: item.justificativaNaoAplicavel ?? "",
                      departamentoResponsavel:
                        item.departamentoResponsavel ?? "",
                      previsaoRecebimento: toDateInputValue(
                        item.previsaoRecebimento,
                      ),
                      processoFisicoNumero: item.processoFisicoNumero ?? "",
                      localArquivamento: item.localArquivamento ?? "",
                      digitalizarDepois: item.digitalizarDepois ?? false,
                    };
                    const statusLabel =
                      item.statusFlexivel && item.statusFlexivel !== "PADRAO"
                        ? licitacaoChecklistFlexStatusLabels[
                            item.statusFlexivel
                          ]
                        : item.concluido
                          ? "Anexado"
                          : "Pendente";
                    const statusClass =
                      item.statusFlexivel === "OUTRO_SETOR"
                        ? "bg-sky-100 text-sky-800"
                        : item.statusFlexivel === "CONCLUIDO_FISICO"
                          ? "bg-violet-100 text-violet-800"
                          : item.naoAplicavel
                            ? "bg-slate-100 text-slate-800"
                            : item.concluido
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-amber-100 text-amber-800";

                    return (
                      <article
                        key={item.category}
                        className="rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-white p-4 shadow-[0_10px_24px_-24px_rgba(15,26,109,0.35)]"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="text-base font-black text-[var(--color-primary-900)]">
                                {item.label}
                              </h4>
                              <span
                                className={`inline-flex rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] ${statusClass}`}
                              >
                                {statusLabel}
                              </span>
                              {!item.obrigatorio ? (
                                <span className="inline-flex rounded-full bg-[var(--color-neutral-100)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--color-neutral-700)]">
                                  Condicional
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-2 text-sm leading-6 text-[var(--color-neutral-600)]">
                              {item.description}
                            </p>
                          </div>
                          <div className="rounded-2xl bg-[var(--color-primary-900)] p-3 text-white">
                            <FileCheck2 className="h-5 w-5" />
                          </div>
                        </div>
                        {latestDocumento ? (
                          <div className="mt-4 rounded-2xl border border-[rgba(204,225,255,0.92)] bg-[var(--color-primary-50)] p-3 text-sm">
                            <div className="font-semibold text-[var(--color-primary-900)]">
                              {latestDocumento.titulo}
                            </div>
                            <div className="mt-1 text-[var(--color-neutral-600)]">
                              Anexado em{" "}
                              {formatShortDateTimeBR(latestDocumento.criadoEm)}
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <a
                                href={
                                  resolveServerAssetUrl(
                                    latestDocumento.arquivoUrl,
                                  ) ?? "#"
                                }
                                target="_blank"
                                rel="noreferrer"
                              >
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={!latestDocumento.arquivoUrl}
                                >
                                  Abrir documento
                                </Button>
                              </a>
                              <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                disabled={
                                  deletingDocumentoId === latestDocumento.id
                                }
                                onClick={() =>
                                  void handleDeleteDocumento(latestDocumento.id)
                                }
                              >
                                {deletingDocumentoId === latestDocumento.id
                                  ? "Removendo..."
                                  : "Remover"}
                              </Button>
                            </div>
                          </div>
                        ) : null}

                        {isForaDoFluxo ? (
                          <div className="mt-4 rounded-2xl border border-[rgba(204,225,255,0.92)] bg-[var(--color-neutral-50)] p-3">
                            <div className="grid gap-3">
                              <FormField label="Tratamento do item fora do fluxo">
                                <Select
                                  value={naoAplicavelState.statusFlexivel}
                                  onChange={(event) =>
                                    setChecklistNaoAplicavelState(
                                      item.category,
                                      (current) => ({
                                        ...current,
                                        statusFlexivel: event.target
                                          .value as ChecklistFlexStatus,
                                      }),
                                    )
                                  }
                                >
                                  {licitacaoChecklistFlexStatusOptions.map(
                                    (status) => (
                                      <option key={status} value={status}>
                                        {
                                          licitacaoChecklistFlexStatusLabels[
                                            status
                                          ]
                                        }
                                      </option>
                                    ),
                                  )}
                                </Select>
                              </FormField>

                              {naoAplicavelState.statusFlexivel ===
                              "OUTRO_SETOR" ? (
                                <div className="grid gap-3 md:grid-cols-2">
                                  <FormField label="Departamento responsavel">
                                    <Input
                                      value={
                                        naoAplicavelState.departamentoResponsavel
                                      }
                                      onChange={(event) =>
                                        setChecklistNaoAplicavelState(
                                          item.category,
                                          (current) => ({
                                            ...current,
                                            departamentoResponsavel:
                                              event.target.value,
                                          }),
                                        )
                                      }
                                      placeholder="Ex.: Orcamento, PGM, Controladoria"
                                    />
                                  </FormField>
                                  <FormField label="Previsao de recebimento">
                                    <Input
                                      type="date"
                                      value={
                                        naoAplicavelState.previsaoRecebimento
                                      }
                                      onChange={(event) =>
                                        setChecklistNaoAplicavelState(
                                          item.category,
                                          (current) => ({
                                            ...current,
                                            previsaoRecebimento:
                                              event.target.value,
                                          }),
                                        )
                                      }
                                    />
                                  </FormField>
                                </div>
                              ) : null}

                              {naoAplicavelState.statusFlexivel ===
                              "CONCLUIDO_FISICO" ? (
                                <div className="grid gap-3 md:grid-cols-2">
                                  <FormField label="Numero do processo fisico">
                                    <Input
                                      value={
                                        naoAplicavelState.processoFisicoNumero
                                      }
                                      onChange={(event) =>
                                        setChecklistNaoAplicavelState(
                                          item.category,
                                          (current) => ({
                                            ...current,
                                            processoFisicoNumero:
                                              event.target.value,
                                          }),
                                        )
                                      }
                                      placeholder="Ex.: 0045/2026-FISICO"
                                    />
                                  </FormField>
                                  <FormField label="Local de arquivamento">
                                    <Input
                                      value={
                                        naoAplicavelState.localArquivamento
                                      }
                                      onChange={(event) =>
                                        setChecklistNaoAplicavelState(
                                          item.category,
                                          (current) => ({
                                            ...current,
                                            localArquivamento:
                                              event.target.value,
                                          }),
                                        )
                                      }
                                      placeholder="Informe o setor, armario ou caixa"
                                    />
                                  </FormField>
                                  <div className="md:col-span-2">
                                    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[rgba(204,225,255,0.92)] bg-white/80 px-3 py-3">
                                      <Checkbox
                                        checked={
                                          naoAplicavelState.digitalizarDepois
                                        }
                                        onCheckedChange={(checked) =>
                                          setChecklistNaoAplicavelState(
                                            item.category,
                                            (current) => ({
                                              ...current,
                                              digitalizarDepois:
                                                Boolean(checked),
                                            }),
                                          )
                                        }
                                      />
                                      <span className="text-sm font-semibold text-[var(--color-neutral-800)]">
                                        Documento fisico ainda sera digitalizado
                                        depois
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              ) : null}

                              {naoAplicavelState.statusFlexivel !== "PADRAO" ? (
                                <FormField
                                  label={
                                    naoAplicavelState.statusFlexivel ===
                                    "NAO_APLICAVEL"
                                      ? "Justificativa (obrigatoria)"
                                      : "Contexto operacional e justificativa"
                                  }
                                >
                                  <Textarea
                                    rows={3}
                                    value={naoAplicavelState.justificativa}
                                    onChange={(event) =>
                                      setChecklistNaoAplicavelState(
                                        item.category,
                                        (current) => ({
                                          ...current,
                                          justificativa: event.target.value,
                                        }),
                                      )
                                    }
                                    placeholder={
                                      naoAplicavelState.statusFlexivel ===
                                      "NAO_APLICAVEL"
                                        ? "Explique por que este item nao se aplica ao processo."
                                        : naoAplicavelState.statusFlexivel ===
                                            "OUTRO_SETOR"
                                          ? "Informe o setor que esta com o documento e a previsao de retorno."
                                          : "Descreva a referencia do processo fisico e qualquer pendencia de digitalizacao."
                                    }
                                  />
                                </FormField>
                              ) : null}
                            </div>
                            {item.statusFlexivel &&
                            item.statusFlexivel !== "PADRAO" &&
                            item.justificativaNaoAplicavel ? (
                              <div className="mt-3 rounded-2xl border border-dashed border-[rgba(15,26,109,0.12)] bg-white/80 px-3 py-2 text-xs text-[var(--color-neutral-600)]">
                                Registro atual:{" "}
                                {
                                  licitacaoChecklistFlexStatusLabels[
                                    item.statusFlexivel
                                  ]
                                }
                                {item.departamentoResponsavel
                                  ? ` | setor: ${item.departamentoResponsavel}`
                                  : ""}
                                {item.previsaoRecebimento
                                  ? ` | previsao: ${formatShortDateBR(item.previsaoRecebimento)}`
                                  : ""}
                                {item.localArquivamento
                                  ? ` | arquivo fisico: ${item.localArquivamento}`
                                  : ""}
                                {item.digitalizarDepois
                                  ? " | digitalizacao pendente"
                                  : ""}
                                <div className="mt-1">
                                  Justificativa:{" "}
                                  {item.justificativaNaoAplicavel}
                                </div>
                              </div>
                            ) : null}
                            <div className="mt-3 flex justify-end">
                              <Button
                                type="button"
                                variant="outline"
                                disabled={
                                  setChecklistNaoAplicavelMutation.isPending
                                }
                                onClick={() =>
                                  void handleChecklistNaoAplicavel(item)
                                }
                              >
                                {setChecklistNaoAplicavelMutation.isPending
                                  ? "Salvando..."
                                  : naoAplicavelState.statusFlexivel ===
                                      "PADRAO"
                                    ? "Reativar item"
                                    : "Salvar status especial"}
                              </Button>
                            </div>
                          </div>
                        ) : null}

                        <div className="mt-4 grid gap-3 2xl:grid-cols-2">
                          <FormField label="Titulo">
                            <Input
                              value={uploadState.titulo}
                              onChange={(event) =>
                                setUploadState(item.category, (current) => ({
                                  ...current,
                                  titulo: event.target.value,
                                }))
                              }
                              placeholder={item.label}
                            />
                          </FormField>
                          <FormField label="Descricao">
                            <Input
                              value={uploadState.descricao}
                              onChange={(event) =>
                                setUploadState(item.category, (current) => ({
                                  ...current,
                                  descricao: event.target.value,
                                }))
                              }
                              placeholder={item.description}
                            />
                          </FormField>
                          <FormField label="Arquivo" className="2xl:col-span-2">
                            <Input
                              type="file"
                              onChange={(event) =>
                                handleFileChange(
                                  item.category,
                                  event,
                                  item.label,
                                )
                              }
                            />
                          </FormField>
                        </div>

                        <div className="mt-3 flex justify-end">
                          <Button
                            type="button"
                            onClick={() =>
                              void handleUploadChecklistDocumento(item)
                            }
                          >
                            <Upload className="h-4 w-4" />
                            Anexar documento
                          </Button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </CollapsibleSectionCard>
            </section>

            <section
              ref={externalRef}
              className={isLegalSectionVisible("external") ? "" : "hidden"}
            >
              <CollapsibleSectionCard
                title="Fase externa e rito operacional"
                description="Checklist contextual da fase externa, com evidencias documentais e leitura do andamento da sessao."
                open={sectionOpen.external}
                onToggle={(nextOpen) =>
                  setSectionOpen((current) => ({
                    ...current,
                    external: nextOpen,
                  }))
                }
                action={
                  <div className="inline-flex items-center gap-2 rounded-full bg-[var(--color-primary-900)] px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-white">
                    <CalendarClock className="h-4 w-4" />
                    {
                      externalChecklistItems.filter((item) => item.concluido)
                        .length
                    }
                    /{externalChecklistItems.length} concluidos
                  </div>
                }
                collapsedSummary={
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="rounded-full bg-[var(--color-primary-50)] px-3 py-1 font-semibold text-[var(--color-primary-700)]">
                      Checklist externo:{" "}
                      {
                        externalChecklistItems.filter((item) => item.concluido)
                          .length
                      }
                      /{externalChecklistItems.length}
                    </span>
                    <span className="rounded-full bg-[var(--color-primary-50)] px-3 py-1 font-semibold text-[var(--color-primary-700)]">
                      Pendentes: {externalPendingRequired.length}
                    </span>
                    <span className="rounded-full bg-[var(--color-primary-50)] px-3 py-1 font-semibold text-[var(--color-primary-700)]">
                      Publicado: {detalhe.processo.publicado ? "Sim" : "Nao"}
                    </span>
                  </div>
                }
              >
                <div className="grid gap-3 xl:grid-cols-4">
                  <article className="rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-white px-4 py-4">
                    <div className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">
                      Sessao oficial
                    </div>
                    <div className="mt-2 text-lg font-black text-[var(--color-primary-900)]">
                      {detalhe.licitacao.dataAberturaPropostas
                        ? formatShortDateTimeBR(
                            detalhe.licitacao.dataAberturaPropostas,
                          )
                        : "Ainda nao definida"}
                    </div>
                    <p className="mt-1 text-sm text-[var(--color-neutral-600)]">
                      Data da abertura e disputa vinculada ao processo.
                    </p>
                  </article>
                  <article className="rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-white px-4 py-4">
                    <div className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">
                      Propostas
                    </div>
                    <div className="mt-2 text-lg font-black text-[var(--color-primary-900)]">
                      {detalhe.propostas.length}
                    </div>
                    <p className="mt-1 text-sm text-[var(--color-neutral-600)]">
                      Registros operacionais ja associados a fase externa.
                    </p>
                  </article>
                  <article className="rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-white px-4 py-4">
                    <div className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">
                      Habilitacao
                    </div>
                    <div className="mt-2 text-lg font-black text-[var(--color-primary-900)]">
                      {
                        detalhe.licitantes.filter(
                          (item) => item.statusHabilitacao !== "PENDENTE",
                        ).length
                      }
                      /{detalhe.licitantes.length}
                    </div>
                    <p className="mt-1 text-sm text-[var(--color-neutral-600)]">
                      Licitantes com analise documental ja registrada.
                    </p>
                  </article>
                  <article className="rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-white px-4 py-4">
                    <div className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">
                      Fechamento
                    </div>
                    <div className="mt-2 text-lg font-black text-[var(--color-primary-900)]">
                      {detalhe.processo.homologado
                        ? "Homologado"
                        : "Em andamento"}
                    </div>
                    <p className="mt-1 text-sm text-[var(--color-neutral-600)]">
                      Ata, termo e envio a Controladoria para encerramento.
                    </p>
                  </article>
                </div>

                {externalPendingRequired.length ? (
                  <Alert variant="warning" title="Pendencias da fase externa">
                    Ainda faltam evidencias obrigatorias para concluir a fase
                    externa:{" "}
                    {externalPendingRequired
                      .map((item) => item.label)
                      .join(", ")}
                    .
                  </Alert>
                ) : (
                  <Alert variant="success">
                    A fase externa possui evidencias suficientes para seguir
                    para contrato e fechamento administrativo.
                  </Alert>
                )}

                <div className="grid gap-4 2xl:grid-cols-2">
                  {externalChecklistItems.map((item) => {
                    const uploadState = getUploadState(
                      uploadForms,
                      item.category,
                    );
                    const latestDocumento = item.documentos
                      .slice()
                      .sort(
                        (left, right) =>
                          new Date(right.criadoEm).getTime() -
                          new Date(left.criadoEm).getTime(),
                      )[0];
                    const statusClass = item.concluido
                      ? "bg-emerald-100 text-emerald-800"
                      : item.obrigatorio
                        ? "bg-amber-100 text-amber-800"
                        : "bg-slate-100 text-slate-800";

                    return (
                      <article
                        key={item.category}
                        className="rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-white p-4 shadow-[0_10px_24px_-24px_rgba(15,26,109,0.35)]"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="text-base font-black text-[var(--color-primary-900)]">
                                {item.label}
                              </h4>
                              <span
                                className={`inline-flex rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] ${statusClass}`}
                              >
                                {item.concluido
                                  ? "Concluido"
                                  : item.obrigatorio
                                    ? "Obrigatorio"
                                    : "Opcional"}
                              </span>
                            </div>
                            <p className="mt-2 text-sm leading-6 text-[var(--color-neutral-600)]">
                              {item.description}
                            </p>
                            {item.baseLegal ? (
                              <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-primary-600)]">
                                {item.baseLegal}
                              </p>
                            ) : null}
                          </div>
                          <div className="rounded-2xl bg-[var(--color-primary-900)] p-3 text-white">
                            <FileCheck2 className="h-5 w-5" />
                          </div>
                        </div>

                        <div className="mt-4 rounded-2xl border border-[rgba(204,225,255,0.92)] bg-[var(--color-primary-50)] px-3 py-3 text-sm text-[var(--color-neutral-700)]">
                          {latestDocumento ? (
                            <>
                              <div className="font-semibold text-[var(--color-primary-900)]">
                                {latestDocumento.titulo}
                              </div>
                              <div className="mt-1 text-[var(--color-neutral-600)]">
                                Ultima evidencia anexada em{" "}
                                {formatShortDateTimeBR(
                                  latestDocumento.criadoEm,
                                )}
                              </div>
                            </>
                          ) : (
                            <div className="font-semibold text-[var(--color-neutral-700)]">
                              {item.statusOrigem ??
                                "Sem evidencia anexada ate o momento."}
                            </div>
                          )}
                          {item.completionHint ? (
                            <div className="mt-2 text-xs text-[var(--color-neutral-500)]">
                              {item.completionHint}
                            </div>
                          ) : null}
                        </div>

                        <div className="mt-4 grid gap-3 2xl:grid-cols-2">
                          <FormField label="Titulo da evidencia">
                            <Input
                              value={uploadState.titulo}
                              onChange={(event) =>
                                setUploadState(item.category, (current) => ({
                                  ...current,
                                  titulo: event.target.value,
                                }))
                              }
                              placeholder={item.label}
                            />
                          </FormField>
                          <FormField label="Descricao">
                            <Input
                              value={uploadState.descricao}
                              onChange={(event) =>
                                setUploadState(item.category, (current) => ({
                                  ...current,
                                  descricao: event.target.value,
                                }))
                              }
                              placeholder="Ex.: exportacao da plataforma, comprovante, ata assinada"
                            />
                          </FormField>
                          <FormField label="Arquivo" className="2xl:col-span-2">
                            <Input
                              type="file"
                              onChange={(event) =>
                                handleFileChange(
                                  item.category,
                                  event,
                                  item.label,
                                )
                              }
                            />
                          </FormField>
                        </div>

                        <div className="mt-3 flex flex-wrap justify-end gap-2">
                          {latestDocumento ? (
                            <a
                              href={
                                resolveServerAssetUrl(
                                  latestDocumento.arquivoUrl,
                                ) ?? "#"
                              }
                              target="_blank"
                              rel="noreferrer"
                            >
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={!latestDocumento.arquivoUrl}
                              >
                                Abrir evidencia
                              </Button>
                            </a>
                          ) : null}
                          <Button
                            type="button"
                            onClick={() =>
                              void handleUploadChecklistDocumento(item)
                            }
                          >
                            <Upload className="h-4 w-4" />
                            Anexar evidencia
                          </Button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </CollapsibleSectionCard>
            </section>

            <section
              ref={docsRef}
              className={isLegalSectionVisible("docs") ? "" : "hidden"}
            >
              <CollapsibleSectionCard
                title="Documentos do processo"
                description="Acervo completo recebido pelo setor, na ordem em que os documentos foram adicionados ao processo."
                open={sectionOpen.docs}
                onToggle={(nextOpen) =>
                  setSectionOpen((current) => ({ ...current, docs: nextOpen }))
                }
                action={
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowAllDocsModal(true)}
                  >
                    <FolderKanban className="h-4 w-4" />
                    Abrir em destaque
                  </Button>
                }
                collapsedSummary={
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="rounded-full bg-[var(--color-primary-50)] px-3 py-1 font-semibold text-[var(--color-primary-700)]">
                      {documentos.length} documento(s)
                    </span>
                    {documentos[0] ? (
                      <span className="rounded-full bg-[var(--color-primary-50)] px-3 py-1 font-semibold text-[var(--color-primary-700)]">
                        Ultimo: {documentos[0].titulo}
                      </span>
                    ) : null}
                  </div>
                }
              >
                {!documentos.length ? (
                  <Alert variant="info">
                    Este processo ainda nao possui documentos vinculados.
                  </Alert>
                ) : (
                  <div className="overflow-x-auto rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-white shadow-[0_12px_24px_-24px_rgba(15,26,109,0.22)]">
                    <Table className="min-w-[1080px]">
                      <TableHead>
                        <tr>
                          <TableHeaderCell>#</TableHeaderCell>
                          <TableHeaderCell>Titulo</TableHeaderCell>
                          <TableHeaderCell>Tipo</TableHeaderCell>
                          <TableHeaderCell>Categoria</TableHeaderCell>
                          <TableHeaderCell>Adicionado em</TableHeaderCell>
                          <TableHeaderCell className="text-right">
                            Arquivo
                          </TableHeaderCell>
                        </tr>
                      </TableHead>
                      <TableBody>
                        {documentos.map((item, index) => (
                          <TableRow key={item.id}>
                            <TableCell>{index + 1}</TableCell>
                            <TableCell>
                              <div className="font-semibold text-[var(--color-primary-900)]">
                                {item.titulo}
                              </div>
                              <div className="text-xs text-[var(--color-neutral-500)]">
                                Versao {item.versao}
                              </div>
                            </TableCell>
                            <TableCell>{item.tipo}</TableCell>
                            <TableCell>{item.categoria ?? "-"}</TableCell>
                            <TableCell>
                              {formatShortDateTimeBR(item.criadoEm)}
                            </TableCell>
                            <TableCell className="text-right">
                              <a
                                href={
                                  resolveServerAssetUrl(item.arquivoUrl) ?? "#"
                                }
                                target="_blank"
                                rel="noreferrer"
                              >
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={!item.arquivoUrl}
                                >
                                  Abrir
                                </Button>
                              </a>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CollapsibleSectionCard>
            </section>

            <section
              ref={publicationRef}
              className={isLegalSectionVisible("publication") ? "" : "hidden"}
            >
              <CollapsibleSectionCard
                title={
                  isForaDoFluxo
                    ? "Cronograma manual (processo fora do fluxo)"
                    : "Publicacao e cronograma automatico"
                }
                description={
                  isForaDoFluxo
                    ? "Edite manualmente todas as datas criticas e registre a justificativa no modo fora do fluxo."
                    : "Depois de concluir a fase interna, o sistema calcula automaticamente o cronograma de publicacao e prazos com o acrescimo municipal adotado em Teixeira de Freitas."
                }
                open={sectionOpen.publication}
                onToggle={(nextOpen) =>
                  setSectionOpen((current) => ({
                    ...current,
                    publication: nextOpen,
                  }))
                }
                action={
                  <div className="inline-flex items-center gap-2 rounded-full bg-[var(--color-primary-100)] px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-primary-800)]">
                    <CalendarClock className="h-4 w-4" />
                    {isForaDoFluxo ? "Modo manual" : "Contador automatico"}
                  </div>
                }
                collapsedSummary={
                  isForaDoFluxo ? (
                    <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
                        <span className="font-semibold text-amber-900">
                          {publishForm.dataPublicacaoEdital
                            ? formatShortDateBR(
                                new Date(
                                  `${publishForm.dataPublicacaoEdital}T12:00:00`,
                                ),
                              )
                            : "Sem data"}
                        </span>
                        <div className="text-amber-700">
                          Publicacao (manual)
                        </div>
                      </div>
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
                        <span className="font-semibold text-amber-900">
                          {manualScheduleForm.dataRecebimentoPropostasInicio
                            ? formatShortDateTimeBR(
                                new Date(
                                  manualScheduleForm.dataRecebimentoPropostasInicio,
                                ),
                              )
                            : "Sem data"}
                        </span>
                        <div className="text-amber-700">
                          Recebimento inicial
                        </div>
                      </div>
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
                        <span className="font-semibold text-amber-900">
                          {manualScheduleForm.dataRecebimentoPropostasFim
                            ? formatShortDateTimeBR(
                                new Date(
                                  manualScheduleForm.dataRecebimentoPropostasFim,
                                ),
                              )
                            : "Sem data"}
                        </span>
                        <div className="text-amber-700">Recebimento final</div>
                      </div>
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
                        <span className="font-semibold text-amber-900">
                          {manualScheduleForm.dataAberturaPropostas
                            ? formatShortDateTimeBR(
                                new Date(
                                  manualScheduleForm.dataAberturaPropostas,
                                ),
                              )
                            : "Sem data"}
                        </span>
                        <div className="text-amber-700">Disputa</div>
                      </div>
                    </div>
                  ) : schedulePreview ? (
                    <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
                      <div className="rounded-2xl border border-[rgba(204,225,255,0.92)] bg-[var(--color-primary-50)] px-4 py-3 text-sm">
                        <span className="font-semibold text-[var(--color-primary-900)]">
                          {formatShortDateBR(
                            schedulePreview.dataPublicacaoEdital,
                          )}
                        </span>
                        <div className="text-[var(--color-neutral-500)]">
                          Publicacao
                        </div>
                      </div>
                      <div className="rounded-2xl border border-[rgba(204,225,255,0.92)] bg-[var(--color-primary-50)] px-4 py-3 text-sm">
                        <span className="font-semibold text-[var(--color-primary-900)]">
                          {formatShortDateTimeBR(
                            schedulePreview.dataRecebimentoPropostasInicio,
                          )}
                        </span>
                        <div className="text-[var(--color-neutral-500)]">
                          Recebimento inicial
                        </div>
                      </div>
                      <div className="rounded-2xl border border-[rgba(204,225,255,0.92)] bg-[var(--color-primary-50)] px-4 py-3 text-sm">
                        <span className="font-semibold text-[var(--color-primary-900)]">
                          {formatShortDateTimeBR(
                            schedulePreview.dataRecebimentoPropostasFim,
                          )}
                        </span>
                        <div className="text-[var(--color-neutral-500)]">
                          Recebimento final
                        </div>
                      </div>
                      <div className="rounded-2xl border border-[rgba(204,225,255,0.92)] bg-[var(--color-primary-50)] px-4 py-3 text-sm">
                        <span className="font-semibold text-[var(--color-primary-900)]">
                          {formatShortDateTimeBR(
                            schedulePreview.dataAberturaPropostas,
                          )}
                        </span>
                        <div className="text-[var(--color-neutral-500)]">
                          Disputa
                        </div>
                      </div>
                    </div>
                  ) : (
                    <Alert variant="info">
                      Informe a data de publicacao e a hora da disputa para
                      gerar o cronograma automatico.
                    </Alert>
                  )
                }
              >
                <form
                  id="licitacao-publicacao-form"
                  className="space-y-5"
                  onSubmit={handlePublish}
                >
                  <DatePickerLegal
                    value={publishForm.dataPublicacaoEdital}
                    onChange={(nextValue) =>
                      setPublishForm((current) => ({
                        ...current,
                        dataPublicacaoEdital: nextValue,
                      }))
                    }
                    modalidadeCodigo={detalhe?.processo.modalidadeCodigo}
                    tipoObjeto={detalhe?.processo.tipoObjeto}
                    criterioJulgamento={
                      configForm.criterioJulgamento ||
                      detalhe?.processo.criterioJulgamento
                    }
                    publicarNoDou={configForm.publicarNoDou}
                    publicarEmJornal={configForm.publicarEmJornal}
                    foraDoFluxo={isForaDoFluxo}
                    acrescimoMunicipal={acrescimoMunicipal}
                    feriadosLocais={feriadosLocais}
                    comparisonDate={
                      isForaDoFluxo
                        ? manualScheduleForm.dataAberturaPropostas
                        : schedulePreview?.dataAberturaPropostas
                    }
                    comparisonLabel="Sessao / disputa"
                    justificationValue={legalDateOverrideJustification}
                    onJustificationChange={setLegalDateOverrideJustification}
                    label="Data de publicacao no PNCP"
                  />

                  <div className="grid gap-3 xl:grid-cols-3 2xl:grid-cols-4">
                    <FormField label="Hora da disputa">
                      <div className="relative">
                        <Input
                          type="time"
                          value={publishForm.horaDisputa}
                          onChange={(event) =>
                            setPublishForm((current) => ({
                              ...current,
                              horaDisputa: event.target.value,
                            }))
                          }
                        />
                        <Clock3 className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-[var(--color-neutral-400)]" />
                      </div>
                    </FormField>
                    <FormField label="Condutor do processo">
                      <Select
                        value={publishForm.condutorProcessoId}
                        onChange={(event) =>
                          setPublishForm((current) => ({
                            ...current,
                            condutorProcessoId: event.target.value,
                          }))
                        }
                      >
                        <option value="">Selecione</option>
                        {catalogsQuery.data?.pessoas.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.nome}
                          </option>
                        ))}
                      </Select>
                    </FormField>
                    <FormField label="Status do processo">
                      <Select
                        value={publishForm.statusId}
                        onChange={(event) =>
                          setPublishForm((current) => ({
                            ...current,
                            statusId: event.target.value,
                          }))
                        }
                      >
                        <option value="">Manter atual</option>
                        {catalogsQuery.data?.statusProcesso.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.nome}
                          </option>
                        ))}
                      </Select>
                    </FormField>
                    <FormField label="Numero do edital">
                      <Input
                        value={
                          detalhe.processo.numeroEdital ??
                          "Gerado automaticamente no ato da publicacao"
                        }
                        disabled
                      />
                    </FormField>
                  </div>

                  {publishCriticalStatusDateRequired ? (
                    <FormField
                      label={`Data do status critico (${selectedPublishStatus!.nome ?? selectedPublishStatus!.codigo})`}
                    >
                      <Input
                        type="date"
                        value={publishForm.dataStatus}
                        required={publishCriticalStatusDateRequired}
                        onChange={(event) =>
                          setPublishForm((current) => ({
                            ...current,
                            dataStatus: event.target.value,
                          }))
                        }
                      />
                    </FormField>
                  ) : null}

                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <FormField label="Link publico da BLL">
                      <div className="space-y-2">
                        <Input
                          type="url"
                          placeholder="https://bllcompras.com/Process/..."
                          value={publishForm.linkBllPublico}
                          onChange={(event) =>
                            setPublishForm((current) => ({
                              ...current,
                              linkBllPublico: event.target.value,
                            }))
                          }
                        />
                        {publishForm.linkBllPublico ? (
                          <a
                            href={publishForm.linkBllPublico}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--color-primary-700)] hover:text-[var(--color-primary-900)]"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            Abrir pagina publica da BLL
                          </a>
                        ) : null}
                      </div>
                    </FormField>
                    <FormField label="Link publico do PNCP">
                      <div className="space-y-2">
                        <Input
                          type="url"
                          placeholder="https://pncp.gov.br/..."
                          value={publishForm.linkPncpPublico}
                          onChange={(event) =>
                            setPublishForm((current) => ({
                              ...current,
                              linkPncpPublico: event.target.value,
                            }))
                          }
                        />
                        {publishForm.linkPncpPublico ? (
                          <a
                            href={publishForm.linkPncpPublico}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--color-primary-700)] hover:text-[var(--color-primary-900)]"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            Abrir publicacao do PNCP
                          </a>
                        ) : null}
                      </div>
                    </FormField>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <FormField label="Descricao da movimentacao">
                      <Input
                        value={publishForm.descricao}
                        onChange={(event) =>
                          setPublishForm((current) => ({
                            ...current,
                            descricao: event.target.value,
                          }))
                        }
                      />
                    </FormField>
                    <FormField label="Observacao operacional">
                      <Textarea
                        rows={3}
                        value={publishForm.observacao}
                        onChange={(event) =>
                          setPublishForm((current) => ({
                            ...current,
                            observacao: event.target.value,
                          }))
                        }
                      />
                    </FormField>
                  </div>

                  {inversaoFasesAtiva ? (
                    <Alert variant="info">
                      Inversao de fases ativa: a habilitacao e priorizada antes
                      das etapas competitivas. Ajuste o cronograma conforme
                      necessario.
                    </Alert>
                  ) : null}

                  {isForaDoFluxo ? (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
                      <div className="text-xs font-bold uppercase tracking-[0.18em] text-amber-700">
                        Cronograma manual
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                        <FormField label="Recebimento inicial">
                          <Input
                            type="datetime-local"
                            value={
                              manualScheduleForm.dataRecebimentoPropostasInicio
                            }
                            onChange={(event) =>
                              setManualScheduleForm((current) => ({
                                ...current,
                                dataRecebimentoPropostasInicio:
                                  event.target.value,
                              }))
                            }
                          />
                        </FormField>
                        <FormField label="Recebimento final">
                          <Input
                            type="datetime-local"
                            value={
                              manualScheduleForm.dataRecebimentoPropostasFim
                            }
                            onChange={(event) =>
                              setManualScheduleForm((current) => ({
                                ...current,
                                dataRecebimentoPropostasFim: event.target.value,
                              }))
                            }
                          />
                        </FormField>
                        <FormField label="Abertura / disputa">
                          <Input
                            type="datetime-local"
                            value={manualScheduleForm.dataAberturaPropostas}
                            onChange={(event) =>
                              setManualScheduleForm((current) => ({
                                ...current,
                                dataAberturaPropostas: event.target.value,
                              }))
                            }
                          />
                        </FormField>
                        <FormField label="Inicio dos lances">
                          <Input
                            type="datetime-local"
                            value={manualScheduleForm.dataInicioLances}
                            onChange={(event) =>
                              setManualScheduleForm((current) => ({
                                ...current,
                                dataInicioLances: event.target.value,
                              }))
                            }
                          />
                        </FormField>
                        <FormField label="Fim dos lances">
                          <Input
                            type="datetime-local"
                            value={manualScheduleForm.dataFimLances}
                            onChange={(event) =>
                              setManualScheduleForm((current) => ({
                                ...current,
                                dataFimLances: event.target.value,
                              }))
                            }
                          />
                        </FormField>
                        <FormField label="Julgamento">
                          <Input
                            type="datetime-local"
                            value={manualScheduleForm.dataJulgamento}
                            onChange={(event) =>
                              setManualScheduleForm((current) => ({
                                ...current,
                                dataJulgamento: event.target.value,
                              }))
                            }
                          />
                        </FormField>
                      </div>
                    </div>
                  ) : null}
                  {isForaDoFluxo ? (
                    <div className="space-y-3">
                      <Alert variant="warning">
                        Cronograma manual ativo. As datas acima serao usadas
                        para auditoria e publicacao.
                      </Alert>
                      {manualScheduleViolatesLegalMinimum &&
                      legalScheduleWindow ? (
                        <Alert variant="warning">
                          A sessao manual esta anterior ao minimo legal
                          calculado para{" "}
                          {formatShortDateBR(
                            legalScheduleWindow.dataMinimaLegal,
                          )}
                          . O SIREL permitira o registro extemporaneo, mas
                          exigira justificativa e mantera o rastreio reforcado.
                        </Alert>
                      ) : null}
                    </div>
                  ) : schedulePreview ? (
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
                      <article className="rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-[var(--color-primary-50)] px-4 py-4">
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">
                          Publicacao
                        </p>
                        <p className="mt-2 text-lg font-black text-[var(--color-primary-900)]">
                          {formatShortDateBR(
                            schedulePreview.dataPublicacaoEdital,
                          )}
                        </p>
                        <p className="mt-1 text-sm text-[var(--color-neutral-600)]">
                          Data base informada
                        </p>
                      </article>
                      <article className="rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-[var(--color-primary-50)] px-4 py-4">
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">
                          Recebimento inicial
                        </p>
                        <p className="mt-2 text-lg font-black text-[var(--color-primary-900)]">
                          {formatShortDateTimeBR(
                            schedulePreview.dataRecebimentoPropostasInicio,
                          )}
                        </p>
                        <p className="mt-1 text-sm text-[var(--color-neutral-600)]">
                          {schedulePreview.startOffset} dias uteis apos a
                          publicacao
                        </p>
                      </article>
                      <article className="rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-[var(--color-primary-50)] px-4 py-4">
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">
                          Recebimento final
                        </p>
                        <p className="mt-2 text-lg font-black text-[var(--color-primary-900)]">
                          {formatShortDateTimeBR(
                            schedulePreview.dataRecebimentoPropostasFim,
                          )}
                        </p>
                        <p className="mt-1 text-sm text-[var(--color-neutral-600)]">
                          Mesmo dia da disputa, 15 minutos antes
                        </p>
                      </article>
                      <article className="rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-[var(--color-primary-50)] px-4 py-4">
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">
                          Sessao / disputa
                        </p>
                        <p className="mt-2 text-lg font-black text-[var(--color-primary-900)]">
                          {formatShortDateTimeBR(
                            schedulePreview.dataAberturaPropostas,
                          )}
                        </p>
                        <p className="mt-1 text-sm text-[var(--color-neutral-600)]">
                          Horario definido para a disputa
                        </p>
                      </article>
                      <article className="rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-[var(--color-primary-50)] px-4 py-4">
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">
                          Acrescimos
                        </p>
                        <p className="mt-2 text-lg font-black text-[var(--color-primary-900)]">
                          +{schedulePreview.municipioExtra}
                          {schedulePreview.canaisExtra
                            ? ` / +${schedulePreview.canaisExtra}`
                            : ""}
                        </p>
                        <p className="mt-1 text-sm text-[var(--color-neutral-600)]">
                          Municipio / canais extras (DOU ou jornal)
                        </p>
                      </article>
                    </div>
                  ) : (
                    <Alert variant="info">
                      Defina a data prevista de publicacao e a hora da disputa
                      para calcular automaticamente o cronograma.
                    </Alert>
                  )}

                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void persistConfiguracao()}
                      disabled={saveConfiguracaoMutation.isPending}
                    >
                      Salvar cronograma
                    </Button>
                    <Button type="submit" disabled={publishMutation.isPending}>
                      {publishMutation.isPending
                        ? "Publicando..."
                        : "Publicar processo"}
                    </Button>
                  </div>
                </form>
              </CollapsibleSectionCard>
            </section>
            {inversaoFasesAtiva ? habilitacaoSection : null}

            {showCompetitivoSteps ? (
              <section
                ref={licitantesRef}
                className={isLegalSectionVisible("licitantes") ? "" : "hidden"}
              >
                <CollapsibleSectionCard
                  title="Licitantes"
                  description="Controle dos participantes habilitados a apresentar propostas nesta licitacao."
                  open={sectionOpen.licitantes}
                  onToggle={(nextOpen) =>
                    setSectionOpen((current) => ({
                      ...current,
                      licitantes: nextOpen,
                    }))
                  }
                  collapsedSummary={
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      <span className="rounded-full bg-[var(--color-primary-50)] px-3 py-1 font-semibold text-[var(--color-primary-700)]">
                        {detalhe.licitantes.length} licitante(s)
                      </span>
                      {detalhe.licitantes[0] ? (
                        <span className="rounded-full bg-[var(--color-primary-50)] px-3 py-1 font-semibold text-[var(--color-primary-700)]">
                          Ultimo: {detalhe.licitantes[0].razaoSocial}
                        </span>
                      ) : null}
                    </div>
                  }
                >
                  <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_auto]">
                    <FormField label="Fornecedor">
                      <Select
                        value={licitanteFornecedorId}
                        onChange={(event) =>
                          setLicitanteFornecedorId(event.target.value)
                        }
                      >
                        <option value="">Selecione</option>
                        {catalogsQuery.data?.fornecedores.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.razaoSocial}{" "}
                            {item.cnpj ? `- ${item.cnpj}` : ""}
                          </option>
                        ))}
                      </Select>
                    </FormField>
                    <div className="flex items-end">
                      <Button
                        type="button"
                        onClick={() => void handleAddLicitante()}
                        disabled={saveLicitanteMutation.isPending}
                      >
                        {saveLicitanteMutation.isPending
                          ? "Incluindo..."
                          : "Adicionar licitante"}
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 overflow-x-auto rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-white shadow-[0_12px_24px_-24px_rgba(15,26,109,0.22)]">
                    <Table className="min-w-[860px]">
                      <TableHead>
                        <tr>
                          <TableHeaderCell>Licitante</TableHeaderCell>
                          <TableHeaderCell>CNPJ</TableHeaderCell>
                          <TableHeaderCell>Habilitacao</TableHeaderCell>
                          <TableHeaderCell>Cadastro</TableHeaderCell>
                          <TableHeaderCell className="text-right">
                            Acoes
                          </TableHeaderCell>
                        </tr>
                      </TableHead>
                      <TableBody>
                        {detalhe.licitantes.length ? (
                          detalhe.licitantes.map((item) => (
                            <TableRow key={item.id}>
                              <TableCell>
                                {item.fornecedorId ? (
                                  <button
                                    type="button"
                                    className="font-semibold text-[var(--accent-color)]"
                                    onClick={() =>
                                      setLocation(
                                        `/dossie/fornecedor/${item.fornecedorId}`,
                                      )
                                    }
                                  >
                                    {item.razaoSocial}
                                  </button>
                                ) : (
                                  <div className="font-semibold text-[var(--color-primary-900)]">
                                    {item.razaoSocial}
                                  </div>
                                )}
                                <div className="text-xs text-[var(--color-neutral-500)]">
                                  {item.ativo ? "Participando" : "Inativo"}
                                </div>
                              </TableCell>
                              <TableCell>{item.cnpj ?? "-"}</TableCell>
                              <TableCell>
                                {habilitacaoStatusLabels[
                                  item.statusHabilitacao as keyof typeof habilitacaoStatusLabels
                                ] ?? item.statusHabilitacao}
                              </TableCell>
                              <TableCell>
                                {formatShortDateTimeBR(item.dataCadastro)}
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    void deleteLicitanteMutation.mutateAsync({
                                      licitanteId: item.id,
                                    })
                                  }
                                  disabled={
                                    deleteLicitanteMutation.isPending ||
                                    !item.ativo
                                  }
                                >
                                  Retirar
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell
                              colSpan={5}
                              className="text-[var(--color-neutral-500)]"
                            >
                              Nenhum licitante registrado ainda.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CollapsibleSectionCard>
              </section>
            ) : null}

            {showCompetitivoSteps ? (
              <section
                ref={propostasRef}
                className={isLegalSectionVisible("propostas") ? "" : "hidden"}
              >
                <CollapsibleSectionCard
                  title="Propostas"
                  description="Recebimento, classificacao inicial e situacao das propostas por item e por licitante."
                  open={sectionOpen.propostas}
                  onToggle={(nextOpen) =>
                    setSectionOpen((current) => ({
                      ...current,
                      propostas: nextOpen,
                    }))
                  }
                  action={
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => setOperationModal("proposta")}
                      >
                        Nova proposta
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          void handleAdvanceStage(
                            "RECEBIMENTO_PROPOSTAS",
                            "Licitacao / recebimento de propostas",
                            "Recebimento de propostas em andamento.",
                          )
                        }
                        disabled={advanceStageMutation.isPending}
                      >
                        Definir etapa atual
                      </Button>
                    </div>
                  }
                  collapsedSummary={
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      <span className="rounded-full bg-[var(--color-primary-50)] px-3 py-1 font-semibold text-[var(--color-primary-700)]">
                        {detalhe.propostas.length} proposta(s)
                      </span>
                      {detalhe.propostas[0] ? (
                        <span className="rounded-full bg-[var(--color-primary-50)] px-3 py-1 font-semibold text-[var(--color-primary-700)]">
                          Ultima: item {detalhe.propostas[0].itemNumero}
                        </span>
                      ) : null}
                    </div>
                  }
                >
                  <div className="rounded-[24px] border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--color-primary-600)]">
                          Entrada sob demanda
                        </div>
                        <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
                          O cadastro foi movido para um modal focado.
                        </p>
                        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                          A secao agora prioriza leitura, classificacao e
                          comparacao das propostas sem empilhar campos na tela.
                        </p>
                      </div>
                      <Button
                        type="button"
                        onClick={() => setOperationModal("proposta")}
                      >
                        Nova proposta
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="text-sm text-[var(--text-secondary)]">
                      {propostasPagination.totalItems} proposta(s) registradas.
                    </div>
                    {propostasPagination.totalPages > 1 ? (
                      <Pagination
                        page={propostasPagination.page}
                        totalPages={propostasPagination.totalPages}
                        onPageChange={setPropostasPage}
                      />
                    ) : null}
                  </div>

                  <div className="mt-4 overflow-x-auto rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-white shadow-[0_12px_24px_-24px_rgba(15,26,109,0.22)]">
                    <Table className="min-w-[1080px]">
                      <TableHead>
                        <tr>
                          <TableHeaderCell className={stickyColumnHeaderClass}>
                            Item
                          </TableHeaderCell>
                          <TableHeaderCell>Licitante</TableHeaderCell>
                          <TableHeaderCell>Valor unitario</TableHeaderCell>
                          <TableHeaderCell>Valor atual</TableHeaderCell>
                          <TableHeaderCell>Classificacao</TableHeaderCell>
                          <TableHeaderCell>Situacao</TableHeaderCell>
                          <TableHeaderCell>Data</TableHeaderCell>
                        </tr>
                      </TableHead>
                      <TableBody>
                        {propostasPagination.totalItems ? (
                          propostasPagination.items.map((item) => (
                            <TableRow key={item.id}>
                              <TableCell className={stickyColumnCellClass}>
                                {item.itemCatalogoId ? (
                                  <button
                                    type="button"
                                    className="font-semibold text-[var(--accent-color)]"
                                    onClick={() =>
                                      setLocation(
                                        `/dossie/item/${item.itemCatalogoId}`,
                                      )
                                    }
                                  >
                                    Item {item.itemNumero}
                                  </button>
                                ) : (
                                  <div className="font-semibold text-[var(--color-primary-900)]">
                                    Item {item.itemNumero}
                                  </div>
                                )}
                                <div className="text-xs text-[var(--color-neutral-500)]">
                                  {item.itemDescricao}
                                </div>
                              </TableCell>
                              <TableCell>
                                {item.fornecedorId ? (
                                  <button
                                    type="button"
                                    className="font-semibold text-[var(--accent-color)]"
                                    onClick={() =>
                                      setLocation(
                                        `/dossie/fornecedor/${item.fornecedorId}`,
                                      )
                                    }
                                  >
                                    {item.licitanteNome}
                                  </button>
                                ) : (
                                  item.licitanteNome
                                )}
                              </TableCell>
                              <TableCell>
                                {formatCurrencyBRL(
                                  Number(item.valorUnitarioProposto ?? 0),
                                )}
                              </TableCell>
                              <TableCell>
                                {formatCurrencyBRL(
                                  Number(item.valorAtualUnitario ?? 0),
                                )}
                              </TableCell>
                              <TableCell>{item.classificacao ?? "-"}</TableCell>
                              <TableCell>
                                {propostaSituacaoLabels[
                                  item.situacao as keyof typeof propostaSituacaoLabels
                                ] ?? item.situacao}
                              </TableCell>
                              <TableCell>
                                {formatShortDateTimeBR(item.dataProposta)}
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell
                              colSpan={7}
                              className="text-[var(--color-neutral-500)]"
                            >
                              Nenhuma proposta registrada ainda.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CollapsibleSectionCard>
              </section>
            ) : null}

            {showLances ? (
              <section
                ref={lancesRef}
                className={isLegalSectionVisible("lances") ? "" : "hidden"}
              >
                <CollapsibleSectionCard
                  title="Lances"
                  description="Registro operacional dos lances apresentados durante a sessao publica."
                  open={sectionOpen.lances}
                  onToggle={(nextOpen) =>
                    setSectionOpen((current) => ({
                      ...current,
                      lances: nextOpen,
                    }))
                  }
                  action={
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => setOperationModal("lance")}
                      >
                        Registrar lance
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          void handleAdvanceStage(
                            "LANCES",
                            "Licitacao / fase de lances",
                            "Sessao de lances em andamento.",
                          )
                        }
                        disabled={advanceStageMutation.isPending}
                      >
                        Definir etapa atual
                      </Button>
                    </div>
                  }
                  collapsedSummary={
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      <span className="rounded-full bg-[var(--color-primary-50)] px-3 py-1 font-semibold text-[var(--color-primary-700)]">
                        {detalhe.lances.length} lance(s)
                      </span>
                      {detalhe.lances[0] ? (
                        <span className="rounded-full bg-[var(--color-primary-50)] px-3 py-1 font-semibold text-[var(--color-primary-700)]">
                          Ultimo em{" "}
                          {formatShortDateTimeBR(detalhe.lances[0].dataLance)}
                        </span>
                      ) : null}
                    </div>
                  }
                >
                  <div className="rounded-[24px] border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--color-primary-600)]">
                          Registro rapido
                        </div>
                        <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
                          Os lances agora entram por modal para reduzir rolagem.
                        </p>
                        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                          A secao principal fica dedicada ao acompanhamento da
                          sessao e a leitura da trilha de ofertas.
                        </p>
                      </div>
                      <Button
                        type="button"
                        onClick={() => setOperationModal("lance")}
                      >
                        Registrar lance
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="text-sm text-[var(--text-secondary)]">
                      {lancesPagination.totalItems} lance(s) registrados.
                    </div>
                    {lancesPagination.totalPages > 1 ? (
                      <Pagination
                        page={lancesPagination.page}
                        totalPages={lancesPagination.totalPages}
                        onPageChange={setLancesPage}
                      />
                    ) : null}
                  </div>

                  <div className="mt-4 overflow-x-auto rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-white shadow-[0_12px_24px_-24px_rgba(15,26,109,0.22)]">
                    <Table className="min-w-[920px]">
                      <TableHead>
                        <tr>
                          <TableHeaderCell className={stickyColumnHeaderClass}>
                            Proposta
                          </TableHeaderCell>
                          <TableHeaderCell>Valor</TableHeaderCell>
                          <TableHeaderCell>Registrado em</TableHeaderCell>
                          <TableHeaderCell>Usuario</TableHeaderCell>
                          <TableHeaderCell>Observacao</TableHeaderCell>
                        </tr>
                      </TableHead>
                      <TableBody>
                        {lancesPagination.totalItems ? (
                          lancesPagination.items.map((item) => (
                            <TableRow key={item.id}>
                              <TableCell className={stickyColumnCellClass}>
                                {item.propostaId}
                              </TableCell>
                              <TableCell>
                                {formatCurrencyBRL(
                                  Number(item.valorLance ?? 0),
                                )}
                              </TableCell>
                              <TableCell>
                                {formatShortDateTimeBR(item.dataLance)}
                              </TableCell>
                              <TableCell>
                                {item.usuarioNome ?? "Sistema"}
                              </TableCell>
                              <TableCell>{item.observacao ?? "-"}</TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell
                              colSpan={5}
                              className="text-[var(--color-neutral-500)]"
                            >
                              Nenhum lance registrado ainda.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CollapsibleSectionCard>
              </section>
            ) : null}

            {showCompetitivoSteps ? (
              <section
                ref={julgamentoRef}
                className={isLegalSectionVisible("julgamento") ? "" : "hidden"}
              >
                <CollapsibleSectionCard
                  title="Julgamento"
                  description="Definicao visual da etapa de julgamento e conferencia da classificacao das propostas."
                  open={sectionOpen.julgamento}
                  onToggle={(nextOpen) =>
                    setSectionOpen((current) => ({
                      ...current,
                      julgamento: nextOpen,
                    }))
                  }
                  action={
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        void handleAdvanceStage(
                          "JULGAMENTO",
                          "Licitacao / julgamento",
                          "Classificacao e julgamento das propostas.",
                        )
                      }
                      disabled={advanceStageMutation.isPending}
                    >
                      Definir etapa atual
                    </Button>
                  }
                  collapsedSummary={
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      <span className="rounded-full bg-[var(--color-primary-50)] px-3 py-1 font-semibold text-[var(--color-primary-700)]">
                        Status:{" "}
                        {licitacaoStatusLabels[
                          detalhe.licitacao
                            .statusLicitacao as keyof typeof licitacaoStatusLabels
                        ] ?? detalhe.licitacao.statusLicitacao}
                      </span>
                    </div>
                  }
                >
                  <Alert variant="info">
                    Use as classificacoes e situacoes lancadas em propostas para
                    registrar o julgamento. Esta secao define visualmente a
                    etapa atual e permite conferencia consolidada.
                  </Alert>
                  <div className="mt-4 overflow-x-auto rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-white shadow-[0_12px_24px_-24px_rgba(15,26,109,0.22)]">
                    <Table className="min-w-[1040px]">
                      <TableHead>
                        <tr>
                          <TableHeaderCell>Item</TableHeaderCell>
                          <TableHeaderCell>Licitante</TableHeaderCell>
                          <TableHeaderCell>Classificacao</TableHeaderCell>
                          <TableHeaderCell>Situacao</TableHeaderCell>
                          <TableHeaderCell>Valor atual</TableHeaderCell>
                          <TableHeaderCell>Justificativa</TableHeaderCell>
                        </tr>
                      </TableHead>
                      <TableBody>
                        {detalhe.propostas.length ? (
                          detalhe.propostas.map((item) => (
                            <TableRow key={item.id}>
                              <TableCell>
                                {item.itemCatalogoId ? (
                                  <button
                                    type="button"
                                    className="font-semibold text-[var(--accent-color)]"
                                    onClick={() =>
                                      setLocation(
                                        `/dossie/item/${item.itemCatalogoId}`,
                                      )
                                    }
                                  >
                                    {item.itemNumero}
                                  </button>
                                ) : (
                                  item.itemNumero
                                )}
                              </TableCell>
                              <TableCell>
                                {item.fornecedorId ? (
                                  <button
                                    type="button"
                                    className="font-semibold text-[var(--accent-color)]"
                                    onClick={() =>
                                      setLocation(
                                        `/dossie/fornecedor/${item.fornecedorId}`,
                                      )
                                    }
                                  >
                                    {item.licitanteNome}
                                  </button>
                                ) : (
                                  item.licitanteNome
                                )}
                              </TableCell>
                              <TableCell>{item.classificacao ?? "-"}</TableCell>
                              <TableCell>
                                {propostaSituacaoLabels[
                                  item.situacao as keyof typeof propostaSituacaoLabels
                                ] ?? item.situacao}
                              </TableCell>
                              <TableCell>
                                {formatCurrencyBRL(
                                  Number(item.valorAtualTotal ?? 0),
                                )}
                              </TableCell>
                              <TableCell>{item.justificativa ?? "-"}</TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell
                              colSpan={6}
                              className="text-[var(--color-neutral-500)]"
                            >
                              Sem propostas para julgamento.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CollapsibleSectionCard>
              </section>
            ) : null}

            {!inversaoFasesAtiva ? habilitacaoSection : null}

            {showRecursos ? (
              <section
                ref={recursosRef}
                className={isLegalSectionVisible("recursos") ? "" : "hidden"}
              >
                <CollapsibleSectionCard
                  title="Recursos"
                  description="Registro de interposicao, julgamento e resultado recursal dentro da fase licitatoria."
                  open={sectionOpen.recursos}
                  onToggle={(nextOpen) =>
                    setSectionOpen((current) => ({
                      ...current,
                      recursos: nextOpen,
                    }))
                  }
                  action={
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => setOperationModal("recurso")}
                      >
                        Registrar recurso
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          void handleAdvanceStage(
                            "RECURSOS",
                            "Licitacao / recursos administrativos",
                            "Abertura da fase recursal.",
                          )
                        }
                        disabled={advanceStageMutation.isPending}
                      >
                        Definir etapa atual
                      </Button>
                    </div>
                  }
                  collapsedSummary={
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      <span className="rounded-full bg-[var(--color-primary-50)] px-3 py-1 font-semibold text-[var(--color-primary-700)]">
                        {detalhe.recursos.length} recurso(s)
                      </span>
                    </div>
                  }
                >
                  <div className="rounded-[24px] border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--color-primary-600)]">
                          Tratamento recursal focado
                        </div>
                        <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
                          Interposicao e decisao foram concentradas em modal.
                        </p>
                        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                          O painel principal passa a destacar os recursos
                          existentes e o status de cada decisao.
                        </p>
                      </div>
                      <Button
                        type="button"
                        onClick={() => setOperationModal("recurso")}
                      >
                        Registrar recurso
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="text-sm text-[var(--text-secondary)]">
                      {recursosPagination.totalItems} recurso(s) cadastrados.
                    </div>
                    {recursosPagination.totalPages > 1 ? (
                      <Pagination
                        page={recursosPagination.page}
                        totalPages={recursosPagination.totalPages}
                        onPageChange={setRecursosPage}
                      />
                    ) : null}
                  </div>

                  <div className="mt-4 overflow-x-auto rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-white shadow-[0_12px_24px_-24px_rgba(15,26,109,0.22)]">
                    <Table className="min-w-[1100px]">
                      <TableHead>
                        <tr>
                          <TableHeaderCell className={stickyColumnHeaderClass}>
                            Licitante
                          </TableHeaderCell>
                          <TableHeaderCell>Interposicao</TableHeaderCell>
                          <TableHeaderCell>Julgamento</TableHeaderCell>
                          <TableHeaderCell>Resultado</TableHeaderCell>
                          <TableHeaderCell>Descricao</TableHeaderCell>
                        </tr>
                      </TableHead>
                      <TableBody>
                        {recursosPagination.totalItems ? (
                          recursosPagination.items.map((item) => (
                            <TableRow key={item.id}>
                              <TableCell className={stickyColumnCellClass}>
                                {item.licitanteNome}
                              </TableCell>
                              <TableCell>
                                {formatShortDateBR(item.dataInterposicao)}
                              </TableCell>
                              <TableCell>
                                {formatShortDateBR(item.dataJulgamento)}
                              </TableCell>
                              <TableCell>
                                {recursoResultadoLabels[
                                  item.resultado as keyof typeof recursoResultadoLabels
                                ] ?? item.resultado}
                              </TableCell>
                              <TableCell>{item.descricao}</TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell
                              colSpan={5}
                              className="text-[var(--color-neutral-500)]"
                            >
                              Nenhum recurso registrado ate o momento.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CollapsibleSectionCard>
              </section>
            ) : null}

            <section
              ref={homologacaoRef}
              className={isLegalSectionVisible("homologacao") ? "" : "hidden"}
            >
              <CollapsibleSectionCard
                title="Homologacao"
                description="Encerramento formal da fase licitatoria com atualizacao do status final do processo."
                open={sectionOpen.homologacao}
                onToggle={(nextOpen) =>
                  setSectionOpen((current) => ({
                    ...current,
                    homologacao: nextOpen,
                  }))
                }
                action={
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setOperationModal("homologacao")}
                  >
                    {detalhe.processo.homologado
                      ? "Revisar homologacao"
                      : "Concluir homologacao"}
                  </Button>
                }
                collapsedSummary={
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="rounded-full bg-[var(--color-primary-50)] px-3 py-1 font-semibold text-[var(--color-primary-700)]">
                      {detalhe.processo.homologado
                        ? "Processo homologado"
                        : "Homologacao pendente"}
                    </span>
                  </div>
                }
              >
                <div className="rounded-[24px] border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--color-primary-600)]">
                        Encerramento formal
                      </div>
                      <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
                        A homologacao agora acontece em um modal concentrado.
                      </p>
                      <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                        Isso preserva a leitura do encerramento e deixa a acao
                        principal da etapa sempre acessivel pelo rodape fixo.
                      </p>
                    </div>
                    <Button
                      type="button"
                      onClick={() => setOperationModal("homologacao")}
                    >
                      {detalhe.processo.homologado
                        ? "Revisar homologacao"
                        : "Concluir homologacao"}
                    </Button>
                  </div>
                </div>
              </CollapsibleSectionCard>
            </section>

            {isForaDoFluxo ? (
              <section
                ref={auditoriaRef}
                className={isLegalSectionVisible("auditoria") ? "" : "hidden"}
              >
                <CollapsibleSectionCard
                  title="Auditoria reforcada"
                  description="Log detalhado de alteracoes campo a campo para processos fora do fluxo."
                  open={sectionOpen.auditoria}
                  onToggle={(nextOpen) =>
                    setSectionOpen((current) => ({
                      ...current,
                      auditoria: nextOpen,
                    }))
                  }
                  collapsedSummary={
                    auditoriaItems.length ? (
                      <div className="rounded-2xl border border-[rgba(204,225,255,0.92)] bg-[var(--color-primary-50)] px-4 py-3 text-sm">
                        <span className="font-semibold text-[var(--color-primary-900)]">
                          {cleanDisplayText(auditoriaItems[0]?.descricao)}
                        </span>
                        <div className="text-[var(--color-neutral-500)]">
                          {formatShortDateTimeBR(auditoriaItems[0]?.criadoEm)}
                        </div>
                      </div>
                    ) : (
                      <Alert variant="info">
                        Nenhuma auditoria registrada para este processo.
                      </Alert>
                    )
                  }
                >
                  <Suspense fallback={deferredSectionFallback}>
                    <LicitacaoProcessoAuditoriaContent
                      actionFilter={auditActionFilter}
                      userFilter={auditUserFilter}
                      onActionFilterChange={setAuditActionFilter}
                      onUserFilterChange={setAuditUserFilter}
                      userOptions={auditoriaUserOptions}
                      isLoading={auditoriaQuery.isLoading}
                      items={auditoriaItems}
                      pagination={auditoriaPagination}
                      onPageChange={setAuditoriaPage}
                      stickyColumnHeaderClass={stickyColumnHeaderClass}
                      stickyColumnCellClass={stickyColumnCellClass}
                      formatShortDateTimeBR={formatShortDateTimeBR}
                      formatAuditValue={formatAuditValue}
                      cleanDisplayText={cleanDisplayText}
                    />
                  </Suspense>
                </CollapsibleSectionCard>
              </section>
            ) : null}

            <section
              ref={historyRef}
              className={isLegalSectionVisible("history") ? "" : "hidden"}
            >
              <CollapsibleSectionCard
                title="Movimentacoes recentes"
                description="Rastro operacional da fase licitatoria para acompanhamento do setor e da gestao."
                open={sectionOpen.history}
                onToggle={(nextOpen) =>
                  setSectionOpen((current) => ({
                    ...current,
                    history: nextOpen,
                  }))
                }
                collapsedSummary={
                  detalhe.historico.length ? (
                    <div className="rounded-2xl border border-[rgba(204,225,255,0.92)] bg-[var(--color-primary-50)] px-4 py-3 text-sm">
                      <span className="font-semibold text-[var(--color-primary-900)]">
                        {cleanDisplayText(detalhe.historico[0]?.descricao)}
                      </span>
                      <div className="text-[var(--color-neutral-500)]">
                        {formatShortDateTimeBR(detalhe.historico[0]?.criadoEm)}
                      </div>
                    </div>
                  ) : (
                    <Alert variant="info">
                      Ainda nao ha movimentacoes registradas para esta etapa.
                    </Alert>
                  )
                }
              >
                <Suspense fallback={deferredSectionFallback}>
                  <LicitacaoProcessoHistoryContent
                    items={detalhe.historico}
                    cleanDisplayText={cleanDisplayText}
                    formatShortDateTimeBR={formatShortDateTimeBR}
                  />
                </Suspense>
              </CollapsibleSectionCard>
            </section>
          </div>
        </div>
      </SectionCard>

      <MacroTransitionModal
        open={contractTransitionOpen}
        onClose={() => setContractTransitionOpen(false)}
        title={`Encaminhar ${detalhe.processo.numeroSirel} para Contratos`}
        targetLabel="Contratos"
        blockers={contractGateQuery.data?.blockers ?? []}
        loading={advanceMacroPhaseMutation.isPending}
        onConfirm={async (payload) => {
          await advanceMacroPhaseMutation.mutateAsync({
            processoId,
            moduloDestino: "CONTRATOS",
            permitirBypass: payload.permitirBypass,
            justificativaAuditoria: payload.justificativaAuditoria,
            observacao: payload.observacao,
          });
        }}
      />

      <Modal
        open={operationModal === "proposta"}
        onClose={() => setOperationModal(null)}
        title="Registrar proposta"
        description="Cadastro focado para manter a leitura da disputa limpa."
        size="lg"
        actions={
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOperationModal(null)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="licitacao-proposta-form"
              disabled={savePropostaMutation.isPending}
            >
              {savePropostaMutation.isPending
                ? "Salvando..."
                : "Registrar proposta"}
            </Button>
          </div>
        }
      >
        <form
          id="licitacao-proposta-form"
          className="grid gap-4 2xl:grid-cols-2"
          onSubmit={handleSaveProposta}
        >
          <FormField label="Licitante">
            <Select
              value={propostaForm.licitanteId}
              onChange={(event) =>
                setPropostaForm((current) => ({
                  ...current,
                  licitanteId: event.target.value,
                }))
              }
            >
              <option value="">Selecione</option>
              {detalhe.licitantes
                .filter((item) => item.ativo)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.razaoSocial}
                  </option>
                ))}
            </Select>
          </FormField>
          <FormField label="Item do processo">
            <Select
              value={propostaForm.itemId}
              onChange={(event) =>
                setPropostaForm((current) => ({
                  ...current,
                  itemId: event.target.value,
                }))
              }
            >
              <option value="">Selecione</option>
              {detalhe.itens.map((item) => (
                <option key={item.id} value={item.id}>
                  Item {item.numeroItem} - {item.descricao}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Valor unitario proposto">
            <Input
              value={propostaForm.valorUnitarioProposto}
              onChange={(event) =>
                setPropostaForm((current) => ({
                  ...current,
                  valorUnitarioProposto: maskCurrencyInputBR(
                    event.target.value,
                  ),
                }))
              }
              placeholder="R$ 0,00"
            />
          </FormField>
          <FormField label="Data da proposta">
            <Input
              type="date"
              value={propostaForm.dataProposta}
              onChange={(event) =>
                setPropostaForm((current) => ({
                  ...current,
                  dataProposta: event.target.value,
                }))
              }
            />
          </FormField>
          <FormField label="Classificacao">
            <Input
              type="number"
              min={1}
              value={propostaForm.classificacao}
              onChange={(event) =>
                setPropostaForm((current) => ({
                  ...current,
                  classificacao: event.target.value,
                }))
              }
              placeholder="1"
            />
          </FormField>
          <FormField label="Situacao">
            <Select
              value={propostaForm.situacao}
              onChange={(event) =>
                setPropostaForm((current) => ({
                  ...current,
                  situacao: event.target.value,
                }))
              }
            >
              {propostaSituacaoOptions.map((item) => (
                <option key={item} value={item}>
                  {propostaSituacaoLabels[item]}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Justificativa" className="2xl:col-span-2">
            <Textarea
              rows={3}
              value={propostaForm.justificativa}
              onChange={(event) =>
                setPropostaForm((current) => ({
                  ...current,
                  justificativa: event.target.value,
                }))
              }
            />
          </FormField>
        </form>
      </Modal>

      <Modal
        open={operationModal === "lance"}
        onClose={() => setOperationModal(null)}
        title="Registrar lance"
        description="Entrada rapida para manter a sessao principal enxuta."
        size="lg"
        actions={
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOperationModal(null)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="licitacao-lance-form"
              disabled={saveLanceMutation.isPending}
            >
              {saveLanceMutation.isPending
                ? "Registrando..."
                : "Registrar lance"}
            </Button>
          </div>
        }
      >
        <form
          id="licitacao-lance-form"
          className="grid gap-4 2xl:grid-cols-2"
          onSubmit={handleSaveLance}
        >
          <FormField label="Proposta vinculada">
            <Select
              value={lanceForm.propostaId}
              onChange={(event) =>
                setLanceForm((current) => ({
                  ...current,
                  propostaId: event.target.value,
                }))
              }
            >
              <option value="">Selecione</option>
              {detalhe.propostas.map((item) => (
                <option key={item.id} value={item.id}>
                  Item {item.itemNumero} - {item.licitanteNome}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Valor do lance">
            <Input
              value={lanceForm.valorLance}
              onChange={(event) =>
                setLanceForm((current) => ({
                  ...current,
                  valorLance: maskCurrencyInputBR(event.target.value),
                }))
              }
              placeholder="R$ 0,00"
            />
          </FormField>
          <FormField label="Data do lance">
            <Input
              type="date"
              value={lanceForm.dataLance}
              onChange={(event) =>
                setLanceForm((current) => ({
                  ...current,
                  dataLance: event.target.value,
                }))
              }
            />
          </FormField>
          <FormField label="Observacao">
            <Textarea
              rows={3}
              value={lanceForm.observacao}
              onChange={(event) =>
                setLanceForm((current) => ({
                  ...current,
                  observacao: event.target.value,
                }))
              }
            />
          </FormField>
        </form>
      </Modal>

      <Modal
        open={operationModal === "habilitacao"}
        onClose={() => setOperationModal(null)}
        title="Atualizar habilitacao"
        description="Painel dedicado para analise documental do licitante."
        size="lg"
        actions={
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOperationModal(null)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="licitacao-habilitacao-form"
              disabled={saveHabilitacaoMutation.isPending}
            >
              {saveHabilitacaoMutation.isPending
                ? "Salvando..."
                : "Salvar habilitacao"}
            </Button>
          </div>
        }
      >
        <form
          id="licitacao-habilitacao-form"
          className="grid gap-4 2xl:grid-cols-2"
          onSubmit={handleSaveHabilitacao}
        >
          <FormField label="Licitante">
            <Select
              value={habilitacaoForm.licitanteId}
              onChange={(event) =>
                setHabilitacaoForm((current) => ({
                  ...current,
                  licitanteId: event.target.value,
                }))
              }
            >
              <option value="">Selecione</option>
              {detalhe.licitantes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.razaoSocial}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Status da habilitacao">
            <Select
              value={habilitacaoForm.statusHabilitacao}
              onChange={(event) =>
                setHabilitacaoForm((current) => ({
                  ...current,
                  statusHabilitacao: event.target.value,
                }))
              }
            >
              {habilitacaoStatusOptions.map((item) => (
                <option key={item} value={item}>
                  {habilitacaoStatusLabels[item]}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Observacao" className="2xl:col-span-2">
            <Textarea
              rows={4}
              value={habilitacaoForm.observacaoHabilitacao}
              onChange={(event) =>
                setHabilitacaoForm((current) => ({
                  ...current,
                  observacaoHabilitacao: event.target.value,
                }))
              }
            />
          </FormField>
        </form>
      </Modal>

      <Modal
        open={operationModal === "recurso"}
        onClose={() => setOperationModal(null)}
        title="Registrar recurso"
        description="Tratamento recursal em painel unico para reduzir ruido na tela."
        size="lg"
        actions={
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOperationModal(null)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="licitacao-recurso-form"
              disabled={saveRecursoMutation.isPending}
            >
              {saveRecursoMutation.isPending
                ? "Salvando..."
                : "Registrar recurso"}
            </Button>
          </div>
        }
      >
        <form
          id="licitacao-recurso-form"
          className="grid gap-4 2xl:grid-cols-2"
          onSubmit={handleSaveRecurso}
        >
          <FormField label="Licitante">
            <Select
              value={recursoForm.licitanteId}
              onChange={(event) =>
                setRecursoForm((current) => ({
                  ...current,
                  licitanteId: event.target.value,
                }))
              }
            >
              <option value="">Selecione</option>
              {detalhe.licitantes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.razaoSocial}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Resultado">
            <Select
              value={recursoForm.resultado}
              onChange={(event) =>
                setRecursoForm((current) => ({
                  ...current,
                  resultado: event.target.value,
                }))
              }
            >
              {recursoResultadoOptions.map((item) => (
                <option key={item} value={item}>
                  {recursoResultadoLabels[item]}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Data de interposicao">
            <Input
              type="date"
              value={recursoForm.dataInterposicao}
              onChange={(event) =>
                setRecursoForm((current) => ({
                  ...current,
                  dataInterposicao: event.target.value,
                }))
              }
            />
          </FormField>
          <FormField label="Data do julgamento">
            <Input
              type="date"
              value={recursoForm.dataJulgamento}
              onChange={(event) =>
                setRecursoForm((current) => ({
                  ...current,
                  dataJulgamento: event.target.value,
                }))
              }
            />
          </FormField>
          <FormField label="Descricao" className="2xl:col-span-2">
            <Textarea
              rows={4}
              value={recursoForm.descricao}
              onChange={(event) =>
                setRecursoForm((current) => ({
                  ...current,
                  descricao: event.target.value,
                }))
              }
            />
          </FormField>
          <FormField label="Decisao" className="2xl:col-span-2">
            <Textarea
              rows={4}
              value={recursoForm.decisao}
              onChange={(event) =>
                setRecursoForm((current) => ({
                  ...current,
                  decisao: event.target.value,
                }))
              }
            />
          </FormField>
        </form>
      </Modal>

      <Modal
        open={operationModal === "homologacao"}
        onClose={() => setOperationModal(null)}
        title="Concluir homologacao"
        description="Encerramento formal da fase licitatoria em painel focado."
        size="lg"
        actions={
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOperationModal(null)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="licitacao-homologacao-form"
              disabled={homologarMutation.isPending}
            >
              {homologarMutation.isPending
                ? "Homologando..."
                : "Homologar licitacao"}
            </Button>
          </div>
        }
      >
        <form
          id="licitacao-homologacao-form"
          className="grid gap-4 2xl:grid-cols-2"
          onSubmit={handleHomologar}
        >
          <FormField label="Data da homologacao">
            <Input
              type="date"
              value={homologacaoForm.dataHomologacao}
              onChange={(event) =>
                setHomologacaoForm((current) => ({
                  ...current,
                  dataHomologacao: event.target.value,
                }))
              }
            />
          </FormField>
          <FormField label="Status do processo apos homologacao">
            <Select
              value={homologacaoForm.statusId}
              onChange={(event) =>
                setHomologacaoForm((current) => ({
                  ...current,
                  statusId: event.target.value,
                }))
              }
            >
              <option value="">Manter atual</option>
              {catalogsQuery.data?.statusProcesso.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nome}
                </option>
              ))}
            </Select>
          </FormField>
          {homologCriticalStatusDateRequired ? (
            <FormField
              label={`Data do status critico (${selectedHomologStatus!.nome ?? selectedHomologStatus!.codigo})`}
              className="2xl:col-span-2"
            >
              <Input
                type="date"
                value={homologacaoForm.dataStatus}
                required={homologCriticalStatusDateRequired}
                onChange={(event) =>
                  setHomologacaoForm((current) => ({
                    ...current,
                    dataStatus: event.target.value,
                  }))
                }
              />
            </FormField>
          ) : null}
          <FormField label="Observacao" className="2xl:col-span-2">
            <Textarea
              rows={4}
              value={homologacaoForm.observacao}
              onChange={(event) =>
                setHomologacaoForm((current) => ({
                  ...current,
                  observacao: event.target.value,
                }))
              }
            />
          </FormField>
        </form>
      </Modal>

      <Modal
        open={showAllDocsModal}
        onClose={() => setShowAllDocsModal(false)}
        title={`Documentos do processo ${detalhe.processo.numeroSirel}`}
        description="Conferencia integral do acervo do processo, em ordem de inclusao."
        size="xl"
      >
        <Suspense fallback={deferredModalFallback}>
          <LicitacaoProcessoDocumentosModalContent
            documentos={documentos}
            formatShortDateBR={formatShortDateBR}
            formatShortDateTimeBR={formatShortDateTimeBR}
            resolveServerAssetUrl={resolveServerAssetUrl}
          />
        </Suspense>
      </Modal>

      {showCIReservaModal ? (
        <Suspense
          fallback={
            <Modal
              open={showCIReservaModal}
              onClose={() => setShowCIReservaModal(false)}
              title="CI de Reserva Orçamentária"
              description="Carregando o editor da comunicação interna."
              size="xl"
            >
              {deferredModalFallback}
            </Modal>
          }
        >
          <CIReservaOrcamentariaModal
            open={showCIReservaModal}
            onClose={() => setShowCIReservaModal(false)}
            processo={detalhe.processo}
            processoId={processoId}
            categoria={CI_RESERVA_ORCAMENTARIA_CATEGORY}
            onDocumentoSalvo={handleCIReservaDocumentoSalvo}
            onOperacaoErro={handleCIReservaOperacaoErro}
          />
        </Suspense>
      ) : null}
    </div>
  );
}

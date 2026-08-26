import { getStoredAuthToken, loadStoredSession } from "@/lib/auth-session";
import type {
  AtaSessaoApplyResult,
  AtaSessaoCreatePreviewFromDiscoveryInput,
  AtaSessaoDiscoveryResult,
  AtaSessaoPreview,
  AtaSessaoPreviewProcessInput,
} from "@sirel/shared/schemas/ata-sessao";

export type DocumentoTipo =
  | "DFD"
  | "ETP"
  | "TR"
  | "EDITAL"
  | "COMUNICACAO_INTERNA"
  | "RESULTADO"
  | "CONTRATO"
  | "OUTRO";

export interface UploadProcessoDocumentoInput {
  processoId: number;
  tipo: DocumentoTipo;
  categoria?: string;
  titulo: string;
  descricao?: string;
  dataReferencia?: string;
  publico?: boolean;
  palavrasChave?: string[];
  restritoA?: string[];
  arquivo: File;
}

export interface UploadProcessoDocumentoResult {
  id: number;
  processoId: number;
  titulo: string;
  categoria?: string | null;
  tipo: DocumentoTipo;
  arquivoUrl: string | null;
}

export interface AtaSessaoStandaloneArtifact {
  label: string;
  path: string;
  relativePath: string;
  type: "pdf" | "xlsx" | "json" | "log";
  downloadUrl: string;
}

export interface AtaSessaoEstimatedValueReconciliation {
  source: "SD";
  sdNumber: string | null;
  totalFailedLots: number;
  fullyMatchedLots: number;
  partiallyMatchedLots: number;
  unmatchedLots: number[];
  ambiguousLots: number[];
  totalFailedItems: number;
  matchedItems: number;
  ambiguousItems: number;
  unmatchedItems: number;
  warnings: string[];
}

export interface AtaSessaoStandaloneProcessResult {
  sourceFile: string;
  outputDir: string;
  generatedAt: string;
  originalFileName?: string;
  originalSdFileName?: string;
  estimatedValueReconciliation: AtaSessaoEstimatedValueReconciliation | null;
  summary: {
    totalLotes: number;
    emAndamento: number;
    adjudicados: number;
    faseRecursal: number;
    malsucedidos: number;
    warnings: number;
    parsingErrors: number;
  };
  artifacts: AtaSessaoStandaloneArtifact[];
}

export interface ProcessAtaSessaoDocumentoOptions {
  processoId?: number;
  edital?: string;
  processoAdministrativo?: string;
  arquivoOrigem?: string;
  dataGeracao?: string;
}

export interface DiscoverAtaSessaoProcessInput {
  arquivo: File;
  providedProcessoId?: number;
}

export function isPdfFile(file: File) {
  const normalizedMime = file.type.trim().toLowerCase();
  const hasAcceptedMime =
    !normalizedMime ||
    normalizedMime === "application/octet-stream" ||
    normalizedMime.includes("pdf");

  return file.name.toLowerCase().endsWith(".pdf") && hasAcceptedMime;
}

export function resolveServerBaseUrl() {
  const configuredUrl = String(import.meta.env.VITE_API_URL ?? "").trim();
  if (configuredUrl) {
    return configuredUrl.replace(/\/api\/trpc\/?$/, "");
  }

  if (typeof window !== "undefined") {
    return "";
  }

  return "http://localhost:3030";
}

export function resolveServerAssetUrl(url: string | null | undefined) {
  if (!url?.trim()) return null;
  if (/^https?:\/\//i.test(url)) return url;

  const baseUrl = resolveServerBaseUrl();
  return `${baseUrl}${url.startsWith("/") ? url : `/${url}`}`;
}

function buildAuthHeaders() {
  const token = getStoredAuthToken();
  if (token) {
    return { Authorization: `Bearer ${token}` } satisfies Record<
      string,
      string
    >;
  }

  const session = loadStoredSession();
  if (!session) return {} as Record<string, string>;

  return {
    "x-sirel-role": session.user.role,
    "x-sirel-user-id": String(session.user.id),
    "x-sirel-user-name": session.user.name,
    "x-sirel-user-email": session.user.email ?? "",
    "x-sirel-username": session.user.username,
    "x-sirel-secretaria-id": String(session.user.secretariaId ?? ""),
  } satisfies Record<string, string>;
}

async function parseError(response: Response) {
  try {
    const payload = (await response.json()) as { message?: string };
    return payload.message ?? "Falha na operação com documentos.";
  } catch {
    return "Falha na operação com documentos.";
  }
}

export async function uploadProcessoDocumento(
  input: UploadProcessoDocumentoInput,
): Promise<UploadProcessoDocumentoResult> {
  const formData = new FormData();
  formData.append("processoId", String(input.processoId));
  formData.append("tipo", input.tipo);
  formData.append("categoria", input.categoria ?? "");
  formData.append("titulo", input.titulo);
  formData.append("descricao", input.descricao ?? "");
  formData.append("dataReferencia", input.dataReferencia ?? "");
  formData.append("publico", input.publico ? "true" : "false");
  formData.append("palavrasChave", JSON.stringify(input.palavrasChave ?? []));
  formData.append("restritoA", JSON.stringify(input.restritoA ?? []));
  formData.append("arquivo", input.arquivo);

  const response = await fetch(
    `${resolveServerBaseUrl()}/api/planejamento/documentos/upload`,
    {
      method: "POST",
      headers: buildAuthHeaders(),
      body: formData,
    },
  );

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  return response.json();
}

export async function deleteProcessoDocumento(documentoId: number) {
  const response = await fetch(
    `${resolveServerBaseUrl()}/api/planejamento/documentos/${documentoId}`,
    {
      method: "DELETE",
      headers: buildAuthHeaders(),
    },
  );

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  return response.json() as Promise<UploadProcessoDocumentoResult>;
}

export async function processAtaSessaoDocumento(
  arquivo: File,
  sdArquivo: File,
  options: ProcessAtaSessaoDocumentoOptions = {},
): Promise<AtaSessaoStandaloneProcessResult> {
  const formData = new FormData();
  formData.append("arquivo", arquivo);
  formData.append("sdArquivo", sdArquivo);
  if (options.processoId)
    formData.append("processoId", String(options.processoId));
  if (options.edital?.trim()) formData.append("edital", options.edital.trim());
  if (options.processoAdministrativo?.trim())
    formData.append(
      "processoAdministrativo",
      options.processoAdministrativo.trim(),
    );
  if (options.arquivoOrigem?.trim())
    formData.append("arquivoOrigem", options.arquivoOrigem.trim());
  if (options.dataGeracao?.trim())
    formData.append("dataGeracao", options.dataGeracao.trim());

  const response = await fetch(
    `${resolveServerBaseUrl()}/api/relatorios/ata-sessao/processar`,
    {
      method: "POST",
      headers: buildAuthHeaders(),
      body: formData,
    },
  );

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  return response.json() as Promise<AtaSessaoStandaloneProcessResult>;
}

export async function discoverAtaSessaoProcess(
  input: DiscoverAtaSessaoProcessInput,
): Promise<AtaSessaoDiscoveryResult> {
  const formData = new FormData();
  formData.append("arquivo", input.arquivo);
  if (input.providedProcessoId) {
    formData.append("providedProcessoId", String(input.providedProcessoId));
  }

  const response = await fetch(
    `${resolveServerBaseUrl()}/api/ata-sessao/discover-process`,
    {
      method: "POST",
      headers: buildAuthHeaders(),
      body: formData,
    },
  );

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  return response.json() as Promise<AtaSessaoDiscoveryResult>;
}

export async function createAtaSessaoPreviewFromDiscovery(
  input: AtaSessaoCreatePreviewFromDiscoveryInput,
): Promise<AtaSessaoPreview> {
  const response = await fetch(
    `${resolveServerBaseUrl()}/api/ata-sessao/create-preview-from-discovery`,
    {
      method: "POST",
      headers: {
        ...buildAuthHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    },
  );

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  return response.json() as Promise<AtaSessaoPreview>;
}

export async function createAtaSessaoPreviewFromDocumento(
  input: AtaSessaoPreviewProcessInput,
): Promise<AtaSessaoPreview> {
  const response = await fetch(
    `${resolveServerBaseUrl()}/api/licitacao/ata-sessao/processar`,
    {
      method: "POST",
      headers: {
        ...buildAuthHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    },
  );

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  return response.json() as Promise<AtaSessaoPreview>;
}

export async function applyAtaSessaoSyncPreview(
  runId: number,
): Promise<AtaSessaoApplyResult> {
  const response = await fetch(
    `${resolveServerBaseUrl()}/api/licitacao/ata-sessao/aplicar`,
    {
      method: "POST",
      headers: {
        ...buildAuthHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ runId }),
    },
  );

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  return response.json() as Promise<AtaSessaoApplyResult>;
}

export const uploadPlanejamentoDocumento = uploadProcessoDocumento;
export const deletePlanejamentoDocumento = deleteProcessoDocumento;

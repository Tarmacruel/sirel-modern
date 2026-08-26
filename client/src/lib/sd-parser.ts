import { getCsrfToken } from "@/lib/auth-session";
import { resolveServerBaseUrl } from "@/lib/document-upload";

export type SdParseResult = {
  summary: { totalItens: number; warnings: number; parsingErrors: number };
  metadata: { numero_sd?: string | null; valor_total?: number | null };
  itens: Array<{ numero?: number; descricao?: string; unidade?: string; quantidade?: number; preco_unitario?: number; preco_total?: number }>;
  artifact?: { label?: string; relativePath?: string; downloadUrl: string };
};

export type SdManualItemInput = {
  numero?: number;
  descricao?: string;
  unidade?: string;
  quantidade?: number;
  preco_unitario?: number;
  preco_total?: number;
};

export type SdProcessLinkResult = SdParseResult & {
  vinculacao?: { processoId: number; created: number; updated: number; total: number; valorEstimado?: number | null };
};

function buildAuthHeaders(): Record<string, string> {
  const csrfToken = getCsrfToken();
  return csrfToken ? { "x-sirel-csrf": csrfToken } : {};
}

async function parseError(response: Response) {
  try {
    const payload = (await response.json()) as { message?: string };
    return payload.message ?? "Falha ao processar a SD.";
  } catch {
    return "Falha ao processar a SD.";
  }
}

export async function processLicitacaoSd(input: { processoId: number; arquivo: File }) {
  const formData = new FormData();
  formData.append("processoId", String(input.processoId));
  formData.append("arquivo", input.arquivo);
  const response = await fetch(`${resolveServerBaseUrl()}/api/licitacao/sd/processar`, {
    method: "POST", headers: buildAuthHeaders(), body: formData, credentials: "include",
  });
  if (!response.ok) throw new Error(await parseError(response));
  return response.json() as Promise<SdParseResult>;
}

export async function vincularSdAoProcesso(input: { processoId: number; relativePath: string; manualItems: SdManualItemInput[] }) {
  const response = await fetch(`${resolveServerBaseUrl()}/api/licitacao/sd/vincular`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...buildAuthHeaders() },
    body: JSON.stringify(input),
    credentials: "include",
  });
  if (!response.ok) throw new Error(await parseError(response));
  return response.json() as Promise<SdProcessLinkResult>;
}

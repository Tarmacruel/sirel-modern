import { getStoredAuthToken, loadStoredSession } from "@/lib/auth-session";
import { resolveServerBaseUrl } from "@/lib/document-upload";

export type SdParseResult = {
  summary: {
    totalItens: number;
    warnings: number;
    parsingErrors: number;
  };
  metadata: {
    numero_sd?: string | null;
    valor_total?: number | null;
  };
  itens: Array<{
    numero?: number;
    descricao?: string;
    unidade?: string;
    quantidade?: number;
    preco_unitario?: number;
    preco_total?: number;
  }>;
  artifact?: {
    label?: string;
    relativePath?: string;
    downloadUrl: string;
  };
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
  vinculacao?: {
    processoId: number;
    created: number;
    updated: number;
    total: number;
    valorEstimado?: number | null;
  };
};

function buildAuthHeaders() {
  const token = getStoredAuthToken();
  if (token) {
    return { Authorization: `Bearer ${token}` } satisfies Record<string, string>;
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
    return payload.message ?? "Falha ao processar a SD.";
  } catch {
    return "Falha ao processar a SD.";
  }
}

export async function processLicitacaoSd(input: {
  processoId: number;
  arquivo: File;
}) {
  const formData = new FormData();
  formData.append("processoId", String(input.processoId));
  formData.append("arquivo", input.arquivo);

  const response = await fetch(`${resolveServerBaseUrl()}/api/licitacao/sd/processar`, {
    method: "POST",
    headers: buildAuthHeaders(),
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  return response.json() as Promise<SdParseResult>;
}

export async function vincularSdAoProcesso(input: {
  processoId: number;
  relativePath: string;
  manualItems: SdManualItemInput[];
}) {
  const response = await fetch(`${resolveServerBaseUrl()}/api/licitacao/sd/vincular`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders(),
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  return response.json() as Promise<SdProcessLinkResult>;
}

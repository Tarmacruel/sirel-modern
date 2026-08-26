import { getCsrfToken } from "@/lib/auth-session";
import { resolveServerAssetUrl, resolveServerBaseUrl } from "@/lib/document-upload";

export type CadastroAssetEntity = "itens" | "fornecedores";

export interface UploadAtoDesignacaoResult {
  success: boolean;
  arquivoUrl: string;
  arquivoChave: string;
  mimeType: string;
  tamanhoBytes: number;
  hashArquivo: string;
}

function buildAuthHeaders(): Record<string, string> {
  const csrfToken = getCsrfToken();
  return csrfToken ? { "x-sirel-csrf": csrfToken } : {};
}

async function parseError(response: Response) {
  try {
    const payload = (await response.json()) as { message?: string };
    return payload.message ?? "Falha ao enviar o arquivo do cadastro.";
  } catch {
    return "Falha ao enviar o arquivo do cadastro.";
  }
}

export async function uploadCadastroAsset(input: {
  entity: CadastroAssetEntity;
  recordId: number;
  arquivo: File;
}) {
  const formData = new FormData();
  formData.append("entity", input.entity);
  formData.append("recordId", String(input.recordId));
  formData.append("arquivo", input.arquivo);
  const response = await fetch(`${resolveServerBaseUrl()}/api/cadastros/assets/upload`, {
    method: "POST", headers: buildAuthHeaders(), body: formData, credentials: "include",
  });
  if (!response.ok) throw new Error(await parseError(response));
  return response.json() as Promise<{ assetUrl: string | null }>;
}

export async function uploadAtoDesignacao(arquivo: File) {
  const formData = new FormData();
  formData.append("arquivo", arquivo);
  const response = await fetch(`${resolveServerBaseUrl()}/api/cadastros-institucionais/atos/upload`, {
    method: "POST", headers: buildAuthHeaders(), body: formData, credentials: "include",
  });
  if (!response.ok) throw new Error(await parseError(response));
  return response.json() as Promise<UploadAtoDesignacaoResult>;
}

export function resolveCadastroAssetUrl(url: string | null | undefined) {
  return resolveServerAssetUrl(url);
}

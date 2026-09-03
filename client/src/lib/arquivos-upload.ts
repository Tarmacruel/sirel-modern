import { getCsrfToken } from "@/lib/auth-session";
import { resolveServerBaseUrl } from "@/lib/document-upload";

export interface UploadArquivoResult {
  success: boolean;
  name: string;
  relativePath: string;
  size: number;
  modifiedAt: string;
}

async function parseError(response: Response) {
  try {
    const payload = (await response.json()) as { message?: string };
    return payload.message ?? "Falha ao enviar o arquivo.";
  } catch {
    return "Falha ao enviar o arquivo.";
  }
}

export async function uploadArquivo(input: {
  path: string;
  arquivo: File;
}): Promise<UploadArquivoResult> {
  const formData = new FormData();
  formData.append("path", input.path);
  formData.append("arquivo", input.arquivo);

  const csrfToken = getCsrfToken();
  const response = await fetch(`${resolveServerBaseUrl()}/api/arquivos/upload`, {
    method: "POST",
    headers: csrfToken ? { "x-sirel-csrf": csrfToken } : {},
    credentials: "include",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  return response.json() as Promise<UploadArquivoResult>;
}

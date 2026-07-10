export type TransparenciaPublicationStatus =
  | "NOT_CONFIGURED"
  | "READY"
  | "PUBLISHING"
  | "PUBLISHED"
  | "FAILED";

export interface TransparenciaPublicationState {
  status: TransparenciaPublicationStatus;
  protocol?: string | null;
  publishedAt?: string | null;
  publishedByUserId?: number | null;
  error?: string | null;
  message: string;
}

function hasTransparenciaConfiguration() {
  return Boolean(
    process.env.TRANSPARENCIA_API_URL && process.env.TRANSPARENCIA_API_TOKEN,
  );
}

export function getTransparenciaProviderStatus(): TransparenciaPublicationState {
  if (!hasTransparenciaConfiguration()) {
    return {
      status: "NOT_CONFIGURED",
      message: "Integracao nao configurada.",
      protocol: null,
      publishedAt: null,
      publishedByUserId: null,
      error: null,
    };
  }

  return {
    status: "READY",
    message: "Integracao configurada e pronta para publicacao.",
    protocol: null,
    publishedAt: null,
    publishedByUserId: null,
    error: null,
  };
}

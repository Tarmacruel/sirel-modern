export type ArquivosTicketMode = "download" | "preview";

export type ArquivoKind =
  | "folder"
  | "pdf"
  | "image"
  | "text"
  | "office"
  | "archive"
  | "other";

export interface ArquivoEntry {
  name: string;
  relativePath: string;
  kind: ArquivoKind;
  extension: string;
  size: number | null;
  modifiedAt: string | null;
  previewable: boolean;
  downloadable: boolean;
  favorite?: boolean;
}

export interface ArquivosTicketPayload {
  v: 1;
  uid: number;
  path: string;
  mode: ArquivosTicketMode;
  iat: number;
  exp: number;
  nonce: string;
}

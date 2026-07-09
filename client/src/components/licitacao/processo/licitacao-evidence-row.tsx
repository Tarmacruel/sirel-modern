import { AlertCircle, CheckCircle2, Eye, FileCheck2 } from "lucide-react";

import { formatShortDateTimeBR } from "@/lib/formatters";

export interface LicitacaoEvidenceDocument {
  id: number;
  categoria: string | null;
  titulo: string;
  arquivoUrl: string | null;
  criadoEm: string | Date;
}

export interface LicitacaoEvidenceItem {
  category: string;
  label: string;
  description: string;
  completionHint?: string;
  baseLegal?: string;
  obrigatorio?: boolean;
  condicional?: string;
  tipo?: string;
  concluido: boolean;
  statusOrigem?: string;
  documentos: LicitacaoEvidenceDocument[];
}

interface LicitacaoEvidenceRowProps {
  item: LicitacaoEvidenceItem;
  active: boolean;
  latestDocument: LicitacaoEvidenceDocument | null;
  onOpen: () => void;
}

export function LicitacaoEvidenceRow({
  item,
  active,
  latestDocument,
  onOpen,
}: LicitacaoEvidenceRowProps) {
  const pending = !item.concluido;
  const StatusIcon = pending ? AlertCircle : CheckCircle2;
  const statusLabel = pending ? "Pendente" : "Concluido";
  const actionLabel = pending ? "Resolver" : active ? "Aberta" : "Ver";
  const evidenceSource = latestDocument
    ? `${item.documentos.length} doc. - ${formatShortDateTimeBR(latestDocument.criadoEm)}`
    : item.statusOrigem || "Sem evidencia";

  return (
    <button
      type="button"
      onClick={onOpen}
      className={[
        "grid min-h-[64px] w-full grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-[14px] border px-3 py-2 text-left transition md:grid-cols-[auto_minmax(0,1.4fr)_130px_130px_auto]",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-500)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-panel)]",
        active
          ? "border-[var(--border-strong)] bg-[var(--surface-selected)]"
          : "border-[var(--border-subtle)] bg-[var(--surface-card)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]",
      ].join(" ")}
    >
      <span
        className={[
          "row-span-2 inline-flex h-10 w-10 items-center justify-center rounded-[12px] border md:row-span-1",
          pending
            ? "border-[var(--notice-warning-border)] bg-[var(--notice-warning-bg)] text-[var(--notice-warning-text)]"
            : "border-[var(--notice-success-border)] bg-[var(--notice-success-bg)] text-[var(--notice-success-text)]",
        ].join(" ")}
      >
        <StatusIcon className="h-4 w-4" />
      </span>

      <span className="min-w-0">
        <span className="block truncate text-sm font-black text-[var(--text-primary)]">
          {item.label}
        </span>
        <span className="mt-0.5 flex flex-wrap gap-1.5 text-xs text-[var(--text-secondary)]">
          <span>{item.obrigatorio ? "Obrigatorio" : "Condicional"}</span>
          {item.condicional ? <span>- {item.condicional}</span> : null}
        </span>
      </span>

      <span
        className={[
          "hidden rounded-full border px-2.5 py-1 text-center text-xs font-bold md:inline-flex md:items-center md:justify-center",
          pending
            ? "border-[var(--notice-warning-border)] bg-[var(--notice-warning-bg)] text-[var(--notice-warning-text)]"
            : "border-[var(--notice-success-border)] bg-[var(--notice-success-bg)] text-[var(--notice-success-text)]",
        ].join(" ")}
      >
        {statusLabel}
      </span>

      <span className="hidden min-w-0 truncate text-xs font-semibold text-[var(--text-secondary)] md:block">
        {evidenceSource}
      </span>

      <span className="col-span-2 flex items-center justify-end gap-2 md:col-span-1">
        {latestDocument ? <FileCheck2 className="h-4 w-4 text-[var(--accent-color)]" /> : null}
        <span
          className={[
            "inline-flex h-9 items-center justify-center gap-2 rounded-2xl border px-3 text-xs font-semibold",
            pending
              ? "border-transparent bg-[var(--color-primary-500)] text-white"
              : "border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--text-secondary)]",
          ].join(" ")}
        >
          {pending ? null : <Eye className="h-4 w-4" />}
          {actionLabel}
        </span>
      </span>
    </button>
  );
}

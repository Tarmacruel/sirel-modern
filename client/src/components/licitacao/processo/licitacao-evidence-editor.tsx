import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ExternalLink, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatShortDateTimeBR } from "@/lib/formatters";
import type { LicitacaoEvidenceDocument, LicitacaoEvidenceItem } from "./licitacao-evidence-row";

export interface LicitacaoEvidenceUploadState {
  titulo: string;
  descricao: string;
  arquivo: File | null;
}

interface LicitacaoEvidenceEditorProps {
  item: LicitacaoEvidenceItem;
  uploadState: LicitacaoEvidenceUploadState;
  latestDocument: LicitacaoEvidenceDocument | null;
  index: number;
  total: number;
  canGoPrevious: boolean;
  canGoNext: boolean;
  resolveDocumentUrl: (url: string | null) => string | null;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onFileSelect: (file: File | null) => void;
  onUpload: () => void;
  onPrevious: () => void;
  onNext: () => void;
}

export function LicitacaoEvidenceEditor({
  item,
  uploadState,
  latestDocument,
  index,
  total,
  canGoPrevious,
  canGoNext,
  resolveDocumentUrl,
  onTitleChange,
  onDescriptionChange,
  onFileSelect,
  onUpload,
  onPrevious,
  onNext,
}: LicitacaoEvidenceEditorProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const documentUrl = resolveDocumentUrl(latestDocument?.arquivoUrl ?? null);

  useEffect(() => {
    fileInputRef.current?.focus();
  }, [item.category]);

  return (
    <div className="rounded-[16px] border border-[var(--border-strong)] bg-[var(--surface-raised)] p-3 shadow-[var(--shadow-card)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--color-primary-600)]">
            Evidencia {index + 1}/{total}
          </div>
          <h3 className="mt-1 text-lg font-black text-[var(--text-primary)]">
            {item.label}
          </h3>
          <p className="mt-1 max-w-3xl text-sm leading-5 text-[var(--text-secondary)]">
            {item.completionHint || item.description || "Anexe a evidencia correspondente a este requisito."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onPrevious} disabled={!canGoPrevious}>
            <ArrowLeft className="h-4 w-4" />
            Anterior
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onNext} disabled={!canGoNext}>
            Proxima
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.75fr)]">
        <div className="space-y-3">
          <FormField label="Titulo pre-preenchido">
            <Input
              value={uploadState.titulo}
              onChange={(event) => onTitleChange(event.target.value)}
              placeholder={item.label}
            />
          </FormField>

          <details className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-2">
            <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
              Descricao opcional
            </summary>
            <FormField label="Descricao da evidencia" className="mt-3">
              <Textarea
                rows={3}
                value={uploadState.descricao}
                onChange={(event) => onDescriptionChange(event.target.value)}
                placeholder="Ex.: exportacao da plataforma, comprovante, ata assinada"
              />
            </FormField>
          </details>

          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              onFileSelect(event.dataTransfer.files?.[0] ?? null);
            }}
            className={[
              "rounded-[14px] border border-dashed px-3 py-3 transition",
              dragging
                ? "border-[var(--border-strong)] bg-[var(--surface-selected)]"
                : "border-[var(--border-subtle)] bg-[var(--surface-card)]",
            ].join(" ")}
          >
            <FormField label="Arquivo">
              <Input
                ref={fileInputRef}
                type="file"
                onChange={(event) => onFileSelect(event.target.files?.[0] ?? null)}
              />
            </FormField>
            <p className="mt-2 text-xs text-[var(--text-secondary)]">
              Arraste um arquivo para esta area ou selecione manualmente.
              {uploadState.arquivo ? ` Selecionado: ${uploadState.arquivo.name}` : ""}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-3">
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
              Status
            </div>
            <div className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
              {item.concluido ? "Concluido" : item.obrigatorio ? "Obrigatorio pendente" : "Condicional"}
            </div>
          </div>

          <div className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-3">
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
              Ultima evidencia
            </div>
            {latestDocument ? (
              <div className="mt-1 space-y-2 text-sm text-[var(--text-secondary)]">
                <div className="font-semibold text-[var(--text-primary)]">
                  {latestDocument.titulo}
                </div>
                <div>{formatShortDateTimeBR(latestDocument.criadoEm)}</div>
                {documentUrl ? (
                  <a
                    href={documentUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--accent-color)]"
                  >
                    Abrir evidencia
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : null}
              </div>
            ) : (
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                {item.statusOrigem || "Nenhum documento anexado."}
              </p>
            )}
          </div>

          <Button type="button" className="w-full" onClick={onUpload}>
            <Upload className="h-4 w-4" />
            Anexar evidencia
          </Button>
        </div>
      </div>
    </div>
  );
}

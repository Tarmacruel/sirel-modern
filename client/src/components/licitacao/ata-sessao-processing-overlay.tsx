import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileSearch2, LoaderCircle } from "lucide-react";

type AtaSessaoProcessingContext = "discovery" | "preview" | "reports";

interface AtaSessaoProcessingOverlayProps {
  open: boolean;
  fileName?: string | null;
  sdFileName?: string | null;
  context?: AtaSessaoProcessingContext;
}

const processingCopy: Record<
  AtaSessaoProcessingContext,
  { title: string; description: string; steps: readonly string[] }
> = {
  discovery: {
    title: "Processando ata de sessão",
    description:
      "Estamos lendo o PDF e buscando o processo correspondente para você confirmar.",
    steps: [
      "Enviando o PDF da ata",
      "Identificando os dados do processo",
      "Comparando com os processos cadastrados",
      "Preparando as opções para confirmação",
    ],
  },
  preview: {
    title: "Processando ata de sessão",
    description:
      "Estamos lendo o PDF, conciliando os dados e preparando a prévia para sua revisão.",
    steps: [
      "Enviando o PDF da ata",
      "Lendo lotes, participantes e resultados",
      "Conferindo os dados com o processo",
      "Gerando relatórios e preparando a prévia",
    ],
  },
  reports: {
    title: "Processando Ata e SD",
    description:
      "Estamos lendo os dois PDFs, conciliando os valores estimados e gerando os relatórios operacionais.",
    steps: ["Ler Ata", "Ler SD", "Conciliar valores", "Gerar relatórios"],
  },
};

function resolveStepIndex(elapsedSeconds: number) {
  if (elapsedSeconds < 5) return 0;
  if (elapsedSeconds < 15) return 1;
  if (elapsedSeconds < 30) return 2;
  return 3;
}

function formatElapsedTime(elapsedSeconds: number) {
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = String(elapsedSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function AtaSessaoProcessingOverlay({
  open,
  fileName,
  sdFileName,
  context = "preview",
}: AtaSessaoProcessingOverlayProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setElapsedSeconds(0);
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement;
    document.body.style.overflow = "hidden";
    overlayRef.current?.focus();

    const intervalId = window.setInterval(() => {
      setElapsedSeconds((current) => current + 1);
    }, 1_000);

    return () => {
      window.clearInterval(intervalId);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [open]);

  if (!open) return null;

  const copy = processingCopy[context];
  const stepIndex = resolveStepIndex(elapsedSeconds);

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[2147483000] flex min-h-screen w-screen items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-md focus:outline-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ata-processing-title"
      aria-describedby="ata-processing-description"
      aria-busy="true"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === "Tab") event.preventDefault();
      }}
    >
      <div className="w-full max-w-lg overflow-hidden rounded-[28px] border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-[0_32px_90px_-32px_rgba(15,23,42,0.75)]">
        <div className="h-1.5 overflow-hidden bg-[var(--color-primary-100)]">
          <div className="h-full w-2/3 animate-pulse rounded-r-full bg-[var(--color-primary-500)] motion-reduce:animate-none" />
        </div>

        <div className="px-6 py-6 sm:px-8 sm:py-8">
          <div className="flex items-start gap-4">
            <span className="relative inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-primary-50)] text-[var(--color-primary-600)]">
              <FileSearch2 className="h-6 w-6" aria-hidden="true" />
              <LoaderCircle
                className="absolute -bottom-1 -right-1 h-6 w-6 animate-spin rounded-full bg-[var(--surface-card)] p-1 text-[var(--color-primary-600)] shadow-sm motion-reduce:animate-none"
                aria-hidden="true"
              />
            </span>

            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">
                Processamento em andamento
              </p>
              <h2
                id="ata-processing-title"
                className="mt-1 font-[var(--font-heading)] text-xl font-black tracking-tight text-[var(--text-primary)] sm:text-2xl"
              >
                {copy.title}
              </h2>
              <p
                id="ata-processing-description"
                className="mt-2 text-sm leading-6 text-[var(--text-secondary)]"
              >
                {copy.description}
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-4">
            <div className="flex items-start justify-between gap-4">
              <div
                className="min-w-0"
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                  Etapa estimada {stepIndex + 1} de {copy.steps.length}
                </p>
                <p className="mt-2 text-sm font-bold text-[var(--text-primary)]">
                  {copy.steps[stepIndex]}
                </p>
              </div>
              <span
                className="shrink-0 text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]"
                aria-label={`Tempo decorrido ${formatElapsedTime(elapsedSeconds)}`}
              >
                {formatElapsedTime(elapsedSeconds)}
              </span>
            </div>
          </div>

          {fileName || sdFileName ? (
            <dl className="mt-4 space-y-1.5 text-xs text-[var(--text-muted)]">
              {fileName ? (
                <div className="flex min-w-0 gap-2">
                  <dt className="shrink-0 font-semibold text-[var(--text-secondary)]">
                    {context === "reports" ? "Ata BLL:" : "Arquivo:"}
                  </dt>
                  <dd className="truncate" title={fileName}>
                    {fileName}
                  </dd>
                </div>
              ) : null}
              {sdFileName ? (
                <div className="flex min-w-0 gap-2">
                  <dt className="shrink-0 font-semibold text-[var(--text-secondary)]">
                    Solicitação de Despesa:
                  </dt>
                  <dd className="truncate" title={sdFileName}>
                    {sdFileName}
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : null}

          <p className="mt-3 text-center text-xs leading-5 text-[var(--text-muted)]">
            Arquivos maiores podem levar alguns instantes. Não feche esta tela.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}

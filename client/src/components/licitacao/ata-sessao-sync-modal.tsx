import type { AtaSessaoPreview } from "@sirel/shared/schemas/ata-sessao";

import { Modal } from "@/components/shared/modal";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatShortDateTimeBR } from "@/lib/formatters";

interface AtaSessaoSyncModalProps {
  open: boolean;
  preview: AtaSessaoPreview | null;
  loading?: boolean;
  applyLoading?: boolean;
  onClose: () => void;
  onApply: () => void;
}

export function AtaSessaoSyncModal({
  open,
  preview,
  loading = false,
  applyLoading = false,
  onClose,
  onApply,
}: AtaSessaoSyncModalProps) {
  const hasBlockingIssues = (preview?.blockingIssues.length ?? 0) > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Previa da sincronizacao da ata"
      description="Revise os lotes, conflitos e a fase sugerida antes de aplicar as alteracoes no processo."
      size="xl"
      actions={
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Fechar
          </Button>
          <Button
            type="button"
            onClick={onApply}
            disabled={!preview || hasBlockingIssues || applyLoading}
          >
            {applyLoading ? "Aplicando..." : "Aplicar atualizacao da ata"}
          </Button>
        </div>
      }
    >
      {!preview || loading ? (
        <div className="space-y-4">
          <div className="h-24 animate-pulse rounded-3xl bg-slate-100" />
          <div className="h-48 animate-pulse rounded-3xl bg-slate-100" />
        </div>
      ) : (
        <div className="space-y-5">
          {hasBlockingIssues ? (
            <Alert variant="error" title="Conflitos bloqueantes">
              {preview.blockingIssues.length} conflito(s) precisam ser resolvidos antes da aplicacao.
            </Alert>
          ) : (
            <Alert variant="success" title="Previa pronta para aplicacao">
              Nenhum conflito bloqueante foi encontrado nesta leitura da ata.
            </Alert>
          )}

          {preview.warnings.length ? (
            <Alert variant="info" title="Pendencias nao bloqueantes">
              {preview.warnings.length} observacao(oes) foram registradas para a leitura.
            </Alert>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-3">
            <article className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Processo</p>
              <p className="mt-3 text-lg font-black text-slate-950">{preview.process.numeroSirel}</p>
              <p className="mt-1 text-sm text-slate-600">{preview.process.objeto}</p>
            </article>
            <article className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Metadados extraidos</p>
              <p className="mt-3 text-sm text-slate-700">Edital: {preview.extractedMetadata.edital ?? "Nao identificado"}</p>
              <p className="mt-1 text-sm text-slate-700">
                Processo administrativo: {preview.extractedMetadata.processoAdministrativo ?? "Nao identificado"}
              </p>
            </article>
            <article className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Fase da licitacao</p>
              <p className="mt-3 text-sm text-slate-700">
                Atual: <span className="font-semibold text-slate-950">{preview.phase.current}</span>
              </p>
              <p className="mt-1 text-sm text-slate-700">
                Sugerida: <span className="font-semibold text-slate-950">{preview.phase.suggested ?? "Sem avanco"}</span>
              </p>
              <p className="mt-1 text-sm text-slate-700">Previa gerada em {formatShortDateTimeBR(preview.generatedAt)}</p>
            </article>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Fornecedores novos", value: preview.counts.fornecedoresCriar },
              { label: "Licitantes novos", value: preview.counts.licitantesCriar },
              { label: "Propostas", value: preview.counts.propostasCriar + preview.counts.propostasAtualizar },
              { label: "Lances", value: preview.counts.lancesCriar },
              { label: "Recursos", value: preview.counts.recursosCriar },
              { label: "Resultados", value: preview.counts.resultadosAtualizar },
              { label: "Lotes sem cadastro", value: preview.counts.lotesCriar },
              { label: "Conflitos", value: preview.counts.conflitosBloqueantes },
            ].map((item) => (
              <article key={item.label} className="rounded-3xl border border-slate-200 bg-white px-4 py-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
                <p className="mt-3 text-3xl font-black text-slate-950">{item.value}</p>
              </article>
            ))}
          </div>

          {preview.blockingIssues.length ? (
            <div className="rounded-3xl border border-rose-200 bg-rose-50 p-4">
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-rose-700">Bloqueios</p>
              <div className="mt-3 space-y-2">
                {preview.blockingIssues.map((issue) => (
                  <div
                    key={`${issue.code}-${issue.lotNumber ?? "geral"}-${issue.entityLabel ?? ""}`}
                    className="rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm text-rose-800"
                  >
                    <p className="font-semibold">{issue.message}</p>
                    {issue.lotNumber ? <p className="mt-1 text-xs text-rose-600">Lote {issue.lotNumber}</p> : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="space-y-3">
            {preview.lots.map((lot) => (
              <article key={lot.lotNumber} className="rounded-3xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Lote {lot.lotNumber}</p>
                    <h4 className="mt-2 text-base font-black text-slate-950">{lot.title}</h4>
                    <p className="mt-1 text-sm text-slate-600">Status da ata: {lot.statusAta}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      Item associado: {lot.matchedItemLabel ?? "Nao associado"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
                    {lot.itemMatchStatus}
                  </div>
                </div>

                {lot.actions.length ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {lot.actions.map((action) => (
                      <span key={action} className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
                        {action}
                      </span>
                    ))}
                  </div>
                ) : null}

                {lot.issues.length ? (
                  <div className="mt-4 space-y-2">
                    {lot.issues.map((issue) => (
                      <div
                        key={`${lot.lotNumber}-${issue.code}-${issue.entityLabel ?? ""}`}
                        className={[
                          "rounded-2xl border px-4 py-3 text-sm",
                          issue.severity === "BLOCKING"
                            ? "border-rose-200 bg-rose-50 text-rose-800"
                            : "border-amber-200 bg-amber-50 text-amber-800",
                        ].join(" ")}
                      >
                        {issue.message}
                      </div>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}

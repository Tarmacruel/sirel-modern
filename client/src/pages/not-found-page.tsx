import { ContextEmptyState } from "@/components/shared/context-empty-state";

export function NotFoundPage() {
  return (
    <div className="min-h-[50vh]">
      <ContextEmptyState
        title="Rota nao encontrada"
        description="A tela solicitada nao esta disponivel nesta rota. Voce pode voltar ao dashboard para retomar a navegacao principal do SIREL."
        actionLabel="Voltar ao dashboard"
        actionHref="/"
      />
    </div>
  );
}

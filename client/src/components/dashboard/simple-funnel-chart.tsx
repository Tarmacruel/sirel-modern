interface FunnelItem {
  label: string;
  valor: number;
}

export function SimpleFunnelChart({ items }: { items: FunnelItem[] }) {
  if (!items.length) {
    return (
      <div className="rounded-3xl border border-dashed border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-8 text-center text-sm text-[var(--text-secondary)]">
        Sem dados para o funil.
      </div>
    );
  }

  const max = Math.max(...items.map((item) => item.valor), 1);

  return (
    <div className="space-y-3">
      {items.map((item, index) => {
        const width = `${Math.max(14, (item.valor / max) * 100)}%`;
        return (
          <div key={`${item.label}-${index}`} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-[var(--text-secondary)]">{item.label}</span>
              <span className="font-black text-[var(--text-primary)]">{item.valor.toLocaleString("pt-BR")}</span>
            </div>
            <div className="flex justify-center">
              <div className="h-10 rounded-[18px] bg-[linear-gradient(135deg,var(--accent-color),var(--chart-3))]" style={{ width }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

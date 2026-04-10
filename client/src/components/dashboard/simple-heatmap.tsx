import { Fragment } from "react";

interface HeatmapCell {
  linha: string;
  coluna: string;
  valor: number;
}

export function SimpleHeatmap({ items }: { items: HeatmapCell[] }) {
  if (!items.length) {
    return (
      <div className="rounded-3xl border border-dashed border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-8 text-center text-sm text-[var(--text-secondary)]">
        Sem dados para a matriz.
      </div>
    );
  }

  const rows = Array.from(new Set(items.map((item) => item.linha)));
  const columns = Array.from(new Set(items.map((item) => item.coluna)));
  const max = Math.max(...items.map((item) => item.valor), 1);
  const map = new Map(items.map((item) => [`${item.linha}|||${item.coluna}`, item.valor]));

  return (
    <div className="overflow-x-auto rounded-[24px] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4">
      <div className="grid min-w-[420px] gap-2" style={{ gridTemplateColumns: `160px repeat(${columns.length}, minmax(72px, 1fr))` }}>
        <div />
        {columns.map((column) => (
          <div key={column} className="text-center text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
            {column}
          </div>
        ))}
        {rows.map((row) => (
          <Fragment key={row}>
            <div key={`${row}-label`} className="flex items-center text-sm font-semibold text-[var(--text-secondary)]">
              {row}
            </div>
            {columns.map((column) => {
              const value = map.get(`${row}|||${column}`) ?? 0;
              const opacity = value / max;
              return (
                <div
                  key={`${row}-${column}`}
                  className="flex h-14 items-center justify-center rounded-2xl border border-[var(--border-subtle)] text-sm font-black text-[var(--text-primary)]"
                  style={{ backgroundColor: `rgba(20, 184, 166, ${Math.max(0.12, opacity)})` }}
                  title={`${row} • ${column}: ${value.toLocaleString("pt-BR")}`}
                >
                  {value ? value.toLocaleString("pt-BR") : "–"}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

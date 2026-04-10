import type { CSSProperties } from "react";

interface SimpleLineChartItem {
  label: string;
  value: number;
}

export function SimpleLineChart({ items }: { items: SimpleLineChartItem[] }) {
  if (!items.length) {
    return <div className="rounded-3xl border border-dashed border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-8 text-center text-sm text-[var(--text-secondary)]">Sem dados para o período selecionado.</div>;
  }

  const width = 520;
  const height = 200;
  const padding = 24;
  const max = Math.max(...items.map((item) => item.value), 1);
  const stepX = items.length > 1 ? (width - padding * 2) / (items.length - 1) : 0;
  const points = items.map((item, index) => {
    const x = padding + stepX * index;
    const y = height - padding - ((item.value / max) * (height - padding * 2));
    return { ...item, x, y };
  });

  const path = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ");
  const axisStyle = { stroke: "var(--border-subtle)" } as CSSProperties;
  const pathStyle = { stroke: "var(--chart-1)" } as CSSProperties;
  const pointStyle = { fill: "var(--chart-3)" } as CSSProperties;

  return (
    <div className="min-w-0 space-y-4">
      <svg viewBox={`0 0 ${width} ${height}`} className="block h-auto w-full overflow-hidden rounded-3xl bg-[var(--surface-soft)] p-2">
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} style={axisStyle} strokeWidth="1.5" />
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} style={axisStyle} strokeWidth="1.5" />
        <path d={path} fill="none" style={pathStyle} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((point) => (
          <g key={point.label}>
            <circle cx={point.x} cy={point.y} r="5" style={pointStyle} />
            <title>{`${point.label}: ${point.value.toLocaleString("pt-BR")}`}</title>
          </g>
        ))}
      </svg>
      <div className="grid gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <div key={item.label} className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-3 text-sm">
            <p className="font-semibold text-[var(--text-secondary)]">{item.label}</p>
            <p className="mt-1 text-lg font-black text-[var(--text-primary)]">{item.value.toLocaleString("pt-BR")}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

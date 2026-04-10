import { chartPalette } from "@/styles/theme";

interface ScatterPoint {
  id: string;
  label: string;
  eixoX: number;
  eixoY: number;
  serie: string | null;
  descricao: string | null;
}

export function SimpleScatterChart({ items }: { items: ScatterPoint[] }) {
  if (!items.length) {
    return (
      <div className="rounded-3xl border border-dashed border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-8 text-center text-sm text-[var(--text-secondary)]">
        Sem dados suficientes para a dispersão.
      </div>
    );
  }

  const width = 560;
  const height = 220;
  const padding = 28;
  const xMin = Math.min(...items.map((item) => item.eixoX));
  const xMax = Math.max(...items.map((item) => item.eixoX));
  const yMin = 0;
  const yMax = Math.max(...items.map((item) => item.eixoY), 1);
  const series = Array.from(new Set(items.map((item) => item.serie ?? "Base")));

  return (
    <div className="space-y-4">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full rounded-3xl bg-[var(--surface-soft)] p-2">
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="var(--border-subtle)" strokeWidth="1.5" />
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="var(--border-subtle)" strokeWidth="1.5" />
        {items.map((item, index) => {
          const xRatio = xMax === xMin ? 0.5 : (item.eixoX - xMin) / (xMax - xMin);
          const yRatio = yMax === yMin ? 0 : (item.eixoY - yMin) / (yMax - yMin);
          const x = padding + xRatio * (width - padding * 2);
          const y = height - padding - yRatio * (height - padding * 2);
          const color = chartPalette[series.indexOf(item.serie ?? "Base") % chartPalette.length];
          return (
            <g key={item.id}>
              <circle cx={x} cy={y} r="5" fill={color} fillOpacity="0.88" />
              <title>{`${item.label}: ${item.eixoY.toLocaleString("pt-BR")} ${item.descricao ? `• ${item.descricao}` : ""}`}</title>
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap gap-3">
        {series.map((serie, index) => (
          <div key={serie} className="inline-flex items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-1 text-xs font-semibold text-[var(--text-secondary)]">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: chartPalette[index % chartPalette.length] }} />
            {serie}
          </div>
        ))}
      </div>
    </div>
  );
}

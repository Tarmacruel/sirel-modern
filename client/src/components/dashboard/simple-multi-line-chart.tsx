import type { CSSProperties } from "react";

import { chartPalette } from "@/styles/theme";

interface MultiLinePoint {
  label: string;
  valueA?: number;
  valueB?: number;
  valueC?: number;
  valorA?: number;
  valorB?: number;
  valorC?: number;
}

interface SimpleMultiLineChartProps {
  items: MultiLinePoint[];
  labels?: {
    a: string;
    b: string;
    c?: string;
  };
}

export function SimpleMultiLineChart({
  items,
  labels = { a: "Série A", b: "Série B", c: "Série C" },
}: SimpleMultiLineChartProps) {
  if (!items.length) {
    return (
      <div className="rounded-3xl border border-dashed border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-8 text-center text-sm text-[var(--text-secondary)]">
        Sem dados para o período selecionado.
      </div>
    );
  }

  const width = 560;
  const height = 220;
  const padding = 28;
  const max = Math.max(
    ...items.flatMap((item) => [
      item.valueA ?? item.valorA ?? 0,
      item.valueB ?? item.valorB ?? 0,
      item.valueC ?? item.valorC ?? 0,
    ]),
    1,
  );
  const stepX =
    items.length > 1 ? (width - padding * 2) / (items.length - 1) : 0;
  const buildPoints = (getter: (item: MultiLinePoint) => number | undefined) =>
    items.map((item, index) => {
      const value = getter(item) ?? 0;
      const x = padding + stepX * index;
      const y = height - padding - (value / max) * (height - padding * 2);
      return { x, y, value, label: item.label };
    });

  const series = [
    { key: "a", color: chartPalette[0], label: labels.a, points: buildPoints((item) => item.valueA ?? item.valorA) },
    { key: "b", color: chartPalette[1], label: labels.b, points: buildPoints((item) => item.valueB ?? item.valorB) },
    labels.c
      ? { key: "c", color: chartPalette[2], label: labels.c, points: buildPoints((item) => item.valueC ?? item.valorC) }
      : null,
  ].filter(Boolean) as Array<{
    key: string;
    color: string;
    label: string;
    points: Array<{ x: number; y: number; value: number; label: string }>;
  }>;

  const axisStyle = { stroke: "var(--border-subtle)" } as CSSProperties;

  return (
    <div className="space-y-4">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full rounded-3xl bg-[var(--surface-soft)] p-2">
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} style={axisStyle} strokeWidth="1.5" />
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} style={axisStyle} strokeWidth="1.5" />
        {series.map((serie) => {
          const path = serie.points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ");
          return (
            <g key={serie.key}>
              <path d={path} fill="none" stroke={serie.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              {serie.points.map((point) => (
                <g key={`${serie.key}-${point.label}`}>
                  <circle cx={point.x} cy={point.y} r="4.5" fill={serie.color} />
                  <title>{`${serie.label} • ${point.label}: ${point.value.toLocaleString("pt-BR")}`}</title>
                </g>
              ))}
            </g>
          );
        })}
      </svg>
      <div className="grid gap-3 md:grid-cols-3">
        {series.map((serie) => (
          <div key={serie.key} className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: serie.color }} />
              <span className="font-semibold text-[var(--text-secondary)]">{serie.label}</span>
            </div>
            <div className="mt-2 text-xs text-[var(--text-muted)]">
              Último valor: {serie.points.at(-1)?.value.toLocaleString("pt-BR") ?? "0"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

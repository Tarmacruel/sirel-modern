import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { Card } from "@/components/ui/card";

interface KpiCardProps {
  title: string;
  value: string;
  hint: string;
  icon: ReactNode;
}

export function KpiCard({ title, value, hint, icon }: KpiCardProps) {
  const valueWrapperRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef<HTMLParagraphElement>(null);
  const [fontSizePx, setFontSizePx] = useState<number>(38);

  useLayoutEffect(() => {
    const wrapper = valueWrapperRef.current;
    const valueElement = valueRef.current;
    if (!wrapper || !valueElement) {
      return;
    }

    const maxSize = 38;
    const minSize = 18;

    const fitText = () => {
      const availableWidth = wrapper.clientWidth;
      if (!availableWidth) {
        return;
      }

      let low = minSize;
      let high = maxSize;
      let best = minSize;

      while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        valueElement.style.fontSize = `${middle}px`;

        if (valueElement.scrollWidth <= availableWidth) {
          best = middle;
          low = middle + 1;
        } else {
          high = middle - 1;
        }
      }

      valueElement.style.fontSize = "";
      setFontSizePx(best);
    };

    fitText();

    const resizeObserver = new ResizeObserver(() => {
      fitText();
    });

    resizeObserver.observe(wrapper);

    return () => {
      resizeObserver.disconnect();
    };
  }, [value]);

  return (
    <Card className="rounded-[28px] border-[var(--border-subtle)] bg-[var(--surface-card)]">
      <div className="flex min-w-0 items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="font-[var(--font-heading)] text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--text-muted)]">{title}</p>
          <div ref={valueWrapperRef} className="mt-3 min-w-0">
            <p
              ref={valueRef}
              style={{ fontSize: `${fontSizePx}px` }}
              className="max-w-full whitespace-nowrap font-black leading-none tracking-[-0.04em] text-[var(--text-primary)] tabular-nums"
            >
              {value}
            </p>
          </div>
          <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)] sm:text-sm sm:leading-6">{hint}</p>
        </div>
        <div className="shrink-0 rounded-[20px] border border-[var(--border-subtle)] bg-[var(--surface-soft)] p-3 text-[var(--accent-color)]">{icon}</div>
      </div>
    </Card>
  );
}

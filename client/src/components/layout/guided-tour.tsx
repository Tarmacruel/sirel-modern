import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, X } from "lucide-react";

import type { GuidedTourStep } from "@/lib/entry-experience";
import { buildTourStorageKey } from "@/lib/entry-experience";
import { Button } from "@/components/ui/button";

interface GuidedTourProps {
  steps: GuidedTourStep[];
  userId: number;
  version: string;
  autoStart?: boolean;
  restartSignal?: number;
}

function getAvailableSteps(steps: GuidedTourStep[]) {
  if (typeof document === "undefined") {
    return steps;
  }

  return steps.filter((step) => document.querySelector(`[data-tour-id="${step.targetId}"]`));
}

export function GuidedTour({ steps, userId, version, autoStart = true, restartSignal = 0 }: GuidedTourProps) {
  const storageKey = useMemo(() => buildTourStorageKey(userId, version), [userId, version]);
  const [availableSteps, setAvailableSteps] = useState<GuidedTourStep[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    setAvailableSteps(getAvailableSteps(steps));
  }, [steps]);

  useEffect(() => {
    if (!autoStart || !availableSteps.length || typeof window === "undefined") {
      return;
    }

    const saved = window.localStorage.getItem(storageKey);
    if (saved === "done") {
      return;
    }

    setActiveIndex(0);
    setOpen(true);
  }, [autoStart, availableSteps, storageKey]);

  useEffect(() => {
    if (!restartSignal || !availableSteps.length) {
      return;
    }

    setActiveIndex(0);
    setOpen(true);
  }, [availableSteps, restartSignal]);

  useEffect(() => {
    if (!open || !availableSteps.length) {
      setHighlightRect(null);
      return;
    }

    const step = availableSteps[activeIndex];
    if (!step || typeof document === "undefined") {
      setHighlightRect(null);
      return;
    }

    const updatePosition = () => {
      const element = document.querySelector(`[data-tour-id="${step.targetId}"]`) as HTMLElement | null;
      if (!element) {
        setHighlightRect(null);
        return;
      }
      element.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
      setHighlightRect(element.getBoundingClientRect());
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [activeIndex, availableSteps, open]);

  if (!open || !availableSteps.length) {
    return null;
  }

  const step = availableSteps[activeIndex];
  if (!step) {
    return null;
  }

  const completeTour = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, "done");
    }
    setOpen(false);
    setHighlightRect(null);
  };

  const goNext = () => {
    if (activeIndex >= availableSteps.length - 1) {
      completeTour();
      return;
    }
    setActiveIndex((current) => current + 1);
  };

  const goBack = () => {
    setActiveIndex((current) => Math.max(0, current - 1));
  };

  return createPortal(
    <div className="fixed inset-0 z-[220]">
      {highlightRect ? (
        <div
          className="pointer-events-none fixed rounded-[28px] border border-white/70 shadow-[0_0_0_9999px_rgba(8,14,25,0.68),0_18px_40px_-18px_rgba(8,14,25,0.8)] transition-all duration-200"
          style={{
            left: Math.max(8, highlightRect.left - 8),
            top: Math.max(8, highlightRect.top - 8),
            width: highlightRect.width + 16,
            height: highlightRect.height + 16,
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-[rgba(8,14,25,0.72)]" />
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 p-4 sm:bottom-6 sm:right-6 sm:left-auto sm:w-[430px]">
        <div className="pointer-events-auto rounded-[28px] border border-white/12 bg-[linear-gradient(180deg,rgba(12,20,32,0.96),rgba(11,18,30,0.98))] p-5 text-white shadow-[0_28px_80px_-28px_rgba(0,0,0,0.85)] backdrop-blur-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-sky-100/72">Tour guiado</p>
              <h3 className="mt-2 font-[var(--font-heading)] text-2xl font-black tracking-[-0.04em]">{step.title}</h3>
            </div>
            <button
              type="button"
              onClick={completeTour}
              className="inline-flex h-10 w-10 items-center justify-center rounded-[18px] border border-white/10 bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <p className="mt-4 text-sm leading-7 text-slate-200">{step.description}</p>

          <div className="mt-5 flex items-center justify-between gap-3">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              Etapa {activeIndex + 1} de {availableSteps.length}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={completeTour} className="text-white/78 hover:text-white">
                Pular
              </Button>
              <Button variant="secondary" size="sm" onClick={goBack} disabled={activeIndex === 0} className="border-white/10 bg-white/8 text-white hover:bg-white/12 hover:text-white">
                Voltar
              </Button>
              <Button size="sm" onClick={goNext} className="bg-[linear-gradient(135deg,var(--brand-primary)_0%,#8bd6ff_100%)] text-slate-950 hover:brightness-105" icon={<ArrowRight className="h-4 w-4" />}>
                {activeIndex >= availableSteps.length - 1 ? "Concluir" : "Próximo"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

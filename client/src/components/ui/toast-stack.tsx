import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

import { Button } from "@/components/ui/button";

export type ToastTone = "success" | "error" | "info";

export interface ToastStackItem {
  id: number;
  tone: ToastTone;
  title: string;
  message: string;
}

interface ToastStackProps {
  items: ToastStackItem[];
  onDismiss: (id: number) => void;
}

const toneStyles: Record<ToastTone, string> = {
  success:
    "border-emerald-200/80 bg-emerald-50/95 text-emerald-950 shadow-[0_18px_40px_-28px_rgba(5,150,105,0.42)]",
  error:
    "border-rose-200/85 bg-rose-50/96 text-rose-950 shadow-[0_18px_40px_-28px_rgba(225,29,72,0.38)]",
  info: "border-sky-200/85 bg-sky-50/96 text-sky-950 shadow-[0_18px_40px_-28px_rgba(14,116,144,0.32)]",
};

const toneIcons: Record<ToastTone, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

export function ToastStack({ items, onDismiss }: ToastStackProps) {
  if (!items.length) return null;

  return (
    <div className="pointer-events-none fixed right-4 top-[88px] z-[130] flex w-[min(420px,calc(100vw-1.5rem))] flex-col gap-3">
      {items.map((item) => {
        const Icon = toneIcons[item.tone];

        return (
          <div
            key={item.id}
            role={item.tone === "error" ? "alert" : "status"}
            aria-live={item.tone === "error" ? "assertive" : "polite"}
            className={`pointer-events-auto rounded-[24px] border px-4 py-4 backdrop-blur-sm ${toneStyles[item.tone]}`}
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/75 text-current">
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-current/70">
                  {item.title}
                </div>
                <p className="mt-1 text-sm leading-6 text-current/90">
                  {item.message}
                </p>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-9 w-9 rounded-2xl text-current hover:bg-white/65"
                onClick={() => onDismiss(item.id)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

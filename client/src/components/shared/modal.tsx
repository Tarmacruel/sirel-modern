import { useEffect, type PropsWithChildren, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface ModalProps extends PropsWithChildren {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  actions?: ReactNode;
  size?: "md" | "lg" | "xl";
}

const sizeClasses: Record<NonNullable<ModalProps["size"]>, string> = {
  md: "max-w-2xl",
  lg: "max-w-4xl",
  xl: "max-w-6xl",
};

export function Modal({ open, title, description, onClose, actions, size = "lg", children }: ModalProps) {
  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  // ESC key handler for closing modal
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[120] overflow-y-auto px-0 py-0 sm:px-6 sm:py-8">
      <button
        type="button"
        onClick={onClose}
        className="fixed inset-0 bg-[var(--surface-overlay)] backdrop-blur-sm"
        aria-label="Fechar modal"
      />
      <div className="relative flex min-h-full items-end justify-center sm:items-center">
        <div
          className={[
            "relative z-10 flex max-h-[100dvh] w-full flex-col overflow-hidden rounded-t-[32px] border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-[var(--shadow-card)] sm:max-h-[calc(100vh-3rem)] sm:rounded-[32px]",
            sizeClasses[size],
          ].join(" ")}
        >
          <div className="flex items-start justify-between gap-4 border-b border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-4 sm:px-6 sm:py-5">
            <div>
              <h3 className="font-[var(--font-heading)] text-xl font-black tracking-tight text-[var(--text-primary)]">{title}</h3>
              {description ? <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{description}</p> : null}
            </div>
            <button type="button" onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-secondary)] transition hover:border-[var(--border-strong)] hover:text-[var(--accent-color)]">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto px-4 py-4 sm:px-6 sm:py-5">{children}</div>
          {actions ? <div className="border-t border-[var(--border-subtle)] px-4 py-4 sm:px-6">{actions}</div> : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}

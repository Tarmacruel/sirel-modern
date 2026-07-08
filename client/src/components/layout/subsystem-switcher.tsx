import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ChevronDown,
  FileText,
  FolderKanban,
  Landmark,
  LayoutDashboard,
  Search,
  ScrollText,
  Settings2,
  ShieldCheck,
  ShoppingCart,
  Workflow,
  type LucideIcon,
} from "lucide-react";

import type { SubsystemDefinition } from "@sirel/shared/subsystems";
import type { AuthUser } from "@/lib/auth-session";
import {
  buildSubsystemHref,
  getAuthorizedSubsystemsForUser,
  getSubsystemAccessLabel,
} from "@/lib/subsystem-navigation";

const icons: Record<string, LucideIcon> = {
  LayoutDashboard,
  FolderKanban,
  ShoppingCart,
  ScrollText,
  Landmark,
  FileText,
  Workflow,
  Search,
  ShieldCheck,
  Settings2,
};

function resolveIcon(icon: string) {
  return icons[icon] ?? LayoutDashboard;
}

export function SubsystemSwitcher({
  currentSubsystem,
  user,
}: {
  currentSubsystem: SubsystemDefinition;
  user: AuthUser;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const subsystems = getAuthorizedSubsystemsForUser(user);
  const CurrentIcon = resolveIcon(currentSubsystem.icon);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex h-10 items-center gap-2 rounded-[18px] border border-[var(--border-color)] bg-[var(--bg-surface)] px-3 text-sm font-semibold text-[var(--text-secondary)] transition hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Trocar subsistema"
      >
        <CurrentIcon className="h-4 w-4 text-[var(--accent-color)]" />
        <span className="hidden lg:inline">{currentSubsystem.shortTitle}</span>
        <ChevronDown className="h-4 w-4" />
      </button>

      {open ? (
        <div
          className="absolute right-0 z-[220] mt-2 w-[min(340px,calc(100vw-1.5rem))] rounded-[24px] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-2 shadow-[var(--shadow-floating)]"
          role="menu"
        >
          <div className="px-3 py-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">
              Ambientes autorizados
            </p>
          </div>
          <div className="space-y-1">
            {subsystems.map((subsystem) => {
              const Icon = resolveIcon(subsystem.icon);
              const current = subsystem.key === currentSubsystem.key;

              return (
                <a
                  key={subsystem.key}
                  href={buildSubsystemHref(subsystem.key, "/")}
                  role="menuitem"
                  className={[
                    "flex items-center gap-3 rounded-[18px] border px-3 py-3 text-left transition",
                    current
                      ? "border-[var(--accent-color)] bg-[var(--surface-highlight)]"
                      : "border-transparent hover:border-[var(--border-subtle)] hover:bg-[var(--surface-soft)]",
                  ].join(" ")}
                  onClick={() => setOpen(false)}
                >
                  <span
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[16px] bg-[var(--surface-soft)]"
                    style={{ color: subsystem.accent }}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-[var(--text-primary)]">
                      {subsystem.shortTitle}
                    </span>
                    <span className="block truncate text-xs text-[var(--text-secondary)]">
                      {getSubsystemAccessLabel(subsystem.accessLevel)}
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 text-[var(--text-muted)]" />
                </a>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

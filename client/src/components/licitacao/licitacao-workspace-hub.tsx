import type { ReactNode } from "react";
import {
  BadgeCheck,
  FileKey2,
  FileMinus2,
  FileSymlink,
  Gavel,
  ListChecks,
  Scale,
} from "lucide-react";

import type {
  LicitacaoWorkspaceDefinition,
  LicitacaoWorkspaceIcon,
  LicitacaoWorkspaceKey,
} from "@/lib/licitacao-workspaces";

export interface LicitacaoWorkspaceHubCard {
  workspace: LicitacaoWorkspaceDefinition;
  count: number | null;
  loading?: boolean;
}

interface LicitacaoWorkspaceHubProps {
  cards: LicitacaoWorkspaceHubCard[];
  onSelect: (workspace: LicitacaoWorkspaceKey) => void;
  action?: ReactNode;
}

const iconMap = {
  "badge-check": BadgeCheck,
  "file-minus": FileMinus2,
  "file-key": FileKey2,
  gavel: Gavel,
  scale: Scale,
  "file-symlink": FileSymlink,
  "list-checks": ListChecks,
} satisfies Record<LicitacaoWorkspaceIcon, typeof BadgeCheck>;

export function LicitacaoWorkspaceHub({
  cards,
  onSelect,
  action,
}: LicitacaoWorkspaceHubProps) {
  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-black tracking-tight text-[var(--text-primary)]">
          Licitação
        </h1>
        {action}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {cards.map(({ workspace, count, loading }) => {
          const Icon = iconMap[workspace.icon];
          const countLabel = loading ? "..." : count === null ? "-" : count;

          return (
            <button
              key={workspace.key}
              type="button"
              onClick={() => onSelect(workspace.key)}
              className="group flex min-h-[132px] flex-col justify-between rounded-[24px] border border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-4 text-left shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:border-[var(--border-strong)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-500)] focus-visible:ring-offset-2"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-[18px] border border-[var(--border-subtle)] bg-[var(--surface-soft)] text-[var(--accent-color)]">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="text-3xl font-black tracking-tight text-[var(--text-primary)]">
                  {countLabel}
                </span>
              </div>

              <div>
                <div className="text-base font-black text-[var(--text-primary)]">
                  {workspace.shortTitle}
                </div>
                <div className="mt-1 text-sm text-[var(--text-secondary)]">
                  {workspace.subtitle}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

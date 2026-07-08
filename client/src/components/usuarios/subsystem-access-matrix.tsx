import {
  subsystemAccessLevelLabels,
  subsystemAccessLevelValues,
  subsystemDefinitions,
  type SubsystemAccessLevel,
  type SubsystemKey,
} from "@sirel/shared/subsystems";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { AuthSubsystemAccess } from "@/lib/auth-session";

export type SubsystemAccessDraft = AuthSubsystemAccess;

function access(
  subsystemKey: SubsystemKey,
  accessLevel: SubsystemAccessLevel,
  isDefault = false,
): SubsystemAccessDraft {
  return { subsystemKey, accessLevel, isDefault, ativo: true, observacao: null };
}

export function buildDefaultSubsystemAccessDraft(
  role: string,
): SubsystemAccessDraft[] {
  if (role === "admin") {
    return subsystemDefinitions.map((subsystem, index) =>
      access(subsystem.key, "ADMIN", index === 0),
    );
  }

  if (role === "gestor") {
    return subsystemDefinitions
      .filter((subsystem) => subsystem.key !== "admin")
      .map((subsystem, index) => access(subsystem.key, "MANAGER", index === 0));
  }

  if (role === "operador") {
    const keys = new Set<SubsystemKey>([
      "hub",
      "planejamento",
      "compras",
      "licitacao",
      "documentos",
      "workflow",
      "consultas",
    ]);
    return subsystemDefinitions
      .filter((subsystem) => keys.has(subsystem.key))
      .map((subsystem, index) =>
        access(subsystem.key, "OPERATOR", index === 0),
      );
  }

  if (role === "auditor") {
    return subsystemDefinitions
      .filter((subsystem) => subsystem.key !== "admin")
      .map((subsystem, index) => access(subsystem.key, "VIEWER", index === 0));
  }

  return [access("hub", "VIEWER", true)];
}

function normalizeValue(
  value: readonly SubsystemAccessDraft[],
): SubsystemAccessDraft[] {
  return subsystemDefinitions.map((subsystem) => {
    const current = value.find((item) => item.subsystemKey === subsystem.key);
    return (
      current ?? {
        subsystemKey: subsystem.key,
        accessLevel: "VIEWER" as const,
        isDefault: subsystem.key === "hub",
        ativo: subsystem.key === "hub",
        observacao: null,
      }
    );
  });
}

export function SubsystemAccessMatrix({
  value,
  onChange,
  lockAdminAccess = false,
}: {
  value: readonly SubsystemAccessDraft[];
  onChange: (value: SubsystemAccessDraft[]) => void;
  lockAdminAccess?: boolean;
}) {
  const rows = normalizeValue(value);

  function emit(nextRows: SubsystemAccessDraft[]) {
    const activeDefault =
      nextRows.find((row) => row.ativo && row.isDefault)?.subsystemKey ??
      nextRows.find((row) => row.ativo)?.subsystemKey ??
      "hub";

    onChange(
      nextRows.map((row) => ({
        ...row,
        isDefault: row.subsystemKey === activeDefault,
      })),
    );
  }

  function updateRow(
    subsystemKey: SubsystemKey,
    patch: Partial<SubsystemAccessDraft>,
  ) {
    const nextRows: SubsystemAccessDraft[] = rows.map((row) => {
      if (row.subsystemKey !== subsystemKey) return row;

      return {
        ...row,
        ...patch,
        ativo: patch.isDefault ? true : patch.ativo ?? row.ativo,
      };
    });

    emit(nextRows);
  }

  return (
    <div className="overflow-x-auto rounded-[24px] border border-slate-200 bg-white">
      <div className="grid min-w-[560px] grid-cols-[minmax(180px,1fr)_92px_150px_92px] gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
        <span>Subsistema</span>
        <span>Ativo</span>
        <span>Nível</span>
        <span>Padrão</span>
      </div>

      <div className="divide-y divide-slate-100">
        {rows.map((row) => {
          const subsystem = subsystemDefinitions.find(
            (item) => item.key === row.subsystemKey,
          )!;
          const adminLocked = lockAdminAccess && row.subsystemKey === "admin";

          return (
            <div
              key={row.subsystemKey}
              className="grid min-w-[560px] grid-cols-[minmax(180px,1fr)_92px_150px_92px] gap-2 px-4 py-3"
            >
              <div className="min-w-0">
                <div className="font-semibold text-slate-950">
                  {subsystem.shortTitle}
                </div>
                <div className="truncate text-xs text-slate-500">
                  {subsystem.description}
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Checkbox
                  checked={adminLocked ? true : row.ativo}
                  disabled={adminLocked}
                  onChange={(event) =>
                    updateRow(row.subsystemKey, {
                      ativo: event.target.checked,
                    })
                  }
                />
                Sim
              </label>

              <Select
                value={adminLocked ? "ADMIN" : row.accessLevel}
                disabled={!row.ativo || adminLocked}
                onChange={(event) =>
                  updateRow(row.subsystemKey, {
                    accessLevel: event.target.value as SubsystemAccessLevel,
                  })
                }
                aria-label={`Nivel de acesso em ${subsystem.shortTitle}`}
              >
                {subsystemAccessLevelValues.map((level) => (
                  <option key={level} value={level}>
                    {subsystemAccessLevelLabels[level]}
                  </option>
                ))}
              </Select>

              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <input
                  type="radio"
                  name="default-subsystem"
                  className="h-4 w-4"
                  checked={row.isDefault}
                  disabled={!row.ativo}
                  onChange={() =>
                    updateRow(row.subsystemKey, {
                      ativo: true,
                      isDefault: true,
                    })
                  }
                />
                Usar
              </label>

              <div className="col-span-4">
                <Input
                  value={row.observacao ?? ""}
                  onChange={(event) =>
                    updateRow(row.subsystemKey, {
                      observacao: event.target.value,
                    })
                  }
                  placeholder="Observação administrativa opcional"
                  aria-label={`Observacao de acesso em ${subsystem.shortTitle}`}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

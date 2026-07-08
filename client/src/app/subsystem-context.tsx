import {
  createContext,
  useContext,
  useMemo,
  type PropsWithChildren,
} from "react";
import {
  getDefaultSubsystem,
  getSubsystemByKey,
  resolveSubsystemByHost,
  type SubsystemDefinition,
  type SubsystemKey,
} from "@sirel/shared/subsystems";

type LocationLike = {
  hostname?: string;
  search?: string;
};

const SubsystemContext = createContext<SubsystemDefinition | null>(null);

function resolveForcedSubsystem(value: string | null) {
  if (!value) return undefined;
  return getSubsystemByKey(value as SubsystemKey);
}

export function resolveSubsystemFromLocation(
  location: LocationLike,
  options: { isDev: boolean },
): SubsystemDefinition {
  const params = new URLSearchParams(location.search ?? "");
  const forcedSubsystem = params.get("subsystem");

  if (options.isDev && forcedSubsystem) {
    return resolveForcedSubsystem(forcedSubsystem) ?? getDefaultSubsystem();
  }

  return resolveSubsystemByHost(location.hostname ?? "");
}

export function resolveCurrentSubsystem(): SubsystemDefinition {
  if (typeof window === "undefined") return getDefaultSubsystem();

  return resolveSubsystemFromLocation(window.location, {
    isDev: import.meta.env.DEV,
  });
}

export function SubsystemProvider({ children }: PropsWithChildren) {
  const subsystem = useMemo(() => resolveCurrentSubsystem(), []);

  return (
    <SubsystemContext.Provider value={subsystem}>
      {children}
    </SubsystemContext.Provider>
  );
}

export function useSubsystem() {
  const context = useContext(SubsystemContext);

  if (!context) {
    throw new Error("useSubsystem deve ser usado dentro de SubsystemProvider");
  }

  return context;
}

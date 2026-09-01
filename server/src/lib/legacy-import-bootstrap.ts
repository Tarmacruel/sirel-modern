export interface LegacyImportBootstrapConfig {
  defaultPassword: string;
  adminUsername: string;
  adminName: string;
  adminEmail: string | null;
}

const MINIMUM_BOOTSTRAP_PASSWORD_LENGTH = 12;

function requiredEnvironmentValue(environment: NodeJS.ProcessEnv, key: string) {
  const value = environment[key]?.trim();
  if (!value) {
    throw new Error(
      `A importacao legada exige ${key} configurada no ambiente local.`,
    );
  }
  return value;
}

function normalizeAdminUsername(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .toLowerCase();
}

export function resolveLegacyImportBootstrap(
  environment: NodeJS.ProcessEnv = process.env,
): LegacyImportBootstrapConfig {
  const defaultPassword = requiredEnvironmentValue(
    environment,
    "SIREL_DEFAULT_PASSWORD",
  );
  if (defaultPassword.length < MINIMUM_BOOTSTRAP_PASSWORD_LENGTH) {
    throw new Error(
      `SIREL_DEFAULT_PASSWORD deve ter pelo menos ${MINIMUM_BOOTSTRAP_PASSWORD_LENGTH} caracteres.`,
    );
  }

  const adminUsername = normalizeAdminUsername(
    requiredEnvironmentValue(environment, "SIREL_ADMIN_USERNAME"),
  );
  if (adminUsername.length < 3) {
    throw new Error("SIREL_ADMIN_USERNAME precisa conter ao menos 3 caracteres validos.");
  }

  const adminName = requiredEnvironmentValue(environment, "SIREL_ADMIN_NAME");
  const adminEmail = environment.SIREL_ADMIN_EMAIL?.trim().toLowerCase() || null;

  return { defaultPassword, adminUsername, adminName, adminEmail };
}

import {
  cargoCadastroSchema,
  departamentoCadastroSchema,
  fornecedorCadastroSchema,
  funcaoCadastroSchema,
  itemCadastroSchema,
  parametroCadastroSchema,
  pessoaCadastroSchema,
  secretariaCadastroSchema,
  servidorCadastroSchema,
  usuarioCadastroSchema,
  type CadastroEntity,
} from "@sirel/shared/schemas/cadastros";

import { normalizeDecimalInput } from "@/lib/formatters";

export type CadastroFormState = Record<string, any>;
export type CadastroFormErrors = Record<string, string>;

export type CadastroLookupRecord = {
  id: number;
  nome?: string | null;
  cpf?: string | null;
  matricula?: string | null;
  dataNascimento?: string | Date | null;
  secretariaId?: number | null;
  secretariaNome?: string | null;
  secretariaSigla?: string | null;
  cargo?: string | null;
  cargoId?: number | null;
  cargoNome?: string | null;
  funcaoId?: number | null;
  funcaoNome?: string | null;
  identityStatus?: string | null;
  identityConflict?: boolean;
};

export type CadastroIdentityStatus =
  | "sem-vinculo"
  | "incompleto"
  | "completo"
  | "conflito";

function digitsOnly(value: string | null | undefined) {
  return String(value ?? "").replace(/\D/g, "");
}

function optionalPositiveNumber(value: unknown) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeComparableValue(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  return value;
}

export function applyPessoaToServidorForm(
  form: CadastroFormState,
  pessoa: CadastroLookupRecord,
) {
  return {
    ...form,
    // O mesmo ID faz o backend atualizar a Pessoa selecionada, sem criar duplicata.
    id: pessoa.id,
    basePessoaId: String(pessoa.id),
    basePessoaOption: pessoa,
    nome: pessoa.nome ?? form.nome ?? "",
    cpf: pessoa.cpf ?? form.cpf ?? "",
    matricula: pessoa.matricula ?? form.matricula ?? "",
    dataNascimento: pessoa.dataNascimento
      ? String(pessoa.dataNascimento).slice(0, 10)
      : form.dataNascimento ?? "",
    secretariaId: pessoa.secretariaId
      ? String(pessoa.secretariaId)
      : form.secretariaId ?? "",
    secretariaOption: pessoa.secretariaId
      ? {
          id: pessoa.secretariaId,
          nome: pessoa.secretariaNome ?? "Secretaria selecionada",
          sigla: pessoa.secretariaSigla ?? null,
        }
      : form.secretariaOption ?? null,
    cargo: pessoa.cargo ?? form.cargo ?? "",
    cargoId: pessoa.cargoId ? String(pessoa.cargoId) : form.cargoId ?? "",
    cargoOption: pessoa.cargoId
      ? { id: pessoa.cargoId, nome: pessoa.cargoNome ?? pessoa.cargo ?? "Cargo selecionado" }
      : form.cargoOption ?? null,
    funcaoId: pessoa.funcaoId ? String(pessoa.funcaoId) : form.funcaoId ?? "",
    funcaoOption: pessoa.funcaoId
      ? { id: pessoa.funcaoId, nome: pessoa.funcaoNome ?? "Função selecionada" }
      : form.funcaoOption ?? null,
  };
}

export function applyPessoaToUsuarioForm(
  form: CadastroFormState,
  pessoa: CadastroLookupRecord,
) {
  const identityStatus =
    digitsOnly(pessoa.cpf).length === 11 &&
    Boolean(String(pessoa.matricula ?? "").trim()) &&
    Boolean(pessoa.dataNascimento)
      ? "completo"
      : "incompleto";

  return {
    ...form,
    pessoaId: String(pessoa.id),
    pessoaOption: pessoa,
    identityStatus,
    name: pessoa.nome ?? form.name ?? "",
    secretariaId: pessoa.secretariaId
      ? String(pessoa.secretariaId)
      : form.secretariaId ?? "",
    secretariaOption: pessoa.secretariaId
      ? {
          id: pessoa.secretariaId,
          nome: pessoa.secretariaNome ?? "Secretaria selecionada",
          sigla: pessoa.secretariaSigla ?? null,
        }
      : form.secretariaOption ?? null,
  };
}

export function resolveCadastroIdentityStatus(
  record: Record<string, unknown>,
): CadastroIdentityStatus {
  if (record.identityConflict === true || record.identityStatus === "conflito") {
    return "conflito";
  }
  if (!record.pessoaId) return "sem-vinculo";
  if (record.identityStatus === "completo" || record.identityStatus === "COMPLETE") {
    return "completo";
  }
  return "incompleto";
}

export function persistenceMismatchFields(
  entity: CadastroEntity,
  payload: Record<string, unknown>,
  record: Record<string, unknown>,
) {
  const fieldsByEntity: Partial<Record<CadastroEntity, string[]>> = {
    pessoas: ["nome", "cpf", "matricula", "dataNascimento", "secretariaId", "cargoId", "funcaoId", "ativo"],
    servidores: ["nome", "cpf", "matricula", "dataNascimento", "secretariaId", "cargoId", "funcaoId", "ativo"],
    usuarios: ["name", "email", "role", "secretariaId", "pessoaId", "ativo"],
  };
  const fields = fieldsByEntity[entity] ?? [];

  return fields.filter((field) => {
    if (payload[field] === undefined) return false;
    return normalizeComparableValue(payload[field]) !== normalizeComparableValue(record[field]);
  });
}

export function maskCnpj(value: string | null | undefined) {
  const digits = digitsOnly(value).slice(0, 14);
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\/\d{4})(\d)/, "$1-$2");
}

export function maskPhone(value: string | null | undefined) {
  const digits = digitsOnly(value).slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return digits.replace(/^(\d{2})(\d+)/, "($1) $2");
  if (digits.length <= 10) return digits.replace(/^(\d{2})(\d{4})(\d+)/, "($1) $2-$3");
  return digits.replace(/^(\d{2})(\d{5})(\d+)/, "($1) $2-$3");
}

export function maskCep(value: string | null | undefined) {
  const digits = digitsOnly(value).slice(0, 8);
  if (digits.length <= 5) return digits;
  return digits.replace(/^(\d{5})(\d+)/, "$1-$2");
}

export function maskCpf(value: string | null | undefined) {
  const digits = digitsOnly(value).slice(0, 11);
  return digits
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

export function buildCadastroPayload(entity: CadastroEntity, form: CadastroFormState, editingId?: number | null) {
  switch (entity) {
    case "itens":
      return {
        id: editingId ?? undefined,
        descricao: String(form.descricao ?? "").trim(),
        unidadePadrao: String(form.unidadePadrao ?? "").trim().toUpperCase(),
        valorReferencia: form.valorReferencia === "" ? null : normalizeDecimalInput(String(form.valorReferencia ?? "")) ?? null,
        ativo: Boolean(form.ativo),
      };
    case "fornecedores":
      return {
        id: editingId ?? undefined,
        razaoSocial: String(form.razaoSocial ?? "").trim(),
        cnpj: digitsOnly(form.cnpj),
        email: String(form.email ?? "").trim(),
        telefone: maskPhone(form.telefone),
        cidade: String(form.cidade ?? "").trim(),
        estado: String(form.estado ?? "").trim().toUpperCase(),
        ativo: Boolean(form.ativo),
      };
    case "secretarias":
      return {
        id: editingId ?? undefined,
        sigla: String(form.sigla ?? "").trim().toUpperCase(),
        nome: String(form.nome ?? "").trim(),
        responsavel: String(form.responsavel ?? "").trim(),
        email: String(form.email ?? "").trim(),
        telefone: maskPhone(form.telefone),
        descricao: String(form.descricao ?? "").trim(),
        ativo: Boolean(form.ativo),
      };
    case "pessoas":
    case "servidores":
      return {
        id: editingId ?? optionalPositiveNumber(form.id) ?? undefined,
        nome: String(form.nome ?? "").trim(),
        cpf: digitsOnly(form.cpf),
        matricula: String(form.matricula ?? "").trim(),
        dataNascimento: String(form.dataNascimento ?? "").trim() || null,
        cargoId: optionalPositiveNumber(form.cargoId),
        funcaoId: optionalPositiveNumber(form.funcaoId),
        // Compatibilidade temporária para registros/importações legados.
        cargo: String(form.cargo ?? "").trim(),
        secretariaId: form.secretariaId ? Number(form.secretariaId) : null,
        ativo: Boolean(form.ativo),
      };
    case "departamentos":
      return {
        id: editingId ?? undefined,
        nome: String(form.nome ?? "").trim(),
        codigoCentroCusto: String(form.codigoCentroCusto ?? "").trim().toUpperCase(),
        secretariaId: Number(form.secretariaId),
        responsavelId: form.responsavelId ? Number(form.responsavelId) : null,
        descricao: String(form.descricao ?? "").trim(),
        ativo: Boolean(form.ativo),
      };
    case "usuarios":
      return {
        id: editingId ?? undefined,
        username: editingId ? undefined : String(form.username ?? "").trim(),
        name: String(form.name ?? "").trim(),
        email: String(form.email ?? "").trim(),
        role: form.role,
        secretariaId: form.secretariaId ? Number(form.secretariaId) : null,
        pessoaId: form.pessoaId ? Number(form.pessoaId) : null,
        password: editingId ? undefined : String(form.password ?? ""),
        ativo: Boolean(form.ativo),
      };
    case "parametros":
      return {
        id: editingId ?? undefined,
        categoria: String(form.categoria ?? "").trim().toUpperCase(),
        chave: String(form.chave ?? "").trim().toUpperCase(),
        valor: String(form.valor ?? "").trim(),
        descricao: String(form.descricao ?? "").trim(),
        ativo: Boolean(form.ativo),
      };
    case "cargos":
      return {
        id: editingId ?? undefined,
        codigo: String(form.codigo ?? "").trim().toUpperCase() || null,
        nome: String(form.nome ?? "").trim(),
        categoria: String(form.categoria ?? "").trim() || null,
        descricao: String(form.descricao ?? "").trim() || null,
        ativo: Boolean(form.ativo),
      };
    case "funcoes":
      return {
        id: editingId ?? undefined,
        codigo: String(form.codigo ?? "").trim().toUpperCase() || null,
        nome: String(form.nome ?? "").trim(),
        descricao: String(form.descricao ?? "").trim() || null,
        ativo: Boolean(form.ativo),
      };
  }
}

function getSchema(entity: CadastroEntity) {
  switch (entity) {
    case "itens":
      return itemCadastroSchema;
    case "fornecedores":
      return fornecedorCadastroSchema;
    case "secretarias":
      return secretariaCadastroSchema;
    case "cargos":
      return cargoCadastroSchema;
    case "funcoes":
      return funcaoCadastroSchema;
    case "pessoas":
      return pessoaCadastroSchema;
    case "servidores":
      return servidorCadastroSchema;
    case "departamentos":
      return departamentoCadastroSchema;
    case "usuarios":
      return usuarioCadastroSchema;
    case "parametros":
      return parametroCadastroSchema;
  }
}

export function validateCadastroForm(entity: CadastroEntity, form: CadastroFormState, editingId?: number | null) {
  const payload = buildCadastroPayload(entity, form, editingId);
  const result = getSchema(entity).safeParse(payload);

  if (result.success) {
    return { success: true as const, data: result.data, errors: {} as CadastroFormErrors };
  }

  const errors: CadastroFormErrors = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "form";
    if (!errors[key]) {
      errors[key] = issue.message;
    }
  }

  return { success: false as const, errors };
}

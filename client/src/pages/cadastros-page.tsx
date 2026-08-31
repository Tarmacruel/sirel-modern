import {
  Boxes,
  Building2,
  CheckCheck,
  Copy,
  Download,
  Eye,
  FolderTree,
  History,
  ImagePlus,
  Landmark,
  Pencil,
  Plus,
  RefreshCcw,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  UserCog,
  Users,
} from "lucide-react";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useLocation } from "wouter";

import type { CadastroEntity } from "@sirel/shared/schemas/cadastros";

import { CadastrosInstitucionaisPanel } from "@/components/cadastros-institucionais/cadastros-institucionais-panel";
import { Modal } from "@/components/shared/modal";
import { SectionCard } from "@/components/shared/section-card";
import { Alert } from "@/components/ui/alert";
import { AsyncCombobox } from "@/components/ui/async-combobox";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  applyPessoaToServidorForm,
  applyPessoaToUsuarioForm,
  maskCnpj,
  maskCpf,
  maskPhone,
  persistenceMismatchFields,
  resolveCadastroIdentityStatus,
  validateCadastroForm,
  type CadastroFormErrors,
  type CadastroLookupRecord,
} from "@/features/cadastros/form";
import { buildCadastroCroppedFile, buildCadastroCropPreview } from "@/lib/cadastro-image-editor";
import { resolveCadastroAssetUrl, uploadCadastroAsset } from "@/lib/cadastros-upload";
import { exportCadastrosToCsv, exportCadastrosToPdf, exportCadastrosToXlsx } from "@/lib/export-cadastros";
import { formatCurrencyBRL, formatShortDateTimeBR } from "@/lib/formatters";
import { trpc } from "@/lib/trpc";

type FormState = Record<string, any>;
type LookupOption = CadastroLookupRecord & Record<string, any>;
type AuditEntry = {
  id: number;
  acao: "CREATE" | "UPDATE" | "DELETE";
  descricao: string | null;
  dadosAnteriores: Record<string, unknown> | null;
  dadosNovos: Record<string, unknown> | null;
  criadoEm: string | Date;
  usuarioNome: string | null;
};
type ExportScope = "page" | "selected" | "all";
type ExportFormat = "csv" | "xlsx" | "pdf";
type CropState = { zoom: number; offsetX: number; offsetY: number };
type DedupeClassification = "ALTA" | "MEDIA" | "BAIXA";
type BackfillConfidence = DedupeClassification | "SEM_CORRESPONDENCIA";
type DedupeSuggestionRecord = {
  id: number;
  label: string;
  documento: string | null;
  ativo: boolean;
  vinculos: number;
  atualizadoEm: string | Date | null;
  subtitle: string | null;
};
type DedupeSuggestion = {
  groupKey: string;
  classification: DedupeClassification;
  confidenceScore: number;
  reasonSummary: string[];
  suggestedTargetId: number;
  sourceIds: number[];
  records: DedupeSuggestionRecord[];
};
type FornecedorWinnerBackfillRow = {
  id: number;
  processoId: number;
  itemProcessoId: number;
  numeroItem: number;
  itemDescricao: string;
  dataHomologacao: string | Date | null;
  situacaoItem: string;
  numeroSirel: string;
  numeroAdministrativo: string | null;
  numeroEdital: string | null;
  objeto: string;
  fornecedorVencedorId: number | null;
  fornecedorVencedorNome: string | null;
  fornecedorVencedorCnpj: string | null;
  fornecedorAtualNome: string | null;
  fornecedorAtualCnpj: string | null;
  fornecedorSugeridoId: number | null;
  fornecedorSugeridoNome: string | null;
  fornecedorSugeridoCnpj: string | null;
  confidence: BackfillConfidence;
  reasonSummary: string[];
  origemAlteracao: string | null;
};
type WinnerLinkModalState =
  | { mode: "single"; row: FornecedorWinnerBackfillRow }
  | { mode: "process"; processoId: number; numeroSirel: string; seedRow: FornecedorWinnerBackfillRow }
  | null;

const entityMeta: Array<{ key: CadastroEntity; label: string; icon: typeof Boxes; singular: string; searchLabel: string }> = [
  { key: "itens", label: "Itens", icon: Boxes, singular: "item", searchLabel: "descrição, código ou unidade" },
  { key: "fornecedores", label: "Fornecedores", icon: Building2, singular: "fornecedor", searchLabel: "razão social, CNPJ ou e-mail" },
  { key: "secretarias", label: "Secretarias", icon: Landmark, singular: "secretaria", searchLabel: "nome, sigla ou responsável" },
  { key: "cargos", label: "Cargos", icon: UserCog, singular: "cargo", searchLabel: "nome, código ou categoria" },
  { key: "funcoes", label: "Funções", icon: Settings2, singular: "função", searchLabel: "nome ou código" },
  { key: "pessoas", label: "Pessoas", icon: Users, singular: "pessoa", searchLabel: "nome, CPF ou cargo" },
  { key: "servidores", label: "Servidores", icon: UserCog, singular: "servidor", searchLabel: "nome, CPF, matrícula, cargo ou secretaria" },
  { key: "departamentos", label: "Departamentos", icon: FolderTree, singular: "departamento", searchLabel: "nome, centro de custo ou secretaria" },
  { key: "usuarios", label: "Usuários", icon: Users, singular: "usuário", searchLabel: "nome, login ou e-mail" },
  { key: "parametros", label: "Parâmetros", icon: Settings2, singular: "parâmetro", searchLabel: "categoria, chave ou valor" },
];

const roleLabels: Record<string, string> = {
  user: "Usuário",
  operador: "Operador",
  gestor: "Gestor",
  admin: "Administrador",
  auditor: "Auditor",
};

const auditActionLabels = {
  CREATE: "Criação",
  UPDATE: "Atualização",
  DELETE: "Inativação",
} as const;

const identityStatusLabels = {
  "sem-vinculo": "Sem vínculo de identidade",
  incompleto: "Vínculo incompleto",
  completo: "Identidade completa",
  conflito: "Conflito de identidade",
} as const;

const cropDefaults: CropState = { zoom: 1, offsetX: 0, offsetY: 0 };

function getEntityMeta(entity: CadastroEntity) {
  return entityMeta.find((item) => item.key === entity) ?? entityMeta[0];
}

function getAssetAspectRatio(entity: CadastroEntity) {
  return entity === "itens" ? 4 / 3 : 16 / 9;
}

function getCropOptions(entity: CadastroEntity, crop: CropState) {
  const aspectRatio = getAssetAspectRatio(entity);
  return {
    aspectRatio,
    zoom: crop.zoom,
    offsetX: crop.offsetX,
    offsetY: crop.offsetY,
    width: entity === "itens" ? 1200 : 1400,
    height: entity === "itens" ? 900 : 788,
  };
}

function getRowLabel(entity: CadastroEntity, row: Record<string, any>) {
  switch (entity) {
    case "itens":
      return row.nome;
    case "fornecedores":
      return row.razaoSocial;
    case "secretarias":
      return row.nome;
    case "cargos":
    case "funcoes":
      return row.nome;
    case "pessoas":
    case "servidores":
      return row.nome;
    case "departamentos":
      return row.nome;
    case "usuarios":
      return row.name;
    case "parametros":
      return row.chave;
  }
}

function getDefaultForm(entity: CadastroEntity): FormState {
  switch (entity) {
    case "itens":
      return { descricao: "", unidadePadrao: "UN", valorReferencia: "", ativo: true };
    case "fornecedores":
      return { razaoSocial: "", cnpj: "", email: "", telefone: "", cidade: "", estado: "BA", ativo: true };
    case "secretarias":
      return { sigla: "", nome: "", responsavel: "", email: "", telefone: "", descricao: "", ativo: true };
    case "cargos":
      return { codigo: "", nome: "", categoria: "", descricao: "", ativo: true };
    case "funcoes":
      return { codigo: "", nome: "", descricao: "", ativo: true };
    case "pessoas":
      return { nome: "", cpf: "", matricula: "", dataNascimento: "", cargo: "", cargoId: "", funcaoId: "", secretariaId: "", ativo: true };
    case "servidores":
      return { nome: "", cpf: "", matricula: "", dataNascimento: "", cargo: "", cargoId: "", funcaoId: "", secretariaId: "", basePessoaId: "", ativo: true };
    case "departamentos":
      return { nome: "", codigoCentroCusto: "", secretariaId: "", responsavelId: "", descricao: "", ativo: true };
    case "usuarios":
      return { username: "", name: "", email: "", role: "operador", secretariaId: "", pessoaId: "", password: "", ativo: true };
    case "parametros":
      return { categoria: "", chave: "", valor: "", descricao: "", ativo: true };
  }
}

function mapRowToForm(entity: CadastroEntity, row: Record<string, any>): FormState {
  switch (entity) {
    case "itens":
      return {
        id: row.id,
        descricao: row.nome ?? "",
        unidadePadrao: row.unidade ?? "UN",
        valorReferencia: row.valorReferencia ?? "",
        ativo: row.status === "ativo" || row.ativo === true,
      };
    case "fornecedores":
      return {
        id: row.id,
        razaoSocial: row.razaoSocial ?? "",
        cnpj: row.cnpj ?? "",
        email: row.email ?? "",
        telefone: row.telefone ?? "",
        cidade: row.cidade ?? "",
        estado: row.estado ?? "BA",
        ativo: row.status === "ativo" || row.ativo === true,
      };
    case "secretarias":
      return {
        id: row.id,
        sigla: row.sigla ?? "",
        nome: row.nome ?? "",
        responsavel: row.responsavel ?? "",
        email: row.email ?? "",
        telefone: row.telefone ?? "",
        descricao: row.descricao ?? "",
        ativo: row.status === "ativo" || row.ativo === true,
      };
    case "cargos":
      return {
        id: row.id,
        codigo: row.codigo ?? "",
        nome: row.nome ?? "",
        categoria: row.categoria ?? "",
        descricao: row.descricao ?? "",
        ativo: row.status === "ativo" || row.ativo === true,
      };
    case "funcoes":
      return {
        id: row.id,
        codigo: row.codigo ?? "",
        nome: row.nome ?? "",
        descricao: row.descricao ?? "",
        ativo: row.status === "ativo" || row.ativo === true,
      };
    case "pessoas":
    case "servidores":
      return {
        id: row.id,
        nome: row.nome ?? "",
        cpf: row.cpf ?? "",
        matricula: row.matricula ?? "",
        dataNascimento: row.dataNascimento ? String(row.dataNascimento).slice(0, 10) : "",
        cargo: row.cargo ?? "",
        cargoId: row.cargoId ? String(row.cargoId) : "",
        cargoOption: row.cargoId ? { id: row.cargoId, nome: row.cargoNome ?? row.cargo ?? "Cargo selecionado" } : null,
        funcaoId: row.funcaoId ? String(row.funcaoId) : "",
        funcaoOption: row.funcaoId ? { id: row.funcaoId, nome: row.funcaoNome ?? "Função selecionada" } : null,
        secretariaId: row.secretariaId ? String(row.secretariaId) : "",
        secretariaOption: row.secretariaId ? { id: row.secretariaId, nome: row.secretariaNome ?? "Secretaria selecionada", sigla: row.secretariaSigla ?? null } : null,
        basePessoaId: row.id ? String(row.id) : "",
        basePessoaOption: row.id ? row : null,
        ativo: row.status === "ativo" || row.ativo === true,
      };
    case "departamentos":
      return {
        id: row.id,
        nome: row.nome ?? "",
        codigoCentroCusto: row.codigoCentroCusto ?? "",
        secretariaId: row.secretariaId ? String(row.secretariaId) : "",
        responsavelId: row.responsavelId ? String(row.responsavelId) : "",
        secretariaOption: row.secretariaId ? { id: row.secretariaId, nome: row.secretariaNome ?? "Secretaria selecionada", sigla: row.secretariaSigla ?? null } : null,
        responsavelOption: row.responsavelId ? { id: row.responsavelId, nome: row.responsavelNome ?? "Responsável selecionado" } : null,
        descricao: row.descricao ?? "",
        ativo: row.status === "ativo" || row.ativo === true,
      };
    case "usuarios":
      return {
        id: row.id,
        username: row.username ?? "",
        name: row.name ?? "",
        email: row.email ?? "",
        role: row.role ?? "operador",
        secretariaId: row.secretariaId ? String(row.secretariaId) : "",
        pessoaId: row.pessoaId ? String(row.pessoaId) : "",
        secretariaOption: row.secretariaId ? { id: row.secretariaId, nome: row.secretariaNome ?? "Secretaria selecionada", sigla: row.secretariaSigla ?? null } : null,
        pessoaOption: row.pessoaId ? {
          id: row.pessoaId,
          nome: row.pessoaNome ?? row.name ?? "Pessoa selecionada",
          matricula: row.pessoaMatricula ?? null,
          cpf: row.pessoaCpf ?? null,
          secretariaId: row.secretariaId ?? null,
          secretariaNome: row.secretariaNome ?? null,
        } : null,
        identityStatus: row.identityStatus ?? null,
        password: "",
        ativo: row.status === "ativo" || row.ativo === true,
      };
    case "parametros":
      return {
        id: row.id,
        categoria: row.categoria ?? "",
        chave: row.chave ?? "",
        valor: row.valor ?? "",
        descricao: row.descricao ?? "",
        ativo: row.status === "ativo" || row.ativo === true,
      };
  }
}

function highlightTerm(text: string, term: string) {
  if (!term.trim()) return text;
  const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig");
  const parts = text.split(regex);
  return parts.map((part, index) =>
    regex.test(part) ? (
      <mark key={`${part}-${index}`} className="rounded bg-[rgba(245,158,11,0.22)] px-1 text-[var(--color-primary-900)]">
        {part}
      </mark>
    ) : (
      <span key={`${part}-${index}`}>{part}</span>
    ),
  );
}

function formatCnpj(value: string | null | undefined) {
  const digits = (value ?? "").replace(/\D/g, "");
  if (digits.length !== 14) return value ?? "-";
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

function formatCpf(value: string | null | undefined) {
  const digits = (value ?? "").replace(/\D/g, "");
  if (digits.length !== 11) return value ?? "-";
  return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
}

function normalizeLookupText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeLookupOption(option: Record<string, any>): LookupOption {
  const metadata = option.metadata ?? {};
  return {
    ...option,
    ...metadata,
    id: Number(option.id),
    nome: option.nome ?? option.label ?? "",
    label: option.label ?? option.nome ?? String(option.id),
  } as LookupOption;
}

function lookupOptionLabel(option: LookupOption) {
  return String(option.label ?? option.nome ?? option.id);
}

function lookupOptionDetails(option: LookupOption) {
  const details = [
    option.matricula ? `Matrícula ${option.matricula}` : null,
    option.secretariaNome ?? option.sigla ?? null,
    option.cpfMascarado ?? null,
  ].filter(Boolean);
  return option.subtitle ?? details.join(" · ");
}

function dedupeClassificationMeta(classification: DedupeClassification) {
  switch (classification) {
    case "ALTA":
      return {
        label: "Alta confiança",
        className: "bg-[rgba(16,185,129,0.16)] text-[color:var(--color-success)]",
      };
    case "MEDIA":
      return {
        label: "Média confiança",
        className: "bg-[rgba(245,158,11,0.18)] text-[rgb(146,95,0)]",
      };
    case "BAIXA":
      return {
        label: "Baixa confiança",
        className: "bg-[var(--color-neutral-100)] text-[var(--color-neutral-700)]",
      };
  }
}

function backfillConfidenceMeta(confidence: BackfillConfidence) {
  switch (confidence) {
    case "ALTA":
      return {
        label: "Alta aderência",
        className: "bg-[rgba(16,185,129,0.16)] text-[color:var(--color-success)]",
      };
    case "MEDIA":
      return {
        label: "Revisão sugerida",
        className: "bg-[rgba(245,158,11,0.18)] text-[rgb(146,95,0)]",
      };
    case "BAIXA":
      return {
        label: "Baixa aderência",
        className: "bg-[rgba(148,163,184,0.16)] text-[var(--color-neutral-700)]",
      };
    case "SEM_CORRESPONDENCIA":
      return {
        label: "Sem sugestão",
        className: "bg-[var(--color-neutral-100)] text-[var(--color-neutral-700)]",
      };
  }
}

function CadastroStatusBadge({ status }: { status: string }) {
  const active = status === "ativo";
  return (
    <span
      className={[
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold",
        active
          ? "bg-[rgba(16,185,129,0.14)] text-[color:var(--color-success)]"
          : "bg-[var(--color-neutral-100)] text-[var(--color-neutral-600)]",
      ].join(" ")}
    >
      {active ? "Ativo" : "Inativo"}
    </span>
  );
}

function buildExportRows(entity: CadastroEntity, rows: Array<Record<string, any>>) {
  switch (entity) {
    case "itens":
      return rows.map((row) => ({
        Codigo: row.codigo,
        Item: row.nome,
        Unidade: row.unidade,
        "Valor de referencia": row.valorReferencia ?? "",
        Status: row.status,
      }));
    case "fornecedores":
      return rows.map((row) => ({
        "Razao social": row.razaoSocial,
        CNPJ: formatCnpj(row.cnpj),
        Email: row.email ?? "",
        Telefone: row.telefone ?? "",
        Cidade: row.cidade ?? "",
        Estado: row.estado ?? "",
        Status: row.status,
      }));
    case "secretarias":
      return rows.map((row) => ({
        Sigla: row.sigla,
        Secretaria: row.nome,
        Responsavel: row.responsavel ?? "",
        Email: row.email ?? "",
        Telefone: row.telefone ?? "",
        Status: row.status,
      }));
    case "cargos":
      return rows.map((row) => ({
        Codigo: row.codigo ?? "",
        Cargo: row.nome,
        Categoria: row.categoria ?? "",
        Descricao: row.descricao ?? "",
        Status: row.status,
      }));
    case "funcoes":
      return rows.map((row) => ({
        Codigo: row.codigo ?? "",
        Funcao: row.nome,
        Descricao: row.descricao ?? "",
        Status: row.status,
      }));
    case "pessoas":
    case "servidores":
      return rows.map((row) => ({
        Nome: row.nome,
        CPF: row.cpf ?? "",
        Matricula: row.matricula ?? "",
        Nascimento: row.dataNascimento ? String(row.dataNascimento).slice(0, 10) : "",
        Cargo: row.cargo ?? "",
        Secretaria: row.secretariaNome ?? "",
        Status: row.status,
      }));
    case "departamentos":
      return rows.map((row) => ({
        Departamento: row.nome,
        "Centro de custo": row.codigoCentroCusto ?? "",
        Secretaria: row.secretariaNome ?? "",
        Responsavel: row.responsavelNome ?? "",
        Status: row.status,
      }));
    case "usuarios":
      return rows.map((row) => ({
        Login: row.username ?? "",
        Nome: row.name,
        Email: row.email ?? "",
        Perfil: roleLabels[row.role] ?? row.role,
        Secretaria: row.secretariaNome ?? "",
        Pessoa: row.pessoaNome ?? "",
        Identidade: row.identityStatus ?? "",
        Status: row.status,
      }));
    case "parametros":
      return rows.map((row) => ({
        Categoria: row.categoria,
        Chave: row.chave,
        Valor: row.valor,
        Descricao: row.descricao ?? "",
        Status: row.status,
      }));
  }
}

function listChangedFields(entry: AuditEntry) {
  const previous = entry.dadosAnteriores ?? {};
  const next = entry.dadosNovos ?? {};
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  return Array.from(keys).filter((key) => JSON.stringify(previous[key]) !== JSON.stringify(next[key]));
}

function stringifyAuditValue(value: unknown) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value, null, 2);
}

function buildAuditSummary(entry: AuditEntry) {
  const changed = listChangedFields(entry);
  if (entry.acao === "CREATE") return "Registro criado.";
  if (entry.acao === "DELETE") return "Registro inativado.";
  if (!changed.length) return "Atualização sem campos identificados.";
  return `Campos alterados: ${changed.join(", ")}.`;
}

function CadastroMobileCard({
  entity,
  row,
  search,
  selected,
  onSelect,
  onEdit,
  onDuplicate,
  onMerge,
  onDelete,
  onOpenAudit,
}: {
  entity: CadastroEntity;
  row: Record<string, any>;
  search: string;
  selected: boolean;
  onSelect?: () => void;
  onEdit?: () => void;
  onDuplicate?: () => void;
  onMerge?: () => void;
  onDelete?: () => void;
  onOpenAudit?: () => void;
}) {
  return (
    <Card className={["md:hidden", selected ? "border-[rgba(47,84,196,0.38)] bg-[var(--color-primary-50)]" : ""].join(" ")}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          {onSelect ? (
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--color-neutral-600)]">
              <input type="checkbox" checked={selected} onChange={onSelect} className="h-4 w-4 rounded border-[var(--color-neutral-300)]" />
              Selecionar
            </label>
          ) : null}
          {entity === "itens" ? (
            <>
              <p className="font-semibold text-[var(--color-primary-900)]">{highlightTerm(row.nome, search)}</p>
              <p className="text-xs font-mono text-[var(--color-neutral-500)]">{row.codigo}</p>
              <p className="text-sm text-[var(--color-neutral-600)]">{row.unidade} · {row.valorReferencia ? formatCurrencyBRL(row.valorReferencia) : "Sem valor"}</p>
            </>
          ) : null}
          {entity === "fornecedores" ? (
            <>
              <p className="font-semibold text-[var(--color-primary-900)]">{highlightTerm(row.razaoSocial, search)}</p>
              <p className="text-xs font-mono text-[var(--color-neutral-500)]">{formatCnpj(row.cnpj)}</p>
              <p className="text-sm text-[var(--color-neutral-600)]">{row.cidade ?? "Sem cidade"}{row.estado ? `/${row.estado}` : ""}</p>
            </>
          ) : null}
          {entity === "secretarias" ? (
            <>
              <p className="font-semibold text-[var(--color-primary-900)]">{highlightTerm(row.nome, search)}</p>
              <p className="text-xs font-mono text-[var(--color-neutral-500)]">{row.sigla}</p>
              <p className="text-sm text-[var(--color-neutral-600)]">{row.responsavel ?? "Sem responsável"}</p>
            </>
          ) : null}
          {entity === "cargos" || entity === "funcoes" ? (
            <>
              <p className="font-semibold text-[var(--color-primary-900)]">{highlightTerm(row.nome, search)}</p>
              <p className="text-xs font-mono text-[var(--color-neutral-500)]">{row.codigo ?? "Sem código"}</p>
              <p className="text-sm text-[var(--color-neutral-600)]">
                {entity === "cargos" ? row.categoria ?? "Sem categoria" : row.descricao ?? "Sem descrição"}
              </p>
            </>
          ) : null}
          {entity === "pessoas" || entity === "servidores" ? (
            <>
              <p className="font-semibold text-[var(--color-primary-900)]">{highlightTerm(row.nome, search)}</p>
              <p className="text-xs font-mono text-[var(--color-neutral-500)]">{row.cpf ? formatCpf(row.cpf) : "Sem CPF"}</p>
              <p className="text-sm text-[var(--color-neutral-600)]">{row.matricula ? `Mat. ${row.matricula}` : row.cargo ?? "Sem cargo"}</p>
            </>
          ) : null}
          {entity === "departamentos" ? (
            <>
              <p className="font-semibold text-[var(--color-primary-900)]">{highlightTerm(row.nome, search)}</p>
              <p className="text-xs text-[var(--color-neutral-500)]">{row.secretariaNome ?? "Sem secretaria"}</p>
              <p className="text-sm text-[var(--color-neutral-600)]">{row.codigoCentroCusto ?? "Sem centro de custo"}</p>
            </>
          ) : null}
          {entity === "usuarios" ? (
            <>
              <p className="font-semibold text-[var(--color-primary-900)]">{highlightTerm(row.name, search)}</p>
              <p className="text-xs font-mono text-[var(--color-neutral-500)]">{row.username ?? "Sem login"}</p>
              <p className="text-sm text-[var(--color-neutral-600)]">{roleLabels[row.role] ?? row.role}{row.pessoaNome ? ` - ${row.pessoaNome}` : ""}</p>
              <p className="text-xs font-semibold text-[var(--color-primary-700)]">
                {identityStatusLabels[resolveCadastroIdentityStatus(row)]}
              </p>
            </>
          ) : null}
          {entity === "parametros" ? (
            <>
              <p className="font-semibold text-[var(--color-primary-900)]">{highlightTerm(row.chave, search)}</p>
              <p className="text-xs text-[var(--color-neutral-500)]">{row.categoria}</p>
              <p className="text-sm text-[var(--color-neutral-600)]">{row.valor}</p>
            </>
          ) : null}
        </div>
        <CadastroStatusBadge status={row.status} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {onOpenAudit ? (
          <Button variant="ghost" size="sm" className="flex-1" onClick={onOpenAudit} icon={<History className="h-4 w-4" />}>
            Auditoria
          </Button>
        ) : null}
        {onDuplicate ? (
          <Button variant="secondary" size="sm" className="flex-1" onClick={onDuplicate} icon={<Copy className="h-4 w-4" />}>
            Duplicar
          </Button>
        ) : null}
        {onMerge ? (
          <Button variant="secondary" size="sm" className="flex-1" onClick={onMerge} icon={<RefreshCcw className="h-4 w-4" />}>
            Unificar
          </Button>
        ) : null}
        {onEdit ? (
          <Button variant="outline" size="sm" className="flex-1" onClick={onEdit} icon={<Pencil className="h-4 w-4" />}>
            Editar
          </Button>
        ) : null}
        {onDelete ? (
          <Button variant="destructive" size="sm" className="flex-1" onClick={onDelete} icon={<Trash2 className="h-4 w-4" />}>
            Inativar
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

export function CadastrosPage() {
  const searchRef = useRef<HTMLInputElement | null>(null);
  const utils = trpc.useUtils();
  const meQuery = trpc.auth.me.useQuery(undefined, { retry: false });
  const [location, setLocation] = useLocation();
  const [entity, setEntity] = useState<CadastroEntity>("itens");
  const institutionalQueryActive = useMemo(() => {
    const query =
      typeof window !== "undefined"
        ? window.location.search.replace(/^\?/, "")
        : (location.split("?")[1] ?? "");
    return new URLSearchParams(query).get("institucionais") === "1";
  }, [location]);
  const [showInstitucionais, setShowInstitucionais] = useState(
    institutionalQueryActive,
  );
  const isInstitutionalMode = showInstitucionais || institutionalQueryActive;
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"" | "ativo" | "inativo">("");
  const [secretariaId, setSecretariaId] = useState("");
  const [secretariaFilterOption, setSecretariaFilterOption] = useState<LookupOption | null>(null);
  const [role, setRole] = useState("");
  const [cidade, setCidade] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [winnerBackfillPage, setWinnerBackfillPage] = useState(1);
  const [winnerBackfillOnlyWithSuggestion, setWinnerBackfillOnlyWithSuggestion] = useState(false);
  const [winnerLinkModal, setWinnerLinkModal] = useState<WinnerLinkModalState>(null);
  const [winnerLinkFornecedorSearch, setWinnerLinkFornecedorSearch] = useState("");
  const [winnerLinkFornecedorId, setWinnerLinkFornecedorId] = useState("");
  const [winnerLinkReason, setWinnerLinkReason] = useState(
    "Confirmação manual pela fila auditável de vencedores importados.",
  );
  const [winnerLinkSelectedIds, setWinnerLinkSelectedIds] = useState<number[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [formState, setFormState] = useState<FormState>(() => getDefaultForm("itens"));
  const identityLookupSequenceRef = useRef(0);
  const [formErrors, setFormErrors] = useState<CadastroFormErrors>({});
  const [editingId, setEditingId] = useState<number | null>(null);
  const [selectedRecordId, setSelectedRecordId] = useState<number | null>(null);
  const [selectedRowsById, setSelectedRowsById] = useState<Record<number, Record<string, any>>>({});
  const [auditDetail, setAuditDetail] = useState<AuditEntry | null>(null);
  const [auditActionFilter, setAuditActionFilter] = useState<"" | "CREATE" | "UPDATE" | "DELETE">("");
  const [auditSearch, setAuditSearch] = useState("");
  const [auditFieldFilter, setAuditFieldFilter] = useState("");
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportScope, setExportScope] = useState<ExportScope>("page");
  const [exportFormat, setExportFormat] = useState<ExportFormat>("xlsx");
  const [assetFile, setAssetFile] = useState<File | null>(null);
  const [assetPreviewUrl, setAssetPreviewUrl] = useState<string | null>(null);
  const [assetCrop, setAssetCrop] = useState<CropState>(cropDefaults);
  const [assetProcessing, setAssetProcessing] = useState(false);
  const [assetError, setAssetError] = useState<string | null>(null);
  const [identityLookupLoading, setIdentityLookupLoading] = useState(false);
  const [mergeItemSourceRow, setMergeItemSourceRow] = useState<Record<string, any> | null>(null);
  const [mergeItemTargetId, setMergeItemTargetId] = useState("");
  const [mergeItemSearch, setMergeItemSearch] = useState("");
  const [mergeSourceRow, setMergeSourceRow] = useState<Record<string, any> | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [mergeSearch, setMergeSearch] = useState("");
  const [mergePessoaSourceRow, setMergePessoaSourceRow] = useState<Record<string, any> | null>(null);
  const [mergePessoaTargetId, setMergePessoaTargetId] = useState("");
  const [mergePessoaSearch, setMergePessoaSearch] = useState("");
  const [bulkMergeTargetId, setBulkMergeTargetId] = useState("");
  const [bulkMergeModalOpen, setBulkMergeModalOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search.trim());
  const deferredAuditSearch = useDeferredValue(auditSearch.trim());
  const currentRole = meQuery.data?.user.role;
  const isAdmin = currentRole === "admin";
  const canManageCadastros = isAdmin || currentRole === "gestor";
  const canAuditCadastros = canManageCadastros || currentRole === "auditor";
  const canAccessEntity = isAdmin || (entity !== "usuarios" && entity !== "parametros");
  const visibleEntityMeta = useMemo(
    () => entityMeta.filter((item) => isAdmin || (item.key !== "usuarios" && item.key !== "parametros")),
    [isAdmin],
  );

  useEffect(() => {
    setShowInstitucionais(institutionalQueryActive);
  }, [institutionalQueryActive]);

  useEffect(() => {
    if (meQuery.isLoading || canAccessEntity) {
      return;
    }
    setEntity("itens");
    setSelectedRecordId(null);
    setSelectedRowsById({});
    setModalOpen(false);
    setExportModalOpen(false);
  }, [canAccessEntity, meQuery.isLoading]);

  useEffect(() => {
    if (!isInstitutionalMode) {
      return;
    }

    setSelectedRecordId(null);
    setSelectedRowsById({});
    setAuditDetail(null);
    setAuditActionFilter("");
    setAuditSearch("");
    setAuditFieldFilter("");
    setModalOpen(false);
    setExportModalOpen(false);
    setFeedback(null);
    setError(null);
  }, [isInstitutionalMode]);

  const optionsQuery = trpc.cadastros.formOptions.useQuery(undefined, {
    enabled: !isInstitutionalMode,
    retry: false,
  });
  const summaryQuery = trpc.cadastros.summary.useQuery(
    { entity },
    { enabled: !isInstitutionalMode && canAccessEntity, retry: false },
  );

  const listInput = useMemo(() => ({
      entity,
      search: deferredSearch || undefined,
      status: status || undefined,
      secretariaId: secretariaId ? Number(secretariaId) : undefined,
      role: role ? (role as any) : undefined,
      cidade: cidade.trim() || undefined,
      page,
      pageSize,
    }), [cidade, deferredSearch, entity, page, pageSize, role, secretariaId, status]);
  const listQuery = trpc.cadastros.list.useQuery(
    listInput,
    {
      enabled: !isInstitutionalMode && canAccessEntity,
      retry: false,
      placeholderData: (previous) => previous,
    },
  );

  const getByIdQuery = trpc.cadastros.getById.useQuery(
    { entity, id: editingId ?? -1 },
    {
      enabled: !isInstitutionalMode && canAccessEntity && canManageCadastros && modalOpen && Boolean(editingId),
      retry: false,
      staleTime: 0,
      refetchOnMount: "always",
    },
  );

  const formIdentitySearch = String(
    entity === "usuarios" ? formState.name ?? "" : formState.nome ?? "",
  ).trim();
  const deferredFormIdentitySearch = useDeferredValue(formIdentitySearch);
  const formCpfSearch = String(formState.cpf ?? "").replace(/\D/g, "");
  const formMatriculaSearch = String(formState.matricula ?? "").trim();
  const deferredFormCpfSearch = useDeferredValue(formCpfSearch);
  const deferredFormMatriculaSearch = useDeferredValue(formMatriculaSearch);
  const preferredIdentitySecretariaId = formState.secretariaId
    ? Number(formState.secretariaId)
    : undefined;
  const possibleDuplicatesQuery = trpc.cadastros.lookup.useQuery(
    {
      entity: "pessoas",
      search: deferredFormIdentitySearch || undefined,
      page: 1,
      pageSize: 5,
      excludeIds: [
        entity === "usuarios"
          ? Number(formState.pessoaId)
          : editingId ?? Number(formState.id),
      ].filter(
        (id): id is number => Number.isInteger(id) && id > 0,
      ),
      preferSecretariaId: preferredIdentitySecretariaId,
      activeOnly: true,
    },
    {
      enabled:
        modalOpen &&
        (entity === "pessoas" || entity === "servidores" || entity === "usuarios") &&
        deferredFormIdentitySearch.length >= 3,
      retry: false,
    },
  );
  const possibleCpfDuplicatesQuery = trpc.cadastros.lookup.useQuery(
    {
      entity: "pessoas",
      search: deferredFormCpfSearch || undefined,
      page: 1,
      pageSize: 5,
      excludeIds: [editingId ?? Number(formState.id)].filter(
        (id): id is number => Number.isInteger(id) && id > 0,
      ),
      preferSecretariaId: preferredIdentitySecretariaId,
      activeOnly: true,
    },
    {
      enabled:
        modalOpen &&
        (entity === "pessoas" || entity === "servidores") &&
        deferredFormCpfSearch.length === 11,
      retry: false,
    },
  );
  const possibleMatriculaDuplicatesQuery = trpc.cadastros.lookup.useQuery(
    {
      entity: "pessoas",
      search: deferredFormMatriculaSearch || undefined,
      page: 1,
      pageSize: 5,
      excludeIds: [editingId ?? Number(formState.id)].filter(
        (id): id is number => Number.isInteger(id) && id > 0,
      ),
      preferSecretariaId: preferredIdentitySecretariaId,
      activeOnly: true,
    },
    {
      enabled:
        modalOpen &&
        (entity === "pessoas" || entity === "servidores") &&
        deferredFormMatriculaSearch.length >= 3,
      retry: false,
    },
  );
  const possibleDuplicatePeople = useMemo(
    () => {
      const unique = new Map<number, LookupOption>();
      for (const item of [
        ...(possibleDuplicatesQuery.data?.items ?? []),
        ...(possibleCpfDuplicatesQuery.data?.items ?? []),
        ...(possibleMatriculaDuplicatesQuery.data?.items ?? []),
      ]) {
        const option = normalizeLookupOption(item as Record<string, any>);
        unique.set(option.id, option);
      }
      return [...unique.values()];
    },
    [
      possibleDuplicatesQuery.data?.items,
      possibleCpfDuplicatesQuery.data?.items,
      possibleMatriculaDuplicatesQuery.data?.items,
    ],
  );

  const fetchLookup = useCallback(
    async (
      lookupEntity: "pessoas" | "servidores" | "secretarias" | "cargos" | "funcoes",
      lookupSearch: string,
      limit: number,
      extra?: { secretariaId?: number; preferSecretariaId?: number; excludeIds?: number[] },
    ) => {
      const result = await utils.client.cadastros.lookup.query({
        entity: lookupEntity,
        search: lookupSearch || undefined,
        page: 1,
        pageSize: limit,
        activeOnly: true,
        ...extra,
      });
      return result.items.map((item) => normalizeLookupOption(item as Record<string, any>));
    },
    [utils.client.cadastros.lookup],
  );
  const queryPessoas = useCallback(
    (lookupSearch: string, limit: number) =>
      fetchLookup("pessoas", lookupSearch, limit, {
        preferSecretariaId: preferredIdentitySecretariaId,
      }),
    [fetchLookup, preferredIdentitySecretariaId],
  );
  const querySecretarias = useCallback(
    (lookupSearch: string, limit: number) => fetchLookup("secretarias", lookupSearch, limit),
    [fetchLookup],
  );
  const queryCargos = useCallback(
    (lookupSearch: string, limit: number) => fetchLookup("cargos", lookupSearch, limit),
    [fetchLookup],
  );
  const queryFuncoes = useCallback(
    (lookupSearch: string, limit: number) => fetchLookup("funcoes", lookupSearch, limit),
    [fetchLookup],
  );
  const queryResponsaveis = useCallback(
    (lookupSearch: string, limit: number) =>
      fetchLookup("servidores", lookupSearch, limit, {
        secretariaId: formState.secretariaId ? Number(formState.secretariaId) : undefined,
      }),
    [fetchLookup, formState.secretariaId],
  );

  const rows = (listQuery.data?.items ?? []) as Array<Record<string, any>>;
  const totalPages = listQuery.data?.totalPages ?? 1;
  const meta = getEntityMeta(entity);
  const supportsMergeEntity =
    entity === "itens" || entity === "fornecedores" || entity === "pessoas" || entity === "servidores";
  const supportsFornecedorWinnerBackfill = entity === "fornecedores";
  const dedupeEntity = supportsMergeEntity ? entity : "fornecedores";
  const dedupeSuggestionsQuery = trpc.cadastros.dedupeSuggestions.useQuery(
    {
      entity: dedupeEntity as "itens" | "fornecedores" | "pessoas" | "servidores",
      search: deferredSearch || undefined,
      status: status || undefined,
      secretariaId: secretariaId ? Number(secretariaId) : undefined,
      cidade: cidade.trim() || undefined,
      limit: 12,
    },
    {
      enabled: !isInstitutionalMode && canManageCadastros && supportsMergeEntity,
      retry: false,
      placeholderData: (previous) => previous,
    },
  );
  const dedupeSuggestions = (dedupeSuggestionsQuery.data?.suggestions ?? []) as DedupeSuggestion[];
  const fornecedorWinnerBackfillQuery = trpc.cadastros.fornecedorVencedorBackfillPreview.useQuery(
    {
      search: deferredSearch || undefined,
      onlyWithSuggestion: winnerBackfillOnlyWithSuggestion,
      page: winnerBackfillPage,
      pageSize: 8,
    },
    {
      enabled: !isInstitutionalMode && canManageCadastros && supportsFornecedorWinnerBackfill,
      retry: false,
      placeholderData: (previous) => previous,
    },
  );
  const fornecedorWinnerBackfillRows = (fornecedorWinnerBackfillQuery.data?.items ??
    []) as FornecedorWinnerBackfillRow[];
  const processWinnerBackfillQuery = trpc.cadastros.fornecedorVencedorBackfillPreview.useQuery(
    {
      processoId: winnerLinkModal?.mode === "process" ? winnerLinkModal.processoId : undefined,
      page: 1,
      pageSize: 100,
    },
    {
      enabled: !isInstitutionalMode && isAdmin && winnerLinkModal?.mode === "process",
      retry: false,
      placeholderData: (previous) => previous,
    },
  );
  const processWinnerBackfillRows = (processWinnerBackfillQuery.data?.items ??
    []) as FornecedorWinnerBackfillRow[];
  const selectedRows = useMemo(() => Object.values(selectedRowsById), [selectedRowsById]);
  const selectedIds = useMemo(() => selectedRows.map((row) => Number(row.id)), [selectedRows]);
  const allVisibleSelected = rows.length > 0 && rows.every((row) => Boolean(selectedRowsById[row.id]));
  const selectedRecord = useMemo(
    () => rows.find((row) => row.id === selectedRecordId) ?? selectedRowsById[selectedRecordId ?? -1] ?? null,
    [rows, selectedRecordId, selectedRowsById],
  );
  const mergeFornecedorLookupQuery = trpc.cadastros.lookup.useQuery(
    { entity: "fornecedores", search: mergeSearch || undefined, page: 1, pageSize: 50, excludeIds: mergeSourceRow ? [mergeSourceRow.id] : undefined, activeOnly: true },
    { enabled: Boolean(mergeSourceRow), retry: false, placeholderData: (previous) => previous },
  );
  const mergeCandidates = useMemo(
    () => (mergeFornecedorLookupQuery.data?.items ?? []).map((item) => {
      const option = normalizeLookupOption(item as Record<string, any>);
      return { ...option, razaoSocial: lookupOptionLabel(option), cnpj: option.cnpj ?? null };
    }),
    [mergeFornecedorLookupQuery.data?.items],
  );
  const selectedMergeTarget = mergeCandidates.find((item) => item.id === Number(mergeTargetId)) ?? null;

  const mergeItemLookupQuery = trpc.cadastros.lookup.useQuery(
    { entity: "itens", search: mergeItemSearch || undefined, page: 1, pageSize: 50, excludeIds: mergeItemSourceRow ? [mergeItemSourceRow.id] : undefined, activeOnly: true },
    { enabled: Boolean(mergeItemSourceRow), retry: false, placeholderData: (previous) => previous },
  );
  const mergeItemCandidates = useMemo(
    () => (mergeItemLookupQuery.data?.items ?? []).map((item) => {
      const option = normalizeLookupOption(item as Record<string, any>);
      return {
        ...option,
        descricao: lookupOptionLabel(option),
        unidadePadrao: option.unidadePadrao ?? option.subtitle ?? "",
        valorReferencia: option.valorReferencia ?? null,
      };
    }),
    [mergeItemLookupQuery.data?.items],
  );
  const selectedMergeItemTarget = mergeItemCandidates.find((item) => item.id === Number(mergeItemTargetId)) ?? null;

  const mergePessoaLookupQuery = trpc.cadastros.lookup.useQuery(
    { entity: entity === "servidores" ? "servidores" : "pessoas", search: mergePessoaSearch || undefined, page: 1, pageSize: 50, excludeIds: mergePessoaSourceRow ? [mergePessoaSourceRow.id] : undefined, activeOnly: true },
    { enabled: Boolean(mergePessoaSourceRow), retry: false, placeholderData: (previous) => previous },
  );
  const mergePessoaCandidates = useMemo(
    () => (mergePessoaLookupQuery.data?.items ?? []).map((item) => {
      const option = normalizeLookupOption(item as Record<string, any>);
      return { ...option, nome: lookupOptionLabel(option), cpf: option.cpfMascarado ?? null, cargo: option.cargoNome ?? null };
    }),
    [mergePessoaLookupQuery.data?.items],
  );
  const selectedMergePessoaTarget = mergePessoaCandidates.find((item) => item.id === Number(mergePessoaTargetId)) ?? null;
  const bulkMergeCandidates = useMemo(
    () =>
      selectedRows
        .filter((row) =>
          entity === "servidores" ? Boolean(row.secretariaId) : true,
        )
        .sort((left, right) =>
          getRowLabel(entity, left).localeCompare(getRowLabel(entity, right), "pt-BR"),
        ),
    [entity, selectedRows],
  );
  const selectedBulkMergeTarget = useMemo(
    () =>
      bulkMergeCandidates.find((row) => row.id === Number(bulkMergeTargetId)) ?? null,
    [bulkMergeCandidates, bulkMergeTargetId],
  );
  const winnerFornecedorLookupQuery = trpc.cadastros.lookup.useQuery(
    { entity: "fornecedores", search: winnerLinkFornecedorSearch || undefined, page: 1, pageSize: 40, activeOnly: true },
    { enabled: Boolean(winnerLinkModal), retry: false, placeholderData: (previous) => previous },
  );
  const winnerLinkFornecedorCandidates = useMemo(
    () => (winnerFornecedorLookupQuery.data?.items ?? []).map((item) => {
      const option = normalizeLookupOption(item as Record<string, any>);
      return { ...option, razaoSocial: lookupOptionLabel(option), cnpj: option.cnpj ?? null };
    }),
    [winnerFornecedorLookupQuery.data?.items],
  );
  const winnerLinkSelectedFornecedor = winnerLinkFornecedorCandidates.find((item) => item.id === Number(winnerLinkFornecedorId)) ?? null;

  const historyQuery = trpc.cadastros.history.useQuery(
    {
      entity,
      id: selectedRecordId ?? -1,
      action: auditActionFilter || undefined,
      search: deferredAuditSearch || undefined,
      page: 1,
      pageSize: 8,
    },
    {
      retry: false,
      enabled: !isInstitutionalMode && canAuditCadastros && Boolean(selectedRecordId),
    },
  );

  const historyRows = useMemo(() => {
    const items = (historyQuery.data?.items ?? []) as AuditEntry[];
    const normalizedFieldFilter = auditFieldFilter.trim().toLowerCase();
    if (!normalizedFieldFilter) {
      return items;
    }

    return items.filter((entry) =>
      listChangedFields(entry).some((field) => field.toLowerCase().includes(normalizedFieldFilter)),
    );
  }, [auditFieldFilter, historyQuery.data?.items]);

  const saveMutation = trpc.cadastros.save.useMutation({
    onError: (mutationError) => {
      setFeedback(null);
      setError(mutationError.message);
    },
  });

  const removeMutation = trpc.cadastros.remove.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.cadastros.list.invalidate(),
        utils.cadastros.summary.invalidate(),
        utils.cadastros.formOptions.invalidate(),
        utils.cadastros.lookup.invalidate(),
        utils.cadastros.history.invalidate(),
        utils.cadastros.dedupeSuggestions.invalidate(),
        utils.cadastros.fornecedorVencedorBackfillPreview.invalidate(),
      ]);
      setError(null);
      setFeedback("Registro inativado com sucesso.");
    },
    onError: (mutationError) => {
      setFeedback(null);
      setError(mutationError.message);
    },
  });

  const bulkStatusMutation = trpc.cadastros.bulkSetStatus.useMutation({
    onSuccess: async (result, variables) => {
      await Promise.all([
        utils.cadastros.list.invalidate(),
        utils.cadastros.summary.invalidate(),
        utils.cadastros.formOptions.invalidate(),
        utils.cadastros.lookup.invalidate(),
        selectedRecordId ? utils.cadastros.history.invalidate() : Promise.resolve(),
        utils.cadastros.dedupeSuggestions.invalidate(),
        utils.cadastros.fornecedorVencedorBackfillPreview.invalidate(),
      ]);
      setSelectedRowsById({});
      setFeedback(`${result.updated} registro(s) ${variables.ativo ? "reativados" : "inativados"} em lote.`);
      setError(null);
    },
    onError: (mutationError) => {
      setFeedback(null);
      setError(mutationError.message);
    },
  });

  const mergeFornecedoresMutation = trpc.cadastros.mergeFornecedores.useMutation({
    onError: (mutationError) => {
      setFeedback(null);
      setError(mutationError.message);
    },
  });
  const mergePessoasMutation = trpc.cadastros.mergePessoas.useMutation({
    onError: (mutationError) => {
      setFeedback(null);
      setError(mutationError.message);
    },
  });
  const bulkMergeCadastrosMutation = trpc.cadastros.bulkMergeCadastros.useMutation({
    onError: (mutationError) => {
      setFeedback(null);
      setError(mutationError.message);
    },
  });
  const runFornecedorWinnerBackfillMutation = trpc.cadastros.runFornecedorVencedorBackfill.useMutation({
    onError: (mutationError) => {
      setFeedback(null);
      setError(mutationError.message);
    },
  });
  const confirmFornecedorWinnerBackfillMutation = trpc.cadastros.confirmFornecedorVencedorBackfillLink.useMutation({
    onError: (mutationError) => {
      setFeedback(null);
      setError(mutationError.message);
    },
  });
  const confirmFornecedorWinnerBackfillBatchMutation = trpc.cadastros.confirmFornecedorVencedorBackfillLinksBatch.useMutation({
    onError: (mutationError) => {
      setFeedback(null);
      setError(mutationError.message);
    },
  });

  useEffect(() => {
    if (!editingId || !getByIdQuery.data) return;
    const canonicalRecord = ((getByIdQuery.data as any).record ?? getByIdQuery.data) as Record<string, any>;
    if (Number(canonicalRecord.id) !== editingId) return;

    setFormState(mapRowToForm(entity, canonicalRecord));
    setAssetPreviewUrl(
      resolveCadastroAssetUrl(
        entity === "itens"
          ? canonicalRecord.imagemUrl
          : entity === "fornecedores"
            ? canonicalRecord.logoUrl
            : null,
      ),
    );
  }, [editingId, entity, getByIdQuery.data]);

  useEffect(() => {
    setPage(1);
    setSearch("");
    setStatus("");
    setSecretariaId("");
    setSecretariaFilterOption(null);
    setRole("");
    setCidade("");
    setEditingId(null);
    setSelectedRecordId(null);
    setSelectedRowsById({});
    setWinnerBackfillPage(1);
    setWinnerBackfillOnlyWithSuggestion(false);
    setWinnerLinkModal(null);
    setWinnerLinkFornecedorSearch("");
    setWinnerLinkFornecedorId("");
    setWinnerLinkReason("Confirmação manual pela fila auditável de vencedores importados.");
    setWinnerLinkSelectedIds([]);
    setAuditDetail(null);
    setAuditActionFilter("");
    setAuditSearch("");
    setAuditFieldFilter("");
    setModalOpen(false);
    setFormState(getDefaultForm(entity));
    setFormErrors({});
    setAssetFile(null);
    setAssetPreviewUrl(null);
    setAssetCrop(cropDefaults);
    setAssetProcessing(false);
    setAssetError(null);
    setIdentityLookupLoading(false);
    setMergeItemSourceRow(null);
    setMergeItemTargetId("");
    setMergeItemSearch("");
    setMergeSourceRow(null);
    setMergeTargetId("");
    setMergeSearch("");
    setMergePessoaSourceRow(null);
    setMergePessoaTargetId("");
    setMergePessoaSearch("");
    setBulkMergeTargetId("");
    setBulkMergeModalOpen(false);
    setFeedback(null);
    setError(null);
  }, [entity]);

  useEffect(() => {
    setWinnerBackfillPage(1);
  }, [deferredSearch]);

  useEffect(() => {
    setWinnerBackfillPage(1);
  }, [winnerBackfillOnlyWithSuggestion]);

  useEffect(() => {
    if (winnerLinkModal?.mode !== "process") {
      return;
    }
    setWinnerLinkSelectedIds(processWinnerBackfillRows.map((row) => row.id));
  }, [processWinnerBackfillRows, winnerLinkModal]);

  useEffect(() => {
    if (!assetFile || (entity !== "itens" && entity !== "fornecedores")) {
      return;
    }

    let active = true;
    setAssetProcessing(true);
    setAssetError(null);

    buildCadastroCropPreview(assetFile, getCropOptions(entity, assetCrop))
      .then((previewUrl) => {
        if (!active) return;
        setAssetPreviewUrl(previewUrl);
      })
      .catch(() => {
        if (!active) return;
        setAssetError("Não foi possível gerar a pré-visualização da imagem.");
      })
      .finally(() => {
        if (!active) return;
        setAssetProcessing(false);
      });

    return () => {
      active = false;
    };
  }, [assetFile, assetCrop, entity]);

  useEffect(() => {
    setAuditActionFilter("");
    setAuditSearch("");
    setAuditFieldFilter("");
  }, [entity, selectedRecordId]);

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "n") {
        event.preventDefault();
        openCreateModal();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    }

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [modalOpen, entity]);

  function closeModal() {
    setModalOpen(false);
    setEditingId(null);
    setFormState(getDefaultForm(entity));
    setFormErrors({});
    setAssetFile(null);
    setAssetPreviewUrl(null);
    setAssetCrop(cropDefaults);
    setAssetError(null);
    setIdentityLookupLoading(false);
  }

  function openCreateModal() {
    setEditingId(null);
    setFormState(getDefaultForm(entity));
    setFormErrors({});
    setAssetFile(null);
    setAssetPreviewUrl(null);
    setAssetCrop(cropDefaults);
    setAssetError(null);
    setIdentityLookupLoading(false);
    setModalOpen(true);
    setFeedback(null);
    setError(null);
  }

  function openEditModal(row: Record<string, any>) {
    setEditingId(row.id);
    // A linha serve apenas como contexto provisório; getById é a fonte final.
    setFormState(getDefaultForm(entity));
    setFormErrors({});
    setAssetFile(null);
    setAssetPreviewUrl(resolveCadastroAssetUrl(entity === "itens" ? row.imagemUrl : entity === "fornecedores" ? row.logoUrl : null));
    setAssetCrop(cropDefaults);
    setAssetError(null);
    setIdentityLookupLoading(false);
    setModalOpen(true);
    setFeedback(null);
    setError(null);
  }

  function openDuplicateModal(row: Record<string, any>) {
    if (entity !== "itens" && entity !== "fornecedores") {
      return;
    }

    const duplicated = mapRowToForm(entity, row);
    delete duplicated.id;

    if (entity === "itens") {
      duplicated.descricao = `${duplicated.descricao ?? ""} (cópia)`.trim();
    }

    if (entity === "fornecedores") {
      duplicated.razaoSocial = `${duplicated.razaoSocial ?? ""} - cópia`.trim();
      duplicated.cnpj = "";
    }

    setEditingId(null);
    setFormState(duplicated);
    setFormErrors({});
    setAssetFile(null);
    setAssetPreviewUrl(null);
    setAssetCrop(cropDefaults);
    setAssetError(null);
    setModalOpen(true);
    setFeedback(
      entity === "itens"
        ? "Duplicação rápida aberta. Revise a descrição e demais campos antes de salvar."
        : "Duplicação rápida aberta. Revise razão social, CNPJ e demais campos antes de salvar.",
    );
    setError(null);
  }

  function closeMergeItemModal() {
    setMergeItemSourceRow(null);
    setMergeItemTargetId("");
    setMergeItemSearch("");
  }

  function openMergeItemModal(row: Record<string, any>) {
    if (entity !== "itens") {
      return;
    }

    setMergeItemSourceRow(row);
    setMergeItemTargetId("");
    setMergeItemSearch(row.nome ?? "");
    setFeedback(null);
    setError(null);
  }

  function closeMergeModal() {
    setMergeSourceRow(null);
    setMergeTargetId("");
    setMergeSearch("");
  }

  function openMergeModal(row: Record<string, any>) {
    if (entity !== "fornecedores") {
      return;
    }

    setMergeSourceRow(row);
    setMergeTargetId("");
    setMergeSearch(row.razaoSocial ?? "");
    setFeedback(null);
    setError(null);
  }

  function closeMergePessoaModal() {
    setMergePessoaSourceRow(null);
    setMergePessoaTargetId("");
    setMergePessoaSearch("");
  }

  function openMergePessoaModal(row: Record<string, any>) {
    if (entity !== "pessoas" && entity !== "servidores") {
      return;
    }

    setMergePessoaSourceRow(row);
    setMergePessoaTargetId("");
    setMergePessoaSearch(row.nome ?? "");
    setFeedback(null);
    setError(null);
  }

  function closeBulkMergeModal() {
    setBulkMergeModalOpen(false);
    setBulkMergeTargetId("");
  }

  function openBulkMergeModal() {
    if (!supportsMergeEntity || selectedIds.length < 2) {
      return;
    }

    setBulkMergeTargetId("");
    setBulkMergeModalOpen(true);
    setFeedback(null);
    setError(null);
  }

  async function handleDelete(row: Record<string, any>) {
    const label = getRowLabel(entity, row);

    if (!window.confirm(`Deseja inativar este registro?\n\n${label}`)) return;
    await removeMutation.mutateAsync({ entity, id: row.id });
  }

  async function handleMergeFornecedores() {
    if (!mergeSourceRow || !mergeTargetId) {
      setError("Selecione o fornecedor que deve permanecer no cadastro.");
      return;
    }

    const sourceLabel = mergeSourceRow.razaoSocial ?? `Fornecedor ${mergeSourceRow.id}`;
    const targetLabel = selectedMergeTarget?.razaoSocial ?? `Fornecedor ${mergeTargetId}`;

    if (!window.confirm(
      `Unificar os cadastros abaixo?\n\nDuplicado: ${sourceLabel}\nManter: ${targetLabel}\n\nTodos os vínculos do cadastro duplicado serão transferidos para o fornecedor mantido.`,
    )) {
      return;
    }

    const result = await mergeFornecedoresMutation.mutateAsync({
      sourceId: Number(mergeSourceRow.id),
      targetId: Number(mergeTargetId),
    });

    await Promise.all([
      utils.cadastros.list.invalidate(),
      utils.cadastros.summary.invalidate(),
      utils.cadastros.getById.invalidate(),
      utils.cadastros.formOptions.invalidate(),
      utils.cadastros.lookup.invalidate(),
      utils.cadastros.history.invalidate(),
      utils.cadastros.dedupeSuggestions.invalidate(),
      utils.cadastros.fornecedorVencedorBackfillPreview.invalidate(),
      utils.auth.me.invalidate(),
    ]);

    setSelectedRowsById((current) => {
      const next = { ...current };
      delete next[Number(mergeSourceRow.id)];
      return next;
    });
    setSelectedRecordId(result.fornecedorMantido.id);
    closeMergeModal();
    setError(null);
    setFeedback(
      `Fornecedores unificados. ${result.summary.contratosAtualizados} contrato(s), ${result.summary.cotacoesAtualizadas} cotação(ões) e ${result.summary.licitantesRemapeados + result.summary.licitantesMesclados} vínculo(s) em licitações foram preservados.`,
    );
  }

  async function handleMergeItens() {
    if (!mergeItemSourceRow || !mergeItemTargetId) {
      setError("Selecione o item que deve permanecer no catálogo.");
      return;
    }

    const sourceLabel = mergeItemSourceRow.nome ?? `Item ${mergeItemSourceRow.id}`;
    const targetLabel = selectedMergeItemTarget?.descricao ?? `Item ${mergeItemTargetId}`;

    if (!window.confirm(
      `Unificar os itens abaixo?\n\nDuplicado: ${sourceLabel}\nManter: ${targetLabel}\n\nOs vínculos em processos, contratos e catálogos importados serão transferidos para o item mantido.`,
    )) {
      return;
    }

    const result = await bulkMergeCadastrosMutation.mutateAsync({
      entity: "itens",
      targetId: Number(mergeItemTargetId),
      sourceIds: [Number(mergeItemSourceRow.id)],
    });

    await Promise.all([
      utils.cadastros.list.invalidate(),
      utils.cadastros.summary.invalidate(),
      utils.cadastros.getById.invalidate(),
      utils.cadastros.formOptions.invalidate(),
      utils.cadastros.lookup.invalidate(),
      utils.cadastros.history.invalidate(),
      utils.cadastros.dedupeSuggestions.invalidate(),
      utils.cadastros.fornecedorVencedorBackfillPreview.invalidate(),
      utils.auth.me.invalidate(),
    ]);

    setSelectedRowsById((current) => {
      const next = { ...current };
      delete next[Number(mergeItemSourceRow.id)];
      return next;
    });
    setSelectedRecordId(Number(result.registroMantido?.id ?? mergeItemTargetId));
    closeMergeItemModal();
    setError(null);
    applyBulkMergeFeedback(result, "manualmente");
  }

  async function handleMergePessoas() {
    if (!mergePessoaSourceRow || !mergePessoaTargetId) {
      setError(entity === "servidores"
        ? "Selecione o servidor que deve permanecer no cadastro."
        : "Selecione a pessoa que deve permanecer no cadastro.");
      return;
    }

    const sourceLabel = mergePessoaSourceRow.nome ?? `Pessoa ${mergePessoaSourceRow.id}`;
    const targetLabel = selectedMergePessoaTarget?.nome ?? `Pessoa ${mergePessoaTargetId}`;

    if (!window.confirm(
      `Unificar os cadastros abaixo?\n\nDuplicado: ${sourceLabel}\nManter: ${targetLabel}\n\nTodos os vínculos do cadastro duplicado serão transferidos para o registro mantido.`,
    )) {
      return;
    }

    const result = await mergePessoasMutation.mutateAsync({
      sourceId: Number(mergePessoaSourceRow.id),
      targetId: Number(mergePessoaTargetId),
    });

    await Promise.all([
      utils.cadastros.list.invalidate(),
      utils.cadastros.summary.invalidate(),
      utils.cadastros.getById.invalidate(),
      utils.cadastros.formOptions.invalidate(),
      utils.cadastros.lookup.invalidate(),
      utils.cadastros.history.invalidate(),
      utils.cadastros.dedupeSuggestions.invalidate(),
      utils.cadastros.fornecedorVencedorBackfillPreview.invalidate(),
      utils.auth.me.invalidate(),
    ]);

    setSelectedRowsById((current) => {
      const next = { ...current };
      delete next[Number(mergePessoaSourceRow.id)];
      return next;
    });
    setSelectedRecordId(result.pessoaMantida.id);
    closeMergePessoaModal();
    setError(null);
    setFeedback(
      `${entity === "servidores" ? "Servidores" : "Pessoas"} unificados. ${result.summary.departamentosAtualizados} departamento(s), ${result.summary.processosAutoridadeAtualizados + result.summary.processosCondutorAtualizados} vínculo(s) em processos e ${result.summary.dfdResponsaveisRemapeados + result.summary.dfdResponsaveisMesclados} vínculo(s) em DFD foram preservados.`,
    );
  }

  function applyBulkMergeFeedback(result: any, contextLabel: string) {
    if (entity === "itens") {
      const itemSummary = result.summary as {
        processosAtualizados: number;
        contratoItensRemapeados: number;
        contratoItensMesclados: number;
        importacaoItensAtualizados: number;
      };
      setFeedback(
        `${result.registrosUnificados} item(ns) unificados ${contextLabel}. ${itemSummary.processosAtualizados} vínculo(s) em processos, ${itemSummary.contratoItensRemapeados + itemSummary.contratoItensMesclados} vínculo(s) contratuais e ${itemSummary.importacaoItensAtualizados} referência(s) importadas foram preservados.`,
      );
      return;
    }

    if (entity === "fornecedores") {
      const fornecedorSummary = result.summary as {
        contratosAtualizados: number;
        cotacoesAtualizadas: number;
        licitantesRemapeados: number;
        licitantesMesclados: number;
      };
      setFeedback(
        `${result.registrosUnificados} fornecedor(es) unificados ${contextLabel}. ${fornecedorSummary.contratosAtualizados} contrato(s), ${fornecedorSummary.cotacoesAtualizadas} cotação(ões) e ${fornecedorSummary.licitantesRemapeados + fornecedorSummary.licitantesMesclados} vínculo(s) em licitações foram preservados.`,
      );
      return;
    }

    const pessoaSummary = result.summary as {
      departamentosAtualizados: number;
      processosAutoridadeAtualizados: number;
      processosCondutorAtualizados: number;
      dfdResponsaveisRemapeados: number;
      dfdResponsaveisMesclados: number;
    };
    setFeedback(
      `${result.registrosUnificados} ${entity === "servidores" ? "servidor(es)" : "pessoa(s)"} unificados ${contextLabel}. ${pessoaSummary.departamentosAtualizados} departamento(s), ${pessoaSummary.processosAutoridadeAtualizados + pessoaSummary.processosCondutorAtualizados} vínculo(s) em processos e ${pessoaSummary.dfdResponsaveisRemapeados + pessoaSummary.dfdResponsaveisMesclados} vínculo(s) em DFD foram preservados.`,
    );
  }

  function closeWinnerLinkModal() {
    setWinnerLinkModal(null);
    setWinnerLinkFornecedorSearch("");
    setWinnerLinkFornecedorId("");
    setWinnerLinkReason("Confirmação manual pela fila auditável de vencedores importados.");
    setWinnerLinkSelectedIds([]);
  }

  function openWinnerLinkModal(row: FornecedorWinnerBackfillRow) {
    setWinnerLinkModal({ mode: "single", row });
    setWinnerLinkFornecedorSearch(row.fornecedorSugeridoNome ?? row.fornecedorVencedorNome ?? "");
    setWinnerLinkFornecedorId(row.fornecedorSugeridoId ? String(row.fornecedorSugeridoId) : "");
    setWinnerLinkReason("Confirmação manual pela fila auditável de vencedores importados.");
    setWinnerLinkSelectedIds([row.id]);
    setFeedback(null);
    setError(null);
  }

  function openWinnerLinkProcessModal(row: FornecedorWinnerBackfillRow) {
    setWinnerLinkModal({
      mode: "process",
      processoId: row.processoId,
      numeroSirel: row.numeroSirel,
      seedRow: row,
    });
    setWinnerLinkFornecedorSearch(row.fornecedorSugeridoNome ?? row.fornecedorVencedorNome ?? "");
    setWinnerLinkFornecedorId(row.fornecedorSugeridoId ? String(row.fornecedorSugeridoId) : "");
    setWinnerLinkReason("Confirmação manual em lote pela fila auditável de vencedores importados.");
    setWinnerLinkSelectedIds([]);
    setFeedback(null);
    setError(null);
  }

  function toggleWinnerLinkRowSelection(rowId: number) {
    setWinnerLinkSelectedIds((current) =>
      current.includes(rowId)
        ? current.filter((id) => id !== rowId)
        : [...current, rowId],
    );
  }

  async function handleApplyDedupeSuggestion(suggestion: DedupeSuggestion) {
    if (!supportsMergeEntity) {
      return;
    }

    const sourceIds = suggestion.sourceIds.filter((id) => id !== suggestion.suggestedTargetId);
    if (!sourceIds.length) {
      setError("A sugestão selecionada não possui registros absorvidos válidos.");
      return;
    }

    const targetRecord = suggestion.records.find((record) => record.id === suggestion.suggestedTargetId);
    const targetLabel = targetRecord?.label ?? `${meta.singular} ${suggestion.suggestedTargetId}`;
    const reasonText = suggestion.reasonSummary.length
      ? `\nSinais: ${suggestion.reasonSummary.join(", ")}`
      : "";

    if (!window.confirm(
      `Aplicar sugestão automática de deduplicação?\n\nClassificação: ${suggestion.classification} (${suggestion.confidenceScore}%)\nRegistro mantido: ${targetLabel}\nRegistros absorvidos: ${sourceIds.length}${reasonText}\n\nTodos os vínculos dos registros absorvidos serão transferidos para o cadastro mantido.`,
    )) {
      return;
    }

    const result = await bulkMergeCadastrosMutation.mutateAsync({
      entity: entity as "itens" | "fornecedores" | "pessoas" | "servidores",
      targetId: suggestion.suggestedTargetId,
      sourceIds,
    });

    await Promise.all([
      utils.cadastros.list.invalidate(),
      utils.cadastros.summary.invalidate(),
      utils.cadastros.getById.invalidate(),
      utils.cadastros.formOptions.invalidate(),
      utils.cadastros.lookup.invalidate(),
      utils.cadastros.history.invalidate(),
      utils.cadastros.dedupeSuggestions.invalidate(),
      utils.cadastros.fornecedorVencedorBackfillPreview.invalidate(),
      entity === "pessoas" || entity === "servidores"
        ? utils.auth.me.invalidate()
        : Promise.resolve(),
    ]);

    setSelectedRowsById({});
    setSelectedRecordId(Number(result.registroMantido?.id ?? suggestion.suggestedTargetId));
    setError(null);
    applyBulkMergeFeedback(result, "pela sugestão inteligente");
  }

  async function handleBulkMergeCadastros() {
    if (!supportsMergeEntity || !bulkMergeTargetId) {
      setError(
        entity === "itens"
          ? "Selecione o item que deve permanecer no catálogo."
          : entity === "fornecedores"
            ? "Selecione o fornecedor que deve permanecer no cadastro."
            : entity === "servidores"
              ? "Selecione o servidor que deve permanecer no cadastro."
              : "Selecione a pessoa que deve permanecer no cadastro.",
      );
      return;
    }

    const sourceIds = selectedIds.filter((id) => id !== Number(bulkMergeTargetId));
    if (!sourceIds.length) {
      setError("Selecione ao menos um cadastro duplicado além do registro mantido.");
      return;
    }

    const targetLabel = selectedBulkMergeTarget
      ? getRowLabel(entity, selectedBulkMergeTarget)
      : `${meta.singular} ${bulkMergeTargetId}`;
    const selectionLabel =
      entity === "itens"
        ? "itens"
        : entity === "fornecedores"
          ? "fornecedores"
          : entity === "servidores"
            ? "servidores"
            : "cadastros";

    if (!window.confirm(
      `Unificar ${sourceIds.length + 1} ${selectionLabel} selecionados?\n\nRegistro mantido: ${targetLabel}\nRegistros absorvidos: ${sourceIds.length}\n\nTodos os vínculos dos registros absorvidos serão transferidos para o cadastro mantido.`,
    )) {
      return;
    }

    const result = await bulkMergeCadastrosMutation.mutateAsync({
      entity: entity as "itens" | "fornecedores" | "pessoas" | "servidores",
      targetId: Number(bulkMergeTargetId),
      sourceIds,
    });

    await Promise.all([
      utils.cadastros.list.invalidate(),
      utils.cadastros.summary.invalidate(),
      utils.cadastros.getById.invalidate(),
      utils.cadastros.formOptions.invalidate(),
      utils.cadastros.lookup.invalidate(),
      utils.cadastros.history.invalidate(),
      utils.cadastros.dedupeSuggestions.invalidate(),
      utils.cadastros.fornecedorVencedorBackfillPreview.invalidate(),
      entity === "pessoas" || entity === "servidores"
        ? utils.auth.me.invalidate()
        : Promise.resolve(),
    ]);

    setSelectedRowsById({});
    setSelectedRecordId(Number(result.registroMantido?.id ?? bulkMergeTargetId));
    closeBulkMergeModal();
    setError(null);
    applyBulkMergeFeedback(result, "em lote");
  }

  async function handleRunFornecedorWinnerBackfill() {
    if (!supportsFornecedorWinnerBackfill) {
      return;
    }

    const pendingTotal = fornecedorWinnerBackfillQuery.data?.pendingTotal ?? 0;
    const resolvableNow = fornecedorWinnerBackfillQuery.data?.resolvableNow ?? 0;

    if (!window.confirm(
      `Executar o saneamento retroativo de fornecedores vencedores importados?\n\nPendências auditáveis: ${pendingTotal}\nAtualizações automáticas possíveis agora: ${resolvableNow}\n\nA rotina só atualiza vínculos quando encontra correspondência segura e marca a origem como SANEAMENTO_FORNECEDOR.`,
    )) {
      return;
    }

    const result = await runFornecedorWinnerBackfillMutation.mutateAsync({});

    await Promise.all([
      utils.cadastros.list.invalidate(),
      utils.cadastros.summary.invalidate(),
      utils.cadastros.formOptions.invalidate(),
      utils.cadastros.lookup.invalidate(),
      utils.cadastros.history.invalidate(),
      utils.cadastros.dedupeSuggestions.invalidate(),
      utils.cadastros.fornecedorVencedorBackfillPreview.invalidate(),
    ]);

    setWinnerBackfillPage(1);
    setError(null);
    setFeedback(
      result.updated > 0
        ? `Saneamento executado. ${result.updated} vínculo(s) de vencedor foram atualizados, com ${result.nullIdRepairs} preenchimento(s) de ID vazio e ${result.mergedIdRepairs} correção(ões) de ID legado.`
        : "Saneamento executado sem novas atualizações automáticas. As pendências restantes continuam disponíveis para revisão assistida.",
    );
  }

  async function handleConfirmFornecedorWinnerLink(row: FornecedorWinnerBackfillRow) {
    const modalSelectionActive =
      winnerLinkModal?.mode === "single" && winnerLinkModal.row.id === row.id && winnerLinkFornecedorId;
    const supplierId = modalSelectionActive
      ? Number(winnerLinkFornecedorId)
      : row.fornecedorSugeridoId;
    const supplierName = modalSelectionActive
      ? winnerLinkSelectedFornecedor?.razaoSocial ?? null
      : row.fornecedorSugeridoNome;
    const supplierCnpj = modalSelectionActive
      ? winnerLinkSelectedFornecedor?.cnpj ?? null
      : row.fornecedorSugeridoCnpj;

    if (!supplierId || !supplierName) {
      setError("Selecione o fornecedor que deve ser vinculado a este item.");
      return;
    }

    const targetLabel = supplierCnpj
      ? `${supplierName} (${formatCnpj(supplierCnpj)})`
      : supplierName;

    if (!window.confirm(
      `Confirmar manualmente o fornecedor vencedor deste item importado?\n\nProcesso: ${row.numeroSirel}\nItem: ${row.numeroItem}\nVencedor legado: ${row.fornecedorVencedorNome ?? "Sem nome"}\nCadastro a vincular: ${targetLabel}\n\nA alteração será gravada com trilha de auditoria e origem SANEAMENTO_FORNECEDOR_MANUAL.`,
    )) {
      return;
    }

    const result = await confirmFornecedorWinnerBackfillMutation.mutateAsync({
      id: row.id,
      fornecedorId: supplierId,
      reason: winnerLinkReason.trim() || "Confirmação manual pela fila auditável de vencedores importados.",
    });

    await Promise.all([
      utils.cadastros.list.invalidate(),
      utils.cadastros.summary.invalidate(),
      utils.cadastros.formOptions.invalidate(),
      utils.cadastros.lookup.invalidate(),
      utils.cadastros.history.invalidate(),
      utils.cadastros.dedupeSuggestions.invalidate(),
      utils.cadastros.fornecedorVencedorBackfillPreview.invalidate(),
    ]);

    if (modalSelectionActive) {
      closeWinnerLinkModal();
    }
    setError(null);
    setFeedback(
      `Fornecedor vencedor confirmado manualmente no processo ${result.numeroSirel}, item ${result.numeroItem}. Cadastro vinculado: ${result.fornecedorVencedorNome}.`,
    );
  }

  async function handleConfirmFornecedorWinnerBatch() {
    if (winnerLinkModal?.mode !== "process") {
      return;
    }
    if (!winnerLinkFornecedorId) {
      setError("Selecione o fornecedor que deve ser aplicado aos itens escolhidos.");
      return;
    }
    if (!winnerLinkSelectedIds.length) {
      setError("Selecione ao menos um item do processo para aplicar o vínculo manual.");
      return;
    }

    const supplierLabel = winnerLinkSelectedFornecedor
      ? `${winnerLinkSelectedFornecedor.razaoSocial}${winnerLinkSelectedFornecedor.cnpj ? ` (${formatCnpj(winnerLinkSelectedFornecedor.cnpj)})` : ""}`
      : `Fornecedor ${winnerLinkFornecedorId}`;

    if (!window.confirm(
      `Aplicar o fornecedor selecionado em lote?\n\nProcesso: ${winnerLinkModal.numeroSirel}\nItens selecionados: ${winnerLinkSelectedIds.length}\nFornecedor: ${supplierLabel}\n\nTodos os itens escolhidos receberão o mesmo vínculo manual com trilha de auditoria.`,
    )) {
      return;
    }

    const result = await confirmFornecedorWinnerBackfillBatchMutation.mutateAsync({
      ids: winnerLinkSelectedIds,
      fornecedorId: Number(winnerLinkFornecedorId),
      reason: winnerLinkReason.trim() || undefined,
    });

    await Promise.all([
      utils.cadastros.list.invalidate(),
      utils.cadastros.summary.invalidate(),
      utils.cadastros.formOptions.invalidate(),
      utils.cadastros.lookup.invalidate(),
      utils.cadastros.history.invalidate(),
      utils.cadastros.dedupeSuggestions.invalidate(),
      utils.cadastros.fornecedorVencedorBackfillPreview.invalidate(),
    ]);

    closeWinnerLinkModal();
    setError(null);
    setFeedback(
      `Vínculo manual em lote aplicado no processo ${result.numeroSirel}. ${result.updatedCount} item(ns) passaram a apontar para ${result.fornecedorVencedorNome}.`,
    );
  }

  async function handleServidorPessoaSelected(option: LookupOption | null) {
    if (!option) {
      identityLookupSequenceRef.current += 1;
      setIdentityLookupLoading(false);
      setFormState(getDefaultForm("servidores"));
      return;
    }

    const requestId = ++identityLookupSequenceRef.current;
    setIdentityLookupLoading(true);
    setError(null);
    try {
      const pessoa = await utils.client.cadastros.getById.query({ entity: "pessoas", id: option.id });
      if (requestId !== identityLookupSequenceRef.current) return;
      setFormState((current) => applyPessoaToServidorForm(current, pessoa as LookupOption));
    } catch (lookupError) {
      if (requestId !== identityLookupSequenceRef.current) return;
      setError(lookupError instanceof Error ? lookupError.message : "Não foi possível carregar a Pessoa selecionada.");
    } finally {
      if (requestId === identityLookupSequenceRef.current) setIdentityLookupLoading(false);
    }
  }

  async function handleUsuarioPessoaSelected(option: LookupOption | null) {
    const currentPessoaId = formState.pessoaId ? Number(formState.pessoaId) : null;
    const nextPessoaId = option?.id ?? null;
    if (
      currentPessoaId &&
      currentPessoaId !== nextPessoaId &&
      !window.confirm(
        nextPessoaId
          ? "Trocar a Pessoa vinculada? O nome e a secretaria do usuário serão atualizados com os dados da nova identidade."
          : "Remover o vínculo de identidade deste usuário?",
      )
    ) {
      return;
    }

    if (!option) {
      identityLookupSequenceRef.current += 1;
      setIdentityLookupLoading(false);
      setFormState((current) => ({
        ...current,
        pessoaId: "",
        pessoaOption: null,
        identityStatus: "sem_vinculo",
      }));
      return;
    }

    const requestId = ++identityLookupSequenceRef.current;
    setIdentityLookupLoading(true);
    setError(null);
    try {
      const pessoa = await utils.client.cadastros.getById.query({ entity: "pessoas", id: option.id });
      if (requestId !== identityLookupSequenceRef.current) return;
      setFormState((current) => applyPessoaToUsuarioForm(current, pessoa as LookupOption));
    } catch (lookupError) {
      if (requestId !== identityLookupSequenceRef.current) return;
      setError(lookupError instanceof Error ? lookupError.message : "Não foi possível carregar a Pessoa selecionada.");
    } finally {
      if (requestId === identityLookupSequenceRef.current) setIdentityLookupLoading(false);
    }
  }

  async function handlePotentialDuplicateSelected(option: LookupOption) {
    if (entity === "servidores") {
      await handleServidorPessoaSelected(option);
      return;
    }
    if (entity === "usuarios") {
      await handleUsuarioPessoaSelected(option);
      return;
    }
    if (entity === "pessoas") {
      const accepted = window.confirm(
        `Abrir o cadastro existente de ${lookupOptionLabel(option)} para edição e evitar uma duplicidade?`,
      );
      if (!accepted) return;
      setEditingId(option.id);
      setFormState(getDefaultForm("pessoas"));
      setFormErrors({});
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    setError(null);
    const validation = validateCadastroForm(entity, formState, editingId);
    if (!validation.success) {
      setFormErrors(validation.errors);
      setError("Revise os campos obrigatórios antes de salvar.");
      return;
    }

    setFormErrors({});
    try {
      const saved = await saveMutation.mutateAsync({ entity, data: validation.data } as any);
      const savedRecord = ((saved as any).record ?? saved) as Record<string, any>;
      const mismatchFields = persistenceMismatchFields(
        entity,
        validation.data as Record<string, unknown>,
        savedRecord,
      );
      if (mismatchFields.length) {
        throw new Error(
          `A leitura de confirmação não refletiu os campos: ${mismatchFields.join(", ")}. O formulário foi mantido aberto.`,
        );
      }

      if (assetFile && (entity === "itens" || entity === "fornecedores")) {
        const uploadFile = await buildCadastroCroppedFile(assetFile, getCropOptions(entity, assetCrop));
        const uploadResult = await uploadCadastroAsset({
          entity,
          recordId: Number(savedRecord.id),
          arquivo: uploadFile,
        });
        setAssetPreviewUrl(resolveCadastroAssetUrl(uploadResult.assetUrl));
      }

      utils.cadastros.getById.setData(
        { entity, id: Number(savedRecord.id) },
        savedRecord as any,
      );
      utils.cadastros.list.setData(listInput as any, (current: any) => {
        if (!current) return current;
        const existingIndex = current.items.findIndex((item: Record<string, any>) => item.id === savedRecord.id);
        if (existingIndex >= 0) {
          const items = [...current.items];
          items[existingIndex] = savedRecord;
          return { ...current, items };
        }
        if (page === 1 && !deferredSearch && !status && !secretariaId && !role && !cidade.trim()) {
          return {
            ...current,
            items: [savedRecord, ...current.items].slice(0, pageSize),
            total: current.total + 1,
          };
        }
        return current;
      });

      await Promise.all([
        utils.cadastros.list.invalidate(),
        utils.cadastros.summary.invalidate(),
        utils.cadastros.getById.invalidate({ entity, id: Number(savedRecord.id) }),
        utils.cadastros.formOptions.invalidate(),
        utils.cadastros.lookup.invalidate(),
        utils.cadastros.dedupeSuggestions.invalidate(),
        utils.cadastros.fornecedorVencedorBackfillPreview.invalidate(),
        (saved as any).affectsCurrentIdentity || (saved as any).identityProfileChanged
          ? utils.auth.me.invalidate()
          : Promise.resolve(),
      ]);
      closeModal();
      setError(null);
      setFeedback(`${meta.singular.charAt(0).toUpperCase()}${meta.singular.slice(1)} salvo com sucesso.`);
    } catch (submitError) {
      setFeedback(null);
      setError(submitError instanceof Error ? submitError.message : "Falha ao salvar o cadastro.");
    }
  }

  function updateForm(key: string, value: unknown) {
    setFormState((current) => ({ ...current, [key]: value }));
    setFormErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function updateLookupForm(
    idKey: string,
    optionKey: string,
    option: LookupOption | null,
  ) {
    setFormState((current) => ({
      ...current,
      [idKey]: option ? String(option.id) : "",
      [optionKey]: option,
      ...(idKey === "cargoId"
        ? { cargo: option ? lookupOptionLabel(option) : "" }
        : {}),
    }));
    setFormErrors((current) => {
      if (!current[idKey]) return current;
      const next = { ...current };
      delete next[idKey];
      return next;
    });
  }

  function handleAssetSelected(file: File | null) {
    setAssetError(null);
    setAssetFile(file);
    setAssetCrop(cropDefaults);
    if (!file) {
      if (!editingId) {
        setAssetPreviewUrl(null);
      }
      return;
    }

    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setAssetFile(null);
      setAssetError("Selecione uma imagem PNG, JPG ou WEBP.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setAssetFile(null);
      setAssetError("A imagem deve ter no máximo 10 MB.");
      return;
    }
  }

  function fieldError(name: string) {
    return formErrors[name];
  }

  function toggleRowSelection(row: Record<string, any>) {
    setSelectedRowsById((current) => {
      const next = { ...current };
      if (next[row.id]) {
        delete next[row.id];
      } else {
        next[row.id] = row;
      }
      return next;
    });
  }

  function toggleVisibleSelection() {
    setSelectedRowsById((current) => {
      const next = { ...current };
      if (allVisibleSelected) {
        for (const row of rows) {
          delete next[row.id];
        }
        return next;
      }

      for (const row of rows) {
        next[row.id] = row;
      }
      return next;
    });
  }

  async function handleBulkStatus(nextStatus: boolean) {
    if (!selectedIds.length) return;
    await bulkStatusMutation.mutateAsync({ entity, ids: selectedIds, ativo: nextStatus });
  }

  async function resolveExportRows(scope: ExportScope) {
    if (scope === "selected") {
      return buildExportRows(entity, selectedRows);
    }

    if (scope === "page") {
      return buildExportRows(entity, rows);
    }

    const exportedRows = await utils.cadastros.exportRows.fetch({
      entity,
      search: deferredSearch || undefined,
      status: status || undefined,
      secretariaId: secretariaId ? Number(secretariaId) : undefined,
      role: role ? (role as any) : undefined,
      cidade: cidade.trim() || undefined,
      page: 1,
      pageSize: 5000,
    });

    return buildExportRows(entity, exportedRows as Array<Record<string, any>>);
  }

  async function handleAdvancedExport() {
    const exportRows = await resolveExportRows(exportScope);
    if (!exportRows.length) {
      setError("Nenhum registro disponível para exportação com o escopo atual.");
      return;
    }

    const dateStamp = new Date().toISOString().slice(0, 10);
    const filenameBase = `sirel-cadastros-${entity}-${exportScope}-${dateStamp}`;
    const summary = [
      { label: "Entidade", value: meta.label },
      { label: "Escopo", value: exportScope === "page" ? "Página atual" : exportScope === "selected" ? "Selecionados" : "Todos os filtrados" },
      { label: "Total", value: exportRows.length },
    ];

    if (exportFormat === "csv") {
      exportCadastrosToCsv(`${filenameBase}.csv`, exportRows);
    } else if (exportFormat === "xlsx") {
      await exportCadastrosToXlsx(`${filenameBase}.xlsx`, meta.label, exportRows);
    } else {
      await exportCadastrosToPdf(`${filenameBase}.pdf`, `Cadastros - ${meta.label}`, exportRows, summary);
    }

    setExportModalOpen(false);
    setFeedback(`Exportação de ${meta.label.toLowerCase()} concluída em ${exportFormat.toUpperCase()}.`);
    setError(null);
  }

  function renderToolbarFilters() {
    if (entity === "fornecedores") {
      return (
        <FormField label="Cidade">
          <Input value={cidade} onChange={(event) => { setPage(1); setCidade(event.target.value); }} placeholder="Filtrar por cidade" />
        </FormField>
      );
    }

    if (entity === "pessoas" || entity === "servidores" || entity === "departamentos") {
      return (
        <FormField label="Secretaria">
          <AsyncCombobox
            value={secretariaId || null}
            onChange={(option) => {
              setPage(1);
              setSecretariaId(option ? String(option.id) : "");
              setSecretariaFilterOption(option);
            }}
            query={querySecretarias}
            getOptionValue={(option) => option.id}
            getOptionLabel={(option) => option.sigla ? `${option.sigla} - ${lookupOptionLabel(option)}` : lookupOptionLabel(option)}
            initialOption={secretariaFilterOption}
            ariaLabel="Filtrar por secretaria"
            placeholder="Todas"
            searchPlaceholder="Nome ou sigla"
            minSearchLength={0}
            allowClear
          />
        </FormField>
      );
    }

    if (entity === "usuarios") {
      return (
        <>
          <FormField label="Secretaria">
            <AsyncCombobox
              value={secretariaId || null}
              onChange={(option) => {
                setPage(1);
                setSecretariaId(option ? String(option.id) : "");
                setSecretariaFilterOption(option);
              }}
              query={querySecretarias}
              getOptionValue={(option) => option.id}
              getOptionLabel={(option) => option.sigla ? `${option.sigla} - ${lookupOptionLabel(option)}` : lookupOptionLabel(option)}
              initialOption={secretariaFilterOption}
              ariaLabel="Filtrar usuários por secretaria"
              placeholder="Todas"
              searchPlaceholder="Nome ou sigla"
              minSearchLength={0}
              allowClear
            />
          </FormField>
          <FormField label="Perfil">
            <Select value={role} onChange={(event) => { setPage(1); setRole(event.target.value); }}>
              <option value="">Todos</option>
              {optionsQuery.data?.userRoles.map((item) => (
                <option key={item.codigo} value={item.codigo}>{item.nome}</option>
              ))}
            </Select>
          </FormField>
        </>
      );
    }

    return null;
  }

  function renderTableRows() {
    return rows.map((row) => (
      <TableRow
        key={row.id}
        className={[
          "cursor-pointer transition hover:bg-[rgba(230,240,255,0.4)]",
          selectedRecordId === row.id ? "bg-[rgba(230,240,255,0.62)]" : "",
        ].join(" ")}
        onClick={() => {
          if (canAuditCadastros) setSelectedRecordId(row.id);
        }}
      >
        {canManageCadastros ? (
          <TableCell onClick={(event) => event.stopPropagation()}>
            <input
              type="checkbox"
              checked={Boolean(selectedRowsById[row.id])}
              onChange={() => toggleRowSelection(row)}
              className="h-4 w-4 rounded border-[var(--color-neutral-300)]"
              aria-label={`Selecionar ${getRowLabel(entity, row)}`}
            />
          </TableCell>
        ) : null}
        {entity === "itens" ? (
          <>
            <TableCell>
              <div className="font-semibold text-[var(--color-primary-900)]">{highlightTerm(row.nome, search)}</div>
              <div className="text-xs font-mono text-[var(--color-neutral-500)]">{row.codigo}</div>
            </TableCell>
            <TableCell>{row.unidade}</TableCell>
            <TableCell>{row.valorReferencia ? formatCurrencyBRL(row.valorReferencia) : "-"}</TableCell>
          </>
        ) : null}
        {entity === "fornecedores" ? (
          <>
            <TableCell>
              <div className="font-semibold text-[var(--color-primary-900)]">{highlightTerm(row.razaoSocial, search)}</div>
              <div className="text-xs font-mono text-[var(--color-neutral-500)]">{formatCnpj(row.cnpj)}</div>
            </TableCell>
            <TableCell>{row.cidade ?? "-"}</TableCell>
            <TableCell>{row.email ?? "-"}</TableCell>
          </>
        ) : null}
        {entity === "secretarias" ? (
          <>
            <TableCell>
              <div className="font-semibold text-[var(--color-primary-900)]">{highlightTerm(row.nome, search)}</div>
              <div className="text-xs font-mono text-[var(--color-neutral-500)]">{row.sigla}</div>
            </TableCell>
            <TableCell>{row.responsavel ?? "-"}</TableCell>
            <TableCell>{row.email ?? "-"}</TableCell>
          </>
        ) : null}
        {entity === "cargos" || entity === "funcoes" ? (
          <>
            <TableCell>
              <div className="font-semibold text-[var(--color-primary-900)]">{highlightTerm(row.nome, search)}</div>
              <div className="text-xs font-mono text-[var(--color-neutral-500)]">{row.codigo ?? "Sem código"}</div>
            </TableCell>
            <TableCell>{entity === "cargos" ? row.categoria ?? "-" : row.descricao ?? "-"}</TableCell>
            <TableCell>{row.descricao ?? "-"}</TableCell>
          </>
        ) : null}
        {entity === "pessoas" || entity === "servidores" ? (
          <>
            <TableCell>
              <div className="font-semibold text-[var(--color-primary-900)]">{highlightTerm(row.nome, search)}</div>
              <div className="text-xs font-mono text-[var(--color-neutral-500)]">{row.cpf ? formatCpf(row.cpf) : "-"}</div>
            </TableCell>
            <TableCell>{row.matricula ?? row.cargo ?? "-"}</TableCell>
            <TableCell>{row.secretariaNome ?? "-"}</TableCell>
          </>
        ) : null}
        {entity === "departamentos" ? (
          <>
            <TableCell>
              <div className="font-semibold text-[var(--color-primary-900)]">{highlightTerm(row.nome, search)}</div>
              <div className="text-xs text-[var(--color-neutral-500)]">{row.codigoCentroCusto ?? "Sem centro de custo"}</div>
            </TableCell>
            <TableCell>{row.secretariaNome ?? "-"}</TableCell>
            <TableCell>{row.responsavelNome ?? "-"}</TableCell>
          </>
        ) : null}
        {entity === "usuarios" ? (
          <>
            <TableCell>
              <div className="font-semibold text-[var(--color-primary-900)]">{highlightTerm(row.name, search)}</div>
              <div className="text-xs font-mono text-[var(--color-neutral-500)]">{row.username ?? "-"}</div>
              <div className="mt-1 text-xs font-semibold text-[var(--color-primary-700)]">
                {identityStatusLabels[resolveCadastroIdentityStatus(row)]}
              </div>
            </TableCell>
            <TableCell>{roleLabels[row.role] ?? row.role}</TableCell>
            <TableCell>
              <div>{row.secretariaNome ?? "-"}</div>
              {row.pessoaNome ? <div className="text-xs text-[var(--color-neutral-500)]">{row.pessoaNome}</div> : null}
            </TableCell>
          </>
        ) : null}
        {entity === "parametros" ? (
          <>
            <TableCell>
              <div className="font-semibold text-[var(--color-primary-900)]">{highlightTerm(row.chave, search)}</div>
              <div className="text-xs text-[var(--color-neutral-500)]">{row.categoria}</div>
            </TableCell>
            <TableCell>{row.valor}</TableCell>
            <TableCell>{row.descricao ?? "-"}</TableCell>
          </>
        ) : null}
        <TableCell><CadastroStatusBadge status={row.status} /></TableCell>
        <TableCell>{row.atualizadoEm ? formatShortDateTimeBR(row.atualizadoEm) : "-"}</TableCell>
        <TableCell className="text-right">
          <div className="flex justify-end gap-2" onClick={(event) => event.stopPropagation()}>
            {canAuditCadastros ? (
              <Button variant="ghost" size="sm" onClick={() => setSelectedRecordId(row.id)} icon={<History className="h-4 w-4" />}>
                Auditoria
              </Button>
            ) : null}
            {canManageCadastros && (entity === "itens" || entity === "fornecedores") ? (
              <Button variant="secondary" size="sm" onClick={() => openDuplicateModal(row)} icon={<Copy className="h-4 w-4" />}>
                Duplicar
              </Button>
            ) : null}
            {canManageCadastros && entity === "fornecedores" ? (
              <Button variant="secondary" size="sm" onClick={() => openMergeModal(row)} icon={<RefreshCcw className="h-4 w-4" />}>
                Unificar
              </Button>
            ) : null}
            {canManageCadastros && entity === "itens" ? (
              <Button variant="secondary" size="sm" onClick={() => openMergeItemModal(row)} icon={<RefreshCcw className="h-4 w-4" />}>
                Unificar
              </Button>
            ) : null}
            {canManageCadastros && (entity === "pessoas" || entity === "servidores") ? (
              <Button variant="secondary" size="sm" onClick={() => openMergePessoaModal(row)} icon={<RefreshCcw className="h-4 w-4" />}>
                Unificar
              </Button>
            ) : null}
            {entity === "itens" ? (
              <Button variant="outline" size="sm" onClick={() => setLocation(`/dossie/item/${row.id}`)} icon={<Eye className="h-4 w-4" />}>
                Dossie
              </Button>
            ) : null}
            {entity === "fornecedores" ? (
              <Button variant="outline" size="sm" onClick={() => setLocation(`/dossie/fornecedor/${row.id}`)} icon={<Eye className="h-4 w-4" />}>
                Dossie
              </Button>
            ) : null}
            {canManageCadastros ? (
              <Button variant="outline" size="sm" onClick={() => openEditModal(row)} icon={<Pencil className="h-4 w-4" />}>
                Editar
              </Button>
            ) : null}
            {isAdmin ? (
              <Button variant="destructive" size="sm" onClick={() => void handleDelete(row)} icon={<Trash2 className="h-4 w-4" />}>
                Inativar
              </Button>
            ) : null}
          </div>
        </TableCell>
      </TableRow>
    ));
  }

  function renderModuleSelector() {
    return (
      <SectionCard
        title="Módulo de Cadastros"
        description="Centralize a manutenção das entidades mestres do SIREL em um único ponto operacional."
        action={
          <div className="inline-flex items-center gap-2 rounded-full bg-[var(--color-primary-100)] px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-primary-800)]">
            <Settings2 className="h-4 w-4" />
            Dados mestres
          </div>
        }
      >
        <div className="flex gap-2 overflow-x-auto pb-1">
          {visibleEntityMeta.map((item) => {
            const Icon = item.icon;
            const active = entity === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  setEntity(item.key);
                  setShowInstitucionais(false);
                  if (institutionalQueryActive) {
                    setLocation("/cadastros");
                  }
                }}
                className={[
                  "inline-flex min-w-fit items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-semibold transition",
                  active && !isInstitutionalMode
                    ? "border-[rgba(47,84,196,0.32)] bg-[var(--color-primary-50)] text-[var(--color-primary-800)]"
                    : "border-[rgba(209,213,219,0.92)] bg-white text-[var(--color-neutral-700)] hover:border-[rgba(47,84,196,0.24)] hover:bg-[var(--color-primary-50)] hover:text-[var(--color-primary-800)]",
                ].join(" ")}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => {
              setShowInstitucionais(true);
              if (!institutionalQueryActive) {
                setLocation("/cadastros?institucionais=1");
              }
            }}
            className={[
              "inline-flex min-w-fit items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-semibold transition",
              isInstitutionalMode
                ? "border-[rgba(47,84,196,0.32)] bg-[var(--color-primary-50)] text-[var(--color-primary-800)]"
                : "border-[rgba(209,213,219,0.92)] bg-white text-[var(--color-neutral-700)] hover:border-[rgba(47,84,196,0.24)] hover:bg-[var(--color-primary-50)] hover:text-[var(--color-primary-800)]",
            ].join(" ")}
          >
            <Landmark className="h-4 w-4" />
            Institucionais
          </button>
        </div>
      </SectionCard>
    );
  }

  if (isInstitutionalMode) {
    return (
      <div className="space-y-6">
        {renderModuleSelector()}
        <CadastrosInstitucionaisPanel />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {renderModuleSelector()}

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-4">
        <Card>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">Entidade ativa</p>
          <p className="mt-2 text-2xl font-black text-[var(--color-primary-900)]">{meta.label}</p>
        </Card>
        <Card>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">Total</p>
          {summaryQuery.isLoading ? <Skeleton className="mt-2 h-8 w-20" /> : <p className="mt-2 text-2xl font-black text-[var(--color-primary-900)]">{summaryQuery.data?.total ?? 0}</p>}
        </Card>
        <Card>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">Ativos</p>
          {summaryQuery.isLoading ? <Skeleton className="mt-2 h-8 w-20" /> : <p className="mt-2 text-2xl font-black text-[var(--color-primary-900)]">{summaryQuery.data?.ativos ?? 0}</p>}
        </Card>
        <Card>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">Inativos</p>
          {summaryQuery.isLoading ? <Skeleton className="mt-2 h-8 w-20" /> : <p className="mt-2 text-2xl font-black text-[var(--color-primary-900)]">{Math.max(0, (summaryQuery.data?.total ?? 0) - (summaryQuery.data?.ativos ?? 0))}</p>}
        </Card>
      </div>

      <SectionCard title={`Consulta de ${meta.label}`} description="Busca textual, filtros rápidos e exportação local da entidade selecionada.">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_180px_220px_220px]">
          <FormField label={`Buscar em ${meta.label.toLowerCase()}`}>
            <div className="flex items-center gap-2 rounded-2xl border border-[rgba(204,225,255,0.92)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(230,240,255,0.65))] px-3 py-2 shadow-[0_8px_18px_-18px_rgba(15,26,109,0.4)]">
              <Search className="h-4 w-4 text-[var(--color-primary-500)]" />
              <input
                ref={searchRef}
                value={search}
                onChange={(event) => { setPage(1); setSearch(event.target.value); }}
                placeholder={`Ex.: ${meta.searchLabel}`}
                className="w-full border-none bg-transparent text-sm text-[var(--color-neutral-700)] outline-none placeholder:text-[var(--color-neutral-400)]"
              />
            </div>
          </FormField>
          <FormField label="Status">
            <Select value={status} onChange={(event) => { setPage(1); setStatus(event.target.value as any); }}>
              <option value="">Todos</option>
              <option value="ativo">Ativos</option>
              <option value="inativo">Inativos</option>
            </Select>
          </FormField>
          {renderToolbarFilters()}
          <FormField label="Por página">
            <Select value={String(pageSize)} onChange={(event) => { setPage(1); setPageSize(Number(event.target.value)); }}>
              {[10, 20, 30].map((option) => <option key={option} value={option}>{option}</option>)}
            </Select>
          </FormField>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {canManageCadastros ? (
            <>
              <Button variant="outline" onClick={() => setExportModalOpen(true)} disabled={!rows.length} icon={<Download className="h-4 w-4" />}>
                Exportação avançada
              </Button>
              <Button onClick={openCreateModal} icon={<Plus className="h-4 w-4" />}>
                Novo {meta.singular}
              </Button>
            </>
          ) : null}
        </div>
      </SectionCard>

      {feedback ? <Alert variant="success">{feedback}</Alert> : null}
      {error ? <Alert variant="error">{error}</Alert> : null}
      {listQuery.error ? <Alert variant="error">Falha ao carregar os cadastros da entidade selecionada.</Alert> : null}
      {canManageCadastros && supportsMergeEntity ? (
        <SectionCard
          title="Detecção Inteligente de Duplicidades"
          description={`Possíveis duplicações de ${meta.label.toLowerCase()} classificadas automaticamente para apoiar a unificação.`}
          action={
            <div className="inline-flex items-center gap-2 rounded-full bg-[var(--color-primary-100)] px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-primary-800)]">
              <Sparkles className="h-4 w-4" />
              {dedupeSuggestions.length} sugestão(ões)
            </div>
          }
        >
          <div className="mb-4 flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void dedupeSuggestionsQuery.refetch()}
              loading={dedupeSuggestionsQuery.isFetching}
              icon={<RefreshCcw className="h-4 w-4" />}
            >
              Reprocessar sugestões
            </Button>
            <span className="rounded-full bg-[var(--color-neutral-100)] px-3 py-1 text-xs font-semibold text-[var(--color-neutral-700)]">
              {dedupeSuggestionsQuery.data?.analyzedRecords ?? 0} cadastro(s) analisado(s)
            </span>
            <span className="rounded-full bg-[var(--color-neutral-100)] px-3 py-1 text-xs font-semibold text-[var(--color-neutral-700)]">
              Gerado em {dedupeSuggestionsQuery.data?.generatedAt ? formatShortDateTimeBR(dedupeSuggestionsQuery.data.generatedAt) : "-"}
            </span>
          </div>

          {dedupeSuggestionsQuery.error ? (
            <Alert variant="error">
              Não foi possível gerar sugestões automáticas de duplicidade para os filtros atuais.
            </Alert>
          ) : null}

          {dedupeSuggestionsQuery.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-32 w-full rounded-[24px]" />)}
            </div>
          ) : dedupeSuggestions.length ? (
            <div className="space-y-3">
              {dedupeSuggestions.map((suggestion) => {
                const classificationMeta = dedupeClassificationMeta(suggestion.classification);
                const targetRecord = suggestion.records.find((record) => record.id === suggestion.suggestedTargetId) ?? null;
                return (
                  <Card key={suggestion.groupKey} className="space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-2">
                        <span className={["inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.16em]", classificationMeta.className].join(" ")}>
                          {classificationMeta.label}
                        </span>
                        <p className="text-sm font-semibold text-[var(--color-primary-900)]">
                          Confiança estimada: {suggestion.confidenceScore}%
                        </p>
                        <p className="text-sm text-[var(--color-neutral-600)]">
                          {suggestion.reasonSummary.length
                            ? suggestion.reasonSummary.join(" • ")
                            : "Sem sinais detalhados para esta sugestão."}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => void handleApplyDedupeSuggestion(suggestion)}
                        loading={bulkMergeCadastrosMutation.isPending}
                        icon={<RefreshCcw className="h-4 w-4" />}
                      >
                        Aplicar sugestão
                      </Button>
                    </div>

                    <div className="grid gap-2 md:grid-cols-2">
                      {suggestion.records.map((record) => (
                        <div
                          key={`${suggestion.groupKey}-${record.id}`}
                          className={[
                            "rounded-2xl border px-3 py-2",
                            record.id === suggestion.suggestedTargetId
                              ? "border-[rgba(47,84,196,0.32)] bg-[var(--color-primary-50)]"
                              : "border-[rgba(204,225,255,0.92)] bg-white",
                          ].join(" ")}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold text-[var(--color-primary-900)]">{record.label}</p>
                              <p className="text-xs text-[var(--color-neutral-500)]">{record.documento ?? "Sem documento"}</p>
                            </div>
                            <span className="rounded-full bg-[var(--color-neutral-100)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--color-neutral-700)]">
                              {record.id === suggestion.suggestedTargetId ? "Mantido" : "Absorvido"}
                            </span>
                          </div>
                          {record.subtitle ? (
                            <p className="mt-2 text-xs text-[var(--color-neutral-600)]">{record.subtitle}</p>
                          ) : null}
                          <p className="mt-2 text-xs text-[var(--color-neutral-500)]">
                            Vínculos: <span className="font-semibold text-[var(--color-primary-900)]">{record.vinculos}</span>
                            {record.atualizadoEm ? ` • Atualizado em ${formatShortDateTimeBR(record.atualizadoEm)}` : ""}
                          </p>
                        </div>
                      ))}
                    </div>

                    {targetRecord ? (
                      <p className="text-xs text-[var(--color-neutral-600)]">
                        Sugestão de cadastro mantido: <span className="font-semibold text-[var(--color-primary-900)]">{targetRecord.label}</span>.
                      </p>
                    ) : null}
                  </Card>
                );
              })}
            </div>
          ) : (
            <Alert variant="info">
              Nenhuma possível duplicação encontrada com os filtros atuais.
            </Alert>
          )}

          {dedupeSuggestionsQuery.data?.truncated ? (
            <Alert variant="info">
              A análise foi limitada para manter o desempenho. Reforce os filtros para obter sugestões mais precisas.
            </Alert>
          ) : null}
        </SectionCard>
      ) : null}

      {canManageCadastros && supportsFornecedorWinnerBackfill ? (
        <SectionCard
          title="Saneamento de Vencedores Importados"
          description="Fila auditável dos vencedores legados que ainda exigem revisão assistida ou nova tentativa de conciliação automática."
          action={
            <div className="inline-flex items-center gap-2 rounded-full bg-[var(--color-primary-100)] px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-primary-800)]">
              <RefreshCcw className="h-4 w-4" />
              {fornecedorWinnerBackfillQuery.data?.pendingTotal ?? 0} pendência(s)
            </div>
          }
        >
          <Alert variant="info">
            Esta rotina revisa apenas itens importados com vencedor textual ou vínculo legado inconsistente. O sistema só grava alterações quando encontra correspondência segura e preserva a origem como <code>SANEAMENTO_FORNECEDOR</code>.
          </Alert>
          {!isAdmin ? (
            <Alert variant="info">
              Gestores podem revisar a fila; a execução e a confirmação dos vínculos são exclusivas de administradores.
            </Alert>
          ) : null}

          <div className="mt-4 mb-4 flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void fornecedorWinnerBackfillQuery.refetch()}
              loading={fornecedorWinnerBackfillQuery.isFetching}
              icon={<RefreshCcw className="h-4 w-4" />}
            >
              Reprocessar fila
            </Button>
            {isAdmin ? (
              <Button
                size="sm"
                onClick={() => void handleRunFornecedorWinnerBackfill()}
                loading={runFornecedorWinnerBackfillMutation.isPending}
                icon={<CheckCheck className="h-4 w-4" />}
              >
                Executar saneamento
              </Button>
            ) : null}
            <Button
              variant={winnerBackfillOnlyWithSuggestion ? "secondary" : "outline"}
              size="sm"
              onClick={() => setWinnerBackfillOnlyWithSuggestion((current) => !current)}
              icon={<Sparkles className="h-4 w-4" />}
            >
              {winnerBackfillOnlyWithSuggestion ? "Mostrando só com sugestão" : "Somente com sugestão"}
            </Button>
            <span className="rounded-full bg-[var(--color-neutral-100)] px-3 py-1 text-xs font-semibold text-[var(--color-neutral-700)]">
              {fornecedorWinnerBackfillQuery.data?.resolvableNow ?? 0} atualizável(is) agora
            </span>
            <span className="rounded-full bg-[var(--color-neutral-100)] px-3 py-1 text-xs font-semibold text-[var(--color-neutral-700)]">
              {fornecedorWinnerBackfillQuery.data?.filteredTotal ?? 0} pendência(s) na visão atual
            </span>
            <span className="rounded-full bg-[var(--color-neutral-100)] px-3 py-1 text-xs font-semibold text-[var(--color-neutral-700)]">
              Gerado em {fornecedorWinnerBackfillQuery.data?.generatedAt ? formatShortDateTimeBR(fornecedorWinnerBackfillQuery.data.generatedAt) : "-"}
            </span>
          </div>

          {fornecedorWinnerBackfillQuery.error ? (
            <Alert variant="error">
              Não foi possível montar a fila auditável de vencedores importados.
            </Alert>
          ) : null}

          {fornecedorWinnerBackfillQuery.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-28 w-full rounded-[24px]" />
              ))}
            </div>
          ) : fornecedorWinnerBackfillRows.length ? (
            <>
              <div className="space-y-3 md:hidden">
                {fornecedorWinnerBackfillRows.map((row) => {
                  const confidenceMeta = backfillConfidenceMeta(row.confidence);
                  return (
                    <Card key={row.id} className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-[var(--color-primary-900)]">
                            Processo {row.numeroSirel}
                          </p>
                          <p className="text-sm text-[var(--color-neutral-600)]">
                            Item {row.numeroItem} • {row.itemDescricao}
                          </p>
                        </div>
                        <span className={["inline-flex rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em]", confidenceMeta.className].join(" ")}>
                          {confidenceMeta.label}
                        </span>
                      </div>
                      <div className="space-y-2 text-sm text-[var(--color-neutral-600)]">
                        <p>
                          <span className="font-semibold text-[var(--color-primary-900)]">Vencedor legado:</span>{" "}
                          {row.fornecedorVencedorNome ?? "Sem nome"} {row.fornecedorVencedorCnpj ? `• ${formatCnpj(row.fornecedorVencedorCnpj)}` : ""}
                        </p>
                        <p>
                          <span className="font-semibold text-[var(--color-primary-900)]">Sugestão:</span>{" "}
                          {row.fornecedorSugeridoNome ?? "Sem correspondência segura"}
                        </p>
                        <p>
                          <span className="font-semibold text-[var(--color-primary-900)]">Situação:</span>{" "}
                          {row.situacaoItem}{row.dataHomologacao ? ` • ${formatShortDateTimeBR(row.dataHomologacao)}` : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setLocation(`/dossie/${row.processoId}`)}
                          icon={<Eye className="h-4 w-4" />}
                        >
                          Processo
                        </Button>
                        {row.fornecedorSugeridoId ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setLocation(`/dossie/fornecedor/${row.fornecedorSugeridoId}`)}
                            icon={<Building2 className="h-4 w-4" />}
                          >
                            Dossie sugerido
                          </Button>
                        ) : null}
                        {isAdmin ? (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openWinnerLinkModal(row)}
                              icon={<Building2 className="h-4 w-4" />}
                            >
                              Escolher fornecedor
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openWinnerLinkProcessModal(row)}
                              icon={<FolderTree className="h-4 w-4" />}
                            >
                              Revisão em lote
                            </Button>
                            {row.fornecedorSugeridoId ? (
                              <Button
                                size="sm"
                                onClick={() => void handleConfirmFornecedorWinnerLink(row)}
                                loading={confirmFornecedorWinnerBackfillMutation.isPending}
                                icon={<CheckCheck className="h-4 w-4" />}
                              >
                                Confirmar vínculo
                              </Button>
                            ) : null}
                          </>
                        ) : null}
                      </div>
                      <div className="rounded-2xl bg-[var(--color-neutral-50)] px-3 py-2 text-xs text-[var(--color-neutral-600)]">
                        {row.reasonSummary.join(" • ")}
                      </div>
                    </Card>
                  );
                })}
              </div>

              <div className="hidden overflow-x-auto rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-white shadow-[0_14px_30px_-26px_rgba(15,26,109,0.22)] md:block">
                <Table className="min-w-[1180px]">
                  <TableHead>
                    <tr>
                      <TableHeaderCell>Processo</TableHeaderCell>
                      <TableHeaderCell>Item</TableHeaderCell>
                      <TableHeaderCell>Vencedor legado</TableHeaderCell>
                      <TableHeaderCell>Sugestão</TableHeaderCell>
                      <TableHeaderCell>Motivos</TableHeaderCell>
                      <TableHeaderCell className="text-right">Ações</TableHeaderCell>
                    </tr>
                  </TableHead>
                  <TableBody>
                    {fornecedorWinnerBackfillRows.map((row) => {
                      const confidenceMeta = backfillConfidenceMeta(row.confidence);
                      return (
                        <TableRow key={row.id}>
                          <TableCell>
                            <div className="font-semibold text-[var(--color-primary-900)]">{row.numeroSirel}</div>
                            <div className="text-xs text-[var(--color-neutral-500)]">
                              {row.numeroEdital ?? row.numeroAdministrativo ?? "Sem referência complementar"}
                            </div>
                            <div className="mt-1 text-xs text-[var(--color-neutral-500)]">
                              {row.situacaoItem}
                              {row.dataHomologacao ? ` • ${formatShortDateTimeBR(row.dataHomologacao)}` : ""}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="font-semibold text-[var(--color-primary-900)]">Item {row.numeroItem}</div>
                            <div className="text-sm text-[var(--color-neutral-600)]">{row.itemDescricao}</div>
                          </TableCell>
                          <TableCell>
                            <div className="font-semibold text-[var(--color-primary-900)]">{row.fornecedorVencedorNome ?? "Sem nome"}</div>
                            <div className="text-xs text-[var(--color-neutral-500)]">
                              {row.fornecedorVencedorCnpj ? formatCnpj(row.fornecedorVencedorCnpj) : "Sem CNPJ"}
                            </div>
                            {row.fornecedorAtualNome ? (
                              <div className="mt-1 text-xs text-[var(--color-neutral-500)]">
                                ID atual correlato: {row.fornecedorAtualNome}
                              </div>
                            ) : null}
                          </TableCell>
                          <TableCell>
                            <span className={["mb-2 inline-flex rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em]", confidenceMeta.className].join(" ")}>
                              {confidenceMeta.label}
                            </span>
                            <div className="font-semibold text-[var(--color-primary-900)]">
                              {row.fornecedorSugeridoNome ?? "Sem sugestão segura"}
                            </div>
                            <div className="text-xs text-[var(--color-neutral-500)]">
                              {row.fornecedorSugeridoCnpj ? formatCnpj(row.fornecedorSugeridoCnpj) : "Sem documento sugerido"}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="max-w-[320px] text-sm text-[var(--color-neutral-600)]">
                              {row.reasonSummary.join(" • ")}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setLocation(`/dossie/${row.processoId}`)}
                                icon={<Eye className="h-4 w-4" />}
                              >
                                Processo
                              </Button>
                              {row.fornecedorSugeridoId ? (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => setLocation(`/dossie/fornecedor/${row.fornecedorSugeridoId}`)}
                                  icon={<Building2 className="h-4 w-4" />}
                                >
                                  Dossie do fornecedor
                                </Button>
                              ) : null}
                              {isAdmin ? (
                                <>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openWinnerLinkModal(row)}
                                    icon={<Building2 className="h-4 w-4" />}
                                  >
                                    Escolher fornecedor
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => openWinnerLinkProcessModal(row)}
                                    icon={<FolderTree className="h-4 w-4" />}
                                  >
                                    Em lote
                                  </Button>
                                  {row.fornecedorSugeridoId ? (
                                    <Button
                                      size="sm"
                                      onClick={() => void handleConfirmFornecedorWinnerLink(row)}
                                      loading={confirmFornecedorWinnerBackfillMutation.isPending}
                                      icon={<CheckCheck className="h-4 w-4" />}
                                    >
                                      Confirmar
                                    </Button>
                                  ) : null}
                                </>
                              ) : null}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-[var(--color-neutral-600)]">
                  Exibindo <span className="font-bold text-[var(--color-primary-900)]">{fornecedorWinnerBackfillRows.length}</span> de{" "}
                  <span className="font-bold text-[var(--color-primary-900)]">{fornecedorWinnerBackfillQuery.data?.filteredTotal ?? 0}</span> pendência(s) auditáveis.
                </p>
                <Pagination
                  page={winnerBackfillPage}
                  totalPages={fornecedorWinnerBackfillQuery.data?.totalPages ?? 1}
                  onPageChange={setWinnerBackfillPage}
                />
              </div>
            </>
          ) : (
            <Alert variant="success">
              {winnerBackfillOnlyWithSuggestion
                ? "Nenhuma pendência com sugestão segura encontrada para os filtros atuais. Desative o filtro para revisar todos os casos remanescentes."
                : "Nenhuma pendência auditável encontrada para os filtros atuais. Se necessário, reprocesse a fila para revisar novas importações ou efeitos de unificações recentes."}
            </Alert>
          )}
        </SectionCard>
      ) : null}

      <SectionCard title={`Lista de ${meta.label}`} description="Listagem paginada com ações de edição, inativação e atualização rápida.">
        {canManageCadastros ? (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-[24px] border border-[rgba(204,225,255,0.92)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(230,240,255,0.64))] p-4">
            <span className="rounded-full bg-[var(--color-primary-100)] px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-800)]">
              {selectedIds.length} selecionado(s)
            </span>
            <Button variant="secondary" size="sm" onClick={toggleVisibleSelection} disabled={!rows.length} icon={<CheckCheck className="h-4 w-4" />}>
              {allVisibleSelected ? "Limpar página" : "Selecionar página"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSelectedRowsById({})} disabled={!selectedIds.length}>
              Limpar seleção
            </Button>
            {supportsMergeEntity ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={openBulkMergeModal}
                disabled={selectedIds.length < 2}
                icon={<RefreshCcw className="h-4 w-4" />}
              >
                Unificar selecionados
              </Button>
            ) : null}
            {isAdmin ? (
              <>
                <Button variant="outline" size="sm" onClick={() => void handleBulkStatus(true)} disabled={!selectedIds.length || bulkStatusMutation.isPending} icon={<RefreshCcw className="h-4 w-4" />}>
                  Reativar selecionados
                </Button>
                <Button variant="destructive" size="sm" onClick={() => void handleBulkStatus(false)} disabled={!selectedIds.length || bulkStatusMutation.isPending} icon={<Trash2 className="h-4 w-4" />}>
                  Inativar selecionados
                </Button>
              </>
            ) : null}
            <Button variant="ghost" size="sm" onClick={() => setExportModalOpen(true)} disabled={!rows.length && !selectedIds.length} icon={<Download className="h-4 w-4" />}>
              Exportar
            </Button>
          </div>
        ) : null}

        {listQuery.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-24 w-full rounded-[24px]" />)}
          </div>
        ) : rows.length ? (
          <>
            <div className="space-y-3 md:hidden">
              {rows.map((row) => (
                <CadastroMobileCard
                  key={row.id}
                  entity={entity}
                  row={row}
                  search={search}
                  selected={Boolean(selectedRowsById[row.id])}
                  onSelect={canManageCadastros ? () => toggleRowSelection(row) : undefined}
                  onOpenAudit={canAuditCadastros ? () => setSelectedRecordId(row.id) : undefined}
                  onDuplicate={canManageCadastros && (entity === "itens" || entity === "fornecedores") ? () => openDuplicateModal(row) : undefined}
                  onMerge={
                    !canManageCadastros
                      ? undefined
                      : entity === "itens"
                      ? () => openMergeItemModal(row)
                      : entity === "fornecedores"
                      ? () => openMergeModal(row)
                      : entity === "pessoas" || entity === "servidores"
                        ? () => openMergePessoaModal(row)
                        : undefined
                  }
                  onEdit={canManageCadastros ? () => openEditModal(row) : undefined}
                  onDelete={isAdmin ? () => void handleDelete(row) : undefined}
                />
              ))}
            </div>

            <div className="hidden overflow-x-auto rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-white shadow-[0_14px_30px_-26px_rgba(15,26,109,0.22)] md:block">
              <Table className="min-w-[960px]">
                <TableHead>
                  <tr>
                    {canManageCadastros ? (
                      <TableHeaderCell className="w-12">
                        <input
                          type="checkbox"
                          checked={allVisibleSelected}
                          onChange={toggleVisibleSelection}
                          className="h-4 w-4 rounded border-[var(--color-neutral-300)]"
                          aria-label="Selecionar página atual"
                        />
                      </TableHeaderCell>
                    ) : null}
                    <TableHeaderCell>{entity === "parametros" ? "Registro" : meta.singular.charAt(0).toUpperCase() + meta.singular.slice(1)}</TableHeaderCell>
                    <TableHeaderCell>{entity === "itens" ? "Unidade" : entity === "fornecedores" ? "Cidade" : entity === "secretarias" ? "Responsável" : entity === "cargos" ? "Categoria" : entity === "funcoes" ? "Descrição" : entity === "pessoas" || entity === "servidores" ? "Matrícula/Cargo" : entity === "departamentos" ? "Secretaria" : entity === "usuarios" ? "Perfil" : "Valor"}</TableHeaderCell>
                    <TableHeaderCell>{entity === "itens" ? "Valor ref." : entity === "fornecedores" ? "E-mail" : entity === "secretarias" ? "E-mail" : entity === "cargos" || entity === "funcoes" ? "Descrição" : entity === "pessoas" || entity === "servidores" ? "Secretaria" : entity === "departamentos" ? "Responsável" : entity === "usuarios" ? "Secretaria" : "Descrição"}</TableHeaderCell>
                    <TableHeaderCell>Status</TableHeaderCell>
                    <TableHeaderCell>Atualizado</TableHeaderCell>
                    <TableHeaderCell className="text-right">Ações</TableHeaderCell>
                  </tr>
                </TableHead>
                <TableBody>{renderTableRows()}</TableBody>
              </Table>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-[var(--color-neutral-600)]">
                Exibindo <span className="font-bold text-[var(--color-primary-900)]">{rows.length}</span> de <span className="font-bold text-[var(--color-primary-900)]">{listQuery.data?.total ?? 0}</span> registros.
              </p>
              <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
            </div>
          </>
        ) : (
          <Alert variant="info">Nenhum registro encontrado com os filtros atuais.</Alert>
        )}
      </SectionCard>

      {selectedRecord && canAuditCadastros ? (
        <SectionCard
          title={`Auditoria de ${meta.singular}`}
          description={`Histórico detalhado do registro selecionado: ${getRowLabel(entity, selectedRecord)}.`}
          action={
            <div className="inline-flex items-center gap-2 rounded-full bg-[var(--color-primary-100)] px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-primary-800)]">
              <History className="h-4 w-4" />
              {historyQuery.data?.total ?? 0} evento(s)
            </div>
          }
        >
          <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
            <Card className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">Registro selecionado</p>
              <p className="text-xl font-black text-[var(--color-primary-900)]">{getRowLabel(entity, selectedRecord)}</p>
              <p className="text-sm text-[var(--color-neutral-600)]">ID interno: {selectedRecord.id}</p>
              <div className="flex flex-wrap gap-2">
                <CadastroStatusBadge status={selectedRecord.status} />
                <span className="rounded-full bg-[var(--color-neutral-100)] px-3 py-1 text-xs font-bold text-[var(--color-neutral-700)]">
                  Atualizado em {selectedRecord.atualizadoEm ? formatShortDateTimeBR(selectedRecord.atualizadoEm) : "-"}
                </span>
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                {canManageCadastros ? (
                  <>
                    <Button variant="outline" size="sm" onClick={() => openEditModal(selectedRecord)} icon={<Pencil className="h-4 w-4" />}>
                      Editar registro
                    </Button>
                    {entity === "itens" || entity === "fornecedores" ? (
                      <Button variant="secondary" size="sm" onClick={() => openDuplicateModal(selectedRecord)} icon={<Copy className="h-4 w-4" />}>
                        Duplicar
                      </Button>
                    ) : null}
                    {entity === "fornecedores" ? (
                      <Button variant="secondary" size="sm" onClick={() => openMergeModal(selectedRecord)} icon={<RefreshCcw className="h-4 w-4" />}>
                        Unificar cadastro
                      </Button>
                    ) : null}
                    {entity === "itens" ? (
                      <Button variant="secondary" size="sm" onClick={() => openMergeItemModal(selectedRecord)} icon={<RefreshCcw className="h-4 w-4" />}>
                        Unificar cadastro
                      </Button>
                    ) : null}
                    {entity === "pessoas" || entity === "servidores" ? (
                      <Button variant="secondary" size="sm" onClick={() => openMergePessoaModal(selectedRecord)} icon={<RefreshCcw className="h-4 w-4" />}>
                        Unificar cadastro
                      </Button>
                    ) : null}
                  </>
                ) : null}
                <Button variant="ghost" size="sm" onClick={() => void historyQuery.refetch()} icon={<RefreshCcw className="h-4 w-4" />}>
                  Atualizar trilha
                </Button>
              </div>
            </Card>

            <div className="space-y-3">
              <Card className="space-y-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <FormField label="Ação">
                    <Select value={auditActionFilter} onChange={(event) => setAuditActionFilter(event.target.value as typeof auditActionFilter)}>
                      <option value="">Todas</option>
                      <option value="CREATE">Criação</option>
                      <option value="UPDATE">Atualização</option>
                      <option value="DELETE">Inativação</option>
                    </Select>
                  </FormField>
                  <FormField label="Busca textual">
                    <Input value={auditSearch} onChange={(event) => setAuditSearch(event.target.value)} placeholder="Descrição ou usuário" />
                  </FormField>
                  <FormField label="Campo alterado">
                    <Input value={auditFieldFilter} onChange={(event) => setAuditFieldFilter(event.target.value)} placeholder="Ex.: email, valor" />
                  </FormField>
                </div>
              </Card>

              {historyQuery.isLoading ? (
                Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-28 w-full rounded-[24px]" />)
              ) : historyRows.length ? (
                historyRows.map((entry) => (
                  <Card key={entry.id} className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-black text-[var(--color-primary-900)]">{auditActionLabels[entry.acao] ?? entry.acao}</p>
                        <p className="text-sm text-[var(--color-neutral-600)]">{entry.descricao ?? buildAuditSummary(entry as AuditEntry)}</p>
                      </div>
                      <span className="rounded-full bg-[var(--color-primary-50)] px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-primary-700)]">
                        {formatShortDateTimeBR(entry.criadoEm)}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-[var(--color-neutral-100)] px-3 py-1 text-xs font-semibold text-[var(--color-neutral-700)]">
                        {entry.usuarioNome ?? "Sistema"}
                      </span>
                      {listChangedFields(entry as AuditEntry).slice(0, 6).map((field) => (
                        <span key={`${entry.id}-${field}`} className="rounded-full bg-[rgba(245,158,11,0.14)] px-3 py-1 text-xs font-semibold text-[rgb(146,95,0)]">
                          {field}
                        </span>
                      ))}
                    </div>
                    <div className="flex justify-end">
                      <Button variant="outline" size="sm" onClick={() => setAuditDetail(entry as AuditEntry)} icon={<Eye className="h-4 w-4" />}>
                        Ver detalhe
                      </Button>
                    </div>
                  </Card>
                ))
              ) : (
                <Alert variant="info">Nenhum evento de auditoria encontrado para os filtros aplicados neste registro.</Alert>
              )}
            </div>
          </div>
        </SectionCard>
      ) : null}

      <Modal
        open={bulkMergeModalOpen}
        onClose={closeBulkMergeModal}
        size="md"
        title={`Unificar ${meta.label.toLowerCase()} selecionados`}
        description="Escolha qual cadastro deve permanecer. Todos os demais registros selecionados serão absorvidos por ele com preservação dos vínculos já existentes."
      >
        <div className="space-y-4">
          <Alert variant="info">
            {selectedIds.length} cadastro(s) selecionado(s). O registro mantido continuará ativo e os demais serão incorporados a ele.
          </Alert>

          <FormField label="Cadastro mantido">
            <Select value={bulkMergeTargetId} onChange={(event) => setBulkMergeTargetId(event.target.value)}>
              <option value="">
                {entity === "itens"
                  ? "Selecione o item mantido"
                  : entity === "fornecedores"
                  ? "Selecione o fornecedor mantido"
                  : entity === "servidores"
                    ? "Selecione o servidor mantido"
                    : "Selecione a pessoa mantida"}
              </option>
              {bulkMergeCandidates.map((row) => (
                <option key={row.id} value={row.id}>
                  {getRowLabel(entity, row)}
                  {entity === "itens"
                    ? ` • ${row.unidade ?? "-"}`
                    : entity === "fornecedores"
                    ? ` • ${formatCnpj(row.cnpj)}`
                    : entity === "pessoas" || entity === "servidores"
                      ? ` • ${formatCpf(row.cpf)}`
                      : ""}
                </option>
              ))}
            </Select>
          </FormField>

          {selectedBulkMergeTarget ? (
            <Card className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">Resumo da operação</p>
              <p className="text-sm text-[var(--color-neutral-700)]">
                Mantido: <span className="font-semibold text-[var(--color-primary-900)]">{getRowLabel(entity, selectedBulkMergeTarget)}</span>
              </p>
              <p className="text-sm text-[var(--color-neutral-700)]">
                Absorvidos: <span className="font-semibold text-[var(--color-primary-900)]">{selectedIds.filter((id) => id !== Number(bulkMergeTargetId)).length}</span>
              </p>
            </Card>
          ) : null}

          <div className="max-h-56 space-y-2 overflow-auto rounded-[20px] border border-[rgba(204,225,255,0.92)] bg-white/90 p-3">
            {bulkMergeCandidates.map((row) => (
              <div key={row.id} className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--color-neutral-50)] px-3 py-2">
                <div>
                  <p className="text-sm font-semibold text-[var(--color-primary-900)]">{getRowLabel(entity, row)}</p>
                  <p className="text-xs text-[var(--color-neutral-500)]">
                    {entity === "itens"
                      ? `${row.unidade ?? "-"}${row.valorReferencia ? ` • ${formatCurrencyBRL(row.valorReferencia)}` : ""}`
                      : entity === "fornecedores"
                      ? formatCnpj(row.cnpj)
                      : entity === "pessoas" || entity === "servidores"
                        ? formatCpf(row.cpf)
                        : `ID ${row.id}`}
                  </p>
                </div>
                <span className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-neutral-500)]">
                  {Number(bulkMergeTargetId) === row.id ? "Mantido" : "Absorvido"}
                </span>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={closeBulkMergeModal}>
              Cancelar
            </Button>
            <Button
              onClick={() => void handleBulkMergeCadastros()}
              loading={bulkMergeCadastrosMutation.isPending}
              disabled={!bulkMergeTargetId || selectedIds.length < 2}
              icon={<RefreshCcw className="h-4 w-4" />}
            >
              Unificar em lote
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(mergeSourceRow)}
        onClose={closeMergeModal}
        size="md"
        title="Unificar fornecedores duplicados"
        description="Escolha qual cadastro deve permanecer. O sistema vai transferir contratos, cotações e vínculos em licitações para o fornecedor mantido."
      >
        {mergeSourceRow ? (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <Card className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">Cadastro duplicado</p>
                <p className="text-base font-black text-[var(--color-primary-900)]">{mergeSourceRow.razaoSocial}</p>
                <p className="text-sm text-[var(--color-neutral-600)]">{formatCnpj(mergeSourceRow.cnpj)}</p>
                <p className="text-sm text-[var(--color-neutral-500)]">
                  {mergeSourceRow.cidade ?? "Sem cidade"}{mergeSourceRow.estado ? `/${mergeSourceRow.estado}` : ""}
                </p>
              </Card>
              <Card className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">Cadastro que será mantido</p>
                {selectedMergeTarget ? (
                  <>
                    <p className="text-base font-black text-[var(--color-primary-900)]">{selectedMergeTarget.razaoSocial}</p>
                    <p className="text-sm text-[var(--color-neutral-600)]">{formatCnpj(selectedMergeTarget.cnpj)}</p>
                    <p className="text-sm text-[var(--color-neutral-500)]">
                      ID interno: {selectedMergeTarget.id}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-[var(--color-neutral-500)]">Selecione abaixo o fornecedor que deve permanecer ativo no cadastro.</p>
                )}
              </Card>
            </div>

            <FormField label="Buscar fornecedor de destino">
              <Input
                value={mergeSearch}
                onChange={(event) => setMergeSearch(event.target.value)}
                placeholder="Razão social ou CNPJ"
              />
            </FormField>

            <FormField label="Fornecedor mantido">
              <Select value={mergeTargetId} onChange={(event) => setMergeTargetId(event.target.value)}>
                <option value="">Selecione um fornecedor</option>
                {mergeCandidates.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.razaoSocial} • {formatCnpj(item.cnpj)}
                  </option>
                ))}
              </Select>
            </FormField>

            {!mergeCandidates.length ? (
              <Alert variant="info">
                Nenhum fornecedor candidato encontrado com esse filtro. Ajuste a busca para localizar o cadastro correto.
              </Alert>
            ) : null}

            <Alert variant="info">
              O cadastro duplicado será removido do cadastro principal ao final da operação, mas os vínculos dos processos serão preservados no fornecedor mantido.
            </Alert>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={closeMergeModal}>
                Cancelar
              </Button>
              <Button
                onClick={() => void handleMergeFornecedores()}
                loading={mergeFornecedoresMutation.isPending}
                disabled={!mergeTargetId}
                icon={<RefreshCcw className="h-4 w-4" />}
              >
                Unificar cadastros
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(mergeItemSourceRow)}
        onClose={closeMergeItemModal}
        size="md"
        title="Unificar itens duplicados"
        description="Escolha qual cadastro do catálogo deve permanecer. O sistema vai transferir vínculos em processos, contratos e referências importadas para o item mantido."
      >
        {mergeItemSourceRow ? (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <Card className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">Cadastro duplicado</p>
                <p className="text-base font-black text-[var(--color-primary-900)]">{mergeItemSourceRow.nome}</p>
                <p className="text-sm text-[var(--color-neutral-600)]">
                  {mergeItemSourceRow.unidade ?? "-"}
                  {mergeItemSourceRow.valorReferencia ? ` • ${formatCurrencyBRL(mergeItemSourceRow.valorReferencia)}` : ""}
                </p>
                <p className="text-sm text-[var(--color-neutral-500)]">
                  Código {mergeItemSourceRow.codigo}
                </p>
              </Card>
              <Card className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">Cadastro que será mantido</p>
                {selectedMergeItemTarget ? (
                  <>
                    <p className="text-base font-black text-[var(--color-primary-900)]">{selectedMergeItemTarget.descricao}</p>
                    <p className="text-sm text-[var(--color-neutral-600)]">
                      {selectedMergeItemTarget.unidadePadrao ?? "-"}
                      {selectedMergeItemTarget.valorReferencia ? ` • ${formatCurrencyBRL(selectedMergeItemTarget.valorReferencia)}` : ""}
                    </p>
                    <p className="text-sm text-[var(--color-neutral-500)]">
                      ID interno: {selectedMergeItemTarget.id}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-[var(--color-neutral-500)]">Selecione abaixo o item que deve permanecer ativo no catálogo.</p>
                )}
              </Card>
            </div>

            <FormField label="Buscar item de destino">
              <Input
                value={mergeItemSearch}
                onChange={(event) => setMergeItemSearch(event.target.value)}
                placeholder="Descrição ou unidade"
              />
            </FormField>

            <FormField label="Item mantido">
              <Select value={mergeItemTargetId} onChange={(event) => setMergeItemTargetId(event.target.value)}>
                <option value="">Selecione um item</option>
                {mergeItemCandidates.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.descricao} • {item.unidadePadrao}
                  </option>
                ))}
              </Select>
            </FormField>

            {!mergeItemCandidates.length ? (
              <Alert variant="info">
                Nenhum item candidato encontrado com esse filtro. Ajuste a busca para localizar o cadastro correto.
              </Alert>
            ) : null}

            <Alert variant="info">
              O item duplicado será removido do catálogo principal ao final da operação, mas os vínculos operacionais serão preservados no item mantido.
            </Alert>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={closeMergeItemModal}>
                Cancelar
              </Button>
              <Button
                onClick={() => void handleMergeItens()}
                loading={bulkMergeCadastrosMutation.isPending}
                disabled={!mergeItemTargetId}
                icon={<RefreshCcw className="h-4 w-4" />}
              >
                Unificar cadastros
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(mergePessoaSourceRow)}
        onClose={closeMergePessoaModal}
        size="md"
        title={entity === "servidores" ? "Unificar servidores duplicados" : "Unificar pessoas duplicadas"}
        description="Escolha qual cadastro deve permanecer. O sistema vai transferir os vínculos em departamentos, processos e DFDs para o registro mantido."
      >
        {mergePessoaSourceRow ? (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <Card className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">Cadastro duplicado</p>
                <p className="text-base font-black text-[var(--color-primary-900)]">{mergePessoaSourceRow.nome}</p>
                <p className="text-sm text-[var(--color-neutral-600)]">{formatCpf(mergePessoaSourceRow.cpf)}</p>
                <p className="text-sm text-[var(--color-neutral-500)]">
                  {mergePessoaSourceRow.cargo ?? "Sem cargo"}
                </p>
              </Card>
              <Card className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">Cadastro que será mantido</p>
                {selectedMergePessoaTarget ? (
                  <>
                    <p className="text-base font-black text-[var(--color-primary-900)]">{selectedMergePessoaTarget.nome}</p>
                    <p className="text-sm text-[var(--color-neutral-600)]">{formatCpf(selectedMergePessoaTarget.cpf)}</p>
                    <p className="text-sm text-[var(--color-neutral-500)]">
                      ID interno: {selectedMergePessoaTarget.id}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-[var(--color-neutral-500)]">Selecione abaixo o cadastro que deve permanecer ativo.</p>
                )}
              </Card>
            </div>

            <FormField label={entity === "servidores" ? "Buscar servidor de destino" : "Buscar pessoa de destino"}>
              <Input
                value={mergePessoaSearch}
                onChange={(event) => setMergePessoaSearch(event.target.value)}
                placeholder="Nome, CPF ou cargo"
              />
            </FormField>

            <FormField label={entity === "servidores" ? "Servidor mantido" : "Pessoa mantida"}>
              <Select value={mergePessoaTargetId} onChange={(event) => setMergePessoaTargetId(event.target.value)}>
                <option value="">{entity === "servidores" ? "Selecione um servidor" : "Selecione uma pessoa"}</option>
                {mergePessoaCandidates.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nome} • {formatCpf(item.cpf)}
                  </option>
                ))}
              </Select>
            </FormField>

            {!mergePessoaCandidates.length ? (
              <Alert variant="info">
                Nenhum cadastro candidato encontrado com esse filtro. Ajuste a busca para localizar o registro correto.
              </Alert>
            ) : null}

            <Alert variant="info">
              O cadastro duplicado será removido ao final da operação, mas os vínculos já existentes serão preservados no registro mantido.
            </Alert>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={closeMergePessoaModal}>
                Cancelar
              </Button>
              <Button
                onClick={() => void handleMergePessoas()}
                loading={mergePessoasMutation.isPending}
                disabled={!mergePessoaTargetId}
                icon={<RefreshCcw className="h-4 w-4" />}
              >
                Unificar cadastros
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        size="lg"
        title={`${editingId ? "Editar" : "Novo"} ${meta.singular}`}
        description="Preencha os campos abaixo. Todas as alterações ficam registradas na auditoria do sistema."
      >
        {editingId && getByIdQuery.isFetching ? (
          <div className="space-y-3" role="status" aria-label="Carregando cadastro atualizado">
            <Skeleton className="h-20 w-full rounded-[24px]" />
            <Skeleton className="h-20 w-full rounded-[24px]" />
            <Skeleton className="h-12 w-48 rounded-[20px]" />
          </div>
        ) : editingId && getByIdQuery.error ? (
          <Alert variant="error">
            Não foi possível carregar o cadastro atualizado: {getByIdQuery.error.message}
          </Alert>
        ) : (
        <form className="space-y-4" onSubmit={handleSubmit}>
          {error ? <Alert variant="error">{error}</Alert> : null}
          <div className="grid gap-4 md:grid-cols-2">
            {entity === "itens" ? (
              <>
                <FormField label="Descrição" error={fieldError("descricao")}>
                  <Input value={formState.descricao ?? ""} onChange={(event) => updateForm("descricao", event.target.value)} placeholder="Ex.: Cartucho de toner HP 85A" />
                </FormField>
                <FormField label="Unidade padrão" error={fieldError("unidadePadrao")}>
                  <Input value={formState.unidadePadrao ?? ""} onChange={(event) => updateForm("unidadePadrao", event.target.value.toUpperCase())} placeholder="UN" />
                </FormField>
                <FormField label="Valor de referência (R$)" error={fieldError("valorReferencia")}>
                  <Input type="number" step="0.01" min="0" value={formState.valorReferencia ?? ""} onChange={(event) => updateForm("valorReferencia", event.target.value)} placeholder="0,00" />
                </FormField>
              </>
            ) : null}

            {entity === "fornecedores" ? (
              <>
                <FormField label="Razão social" className="md:col-span-2" error={fieldError("razaoSocial")}>
                  <Input value={formState.razaoSocial ?? ""} onChange={(event) => updateForm("razaoSocial", event.target.value)} />
                </FormField>
                <FormField label="CNPJ" error={fieldError("cnpj")}>
                  <Input value={formState.cnpj ?? ""} onChange={(event) => updateForm("cnpj", maskCnpj(event.target.value))} />
                </FormField>
                <FormField label="Telefone" error={fieldError("telefone")}>
                  <Input value={formState.telefone ?? ""} onChange={(event) => updateForm("telefone", maskPhone(event.target.value))} />
                </FormField>
                <FormField label="E-mail" className="md:col-span-2" error={fieldError("email")}>
                  <Input type="email" value={formState.email ?? ""} onChange={(event) => updateForm("email", event.target.value)} />
                </FormField>
                <FormField label="Cidade" error={fieldError("cidade")}>
                  <Input value={formState.cidade ?? ""} onChange={(event) => updateForm("cidade", event.target.value)} />
                </FormField>
                <FormField label="UF" error={fieldError("estado")}>
                  <Input value={formState.estado ?? ""} onChange={(event) => updateForm("estado", event.target.value.toUpperCase())} maxLength={2} />
                </FormField>
              </>
            ) : null}

            {entity === "secretarias" ? (
              <>
                <FormField label="Sigla" error={fieldError("sigla")}>
                  <Input value={formState.sigla ?? ""} onChange={(event) => updateForm("sigla", event.target.value.toUpperCase())} />
                </FormField>
                <FormField label="Nome da secretaria" error={fieldError("nome")}>
                  <Input value={formState.nome ?? ""} onChange={(event) => updateForm("nome", event.target.value)} />
                </FormField>
                <FormField label="Responsável" error={fieldError("responsavel")}>
                  <Input value={formState.responsavel ?? ""} onChange={(event) => updateForm("responsavel", event.target.value)} />
                </FormField>
                <FormField label="Telefone" error={fieldError("telefone")}>
                  <Input value={formState.telefone ?? ""} onChange={(event) => updateForm("telefone", maskPhone(event.target.value))} />
                </FormField>
                <FormField label="E-mail" className="md:col-span-2" error={fieldError("email")}>
                  <Input type="email" value={formState.email ?? ""} onChange={(event) => updateForm("email", event.target.value)} />
                </FormField>
                <FormField label="Descrição" className="md:col-span-2" error={fieldError("descricao")}>
                  <Textarea value={formState.descricao ?? ""} onChange={(event) => updateForm("descricao", event.target.value)} className="border-[rgba(204,225,255,0.92)] text-[var(--color-neutral-800)] focus:border-[var(--color-primary-400)]" />
                </FormField>
              </>
            ) : null}

            {entity === "cargos" || entity === "funcoes" ? (
              <>
                <FormField label="Código" error={fieldError("codigo")}>
                  <Input value={formState.codigo ?? ""} onChange={(event) => updateForm("codigo", event.target.value.toUpperCase())} placeholder="Opcional" />
                </FormField>
                <FormField label={entity === "cargos" ? "Nome do cargo" : "Nome da função"} error={fieldError("nome")}>
                  <Input value={formState.nome ?? ""} onChange={(event) => updateForm("nome", event.target.value)} />
                </FormField>
                {entity === "cargos" ? (
                  <FormField label="Categoria" className="md:col-span-2" error={fieldError("categoria")}>
                    <Input value={formState.categoria ?? ""} onChange={(event) => updateForm("categoria", event.target.value)} placeholder="Opcional" />
                  </FormField>
                ) : null}
                <FormField label="Descrição" className="md:col-span-2" error={fieldError("descricao")}>
                  <Textarea value={formState.descricao ?? ""} onChange={(event) => updateForm("descricao", event.target.value)} className="border-[rgba(204,225,255,0.92)] text-[var(--color-neutral-800)] focus:border-[var(--color-primary-400)]" />
                </FormField>
              </>
            ) : null}

            {entity === "pessoas" || entity === "servidores" ? (
              <>
                {entity === "servidores" && !editingId ? (
                  <FormField
                    label="Pessoa já cadastrada"
                    className="md:col-span-2"
                    description="Selecione uma Pessoa para transformar o mesmo registro em Servidor, sem criar duplicata."
                  >
                    <AsyncCombobox
                      value={formState.basePessoaId || null}
                      onChange={(option) => void handleServidorPessoaSelected(option)}
                      query={queryPessoas}
                      getOptionValue={(option) => option.id}
                      getOptionLabel={lookupOptionLabel}
                      initialOption={(formState.basePessoaOption as LookupOption | null) ?? null}
                      ariaLabel="Pessoa já cadastrada"
                      renderOption={(option) => (
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate font-semibold">{lookupOptionLabel(option)}</span>
                          {lookupOptionDetails(option) ? <span className="truncate text-xs text-[var(--color-neutral-500)]">{lookupOptionDetails(option)}</span> : null}
                        </span>
                      )}
                      placeholder="Buscar Pessoa existente"
                      searchPlaceholder="Nome, CPF ou matrícula"
                      minSearchLength={2}
                      allowClear
                      disabled={identityLookupLoading}
                      createOptionLabel="Cadastrar nova pessoa"
                      onCreateOption={(searchValue) => {
                        identityLookupSequenceRef.current += 1;
                        setIdentityLookupLoading(false);
                        setFormState({
                          ...getDefaultForm("servidores"),
                          nome: searchValue,
                        });
                      }}
                    />
                  </FormField>
                ) : null}
                {entity === "servidores" && formState.basePessoaId ? (
                  <div className="md:col-span-2">
                    <Alert variant="info">
                      Os dados abaixo pertencem à Pessoa selecionada e serão salvos no mesmo cadastro. Revise e complete apenas os campos necessários.
                    </Alert>
                  </div>
                ) : null}
                <FormField label={entity === "servidores" ? "Nome do servidor" : "Nome da pessoa"} error={fieldError("nome")}>
                  <Input value={formState.nome ?? ""} onChange={(event) => updateForm("nome", event.target.value)} />
                </FormField>
                <FormField label="CPF" error={fieldError("cpf")}>
                  <Input value={formState.cpf ?? ""} onChange={(event) => updateForm("cpf", maskCpf(event.target.value))} placeholder="Somente números ou CPF formatado" />
                </FormField>
                <FormField label="Matrícula" error={fieldError("matricula")}>
                  <Input value={formState.matricula ?? ""} onChange={(event) => updateForm("matricula", event.target.value)} />
                </FormField>
                <FormField label="Data de nascimento" error={fieldError("dataNascimento")}>
                  <Input type="date" value={formState.dataNascimento ?? ""} onChange={(event) => updateForm("dataNascimento", event.target.value)} />
                </FormField>
                {possibleDuplicatePeople.length ? (
                  <div className="md:col-span-2">
                    <Alert variant="info">
                      <div className="space-y-2">
                        <p>Encontramos Pessoas com nome semelhante. Selecione uma para evitar duplicidade.</p>
                        <div className="flex flex-wrap gap-2">
                          {possibleDuplicatePeople.slice(0, 3).map((option) => (
                            <Button key={option.id} variant="outline" size="sm" onClick={() => void handlePotentialDuplicateSelected(option)}>
                              {lookupOptionLabel(option)}
                              {lookupOptionDetails(option) ? ` · ${lookupOptionDetails(option)}` : ""}
                            </Button>
                          ))}
                        </div>
                      </div>
                    </Alert>
                  </div>
                ) : null}
                <FormField label="Cargo" error={fieldError("cargoId")}>
                  <AsyncCombobox
                    value={formState.cargoId || null}
                    onChange={(option) => updateLookupForm("cargoId", "cargoOption", option)}
                    query={queryCargos}
                    getOptionValue={(option) => option.id}
                    getOptionLabel={lookupOptionLabel}
                    initialOption={(formState.cargoOption as LookupOption | null) ?? null}
                    ariaLabel="Cargo"
                    placeholder={formState.cargo ? `${formState.cargo} (legado)` : "Selecione o cargo"}
                    searchPlaceholder="Buscar cargo"
                    minSearchLength={0}
                    allowClear={entity === "pessoas"}
                  />
                </FormField>
                <FormField label="Função" error={fieldError("funcaoId")}>
                  <AsyncCombobox
                    value={formState.funcaoId || null}
                    onChange={(option) => updateLookupForm("funcaoId", "funcaoOption", option)}
                    query={queryFuncoes}
                    getOptionValue={(option) => option.id}
                    getOptionLabel={lookupOptionLabel}
                    initialOption={(formState.funcaoOption as LookupOption | null) ?? null}
                    ariaLabel="Função"
                    placeholder="Sem função"
                    searchPlaceholder="Buscar função"
                    minSearchLength={0}
                    allowClear
                  />
                </FormField>
                <FormField label="Secretaria" error={fieldError("secretariaId")}>
                  <AsyncCombobox
                    value={formState.secretariaId || null}
                    onChange={(option) => updateLookupForm("secretariaId", "secretariaOption", option)}
                    query={querySecretarias}
                    getOptionValue={(option) => option.id}
                    getOptionLabel={(option) => option.sigla ? `${option.sigla} - ${lookupOptionLabel(option)}` : lookupOptionLabel(option)}
                    initialOption={(formState.secretariaOption as LookupOption | null) ?? null}
                    ariaLabel="Secretaria da pessoa ou servidor"
                    placeholder={entity === "servidores" ? "Selecione a secretaria" : "Sem vínculo"}
                    searchPlaceholder="Nome ou sigla"
                    minSearchLength={0}
                    allowClear={entity === "pessoas"}
                  />
                </FormField>
              </>
            ) : null}

            {entity === "departamentos" ? (
              <>
                <FormField label="Nome do departamento" error={fieldError("nome")}>
                  <Input value={formState.nome ?? ""} onChange={(event) => updateForm("nome", event.target.value)} />
                </FormField>
                <FormField label="Centro de custo" error={fieldError("codigoCentroCusto")}>
                  <Input value={formState.codigoCentroCusto ?? ""} onChange={(event) => updateForm("codigoCentroCusto", event.target.value.toUpperCase())} />
                </FormField>
                <FormField label="Secretaria" error={fieldError("secretariaId")}>
                  <AsyncCombobox
                    value={formState.secretariaId || null}
                    onChange={(option) => {
                      setFormState((current) => ({
                        ...current,
                        secretariaId: option ? String(option.id) : "",
                        secretariaOption: option,
                        responsavelId: "",
                        responsavelOption: null,
                      }));
                    }}
                    query={querySecretarias}
                    getOptionValue={(option) => option.id}
                    getOptionLabel={(option) => option.sigla ? `${option.sigla} - ${lookupOptionLabel(option)}` : lookupOptionLabel(option)}
                    initialOption={(formState.secretariaOption as LookupOption | null) ?? null}
                    ariaLabel="Secretaria do departamento"
                    placeholder="Selecione a secretaria"
                    searchPlaceholder="Nome ou sigla"
                    minSearchLength={0}
                  />
                </FormField>
                <FormField label="Responsável" error={fieldError("responsavelId")}>
                  <AsyncCombobox
                    value={formState.responsavelId || null}
                    onChange={(option) => updateLookupForm("responsavelId", "responsavelOption", option)}
                    query={queryResponsaveis}
                    getOptionValue={(option) => option.id}
                    getOptionLabel={lookupOptionLabel}
                    initialOption={(formState.responsavelOption as LookupOption | null) ?? null}
                    ariaLabel="Responsável pelo departamento"
                    renderOption={(option) => (
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate font-semibold">{lookupOptionLabel(option)}</span>
                        {lookupOptionDetails(option) ? <span className="truncate text-xs text-[var(--color-neutral-500)]">{lookupOptionDetails(option)}</span> : null}
                      </span>
                    )}
                    placeholder="Não definir"
                    searchPlaceholder="Buscar servidor responsável"
                    minSearchLength={2}
                    allowClear
                    disabled={!formState.secretariaId}
                  />
                </FormField>
                <FormField label="Descrição" className="md:col-span-2" error={fieldError("descricao")}>
                  <Textarea value={formState.descricao ?? ""} onChange={(event) => updateForm("descricao", event.target.value)} className="border-[rgba(204,225,255,0.92)] text-[var(--color-neutral-800)] focus:border-[var(--color-primary-400)]" />
                </FormField>
              </>
            ) : null}

            {entity === "usuarios" ? (
              <>
                {!editingId ? (
                  <FormField label="Login" error={fieldError("username")}>
                    <Input value={formState.username ?? ""} onChange={(event) => updateForm("username", event.target.value)} />
                  </FormField>
                ) : null}
                <FormField label="Nome" error={fieldError("name")}>
                  <Input value={formState.name ?? ""} onChange={(event) => updateForm("name", event.target.value)} />
                </FormField>
                {possibleDuplicatePeople.length ? (
                  <div className="md:col-span-2">
                    <Alert variant="info">
                      <div className="space-y-2">
                        <p>Encontramos Pessoas com nome semelhante. Vincule a identidade correta para evitar duplicidade.</p>
                        <div className="flex flex-wrap gap-2">
                          {possibleDuplicatePeople.slice(0, 3).map((option) => (
                            <Button key={option.id} variant="outline" size="sm" onClick={() => void handleUsuarioPessoaSelected(option)}>
                              {lookupOptionLabel(option)}
                            </Button>
                          ))}
                        </div>
                      </div>
                    </Alert>
                  </div>
                ) : null}
                <FormField label="Perfil" error={fieldError("role")}>
                  <Select value={formState.role ?? "operador"} onChange={(event) => updateForm("role", event.target.value)}>
                    {optionsQuery.data?.userRoles.map((item) => (
                      <option key={item.codigo} value={item.codigo}>{item.nome}</option>
                    ))}
                  </Select>
                </FormField>
                <FormField label="Secretaria" error={fieldError("secretariaId")}>
                  <AsyncCombobox
                    value={formState.secretariaId || null}
                    onChange={(option) => updateLookupForm("secretariaId", "secretariaOption", option)}
                    query={querySecretarias}
                    getOptionValue={(option) => option.id}
                    getOptionLabel={(option) => option.sigla ? `${option.sigla} - ${lookupOptionLabel(option)}` : lookupOptionLabel(option)}
                    initialOption={(formState.secretariaOption as LookupOption | null) ?? null}
                    ariaLabel="Secretaria do usuário"
                    placeholder="Sem vínculo"
                    searchPlaceholder="Nome ou sigla"
                    minSearchLength={0}
                    allowClear
                  />
                </FormField>
                <FormField label="Pessoa/servidor vinculado" className="md:col-span-2" error={fieldError("pessoaId")}>
                  <AsyncCombobox
                    value={formState.pessoaId || null}
                    onChange={(option) => void handleUsuarioPessoaSelected(option)}
                    query={queryPessoas}
                    getOptionValue={(option) => option.id}
                    getOptionLabel={lookupOptionLabel}
                    initialOption={(formState.pessoaOption as LookupOption | null) ?? null}
                    ariaLabel="Pessoa ou servidor vinculado ao usuário"
                    renderOption={(option) => (
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate font-semibold">{lookupOptionLabel(option)}</span>
                        {lookupOptionDetails(option) ? <span className="truncate text-xs text-[var(--color-neutral-500)]">{lookupOptionDetails(option)}</span> : null}
                      </span>
                    )}
                    placeholder="Sem vínculo de identidade"
                    searchPlaceholder="Nome, CPF ou matrícula"
                    minSearchLength={2}
                    allowClear
                    disabled={identityLookupLoading}
                  />
                </FormField>
                <div className="md:col-span-2">
                  <Alert variant={resolveCadastroIdentityStatus({
                    pessoaId: formState.pessoaId ? Number(formState.pessoaId) : null,
                    identityStatus: formState.identityStatus,
                  }) === "conflito" ? "error" : "info"}>
                    Status: {identityStatusLabels[resolveCadastroIdentityStatus({
                      pessoaId: formState.pessoaId ? Number(formState.pessoaId) : null,
                      identityStatus: formState.identityStatus,
                    })]}
                  </Alert>
                </div>
                <FormField label="E-mail" className="md:col-span-2" error={fieldError("email")}>
                  <Input type="email" value={formState.email ?? ""} onChange={(event) => updateForm("email", event.target.value)} />
                </FormField>
                {!editingId ? (
                  <FormField label="Senha inicial" className="md:col-span-2" error={fieldError("password")}>
                    <Input type="password" value={formState.password ?? ""} onChange={(event) => updateForm("password", event.target.value)} />
                  </FormField>
                ) : null}
              </>
            ) : null}

            {entity === "parametros" ? (
              <>
                <FormField label="Categoria" error={fieldError("categoria")}>
                  <Input value={formState.categoria ?? ""} onChange={(event) => updateForm("categoria", event.target.value.toUpperCase())} />
                </FormField>
                <FormField label="Chave" error={fieldError("chave")}>
                  <Input value={formState.chave ?? ""} onChange={(event) => updateForm("chave", event.target.value.toUpperCase())} />
                </FormField>
                <FormField label="Valor" className="md:col-span-2" error={fieldError("valor")}>
                  <Input value={formState.valor ?? ""} onChange={(event) => updateForm("valor", event.target.value)} />
                </FormField>
                <FormField label="Descrição" className="md:col-span-2" error={fieldError("descricao")}>
                  <Textarea value={formState.descricao ?? ""} onChange={(event) => updateForm("descricao", event.target.value)} className="border-[rgba(204,225,255,0.92)] text-[var(--color-neutral-800)] focus:border-[var(--color-primary-400)]" />
                </FormField>
              </>
            ) : null}
          </div>

          {(entity === "itens" || entity === "fornecedores") ? (
            <div className="rounded-[24px] border border-[rgba(204,225,255,0.92)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(230,240,255,0.68))] p-4">
              <div className="grid gap-4 md:grid-cols-[180px_minmax(0,1fr)] md:items-start">
                <div className="overflow-hidden rounded-[22px] border border-[rgba(204,225,255,0.92)] bg-white p-3">
                  {assetProcessing ? (
                    <div className="flex h-36 items-center justify-center rounded-[16px] bg-[var(--color-neutral-50)]">
                      <Skeleton className="h-full w-full rounded-[16px]" />
                    </div>
                  ) : assetPreviewUrl ? (
                    <img
                      src={assetPreviewUrl}
                      alt={entity === "itens" ? "Imagem do item" : "Logo do fornecedor"}
                      className="h-36 w-full rounded-[16px] object-cover"
                    />
                  ) : (
                    <div className="flex h-36 items-center justify-center rounded-[16px] bg-[var(--color-neutral-50)] text-center text-sm font-semibold text-[var(--color-neutral-500)]">
                      Nenhum arquivo selecionado
                    </div>
                  )}
                </div>
                <div className="space-y-3">
                  <FormField
                    label={entity === "itens" ? "Imagem de referência" : "Logo do fornecedor"}
                    description="Envie PNG, JPG ou WEBP com até 10 MB. O novo arquivo substitui o anterior."
                  >
                    <Input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(event) => handleAssetSelected(event.target.files?.[0] ?? null)}
                    />
                  </FormField>
                  {assetError ? <Alert variant="error">{assetError}</Alert> : null}
                  {assetFile ? (
                    <div className="grid gap-3 rounded-[20px] border border-[rgba(204,225,255,0.92)] bg-white/90 p-4">
                      <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-primary-800)]">
                        <ImagePlus className="h-4 w-4" />
                        Ajuste fino do recorte
                      </div>
                      <FormField label={`Zoom (${assetCrop.zoom.toFixed(1)}x)`}>
                        <input
                          type="range"
                          min="1"
                          max="3"
                          step="0.1"
                          value={assetCrop.zoom}
                          onChange={(event) => setAssetCrop((current) => ({ ...current, zoom: Number(event.target.value) }))}
                        />
                      </FormField>
                      <FormField label={`Deslocamento horizontal (${assetCrop.offsetX})`}>
                        <input
                          type="range"
                          min="-100"
                          max="100"
                          step="1"
                          value={assetCrop.offsetX}
                          onChange={(event) => setAssetCrop((current) => ({ ...current, offsetX: Number(event.target.value) }))}
                        />
                      </FormField>
                      <FormField label={`Deslocamento vertical (${assetCrop.offsetY})`}>
                        <input
                          type="range"
                          min="-100"
                          max="100"
                          step="1"
                          value={assetCrop.offsetY}
                          onChange={(event) => setAssetCrop((current) => ({ ...current, offsetY: Number(event.target.value) }))}
                        />
                      </FormField>
                    </div>
                  ) : null}
                  <p className="text-sm text-[var(--color-neutral-600)]">
                    {entity === "itens"
                      ? "A imagem ajuda na identificação rápida do item no catálogo e nas próximas seleções da DFD."
                      : "A logo facilita a conferência visual do fornecedor nas consultas e cadastros relacionados."}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          <label className="inline-flex items-center gap-3 rounded-2xl border border-[rgba(204,225,255,0.92)] bg-[var(--color-primary-50)] px-4 py-3 text-sm font-semibold text-[var(--color-neutral-700)]">
            <input type="checkbox" checked={!!formState.ativo} onChange={(event) => updateForm("ativo", event.target.checked)} className="h-4 w-4 rounded border-[var(--color-neutral-300)] text-[var(--color-primary-600)]" />
            Registro ativo
          </label>

          <div className="flex flex-wrap justify-end gap-2 border-t border-[rgba(204,225,255,0.92)] pt-4">
            <Button variant="outline" onClick={closeModal}>Cancelar</Button>
            <Button type="submit" loading={saveMutation.isPending} icon={<UserCog className="h-4 w-4" />}>
              {editingId ? "Salvar alterações" : `Cadastrar ${meta.singular}`}
            </Button>
          </div>
        </form>
        )}
      </Modal>

      <Modal
        open={Boolean(winnerLinkModal)}
        onClose={closeWinnerLinkModal}
        size="xl"
        title={
          winnerLinkModal?.mode === "process"
            ? `Revisão em lote do processo ${winnerLinkModal.numeroSirel}`
            : winnerLinkModal
              ? `Vincular fornecedor do item ${winnerLinkModal.row.numeroItem}`
              : "Vincular fornecedor"
        }
        description={
          winnerLinkModal?.mode === "process"
            ? "Selecione os itens pendentes do mesmo processo, escolha o cadastro correto do fornecedor e confirme a atualização em lote."
            : winnerLinkModal?.mode === "single"
              ? "Escolha manualmente o cadastro do fornecedor vencedor para este item importado."
              : undefined
        }
      >
        {winnerLinkModal ? (
          <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
              <Card className="space-y-4">
                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-primary-600)]">
                    Seleção do fornecedor
                  </p>
                  <FormField
                    label="Buscar fornecedor"
                    description="Pesquise por razão social ou CNPJ para localizar o cadastro correto."
                  >
                    <Input
                      value={winnerLinkFornecedorSearch}
                      onChange={(event) => setWinnerLinkFornecedorSearch(event.target.value)}
                      placeholder="Ex.: HF Suzarte ou 12.345.678/0001-90"
                    />
                  </FormField>
                </div>

                <div className="max-h-[360px] space-y-2 overflow-auto rounded-[24px] border border-[rgba(204,225,255,0.92)] bg-[var(--color-neutral-50)] p-3">
                  {winnerLinkFornecedorCandidates.length ? (
                    winnerLinkFornecedorCandidates.map((item) => {
                      const selected = Number(winnerLinkFornecedorId) === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setWinnerLinkFornecedorId(String(item.id))}
                          className={[
                            "w-full rounded-2xl border px-3 py-3 text-left transition",
                            selected
                              ? "border-[rgba(47,84,196,0.32)] bg-[var(--color-primary-50)]"
                              : "border-[rgba(204,225,255,0.92)] bg-white hover:border-[rgba(47,84,196,0.22)]",
                          ].join(" ")}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-[var(--color-primary-900)]">{item.razaoSocial}</p>
                              <p className="text-xs text-[var(--color-neutral-500)]">
                                {item.cnpj ? formatCnpj(item.cnpj) : "Sem CNPJ"}
                              </p>
                            </div>
                            {selected ? (
                              <span className="rounded-full bg-[var(--color-primary-100)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--color-primary-800)]">
                                Selecionado
                              </span>
                            ) : null}
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    <Alert variant="info">
                      Nenhum fornecedor encontrado com este filtro. Ajuste a busca para localizar o cadastro correto.
                    </Alert>
                  )}
                </div>

                <FormField
                  label="Observação de auditoria"
                  description="Texto livre curto para explicar a decisão manual."
                >
                  <Textarea
                    value={winnerLinkReason}
                    onChange={(event) => setWinnerLinkReason(event.target.value)}
                    className="border-[rgba(204,225,255,0.92)] text-[var(--color-neutral-800)] focus:border-[var(--color-primary-400)]"
                  />
                </FormField>
              </Card>

              <Card className="space-y-4">
                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-primary-600)]">
                    Contexto da revisão
                  </p>
                  {winnerLinkModal.mode === "single" ? (
                    <div className="rounded-[24px] border border-[rgba(204,225,255,0.92)] bg-[var(--color-neutral-50)] p-4">
                      <p className="font-semibold text-[var(--color-primary-900)]">
                        Processo {winnerLinkModal.row.numeroSirel}
                      </p>
                      <p className="mt-1 text-sm text-[var(--color-neutral-600)]">
                        Item {winnerLinkModal.row.numeroItem} • {winnerLinkModal.row.itemDescricao}
                      </p>
                      <p className="mt-2 text-sm text-[var(--color-neutral-600)]">
                        Vencedor legado:{" "}
                        <span className="font-semibold text-[var(--color-primary-900)]">
                          {winnerLinkModal.row.fornecedorVencedorNome ?? "Sem nome"}
                        </span>
                      </p>
                      {winnerLinkModal.row.reasonSummary.length ? (
                        <p className="mt-2 text-xs text-[var(--color-neutral-500)]">
                          {winnerLinkModal.row.reasonSummary.join(" • ")}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-full bg-[var(--color-primary-100)] px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-primary-800)]">
                          Processo {winnerLinkModal.numeroSirel}
                        </span>
                        <span className="rounded-full bg-[var(--color-neutral-100)] px-3 py-1 text-xs font-semibold text-[var(--color-neutral-700)]">
                          {winnerLinkSelectedIds.length} item(ns) selecionado(s)
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setWinnerLinkSelectedIds(processWinnerBackfillRows.map((row) => row.id))}
                          disabled={!processWinnerBackfillRows.length}
                        >
                          Selecionar todos
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setWinnerLinkSelectedIds([])}
                          disabled={!winnerLinkSelectedIds.length}
                        >
                          Limpar seleção
                        </Button>
                      </div>

                      {processWinnerBackfillQuery.isLoading ? (
                        <div className="space-y-2">
                          {Array.from({ length: 3 }).map((_, index) => (
                            <Skeleton key={index} className="h-16 w-full rounded-[20px]" />
                          ))}
                        </div>
                      ) : (
                        <div className="max-h-[360px] overflow-auto rounded-[24px] border border-[rgba(204,225,255,0.92)] bg-[var(--color-neutral-50)]">
                          <Table className="min-w-[560px]">
                            <TableHead>
                              <tr>
                                <TableHeaderCell className="w-12">Sel.</TableHeaderCell>
                                <TableHeaderCell>Item</TableHeaderCell>
                                <TableHeaderCell>Vencedor legado</TableHeaderCell>
                              </tr>
                            </TableHead>
                            <TableBody>
                              {processWinnerBackfillRows.map((row) => (
                                <TableRow key={row.id}>
                                  <TableCell>
                                    <input
                                      type="checkbox"
                                      checked={winnerLinkSelectedIds.includes(row.id)}
                                      onChange={() => toggleWinnerLinkRowSelection(row.id)}
                                      className="h-4 w-4 rounded border-[var(--color-neutral-300)]"
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <div className="font-semibold text-[var(--color-primary-900)]">
                                      Item {row.numeroItem}
                                    </div>
                                    <div className="text-sm text-[var(--color-neutral-600)]">
                                      {row.itemDescricao}
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <div className="font-semibold text-[var(--color-primary-900)]">
                                      {row.fornecedorVencedorNome ?? "Sem nome"}
                                    </div>
                                    <div className="text-xs text-[var(--color-neutral-500)]">
                                      {row.fornecedorVencedorCnpj ? formatCnpj(row.fornecedorVencedorCnpj) : "Sem CNPJ"}
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="rounded-[24px] border border-[rgba(204,225,255,0.92)] bg-[var(--color-neutral-50)] p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-primary-600)]">
                    Fornecedor escolhido
                  </p>
                  <p className="mt-2 font-semibold text-[var(--color-primary-900)]">
                    {winnerLinkSelectedFornecedor?.razaoSocial ?? "Nenhum fornecedor selecionado"}
                  </p>
                  <p className="text-xs text-[var(--color-neutral-500)]">
                    {winnerLinkSelectedFornecedor?.cnpj
                      ? formatCnpj(winnerLinkSelectedFornecedor.cnpj)
                      : winnerLinkSelectedFornecedor
                        ? "Sem CNPJ"
                        : "Use a busca ao lado para localizar o cadastro correto."}
                  </p>
                </div>

                <div className="flex flex-wrap justify-end gap-2 border-t border-[rgba(204,225,255,0.92)] pt-4">
                  <Button variant="outline" onClick={closeWinnerLinkModal}>
                    Cancelar
                  </Button>
                  {winnerLinkModal.mode === "process" ? (
                    <Button
                      onClick={() => void handleConfirmFornecedorWinnerBatch()}
                      loading={confirmFornecedorWinnerBackfillBatchMutation.isPending}
                      icon={<CheckCheck className="h-4 w-4" />}
                    >
                      Aplicar em lote
                    </Button>
                  ) : (
                    <Button
                      onClick={() => void handleConfirmFornecedorWinnerLink(winnerLinkModal.row)}
                      loading={confirmFornecedorWinnerBackfillMutation.isPending}
                      icon={<CheckCheck className="h-4 w-4" />}
                    >
                      Confirmar vínculo
                    </Button>
                  )}
                </div>
              </Card>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        size="md"
        title={`Exportação avançada de ${meta.label}`}
        description="Escolha o escopo dos dados e o formato do arquivo para exportação local."
      >
        <div className="space-y-4">
          <FormField label="Escopo">
            <Select value={exportScope} onChange={(event) => setExportScope(event.target.value as ExportScope)}>
              <option value="page">Página atual</option>
              <option value="selected" disabled={!selectedIds.length}>Selecionados ({selectedIds.length})</option>
              <option value="all">Todos os filtrados</option>
            </Select>
          </FormField>
          <FormField label="Formato">
            <Select value={exportFormat} onChange={(event) => setExportFormat(event.target.value as ExportFormat)}>
              <option value="xlsx">XLSX</option>
              <option value="csv">CSV</option>
              <option value="pdf">PDF</option>
            </Select>
          </FormField>
          <Alert variant="info">
            Os filtros atuais da tela serão respeitados. No escopo selecionado, a exportação pode incluir registros de outras páginas.
          </Alert>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setExportModalOpen(false)}>Cancelar</Button>
            <Button onClick={() => void handleAdvancedExport()} icon={<Download className="h-4 w-4" />}>
              Exportar
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(auditDetail)}
        onClose={() => setAuditDetail(null)}
        size="xl"
        title="Detalhe da auditoria"
        description={auditDetail ? `${auditActionLabels[auditDetail.acao] ?? auditDetail.acao} em ${formatShortDateTimeBR(auditDetail.criadoEm)} por ${auditDetail.usuarioNome ?? "Sistema"}.` : undefined}
      >
        {auditDetail ? (
          <div className="grid gap-4 xl:grid-cols-2">
            <Card className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">Dados anteriores</p>
              <pre className="max-h-[420px] overflow-auto rounded-[20px] bg-[var(--color-neutral-50)] p-4 text-xs text-[var(--color-neutral-700)]">
                {stringifyAuditValue(auditDetail.dadosAnteriores)}
              </pre>
            </Card>
            <Card className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">Dados novos</p>
              <pre className="max-h-[420px] overflow-auto rounded-[20px] bg-[var(--color-neutral-50)] p-4 text-xs text-[var(--color-neutral-700)]">
                {stringifyAuditValue(auditDetail.dadosNovos)}
              </pre>
            </Card>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}




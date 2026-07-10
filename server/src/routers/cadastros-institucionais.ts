import { TRPCError } from "@trpc/server";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  or,
} from "drizzle-orm";

import {
  atoDesignacaoGetInputSchema,
  atoDesignacaoListInputSchema,
  atoDesignacaoSaveInputSchema,
  cadastroInstitucionalIdInputSchema,
  designacoesForProcessInputSchema,
  designacoesSelectForLicitacaoInputSchema,
  grupoInstitucionalGetInputSchema,
  grupoInstitucionalListInputSchema,
  grupoInstitucionalSaveInputSchema,
  ordenadorDespesaGetInputSchema,
  ordenadorDespesaListInputSchema,
  ordenadorDespesaSaveInputSchema,
  type GrupoInstitucionalMembroFuncao,
  type GrupoInstitucionalTipo,
} from "@sirel/shared/schemas/cadastros-institucionais";

import { logAuditoria } from "../db/auditoria.js";
import { requireDb } from "../db/client.js";
import {
  atosDesignacao,
  gruposInstitucionais,
  gruposInstitucionaisMembros,
  licitacoes,
  ordenadoresDespesa,
  ordenadoresDespesaSecretarias,
  pessoas,
  processos,
  secretarias,
} from "../db/schema.js";
import { gestorProcedure, operadorProcedure, protectedProcedure, router } from "../trpc.js";

type DbClient = ReturnType<typeof requireDb>;

function toNullableText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function toNullableDate(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function resolveReferenceDate(value: string | null | undefined) {
  return toNullableDate(value) ?? new Date().toISOString().slice(0, 10);
}

function normalizeCpf(value: string | null | undefined) {
  return String(value ?? "").replace(/\D+/g, "");
}

function buildAtoLabel(ato: {
  tipo: string;
  numero: string;
  ano: number;
}) {
  return `${ato.tipo} n. ${ato.numero}/${ato.ano}`;
}

function groupTypeLabel(tipo: GrupoInstitucionalTipo) {
  return tipo === "COMISSAO_CONTRATACAO"
    ? "comissao"
    : "equipe de apoio";
}

async function ensureLicitacao(db: DbClient, processoId: number) {
  const [existing] = await db
    .select()
    .from(licitacoes)
    .where(eq(licitacoes.processoId, processoId))
    .limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(licitacoes)
    .values({
      processoId,
      statusLicitacao: "PREPARACAO",
      criadoEm: new Date(),
      atualizadoEm: new Date(),
    })
    .returning();
  return created;
}

async function listGroupMembers(db: DbClient, grupoIds: number[]) {
  if (!grupoIds.length) return new Map<number, any[]>();
  const rows = await db
    .select({
      id: gruposInstitucionaisMembros.id,
      grupoId: gruposInstitucionaisMembros.grupoId,
      pessoaId: pessoas.id,
      pessoaNome: pessoas.nome,
      pessoaCpf: pessoas.cpf,
      pessoaCargo: pessoas.cargo,
      pessoaSecretariaId: pessoas.secretariaId,
      funcao: gruposInstitucionaisMembros.funcao,
      ordem: gruposInstitucionaisMembros.ordem,
      titular: gruposInstitucionaisMembros.titular,
      ativo: gruposInstitucionaisMembros.ativo,
    })
    .from(gruposInstitucionaisMembros)
    .innerJoin(pessoas, eq(pessoas.id, gruposInstitucionaisMembros.pessoaId))
    .where(inArray(gruposInstitucionaisMembros.grupoId, grupoIds))
    .orderBy(
      asc(gruposInstitucionaisMembros.grupoId),
      asc(gruposInstitucionaisMembros.ordem),
      asc(pessoas.nome),
    );

  const map = new Map<number, any[]>();
  rows.forEach((row) => {
    map.set(row.grupoId, [...(map.get(row.grupoId) ?? []), row]);
  });
  return map;
}

async function listOrdenadorSecretarias(db: DbClient, ordenadorIds: number[]) {
  if (!ordenadorIds.length) return new Map<number, any[]>();
  const rows = await db
    .select({
      ordenadorDespesaId: ordenadoresDespesaSecretarias.ordenadorDespesaId,
      secretariaId: secretarias.id,
      secretariaNome: secretarias.nome,
      secretariaSigla: secretarias.sigla,
    })
    .from(ordenadoresDespesaSecretarias)
    .innerJoin(
      secretarias,
      eq(secretarias.id, ordenadoresDespesaSecretarias.secretariaId),
    )
    .where(
      inArray(ordenadoresDespesaSecretarias.ordenadorDespesaId, ordenadorIds),
    )
    .orderBy(asc(secretarias.nome));

  const map = new Map<number, any[]>();
  rows.forEach((row) => {
    map.set(row.ordenadorDespesaId, [
      ...(map.get(row.ordenadorDespesaId) ?? []),
      row,
    ]);
  });
  return map;
}

async function loadGroupDetail(db: DbClient, id: number) {
  const [row] = await db
    .select({
      id: gruposInstitucionais.id,
      nome: gruposInstitucionais.nome,
      tipo: gruposInstitucionais.tipo,
      sigla: gruposInstitucionais.sigla,
      secretariaId: gruposInstitucionais.secretariaId,
      secretariaNome: secretarias.nome,
      secretariaSigla: secretarias.sigla,
      atoDesignacaoId: gruposInstitucionais.atoDesignacaoId,
      atoNumero: atosDesignacao.numero,
      atoAno: atosDesignacao.ano,
      atoTipo: atosDesignacao.tipo,
      atoEmenta: atosDesignacao.ementa,
      atoArquivoUrl: atosDesignacao.arquivoUrl,
      atoArquivoChave: atosDesignacao.arquivoChave,
      atoMimeType: atosDesignacao.mimeType,
      atoTamanhoBytes: atosDesignacao.tamanhoBytes,
      atoHashArquivo: atosDesignacao.hashArquivo,
      vigenciaInicio: gruposInstitucionais.vigenciaInicio,
      vigenciaFim: gruposInstitucionais.vigenciaFim,
      versao: gruposInstitucionais.versao,
      substituiGrupoId: gruposInstitucionais.substituiGrupoId,
      observacao: gruposInstitucionais.observacao,
      ativo: gruposInstitucionais.ativo,
      criadoEm: gruposInstitucionais.criadoEm,
      atualizadoEm: gruposInstitucionais.atualizadoEm,
    })
    .from(gruposInstitucionais)
    .innerJoin(
      atosDesignacao,
      eq(atosDesignacao.id, gruposInstitucionais.atoDesignacaoId),
    )
    .leftJoin(secretarias, eq(secretarias.id, gruposInstitucionais.secretariaId))
    .where(eq(gruposInstitucionais.id, id))
    .limit(1);
  if (!row) return null;
  const members = await listGroupMembers(db, [id]);
  return {
    ...row,
    ato: {
      id: row.atoDesignacaoId,
      numero: row.atoNumero,
      ano: row.atoAno,
      tipo: row.atoTipo,
      ementa: row.atoEmenta,
      arquivoUrl: row.atoArquivoUrl,
      arquivoChave: row.atoArquivoChave,
      mimeType: row.atoMimeType,
      tamanhoBytes: row.atoTamanhoBytes,
      hashArquivo: row.atoHashArquivo,
      label: buildAtoLabel({
        tipo: row.atoTipo,
        numero: row.atoNumero,
        ano: row.atoAno,
      }),
    },
    membros: members.get(id) ?? [],
  };
}

async function loadOrdenadorDetail(db: DbClient, id: number) {
  const [row] = await db
    .select({
      id: ordenadoresDespesa.id,
      pessoaId: pessoas.id,
      pessoaNome: pessoas.nome,
      pessoaCpf: pessoas.cpf,
      pessoaCargo: pessoas.cargo,
      atoDesignacaoId: ordenadoresDespesa.atoDesignacaoId,
      atoNumero: atosDesignacao.numero,
      atoAno: atosDesignacao.ano,
      atoTipo: atosDesignacao.tipo,
      atoEmenta: atosDesignacao.ementa,
      atoArquivoUrl: atosDesignacao.arquivoUrl,
      atoArquivoChave: atosDesignacao.arquivoChave,
      atoMimeType: atosDesignacao.mimeType,
      atoTamanhoBytes: atosDesignacao.tamanhoBytes,
      atoHashArquivo: atosDesignacao.hashArquivo,
      tipoVinculo: ordenadoresDespesa.tipoVinculo,
      vigenciaInicio: ordenadoresDespesa.vigenciaInicio,
      vigenciaFim: ordenadoresDespesa.vigenciaFim,
      versao: ordenadoresDespesa.versao,
      observacao: ordenadoresDespesa.observacao,
      ativo: ordenadoresDespesa.ativo,
      criadoEm: ordenadoresDespesa.criadoEm,
      atualizadoEm: ordenadoresDespesa.atualizadoEm,
    })
    .from(ordenadoresDespesa)
    .innerJoin(pessoas, eq(pessoas.id, ordenadoresDespesa.pessoaId))
    .innerJoin(
      atosDesignacao,
      eq(atosDesignacao.id, ordenadoresDespesa.atoDesignacaoId),
    )
    .where(eq(ordenadoresDespesa.id, id))
    .limit(1);
  if (!row) return null;
  const secretariasMap = await listOrdenadorSecretarias(db, [id]);
  return {
    ...row,
    ato: {
      id: row.atoDesignacaoId,
      numero: row.atoNumero,
      ano: row.atoAno,
      tipo: row.atoTipo,
      ementa: row.atoEmenta,
      arquivoUrl: row.atoArquivoUrl,
      arquivoChave: row.atoArquivoChave,
      mimeType: row.atoMimeType,
      tamanhoBytes: row.atoTamanhoBytes,
      hashArquivo: row.atoHashArquivo,
      label: buildAtoLabel({
        tipo: row.atoTipo,
        numero: row.atoNumero,
        ano: row.atoAno,
      }),
    },
    pessoa: {
      id: row.pessoaId,
      nome: row.pessoaNome,
      cpf: row.pessoaCpf,
      cargo: row.pessoaCargo,
    },
    secretarias: secretariasMap.get(id) ?? [],
  };
}

function buildGroupSnapshot(group: Awaited<ReturnType<typeof loadGroupDetail>>) {
  if (!group) return null;
  return {
    id: group.id,
    nome: group.nome,
    tipo: group.tipo,
    sigla: group.sigla,
    secretaria: group.secretariaId
      ? {
          id: group.secretariaId,
          nome: group.secretariaNome,
          sigla: group.secretariaSigla,
        }
      : null,
    ato: group.ato,
    vigenciaInicio: group.vigenciaInicio,
    vigenciaFim: group.vigenciaFim,
    versao: group.versao,
    membros: group.membros.map((member) => ({
      pessoaId: member.pessoaId,
      nome: member.pessoaNome,
      cpf: member.pessoaCpf,
      cargo: member.pessoaCargo,
      funcao: member.funcao,
      ordem: member.ordem,
      titular: member.titular,
    })),
  };
}

function buildOrdenadorSnapshot(
  ordenador: Awaited<ReturnType<typeof loadOrdenadorDetail>>,
) {
  if (!ordenador) return null;
  return {
    id: ordenador.id,
    pessoa: ordenador.pessoa,
    tipoVinculo: ordenador.tipoVinculo,
    versao: ordenador.versao,
    ato: ordenador.ato,
    vigenciaInicio: ordenador.vigenciaInicio,
    vigenciaFim: ordenador.vigenciaFim,
    secretarias: ordenador.secretarias.map((item) => ({
      id: item.secretariaId,
      nome: item.secretariaNome,
      sigla: item.secretariaSigla,
    })),
  };
}

async function validateGroupMemberPeople(
  db: DbClient,
  membros: Array<{ pessoaId: number }>,
) {
  const pessoaIds = membros.map((member) => member.pessoaId);
  const uniquePessoaIds = Array.from(new Set(pessoaIds));
  if (uniquePessoaIds.length !== pessoaIds.length) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "A mesma pessoa nao pode aparecer mais de uma vez na composicao.",
    });
  }

  const selectedPeople = await db
    .select({
      id: pessoas.id,
      nome: pessoas.nome,
      cpf: pessoas.cpf,
      ativo: pessoas.ativo,
    })
    .from(pessoas)
    .where(inArray(pessoas.id, uniquePessoaIds));

  if (selectedPeople.length !== uniquePessoaIds.length) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "A composicao possui pessoa inexistente no catalogo.",
    });
  }

  const peopleByCpf = new Map<string, { id: number; nome: string }>();
  for (const pessoa of selectedPeople) {
    if (!pessoa.ativo) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Pessoa inativa na composicao: ${pessoa.nome}. Reative ou substitua antes de salvar.`,
      });
    }
    const cpf = normalizeCpf(pessoa.cpf);
    if (!cpf) continue;
    const duplicated = peopleByCpf.get(cpf);
    if (duplicated) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `CPF duplicado na composicao: ${duplicated.nome} e ${pessoa.nome}. Revise o cadastro de pessoas antes de salvar.`,
      });
    }
    peopleByCpf.set(cpf, { id: pessoa.id, nome: pessoa.nome });
  }
}

function resolveSuggestedConductor(
  group: Awaited<ReturnType<typeof loadGroupDetail>>,
) {
  if (!group) return null;
  const priorities: GrupoInstitucionalMembroFuncao[] = [
    "AGENTE_CONTRATACAO",
    "PREGOEIRO",
    "PRESIDENTE",
  ];
  for (const funcao of priorities) {
    const member = group.membros.find(
      (item) => item.ativo && item.funcao === funcao,
    );
    if (member) {
      return {
        id: member.pessoaId,
        nome: member.pessoaNome,
        cargo: member.pessoaCargo,
        funcao: member.funcao,
      };
    }
  }
  return null;
}

async function listGroups(db: DbClient, input: any, tipo?: GrupoInstitucionalTipo) {
  const filters = [];
  if (tipo ?? input.tipo) {
    filters.push(eq(gruposInstitucionais.tipo, tipo ?? input.tipo));
  }
  if (input.ativo !== undefined) {
    filters.push(eq(gruposInstitucionais.ativo, input.ativo));
  }
  if (input.secretariaId) {
    filters.push(
      or(
        eq(gruposInstitucionais.secretariaId, input.secretariaId),
        isNull(gruposInstitucionais.secretariaId),
      ),
    );
  }
  if (input.somenteVigentes) {
    const ref = resolveReferenceDate(input.dataReferencia);
    filters.push(
      or(isNull(gruposInstitucionais.vigenciaInicio), lte(gruposInstitucionais.vigenciaInicio, ref)),
      or(isNull(gruposInstitucionais.vigenciaFim), gte(gruposInstitucionais.vigenciaFim, ref)),
    );
  }
  if (input.search?.trim()) {
    const pattern = `%${input.search.trim()}%`;
    filters.push(
      or(
        ilike(gruposInstitucionais.nome, pattern),
        ilike(gruposInstitucionais.sigla, pattern),
        ilike(atosDesignacao.numero, pattern),
        ilike(atosDesignacao.ementa, pattern),
      ),
    );
  }
  const whereClause = filters.length ? and(...filters) : undefined;
  const page = Number(input.page ?? 1);
  const pageSize = Number(input.pageSize ?? 20);

  const [totalRow] = await db
    .select({ total: count() })
    .from(gruposInstitucionais)
    .innerJoin(
      atosDesignacao,
      eq(atosDesignacao.id, gruposInstitucionais.atoDesignacaoId),
    )
    .where(whereClause);

  const rows = await db
    .select({
      id: gruposInstitucionais.id,
      nome: gruposInstitucionais.nome,
      tipo: gruposInstitucionais.tipo,
      sigla: gruposInstitucionais.sigla,
      secretariaId: gruposInstitucionais.secretariaId,
      secretariaNome: secretarias.nome,
      secretariaSigla: secretarias.sigla,
      atoDesignacaoId: gruposInstitucionais.atoDesignacaoId,
      atoNumero: atosDesignacao.numero,
      atoAno: atosDesignacao.ano,
      atoTipo: atosDesignacao.tipo,
      atoEmenta: atosDesignacao.ementa,
      atoArquivoUrl: atosDesignacao.arquivoUrl,
      atoArquivoChave: atosDesignacao.arquivoChave,
      atoMimeType: atosDesignacao.mimeType,
      atoTamanhoBytes: atosDesignacao.tamanhoBytes,
      atoHashArquivo: atosDesignacao.hashArquivo,
      vigenciaInicio: gruposInstitucionais.vigenciaInicio,
      vigenciaFim: gruposInstitucionais.vigenciaFim,
      versao: gruposInstitucionais.versao,
      observacao: gruposInstitucionais.observacao,
      ativo: gruposInstitucionais.ativo,
      atualizadoEm: gruposInstitucionais.atualizadoEm,
    })
    .from(gruposInstitucionais)
    .innerJoin(
      atosDesignacao,
      eq(atosDesignacao.id, gruposInstitucionais.atoDesignacaoId),
    )
    .leftJoin(secretarias, eq(secretarias.id, gruposInstitucionais.secretariaId))
    .where(whereClause)
    .orderBy(desc(gruposInstitucionais.ativo), asc(gruposInstitucionais.nome))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const membersMap = await listGroupMembers(
    db,
    rows.map((row) => row.id),
  );

  return {
    items: rows.map((row) => ({
      ...row,
      ato: {
        id: row.atoDesignacaoId,
        numero: row.atoNumero,
        ano: row.atoAno,
        tipo: row.atoTipo,
        ementa: row.atoEmenta,
        arquivoUrl: row.atoArquivoUrl,
        arquivoChave: row.atoArquivoChave,
        mimeType: row.atoMimeType,
        tamanhoBytes: row.atoTamanhoBytes,
        hashArquivo: row.atoHashArquivo,
        label: buildAtoLabel({
          tipo: row.atoTipo,
          numero: row.atoNumero,
          ano: row.atoAno,
        }),
      },
      membros: membersMap.get(row.id) ?? [],
    })),
    total: Number(totalRow?.total ?? 0),
    page,
    pageSize,
  };
}

async function listOrdenadores(db: DbClient, input: any) {
  const filters = [];
  if (input.ativo !== undefined) filters.push(eq(ordenadoresDespesa.ativo, input.ativo));
  if (input.somenteVigentes) {
    const ref = resolveReferenceDate(input.dataReferencia);
    filters.push(
      or(isNull(ordenadoresDespesa.vigenciaInicio), lte(ordenadoresDespesa.vigenciaInicio, ref)),
      or(isNull(ordenadoresDespesa.vigenciaFim), gte(ordenadoresDespesa.vigenciaFim, ref)),
    );
  }
  if (input.secretariaId) {
    const scopedRows = await db
      .select({ ordenadorDespesaId: ordenadoresDespesaSecretarias.ordenadorDespesaId })
      .from(ordenadoresDespesaSecretarias)
      .where(eq(ordenadoresDespesaSecretarias.secretariaId, input.secretariaId));
    const scopedIds = scopedRows.map((row) => row.ordenadorDespesaId);
    if (!scopedIds.length) {
      return {
        items: [],
        total: 0,
        page: input.page,
        pageSize: input.pageSize,
      };
    }
    filters.push(inArray(ordenadoresDespesa.id, scopedIds));
  }
  if (input.search?.trim()) {
    const pattern = `%${input.search.trim()}%`;
    filters.push(
      or(
        ilike(pessoas.nome, pattern),
        ilike(pessoas.cargo, pattern),
        ilike(atosDesignacao.numero, pattern),
        ilike(atosDesignacao.ementa, pattern),
      ),
    );
  }
  const whereClause = filters.length ? and(...filters) : undefined;
  const [totalRow] = await db
    .select({ total: count() })
    .from(ordenadoresDespesa)
    .innerJoin(pessoas, eq(pessoas.id, ordenadoresDespesa.pessoaId))
    .innerJoin(atosDesignacao, eq(atosDesignacao.id, ordenadoresDespesa.atoDesignacaoId))
    .where(whereClause);
  const rows = await db
    .select({
      id: ordenadoresDespesa.id,
      pessoaId: pessoas.id,
      pessoaNome: pessoas.nome,
      pessoaCargo: pessoas.cargo,
      atoDesignacaoId: ordenadoresDespesa.atoDesignacaoId,
      atoNumero: atosDesignacao.numero,
      atoAno: atosDesignacao.ano,
      atoTipo: atosDesignacao.tipo,
      atoEmenta: atosDesignacao.ementa,
      atoArquivoUrl: atosDesignacao.arquivoUrl,
      atoArquivoChave: atosDesignacao.arquivoChave,
      atoMimeType: atosDesignacao.mimeType,
      atoTamanhoBytes: atosDesignacao.tamanhoBytes,
      atoHashArquivo: atosDesignacao.hashArquivo,
      tipoVinculo: ordenadoresDespesa.tipoVinculo,
      vigenciaInicio: ordenadoresDespesa.vigenciaInicio,
      vigenciaFim: ordenadoresDespesa.vigenciaFim,
      versao: ordenadoresDespesa.versao,
      observacao: ordenadoresDespesa.observacao,
      ativo: ordenadoresDespesa.ativo,
      atualizadoEm: ordenadoresDespesa.atualizadoEm,
    })
    .from(ordenadoresDespesa)
    .innerJoin(pessoas, eq(pessoas.id, ordenadoresDespesa.pessoaId))
    .innerJoin(atosDesignacao, eq(atosDesignacao.id, ordenadoresDespesa.atoDesignacaoId))
    .where(whereClause)
    .orderBy(desc(ordenadoresDespesa.ativo), asc(pessoas.nome))
    .limit(input.pageSize)
    .offset((input.page - 1) * input.pageSize);
  const secretariasMap = await listOrdenadorSecretarias(
    db,
    rows.map((row) => row.id),
  );
  return {
    items: rows.map((row) => ({
      ...row,
      pessoa: {
        id: row.pessoaId,
        nome: row.pessoaNome,
        cargo: row.pessoaCargo,
      },
      ato: {
        id: row.atoDesignacaoId,
        numero: row.atoNumero,
        ano: row.atoAno,
        tipo: row.atoTipo,
        ementa: row.atoEmenta,
        arquivoUrl: row.atoArquivoUrl,
        arquivoChave: row.atoArquivoChave,
        mimeType: row.atoMimeType,
        tamanhoBytes: row.atoTamanhoBytes,
        hashArquivo: row.atoHashArquivo,
        label: buildAtoLabel({
          tipo: row.atoTipo,
          numero: row.atoNumero,
          ano: row.atoAno,
        }),
      },
      secretarias: secretariasMap.get(row.id) ?? [],
    })),
    total: Number(totalRow?.total ?? 0),
    page: input.page,
    pageSize: input.pageSize,
  };
}

async function saveGroup(db: DbClient, ctx: any, input: any, tipo: GrupoInstitucionalTipo) {
  const linked = input.id
    ? await db
        .select({ id: licitacoes.id })
        .from(licitacoes)
        .where(
          tipo === "COMISSAO_CONTRATACAO"
            ? eq(licitacoes.comissaoId, input.id)
            : eq(licitacoes.equipeApoioId, input.id),
        )
        .limit(1)
    : [];
  if (input.id && linked.length) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Esta composicao ja foi usada em processo. Crie uma nova versao para preservar o snapshot historico.",
    });
  }
  await validateGroupMemberPeople(db, input.membros);

  return db.transaction(async (tx) => {
    const payload = {
      nome: input.nome,
      tipo,
      sigla: toNullableText(input.sigla),
      secretariaId: input.secretariaId ?? null,
      atoDesignacaoId: input.atoDesignacaoId,
      vigenciaInicio: toNullableDate(input.vigenciaInicio),
      vigenciaFim: toNullableDate(input.vigenciaFim),
      versao: input.versao,
      substituiGrupoId: input.substituiGrupoId ?? null,
      observacao: toNullableText(input.observacao),
      ativo: input.ativo,
      atualizadoEm: new Date(),
    };

    const before = input.id
      ? await tx
          .select()
          .from(gruposInstitucionais)
          .where(eq(gruposInstitucionais.id, input.id))
          .limit(1)
          .then((rows) => rows[0] ?? null)
      : null;

    const [saved] = input.id
      ? await tx
          .update(gruposInstitucionais)
          .set(payload)
          .where(eq(gruposInstitucionais.id, input.id))
          .returning()
      : await tx
          .insert(gruposInstitucionais)
          .values({
            ...payload,
            criadoPor: ctx.user?.id ?? null,
            criadoEm: new Date(),
          })
          .returning();

    if (!saved) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Registro institucional nao encontrado.",
      });
    }

    if (input.id) {
      await tx
        .delete(gruposInstitucionaisMembros)
        .where(eq(gruposInstitucionaisMembros.grupoId, saved.id));
    }
    await tx.insert(gruposInstitucionaisMembros).values(
      input.membros.map((member: any, index: number) => ({
        grupoId: saved.id,
        pessoaId: member.pessoaId,
        funcao: member.funcao,
        ordem: member.ordem ?? index,
        titular: member.titular,
        ativo: member.ativo,
        criadoEm: new Date(),
      })),
    );

    await logAuditoria(ctx, {
      tabela: "grupos_institucionais",
      registroId: saved.id,
      acao: input.id ? "UPDATE" : "CREATE",
      dadosAnteriores: before,
      dadosNovos: { ...saved, membros: input.membros },
      descricao: `${groupTypeLabel(tipo)} ${saved.nome} ${input.id ? "atualizada" : "criada"}`,
    });

    return loadGroupDetail(tx as unknown as DbClient, saved.id);
  });
}

export const cadastrosInstitucionaisRouter = router({
  atos: router({
    list: protectedProcedure
      .input(atoDesignacaoListInputSchema)
      .query(async ({ input }) => {
        const db = requireDb();
        const filters = [];
        if (input.ativo !== undefined) filters.push(eq(atosDesignacao.ativo, input.ativo));
        if (input.tipo) filters.push(eq(atosDesignacao.tipo, input.tipo));
        if (input.search?.trim()) {
          const pattern = `%${input.search.trim()}%`;
          filters.push(
            or(
              ilike(atosDesignacao.numero, pattern),
              ilike(atosDesignacao.ementa, pattern),
            ),
          );
        }
        const whereClause = filters.length ? and(...filters) : undefined;
        const [totalRow] = await db
          .select({ total: count() })
          .from(atosDesignacao)
          .where(whereClause);
        const items = await db
          .select()
          .from(atosDesignacao)
          .where(whereClause)
          .orderBy(desc(atosDesignacao.ativo), desc(atosDesignacao.ano), asc(atosDesignacao.numero))
          .limit(input.pageSize)
          .offset((input.page - 1) * input.pageSize);
        return {
          items: items.map((item) => ({
            ...item,
            label: buildAtoLabel(item),
          })),
          total: Number(totalRow?.total ?? 0),
          page: input.page,
          pageSize: input.pageSize,
        };
      }),
    get: protectedProcedure
      .input(atoDesignacaoGetInputSchema)
      .query(async ({ input }) => {
        const db = requireDb();
        const [item] = await db
          .select()
          .from(atosDesignacao)
          .where(eq(atosDesignacao.id, input.id))
          .limit(1);
        if (!item) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Ato nao encontrado." });
        }
        return { ...item, label: buildAtoLabel(item) };
      }),
    save: gestorProcedure
      .input(atoDesignacaoSaveInputSchema)
      .mutation(async ({ ctx, input }) => {
        const db = requireDb();
        const payload = {
          numero: input.numero,
          ano: input.ano,
          tipo: input.tipo,
          ementa: input.ementa,
          dataEmissao: toNullableDate(input.dataEmissao),
          dataPublicacao: toNullableDate(input.dataPublicacao),
          vigenciaInicio: toNullableDate(input.vigenciaInicio),
          vigenciaFim: toNullableDate(input.vigenciaFim),
          arquivoUrl: toNullableText(input.arquivoUrl),
          arquivoChave: toNullableText(input.arquivoChave),
          mimeType: toNullableText(input.mimeType),
          tamanhoBytes: input.tamanhoBytes ?? null,
          hashArquivo: toNullableText(input.hashArquivo),
          ativo: input.ativo,
          atualizadoEm: new Date(),
        };
        const before = input.id
          ? await db
              .select()
              .from(atosDesignacao)
              .where(eq(atosDesignacao.id, input.id))
              .limit(1)
              .then((rows) => rows[0] ?? null)
          : null;
        const [saved] = input.id
          ? await db
              .update(atosDesignacao)
              .set(payload)
              .where(eq(atosDesignacao.id, input.id))
              .returning()
          : await db
              .insert(atosDesignacao)
              .values({
                ...payload,
                criadoPor: ctx.user?.id ?? null,
                criadoEm: new Date(),
              })
              .returning();
        if (!saved) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Ato nao encontrado." });
        }
        await logAuditoria(ctx, {
          tabela: "atos_designacao",
          registroId: saved.id,
          acao: input.id ? "UPDATE" : "CREATE",
          dadosAnteriores: before,
          dadosNovos: saved,
          descricao: `Ato ${buildAtoLabel(saved)} ${input.id ? "atualizado" : "criado"}`,
        });
        return { ...saved, label: buildAtoLabel(saved) };
      }),
    inactivate: gestorProcedure
      .input(cadastroInstitucionalIdInputSchema)
      .mutation(async ({ ctx, input }) => {
        const db = requireDb();
        const [before] = await db
          .select()
          .from(atosDesignacao)
          .where(eq(atosDesignacao.id, input.id))
          .limit(1);
        const [updated] = await db
          .update(atosDesignacao)
          .set({ ativo: false, atualizadoEm: new Date() })
          .where(eq(atosDesignacao.id, input.id))
          .returning();
        if (!updated) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Ato nao encontrado." });
        }
        await logAuditoria(ctx, {
          tabela: "atos_designacao",
          registroId: updated.id,
          acao: "UPDATE",
          dadosAnteriores: before,
          dadosNovos: updated,
          descricao: `Ato ${buildAtoLabel(updated)} inativado`,
        });
        return { success: true };
      }),
  }),

  comissoes: router({
    list: protectedProcedure
      .input(grupoInstitucionalListInputSchema)
      .query(({ input }) => listGroups(requireDb(), input, "COMISSAO_CONTRATACAO")),
    get: protectedProcedure
      .input(grupoInstitucionalGetInputSchema)
      .query(async ({ input }) => {
        const item = await loadGroupDetail(requireDb(), input.id);
        if (!item || item.tipo !== "COMISSAO_CONTRATACAO") {
          throw new TRPCError({ code: "NOT_FOUND", message: "Comissao nao encontrada." });
        }
        return item;
      }),
    save: gestorProcedure
      .input(grupoInstitucionalSaveInputSchema)
      .mutation(({ ctx, input }) =>
        saveGroup(requireDb(), ctx, input, "COMISSAO_CONTRATACAO"),
      ),
    inactivate: gestorProcedure
      .input(cadastroInstitucionalIdInputSchema)
      .mutation(async ({ ctx, input }) => {
        const db = requireDb();
        const before = await loadGroupDetail(db, input.id);
        const [updated] = await db
          .update(gruposInstitucionais)
          .set({ ativo: false, atualizadoEm: new Date() })
          .where(eq(gruposInstitucionais.id, input.id))
          .returning();
        if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Comissao nao encontrada." });
        await logAuditoria(ctx, {
          tabela: "grupos_institucionais",
          registroId: updated.id,
          acao: "UPDATE",
          dadosAnteriores: before,
          dadosNovos: updated,
          descricao: `Comissao ${updated.nome} inativada`,
        });
        return { success: true };
      }),
  }),

  equipesApoio: router({
    list: protectedProcedure
      .input(grupoInstitucionalListInputSchema)
      .query(({ input }) => listGroups(requireDb(), input, "EQUIPE_APOIO")),
    get: protectedProcedure
      .input(grupoInstitucionalGetInputSchema)
      .query(async ({ input }) => {
        const item = await loadGroupDetail(requireDb(), input.id);
        if (!item || item.tipo !== "EQUIPE_APOIO") {
          throw new TRPCError({ code: "NOT_FOUND", message: "Equipe nao encontrada." });
        }
        return item;
      }),
    save: gestorProcedure
      .input(grupoInstitucionalSaveInputSchema)
      .mutation(({ ctx, input }) =>
        saveGroup(requireDb(), ctx, input, "EQUIPE_APOIO"),
      ),
    inactivate: gestorProcedure
      .input(cadastroInstitucionalIdInputSchema)
      .mutation(async ({ ctx, input }) => {
        const db = requireDb();
        const before = await loadGroupDetail(db, input.id);
        const [updated] = await db
          .update(gruposInstitucionais)
          .set({ ativo: false, atualizadoEm: new Date() })
          .where(eq(gruposInstitucionais.id, input.id))
          .returning();
        if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Equipe nao encontrada." });
        await logAuditoria(ctx, {
          tabela: "grupos_institucionais",
          registroId: updated.id,
          acao: "UPDATE",
          dadosAnteriores: before,
          dadosNovos: updated,
          descricao: `Equipe ${updated.nome} inativada`,
        });
        return { success: true };
      }),
  }),

  ordenadores: router({
    list: protectedProcedure
      .input(ordenadorDespesaListInputSchema)
      .query(({ input }) => listOrdenadores(requireDb(), input)),
    get: protectedProcedure
      .input(ordenadorDespesaGetInputSchema)
      .query(async ({ input }) => {
        const item = await loadOrdenadorDetail(requireDb(), input.id);
        if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Ordenador nao encontrado." });
        return item;
      }),
    save: gestorProcedure
      .input(ordenadorDespesaSaveInputSchema)
      .mutation(async ({ ctx, input }) => {
        const db = requireDb();
        const linked = input.id
          ? await db
              .select({ id: licitacoes.id })
              .from(licitacoes)
              .where(eq(licitacoes.ordenadorDespesaId, input.id))
              .limit(1)
          : [];
        if (input.id && linked.length) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Este ordenador ja foi usado em processo. Crie novo vinculo para preservar o snapshot historico.",
          });
        }
        return db.transaction(async (tx) => {
          const payload = {
            pessoaId: input.pessoaId,
            atoDesignacaoId: input.atoDesignacaoId,
            tipoVinculo: input.tipoVinculo,
            vigenciaInicio: toNullableDate(input.vigenciaInicio),
            vigenciaFim: toNullableDate(input.vigenciaFim),
            versao: input.versao,
            observacao: toNullableText(input.observacao),
            ativo: input.ativo,
            atualizadoEm: new Date(),
          };
          const before = input.id
            ? await loadOrdenadorDetail(tx as unknown as DbClient, input.id)
            : null;
          const [saved] = input.id
            ? await tx
                .update(ordenadoresDespesa)
                .set(payload)
                .where(eq(ordenadoresDespesa.id, input.id))
                .returning()
            : await tx
                .insert(ordenadoresDespesa)
                .values({
                  ...payload,
                  criadoPor: ctx.user?.id ?? null,
                  criadoEm: new Date(),
                })
                .returning();
          if (!saved) throw new TRPCError({ code: "NOT_FOUND", message: "Ordenador nao encontrado." });
          if (input.id) {
            await tx
              .delete(ordenadoresDespesaSecretarias)
              .where(eq(ordenadoresDespesaSecretarias.ordenadorDespesaId, saved.id));
          }
          await tx.insert(ordenadoresDespesaSecretarias).values(
            input.secretariaIds.map((secretariaId) => ({
              ordenadorDespesaId: saved.id,
              secretariaId,
            })),
          );
          const detail = await loadOrdenadorDetail(tx as unknown as DbClient, saved.id);
          await logAuditoria(ctx, {
            tabela: "ordenadores_despesa",
            registroId: saved.id,
            acao: input.id ? "UPDATE" : "CREATE",
            dadosAnteriores: before,
            dadosNovos: detail,
            descricao: `Ordenador de despesas ${input.id ? "atualizado" : "criado"}`,
          });
          return detail;
        });
      }),
    inactivate: gestorProcedure
      .input(cadastroInstitucionalIdInputSchema)
      .mutation(async ({ ctx, input }) => {
        const db = requireDb();
        const before = await loadOrdenadorDetail(db, input.id);
        const [updated] = await db
          .update(ordenadoresDespesa)
          .set({ ativo: false, atualizadoEm: new Date() })
          .where(eq(ordenadoresDespesa.id, input.id))
          .returning();
        if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Ordenador nao encontrado." });
        await logAuditoria(ctx, {
          tabela: "ordenadores_despesa",
          registroId: updated.id,
          acao: "UPDATE",
          dadosAnteriores: before,
          dadosNovos: updated,
          descricao: "Ordenador de despesas inativado",
        });
        return { success: true };
      }),
  }),

  designacoes: router({
    availableForProcess: operadorProcedure
      .input(designacoesForProcessInputSchema)
      .query(async ({ input }) => {
        const db = requireDb();
        const [processo] = await db
          .select({
            id: processos.id,
            secretariaId: processos.secretariaId,
            dataEntradaLicitacao: processos.dataEntradaLicitacao,
          })
          .from(processos)
          .where(eq(processos.id, input.processoId))
          .limit(1);
        if (!processo) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Processo nao encontrado." });
        }
        const dataReferencia =
          toNullableDate(input.dataReferencia) ??
          processo.dataEntradaLicitacao ??
          new Date().toISOString().slice(0, 10);
        const secretariaId = input.secretariaId ?? processo.secretariaId;
        const groupInput = {
          search: input.search,
          secretariaId,
          ativo: true,
          somenteVigentes: input.somenteVigentes,
          dataReferencia,
          page: 1,
          pageSize: 100,
        };
        const [comissoes, equipes, ordenadores] = await Promise.all([
          listGroups(db, groupInput, "COMISSAO_CONTRATACAO"),
          listGroups(db, groupInput, "EQUIPE_APOIO"),
          listOrdenadores(db, {
            search: input.search,
            secretariaId,
            ativo: true,
            somenteVigentes: input.somenteVigentes,
            dataReferencia,
            page: 1,
            pageSize: 100,
          }),
        ]);
        return {
          dataReferencia,
          secretariaId,
          comissoes: comissoes.items,
          equipesApoio: equipes.items,
          ordenadores: ordenadores.items,
        };
      }),
    getForLicitacao: operadorProcedure
      .input(designacoesForProcessInputSchema.pick({ processoId: true }))
      .query(async ({ input }) => {
        const db = requireDb();
        const [licitacao] = await db
          .select()
          .from(licitacoes)
          .where(eq(licitacoes.processoId, input.processoId))
          .limit(1);
        if (!licitacao) {
          return {
            comissao: null,
            equipeApoio: null,
            ordenadorDespesa: null,
            snapshot: null,
            selecionadasPor: null,
            selecionadasEm: null,
            condutorSugerido: null,
          };
        }
        const [comissao, equipeApoio, ordenadorDespesa] = await Promise.all([
          licitacao.comissaoId
            ? loadGroupDetail(db, licitacao.comissaoId)
            : Promise.resolve(null),
          licitacao.equipeApoioId
            ? loadGroupDetail(db, licitacao.equipeApoioId)
            : Promise.resolve(null),
          licitacao.ordenadorDespesaId
            ? loadOrdenadorDetail(db, licitacao.ordenadorDespesaId)
            : Promise.resolve(null),
        ]);
        return {
          comissao,
          equipeApoio,
          ordenadorDespesa,
          snapshot: licitacao.designacoesSnapshot,
          selecionadasPor: licitacao.designacoesSelecionadasPor,
          selecionadasEm: licitacao.designacoesSelecionadasEm,
          condutorSugerido: resolveSuggestedConductor(comissao),
        };
      }),
    selectForLicitacao: operadorProcedure
      .input(designacoesSelectForLicitacaoInputSchema)
      .mutation(async ({ ctx, input }) => {
        const db = requireDb();
        const [processo] = await db
          .select()
          .from(processos)
          .where(eq(processos.id, input.processoId))
          .limit(1);
        if (!processo) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Processo nao encontrado." });
        }
        const licitacao = await ensureLicitacao(db, input.processoId);
        const [comissao, equipeApoio, ordenadorDespesa] = await Promise.all([
          input.comissaoId ? loadGroupDetail(db, input.comissaoId) : Promise.resolve(null),
          input.equipeApoioId ? loadGroupDetail(db, input.equipeApoioId) : Promise.resolve(null),
          input.ordenadorDespesaId ? loadOrdenadorDetail(db, input.ordenadorDespesaId) : Promise.resolve(null),
        ]);
        if (input.comissaoId && (!comissao || comissao.tipo !== "COMISSAO_CONTRATACAO")) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Comissao invalida." });
        }
        if (input.equipeApoioId && (!equipeApoio || equipeApoio.tipo !== "EQUIPE_APOIO")) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Equipe de apoio invalida." });
        }
        if (input.ordenadorDespesaId && !ordenadorDespesa) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Ordenador invalido." });
        }
        const condutorSugerido = resolveSuggestedConductor(comissao);
        if (input.aplicarCondutorSugerido) {
          if (!condutorSugerido || input.condutorSugeridoId !== condutorSugerido.id) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Condutor sugerido invalido para a comissao selecionada.",
            });
          }
        }
        const snapshot = {
          comissao: buildGroupSnapshot(comissao),
          equipeApoio: buildGroupSnapshot(equipeApoio),
          ordenadorDespesa: buildOrdenadorSnapshot(ordenadorDespesa),
          selecionadoEm: new Date().toISOString(),
          selecionadoPor: ctx.user
            ? {
                id: ctx.user.id,
                nome: ctx.user.name,
                username: ctx.user.username,
              }
            : null,
        };

        const updated = await db.transaction(async (tx) => {
          const [row] = await tx
            .update(licitacoes)
            .set({
              comissaoId: input.comissaoId ?? null,
              equipeApoioId: input.equipeApoioId ?? null,
              ordenadorDespesaId: input.ordenadorDespesaId ?? null,
              designacoesSnapshot: snapshot,
              designacoesSelecionadasPor: ctx.user?.id ?? null,
              designacoesSelecionadasEm: new Date(),
              atualizadoEm: new Date(),
            })
            .where(eq(licitacoes.id, licitacao.id))
            .returning();

          if (
            input.aplicarCondutorSugerido &&
            input.condutorSugeridoId &&
            processo.condutorProcessoId !== input.condutorSugeridoId
          ) {
            await tx
              .update(processos)
              .set({
                condutorProcessoId: input.condutorSugeridoId,
                atualizadoEm: new Date(),
              })
              .where(eq(processos.id, input.processoId));
          }
          return row;
        });

        await logAuditoria(ctx, {
          tabela: "licitacoes",
          registroId: licitacao.id,
          acao: "UPDATE",
          dadosAnteriores: {
            comissaoId: licitacao.comissaoId,
            equipeApoioId: licitacao.equipeApoioId,
            ordenadorDespesaId: licitacao.ordenadorDespesaId,
            designacoesSnapshot: licitacao.designacoesSnapshot,
          },
          dadosNovos: {
            comissaoId: input.comissaoId ?? null,
            equipeApoioId: input.equipeApoioId ?? null,
            ordenadorDespesaId: input.ordenadorDespesaId ?? null,
            snapshot,
            justificativa: toNullableText(input.justificativa),
            condutorSugeridoAplicado: Boolean(input.aplicarCondutorSugerido),
            condutorAnteriorId: processo.condutorProcessoId,
            condutorNovoId: input.aplicarCondutorSugerido
              ? input.condutorSugeridoId
              : processo.condutorProcessoId,
          },
          descricao: "Designacoes institucionais selecionadas para a licitacao",
        });

        return {
          success: true,
          licitacao: updated,
          snapshot,
          condutorSugerido,
        };
      }),
  }),
});

import { TRPCError } from "@trpc/server";
import { and, asc, count, desc, eq, ilike, inArray, isNotNull, or, sql } from "drizzle-orm";

import {
  cadastroBulkMergeInputSchema,
  cadastroBulkStatusInputSchema,
  cadastroDeleteInputSchema,
  cadastroExportInputSchema,
  cadastroHistoryInputSchema,
  cadastroSaveInputSchema,
  cadastrosListInputSchema,
  fornecedorMergeInputSchema,
  pessoaMergeInputSchema,
} from "@sirel/shared/schemas/cadastros";
import {
  grauPrioridadeLabels,
  grauPrioridadeOptions,
  metodologiaCotacaoLabels,
  metodologiaCotacaoOptions,
  modoDisputaLabels,
  modoDisputaOptions,
  modalidadeCatalog,
  workflowModuleOptions,
} from "@sirel/shared/const";

import { logAuditoria } from "../db/auditoria.js";
import { requireDb } from "../db/client.js";
import {
  auditoriaLog,
  catalogoItens,
  contratos,
  cotacoes,
  dfd,
  dfdResponsaveis,
  departamentos,
  fornecedores,
  lancesLicitacao,
  licitantes,
  modalidades,
  parametrosSistema,
  pessoas,
  processos,
  propostasLicitacao,
  recursosLicitacao,
  secretarias,
  statusProcesso,
  users,
} from "../db/schema.js";
import { hashPassword } from "../lib/auth-password.js";
import { adminProcedure, gestorProcedure, protectedProcedure, router } from "../trpc.js";

function toNullableString(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeFornecedorCnpj(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

function findFornecedorByNormalizedCnpj(normalizedCnpj: string) {
  return sql<boolean>`regexp_replace(coalesce(${fornecedores.cnpj}, ''), '[^0-9]', '', 'g') = ${normalizedCnpj}`;
}

function normalizePessoaCpf(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

function findPessoaByNormalizedCpf(normalizedCpf: string) {
  return sql<boolean>`regexp_replace(coalesce(${pessoas.cpf}, ''), '[^0-9]', '', 'g') = ${normalizedCpf}`;
}

function resolveCanonicalFornecedorCnpj(
  primaryValue: string | null | undefined,
  secondaryValue: string | null | undefined,
) {
  const primaryDigits = normalizeFornecedorCnpj(primaryValue);
  if (primaryDigits.length === 14) {
    return primaryDigits;
  }

  const secondaryDigits = normalizeFornecedorCnpj(secondaryValue);
  if (secondaryDigits.length === 14) {
    return secondaryDigits;
  }

  return toNullableString(primaryValue) ?? toNullableString(secondaryValue) ?? "SEM_CNPJ";
}

function resolveCanonicalPessoaCpf(
  primaryValue: string | null | undefined,
  secondaryValue: string | null | undefined,
) {
  const primaryDigits = normalizePessoaCpf(primaryValue);
  if (primaryDigits.length === 11) {
    return primaryDigits;
  }

  const secondaryDigits = normalizePessoaCpf(secondaryValue);
  if (secondaryDigits.length === 11) {
    return secondaryDigits;
  }

  return toNullableString(primaryValue) ?? toNullableString(secondaryValue);
}

function chooseFornecedorText(
  preferredValue: string | null | undefined,
  fallbackValue: string | null | undefined,
) {
  return toNullableString(preferredValue) ?? toNullableString(fallbackValue);
}

function licitanteStatusPriority(value: string | null | undefined) {
  switch (value) {
    case "HABILITADO":
      return 3;
    case "PENDENTE":
      return 2;
    case "INABILITADO":
      return 1;
    default:
      return 0;
  }
}

function chooseLicitanteStatus(
  targetStatus: string | null | undefined,
  sourceStatus: string | null | undefined,
) {
  return licitanteStatusPriority(sourceStatus) > licitanteStatusPriority(targetStatus)
    ? sourceStatus ?? targetStatus ?? "PENDENTE"
    : targetStatus ?? sourceStatus ?? "PENDENTE";
}

function propostaSituacaoPriority(value: string | null | undefined) {
  switch (value) {
    case "VENCEDORA":
      return 3;
    case "VALIDA":
      return 2;
    case "DESCLASSIFICADA":
      return 1;
    default:
      return 0;
  }
}

function choosePreferredProposal<
  T extends {
    situacao: string | null;
    classificacao: number | null;
    atualizadoEm: Date;
    dataProposta: Date;
  },
>(targetProposal: T, sourceProposal: T) {
  const targetSituacao = propostaSituacaoPriority(targetProposal.situacao);
  const sourceSituacao = propostaSituacaoPriority(sourceProposal.situacao);

  if (sourceSituacao !== targetSituacao) {
    return sourceSituacao > targetSituacao ? sourceProposal : targetProposal;
  }

  if (
    targetProposal.classificacao !== null &&
    sourceProposal.classificacao !== null &&
    targetProposal.classificacao !== sourceProposal.classificacao
  ) {
    return sourceProposal.classificacao < targetProposal.classificacao
      ? sourceProposal
      : targetProposal;
  }

  if (sourceProposal.atualizadoEm.getTime() !== targetProposal.atualizadoEm.getTime()) {
    return sourceProposal.atualizadoEm > targetProposal.atualizadoEm
      ? sourceProposal
      : targetProposal;
  }

  return sourceProposal.dataProposta > targetProposal.dataProposta
    ? sourceProposal
    : targetProposal;
}

function chooseLowestClassification(
  targetClassification: number | null,
  sourceClassification: number | null,
) {
  if (targetClassification === null) return sourceClassification;
  if (sourceClassification === null) return targetClassification;
  return Math.min(targetClassification, sourceClassification);
}

async function mergeFornecedorRecords(
  tx: any,
  userId: number | null,
  sourceId: number,
  targetId: number,
) {
  const rows = await tx
    .select()
    .from(fornecedores)
    .where(inArray(fornecedores.id, [sourceId, targetId]));

  const source = rows.find((row: any) => row.id === sourceId) ?? null;
  const target = rows.find((row: any) => row.id === targetId) ?? null;

  if (!source) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Fornecedor duplicado nÃ£o encontrado." });
  }

  if (!target) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Fornecedor de destino nÃ£o encontrado." });
  }

  const now = new Date();
  const canonicalCnpj = resolveCanonicalFornecedorCnpj(target.cnpj, source.cnpj);
  const canonicalCnpjDigits = normalizeFornecedorCnpj(canonicalCnpj);

  let targetCnpj = canonicalCnpj;
  if (canonicalCnpjDigits.length === 14) {
    const conflictingRows = await tx
      .select({ id: fornecedores.id })
      .from(fornecedores)
      .where(findFornecedorByNormalizedCnpj(canonicalCnpjDigits));
    const hasThirdConflict = conflictingRows.some(
      (row: any) => row.id !== source.id && row.id !== target.id,
    );
    if (!hasThirdConflict) {
      targetCnpj = canonicalCnpjDigits;
    }
  }

  const targetPatch = {
    razaoSocial:
      chooseFornecedorText(target.razaoSocial, source.razaoSocial) ??
      target.razaoSocial,
    cnpj: targetCnpj,
    email: chooseFornecedorText(target.email, source.email),
    telefone: chooseFornecedorText(target.telefone, source.telefone),
    cidade: chooseFornecedorText(target.cidade, source.cidade),
    estado:
      chooseFornecedorText(target.estado, source.estado)?.toUpperCase() ??
      null,
    logoUrl: target.logoUrl ?? source.logoUrl,
    logoChave: target.logoChave ?? source.logoChave,
    ativo: target.ativo || source.ativo,
    atualizadoEm: now,
  };

  const [updatedTarget] = await tx
    .update(fornecedores)
    .set(targetPatch)
    .where(eq(fornecedores.id, target.id))
    .returning();

  if (!updatedTarget) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Fornecedor de destino nÃ£o encontrado." });
  }

  const cotacoesAtualizadas = await tx
    .update(cotacoes)
    .set({ fornecedorId: target.id, atualizadoEm: now })
    .where(eq(cotacoes.fornecedorId, source.id))
    .returning({ id: cotacoes.id });

  const contratosAtualizados = await tx
    .update(contratos)
    .set({ fornecedorId: target.id, atualizadoEm: now })
    .where(eq(contratos.fornecedorId, source.id))
    .returning({ id: contratos.id });

  const sourceLicitanteRows = await tx
    .select()
    .from(licitantes)
    .where(eq(licitantes.fornecedorId, source.id));
  const targetLicitanteRows = await tx
    .select()
    .from(licitantes)
    .where(eq(licitantes.fornecedorId, target.id));

  const targetLicitantesByLicitacaoId = new Map<number, any>(
    targetLicitanteRows.map((row: any) => [row.licitacaoId, row]),
  );

  let licitantesRemapeados = 0;
  let licitantesMesclados = 0;
  let propostasRemapeadas = 0;
  let propostasMescladas = 0;
  let propostasExcluidas = 0;
  let lancesReassociados = 0;
  let recursosReassociados = 0;

  for (const sourceLicitante of sourceLicitanteRows) {
    const targetLicitante = targetLicitantesByLicitacaoId.get(
      sourceLicitante.licitacaoId,
    );

    if (!targetLicitante) {
      await tx
        .update(licitantes)
        .set({
          fornecedorId: target.id,
          atualizadoEm: now,
        })
        .where(eq(licitantes.id, sourceLicitante.id));
      licitantesRemapeados += 1;
      continue;
    }

    licitantesMesclados += 1;

    await tx
      .update(licitantes)
      .set({
        statusHabilitacao: chooseLicitanteStatus(
          targetLicitante.statusHabilitacao,
          sourceLicitante.statusHabilitacao,
        ) as "PENDENTE" | "HABILITADO" | "INABILITADO",
        observacaoHabilitacao: chooseFornecedorText(
          targetLicitante.observacaoHabilitacao,
          sourceLicitante.observacaoHabilitacao,
        ),
        ativo: targetLicitante.ativo || sourceLicitante.ativo,
        atualizadoEm: now,
      })
      .where(eq(licitantes.id, targetLicitante.id));

    const sourceProposalRows = await tx
      .select()
      .from(propostasLicitacao)
      .where(eq(propostasLicitacao.licitanteId, sourceLicitante.id));
    const targetProposalRows = await tx
      .select()
      .from(propostasLicitacao)
      .where(eq(propostasLicitacao.licitanteId, targetLicitante.id));
    const targetProposalByItemId = new Map<number, any>(
      targetProposalRows.map((row: any) => [row.itemId, row]),
    );

    for (const sourceProposal of sourceProposalRows) {
      const targetProposal = targetProposalByItemId.get(sourceProposal.itemId);

      if (!targetProposal) {
        await tx
          .update(propostasLicitacao)
          .set({
            licitanteId: targetLicitante.id,
            atualizadoEm: now,
          })
          .where(eq(propostasLicitacao.id, sourceProposal.id));
        propostasRemapeadas += 1;
        continue;
      }

      const preferredProposal = choosePreferredProposal(
        targetProposal,
        sourceProposal,
      );
      const secondaryProposal =
        preferredProposal.id === targetProposal.id ? sourceProposal : targetProposal;

      await tx
        .update(propostasLicitacao)
        .set({
          valorUnitarioProposto: preferredProposal.valorUnitarioProposto,
          valorTotalProposto: preferredProposal.valorTotalProposto,
          dataProposta: preferredProposal.dataProposta,
          classificacao: chooseLowestClassification(
            targetProposal.classificacao,
            sourceProposal.classificacao,
          ),
          situacao:
            propostaSituacaoPriority(sourceProposal.situacao) >
            propostaSituacaoPriority(targetProposal.situacao)
              ? sourceProposal.situacao
              : targetProposal.situacao,
          justificativa:
            chooseFornecedorText(
              preferredProposal.justificativa,
              secondaryProposal.justificativa,
            ) ?? null,
          atualizadoEm: now,
        })
        .where(eq(propostasLicitacao.id, targetProposal.id));

      const movedLances = await tx
        .update(lancesLicitacao)
        .set({ propostaId: targetProposal.id })
        .where(eq(lancesLicitacao.propostaId, sourceProposal.id))
        .returning({ id: lancesLicitacao.id });
      lancesReassociados += movedLances.length;

      const deletedSourceProposal = await tx
        .delete(propostasLicitacao)
        .where(eq(propostasLicitacao.id, sourceProposal.id))
        .returning({ id: propostasLicitacao.id });
      propostasMescladas += 1;
      propostasExcluidas += deletedSourceProposal.length;
    }

    const movedRecursos = await tx
      .update(recursosLicitacao)
      .set({ licitanteId: targetLicitante.id, atualizadoEm: now })
      .where(eq(recursosLicitacao.licitanteId, sourceLicitante.id))
      .returning({ id: recursosLicitacao.id });
    recursosReassociados += movedRecursos.length;

    await tx
      .delete(licitantes)
      .where(eq(licitantes.id, sourceLicitante.id))
      .returning({ id: licitantes.id });
  }

  const [deletedSource] = await tx
    .delete(fornecedores)
    .where(eq(fornecedores.id, source.id))
    .returning();

  if (!deletedSource) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "NÃ£o foi possÃ­vel concluir a unificaÃ§Ã£o do fornecedor duplicado.",
    });
  }

  await tx.insert(auditoriaLog).values([
    {
      usuarioId: userId,
      tabela: "fornecedores",
      registroId: updatedTarget.id,
      acao: "UPDATE",
      dadosAnteriores: target,
      dadosNovos: {
        ...updatedTarget,
        mergeSummary: {
          sourceId: source.id,
          sourceRazaoSocial: source.razaoSocial,
          cotacoesAtualizadas: cotacoesAtualizadas.length,
          contratosAtualizados: contratosAtualizados.length,
          licitantesRemapeados,
          licitantesMesclados,
          propostasRemapeadas,
          propostasMescladas,
          lancesReassociados,
          recursosReassociados,
        },
      },
      descricao: `Fornecedor ${source.razaoSocial} unificado em ${updatedTarget.razaoSocial}`,
    },
    {
      usuarioId: userId,
      tabela: "fornecedores",
      registroId: source.id,
      acao: "DELETE",
      dadosAnteriores: source,
      dadosNovos: {
        mergedIntoFornecedorId: updatedTarget.id,
        mergedIntoRazaoSocial: updatedTarget.razaoSocial,
      },
      descricao: `Fornecedor ${source.razaoSocial} absorvido por ${updatedTarget.razaoSocial}`,
    },
  ]);

  return {
    fornecedorMantido: {
      id: updatedTarget.id,
      razaoSocial: updatedTarget.razaoSocial,
      cnpj: updatedTarget.cnpj,
    },
    fornecedorRemovido: {
      id: source.id,
      razaoSocial: source.razaoSocial,
      cnpj: source.cnpj,
    },
    summary: {
      cotacoesAtualizadas: cotacoesAtualizadas.length,
      contratosAtualizados: contratosAtualizados.length,
      licitantesRemapeados,
      licitantesMesclados,
      propostasRemapeadas,
      propostasMescladas,
      propostasExcluidas,
      lancesReassociados,
      recursosReassociados,
    },
  };
}

async function mergePessoaRecords(
  tx: any,
  userId: number | null,
  sourceId: number,
  targetId: number,
) {
  const rows = await tx
    .select()
    .from(pessoas)
    .where(inArray(pessoas.id, [sourceId, targetId]));

  const source = rows.find((row: any) => row.id === sourceId) ?? null;
  const target = rows.find((row: any) => row.id === targetId) ?? null;

  if (!source) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Pessoa duplicada nÃ£o encontrada." });
  }

  if (!target) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Pessoa de destino nÃ£o encontrada." });
  }

  const now = new Date();
  const canonicalCpf = resolveCanonicalPessoaCpf(target.cpf, source.cpf);
  const canonicalCpfDigits = normalizePessoaCpf(canonicalCpf);

  let targetCpf = canonicalCpf ?? null;
  if (canonicalCpfDigits.length === 11) {
    const conflictingRows = await tx
      .select({ id: pessoas.id })
      .from(pessoas)
      .where(findPessoaByNormalizedCpf(canonicalCpfDigits));
    const hasThirdConflict = conflictingRows.some(
      (row: any) => row.id !== source.id && row.id !== target.id,
    );
    if (!hasThirdConflict) {
      targetCpf = canonicalCpfDigits;
    }
  }

  const targetPatch = {
    nome: chooseFornecedorText(target.nome, source.nome) ?? target.nome,
    cpf: targetCpf,
    cargo: chooseFornecedorText(target.cargo, source.cargo),
    secretariaId: target.secretariaId ?? source.secretariaId ?? null,
    ativo: target.ativo || source.ativo,
    atualizadoEm: now,
  };

  const [updatedTarget] = await tx
    .update(pessoas)
    .set(targetPatch)
    .where(eq(pessoas.id, target.id))
    .returning();

  if (!updatedTarget) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Pessoa de destino nÃ£o encontrada." });
  }

  const departamentosAtualizados = await tx
    .update(departamentos)
    .set({ responsavelId: target.id, atualizadoEm: now })
    .where(eq(departamentos.responsavelId, source.id))
    .returning({ id: departamentos.id });

  const processosAutoridadeAtualizados = await tx
    .update(processos)
    .set({ autoridadeCompetenteId: target.id, atualizadoEm: now })
    .where(eq(processos.autoridadeCompetenteId, source.id))
    .returning({ id: processos.id });

  const processosCondutorAtualizados = await tx
    .update(processos)
    .set({ condutorProcessoId: target.id, atualizadoEm: now })
    .where(eq(processos.condutorProcessoId, source.id))
    .returning({ id: processos.id });

  const dfdSolicitanteAtualizados = await tx
    .update(dfd)
    .set({ solicitantePessoaId: target.id, atualizadoEm: now })
    .where(eq(dfd.solicitantePessoaId, source.id))
    .returning({ id: dfd.id });

  const dfdAssinaturasAtualizadas = await tx
    .update(dfd)
    .set({ assinaturaResponsavelId: target.id, atualizadoEm: now })
    .where(eq(dfd.assinaturaResponsavelId, source.id))
    .returning({ id: dfd.id });

  const sourceResponsavelRows = await tx
    .select()
    .from(dfdResponsaveis)
    .where(eq(dfdResponsaveis.pessoaId, source.id));
  const targetResponsavelRows = await tx
    .select()
    .from(dfdResponsaveis)
    .where(eq(dfdResponsaveis.pessoaId, target.id));
  const targetResponsavelByDfdId = new Map<number, any>(
    targetResponsavelRows.map((row: any) => [row.dfdId, row]),
  );

  let dfdResponsaveisRemapeados = 0;
  let dfdResponsaveisMesclados = 0;

  for (const sourceResponsavel of sourceResponsavelRows) {
    const duplicatedTargetRow = targetResponsavelByDfdId.get(sourceResponsavel.dfdId);
    if (duplicatedTargetRow) {
      const deletedRows = await tx
        .delete(dfdResponsaveis)
        .where(eq(dfdResponsaveis.id, sourceResponsavel.id))
        .returning({ id: dfdResponsaveis.id });
      dfdResponsaveisMesclados += deletedRows.length;
      continue;
    }

    const updatedRows = await tx
      .update(dfdResponsaveis)
      .set({ pessoaId: target.id })
      .where(eq(dfdResponsaveis.id, sourceResponsavel.id))
      .returning({ id: dfdResponsaveis.id });
    dfdResponsaveisRemapeados += updatedRows.length;
  }

  const [deletedSource] = await tx
    .delete(pessoas)
    .where(eq(pessoas.id, source.id))
    .returning();

  if (!deletedSource) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "NÃ£o foi possÃ­vel concluir a unificaÃ§Ã£o da pessoa duplicada.",
    });
  }

  await tx.insert(auditoriaLog).values([
    {
      usuarioId: userId,
      tabela: "pessoas",
      registroId: updatedTarget.id,
      acao: "UPDATE",
      dadosAnteriores: target,
      dadosNovos: {
        ...updatedTarget,
        mergeSummary: {
          sourceId: source.id,
          sourceNome: source.nome,
          departamentosAtualizados: departamentosAtualizados.length,
          processosAutoridadeAtualizados: processosAutoridadeAtualizados.length,
          processosCondutorAtualizados: processosCondutorAtualizados.length,
          dfdSolicitanteAtualizados: dfdSolicitanteAtualizados.length,
          dfdAssinaturasAtualizadas: dfdAssinaturasAtualizadas.length,
          dfdResponsaveisRemapeados,
          dfdResponsaveisMesclados,
        },
      },
      descricao: `Pessoa ${source.nome} unificada em ${updatedTarget.nome}`,
    },
    {
      usuarioId: userId,
      tabela: "pessoas",
      registroId: source.id,
      acao: "DELETE",
      dadosAnteriores: source,
      dadosNovos: {
        mergedIntoPessoaId: updatedTarget.id,
        mergedIntoNome: updatedTarget.nome,
      },
      descricao: `Pessoa ${source.nome} absorvida por ${updatedTarget.nome}`,
    },
  ]);

  return {
    pessoaMantida: {
      id: updatedTarget.id,
      nome: updatedTarget.nome,
      cpf: updatedTarget.cpf,
      secretariaId: updatedTarget.secretariaId,
    },
    pessoaRemovida: {
      id: source.id,
      nome: source.nome,
      cpf: source.cpf,
      secretariaId: source.secretariaId,
    },
    summary: {
      departamentosAtualizados: departamentosAtualizados.length,
      processosAutoridadeAtualizados: processosAutoridadeAtualizados.length,
      processosCondutorAtualizados: processosCondutorAtualizados.length,
      dfdSolicitanteAtualizados: dfdSolicitanteAtualizados.length,
      dfdAssinaturasAtualizadas: dfdAssinaturasAtualizadas.length,
      dfdResponsaveisRemapeados,
      dfdResponsaveisMesclados,
    },
  };
}

function toNullableNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toNullableDecimal(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(2) : null;
}

function itemCodeFromId(id: number) {
  return `ITM-${new Date().getFullYear()}-${String(id).padStart(5, "0")}`;
}

function entityTableName(entity: "itens" | "fornecedores" | "secretarias" | "pessoas" | "servidores" | "departamentos" | "usuarios" | "parametros") {
  switch (entity) {
    case "itens":
      return "catalogo_itens";
    case "fornecedores":
      return "fornecedores";
    case "secretarias":
      return "secretarias";
    case "pessoas":
    case "servidores":
      return "pessoas";
    case "departamentos":
      return "departamentos";
    case "usuarios":
      return "users";
    case "parametros":
      return "parametros_sistema";
  }
}

function buildAtivoFilter(status: "ativo" | "inativo" | undefined, column: any) {
  if (!status) return undefined;
  return eq(column, status === "ativo");
}

function withPagination(page: number, pageSize: number) {
  const safePage = Math.max(1, page);
  const safePageSize = Math.max(1, pageSize);
  return {
    limit: safePageSize,
    offset: (safePage - 1) * safePageSize,
  };
}

export const cadastrosRouter = router({
  formOptions: protectedProcedure.query(async () => {
    const db = requireDb();

    const [secretariaRows, modalidadeRows, statusRows, pessoaRows, fornecedorRows, departamentoRows] = await Promise.all([
      db
        .select({ id: secretarias.id, nome: secretarias.nome, sigla: secretarias.sigla })
        .from(secretarias)
        .where(eq(secretarias.ativo, true))
        .orderBy(asc(secretarias.nome)),
      db
        .select({ id: modalidades.id, nome: modalidades.nome, codigo: modalidades.codigo })
        .from(modalidades)
        .where(eq(modalidades.ativo, true))
        .orderBy(asc(modalidades.nome)),
      db
        .select({ id: statusProcesso.id, nome: statusProcesso.nome, codigo: statusProcesso.codigo })
        .from(statusProcesso)
        .where(eq(statusProcesso.ativo, true))
        .orderBy(asc(statusProcesso.nome)),
      db
        .select({
          id: pessoas.id,
          nome: pessoas.nome,
          cpf: pessoas.cpf,
          cargo: pessoas.cargo,
          secretariaId: pessoas.secretariaId,
        })
        .from(pessoas)
        .where(eq(pessoas.ativo, true))
        .orderBy(asc(pessoas.nome)),
      db
        .select({
          id: fornecedores.id,
          razaoSocial: fornecedores.razaoSocial,
          cnpj: fornecedores.cnpj,
        })
        .from(fornecedores)
        .where(eq(fornecedores.ativo, true))
        .orderBy(asc(fornecedores.razaoSocial)),
      db
        .select({
          id: departamentos.id,
          nome: departamentos.nome,
          secretariaId: departamentos.secretariaId,
        })
        .from(departamentos)
        .where(eq(departamentos.ativo, true))
        .orderBy(asc(departamentos.nome)),
    ]);

    return {
      secretarias: secretariaRows,
      modalidades: modalidadeRows.sort((left, right) => {
        const leftIndex = modalidadeCatalog.findIndex((item) => item.codigo === left.codigo);
        const rightIndex = modalidadeCatalog.findIndex((item) => item.codigo === right.codigo);
        return leftIndex - rightIndex;
      }),
      statusProcesso: statusRows,
      pessoas: pessoaRows,
      fornecedores: fornecedorRows,
      departamentos: departamentoRows,
      workflowModules: workflowModuleOptions,
      modoDisputa: modoDisputaOptions.map((codigo) => ({ codigo, nome: modoDisputaLabels[codigo] })),
      grauPrioridade: grauPrioridadeOptions.map((codigo) => ({ codigo, nome: grauPrioridadeLabels[codigo] })),
      metodologiaCotacao: metodologiaCotacaoOptions.map((codigo) => ({ codigo, nome: metodologiaCotacaoLabels[codigo] })),
      userRoles: [
        { codigo: "user", nome: "Usuário" },
        { codigo: "operador", nome: "Operador" },
        { codigo: "gestor", nome: "Gestor" },
        { codigo: "admin", nome: "Administrador" },
        { codigo: "auditor", nome: "Auditor" },
      ],
    };
  }),

  summary: protectedProcedure
    .input(cadastrosListInputSchema.pick({ entity: true }))
    .query(async ({ input }) => {
      const db = requireDb();

      switch (input.entity) {
        case "itens": {
          const [totalRow] = await db.select({ total: count() }).from(catalogoItens);
          const [ativosRow] = await db.select({ total: count() }).from(catalogoItens).where(eq(catalogoItens.ativo, true));
          return { total: Number(totalRow?.total ?? 0), ativos: Number(ativosRow?.total ?? 0) };
        }
        case "fornecedores": {
          const [totalRow] = await db.select({ total: count() }).from(fornecedores);
          const [ativosRow] = await db.select({ total: count() }).from(fornecedores).where(eq(fornecedores.ativo, true));
          return { total: Number(totalRow?.total ?? 0), ativos: Number(ativosRow?.total ?? 0) };
        }
        case "secretarias": {
          const [totalRow] = await db.select({ total: count() }).from(secretarias);
          const [ativosRow] = await db.select({ total: count() }).from(secretarias).where(eq(secretarias.ativo, true));
          return { total: Number(totalRow?.total ?? 0), ativos: Number(ativosRow?.total ?? 0) };
        }
        case "pessoas": {
          const [totalRow] = await db.select({ total: count() }).from(pessoas);
          const [ativosRow] = await db.select({ total: count() }).from(pessoas).where(eq(pessoas.ativo, true));
          return { total: Number(totalRow?.total ?? 0), ativos: Number(ativosRow?.total ?? 0) };
        }
        case "servidores": {
          const [totalRow] = await db.select({ total: count() }).from(pessoas).where(isNotNull(pessoas.secretariaId));
          const [ativosRow] = await db.select({ total: count() }).from(pessoas).where(and(eq(pessoas.ativo, true), isNotNull(pessoas.secretariaId)));
          return { total: Number(totalRow?.total ?? 0), ativos: Number(ativosRow?.total ?? 0) };
        }
        case "departamentos": {
          const [totalRow] = await db.select({ total: count() }).from(departamentos);
          const [ativosRow] = await db.select({ total: count() }).from(departamentos).where(eq(departamentos.ativo, true));
          return { total: Number(totalRow?.total ?? 0), ativos: Number(ativosRow?.total ?? 0) };
        }
        case "usuarios": {
          const [totalRow] = await db.select({ total: count() }).from(users);
          const [ativosRow] = await db.select({ total: count() }).from(users).where(eq(users.ativo, true));
          return { total: Number(totalRow?.total ?? 0), ativos: Number(ativosRow?.total ?? 0) };
        }
        case "parametros": {
          const [totalRow] = await db.select({ total: count() }).from(parametrosSistema);
          const [ativosRow] = await db.select({ total: count() }).from(parametrosSistema).where(eq(parametrosSistema.ativo, true));
          return { total: Number(totalRow?.total ?? 0), ativos: Number(ativosRow?.total ?? 0) };
        }
      }
    }),

  history: protectedProcedure.input(cadastroHistoryInputSchema).query(async ({ input }) => {
    const db = requireDb();
    const pagination = withPagination(input.page, input.pageSize);
    const tabela = entityTableName(input.entity);
    const filters = [
      eq(auditoriaLog.tabela, tabela),
      eq(auditoriaLog.registroId, input.id),
      input.action ? eq(auditoriaLog.acao, input.action) : undefined,
      input.search
        ? or(
            ilike(auditoriaLog.descricao, `%${input.search}%`),
            ilike(users.name, `%${input.search}%`),
          )
        : undefined,
    ].filter(Boolean) as any[];
    const whereClause = filters.length ? and(...filters) : undefined;

    const [totalRows, rows] = await Promise.all([
      db
        .select({ total: count() })
        .from(auditoriaLog)
        .leftJoin(users, eq(users.id, auditoriaLog.usuarioId))
        .where(whereClause),
      db
        .select({
          id: auditoriaLog.id,
          acao: auditoriaLog.acao,
          descricao: auditoriaLog.descricao,
          dadosAnteriores: auditoriaLog.dadosAnteriores,
          dadosNovos: auditoriaLog.dadosNovos,
          criadoEm: auditoriaLog.criadoEm,
          usuarioId: auditoriaLog.usuarioId,
          usuarioNome: users.name,
        })
        .from(auditoriaLog)
        .leftJoin(users, eq(users.id, auditoriaLog.usuarioId))
        .where(whereClause)
        .orderBy(desc(auditoriaLog.criadoEm), desc(auditoriaLog.id))
        .limit(pagination.limit)
        .offset(pagination.offset),
    ]);

    const total = Number(totalRows[0]?.total ?? 0);
    return {
      page: input.page,
      pageSize: input.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
      items: rows,
    };
  }),

  list: protectedProcedure.input(cadastrosListInputSchema).query(async ({ input }) => {
    const db = requireDb();
    const pagination = withPagination(input.page, input.pageSize);

    switch (input.entity) {
      case "itens": {
        const filters = [
          buildAtivoFilter(input.status, catalogoItens.ativo),
          input.search ? ilike(catalogoItens.descricao, `%${input.search}%`) : undefined,
        ].filter(Boolean) as any[];
        const whereClause = filters.length ? and(...filters) : undefined;

        const [totalRows, rows] = await Promise.all([
          db.select({ total: count() }).from(catalogoItens).where(whereClause),
          db
            .select({
              id: catalogoItens.id,
              descricao: catalogoItens.descricao,
              unidadePadrao: catalogoItens.unidadePadrao,
              valorReferencia: catalogoItens.valorReferencia,
              imagemUrl: catalogoItens.imagemUrl,
              ativo: catalogoItens.ativo,
              atualizadoEm: catalogoItens.atualizadoEm,
            })
            .from(catalogoItens)
            .where(whereClause)
            .orderBy(asc(catalogoItens.descricao))
            .limit(pagination.limit)
            .offset(pagination.offset),
        ]);

        const total = Number(totalRows[0]?.total ?? 0);
        return {
          page: input.page,
          pageSize: input.pageSize,
          total,
          totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
          items: rows.map((row) => ({
            id: row.id,
            nome: row.descricao,
            codigo: itemCodeFromId(row.id),
            unidade: row.unidadePadrao,
            valorReferencia: row.valorReferencia ? Number(row.valorReferencia) : null,
            imagemUrl: row.imagemUrl,
            status: row.ativo ? "ativo" : "inativo",
            atualizadoEm: row.atualizadoEm,
          })),
        };
      }

      case "fornecedores": {
        const filters = [
          buildAtivoFilter(input.status, fornecedores.ativo),
          input.search
            ? or(
                ilike(fornecedores.razaoSocial, `%${input.search}%`),
                ilike(fornecedores.cnpj, `%${input.search}%`),
                ilike(fornecedores.email, `%${input.search}%`),
              )
            : undefined,
          input.cidade ? ilike(fornecedores.cidade, `%${input.cidade}%`) : undefined,
        ].filter(Boolean) as any[];
        const whereClause = filters.length ? and(...filters) : undefined;

        const [totalRows, rows] = await Promise.all([
          db.select({ total: count() }).from(fornecedores).where(whereClause),
          db.select().from(fornecedores).where(whereClause).orderBy(asc(fornecedores.razaoSocial)).limit(pagination.limit).offset(pagination.offset),
        ]);

        const total = Number(totalRows[0]?.total ?? 0);
        return {
          page: input.page,
          pageSize: input.pageSize,
          total,
          totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
          items: rows.map((row) => ({
            id: row.id,
            razaoSocial: row.razaoSocial,
            cnpj: row.cnpj,
            email: row.email,
            telefone: row.telefone,
            cidade: row.cidade,
            estado: row.estado,
            logoUrl: row.logoUrl,
            status: row.ativo ? "ativo" : "inativo",
            atualizadoEm: row.atualizadoEm,
          })),
        };
      }

      case "secretarias": {
        const filters = [
          buildAtivoFilter(input.status, secretarias.ativo),
          input.search
            ? or(
                ilike(secretarias.nome, `%${input.search}%`),
                ilike(secretarias.sigla, `%${input.search}%`),
                ilike(secretarias.responsavel, `%${input.search}%`),
              )
            : undefined,
        ].filter(Boolean) as any[];
        const whereClause = filters.length ? and(...filters) : undefined;

        const [totalRows, rows] = await Promise.all([
          db.select({ total: count() }).from(secretarias).where(whereClause),
          db.select().from(secretarias).where(whereClause).orderBy(asc(secretarias.nome)).limit(pagination.limit).offset(pagination.offset),
        ]);

        const total = Number(totalRows[0]?.total ?? 0);
        return {
          page: input.page,
          pageSize: input.pageSize,
          total,
          totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
          items: rows.map((row) => ({
            id: row.id,
            sigla: row.sigla,
            nome: row.nome,
            descricao: row.descricao,
            responsavel: row.responsavel,
            email: row.email,
            telefone: row.telefone,
            status: row.ativo ? "ativo" : "inativo",
            atualizadoEm: row.atualizadoEm,
          })),
        };
      }

      case "pessoas":
      case "servidores": {
        const onlyServidores = input.entity === "servidores";
        const filters = [
          buildAtivoFilter(input.status, pessoas.ativo),
          input.search
            ? or(
                ilike(pessoas.nome, `%${input.search}%`),
                ilike(pessoas.cpf, `%${input.search}%`),
                ilike(pessoas.cargo, `%${input.search}%`),
                ilike(secretarias.nome, `%${input.search}%`),
              )
            : undefined,
          input.secretariaId ? eq(pessoas.secretariaId, input.secretariaId) : undefined,
          onlyServidores ? isNotNull(pessoas.secretariaId) : undefined,
        ].filter(Boolean) as any[];
        const whereClause = filters.length ? and(...filters) : undefined;

        const [totalRows, rows] = await Promise.all([
          db.select({ total: count() }).from(pessoas).leftJoin(secretarias, eq(secretarias.id, pessoas.secretariaId)).where(whereClause),
          db
            .select({
              id: pessoas.id,
              nome: pessoas.nome,
              cpf: pessoas.cpf,
              cargo: pessoas.cargo,
              secretariaId: pessoas.secretariaId,
              secretariaNome: secretarias.nome,
              ativo: pessoas.ativo,
              atualizadoEm: pessoas.atualizadoEm,
            })
            .from(pessoas)
            .leftJoin(secretarias, eq(secretarias.id, pessoas.secretariaId))
            .where(whereClause)
            .orderBy(asc(pessoas.nome))
            .limit(pagination.limit)
            .offset(pagination.offset),
        ]);

        const total = Number(totalRows[0]?.total ?? 0);
        return {
          page: input.page,
          pageSize: input.pageSize,
          total,
          totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
          items: rows.map((row) => ({
            id: row.id,
            nome: row.nome,
            cpf: row.cpf,
            cargo: row.cargo,
            secretariaId: row.secretariaId,
            secretariaNome: row.secretariaNome,
            status: row.ativo ? "ativo" : "inativo",
            atualizadoEm: row.atualizadoEm,
          })),
        };
      }

      case "departamentos": {
        const filters = [
          buildAtivoFilter(input.status, departamentos.ativo),
          input.search
            ? or(
                ilike(departamentos.nome, `%${input.search}%`),
                ilike(departamentos.codigoCentroCusto, `%${input.search}%`),
                ilike(secretarias.nome, `%${input.search}%`),
              )
            : undefined,
          input.secretariaId ? eq(departamentos.secretariaId, input.secretariaId) : undefined,
        ].filter(Boolean) as any[];
        const whereClause = filters.length ? and(...filters) : undefined;

        const [totalRows, rows] = await Promise.all([
          db.select({ total: count() }).from(departamentos).leftJoin(secretarias, eq(secretarias.id, departamentos.secretariaId)).where(whereClause),
          db
            .select({
              id: departamentos.id,
              nome: departamentos.nome,
              codigoCentroCusto: departamentos.codigoCentroCusto,
              secretariaId: departamentos.secretariaId,
              secretariaNome: secretarias.nome,
              responsavelId: departamentos.responsavelId,
              responsavelNome: pessoas.nome,
              descricao: departamentos.descricao,
              ativo: departamentos.ativo,
              atualizadoEm: departamentos.atualizadoEm,
            })
            .from(departamentos)
            .leftJoin(secretarias, eq(secretarias.id, departamentos.secretariaId))
            .leftJoin(pessoas, eq(pessoas.id, departamentos.responsavelId))
            .where(whereClause)
            .orderBy(asc(departamentos.nome))
            .limit(pagination.limit)
            .offset(pagination.offset),
        ]);

        const total = Number(totalRows[0]?.total ?? 0);
        return {
          page: input.page,
          pageSize: input.pageSize,
          total,
          totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
          items: rows.map((row) => ({
            id: row.id,
            nome: row.nome,
            codigoCentroCusto: row.codigoCentroCusto,
            secretariaId: row.secretariaId,
            secretariaNome: row.secretariaNome,
            responsavelId: row.responsavelId,
            responsavelNome: row.responsavelNome,
            descricao: row.descricao,
            status: row.ativo ? "ativo" : "inativo",
            atualizadoEm: row.atualizadoEm,
          })),
        };
      }

      case "usuarios": {
        const filters = [
          buildAtivoFilter(input.status, users.ativo),
          input.search
            ? or(
                ilike(users.username, `%${input.search}%`),
                ilike(users.name, `%${input.search}%`),
                ilike(users.email, `%${input.search}%`),
              )
            : undefined,
          input.secretariaId ? eq(users.secretariaId, input.secretariaId) : undefined,
          input.role ? eq(users.role, input.role) : undefined,
        ].filter(Boolean) as any[];
        const whereClause = filters.length ? and(...filters) : undefined;

        const [totalRows, rows] = await Promise.all([
          db.select({ total: count() }).from(users).leftJoin(secretarias, eq(secretarias.id, users.secretariaId)).where(whereClause),
          db
            .select({
              id: users.id,
              username: users.username,
              name: users.name,
              email: users.email,
              role: users.role,
              secretariaId: users.secretariaId,
              secretariaNome: secretarias.nome,
              ativo: users.ativo,
              lastSignedIn: users.lastSignedIn,
              updatedAt: users.updatedAt,
            })
            .from(users)
            .leftJoin(secretarias, eq(secretarias.id, users.secretariaId))
            .where(whereClause)
            .orderBy(asc(users.name))
            .limit(pagination.limit)
            .offset(pagination.offset),
        ]);

        const total = Number(totalRows[0]?.total ?? 0);
        return {
          page: input.page,
          pageSize: input.pageSize,
          total,
          totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
          items: rows.map((row) => ({
            id: row.id,
            username: row.username,
            name: row.name,
            email: row.email,
            role: row.role,
            secretariaId: row.secretariaId,
            secretariaNome: row.secretariaNome,
            status: row.ativo ? "ativo" : "inativo",
            lastSignedIn: row.lastSignedIn,
            atualizadoEm: row.updatedAt,
          })),
        };
      }

      case "parametros": {
        const filters = [
          buildAtivoFilter(input.status, parametrosSistema.ativo),
          input.search
            ? or(
                ilike(parametrosSistema.categoria, `%${input.search}%`),
                ilike(parametrosSistema.chave, `%${input.search}%`),
                ilike(parametrosSistema.valor, `%${input.search}%`),
              )
            : undefined,
        ].filter(Boolean) as any[];
        const whereClause = filters.length ? and(...filters) : undefined;

        const [totalRows, rows] = await Promise.all([
          db.select({ total: count() }).from(parametrosSistema).where(whereClause),
          db
            .select()
            .from(parametrosSistema)
            .where(whereClause)
            .orderBy(asc(parametrosSistema.categoria), asc(parametrosSistema.chave))
            .limit(pagination.limit)
            .offset(pagination.offset),
        ]);

        const total = Number(totalRows[0]?.total ?? 0);
        return {
          page: input.page,
          pageSize: input.pageSize,
          total,
          totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
          items: rows.map((row) => ({
            id: row.id,
            categoria: row.categoria,
            chave: row.chave,
            valor: row.valor,
            descricao: row.descricao,
            status: row.ativo ? "ativo" : "inativo",
            atualizadoEm: row.atualizadoEm,
          })),
        };
      }
    }
  }),

  exportRows: protectedProcedure.input(cadastroExportInputSchema).query(async ({ input }) => {
    const db = requireDb();

    switch (input.entity) {
      case "itens": {
        const filters = [
          buildAtivoFilter(input.status, catalogoItens.ativo),
          input.search ? ilike(catalogoItens.descricao, `%${input.search}%`) : undefined,
          input.ids?.length ? inArray(catalogoItens.id, input.ids) : undefined,
        ].filter(Boolean) as any[];
        const whereClause = filters.length ? and(...filters) : undefined;
        const rows = await db
          .select({
            id: catalogoItens.id,
            descricao: catalogoItens.descricao,
            unidadePadrao: catalogoItens.unidadePadrao,
            valorReferencia: catalogoItens.valorReferencia,
            ativo: catalogoItens.ativo,
            atualizadoEm: catalogoItens.atualizadoEm,
          })
          .from(catalogoItens)
          .where(whereClause)
          .orderBy(asc(catalogoItens.descricao))
          .limit(5000);

        return rows.map((row) => ({
          id: row.id,
          nome: row.descricao,
          codigo: itemCodeFromId(row.id),
          unidade: row.unidadePadrao,
          valorReferencia: row.valorReferencia ? Number(row.valorReferencia) : null,
          status: row.ativo ? "ativo" : "inativo",
          atualizadoEm: row.atualizadoEm,
        }));
      }

      case "fornecedores": {
        const filters = [
          buildAtivoFilter(input.status, fornecedores.ativo),
          input.search
            ? or(
                ilike(fornecedores.razaoSocial, `%${input.search}%`),
                ilike(fornecedores.cnpj, `%${input.search}%`),
                ilike(fornecedores.email, `%${input.search}%`),
              )
            : undefined,
          input.cidade ? ilike(fornecedores.cidade, `%${input.cidade}%`) : undefined,
          input.ids?.length ? inArray(fornecedores.id, input.ids) : undefined,
        ].filter(Boolean) as any[];
        const whereClause = filters.length ? and(...filters) : undefined;
        const rows = await db.select().from(fornecedores).where(whereClause).orderBy(asc(fornecedores.razaoSocial)).limit(5000);
        return rows.map((row) => ({
          id: row.id,
          razaoSocial: row.razaoSocial,
          cnpj: row.cnpj,
          email: row.email,
          telefone: row.telefone,
          cidade: row.cidade,
          estado: row.estado,
          status: row.ativo ? "ativo" : "inativo",
          atualizadoEm: row.atualizadoEm,
        }));
      }

      case "secretarias": {
        const filters = [
          buildAtivoFilter(input.status, secretarias.ativo),
          input.search
            ? or(
                ilike(secretarias.nome, `%${input.search}%`),
                ilike(secretarias.sigla, `%${input.search}%`),
                ilike(secretarias.responsavel, `%${input.search}%`),
              )
            : undefined,
          input.ids?.length ? inArray(secretarias.id, input.ids) : undefined,
        ].filter(Boolean) as any[];
        const whereClause = filters.length ? and(...filters) : undefined;
        const rows = await db.select().from(secretarias).where(whereClause).orderBy(asc(secretarias.nome)).limit(5000);
        return rows.map((row) => ({
          id: row.id,
          sigla: row.sigla,
          nome: row.nome,
          descricao: row.descricao,
          responsavel: row.responsavel,
          email: row.email,
          telefone: row.telefone,
          status: row.ativo ? "ativo" : "inativo",
          atualizadoEm: row.atualizadoEm,
        }));
      }

      case "pessoas":
      case "servidores": {
        const onlyServidores = input.entity === "servidores";
        const filters = [
          buildAtivoFilter(input.status, pessoas.ativo),
          input.search
            ? or(
                ilike(pessoas.nome, `%${input.search}%`),
                ilike(pessoas.cpf, `%${input.search}%`),
                ilike(pessoas.cargo, `%${input.search}%`),
                ilike(secretarias.nome, `%${input.search}%`),
              )
            : undefined,
          input.secretariaId ? eq(pessoas.secretariaId, input.secretariaId) : undefined,
          input.ids?.length ? inArray(pessoas.id, input.ids) : undefined,
          onlyServidores ? isNotNull(pessoas.secretariaId) : undefined,
        ].filter(Boolean) as any[];
        const whereClause = filters.length ? and(...filters) : undefined;
        const rows = await db
          .select({
            id: pessoas.id,
            nome: pessoas.nome,
            cpf: pessoas.cpf,
            cargo: pessoas.cargo,
            secretariaId: pessoas.secretariaId,
            secretariaNome: secretarias.nome,
            ativo: pessoas.ativo,
            atualizadoEm: pessoas.atualizadoEm,
          })
          .from(pessoas)
          .leftJoin(secretarias, eq(secretarias.id, pessoas.secretariaId))
          .where(whereClause)
          .orderBy(asc(pessoas.nome))
          .limit(5000);

        return rows.map((row) => ({
          id: row.id,
          nome: row.nome,
          cpf: row.cpf,
          cargo: row.cargo,
          secretariaId: row.secretariaId,
          secretariaNome: row.secretariaNome,
          status: row.ativo ? "ativo" : "inativo",
          atualizadoEm: row.atualizadoEm,
        }));
      }

      case "departamentos": {
        const filters = [
          buildAtivoFilter(input.status, departamentos.ativo),
          input.search
            ? or(
                ilike(departamentos.nome, `%${input.search}%`),
                ilike(departamentos.codigoCentroCusto, `%${input.search}%`),
                ilike(secretarias.nome, `%${input.search}%`),
              )
            : undefined,
          input.secretariaId ? eq(departamentos.secretariaId, input.secretariaId) : undefined,
          input.ids?.length ? inArray(departamentos.id, input.ids) : undefined,
        ].filter(Boolean) as any[];
        const whereClause = filters.length ? and(...filters) : undefined;
        const rows = await db
          .select({
            id: departamentos.id,
            nome: departamentos.nome,
            codigoCentroCusto: departamentos.codigoCentroCusto,
            secretariaId: departamentos.secretariaId,
            secretariaNome: secretarias.nome,
            responsavelId: departamentos.responsavelId,
            responsavelNome: pessoas.nome,
            descricao: departamentos.descricao,
            ativo: departamentos.ativo,
            atualizadoEm: departamentos.atualizadoEm,
          })
          .from(departamentos)
          .leftJoin(secretarias, eq(secretarias.id, departamentos.secretariaId))
          .leftJoin(pessoas, eq(pessoas.id, departamentos.responsavelId))
          .where(whereClause)
          .orderBy(asc(departamentos.nome))
          .limit(5000);

        return rows.map((row) => ({
          id: row.id,
          nome: row.nome,
          codigoCentroCusto: row.codigoCentroCusto,
          secretariaId: row.secretariaId,
          secretariaNome: row.secretariaNome,
          responsavelId: row.responsavelId,
          responsavelNome: row.responsavelNome,
          descricao: row.descricao,
          status: row.ativo ? "ativo" : "inativo",
          atualizadoEm: row.atualizadoEm,
        }));
      }

      case "usuarios": {
        const filters = [
          buildAtivoFilter(input.status, users.ativo),
          input.search
            ? or(
                ilike(users.username, `%${input.search}%`),
                ilike(users.name, `%${input.search}%`),
                ilike(users.email, `%${input.search}%`),
              )
            : undefined,
          input.secretariaId ? eq(users.secretariaId, input.secretariaId) : undefined,
          input.role ? eq(users.role, input.role) : undefined,
          input.ids?.length ? inArray(users.id, input.ids) : undefined,
        ].filter(Boolean) as any[];
        const whereClause = filters.length ? and(...filters) : undefined;
        const rows = await db
          .select({
            id: users.id,
            username: users.username,
            name: users.name,
            email: users.email,
            role: users.role,
            secretariaId: users.secretariaId,
            secretariaNome: secretarias.nome,
            ativo: users.ativo,
            lastSignedIn: users.lastSignedIn,
            atualizadoEm: users.updatedAt,
          })
          .from(users)
          .leftJoin(secretarias, eq(secretarias.id, users.secretariaId))
          .where(whereClause)
          .orderBy(asc(users.name))
          .limit(5000);

        return rows.map((row) => ({
          id: row.id,
          username: row.username,
          name: row.name,
          email: row.email,
          role: row.role,
          secretariaId: row.secretariaId,
          secretariaNome: row.secretariaNome,
          status: row.ativo ? "ativo" : "inativo",
          lastSignedIn: row.lastSignedIn,
          atualizadoEm: row.atualizadoEm,
        }));
      }

      case "parametros": {
        const filters = [
          buildAtivoFilter(input.status, parametrosSistema.ativo),
          input.search
            ? or(
                ilike(parametrosSistema.categoria, `%${input.search}%`),
                ilike(parametrosSistema.chave, `%${input.search}%`),
                ilike(parametrosSistema.valor, `%${input.search}%`),
              )
            : undefined,
          input.ids?.length ? inArray(parametrosSistema.id, input.ids) : undefined,
        ].filter(Boolean) as any[];
        const whereClause = filters.length ? and(...filters) : undefined;
        const rows = await db
          .select()
          .from(parametrosSistema)
          .where(whereClause)
          .orderBy(asc(parametrosSistema.categoria), asc(parametrosSistema.chave))
          .limit(5000);

        return rows.map((row) => ({
          id: row.id,
          categoria: row.categoria,
          chave: row.chave,
          valor: row.valor,
          descricao: row.descricao,
          status: row.ativo ? "ativo" : "inativo",
          atualizadoEm: row.atualizadoEm,
        }));
      }
    }
  }),

  save: gestorProcedure.input(cadastroSaveInputSchema).mutation(async ({ ctx, input }) => {
    const db = requireDb();

    switch (input.entity) {
      case "itens": {
        const payload = {
          descricao: input.data.descricao,
          unidadePadrao: input.data.unidadePadrao,
          valorReferencia: toNullableDecimal(input.data.valorReferencia ?? null),
          ativo: input.data.ativo,
          atualizadoEm: new Date(),
        };

        if (input.data.id) {
          const [before] = await db.select().from(catalogoItens).where(eq(catalogoItens.id, input.data.id)).limit(1);
          const [updated] = await db.update(catalogoItens).set(payload).where(eq(catalogoItens.id, input.data.id)).returning();
          if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Item não encontrado." });
          await logAuditoria(ctx, {
            tabela: "catalogo_itens",
            registroId: updated.id,
            acao: "UPDATE",
            dadosAnteriores: before,
            dadosNovos: updated,
            descricao: `Cadastro do item ${updated.descricao} atualizado`,
          });
          return updated;
        }

        const [created] = await db
          .insert(catalogoItens)
          .values({ ...payload, criadoEm: new Date(), criadoPor: ctx.user?.id ?? null })
          .returning();
        await logAuditoria(ctx, {
          tabela: "catalogo_itens",
          registroId: created.id,
          acao: "CREATE",
          dadosNovos: created,
          descricao: `Cadastro do item ${created.descricao} criado`,
        });
        return created;
      }

      case "fornecedores": {
        const normalizedCnpj = normalizeFornecedorCnpj(input.data.cnpj);
        const existing = await db
          .select({ id: fornecedores.id })
          .from(fornecedores)
          .where(findFornecedorByNormalizedCnpj(normalizedCnpj));
        if (existing.some((row) => row.id !== input.data.id)) {
          throw new TRPCError({ code: "CONFLICT", message: "Já existe fornecedor com este CNPJ." });
        }

        const payload = {
          razaoSocial: input.data.razaoSocial,
          cnpj: normalizedCnpj,
          email: toNullableString(input.data.email),
          telefone: toNullableString(input.data.telefone),
          cidade: toNullableString(input.data.cidade),
          estado: toNullableString(input.data.estado)?.toUpperCase() ?? null,
          ativo: input.data.ativo,
          atualizadoEm: new Date(),
        };

        if (input.data.id) {
          const [before] = await db.select().from(fornecedores).where(eq(fornecedores.id, input.data.id)).limit(1);
          const [updated] = await db.update(fornecedores).set(payload).where(eq(fornecedores.id, input.data.id)).returning();
          if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Fornecedor não encontrado." });
          await logAuditoria(ctx, {
            tabela: "fornecedores",
            registroId: updated.id,
            acao: "UPDATE",
            dadosAnteriores: before,
            dadosNovos: updated,
            descricao: `Cadastro do fornecedor ${updated.razaoSocial} atualizado`,
          });
          return updated;
        }

        const [created] = await db.insert(fornecedores).values({ ...payload, criadoEm: new Date() }).returning();
        await logAuditoria(ctx, {
          tabela: "fornecedores",
          registroId: created.id,
          acao: "CREATE",
          dadosNovos: created,
          descricao: `Cadastro do fornecedor ${created.razaoSocial} criado`,
        });
        return created;
      }

      case "secretarias": {
        const normalizedSigla = input.data.sigla.trim().toUpperCase();
        const existing = await db.select({ id: secretarias.id }).from(secretarias).where(eq(secretarias.sigla, normalizedSigla));
        if (existing.some((row) => row.id !== input.data.id)) {
          throw new TRPCError({ code: "CONFLICT", message: "Já existe secretaria com esta sigla." });
        }

        const payload = {
          sigla: normalizedSigla,
          nome: input.data.nome,
          descricao: toNullableString(input.data.descricao),
          responsavel: toNullableString(input.data.responsavel),
          email: toNullableString(input.data.email),
          telefone: toNullableString(input.data.telefone),
          ativo: input.data.ativo,
          atualizadoEm: new Date(),
        };

        if (input.data.id) {
          const [before] = await db.select().from(secretarias).where(eq(secretarias.id, input.data.id)).limit(1);
          const [updated] = await db.update(secretarias).set(payload).where(eq(secretarias.id, input.data.id)).returning();
          if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Secretaria não encontrada." });
          await logAuditoria(ctx, {
            tabela: "secretarias",
            registroId: updated.id,
            acao: "UPDATE",
            dadosAnteriores: before,
            dadosNovos: updated,
            descricao: `Cadastro da secretaria ${updated.nome} atualizado`,
          });
          return updated;
        }

        const [created] = await db.insert(secretarias).values({ ...payload, criadoEm: new Date() }).returning();
        await logAuditoria(ctx, {
          tabela: "secretarias",
          registroId: created.id,
          acao: "CREATE",
          dadosNovos: created,
          descricao: `Cadastro da secretaria ${created.nome} criado`,
        });
        return created;
      }

      case "pessoas":
      case "servidores": {
        const normalizedCpf = input.data.cpf ? normalizePessoaCpf(input.data.cpf) : null;
        if (normalizedCpf) {
          const existing = await db
            .select({ id: pessoas.id })
            .from(pessoas)
            .where(findPessoaByNormalizedCpf(normalizedCpf));
          if (existing.some((row) => row.id !== input.data.id)) {
            throw new TRPCError({ code: "CONFLICT", message: "Já existe pessoa cadastrada com este CPF." });
          }
        }

        const payload = {
          nome: input.data.nome,
          cpf: normalizedCpf,
          cargo: toNullableString(input.data.cargo),
          secretariaId: input.data.secretariaId ?? null,
          ativo: input.data.ativo,
          atualizadoEm: new Date(),
        };

        if (input.data.id) {
          const [before] = await db.select().from(pessoas).where(eq(pessoas.id, input.data.id)).limit(1);
          const [updated] = await db.update(pessoas).set(payload).where(eq(pessoas.id, input.data.id)).returning();
          if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Pessoa não encontrada." });
          await logAuditoria(ctx, {
            tabela: "pessoas",
            registroId: updated.id,
            acao: "UPDATE",
            dadosAnteriores: before,
            dadosNovos: updated,
            descricao: `Cadastro de ${input.entity === "servidores" ? "servidor" : "pessoa"} ${updated.nome} atualizado`,
          });
          return updated;
        }

        const [created] = await db.insert(pessoas).values({ ...payload, criadoEm: new Date() }).returning();
        await logAuditoria(ctx, {
          tabela: "pessoas",
          registroId: created.id,
          acao: "CREATE",
          dadosNovos: created,
          descricao: `Cadastro de ${input.entity === "servidores" ? "servidor" : "pessoa"} ${created.nome} criado`,
        });
        return created;
      }

      case "departamentos": {
        const payload = {
          nome: input.data.nome,
          codigoCentroCusto: toNullableString(input.data.codigoCentroCusto),
          secretariaId: input.data.secretariaId,
          responsavelId: input.data.responsavelId ?? null,
          descricao: toNullableString(input.data.descricao),
          ativo: input.data.ativo,
          atualizadoEm: new Date(),
        };

        if (input.data.id) {
          const [before] = await db.select().from(departamentos).where(eq(departamentos.id, input.data.id)).limit(1);
          const [updated] = await db.update(departamentos).set(payload).where(eq(departamentos.id, input.data.id)).returning();
          if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Departamento não encontrado." });
          await logAuditoria(ctx, {
            tabela: "departamentos",
            registroId: updated.id,
            acao: "UPDATE",
            dadosAnteriores: before,
            dadosNovos: updated,
            descricao: `Cadastro do departamento ${updated.nome} atualizado`,
          });
          return updated;
        }

        const [created] = await db.insert(departamentos).values({ ...payload, criadoEm: new Date() }).returning();
        await logAuditoria(ctx, {
          tabela: "departamentos",
          registroId: created.id,
          acao: "CREATE",
          dadosNovos: created,
          descricao: `Cadastro do departamento ${created.nome} criado`,
        });
        return created;
      }

      case "usuarios": {
        if (input.data.id) {
          const [before] = await db.select().from(users).where(eq(users.id, input.data.id)).limit(1);
          const [updated] = await db
            .update(users)
            .set({
              name: input.data.name,
              email: toNullableString(input.data.email),
              role: input.data.role,
              secretariaId: input.data.secretariaId ?? null,
              ativo: input.data.ativo,
              updatedAt: new Date(),
            })
            .where(eq(users.id, input.data.id))
            .returning();

          if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado." });
          await logAuditoria(ctx, {
            tabela: "users",
            registroId: updated.id,
            acao: "UPDATE",
            dadosAnteriores: before,
            dadosNovos: updated,
            descricao: `Cadastro do usuário ${updated.name} atualizado`,
          });
          return updated;
        }

        const normalizedUsername = input.data.username?.trim().toLowerCase();
        if (!normalizedUsername || !input.data.password) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Informe login e senha inicial para criar o usuário." });
        }

        const existing = await db.select({ id: users.id }).from(users).where(eq(users.username, normalizedUsername)).limit(1);
        if (existing.length) {
          throw new TRPCError({ code: "CONFLICT", message: "Já existe usuário com este login." });
        }

        const [created] = await db
          .insert(users)
          .values({
            username: normalizedUsername,
            name: input.data.name,
            email: toNullableString(input.data.email),
            loginMethod: "local_password",
            passwordHash: hashPassword(input.data.password),
            role: input.data.role,
            secretariaId: input.data.secretariaId ?? null,
            ativo: input.data.ativo,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning();

        await logAuditoria(ctx, {
          tabela: "users",
          registroId: created.id,
          acao: "CREATE",
          dadosNovos: created,
          descricao: `Cadastro do usuário ${created.name} criado`,
        });
        return created;
      }

      case "parametros": {
        const normalizedKey = input.data.chave.trim().toUpperCase();
        const existing = await db.select({ id: parametrosSistema.id }).from(parametrosSistema).where(eq(parametrosSistema.chave, normalizedKey));
        if (existing.some((row) => row.id !== input.data.id)) {
          throw new TRPCError({ code: "CONFLICT", message: "Já existe parâmetro com esta chave." });
        }

        const payload = {
          categoria: input.data.categoria,
          chave: normalizedKey,
          valor: input.data.valor,
          descricao: toNullableString(input.data.descricao),
          ativo: input.data.ativo,
          atualizadoEm: new Date(),
        };

        if (input.data.id) {
          const [before] = await db.select().from(parametrosSistema).where(eq(parametrosSistema.id, input.data.id)).limit(1);
          const [updated] = await db.update(parametrosSistema).set(payload).where(eq(parametrosSistema.id, input.data.id)).returning();
          if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Parâmetro não encontrado." });
          await logAuditoria(ctx, {
            tabela: "parametros_sistema",
            registroId: updated.id,
            acao: "UPDATE",
            dadosAnteriores: before,
            dadosNovos: updated,
            descricao: `Parâmetro ${updated.chave} atualizado`,
          });
          return updated;
        }

        const [created] = await db.insert(parametrosSistema).values({ ...payload, criadoEm: new Date() }).returning();
        await logAuditoria(ctx, {
          tabela: "parametros_sistema",
          registroId: created.id,
          acao: "CREATE",
          dadosNovos: created,
          descricao: `Parâmetro ${created.chave} criado`,
        });
        return created;
      }
    }
  }),

  mergeFornecedores: gestorProcedure.input(fornecedorMergeInputSchema).mutation(async ({ ctx, input }) => {
    const db = requireDb();
    const merged = await db.transaction((tx) =>
      mergeFornecedorRecords(
        tx,
        ctx.user?.id ?? null,
        input.sourceId,
        input.targetId,
      ),
    );

    return {
      success: true,
      ...merged,
    };
  }),

  mergePessoas: gestorProcedure.input(pessoaMergeInputSchema).mutation(async ({ ctx, input }) => {
    const db = requireDb();
    const merged = await db.transaction((tx) =>
      mergePessoaRecords(
        tx,
        ctx.user?.id ?? null,
        input.sourceId,
        input.targetId,
      ),
    );

    return {
      success: true,
      ...merged,
    };
  }),

  bulkMergeCadastros: gestorProcedure.input(cadastroBulkMergeInputSchema).mutation(async ({ ctx, input }) => {
    const db = requireDb();
    const userId = ctx.user?.id ?? null;
    const sourceIds = Array.from(new Set(input.sourceIds)).filter((id) => id !== input.targetId);

    if (!sourceIds.length) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Selecione ao menos um cadastro duplicado para unificar.",
      });
    }

    const result = await db.transaction(async (tx) => {
      if (input.entity === "fornecedores") {
        const summary = {
          cotacoesAtualizadas: 0,
          contratosAtualizados: 0,
          licitantesRemapeados: 0,
          licitantesMesclados: 0,
          propostasRemapeadas: 0,
          propostasMescladas: 0,
          propostasExcluidas: 0,
          lancesReassociados: 0,
          recursosReassociados: 0,
        };
        let fornecedorMantido: Awaited<ReturnType<typeof mergeFornecedorRecords>>["fornecedorMantido"] | null = null;
        let registrosUnificados = 0;

        for (const sourceId of sourceIds) {
          const merged = await mergeFornecedorRecords(tx, userId, sourceId, input.targetId);
          fornecedorMantido = merged.fornecedorMantido;
          registrosUnificados += 1;
          summary.cotacoesAtualizadas += merged.summary.cotacoesAtualizadas;
          summary.contratosAtualizados += merged.summary.contratosAtualizados;
          summary.licitantesRemapeados += merged.summary.licitantesRemapeados;
          summary.licitantesMesclados += merged.summary.licitantesMesclados;
          summary.propostasRemapeadas += merged.summary.propostasRemapeadas;
          summary.propostasMescladas += merged.summary.propostasMescladas;
          summary.propostasExcluidas += merged.summary.propostasExcluidas;
          summary.lancesReassociados += merged.summary.lancesReassociados;
          summary.recursosReassociados += merged.summary.recursosReassociados;
        }

        return {
          success: true,
          entity: input.entity,
          registrosUnificados,
          registroMantido: fornecedorMantido,
          summary,
        };
      }

      const summary = {
        departamentosAtualizados: 0,
        processosAutoridadeAtualizados: 0,
        processosCondutorAtualizados: 0,
        dfdSolicitanteAtualizados: 0,
        dfdAssinaturasAtualizadas: 0,
        dfdResponsaveisRemapeados: 0,
        dfdResponsaveisMesclados: 0,
      };
      let pessoaMantida: Awaited<ReturnType<typeof mergePessoaRecords>>["pessoaMantida"] | null = null;
      let registrosUnificados = 0;

      for (const sourceId of sourceIds) {
        const merged = await mergePessoaRecords(tx, userId, sourceId, input.targetId);
        pessoaMantida = merged.pessoaMantida;
        registrosUnificados += 1;
        summary.departamentosAtualizados += merged.summary.departamentosAtualizados;
        summary.processosAutoridadeAtualizados += merged.summary.processosAutoridadeAtualizados;
        summary.processosCondutorAtualizados += merged.summary.processosCondutorAtualizados;
        summary.dfdSolicitanteAtualizados += merged.summary.dfdSolicitanteAtualizados;
        summary.dfdAssinaturasAtualizadas += merged.summary.dfdAssinaturasAtualizadas;
        summary.dfdResponsaveisRemapeados += merged.summary.dfdResponsaveisRemapeados;
        summary.dfdResponsaveisMesclados += merged.summary.dfdResponsaveisMesclados;
      }

      return {
        success: true,
        entity: input.entity,
        registrosUnificados,
        registroMantido: pessoaMantida,
        summary,
      };
    });

    return result;
  }),

  remove: adminProcedure.input(cadastroDeleteInputSchema).mutation(async ({ ctx, input }) => {
    const db = requireDb();

    switch (input.entity) {
      case "itens": {
        const [before] = await db.select().from(catalogoItens).where(eq(catalogoItens.id, input.id)).limit(1);
        const [updated] = await db.update(catalogoItens).set({ ativo: false, atualizadoEm: new Date() }).where(eq(catalogoItens.id, input.id)).returning();
        if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Item não encontrado." });
        await logAuditoria(ctx, {
          tabela: "catalogo_itens",
          registroId: updated.id,
          acao: "DELETE",
          dadosAnteriores: before,
          dadosNovos: updated,
          descricao: `Cadastro do item ${updated.descricao} inativado`,
        });
        return { success: true };
      }
      case "fornecedores": {
        const [before] = await db.select().from(fornecedores).where(eq(fornecedores.id, input.id)).limit(1);
        const [updated] = await db.update(fornecedores).set({ ativo: false, atualizadoEm: new Date() }).where(eq(fornecedores.id, input.id)).returning();
        if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Fornecedor não encontrado." });
        await logAuditoria(ctx, {
          tabela: "fornecedores",
          registroId: updated.id,
          acao: "DELETE",
          dadosAnteriores: before,
          dadosNovos: updated,
          descricao: `Cadastro do fornecedor ${updated.razaoSocial} inativado`,
        });
        return { success: true };
      }
      case "secretarias": {
        const [before] = await db.select().from(secretarias).where(eq(secretarias.id, input.id)).limit(1);
        const [updated] = await db.update(secretarias).set({ ativo: false, atualizadoEm: new Date() }).where(eq(secretarias.id, input.id)).returning();
        if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Secretaria não encontrada." });
        await logAuditoria(ctx, {
          tabela: "secretarias",
          registroId: updated.id,
          acao: "DELETE",
          dadosAnteriores: before,
          dadosNovos: updated,
          descricao: `Cadastro da secretaria ${updated.nome} inativado`,
        });
        return { success: true };
      }
      case "pessoas":
      case "servidores": {
        const [before] = await db.select().from(pessoas).where(eq(pessoas.id, input.id)).limit(1);
        const [updated] = await db.update(pessoas).set({ ativo: false, atualizadoEm: new Date() }).where(eq(pessoas.id, input.id)).returning();
        if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: input.entity === "servidores" ? "Servidor não encontrado." : "Pessoa não encontrada." });
        await logAuditoria(ctx, {
          tabela: "pessoas",
          registroId: updated.id,
          acao: "DELETE",
          dadosAnteriores: before,
          dadosNovos: updated,
          descricao: `Cadastro de ${input.entity === "servidores" ? "servidor" : "pessoa"} ${updated.nome} inativado`,
        });
        return { success: true };
      }
      case "departamentos": {
        const [before] = await db.select().from(departamentos).where(eq(departamentos.id, input.id)).limit(1);
        const [updated] = await db.update(departamentos).set({ ativo: false, atualizadoEm: new Date() }).where(eq(departamentos.id, input.id)).returning();
        if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Departamento não encontrado." });
        await logAuditoria(ctx, {
          tabela: "departamentos",
          registroId: updated.id,
          acao: "DELETE",
          dadosAnteriores: before,
          dadosNovos: updated,
          descricao: `Cadastro do departamento ${updated.nome} inativado`,
        });
        return { success: true };
      }
      case "usuarios": {
        if (ctx.user?.id === input.id) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Não é permitido inativar o usuário autenticado." });
        }
        const [before] = await db.select().from(users).where(eq(users.id, input.id)).limit(1);
        const [updated] = await db.update(users).set({ ativo: false, updatedAt: new Date() }).where(eq(users.id, input.id)).returning();
        if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado." });
        await logAuditoria(ctx, {
          tabela: "users",
          registroId: updated.id,
          acao: "DELETE",
          dadosAnteriores: before,
          dadosNovos: updated,
          descricao: `Cadastro do usuário ${updated.name} inativado`,
        });
        return { success: true };
      }
      case "parametros": {
        const [before] = await db.select().from(parametrosSistema).where(eq(parametrosSistema.id, input.id)).limit(1);
        const [updated] = await db.update(parametrosSistema).set({ ativo: false, atualizadoEm: new Date() }).where(eq(parametrosSistema.id, input.id)).returning();
        if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Parâmetro não encontrado." });
        await logAuditoria(ctx, {
          tabela: "parametros_sistema",
          registroId: updated.id,
          acao: "DELETE",
          dadosAnteriores: before,
          dadosNovos: updated,
          descricao: `Parâmetro ${updated.chave} inativado`,
        });
        return { success: true };
      }
    }
  }),

  bulkSetStatus: adminProcedure.input(cadastroBulkStatusInputSchema).mutation(async ({ ctx, input }) => {
    const db = requireDb();

    if (!input.ativo && input.entity === "usuarios" && ctx.user?.id && input.ids.includes(ctx.user.id)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Não é permitido inativar o usuário autenticado em lote." });
    }

    switch (input.entity) {
      case "itens": {
        const before = await db.select().from(catalogoItens).where(inArray(catalogoItens.id, input.ids));
        const updated = await db
          .update(catalogoItens)
          .set({ ativo: input.ativo, atualizadoEm: new Date() })
          .where(inArray(catalogoItens.id, input.ids))
          .returning();
        for (const row of updated) {
          const previous = before.find((item) => item.id === row.id);
          await logAuditoria(ctx, {
            tabela: "catalogo_itens",
            registroId: row.id,
            acao: "UPDATE",
            dadosAnteriores: previous,
            dadosNovos: row,
            descricao: `Cadastro do item ${row.descricao} ${input.ativo ? "reativado" : "inativado"} em lote`,
          });
        }
        return { updated: updated.length };
      }
      case "fornecedores": {
        const before = await db.select().from(fornecedores).where(inArray(fornecedores.id, input.ids));
        const updated = await db
          .update(fornecedores)
          .set({ ativo: input.ativo, atualizadoEm: new Date() })
          .where(inArray(fornecedores.id, input.ids))
          .returning();
        for (const row of updated) {
          const previous = before.find((item) => item.id === row.id);
          await logAuditoria(ctx, {
            tabela: "fornecedores",
            registroId: row.id,
            acao: "UPDATE",
            dadosAnteriores: previous,
            dadosNovos: row,
            descricao: `Cadastro do fornecedor ${row.razaoSocial} ${input.ativo ? "reativado" : "inativado"} em lote`,
          });
        }
        return { updated: updated.length };
      }
      case "secretarias": {
        const before = await db.select().from(secretarias).where(inArray(secretarias.id, input.ids));
        const updated = await db
          .update(secretarias)
          .set({ ativo: input.ativo, atualizadoEm: new Date() })
          .where(inArray(secretarias.id, input.ids))
          .returning();
        for (const row of updated) {
          const previous = before.find((item) => item.id === row.id);
          await logAuditoria(ctx, {
            tabela: "secretarias",
            registroId: row.id,
            acao: "UPDATE",
            dadosAnteriores: previous,
            dadosNovos: row,
            descricao: `Cadastro da secretaria ${row.nome} ${input.ativo ? "reativado" : "inativado"} em lote`,
          });
        }
        return { updated: updated.length };
      }
      case "pessoas":
      case "servidores": {
        const before = await db.select().from(pessoas).where(inArray(pessoas.id, input.ids));
        const updated = await db
          .update(pessoas)
          .set({ ativo: input.ativo, atualizadoEm: new Date() })
          .where(inArray(pessoas.id, input.ids))
          .returning();
        for (const row of updated) {
          const previous = before.find((item) => item.id === row.id);
          await logAuditoria(ctx, {
            tabela: "pessoas",
            registroId: row.id,
            acao: "UPDATE",
            dadosAnteriores: previous,
            dadosNovos: row,
            descricao: `Cadastro de ${input.entity === "servidores" ? "servidor" : "pessoa"} ${row.nome} ${input.ativo ? "reativado" : "inativado"} em lote`,
          });
        }
        return { updated: updated.length };
      }
      case "departamentos": {
        const before = await db.select().from(departamentos).where(inArray(departamentos.id, input.ids));
        const updated = await db
          .update(departamentos)
          .set({ ativo: input.ativo, atualizadoEm: new Date() })
          .where(inArray(departamentos.id, input.ids))
          .returning();
        for (const row of updated) {
          const previous = before.find((item) => item.id === row.id);
          await logAuditoria(ctx, {
            tabela: "departamentos",
            registroId: row.id,
            acao: "UPDATE",
            dadosAnteriores: previous,
            dadosNovos: row,
            descricao: `Cadastro do departamento ${row.nome} ${input.ativo ? "reativado" : "inativado"} em lote`,
          });
        }
        return { updated: updated.length };
      }
      case "usuarios": {
        const before = await db.select().from(users).where(inArray(users.id, input.ids));
        const updated = await db
          .update(users)
          .set({ ativo: input.ativo, updatedAt: new Date() })
          .where(inArray(users.id, input.ids))
          .returning();
        for (const row of updated) {
          const previous = before.find((item) => item.id === row.id);
          await logAuditoria(ctx, {
            tabela: "users",
            registroId: row.id,
            acao: "UPDATE",
            dadosAnteriores: previous,
            dadosNovos: row,
            descricao: `Cadastro do usuário ${row.name} ${input.ativo ? "reativado" : "inativado"} em lote`,
          });
        }
        return { updated: updated.length };
      }
      case "parametros": {
        const before = await db.select().from(parametrosSistema).where(inArray(parametrosSistema.id, input.ids));
        const updated = await db
          .update(parametrosSistema)
          .set({ ativo: input.ativo, atualizadoEm: new Date() })
          .where(inArray(parametrosSistema.id, input.ids))
          .returning();
        for (const row of updated) {
          const previous = before.find((item) => item.id === row.id);
          await logAuditoria(ctx, {
            tabela: "parametros_sistema",
            registroId: row.id,
            acao: "UPDATE",
            dadosAnteriores: previous,
            dadosNovos: row,
            descricao: `Parâmetro ${row.chave} ${input.ativo ? "reativado" : "inativado"} em lote`,
          });
        }
        return { updated: updated.length };
      }
    }
  }),
});

import { TRPCError } from "@trpc/server";
import { and, asc, count, desc, eq, ilike, inArray, isNotNull, notInArray, or, sql } from "drizzle-orm";

import {
  cadastroBulkMergeInputSchema,
  cadastroBulkStatusInputSchema,
  cadastroDeleteInputSchema,
  cadastroDedupeSuggestionsInputSchema,
  cadastroExportInputSchema,
  cadastroFornecedorVencedorBackfillBulkConfirmInputSchema,
  cadastroFornecedorVencedorBackfillConfirmInputSchema,
  cadastroFornecedorVencedorBackfillPreviewInputSchema,
  cadastroFornecedorVencedorBackfillRunInputSchema,
  cadastroGetByIdInputSchema,
  cadastroHistoryInputSchema,
  cadastroLookupInputSchema,
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

import { hasRole, requireAdmin } from "../auth.js";
import { logAuditoria } from "../db/auditoria.js";
import { requireDb } from "../db/client.js";
import {
  auditoriaLog,
  cargos,
  catalogoItens,
  contratoItens,
  contratos,
  cotacoes,
  dfd,
  dfdResponsaveis,
  departamentos,
  fornecedores,
  funcoes,
  importacaoBllItensEspecificados,
  itensProcesso,
  itensProcessoValores,
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
import { sanitizeAuditData } from "../lib/audit-data.js";
import {
  confirmFornecedorVencedorLinksBatch,
  confirmFornecedorVencedorLink,
  previewFornecedorVencedorBackfill,
  runFornecedorVencedorBackfill,
} from "../lib/fornecedor-vencedor-saneamento.js";
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

function normalizePessoaMatricula(value: string | null | undefined) {
  return (value ?? "").trim();
}

function findPessoaByNormalizedMatricula(normalizedMatricula: string) {
  return sql<boolean>`lower(trim(coalesce(${pessoas.matricula}, ''))) = ${normalizedMatricula.toLowerCase()}`;
}

function toNullableDate(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function hasCompleteIdentityFields(row: {
  cpf: string | null;
  matricula: string | null;
  dataNascimento: string | Date | null;
}) {
  return (
    normalizePessoaCpf(row.cpf).length === 11 &&
    Boolean(normalizePessoaMatricula(row.matricula)) &&
    Boolean(row.dataNascimento)
  );
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

function chooseLongerText(
  preferredValue: string | null | undefined,
  fallbackValue: string | null | undefined,
) {
  const normalizedPreferred = toNullableString(preferredValue);
  const normalizedFallback = toNullableString(fallbackValue);
  if (!normalizedPreferred) return normalizedFallback;
  if (!normalizedFallback) return normalizedPreferred;
  return normalizedPreferred.length >= normalizedFallback.length
    ? normalizedPreferred
    : normalizedFallback;
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

function decimalToNumber(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDecimalString(value: number, scale: number) {
  return value.toFixed(scale);
}

async function mergeItemRecords(
  tx: any,
  userId: number | null,
  sourceId: number,
  targetId: number,
) {
  const rows = await tx
    .select()
    .from(catalogoItens)
    .where(inArray(catalogoItens.id, [sourceId, targetId]));

  const source = rows.find((row: any) => row.id === sourceId) ?? null;
  const target = rows.find((row: any) => row.id === targetId) ?? null;

  if (!source) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Item duplicado não encontrado." });
  }

  if (!target) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Item de destino não encontrado." });
  }

  const now = new Date();
  const targetPatch = {
    descricao: chooseLongerText(target.descricao, source.descricao) ?? target.descricao,
    unidadePadrao: chooseFornecedorText(target.unidadePadrao, source.unidadePadrao) ?? target.unidadePadrao,
    valorReferencia:
      target.valorReferencia ?? source.valorReferencia ?? null,
    imagemUrl: target.imagemUrl ?? source.imagemUrl,
    imagemChave: target.imagemChave ?? source.imagemChave,
    ativo: target.ativo || source.ativo,
    atualizadoEm: now,
  };

  const [updatedTarget] = await tx
    .update(catalogoItens)
    .set(targetPatch)
    .where(eq(catalogoItens.id, target.id))
    .returning();

  if (!updatedTarget) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Item de destino não encontrado." });
  }

  const processosAtualizados = await tx
    .update(itensProcesso)
    .set({ catalogoItemId: target.id, atualizadoEm: now })
    .where(eq(itensProcesso.catalogoItemId, source.id))
    .returning({ id: itensProcesso.id });

  const importacaoItensAtualizados = await tx
    .update(importacaoBllItensEspecificados)
    .set({ catalogoInternoId: target.id, atualizadoEm: now })
    .where(eq(importacaoBllItensEspecificados.catalogoInternoId, source.id))
    .returning({ id: importacaoBllItensEspecificados.id });

  const sourceContratoItemRows = await tx
    .select()
    .from(contratoItens)
    .where(eq(contratoItens.catalogoItemId, source.id));
  const targetContratoItemRows = await tx
    .select()
    .from(contratoItens)
    .where(eq(contratoItens.catalogoItemId, target.id));

  const targetContratoItemByContratoId = new Map<number, any>(
    targetContratoItemRows.map((row: any) => [row.contratoId, row]),
  );

  let contratoItensRemapeados = 0;
  let contratoItensMesclados = 0;

  for (const sourceContratoItem of sourceContratoItemRows) {
    const targetContratoItem = targetContratoItemByContratoId.get(
      sourceContratoItem.contratoId,
    );

    if (!targetContratoItem) {
      await tx
        .update(contratoItens)
        .set({
          catalogoItemId: target.id,
          descricao:
            chooseLongerText(sourceContratoItem.descricao, updatedTarget.descricao) ??
            sourceContratoItem.descricao,
          unidade:
            chooseFornecedorText(sourceContratoItem.unidade, updatedTarget.unidadePadrao) ??
            sourceContratoItem.unidade,
          atualizadoEm: now,
        })
        .where(eq(contratoItens.id, sourceContratoItem.id));
      contratoItensRemapeados += 1;
      continue;
    }

    const quantidadeContratada =
      decimalToNumber(targetContratoItem.quantidadeContratada) +
      decimalToNumber(sourceContratoItem.quantidadeContratada);
    const quantidadeConsumida =
      decimalToNumber(targetContratoItem.quantidadeConsumida) +
      decimalToNumber(sourceContratoItem.quantidadeConsumida);

    await tx
      .update(contratoItens)
      .set({
        descricao:
          chooseLongerText(targetContratoItem.descricao, sourceContratoItem.descricao) ??
          targetContratoItem.descricao,
        unidade:
          chooseFornecedorText(targetContratoItem.unidade, sourceContratoItem.unidade) ??
          targetContratoItem.unidade,
        quantidadeContratada: toDecimalString(quantidadeContratada, 3),
        quantidadeConsumida: toDecimalString(quantidadeConsumida, 3),
        valorUnitario: targetContratoItem.valorUnitario ?? sourceContratoItem.valorUnitario ?? null,
        ativo: targetContratoItem.ativo || sourceContratoItem.ativo,
        atualizadoEm: now,
      })
      .where(eq(contratoItens.id, targetContratoItem.id));

    await tx
      .delete(contratoItens)
      .where(eq(contratoItens.id, sourceContratoItem.id))
      .returning({ id: contratoItens.id });

    contratoItensMesclados += 1;
  }

  const [deletedSource] = await tx
    .delete(catalogoItens)
    .where(eq(catalogoItens.id, source.id))
    .returning();

  if (!deletedSource) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Não foi possível concluir a unificação do item duplicado.",
    });
  }

  await tx.insert(auditoriaLog).values([
    {
      usuarioId: userId,
      tabela: "catalogo_itens",
      registroId: updatedTarget.id,
      acao: "UPDATE",
      dadosAnteriores: target,
      dadosNovos: {
        ...updatedTarget,
        mergeSummary: {
          sourceId: source.id,
          sourceDescricao: source.descricao,
          processosAtualizados: processosAtualizados.length,
          contratoItensRemapeados,
          contratoItensMesclados,
          importacaoItensAtualizados: importacaoItensAtualizados.length,
        },
      },
      descricao: `Item ${source.descricao} unificado em ${updatedTarget.descricao}`,
    },
    {
      usuarioId: userId,
      tabela: "catalogo_itens",
      registroId: source.id,
      acao: "DELETE",
      dadosAnteriores: source,
      dadosNovos: {
        mergedIntoCatalogoItemId: updatedTarget.id,
        mergedIntoDescricao: updatedTarget.descricao,
      },
      descricao: `Item ${source.descricao} absorvido por ${updatedTarget.descricao}`,
    },
  ]);

  return {
    itemMantido: {
      id: updatedTarget.id,
      descricao: updatedTarget.descricao,
      unidadePadrao: updatedTarget.unidadePadrao,
    },
    itemRemovido: {
      id: source.id,
      descricao: source.descricao,
      unidadePadrao: source.unidadePadrao,
    },
    summary: {
      processosAtualizados: processosAtualizados.length,
      contratoItensRemapeados,
      contratoItensMesclados,
      importacaoItensAtualizados: importacaoItensAtualizados.length,
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

  const conflictingFields: string[] = [];
  const sourceCpfDigits = normalizePessoaCpf(source.cpf);
  const targetCpfDigits = normalizePessoaCpf(target.cpf);
  if (
    sourceCpfDigits.length === 11 &&
    targetCpfDigits.length === 11 &&
    sourceCpfDigits !== targetCpfDigits
  ) {
    conflictingFields.push("CPF");
  }

  const sourceMatricula = normalizePessoaMatricula(source.matricula).toLowerCase();
  const targetMatricula = normalizePessoaMatricula(target.matricula).toLowerCase();
  if (sourceMatricula && targetMatricula && sourceMatricula !== targetMatricula) {
    conflictingFields.push("matricula");
  }

  const normalizeDate = (value: string | Date | null | undefined) => {
    if (!value) return null;
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
    }
    const normalized = String(value).trim();
    return normalized ? normalized.slice(0, 10) : null;
  };
  const sourceBirthDate = normalizeDate(source.dataNascimento);
  const targetBirthDate = normalizeDate(target.dataNascimento);
  if (sourceBirthDate && targetBirthDate && sourceBirthDate !== targetBirthDate) {
    conflictingFields.push("data de nascimento");
  }

  const structuredIdFields = [
    ["cargo", source.cargoId, target.cargoId],
    ["funcao", source.funcaoId, target.funcaoId],
    ["secretaria", source.secretariaId, target.secretariaId],
  ] as const;
  for (const [label, sourceValue, targetValue] of structuredIdFields) {
    if (sourceValue != null && targetValue != null && sourceValue !== targetValue) {
      conflictingFields.push(label);
    }
  }

  if (conflictingFields.length) {
    throw new TRPCError({
      code: "CONFLICT",
      message: `As pessoas possuem dados estruturados divergentes (${conflictingFields.join(", ")}). Resolva os campos antes de unificar.`,
    });
  }

  const linkedUsers = await tx
    .select({
      id: users.id,
      pessoaId: users.pessoaId,
      name: users.name,
      secretariaId: users.secretariaId,
      identityProfileCompletedAt: users.identityProfileCompletedAt,
      sessionVersion: users.sessionVersion,
      ativo: users.ativo,
    })
    .from(users)
    .where(inArray(users.pessoaId, [source.id, target.id]));
  const sourceLinkedUsers = linkedUsers.filter((row: any) => row.pessoaId === source.id);
  const targetLinkedUsers = linkedUsers.filter((row: any) => row.pessoaId === target.id);
  if (sourceLinkedUsers.length > 1 || targetLinkedUsers.length > 1) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Ha mais de um usuario vinculado a uma das pessoas. Regularize os vinculos antes de unificar.",
    });
  }
  if (sourceLinkedUsers.length && targetLinkedUsers.length) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "As duas pessoas possuem usuarios distintos. Desvincule um dos usuarios antes de unificar.",
    });
  }
  const sourceLinkedUser = sourceLinkedUsers[0] ?? null;
  const targetLinkedUser = targetLinkedUsers[0] ?? null;

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

  const mergedCargoId = target.cargoId ?? source.cargoId ?? null;
  const mergedCargoText = target.cargoId != null
    ? chooseFornecedorText(target.cargo, source.cargo)
    : source.cargoId != null
      ? chooseFornecedorText(source.cargo, target.cargo)
      : chooseFornecedorText(target.cargo, source.cargo);
  const targetPatch = {
    nome: chooseFornecedorText(target.nome, source.nome) ?? target.nome,
    cpf: targetCpf,
    matricula: toNullableString(target.matricula) ?? toNullableString(source.matricula),
    dataNascimento: target.dataNascimento ?? source.dataNascimento ?? null,
    cargo: mergedCargoText,
    cargoId: mergedCargoId,
    funcaoId: target.funcaoId ?? source.funcaoId ?? null,
    secretariaId: target.secretariaId ?? source.secretariaId ?? null,
    ativo: target.ativo || source.ativo,
    atualizadoEm: now,
  };
  if (
    targetPatch.secretariaId != null &&
    (!targetPatch.cargoId ||
      !targetPatch.matricula ||
      !targetPatch.dataNascimento)
  ) {
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "A unificacao produziria um servidor incompleto. Regularize cargo, matricula e data de nascimento antes de continuar.",
    });
  }

  const [updatedTarget] = await tx
    .update(pessoas)
    .set(targetPatch)
    .where(eq(pessoas.id, target.id))
    .returning();

  if (!updatedTarget) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Pessoa de destino nÃ£o encontrada." });
  }

  let remappedUser: typeof sourceLinkedUser = null;
  if (sourceLinkedUser) {
    const completedAt = hasCompleteIdentityFields(updatedTarget)
      ? sourceLinkedUser.identityProfileCompletedAt ?? now
      : null;
    [remappedUser] = await tx
      .update(users)
      .set({
        pessoaId: updatedTarget.id,
        name: updatedTarget.nome,
        secretariaId: updatedTarget.secretariaId,
        identityProfileCompletedAt: completedAt,
        sessionVersion: sql`${users.sessionVersion} + 1`,
        updatedAt: now,
      })
      .where(eq(users.id, sourceLinkedUser.id))
      .returning({
        id: users.id,
        pessoaId: users.pessoaId,
        name: users.name,
        secretariaId: users.secretariaId,
        identityProfileCompletedAt: users.identityProfileCompletedAt,
        sessionVersion: users.sessionVersion,
        ativo: users.ativo,
      });
    if (!remappedUser) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "Nao foi possivel remapear o usuario vinculado para a pessoa de destino.",
      });
    }
  }

  let synchronizedTargetUser: typeof targetLinkedUser = null;
  if (targetLinkedUser) {
    const completedAt = hasCompleteIdentityFields(updatedTarget)
      ? targetLinkedUser.identityProfileCompletedAt ?? now
      : null;
    const claimsChanged =
      targetLinkedUser.name !== updatedTarget.nome ||
      targetLinkedUser.secretariaId !== updatedTarget.secretariaId;
    const completionChanged =
      (targetLinkedUser.identityProfileCompletedAt?.getTime() ?? null) !==
      (completedAt?.getTime() ?? null);
    if (claimsChanged || completionChanged) {
      [synchronizedTargetUser] = await tx
        .update(users)
        .set({
          name: updatedTarget.nome,
          secretariaId: updatedTarget.secretariaId,
          identityProfileCompletedAt: completedAt,
          sessionVersion: claimsChanged
            ? sql`${users.sessionVersion} + 1`
            : targetLinkedUser.sessionVersion,
          updatedAt: now,
        })
        .where(eq(users.id, targetLinkedUser.id))
        .returning({
          id: users.id,
          pessoaId: users.pessoaId,
          name: users.name,
          secretariaId: users.secretariaId,
          identityProfileCompletedAt: users.identityProfileCompletedAt,
          sessionVersion: users.sessionVersion,
          ativo: users.ativo,
        });
      if (!synchronizedTargetUser) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Nao foi possivel sincronizar o usuario da pessoa de destino.",
        });
      }
    }
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

  const mergeSummary = {
    sourceId: source.id,
    sourceNome: source.nome,
    departamentosAtualizados: departamentosAtualizados.length,
    processosAutoridadeAtualizados: processosAutoridadeAtualizados.length,
    processosCondutorAtualizados: processosCondutorAtualizados.length,
    dfdSolicitanteAtualizados: dfdSolicitanteAtualizados.length,
    dfdAssinaturasAtualizadas: dfdAssinaturasAtualizadas.length,
    dfdResponsaveisRemapeados,
    dfdResponsaveisMesclados,
    usuariosRemapeados: remappedUser ? 1 : 0,
    usuariosDestinoPreservados: targetLinkedUser ? 1 : 0,
    usuariosDestinoSincronizados: synchronizedTargetUser ? 1 : 0,
  };
  const auditEntries: Array<typeof auditoriaLog.$inferInsert> = [
    {
      usuarioId: userId,
      tabela: "pessoas",
      registroId: updatedTarget.id,
      acao: "UPDATE",
      dadosAnteriores: target,
      dadosNovos: {
        ...updatedTarget,
        mergeSummary,
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
  ];
  if (sourceLinkedUser && remappedUser) {
    auditEntries.push({
      usuarioId: userId,
      tabela: "users",
      registroId: remappedUser.id,
      acao: "UPDATE",
      dadosAnteriores: sanitizeAuditData(sourceLinkedUser),
      dadosNovos: sanitizeAuditData(remappedUser),
      descricao: `Usuario ${remappedUser.name} remapeado para a pessoa ${updatedTarget.nome}`,
    });
  }
  if (targetLinkedUser && synchronizedTargetUser) {
    auditEntries.push({
      usuarioId: userId,
      tabela: "users",
      registroId: synchronizedTargetUser.id,
      acao: "UPDATE",
      dadosAnteriores: sanitizeAuditData(targetLinkedUser),
      dadosNovos: sanitizeAuditData(synchronizedTargetUser),
      descricao: `Usuario ${synchronizedTargetUser.name} sincronizado apos unificacao da pessoa ${updatedTarget.nome}`,
    });
  }
  await tx.insert(auditoriaLog).values(auditEntries);

  return {
    pessoaMantida: {
      id: updatedTarget.id,
      nome: updatedTarget.nome,
      cpf: updatedTarget.cpf,
      matricula: updatedTarget.matricula,
      dataNascimento: updatedTarget.dataNascimento,
      cargo: updatedTarget.cargo,
      cargoId: updatedTarget.cargoId,
      funcaoId: updatedTarget.funcaoId,
      secretariaId: updatedTarget.secretariaId,
    },
    pessoaRemovida: {
      id: source.id,
      nome: source.nome,
      cpf: source.cpf,
      secretariaId: source.secretariaId,
    },
    summary: mergeSummary,
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

function entityTableName(entity: "itens" | "fornecedores" | "secretarias" | "cargos" | "funcoes" | "pessoas" | "servidores" | "departamentos" | "usuarios" | "parametros") {
  switch (entity) {
    case "itens":
      return "catalogo_itens";
    case "fornecedores":
      return "fornecedores";
    case "secretarias":
      return "secretarias";
    case "cargos":
      return "cargos";
    case "funcoes":
      return "funcoes";
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

export function normalizeCadastroLookupText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function buildCadastroLookupTrigrams(value: string | null | undefined) {
  const trigrams = new Set<string>();
  for (const word of normalizeCadastroLookupText(value).split(" ")) {
    if (!/^[a-z]+$/.test(word) || word.length < 2) continue;
    const chunkSize = word.length <= 5 ? 2 : 3;
    for (let index = 0; index <= word.length - chunkSize; index += 1) {
      trigrams.add(word.slice(index, index + chunkSize));
      if (trigrams.size >= 24) return [...trigrams];
    }
  }
  return [...trigrams];
}

export function sanitizeCadastroAuditData(value: unknown): unknown {
  return sanitizeAuditData(value);
}

export function canUseCadastroCatalogSelection(
  selectedId: number | null | undefined,
  selected: { id: number; ativo: boolean } | null | undefined,
  existingId: number | null | undefined,
) {
  if (!selectedId) return true;
  return Boolean(selected && (selected.ativo || existingId === selectedId));
}

function normalizedTextSql(column: any) {
  return sql<string>`lower(regexp_replace(translate(coalesce(${column}, ''), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ', 'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn'), '\\s+', ' ', 'g'))`;
}

function logPessoaLookupFailure(
  input: { entity: string; search?: string | null },
  error: unknown,
) {
  const failure = error as {
    name?: unknown;
    code?: unknown;
    cause?: { code?: unknown };
  };
  const databaseCode = failure?.cause?.code ?? failure?.code;

  // Registra contexto operacional sem incluir a consulta, parametros ou termo pesquisado.
  console.error("Falha ao consultar pessoas no lookup de cadastros.", {
    entity: input.entity,
    searchLength: input.search?.length ?? 0,
    errorName: typeof failure?.name === "string" ? failure.name : "UnknownError",
    databaseCode: typeof databaseCode === "string" ? databaseCode : undefined,
  });
}

export function maskCadastroCpf(value: string | null | undefined) {
  const digits = normalizePessoaCpf(value);
  if (digits.length !== 11) return null;
  return `***.${digits.slice(3, 6)}.***-${digits.slice(9)}`;
}

type CadastroLookupItem = {
  id: number;
  label: string;
  subtitle?: string;
  metadata?: {
    matricula?: string | null;
    cpfMascarado?: string | null;
    secretariaId?: number | null;
    secretariaNome?: string | null;
    cargoId?: number | null;
    cargoNome?: string | null;
    funcaoId?: number | null;
    funcaoNome?: string | null;
    sigla?: string | null;
    codigo?: string | null;
    cnpj?: string | null;
    cidade?: string | null;
    estado?: string | null;
    unidadePadrao?: string | null;
    valorReferencia?: number | null;
  };
};

async function loadCadastroRecord(
  db: ReturnType<typeof requireDb>,
  entity: Parameters<typeof entityTableName>[0],
  id: number,
): Promise<any | null> {
  switch (entity) {
    case "itens": {
      const [row] = await db.select().from(catalogoItens).where(eq(catalogoItens.id, id)).limit(1);
      return row
        ? {
            ...row,
            nome: row.descricao,
            codigo: itemCodeFromId(row.id),
            valorReferencia: row.valorReferencia ? Number(row.valorReferencia) : null,
            status: row.ativo ? "ativo" : "inativo",
          }
        : null;
    }
    case "fornecedores": {
      const [row] = await db.select().from(fornecedores).where(eq(fornecedores.id, id)).limit(1);
      return row ? { ...row, status: row.ativo ? "ativo" : "inativo" } : null;
    }
    case "secretarias": {
      const [row] = await db.select().from(secretarias).where(eq(secretarias.id, id)).limit(1);
      return row ? { ...row, status: row.ativo ? "ativo" : "inativo" } : null;
    }
    case "cargos": {
      const [row] = await db.select().from(cargos).where(eq(cargos.id, id)).limit(1);
      return row
        ? {
            id: row.id,
            codigo: row.codigo,
            nome: row.nome,
            categoria: row.categoria,
            descricao: row.descricao,
            ativo: row.ativo,
            status: row.ativo ? "ativo" : "inativo",
            criadoEm: row.criadoEm,
            atualizadoEm: row.atualizadoEm,
          }
        : null;
    }
    case "funcoes": {
      const [row] = await db.select().from(funcoes).where(eq(funcoes.id, id)).limit(1);
      return row
        ? {
            id: row.id,
            codigo: row.codigo,
            nome: row.nome,
            descricao: row.descricao,
            ativo: row.ativo,
            status: row.ativo ? "ativo" : "inativo",
            criadoEm: row.criadoEm,
            atualizadoEm: row.atualizadoEm,
          }
        : null;
    }
    case "pessoas":
    case "servidores": {
      const [row] = await db
        .select({
          id: pessoas.id,
          nome: pessoas.nome,
          cpf: pessoas.cpf,
          matricula: pessoas.matricula,
          dataNascimento: pessoas.dataNascimento,
          cargo: pessoas.cargo,
          cargoId: pessoas.cargoId,
          cargoNome: cargos.nome,
          funcaoId: pessoas.funcaoId,
          funcaoNome: funcoes.nome,
          secretariaId: pessoas.secretariaId,
          secretariaNome: secretarias.nome,
          ativo: pessoas.ativo,
          criadoEm: pessoas.criadoEm,
          atualizadoEm: pessoas.atualizadoEm,
        })
        .from(pessoas)
        .leftJoin(secretarias, eq(secretarias.id, pessoas.secretariaId))
        .leftJoin(cargos, eq(cargos.id, pessoas.cargoId))
        .leftJoin(funcoes, eq(funcoes.id, pessoas.funcaoId))
        .where(eq(pessoas.id, id))
        .limit(1);
      if (!row || (entity === "servidores" && !row.secretariaId)) return null;
      return {
        ...row,
        cargo: row.cargoNome ?? row.cargo,
        status: row.ativo ? "ativo" : "inativo",
      };
    }
    case "departamentos": {
      const [row] = await db
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
          criadoEm: departamentos.criadoEm,
          atualizadoEm: departamentos.atualizadoEm,
        })
        .from(departamentos)
        .leftJoin(secretarias, eq(secretarias.id, departamentos.secretariaId))
        .leftJoin(pessoas, eq(pessoas.id, departamentos.responsavelId))
        .where(eq(departamentos.id, id))
        .limit(1);
      return row ? { ...row, status: row.ativo ? "ativo" : "inativo" } : null;
    }
    case "usuarios": {
      const [row] = await db
        .select({
          id: users.id,
          username: users.username,
          name: users.name,
          email: users.email,
          role: users.role,
          secretariaId: users.secretariaId,
          secretariaNome: secretarias.nome,
          pessoaId: users.pessoaId,
          pessoaNome: pessoas.nome,
          pessoaCpf: pessoas.cpf,
          pessoaMatricula: pessoas.matricula,
          pessoaDataNascimento: pessoas.dataNascimento,
          identityProfileCompletedAt: users.identityProfileCompletedAt,
          ativo: users.ativo,
          lastSignedIn: users.lastSignedIn,
          criadoEm: users.createdAt,
          atualizadoEm: users.updatedAt,
        })
        .from(users)
        .leftJoin(secretarias, eq(secretarias.id, users.secretariaId))
        .leftJoin(pessoas, eq(pessoas.id, users.pessoaId))
        .where(eq(users.id, id))
        .limit(1);
      if (!row) return null;
      const identityStatus = !row.pessoaId
        ? "sem_vinculo"
        : !row.pessoaNome
          ? "conflito"
          : hasCompleteIdentityFields({
              cpf: row.pessoaCpf,
              matricula: row.pessoaMatricula,
              dataNascimento: row.pessoaDataNascimento,
            })
            ? "completo"
            : "incompleto";
      return {
        ...row,
        identityStatus,
        status: row.ativo ? "ativo" : "inativo",
      };
    }
    case "parametros": {
      const [row] = await db
        .select()
        .from(parametrosSistema)
        .where(eq(parametrosSistema.id, id))
        .limit(1);
      return row ? { ...row, status: row.ativo ? "ativo" : "inativo" } : null;
    }
  }
}

function identitySignature(entity: Parameters<typeof entityTableName>[0], record: any | null) {
  if (!record) return null;
  if (entity === "pessoas" || entity === "servidores") {
    return JSON.stringify([
      normalizePessoaCpf(record.cpf),
      normalizePessoaMatricula(record.matricula),
      record.dataNascimento ?? null,
    ]);
  }
  if (entity === "usuarios") {
    return JSON.stringify([
      record.pessoaId ?? null,
      record.identityProfileCompletedAt ?? null,
    ]);
  }
  return null;
}

async function finalizeCadastroSave(
  db: ReturnType<typeof requireDb>,
  entity: Parameters<typeof entityTableName>[0],
  id: number,
  currentUserId: number | null,
  beforeRecord: any | null,
) {
  const record = await loadCadastroRecord(db, entity, id);
  if (!record) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "A gravacao nao foi confirmada pela leitura do cadastro.",
    });
  }

  let affectsCurrentIdentity = entity === "usuarios" && id === currentUserId;
  if (!affectsCurrentIdentity && currentUserId && (entity === "pessoas" || entity === "servidores")) {
    const [currentUser] = await db
      .select({ pessoaId: users.pessoaId })
      .from(users)
      .where(eq(users.id, currentUserId))
      .limit(1);
    affectsCurrentIdentity = currentUser?.pessoaId === id;
  }

  return {
    ...record,
    record,
    affectsCurrentIdentity,
    identityProfileChanged:
      identitySignature(entity, beforeRecord) !== identitySignature(entity, record),
  };
}

async function syncLinkedUserIdentity(
  db: ReturnType<typeof requireDb>,
  pessoaId: number,
) {
  const [pessoa] = await db
    .select({
      cpf: pessoas.cpf,
      matricula: pessoas.matricula,
      dataNascimento: pessoas.dataNascimento,
    })
    .from(pessoas)
    .where(eq(pessoas.id, pessoaId))
    .limit(1);
  if (!pessoa) return;

  const linkedUsers = await db
    .select({
      id: users.id,
      identityProfileCompletedAt: users.identityProfileCompletedAt,
    })
    .from(users)
    .where(eq(users.pessoaId, pessoaId));
  const completed = hasCompleteIdentityFields(pessoa);
  for (const linkedUser of linkedUsers) {
    const completedAt = completed
      ? linkedUser.identityProfileCompletedAt ?? new Date()
      : null;
    if (completedAt === linkedUser.identityProfileCompletedAt) continue;
    await db
      .update(users)
      .set({ identityProfileCompletedAt: completedAt, updatedAt: new Date() })
      .where(eq(users.id, linkedUser.id));
  }
}

type DedupeClassification = "ALTA" | "MEDIA" | "BAIXA";

type DedupeCandidateRecord = {
  id: number;
  label: string;
  documento: string | null;
  ativo: boolean;
  vinculos: number;
  atualizadoEm: Date | null;
  subtitle: string | null;
  normalizedName: string;
  normalizedEmail: string;
  normalizedPhone: string;
  normalizedCity: string;
  normalizedState: string;
  normalizedDocumento: string;
  normalizedCargo: string;
  normalizedUnit: string;
  secretariaId: number | null;
  nameTokens: string[];
  completenessScore: number;
  referenceValue: number | null;
};

type DedupePairScore = {
  score: number;
  classification: DedupeClassification | null;
  reasons: string[];
};

type DedupePairEdge = {
  leftId: number;
  rightId: number;
  score: number;
  classification: DedupeClassification;
  reasons: string[];
};

function normalizeDedupeText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDedupeDigits(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

function normalizeDedupeEmail(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function normalizeDedupePhone(value: string | null | undefined) {
  const digits = normalizeDedupeDigits(value);
  if (digits.length < 8) return "";
  return digits.slice(-8);
}

function dedupeNameTokens(value: string) {
  return value.split(" ").filter((token) => token.length >= 2);
}

function dedupeTokenSimilarity(leftTokens: string[], rightTokens: string[]) {
  if (!leftTokens.length || !rightTokens.length) {
    return 0;
  }

  const leftSet = new Set(leftTokens);
  const rightSet = new Set(rightTokens);
  let intersection = 0;

  for (const token of leftSet) {
    if (rightSet.has(token)) {
      intersection += 1;
    }
  }

  const union = leftSet.size + rightSet.size - intersection;
  if (!union) return 0;
  return intersection / union;
}

function dedupeClassificationFromScore(
  score: number,
  thresholds: { alta: number; media: number; baixa: number },
): DedupeClassification | null {
  if (score >= thresholds.alta) return "ALTA";
  if (score >= thresholds.media) return "MEDIA";
  if (score >= thresholds.baixa) return "BAIXA";
  return null;
}

function dedupeClassificationWeight(classification: DedupeClassification) {
  switch (classification) {
    case "ALTA":
      return 3;
    case "MEDIA":
      return 2;
    case "BAIXA":
      return 1;
  }
}

function dedupePairKey(leftId: number, rightId: number) {
  if (leftId < rightId) return `${leftId}:${rightId}`;
  return `${rightId}:${leftId}`;
}

function buildDedupePairCandidates(
  buckets: Map<string, number[]>,
  maxBucketSize: number,
) {
  const pairKeys = new Set<string>();

  for (const ids of buckets.values()) {
    if (ids.length < 2 || ids.length > maxBucketSize) {
      continue;
    }

    for (let leftIndex = 0; leftIndex < ids.length - 1; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < ids.length; rightIndex += 1) {
        pairKeys.add(dedupePairKey(ids[leftIndex], ids[rightIndex]));
      }
    }
  }

  return pairKeys;
}

function scoreFornecedorPair(
  left: DedupeCandidateRecord,
  right: DedupeCandidateRecord,
): DedupePairScore {
  let score = 0;
  const reasons: string[] = [];

  if (
    left.normalizedDocumento.length === 14 &&
    left.normalizedDocumento === right.normalizedDocumento
  ) {
    score += 92;
    reasons.push("CNPJ idêntico");
  }

  if (left.normalizedName && left.normalizedName === right.normalizedName) {
    score += 46;
    reasons.push("Razão social idêntica");
  } else if (left.normalizedName && right.normalizedName) {
    const similarity = dedupeTokenSimilarity(left.nameTokens, right.nameTokens);
    if (similarity >= 0.82) {
      score += 34;
      reasons.push("Razão social muito parecida");
    } else if (similarity >= 0.65) {
      score += 22;
      reasons.push("Razão social parecida");
    } else if (
      left.normalizedName.includes(right.normalizedName) ||
      right.normalizedName.includes(left.normalizedName)
    ) {
      score += 18;
      reasons.push("Uma razão social contém a outra");
    }
  }

  if (
    left.normalizedEmail &&
    left.normalizedEmail === right.normalizedEmail
  ) {
    score += 18;
    reasons.push("E-mail idêntico");
  }

  if (
    left.normalizedPhone &&
    left.normalizedPhone === right.normalizedPhone
  ) {
    score += 14;
    reasons.push("Telefone idêntico");
  }

  if (
    left.normalizedCity &&
    right.normalizedCity &&
    left.normalizedCity === right.normalizedCity
  ) {
    score += 6;
    reasons.push("Mesma cidade");
  }

  if (
    left.normalizedState &&
    right.normalizedState &&
    left.normalizedState === right.normalizedState
  ) {
    score += 4;
    if (!reasons.includes("Mesma cidade")) {
      reasons.push("Mesma UF");
    }
  }

  if (
    !left.normalizedDocumento &&
    !right.normalizedDocumento &&
    score < 55
  ) {
    score -= 10;
  }

  const boundedScore = Math.max(0, Math.min(100, Math.round(score)));
  return {
    score: boundedScore,
    classification: dedupeClassificationFromScore(boundedScore, {
      alta: 85,
      media: 65,
      baixa: 52,
    }),
    reasons: reasons.slice(0, 4),
  };
}

function scorePessoaPair(
  left: DedupeCandidateRecord,
  right: DedupeCandidateRecord,
): DedupePairScore {
  let score = 0;
  const reasons: string[] = [];

  if (
    left.normalizedDocumento.length === 11 &&
    left.normalizedDocumento === right.normalizedDocumento
  ) {
    score += 95;
    reasons.push("CPF idêntico");
  }

  if (left.normalizedName && left.normalizedName === right.normalizedName) {
    score += 48;
    reasons.push("Nome idêntico");
  } else if (left.normalizedName && right.normalizedName) {
    const similarity = dedupeTokenSimilarity(left.nameTokens, right.nameTokens);
    if (similarity >= 0.84) {
      score += 32;
      reasons.push("Nome muito parecido");
    } else if (similarity >= 0.7) {
      score += 22;
      reasons.push("Nome parecido");
    } else if (
      left.normalizedName.includes(right.normalizedName) ||
      right.normalizedName.includes(left.normalizedName)
    ) {
      score += 16;
      reasons.push("Um nome contém o outro");
    }
  }

  if (
    left.secretariaId &&
    right.secretariaId &&
    left.secretariaId === right.secretariaId
  ) {
    score += 10;
    reasons.push("Mesma secretaria");
  }

  if (left.normalizedCargo && right.normalizedCargo) {
    if (left.normalizedCargo === right.normalizedCargo) {
      score += 10;
      reasons.push("Cargo idêntico");
    } else {
      const cargoSimilarity = dedupeTokenSimilarity(
        dedupeNameTokens(left.normalizedCargo),
        dedupeNameTokens(right.normalizedCargo),
      );
      if (cargoSimilarity >= 0.75) {
        score += 6;
        reasons.push("Cargo parecido");
      }
    }
  }

  if (
    !left.normalizedDocumento &&
    !right.normalizedDocumento &&
    !left.secretariaId &&
    !right.secretariaId &&
    score < 62
  ) {
    score -= 8;
  }

  const boundedScore = Math.max(0, Math.min(100, Math.round(score)));
  return {
    score: boundedScore,
    classification: dedupeClassificationFromScore(boundedScore, {
      alta: 88,
      media: 68,
      baixa: 55,
    }),
    reasons: reasons.slice(0, 4),
  };
}

function scoreItemPair(
  left: DedupeCandidateRecord,
  right: DedupeCandidateRecord,
): DedupePairScore {
  let score = 0;
  const reasons: string[] = [];

  if (left.normalizedName && left.normalizedName === right.normalizedName) {
    score += 68;
    reasons.push("Descrição idêntica");
  } else if (left.normalizedName && right.normalizedName) {
    const similarity = dedupeTokenSimilarity(left.nameTokens, right.nameTokens);
    if (similarity >= 0.9) {
      score += 42;
      reasons.push("Descrição muito parecida");
    } else if (similarity >= 0.75) {
      score += 28;
      reasons.push("Descrição parecida");
    } else if (
      left.normalizedName.includes(right.normalizedName) ||
      right.normalizedName.includes(left.normalizedName)
    ) {
      score += 24;
      reasons.push("Uma descrição contém a outra");
    }
  }

  if (
    left.nameTokens.length >= 3 &&
    right.nameTokens.length >= 3 &&
    left.nameTokens.slice(0, 3).join(" ") === right.nameTokens.slice(0, 3).join(" ")
  ) {
    score += 18;
    reasons.push("Mesmo prefixo descritivo");
  }

  if (
    left.normalizedUnit &&
    right.normalizedUnit &&
    left.normalizedUnit === right.normalizedUnit
  ) {
    score += 14;
    reasons.push("Mesma unidade");
  } else if (left.normalizedUnit && right.normalizedUnit) {
    score -= 14;
  }

  if (left.referenceValue !== null && right.referenceValue !== null) {
    const maxReference = Math.max(left.referenceValue, right.referenceValue);
    const difference = Math.abs(left.referenceValue - right.referenceValue);
    if (difference === 0) {
      score += 12;
      reasons.push("Mesmo valor de referência");
    } else if (maxReference > 0 && difference / maxReference <= 0.03) {
      score += 8;
      reasons.push("Valor de referência muito próximo");
    }
  }

  if (left.normalizedName && right.normalizedName && score < 52) {
    const sharedTokens = left.nameTokens.filter((token) => right.nameTokens.includes(token));
    if (sharedTokens.length <= 1) {
      score -= 8;
    }
  }

  const boundedScore = Math.max(0, Math.min(100, Math.round(score)));
  return {
    score: boundedScore,
    classification: dedupeClassificationFromScore(boundedScore, {
      alta: 84,
      media: 66,
      baixa: 54,
    }),
    reasons: reasons.slice(0, 4),
  };
}

function buildDedupeComponents(edges: DedupePairEdge[]) {
  const adjacency = new Map<number, Set<number>>();

  for (const edge of edges) {
    if (!adjacency.has(edge.leftId)) adjacency.set(edge.leftId, new Set<number>());
    if (!adjacency.has(edge.rightId)) adjacency.set(edge.rightId, new Set<number>());
    adjacency.get(edge.leftId)!.add(edge.rightId);
    adjacency.get(edge.rightId)!.add(edge.leftId);
  }

  const visited = new Set<number>();
  const components: number[][] = [];

  for (const id of adjacency.keys()) {
    if (visited.has(id)) continue;

    const stack = [id];
    const component: number[] = [];
    visited.add(id);

    while (stack.length) {
      const currentId = stack.pop()!;
      component.push(currentId);
      const neighbors = adjacency.get(currentId);
      if (!neighbors) continue;

      for (const neighbor of neighbors) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        stack.push(neighbor);
      }
    }

    if (component.length > 1) {
      component.sort((left, right) => left - right);
      components.push(component);
    }
  }

  return components;
}

function dedupeRecordPriority(left: DedupeCandidateRecord, right: DedupeCandidateRecord) {
  if (left.ativo !== right.ativo) return Number(right.ativo) - Number(left.ativo);
  if (left.vinculos !== right.vinculos) return right.vinculos - left.vinculos;
  if (left.completenessScore !== right.completenessScore) {
    return right.completenessScore - left.completenessScore;
  }

  const leftUpdated = left.atualizadoEm ? left.atualizadoEm.getTime() : 0;
  const rightUpdated = right.atualizadoEm ? right.atualizadoEm.getTime() : 0;
  if (leftUpdated !== rightUpdated) return rightUpdated - leftUpdated;

  return left.id - right.id;
}

export const cadastrosRouter = router({
  getById: protectedProcedure.input(cadastroGetByIdInputSchema).query(async ({ ctx, input }) => {
    if (input.entity === "usuarios" || input.entity === "parametros") requireAdmin(ctx);
    const record = await loadCadastroRecord(requireDb(), input.entity, input.id);
    if (!record) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Cadastro nao encontrado." });
    }
    if (
      (input.entity === "pessoas" || input.entity === "servidores") &&
      !hasRole(ctx, ["admin", "gestor", "auditor"])
    ) {
      return {
        ...record,
        cpf: null,
        cpfMascarado: maskCadastroCpf(record.cpf),
        dataNascimento: null,
      };
    }
    return record;
  }),

  lookup: protectedProcedure.input(cadastroLookupInputSchema).query(async ({ input }) => {
    const db = requireDb();
    const pagination = withPagination(input.page, input.pageSize);
    const normalizedSearch = normalizeCadastroLookupText(input.search);
    const terms = normalizedSearch.split(" ").filter(Boolean);
    const excludeFilter = (column: any) =>
      input.excludeIds?.length ? notInArray(column, input.excludeIds) : undefined;
    const response = (totalValue: unknown, items: CadastroLookupItem[]) => {
      const total = Number(totalValue ?? 0);
      return {
        page: input.page,
        pageSize: input.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
        items,
      };
    };

    if (input.entity === "pessoas" || input.entity === "servidores") {
      const nomeNormalizado = normalizedTextSql(pessoas.nome);
      const cpfDigits = (input.search ?? "").replace(/\D/g, "");
      const nameTrigrams = buildCadastroLookupTrigrams(normalizedSearch);
      const similarityScore = nameTrigrams.length
        ? sql<number>`(${sql.join(
            nameTrigrams.map(
              (trigram) => sql`case when ${nomeNormalizado} like ${`%${trigram}%`} then 1 else 0 end`,
            ),
            sql` + `,
          )})`
        : sql<number>`0`;
      const minimumSimilarityScore = Math.max(1, Math.ceil(nameTrigrams.length * 0.25));
      const approximateNameFilter = nameTrigrams.length
        ? sql`${similarityScore} >= ${minimumSimilarityScore}`
        : undefined;
      const allNameTerms = terms.length
        ? and(...terms.map((term) => sql`${nomeNormalizado} like ${`%${term}%`}`))
        : undefined;
      const searchFilter = normalizedSearch
        ? or(
            sql`${nomeNormalizado} like ${`%${normalizedSearch}%`}`,
            allNameTerms,
            approximateNameFilter,
            sql`${normalizedTextSql(pessoas.matricula)} like ${`%${normalizedSearch}%`}`,
            sql`${normalizedTextSql(cargos.nome)} like ${`%${normalizedSearch}%`}`,
            sql`${normalizedTextSql(pessoas.cargo)} like ${`%${normalizedSearch}%`}`,
            sql`${normalizedTextSql(funcoes.nome)} like ${`%${normalizedSearch}%`}`,
            sql`${normalizedTextSql(secretarias.nome)} like ${`%${normalizedSearch}%`}`,
            cpfDigits
              ? sql`regexp_replace(coalesce(${pessoas.cpf}, ''), '[^0-9]', '', 'g') like ${`%${cpfDigits}%`}`
              : undefined,
          )
        : undefined;
      const filters = [
        input.activeOnly ? eq(pessoas.ativo, true) : undefined,
        input.entity === "servidores" ? isNotNull(pessoas.secretariaId) : undefined,
        input.secretariaId ? eq(pessoas.secretariaId, input.secretariaId) : undefined,
        excludeFilter(pessoas.id),
        searchFilter,
      ].filter(Boolean) as any[];
      const whereClause = filters.length ? and(...filters) : undefined;
      const ranking = normalizedSearch
        ? sql<number>`case
            when ${nomeNormalizado} = ${normalizedSearch} then 0
            when ${nomeNormalizado} like ${`${normalizedSearch}%`} then 1
            when ${allNameTerms ?? sql`false`} then 2
            else 3
          end`
        : undefined;
      const preferredSecretariaRanking = input.preferSecretariaId
        ? sql<number>`case when ${pessoas.secretariaId} = ${input.preferSecretariaId} then 0 else 1 end`
        : undefined;
      const lookupOrdering = [
        ranking,
        nameTrigrams.length ? desc(similarityScore) : undefined,
        preferredSecretariaRanking,
        asc(pessoas.nome),
        asc(pessoas.id),
      ].filter(Boolean) as any[];
      const [totalRows, rows] = await Promise.all([
        db
          .select({ total: count() })
          .from(pessoas)
          .leftJoin(secretarias, eq(secretarias.id, pessoas.secretariaId))
          .leftJoin(cargos, eq(cargos.id, pessoas.cargoId))
          .leftJoin(funcoes, eq(funcoes.id, pessoas.funcaoId))
          .where(whereClause),
        db
          .select({
            id: pessoas.id,
            nome: pessoas.nome,
            cpf: pessoas.cpf,
            matricula: pessoas.matricula,
            secretariaId: pessoas.secretariaId,
            secretariaNome: secretarias.nome,
            cargoId: pessoas.cargoId,
            cargoNome: cargos.nome,
            cargoLegado: pessoas.cargo,
            funcaoId: pessoas.funcaoId,
            funcaoNome: funcoes.nome,
          })
          .from(pessoas)
          .leftJoin(secretarias, eq(secretarias.id, pessoas.secretariaId))
          .leftJoin(cargos, eq(cargos.id, pessoas.cargoId))
          .leftJoin(funcoes, eq(funcoes.id, pessoas.funcaoId))
          .where(whereClause)
          .orderBy(...lookupOrdering)
          .limit(pagination.limit)
          .offset(pagination.offset),
      ]).catch((error: unknown) => {
        logPessoaLookupFailure(input, error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Nao foi possivel pesquisar pessoas no momento.",
        });
      });
      return response(
        totalRows[0]?.total,
        rows.map((row) => {
          const details = [
            row.matricula ? `Matricula ${row.matricula}` : null,
            row.secretariaNome,
            maskCadastroCpf(row.cpf) ? `CPF ${maskCadastroCpf(row.cpf)}` : null,
          ].filter(Boolean);
          return {
            id: row.id,
            label: row.nome,
            subtitle: details.join(" · ") || undefined,
            metadata: {
              matricula: row.matricula,
              cpfMascarado: maskCadastroCpf(row.cpf),
              secretariaId: row.secretariaId,
              secretariaNome: row.secretariaNome,
              cargoId: row.cargoId,
              cargoNome: row.cargoNome ?? row.cargoLegado,
              funcaoId: row.funcaoId,
              funcaoNome: row.funcaoNome,
            },
          };
        }),
      );
    }

    if (input.entity === "secretarias") {
      const searchFilter = normalizedSearch
        ? or(
            sql`${normalizedTextSql(secretarias.nome)} like ${`%${normalizedSearch}%`}`,
            sql`${normalizedTextSql(secretarias.sigla)} like ${`%${normalizedSearch}%`}`,
          )
        : undefined;
      const filters = [
        input.activeOnly ? eq(secretarias.ativo, true) : undefined,
        excludeFilter(secretarias.id),
        searchFilter,
      ].filter(Boolean) as any[];
      const whereClause = filters.length ? and(...filters) : undefined;
      const [totalRows, rows] = await Promise.all([
        db.select({ total: count() }).from(secretarias).where(whereClause),
        db
          .select({ id: secretarias.id, nome: secretarias.nome, sigla: secretarias.sigla })
          .from(secretarias)
          .where(whereClause)
          .orderBy(asc(secretarias.nome))
          .limit(pagination.limit)
          .offset(pagination.offset),
      ]);
      return response(
        totalRows[0]?.total,
        rows.map((row) => ({
          id: row.id,
          label: row.nome,
          subtitle: row.sigla,
          metadata: { sigla: row.sigla },
        })),
      );
    }

    if (input.entity === "cargos" || input.entity === "funcoes") {
      const table = input.entity === "cargos" ? cargos : funcoes;
      const searchFilter = normalizedSearch
        ? or(
            sql`${table.nomeNormalizado} like ${`%${normalizedSearch}%`}`,
            sql`${normalizedTextSql(table.codigo)} like ${`%${normalizedSearch}%`}`,
          )
        : undefined;
      const filters = [
        input.activeOnly ? eq(table.ativo, true) : undefined,
        excludeFilter(table.id),
        searchFilter,
      ].filter(Boolean) as any[];
      const whereClause = filters.length ? and(...filters) : undefined;
      const [totalRows, rows] = await Promise.all([
        db.select({ total: count() }).from(table).where(whereClause),
        db
          .select({ id: table.id, nome: table.nome, codigo: table.codigo })
          .from(table)
          .where(whereClause)
          .orderBy(asc(table.nome))
          .limit(pagination.limit)
          .offset(pagination.offset),
      ]);
      return response(
        totalRows[0]?.total,
        rows.map((row) => ({
          id: row.id,
          label: row.nome,
          subtitle: row.codigo ?? undefined,
          metadata: { codigo: row.codigo },
        })),
      );
    }

    if (input.entity === "departamentos") {
      const searchFilter = normalizedSearch
        ? or(
            sql`${normalizedTextSql(departamentos.nome)} like ${`%${normalizedSearch}%`}`,
            sql`${normalizedTextSql(departamentos.codigoCentroCusto)} like ${`%${normalizedSearch}%`}`,
            sql`${normalizedTextSql(secretarias.nome)} like ${`%${normalizedSearch}%`}`,
          )
        : undefined;
      const filters = [
        input.activeOnly ? eq(departamentos.ativo, true) : undefined,
        input.secretariaId ? eq(departamentos.secretariaId, input.secretariaId) : undefined,
        excludeFilter(departamentos.id),
        searchFilter,
      ].filter(Boolean) as any[];
      const whereClause = filters.length ? and(...filters) : undefined;
      const [totalRows, rows] = await Promise.all([
        db
          .select({ total: count() })
          .from(departamentos)
          .leftJoin(secretarias, eq(secretarias.id, departamentos.secretariaId))
          .where(whereClause),
        db
          .select({
            id: departamentos.id,
            nome: departamentos.nome,
            secretariaId: departamentos.secretariaId,
            secretariaNome: secretarias.nome,
            codigo: departamentos.codigoCentroCusto,
          })
          .from(departamentos)
          .leftJoin(secretarias, eq(secretarias.id, departamentos.secretariaId))
          .where(whereClause)
          .orderBy(asc(departamentos.nome))
          .limit(pagination.limit)
          .offset(pagination.offset),
      ]);
      return response(
        totalRows[0]?.total,
        rows.map((row) => ({
          id: row.id,
          label: row.nome,
          subtitle: row.secretariaNome ?? undefined,
          metadata: {
            codigo: row.codigo,
            secretariaId: row.secretariaId,
            secretariaNome: row.secretariaNome,
          },
        })),
      );
    }

    if (input.entity === "fornecedores") {
      const cnpjDigits = (input.search ?? "").replace(/\D/g, "");
      const searchFilter = normalizedSearch
        ? or(
            sql`${normalizedTextSql(fornecedores.razaoSocial)} like ${`%${normalizedSearch}%`}`,
            cnpjDigits
              ? sql`regexp_replace(coalesce(${fornecedores.cnpj}, ''), '[^0-9]', '', 'g') like ${`%${cnpjDigits}%`}`
              : undefined,
          )
        : undefined;
      const filters = [
        input.activeOnly ? eq(fornecedores.ativo, true) : undefined,
        excludeFilter(fornecedores.id),
        searchFilter,
      ].filter(Boolean) as any[];
      const whereClause = filters.length ? and(...filters) : undefined;
      const [totalRows, rows] = await Promise.all([
        db.select({ total: count() }).from(fornecedores).where(whereClause),
        db
          .select({
            id: fornecedores.id,
            razaoSocial: fornecedores.razaoSocial,
            cnpj: fornecedores.cnpj,
            cidade: fornecedores.cidade,
            estado: fornecedores.estado,
          })
          .from(fornecedores)
          .where(whereClause)
          .orderBy(asc(fornecedores.razaoSocial))
          .limit(pagination.limit)
          .offset(pagination.offset),
      ]);
      return response(
        totalRows[0]?.total,
        rows.map((row) => ({
          id: row.id,
          label: row.razaoSocial,
          subtitle: [row.cidade, row.estado].filter(Boolean).join("/") || undefined,
          metadata: { cnpj: row.cnpj, cidade: row.cidade, estado: row.estado },
        })),
      );
    }

    const searchFilter = normalizedSearch
      ? sql`${normalizedTextSql(catalogoItens.descricao)} like ${`%${normalizedSearch}%`}`
      : undefined;
    const filters = [
      input.activeOnly ? eq(catalogoItens.ativo, true) : undefined,
      excludeFilter(catalogoItens.id),
      searchFilter,
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
        })
        .from(catalogoItens)
        .where(whereClause)
        .orderBy(asc(catalogoItens.descricao))
        .limit(pagination.limit)
        .offset(pagination.offset),
    ]);
    return response(
      totalRows[0]?.total,
      rows.map((row) => ({
        id: row.id,
        label: row.descricao,
        subtitle: row.unidadePadrao,
        metadata: {
          unidadePadrao: row.unidadePadrao,
          valorReferencia: row.valorReferencia ? Number(row.valorReferencia) : null,
        },
      })),
    );
  }),

  formOptions: protectedProcedure.query(async () => {
    const db = requireDb();

    const [secretariaRows, modalidadeRows, statusRows, departamentoRows, cargoRows, funcaoRows] = await Promise.all([
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
          id: departamentos.id,
          nome: departamentos.nome,
          secretariaId: departamentos.secretariaId,
        })
        .from(departamentos)
        .where(eq(departamentos.ativo, true))
        .orderBy(asc(departamentos.nome)),
      db
        .select({ id: cargos.id, codigo: cargos.codigo, nome: cargos.nome })
        .from(cargos)
        .where(eq(cargos.ativo, true))
        .orderBy(asc(cargos.nome)),
      db
        .select({ id: funcoes.id, codigo: funcoes.codigo, nome: funcoes.nome })
        .from(funcoes)
        .where(eq(funcoes.ativo, true))
        .orderBy(asc(funcoes.nome)),
    ]);

    return {
      secretarias: secretariaRows,
      modalidades: modalidadeRows.sort((left, right) => {
        const leftIndex = modalidadeCatalog.findIndex((item) => item.codigo === left.codigo);
        const rightIndex = modalidadeCatalog.findIndex((item) => item.codigo === right.codigo);
        return leftIndex - rightIndex;
      }),
      statusProcesso: statusRows,
      cargos: cargoRows,
      funcoes: funcaoRows,
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
    .query(async ({ ctx, input }) => {
      if (input.entity === "usuarios" || input.entity === "parametros") requireAdmin(ctx);
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
        case "cargos": {
          const [totalRow] = await db.select({ total: count() }).from(cargos);
          const [ativosRow] = await db.select({ total: count() }).from(cargos).where(eq(cargos.ativo, true));
          return { total: Number(totalRow?.total ?? 0), ativos: Number(ativosRow?.total ?? 0) };
        }
        case "funcoes": {
          const [totalRow] = await db.select({ total: count() }).from(funcoes);
          const [ativosRow] = await db.select({ total: count() }).from(funcoes).where(eq(funcoes.ativo, true));
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

  history: protectedProcedure.input(cadastroHistoryInputSchema).query(async ({ ctx, input }) => {
    if (!hasRole(ctx, ["admin", "gestor", "auditor"])) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Historico restrito a perfis autorizados." });
    }
    if (input.entity === "usuarios" || input.entity === "parametros") requireAdmin(ctx);
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
      items: rows.map((row) => ({
        ...row,
        dadosAnteriores: sanitizeCadastroAuditData(row.dadosAnteriores),
        dadosNovos: sanitizeCadastroAuditData(row.dadosNovos),
      })),
    };
  }),

  list: protectedProcedure.input(cadastrosListInputSchema).query(async ({ ctx, input }) => {
    if (input.entity === "usuarios" || input.entity === "parametros") requireAdmin(ctx);
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

      case "cargos": {
        const filters = [
          buildAtivoFilter(input.status, cargos.ativo),
          input.search
            ? or(
                ilike(cargos.nome, `%${input.search}%`),
                ilike(cargos.codigo, `%${input.search}%`),
                ilike(cargos.categoria, `%${input.search}%`),
              )
            : undefined,
        ].filter(Boolean) as any[];
        const whereClause = filters.length ? and(...filters) : undefined;
        const [totalRows, rows] = await Promise.all([
          db.select({ total: count() }).from(cargos).where(whereClause),
          db.select().from(cargos).where(whereClause).orderBy(asc(cargos.nome)).limit(pagination.limit).offset(pagination.offset),
        ]);
        const total = Number(totalRows[0]?.total ?? 0);
        return {
          page: input.page,
          pageSize: input.pageSize,
          total,
          totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
          items: rows.map(({ nomeNormalizado: _nomeNormalizado, ...row }) => ({
            ...row,
            status: row.ativo ? "ativo" : "inativo",
          })),
        };
      }

      case "funcoes": {
        const filters = [
          buildAtivoFilter(input.status, funcoes.ativo),
          input.search
            ? or(ilike(funcoes.nome, `%${input.search}%`), ilike(funcoes.codigo, `%${input.search}%`))
            : undefined,
        ].filter(Boolean) as any[];
        const whereClause = filters.length ? and(...filters) : undefined;
        const [totalRows, rows] = await Promise.all([
          db.select({ total: count() }).from(funcoes).where(whereClause),
          db.select().from(funcoes).where(whereClause).orderBy(asc(funcoes.nome)).limit(pagination.limit).offset(pagination.offset),
        ]);
        const total = Number(totalRows[0]?.total ?? 0);
        return {
          page: input.page,
          pageSize: input.pageSize,
          total,
          totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
          items: rows.map(({ nomeNormalizado: _nomeNormalizado, ...row }) => ({
            ...row,
            status: row.ativo ? "ativo" : "inativo",
          })),
        };
      }

      case "pessoas":
      case "servidores": {
        const canReadPii = hasRole(ctx, ["admin", "gestor", "auditor"]);
        const onlyServidores = input.entity === "servidores";
        const filters = [
          buildAtivoFilter(input.status, pessoas.ativo),
          input.search
            ? or(
                ilike(pessoas.nome, `%${input.search}%`),
                ilike(pessoas.cpf, `%${input.search}%`),
                ilike(pessoas.matricula, `%${input.search}%`),
                ilike(pessoas.cargo, `%${input.search}%`),
                ilike(cargos.nome, `%${input.search}%`),
                ilike(funcoes.nome, `%${input.search}%`),
                ilike(secretarias.nome, `%${input.search}%`),
              )
            : undefined,
          input.secretariaId ? eq(pessoas.secretariaId, input.secretariaId) : undefined,
          onlyServidores ? isNotNull(pessoas.secretariaId) : undefined,
        ].filter(Boolean) as any[];
        const whereClause = filters.length ? and(...filters) : undefined;

        const [totalRows, rows] = await Promise.all([
          db.select({ total: count() }).from(pessoas).leftJoin(secretarias, eq(secretarias.id, pessoas.secretariaId)).leftJoin(cargos, eq(cargos.id, pessoas.cargoId)).leftJoin(funcoes, eq(funcoes.id, pessoas.funcaoId)).where(whereClause),
          db
            .select({
              id: pessoas.id,
              nome: pessoas.nome,
              cpf: pessoas.cpf,
              matricula: pessoas.matricula,
              dataNascimento: pessoas.dataNascimento,
              cargo: pessoas.cargo,
              cargoId: pessoas.cargoId,
              cargoNome: cargos.nome,
              funcaoId: pessoas.funcaoId,
              funcaoNome: funcoes.nome,
              secretariaId: pessoas.secretariaId,
              secretariaNome: secretarias.nome,
              ativo: pessoas.ativo,
              atualizadoEm: pessoas.atualizadoEm,
            })
            .from(pessoas)
            .leftJoin(secretarias, eq(secretarias.id, pessoas.secretariaId))
            .leftJoin(cargos, eq(cargos.id, pessoas.cargoId))
            .leftJoin(funcoes, eq(funcoes.id, pessoas.funcaoId))
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
            cpf: canReadPii ? row.cpf : maskCadastroCpf(row.cpf),
            matricula: row.matricula,
            dataNascimento: canReadPii ? row.dataNascimento : null,
            cargo: row.cargoNome ?? row.cargo,
            cargoId: row.cargoId,
            cargoNome: row.cargoNome,
            funcaoId: row.funcaoId,
            funcaoNome: row.funcaoNome,
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
                ilike(pessoas.nome, `%${input.search}%`),
                ilike(pessoas.matricula, `%${input.search}%`),
              )
            : undefined,
          input.secretariaId ? eq(users.secretariaId, input.secretariaId) : undefined,
          input.role ? eq(users.role, input.role) : undefined,
        ].filter(Boolean) as any[];
        const whereClause = filters.length ? and(...filters) : undefined;

        const [totalRows, rows] = await Promise.all([
          db
            .select({ total: count() })
            .from(users)
            .leftJoin(secretarias, eq(secretarias.id, users.secretariaId))
            .leftJoin(pessoas, eq(pessoas.id, users.pessoaId))
            .where(whereClause),
          db
            .select({
              id: users.id,
              username: users.username,
              name: users.name,
              email: users.email,
              role: users.role,
              secretariaId: users.secretariaId,
              secretariaNome: secretarias.nome,
              pessoaId: users.pessoaId,
              pessoaNome: pessoas.nome,
              pessoaCpf: pessoas.cpf,
              pessoaMatricula: pessoas.matricula,
              pessoaDataNascimento: pessoas.dataNascimento,
              ativo: users.ativo,
              lastSignedIn: users.lastSignedIn,
              updatedAt: users.updatedAt,
            })
            .from(users)
            .leftJoin(secretarias, eq(secretarias.id, users.secretariaId))
            .leftJoin(pessoas, eq(pessoas.id, users.pessoaId))
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
            pessoaId: row.pessoaId,
            pessoaNome: row.pessoaNome,
            identityStatus: !row.pessoaId
              ? "sem_vinculo"
              : !row.pessoaNome
                ? "conflito"
                : hasCompleteIdentityFields({
                    cpf: row.pessoaCpf,
                    matricula: row.pessoaMatricula,
                    dataNascimento: row.pessoaDataNascimento,
                  })
                  ? "completo"
                  : "incompleto",
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

  dedupeSuggestions: gestorProcedure
    .input(cadastroDedupeSuggestionsInputSchema)
    .query(async ({ input }) => {
      const db = requireDb();
      const scanLimit = Math.max(120, Math.min(1600, input.limit * 25));

      const sumGroupedCounts = (
        targetMap: Map<number, number>,
        rows: Array<{ id: number | null; total: unknown }>,
      ) => {
        for (const row of rows) {
          if (!row.id) continue;
          const total = Number(row.total ?? 0);
          targetMap.set(row.id, (targetMap.get(row.id) ?? 0) + total);
        }
      };

      if (input.entity === "itens") {
        const filters = [
          buildAtivoFilter(input.status, catalogoItens.ativo),
          input.search ? ilike(catalogoItens.descricao, `%${input.search}%`) : undefined,
        ].filter(Boolean) as any[];
        const whereClause = filters.length ? and(...filters) : undefined;

        const fetchedRows = await db
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
          .limit(scanLimit + 1);

        const truncatedByScan = fetchedRows.length > scanLimit;
        const rows = truncatedByScan ? fetchedRows.slice(0, scanLimit) : fetchedRows;

        if (rows.length < 2) {
          return {
            entity: input.entity,
            generatedAt: new Date(),
            analyzedRecords: rows.length,
            truncated: truncatedByScan,
            suggestions: [],
          };
        }

        const ids = rows.map((row) => row.id);
        const [itensProcessoCounts, contratoItensCounts, importacaoItensCounts] =
          await Promise.all([
            db
              .select({ id: itensProcesso.catalogoItemId, total: count() })
              .from(itensProcesso)
              .where(inArray(itensProcesso.catalogoItemId, ids))
              .groupBy(itensProcesso.catalogoItemId),
            db
              .select({ id: contratoItens.catalogoItemId, total: count() })
              .from(contratoItens)
              .where(inArray(contratoItens.catalogoItemId, ids))
              .groupBy(contratoItens.catalogoItemId),
            db
              .select({ id: importacaoBllItensEspecificados.catalogoInternoId, total: count() })
              .from(importacaoBllItensEspecificados)
              .where(inArray(importacaoBllItensEspecificados.catalogoInternoId, ids))
              .groupBy(importacaoBllItensEspecificados.catalogoInternoId),
          ]);

        const vinculosById = new Map<number, number>();
        sumGroupedCounts(vinculosById, itensProcessoCounts);
        sumGroupedCounts(vinculosById, contratoItensCounts);
        sumGroupedCounts(vinculosById, importacaoItensCounts);

        const dedupeRecords: DedupeCandidateRecord[] = rows.map((row) => {
          const normalizedName = normalizeDedupeText(row.descricao);
          const normalizedUnit = normalizeDedupeText(row.unidadePadrao);
          const nameTokens = dedupeNameTokens(normalizedName);
          const referenceValue = row.valorReferencia ? Number(row.valorReferencia) : null;
          const completenessScore =
            Number(Boolean(normalizedUnit)) +
            Number(referenceValue !== null) +
            Number(Boolean(row.imagemUrl)) +
            Math.min(2, Math.floor(normalizedName.length / 48));

          return {
            id: row.id,
            label: row.descricao,
            documento: itemCodeFromId(row.id),
            ativo: row.ativo,
            vinculos: vinculosById.get(row.id) ?? 0,
            atualizadoEm: row.atualizadoEm,
            subtitle: `${row.unidadePadrao}${referenceValue !== null ? ` • ${Number(referenceValue).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}` : ""}`,
            normalizedName,
            normalizedEmail: "",
            normalizedPhone: "",
            normalizedCity: "",
            normalizedState: "",
            normalizedDocumento: "",
            normalizedCargo: "",
            normalizedUnit,
            secretariaId: null,
            nameTokens,
            completenessScore,
            referenceValue,
          };
        });

        const recordById = new Map<number, DedupeCandidateRecord>(
          dedupeRecords.map((record) => [record.id, record]),
        );

        const candidateBuckets = new Map<string, number[]>();
        const addToBucket = (bucketKey: string, id: number) => {
          if (!bucketKey) return;
          const existing = candidateBuckets.get(bucketKey);
          if (!existing) {
            candidateBuckets.set(bucketKey, [id]);
            return;
          }
          if (!existing.includes(id)) {
            existing.push(id);
          }
        };

        for (const record of dedupeRecords) {
          if (record.normalizedName) {
            addToBucket(`name:${record.normalizedName}`, record.id);
            if (record.nameTokens.length >= 2) {
              addToBucket(`name2:${record.nameTokens[0]}:${record.nameTokens[1]}`, record.id);
            }
            if (record.nameTokens.length >= 3) {
              addToBucket(
                `name3:${record.nameTokens[0]}:${record.nameTokens[1]}:${record.nameTokens[2]}`,
                record.id,
              );
            }
            if (record.nameTokens.length >= 1 && record.normalizedUnit) {
              addToBucket(`name-unit:${record.nameTokens[0]}:${record.normalizedUnit}`, record.id);
            }
          }
        }

        const pairKeys = buildDedupePairCandidates(candidateBuckets, 48);
        const edges: DedupePairEdge[] = [];

        for (const pairKey of pairKeys) {
          const [leftRaw, rightRaw] = pairKey.split(":");
          const left = recordById.get(Number(leftRaw));
          const right = recordById.get(Number(rightRaw));
          if (!left || !right) continue;

          const pair = scoreItemPair(left, right);
          if (!pair.classification) continue;

          edges.push({
            leftId: left.id,
            rightId: right.id,
            score: pair.score,
            classification: pair.classification,
            reasons: pair.reasons,
          });
        }

        if (!edges.length) {
          return {
            entity: input.entity,
            generatedAt: new Date(),
            analyzedRecords: rows.length,
            truncated: truncatedByScan,
            suggestions: [],
          };
        }

        const components = buildDedupeComponents(edges);
        const suggestions = components
          .map((componentIds) => {
            const componentSet = new Set(componentIds);
            const componentEdges = edges.filter(
              (edge) =>
                componentSet.has(edge.leftId) &&
                componentSet.has(edge.rightId),
            );
            if (!componentEdges.length) return null;

            const strongestEdge = componentEdges.reduce((best, current) =>
              current.score > best.score ? current : best,
            );
            const reasons = Array.from(
              new Set(componentEdges.flatMap((edge) => edge.reasons)),
            ).slice(0, 5);

            const prioritizedRecords = componentIds
              .map((id) => recordById.get(id))
              .filter((record): record is DedupeCandidateRecord => Boolean(record))
              .sort(dedupeRecordPriority);
            const targetRecord = prioritizedRecords[0];
            const sourceIds = prioritizedRecords.slice(1).map((record) => record.id);

            if (!targetRecord || !sourceIds.length) return null;

            return {
              groupKey: `${input.entity}:${componentIds.join("-")}`,
              classification: strongestEdge.classification,
              confidenceScore: strongestEdge.score,
              reasonSummary: reasons,
              suggestedTargetId: targetRecord.id,
              sourceIds,
              records: prioritizedRecords.map((record) => ({
                id: record.id,
                label: record.label,
                documento: record.documento,
                ativo: record.ativo,
                vinculos: record.vinculos,
                atualizadoEm: record.atualizadoEm,
                subtitle: record.subtitle,
              })),
            };
          })
          .filter((suggestion): suggestion is NonNullable<typeof suggestion> =>
            Boolean(suggestion),
          )
          .sort((left, right) => {
            const classificationDiff =
              dedupeClassificationWeight(right.classification) -
              dedupeClassificationWeight(left.classification);
            if (classificationDiff !== 0) return classificationDiff;
            if (left.confidenceScore !== right.confidenceScore) {
              return right.confidenceScore - left.confidenceScore;
            }
            return left.groupKey.localeCompare(right.groupKey, "pt-BR");
          });

        const limitedSuggestions = suggestions.slice(0, input.limit);
        return {
          entity: input.entity,
          generatedAt: new Date(),
          analyzedRecords: rows.length,
          truncated: truncatedByScan || suggestions.length > input.limit,
          suggestions: limitedSuggestions,
        };
      }

      if (input.entity === "fornecedores") {
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

        const fetchedRows = await db
          .select({
            id: fornecedores.id,
            razaoSocial: fornecedores.razaoSocial,
            cnpj: fornecedores.cnpj,
            email: fornecedores.email,
            telefone: fornecedores.telefone,
            cidade: fornecedores.cidade,
            estado: fornecedores.estado,
            ativo: fornecedores.ativo,
            atualizadoEm: fornecedores.atualizadoEm,
            logoUrl: fornecedores.logoUrl,
          })
          .from(fornecedores)
          .where(whereClause)
          .orderBy(asc(fornecedores.razaoSocial))
          .limit(scanLimit + 1);

        const truncatedByScan = fetchedRows.length > scanLimit;
        const rows = truncatedByScan ? fetchedRows.slice(0, scanLimit) : fetchedRows;

        if (rows.length < 2) {
          return {
            entity: input.entity,
            generatedAt: new Date(),
            analyzedRecords: rows.length,
            truncated: truncatedByScan,
            suggestions: [],
          };
        }

        const ids = rows.map((row) => row.id);
        const [cotacaoCounts, contratoCounts, licitanteCounts] = await Promise.all([
          db
            .select({ id: cotacoes.fornecedorId, total: count() })
            .from(cotacoes)
            .where(inArray(cotacoes.fornecedorId, ids))
            .groupBy(cotacoes.fornecedorId),
          db
            .select({ id: contratos.fornecedorId, total: count() })
            .from(contratos)
            .where(inArray(contratos.fornecedorId, ids))
            .groupBy(contratos.fornecedorId),
          db
            .select({ id: licitantes.fornecedorId, total: count() })
            .from(licitantes)
            .where(inArray(licitantes.fornecedorId, ids))
            .groupBy(licitantes.fornecedorId),
        ]);

        const vinculosById = new Map<number, number>();
        sumGroupedCounts(vinculosById, cotacaoCounts);
        sumGroupedCounts(vinculosById, contratoCounts);
        sumGroupedCounts(vinculosById, licitanteCounts);

        const dedupeRecords: DedupeCandidateRecord[] = rows.map((row) => {
          const normalizedName = normalizeDedupeText(row.razaoSocial);
          const normalizedEmail = normalizeDedupeEmail(row.email);
          const normalizedPhone = normalizeDedupePhone(row.telefone);
          const normalizedCity = normalizeDedupeText(row.cidade);
          const normalizedState = normalizeDedupeText(row.estado).slice(0, 2);
          const normalizedDocumento = normalizeDedupeDigits(row.cnpj);
          const nameTokens = dedupeNameTokens(normalizedName);
          const completenessScore =
            Number(Boolean(normalizedDocumento)) +
            Number(Boolean(normalizedEmail)) +
            Number(Boolean(normalizedPhone)) +
            Number(Boolean(normalizedCity)) +
            Number(Boolean(normalizedState)) +
            Number(Boolean(row.logoUrl));

          return {
            id: row.id,
            label: row.razaoSocial,
            documento: row.cnpj,
            ativo: row.ativo,
            vinculos: vinculosById.get(row.id) ?? 0,
            atualizadoEm: row.atualizadoEm,
            subtitle: row.cidade
              ? row.estado
                ? `${row.cidade}/${row.estado}`
                : row.cidade
              : row.estado
                ? `UF ${row.estado}`
                : null,
            normalizedName,
            normalizedEmail,
            normalizedPhone,
            normalizedCity,
            normalizedState,
            normalizedDocumento,
            normalizedCargo: "",
            normalizedUnit: "",
            secretariaId: null,
            nameTokens,
            completenessScore,
            referenceValue: null,
          };
        });

        const recordById = new Map<number, DedupeCandidateRecord>(
          dedupeRecords.map((record) => [record.id, record]),
        );

        const candidateBuckets = new Map<string, number[]>();
        const addToBucket = (bucketKey: string, id: number) => {
          if (!bucketKey) return;
          const existing = candidateBuckets.get(bucketKey);
          if (!existing) {
            candidateBuckets.set(bucketKey, [id]);
            return;
          }
          if (!existing.includes(id)) {
            existing.push(id);
          }
        };

        for (const record of dedupeRecords) {
          if (record.normalizedDocumento.length === 14) {
            addToBucket(`doc:${record.normalizedDocumento}`, record.id);
          }
          if (record.normalizedEmail) {
            addToBucket(`mail:${record.normalizedEmail}`, record.id);
          }
          if (record.normalizedPhone) {
            addToBucket(`phone:${record.normalizedPhone}`, record.id);
          }
          if (record.normalizedName) {
            addToBucket(`name:${record.normalizedName}`, record.id);
            if (record.nameTokens.length >= 2) {
              addToBucket(
                `name2:${record.nameTokens[0]}:${record.nameTokens[1]}`,
                record.id,
              );
            }
            if (record.nameTokens.length >= 1 && record.normalizedCity) {
              addToBucket(
                `name-city:${record.nameTokens[0]}:${record.normalizedCity}`,
                record.id,
              );
            }
          }
        }

        const pairKeys = buildDedupePairCandidates(candidateBuckets, 40);
        const edges: DedupePairEdge[] = [];

        for (const pairKey of pairKeys) {
          const [leftRaw, rightRaw] = pairKey.split(":");
          const left = recordById.get(Number(leftRaw));
          const right = recordById.get(Number(rightRaw));
          if (!left || !right) continue;

          const pair = scoreFornecedorPair(left, right);
          if (!pair.classification) continue;

          edges.push({
            leftId: left.id,
            rightId: right.id,
            score: pair.score,
            classification: pair.classification,
            reasons: pair.reasons,
          });
        }

        if (!edges.length) {
          return {
            entity: input.entity,
            generatedAt: new Date(),
            analyzedRecords: rows.length,
            truncated: truncatedByScan,
            suggestions: [],
          };
        }

        const components = buildDedupeComponents(edges);
        const suggestions = components
          .map((componentIds) => {
            const componentSet = new Set(componentIds);
            const componentEdges = edges.filter(
              (edge) =>
                componentSet.has(edge.leftId) &&
                componentSet.has(edge.rightId),
            );
            if (!componentEdges.length) return null;

            const strongestEdge = componentEdges.reduce((best, current) =>
              current.score > best.score ? current : best,
            );
            const reasons = Array.from(
              new Set(componentEdges.flatMap((edge) => edge.reasons)),
            ).slice(0, 5);

            const prioritizedRecords = componentIds
              .map((id) => recordById.get(id))
              .filter((record): record is DedupeCandidateRecord => Boolean(record))
              .sort(dedupeRecordPriority);
            const targetRecord = prioritizedRecords[0];
            const sourceIds = prioritizedRecords.slice(1).map((record) => record.id);

            if (!targetRecord || !sourceIds.length) return null;

            return {
              groupKey: `${input.entity}:${componentIds.join("-")}`,
              classification: strongestEdge.classification,
              confidenceScore: strongestEdge.score,
              reasonSummary: reasons,
              suggestedTargetId: targetRecord.id,
              sourceIds,
              records: prioritizedRecords.map((record) => ({
                id: record.id,
                label: record.label,
                documento: record.documento,
                ativo: record.ativo,
                vinculos: record.vinculos,
                atualizadoEm: record.atualizadoEm,
                subtitle: record.subtitle,
              })),
            };
          })
          .filter((suggestion): suggestion is NonNullable<typeof suggestion> =>
            Boolean(suggestion),
          )
          .sort((left, right) => {
            const classificationDiff =
              dedupeClassificationWeight(right.classification) -
              dedupeClassificationWeight(left.classification);
            if (classificationDiff !== 0) return classificationDiff;
            if (left.confidenceScore !== right.confidenceScore) {
              return right.confidenceScore - left.confidenceScore;
            }
            return left.groupKey.localeCompare(right.groupKey, "pt-BR");
          });

        const limitedSuggestions = suggestions.slice(0, input.limit);
        return {
          entity: input.entity,
          generatedAt: new Date(),
          analyzedRecords: rows.length,
          truncated: truncatedByScan || suggestions.length > input.limit,
          suggestions: limitedSuggestions,
        };
      }

      const onlyServidores = input.entity === "servidores";
      const pessoaFilters = [
        buildAtivoFilter(input.status, pessoas.ativo),
        input.search
          ? or(
              ilike(pessoas.nome, `%${input.search}%`),
              ilike(pessoas.cpf, `%${input.search}%`),
              ilike(pessoas.matricula, `%${input.search}%`),
              ilike(pessoas.cargo, `%${input.search}%`),
              ilike(secretarias.nome, `%${input.search}%`),
            )
          : undefined,
        input.secretariaId ? eq(pessoas.secretariaId, input.secretariaId) : undefined,
        onlyServidores ? isNotNull(pessoas.secretariaId) : undefined,
      ].filter(Boolean) as any[];
      const pessoaWhere = pessoaFilters.length ? and(...pessoaFilters) : undefined;

      const fetchedRows = await db
        .select({
          id: pessoas.id,
          nome: pessoas.nome,
          cpf: pessoas.cpf,
          matricula: pessoas.matricula,
          dataNascimento: pessoas.dataNascimento,
          cargo: pessoas.cargo,
          secretariaId: pessoas.secretariaId,
          secretariaNome: secretarias.nome,
          ativo: pessoas.ativo,
          atualizadoEm: pessoas.atualizadoEm,
        })
        .from(pessoas)
        .leftJoin(secretarias, eq(secretarias.id, pessoas.secretariaId))
        .where(pessoaWhere)
        .orderBy(asc(pessoas.nome))
        .limit(scanLimit + 1);

      const truncatedByScan = fetchedRows.length > scanLimit;
      const rows = truncatedByScan ? fetchedRows.slice(0, scanLimit) : fetchedRows;

      if (rows.length < 2) {
        return {
          entity: input.entity,
          generatedAt: new Date(),
          analyzedRecords: rows.length,
          truncated: truncatedByScan,
          suggestions: [],
        };
      }

      const ids = rows.map((row) => row.id);
      const [
        departamentoCounts,
        processoAutoridadeCounts,
        processoCondutorCounts,
        dfdSolicitanteCounts,
        dfdAssinaturaCounts,
        dfdResponsavelCounts,
      ] = await Promise.all([
        db
          .select({ id: departamentos.responsavelId, total: count() })
          .from(departamentos)
          .where(inArray(departamentos.responsavelId, ids))
          .groupBy(departamentos.responsavelId),
        db
          .select({ id: processos.autoridadeCompetenteId, total: count() })
          .from(processos)
          .where(inArray(processos.autoridadeCompetenteId, ids))
          .groupBy(processos.autoridadeCompetenteId),
        db
          .select({ id: processos.condutorProcessoId, total: count() })
          .from(processos)
          .where(inArray(processos.condutorProcessoId, ids))
          .groupBy(processos.condutorProcessoId),
        db
          .select({ id: dfd.solicitantePessoaId, total: count() })
          .from(dfd)
          .where(inArray(dfd.solicitantePessoaId, ids))
          .groupBy(dfd.solicitantePessoaId),
        db
          .select({ id: dfd.assinaturaResponsavelId, total: count() })
          .from(dfd)
          .where(inArray(dfd.assinaturaResponsavelId, ids))
          .groupBy(dfd.assinaturaResponsavelId),
        db
          .select({ id: dfdResponsaveis.pessoaId, total: count() })
          .from(dfdResponsaveis)
          .where(inArray(dfdResponsaveis.pessoaId, ids))
          .groupBy(dfdResponsaveis.pessoaId),
      ]);

      const vinculosById = new Map<number, number>();
      sumGroupedCounts(vinculosById, departamentoCounts);
      sumGroupedCounts(vinculosById, processoAutoridadeCounts);
      sumGroupedCounts(vinculosById, processoCondutorCounts);
      sumGroupedCounts(vinculosById, dfdSolicitanteCounts);
      sumGroupedCounts(vinculosById, dfdAssinaturaCounts);
      sumGroupedCounts(vinculosById, dfdResponsavelCounts);

      const dedupeRecords: DedupeCandidateRecord[] = rows.map((row) => {
        const normalizedName = normalizeDedupeText(row.nome);
        const normalizedDocumento = normalizeDedupeDigits(row.cpf);
        const normalizedCargo = normalizeDedupeText(row.cargo);
        const nameTokens = dedupeNameTokens(normalizedName);
        const completenessScore =
          Number(Boolean(normalizedDocumento)) +
          Number(Boolean(normalizedCargo)) +
          Number(Boolean(row.secretariaId));

        return {
          id: row.id,
          label: row.nome,
          documento: row.cpf,
          ativo: row.ativo,
          vinculos: vinculosById.get(row.id) ?? 0,
          atualizadoEm: row.atualizadoEm,
          subtitle: row.cargo
            ? row.secretariaNome
              ? `${row.cargo} - ${row.secretariaNome}`
              : row.cargo
            : row.secretariaNome ?? null,
          normalizedName,
          normalizedEmail: "",
          normalizedPhone: "",
          normalizedCity: "",
          normalizedState: "",
          normalizedDocumento,
          normalizedCargo,
          normalizedUnit: "",
          secretariaId: row.secretariaId,
          nameTokens,
          completenessScore,
          referenceValue: null,
        };
      });

      const recordById = new Map<number, DedupeCandidateRecord>(
        dedupeRecords.map((record) => [record.id, record]),
      );

      const candidateBuckets = new Map<string, number[]>();
      const addToBucket = (bucketKey: string, id: number) => {
        if (!bucketKey) return;
        const existing = candidateBuckets.get(bucketKey);
        if (!existing) {
          candidateBuckets.set(bucketKey, [id]);
          return;
        }
        if (!existing.includes(id)) {
          existing.push(id);
        }
      };

      for (const record of dedupeRecords) {
        if (record.normalizedDocumento.length === 11) {
          addToBucket(`doc:${record.normalizedDocumento}`, record.id);
        }
        if (record.normalizedName) {
          addToBucket(`name:${record.normalizedName}`, record.id);
          if (record.nameTokens.length >= 2) {
            addToBucket(
              `name2:${record.nameTokens[0]}:${record.nameTokens[1]}`,
              record.id,
            );
          }
          if (record.nameTokens.length >= 1 && record.secretariaId) {
            addToBucket(
              `name-sec:${record.nameTokens[0]}:${record.secretariaId}`,
              record.id,
            );
          }
        }
      }

      const pairKeys = buildDedupePairCandidates(candidateBuckets, 48);
      const edges: DedupePairEdge[] = [];

      for (const pairKey of pairKeys) {
        const [leftRaw, rightRaw] = pairKey.split(":");
        const left = recordById.get(Number(leftRaw));
        const right = recordById.get(Number(rightRaw));
        if (!left || !right) continue;

        const pair = scorePessoaPair(left, right);
        if (!pair.classification) continue;

        edges.push({
          leftId: left.id,
          rightId: right.id,
          score: pair.score,
          classification: pair.classification,
          reasons: pair.reasons,
        });
      }

      if (!edges.length) {
        return {
          entity: input.entity,
          generatedAt: new Date(),
          analyzedRecords: rows.length,
          truncated: truncatedByScan,
          suggestions: [],
        };
      }

      const components = buildDedupeComponents(edges);
      const suggestions = components
        .map((componentIds) => {
          const componentSet = new Set(componentIds);
          const componentEdges = edges.filter(
            (edge) =>
              componentSet.has(edge.leftId) &&
              componentSet.has(edge.rightId),
          );
          if (!componentEdges.length) return null;

          const strongestEdge = componentEdges.reduce((best, current) =>
            current.score > best.score ? current : best,
          );
          const reasons = Array.from(
            new Set(componentEdges.flatMap((edge) => edge.reasons)),
          ).slice(0, 5);

          const prioritizedRecords = componentIds
            .map((id) => recordById.get(id))
            .filter((record): record is DedupeCandidateRecord => Boolean(record))
            .sort(dedupeRecordPriority);
          const targetRecord = prioritizedRecords[0];
          const sourceIds = prioritizedRecords.slice(1).map((record) => record.id);

          if (!targetRecord || !sourceIds.length) return null;

          return {
            groupKey: `${input.entity}:${componentIds.join("-")}`,
            classification: strongestEdge.classification,
            confidenceScore: strongestEdge.score,
            reasonSummary: reasons,
            suggestedTargetId: targetRecord.id,
            sourceIds,
            records: prioritizedRecords.map((record) => ({
              id: record.id,
              label: record.label,
              documento: record.documento,
              ativo: record.ativo,
              vinculos: record.vinculos,
              atualizadoEm: record.atualizadoEm,
              subtitle: record.subtitle,
            })),
          };
        })
        .filter((suggestion): suggestion is NonNullable<typeof suggestion> =>
          Boolean(suggestion),
        )
        .sort((left, right) => {
          const classificationDiff =
            dedupeClassificationWeight(right.classification) -
            dedupeClassificationWeight(left.classification);
          if (classificationDiff !== 0) return classificationDiff;
          if (left.confidenceScore !== right.confidenceScore) {
            return right.confidenceScore - left.confidenceScore;
          }
          return left.groupKey.localeCompare(right.groupKey, "pt-BR");
        });

      const limitedSuggestions = suggestions.slice(0, input.limit);
      return {
        entity: input.entity,
        generatedAt: new Date(),
        analyzedRecords: rows.length,
        truncated: truncatedByScan || suggestions.length > input.limit,
        suggestions: limitedSuggestions,
      };
    }),

  exportRows: gestorProcedure.input(cadastroExportInputSchema).query(async ({ ctx, input }) => {
    if (input.entity === "usuarios" || input.entity === "parametros") requireAdmin(ctx);
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

      case "cargos": {
        const filters = [
          buildAtivoFilter(input.status, cargos.ativo),
          input.search
            ? or(
                ilike(cargos.nome, `%${input.search}%`),
                ilike(cargos.codigo, `%${input.search}%`),
                ilike(cargos.categoria, `%${input.search}%`),
              )
            : undefined,
          input.ids?.length ? inArray(cargos.id, input.ids) : undefined,
        ].filter(Boolean) as any[];
        const rows = await db
          .select({
            id: cargos.id,
            codigo: cargos.codigo,
            nome: cargos.nome,
            categoria: cargos.categoria,
            descricao: cargos.descricao,
            ativo: cargos.ativo,
            atualizadoEm: cargos.atualizadoEm,
          })
          .from(cargos)
          .where(filters.length ? and(...filters) : undefined)
          .orderBy(asc(cargos.nome))
          .limit(5000);
        return rows.map((row) => ({
          ...row,
          status: row.ativo ? "ativo" : "inativo",
        }));
      }

      case "funcoes": {
        const filters = [
          buildAtivoFilter(input.status, funcoes.ativo),
          input.search
            ? or(ilike(funcoes.nome, `%${input.search}%`), ilike(funcoes.codigo, `%${input.search}%`))
            : undefined,
          input.ids?.length ? inArray(funcoes.id, input.ids) : undefined,
        ].filter(Boolean) as any[];
        const rows = await db
          .select({
            id: funcoes.id,
            codigo: funcoes.codigo,
            nome: funcoes.nome,
            descricao: funcoes.descricao,
            ativo: funcoes.ativo,
            atualizadoEm: funcoes.atualizadoEm,
          })
          .from(funcoes)
          .where(filters.length ? and(...filters) : undefined)
          .orderBy(asc(funcoes.nome))
          .limit(5000);
        return rows.map((row) => ({
          ...row,
          status: row.ativo ? "ativo" : "inativo",
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
                ilike(pessoas.matricula, `%${input.search}%`),
                ilike(pessoas.cargo, `%${input.search}%`),
                ilike(cargos.nome, `%${input.search}%`),
                ilike(funcoes.nome, `%${input.search}%`),
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
            matricula: pessoas.matricula,
            dataNascimento: pessoas.dataNascimento,
            cargo: pessoas.cargo,
            cargoId: pessoas.cargoId,
            cargoNome: cargos.nome,
            funcaoId: pessoas.funcaoId,
            funcaoNome: funcoes.nome,
            secretariaId: pessoas.secretariaId,
            secretariaNome: secretarias.nome,
            ativo: pessoas.ativo,
            atualizadoEm: pessoas.atualizadoEm,
          })
          .from(pessoas)
          .leftJoin(secretarias, eq(secretarias.id, pessoas.secretariaId))
          .leftJoin(cargos, eq(cargos.id, pessoas.cargoId))
          .leftJoin(funcoes, eq(funcoes.id, pessoas.funcaoId))
          .where(whereClause)
          .orderBy(asc(pessoas.nome))
          .limit(5000);

        return rows.map((row) => ({
          id: row.id,
          nome: row.nome,
          cpf: row.cpf,
          matricula: row.matricula,
          dataNascimento: row.dataNascimento,
          cargo: row.cargoNome ?? row.cargo,
          cargoId: row.cargoId,
          cargoNome: row.cargoNome,
          funcaoId: row.funcaoId,
          funcaoNome: row.funcaoNome,
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
                ilike(pessoas.nome, `%${input.search}%`),
                ilike(pessoas.matricula, `%${input.search}%`),
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
            pessoaId: users.pessoaId,
            pessoaNome: pessoas.nome,
            pessoaCpf: pessoas.cpf,
            pessoaMatricula: pessoas.matricula,
            pessoaDataNascimento: pessoas.dataNascimento,
            ativo: users.ativo,
            lastSignedIn: users.lastSignedIn,
            atualizadoEm: users.updatedAt,
          })
          .from(users)
          .leftJoin(secretarias, eq(secretarias.id, users.secretariaId))
          .leftJoin(pessoas, eq(pessoas.id, users.pessoaId))
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
          pessoaId: row.pessoaId,
          pessoaNome: row.pessoaNome,
          identityStatus: !row.pessoaId
            ? "sem_vinculo"
            : !row.pessoaNome
              ? "conflito"
              : hasCompleteIdentityFields({
                  cpf: row.pessoaCpf,
                  matricula: row.pessoaMatricula,
                  dataNascimento: row.pessoaDataNascimento,
                })
                ? "completo"
                : "incompleto",
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

  fornecedorVencedorBackfillPreview: gestorProcedure
    .input(cadastroFornecedorVencedorBackfillPreviewInputSchema)
    .query(async ({ input }) => {
      const db = requireDb();
      return previewFornecedorVencedorBackfill(db, input);
    }),

  runFornecedorVencedorBackfill: adminProcedure
    .input(cadastroFornecedorVencedorBackfillRunInputSchema)
    .mutation(async ({ ctx }) => {
      const db = requireDb();
      const result = await runFornecedorVencedorBackfill(db);

      await logAuditoria(ctx, {
        tabela: "itens_processo_valores",
        registroId: result.sampleUpdatedRows[0]?.id ?? 0,
        acao: "UPDATE",
        dadosNovos: {
          saneamentoFornecedorVencedor: {
            generatedAt: result.generatedAt,
            candidates: result.candidates,
            updated: result.updated,
            nullIdRepairs: result.nullIdRepairs,
            mergedIdRepairs: result.mergedIdRepairs,
            unresolved: result.unresolved,
            absorbedSupplierIds: result.absorbedSupplierIds,
            sampleUpdatedRows: result.sampleUpdatedRows,
          },
        },
        descricao:
          result.updated > 0
            ? `Saneamento retroativo de fornecedor vencedor executado com ${result.updated} atualização(ões).`
            : "Saneamento retroativo de fornecedor vencedor executado sem atualizações.",
      });

      return result;
    }),

  confirmFornecedorVencedorBackfillLink: adminProcedure
    .input(cadastroFornecedorVencedorBackfillConfirmInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = requireDb();
      const [before] = await db
        .select()
        .from(itensProcessoValores)
        .where(eq(itensProcessoValores.id, input.id))
        .limit(1);

      if (!before) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Registro de vencedor importado não encontrado.",
        });
      }

      let result;
      try {
        result = await confirmFornecedorVencedorLink(db, input);
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            error instanceof Error
              ? error.message
              : "Não foi possível confirmar manualmente o vínculo do fornecedor vencedor.",
        });
      }

      const [after] = await db
        .select()
        .from(itensProcessoValores)
        .where(eq(itensProcessoValores.id, input.id))
        .limit(1);

      await logAuditoria(ctx, {
        tabela: "itens_processo_valores",
        registroId: input.id,
        acao: "UPDATE",
        dadosAnteriores: before,
        dadosNovos: {
          ...after,
          confirmacaoManualFornecedorVencedor: {
            processoId: result.processoId,
            numeroSirel: result.numeroSirel,
            itemProcessoId: result.itemProcessoId,
            numeroItem: result.numeroItem,
            fornecedorVencedorId: result.fornecedorVencedorId,
            fornecedorVencedorNome: result.fornecedorVencedorNome,
            fornecedorVencedorCnpj: result.fornecedorVencedorCnpj,
            reason: result.reason,
          },
        },
        descricao: `Fornecedor vencedor confirmado manualmente para o item ${result.numeroItem} do processo ${result.numeroSirel}.`,
      });

      return result;
    }),

  confirmFornecedorVencedorBackfillLinksBatch: adminProcedure
    .input(cadastroFornecedorVencedorBackfillBulkConfirmInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = requireDb();
      const beforeRows = await db
        .select()
        .from(itensProcessoValores)
        .where(inArray(itensProcessoValores.id, input.ids));

      if (!beforeRows.length) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Nenhum item selecionado foi encontrado para confirmação manual em lote.",
        });
      }

      let result;
      try {
        result = await confirmFornecedorVencedorLinksBatch(db, input);
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            error instanceof Error
              ? error.message
              : "Não foi possível confirmar manualmente os vínculos selecionados.",
        });
      }

      const afterRows = await db
        .select()
        .from(itensProcessoValores)
        .where(inArray(itensProcessoValores.id, result.itemIds));

      for (const rowId of result.itemIds) {
        const before = beforeRows.find((row) => row.id === rowId) ?? null;
        const after = afterRows.find((row) => row.id === rowId) ?? null;
        const numeroItem = beforeRows.find((row) => row.id === rowId)?.itemProcessoId ?? null;
        await logAuditoria(ctx, {
          tabela: "itens_processo_valores",
          registroId: rowId,
          acao: "UPDATE",
          dadosAnteriores: before,
          dadosNovos: {
            ...after,
            confirmacaoManualFornecedorVencedorEmLote: {
              processoId: result.processoId,
              numeroSirel: result.numeroSirel,
              fornecedorVencedorId: result.fornecedorVencedorId,
              fornecedorVencedorNome: result.fornecedorVencedorNome,
              fornecedorVencedorCnpj: result.fornecedorVencedorCnpj,
              updatedCount: result.updatedCount,
              itemNumbers: result.itemNumbers,
              reason: result.reason,
              itemProcessoId: numeroItem,
            },
          },
          descricao: `Fornecedor vencedor confirmado manualmente em lote para o processo ${result.numeroSirel}.`,
        });
      }

      return result;
    }),

  save: gestorProcedure.input(cadastroSaveInputSchema).mutation(async ({ ctx, input }) => {
    if (input.entity === "usuarios" || input.entity === "parametros") requireAdmin(ctx);
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
          return finalizeCadastroSave(db, input.entity, updated.id, ctx.user?.id ?? null, before);
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
        return finalizeCadastroSave(db, input.entity, created.id, ctx.user?.id ?? null, null);
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
          return finalizeCadastroSave(db, input.entity, updated.id, ctx.user?.id ?? null, before);
        }

        const [created] = await db.insert(fornecedores).values({ ...payload, criadoEm: new Date() }).returning();
        await logAuditoria(ctx, {
          tabela: "fornecedores",
          registroId: created.id,
          acao: "CREATE",
          dadosNovos: created,
          descricao: `Cadastro do fornecedor ${created.razaoSocial} criado`,
        });
        return finalizeCadastroSave(db, input.entity, created.id, ctx.user?.id ?? null, null);
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
          return finalizeCadastroSave(db, input.entity, updated.id, ctx.user?.id ?? null, before);
        }

        const [created] = await db.insert(secretarias).values({ ...payload, criadoEm: new Date() }).returning();
        await logAuditoria(ctx, {
          tabela: "secretarias",
          registroId: created.id,
          acao: "CREATE",
          dadosNovos: created,
          descricao: `Cadastro da secretaria ${created.nome} criado`,
        });
        return finalizeCadastroSave(db, input.entity, created.id, ctx.user?.id ?? null, null);
      }

      case "cargos": {
        const nomeNormalizado = normalizeCadastroLookupText(input.data.nome);
        const codigo = toNullableString(input.data.codigo)?.toUpperCase() ?? null;
        const duplicateFilters = [
          eq(cargos.nomeNormalizado, nomeNormalizado),
          codigo ? eq(cargos.codigo, codigo) : undefined,
        ].filter(Boolean) as any[];
        const duplicates = duplicateFilters.length
          ? await db
              .select({ id: cargos.id })
              .from(cargos)
              .where(or(...duplicateFilters))
          : [];
        if (duplicates.some((row) => row.id !== input.data.id)) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Ja existe cargo com este nome ou codigo.",
          });
        }
        const payload = {
          codigo,
          nome: input.data.nome,
          nomeNormalizado,
          categoria: toNullableString(input.data.categoria),
          descricao: toNullableString(input.data.descricao),
          ativo: input.data.ativo,
          atualizadoEm: new Date(),
        };
        if (input.data.id) {
          const before = await loadCadastroRecord(db, input.entity, input.data.id);
          const [updated] = await db
            .update(cargos)
            .set(payload)
            .where(eq(cargos.id, input.data.id))
            .returning();
          if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Cargo nao encontrado." });
          // Alguns módulos ainda leem o texto legado enquanto a adoção do catálogo
          // é concluída. Sincronizá-lo mantém a edição do cargo retrocompatível.
          await db
            .update(pessoas)
            .set({ cargo: updated.nome, atualizadoEm: new Date() })
            .where(eq(pessoas.cargoId, updated.id));
          await logAuditoria(ctx, {
            tabela: "cargos",
            registroId: updated.id,
            acao: "UPDATE",
            dadosAnteriores: before,
            dadosNovos: updated,
            descricao: `Cargo ${updated.nome} atualizado`,
          });
          return finalizeCadastroSave(db, input.entity, updated.id, ctx.user?.id ?? null, before);
        }
        const [created] = await db.insert(cargos).values({ ...payload, criadoEm: new Date() }).returning();
        await logAuditoria(ctx, {
          tabela: "cargos",
          registroId: created.id,
          acao: "CREATE",
          dadosNovos: created,
          descricao: `Cargo ${created.nome} criado`,
        });
        return finalizeCadastroSave(db, input.entity, created.id, ctx.user?.id ?? null, null);
      }

      case "funcoes": {
        const nomeNormalizado = normalizeCadastroLookupText(input.data.nome);
        const codigo = toNullableString(input.data.codigo)?.toUpperCase() ?? null;
        const duplicateFilters = [
          eq(funcoes.nomeNormalizado, nomeNormalizado),
          codigo ? eq(funcoes.codigo, codigo) : undefined,
        ].filter(Boolean) as any[];
        const duplicates = duplicateFilters.length
          ? await db
              .select({ id: funcoes.id })
              .from(funcoes)
              .where(or(...duplicateFilters))
          : [];
        if (duplicates.some((row) => row.id !== input.data.id)) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Ja existe funcao com este nome ou codigo.",
          });
        }
        const payload = {
          codigo,
          nome: input.data.nome,
          nomeNormalizado,
          descricao: toNullableString(input.data.descricao),
          ativo: input.data.ativo,
          atualizadoEm: new Date(),
        };
        if (input.data.id) {
          const before = await loadCadastroRecord(db, input.entity, input.data.id);
          const [updated] = await db
            .update(funcoes)
            .set(payload)
            .where(eq(funcoes.id, input.data.id))
            .returning();
          if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Funcao nao encontrada." });
          await logAuditoria(ctx, {
            tabela: "funcoes",
            registroId: updated.id,
            acao: "UPDATE",
            dadosAnteriores: before,
            dadosNovos: updated,
            descricao: `Funcao ${updated.nome} atualizada`,
          });
          return finalizeCadastroSave(db, input.entity, updated.id, ctx.user?.id ?? null, before);
        }
        const [created] = await db.insert(funcoes).values({ ...payload, criadoEm: new Date() }).returning();
        await logAuditoria(ctx, {
          tabela: "funcoes",
          registroId: created.id,
          acao: "CREATE",
          dadosNovos: created,
          descricao: `Funcao ${created.nome} criada`,
        });
        return finalizeCadastroSave(db, input.entity, created.id, ctx.user?.id ?? null, null);
      }

      case "pessoas":
      case "servidores": {
        const normalizedCpf = input.data.cpf ? normalizePessoaCpf(input.data.cpf) : null;
        const normalizedMatricula = normalizePessoaMatricula(input.data.matricula);
        const [existingRecord] = input.data.id
          ? await db.select().from(pessoas).where(eq(pessoas.id, input.data.id)).limit(1)
          : [];
        const [selectedCargo] = input.data.cargoId
          ? await db.select().from(cargos).where(eq(cargos.id, input.data.cargoId)).limit(1)
          : [];
        const [selectedFuncao] = input.data.funcaoId
          ? await db.select().from(funcoes).where(eq(funcoes.id, input.data.funcaoId)).limit(1)
          : [];
        if (!canUseCadastroCatalogSelection(input.data.cargoId, selectedCargo, existingRecord?.cargoId)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione um cargo ativo e valido." });
        }
        if (!canUseCadastroCatalogSelection(input.data.funcaoId, selectedFuncao, existingRecord?.funcaoId)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione uma funcao ativa e valida." });
        }
        if (normalizedCpf) {
          const existing = await db
            .select({ id: pessoas.id })
            .from(pessoas)
            .where(findPessoaByNormalizedCpf(normalizedCpf));
          if (existing.some((row) => row.id !== input.data.id)) {
            throw new TRPCError({ code: "CONFLICT", message: "Já existe pessoa cadastrada com este CPF." });
          }
        }
        if (normalizedMatricula) {
          const existing = await db
            .select({ id: pessoas.id })
            .from(pessoas)
            .where(findPessoaByNormalizedMatricula(normalizedMatricula));
          if (existing.some((row) => row.id !== input.data.id)) {
            throw new TRPCError({ code: "CONFLICT", message: "Ja existe pessoa cadastrada com esta matricula." });
          }
        }

        const payload = {
          nome: input.data.nome,
          cpf: normalizedCpf,
          matricula: normalizedMatricula || null,
          dataNascimento: toNullableDate(input.data.dataNascimento),
          // Texto legado é mantido apenas como espelho do catálogo estruturado.
          cargo: selectedCargo?.nome ?? null,
          cargoId: input.data.cargoId ?? null,
          funcaoId: input.data.funcaoId ?? null,
          secretariaId: input.data.secretariaId ?? null,
          ativo: input.data.ativo,
          atualizadoEm: new Date(),
        };

        if (input.data.id) {
          const before = existingRecord;
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
          await syncLinkedUserIdentity(db, updated.id);
          return finalizeCadastroSave(db, input.entity, updated.id, ctx.user?.id ?? null, before);
        }

        const [created] = await db.insert(pessoas).values({ ...payload, criadoEm: new Date() }).returning();
        await logAuditoria(ctx, {
          tabela: "pessoas",
          registroId: created.id,
          acao: "CREATE",
          dadosNovos: created,
          descricao: `Cadastro de ${input.entity === "servidores" ? "servidor" : "pessoa"} ${created.nome} criado`,
        });
        await syncLinkedUserIdentity(db, created.id);
        return finalizeCadastroSave(db, input.entity, created.id, ctx.user?.id ?? null, null);
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
          return finalizeCadastroSave(db, input.entity, updated.id, ctx.user?.id ?? null, before);
        }

        const [created] = await db.insert(departamentos).values({ ...payload, criadoEm: new Date() }).returning();
        await logAuditoria(ctx, {
          tabela: "departamentos",
          registroId: created.id,
          acao: "CREATE",
          dadosNovos: created,
          descricao: `Cadastro do departamento ${created.nome} criado`,
        });
        return finalizeCadastroSave(db, input.entity, created.id, ctx.user?.id ?? null, null);
      }

      case "usuarios": {
        const pessoaId = input.data.pessoaId ?? null;
        let linkedPessoa: typeof pessoas.$inferSelect | null = null;
        if (pessoaId) {
          const [pessoaRow] = await db.select().from(pessoas).where(eq(pessoas.id, pessoaId)).limit(1);
          if (!pessoaRow) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Pessoa/servidor nao encontrado para vinculo." });
          }
          const existingLinkFilters = [
            eq(users.pessoaId, pessoaId),
            input.data.id ? sql`${users.id} <> ${input.data.id}` : undefined,
          ].filter(Boolean) as any[];
          const existingLink = await db
            .select({ id: users.id })
            .from(users)
            .where(and(...existingLinkFilters))
            .limit(1);
          if (existingLink.length) {
            throw new TRPCError({ code: "CONFLICT", message: "Esta pessoa ja esta vinculada a outro usuario." });
          }
          linkedPessoa = pessoaRow;
        }

        if (input.data.id) {
          const [before] = await db.select().from(users).where(eq(users.id, input.data.id)).limit(1);
          if (!before) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado." });
          if (
            before.id === ctx.user?.id &&
            (input.data.role !== "admin" || !input.data.ativo)
          ) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Não é permitido remover o próprio acesso administrativo.",
            });
          }
          const resolvedName = linkedPessoa?.nome ?? input.data.name;
          const resolvedEmail = toNullableString(input.data.email);
          const resolvedSecretariaId = linkedPessoa?.secretariaId ?? input.data.secretariaId ?? null;
          const sessionClaimsChanged =
            before.name !== resolvedName ||
            before.email !== resolvedEmail ||
            before.role !== input.data.role ||
            before.secretariaId !== resolvedSecretariaId ||
            before.ativo !== input.data.ativo;
          const [updated] = await db
            .update(users)
            .set({
              name: resolvedName,
              email: resolvedEmail,
              role: input.data.role,
              secretariaId: resolvedSecretariaId,
              pessoaId,
              sessionVersion: sessionClaimsChanged
                ? sql`${users.sessionVersion} + 1`
                : before.sessionVersion,
              identityProfileCompletedAt: linkedPessoa && hasCompleteIdentityFields(linkedPessoa)
                ? before?.identityProfileCompletedAt ?? new Date()
                : null,
              ativo: input.data.ativo,
              updatedAt: new Date(),
            })
            .where(eq(users.id, input.data.id))
            .returning();

          await logAuditoria(ctx, {
            tabela: "users",
            registroId: updated.id,
            acao: "UPDATE",
            dadosAnteriores: before,
            dadosNovos: updated,
            descricao: `Cadastro do usuário ${updated.name} atualizado`,
          });
          return finalizeCadastroSave(db, input.entity, updated.id, ctx.user?.id ?? null, before);
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
            name: linkedPessoa?.nome ?? input.data.name,
            email: toNullableString(input.data.email),
            loginMethod: "local_password",
            passwordHash: hashPassword(input.data.password),
            role: input.data.role,
            secretariaId: linkedPessoa?.secretariaId ?? input.data.secretariaId ?? null,
            pessoaId,
            identityProfileCompletedAt: linkedPessoa && hasCompleteIdentityFields(linkedPessoa)
              ? new Date()
              : null,
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
        return finalizeCadastroSave(db, input.entity, created.id, ctx.user?.id ?? null, null);
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
          return finalizeCadastroSave(db, input.entity, updated.id, ctx.user?.id ?? null, before);
        }

        const [created] = await db.insert(parametrosSistema).values({ ...payload, criadoEm: new Date() }).returning();
        await logAuditoria(ctx, {
          tabela: "parametros_sistema",
          registroId: created.id,
          acao: "CREATE",
          dadosNovos: created,
          descricao: `Parâmetro ${created.chave} criado`,
        });
        return finalizeCadastroSave(db, input.entity, created.id, ctx.user?.id ?? null, null);
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
      if (input.entity === "itens") {
        const summary = {
          processosAtualizados: 0,
          contratoItensRemapeados: 0,
          contratoItensMesclados: 0,
          importacaoItensAtualizados: 0,
        };
        let itemMantido: Awaited<ReturnType<typeof mergeItemRecords>>["itemMantido"] | null = null;
        let registrosUnificados = 0;

        for (const sourceId of sourceIds) {
          const merged = await mergeItemRecords(tx, userId, sourceId, input.targetId);
          itemMantido = merged.itemMantido;
          registrosUnificados += 1;
          summary.processosAtualizados += merged.summary.processosAtualizados;
          summary.contratoItensRemapeados += merged.summary.contratoItensRemapeados;
          summary.contratoItensMesclados += merged.summary.contratoItensMesclados;
          summary.importacaoItensAtualizados += merged.summary.importacaoItensAtualizados;
        }

        return {
          success: true,
          entity: input.entity,
          registrosUnificados,
          registroMantido: itemMantido,
          summary,
        };
      }

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
        usuariosRemapeados: 0,
        usuariosDestinoPreservados: 0,
        usuariosDestinoSincronizados: 0,
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
        summary.usuariosRemapeados += merged.summary.usuariosRemapeados;
        summary.usuariosDestinoPreservados += merged.summary.usuariosDestinoPreservados;
        summary.usuariosDestinoSincronizados +=
          merged.summary.usuariosDestinoSincronizados;
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
      case "cargos": {
        const [usage] = await db
          .select({ total: count() })
          .from(pessoas)
          .where(eq(pessoas.cargoId, input.id));
        if (Number(usage?.total ?? 0) > 0) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Cargo em uso nao pode ser excluido. Use a inativacao pelo status.",
          });
        }
        const [before] = await db.select().from(cargos).where(eq(cargos.id, input.id)).limit(1);
        const [updated] = await db.update(cargos).set({ ativo: false, atualizadoEm: new Date() }).where(eq(cargos.id, input.id)).returning();
        if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Cargo nao encontrado." });
        await logAuditoria(ctx, {
          tabela: "cargos",
          registroId: updated.id,
          acao: "DELETE",
          dadosAnteriores: before,
          dadosNovos: updated,
          descricao: `Cargo ${updated.nome} inativado`,
        });
        return { success: true };
      }
      case "funcoes": {
        const [usage] = await db
          .select({ total: count() })
          .from(pessoas)
          .where(eq(pessoas.funcaoId, input.id));
        if (Number(usage?.total ?? 0) > 0) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Funcao em uso nao pode ser excluida. Use a inativacao pelo status.",
          });
        }
        const [before] = await db.select().from(funcoes).where(eq(funcoes.id, input.id)).limit(1);
        const [updated] = await db.update(funcoes).set({ ativo: false, atualizadoEm: new Date() }).where(eq(funcoes.id, input.id)).returning();
        if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Funcao nao encontrada." });
        await logAuditoria(ctx, {
          tabela: "funcoes",
          registroId: updated.id,
          acao: "DELETE",
          dadosAnteriores: before,
          dadosNovos: updated,
          descricao: `Funcao ${updated.nome} inativada`,
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
        const [updated] = await db
          .update(users)
          .set({
            ativo: false,
            sessionVersion: sql`case when ${users.ativo} then ${users.sessionVersion} + 1 else ${users.sessionVersion} end`,
            updatedAt: new Date(),
          })
          .where(eq(users.id, input.id))
          .returning();
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
      case "cargos": {
        const before = await db.select().from(cargos).where(inArray(cargos.id, input.ids));
        const updated = await db
          .update(cargos)
          .set({ ativo: input.ativo, atualizadoEm: new Date() })
          .where(inArray(cargos.id, input.ids))
          .returning();
        for (const row of updated) {
          const previous = before.find((item) => item.id === row.id);
          await logAuditoria(ctx, {
            tabela: "cargos",
            registroId: row.id,
            acao: "UPDATE",
            dadosAnteriores: previous,
            dadosNovos: row,
            descricao: `Cargo ${row.nome} ${input.ativo ? "reativado" : "inativado"} em lote`,
          });
        }
        return { updated: updated.length };
      }
      case "funcoes": {
        const before = await db.select().from(funcoes).where(inArray(funcoes.id, input.ids));
        const updated = await db
          .update(funcoes)
          .set({ ativo: input.ativo, atualizadoEm: new Date() })
          .where(inArray(funcoes.id, input.ids))
          .returning();
        for (const row of updated) {
          const previous = before.find((item) => item.id === row.id);
          await logAuditoria(ctx, {
            tabela: "funcoes",
            registroId: row.id,
            acao: "UPDATE",
            dadosAnteriores: previous,
            dadosNovos: row,
            descricao: `Funcao ${row.nome} ${input.ativo ? "reativada" : "inativada"} em lote`,
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
          .set({
            ativo: input.ativo,
            sessionVersion: sql`case when ${users.ativo} <> ${input.ativo} then ${users.sessionVersion} + 1 else ${users.sessionVersion} end`,
            updatedAt: new Date(),
          })
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

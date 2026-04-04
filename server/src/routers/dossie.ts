import { TRPCError } from "@trpc/server";
import { asc, desc, eq, ilike, inArray, or } from "drizzle-orm";

import {
  dossieDetailInputSchema,
  dossieProcessOptionsInputSchema,
} from "@sirel/shared/schemas/dossie";

import { requireDb } from "../db/client.js";
import {
  aditivosContratos,
  contratosPncp,
  contratos,
  contratoItens,
  cotacoes,
  dfd,
  dfdResponsaveis,
  dfdSecretariasParticipantes,
  documentos,
  etp,
  etpCotacoesPreliminares,
  fornecedores,
  importacaoBllEdicoesAudit,
  importacaoBllItens,
  importacaoBllItensEspecificados,
  importacaoBllLotes,
  importacaoBllProcessos,
  importacaoLegadoLotes,
  importacaoLegadoRegistros,
  importacaoPncpAditivos,
  importacaoPncpAtas,
  importacaoPncpContratacoes,
  importacaoPncpContratos,
  importacaoPncpItensAta,
  importacaoPncpItensContratacao,
  itensProcesso,
  itensProcessoValores,
  lancesLicitacao,
  licitacaoChecklistExcecoes,
  licitacoes,
  licitantes,
  lotes,
  modalidades,
  movimentacoesWorkflow,
  pessoas,
  prazosProcessuais,
  processos,
  propostasLicitacao,
  recursosLicitacao,
  secretarias,
  statusProcesso,
  tr,
  users,
  workflowProcesso,
} from "../db/schema.js";
import { refreshDossieAutonomoProcesso } from "../lib/dossie-autonomia.js";
import { operadorProcedure, protectedProcedure, router } from "../trpc.js";

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNumberOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toDateValue(value: unknown) {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function buildDocumentoUrl(documentoId: number) {
  return `/api/planejamento/documentos/${documentoId}/download`;
}

function normalizeName(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

type PersonLike = {
  id: number;
  nome: string;
  cargo: string | null;
  secretaria: string | null;
};

function mapPerson(person: PersonLike | null | undefined) {
  if (!person) return null;
  return {
    id: person.id,
    nome: person.nome,
    cargo: person.cargo,
    secretaria: person.secretaria,
  };
}

function sumValues(values: Array<number | null | undefined>) {
  return values.reduce<number>((total, value) => {
    const parsed = Number(value);
    return total + (Number.isFinite(parsed) ? parsed : 0);
  }, 0);
}

export const dossieRouter = router({
  processOptions: protectedProcedure
    .input(dossieProcessOptionsInputSchema)
    .query(async ({ input }) => {
      const db = requireDb();
      const search = input.search?.trim();
      const whereClause = search
        ? or(
            ilike(processos.numeroSirel, `%${search}%`),
            ilike(processos.protocolo, `%${search}%`),
            ilike(processos.numeroAdministrativo, `%${search}%`),
            ilike(processos.numeroEdital, `%${search}%`),
            ilike(processos.objeto, `%${search}%`),
            ilike(secretarias.nome, `%${search}%`),
          )
        : undefined;

      return db
        .select({
          id: processos.id,
          numeroSirel: processos.numeroSirel,
          protocolo: processos.protocolo,
          numeroAdministrativo: processos.numeroAdministrativo,
          numeroEdital: processos.numeroEdital,
          objeto: processos.objeto,
          secretaria: secretarias.nome,
          siglaSecretaria: secretarias.sigla,
        })
        .from(processos)
        .innerJoin(secretarias, eq(secretarias.id, processos.secretariaId))
        .where(whereClause)
        .orderBy(desc(processos.atualizadoEm), desc(processos.id))
        .limit(input.limit);
    }),

  detail: protectedProcedure
    .input(dossieDetailInputSchema)
    .query(async ({ input }) => {
      const db = requireDb();

      const [baseRow] = await db
        .select({
          processoId: processos.id,
          numeroSirel: processos.numeroSirel,
          protocolo: processos.protocolo,
          dataEntradaLicitacao: processos.dataEntradaLicitacao,
          numeroAdministrativo: processos.numeroAdministrativo,
          numeroEdital: processos.numeroEdital,
          anoReferencia: processos.anoReferencia,
          foraDoFluxo: processos.foraDoFluxo,
          origemCadastro: processos.origemCadastro,
          objeto: processos.objeto,
          valorEstimado: processos.valorEstimado,
          valorHomologado: processos.valorHomologado,
          escopoDisputa: processos.escopoDisputa,
          criterioJulgamento: processos.criterioJulgamento,
          modoDisputa: processos.modoDisputa,
          tipoObjeto: processos.tipoObjeto,
          tipoContratacao: processos.tipoContratacao,
          dataAbertura: processos.dataAbertura,
          dataPublicacao: processos.dataPublicacao,
          dataDisputaSessao: processos.dataDisputaSessao,
          dataEncerramento: processos.dataEncerramento,
          ativo: processos.ativo,
          publicado: processos.publicado,
          homologado: processos.homologado,
          finalizado: processos.finalizado,
          criadoEm: processos.criadoEm,
          atualizadoEm: processos.atualizadoEm,
          autoridadeCompetenteId: processos.autoridadeCompetenteId,
          condutorProcessoId: processos.condutorProcessoId,
          secretariaId: secretarias.id,
          secretariaSigla: secretarias.sigla,
          secretariaNome: secretarias.nome,
          modalidadeId: modalidades.id,
          modalidadeCodigo: modalidades.codigo,
          modalidadeNome: modalidades.nome,
          statusId: statusProcesso.id,
          statusCodigo: statusProcesso.codigo,
          statusNome: statusProcesso.nome,
          statusCor: statusProcesso.cor,
          workflowModuloAtual: workflowProcesso.moduloAtual,
          workflowSituacao: workflowProcesso.situacao,
          workflowEtapaAtual: workflowProcesso.etapaAtual,
          workflowDataInicio: workflowProcesso.dataInicio,
          workflowDataConclusao: workflowProcesso.dataConclusao,
          workflowAtualizadoEm: workflowProcesso.atualizadoEm,
        })
        .from(processos)
        .innerJoin(secretarias, eq(secretarias.id, processos.secretariaId))
        .leftJoin(modalidades, eq(modalidades.id, processos.modalidadeId))
        .leftJoin(statusProcesso, eq(statusProcesso.id, processos.statusId))
        .leftJoin(
          workflowProcesso,
          eq(workflowProcesso.processoId, processos.id),
        )
        .where(eq(processos.id, input.processoId))
        .limit(1);

      if (!baseRow) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Processo não encontrado para gerar o dossiê.",
        });
      }

      const [dfdRow, etpRow, trRow, licitacaoRow, bllRow] = await Promise.all([
        db
          .select()
          .from(dfd)
          .where(eq(dfd.processoId, input.processoId))
          .limit(1)
          .then((rows) => rows[0] ?? null),
        db
          .select()
          .from(etp)
          .where(eq(etp.processoId, input.processoId))
          .limit(1)
          .then((rows) => rows[0] ?? null),
        db
          .select()
          .from(tr)
          .where(eq(tr.processoId, input.processoId))
          .limit(1)
          .then((rows) => rows[0] ?? null),
        db
          .select()
          .from(licitacoes)
          .where(eq(licitacoes.processoId, input.processoId))
          .limit(1)
          .then((rows) => rows[0] ?? null),
        db
          .select()
          .from(importacaoBllProcessos)
          .where(eq(importacaoBllProcessos.processoInternoId, input.processoId))
          .limit(1)
          .then((rows) => rows[0] ?? null),
      ]);

      const itemsRows = await db
        .select({
          id: itensProcesso.id,
          numeroItem: itensProcesso.numeroItem,
          loteId: itensProcesso.loteId,
          loteNumero: lotes.numeroLote,
          loteDescricao: lotes.descricao,
          descricao: itensProcesso.descricao,
          quantidade: itensProcesso.quantidade,
          unidade: itensProcesso.unidade,
          valorUnitarioEstimado: itensProcesso.valorUnitarioEstimado,
          valorTotalEstimado: itensProcesso.valorTotalEstimado,
        })
        .from(itensProcesso)
        .leftJoin(lotes, eq(lotes.id, itensProcesso.loteId))
        .where(eq(itensProcesso.processoId, input.processoId))
        .orderBy(asc(lotes.numeroLote), asc(itensProcesso.numeroItem));

      const contratosRows = await db
        .select({
          id: contratos.id,
          numeroContrato: contratos.numeroContrato,
          fornecedorId: fornecedores.id,
          fornecedorNome: fornecedores.razaoSocial,
          fornecedorCnpj: fornecedores.cnpj,
          valorContrato: contratos.valorContrato,
          dataAssinatura: contratos.dataAssinatura,
          dataVigenciaInicio: contratos.dataVigenciaInicio,
          dataVigenciaFim: contratos.dataVigenciaFim,
          objeto: contratos.objeto,
          status: contratos.status,
        })
        .from(contratos)
        .innerJoin(fornecedores, eq(fornecedores.id, contratos.fornecedorId))
        .where(eq(contratos.processoId, input.processoId))
        .orderBy(desc(contratos.dataVigenciaFim), desc(contratos.id));

      const [itemValuesRows, normalizedPncpContractsRows] = await Promise.all([
        itemsRows.length
          ? db
              .select()
              .from(itensProcessoValores)
              .where(
                inArray(
                  itensProcessoValores.itemProcessoId,
                  itemsRows.map((row) => row.id),
                ),
              )
          : Promise.resolve([]),
        db
          .select()
          .from(contratosPncp)
          .where(eq(contratosPncp.processoId, input.processoId))
          .orderBy(
            desc(contratosPncp.dataAssinatura),
            desc(contratosPncp.id),
          ),
      ]);

      const [
        prelimRows,
        cotacaoRows,
        checklistRows,
        licitantesRows,
        propostasRows,
        lancesRows,
        recursosRows,
        contratoItensRows,
        aditivosRows,
        documentosRows,
        prazosRows,
        movimentacoesRows,
        legadoRows,
        dfdResponsaveisRows,
        dfdSecretariasRows,
        pncpContratacoesRows,
        pncpAtasRows,
        pncpContratosRows,
      ] = await Promise.all([
        etpRow
          ? db
              .select()
              .from(etpCotacoesPreliminares)
              .where(eq(etpCotacoesPreliminares.etpId, etpRow.id))
              .orderBy(
                asc(etpCotacoesPreliminares.itemId),
                asc(etpCotacoesPreliminares.id),
              )
          : Promise.resolve([]),
        db
          .select({
            id: cotacoes.id,
            processoId: cotacoes.processoId,
            itemId: cotacoes.itemId,
            itemNumero: itensProcesso.numeroItem,
            fornecedorId: fornecedores.id,
            fornecedorNome: fornecedores.razaoSocial,
            fornecedorCnpj: fornecedores.cnpj,
            valorUnitario: cotacoes.valorUnitario,
            valorTotal: cotacoes.valorTotal,
            dataCotacao: cotacoes.dataCotacao,
            status: cotacoes.status,
          })
          .from(cotacoes)
          .innerJoin(fornecedores, eq(fornecedores.id, cotacoes.fornecedorId))
          .leftJoin(itensProcesso, eq(itensProcesso.id, cotacoes.itemId))
          .where(eq(cotacoes.processoId, input.processoId))
          .orderBy(desc(cotacoes.dataCotacao), asc(fornecedores.razaoSocial)),
        db
          .select()
          .from(licitacaoChecklistExcecoes)
          .where(eq(licitacaoChecklistExcecoes.processoId, input.processoId))
          .orderBy(asc(licitacaoChecklistExcecoes.categoria)),
        licitacaoRow
          ? db
              .select({
                id: licitantes.id,
                fornecedorId: fornecedores.id,
                fornecedorNome: fornecedores.razaoSocial,
                fornecedorCnpj: fornecedores.cnpj,
                dataCadastro: licitantes.dataCadastro,
                statusHabilitacao: licitantes.statusHabilitacao,
                observacaoHabilitacao: licitantes.observacaoHabilitacao,
                ativo: licitantes.ativo,
              })
              .from(licitantes)
              .innerJoin(
                fornecedores,
                eq(fornecedores.id, licitantes.fornecedorId),
              )
              .where(eq(licitantes.licitacaoId, licitacaoRow.id))
              .orderBy(asc(fornecedores.razaoSocial))
          : Promise.resolve([]),
        licitacaoRow
          ? db
              .select({
                id: propostasLicitacao.id,
                licitanteId: licitantes.id,
                fornecedorId: fornecedores.id,
                fornecedorNome: fornecedores.razaoSocial,
                itemId: itensProcesso.id,
                itemNumero: itensProcesso.numeroItem,
                valorUnitarioProposto: propostasLicitacao.valorUnitarioProposto,
                valorTotalProposto: propostasLicitacao.valorTotalProposto,
                dataProposta: propostasLicitacao.dataProposta,
                classificacao: propostasLicitacao.classificacao,
                situacao: propostasLicitacao.situacao,
                justificativa: propostasLicitacao.justificativa,
              })
              .from(propostasLicitacao)
              .innerJoin(
                licitantes,
                eq(licitantes.id, propostasLicitacao.licitanteId),
              )
              .innerJoin(
                fornecedores,
                eq(fornecedores.id, licitantes.fornecedorId),
              )
              .innerJoin(
                itensProcesso,
                eq(itensProcesso.id, propostasLicitacao.itemId),
              )
              .where(eq(licitantes.licitacaoId, licitacaoRow.id))
              .orderBy(
                asc(itensProcesso.numeroItem),
                asc(propostasLicitacao.classificacao),
                asc(fornecedores.razaoSocial),
              )
          : Promise.resolve([]),
        licitacaoRow
          ? db
              .select({
                id: lancesLicitacao.id,
                propostaId: propostasLicitacao.id,
                itemNumero: itensProcesso.numeroItem,
                fornecedorNome: fornecedores.razaoSocial,
                valorLance: lancesLicitacao.valorLance,
                dataLance: lancesLicitacao.dataLance,
                usuarioId: lancesLicitacao.usuarioId,
                observacao: lancesLicitacao.observacao,
              })
              .from(lancesLicitacao)
              .innerJoin(
                propostasLicitacao,
                eq(propostasLicitacao.id, lancesLicitacao.propostaId),
              )
              .innerJoin(
                licitantes,
                eq(licitantes.id, propostasLicitacao.licitanteId),
              )
              .innerJoin(
                fornecedores,
                eq(fornecedores.id, licitantes.fornecedorId),
              )
              .innerJoin(
                itensProcesso,
                eq(itensProcesso.id, propostasLicitacao.itemId),
              )
              .where(eq(licitantes.licitacaoId, licitacaoRow.id))
              .orderBy(desc(lancesLicitacao.dataLance))
          : Promise.resolve([]),
        licitacaoRow
          ? db
              .select({
                id: recursosLicitacao.id,
                licitanteId: licitantes.id,
                fornecedorNome: fornecedores.razaoSocial,
                dataInterposicao: recursosLicitacao.dataInterposicao,
                dataJulgamento: recursosLicitacao.dataJulgamento,
                resultado: recursosLicitacao.resultado,
                descricao: recursosLicitacao.descricao,
                decisao: recursosLicitacao.decisao,
              })
              .from(recursosLicitacao)
              .innerJoin(
                licitantes,
                eq(licitantes.id, recursosLicitacao.licitanteId),
              )
              .innerJoin(
                fornecedores,
                eq(fornecedores.id, licitantes.fornecedorId),
              )
              .where(eq(recursosLicitacao.licitacaoId, licitacaoRow.id))
              .orderBy(
                desc(recursosLicitacao.dataInterposicao),
                desc(recursosLicitacao.id),
              )
          : Promise.resolve([]),
        contratosRows.length
          ? db
              .select()
              .from(contratoItens)
              .where(
                inArray(
                  contratoItens.contratoId,
                  contratosRows.map((row) => row.id),
                ),
              )
          : Promise.resolve([]),
        contratosRows.length
          ? db
              .select()
              .from(aditivosContratos)
              .where(
                inArray(
                  aditivosContratos.contratoId,
                  contratosRows.map((row) => row.id),
                ),
              )
              .orderBy(asc(aditivosContratos.numeroAditivo))
          : Promise.resolve([]),
        db
          .select()
          .from(documentos)
          .where(eq(documentos.processoId, input.processoId))
          .orderBy(desc(documentos.criadoEm), desc(documentos.id)),
        db
          .select()
          .from(prazosProcessuais)
          .where(eq(prazosProcessuais.processoId, input.processoId))
          .orderBy(
            asc(prazosProcessuais.dataPrevista),
            asc(prazosProcessuais.id),
          ),
        db
          .select()
          .from(movimentacoesWorkflow)
          .where(eq(movimentacoesWorkflow.processoId, input.processoId))
          .orderBy(
            desc(movimentacoesWorkflow.criadoEm),
            desc(movimentacoesWorkflow.id),
          ),
        db
          .select({
            id: importacaoLegadoRegistros.id,
            loteId: importacaoLegadoRegistros.loteId,
            loteArquivo: importacaoLegadoLotes.filename,
            abaOrigem: importacaoLegadoLotes.sheetName,
            linha: importacaoLegadoRegistros.linha,
            legacyId: importacaoLegadoRegistros.legacyId,
            modalidade: importacaoLegadoRegistros.modalidade,
            processoAdministrativo:
              importacaoLegadoRegistros.processoAdministrativo,
            protocolo: importacaoLegadoRegistros.protocolo,
            numeroEdital: importacaoLegadoRegistros.numeroEdital,
            statusLegado: importacaoLegadoRegistros.statusLegado,
            secretaria: importacaoLegadoRegistros.secretaria,
            mappedSecretaria: importacaoLegadoRegistros.mappedSecretaria,
            objetoResumo: importacaoLegadoRegistros.objetoResumo,
            valorEstimado: importacaoLegadoRegistros.valorEstimado,
            valorContratado: importacaoLegadoRegistros.valorContratado,
            analysisSeverity: importacaoLegadoRegistros.analysisSeverity,
            reviewStatus: importacaoLegadoRegistros.reviewStatus,
            reviewNotes: importacaoLegadoRegistros.reviewNotes,
            issues: importacaoLegadoRegistros.issues,
            rawPayload: importacaoLegadoRegistros.rawPayload,
          })
          .from(importacaoLegadoRegistros)
          .innerJoin(
            importacaoLegadoLotes,
            eq(importacaoLegadoLotes.id, importacaoLegadoRegistros.loteId),
          )
          .where(
            eq(
              importacaoLegadoRegistros.selectedInternalProcessId,
              input.processoId,
            ),
          )
          .orderBy(
            asc(importacaoLegadoLotes.filename),
            asc(importacaoLegadoRegistros.linha),
          ),
        dfdRow
          ? db
              .select()
              .from(dfdResponsaveis)
              .where(eq(dfdResponsaveis.dfdId, dfdRow.id))
          : Promise.resolve([]),
        dfdRow
          ? db
              .select()
              .from(dfdSecretariasParticipantes)
              .where(eq(dfdSecretariasParticipantes.dfdId, dfdRow.id))
          : Promise.resolve([]),
        db
          .select()
          .from(importacaoPncpContratacoes)
          .where(
            eq(importacaoPncpContratacoes.processoInternoId, input.processoId),
          )
          .orderBy(
            desc(importacaoPncpContratacoes.dataPublicacao),
            desc(importacaoPncpContratacoes.id),
          ),
        db
          .select()
          .from(importacaoPncpAtas)
          .where(eq(importacaoPncpAtas.processoInternoId, input.processoId))
          .orderBy(
            desc(importacaoPncpAtas.dataAssinatura),
            desc(importacaoPncpAtas.id),
          ),
        db
          .select()
          .from(importacaoPncpContratos)
          .where(
            eq(importacaoPncpContratos.processoInternoId, input.processoId),
          )
          .orderBy(
            desc(importacaoPncpContratos.dataAssinatura),
            desc(importacaoPncpContratos.id),
          ),
      ]);

      const [
        bllLotesRows,
        bllItensRows,
        bllItensEspecificadosRows,
        bllAuditRows,
        pncpContratacaoItensRows,
        pncpAtaItensRows,
        pncpAditivosRows,
      ] = await Promise.all([
        bllRow
          ? db
              .select()
              .from(importacaoBllLotes)
              .where(eq(importacaoBllLotes.processoImportadoId, bllRow.id))
              .orderBy(asc(importacaoBllLotes.numero))
          : Promise.resolve([]),
        bllRow
          ? db
              .select()
              .from(importacaoBllItens)
              .where(eq(importacaoBllItens.processoImportadoId, bllRow.id))
              .orderBy(
                asc(importacaoBllItens.loteNumero),
                asc(importacaoBllItens.itemNumero),
              )
          : Promise.resolve([]),
        bllRow
          ? db
              .select()
              .from(importacaoBllItensEspecificados)
              .where(
                eq(
                  importacaoBllItensEspecificados.processoImportadoId,
                  bllRow.id,
                ),
              )
              .orderBy(asc(importacaoBllItensEspecificados.numeroItem))
          : Promise.resolve([]),
        bllRow
          ? db
              .select()
              .from(importacaoBllEdicoesAudit)
              .where(
                eq(importacaoBllEdicoesAudit.processoImportadoId, bllRow.id),
              )
              .orderBy(
                desc(importacaoBllEdicoesAudit.criadoEm),
                desc(importacaoBllEdicoesAudit.id),
              )
          : Promise.resolve([]),
        pncpContratacoesRows.length
          ? db
              .select()
              .from(importacaoPncpItensContratacao)
              .where(
                inArray(
                  importacaoPncpItensContratacao.contratacaoId,
                  pncpContratacoesRows.map((row) => row.id),
                ),
              )
          : Promise.resolve([]),
        pncpAtasRows.length
          ? db
              .select()
              .from(importacaoPncpItensAta)
              .where(
                inArray(
                  importacaoPncpItensAta.ataId,
                  pncpAtasRows.map((row) => row.id),
                ),
              )
          : Promise.resolve([]),
        pncpContratosRows.length
          ? db
              .select()
              .from(importacaoPncpAditivos)
              .where(
                inArray(
                  importacaoPncpAditivos.contratoId,
                  pncpContratosRows.map((row) => row.id),
                ),
              )
              .orderBy(asc(importacaoPncpAditivos.numeroAditivo))
          : Promise.resolve([]),
      ]);

      const personIds = new Set<number>();
      const secretariaIds = new Set<number>();
      const userIds = new Set<number>();

      if (baseRow.autoridadeCompetenteId) {
        personIds.add(baseRow.autoridadeCompetenteId);
      }
      if (baseRow.condutorProcessoId) {
        personIds.add(baseRow.condutorProcessoId);
      }
      if (dfdRow?.solicitantePessoaId) {
        personIds.add(dfdRow.solicitantePessoaId);
      }
      if (dfdRow?.assinaturaResponsavelId) {
        personIds.add(dfdRow.assinaturaResponsavelId);
      }
      if (dfdRow?.secretariaDemandanteId) {
        secretariaIds.add(dfdRow.secretariaDemandanteId);
      }
      if (dfdRow?.secretariaResponsavelId) {
        secretariaIds.add(dfdRow.secretariaResponsavelId);
      }
      for (const row of dfdResponsaveisRows) {
        personIds.add(row.pessoaId);
      }
      for (const row of dfdSecretariasRows) {
        secretariaIds.add(row.secretariaId);
      }
      for (const row of prazosRows) {
        if (row.responsavelId) userIds.add(row.responsavelId);
      }
      for (const row of movimentacoesRows) {
        if (row.usuarioId) userIds.add(row.usuarioId);
      }
      for (const row of lancesRows) {
        if (row.usuarioId) userIds.add(row.usuarioId);
      }
      for (const row of bllAuditRows) {
        userIds.add(row.usuarioId);
      }

      const [personRows, userRows, extraSecretariaRows] = await Promise.all([
        personIds.size
          ? db
              .select({
                id: pessoas.id,
                nome: pessoas.nome,
                cargo: pessoas.cargo,
                secretaria: secretarias.nome,
              })
              .from(pessoas)
              .leftJoin(secretarias, eq(secretarias.id, pessoas.secretariaId))
              .where(inArray(pessoas.id, [...personIds]))
          : Promise.resolve([]),
        userIds.size
          ? db
              .select({ id: users.id, name: users.name })
              .from(users)
              .where(inArray(users.id, [...userIds]))
          : Promise.resolve([]),
        secretariaIds.size
          ? db
              .select({
                id: secretarias.id,
                sigla: secretarias.sigla,
                nome: secretarias.nome,
              })
              .from(secretarias)
              .where(inArray(secretarias.id, [...secretariaIds]))
          : Promise.resolve([]),
      ]);

      const peopleMap = new Map(personRows.map((row) => [row.id, row]));
      const usersMap = new Map(userRows.map((row) => [row.id, row.name]));
      const secretariasMap = new Map(
        extraSecretariaRows.map((row) => [row.id, row]),
      );
      const licitanteNameById = new Map(
        licitantesRows.map((row) => [row.id, row.fornecedorNome]),
      );
      const propostaById = new Map(propostasRows.map((row) => [row.id, row]));
      const itemById = new Map(itemsRows.map((row) => [row.id, row]));
      const itemValueByItemId = new Map(
        itemValuesRows.map((row) => [row.itemProcessoId, row]),
      );

      const preliminaresPorItem = new Map<number, number>();
      for (const row of prelimRows) {
        preliminaresPorItem.set(
          row.itemId,
          (preliminaresPorItem.get(row.itemId) ?? 0) + 1,
        );
      }

      const cotacoesPorItem = new Map<number, number>();
      for (const row of cotacaoRows) {
        if (!row.itemId) continue;
        cotacoesPorItem.set(
          row.itemId,
          (cotacoesPorItem.get(row.itemId) ?? 0) + 1,
        );
      }

      const propostasPorItem = new Map<number, number>();
      const melhorPropostaPorItem = new Map<number, number>();
      for (const row of propostasRows) {
        propostasPorItem.set(
          row.itemId,
          (propostasPorItem.get(row.itemId) ?? 0) + 1,
        );
        const value = toNumber(row.valorTotalProposto);
        const current = melhorPropostaPorItem.get(row.itemId);
        if (current === undefined || value < current) {
          melhorPropostaPorItem.set(row.itemId, value);
        }
      }

      const melhorLancePorItem = new Map<number, number>();
      for (const row of lancesRows) {
        const proposta = propostaById.get(row.propostaId);
        if (!proposta) continue;
        const value = toNumber(row.valorLance);
        const current = melhorLancePorItem.get(proposta.itemId);
        if (current === undefined || value < current) {
          melhorLancePorItem.set(proposta.itemId, value);
        }
      }

      const fornecedorMap = new Map<
        string,
        {
          fornecedorId: number | null;
          nome: string;
          cnpj: string | null;
          telefone: string | null;
          email: string | null;
          cidade: string | null;
          estado: string | null;
          cotacoes: number;
          licitacoes: number;
          contratos: number;
          valorCotado: number;
          valorContratado: number;
          itensVencidos: number;
          valorVencedor: number;
          origem: Set<string>;
        }
      >();

      function ensureFornecedor(entry: {
        fornecedorId?: number | null;
        nome: string | null | undefined;
        cnpj?: string | null;
        telefone?: string | null;
        email?: string | null;
        cidade?: string | null;
        estado?: string | null;
        origem: string;
      }) {
        const nome = String(entry.nome ?? "").trim();
        if (!nome) return null;
        const key = entry.fornecedorId
          ? `id:${entry.fornecedorId}`
          : `name:${normalizeName(nome)}|${entry.cnpj ?? ""}`;
        const current = fornecedorMap.get(key) ?? {
          fornecedorId: entry.fornecedorId ?? null,
          nome,
          cnpj: entry.cnpj ?? null,
          telefone: entry.telefone ?? null,
          email: entry.email ?? null,
          cidade: entry.cidade ?? null,
          estado: entry.estado ?? null,
          cotacoes: 0,
          licitacoes: 0,
          contratos: 0,
          valorCotado: 0,
          valorContratado: 0,
          itensVencidos: 0,
          valorVencedor: 0,
          origem: new Set<string>(),
        };

        current.origem.add(entry.origem);
        if (!current.cnpj && entry.cnpj) current.cnpj = entry.cnpj;
        if (!current.telefone && entry.telefone)
          current.telefone = entry.telefone;
        if (!current.email && entry.email) current.email = entry.email;
        if (!current.cidade && entry.cidade) current.cidade = entry.cidade;
        if (!current.estado && entry.estado) current.estado = entry.estado;
        fornecedorMap.set(key, current);
        return current;
      }

      for (const row of cotacaoRows) {
        const entry = ensureFornecedor({
          fornecedorId: row.fornecedorId,
          nome: row.fornecedorNome,
          cnpj: row.fornecedorCnpj,
          origem: "Base interna",
        });
        if (!entry) continue;
        entry.cotacoes += 1;
        entry.valorCotado += toNumber(row.valorTotal);
      }

      for (const row of licitantesRows) {
        const entry = ensureFornecedor({
          fornecedorId: row.fornecedorId,
          nome: row.fornecedorNome,
          cnpj: row.fornecedorCnpj,
          origem: "Licitação",
        });
        if (!entry) continue;
        entry.licitacoes += 1;
      }

      for (const row of contratosRows) {
        const entry = ensureFornecedor({
          fornecedorId: row.fornecedorId,
          nome: row.fornecedorNome,
          cnpj: row.fornecedorCnpj,
          origem: "Contratos",
        });
        if (!entry) continue;
        entry.contratos += 1;
        entry.valorContratado += toNumber(row.valorContrato);
      }
      for (const row of itemValuesRows) {
        const entry = ensureFornecedor({
          fornecedorId: row.fornecedorVencedorId,
          nome: row.fornecedorVencedorNome,
          cnpj: row.fornecedorVencedorCnpj,
          origem: "Resultado BLL",
        });
        if (!entry) continue;
        entry.itensVencidos += row.itemHomologado ? 1 : 0;
        entry.valorVencedor += toNumber(row.valorLanceVencedorTotal);
      }

      if (bllRow?.fornecedorNome) {
        ensureFornecedor({ nome: bllRow.fornecedorNome, origem: "BLL" });
      }
      for (const row of bllItensRows) {
        const entry = ensureFornecedor({
          nome: row.fornecedorNome,
          origem: "BLL",
        });
        if (!entry) continue;
        entry.cotacoes += 1;
        entry.valorCotado += toNumber(row.subtotal);
      }
      for (const row of bllLotesRows) {
        const entry = ensureFornecedor({
          nome: row.vencedor,
          origem: "BLL",
        });
        if (!entry) continue;
        entry.licitacoes += 1;
        entry.valorContratado += toNumber(row.valorHomologado);
      }
      for (const row of bllItensEspecificadosRows) {
        const entry = ensureFornecedor({
          nome: row.fornecedorHomologado,
          origem: "BLL",
        });
        if (!entry) continue;
        entry.licitacoes += 1;
        entry.valorContratado += toNumber(row.subtotalHomologado);
      }
      for (const row of pncpContratacaoItensRows) {
        const entry = ensureFornecedor({
          nome: row.fornecedorNome,
          cnpj: row.fornecedorDocumento,
          origem: "PNCP",
        });
        if (!entry) continue;
        entry.licitacoes += 1;
        entry.valorCotado += toNumber(row.valorTotal);
      }
      for (const row of pncpAtasRows) {
        const entry = ensureFornecedor({
          nome: row.fornecedorNome,
          cnpj: row.fornecedorDocumento,
          origem: "PNCP",
        });
        if (!entry) continue;
        entry.contratos += 1;
        entry.valorContratado += toNumber(row.valorGlobal);
      }
      for (const row of normalizedPncpContractsRows.length
        ? normalizedPncpContractsRows
        : pncpContratosRows.map((item) => ({
            fornecedorId: null,
            fornecedorNome: item.fornecedorNome,
            fornecedorCnpj: item.fornecedorDocumento,
            valorTotalContrato: item.valorTotal,
          }))) {
        const entry = ensureFornecedor({
          fornecedorId: row.fornecedorId,
          nome: row.fornecedorNome,
          cnpj: row.fornecedorCnpj,
          origem: "PNCP consolidado",
        });
        if (!entry) continue;
        entry.contratos += 1;
        entry.valorContratado += toNumber(row.valorTotalContrato);
      }

      const contratoItensByContrato = new Map<
        number,
        typeof contratoItensRows
      >();
      for (const row of contratoItensRows) {
        const bucket = contratoItensByContrato.get(row.contratoId) ?? [];
        bucket.push(row);
        contratoItensByContrato.set(row.contratoId, bucket);
      }

      const aditivosByContrato = new Map<number, typeof aditivosRows>();
      for (const row of aditivosRows) {
        const bucket = aditivosByContrato.get(row.contratoId) ?? [];
        bucket.push(row);
        aditivosByContrato.set(row.contratoId, bucket);
      }

      const pncpItensByContratacao = new Map<
        number,
        typeof pncpContratacaoItensRows
      >();
      for (const row of pncpContratacaoItensRows) {
        const bucket = pncpItensByContratacao.get(row.contratacaoId) ?? [];
        bucket.push(row);
        pncpItensByContratacao.set(row.contratacaoId, bucket);
      }

      const pncpItensByAta = new Map<number, typeof pncpAtaItensRows>();
      for (const row of pncpAtaItensRows) {
        const bucket = pncpItensByAta.get(row.ataId) ?? [];
        bucket.push(row);
        pncpItensByAta.set(row.ataId, bucket);
      }

      const pncpAditivosByContrato = new Map<number, typeof pncpAditivosRows>();
      for (const row of pncpAditivosRows) {
        const bucket = pncpAditivosByContrato.get(row.contratoId) ?? [];
        bucket.push(row);
        pncpAditivosByContrato.set(row.contratoId, bucket);
      }

      const fornecedoresVencedoresMap = new Map<
        string,
        {
          fornecedorId: number | null;
          nome: string;
          cnpj: string | null;
          totalItens: number;
          valorTotal: number;
          origemPrincipal: string;
        }
      >();
      for (const row of itemValuesRows) {
        const nome = String(row.fornecedorVencedorNome ?? "").trim();
        if (!nome || !row.itemHomologado) continue;
        const key = row.fornecedorVencedorId
          ? `id:${row.fornecedorVencedorId}`
          : `name:${normalizeName(nome)}|${row.fornecedorVencedorCnpj ?? ""}`;
        const current = fornecedoresVencedoresMap.get(key) ?? {
          fornecedorId: row.fornecedorVencedorId ?? null,
          nome,
          cnpj: row.fornecedorVencedorCnpj ?? null,
          totalItens: 0,
          valorTotal: 0,
          origemPrincipal: row.origemAlteracao ?? "Resultado BLL",
        };
        current.totalItens += 1;
        current.valorTotal += toNumber(row.valorLanceVencedorTotal);
        fornecedoresVencedoresMap.set(key, current);
      }

      const totalItensHomologados = itemValuesRows.filter(
        (row) => row.itemHomologado,
      ).length;
      const totalItensFracassados = itemValuesRows.filter(
        (row) => row.itemFracassado,
      ).length;
      const totalItensDesertos = itemValuesRows.filter(
        (row) => row.itemDeserto,
      ).length;
      const valorEstimadoFinanceiro =
        sumValues(
          itemValuesRows.map((row) => toNumberOrNull(row.valorEstimadoTotal)),
        ) || toNumber(baseRow.valorEstimado);
      const valorVencedorFinanceiro =
        sumValues(
          itemValuesRows.map((row) =>
            toNumberOrNull(row.valorLanceVencedorTotal),
          ),
        ) || toNumber(baseRow.valorHomologado);
      const economiaFinanceira = valorEstimadoFinanceiro - valorVencedorFinanceiro;
      const percentualEconomia =
        valorEstimadoFinanceiro > 0
          ? (economiaFinanceira / valorEstimadoFinanceiro) * 100
          : null;
      const percentualHomologacao =
        itemsRows.length > 0
          ? (totalItensHomologados / itemsRows.length) * 100
          : null;
      const ultimaSincronizacaoFinanceira =
        itemValuesRows
          .map((row) => toDateValue(row.atualizadoEm))
          .filter(Boolean)
          .sort()
          .slice(-1)[0] ?? null;

      return {
        resumo: {
          totalItens: itemsRows.length,
          totalFornecedores: fornecedorMap.size,
          totalFornecedoresVencedores: fornecedoresVencedoresMap.size,
          totalDocumentos: documentosRows.length,
          totalContratos: contratosRows.length + normalizedPncpContractsRows.length,
          totalContratosPncp: normalizedPncpContractsRows.length,
          totalMovimentacoes: movimentacoesRows.length,
          totalPrazos: prazosRows.length,
          prazosPendentes: prazosRows.filter(
            (row) => row.status !== "CONCLUIDO",
          ).length,
          valorEstimadoTotal: valorEstimadoFinanceiro,
          valorVencedorTotal: valorVencedorFinanceiro,
          valorCotadoTotal: sumValues(
            cotacaoRows.map((row) => toNumberOrNull(row.valorTotal)),
          ),
          valorContratadoTotal:
            sumValues(
              contratosRows.map((row) => toNumberOrNull(row.valorContrato)),
            ) +
            sumValues(
              normalizedPncpContractsRows.map((row) =>
                toNumberOrNull(row.valorTotalContrato),
              ),
            ),
          valorPncpTotal:
            sumValues(
              normalizedPncpContractsRows.map((row) =>
                toNumberOrNull(row.valorTotalContrato),
              ),
            ) +
            sumValues(
              pncpAtasRows.map((row) => toNumberOrNull(row.valorGlobal)),
            ) +
            sumValues(
              pncpContratacoesRows.map((row) =>
                toNumberOrNull(row.valorTotalEstimado),
              ),
            ),
          economiaTotal: economiaFinanceira,
          percentualEconomia,
          itensHomologados: totalItensHomologados,
          itensFracassados: totalItensFracassados,
          itensDesertos: totalItensDesertos,
          percentualHomologacao,
          ultimaSincronizacaoFinanceira,
          temLegado: legadoRows.length > 0,
          temBll: Boolean(bllRow),
          temPncp:
            pncpContratacoesRows.length > 0 ||
            pncpAtasRows.length > 0 ||
            pncpContratosRows.length > 0,
        },
        processo: {
          id: baseRow.processoId,
          numeroSirel: baseRow.numeroSirel,
          protocolo: baseRow.protocolo,
          numeroAdministrativo: baseRow.numeroAdministrativo,
          numeroEdital: baseRow.numeroEdital,
          anoReferencia: baseRow.anoReferencia,
          origemCadastro: baseRow.origemCadastro,
          foraDoFluxo: baseRow.foraDoFluxo,
          objeto: baseRow.objeto,
          valorEstimado: toNumberOrNull(baseRow.valorEstimado),
          valorHomologado: toNumberOrNull(baseRow.valorHomologado),
          tipoObjeto: baseRow.tipoObjeto,
          tipoContratacao: baseRow.tipoContratacao,
          criterioJulgamento: baseRow.criterioJulgamento,
          modoDisputa: baseRow.modoDisputa,
          escopoDisputa: baseRow.escopoDisputa,
          dataEntradaLicitacao: toDateValue(baseRow.dataEntradaLicitacao),
          dataAbertura: toDateValue(baseRow.dataAbertura),
          dataPublicacao: toDateValue(baseRow.dataPublicacao),
          dataDisputaSessao: toDateValue(baseRow.dataDisputaSessao),
          dataEncerramento: toDateValue(baseRow.dataEncerramento),
          publicado: baseRow.publicado,
          homologado: baseRow.homologado,
          finalizado: baseRow.finalizado,
          ativo: baseRow.ativo,
          criadoEm: toDateValue(baseRow.criadoEm),
          atualizadoEm: toDateValue(baseRow.atualizadoEm),
          secretaria: {
            id: baseRow.secretariaId,
            sigla: baseRow.secretariaSigla,
            nome: baseRow.secretariaNome,
          },
          modalidade: baseRow.modalidadeId
            ? {
                id: baseRow.modalidadeId,
                codigo: baseRow.modalidadeCodigo ?? "",
                nome: baseRow.modalidadeNome ?? "",
              }
            : null,
          statusAtual: baseRow.statusId
            ? {
                id: baseRow.statusId,
                codigo: baseRow.statusCodigo ?? "",
                nome: baseRow.statusNome ?? "",
                cor: baseRow.statusCor,
              }
            : null,
          autoridadeCompetente: mapPerson(
            peopleMap.get(baseRow.autoridadeCompetenteId ?? 0),
          ),
          condutorProcesso: mapPerson(
            peopleMap.get(baseRow.condutorProcessoId ?? 0),
          ),
        },
        planejamento: {
          dfd: dfdRow
            ? {
                id: dfdRow.id,
                setorDemandante: dfdRow.setorDemandante,
                grauPrioridade: dfdRow.grauPrioridade,
                demandaSistemica: dfdRow.demandaSistemica,
                justificativa: dfdRow.justificativa,
                dataNecessidade: toDateValue(dfdRow.dataNecessidade),
                dataPrevistaConclusao: toDateValue(
                  dfdRow.dataPrevistaConclusao,
                ),
                observacoes: dfdRow.observacoes,
                concluido: dfdRow.concluido,
                secretariaDemandante: dfdRow.secretariaDemandanteId
                  ? (secretariasMap.get(dfdRow.secretariaDemandanteId)?.nome ??
                    null)
                  : null,
                secretariaResponsavel: dfdRow.secretariaResponsavelId
                  ? (secretariasMap.get(dfdRow.secretariaResponsavelId)?.nome ??
                    null)
                  : null,
                solicitante: mapPerson(
                  peopleMap.get(dfdRow.solicitantePessoaId ?? 0),
                ),
                assinaturaResponsavel: mapPerson(
                  peopleMap.get(dfdRow.assinaturaResponsavelId ?? 0),
                ),
                responsaveis: dfdResponsaveisRows.reduce<
                  Array<
                    ReturnType<typeof mapPerson> extends infer T
                      ? Exclude<T, null>
                      : never
                  >
                >((acc, row) => {
                  const person = mapPerson(peopleMap.get(row.pessoaId));
                  if (person) acc.push(person);
                  return acc;
                }, []),
                secretariasParticipantes: dfdSecretariasRows
                  .map((row) => secretariasMap.get(row.secretariaId))
                  .filter(Boolean)
                  .map((row) => ({
                    id: row!.id,
                    sigla: row!.sigla,
                    nome: row!.nome,
                  })),
              }
            : null,
          etp: etpRow
            ? {
                id: etpRow.id,
                metodologiaCotacao: etpRow.metodologiaCotacao,
                descricaoNecessidade: etpRow.descricaoNecessidade,
                analiseSolucoesMercado: etpRow.analiseSolucoesMercado,
                justificativaTecnica: etpRow.justificativaTecnica,
                providenciasPrevias: etpRow.providenciasPrevias,
                conclusaoViabilidade: etpRow.conclusaoViabilidade,
                observacoes: etpRow.observacoes,
                concluido: etpRow.concluido,
              }
            : null,
          tr: trRow
            ? {
                id: trRow.id,
                objetoTermo: trRow.objetoTermo,
                fundamentacaoContratacao: trRow.fundamentacaoContratacao,
                descricaoSolucao: trRow.descricaoSolucao,
                requisitosContratacao: trRow.requisitosContratacao,
                modeloExecucao: trRow.modeloExecucao,
                criteriosMedicaoPagamento: trRow.criteriosMedicaoPagamento,
                adequacaoOrcamentaria: trRow.adequacaoOrcamentaria,
                orcamentoSigiloso: trRow.orcamentoSigiloso,
                observacoes: trRow.observacoes,
                concluido: trRow.concluido,
              }
            : null,
        },
        itens: itemsRows.map((row) => {
          const itemValues = itemValueByItemId.get(row.id);
          return {
            id: row.id,
            numeroItem: row.numeroItem,
            loteId: row.loteId,
            loteNumero: row.loteNumero,
            loteNumeroExterno:
              itemValues?.numeroLote ?? row.loteNumero?.toString() ?? null,
            loteDescricao: row.loteDescricao,
            descricao: row.descricao,
            unidade: row.unidade,
            quantidade: toNumber(row.quantidade),
            valorUnitarioEstimado:
              toNumberOrNull(itemValues?.valorEstimadoUnitario) ??
              toNumberOrNull(row.valorUnitarioEstimado),
            valorTotalEstimado:
              toNumberOrNull(itemValues?.valorEstimadoTotal) ??
              toNumberOrNull(row.valorTotalEstimado),
            valorLanceVencedorUnitario: toNumberOrNull(
              itemValues?.valorLanceVencedorUnitario,
            ),
            valorLanceVencedorTotal: toNumberOrNull(
              itemValues?.valorLanceVencedorTotal,
            ),
            percentualDesconto: toNumberOrNull(itemValues?.percentualDesconto),
            economiaObtida: toNumberOrNull(itemValues?.economiaObtida),
            fornecedorVencedorId: itemValues?.fornecedorVencedorId ?? null,
            fornecedorVencedorNome: itemValues?.fornecedorVencedorNome ?? null,
            fornecedorVencedorCnpj: itemValues?.fornecedorVencedorCnpj ?? null,
            itemHomologado: itemValues?.itemHomologado ?? false,
            itemDeserto: itemValues?.itemDeserto ?? false,
            itemFracassado: itemValues?.itemFracassado ?? false,
            motivoFracasso: itemValues?.motivoFracasso ?? null,
            dataHomologacao: toDateValue(itemValues?.dataHomologacao),
            statusResumo: itemValues?.itemHomologado
              ? "HOMOLOGADO"
              : itemValues?.itemFracassado
                ? "FRACASSADO"
                : itemValues?.itemDeserto
                  ? "DESERTO"
                  : "SEM RESULTADO",
            origemValores: itemValues?.origemAlteracao ?? null,
            cotacoesPreliminares: preliminaresPorItem.get(row.id) ?? 0,
            cotacoesMercado: cotacoesPorItem.get(row.id) ?? 0,
            propostasRecebidas: propostasPorItem.get(row.id) ?? 0,
            melhorProposta: melhorPropostaPorItem.get(row.id) ?? null,
            melhorLance: melhorLancePorItem.get(row.id) ?? null,
          };
        }),
        cotacoesPreliminares: prelimRows.map((row) => ({
          id: row.id,
          itemId: row.itemId,
          itemNumero: itemById.get(row.itemId)?.numeroItem ?? 0,
          fonte: row.fonte,
          fornecedorNome: row.fornecedorNome,
          documento: row.documento,
          dataCotacao: toDateValue(row.dataCotacao),
          quantidadeConsiderada: toNumber(row.quantidadeConsiderada),
          valorUnitario: toNumber(row.valorUnitario),
          valorTotal: toNumber(row.valorTotal),
          considerada: row.considerada,
          motivoDesconsideracao: row.motivoDesconsideracao,
          justificativaDesconsideracao: row.justificativaDesconsideracao,
          observacao: row.observacao,
        })),
        cotacoesMercado: cotacaoRows.map((row) => ({
          id: row.id,
          processoId: row.processoId,
          itemId: row.itemId,
          itemNumero: row.itemNumero,
          fornecedorId: row.fornecedorId,
          fornecedorNome: row.fornecedorNome,
          fornecedorCnpj: row.fornecedorCnpj,
          valorUnitario: toNumberOrNull(row.valorUnitario),
          valorTotal: toNumberOrNull(row.valorTotal),
          dataCotacao: toDateValue(row.dataCotacao),
          status: row.status,
        })),
        fornecedores: [...fornecedorMap.values()]
          .map((row) => ({
            fornecedorId: row.fornecedorId,
            nome: row.nome,
            cnpj: row.cnpj,
            telefone: row.telefone,
            email: row.email,
            cidade: row.cidade,
            estado: row.estado,
            cotacoes: row.cotacoes,
            licitacoes: row.licitacoes,
            contratos: row.contratos,
            valorCotado: row.valorCotado,
            valorContratado: row.valorContratado,
            itensVencidos: row.itensVencidos,
            valorVencedor: row.valorVencedor,
            origem: [...row.origem].sort(),
          }))
          .sort(
            (a, b) =>
              b.valorVencedor - a.valorVencedor ||
              b.valorContratado - a.valorContratado ||
              b.cotacoes - a.cotacoes ||
              a.nome.localeCompare(b.nome),
          ),
        fornecedoresVencedores: [...fornecedoresVencedoresMap.values()].sort(
          (a, b) =>
            b.valorTotal - a.valorTotal ||
            b.totalItens - a.totalItens ||
            a.nome.localeCompare(b.nome),
        ),
        licitacao: {
          cabecalho: licitacaoRow
            ? {
                id: licitacaoRow.id,
                statusLicitacao: licitacaoRow.statusLicitacao,
                exigeDeclaracaoNaoFracionamento:
                  licitacaoRow.exigeDeclaracaoNaoFracionamento,
                publicarNoDou: licitacaoRow.publicarNoDou,
                publicarEmJornal: licitacaoRow.publicarEmJornal,
                dataPublicacaoEdital: toDateValue(
                  licitacaoRow.dataPublicacaoEdital,
                ),
                dataRecebimentoPropostasInicio: toDateValue(
                  licitacaoRow.dataRecebimentoPropostasInicio,
                ),
                dataRecebimentoPropostasFim: toDateValue(
                  licitacaoRow.dataRecebimentoPropostasFim,
                ),
                dataAberturaPropostas: toDateValue(
                  licitacaoRow.dataAberturaPropostas,
                ),
                dataInicioLances: toDateValue(licitacaoRow.dataInicioLances),
                dataFimLances: toDateValue(licitacaoRow.dataFimLances),
                dataJulgamento: toDateValue(licitacaoRow.dataJulgamento),
                dataHomologacao: toDateValue(licitacaoRow.dataHomologacao),
                inversaoFasesHabilitada: licitacaoRow.inversaoFasesHabilitada,
                inversaoFasesJustificativa:
                  licitacaoRow.inversaoFasesJustificativa,
                observacoes: licitacaoRow.observacoes,
              }
            : null,
          checklistExcecoes: checklistRows.map((row) => ({
            id: row.id,
            categoria: row.categoria,
            statusFlexivel: row.statusFlexivel,
            naoAplicavel: row.naoAplicavel,
            justificativa: row.justificativa,
            departamentoResponsavel: row.departamentoResponsavel,
            previsaoRecebimento: toDateValue(row.previsaoRecebimento),
            processoFisicoNumero: row.processoFisicoNumero,
            localArquivamento: row.localArquivamento,
            digitalizarDepois: row.digitalizarDepois,
          })),
          licitantes: licitantesRows.map((row) => ({
            id: row.id,
            fornecedorId: row.fornecedorId,
            fornecedorNome: row.fornecedorNome,
            fornecedorCnpj: row.fornecedorCnpj,
            dataCadastro: toDateValue(row.dataCadastro),
            statusHabilitacao: row.statusHabilitacao,
            observacaoHabilitacao: row.observacaoHabilitacao,
            ativo: row.ativo,
          })),
          propostas: propostasRows.map((row) => ({
            id: row.id,
            licitanteId: row.licitanteId,
            licitanteNome:
              licitanteNameById.get(row.licitanteId) ?? row.fornecedorNome,
            fornecedorId: row.fornecedorId,
            fornecedorNome: row.fornecedorNome,
            itemId: row.itemId,
            itemNumero: row.itemNumero,
            valorUnitarioProposto: toNumber(row.valorUnitarioProposto),
            valorTotalProposto: toNumber(row.valorTotalProposto),
            dataProposta: toDateValue(row.dataProposta),
            classificacao: row.classificacao,
            situacao: row.situacao,
            justificativa: row.justificativa,
          })),
          lances: lancesRows.map((row) => ({
            id: row.id,
            propostaId: row.propostaId,
            licitanteNome:
              licitanteNameById.get(
                propostaById.get(row.propostaId)?.licitanteId ?? 0,
              ) ?? row.fornecedorNome,
            fornecedorNome: row.fornecedorNome,
            itemNumero: row.itemNumero,
            valorLance: toNumber(row.valorLance),
            dataLance: toDateValue(row.dataLance),
            usuario: row.usuarioId
              ? (usersMap.get(row.usuarioId) ?? null)
              : null,
            observacao: row.observacao,
          })),
          recursos: recursosRows.map((row) => ({
            id: row.id,
            licitanteNome:
              licitanteNameById.get(row.licitanteId) ?? row.fornecedorNome,
            fornecedorNome: row.fornecedorNome,
            dataInterposicao: toDateValue(row.dataInterposicao),
            dataJulgamento: toDateValue(row.dataJulgamento),
            resultado: row.resultado,
            descricao: row.descricao,
            decisao: row.decisao,
          })),
        },
        contratos: [
          ...contratosRows.map((row) => ({
            id: row.id,
            origem: "INTERNO" as const,
            numeroContrato: row.numeroContrato,
            fornecedorId: row.fornecedorId,
            fornecedorNome: row.fornecedorNome,
            fornecedorCnpj: row.fornecedorCnpj,
            valorContrato: toNumberOrNull(row.valorContrato),
            dataAssinatura: toDateValue(row.dataAssinatura),
            dataVigenciaInicio: toDateValue(row.dataVigenciaInicio),
            dataVigenciaFim: toDateValue(row.dataVigenciaFim),
            diasVigencia: null,
            objeto: row.objeto,
            status: row.status,
            pncpContractId: null,
            pncpProcessId: null,
            pncpUrl: null,
            pncpApiUrl: null,
            documentoContratoUrl: null,
            documentoEmpenhoUrl: null,
            itens: (contratoItensByContrato.get(row.id) ?? []).map((item) => ({
              id: item.id,
              descricao: item.descricao,
              unidade: item.unidade,
              quantidadeContratada: toNumber(item.quantidadeContratada),
              quantidadeConsumida: toNumber(item.quantidadeConsumida),
              saldoQuantidade: Math.max(
                0,
                toNumber(item.quantidadeContratada) -
                  toNumber(item.quantidadeConsumida),
              ),
              valorUnitario: toNumberOrNull(item.valorUnitario),
              valorTotal:
                item.valorUnitario != null
                  ? toNumber(item.valorUnitario) *
                    toNumber(item.quantidadeContratada)
                  : null,
              ativo: item.ativo,
            })),
            aditivos: (aditivosByContrato.get(row.id) ?? []).map((item) => ({
              id: item.id,
              numeroAditivo: item.numeroAditivo,
              tipo: item.tipo,
              descricao: item.descricao,
              valorAditado: toNumberOrNull(item.valorAditado),
              diasAdicionados: item.diasAdicionados,
              dataAssinatura: toDateValue(item.dataAssinatura),
            })),
          })),
          ...normalizedPncpContractsRows.map((row) => ({
            id: row.id,
            origem: "PNCP" as const,
            numeroContrato: row.numeroContrato ?? row.pncpContractId,
            fornecedorId: row.fornecedorId,
            fornecedorNome: row.fornecedorNome ?? "Fornecedor PNCP",
            fornecedorCnpj: row.fornecedorCnpj,
            valorContrato: toNumberOrNull(row.valorTotalContrato),
            dataAssinatura: toDateValue(row.dataAssinatura),
            dataVigenciaInicio: toDateValue(row.dataInicioVigencia),
            dataVigenciaFim: toDateValue(row.dataFimVigencia),
            diasVigencia: row.diasVigencia,
            objeto: row.objetoContrato ?? "",
            status: row.statusContrato ?? "PNCP",
            pncpContractId: row.pncpContractId,
            pncpProcessId: row.pncpProcessId,
            pncpUrl: row.pncpUrl,
            pncpApiUrl: row.pncpApiUrl,
            documentoContratoUrl: row.urlDocumentoContrato,
            documentoEmpenhoUrl: row.urlDocumentoEmpenho,
            itens: Array.isArray(row.itensVinculados)
              ? row.itensVinculados.map((item, index) => {
                  const current =
                    typeof item === "object" && item
                      ? (item as Record<string, unknown>)
                      : {};
                  return {
                    id: index + 1,
                    descricao: String(current.descricao ?? "Item vinculado"),
                    unidade: String(current.unidade ?? "-"),
                    quantidadeContratada: toNumber(current.quantidade) ?? 0,
                    quantidadeConsumida: 0,
                    saldoQuantidade: toNumber(current.quantidade) ?? 0,
                    valorUnitario:
                      toNumberOrNull(current.valorUnitario) ??
                      toNumberOrNull(current.valorVencedor),
                    valorTotal:
                      toNumberOrNull(current.valorTotal) ??
                      toNumberOrNull(current.valorVencedor),
                    ativo: true,
                  };
                })
              : [],
            aditivos: [],
          })),
        ].sort((a, b) =>
          String(b.dataAssinatura ?? b.dataVigenciaFim ?? "").localeCompare(
            String(a.dataAssinatura ?? a.dataVigenciaFim ?? ""),
          ),
        ),
        documentos: documentosRows.map((row) => ({
          id: row.id,
          titulo: row.titulo,
          descricao: row.descricao,
          tipo: row.tipo,
          categoria: row.categoria,
          versao: row.versao,
          arquivoUrl: buildDocumentoUrl(row.id),
          mimeType: row.mimeType,
          dataReferencia: toDateValue(row.dataReferencia),
          publico: row.publico,
          palavrasChave: Array.isArray(row.palavrasChave)
            ? row.palavrasChave
            : [],
          criadoEm: toDateValue(row.criadoEm),
        })),
        prazos: prazosRows.map((row) => ({
          id: row.id,
          tipo: row.tipo,
          titulo: row.titulo,
          dataPrevista: toDateValue(row.dataPrevista),
          dataRealizada: toDateValue(row.dataRealizada),
          status: row.status,
          responsavel: row.responsavelId
            ? (usersMap.get(row.responsavelId) ?? null)
            : null,
          observacao: row.observacao,
        })),
        workflow: {
          estado: baseRow.workflowModuloAtual
            ? {
                moduloAtual: baseRow.workflowModuloAtual,
                situacao: baseRow.workflowSituacao,
                etapaAtual: baseRow.workflowEtapaAtual,
                dataInicio: toDateValue(baseRow.workflowDataInicio),
                dataConclusao: toDateValue(baseRow.workflowDataConclusao),
                atualizadoEm: toDateValue(baseRow.workflowAtualizadoEm),
              }
            : null,
          movimentacoes: movimentacoesRows.map((row) => ({
            id: row.id,
            moduloOrigem: row.moduloOrigem,
            moduloDestino: row.moduloDestino,
            descricao: row.descricao,
            observacao: row.observacao,
            usuario: row.usuarioId
              ? (usersMap.get(row.usuarioId) ?? null)
              : null,
            criadoEm: toDateValue(row.criadoEm),
          })),
        },
        importacoes: {
          legado: {
            registros: legadoRows.map((row) => ({
              id: row.id,
              loteId: row.loteId,
              loteArquivo: row.loteArquivo,
              abaOrigem: row.abaOrigem,
              linha: row.linha,
              legacyId: row.legacyId,
              modalidade: row.modalidade,
              processoAdministrativo: row.processoAdministrativo,
              protocolo: row.protocolo,
              numeroEdital: row.numeroEdital,
              statusLegado: row.statusLegado,
              secretaria: row.secretaria,
              mappedSecretaria: row.mappedSecretaria,
              objetoResumo: row.objetoResumo,
              valorEstimado: toNumberOrNull(row.valorEstimado),
              valorContratado: toNumberOrNull(row.valorContratado),
              analysisSeverity: row.analysisSeverity,
              reviewStatus: row.reviewStatus,
              reviewNotes: row.reviewNotes,
              issues: Array.isArray(row.issues) ? row.issues : [],
              rawPayload:
                typeof row.rawPayload === "object" && row.rawPayload
                  ? (row.rawPayload as Record<string, unknown>)
                  : {},
            })),
          },
          bll: {
            processo: bllRow
              ? {
                  id: bllRow.id,
                  origem: bllRow.origem,
                  chaveExterna: bllRow.chaveExterna,
                  idOrigem: bllRow.idOrigem,
                  numeroEdital: bllRow.numeroEdital,
                  numeroAdministrativo: bllRow.numeroAdministrativo,
                  anoReferencia: bllRow.anoReferencia,
                  modalidade: bllRow.modalidade,
                  situacaoExterna: bllRow.situacaoExterna,
                  tipoContrato: bllRow.tipoContrato,
                  artigo: bllRow.artigo,
                  inciso: bllRow.inciso,
                  objeto: bllRow.objeto,
                  condutorNome: bllRow.condutorNome,
                  coordenadorNome: bllRow.coordenadorNome,
                  autoridadeNome: bllRow.autoridadeNome,
                  fornecedorNome: bllRow.fornecedorNome,
                  valorReferencia: toNumberOrNull(bllRow.valorReferencia),
                  valorTotal: toNumberOrNull(bllRow.valorTotal),
                  publicacaoEm: toDateValue(bllRow.publicacaoEm),
                  conclusaoEm: toDateValue(bllRow.conclusaoEm),
                  inicioRecepcaoEm: toDateValue(bllRow.inicioRecepcaoEm),
                  fimRecepcaoEm: toDateValue(bllRow.fimRecepcaoEm),
                  inicioDisputaEm: toDateValue(bllRow.inicioDisputaEm),
                  linkExterno: bllRow.linkExterno,
                  totalLotes: bllRow.totalLotes,
                  totalItens: bllRow.totalItens,
                  justificativa: bllRow.justificativa,
                  legislacaoAplicavel: bllRow.legislacaoAplicavel,
                  observacoes: bllRow.observacoes,
                  cotaMe: bllRow.cotaMe,
                  codigoPncp: bllRow.codigoPncp,
                  urlPncp: bllRow.urlPncp,
                  dataSincronizacaoPncp: toDateValue(
                    bllRow.dataSincronizacaoPncp,
                  ),
                  completenessScore: bllRow.completenessScore,
                  statusConciliacao: bllRow.statusConciliacao,
                  scoreConciliacao: bllRow.scoreConciliacao,
                  detalhesConciliacao: bllRow.detalhesConciliacao,
                  primeiraCapturaEm: toDateValue(bllRow.primeiraCapturaEm),
                  ultimaAtualizacaoEm: toDateValue(bllRow.ultimaAtualizacaoEm),
                }
              : null,
            lotes: bllLotesRows.map((row) => ({
              id: row.id,
              numero: row.numero,
              titulo: row.titulo,
              tipo: row.tipo,
              faseAtual: row.faseAtual,
              valorReferencia: toNumberOrNull(row.valorReferencia),
              valorHomologado: toNumberOrNull(row.valorHomologado),
              vencedor: row.vencedor,
              exclusivoMe: row.exclusivoMe,
              localEntrega: row.localEntrega,
              garantiaExigida: row.garantiaExigida,
            })),
            itens: bllItensRows.map((row) => ({
              id: row.id,
              loteNumero: row.loteNumero,
              itemNumero: row.itemNumero,
              descricao: row.descricao,
              unidade: row.unidade,
              quantidade: toNumberOrNull(row.quantidade),
              fornecedorNome: row.fornecedorNome,
              marca: row.marca,
              modelo: row.modelo,
              valorReferencia: toNumberOrNull(row.valorReferencia),
              valorUnitario: toNumberOrNull(row.valorUnitario),
              subtotal: toNumberOrNull(row.subtotal),
              situacaoExterna: row.situacaoExterna,
              faseExterna: row.faseExterna,
            })),
            itensEspecificados: bllItensEspecificadosRows.map((row) => ({
              id: row.id,
              loteNumero:
                bllLotesRows.find((item) => item.id === row.loteImportadoId)
                  ?.numero ?? null,
              numeroItem: row.numeroItem,
              codigoCatalogo: row.codigoCatalogo,
              descricaoResumida: row.descricaoResumida,
              especificacaoTecnica: row.especificacaoTecnica,
              unidadeMedida: row.unidadeMedida,
              quantidade: toNumberOrNull(row.quantidade),
              valorReferenciaUnitario: toNumberOrNull(
                row.valorReferenciaUnitario,
              ),
              valorHomologadoUnitario: toNumberOrNull(
                row.valorHomologadoUnitario,
              ),
              subtotalReferencia: toNumberOrNull(row.subtotalReferencia),
              subtotalHomologado: toNumberOrNull(row.subtotalHomologado),
              fornecedorHomologado: row.fornecedorHomologado,
              marcaHomologada: row.marcaHomologada,
              modeloHomologado: row.modeloHomologado,
            })),
            auditoriaEdicoes: bllAuditRows.map((row) => ({
              id: row.id,
              usuario: usersMap.get(row.usuarioId) ?? null,
              justificativa: row.justificativa,
              origemEdicao: row.origemEdicao,
              criadoEm: toDateValue(row.criadoEm),
              camposAlterados: row.camposAlterados,
            })),
          },
          pncp: {
            contratacoes: pncpContratacoesRows.map((row) => ({
              id: row.id,
              numeroControlePncp: row.numeroControlePncp,
              modalidade: row.modalidade,
              modoDisputa: row.modoDisputa,
              criterioJulgamento: row.criterioJulgamento,
              objeto: row.objeto,
              valorTotalEstimado: toNumberOrNull(row.valorTotalEstimado),
              dataPublicacao: toDateValue(row.dataPublicacao),
              dataAberturaProposta: toDateValue(row.dataAberturaProposta),
              dataEncerramentoProposta: toDateValue(
                row.dataEncerramentoProposta,
              ),
              situacao: row.situacao,
              urlProcesso: row.urlProcesso,
              itens: (pncpItensByContratacao.get(row.id) ?? []).map((item) => ({
                id: item.id,
                numeroItem: item.numeroItem,
                descricao: item.descricao,
                unidade: item.unidade,
                quantidade: toNumberOrNull(item.quantidade),
                valorUnitario: toNumberOrNull(item.valorUnitario),
                valorTotal: toNumberOrNull(item.valorTotal),
                situacao: item.situacao,
                fornecedorNome: item.fornecedorNome,
                fornecedorDocumento: item.fornecedorDocumento,
              })),
            })),
            atas: pncpAtasRows.map((row) => ({
              id: row.id,
              idAtaPncp: row.idAtaPncp,
              numeroAta: row.numeroAta,
              objeto: row.objeto,
              valorGlobal: toNumberOrNull(row.valorGlobal),
              dataAssinatura: toDateValue(row.dataAssinatura),
              dataInicioVigencia: toDateValue(row.dataInicioVigencia),
              dataFimVigencia: toDateValue(row.dataFimVigencia),
              situacao: row.situacao,
              fornecedorNome: row.fornecedorNome,
              fornecedorDocumento: row.fornecedorDocumento,
              urlAta: row.urlAta,
              itens: (pncpItensByAta.get(row.id) ?? []).map((item) => ({
                id: item.id,
                numeroItem: item.numeroItem,
                descricao: item.descricao,
                unidade: item.unidade,
                quantidade: toNumberOrNull(item.quantidade),
                valorUnitario: toNumberOrNull(item.valorUnitario),
                valorTotal: toNumberOrNull(item.valorTotal),
                fornecedorNome: item.fornecedorNome,
                fornecedorDocumento: item.fornecedorDocumento,
              })),
            })),
            contratos: pncpContratosRows.map((row) => ({
              id: row.id,
              idContratoPncp: row.idContratoPncp,
              numeroContrato: row.numeroContrato,
              objeto: row.objeto,
              modalidade: row.modalidade,
              valorTotal: toNumberOrNull(row.valorTotal),
              dataAssinatura: toDateValue(row.dataAssinatura),
              dataInicioVigencia: toDateValue(row.dataInicioVigencia),
              dataFimVigencia: toDateValue(row.dataFimVigencia),
              dataEncerramento: toDateValue(row.dataEncerramento),
              situacao: row.situacao,
              fornecedorNome: row.fornecedorNome,
              fornecedorDocumento: row.fornecedorDocumento,
              urlContrato: row.urlContrato,
              aditivos: (pncpAditivosByContrato.get(row.id) ?? []).map(
                (item) => ({
                  id: item.id,
                  idAditivoPncp: item.idAditivoPncp,
                  numeroAditivo: item.numeroAditivo,
                  tipoAditivo: item.tipoAditivo,
                  objeto: item.objeto,
                  valorAditivo: toNumberOrNull(item.valorAditivo),
                  dataAssinatura: toDateValue(item.dataAssinatura),
                  dataInicioVigencia: toDateValue(item.dataInicioVigencia),
                  dataFimVigencia: toDateValue(item.dataFimVigencia),
                }),
              ),
            })),
          },
        },
      };
    }),

  refresh: operadorProcedure
    .input(dossieDetailInputSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await refreshDossieAutonomoProcesso({
        processoId: input.processoId,
        userId: ctx.user?.id ?? null,
      });

      return {
        message:
          "Dossiê atualizado com valores da BLL e contratos consolidados do PNCP.",
        result,
      };
    }),
});

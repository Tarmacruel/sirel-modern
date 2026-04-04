import type { DossieDetail } from "../schemas/dossie.js";
import { buildPrintableShell, escapeHtml } from "./planejamento.js";

function formatCurrencyBRL(value: number | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(parsed)
    : "-";
}

function formatNumberBR(
  value: number | null | undefined,
  maximumFractionDigits = 3,
) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "-";
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(parsed);
}

function formatDateBR(value: string | null | undefined, withTime = false) {
  if (!value) return "-";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00`)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat(
    "pt-BR",
    withTime
      ? { dateStyle: "short", timeStyle: "short" }
      : { dateStyle: "short" },
  ).format(date);
}

function safeText(value: string | null | undefined) {
  return escapeHtml(value ?? "-");
}

function safeLink(href: string | null | undefined, label: string) {
  if (!href) return "-";
  return `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${safeText(label)}</a>`;
}

function renderCards(items: Array<{ label: string; value: string }>) {
  return items
    .map(
      (item) => `
        <article class="card">
          <div class="label">${safeText(item.label)}</div>
          <div class="value">${safeText(item.value)}</div>
        </article>
      `,
    )
    .join("");
}

function renderSimpleTable(
  headers: string[],
  rows: string[][],
  emptyLabel: string,
) {
  return `
    <table>
      <thead>
        <tr>${headers.map((header) => `<th>${safeText(header)}</th>`).join("")}</tr>
      </thead>
      <tbody>
        ${
          rows.length
            ? rows
                .map(
                  (row) => `
                    <tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>
                  `,
                )
                .join("")
            : `<tr><td colspan="${headers.length}">${safeText(emptyLabel)}</td></tr>`
        }
      </tbody>
    </table>
  `;
}

export function buildDossieHtml(detail: DossieDetail) {
  const processo = detail.processo;
  const resumo = detail.resumo;

  const identificacaoCards = [
    { label: "Processo SIREL", value: processo.numeroSirel },
    { label: "Protocolo", value: processo.protocolo ?? "Nao informado" },
    {
      label: "Administrativo / Edital",
      value:
        [processo.numeroAdministrativo, processo.numeroEdital]
          .filter(Boolean)
          .join(" / ") || "Nao informado",
    },
    {
      label: "Secretaria",
      value: `${processo.secretaria.sigla} - ${processo.secretaria.nome}`,
    },
    {
      label: "Modalidade",
      value: processo.modalidade?.nome ?? "Nao informada",
    },
    { label: "Status", value: processo.statusAtual?.nome ?? "Sem status" },
    {
      label: "Entrada na licitacao",
      value: formatDateBR(processo.dataEntradaLicitacao),
    },
    {
      label: "Modulo atual",
      value: detail.workflow.estado?.moduloAtual ?? "Sem workflow",
    },
  ];

  const resumoCards = [
    { label: "Itens", value: formatNumberBR(resumo.totalItens, 0) },
    {
      label: "Homologados",
      value: `${formatNumberBR(resumo.itensHomologados, 0)} / ${formatNumberBR(resumo.totalItens, 0)}`,
    },
    {
      label: "Fracassados / desertos",
      value: `${formatNumberBR(resumo.itensFracassados, 0)} / ${formatNumberBR(resumo.itensDesertos, 0)}`,
    },
    {
      label: "Contratos",
      value: `${formatNumberBR(resumo.totalContratos, 0)} (${formatNumberBR(resumo.totalContratosPncp, 0)} PNCP)`,
    },
    {
      label: "Valor estimado",
      value: formatCurrencyBRL(resumo.valorEstimadoTotal),
    },
    {
      label: "Valor vencedor",
      value: formatCurrencyBRL(resumo.valorVencedorTotal),
    },
    {
      label: "Economia",
      value: formatCurrencyBRL(resumo.economiaTotal),
    },
    {
      label: "Desconto",
      value:
        resumo.percentualEconomia !== null
          ? `${formatNumberBR(resumo.percentualEconomia, 2)}%`
          : "-",
    },
  ];

  return `
    <header class="header">
      <div class="eyebrow">Dossie completo do processo</div>
      <h1>${safeText(processo.numeroSirel)}</h1>
      <p class="muted">${safeText(processo.objeto)}</p>
    </header>

    <h2>Identificacao</h2>
    <section class="grid">${renderCards(identificacaoCards)}</section>

    <h2>Resumo executivo</h2>
    <section class="grid">${renderCards(resumoCards)}</section>

    <h2>Autoridades e conducao</h2>
    <section class="grid">
      ${renderCards([
        {
          label: "Autoridade competente",
          value: processo.autoridadeCompetente
            ? `${processo.autoridadeCompetente.nome}${processo.autoridadeCompetente.cargo ? ` - ${processo.autoridadeCompetente.cargo}` : ""}`
            : "Nao informada",
        },
        {
          label: "Condutor do processo",
          value: processo.condutorProcesso
            ? `${processo.condutorProcesso.nome}${processo.condutorProcesso.cargo ? ` - ${processo.condutorProcesso.cargo}` : ""}`
            : "Nao informado",
        },
      ])}
    </section>

    <h2>Planejamento</h2>
    <section class="grid">
      ${renderCards([
        {
          label: "DFD",
          value: detail.planejamento.dfd
            ? detail.planejamento.dfd.concluido
              ? "Concluida"
              : "Em aberto"
            : "Nao cadastrada",
        },
        {
          label: "ETP",
          value: detail.planejamento.etp
            ? detail.planejamento.etp.concluido
              ? "Concluido"
              : "Em aberto"
            : "Nao cadastrado",
        },
        {
          label: "TR",
          value: detail.planejamento.tr
            ? detail.planejamento.tr.concluido
              ? "Concluido"
              : "Em aberto"
            : "Nao cadastrado",
        },
      ])}
    </section>

    <h2>Itens do processo</h2>
    ${renderSimpleTable(
      [
        "Lote",
        "Item",
        "Descricao",
        "Qtd.",
        "Vl. estimado",
        "Vl. vencedor",
        "Desconto",
        "Economia",
        "Fornecedor vencedor",
        "Status",
      ],
      detail.itens.map((item) => [
        safeText(
          item.loteNumeroExterno
            ? `Lote ${item.loteNumeroExterno}`
            : item.loteNumero
              ? `Lote ${item.loteNumero}`
              : "-",
        ),
        safeText(String(item.numeroItem)),
        safeText(item.descricao),
        safeText(`${formatNumberBR(item.quantidade)} ${item.unidade}`),
        safeText(
          `${formatCurrencyBRL(item.valorTotalEstimado)} (unit. ${formatCurrencyBRL(item.valorUnitarioEstimado)})`,
        ),
        safeText(
          `${formatCurrencyBRL(item.valorLanceVencedorTotal)} (unit. ${formatCurrencyBRL(item.valorLanceVencedorUnitario)})`,
        ),
        safeText(
          item.percentualDesconto !== null
            ? `${formatNumberBR(item.percentualDesconto, 2)}%`
            : "-",
        ),
        safeText(formatCurrencyBRL(item.economiaObtida)),
        safeText(item.fornecedorVencedorNome ?? "-"),
        safeText(item.statusResumo),
      ]),
      "Nenhum item registrado.",
    )}

    <h2>Fornecedores vencedores</h2>
    ${renderSimpleTable(
      ["Fornecedor", "CNPJ", "Itens", "Valor", "Origem"],
      detail.fornecedoresVencedores.map((fornecedor) => [
        safeText(fornecedor.nome),
        safeText(fornecedor.cnpj),
        safeText(String(fornecedor.totalItens)),
        safeText(formatCurrencyBRL(fornecedor.valorTotal)),
        safeText(fornecedor.origemPrincipal),
      ]),
      "Nenhum fornecedor vencedor consolidado no processo.",
    )}

    <h2>Licitacao</h2>
    <section class="grid">
      ${renderCards([
        {
          label: "Status da licitacao",
          value: detail.licitacao.cabecalho?.statusLicitacao ?? "Nao iniciada",
        },
        {
          label: "Publicacao do edital",
          value: formatDateBR(
            detail.licitacao.cabecalho?.dataPublicacaoEdital ?? null,
            true,
          ),
        },
        {
          label: "Recebimento de propostas",
          value: `${formatDateBR(detail.licitacao.cabecalho?.dataRecebimentoPropostasInicio ?? null, true)} ate ${formatDateBR(detail.licitacao.cabecalho?.dataRecebimentoPropostasFim ?? null, true)}`,
        },
        {
          label: "Homologacao",
          value: formatDateBR(
            detail.licitacao.cabecalho?.dataHomologacao ?? null,
            true,
          ),
        },
      ])}
    </section>

    <h2>Contratos</h2>
    ${renderSimpleTable(
      ["Contrato", "Origem", "Fornecedor", "Status", "Vigencia", "Valor", "Acesso"],
      detail.contratos.map((contrato) => [
        safeText(contrato.numeroContrato),
        safeText(contrato.origem),
        safeText(contrato.fornecedorNome),
        safeText(contrato.status),
        safeText(
          `${formatDateBR(contrato.dataVigenciaInicio)} a ${formatDateBR(contrato.dataVigenciaFim)}`,
        ),
        safeText(formatCurrencyBRL(contrato.valorContrato)),
        safeLink(
          contrato.pncpUrl ?? contrato.documentoContratoUrl ?? contrato.pncpApiUrl,
          contrato.pncpUrl
            ? "Ver no PNCP"
            : contrato.documentoContratoUrl
              ? "Abrir documento"
              : "Abrir API",
        ),
      ]),
      "Nenhum contrato vinculado ao processo.",
    )}

    <h2>Documentos</h2>
    ${renderSimpleTable(
      ["Titulo", "Tipo", "Categoria", "Data", "Versao"],
      detail.documentos.map((documento) => [
        safeText(documento.titulo),
        safeText(documento.tipo),
        safeText(documento.categoria ?? "-"),
        safeText(formatDateBR(documento.dataReferencia ?? documento.criadoEm)),
        safeText(String(documento.versao)),
      ]),
      "Nenhum documento cadastrado.",
    )}

    <h2>Prazos</h2>
    ${renderSimpleTable(
      ["Titulo", "Tipo", "Status", "Previsto", "Responsavel"],
      detail.prazos.map((prazo) => [
        safeText(prazo.titulo),
        safeText(prazo.tipo),
        safeText(prazo.status),
        safeText(formatDateBR(prazo.dataPrevista)),
        safeText(prazo.responsavel ?? "-"),
      ]),
      "Nenhum prazo processual registrado.",
    )}

    <h2>Integracoes e base importada</h2>
    <section class="grid">
      ${renderCards([
        {
          label: "Registros legado",
          value: formatNumberBR(detail.importacoes.legado.registros.length, 0),
        },
        {
          label: "Processo BLL",
          value: detail.importacoes.bll.processo?.modalidade ?? "Nao vinculado",
        },
        {
          label: "Contratacoes PNCP",
          value: formatNumberBR(detail.importacoes.pncp.contratacoes.length, 0),
        },
        {
          label: "Contratos PNCP",
          value: formatNumberBR(detail.importacoes.pncp.contratos.length, 0),
        },
      ])}
    </section>

    <h2>Movimentacoes recentes</h2>
    ${renderSimpleTable(
      ["Data", "Destino", "Descricao", "Usuario"],
      detail.workflow.movimentacoes
        .slice(0, 20)
        .map((movimentacao) => [
          safeText(formatDateBR(movimentacao.criadoEm, true)),
          safeText(movimentacao.moduloDestino),
          safeText(movimentacao.descricao),
          safeText(movimentacao.usuario ?? "-"),
        ]),
      "Ainda nao ha movimentacoes registradas.",
    )}
  `;
}

export { buildPrintableShell };

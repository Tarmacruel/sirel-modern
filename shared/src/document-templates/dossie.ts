import type {
  DossieDetail,
  DossieFornecedorDetail,
  DossieItemDetail,
} from "../schemas/dossie.js";
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

type CriticalStatusDateKey =
  | "HOMOLOGACAO"
  | "FRACASSADO"
  | "SUSPENSAO"
  | "REVOGACAO"
  | "ANULACAO"
  | "DESERTO";

const criticalStatusDateCatalog: Array<{
  key: CriticalStatusDateKey;
  label: string;
}> = [
  { key: "HOMOLOGACAO", label: "Homologacao" },
  { key: "FRACASSADO", label: "Fracassado" },
  { key: "SUSPENSAO", label: "Suspensao" },
  { key: "REVOGACAO", label: "Revogacao" },
  { key: "ANULACAO", label: "Anulacao" },
  { key: "DESERTO", label: "Deserto" },
];

function normalizeStatusToken(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function detectCriticalStatusKey(
  label: string | null | undefined,
): CriticalStatusDateKey | null {
  const token = normalizeStatusToken(label);
  if (!token) return null;
  if (token.includes("HOMOLOG")) return "HOMOLOGACAO";
  if (token.includes("FRACASS")) return "FRACASSADO";
  if (token.includes("SUSPENS")) return "SUSPENSAO";
  if (token.includes("REVOG")) return "REVOGACAO";
  if (token.includes("ANUL")) return "ANULACAO";
  if (token.includes("DESERT")) return "DESERTO";
  return null;
}

function parseCriticalStatusFromObservation(observacao: string | null) {
  if (!observacao) return null;
  const match = observacao.match(
    /Data do status\s+([^:]+):\s*(\d{4}-\d{2}-\d{2})/i,
  );
  if (!match) return null;
  const key = detectCriticalStatusKey(match[1]);
  if (!key) return null;
  return { key, date: match[2] };
}

function buildCriticalStatusDates(detail: DossieDetail) {
  const byKey = new Map<CriticalStatusDateKey, string>();

  const dataHomologacao = detail.licitacao.cabecalho?.dataHomologacao;
  if (dataHomologacao) {
    byKey.set("HOMOLOGACAO", dataHomologacao);
  }

  for (const movimentacao of detail.workflow.movimentacoes) {
    const parsed = parseCriticalStatusFromObservation(movimentacao.observacao);
    if (parsed && !byKey.has(parsed.key)) {
      byKey.set(parsed.key, parsed.date);
    }
  }

  const fallbackStatusKey = detectCriticalStatusKey(
    detail.processo.statusAtual?.nome ?? detail.processo.statusAtual?.codigo,
  );
  if (
    fallbackStatusKey &&
    detail.processo.dataEncerramento &&
    !byKey.has(fallbackStatusKey)
  ) {
    byKey.set(fallbackStatusKey, detail.processo.dataEncerramento);
  }

  return criticalStatusDateCatalog.map((item) => ({
    ...item,
    date: byKey.get(item.key) ?? null,
  }));
}

export function buildDossieHtml(detail: DossieDetail) {
  const processo = detail.processo;
  const resumo = detail.resumo;
  const criticalStatusDates = buildCriticalStatusDates(detail);

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

    <h2>Datas criticas de status</h2>
    <section class="grid">
      ${renderCards(
        criticalStatusDates.map((item) => ({
          label: item.label,
          value: formatDateBR(item.date),
        })),
      )}
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

    <h2>Movimentacoes</h2>
    ${renderSimpleTable(
      ["Data", "Destino", "Descricao", "Observacao", "Usuario"],
      detail.workflow.movimentacoes
        .map((movimentacao) => [
          safeText(formatDateBR(movimentacao.criadoEm, true)),
          safeText(movimentacao.moduloDestino),
          safeText(movimentacao.descricao),
          safeText(movimentacao.observacao ?? "-"),
          safeText(movimentacao.usuario ?? "-"),
        ]),
      "Ainda nao ha movimentacoes registradas.",
    )}
  `;
}

function renderInsights(
  items: Array<{ id: string; titulo: string; descricao: string }>,
  emptyLabel: string,
) {
  if (!items.length) {
    return `<p class="muted">${safeText(emptyLabel)}</p>`;
  }

  return `
    <section class="grid">
      ${items
        .map(
          (item) => `
            <article class="card">
              <div class="label">${safeText(item.titulo)}</div>
              <div class="muted" style="margin-top:8px;">${safeText(item.descricao)}</div>
            </article>
          `,
        )
        .join("")}
    </section>
  `;
}

export function buildDossieItemHtml(detail: DossieItemDetail) {
  const identificacaoCards = [
    { label: "ID interno", value: String(detail.identificacao.id) },
    { label: "Codigo interno", value: detail.identificacao.codigoInterno },
    { label: "Unidade", value: detail.identificacao.unidadeMedida },
    { label: "Status", value: detail.identificacao.status },
    {
      label: "Criado em",
      value: formatDateBR(detail.identificacao.criadoEm, true),
    },
    {
      label: "Atualizado em",
      value: formatDateBR(detail.identificacao.atualizadoEm, true),
    },
    {
      label: "Aliases",
      value: detail.identificacao.aliases.length
        ? detail.identificacao.aliases.join(" | ")
        : "Sem aliases",
    },
    {
      label: "Categoria / grupo",
      value:
        [
          detail.identificacao.categoria,
          detail.identificacao.grupo,
          detail.identificacao.familia,
        ]
          .filter(Boolean)
          .join(" / ") || "Nao informado",
    },
  ];

  const resumoCards = [
    { label: "Processos", value: formatNumberBR(detail.resumo.totalProcessos, 0) },
    {
      label: "Licitacoes",
      value: formatNumberBR(detail.resumo.totalLicitacoes, 0),
    },
    {
      label: "Contratos",
      value: formatNumberBR(detail.resumo.totalContratos, 0),
    },
    {
      label: "Qtd. contratada",
      value: formatNumberBR(detail.resumo.quantidadeTotalContratada, 3),
    },
    {
      label: "Valor contratado",
      value: formatCurrencyBRL(detail.resumo.valorTotalContratado),
    },
    {
      label: "Valor medio",
      value: formatCurrencyBRL(detail.resumo.valorMedioContratado),
    },
    {
      label: "Menor unitario",
      value: formatCurrencyBRL(detail.resumo.menorValorUnitarioHistorico),
    },
    {
      label: "Maior unitario",
      value: formatCurrencyBRL(detail.resumo.maiorValorUnitarioHistorico),
    },
  ];

  return `
    <header class="header">
      <div class="eyebrow">Dossie do item</div>
      <h1>${safeText(detail.identificacao.descricaoResumida)}</h1>
      <p class="muted">${safeText(detail.identificacao.descricaoCompleta ?? detail.identificacao.descricaoResumida)}</p>
    </header>

    <h2>Identificacao</h2>
    <section class="grid">${renderCards(identificacaoCards)}</section>

    <h2>Resumo executivo</h2>
    <section class="grid">${renderCards(resumoCards)}</section>

    <h2>Observacoes gerenciais</h2>
    ${renderInsights(
      detail.insights.map((item) => ({
        id: item.id,
        titulo: item.titulo,
        descricao: item.descricao,
      })),
      "Nenhum alerta analitico relevante foi identificado.",
    )}

    <h2>Presenca em processos</h2>
    ${renderSimpleTable(
      [
        "Processo",
        "Secretaria",
        "Modalidade",
        "Quantidade",
        "Estimado",
        "Homologado",
        "Status",
      ],
      detail.processos.map((row) => [
        safeText(row.numeroSirel),
        safeText(row.secretaria),
        safeText(row.modalidade ?? "Nao informado"),
        safeText(`${formatNumberBR(row.quantidadePrevista, 3)} ${row.unidade}`),
        safeText(formatCurrencyBRL(row.valorEstimado)),
        safeText(formatCurrencyBRL(row.valorHomologado)),
        safeText(row.status ?? row.etapaAtual ?? "Em analise"),
      ]),
      "Nenhum processo relacionado ao item.",
    )}

    <h2>Licitacoes e disputas</h2>
    ${renderSimpleTable(
      [
        "Processo",
        "Lote / item",
        "Fornecedor vencedor",
        "Estimado unit.",
        "Melhor oferta",
        "Vencedor",
        "Status",
      ],
      detail.licitacoes.map((row) => [
        safeText(row.numeroSirel),
        safeText(`${row.loteNumero ? `Lote ${row.loteNumero}` : "Sem lote"} / Item ${row.itemNumero}`),
        safeText(row.fornecedorVencedor ?? "Sem vencedor"),
        safeText(formatCurrencyBRL(row.valorEstimadoUnitario)),
        safeText(formatCurrencyBRL(row.melhorValorOfertado)),
        safeText(formatCurrencyBRL(row.valorVencedor)),
        safeText(row.statusItem),
      ]),
      "Nenhum historico licitatorio encontrado.",
    )}

    <h2>Contratos vinculados</h2>
    ${renderSimpleTable(
      [
        "Contrato",
        "Fornecedor",
        "Processo",
        "Quantidade",
        "Saldo",
        "Valor unit.",
        "Valor total",
      ],
      detail.contratos.map((row) => [
        safeText(row.numeroContrato),
        safeText(row.fornecedorNome),
        safeText(row.processoNumeroSirel),
        safeText(formatNumberBR(row.quantidadeContratada, 3)),
        safeText(formatNumberBR(row.saldoRemanescente, 3)),
        safeText(formatCurrencyBRL(row.valorUnitario)),
        safeText(formatCurrencyBRL(row.valorTotalItem)),
      ]),
      "Nenhum contrato vinculado ao item.",
    )}

    <h2>Fornecedores relacionados</h2>
    ${renderSimpleTable(
      [
        "Fornecedor",
        "Participacoes",
        "Vitorias",
        "Faixa ofertada",
        "Media",
        "Ultimo vencedor",
        "Taxa",
      ],
      detail.fornecedores.map((row) => [
        safeText(row.fornecedorNome),
        safeText(formatNumberBR(row.participacoes, 0)),
        safeText(formatNumberBR(row.vitorias, 0)),
        safeText(
          `${formatCurrencyBRL(row.menorValorOfertado)} a ${formatCurrencyBRL(row.maiorValorOfertado)}`,
        ),
        safeText(formatCurrencyBRL(row.valorMedioOfertado)),
        safeText(formatCurrencyBRL(row.ultimoValorVencedor)),
        safeText(
          row.taxaVitoria === null
            ? "-"
            : `${formatNumberBR(row.taxaVitoria, 2)}%`,
        ),
      ]),
      "Nenhum fornecedor consolidado para o item.",
    )}

    <h2>Evolucao historica de precos</h2>
    ${renderSimpleTable(
      [
        "Data",
        "Referencia",
        "Fornecedor",
        "Modalidade",
        "Estimado",
        "Vencedor",
        "Contratado",
      ],
      detail.evolucaoPrecos.map((row) => [
        safeText(formatDateBR(row.data)),
        safeText(row.processoNumeroSirel ?? row.secretaria ?? "-"),
        safeText(row.fornecedorNome ?? "-"),
        safeText(row.modalidade ?? "-"),
        safeText(formatCurrencyBRL(row.valorEstimado)),
        safeText(formatCurrencyBRL(row.valorVencedor)),
        safeText(formatCurrencyBRL(row.valorContratado)),
      ]),
      "Nenhum ponto de preco consolidado.",
    )}

    <h2>Auditoria</h2>
    <section class="grid">
      ${renderCards([
        {
          label: "Ultima atualizacao",
          value: formatDateBR(detail.auditoria.ultimaAtualizacaoCadastro, true),
        },
        {
          label: "Usuarios sensiveis",
          value: detail.auditoria.usuariosSensiveis.length
            ? detail.auditoria.usuariosSensiveis.join(" | ")
            : "Sem registros",
        },
        {
          label: "Vinculos criticos",
          value: detail.auditoria.vinculosCriticos.length
            ? detail.auditoria.vinculosCriticos.join(" | ")
            : "Nenhum",
        },
      ])}
    </section>
    ${renderSimpleTable(
      ["Data", "Acao", "Usuario", "Descricao", "Campos"],
      detail.auditoria.mudancasRelevantes.map((row) => [
        safeText(formatDateBR(row.criadoEm, true)),
        safeText(row.acao),
        safeText(row.usuario ?? "Sistema"),
        safeText(row.descricao ?? "Sem descricao"),
        safeText(
          row.camposAlterados.length
            ? row.camposAlterados.join(", ")
            : "Sem destaque",
        ),
      ]),
      "Nenhuma trilha de auditoria encontrada para o item.",
    )}
  `;
}

export function buildDossieFornecedorHtml(detail: DossieFornecedorDetail) {
  const identificacaoCards = [
    { label: "ID interno", value: String(detail.identificacao.id) },
    { label: "Documento", value: detail.identificacao.documento },
    { label: "Status", value: detail.identificacao.status },
    {
      label: "Situacao interna",
      value: detail.identificacao.situacaoCadastralInterna,
    },
    { label: "E-mail", value: detail.identificacao.email ?? "Nao informado" },
    {
      label: "Telefone",
      value: detail.identificacao.telefone ?? "Nao informado",
    },
    {
      label: "Municipio / UF",
      value:
        [detail.identificacao.municipio, detail.identificacao.uf]
          .filter(Boolean)
          .join("/") || "Nao informado",
    },
    {
      label: "Registro unificado",
      value: detail.identificacao.registroUnificado ? "Sim" : "Nao",
    },
  ];

  const resumoCards = [
    { label: "Processos", value: formatNumberBR(detail.resumo.totalProcessos, 0) },
    {
      label: "Licitacoes",
      value: formatNumberBR(detail.resumo.totalLicitacoes, 0),
    },
    { label: "Vitorias", value: formatNumberBR(detail.resumo.totalVitorias, 0) },
    {
      label: "Taxa de vitoria",
      value:
        detail.resumo.taxaVitoria === null
          ? "-"
          : `${formatNumberBR(detail.resumo.taxaVitoria, 2)}%`,
    },
    {
      label: "Valor ofertado",
      value: formatCurrencyBRL(detail.resumo.valorTotalOfertado),
    },
    {
      label: "Valor vencido",
      value: formatCurrencyBRL(detail.resumo.valorTotalVencido),
    },
    {
      label: "Valor contratado",
      value: formatCurrencyBRL(detail.resumo.valorTotalContratado),
    },
    { label: "Contratos", value: formatNumberBR(detail.resumo.totalContratos, 0) },
  ];

  return `
    <header class="header">
      <div class="eyebrow">Dossie do fornecedor</div>
      <h1>${safeText(detail.identificacao.razaoSocial)}</h1>
      <p class="muted">${safeText(detail.identificacao.nomeFantasia ?? detail.identificacao.documento)}</p>
    </header>

    <h2>Identificacao</h2>
    <section class="grid">${renderCards(identificacaoCards)}</section>

    <h2>Resumo executivo</h2>
    <section class="grid">${renderCards(resumoCards)}</section>

    <h2>Alertas e insights</h2>
    ${renderInsights(
      detail.insights.map((item) => ({
        id: item.id,
        titulo: item.titulo,
        descricao: item.descricao,
      })),
      "Nenhum insight gerencial relevante foi identificado.",
    )}

    <h2>Participacoes em processos</h2>
    ${renderSimpleTable(
      [
        "Processo",
        "Modalidade",
        "Papel",
        "Tipo",
        "Valor ofertado",
        "Classificacao",
        "Status",
      ],
      detail.participacoes.map((row) => [
        safeText(row.numeroSirel),
        safeText(row.modalidade ?? "Nao informado"),
        safeText(row.papel),
        safeText(row.tipoParticipacao),
        safeText(formatCurrencyBRL(row.valorGlobalOfertado)),
        safeText(
          row.melhorClassificacao === null
            ? "-"
            : String(row.melhorClassificacao),
        ),
        safeText(row.statusFornecedor ?? "-"),
      ]),
      "Nenhuma participacao consolidada.",
    )}

    <h2>Ofertas, propostas e lances</h2>
    ${renderSimpleTable(
      [
        "Registro",
        "Processo",
        "Item",
        "Estimado",
        "Inicial",
        "Final",
        "Resultado",
      ],
      detail.ofertas.map((row) => [
        safeText(row.tipoRegistro),
        safeText(row.numeroSirel),
        safeText(row.itemLabel),
        safeText(formatCurrencyBRL(row.valorEstimado)),
        safeText(formatCurrencyBRL(row.valorOfertadoInicial)),
        safeText(formatCurrencyBRL(row.valorFinal)),
        safeText(row.resultado ?? "-"),
      ]),
      "Nenhuma oferta ou proposta registrada.",
    )}

    <h2>Processos vencedores</h2>
    ${renderSimpleTable(
      [
        "Processo",
        "Item",
        "Quantidade",
        "Valor vencedor",
        "Total vencido",
        "Data",
        "Status posterior",
      ],
      detail.vitorias.map((row) => [
        safeText(row.numeroSirel),
        safeText(row.itemLabel),
        safeText(`${formatNumberBR(row.quantidade, 3)} ${row.unidade}`),
        safeText(formatCurrencyBRL(row.valorVencedorUnitario)),
        safeText(formatCurrencyBRL(row.valorTotalVencido)),
        safeText(formatDateBR(row.dataResultado)),
        safeText(row.statusPosterior),
      ]),
      "Nenhuma vitoria consolidada.",
    )}

    <h2>Contratos vinculados</h2>
    ${renderSimpleTable(
      [
        "Contrato",
        "Origem",
        "Processo",
        "Valor total",
        "Valor atribuido",
        "Itens",
        "Status",
      ],
      detail.contratos.map((row) => [
        safeText(row.numeroContrato),
        safeText(row.origem),
        safeText(row.processoNumeroSirel ?? "-"),
        safeText(formatCurrencyBRL(row.valorTotalContrato)),
        safeText(formatCurrencyBRL(row.valorAtribuidoFornecedor)),
        safeText(formatNumberBR(row.totalItens, 0)),
        safeText(row.status),
      ]),
      "Nenhum contrato vinculado ao fornecedor.",
    )}

    <h2>Itens relacionados</h2>
    ${renderSimpleTable(
      [
        "Item",
        "Ofertado",
        "Vencido",
        "Menor preco",
        "Media",
        "Ultimo ofertado",
        "Participacao",
      ],
      detail.itens.map((row) => [
        safeText(row.itemLabel),
        safeText(formatNumberBR(row.ofertado, 0)),
        safeText(formatNumberBR(row.vencido, 0)),
        safeText(formatCurrencyBRL(row.menorPrecoOfertado)),
        safeText(formatCurrencyBRL(row.precoMedioOfertado)),
        safeText(formatCurrencyBRL(row.ultimoPrecoOfertado)),
        safeText(
          row.participacaoVitoriasFornecedor === null
            ? "-"
            : `${formatNumberBR(row.participacaoVitoriasFornecedor, 2)}%`,
        ),
      ]),
      "Nenhum item relacionado encontrado.",
    )}

    <h2>Linha do tempo</h2>
    ${renderSimpleTable(
      ["Data", "Tipo", "Titulo", "Descricao"],
      detail.timeline.map((row) => [
        safeText(formatDateBR(row.data, true)),
        safeText(row.tipo),
        safeText(row.titulo),
        safeText(row.descricao),
      ]),
      "Nenhum evento cronologico consolidado.",
    )}

    <h2>Auditoria</h2>
    <section class="grid">
      ${renderCards([
        {
          label: "Ultima atualizacao",
          value: formatDateBR(detail.auditoria.ultimaAtualizacaoCadastro, true),
        },
        {
          label: "Registro unificado",
          value: detail.identificacao.registroUnificado ? "Sim" : "Nao",
        },
        {
          label: "Observacoes criticas",
          value: detail.auditoria.observacoesCriticas.length
            ? detail.auditoria.observacoesCriticas.join(" | ")
            : "Sem observacoes",
        },
      ])}
    </section>
    ${renderSimpleTable(
      ["Data", "Acao", "Usuario", "Descricao", "Campos"],
      detail.auditoria.trilha.map((row) => [
        safeText(formatDateBR(row.criadoEm, true)),
        safeText(row.acao),
        safeText(row.usuario ?? "Sistema"),
        safeText(row.descricao ?? "Sem descricao"),
        safeText(
          row.camposAlterados.length
            ? row.camposAlterados.join(", ")
            : "Sem destaque",
        ),
      ]),
      "Nenhuma trilha de auditoria encontrada para o fornecedor.",
    )}
  `;
}

export { buildPrintableShell };

import type {
  DossieFornecedorDetail,
  DossieItemDetail,
} from "@sirel/shared/schemas/dossie";

import {
  formatCnpjBR,
  formatCurrencyBRL,
  formatNumberBR,
  formatShortDateBR,
  formatShortDateTimeBR,
} from "@/lib/formatters";
import {
  buildDossieFornecedorHtml,
  buildDossieItemHtml,
  openPrintableHtml,
} from "@/lib/print-documents";
import {
  exportReportToPdf,
  exportWorkbookToXlsx,
  type ReportColumn,
  type ReportSummaryItem,
  type WorkbookSheet,
} from "@/lib/report-export";

type ReportRow = Record<string, unknown>;

function slugify(value: string) {
  return (
    value
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "registro"
  );
}

function buildFilename(prefix: string, label: string, ext: "pdf" | "xlsx") {
  const stamp = new Date().toISOString().slice(0, 10);
  return `${prefix}-${slugify(label)}-${stamp}.${ext}`;
}

function buildDefaultColumns(): ReportColumn[] {
  return [
    { key: "secao", label: "Seção" },
    { key: "referencia", label: "Referência" },
    { key: "detalhe", label: "Detalhe" },
    { key: "contexto", label: "Contexto" },
    { key: "valorPrincipal", label: "Valor principal" },
    { key: "valorSecundario", label: "Valor secundário" },
    { key: "status", label: "Status" },
    { key: "observacoes", label: "Observações" },
  ];
}

function buildItemReport(detail: DossieItemDetail): {
  filenameBase: string;
  title: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  summary: ReportSummaryItem[];
} {
  const title = `Dossiê do item - ${detail.identificacao.descricaoResumida}`;
  const summary: ReportSummaryItem[] = [
    { label: "Item", value: detail.identificacao.descricaoResumida },
    { label: "Código interno", value: detail.identificacao.codigoInterno },
    { label: "Unidade", value: detail.identificacao.unidadeMedida },
    { label: "Processos", value: detail.resumo.totalProcessos.toLocaleString("pt-BR") },
    { label: "Licitações", value: detail.resumo.totalLicitacoes.toLocaleString("pt-BR") },
    { label: "Contratos", value: detail.resumo.totalContratos.toLocaleString("pt-BR") },
    { label: "Valor contratado", value: formatCurrencyBRL(detail.resumo.valorTotalContratado) },
    { label: "Fornecedores", value: detail.resumo.totalFornecedoresDistintos.toLocaleString("pt-BR") },
    {
      label: "Taxa de sucesso",
      value:
        detail.resumo.taxaSucessoMediaContratacao === null
          ? "–"
          : `${formatNumberBR(detail.resumo.taxaSucessoMediaContratacao, 2)}%`,
    },
  ];

  const rows: ReportRow[] = [
    ...detail.processos.map((row) => ({
      secao: "Processos",
      referencia: row.numeroSirel,
      detalhe: row.objetoProcesso,
      contexto: [row.secretaria, row.modalidade, row.numeroAdministrativo]
        .filter(Boolean)
        .join(" | "),
      valorPrincipal: `${formatNumberBR(row.quantidadePrevista, 3)} ${row.unidade}`,
      valorSecundario: `${formatCurrencyBRL(row.valorEstimado)} / ${formatCurrencyBRL(row.valorHomologado)}`,
      status: row.status ?? row.etapaAtual ?? "Em análise",
      observacoes: "Presença em processo",
    })),
    ...detail.licitacoes.map((row) => ({
      secao: "Licitações",
      referencia: row.numeroSirel,
      detalhe: `${row.loteNumero ? `Lote ${row.loteNumero}` : "Sem lote"} / Item ${row.itemNumero}`,
      contexto: row.fornecedorVencedor ?? "Sem vencedor",
      valorPrincipal: formatCurrencyBRL(row.valorEstimadoUnitario),
      valorSecundario: `${formatCurrencyBRL(row.melhorValorOfertado)} / ${formatCurrencyBRL(row.valorVencedor)}`,
      status: row.statusItem,
      observacoes:
        row.economiaPercentual === null
          ? formatCurrencyBRL(row.economiaAbsoluta)
          : `${formatCurrencyBRL(row.economiaAbsoluta)} (${formatNumberBR(row.economiaPercentual, 2)}%)`,
    })),
    ...detail.contratos.map((row) => ({
      secao: "Contratos",
      referencia: row.numeroContrato,
      detalhe: row.fornecedorNome,
      contexto: row.processoNumeroSirel,
      valorPrincipal: formatNumberBR(row.quantidadeContratada, 3),
      valorSecundario: `${formatCurrencyBRL(row.valorUnitario)} / ${formatCurrencyBRL(row.valorTotalItem)}`,
      status: row.status,
      observacoes: `Saldo ${formatNumberBR(row.saldoRemanescente, 3)}`,
    })),
    ...detail.fornecedores.map((row) => ({
      secao: "Fornecedores",
      referencia: row.fornecedorNome,
      detalhe: formatCnpjBR(row.documento),
      contexto: `${row.participacoes} participações / ${row.vitorias} vitórias`,
      valorPrincipal: formatCurrencyBRL(row.valorMedioOfertado),
      valorSecundario: `${formatCurrencyBRL(row.menorValorOfertado)} / ${formatCurrencyBRL(row.maiorValorOfertado)}`,
      status: row.taxaVitoria === null ? "–" : `${formatNumberBR(row.taxaVitoria, 2)}%`,
      observacoes: `Último vencedor ${formatCurrencyBRL(row.ultimoValorVencedor)}`,
    })),
    ...detail.evolucaoPrecos.map((row) => ({
      secao: "Preços",
      referencia: formatShortDateBR(row.data),
      detalhe: row.processoNumeroSirel ?? "Sem processo",
      contexto: [row.fornecedorNome, row.modalidade, row.secretaria]
        .filter(Boolean)
        .join(" | "),
      valorPrincipal: formatCurrencyBRL(row.valorEstimado),
      valorSecundario: `${formatCurrencyBRL(row.valorVencedor)} / ${formatCurrencyBRL(row.valorContratado)}`,
      status: row.modalidade ?? "Histórico",
      observacoes: row.secretaria ?? "",
    })),
    ...detail.auditoria.mudancasRelevantes.map((row) => ({
      secao: "Auditoria",
      referencia: formatShortDateTimeBR(row.criadoEm),
      detalhe: row.usuario ?? "Sistema",
      contexto: row.acao,
      valorPrincipal: row.camposAlterados.join(", "),
      valorSecundario: "",
      status: row.acao,
      observacoes: row.descricao ?? "",
    })),
  ];

  return {
    filenameBase: buildFilename("dossie-item", detail.identificacao.descricaoResumida, "pdf").replace(/\.pdf$/, ""),
    title,
    columns: buildDefaultColumns(),
    rows,
    summary,
  };
}

function buildFornecedorReport(detail: DossieFornecedorDetail): {
  filenameBase: string;
  title: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  summary: ReportSummaryItem[];
} {
  const title = `Dossiê do fornecedor - ${detail.identificacao.razaoSocial}`;
  const summary: ReportSummaryItem[] = [
    { label: "Fornecedor", value: detail.identificacao.razaoSocial },
    { label: "Documento", value: formatCnpjBR(detail.identificacao.documento) },
    { label: "Status", value: detail.identificacao.status },
    { label: "Processos", value: detail.resumo.totalProcessos.toLocaleString("pt-BR") },
    { label: "Licitações", value: detail.resumo.totalLicitacoes.toLocaleString("pt-BR") },
    { label: "Vitórias", value: detail.resumo.totalVitorias.toLocaleString("pt-BR") },
    {
      label: "Taxa de vitória",
      value:
        detail.resumo.taxaVitoria === null ? "–" : `${formatNumberBR(detail.resumo.taxaVitoria, 2)}%`,
    },
    { label: "Valor vencido", value: formatCurrencyBRL(detail.resumo.valorTotalVencido) },
    { label: "Valor contratado", value: formatCurrencyBRL(detail.resumo.valorTotalContratado) },
  ];

  const rows: ReportRow[] = [
    ...detail.participacoes.map((row) => ({
      secao: "Participações",
      referencia: row.numeroSirel,
      detalhe: row.objetoProcesso,
      contexto: [row.modalidade, row.papel, row.tipoParticipacao].filter(Boolean).join(" | "),
      valorPrincipal: formatCurrencyBRL(row.valorGlobalOfertado),
      valorSecundario: row.melhorClassificacao ?? "",
      status: row.statusFornecedor ?? "–",
      observacoes: "Participação consolidada",
    })),
    ...detail.ofertas.map((row) => ({
      secao: "Ofertas",
      referencia: row.numeroSirel,
      detalhe: row.itemLabel,
      contexto: row.tipoRegistro,
      valorPrincipal: formatCurrencyBRL(row.valorOfertadoInicial),
      valorSecundario: `${formatCurrencyBRL(row.valorFinal)} / ${formatCurrencyBRL(row.valorEstimado)}`,
      status: row.resultado ?? "–",
      observacoes:
        row.diferencaPercentualEstimado === null
          ? row.classificacao ?? ""
          : `${formatNumberBR(row.diferencaPercentualEstimado, 2)}%`,
    })),
    ...detail.vitorias.map((row) => ({
      secao: "Vitórias",
      referencia: row.numeroSirel,
      detalhe: row.itemLabel,
      contexto: `${formatNumberBR(row.quantidade, 3)} ${row.unidade}`,
      valorPrincipal: formatCurrencyBRL(row.valorVencedorUnitario),
      valorSecundario: formatCurrencyBRL(row.valorTotalVencido),
      status: row.statusPosterior,
      observacoes: formatShortDateBR(row.dataResultado),
    })),
    ...detail.contratos.map((row) => ({
      secao: "Contratos",
      referencia: row.numeroContrato,
      detalhe: row.processoNumeroSirel ?? "Sem processo interno",
      contexto: row.origem,
      valorPrincipal: formatCurrencyBRL(row.valorTotalContrato),
      valorSecundario: formatCurrencyBRL(row.valorAtribuidoFornecedor),
      status: row.status,
      observacoes: `${row.totalItens.toLocaleString("pt-BR")} itens`,
    })),
    ...detail.itens.map((row) => ({
      secao: "Itens",
      referencia: row.itemLabel,
      detalhe: `${row.ofertado} ofertado / ${row.vencido} vencido`,
      contexto: "",
      valorPrincipal: formatCurrencyBRL(row.precoMedioOfertado),
      valorSecundario: `${formatCurrencyBRL(row.menorPrecoOfertado)} / ${formatCurrencyBRL(row.ultimoPrecoOfertado)}`,
      status:
        row.participacaoVitoriasFornecedor === null
          ? "–"
          : `${formatNumberBR(row.participacaoVitoriasFornecedor, 2)}%`,
      observacoes: `Último vencedor ${formatCurrencyBRL(row.ultimoPrecoVencedor)}`,
    })),
    ...detail.timeline.map((row) => ({
      secao: "Timeline",
      referencia: formatShortDateTimeBR(row.data),
      detalhe: row.titulo,
      contexto: row.tipo,
      valorPrincipal: "",
      valorSecundario: "",
      status: row.tipo,
      observacoes: row.descricao,
    })),
    ...detail.auditoria.trilha.map((row) => ({
      secao: "Auditoria",
      referencia: formatShortDateTimeBR(row.criadoEm),
      detalhe: row.usuario ?? "Sistema",
      contexto: row.acao,
      valorPrincipal: row.camposAlterados.join(", "),
      valorSecundario: "",
      status: row.acao,
      observacoes: row.descricao ?? "",
    })),
  ];

  return {
    filenameBase: buildFilename("dossie-fornecedor", detail.identificacao.razaoSocial, "pdf").replace(/\.pdf$/, ""),
    title,
    columns: buildDefaultColumns(),
    rows,
    summary,
  };
}

function buildItemWorkbook(
  detail: DossieItemDetail,
): {
  filenameBase: string;
  title: string;
  summary: ReportSummaryItem[];
  sheets: WorkbookSheet[];
} {
  const report = buildItemReport(detail);

  return {
    filenameBase: report.filenameBase,
    title: report.title,
    summary: report.summary,
    sheets: [
      {
        name: "Processos",
        columns: [
          { key: "processo", label: "Processo" },
          { key: "objeto", label: "Objeto" },
          { key: "secretaria", label: "Secretaria" },
          { key: "modalidade", label: "Modalidade" },
          { key: "quantidade", label: "Quantidade" },
          { key: "estimado", label: "Estimado" },
          { key: "homologado", label: "Homologado" },
          { key: "status", label: "Status" },
        ],
        rows: detail.processos.map((row) => ({
          processo: row.numeroSirel,
          objeto: row.objetoProcesso,
          secretaria: row.secretaria,
          modalidade: row.modalidade ?? "",
          quantidade: `${formatNumberBR(row.quantidadePrevista, 3)} ${row.unidade}`,
          estimado: formatCurrencyBRL(row.valorEstimado),
          homologado: formatCurrencyBRL(row.valorHomologado),
          status: row.status ?? row.etapaAtual ?? "",
        })),
      },
      {
        name: "Licitacoes",
        columns: [
          { key: "processo", label: "Processo" },
          { key: "item", label: "Lote / Item" },
          { key: "criterio", label: "Critério" },
          { key: "vencedor", label: "Fornecedor vencedor" },
          { key: "estimado", label: "Estimado unitário" },
          { key: "melhorOferta", label: "Melhor oferta" },
          { key: "valorVencedor", label: "Valor vencedor" },
          { key: "status", label: "Status" },
        ],
        rows: detail.licitacoes.map((row) => ({
          processo: row.numeroSirel,
          item: `${row.loteNumero ? `Lote ${row.loteNumero}` : "Sem lote"} / Item ${row.itemNumero}`,
          criterio: row.criterioJulgamento ?? "",
          vencedor: row.fornecedorVencedor ?? "",
          estimado: formatCurrencyBRL(row.valorEstimadoUnitario),
          melhorOferta: formatCurrencyBRL(row.melhorValorOfertado),
          valorVencedor: formatCurrencyBRL(row.valorVencedor),
          status: row.statusItem,
        })),
      },
      {
        name: "Contratos",
        columns: [
          { key: "contrato", label: "Contrato" },
          { key: "fornecedor", label: "Fornecedor" },
          { key: "processo", label: "Processo" },
          { key: "quantidade", label: "Quantidade" },
          { key: "saldo", label: "Saldo" },
          { key: "valorUnitario", label: "Valor unitário" },
          { key: "valorTotal", label: "Valor total" },
          { key: "status", label: "Status" },
        ],
        rows: detail.contratos.map((row) => ({
          contrato: row.numeroContrato,
          fornecedor: row.fornecedorNome,
          processo: row.processoNumeroSirel,
          quantidade: formatNumberBR(row.quantidadeContratada, 3),
          saldo: formatNumberBR(row.saldoRemanescente, 3),
          valorUnitario: formatCurrencyBRL(row.valorUnitario),
          valorTotal: formatCurrencyBRL(row.valorTotalItem),
          status: row.status,
        })),
      },
      {
        name: "Fornecedores",
        columns: [
          { key: "fornecedor", label: "Fornecedor" },
          { key: "documento", label: "Documento" },
          { key: "participacoes", label: "Participações" },
          { key: "vitorias", label: "Vitórias" },
          { key: "media", label: "Média ofertada" },
          { key: "faixa", label: "Faixa ofertada" },
          { key: "ultimoVencedor", label: "Último valor vencedor" },
          { key: "taxa", label: "Taxa de vitória" },
        ],
        rows: detail.fornecedores.map((row) => ({
          fornecedor: row.fornecedorNome,
          documento: formatCnpjBR(row.documento),
          participacoes: row.participacoes,
          vitorias: row.vitorias,
          media: formatCurrencyBRL(row.valorMedioOfertado),
          faixa: `${formatCurrencyBRL(row.menorValorOfertado)} / ${formatCurrencyBRL(row.maiorValorOfertado)}`,
          ultimoVencedor: formatCurrencyBRL(row.ultimoValorVencedor),
          taxa:
            row.taxaVitoria === null
              ? "–"
              : `${formatNumberBR(row.taxaVitoria, 2)}%`,
        })),
      },
      {
        name: "Precos",
        columns: [
          { key: "data", label: "Data" },
          { key: "processo", label: "Processo" },
          { key: "fornecedor", label: "Fornecedor" },
          { key: "modalidade", label: "Modalidade" },
          { key: "secretaria", label: "Secretaria" },
          { key: "estimado", label: "Estimado" },
          { key: "vencedor", label: "Vencedor" },
          { key: "contratado", label: "Contratado" },
        ],
        rows: detail.evolucaoPrecos.map((row) => ({
          data: formatShortDateBR(row.data),
          processo: row.processoNumeroSirel ?? "",
          fornecedor: row.fornecedorNome ?? "",
          modalidade: row.modalidade ?? "",
          secretaria: row.secretaria ?? "",
          estimado: formatCurrencyBRL(row.valorEstimado),
          vencedor: formatCurrencyBRL(row.valorVencedor),
          contratado: formatCurrencyBRL(row.valorContratado),
        })),
      },
      {
        name: "Auditoria",
        columns: [
          { key: "data", label: "Data" },
          { key: "acao", label: "Ação" },
          { key: "usuario", label: "Usuário" },
          { key: "descricao", label: "Descrição" },
          { key: "campos", label: "Campos alterados" },
        ],
        rows: detail.auditoria.mudancasRelevantes.map((row) => ({
          data: formatShortDateTimeBR(row.criadoEm),
          acao: row.acao,
          usuario: row.usuario ?? "Sistema",
          descricao: row.descricao ?? "",
          campos: row.camposAlterados.join(", "),
        })),
      },
    ],
  };
}

function buildFornecedorWorkbook(
  detail: DossieFornecedorDetail,
): {
  filenameBase: string;
  title: string;
  summary: ReportSummaryItem[];
  sheets: WorkbookSheet[];
} {
  const report = buildFornecedorReport(detail);

  return {
    filenameBase: report.filenameBase,
    title: report.title,
    summary: report.summary,
    sheets: [
      {
        name: "Participacoes",
        columns: [
          { key: "processo", label: "Processo" },
          { key: "objeto", label: "Objeto" },
          { key: "modalidade", label: "Modalidade" },
          { key: "papel", label: "Papel" },
          { key: "tipo", label: "Tipo" },
          { key: "valor", label: "Valor ofertado" },
          { key: "classificacao", label: "Classificação" },
          { key: "status", label: "Status" },
        ],
        rows: detail.participacoes.map((row) => ({
          processo: row.numeroSirel,
          objeto: row.objetoProcesso,
          modalidade: row.modalidade ?? "",
          papel: row.papel,
          tipo: row.tipoParticipacao,
          valor: formatCurrencyBRL(row.valorGlobalOfertado),
          classificacao:
            row.melhorClassificacao === null
              ? ""
              : String(row.melhorClassificacao),
          status: row.statusFornecedor ?? "",
        })),
      },
      {
        name: "Ofertas",
        columns: [
          { key: "processo", label: "Processo" },
          { key: "item", label: "Item" },
          { key: "tipo", label: "Registro" },
          { key: "estimado", label: "Estimado" },
          { key: "inicial", label: "Inicial" },
          { key: "final", label: "Final" },
          { key: "resultado", label: "Resultado" },
          { key: "classificacao", label: "Classificação" },
        ],
        rows: detail.ofertas.map((row) => ({
          processo: row.numeroSirel,
          item: row.itemLabel,
          tipo: row.tipoRegistro,
          estimado: formatCurrencyBRL(row.valorEstimado),
          inicial: formatCurrencyBRL(row.valorOfertadoInicial),
          final: formatCurrencyBRL(row.valorFinal),
          resultado: row.resultado ?? "",
          classificacao:
            row.classificacao === null ? "" : String(row.classificacao),
        })),
      },
      {
        name: "Vitorias",
        columns: [
          { key: "processo", label: "Processo" },
          { key: "item", label: "Item" },
          { key: "quantidade", label: "Quantidade" },
          { key: "unitario", label: "Valor vencedor" },
          { key: "total", label: "Total vencido" },
          { key: "data", label: "Data" },
          { key: "status", label: "Status posterior" },
        ],
        rows: detail.vitorias.map((row) => ({
          processo: row.numeroSirel,
          item: row.itemLabel,
          quantidade: `${formatNumberBR(row.quantidade, 3)} ${row.unidade}`,
          unitario: formatCurrencyBRL(row.valorVencedorUnitario),
          total: formatCurrencyBRL(row.valorTotalVencido),
          data: formatShortDateBR(row.dataResultado),
          status: row.statusPosterior,
        })),
      },
      {
        name: "Contratos",
        columns: [
          { key: "contrato", label: "Contrato" },
          { key: "origem", label: "Origem" },
          { key: "processo", label: "Processo" },
          { key: "valorTotal", label: "Valor total" },
          { key: "valorAtribuido", label: "Valor atribuído" },
          { key: "itens", label: "Itens" },
          { key: "saldo", label: "Saldo" },
          { key: "status", label: "Status" },
        ],
        rows: detail.contratos.map((row) => ({
          contrato: row.numeroContrato,
          origem: row.origem,
          processo: row.processoNumeroSirel ?? "",
          valorTotal: formatCurrencyBRL(row.valorTotalContrato),
          valorAtribuido: formatCurrencyBRL(row.valorAtribuidoFornecedor),
          itens: row.totalItens,
          saldo: row.saldo === null ? "–" : formatNumberBR(row.saldo, 3),
          status: row.status,
        })),
      },
      {
        name: "Itens",
        columns: [
          { key: "item", label: "Item" },
          { key: "ofertado", label: "Ofertado" },
          { key: "vencido", label: "Vencido" },
          { key: "menor", label: "Menor preço" },
          { key: "medio", label: "Preço médio" },
          { key: "ultimo", label: "Último ofertado" },
          { key: "ultimoVencedor", label: "Último vencedor" },
          { key: "participacao", label: "Participação" },
        ],
        rows: detail.itens.map((row) => ({
          item: row.itemLabel,
          ofertado: row.ofertado,
          vencido: row.vencido,
          menor: formatCurrencyBRL(row.menorPrecoOfertado),
          medio: formatCurrencyBRL(row.precoMedioOfertado),
          ultimo: formatCurrencyBRL(row.ultimoPrecoOfertado),
          ultimoVencedor: formatCurrencyBRL(row.ultimoPrecoVencedor),
          participacao:
            row.participacaoVitoriasFornecedor === null
              ? "–"
              : `${formatNumberBR(row.participacaoVitoriasFornecedor, 2)}%`,
        })),
      },
      {
        name: "Timeline",
        columns: [
          { key: "data", label: "Data" },
          { key: "tipo", label: "Tipo" },
          { key: "titulo", label: "Título" },
          { key: "descricao", label: "Descrição" },
        ],
        rows: detail.timeline.map((row) => ({
          data: formatShortDateTimeBR(row.data),
          tipo: row.tipo,
          titulo: row.titulo,
          descricao: row.descricao,
        })),
      },
      {
        name: "Auditoria",
        columns: [
          { key: "data", label: "Data" },
          { key: "acao", label: "Ação" },
          { key: "usuario", label: "Usuário" },
          { key: "descricao", label: "Descrição" },
          { key: "campos", label: "Campos alterados" },
        ],
        rows: detail.auditoria.trilha.map((row) => ({
          data: formatShortDateTimeBR(row.criadoEm),
          acao: row.acao,
          usuario: row.usuario ?? "Sistema",
          descricao: row.descricao ?? "",
          campos: row.camposAlterados.join(", "),
        })),
      },
    ],
  };
}

export function printDossieItem(detail: DossieItemDetail, autoPrint = false) {
  openPrintableHtml({
    title: `Dossiê do item - ${detail.identificacao.descricaoResumida}`,
    bodyHtml: buildDossieItemHtml(detail),
    autoPrint,
  });
}

export function printDossieFornecedor(
  detail: DossieFornecedorDetail,
  autoPrint = false,
) {
  openPrintableHtml({
    title: `Dossiê do fornecedor - ${detail.identificacao.razaoSocial}`,
    bodyHtml: buildDossieFornecedorHtml(detail),
    autoPrint,
  });
}

export async function exportDossieItemToPdf(detail: DossieItemDetail) {
  const report = buildItemReport(detail);
  await exportReportToPdf(
    `${report.filenameBase}.pdf`,
    report.title,
    report.columns,
    report.rows,
    report.summary,
  );
}

export async function exportDossieItemToXlsx(detail: DossieItemDetail) {
  const workbook = buildItemWorkbook(detail);
  await exportWorkbookToXlsx(
    `${workbook.filenameBase}.xlsx`,
    workbook.title,
    workbook.sheets,
    workbook.summary,
  );
}

export async function exportDossieFornecedorToPdf(detail: DossieFornecedorDetail) {
  const report = buildFornecedorReport(detail);
  await exportReportToPdf(
    `${report.filenameBase}.pdf`,
    report.title,
    report.columns,
    report.rows,
    report.summary,
  );
}

export async function exportDossieFornecedorToXlsx(
  detail: DossieFornecedorDetail,
) {
  const workbook = buildFornecedorWorkbook(detail);
  await exportWorkbookToXlsx(
    `${workbook.filenameBase}.xlsx`,
    workbook.title,
    workbook.sheets,
    workbook.summary,
  );
}

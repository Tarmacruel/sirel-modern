# Relatórios de Ata de Sessão

## Objetivo
Processar atas de sessão de Pregão Eletrônico ou Dispensa em PDF textual e gerar:

- `Ata_Institucional_Completa.pdf`
- `Relatorio_EmAndamento.pdf`
- `Relatorio_EmAndamento.xlsx`
- `Relatorio_Adjudicados.pdf`
- `Relatorio_Adjudicados.xlsx`
- `Relatorio_FaseRecursal.pdf`
- `Relatorio_FaseRecursal.xlsx`
- `Relatorio_MalSucedidos.pdf`
- `Relatorio_MalSucedidos.xlsx`

## Arquitetura
- `scripts/ata_sessao_reports/`: parser Python, geração de Excel e testes.
- `server/src/lib/ata-sessao-reports.ts`: integração nativa com o backend do SIREL e geração dos PDFs no padrão institucional.
- `server/src/routers/relatorios.ts`: mutation tRPC `processAtaSessao`.
- `server/src/scripts/generate-ata-sessao-reports.ts`: execução via linha de comando.

## Dependências Python
Instalar quando necessário:

```bash
py -3.12 -m pip install -r scripts/requirements-ata-sessao.txt
```

## Execução via CLI
```bash
npm run ata-sessao:process -- --input "caminho/do/arquivo.pdf"
```

Opcionalmente:

```bash
npm run ata-sessao:process -- --input "caminho/do/arquivo.pdf" --output-dir "storage/reports/minha-saida"
```

Para forçar o enriquecimento por um processo interno específico:

```bash
npm run ata-sessao:process -- --input "caminho/do/arquivo.pdf" --processo-id 123
```

## Execução via backend
Procedure tRPC:
- `relatorios.processAtaSessao`

Input aceito:
```ts
{
  sourcePath?: string;
  documentoId?: number;
  outputDir?: string;
}
```

Regras:
- é obrigatório informar `sourcePath` ou `documentoId`;
- `documentoId` usa o documento já cadastrado no SIREL como origem do PDF;
- `outputDir` é opcional; sem ele, o sistema gera uma pasta carimbada em `storage/reports/atas-sessao/`.

## Saída
A mutation e o script retornam:
- arquivo de origem;
- diretório de saída;
- sumário de lotes em andamento, adjudicados, fase recursal e malsucedidos;
- lista de artefatos gerados.

O artefato `Ata_Institucional_Completa.pdf` consolida a ata em aparência institucional, reorganizada por lote, com metadados, resumo geral, itens, participantes, movimentos e anexo técnico quando houver warnings ou erros de parsing.

Quando a ata possui lotes malsucedidos e a BLL não exibe o valor estimado, o backend tenta enriquecer a saída com os valores já registrados no SIREL. A prioridade é: valores consolidados do dossiê por item, valores base do item do processo e, por fim, valor estimado do lote. Em processamento avulso, o processo é sugerido pelos identificadores extraídos da ata; quando a correspondência não é perfeita, o relatório mostra a fonte e a confiança do valor estimado.

## Logs e tolerância a falhas
- warnings: `warnings.log`
- blocos com falha de parsing: `erros_parsing.log`

O parser continua o processamento mesmo quando encontra:
- lotes sem tabela;
- lotes sem participantes;
- campos monetários inválidos;
- quebras de linha em razão social;
- blocos incompletos por quebra de página.

## Testes
```bash
py -3.12 -m unittest scripts.tests.test_ata_sessao_reports
```

## Observações de integração
- Os PDFs são gerados no backend com `pdfkit`, seguindo o padrão institucional já usado no SIREL.
- Os arquivos Excel são gerados em Python com `pandas` + `openpyxl`.
- O parser foi validado com o modelo real `ATA DE SESSÃO.pdf` fornecido.

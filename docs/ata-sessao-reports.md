# Relatórios de Ata de Sessão

## Objetivo

Processar atas de sessão de Pregão Eletrônico ou Dispensa em PDF textual e, quando fornecida uma Solicitação de Despesa (SD), conciliar os valores estimados dos lotes fracassados, desertos e cancelados antes de gerar:

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
npm run ata-sessao:process -- --input "caminho/da/ata.pdf" --sd-input "caminho/da/sd.pdf"
```

Opcionalmente:

```bash
npm run ata-sessao:process -- --input "caminho/da/ata.pdf" --sd-input "caminho/da/sd.pdf" --output-dir "storage/reports/minha-saida"
```

Para comparar os valores da SD com um processo interno específico:

```bash
npm run ata-sessao:process -- --input "caminho/da/ata.pdf" --sd-input "caminho/da/sd.pdf" --processo-id 123
```

`--sd-input` é opcional para manter compatibilidade com consumidores internos do serviço. Informe-o para que lotes malsucedidos recebam os valores estimados da SD; no processamento avulso da Central de Documentos, a SD é obrigatória.

## Execução via backend

Endpoint multipart usado pela Central de Documentos:

- `POST /api/relatorios/ata-sessao/processar`
- campo `arquivo`: PDF da Ata BLL, obrigatório;
- campo `sdArquivo`: PDF da Solicitação de Despesa, obrigatório.

Arquivos ausentes ou que não sejam PDF retornam `400`. PDFs sem camada de texto/OCR ou com estrutura de Ata/SD não reconhecida retornam `422`.
Em caso de sucesso, a resposta inclui `originalFileName`, `originalSdFileName` e a cobertura em `estimatedValueReconciliation`.
Os dois PDFs do upload avulso são temporários e removidos ao fim da requisição; somente os relatórios gerados são mantidos para download.

Procedure tRPC:

- `relatorios.processAtaSessao`

Input aceito:

```ts
{
  sourcePath?: string;
  sdSourcePath?: string;
  documentoId?: number;
  outputDir?: string;
}
```

Regras:

- é obrigatório informar `sourcePath` ou `documentoId`;
- `sdSourcePath` aponta para o PDF da SD usado na conciliação e permanece opcional para consumidores internos existentes;
- `documentoId` usa o documento já cadastrado no SIREL como origem do PDF;
- `outputDir` é opcional; sem ele, o sistema gera uma pasta carimbada em `storage/reports/atas-sessao/`.

## Saída

A mutation e o script retornam:

- arquivo de origem;
- diretório de saída;
- sumário de lotes em andamento, adjudicados, fase recursal e malsucedidos;
- cobertura da conciliação em `estimatedValueReconciliation`, ou `null` quando não houver SD;
- lista de artefatos gerados.

`estimatedValueReconciliation` possui a fonte (`SD`), número da SD, totais de lotes e itens conciliados, lotes parcialmente conciliados, listas numéricas de lotes ambíguos/não encontrados e warnings de conciliação.

O artefato `Ata_Institucional_Completa.pdf` consolida a ata em aparência institucional, reorganizada por lote, com metadados, resumo geral, itens, participantes, movimentos e anexo técnico quando houver warnings ou erros de parsing.

Quando a ata possui lotes malsucedidos e a BLL não exibe o valor estimado, a SD informada é a fonte oficial dos valores. O resultado identifica a SD, informa totais conciliados, parciais, ambíguos e não encontrados e inclui warnings para os lotes afetados. Esses warnings e os detalhes técnicos da correspondência são exibidos na tela do sistema e preservados nos artefatos de auditoria, mas não são renderizados no PDF. A geração continua quando a cobertura é parcial; correspondências inseguras permanecem sem valor.

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
py -3.12 -m pytest scripts/tests/test_ata_sessao_reports.py scripts/tests/test_sd_parser.py scripts/tests/test_sd_reconciliation.py scripts/tests/test_ata_sd_cli.py
```

## Observações de integração

- Os PDFs são gerados em Python com `ReportLab`, seguindo o padrão institucional já usado no SIREL.
- Os arquivos Excel são gerados em Python com `pandas` + `openpyxl`.
- O parser foi validado com o modelo real `ATA DE SESSÃO.pdf` fornecido.

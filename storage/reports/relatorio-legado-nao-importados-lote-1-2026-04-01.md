# Relat?rio de Linhas Legado N?o Importadas

- Lote: #1 (Exporta.xlsx / aba Exporta)
- Data do relat?rio: 01/04/2026
- Linhas aprovadas que permaneceram sem importa??o: 763

## Resumo por motivo

- DUPLICIDADE_PROCESSO_INTERNO: 503
- SECRETARIA_SEM_CORRESPONDENCIA: 248
- OBJETO_INCOMPLETO: 12

## Leitura operacional

- 503 linha(s) n?o entraram porque j? existe processo interno no SIREL com o mesmo n?mero administrativo ou n?mero de edital.
- 248 linha(s) n?o entraram porque a secretaria saneada n?o encontrou correspond?ncia no cadastro interno.
- 12 linha(s) n?o entraram porque o objeto ficou curto ou incompleto demais para criar o processo com seguran?a.

## Arquivo detalhado

- CSV completo: `C:\BD_Licitação\Versões SIREL\sirel-modern\storage\reports\relatorio-legado-nao-importados-lote-1-2026-04-01.csv`

## Detalhamento adicional

- Duplicidade com processo interno j? existente:
  - 353 linhas colidiram com processos j? marcados como `LEGADO`
  - 150 linhas colidiram com processos de origem `MANUAL`
- Secretaria sem correspond?ncia:
  - 248 linhas est?o com secretaria vazia no dado saneado/final (`(vazia)`), por isso n?o entraram
- Objeto incompleto:
  - 12 linhas ficaram sem objeto suficiente para cadastro autom?tico
  - Linhas: 795, 2092, 2531, 2556, 2558, 2643, 2655, 2742, 2788, 2808, 2815, 2833

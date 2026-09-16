# Disputa da licitação — revisão de interface

## Mudança

A Disputa passa a usar a mesma área de trabalho da Preparação e da Publicação, com cabeçalho compacto, etapas recolhidas e ações gerais em **Mais ações**.

- **Documentos:** lista com filtros e um editor por vez. A ata obrigatória fica distinta dos documentos opcionais da plataforma. O envio da ata continua abrindo a prévia antes da aplicação dos dados ao processo.
- **Licitantes:** seleção do fornecedor, inclusão e retirada junto à tabela de participantes.
- **Propostas:** cadastro por licitante e item, valores, classificação, situação e paginação.
- **Lances:** registro da oferta, identificação do item e do licitante da proposta vinculada, data, usuário e observação.

As abas operacionais respeitam a modalidade e a existência de lances. Na contratação direta, participantes e propostas continuam disponíveis no Julgamento. A data da sessão aparece junto ao título da Disputa. Os resumos, alertas repetidos e a coluna lateral de contexto saem dessa fase.

O rodapé reúne a situação dos requisitos e o avanço para a fase seguinte. As regras e pendências continuam vindo do servidor. Os formulários de proposta e lance permanecem em modal; arquivo e título ainda não enviados são preservados durante a navegação entre abas. No celular, documentos usam navegação de lista e detalhe, enquanto as tabelas têm rolagem horizontal própria.

Foi corrigida a inicialização da fase pela URL: a página aguarda o fluxo do processo antes de persistir a seleção inicial. Isso impede que o carregamento da configuração de fases invertidas substitua uma abertura direta da Disputa pela Preparação.

## Validação — 16/09/2026

- Build completo de shared, servidor e frontend; permanece o aviso existente de bundles maiores que 500 kB.
- Suíte do frontend: 110 testes aprovados, incluindo navegação por teclado, preservação de rascunhos e remoção condicional da aba Lances.
- Smoke da Preparação e da Publicação para verificar o componente compartilhado e a navegação de fases.
- Smoke da Disputa em Microsoft Edge, tema escuro, desktop 1440 × 1000 e celular 390 × 844.
- Cadastro de licitante, proposta e lance com conferência dos dados enviados; retirada de licitante; paginação com 17 registros; identificação da proposta na tabela de lances.
- Preservação de arquivo e título entre abas, retorno e foco no celular, ausência de transbordamento da página e rolagem interna das tabelas.
- Upload da ata, abertura da prévia sem aplicação automática, aplicação explícita e liberação do avanço sem exigir o documento opcional.
- Cenários de fases invertidas, modalidade sem lances e contratação direta, usando o avaliador de fluxo real.

Os testes de navegador interceptam todas as APIs e gravações com dados fictícios. Não consultam nem alteram processos reais; a leitura e a aplicação da ata são simuladas, sem executar o processamento real de PDF. Não há alteração de schema, migração ou código do backend nesta entrega.

```powershell
npm run build
npm run test --workspace client
node --import tsx scripts/testing/preparation-ui-smoke.mjs
node --import tsx scripts/testing/publication-ui-smoke.mjs
node --import tsx scripts/testing/dispute-ui-smoke.mjs
node --import tsx scripts/testing/dispute-ui-smoke.mjs --published
```

Capturas e resultados ficam em `output/playwright/dispute-ui/` e `output/playwright/dispute-ui-published/`, ignorados pelo Git.

## Ambiente público

O ambiente público continua servindo esta pasta pelo Vite em `5173`, backend em `3030` e Tunnel existente. O smoke com `--published` passou usando os arquivos servidos por `https://www.sirel.com.br`, sem erros de execução ou acessos não interceptados à API. A telemetria injetada pelo Cloudflare é bloqueada nesse teste.

Na conferência de 16/09, `/api/trpc/health.ping` no domínio público e `/healthz` local responderam HTTP 200 com `ok: true`. Não foi necessário reiniciar os serviços. A entrega é registrada na branch `fase-2-seguranca-evolucoes`. A reversão consiste em reverter o commit da interface e reconstruir, sem rollback de banco.

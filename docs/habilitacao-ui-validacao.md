# Habilitação — revisão visual e organizacional

## Interface

A Habilitação usa a área de trabalho compartilhada com Preparação, Publicação e Disputa. O cabeçalho é compacto, as etapas ficam recolhidas e as ações gerais continuam em **Mais ações**.

- **Documentos:** lista com filtros e um editor por vez, preservando envio, consulta e tratamento documental existentes.
- **Licitantes:** tabela com situação e observação de cada participante, filtros Todos/Pendentes/Habilitados/Inabilitados, paginação e ação **Revisar** em cada linha.
- O cadastro de licitantes fica em uma seção recolhida da mesma aba, permitindo iniciar a análise nos processos com habilitação antes da disputa.
- A revisão abre os dados atuais do participante. Trocar o licitante carrega sua própria situação e observação. Cancelar não grava; uma falha de salvamento mantém os campos e mostra o erro no formulário.
- O rodapé aponta documentos e análise pendentes e apresenta a próxima etapa segundo a ordem do processo. Ao consultar uma fase já ultrapassada, a ação abre a próxima etapa sem alterar o status do processo.

O progresso considera documentos e análise. A conclusão favorável e os bloqueios seguem o avaliador de fluxo existente; não foi criada uma regra de aprovação de todos os participantes. No celular, os documentos usam lista e detalhe, com retorno de foco, e a tabela tem rolagem horizontal interna.

## Verificação — 18/09/2026

Build completo e 110 testes do frontend aprovados na cópia isolada da entrega. Os roteiros de Preparação, Publicação, Disputa e Habilitação passaram nessa cópia. A árvore local, incluindo as alterações anteriores, passou em seus 118 testes do frontend e no roteiro de Habilitação. O teste de Habilitação também passou no domínio público, com dados simulados. Permanece o aviso já existente de bundles maiores que 500 kB.

O roteiro usa Microsoft Edge em 1440 × 1000 e 390 × 844, tema escuro, e cobre:

- revisão dos dados por licitante, troca de participante, cancelamento, falha e nova tentativa;
- envio correto de situação e observação, resultado desfavorável mantendo o bloqueio e resultado favorável ainda exigindo o documento;
- preservação de arquivo e título durante a navegação e as atualizações de dados;
- upload, liberação do avanço e consulta de fase concluída;
- filtros e paginação com 17 licitantes;
- fases invertidas com cadastro de participante antes da disputa, contratação direta e modo orientativo;
- navegação por teclado, foco no retorno da lista e ausência de transbordamento horizontal da página no celular.

Todas as APIs e gravações dos testes de navegador são interceptadas e usam dados fictícios. O avaliador de fluxo é o código real do servidor. Esses testes não alteram processos reais nem verificam gravações em banco.

```powershell
npm run build
npm run test --workspace client
node --import tsx scripts/testing/qualification-ui-smoke.mjs
node --import tsx scripts/testing/qualification-ui-smoke.mjs --published
```

As capturas e os resultados ficam em `output/playwright/qualification-ui/` e `output/playwright/qualification-ui-published/`.

## Escopo da entrega

Havia alterações locais de Julgamento, auditoria e formatação antes desta tarefa. Elas foram preservadas. O commit da Habilitação foi preparado separadamente e conferido em uma cópia do conteúdo a ser registrado, em `output/habilitacao-release/`, sem incorporar essas alterações anteriores. Essa cópia e os registros de conferência são ignorados pelo Git.

O ambiente público continua usando o Vite, backend e Tunnel existentes. A interface da Habilitação foi conferida em `https://www.sirel.com.br` com as APIs interceptadas. Não há migração, mudança de schema ou alteração de backend nesta entrega.

Na checagem final, a API estava sem escutar em `3030` e o log registrava encerramento por esgotamento do heap do Node. O watcher existente recebeu uma recarga por atualização da data do arquivo de entrada, sem mudança de conteúdo. Após a recuperação, os endpoints de saúde local e público responderam HTTP 200 com `ok: true`; os registros locais de PID foram atualizados. Essa recuperação não corrige a causa do crescimento de memória, que permanece fora do escopo da revisão visual. O inicializador que executa migrations e seed não foi usado.

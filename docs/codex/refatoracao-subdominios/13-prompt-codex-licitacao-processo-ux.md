# 13 — Prompt Codex: UX guiada da página do processo licitatório

## Prompt principal

```txt
Leia antes de implementar:

- docs/codex/refatoracao-subdominios/09-registro-implementacao-operacao-local.md
- docs/codex/refatoracao-subdominios/12-licitacao-processo-ux-guiado.md
- client/src/pages/licitacao-processo-page.tsx
- client/src/components/licitacao/*
- client/src/lib/licitacao-phase-config.ts
- shared/src/const.ts

Objetivo:
Refatorar a página de edição e gerenciamento do processo licitatório em `/licitacao/:processoId?fase=PREPARACAO` para uma experiência mais simples, guiada e operacional, sem alterar regras de negócio.

Contexto:
A página atual já tem boa base funcional: fluxo linear, checklist interno, parser de SD, publicação, licitantes, propostas, lances, julgamento, habilitação, recursos, homologação, documentos, auditoria e histórico. O problema é que há excesso de contexto visual simultâneo. O usuário precisa entender mais rápido qual etapa está ativa, quais pendências bloqueiam e qual é a próxima ação.

Escopo obrigatório:

1. Não reescrever a página do zero.
2. Não alterar endpoints, mutations, schema de banco ou regras de prazo legal.
3. Extrair componentes visuais e view model para reduzir complexidade do JSX.
4. Trocar a apresentação atual por um fluxo orientado a etapa ativa.
5. Manter compatibilidade com `?fase=PREPARACAO`, `?fase=PUBLICACAO`, `?fase=DISPUTA`, `?fase=JULGAMENTO_HABILITACAO`, `?fase=RECURSOS_HOMOLOGACAO` e `?fase=FECHAMENTO`.
6. Preservar deep link `/licitacao/:processoId`.
7. Preservar todos os fluxos existentes de upload, checklist, parser de SD, publicação, julgamento, habilitação, recursos, homologação, documentos, auditoria e histórico.

Arquivos recomendados para criar:

- client/src/components/licitacao/processo/licitacao-process-header.tsx
- client/src/components/licitacao/processo/licitacao-phase-stepper.tsx
- client/src/components/licitacao/processo/licitacao-next-action-card.tsx
- client/src/components/licitacao/processo/licitacao-context-assistant.tsx
- client/src/components/licitacao/processo/licitacao-audit-drawer.tsx
- client/src/lib/licitacao-processo-view-model.ts

Criar workspaces por fase apenas se a extração couber com segurança nesta etapa. Caso contrário, apenas preparar a arquitetura e migrar a fase `PREPARACAO` primeiro.

UX alvo:

1. Cabeçalho compacto do processo:
   - número do processo;
   - modalidade;
   - secretaria;
   - fase atual;
   - responsável;
   - pendências abertas;
   - ações secundárias: Dossiê, Documentos, Histórico, Voltar à fila.

2. Stepper compacto:
   - Preparação;
   - Publicação;
   - Disputa;
   - Julgamento/Habilitação;
   - Recursos/Homologação;
   - Fechamento.

3. Card de próxima ação:
   - título curto;
   - explicação objetiva;
   - botão principal;
   - indicação se está bloqueado e por quê.

4. Área de trabalho:
   - mostrar apenas a fase ativa como conteúdo principal;
   - na fase `PREPARACAO`, priorizar checklist interno e parser/vinculação de SD;
   - deixar visão geral como detalhe recolhido, não como primeira leitura.

5. Assistente contextual lateral:
   - etapa selecionada;
   - bloqueios legais;
   - dica operacional curta;
   - remover excesso de contexto permanente.

6. Auditoria fora do fluxo:
   - substituir barra grande por faixa compacta;
   - abrir drawer/modal para informar justificativa;
   - preservar persistência local e validação antes das ações críticas.

Componentização mínima esperada:

- `LicitacaoProcessHeader`
- `LicitacaoPhaseStepper`
- `LicitacaoNextActionCard`
- `LicitacaoContextAssistant`
- `LicitacaoAuditDrawer` ou `LicitacaoAuditNotice`
- `buildLicitacaoProcessoViewModel`

Regras de implementação:

1. Preserve nomes de mutations e queries existentes.
2. Preserve os estados funcionais enquanto extrai componentes.
3. Evite mover lógica crítica para componentes filhos sem tipagem clara.
4. Não transformar tudo em props gigantes sem view model intermediário.
5. Se uma extração ficar arriscada, deixe a lógica no pai e extraia apenas a apresentação.
6. Não remover testes existentes.
7. Criar testes para o view model quando possível.
8. Garantir que o layout continue funcional em desktop e mobile.

Atenção especial à fase PREPARACAO:

- deve abrir com foco em checklist interno;
- deve destacar a próxima pendência;
- deve manter parser SD acessível, mas não dominar a tela quando não houver arquivo selecionado;
- deve exibir progresso do checklist de modo compacto;
- deve permitir anexar documento e marcar item não aplicável/fora do fluxo sem mudar regra atual.

Testes obrigatórios:

- npm run check
- npm run test:all
- npm run build

Testes manuais mínimos:

1. Abrir `/licitacao/2572?fase=PREPARACAO`.
2. Confirmar que a tela abre na fase Preparação.
3. Confirmar que a próxima ação fica evidente sem rolagem longa.
4. Confirmar que checklist interno permanece funcional.
5. Confirmar que parser de SD ainda processa e vincula itens.
6. Confirmar que a publicação ainda calcula prazos e salva cronograma.
7. Confirmar que mudança de fase pelo stepper preserva `sessionStorage`/query conforme comportamento atual.
8. Confirmar que processo fora do fluxo exige justificativa antes de ação crítica.
9. Confirmar que Dossiê, Documentos e Voltar à fila continuam funcionando.
10. Confirmar responsividade em largura mobile.

Entregue no final:

- resumo dos componentes criados;
- resumo do que foi simplificado visualmente;
- trechos de lógica preservada;
- comandos executados;
- riscos remanescentes;
- próximos passos para refatorar as demais fases, se a implementação inicial focar em PREPARACAO.
```

## Prompt de revisão

```txt
Revise a refatoração UX da página `client/src/pages/licitacao-processo-page.tsx`.

Verifique:

1. se não houve alteração indevida em regra de negócio;
2. se a página ainda abre com `?fase=PREPARACAO`;
3. se o usuário identifica a próxima ação sem precisar interpretar muitos blocos;
4. se checklist, parser SD e upload continuam funcionais;
5. se publicação, disputa, julgamento, habilitação, recursos e homologação continuam acessíveis;
6. se o bloco de auditoria fora do fluxo ficou mais leve sem perder validação;
7. se os componentes extraídos têm props tipadas e não duplicam lógica;
8. se o view model é testável;
9. se desktop e mobile continuam utilizáveis;
10. se `npm run check`, `npm run test:all` e `npm run build` passam.

Se encontrar regressão, corrija dentro do mesmo escopo.
```

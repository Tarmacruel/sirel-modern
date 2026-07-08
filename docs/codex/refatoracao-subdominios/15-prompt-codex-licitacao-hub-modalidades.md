# 15 — Prompt Codex: Hub de modalidades da Licitação

## Prompt principal

```txt
Leia antes de implementar:

- docs/codex/refatoracao-subdominios/09-registro-implementacao-operacao-local.md
- docs/codex/refatoracao-subdominios/14-licitacao-hub-modalidades.md
- client/src/pages/licitacao-page.tsx
- shared/src/const.ts
- shared/src/schemas/licitacao.ts
- server/src/routers/licitacao.ts

Objetivo:
Transformar a primeira tela do subsistema de Licitação (`/licitacao`) em um Hub compacto por modalidade/equipe de trabalho. A listagem geral não deve ser a primeira leitura. O usuário deve escolher primeiro a área de trabalho: credenciamentos, dispensas, inexigibilidades, pregões, concorrências ou atas/adesões.

Problema atual:
`client/src/pages/licitacao-page.tsx` abre com PageIntro, métricas gerais, filtros e tabela de todos os processos. A equipe de licitação atua em grupos separados por modalidade, então a primeira tela precisa filtrar a intenção operacional antes de exibir a fila.

Requisitos funcionais:

1. `/licitacao` deve abrir um Hub compacto de modalidades.
2. O Hub deve usar cards clicáveis, com ícones, nome curto e contador.
3. Cards obrigatórios:
   - Credenciamentos;
   - Dispensas;
   - Inexigibilidades;
   - Pregões;
   - Concorrências;
   - Atas e adesões;
   - Todos os processos.
4. Clicar em um card deve abrir a fila filtrada daquela área.
5. A fila filtrada deve permitir voltar ao Hub por botão claro: `Trocar modalidade` ou `Voltar às modalidades`.
6. A listagem atual deve continuar funcional, mas não deve ser a tela inicial padrão.
7. Os filtros secundários devem continuar disponíveis, porém com menor destaque visual.
8. O texto da tela inicial deve ser mínimo.
9. A navegação deve ser orientada por objetos e ícones.

Rotas/query recomendadas:

Manter `/licitacao` como Hub.

Usar query string para a área filtrada:

- `/licitacao?hub=0&workspace=credenciamentos`
- `/licitacao?hub=0&workspace=dispensas`
- `/licitacao?hub=0&workspace=inexigibilidades`
- `/licitacao?hub=0&workspace=pregoes`
- `/licitacao?hub=0&workspace=concorrencias`
- `/licitacao?hub=0&workspace=atas-adesoes`
- `/licitacao?hub=0&workspace=todos`

Essa abordagem evita mexer no registry principal de rotas.

Arquivos recomendados:

Criar:

- client/src/components/licitacao/licitacao-workspace-hub.tsx
- client/src/components/licitacao/licitacao-process-list.tsx
- client/src/lib/licitacao-workspaces.ts

Alterar:

- client/src/pages/licitacao-page.tsx
- shared/src/schemas/licitacao.ts, somente se necessário para novo filtro
- server/src/routers/licitacao.ts, somente se necessário para o filtro de atas/adesões ou resumo agregado

Definição recomendada de workspaces:

```ts
export type LicitacaoWorkspaceKey =
  | "credenciamentos"
  | "dispensas"
  | "inexigibilidades"
  | "pregoes"
  | "concorrencias"
  | "atas-adesoes"
  | "todos";
```

Mapeamento mínimo:

- `credenciamentos` => `modalidadeGrupo: "CREDENCIAMENTO"`
- `dispensas` => `modalidadeGrupo: "DISPENSA"`
- `inexigibilidades` => `modalidadeGrupo: "INEXIGIBILIDADE"`
- `pregoes` => `modalidadeGrupo: "PREGAO"`
- `concorrencias` => `modalidadeGrupo: "CONCORRENCIA"`
- `todos` => sem filtro de modalidade
- `atas-adesoes` => filtro especial a validar conforme dados existentes

Atenção para `atas-adesoes`:

Não criar heurística frágil sem validar o modelo. Se não houver campo claro no banco, implementar o card e a navegação, mas deixar o filtro especial isolado para evolução posterior. Preferir `workspace=atas-adesoes` e exibir estado vazio controlado ou filtro por `OUTROS` apenas se isso for coerente com dados reais.

UX obrigatória:

1. Hub com pouco texto:
   - título: `Escolha a fila de trabalho`;
   - subtítulo curto: `Filtre a licitação por modalidade.` ou similar.
2. Cards em grid compacto.
3. Cada card deve ter:
   - ícone;
   - nome curto;
   - contador;
   - subtítulo de até 3 ou 4 palavras.
4. Não usar parágrafos longos na primeira tela.
5. Evitar repetir informações que o shell já mostra.
6. A tela filtrada deve mostrar chip da modalidade ativa.
7. O botão de voltar ao Hub deve ficar visível no topo da listagem filtrada.

Resumo visual esperado:

```txt
Licitação
Escolha a fila de trabalho

[Credenciamentos] [Dispensas] [Inexigibilidades]
[Pregões] [Concorrências] [Atas e adesões]
[Todos]
```

Critérios técnicos:

1. Preservar `trpc.licitacao.list`.
2. Preservar paginação.
3. Preservar busca, status, secretaria, obras/serviços de engenharia e pageSize.
4. Não quebrar o painel lateral de detalhe da linha.
5. Não alterar a página `/licitacao/:processoId`.
6. Não alterar regras de negócio.
7. Criar testes para resolver workspace/query/filtro se possível.

Testes obrigatórios:

- npm run check
- npm run test:all
- npm run build

Testes manuais mínimos:

1. Abrir `/licitacao` e confirmar que aparece o Hub, não a tabela.
2. Clicar em `Dispensas` e confirmar filtro `DISPENSA`.
3. Clicar em `Inexigibilidades` e confirmar filtro `INEXIGIBILIDADE`.
4. Clicar em `Credenciamentos` e confirmar filtro `CREDENCIAMENTO`.
5. Clicar em `Pregões` e confirmar filtro `PREGAO`.
6. Clicar em `Concorrências` e confirmar filtro `CONCORRENCIA`.
7. Clicar em `Todos` e confirmar listagem sem filtro de modalidade.
8. Testar `Voltar às modalidades`.
9. Confirmar que busca textual e status ainda funcionam dentro da fila filtrada.
10. Confirmar responsividade mobile.

Entregue no final:

- componentes criados;
- como o workspace é resolvido pela query string;
- como cada card mapeia para o filtro;
- como ficou tratado `atas-adesoes`;
- comandos executados;
- limitações remanescentes.
```

## Prompt de revisão

```txt
Revise a implementação do Hub de modalidades da Licitação.

Verifique:

1. se `/licitacao` abre o Hub de modalidades;
2. se a listagem só aparece depois da escolha de uma área ou com `workspace=todos`;
3. se cada card aplica o filtro correto;
4. se `Atas e adesões` não usa filtro frágil sem base nos dados;
5. se a listagem atual, paginação e painel lateral continuam funcionais;
6. se os filtros secundários continuam operando;
7. se o texto da tela inicial ficou curto;
8. se os cards são compactos, clicáveis e orientados por ícones;
9. se mobile continua utilizável;
10. se `npm run check`, `npm run test:all` e `npm run build` passam.

Corrija apenas regressões dentro deste escopo.
```

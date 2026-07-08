# 06 — Plano de execução por etapas

## Visão geral

Executar a refatoração em etapas pequenas, verificáveis e com baixo risco de regressão. O Codex deve evitar mudanças simultâneas em frontend, backend, deploy e banco sem necessidade.

Ordem recomendada:

1. fundação compartilhada;
2. detecção de subsistema;
3. login contextual;
4. shell e navegação;
5. rotas e guards;
6. dashboards iniciais;
7. backend e CORS;
8. deploy por subdomínios;
9. testes, refinamento e documentação.

## Etapa 1 — Fundação compartilhada

### Objetivo

Criar o registro central de subsistemas em `shared`.

### Tarefas

- criar `shared/src/subsystems.ts`;
- definir `SubsystemKey`;
- definir `SubsystemDefinition`;
- mapear hosts de produção;
- mapear aliases locais;
- declarar títulos, descrições, ícones, rotas, menus e ações recomendadas;
- exportar helpers `getSubsystemByKey`, `getDefaultSubsystem`, `resolveSubsystemByHost`.

### Cuidados

- não importar React em `shared`;
- ícones devem ser strings, não componentes;
- evitar dependência circular com `shared/src/const.ts`.

### Definition of Done

- `shared` compila;
- helpers possuem testes unitários;
- nenhum arquivo de UI foi alterado ainda, salvo imports futuros.

## Etapa 2 — Resolver subsistema no frontend

### Objetivo

Criar contexto React para o subsistema atual.

### Tarefas

- criar `client/src/app/subsystem-context.tsx`;
- implementar resolução por `?subsystem=` em desenvolvimento;
- implementar resolução por `window.location.hostname`;
- envolver `AppContent` com `SubsystemProvider`;
- criar hook `useSubsystem`;
- criar teste simples do resolver.

### Definition of Done

- `http://localhost:5173/?subsystem=licitacao` resolve Licitação;
- `?subsystem=planejamento` resolve Planejamento;
- sem parâmetro, cai no hub;
- typecheck passa.

## Etapa 3 — Login contextual

### Objetivo

Adaptar `LoginPage` para exibir conteúdo conforme o subsistema.

### Tarefas

- consumir `useSubsystem` dentro do login;
- substituir textos fixos por textos do registry;
- trocar ícone e highlights por subsistema;
- alterar rótulo do botão para `Entrar em <shortTitle>`;
- manter formulário, mutation e autenticação sem mudança estrutural.

### Definition of Done

- Licitação possui login visualmente próprio;
- Planejamento possui login visualmente próprio;
- Compras possui login visualmente próprio;
- Admin possui login visualmente próprio;
- autenticação continua funcionando.

## Etapa 4 — Shell contextual

### Objetivo

Reduzir sidebar, header e ações conforme o subsistema.

### Tarefas

- criar `SubsystemShell` ou adaptar `AppShell` com props de subsistema;
- substituir `navGroups` fixo por navegação filtrada;
- usar `subsystem.navigationKeys`;
- usar `subsystem.recommendedActions` no header;
- ajustar título e subtítulo pelo subsistema;
- preservar tema, notificações, menu do usuário e logout.

### Definition of Done

- sidebar de Licitação mostra apenas entradas pertinentes;
- sidebar de Planejamento mostra apenas entradas pertinentes;
- sidebar de Admin não aparece para usuário sem permissão;
- menu mobile continua funcionando;
- busca rápida continua abrindo.

## Etapa 5 — Registry de rotas e guards

### Objetivo

Retirar rotas soltas do `App.tsx` e centralizar em objetos.

### Tarefas

- criar `client/src/app/routes.tsx`;
- mover lazy imports para registry;
- criar `useAllowedRoutes`;
- filtrar por subsistema e papel;
- criar `NotFoundOrDeniedPage`;
- preservar rotas dinâmicas com parâmetros;
- validar links profundos.

### Definition of Done

- `App.tsx` fica menor e mais legível;
- rotas são objetos tipados;
- usuário não vê rota fora do subsistema;
- rota profunda permitida continua abrindo;
- rota profunda proibida exibe acesso negado ou redireciona.

## Etapa 6 — Home por subsistema

### Objetivo

Fazer `/` ser a entrada operacional do subsistema, não apenas dashboard geral.

### Tarefas

- criar `SubsystemHome`;
- criar cards básicos por subsistema;
- reaproveitar consultas existentes de dashboard quando possível;
- não criar novos endpoints antes de confirmar necessidade;
- criar empty states úteis.

### Definition of Done

- `/` em Licitação mostra resumo de Licitação;
- `/` em Planejamento mostra resumo de Planejamento;
- `/` em Compras mostra resumo de Compras;
- `/` em Admin mostra resumo administrativo;
- cards possuem ações reais.

## Etapa 7 — Backend e CORS

### Objetivo

Preparar backend para múltiplos subdomínios.

### Tarefas

- criar helper `resolveSubsystemFromRequest`;
- adicionar `subsystem` ao contexto tRPC;
- revisar CORS para lista explícita de `CLIENT_URL`;
- revisar uploads REST;
- criar helper de autorização por subsistema;
- manter autorização por papel.

### Definition of Done

- CORS aceita todos os hosts configurados;
- tRPC recebe contexto de subsistema;
- uploads continuam funcionando;
- server tests passam;
- nenhuma regra visual substitui regra backend.

## Etapa 8 — Deploy e Cloudflare

### Objetivo

Publicar os subdomínios apontando para a aplicação.

### Tarefas

- configurar DNS ou ingress do Cloudflare Tunnel;
- configurar hosts;
- ajustar `CLIENT_URL`;
- preferir `VITE_API_URL=/api/trpc`;
- validar refresh em rota interna;
- validar login por subdomínio.

### Definition of Done

- todos os subdomínios abrem;
- cada subdomínio carrega login próprio;
- API responde;
- refresh de rota profunda funciona;
- erro de CORS não ocorre.

## Etapa 9 — Testes e refinamento

### Objetivo

Garantir que a reorganização não quebrou fluxos existentes.

### Tarefas

- rodar `npm run check`;
- rodar `npm run test:all`;
- rodar `npm run build`;
- testar login/logout;
- testar rotas principais;
- testar uploads;
- testar mobile;
- revisar textos e ícones.

### Definition of Done

- build limpo;
- testes limpos;
- UX coerente;
- documentação atualizada;
- branch pronta para PR.

## Ajustes adicionais pós-plano

Após a execução das etapas, foram incorporadas decisões operacionais que não estavam explícitas no plano inicial:

1. `Cadastros` e `Relatórios` passaram a ser módulos transversais disponíveis em todos os subsistemas.
2. `Importações` foi liberado também no subsistema de Licitação.
3. A rota `/cadastros` foi aberta no guard frontend para todos os subsistemas, mas as ações continuam protegidas pelas procedures do backend.
4. O CORS passou a aceitar as origens HTTPS oficiais derivadas do registry `shared/src/subsystems.ts`, além das origens configuradas em `CLIENT_URL`.
5. Quick tunnels `*.trycloudflare.com` foram liberados apenas em desenvolvimento para viabilizar testes manuais.
6. A validação no domínio oficial indicou que o endpoint estava respondendo via Vite dev server; o deploy final deve apontar para o Express servindo `client/dist`.

## Regras para o Codex

1. Não implementar múltiplas arquiteturas ao mesmo tempo.
2. Não duplicar páginas por subsistema sem necessidade.
3. Não alterar schema de banco antes de concluir refatoração visual.
4. Não remover rotas antigas sem criar compatibilidade ou redirecionamento.
5. Não expor segredos em `.env`, documentação ou logs.
6. Sempre rodar typecheck após cada etapa.
7. Preferir funções puras e objetos de configuração.
8. Preservar a operação local atual.

# 08 — Prompts prontos para o Codex

## Como usar

Executar um prompt por vez. Não pedir ao Codex para implementar todas as etapas simultaneamente.

Antes de cada prompt, abrir os arquivos desta pasta e confirmar que o agente leu:

```txt
docs/codex/refatoracao-subdominios/README.md
docs/codex/refatoracao-subdominios/00-diagnostico-e-premissas.md
docs/codex/refatoracao-subdominios/01-arquitetura-alvo.md
docs/codex/refatoracao-subdominios/06-plano-de-execucao-por-etapas.md
```

## Prompt 1 — Fundação de subsistemas em shared

```txt
Leia a documentação em docs/codex/refatoracao-subdominios.

Implemente apenas a Etapa 1: Fundação compartilhada.

Tarefas:
- criar shared/src/subsystems.ts;
- definir SubsystemKey e SubsystemDefinition;
- cadastrar os subsistemas hub, planejamento, compras, licitacao, contratos, documentos, workflow, consultas e admin;
- mapear hostnames de produção e aliases locais;
- incluir title, shortTitle, description, loginTitle, loginSubtitle, icon, allowedRoles, routePolicy, navigationKeys, commandPaletteKeys e recommendedActions;
- exportar getSubsystemByKey, getDefaultSubsystem e resolveSubsystemByHost;
- adicionar testes unitários dos resolvers, se houver infraestrutura de teste em shared.

Restrições:
- não alterar App.tsx nesta etapa;
- não importar React em shared;
- não alterar schema de banco;
- não duplicar módulos.

Ao final, rode npm run check e corrija erros de typecheck.
```

## Prompt 2 — SubsystemProvider no frontend

```txt
Leia a documentação em docs/codex/refatoracao-subdominios.

Implemente apenas a Etapa 2: Resolver subsistema no frontend.

Tarefas:
- criar client/src/app/subsystem-context.tsx;
- implementar resolução por ?subsystem= apenas em ambiente DEV;
- implementar resolução por window.location.hostname;
- envolver AppContent com SubsystemProvider;
- criar hook useSubsystem;
- manter comportamento atual do sistema quando nenhum subsistema for identificado.

Restrições:
- não refatorar login ainda;
- não refatorar sidebar ainda;
- não alterar backend;
- preservar npm run dev.

Ao final, testar manualmente:
- http://localhost:5173/?subsystem=licitacao
- http://localhost:5173/?subsystem=planejamento
- http://localhost:5173/?subsystem=admin

Depois rode npm run check.
```

## Prompt 3 — Login contextual por subsistema

```txt
Leia a documentação em docs/codex/refatoracao-subdominios.

Implemente apenas a Etapa 3: Login contextual.

Tarefas:
- adaptar client/src/pages/login-page.tsx para consumir useSubsystem;
- trocar textos fixos por dados do SubsystemDefinition;
- trocar botão para Entrar em <shortTitle>;
- adaptar highlights laterais por subsistema;
- manter a mutation auth.login sem alteração funcional;
- preservar estado de erro, loading, mostrar/ocultar senha e onLogin.

Restrições:
- não alterar backend;
- não alterar AppShell;
- não alterar rotas;
- não quebrar o login existente.

Ao final, testar login visual com:
- ?subsystem=licitacao
- ?subsystem=planejamento
- ?subsystem=compras
- ?subsystem=admin

Depois rode npm run check.
```

## Prompt 4 — Shell e navegação contextual

```txt
Leia a documentação em docs/codex/refatoracao-subdominios.

Implemente apenas a Etapa 4: Shell contextual.

Tarefas:
- criar SubsystemShell ou adaptar AppShell para receber o subsistema atual;
- substituir grupos globais fixos por navegação derivada de subsystem.navigationKeys;
- preservar notificações, busca rápida, tema, menu do usuário, logout e tour se possível;
- reduzir o header para título, subtítulo curto e ações recomendadas do subsistema;
- garantir menu mobile funcional.

Restrições:
- não mover todas as rotas ainda;
- não alterar backend;
- não excluir componentes antigos até confirmar uso;
- não quebrar AppShell para o hub.

Ao final, rode npm run check e valide sidebar em Licitação, Planejamento, Compras e Admin.
```

## Prompt 5 — Registry de rotas e guards

```txt
Leia a documentação em docs/codex/refatoracao-subdominios.

Implemente apenas a Etapa 5: Registry de rotas e guards.

Tarefas:
- criar client/src/app/routes.tsx;
- mover lazy imports de páginas para um registry tipado;
- criar AppRouteDefinition;
- criar useAllowedRoutes;
- filtrar rotas por subsystemKeys, routePolicy e user.role;
- preservar rotas dinâmicas;
- criar NotFoundOrDeniedPage;
- manter rota / apontando para o comportamento atual até a próxima etapa.

Restrições:
- não reescrever páginas funcionais;
- não remover rota profunda sem alternativa;
- não alterar backend nesta etapa.

Ao final, testar URLs diretas de Licitação, Planejamento e Admin. Depois rode npm run check e npm run build.
```

## Prompt 6 — Home por subsistema

```txt
Leia a documentação em docs/codex/refatoracao-subdominios.

Implemente apenas a Etapa 6: Home por subsistema.

Tarefas:
- criar client/src/app/subsystem-home.tsx;
- fazer / renderizar uma home específica para o subsistema atual;
- criar cards simples e funcionais com ações reais;
- reaproveitar queries existentes de dashboard quando possível;
- criar empty states sem inventar dados;
- manter hub com dashboard geral.

Restrições:
- não criar novos endpoints antes de confirmar necessidade;
- não quebrar DashboardPage existente;
- não inventar métricas falsas.

Ao final, validar / em hub, licitacao, planejamento, compras e admin. Depois rode npm run check.
```

## Prompt 7 — Backend: contexto, CORS e permissões

```txt
Leia a documentação em docs/codex/refatoracao-subdominios.

Implemente apenas a Etapa 7: Backend e CORS.

Tarefas:
- criar server/src/lib/subsystem-context.ts;
- resolver subsistema por x-forwarded-host, host ou x-sirel-subsystem;
- adicionar subsystem ao contexto tRPC;
- formalizar CORS com lista explícita em CLIENT_URL;
- manter localhost permitido em desenvolvimento;
- criar helper requireSubsystemAccess sem substituir requireAdmin, requireGestor, requireOperador ou requireAuditor;
- revisar uploads REST para garantir que continuam usando Authorization.

Restrições:
- não alterar schema de banco nesta etapa;
- não migrar sessão para cookies ainda;
- não remover autorização atual por papel;
- não liberar CORS amplo em produção.

Ao final, rode npm run check, npm run test:server e teste login/upload em pelo menos um subsistema.
```

## Prompt 8 — Deploy por subdomínios

```txt
Leia a documentação em docs/codex/refatoracao-subdominios.

Prepare a aplicação para deploy por subdomínios.

Tarefas:
- revisar VITE_API_URL para permitir /api/trpc relativo;
- documentar exemplo de CLIENT_URL com todos os subdomínios;
- confirmar que o app funciona atrás de Cloudflare Tunnel;
- garantir SPA fallback para rotas profundas;
- atualizar README ou docs operacionais sem incluir segredo real.

Restrições:
- não versionar credenciais;
- não alterar arquivo local sensível;
- não quebrar npm run start:local;
- não presumir porta diferente sem verificar scripts.

Ao final, rode npm run build e valide refresh em rota profunda.
```

## Prompt 9 — Revisão final e limpeza

```txt
Leia a documentação em docs/codex/refatoracao-subdominios.

Faça uma revisão final da refatoração.

Tarefas:
- remover código morto criado durante a migração;
- verificar imports não usados;
- revisar nomes de componentes;
- garantir consistência dos textos em português;
- validar acessibilidade básica de botões e links;
- rodar npm run check, npm run test:all e npm run build;
- atualizar documentação se algum caminho real divergir do plano.

Restrições:
- não fazer novas features nesta etapa;
- não alterar comportamento funcional sem necessidade;
- não alterar banco.

Ao final, entregue resumo técnico com arquivos alterados, testes executados e riscos remanescentes.
```

## Prompt 10 — PR description

```txt
Monte a descrição do Pull Request da refatoração por subsistemas.

A descrição deve conter:
- objetivo;
- resumo das mudanças;
- arquitetura adotada;
- subdomínios suportados;
- impacto em login e sessão;
- impacto em permissões;
- checklist de testes executados;
- riscos conhecidos;
- plano de rollback.

Não inclua segredos, URLs internas sensíveis ou credenciais.
```

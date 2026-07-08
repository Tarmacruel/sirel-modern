# 09 — Registro da implementação e operação local

## 1. Contexto

Este documento registra o estado implementado da refatoração do SIREL por subsistemas e subdomínios, incluindo ajustes feitos fora do plano inicial durante validações locais, tunnel e domínio oficial.

A estratégia mantida é **Single SPA host-aware**:

- uma aplicação React/Vite;
- um backend Express/tRPC;
- um pacote `shared` com registry de subsistemas;
- uma base de dados única;
- múltiplos subdomínios apontando para o mesmo serviço;
- login, shell, rotas, home e navegação resolvidos pelo hostname ou por query string em desenvolvimento.

## 2. Arquitetura implementada

### 2.1. Registry compartilhado

Arquivo principal:

```txt
shared/src/subsystems.ts
```

O registry define:

- `SubsystemKey`;
- `SubsystemDefinition`;
- hostnames oficiais e aliases locais;
- títulos, descrições, textos de login, ícones e acentos visuais;
- papéis permitidos por subsistema;
- `routePolicy`;
- `navigationKeys`;
- `commandPaletteKeys`;
- `recommendedActions`;
- highlights do login;
- helpers `getSubsystemByKey`, `getDefaultSubsystem` e `resolveSubsystemByHost`.

Subsistemas cadastrados:

```txt
hub
planejamento
compras
licitacao
contratos
documentos
workflow
consultas
admin
```

### 2.2. Frontend

Arquivos principais:

```txt
client/src/app/subsystem-context.tsx
client/src/app/routes.tsx
client/src/app/subsystem-home.tsx
client/src/App.tsx
client/src/pages/login-page.tsx
client/src/components/layout/app-shell.tsx
client/src/components/layout/command-palette.tsx
```

Implementado:

- `SubsystemProvider` envolvendo o conteúdo da aplicação;
- resolução por `?subsystem=` apenas em ambiente `DEV`;
- resolução por `window.location.hostname`;
- fallback para hub quando nenhum subsistema é identificado;
- login contextual com textos, ícone, highlights e botão derivados do registry;
- shell contextual usando `subsystem.navigationKeys`;
- command palette filtrada por `subsystem.commandPaletteKeys`;
- registry tipado de rotas com `AppRouteDefinition`;
- `useAllowedRoutes` filtrando por subsistema, policy e papel;
- `NotFoundOrDeniedPage`;
- `SubsystemHome` para renderizar `/` conforme o subsistema;
- preservação de rotas dinâmicas e links profundos permitidos.

### 2.3. Backend

Arquivos principais:

```txt
server/src/lib/subsystem-context.ts
server/src/lib/cors-origins.ts
server/src/lib/request-auth.ts
server/src/_core/context.ts
server/src/index.ts
```

Implementado:

- resolução de subsistema por `x-sirel-subsystem`, `x-forwarded-host` ou `host`;
- inclusão de `subsystem` e `requestMeta` no contexto tRPC;
- helper `requireSubsystemAccess`, sem substituir `requireAdmin`, `requireGestor`, `requireOperador` ou `requireAuditor`;
- CORS formalizado por lista explícita e registry oficial;
- REST uploads preservando autenticação por `Authorization`;
- healthcheck com sinalização de subdomínios;
- Express servindo `client/dist` no build com fallback de SPA para rotas profundas.

## 3. Ajustes adicionais fora do plano inicial

### 3.1. Cadastros e Relatórios transversais

Decisão operacional:

- `Cadastros` foi liberado em todos os subsistemas;
- `Relatórios` foi liberado em todos os subsistemas;
- ambos aparecem em sidebar, command palette e policy de rota.

Impacto técnico:

- `/cadastros` usa `subsystemKeys: allSubsystemKeys`;
- `/relatorios` usa `subsystemKeys: allSubsystemKeys`;
- o backend continua controlando permissões de ação.

Observação de permissão:

- abrir `/cadastros` não torna todas as ações públicas;
- consultas usam procedures protegidas;
- edição usa perfil de gestão;
- remoção e operações administrativas continuam restritas a admin.

### 3.2. Importações em Licitação

Decisão operacional:

- `Importações` foi liberado também para o subsistema `licitacao`.

Impacto técnico:

- `/importacoes` inclui `hub`, `compras`, `licitacao` e `admin`;
- `licitacao` recebeu `importacoes` em `routePolicy`, `navigationKeys` e `commandPaletteKeys`.

### 3.3. CORS derivado do registry

Durante teste em domínio oficial, o login falhou com:

```txt
Unexpected token '<', "<!DOCTYPE "... is not valid JSON
```

Causa diagnosticada:

- o backend rejeitava `Origin: https://licitacao.sirel.com.br`;
- Express devolvia HTML de erro;
- o cliente tRPC tentava interpretar HTML como JSON.

Correção:

- `server/src/lib/cors-origins.ts` agora aceita origens HTTPS derivadas dos hostnames oficiais em `shared/src/subsystems.ts`;
- `CLIENT_URL` continua aceitando origens extras e explícitas;
- produção continua sem wildcard;
- quick tunnels `*.trycloudflare.com` são aceitos apenas fora de produção.

### 3.4. Deploy oficial ainda usando Vite dev server

Durante validação, o domínio oficial respondeu:

```txt
/@vite/client
/src/main.tsx
```

Isso indica serviço público apontando para Vite em `5173`. Para produção final, apontar para o Express servindo `client/dist`, normalmente em `3030`, após `npm run build`.

## 4. Operação local

### 4.1. Scripts principais

```bash
npm run start:local
npm run start:tunnel
npm run status:local
npm run stop:local
npm run reset:local
```

### 4.2. Portas verificadas

```txt
Backend Express/tRPC: http://localhost:3030
Frontend Vite:        http://localhost:5173
```

### 4.3. Desenvolvimento por query string

```txt
http://localhost:5173/?subsystem=hub
http://localhost:5173/?subsystem=planejamento
http://localhost:5173/?subsystem=compras
http://localhost:5173/?subsystem=licitacao
http://localhost:5173/?subsystem=contratos
http://localhost:5173/?subsystem=documentos
http://localhost:5173/?subsystem=workflow
http://localhost:5173/?subsystem=consultas
http://localhost:5173/?subsystem=admin
```

### 4.4. Tunnel local

O perfil `npm run start:tunnel` sobe:

- backend em `3030`;
- frontend em `5173`;
- Cloudflare quick tunnel apontando para `http://localhost:5173`;
- proxy do Vite encaminhando `/api` para `http://localhost:3030`.

Não versionar URLs efêmeras de tunnel, tokens, credentials files, `JWT_SECRET` ou `DATABASE_URL`.

## 5. Operação de produção recomendada

### 5.1. Serviço único

Recomendado:

```bash
npm run build
node server/dist/server/src/index.js
```

Todos os subdomínios devem apontar para o mesmo serviço Express.

### 5.2. Variáveis

Exemplo sem segredos:

```env
HOST=0.0.0.0
PORT=3030
CLIENT_URL=https://www.sirel.com.br,https://app.sirel.com.br,https://planejamento.sirel.com.br,https://compras.sirel.com.br,https://licitacao.sirel.com.br,https://contratos.sirel.com.br,https://documentos.sirel.com.br,https://workflow.sirel.com.br,https://consultas.sirel.com.br,https://admin.sirel.com.br
VITE_API_URL=/api/trpc
JWT_SECRET=<definir-localmente>
DATABASE_URL=<definir-localmente>
```

### 5.3. Sinais esperados do build em produção

- HTML sem `@vite/client`;
- assets em `/assets/...`;
- `/api/trpc/auth.me` responde JSON;
- `/healthz` responde JSON;
- refresh em rota profunda devolve o SPA;
- origem oficial não gera erro de CORS;
- origem desconhecida continua bloqueada.

## 6. Validações executadas nesta consolidação

```txt
npm run check
npm run test:all
npm run build
```

Também foi validado com Playwright no domínio oficial:

- antes da correção, `auth.login` retornava `500 text/html`;
- depois da correção, credencial falsa retorna `401 application/json` com mensagem de usuário ou senha inválidos.

## 7. Próximos passos recomendados

1. Publicar o build final apontando os subdomínios para o Express em vez do Vite dev server.
2. Validar login real em `licitacao.sirel.com.br`, `planejamento.sirel.com.br`, `compras.sirel.com.br` e `admin.sirel.com.br`.
3. Rodar `npm run test:all` e `npm run build` no ambiente que fará o deploy.
4. Validar `/cadastros` e `/relatorios` em todos os subsistemas.
5. Validar `/importacoes` em Licitação.
6. Testar uploads REST com token `Authorization`.
7. Confirmar refresh em rotas profundas atrás do Cloudflare.
8. Revisar se a sessão por `localStorage` por subdomínio atende ao uso real ou se deve virar cookie HttpOnly compartilhado em etapa futura.

## 8. Riscos remanescentes

- O domínio oficial ainda pode estar apontando para Vite dev server se o túnel/serviço não for ajustado.
- A abertura de Cadastros para todos os subsistemas depende das permissões backend para impedir ações indevidas.
- Sessões continuam isoladas por subdomínio enquanto o token permanecer em `localStorage`.
- Qualquer subdomínio novo precisa entrar no registry ou em `CLIENT_URL`.
- O comportamento de uploads deve ser validado manualmente com arquivos reais e usuário autorizado.

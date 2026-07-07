# 00 — Diagnóstico e premissas da refatoração

## 1. Diagnóstico do estado atual

O SIREL Modern já possui uma base adequada para modularização, mas a experiência de uso está concentrada em uma única aplicação visual. O frontend atual carrega as páginas por lazy import dentro de `client/src/App.tsx` e registra rotas de todos os módulos no mesmo `Switch`. Isso viabilizou evolução rápida, mas gerou uma superfície operacional extensa e cognitivamente pesada.

Hoje, o usuário autenticado vê um `AppShell` com sidebar global contendo grupos de navegação e vários módulos. Essa estratégia funciona para usuários administradores ou operadores experientes, mas tende a prejudicar o uso direcionado por setor, especialmente quando o servidor atua em uma fase específica do ciclo da contratação.

A aplicação já está em monorepo com workspaces para `client`, `server` e `shared`. Portanto, a refatoração não deve migrar para múltiplos repositórios nem duplicar lógica. O caminho correto é criar uma camada de **subsystem context**, fazendo o mesmo código responder de maneira diferente conforme o hostname, a permissão e o escopo funcional.

## 2. Problemas que a refatoração precisa resolver

### 2.1. Excesso de informação na entrada

A tela principal e a navegação global mostram módulos demais ao mesmo tempo. Para o usuário que acessa apenas Licitação, o excesso de itens de Planejamento, Compras, Contratos, Workflow, Consultas, Importações, Cadastros, Auditoria, Usuários e Parâmetros cria ruído.

### 2.2. Ausência de fronteira visual por setor

Mesmo que as rotas sejam separadas, a experiência visual não diferencia claramente o ambiente de Licitação, Planejamento, Compras, Contratos, Documentos e Administração.

### 2.3. Login único e genérico

A tela de login atual apresenta o SIREL como ambiente institucional único. A nova organização exige login contextual: `licitacao.sirel.com.br` deve abrir uma tela de login com título, subtítulo, ícones e chamadas voltadas à licitação; `planejamento.sirel.com.br` deve fazer o mesmo para planejamento; e assim sucessivamente.

### 2.4. Navegação não linear

A navegação global facilita acesso amplo, mas não conduz o usuário por uma sequência clara. Cada subsistema deve ter uma “trilha operacional” com ações principais, próximas etapas e botões objetivos.

### 2.5. Permissões pouco expressivas por módulo

O backend já diferencia papéis como `admin`, `gestor`, `operador`, `auditor` e `user`, mas a arquitetura alvo deve permitir também restrição por subsistema. Exemplo: usuário pode ser operador de Licitação, mas apenas leitor em Contratos.

## 3. Premissas técnicas obrigatórias

### 3.1. Preservar monorepo

Manter a estrutura:

```txt
client/
server/
shared/
drizzle/
docs/
scripts/
storage/
```

Não criar repositórios separados.

### 3.2. Preservar API compartilhada

O backend Express + tRPC deve continuar sendo a superfície principal da API. O frontend pode resolver o endpoint por variável de ambiente ou por caminho relativo (`/api/trpc`).

### 3.3. Preservar banco único

Não dividir o banco por subsistema nesta etapa. A separação inicial é de experiência, rota, permissão e contexto operacional, não de persistência física.

### 3.4. Não quebrar links profundos

Links como `/licitacao/:processoId`, `/planejamento/dfd/:processoId`, `/dossie/:processoId` e outros devem continuar funcionando. Quando acessados em subdomínio inadequado, o sistema deve:

1. permitir se a rota for declarada como rota cruzada autorizada;
2. redirecionar para o subdomínio correto, quando possível;
3. exibir tela de acesso não permitido, se não houver permissão ou contexto.

### 3.5. Subdomínio não substitui autorização

Apenas acessar `licitacao.sirel.com.br` não concede acesso à Licitação. O backend deve validar usuário, papel e escopo. O frontend apenas melhora a experiência e previne acesso indevido por interface.

### 3.6. LocalStorage é isolado por subdomínio

Se o sistema continuar salvando token em `localStorage`, cada subdomínio terá sessão própria. Isso atende ao requisito de “cada módulo ter sua tela de login”, mas gera múltiplos logins. Caso seja desejado SSO entre subdomínios no futuro, migrar para cookie `HttpOnly`, `Secure`, `SameSite=Lax` ou `SameSite=None` com domínio `.sirel.com.br`.

### 3.7. Código orientado a domínio

Evitar componentes gigantes e condicionais espalhadas. A refatoração deve organizar:

- objetos de configuração de subsistema;
- classes ou services de resolução de contexto;
- funções puras para filtragem de rotas e navegação;
- componentes de shell reutilizáveis;
- componentes específicos por subsistema somente quando houver necessidade real;
- hooks de contexto (`useSubsystem`, `useAllowedRoutes`, `useSubsystemNavigation`).

## 4. Premissas de UX

### 4.1. Menos texto, mais ação

Substituir blocos longos por:

- cards objetivos;
- botões de ação primária;
- ícones consistentes;
- etapas numeradas;
- badges de status;
- tooltips curtos;
- links de aprofundamento apenas quando necessário.

### 4.2. Subdomínio deve parecer subsistema

Cada host deve ter:

- título próprio;
- subtítulo próprio;
- ícone principal;
- cor/acento opcional;
- lista de rotas permitidas;
- atalhos próprios;
- mensagens de login próprias;
- menu lateral reduzido;
- dashboard inicial próprio.

### 4.3. Administração continua ampla

`admin.sirel.com.br` pode concentrar usuários, parâmetros, auditoria, importações administrativas e configurações globais. Ainda assim, deve ter layout menos poluído e ações mais diretas.

## 5. Riscos principais

### 5.1. Risco de duplicação

Criar uma aplicação Vite para cada subdomínio pode duplicar rotas, componentes e build. Evitar isso no primeiro ciclo. A estratégia preferencial é **single SPA host-aware**.

### 5.2. Risco de permissão apenas visual

Filtrar menu no frontend é insuficiente. Cada rota tRPC crítica deve continuar usando `protectedProcedure`, `operadorProcedure`, `gestorProcedure`, `adminProcedure` ou uma nova proteção granular por subsistema.

### 5.3. Risco de CORS permissivo

O CORS atual precisa ser formalizado para aceitar explicitamente os subdomínios esperados. Evitar manter liberação ampla em produção.

### 5.4. Risco de regressão em uploads

Rotas REST de upload, como documentos e parsers, usam autorização própria via header/token. Ao separar subdomínios, revisar todos os clientes que chamam upload para garantir envio correto de token e origem.

### 5.5. Risco de navegação quebrada no Cloudflare

Todos os subdomínios devem apontar para a mesma aplicação ou para builds corretos. Em SPA, o servidor/tunnel precisa entregar `index.html` para rotas internas.

## 6. Critério de sucesso

A refatoração será considerada bem-sucedida quando:

1. `licitacao.sirel.com.br` abrir login e painel próprios de Licitação;
2. `planejamento.sirel.com.br` abrir login e painel próprios de Planejamento;
3. cada subsistema mostrar apenas suas rotas principais e rotas cruzadas autorizadas;
4. o usuário não visualizar módulos irrelevantes ao seu contexto;
5. links profundos continuarem funcionando;
6. permissões forem aplicadas no backend;
7. build, typecheck e testes passarem;
8. o sistema continuar operando localmente com `npm run start:local`;
9. publicação via Cloudflare aceitar os novos hosts sem gambiarras de código.

# 01 — Arquitetura alvo por subsistemas

## 1. Decisão arquitetural recomendada

A arquitetura recomendada para a primeira fase é **Single SPA host-aware**:

- uma única aplicação React/Vite;
- um único backend Express/tRPC;
- um único pacote `shared`;
- uma única base PostgreSQL;
- múltiplos subdomínios apontando para a mesma aplicação;
- comportamento visual e funcional resolvido pelo hostname.

Essa abordagem entrega a separação desejada sem fragmentar o projeto. O sistema passa a interpretar o host atual e carregar o subsistema correspondente.

Exemplo:

```txt
https://licitacao.sirel.com.br      -> subsystem: licitacao
https://planejamento.sirel.com.br   -> subsystem: planejamento
https://compras.sirel.com.br        -> subsystem: compras
https://admin.sirel.com.br          -> subsystem: admin
https://www.sirel.com.br            -> subsystem: hub
```

## 2. Registro central de subsistemas

Criar um arquivo central em `shared/src/subsystems.ts` ou `shared/src/const/subsystems.ts`.

### 2.1. Tipo base

```ts
export type SubsystemKey =
  | "hub"
  | "planejamento"
  | "compras"
  | "licitacao"
  | "contratos"
  | "documentos"
  | "workflow"
  | "consultas"
  | "admin";

export type SubsystemRoutePolicy = {
  primaryRoutes: string[];
  crossRoutes: string[];
  deniedRedirect?: string;
};

export type SubsystemDefinition = {
  key: SubsystemKey;
  hostnames: string[];
  localHostAliases: string[];
  title: string;
  shortTitle: string;
  description: string;
  loginTitle: string;
  loginSubtitle: string;
  icon: string;
  accent?: string;
  allowedRoles: string[];
  routePolicy: SubsystemRoutePolicy;
  navigationKeys: string[];
  commandPaletteKeys: string[];
  recommendedActions: Array<{
    id: string;
    label: string;
    href: string;
    tone?: "primary" | "neutral" | "warning";
  }>;
};
```

### 2.2. Exemplo de definição

```ts
export const subsystemDefinitions = [
  {
    key: "licitacao",
    hostnames: ["licitacao.sirel.com.br"],
    localHostAliases: ["licitacao.localhost", "licitacao.127.0.0.1.nip.io"],
    title: "SIREL Licitação",
    shortTitle: "Licitação",
    description: "Fase externa, julgamento, habilitação, recursos e homologação.",
    loginTitle: "Entrar no ambiente de Licitação",
    loginSubtitle: "Acesse processos em disputa, julgamentos, habilitações, recursos e publicações.",
    icon: "ScrollText",
    allowedRoles: ["admin", "gestor", "operador", "auditor"],
    routePolicy: {
      primaryRoutes: ["/", "/licitacao", "/licitacao/:processoId", "/documentos", "/dossie", "/prazos"],
      crossRoutes: ["/processos/:processoId", "/consultas"],
      deniedRedirect: "/",
    },
    navigationKeys: ["dashboard", "licitacao", "documentos", "prazos", "dossie", "consultas"],
    commandPaletteKeys: ["licitacao", "documentos", "prazos", "dossie", "consultas"],
    recommendedActions: [
      { id: "abrir-licitacoes", label: "Abrir licitações", href: "/licitacao", tone: "primary" },
      { id: "ver-prazos", label: "Ver prazos", href: "/prazos" },
      { id: "novo-documento", label: "Documentos", href: "/documentos" },
    ],
  },
] satisfies SubsystemDefinition[];
```

## 3. Resolução de subsistema por host

Criar uma função pura compartilhável:

```ts
export function resolveSubsystemByHost(hostname: string): SubsystemDefinition {
  const normalized = hostname.toLowerCase().split(":")[0];

  return (
    subsystemDefinitions.find((item) =>
      [...item.hostnames, ...item.localHostAliases].includes(normalized),
    ) ?? getDefaultSubsystem()
  );
}
```

No frontend, criar hook:

```ts
export function useSubsystem() {
  return useMemo(() => {
    if (typeof window === "undefined") return getDefaultSubsystem();
    return resolveSubsystemByHost(window.location.hostname);
  }, []);
}
```

No backend, criar helper:

```ts
export function resolveSubsystemFromRequest(req: express.Request) {
  const host = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "");
  return resolveSubsystemByHost(host);
}
```

## 4. Modelo de hosts

### 4.1. Produção

```txt
www.sirel.com.br             hub
app.sirel.com.br             hub ou painel geral
planejamento.sirel.com.br    planejamento
compras.sirel.com.br         compras
licitacao.sirel.com.br       licitacao
contratos.sirel.com.br       contratos
documentos.sirel.com.br      documentos
workflow.sirel.com.br        workflow
consultas.sirel.com.br       consultas
admin.sirel.com.br           admin
```

### 4.2. Desenvolvimento local

Preferir aliases locais sem exigir alteração complexa:

```txt
localhost:5173?subsystem=licitacao
localhost:5173?subsystem=planejamento
localhost:5173?subsystem=compras
```

Também pode ser suportado:

```txt
licitacao.localhost:5173
planejamento.localhost:5173
compras.localhost:5173
```

Para o Codex: implementar primeiro suporte a query string `?subsystem=` para facilitar testes locais. Depois implementar hostname real.

## 5. Estratégia de rotas

### 5.1. Rotas físicas continuam existindo

As rotas atuais podem continuar registradas em `App.tsx` ou, preferencialmente, migrar para um registry.

### 5.2. Rotas devem virar objetos

Criar `client/src/app/routes.tsx`:

```ts
export type AppRouteDefinition = {
  id: string;
  path: string;
  moduleKey: string;
  subsystemKeys: SubsystemKey[];
  requiredRoles?: string[];
  component: LazyExoticComponent<ComponentType<any>>;
  exact?: boolean;
  crossSubsystem?: boolean;
};
```

### 5.3. Filtragem de rotas

O frontend deve filtrar rotas por:

1. subsistema atual;
2. papel do usuário;
3. rotas cruzadas autorizadas;
4. feature flags futuras.

### 5.4. Rota raiz por subsistema

A rota `/` não deve significar sempre Dashboard geral. Ela deve resolver para um dashboard do subsistema:

```txt
/ em licitacao.sirel.com.br      -> LicitacaoHomePage
/ em planejamento.sirel.com.br   -> PlanejamentoHomePage
/ em compras.sirel.com.br        -> ComprasHomePage
/ em admin.sirel.com.br          -> AdminHomePage
```

### 5.5. Módulos transversais consolidados

Após validação operacional, alguns módulos deixaram de ser tratados como exclusivos de um único subsistema:

- `Cadastros` é transversal e deve estar disponível em todos os subsistemas pela rota `/cadastros`;
- `Relatórios` é transversal e deve estar disponível em todos os subsistemas pela rota `/relatorios`;
- `Importações` permanece disponível para `hub`, `compras` e `admin`, e foi acrescentado ao subsistema `licitacao`.

Essa liberação é de navegação e rota. As permissões de ação continuam sendo aplicadas pelo backend: consultas de Cadastros usam procedures protegidas, edições usam perfil de gestão e remoções continuam restritas a admin.

## 6. Estratégia de login

Cada subdomínio deve renderizar a mesma base de `LoginPage`, mas com conteúdo vindo do `SubsystemDefinition`.

### 6.1. Login contextual

Campos continuam iguais:

- usuário;
- senha;
- botão entrar;
- aviso de sessão auditada.

Conteúdo muda:

- título;
- subtítulo;
- ícone;
- benefícios;
- texto lateral;
- cor/acento opcional;
- ações de ajuda.

### 6.2. Sessão

Fase 1: manter token em `localStorage` por subdomínio.  
Fase 2 opcional: migrar para cookie de sessão compartilhado em `.sirel.com.br`.

## 7. Estratégia de backend

### 7.1. Não criar um backend por subsistema

O backend deve continuar unificado. O que muda:

- CORS aceita vários subdomínios;
- contexto tRPC recebe `subsystemKey`;
- procedures críticas podem validar escopo;
- auditoria pode registrar subsistema de origem;
- uploads validam usuário e origem.

### 7.2. Possível tipo de permissão futura

```ts
export type UserSubsystemAccess = {
  userId: number;
  subsystemKey: SubsystemKey;
  role: "viewer" | "operator" | "manager" | "admin";
};
```

Não implementar tabela imediatamente se não for necessária. Primeiro centralizar regras em código para não travar a refatoração visual.

## 8. Estratégia de UI

### 8.1. Shell por subsistema

Substituir `AppShell` monolítico por camadas:

```txt
AppShell
  ├── ShellProvider
  ├── SubsystemSidebar
  ├── SubsystemHeader
  ├── SubsystemQuickActions
  ├── UserMenu
  └── MainContent
```

### 8.2. Navegação reduzida

Cada subsistema recebe menu curto. Exemplo Licitação:

```txt
Início
Processos de Licitação
Documentos
Prazos
Dossiês
Consultas
```

Exemplo Planejamento:

```txt
Início
DFD
ETP
Cotações
TR
PCA
Processos
```

## 9. Estratégia de build

### 9.1. Fase 1

Um único build:

```bash
npm run build
```

### 9.2. Fase 2 opcional

Se performance exigir, criar múltiplas entradas Vite:

```txt
client/src/entries/hub.tsx
client/src/entries/licitacao.tsx
client/src/entries/planejamento.tsx
```

Não fazer isso antes da consolidação da arquitetura host-aware.

## 10. Resultado alvo

O resultado técnico deve ser uma aplicação única, modular, orientada por objetos de configuração, com shell e login adaptáveis por subsistema, menus reduzidos, rotas filtradas, autorização preservada e deploy compatível com subdomínios do SIREL.

# 02 — Frontend: rotas, shell, login e navegação por subsistema

## 1. Objetivo da etapa

Refatorar o frontend para deixar de operar como um painel único e passar a operar como uma aplicação contextual por subsistema, determinada pelo subdomínio ou por parâmetro local de desenvolvimento.

A mudança deve preservar as páginas atuais sempre que possível. O foco inicial é reorganizar entrada, shell, rotas, menus e atalhos, não reescrever todo o conteúdo funcional.

## 2. Arquivos-alvo prováveis

Criar:

```txt
client/src/app/subsystem-context.tsx
client/src/app/routes.tsx
client/src/app/route-guards.tsx
client/src/app/subsystem-home.tsx
client/src/components/layout/subsystem-shell.tsx
client/src/components/layout/subsystem-sidebar.tsx
client/src/components/layout/subsystem-header.tsx
client/src/components/layout/subsystem-login-frame.tsx
client/src/lib/subsystem.ts
shared/src/subsystems.ts
```

Refatorar:

```txt
client/src/App.tsx
client/src/pages/login-page.tsx
client/src/components/layout/app-shell.tsx
client/src/components/layout/command-palette.tsx
client/src/lib/entry-experience.ts
shared/src/const.ts
```

## 3. Criar `SubsystemProvider`

### 3.1. Responsabilidade

O provider deve disponibilizar o subsistema atual para toda a árvore React:

```ts
const SubsystemContext = createContext<SubsystemDefinition | null>(null);

export function SubsystemProvider({ children }: PropsWithChildren) {
  const subsystem = useMemo(() => resolveCurrentSubsystem(), []);
  return <SubsystemContext.Provider value={subsystem}>{children}</SubsystemContext.Provider>;
}

export function useSubsystem() {
  const context = useContext(SubsystemContext);
  if (!context) throw new Error("useSubsystem deve ser usado dentro de SubsystemProvider");
  return context;
}
```

### 3.2. Resolver subsistema por query string em desenvolvimento

Implementar prioridade:

1. `?subsystem=licitacao`, quando `import.meta.env.DEV`;
2. `window.location.hostname`;
3. fallback para `hub`.

```ts
export function resolveCurrentSubsystem() {
  if (typeof window === "undefined") return getDefaultSubsystem();

  const params = new URLSearchParams(window.location.search);
  const forced = params.get("subsystem");
  if (import.meta.env.DEV && forced) {
    return getSubsystemByKey(forced) ?? getDefaultSubsystem();
  }

  return resolveSubsystemByHost(window.location.hostname);
}
```

## 4. Refatorar `App.tsx`

### 4.1. Problema atual

`App.tsx` importa todas as páginas diretamente e registra todas as rotas dentro de um único `Switch`. Essa abordagem deve ser substituída por registry de rotas.

### 4.2. Novo desenho

```tsx
export default function App() {
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <SubsystemProvider>
          <AppContent />
        </SubsystemProvider>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
```

### 4.3. `AuthenticatedApp`

Receber o subsistema atual:

```tsx
function AuthenticatedApp({ session, onLogout }: Props) {
  const subsystem = useSubsystem();
  const allowedRoutes = useAllowedRoutes({ subsystem, user: session.user });

  return (
    <SubsystemShell user={user} subsystem={subsystem} onLogout={onLogout}>
      <Suspense fallback={<RouteFallback />}>
        <Switch>
          <Route path="/" component={() => <SubsystemHome subsystem={subsystem} />} />
          {allowedRoutes.map((route) => (
            <Route key={route.id} path={route.path}>{route.render}</Route>
          ))}
          <Route component={NotFoundOrDeniedPage} />
        </Switch>
      </Suspense>
    </SubsystemShell>
  );
}
```

## 5. Registry de rotas

### 5.1. Criar `client/src/app/routes.tsx`

Organizar lazy imports no registry:

```ts
export const appRoutes: AppRouteDefinition[] = [
  {
    id: "licitacao-list",
    path: "/licitacao",
    moduleKey: "licitacao",
    subsystemKeys: ["licitacao", "hub", "admin"],
    component: LicitacaoPage,
  },
  {
    id: "licitacao-processo",
    path: "/licitacao/:processoId",
    moduleKey: "licitacao",
    subsystemKeys: ["licitacao", "hub", "admin"],
    component: LicitacaoProcessoPage,
  },
];
```

### 5.2. Regra de rotas cruzadas

Algumas rotas são úteis para vários subsistemas:

- `/processos/:processoId`;
- `/dossie/:processoId`;
- `/consultas`;
- `/documentos`;
- `/prazos`.

Elas devem ser marcadas com `crossSubsystem: true` e só exibidas se listadas no `routePolicy.crossRoutes` do subsistema.

## 6. Login contextual por subsistema

### 6.1. Refatorar `LoginPage`

O login deve continuar recebendo `onLogin`, mas deve consumir `useSubsystem()`:

```tsx
export function LoginPage({ onLogin }: LoginPageProps) {
  const subsystem = useSubsystem();
  ...
}
```

Substituir textos fixos por valores do subsistema:

```tsx
<h1>{subsystem.title}</h1>
<h2>{subsystem.loginTitle}</h2>
<p>{subsystem.loginSubtitle}</p>
```

### 6.2. Benefícios laterais por subsistema

Criar em `SubsystemDefinition`:

```ts
loginHighlights: Array<{
  icon: string;
  title: string;
  description: string;
}>;
```

Exemplo Licitação:

```ts
loginHighlights: [
  { icon: "ScrollText", title: "Fase externa", description: "Publicações, disputa, julgamento e habilitação em tela única." },
  { icon: "Clock3", title: "Prazos críticos", description: "Controle visual de impugnações, recursos e homologação." },
  { icon: "FileText", title: "Atos e documentos", description: "Acesso rápido a atas, avisos, diligências e relatórios." },
]
```

### 6.3. Botão de entrada

O botão pode variar:

```txt
Entrar em Licitação
Entrar em Planejamento
Entrar em Compras
Entrar em Administração
```

## 7. Shell contextual

### 7.1. Criar `SubsystemShell`

O shell deve receber:

```ts
interface SubsystemShellProps extends PropsWithChildren {
  user: AuthUser;
  subsystem: SubsystemDefinition;
  onLogout: () => void;
}
```

### 7.2. Reduzir sidebar

Em vez de usar grupos fixos globais, gerar sidebar por `subsystem.navigationKeys`.

```ts
const entries = subsystem.navigationKeys
  .map((key) => moduleMap.get(key))
  .filter(Boolean);
```

### 7.3. Header objetivo

O header deve conter:

- nome do subsistema;
- subtítulo curto;
- busca rápida;
- notificações;
- menu do usuário;
- até 2 ações recomendadas.

Evitar parágrafos longos no header.

## 8. Dashboards iniciais por subsistema

Criar `SubsystemHome` para direcionar `/`.

### 8.1. Licitação

Cards sugeridos:

- Licitações em julgamento;
- Habilitações pendentes;
- Recursos em prazo;
- Publicações recentes;
- Diligências abertas.

Botões:

- Abrir licitações;
- Ver prazos;
- Gerar documento;
- Consultar processo.

### 8.2. Planejamento

Cards:

- DFD em rascunho;
- ETP pendente;
- Cotações incompletas;
- TR aguardando revisão;
- PCA.

### 8.3. Compras

Cards:

- Pesquisas de preço;
- Mapas comparativos;
- SDs processadas;
- Itens sem cotação;
- Fornecedores saneados.

### 8.4. Administração

Cards:

- Usuários;
- Auditoria;
- Parâmetros;
- Importações;
- Saúde do sistema.

## 9. Command palette contextual

A command palette atual deve ser filtrada por subsistema.

### 9.1. Regra

Mostrar apenas comandos cujo `moduleKey` esteja em `subsystem.commandPaletteKeys`, exceto comandos globais:

- sair;
- alternar tema;
- abrir notificações;
- abrir consultas, quando permitido.

### 9.2. Resultado esperado

Em `licitacao.sirel.com.br`, a busca rápida não deve sugerir telas de Administração, Parâmetros ou Usuários, salvo para `admin` e conforme regra explícita.

## 10. Navegação entre subdomínios

Criar helper:

```ts
export function buildSubsystemUrl(key: SubsystemKey, path = "/") {
  const subsystem = getSubsystemByKey(key);
  const host = subsystem.hostnames[0];
  return `https://${host}${path}`;
}
```

No ambiente local, preservar o host atual e trocar `?subsystem=`.

## 11. Página de acesso negado

Criar tela objetiva:

```txt
Acesso não disponível neste ambiente

Este recurso pertence ao subsistema Planejamento.
[Ir para Planejamento] [Voltar ao início]
```

Se usuário não tiver perfil, mostrar:

```txt
Seu perfil não possui permissão para esta área.
Solicite revisão de acesso ao administrador do SIREL.
```

## 12. Definition of Done desta etapa

- `SubsystemProvider` criado e usado no `App`;
- `LoginPage` contextual por subsistema;
- `AppShell` substituído ou encapsulado por `SubsystemShell`;
- menu lateral filtrado por subsistema;
- route registry criado;
- `/` renderiza dashboard inicial do subsistema;
- command palette filtrada;
- links profundos continuam funcionando;
- `npm run check` passa;
- `npm run build` passa;
- não houve duplicação de páginas existentes.

# 10 — Hub, login único e permissões por subsistema

## 1. Objetivo desta etapa

Criar uma experiência de entrada coerente com a arquitetura por subsistemas já implementada.

O usuário deve fazer login uma única vez, entrar em um Hub institucional e visualizar somente os subsistemas aos quais possui acesso. A partir desse Hub, deve conseguir acessar ou alternar entre subsistemas sem autenticar novamente.

## 2. Diagnóstico correto da branch `docs/refatoracao-subdominios-codex`

A branch já implementou a base de subsistemas. Não reimplementar essa fundação.

Já existe:

- `shared/src/subsystems.ts` com registry central de subsistemas;
- `client/src/app/subsystem-context.tsx` com resolução por hostname e `?subsystem=` em desenvolvimento;
- `client/src/app/routes.tsx` com registry tipado de rotas;
- `client/src/app/subsystem-home.tsx` com homes contextuais;
- `client/src/App.tsx` usando `SubsystemProvider`, `useAllowedRoutes` e `renderAppRoute`;
- `client/src/components/layout/app-shell.tsx` com sidebar e header contextuais por subsistema;
- `client/src/pages/login-page.tsx` com login contextual por subsistema;
- `server/src/lib/subsystem-context.ts` e contexto tRPC com subsistema;
- `server/src/lib/cors-origins.ts` aceitando origens derivadas do registry oficial.

Problemas remanescentes desta etapa:

1. Quando o subsistema atual é `hub`, `SubsystemHome` ainda renderiza `DashboardPage`, e não uma tela seletora de subsistemas.
2. A sessão continua armazenada em `localStorage`, logo fica isolada por subdomínio.
3. O backend ainda resolve autenticação principalmente por `Authorization: Bearer`, sem cookie compartilhado entre subdomínios.
4. `auth.login` e `auth.me` retornam apenas dados globais do usuário, sem matriz de permissões por subsistema.
5. As permissões ainda combinam `role` global e `allowedRoles` do registry, mas não há controle personalizado por usuário e subsistema.
6. A tela de usuários ainda não permite administrar acessos por subsistema.
7. O shell ainda não possui seletor explícito para alternar entre subsistemas autorizados.

## 3. Decisão de produto

A nova entrada deve seguir este fluxo:

```txt
Usuário acessa app.sirel.com.br ou www.sirel.com.br
        ↓
Tela de login institucional
        ↓
Autenticação única
        ↓
Hub de subsistemas autorizados
        ↓
Usuário escolhe Planejamento, Compras, Licitação, Contratos, Documentos etc.
        ↓
Sistema abre o subsistema escolhido
        ↓
Usuário pode alternar por seletor no header, sem novo login
```

## 4. Decisão técnica sobre sessão única

### 4.1. Problema

`localStorage` não é compartilhado entre subdomínios. Portanto, se a sessão continuar apenas em `localStorage`, o usuário logado em `app.sirel.com.br` terá de logar novamente em `licitacao.sirel.com.br`.

### 4.2. Solução recomendada

Implementar sessão compartilhada por cookie seguro no domínio raiz:

```txt
sirel_session=<token>
Domain=.sirel.com.br
Path=/
HttpOnly
Secure
SameSite=Lax
```

Em ambiente local, o cookie deve ser emitido sem `Domain=.sirel.com.br` e sem `Secure` quando estiver em HTTP local.

### 4.3. Compatibilidade de transição

Manter temporariamente o header `Authorization: Bearer <token>` e o `localStorage` como fallback até estabilizar a migração. O backend deve aceitar:

1. token no cookie `sirel_session`;
2. token no header `Authorization`.

A ordem preferencial deve ser cookie primeiro e header depois.

## 5. Modelo de permissões por subsistema

### 5.1. Papel global continua existindo

O campo global `role` deve permanecer. Ele define poderes sistêmicos gerais:

```txt
admin
gestor
operador
auditor
user
```

Esse papel não deve ser confundido com autorização por subsistema.

### 5.2. Nova camada de autorização

Criar uma tabela de acesso por usuário e subsistema.

Nome sugerido:

```txt
user_subsystem_access
```

Campos sugeridos:

```txt
id serial primary key
user_id integer not null references users(id) on delete cascade
subsystem_key text not null
access_level text not null
is_default boolean not null default false
ativo boolean not null default true
observacao text null
criado_por integer null references users(id)
criado_em timestamp with time zone not null default now()
atualizado_em timestamp with time zone not null default now()
unique(user_id, subsystem_key)
```

### 5.3. Níveis de acesso

Usar níveis simples, sem granularidade excessiva na primeira versão:

```txt
VIEWER      — visualizar
OPERATOR    — operar/inserir/editar rotinas comuns
MANAGER     — aprovar, revisar e gerir rotinas do subsistema
ADMIN       — administrar o subsistema
```

Regra: `admin` global continua tendo acesso total, mesmo que não existam registros na tabela.

### 5.4. Subsistemas controláveis

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

O Hub deve ser acessível para todo usuário autenticado. O administrador pode controlar acesso aos demais.

## 6. Regras de migração sem bloqueio

A migration não pode bloquear usuários atuais.

Estratégia:

1. criar tabela de permissões;
2. inserir permissões padrão para usuários ativos existentes;
3. admin global recebe todos os subsistemas com `ADMIN`;
4. gestor recebe subsistemas operacionais com `MANAGER`;
5. operador recebe subsistemas operacionais com `OPERATOR`;
6. auditor recebe consultas, dossiês, relatórios e auditoria com `VIEWER` quando aplicável;
7. user recebe somente Hub e subsistemas explicitamente definidos.

Se não houver registros para um usuário não admin, o backend pode aplicar fallback temporário baseado no role global, mas esse fallback deve ser removível depois.

## 7. Backend — `auth.login` e `auth.me`

### 7.1. Retorno esperado

`auth.login` e `auth.me` devem retornar:

```ts
{
  user: {
    id: number;
    username: string;
    name: string;
    email: string | null;
    role: string;
    secretariaId: number | null;
    defaultSubsystemKey: string | null;
    subsystemAccess: Array<{
      subsystemKey: string;
      accessLevel: "VIEWER" | "OPERATOR" | "MANAGER" | "ADMIN";
      isDefault: boolean;
    }>;
  }
}
```

### 7.2. Novo endpoint recomendado

Criar também:

```txt
auth.availableSubsystems
```

Ele deve retornar os subsistemas já enriquecidos com título, descrição, ícone, nível de acesso, URL de destino e indicação de padrão.

## 8. Hub pós-login

### 8.1. Onde implementar

A implementação atual já usa `SubsystemHome` para `/`. Portanto, o caminho preferencial é criar um componente de Hub e substituir este comportamento atual:

```ts
if (subsystem.key === "hub") {
  return <DashboardPage />;
}
```

por uma tela própria, por exemplo:

```ts
if (subsystem.key === "hub") {
  return <HubHome user={user} />;
}
```

Arquivo recomendado:

```txt
client/src/pages/hub-page.tsx
```

ou, se fizer mais sentido manter coeso com as homes:

```txt
client/src/app/hub-home.tsx
```

### 8.2. Layout do Hub

A página deve ter:

- saudação curta;
- busca/filtro de subsistemas;
- cards dos subsistemas liberados;
- indicação do nível de acesso;
- botão `Acessar`;
- card de último acesso, se disponível;
- empty state quando não houver subsistemas liberados.

### 8.3. Card de subsistema

Modelo:

```txt
[ícone] Licitação
Fase externa, julgamento, habilitação e recursos.
Nível: Operação
[ Acessar Licitação ]
```

### 8.4. Empty state

Se o usuário não tiver nenhum subsistema além do Hub:

```txt
Nenhum subsistema liberado
Seu login está ativo, mas ainda não possui autorização operacional.
Solicite liberação ao administrador do SIREL.
```

## 9. Alternância entre subsistemas

### 9.1. Componente

Criar componente:

```txt
client/src/components/layout/subsystem-switcher.tsx
```

Ele deve aparecer no header do shell autenticado, preferencialmente antes da busca rápida.

### 9.2. Comportamento

O componente deve listar apenas os subsistemas autorizados. Ao selecionar outro subsistema:

- em produção: navegar para `https://<subdominio>.sirel.com.br`;
- em local: navegar na mesma origem com `?subsystem=<key>`;
- não exigir novo login;
- preservar o cookie de sessão.

### 9.3. Acesso negado

Se o usuário tentar acessar um subsistema sem autorização por URL direta, exibir tela de acesso negado e link para voltar ao Hub.

## 10. Administração de permissões

### 10.1. Tela de usuários

A página `usuarios-page` deve permitir gerir:

- perfil global;
- secretaria;
- status ativo/inativo;
- matriz de subsistemas;
- nível de acesso por subsistema;
- subsistema padrão.

### 10.2. Componente de matriz

Criar componente:

```txt
client/src/components/usuarios/subsystem-access-matrix.tsx
```

Campos por linha:

```txt
[checkbox ativo] [ícone] [subsistema] [select nível] [radio padrão]
```

### 10.3. Regras de validação

- se nenhum subsistema for marcado, usuário só entra no Hub;
- somente um subsistema pode ser padrão;
- não permitir desativar `admin` para o próprio usuário logado;
- não permitir que o admin remova seu próprio acesso ao subsistema `admin`;
- para `role=admin`, a UI pode mostrar todos como liberados, mas ainda permitir gravar preferências.

## 11. Autorização backend por subsistema

Criar helpers:

```txt
getUserSubsystemAccess(userId)
canAccessSubsystem(user, subsystemKey, minimumLevel)
requireSubsystemAccess(ctx, subsystemKey, minimumLevel)
```

Ordem dos níveis:

```txt
VIEWER < OPERATOR < MANAGER < ADMIN
```

Procedures sensíveis devem continuar validando papel global quando necessário, mas também validar subsistema quando a operação pertencer a uma área específica.

## 12. UX prioritária do login

A tela de login deve ficar mais simples:

- login à direita ou centro, conforme mobile;
- bloco lateral menor;
- mensagem institucional curta;
- sem excesso de cards explicativos;
- após login, não abrir direto Dashboard; abrir Hub.

Texto sugerido:

```txt
Entrar no SIREL
Acesse com seu usuário institucional para abrir os subsistemas autorizados.
```

Botão:

```txt
Entrar e escolher ambiente
```

## 13. Critérios de aceite

A etapa estará concluída quando:

- login em `app.sirel.com.br` abre o Hub;
- Hub mostra somente subsistemas autorizados;
- usuário acessa Licitação, Planejamento ou outro subsistema sem novo login;
- header possui seletor de subsistemas;
- usuário sem acesso recebe tela de acesso negado;
- admin consegue editar permissões por usuário;
- `auth.me` retorna matriz de acesso;
- cookie compartilhado funciona em subdomínios;
- fallback local continua funcionando;
- `npm run check`, `npm run test:all` e `npm run build` passam.

## 14. Observação para o Codex

Não reimplementar a base de subsistemas já existente. Antes de criar arquivos, verificar e reutilizar:

```txt
shared/src/subsystems.ts
client/src/app/subsystem-context.tsx
client/src/app/routes.tsx
client/src/app/subsystem-home.tsx
client/src/components/layout/app-shell.tsx
server/src/lib/subsystem-context.ts
server/src/lib/request-auth.ts
```

Criar somente o que falta para esta etapa:

```txt
client/src/app/hub-home.tsx ou client/src/pages/hub-page.tsx
client/src/components/layout/subsystem-switcher.tsx
client/src/components/usuarios/subsystem-access-matrix.tsx
server/src/lib/subsystem-access.ts
migration user_subsystem_access
```

## 15. Status implementado na branch

Esta fase foi implementada mantendo a base host-aware existente.

Arquivos criados:

```txt
client/src/pages/hub-page.tsx
client/src/components/layout/subsystem-switcher.tsx
client/src/components/usuarios/subsystem-access-matrix.tsx
client/src/lib/subsystem-navigation.ts
server/src/lib/subsystem-access.ts
server/src/lib/subsystem-access.test.ts
drizzle/migrations/0051_user_subsystem_access.sql
```

Arquivos principais alterados:

```txt
shared/src/subsystems.ts
shared/src/schemas/usuarios.ts
client/src/App.tsx
client/src/app/routes.tsx
client/src/app/subsystem-home.tsx
client/src/components/layout/app-shell.tsx
client/src/lib/auth-session.ts
client/src/lib/trpc.ts
client/src/pages/usuarios-page.tsx
server/src/lib/auth-session.ts
server/src/lib/request-auth.ts
server/src/routers/auth.ts
server/src/routers/usuarios.ts
server/src/trpc.ts
server/src/db/schema.ts
drizzle/schema.ts
```

Decisões efetivas:

- `auth.login` emite cookie `sirel_session` e continua retornando token para o fallback legado;
- `auth.me` funciona mesmo quando a sessão veio somente do cookie;
- o backend aceita cookie antes de `Authorization: Bearer`;
- `localStorage` permanece apenas como transição e cache local da sessão retornada;
- a rota `/` no Hub renderiza `HubPage`, não mais o dashboard geral;
- o header autenticado tem `SubsystemSwitcher`;
- `useAllowedRoutes` filtra por matriz de acesso, `routePolicy` e papel global;
- `protectedProcedure` aplica `requireSubsystemAccess`, exceto em `auth.me`;
- admin global recebe todos os subsistemas com `ADMIN`;
- a tela de usuários administra a matriz por usuário.

Validações executadas durante a implementação:

```txt
npm run check
npm run test:all
npm run build
```

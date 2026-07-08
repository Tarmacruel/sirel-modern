# 03 — Backend: autenticação, permissões, CORS e contexto por subsistema

## 1. Objetivo da etapa

A separação por subdomínios não pode ser apenas visual. O backend deve reconhecer o subsistema de origem, registrar esse contexto em auditoria quando pertinente e aplicar autorização coerente com a área acessada.

A diretriz é manter um único backend Express + tRPC, evitando microsserviços prematuros.

## 2. Estado atual relevante

O backend já possui:

- Express;
- tRPC;
- `protectedProcedure`;
- níveis de papel: `admin`, `gestor`, `operador`, `auditor`, `user`;
- middlewares de upload que validam usuário;
- CORS configurado a partir de `CLIENT_URL`;
- autenticação por token de sessão enviado no header `Authorization: Bearer`.

A refatoração deve ampliar esse desenho sem quebrar o que já funciona.

## 3. Contexto de subsistema no backend

### 3.1. Criar helper

Criar arquivo:

```txt
server/src/lib/subsystem-context.ts
```

Conteúdo sugerido:

```ts
import type express from "express";
import { resolveSubsystemByHost, type SubsystemKey } from "@sirel/shared/subsystems";

export function resolveSubsystemFromRequest(req: express.Request) {
  const forwardedHost = String(req.headers["x-forwarded-host"] ?? "").trim();
  const host = String(req.headers.host ?? "").trim();
  const explicitHeader = String(req.headers["x-sirel-subsystem"] ?? "").trim();

  if (explicitHeader) {
    return resolveSubsystemByKeySafe(explicitHeader as SubsystemKey);
  }

  return resolveSubsystemByHost(forwardedHost || host);
}
```

### 3.2. Adicionar ao contexto tRPC

Em `server/src/_core/context.ts`, incluir:

```ts
return {
  db,
  user,
  subsystem,
  requestMeta,
};
```

Onde `subsystem` vem de `resolveSubsystemFromRequest(req)`.

### 3.3. Request metadata

Adicionar metadados úteis:

```ts
requestMeta: {
  host: req.headers.host,
  forwardedHost: req.headers["x-forwarded-host"],
  origin: req.headers.origin,
  userAgent: req.headers["user-agent"],
}
```

Não persistir dados excessivos, apenas quando necessário para auditoria.

## 4. Autorização por subsistema

### 4.1. Fase 1 — regras em código

Criar função simples:

```ts
export function requireSubsystemAccess(ctx: AppContext, subsystemKeys: SubsystemKey[]) {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Login obrigatório" });

  if (ctx.user.role === "admin") return;

  if (!subsystemKeys.includes(ctx.subsystem.key)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Recurso indisponível neste subsistema" });
  }
}
```

Essa regra valida se o recurso pertence ao subsistema atual. Não substitui papel (`role`). Ela complementa.

### 4.2. Fase 2 — tabela de permissões granulares

Se o sistema exigir controle por usuário e subsistema, criar tabela:

```ts
userSubsystemAccess
  id
  userId
  subsystemKey
  accessLevel: viewer | operator | manager | admin
  ativo
  criadoEm
  atualizadoEm
```

Não implementar essa tabela antes da primeira refatoração visual, salvo se houver demanda expressa de controle granular.

### 4.3. Nova procedure opcional

```ts
export const subsystemProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!ctx.subsystem) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Subsistema não identificado" });
  }
  return next({ ctx });
});
```

E helpers:

```ts
export function createSubsystemProcedure(keys: SubsystemKey[]) {
  return protectedProcedure.use(({ ctx, next }) => {
    requireSubsystemAccess(ctx, keys);
    return next({ ctx });
  });
}
```

## 5. CORS para múltiplos subdomínios

### 5.1. Problema

O CORS não deve permanecer permissivo em produção. Com vários subdomínios, `CLIENT_URL` deve aceitar lista separada por vírgula.

### 5.2. Variável recomendada

```env
CLIENT_URL=https://www.sirel.com.br,https://app.sirel.com.br,https://planejamento.sirel.com.br,https://compras.sirel.com.br,https://licitacao.sirel.com.br,https://contratos.sirel.com.br,https://documentos.sirel.com.br,https://workflow.sirel.com.br,https://consultas.sirel.com.br,https://admin.sirel.com.br
```

### 5.3. Implementação recomendada

```ts
function resolveAllowedOrigins() {
  return String(process.env.CLIENT_URL ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isAllowedOrigin(origin: string | undefined) {
  if (!origin) return true;
  const allowed = resolveAllowedOrigins();
  if (process.env.NODE_ENV !== "production" && /^http:\/\/localhost:\d+$/.test(origin)) return true;
  return allowed.includes(origin);
}
```

No CORS:

```ts
origin(origin, callback) {
  if (isAllowedOrigin(origin)) return callback(null, true);
  return callback(new Error("Origem não autorizada pelo SIREL"));
}
```

### 5.4. Implementação consolidada

A implementação final centraliza a regra em `server/src/lib/cors-origins.ts`.

Comportamento atual:

- `resolveAllowedOrigins(clientUrl)` continua aceitando `CLIENT_URL` como lista separada por vírgula;
- `resolveSubsystemProductionOrigins()` deriva origens HTTPS dos `hostnames` de `shared/src/subsystems.ts`;
- `isAllowedCorsOrigin()` permite origem declarada em `CLIENT_URL` ou origem oficial derivada do registry;
- em desenvolvimento, `localhost`, `127.0.0.1`, `0.0.0.0`, `::1` e quick tunnels `*.trycloudflare.com` são aceitos;
- em produção, quick tunnels e origens locais continuam bloqueados;
- a falha `Unexpected token '<', "<!DOCTYPE "... is not valid JSON` no login foi diagnosticada como CORS rejeitando a origem oficial e devolvendo HTML de erro do Express.

Essa regra evita wildcard em produção e reduz o risco de deploy com `CLIENT_URL` incompleto para os subdomínios oficiais.

## 6. API URL no frontend

O frontend deve continuar usando:

```txt
VITE_API_URL=/api/trpc
```

Quando todos os subdomínios apontarem para a mesma aplicação/tunnel, o caminho relativo é mais simples e reduz problemas de CORS.

Se backend ficar em host separado:

```txt
VITE_API_URL=https://api.sirel.com.br/api/trpc
```

Nesse caso, CORS e cookies exigem cuidado adicional.

## 7. Uploads e rotas REST

O backend possui rotas REST além do tRPC, especialmente uploads e parsers. Revisar chamadas frontend para garantir:

- envio do token `Authorization: Bearer`;
- uso de URL relativa quando possível;
- tratamento de 401 e 403;
- mensagens coerentes por subsistema;
- validação de tamanho e extensão preservada.

### 7.1. Rotas a revisar

Pesquisar no frontend por:

```txt
fetch(
axios
/api/planejamento/documentos/upload
/api/licitacao
/api/documentos
/api/*/upload
```

## 8. Auditoria por subsistema

### 8.1. Objetivo

Quando uma ação crítica for realizada, registrar o subsistema de origem pode facilitar rastreabilidade.

### 8.2. Estratégia não invasiva

Se `logAuditoria` aceitar campos livres em `dadosNovos` ou `dadosAnteriores`, incluir:

```ts
subsystemKey: ctx.subsystem?.key
```

Não alterar schema antes de revisar a tabela atual.

### 8.3. Estratégia estrutural futura

Adicionar coluna opcional:

```txt
auditoria.subsystem_key text null
```

Somente depois de avaliar migrations e impacto em relatórios.

## 9. Segurança da sessão

### 9.1. Fase 1 — manter localStorage

Vantagem:

- mudança menor;
- cada subdomínio tem seu próprio login;
- atende ao requisito visual de login separado.

Desvantagem:

- usuário fará login em cada subdomínio;
- token fica acessível a JavaScript;
- logout não é global.

### 9.2. Fase 2 — cookie HttpOnly compartilhado

Vantagem:

- sessão compartilhada entre subdomínios;
- melhor proteção contra leitura direta do token;
- logout global viável.

Exemplo de cookie:

```txt
Set-Cookie: sirel_session=...; Domain=.sirel.com.br; Path=/; HttpOnly; Secure; SameSite=Lax
```

Não implementar sem revisar o fluxo atual de autenticação e impacto no cliente tRPC.

## 10. Rotas backend por domínio

Não criar routers duplicados por subsistema. Manter:

```txt
auth
dashboard
planejamento
compras
licitacao
contratos
documentos
workflow
consultas
usuarios
parametros
auditoria
```

Mas permitir que cada router consulte `ctx.subsystem` para:

- ajustar resumos;
- limitar consultas padrão;
- registrar auditoria;
- impedir operações fora do escopo.

## 11. Healthcheck

Adicionar retorno do ambiente se útil:

```json
{
  "ok": true,
  "service": "sirel-modern-server",
  "timestamp": "...",
  "subdomainsEnabled": true
}
```

Não incluir segredos.

## 12. Definition of Done desta etapa

- backend identifica subsistema por host/header;
- contexto tRPC inclui `subsystem`;
- CORS aceita lista explícita de subdomínios;
- uploads continuam funcionando;
- procedures críticas mantêm autorização por papel;
- helpers de autorização por subsistema criados;
- nenhuma rota backend é duplicada sem necessidade;
- `npm run check` passa;
- `npm run test:server` passa;
- logs/auditoria não expõem segredos.

# 05 — Deploy, Cloudflare Tunnel, DNS e variáveis de ambiente

## 1. Objetivo

Preparar o SIREL para operar em múltiplos subdomínios, preservando a aplicação única e o backend compartilhado.

A estratégia recomendada na primeira fase é apontar todos os subdomínios para o mesmo serviço web. A aplicação identifica o subsistema pelo hostname e adapta login, shell, rotas e navegação.

## 2. Modelo recomendado de hosts

```txt
www.sirel.com.br             Hub ou painel geral
app.sirel.com.br             Hub ou painel geral alternativo
planejamento.sirel.com.br    Planejamento
compras.sirel.com.br         Compras
licitacao.sirel.com.br       Licitação
contratos.sirel.com.br       Contratos
documentos.sirel.com.br      Documentos
workflow.sirel.com.br        Workflow
consultas.sirel.com.br       Consultas e dossiês
admin.sirel.com.br           Administração
```

## 3. Estratégia com Cloudflare Tunnel

### 3.1. Serviço único

Se a aplicação local estiver exposta por Cloudflare Tunnel, configurar múltiplos ingress rules apontando para o mesmo serviço.

O perfil operacional local atual (`npm run start:tunnel`) sobe backend em `3030`, frontend Vite em `5173` e tunnel para `http://localhost:5173`. Esse modo continua valido para desenvolvimento porque o Vite faz proxy de `/api` para `http://localhost:3030`.

Exemplo conceitual para desenvolvimento:

```yaml
tunnel: <id-do-tunnel>
credentials-file: <caminho-do-credentials-json>

ingress:
  - hostname: www.sirel.com.br
    service: http://localhost:5173
  - hostname: app.sirel.com.br
    service: http://localhost:5173
  - hostname: planejamento.sirel.com.br
    service: http://localhost:5173
  - hostname: compras.sirel.com.br
    service: http://localhost:5173
  - hostname: licitacao.sirel.com.br
    service: http://localhost:5173
  - hostname: contratos.sirel.com.br
    service: http://localhost:5173
  - hostname: documentos.sirel.com.br
    service: http://localhost:5173
  - hostname: workflow.sirel.com.br
    service: http://localhost:5173
  - hostname: consultas.sirel.com.br
    service: http://localhost:5173
  - hostname: admin.sirel.com.br
    service: http://localhost:5173
  - service: http_status:404
```

Se o frontend de produção for servido pelo Express ou por servidor estático, trocar `localhost:5173` pela porta correta do serviço final.

No build de producao do monorepo, o Express tambem pode servir `client/dist` e responder `/api` no mesmo host. Nesse perfil, depois de `npm run build`, a recomendacao e apontar todos os subdominios para o servico final do backend. A porta padrao verificada nos scripts locais e `3030`; se `PORT` for alterado no ambiente de producao, usar o valor configurado no proprio ambiente.

O entrypoint compilado atual do backend fica em `server/dist/server/src/index.js`. Para execucao direta do build em um servico unico:

```bash
npm run build
node server/dist/server/src/index.js
```

Exemplo conceitual para producao em servico unico:

```yaml
tunnel: <id-do-tunnel>
credentials-file: <caminho-do-credentials-json>

ingress:
  - hostname: www.sirel.com.br
    service: http://localhost:3030
  - hostname: app.sirel.com.br
    service: http://localhost:3030
  - hostname: planejamento.sirel.com.br
    service: http://localhost:3030
  - hostname: compras.sirel.com.br
    service: http://localhost:3030
  - hostname: licitacao.sirel.com.br
    service: http://localhost:3030
  - hostname: contratos.sirel.com.br
    service: http://localhost:3030
  - hostname: documentos.sirel.com.br
    service: http://localhost:3030
  - hostname: workflow.sirel.com.br
    service: http://localhost:3030
  - hostname: consultas.sirel.com.br
    service: http://localhost:3030
  - hostname: admin.sirel.com.br
    service: http://localhost:3030
  - service: http_status:404
```

### 3.1.1. Atenção: Vite dev server em domínio oficial

Durante a validação operacional de `https://licitacao.sirel.com.br`, o domínio oficial respondeu assets de desenvolvimento do Vite (`/@vite/client` e `/src/main.tsx`). Isso é aceitável apenas para teste controlado, mas não deve ser o perfil final de produção.

Para produção estável, o túnel ou serviço público deve apontar para o Express servindo o build em `client/dist`, normalmente na porta `3030`, e não para o Vite em `5173`.

Sinais esperados de produção:

- o HTML referencia assets versionados em `/assets/...`;
- não há `/@vite/client`;
- refresh em rota profunda devolve `index.html`;
- `/api/trpc` e `/healthz` respondem no mesmo host;
- `NODE_ENV=production` bloqueia origens locais e quick tunnels.

### 3.2. Backend separado

Se o backend ficar em `localhost:3030` e o frontend em `localhost:5173`, manter proxy no Vite apenas em desenvolvimento. Em produção, preferir que `/api` seja roteado pelo mesmo host, evitando CORS desnecessário.

## 4. DNS no Cloudflare

Criar registros CNAME ou rotas de tunnel para:

```txt
www
app
planejamento
compras
licitacao
contratos
documentos
workflow
consultas
admin
```

Todos podem apontar para o mesmo tunnel.

## 5. Variáveis de ambiente

### 5.1. Backend

```env
HOST=0.0.0.0
PORT=3030
CLIENT_URL=https://www.sirel.com.br,https://app.sirel.com.br,https://planejamento.sirel.com.br,https://compras.sirel.com.br,https://licitacao.sirel.com.br,https://contratos.sirel.com.br,https://documentos.sirel.com.br,https://workflow.sirel.com.br,https://consultas.sirel.com.br,https://admin.sirel.com.br
JWT_SECRET=<definir-localmente>
DATABASE_URL=<definir-localmente>
```

O valor de `CLIENT_URL` deve conter apenas origens publicas autorizadas, separadas por virgula. Nao versionar `JWT_SECRET`, `DATABASE_URL`, tokens de tunnel, arquivos `credentials-file` nem qualquer chave real.

Além de `CLIENT_URL`, o backend também aceita as origens HTTPS derivadas dos hostnames oficiais em `shared/src/subsystems.ts`. Isso protege a operação caso `CLIENT_URL` seja publicado incompleto para um subdomínio já versionado no registry. A variável continua necessária para origens extras, homologação externa ou topologias com host dedicado.

### 5.2. Frontend

Preferir URL relativa:

```env
VITE_API_URL=/api/trpc
```

Se o backend usar host dedicado:

```env
VITE_API_URL=https://api.sirel.com.br/api/trpc
```

## 6. Desenvolvimento local

### 6.1. Opção simples

Usar query string:

```txt
http://localhost:5173/?subsystem=licitacao
http://localhost:5173/?subsystem=planejamento
http://localhost:5173/?subsystem=compras
http://localhost:5173/?subsystem=admin
```

Essa opção deve ser implementada primeiro para facilitar testes pelo Codex e pelo desenvolvedor.

### 6.2. Opção com host local

Usar aliases como:

```txt
licitacao.localhost:5173
planejamento.localhost:5173
compras.localhost:5173
admin.localhost:5173
```

Nem todos os navegadores e ambientes resolvem subdomínios de `localhost` de forma idêntica. Por isso, manter a query string como fallback oficial de desenvolvimento.

## 7. SPA fallback

Todos os hosts devem servir `index.html` para rotas internas. Exemplo:

```txt
https://licitacao.sirel.com.br/licitacao/123
```

Não pode retornar 404 do servidor. O roteamento interno é do React/Wouter.

No perfil Express de producao, o servidor entrega os assets de `client/dist` e devolve `client/dist/index.html` para requisicoes `GET`/`HEAD` que nao sejam `/api`, `/healthz` nem arquivo estatico com extensao. Isso permite refresh direto em rotas profundas como `/licitacao/123` atras do Cloudflare Tunnel.

## 8. CORS

Se API e frontend estiverem no mesmo host, CORS quase não interfere.

Se API estiver em outro host, validar lista explícita de origens.

O backend deve aceitar apenas:

```txt
https://www.sirel.com.br
https://app.sirel.com.br
https://planejamento.sirel.com.br
https://compras.sirel.com.br
https://licitacao.sirel.com.br
https://contratos.sirel.com.br
https://documentos.sirel.com.br
https://workflow.sirel.com.br
https://consultas.sirel.com.br
https://admin.sirel.com.br
```

Em desenvolvimento, aceitar `localhost`.

Também em desenvolvimento, quick tunnels `*.trycloudflare.com` são aceitos para testes manuais. Essa liberação é bloqueada quando `NODE_ENV=production`.

## 9. Sessão entre subdomínios

### 9.1. Fase 1

Manter `localStorage`. Cada subdomínio exigirá login próprio. Isso é coerente com o requisito de telas de login separadas.

### 9.2. Fase 2 opcional

Migrar para cookie compartilhado:

```txt
Domain=.sirel.com.br
Secure
HttpOnly
SameSite=Lax
```

Somente implementar após estabilizar a separação visual.

## 10. Checklist de publicação

- todos os subdomínios resolvem no Cloudflare;
- tunnel possui ingress para todos os hosts;
- `/api/trpc` responde em todos os hosts esperados;
- `/healthz` responde no backend;
- login funciona em cada subdomínio;
- refresh em rota interna não retorna 404;
- CORS não bloqueia chamadas tRPC;
- upload de documentos funciona;
- logout limpa sessão do subdomínio atual;
- nenhum segredo foi versionado.

## 11. Plano de rollback

Caso algum subdomínio apresente falha:

1. manter `www.sirel.com.br` operando como painel geral;
2. remover temporariamente o ingress do subdomínio com problema;
3. corrigir registry de subsistema ou CORS;
4. publicar novamente;
5. validar login e rota raiz.

Não alterar banco de dados na primeira etapa de deploy sem necessidade.

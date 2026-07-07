# 07 — Checklist de testes e critérios de aceite

## 1. Objetivo

Garantir que a separação por subdomínios entregue melhor experiência sem quebrar fluxos existentes do SIREL.

Este checklist deve ser executado pelo Codex e revisado manualmente antes de abrir PR ou fazer merge.

## 2. Comandos obrigatórios

Executar na raiz do projeto:

```bash
npm run check
npm run test:all
npm run build
```

Se algum comando falhar, não prosseguir para deploy.

## 3. Testes de resolução de subsistema

### 3.1. Desenvolvimento local por query string

Validar:

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

Critérios:

- cada URL resolve o subsistema correto;
- subsistema inválido cai no hub;
- o console não exibe erro de runtime;
- o título do login muda conforme o subsistema.

### 3.2. Hostname

Validar em ambiente com hosts reais ou simulação:

```txt
licitacao.sirel.com.br
planejamento.sirel.com.br
compras.sirel.com.br
admin.sirel.com.br
```

Critérios:

- o subsistema é identificado pelo hostname;
- não depende de query string em produção;
- refresh da página preserva contexto.

## 4. Testes de login

Para cada subsistema principal:

- abrir subdomínio;
- verificar título e subtítulo próprios;
- fazer login com usuário válido;
- confirmar abertura do painel correto;
- fazer logout;
- confirmar retorno ao login do mesmo subsistema.

Subsistemas mínimos para teste manual:

```txt
hub
planejamento
compras
licitacao
admin
```

Critérios:

- mutation `auth.login` continua funcionando;
- sessão é gravada sem erro;
- `auth.me` valida sessão;
- erro de senha inválida continua legível;
- logout limpa a sessão do host atual.

## 5. Testes de navegação

### 5.1. Licitação

Menu esperado:

```txt
Início
Licitações
Documentos
Prazos
Dossiês
Consultas
Notificações
```

Validar:

- abrir `/`;
- abrir `/licitacao`;
- abrir `/licitacao/:processoId`;
- abrir `/documentos` se autorizado;
- abrir `/prazos`;
- abrir `/dossie/:processoId`;
- abrir `/consultas`.

### 5.2. Planejamento

Validar:

- `/`;
- `/planejamento`;
- `/planejamento/dfd/:processoId`;
- `/planejamento/etp/:processoId`;
- `/planejamento/cotacoes/:processoId`;
- `/planejamento/tr/:processoId`;
- `/planejamento/pca`;
- `/processos/:processoId`.

### 5.3. Compras

Validar:

- `/`;
- `/compras`;
- consultas de processos;
- rotas cruzadas permitidas;
- ausência de itens administrativos indevidos.

### 5.4. Admin

Validar:

- `/usuarios`;
- `/parametros`;
- `/auditoria`;
- `/importacoes`;
- `/cadastros`.

Critério: usuário não admin não deve acessar telas administrativas, mesmo por URL direta.

## 6. Testes de rotas proibidas

Acessar uma rota fora do subsistema atual.

Exemplo:

```txt
https://licitacao.sirel.com.br/usuarios
```

Critérios:

- se usuário não for admin, exibir acesso negado;
- se rota pertence a outro subsistema, sugerir ir ao subsistema correto;
- não renderizar tela parcialmente;
- não vazar dados por carregamento prévio.

## 7. Testes de command palette

Em cada subsistema:

- abrir com `Ctrl+K`;
- buscar termos de módulos permitidos;
- buscar termos de módulos não permitidos;
- confirmar filtro por subsistema.

Critérios:

- Licitação não sugere Usuários/Parâmetros para usuário comum;
- Planejamento prioriza DFD, ETP, Cotações, TR e PCA;
- Admin mostra rotas administrativas;
- comandos globais continuam disponíveis.

## 8. Testes de permissões backend

### 8.1. tRPC

Validar que procedures protegidas continuam rejeitando usuário sem token.

Critérios:

- sem token: `UNAUTHORIZED`;
- token inválido: `UNAUTHORIZED`;
- papel insuficiente: `FORBIDDEN`;
- papel correto: sucesso.

### 8.2. Uploads REST

Testar uploads usados por Planejamento, Licitação e Documentos.

Critérios:

- sem token retorna 401;
- perfil insuficiente retorna 403;
- arquivo válido é aceito;
- arquivo inválido é rejeitado;
- upload em subdomínio não quebra CORS.

## 9. Testes de CORS

Se API estiver no mesmo host:

- verificar chamadas relativas em `/api/trpc`;
- confirmar ausência de erro de CORS.

Se API estiver em host separado:

- testar todos os subdomínios em `CLIENT_URL`;
- testar origem não permitida;
- garantir bloqueio de origem indevida.

## 10. Testes de responsividade

Testar larguras:

```txt
390px
768px
1024px
1366px
1920px
```

Critérios:

- sidebar vira drawer em mobile;
- header não ocupa altura excessiva;
- ações principais continuam acessíveis;
- cards não quebram layout;
- tabelas possuem alternativa usável ou rolagem adequada.

## 11. Testes de regressão funcional

Fluxos mínimos:

1. login;
2. abrir processo;
3. navegar para planejamento;
4. abrir DFD;
5. abrir Licitação;
6. abrir dossiê;
7. abrir documentos;
8. fazer upload;
9. consultar prazos;
10. logout.

Não validar apenas a aparência. Confirmar que dados reais carregam.

## 12. Critérios de aceite final

A entrega pode ser aceita quando:

- subdomínios carregam login contextual;
- cada subsistema tem menu reduzido;
- rota raiz mostra home própria;
- rotas proibidas não renderizam conteúdo;
- command palette é filtrada;
- CORS está formalizado;
- build e testes passam;
- operação local continua compatível;
- documentação foi atualizada;
- nenhum segredo foi versionado.

## 13. Sinais de reprovação

Não aceitar a entrega se:

- houver duplicação de páginas inteiras sem necessidade;
- `App.tsx` ficar maior ou mais confuso;
- frontend filtrar menu, mas backend permitir operação indevida;
- subdomínio quebrar refresh de rota interna;
- upload deixar de funcionar;
- `admin.sirel.com.br` ficar acessível a usuário comum;
- variáveis sensíveis forem documentadas com valores reais;
- build falhar.

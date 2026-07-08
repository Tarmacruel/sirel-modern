# 11 — Prompt Codex: Hub, login único e permissões por subsistema

## Prompt principal

```txt
Leia antes de implementar:

- docs/codex/refatoracao-subdominios/README.md
- docs/codex/refatoracao-subdominios/09-registro-da-implementacao-e-operacao-local.md, se existir no branch atual
- docs/codex/refatoracao-subdominios/10-hub-login-e-permissoes-por-subsistema.md

Objetivo:
Implementar a próxima fase da refatoração do SIREL com foco no login, Hub pós-login, sessão única entre subdomínios e permissões por subsistema.

Problema atual:
O Hub/app não deve redirecionar para uma tela vazia nem abrir diretamente um dashboard genérico. Como o SIREL está sendo reorganizado por subsistemas, a entrada autenticada deve mostrar ao usuário quais subsistemas ele pode acessar e permitir alternância entre subsistemas sem novo login.

Requisitos funcionais:

1. Após login em app.sirel.com.br ou www.sirel.com.br, abrir um Hub de subsistemas.
2. O Hub deve mostrar somente os subsistemas autorizados para o usuário.
3. Cada card de subsistema deve exibir ícone, nome, descrição curta, nível de acesso e botão de acesso.
4. O usuário deve conseguir acessar licitacao.sirel.com.br, planejamento.sirel.com.br, compras.sirel.com.br etc. sem fazer login novamente.
5. O header autenticado deve possuir um seletor de subsistemas para alternância rápida.
6. O administrador deve conseguir definir, por usuário, quais subsistemas estão liberados e com qual nível de acesso.
7. O perfil global atual deve continuar existindo, mas deve ser complementado por permissões por subsistema.
8. Usuário sem permissão para um subsistema deve receber tela de acesso negado com botão para voltar ao Hub.
9. O ambiente local deve continuar funcionando sem depender de DNS real.

Requisitos técnicos:

1. Não duplicar páginas nem criar vários projetos.
2. Preservar monorepo, tRPC, Express, Drizzle, PostgreSQL e shared.
3. Manter compatibilidade temporária com Authorization Bearer/localStorage.
4. Implementar sessão compartilhada por cookie quando em subdomínios reais.
5. Em produção, usar cookie HttpOnly, Secure, SameSite=Lax e Domain=.sirel.com.br.
6. Em ambiente local, emitir cookie sem Domain=.sirel.com.br e compatível com HTTP local.
7. O backend deve aceitar token por cookie sirel_session e por Authorization Bearer durante a transição.
8. auth.login e auth.me devem retornar matriz de subsistemas autorizados.
9. Criar ou reutilizar registry de subsistemas em shared.
10. Criar helpers backend para consulta e validação de acesso por subsistema.

Modelo de dados esperado:

Criar tabela user_subsystem_access, salvo se já existir equivalente:

- id
- user_id
- subsystem_key
- access_level
- is_default
- ativo
- observacao
- criado_por
- criado_em
- atualizado_em

Níveis de acesso:

- VIEWER
- OPERATOR
- MANAGER
- ADMIN

Regras de migração:

- não bloquear usuários existentes;
- admin global recebe acesso ADMIN a todos os subsistemas;
- gestor recebe MANAGER nos subsistemas operacionais;
- operador recebe OPERATOR nos subsistemas operacionais;
- auditor recebe VIEWER nos subsistemas de consulta/auditoria quando aplicável;
- Hub deve ser acessível a todo usuário autenticado.

Frontend esperado:

Criar ou ajustar:

- client/src/pages/hub-page.tsx
- client/src/components/layout/subsystem-switcher.tsx
- client/src/components/usuarios/subsystem-access-matrix.tsx
- client/src/lib/subsystem-navigation.ts
- client/src/lib/auth-session.ts
- client/src/pages/login-page.tsx
- client/src/App.tsx ou registry de rotas existente
- client/src/pages/usuarios-page.tsx

Backend esperado:

Criar ou ajustar:

- server/src/lib/subsystem-access.ts
- server/src/lib/auth-session.ts
- server/src/routers/auth.ts
- server/src/routers/usuarios.ts
- server/src/db/schema.ts
- drizzle/schema.ts
- nova migration Drizzle/SQL
- shared/src/schemas/usuarios.ts
- shared/src/subsystems.ts, se ainda não existir

Critérios de UX:

- login limpo e objetivo;
- botão de login: Entrar e escolher ambiente;
- Hub com cards grandes, legíveis e acionáveis;
- sem excesso de texto;
- visual institucional;
- mobile utilizável;
- seletor de subsistemas sempre visível no shell autenticado.

Critérios de segurança:

- não permitir acesso por URL direta sem permissão;
- não confiar apenas no frontend;
- não permitir que admin remova seu próprio acesso administrativo de forma acidental;
- não expor token em URL;
- não versionar segredo;
- não quebrar logout.

Testes obrigatórios:

- npm run check
- npm run test:all
- npm run build

Testes manuais mínimos:

1. login como admin;
2. Hub mostra todos os subsistemas;
3. alternar para Licitação sem novo login;
4. alternar para Planejamento sem novo login;
5. criar usuário operador com acesso apenas a Licitação;
6. logar com esse usuário;
7. Hub mostra apenas Licitação;
8. tentativa de abrir admin.sirel.com.br retorna acesso negado;
9. logout limpa cookie e localStorage legado;
10. ambiente local continua funcionando com ?subsystem=licitacao.

Entregue no final:

- resumo dos arquivos alterados;
- migrations criadas;
- decisões tomadas;
- comandos executados;
- limitações remanescentes;
- próximos passos sugeridos.
```

## Prompt de revisão após implementação

```txt
Revise a implementação do Hub, login único e permissões por subsistema.

Verifique:

1. se user_subsystem_access foi modelado corretamente;
2. se auth.login e auth.me retornam permissões por subsistema;
3. se a sessão compartilhada por cookie funciona sem expor token em URL;
4. se o Hub mostra apenas subsistemas autorizados;
5. se o seletor de subsistemas respeita permissões;
6. se usuário sem acesso recebe tela de acesso negado;
7. se admin consegue editar a matriz de permissões por usuário;
8. se o ambiente local continua operacional;
9. se npm run check, npm run test:all e npm run build passam;
10. se não houve duplicação desnecessária de páginas.

Se encontrar problemas, corrija sem alterar escopo funcional além desta etapa.
```

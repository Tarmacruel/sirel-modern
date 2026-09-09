# FOLGAS IMPLEMENTATION REPORT

## Atualização da entrega — 09/09/2026

O operador aprovou a leva e autorizou sua publicação também no Git. Destino: `origin`, repositório `Tarmacruel/sirel-modern`, branch `fase-2-seguranca-evolucoes`. O código publicado permanece no commit `f9c745882bb142948cdf9e9f026060f08133a3d2`; os commits seguintes registram a entrega e esta atualização. A confirmação do hash remoto ficará em `storage/reports/folgas-20260908/git-push-confirmation.json`.

O site, a rota `/folgas/admin` e a raiz do domínio principal responderam HTTP 200 nesta revisão. A campanha ID 1 permanece em **RASCUNHO**, com **15 participantes ativos, 2 reservas e 8 dias não úteis**, conforme leitura registrada em `git-release-state.json`. O cadastro continua disponível pelo próprio site. As alterações feitas pelo admin após a primeira publicação foram preservadas; nenhuma reserva ou pessoa foi removida para publicar no Git.

A auditoria registra uso autenticado do painel: inclusão de participantes, cadastro de dia não útil, edição da campanha e confirmação de reservas. O operador aprovou a validação. A observação automatizada do login especificamente no subdomínio não foi concluída e não é apresentada como executada. A publicação desta leva conserva o RASCUNHO autorizado; nenhuma nova abertura da campanha foi feita pelo agente.

Esta atualização prevalece sobre as contagens e pendências históricas abaixo, que descrevem o instante da implantação de 08/09. Os testes e builds aprovados continuam válidos: não houve alteração de código desde sua execução, somente atualização documental. Mudanças locais anteriores em outros módulos permanecem fora dos commits de Folgas.

Atualizado em 08/09/2026. **Rascunho publicado em https://folgas.sirel.com.br por autorização explícita do operador. A campanha oficial permanece em RASCUNHO, com cadastro de participantes pelo próprio site. A abertura das reservas não foi executada.**

## Estado inicial e final

- Instalação em execução: C:\BD_Licitação\Versões SIREL\sirel-modern.
- Branch operacional inicial/final: fase-2-seguranca-evolucoes.
- Commit operacional inicial: 74d0c2079fc94f181ee68a055f0946c9e1a977ea. Commit final de implementação/publicação: f9c745882bb142948cdf9e9f026060f08133a3d2. O commit posterior de documentação contém este relatório; o hash acima identifica o código publicado.
- Cópia isolada: C:\BD_Licitação\Versões SIREL\sirel-folgas-validation.
- Branch da implementação: feat/folgas-20260908; commit final do código: 26ff3ebe341ea9621c21e168380f86232b2ca343.
- A referência antiga beta-2.0-modern/d40bbf2 não foi usada para substituir o working tree. Todas as alterações locais anteriores foram preservadas e copiadas para a validação. O commit de Folgas contém apenas mudanças do módulo; mudanças locais de Licitação, Arquivos e autenticação permanecem fora dele.

## Reconciliação do patch

O pacote SIREL_FOLGAS_PATCH_2026-09-08 foi lido e validado contra a cópia do working tree real. O instalador original precisou de BOM UTF-8 na cópia local para execução no Windows PowerShell 5. O relatório inicial apontou quatro âncoras ausentes por mudança da arquitetura de rotas.

Os quatro pontos foram resolvidos manualmente: páginas lazy e rotas no catálogo client/src/app/routes.tsx; entrada por hostname em HomeEntry; navegação e políticas no catálogo shared/src/subsystems.ts; ícone no AppShell. App.tsx foi preservado byte a byte. Não houve substituição cega de shell ou de autenticação.

## Funcionalidades e autorização

- Mesmos users, password_hash, auth.login e contexto tRPC do SIREL. O working tree atual já usa cookie de sessão e CSRF; não foi convertido para outra autenticação e não foi criada senha exclusiva.
- Participantes podem ter vínculo a users ou a pessoas do cadastro canônico. Admin pesquisa/cria pessoa usando cadastros.save e confirma folgas por participante sem usuário. Gestor administra campanhas e usuários existentes; criação/inclusão manual por pessoa e reserva em nome de terceiros são exclusivas de admin.
- overview/setMyReservations exigem sessão válida. Identidade é obtida de ctx.user e do vínculo persistido, nunca de userId enviado pelo cliente. Não participante não recebe reservas/calendário dos outros. Usuário comum recebe datas ocupadas sem nomes/IDs dos demais usuários.
- Todas as mutações de campanha usam transação e advisory lock por campanha. Reserva também usa SELECT FOR UPDATE e UNIQUE no banco, com conflito amigável e rollback.
- Regras compartilhadas consideram todos os dias consecutivos em torno das escolhas, inclusive dias não úteis fora do intervalo. O servidor é a autoridade; o calendário reavalia imediatamente.
- Campanha aberta bloqueia mudanças de participantes e calendário. Alterações de intervalo/limites exigem fechamento prévio; impacto nas reservas é validado antes do commit, inclusive com campanha fechada.
- Auditoria cobre campanha, participação, dias não úteis, confirmação própria, confirmação pelo admin e remoção administrativa.

## Banco e backup

- PostgreSQL 16.13, banco operacional sirel_db; DATABASE_URL validada sem expor credenciais.
- Backup anterior às alterações: C:\BD_Licitação\Versões SIREL\folgas-backup-20260908\before-folgas.dump, 567.495.805 bytes. pg_restore --list passou; inventário em restore-list.txt. O schema desse backup foi efetivamente restaurado no banco isolado.
- Migration aplicada no banco operacional: 0062_sirel_folgas.sql, gerada como migration custom compatível com o journal existente e revisada antes da execução. Apenas essa migration estava pendente. Nenhum DROP, TRUNCATE, reset ou exclusão de dados existentes foi executado.
- Os snapshots antigos do repositório não acompanhavam todo o journal; uma geração automática de diff amplo não foi aplicada. O SQL aditivo foi integrado explicitamente, e os dois arquivos schema.ts receberam as cinco tabelas.
- Tabelas verificadas: folga_campanhas, folga_participantes, folga_dias_nao_uteis, folga_reservas, folga_audit_log.
- Constraints verificadas: folga_reservas_data_exclusiva_uq UNIQUE(campanha_id,data_folga), folga_reservas_participante_fk composta e demais PKs/FKs. Unicidade também exercitada por INSERT direto no PostgreSQL de testes.
- Banco de testes separado sirel_folgas_validation_20260908: somente schema e dados sintéticos. Testes não inseriram usuários sintéticos no banco operacional.
- Evidências: storage/reports/folgas-20260908/operational-migration.json e operational-campaign.json.

## Campanha oficial configurada

- ID 1, nome Folgas 7 de setembro, ano 2026; setor pretendido: Licitação.
- Datas selecionáveis: 08/09/2026 a 31/12/2026.
- Janela de escolha preparada: 08/09/2026 00:00 a 31/12/2026 23:59:59, America/Sao_Paulo. Continua bloqueada pelo status RASCUNHO; horários são ajustáveis antes da abertura.
- Máximo: 2 folgas por participante e 3 dias consecutivos sem expediente, conforme confirmação do operador.
- Dias não úteis cadastrados: 07/09, 12/10, 02/11, 15/11, 20/11, 25/12 de 2026 e 01/01/2027. Todos bloqueiam seleção e contam no cálculo. As duas bordas estão incluídas.
- Fonte nacional consultada: https://www2.camara.leg.br/legin/int/portar/2025/portaria-11-1-dezembro-2025-798422-publicacaooriginal-177242-cd-1secm.html . Nenhum ponto facultativo de outro órgão foi importado; o operador determinou inicialmente apenas os nacionais.
- A publicação foi realizada **sem pré-carga de participantes**. Na leitura final, já havia **15 participantes incluídos por ações autenticadas de admin**, com 15 eventos SET_PARTICIPANT registrados entre 20:21 e 20:22 (horário local). Essas inclusões posteriores foram preservadas; não foram executadas pelo script de implantação. O admin pode continuar pesquisando, incluindo ou criando pessoas pelo site. Reservas operacionais: zero. Evidência agregada, sem nomes ou IPs: operator-activity.json.
- Implantação inicial auditada sem atribuir falsamente a ação a um usuário. Actor nulo identifica carga operacional; payload registra a origem e as instruções do operador.

## Tunnel e publicação

- Hostname confirmado no ingress ativo: folgas.sirel.com.br -> http://localhost:5173, mesma origem de www.sirel.com.br.
- Cloudflared Windows Service, configuração remota ativa versão 22, inspecionada pela interface de métricas local. Nenhum token, identificador secreto ou configuração de credenciais é reproduzido aqui.
- O alias singular folga.sirel.com.br não existe no ingress observado; foi apenas reconhecido pelo código, sem criação de DNS.
- /api usa o proxy existente do Vite para o backend 3030. Nenhuma rota pública de PostgreSQL, backend isolado, SMB, RDP ou filesystem foi criada.
- Mecanismo atual: Vite 5173 e tsx watch 3030. A validação isolada usa Vite 5174 e API 3031, ambos em loopback. Os processos operacionais e o Tunnel foram preservados.
- Verificação HTTPS após publicação: raiz de folgas.sirel.com.br, /folgas/admin, www.sirel.com.br/ e www.sirel.com.br/folgas/admin responderam 200. Os scripts referenciados pelo HTML responderam 200. auth.me e folgas.overview retornaram 401 sem sessão, como esperado. Preflight de auth.login retornou 204 com a origem Folgas autorizada. Nove verificações aprovadas em external-public-check.json. A página de login pública foi observada no Edge. O antigo 403 de allowedHosts foi resolvido.
- Os 29 arquivos da implementação foram aplicados somente após comparar todos os arquivos operacionais afetados com o backup e conferir o candidato com o commit testado. As mudanças locais anteriores foram preservadas. Vite e tsx recarregaram pelo mecanismo existente; nenhum script de seed/reset foi executado. Manifesto e hashes em deployment.json.

## Testes executados

Comandos executados na cópia isolada e repetidos na raiz operacional após a publicação. A integração do código operacional continuou usando exclusivamente o PostgreSQL separado de testes:

| Comando | Resultado |
| --- | --- |
| npm run test --workspace server -- src/modules/folgas/rules.test.ts | 11 passaram |
| npm run test --workspace client -- src/lib/folgas-host.test.ts | 2 passaram |
| node scripts/test-folgas-integration.mjs, com ambiente privado separado | 6 passaram no PostgreSQL real |
| npm run check | passou nos três workspaces |
| npm run test:all | servidor: 129 passaram/15 pulados; cliente: 98 passaram |
| npm run build | passou shared, server e client |
| Playwright Chrome instalado | 12 cenários passaram, zero pageerror |
| Playwright Edge instalado | 12 cenários passaram, zero pageerror |
| git diff --cached --check | passou |

Os 15 pulados na suíte geral são gates de banco: os 6 de Folgas foram executados separadamente com sucesso. Os 9 de outros módulos continuaram pulados; não são apresentados como executados. Build tem aviso de chunks grandes já existente; testes têm aviso de sourcemap de dependência. Nenhum erro de TypeScript ou build permaneceu.

Smokes funcionais automatizados em navegadores reais, com inspeção visual das capturas: login atual, admin cria pessoa canônica e inclui sem conta, ponto facultativo, abertura revisada, feriado anterior, reavaliação segunda/terça e segunda/sexta, disputa simultânea em duas sessões (um sucesso/um conflito), desktop claro/escuro, mobile 390x844 sem overflow, usuário não participante, rota admin negada, gestor, raiz principal preservada e fechamento. Testes HTTP adicionais cobrem todos os exemplos obrigatórios, feriado posterior na virada do ano, autorização de todas as procedures, remoção, impacto e auditoria.

O operador dispensou explicitamente o celular fora da LAN e aceitou emulação móvel. Não houve teste físico de celular. A auditoria comprova uso administrativo autenticado no sistema publicado por 15 inclusões de participantes. A observação direta do segundo login em folgas.sirel.com.br segue pendente. Foi solicitado que ele entre com sua senha atual, sem enviá-la na conversa. A conexão de automação do navegador ficou indisponível durante a tentativa de validar a sessão existente; isso não foi contado como sucesso. Os fluxos autenticados de admin/gestor e cadastro já passaram nos smokes locais de Chrome/Edge. Capturas e logs aprovados ficam em storage/reports/folgas-20260908; nenhuma credencial temporária foi copiada para essa pasta.

## Arquivos da implementação

Todos os caminhos a seguir são relativos à cópia de validação e integram o commit 26ff3ebe341ea9621c21e168380f86232b2ca343:

- .gitignore
- client/src/app/routes.tsx
- client/src/components/layout/app-shell.tsx
- client/src/lib/entry-experience.ts
- client/vite.config.ts
- drizzle/migrations/meta/_journal.json
- drizzle/migrations/0062_sirel_folgas.sql
- drizzle/schema.ts
- server/src/db/schema.ts
- server/src/routers/index.ts
- server/src/routers/folgas.ts
- shared/package.json
- shared/src/const.ts
- shared/src/subsystems.ts
- shared/src/folgas-rules.ts
- client/src/lib/folgas-host.ts
- client/src/lib/folgas-host.test.ts
- client/src/pages/folgas-page.tsx
- client/src/pages/folgas-admin-page.tsx
- client/src/components/folgas-people-admin.tsx
- server/src/modules/folgas/rules.test.ts
- server/src/modules/folgas/integration.test.ts
- scripts/apply-folgas-schema.mjs
- scripts/test-folgas-integration.mjs
- scripts/testing/folgas-fixtures.mts
- scripts/testing/folgas-browser-smoke.mjs
- docs/FOLGAS_OPERACAO.md
- docs/TEST_PLAN_FOLGAS.md
- .env.example

Arquivos de entrega na raiz operacional: FOLGAS_IMPLEMENTATION_REPORT.md e PATCH_REPORT_FOLGAS.md. Os fontes do módulo foram publicados no commit operacional indicado acima. Alterações anteriores de outros módulos permanecem preservadas. Logs da repetição na raiz: check-operational.log, tests-operational.log, build-operational.log e integration-operational-code.log.

## Operação do rascunho e pendências antes de abrir

O operador autorizou expressamente a publicação sem participantes pré-carregados. O gate de configuração nominal prévia foi substituído, para esta publicação em RASCUNHO, pelo cadastro no próprio painel. Essa autorização não abre a campanha nem escolhe participantes automaticamente.

1. Entrar em https://folgas.sirel.com.br/folgas/admin como admin, com as credenciais atuais do SIREL. Também disponível em https://www.sirel.com.br/folgas/admin.
2. Na seção **Pessoas da Licitação**, usar **Pesquisar pessoa** e **Incluir pessoa**. Se ela não existir, usar **Cadastrar nova pessoa** e **Salvar no cadastro de pessoas**, depois incluí-la. Não é uma lista fixa. Pessoas sem conta não precisam de senha própria; admin registra suas datas após abertura.
3. Revisar os participantes já incluídos e calendário/janela de escolha. O uso administrativo autenticado está comprovado pela auditoria; a observação direta de login especificamente no subdomínio Folgas não foi concluída, sem impedir o rascunho autorizado.
4. Somente depois da configuração e dos gates de abertura, mudar a campanha para ABERTA. Nenhuma reserva foi liberada nesta entrega.

**Status: painel publicado em RASCUNHO; abertura operacional não declarada pronta.** Testes técnicos e acesso HTTPS/API sem sessão passaram. A confirmação visual de login no subdomínio e a revisão final da campanha continuam listadas, sem serem apresentadas como executadas.

## Rollback

- Para suspender a escolha, mantenha a campanha RASCUNHO/FECHADA. Para retirar o módulo publicado, reverta somente o commit de implementação indicado acima, reconciliando mudanças posteriores; preserve as tabelas e seus dados. Não retire tabelas como parte de rollback de aplicação.
- Código: backup seletivo dos arquivos anteriores e manifesto de arquivos novos em C:\BD_Licitação\Versões SIREL\folgas-backup-20260908\code-before. Patch do commit em folgas-implementation.patch; diff das mudanças locais anteriores em initial-local-changes.patch. Ao reverter depois de uma publicação, reverta somente o commit de Folgas ou reconcilie os arquivos do manifesto, preservando mudanças posteriores. Nunca use reset --hard ou restauração cega da árvore.
- Banco: não apagar tabelas nem executar down destrutivo como rollback rotineiro. Fechar a campanha e reverter aplicação preserva reservas/auditoria. Caso seja indispensável recuperação integral, restaure before-folgas.dump em **outro banco vazio**, valide os dados e reconcilie movimentações posteriores ao backup antes de alterar a conexão. Não executar pg_restore --clean contra produção.
- Tunnel: nenhuma alteração foi feita, portanto não há DNS/ingress a reverter. A origem continua o frontend já existente.

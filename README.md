# SIREL 1.0.1

Base moderna do SIREL em monorepo full-stack, preparada para operacao local e publicacao web, com foco em gestao de processos, planejamento, licitacao, documentos, contratos, workflow, auditoria e importacao de bases legadas.

## Objetivo

Versao oficial atual:

- `1.0.1`: primeira revisao oficial da linha `1.0.x`, com reforco de dossies, deduplicacao, experiencia inicial, importacoes e relatorios operacionais;
- `1.0.0`: marco inicial da publicacao oficial pronta para producao;
- proximas entregas seguem versionamento semantico em `patch`, `minor` e `major`.

O SIREL 1.0.1 consolida a substituicao da base antiga por uma arquitetura moderna, organizada para operacao on-premise, publicacao web e evolucao por modulos.

A branch `fase-2-seguranca-evolucoes` contém mudanças ainda sujeitas à
homologação doméstica e aos bloqueadores registrados no plano da Fase 2; ela não
deve ser promovida para produção enquanto esses gates permanecerem abertos.

Diretrizes atuais:

- operacao local e confiavel;
- interface em portugues do Brasil;
- responsividade nativa para desktop, tablet e smartphone;
- rastreabilidade de acoes criticas;
- crescimento modular sem reescrever o sistema inteiro a cada rodada.

## Novidades da 1.0.1

Entraram nesta revisao:

- dossie do item e dossie do fornecedor;
- navegacao cruzada entre dossies, processos, contratos, licitacao e cadastros;
- exportacao PDF/XLSX dos novos dossies;
- fila auditavel de saneamento de fornecedores vencedores importados;
- confirmacao manual e revisao em lote para saneamento de fornecedores;
- deduplicacao de itens no modulo de cadastros;
- revisao da experiencia de entrada com login, dashboard operacional, command palette e tour guiado;
- nova funcionalidade em `Documentos` para processar `Ata de Sessao` de forma avulsa;
- geracao automatica de relatorios PDF/XLSX de lotes em andamento, adjudicados, fase recursal e malsucedidos;
- parser e renderer de relatorios de ata com melhor normalizacao, logging e paginacao.

## Implementações em homologação — Fase 2

As funcionalidades abaixo estão presentes na branch `fase-2-seguranca-evolucoes`, mas continuam sujeitas à homologação. Esta seção não registra migration aplicada, ativação de DNS/túnel nem publicação em produção.

- **R2.2 — Documentos e Transparência:** a Central de Documentos passa a oferecer catálogo de classificações, busca por metadados, linhagem e versionamento, além de trilha de auditoria para alterações de classificação, acesso e publicação. O portal público previsto em `https://transparencia.sirel.com.br` é somente leitura e tem contrato próprio: mostra apenas processos ativos e publicados e documentos públicos, aprovados e sem restrição de perfil, sem expor identificadores ou dados internos.
- **Arquivos:** há um acervo interno autenticado, com navegação por pastas, índice de pesquisa, favoritos, recentes, pré-visualização e downloads por tickets temporários. Os acessos são auditáveis, o caminho é validado contra travessia de diretórios e a reindexação é reservada ao administrador. A auditoria do acervo é acessível a perfis autorizados.

As migrations aditivas `0059_documentos_classificacao_versoes.sql` e `0060_arquivos_acervo.sql` devem seguir a validação e o backup/restauração isolados antes de qualquer aplicação em banco com dados.

## Publicacao atual

- ambiente publicado: `https://www.sirel.com.br`
- operacao local continua suportada para manutencao, backup, migracao e recuperacao

## Publicacao por subdominios

A aplicacao segue o modelo de SPA unica sensivel ao host. Todos os subdominios podem apontar para o mesmo servico, e o frontend resolve o subsistema pelo hostname.

Origens esperadas para CORS em producao:

```env
CLIENT_URL=https://www.sirel.com.br,https://app.sirel.com.br,https://planejamento.sirel.com.br,https://compras.sirel.com.br,https://licitacao.sirel.com.br,https://contratos.sirel.com.br,https://documentos.sirel.com.br,https://workflow.sirel.com.br,https://consultas.sirel.com.br,https://admin.sirel.com.br
```

`transparencia.sirel.com.br` não integra essa lista: ele usa uma fronteira CORS pública, sem credenciais, e uma allowlist própria de rotas somente leitura.

Para deploy com frontend e API no mesmo host, preferir endpoint relativo:

```env
VITE_API_URL=/api/trpc
```

No desenvolvimento local, `npm run start:local` usa backend em `http://localhost:3030` e frontend em `http://localhost:5173`; o Vite fica restrito a `127.0.0.1`, sem hosts externos liberados por curinga e com CORS desabilitado. `npm run start:tunnel` preserva o `Host` público para que a interface host-aware seja selecionada; por isso, todo hostname publicado precisa constar explicitamente na allowlist do Vite. No build de producao, o Express serve `client/dist` e aplica fallback de SPA para refresh em rotas profundas.

## Documentacao operacional local

Informacoes sensiveis, credenciais, URLs internas, comandos frequentes e observacoes de recuperacao devem ficar apenas em um arquivo local nao versionado:

- `OPERACAO_LOCAL_SENSIVEL.txt`

Esse arquivo foi removido do versionamento e é ignorado pelo Git. Crie-o localmente a partir do modelo sem segredos:

```powershell
Copy-Item .\OPERACAO_LOCAL_SENSIVEL.example.txt .\OPERACAO_LOCAL_SENSIVEL.txt
```

Ele serve como referência rápida para administração do sistema e nunca deve ser enviado por chat, e-mail, anexos, issues, pull requests ou backups públicos. A remoção do arquivo não apaga o histórico: qualquer segredo que já tenha sido versionado deve ser considerado potencialmente exposto, revogado ou rotacionado no serviço de origem e atualizado nos ambientes. Registre apenas a conclusão da rotação, nunca o segredo.

## Stack

- React 19
- Tailwind CSS 4
- Wouter
- TanStack Query
- Express 4
- tRPC 11
- Drizzle ORM
- PostgreSQL
- TypeScript
- Vitest
- Python para rotinas de parser e automacao operacional

## Estrutura

- `client/`: frontend React
- `server/`: backend Express + tRPC
- `shared/`: tipos, schemas e constantes compartilhadas
- `drizzle/`: schema PostgreSQL e migrations
- `docs/`: backlog, roadmap e documentacao funcional
- `scripts/`: automacoes operacionais e utilitarios Python
- `storage/`: uploads, backups e artefatos locais

## Estado funcional atual

Ja implementado:

- autenticacao local por usuario e senha;
- perfis `admin`, `gestor`, `operador`, `auditor` e `user`;
- troca de senha pelo proprio usuario;
- redefinicao de senha por administrador;
- log local de autenticacao com eventos de login, bloqueio e senha;
- bloqueio temporario apos tentativas invalidas repetidas;
- dashboard inicial com atalhos, busca rapida e entrada operacional;
- cadastro de processos com numero SIREL automatico;
- processo regular e processo fora do fluxo;
- campo de `protocolo` nos processos;
- workflow operacional entre modulos;
- Planejamento com DFD, ETP, cotacoes preliminares e TR externo;
- catalogo de itens e selecao em formato de carrinho;
- geracao e persistencia de HTML/PDF da DFD, mapa comparativo e TR base;
- modulo de Licitacao com subetapas, licitantes, propostas, lances, recursos e documentos da fase;
- fluxo da Licitacao adaptativo por modalidade;
- inversao de fases configuravel por processo, com reordenacao visual;
- cronograma manual no modo fora do fluxo;
- checklist documental dinamico com opcao de "nao aplicavel" e justificativa;
- auditoria reforcada campo-a-campo para alteracoes fora do fluxo;
- modulo de Itens com rastreabilidade por processo e contrato;
- modulo de Importacoes para sincronizacao publica da BLL via JSON consolidado ou CSV manual;
- importacao e conciliacao de base legada, com revisao, vinculo e importacao controlada;
- reaproveitamento de dados do legado no cadastro de processos, incluindo protocolo quando disponivel;
- central de consultas com busca textual e filtros operacionais;
- busca ampliada por numero SIREL, protocolo, numero administrativo e numero do edital em Processos, Workflow, Consultas e Dashboard;
- unificacao de fornecedores duplicados sem perder vinculos em processos, cotacoes, licitacoes e contratos;
- unificacao de pessoas e servidores duplicados sem perda de vinculos operacionais;
- unificacao e deduplicacao de itens;
- saneamento auditavel de vencedores importados;
- dossie de processo, item e fornecedor;
- operação local por padrão, com backend limitado a `127.0.0.1`; qualquer exposição em rede exige configuração explícita de host e firewall restritivo.

## Fluxo de teste recomendado

1. fazer login;
2. criar um processo em `Processos`;
3. estruturar a DFD em `Planejamento`;
4. anexar o ETP externo;
5. registrar cotacoes preliminares;
6. anexar o TR externo e gerar o documento-base em HTML/PDF;
7. movimentar o processo no `Workflow`;
8. conduzir publicacao e subetapas no modulo `Licitacao`;
9. validar buscas por protocolo, administrativo e edital;
10. validar importacoes, dossies e unificacao de cadastros quando necessario;
11. em `Documentos`, testar o processamento avulso de `Ata de Sessao`.

## Operacao local

### Inicializacao guiada

`start:local` aplica migrations automaticamente. Em banco com dados, primeiro
conclua a reconstrução em banco vazio, gere e valide o backup e confira
explicitamente `DATABASE_URL`; não use este comando como primeiro teste de uma
branch recém-atualizada.

```powershell
npm run start:local
```

Esse comando:

- valida Node.js;
- instala dependencias se necessario;
- aplica migrations;
- verifica seed basico;
- executa seed quando a base estiver vazia;
- sobe backend e frontend em background;
- grava PIDs em `storage/runtime`;
- grava logs em `storage/logs`.

Comandos operacionais oficiais:

- `npm run start:local`
- `npm run start:tunnel`
- `npm run stop:local`
- `npm run reset:local`
- `npm run status:local`
- `npm run logs:local`

Atalhos de um clique na raiz do projeto:

- `SIREL_Iniciar.bat`
- `SIREL_Parar.bat`
- `SIREL_Resetar.bat`
- `SIREL_Status.bat`

Launcher oficial:

- `scripts/ops/launcher.ps1`

Regras operacionais:

- `start:local` sobe backend + frontend sem tunnel;
- `start:tunnel` sobe backend + frontend e depois inicia o cloudflared;
- `stop:local` encerra backend, frontend e tunnel com fallback por PID e porta;
- `reset:local` faz reset operacional sem tocar em banco, uploads, reports ou backups;
- `status:local` mostra sessao, PIDs, portas e logs;
- `logs:local` abre a pasta oficial de logs em `storage/logs`.

### Backup local

```powershell
npm run backup:local
```

Esse comando:

- gera dump PostgreSQL;
- compacta `storage/uploads`;
- compacta `storage/reports`;
- não inclui `.env` por padrão;
- gera `metadata.json`, `metadata.txt` e `backup.log`;
- grava checksums SHA-256 dos componentes e do pacote final;
- cria sidecars `<backup>.metadata.json` e `<backup>.sha256.txt`;
- monta um pacote `.zip` em `%LOCALAPPDATA%\SIREL\backups`;
- não configura espelhamento por padrão;
- mantém os 10 backups mais recentes no destino local;
- impede execução simultânea com arquivo de lock.

Até a criptografia AES-256-GCM da Fase 2 ser concluída, o script recusa qualquer
`MirrorRoot` e também recusa `IncludeEnv=true`. O backup deve permanecer em
armazenamento local com ACL restrita e não pode ser sincronizado manualmente com
nuvem.

Script utilizado:

- `scripts/backup-local.ps1`

### Agendamento automático do backup

Instalação da tarefa no Windows Task Scheduler:

```powershell
npm run backup:install-schedule
```

Remoção da tarefa:

```powershell
npm run backup:remove-schedule
```

Configuração padrão do agendamento:

- nome da tarefa: `SIREL Backup Automatico`
- horários: `00:00`, `12:00` e `19:00`
- retenção: `10` backups
- destino local: `%LOCALAPPDATA%\SIREL\backups`
- cópia espelhada: desativada
- execução: somente enquanto a conta configurada estiver em sessão interativa

### Restauração assistida

Validação do pacote sem aplicar alterações:

```powershell
npm run backup:restore -- -BackupArchivePath "caminho\do\sirel-backup-YYYYMMDD-HHmmss.zip"
```

Restauração efetiva do banco exige uma URL explícita para um banco vazio. O
script recusa usar `DATABASE_URL` implicitamente e não restaura uploads,
relatórios ou `.env` por padrão:

```powershell
$env:SIREL_RESTORE_TEST_DATABASE_URL = "postgresql://usuario:senha@localhost:5432/sirel_restore_test"
& .\scripts\restore-backup.ps1 -BackupArchivePath "caminho\do\sirel-backup-YYYYMMDD-HHmmss.zip" -TargetDatabaseUrl $env:SIREL_RESTORE_TEST_DATABASE_URL -Apply
```

A restauração assistida:

- valida checksums SHA-256 antes de restaurar;
- exige `metadata.status=SUCESSO` e recusa checksums ausentes, salvo confirmação explícita de backup legado;
- verifica que o banco de destino está vazio antes de aplicar o dump;
- restaura banco, `storage/uploads` e `storage/reports` somente conforme os parâmetros explícitos;
- só restaura `.env` quando `-RestoreEnv $true` for informado;
- preserva conteúdo anterior como `*.before-restore-YYYYMMDD-HHmmss` antes de sobrescrever diretórios.

`-AllowLegacyBackup` é uma exceção deliberada para pacote antigo sem status ou
checksums e exige conferência independente de origem; nunca o combine com
`-AllowOperationalTarget`.

## Banco e seed basico

Uso atual do legado:

- seed basico de cadastros;
- importacao e conciliacao de processos legados;
- apoio a saneamento e incorporacao gradual na base moderna.

Comandos uteis:

```powershell
npm run db:migrate
npm run db:check-seeded
npm run legacy:seed:basics
npm run legacy:sync
npm run check
npm run test:all
```

## Importacoes BLL

O modulo `Importacoes` trabalha com a mesma base publica consumida pelo portal:

- `https://sergiocarneiro-adm.github.io/licitacao/dados.json`
- `https://sergiocarneiro-adm.github.io/licitacao/dados_compra_direta.json`

Modos disponiveis:

- sincronizacao remota por JSON publico;
- importacao manual por dois CSVs: `registros` + `itens`.

Rotina automatica:

- executa pela manha no servidor local;
- padrao: `07:00`, fuso `America/Sao_Paulo`;
- grava execucoes e acervo importado no banco local.

Variaveis de ambiente:

```env
IMPORT_BLL_AUTOMATICA=true
IMPORT_BLL_DAILY_HOUR=7
IMPORT_BLL_TIMEZONE=America/Sao_Paulo
```

## Ambiente

Exemplo de `.env`:

```env
DATABASE_URL=postgresql://sirel_user:senha_segura@localhost:5432/sirel_db
TEST_DATABASE_URL=postgresql://sirel_test_user:senha_segura@localhost:5432/sirel_test_db
RUN_DB_INTEGRATION_TESTS=false
HOST=127.0.0.1
PORT=3030
CLIENT_URL=http://localhost:5173
VITE_API_URL=/api/trpc
JWT_SECRET=
ARQUIVOS_ENABLED=true
ARQUIVOS_ROOT=D:\Dados\SIREL-Arquivos
ARQUIVOS_HOSTNAME=arquivos.sirel.com.br
ARQUIVOS_TICKET_SECRET=
SIREL_DEFAULT_PASSWORD=defina_localmente
SIREL_ADMIN_USERNAME=usuario_admin
SIREL_ADMIN_NAME=Nome do Administrador
SIREL_ADMIN_EMAIL=admin@dominio.local
IMPORT_BLL_AUTOMATICA=true
IMPORT_BLL_DAILY_HOUR=7
IMPORT_BLL_TIMEZONE=America/Sao_Paulo
```

Observacoes:

- gere `JWT_SECRET` localmente com pelo menos 32 caracteres aleatórios; a aplicação recusa iniciar com valor ausente ou curto;
- `TEST_DATABASE_URL` deve apontar para banco vazio e diferente de `DATABASE_URL`; a execução integrada recusa a mesma identidade de host, porta e banco;
- valores reais de producao, credenciais operacionais, chaves e procedimentos de recuperacao devem ficar apenas no arquivo local `OPERACAO_LOCAL_SENSIVEL.txt`;
- `ARQUIVOS_ROOT` deve apontar para o acervo autorizado; configure `ARQUIVOS_TICKET_SECRET` com valor forte fora do repositório, preferencialmente distinto de `JWT_SECRET`;
- nao documente segredos diretamente no Git, em issues, PRs, prints ou mensagens publicas;
- a importação legada exige `SIREL_DEFAULT_PASSWORD` (mínimo de 12 caracteres), `SIREL_ADMIN_USERNAME` e `SIREL_ADMIN_NAME`; `SIREL_ADMIN_EMAIL` é opcional e não há senha, usuário ou e-mail administrativo de fallback;
- `HOST` fica limitado a `127.0.0.1` por padrão. Para expor o backend na rede local, configure outro host de forma explícita e restrinja o firewall;
- copie `OPERACAO_LOCAL_SENSIVEL.example.txt` para o arquivo local ignorado pelo Git antes de registrar informações operacionais. Nunca versionar esse arquivo ou segredos reais.

## Scripts principais

- `npm run dev`
- `npm run dev:client`
- `npm run dev:server`
- `npm run build`
- `npm run check`
- `npm run test`
- `npm run test:all`
- `npm run db:generate`
- `npm run db:migrate`
- `npm run db:check-seeded`
- `npm run db:sync-journal`
- `npm run legacy:export`
- `npm run legacy:import`
- `npm run legacy:import:basics`
- `npm run legacy:seed:basics`
- `npm run legacy:sync`
- `npm run legacy:sync:full`
- `npm run start:local`
- `npm run start:tunnel`
- `npm run stop:local`
- `npm run reset:local`
- `npm run status:local`
- `npm run logs:local`
- `npm run backup:local`
- `npm run backup:install-schedule`
- `npm run backup:remove-schedule`
- `npm run backup:restore -- -BackupArchivePath "caminho/do/backup.zip"`
- `npm run ata-sessao:process -- --input "caminho/do/arquivo.pdf"`

## Roadmap resumido

Frentes prioritarias em andamento:

- design system institucional e acessibilidade;
- painel de prazos e alertas locais;
- central de documentos com metadados e busca;
- relatorios gerenciais e exportacoes;
- auditoria expandida por evento e por alteracao;
- preparacao tecnica para busca semantica e assistente de IA;
- rotinas operacionais de publicacao e endurecimento do ambiente web.

Detalhamento:

- `docs/backlog-beta-2.md`
- `docs/roadmap-beta-2.md`

## Validacao executada

Validacoes tecnicas mais recentes:

- `npm run check`
- `npm run build`
- `npm run test:all`

## Proximas entregas

- painel de prazos e alertas;
- relatorios operacionais locais;
- reforco de seguranca com recuperacao de senha, envio de e-mail e politicas adicionais;
- evolucao do design system com tema institucional azul royal.

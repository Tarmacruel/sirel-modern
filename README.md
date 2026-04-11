# SIREL 1.0.1

Base moderna do SIREL em monorepo full-stack, preparada para operacao local e publicacao web, com foco em gestao de processos, planejamento, licitacao, documentos, contratos, workflow, auditoria e importacao de bases legadas.

## Objetivo

Versao oficial atual:

- `1.0.1`: primeira revisao oficial da linha `1.0.x`, com reforco de dossies, deduplicacao, experiencia inicial, importacoes e relatorios operacionais;
- `1.0.0`: marco inicial da publicacao oficial pronta para producao;
- proximas entregas seguem versionamento semantico em `patch`, `minor` e `major`.

O SIREL 1.0.1 consolida a substituicao da base antiga por uma arquitetura moderna, organizada para operacao on-premise, publicacao web e evolucao por modulos.

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
- geracao automatica de relatorios PDF/XLSX de lotes adjudicados, em habilitacao e malsucedidos;
- parser e renderer de relatorios de ata com melhor normalizacao, logging e paginacao.

## Publicacao atual

- ambiente publicado: `https://www.sirel.com.br`
- operacao local continua suportada para manutencao, backup, migracao e recuperacao

## Documentacao operacional local

Informacoes sensiveis, credenciais, URLs internas, comandos frequentes e observacoes de recuperacao devem ficar apenas em um arquivo local nao versionado:

- `OPERACAO_LOCAL_SENSIVEL.txt`

Esse arquivo e mantido fora do Git e serve como referencia rapida para administracao do sistema.

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
- operacao em rede local, com frontend e backend escutando em `0.0.0.0`.

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

```powershell
npm run start:local
```

Esse comando:

- valida Node.js;
- instala dependencias se necessario;
- aplica migrations;
- verifica seed basico;
- executa seed quando a base estiver vazia;
- sobe frontend e backend em desenvolvimento.

Script equivalente:

- `Iniciar_SIREL_Local.ps1`

Script legado de conveniencia:

- `Iniciar_SIREL_Beta_2.bat`

### Backup local

```powershell
npm run backup:local
```

Esse comando:

- gera dump PostgreSQL;
- compacta `storage/uploads`;
- compacta `storage/reports`;
- inclui uma cópia do `.env` como `.env.backup`;
- gera `metadata.json`, `metadata.txt` e `backup.log`;
- grava checksums SHA-256 dos componentes e do pacote final;
- cria sidecars `<backup>.metadata.json` e `<backup>.sha256.txt`;
- monta um pacote `.zip` em `storage/backups/`;
- espelha o pacote em `C:\Users\078364\OneDrive\BACKUPS`;
- mantém os 10 backups mais recentes nos dois destinos;
- impede execução simultânea com arquivo de lock.

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
- destino local: `storage/backups`
- cópia espelhada: `C:\Users\078364\OneDrive\BACKUPS`

### Restauração assistida

Validação do pacote sem aplicar alterações:

```powershell
npm run backup:restore -- -BackupArchivePath "caminho\do\sirel-backup-YYYYMMDD-HHmmss.zip"
```

Restauração efetiva:

```powershell
npm run backup:restore -- -BackupArchivePath "caminho\do\sirel-backup-YYYYMMDD-HHmmss.zip" -Apply
```

A restauração assistida:

- valida checksums SHA-256 antes de restaurar;
- restaura banco, `storage/uploads` e `storage/reports` conforme os parâmetros;
- só restaura `.env` quando `-RestoreEnv $true` for informado;
- preserva conteúdo anterior como `*.before-restore-YYYYMMDD-HHmmss` antes de sobrescrever diretórios.

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
HOST=0.0.0.0
PORT=3030
CLIENT_URL=http://localhost:5174
VITE_API_URL=http://localhost:3030/api/trpc
JWT_SECRET=troque_esta_chave
SIREL_DEFAULT_PASSWORD=defina_localmente
SIREL_ADMIN_USERNAME=usuario_admin
SIREL_ADMIN_NAME=Nome do Administrador
SIREL_ADMIN_EMAIL=admin@dominio.local
IMPORT_BLL_AUTOMATICA=true
IMPORT_BLL_DAILY_HOUR=7
IMPORT_BLL_TIMEZONE=America/Sao_Paulo
```

Observacoes:

- valores reais de producao, credenciais operacionais, chaves e procedimentos de recuperacao devem ficar apenas no arquivo local `OPERACAO_LOCAL_SENSIVEL.txt`;
- nao documente segredos diretamente no Git, em issues, PRs, prints ou mensagens publicas;
- o bootstrap legado ainda aceita `BETA_DEFAULT_PASSWORD`, `BETA_ADMIN_USERNAME`, `BETA_ADMIN_NAME` e `BETA_ADMIN_EMAIL` como fallback de compatibilidade.

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

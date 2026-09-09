# SIREL Folgas — operação

O módulo usa `auth.login`, `users`, hash de senha, sessão e contexto tRPC existentes. Nesta instalação o SIREL já usa cookie de sessão e CSRF; nenhum mecanismo de autenticação foi substituído. Pessoas sem usuário são vinculadas ao cadastro canônico `pessoas` e têm suas reservas registradas pelo admin, sem receber senha própria de Folgas.

## Campanha e participantes

1. Acesse `/folgas/admin` com admin/gestor. Crie em RASCUNHO, defina datas selecionáveis, período de escolha, limite por pessoa e máximo de dias consecutivos.
2. Inclua somente as pessoas de Licitação. Admin pode pesquisar ou criar uma pessoa no cadastro existente; gestor pode incluir usuários existentes. Criar pessoa não cria usuário.
3. Cadastre os dias institucionais sem expediente, inclusive imediatamente antes/depois do intervalo. O cadastro de 2026 considera 07/09/2026 e 01/01/2027. Não há importação automática de feriados.
4. Revise participantes e calendário e marque a confirmação antes de abrir. A API impede abertura sem participantes ou sem período de escolha.
5. Para mudar calendário, participantes, períodos ou limites, feche primeiro. Alterações que invalidariam reservas são recusadas, inclusive com a campanha fechada. Remova administrativamente as reservas afetadas e revise antes de reabrir.

O limite oficial confirmado para esta campanha é 2 folgas por pessoa e, por padrão, 3 dias consecutivos sem expediente. Fins de semana, feriados e pontos facultativos contam na sequência. Quinta + sexta, segunda + terça, sexta + segunda seguinte e 08/09/2026 são bloqueados nas condições documentadas nos testes. Segunda + sexta na mesma semana neutra é permitida.

## Relatório geral em PDF

Em `/folgas/admin`, selecione a campanha e clique em **Baixar relatório PDF**. Admin e gestor podem exportar; usuários comuns não recebem esse relatório com nomes de outras pessoas. O botão usa a sessão e o CSRF existentes.

O PDF A4 inclui identificação institucional, nome/status/período da campanha, emissão no horário de Brasília, participantes com folgas, total de reservas, limite por participante e tabela cronológica com data, dia da semana, nome e ordem da folga. Pessoas sem conta também constam quando têm reservas registradas pelo admin. Nomes longos quebram linha e relações extensas continuam em páginas numeradas com cabeçalho repetido. Campanha sem reservas gera um documento com a indicação correspondente.

O documento mostra apenas reservas persistidas no momento da emissão, inclusive quando a campanha está em RASCUNHO ou FECHADA; escolhas ainda não confirmadas não entram. Baixar novamente atualiza os dados. A exportação não modifica reservas, não abre a campanha e não grava o PDF em uma pasta pública. A resposta é gerada sob demanda pelo servidor e marcada `Cache-Control: no-store`.

Reservas só existem após confirmação. Cada data é exclusiva dentro da campanha. O servidor serializa alterações com transação e advisory lock; PostgreSQL também aplica `UNIQUE(campanha_id, data_folga)`. Usuários comuns não recebem nomes dos demais participantes nas datas ocupadas.

## Schema

A migration definitiva é `drizzle/migrations/0062_sirel_folgas.sql`, integrada ao journal existente. Antes de `npm run db:migrate`, faça e valide backup PostgreSQL e revise todas as migrations pendentes. A migration é aditiva; não há reset de produção.

`scripts/apply-folgas-schema.mjs` é apenas bootstrap idempotente das tabelas ausentes, usando o mesmo SQL. Ele não substitui o journal de migrations nem atualiza automaticamente uma tabela antiga divergente. Não execute bootstrap sobre schema divergente sem reconciliação.

As cinco tabelas são `folga_campanhas`, `folga_participantes`, `folga_dias_nao_uteis`, `folga_reservas` e `folga_audit_log`. As FKs preservam o vínculo a usuários e pessoas; exclusões de identidade com participantes vinculados são conservadoramente restringidas.

## Host e serviço

`folgas.sirel.com.br/` abre Folgas após login; `/folgas` e `/folgas/admin` também funcionam no domínio principal. A raiz principal conserva a entrada Hub/Dashboard existente. Deep links permanecem registrados no catálogo real de rotas.

O Tunnel ativo nesta máquina é gerenciado remotamente pelo Cloudflare. A configuração ativa versão 22 aponta `folgas.sirel.com.br` para `http://localhost:5173`, a mesma origem do frontend SIREL. O proxy Vite mantém `/api` para o backend existente. O alias singular é reconhecido pelo código, mas não existe no ingress observado; não foi criado DNS.

Não use o script de inicialização sem revisar seu comportamento: a versão local de `scripts/ops/start-dev.ps1` pode executar seed legado com reset se a verificação de dados falhar. Para uma atualização do serviço já em execução, preserve seus processos Vite/tsx e valide o reload; não execute seed ou reset.

## Fontes do calendário

Calendário nacional adotado conforme orientação do operador: Independência (07/09), Nossa Senhora Aparecida (12/10), Finados (02/11), Proclamação da República (15/11), Consciência Negra (20/11), Natal (25/12) e Confraternização Universal (01/01, na borda seguinte).

Referência oficial consultada: [calendário de 2026 publicado pela Câmara dos Deputados](https://www2.camara.leg.br/legin/int/portar/2025/portaria-11-1-dezembro-2025-798422-publicacaooriginal-177242-cd-1secm.html). Os pontos facultativos próprios da Câmara não foram importados para o Município. O admin pode cadastrar determinações municipais posteriores.

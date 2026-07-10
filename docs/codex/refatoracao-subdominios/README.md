# Refatoração SIREL por subsistemas e subdomínios

Este pacote de documentação orienta a refatoração do SIREL Modern para uma arquitetura de experiência separada por subsistemas, preservando o monorepo atual, o backend compartilhado, os tipos compartilhados e a base de dados única.

## Objetivo executivo

Transformar o SIREL de uma experiência única e concentrada em `sirel.com.br` para uma experiência modular, com telas de entrada e navegação direcionadas por subdomínio:

- `app.sirel.com.br` ou `www.sirel.com.br`: portal inicial / hub institucional;
- `planejamento.sirel.com.br`: DFD, ETP, cotações preliminares, TR e PCA;
- `compras.sirel.com.br`: compras, mapa comparativo, pesquisa de preços, importações pertinentes;
- `licitacao.sirel.com.br`: fase externa, julgamento, habilitação, recursos, atas, publicações e acompanhamento por modalidade;
- `contratos.sirel.com.br`: contratos, vigências, aditivos, saldos e fiscalizações;
- `documentos.sirel.com.br`: geração, processamento, modelos, anexos, atas e relatórios documentais;
- `workflow.sirel.com.br`: tramitação entre setores, pendências e movimentações;
- `consultas.sirel.com.br`: consultas, dossiês, rastreabilidade e pesquisa transversal;
- `admin.sirel.com.br`: usuários, parâmetros, auditoria e configurações restritas.

A prioridade não é criar vários projetos independentes. A prioridade é **separar a visão operacional**, mantendo código, autenticação, API, tipos e componentes reutilizáveis.

## Diretriz principal para o Codex

Não reescrever o sistema inteiro. Executar a refatoração em camadas:

1. criar registro de subsistemas;
2. detectar o subsistema pelo hostname;
3. adaptar login e shell por subsistema;
4. filtrar rotas, menus, command palette e atalhos;
5. reduzir textos e excesso cognitivo;
6. preservar links profundos e fluxo entre módulos;
7. endurecer autorização no frontend e no backend;
8. preparar configuração de deploy, Cloudflare e CORS;
9. validar com testes e checklist operacional.

## Arquivos deste pacote

1. [`00-diagnostico-e-premissas.md`](./00-diagnostico-e-premissas.md)  
   Diagnóstico do estado atual, premissas técnicas e riscos.

2. [`01-arquitetura-alvo.md`](./01-arquitetura-alvo.md)  
   Desenho da arquitetura alvo, estratégia de subdomínios, registry de subsistemas e decisões de fronteira.

3. [`02-frontend-rotas-shell-login.md`](./02-frontend-rotas-shell-login.md)  
   Refatoração do frontend: App, rotas, shell, login, navegação, command palette e experiência visual.

4. [`03-backend-auth-permissoes.md`](./03-backend-auth-permissoes.md)  
   Ajustes no backend: contexto de subsistema, autorização, CORS, uploads e trilha de auditoria.

5. [`04-design-system-ux-iconografia.md`](./04-design-system-ux-iconografia.md)  
   Diretrizes de UX, iconografia, redução de textos, botões de ação, cards e linearidade operacional.

6. [`05-deploy-cloudflare-subdominios.md`](./05-deploy-cloudflare-subdominios.md)  
   Configuração de ambiente, Cloudflare Tunnel, hosts, variáveis `.env` e CORS.

7. [`06-plano-de-execucao-por-etapas.md`](./06-plano-de-execucao-por-etapas.md)  
   Plano incremental para o agente de código, com Definition of Done por etapa.

8. [`07-checklist-testes-e-criterios-aceite.md`](./07-checklist-testes-e-criterios-aceite.md)  
   Testes obrigatórios, regressão funcional, validação de segurança e critérios de aceite.

9. [`08-prompts-codex.md`](./08-prompts-codex.md)  
   Prompts prontos para orientar o Codex em cada fase.

10. [`09-registro-implementacao-operacao-local.md`](./09-registro-implementacao-operacao-local.md)
    Registro final da implementação, ajustes fora do plano inicial, validações executadas, contexto operacional local e próximos passos.

11. [`10-hub-login-e-permissoes-por-subsistema.md`](./10-hub-login-e-permissoes-por-subsistema.md)
    Próxima fase: Hub pós-login, sessão única entre subdomínios, matriz de permissões por usuário e alternância de subsistemas sem novo login.

12. [`11-prompt-codex-hub-login-permissoes.md`](./11-prompt-codex-hub-login-permissoes.md)
    Prompt operacional para o Codex implementar o Hub, o login único e as permissões por subsistema.

13. [`12-licitacao-processo-ux-guiado.md`](./12-licitacao-processo-ux-guiado.md)
    Plano de refatoração UX da página interna do processo licitatório, com foco em fluxo guiado, próxima ação e redução de carga cognitiva.

14. [`13-prompt-codex-licitacao-processo-ux.md`](./13-prompt-codex-licitacao-processo-ux.md)
    Prompt operacional para o Codex executar a refatoração da página `/licitacao/:processoId?fase=...`.

15. [`14-licitacao-hub-modalidades.md`](./14-licitacao-hub-modalidades.md)
    Plano do Hub de modalidades da Licitação, com entrada compacta por equipe/modalidade e redirecionamento para filas filtradas.

16. [`15-prompt-codex-licitacao-hub-modalidades.md`](./15-prompt-codex-licitacao-hub-modalidades.md)
    Prompt operacional para o Codex implementar a tela inicial de Licitação por modalidade.

17. [`16-licitacao-fases-compactacao-dark-mode.md`](./16-licitacao-fases-compactacao-dark-mode.md)
    Segunda rodada de UX da página do processo, com compactação das fases, fila de evidências, publicação progressiva e revisão do modo escuro.

18. [`17-prompt-codex-licitacao-compactacao-dark-mode.md`](./17-prompt-codex-licitacao-compactacao-dark-mode.md)
    Prompt operacional para implementar a compactação das fases e os novos tokens semânticos de contraste.

19. [`18-licitacao-fluxo-documental-por-fase.md`](./18-licitacao-fluxo-documental-por-fase.md)
    Reorganização funcional dos documentos por fase e modalidade, novas etapas, ordem sequencial e modo orientativo temporário.

20. [`19-prompt-codex-licitacao-fluxo-documental.md`](./19-prompt-codex-licitacao-fluxo-documental.md)
    Prompt operacional para implementar o novo fluxo documental, publicação contextual, parser de ata e avanço sem bloqueios.

21. [`20-cadastros-institucionais-designacoes.md`](./20-cadastros-institucionais-designacoes.md)
    Catálogo reutilizável de comissões, equipes de apoio, ordenadores e atos, com seleção sistêmica na fase de Preparação.

22. [`21-prompt-codex-cadastros-institucionais.md`](./21-prompt-codex-cadastros-institucionais.md)
    Prompt operacional para implementar os cadastros institucionais, versionamento, snapshots e integração com o dossiê.

## Estado implementado e ajustes pós-plano

A implementação consolidada manteve a estratégia **Single SPA host-aware**, com registry central em `shared/src/subsystems.ts`, contexto React em `client/src/app/subsystem-context.tsx`, registry tipado de rotas em `client/src/app/routes.tsx`, home contextual em `client/src/app/subsystem-home.tsx` e contexto de subsistema no backend em `server/src/lib/subsystem-context.ts`.

Durante os testes em ambiente oficial, foram registrados ajustes adicionais ao plano original:

- o CORS de produção passou a aceitar, sem wildcard, as origens HTTPS derivadas dos hostnames oficiais cadastrados no registry de subsistemas;
- `CLIENT_URL` continua suportado como lista explícita de origens autorizadas, mas não é mais o único ponto de verdade para os subdomínios oficiais;
- em desenvolvimento, `localhost` e quick tunnels `*.trycloudflare.com` são aceitos apenas fora de produção;
- `Cadastros` e `Relatórios` foram liberados como módulos transversais em todos os subsistemas;
- `Importações` foi liberado também no subsistema de Licitação;
- a rota `/cadastros` foi aberta no guard frontend para todos os subsistemas, mantendo as permissões reais de consulta, edição e remoção nas procedures do backend.

## Fase adicional implementada: Hub, sessão única e permissões

A fase de Hub pós-login e permissões por subsistema foi incorporada ao plano original. O login no Hub passa a abrir uma grade de subsistemas autorizados, a sessão pode atravessar subdomínios por cookie `sirel_session`, e `auth.login`/`auth.me` retornam a matriz de acesso do usuário.

Arquivos principais adicionados ou alterados nesta fase:

- `client/src/pages/hub-page.tsx`;
- `client/src/components/layout/subsystem-switcher.tsx`;
- `client/src/components/usuarios/subsystem-access-matrix.tsx`;
- `client/src/lib/subsystem-navigation.ts`;
- `server/src/lib/subsystem-access.ts`;
- `drizzle/migrations/0051_user_subsystem_access.sql`.

O `localStorage` e o header `Authorization: Bearer` foram preservados como fallback de transição, mas o backend também aceita o cookie HttpOnly. Em produção, o cookie usa `Secure`, `SameSite=Lax` e `Domain=.sirel.com.br` quando a request vem de `sirel.com.br` ou subdomínios oficiais. Em ambiente local, o cookie é emitido sem `Domain` e compatível com HTTP.

## Nova frente: UX interna do processo licitatório

Após a separação por subsistemas e o Hub, a próxima frente é reduzir a complexidade interna da página do processo licitatório. A rota `/licitacao/:processoId?fase=...` deve evoluir para um posto de comando guiado por etapa, com cabeçalho compacto, stepper legal, próxima ação evidente, assistente contextual e área de trabalho focada apenas na fase ativa.

## Nova frente: Hub de modalidades da Licitação

A entrada `/licitacao` deve funcionar como um hub de trabalho por modalidade/equipe, antes de abrir a listagem. O usuário deve escolher entre Credenciamentos, Dispensas, Inexigibilidades, Pregões, Concorrências, Atas/Adesões ou Todos, e então visualizar a fila já filtrada.

## Nova frente: compactação operacional e modo escuro

A segunda rodada da página interna deve reduzir o empilhamento de painéis, transformar a trilha de fases em um rail compacto, substituir formulários repetidos por fila de evidências com editor único e corrigir os estados visuais do modo escuro por meio de tokens semânticos próprios.

## Nova frente: fluxo documental por fase e modalidade

O catálogo atual que mistura todos os documentos na fase externa deve ser substituído por requisitos vinculados a fases específicas. Publicação deve variar por modalidade; Disputa deve concentrar a ata provisória e o parser; Julgamento, Habilitação, Recursos, Controle Interno e Homologação passam a possuir filas próprias. Durante a implantação, o fluxo funcionará em modo orientativo, permitindo avanço com pendências e sem justificativa obrigatória.

## Nova frente: catálogos institucionais

Os decretos de comissão, equipe de apoio e ordenador deixam de ser uploads repetidos e passam a ser atos institucionais reutilizáveis. A fase de Preparação seleciona estruturas previamente cadastradas, registra composição, vigência e snapshot histórico e disponibiliza os atos no dossiê por referência.

## Regra de ouro

A mudança deve ser feita por isolamento de contexto, não por duplicação de código. O mesmo backend pode continuar respondendo em `/api/trpc`; o mesmo pacote `shared` deve continuar concentrando tipos e constantes; os componentes genéricos devem ser reutilizados; e as páginas existentes devem ser gradualmente encapsuladas por subsistema.

## Resultado esperado

Ao final da refatoração, o usuário que acessa `licitacao.sirel.com.br` não deve ser exposto ao mesmo volume de informações de Planejamento, Compras, Contratos, Cadastros e Administração. Ele deve ver uma tela de login própria, linguagem própria, ícones próprios, atalhos próprios e fluxo linear da licitação. O mesmo padrão deve ocorrer para os demais subsistemas.

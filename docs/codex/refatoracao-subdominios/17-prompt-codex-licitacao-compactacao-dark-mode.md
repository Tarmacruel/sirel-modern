# 17 — Prompt Codex: compactação das fases e modo escuro

## Prompt principal

```txt
Leia antes de implementar:

- docs/codex/refatoracao-subdominios/09-registro-implementacao-operacao-local.md
- docs/codex/refatoracao-subdominios/12-licitacao-processo-ux-guiado.md
- docs/codex/refatoracao-subdominios/16-licitacao-fases-compactacao-dark-mode.md
- client/src/pages/licitacao-processo-page.tsx
- client/src/styles/variables.css
- todos os componentes atuais em client/src/components/licitacao/processo, se existirem

Objetivo:
Executar a segunda rodada de UX da página do processo licitatório, reduzindo altura, rolagem, repetição e cansaço cognitivo, além de corrigir contraste e semântica visual no modo escuro.

Contexto:
A rodada anterior já criou uma experiência guiada com cabeçalho, fases, próxima ação, assistente e auditoria. Não descarte essa estrutura. O problema atual é que ainda existem muitas camadas verticais antes da operação real, cards de fase altos, estados visuais ambíguos, formulários de evidência repetidos e cores claras vazando no dark mode.

Antes de alterar:

1. Inspecione o worktree atual.
2. Localize componentes já criados, como:
   - LicitacaoProcessHeader
   - LicitacaoPhaseStepper
   - LicitacaoNextActionCard
   - LicitacaoContextAssistant
   - LicitacaoAuditDrawer
3. Refatore componentes existentes em vez de criar duplicatas.
4. Não suponha que o estado remoto antigo representa a implementação local mais recente.

Escopo obrigatório:

1. Compactar o topo da página.
2. Reorganizar a trilha de fases.
3. Corrigir o modo escuro.
4. Substituir formulários repetidos de evidência por fila compacta com editor único.
5. Simplificar a fase de Publicação com divulgação progressiva.
6. Preservar integralmente queries, mutations, uploads e regras de negócio.

Parte A — Tema e estados semânticos

Crie tokens para:

- phase-current
- phase-completed
- phase-viewing
- phase-available
- phase-blocked
- notice-warning
- notice-success
- surface-base/shell/panel/card/raised/hover/selected

Implemente versões coerentes em claro e escuro.

Não dependa de classes como `bg-emerald-50`, `bg-amber-50`, `text-emerald-700` ou equivalentes em componentes que precisam funcionar nos dois temas.

Corrija especialmente:

- cards concluídos claros demais no dark mode;
- alertas de sucesso quase brancos;
- bordas com contraste baixo;
- textos muted pouco legíveis;
- estado selecionado parecido com disponível;
- estado bloqueado excessivamente apagado.

Critérios mínimos:

- contraste de texto normal >= 4.5:1;
- contraste de controles/ícones/bordas importantes >= 3:1;
- foco de teclado visível;
- estado comunicado por ícone/rótulo além da cor.

Parte B — Barra compacta do processo

Unifique cabeçalho do processo e auditoria em uma barra compacta.

Mostrar:

- processo;
- modalidade;
- secretaria;
- fase atual;
- responsável;
- pendências;
- Dossiê;
- Documentos;
- Histórico;
- Fora do fluxo/Auditoria;
- Voltar à fila.

A auditoria deve virar botão/badge que abre drawer ou popover. Não manter faixa amarela grande permanentemente aberta.

Parte C — Phase rail

Transforme o stepper/card atual em trilho compacto de 52–72 px.

Estados únicos:

- completed
- current
- viewing
- available
- blocked

Regras:

1. Ao abrir, viewing = current.
2. Se o usuário navegar para etapa concluída, mostrar `Visualizando etapa concluída` e botão `Voltar para etapa atual`.
3. Não exibir `selecionada` e `em execução` sem distinção clara.
4. Pendências devem aparecer como contador curto.
5. Mobile deve usar scroll horizontal e scroll-snap.

Parte D — Próxima ação

Transforme o card grande em toolbar compacta.

O botão principal deve abrir a pendência ou seção específica, não apenas rolar genericamente.

Exemplos:

- `Resolver primeira pendência`
- `Abrir disputa`
- `Concluir homologação`
- `Encaminhar para Contratos`

Parte E — Fila compacta de evidências

Na fase externa/disputa, substitua os vários cards completos por lista compacta.

Cada linha deve mostrar:

- ícone/status;
- nome do requisito;
- obrigatório/condicional;
- estado;
- quantidade de documentos ou origem sistêmica;
- ação Resolver/Ver/Revisar.

Padrão:

- pendentes primeiro;
- concluídos recolhidos;
- filtros Pendentes/Concluídos/Todos;
- somente um editor aberto por vez.

Crie ou refatore:

- LicitacaoEvidenceQueue
- LicitacaoEvidenceRow
- LicitacaoEvidenceEditor

O editor único deve conter:

- orientação curta;
- status;
- última evidência;
- título pré-preenchido;
- descrição opcional em área avançada;
- arquivo/drag-and-drop;
- botão anexar;
- navegação Anterior/Próxima.

Implemente `Resolver próxima pendência`, abrindo diretamente o item correto e focando o controle principal.

Não altere a mutation de upload.

Parte F — Publicação progressiva

Organize a fase Publicação em:

Nível 1, sempre visível:

- data de publicação;
- hora da disputa;
- condutor;
- status;
- número do edital;
- salvar/publicar.

Nível 2, recolhível:

- links BLL/PNCP;
- canais adicionais;
- descrição;
- observação.

Nível 3, somente quando necessário:

- cronograma manual;
- overrides;
- justificativa de exceção.

Exiba o cálculo legal como resumo curto:

`Prazo legal válido · sessão mínima em DD/MM/AAAA [Ver cálculo]`

Não renderize o cronograma manual completo por padrão.

Parte G — Assistente contextual

Mantenha lateral apenas quando houver valor real.

Conteúdo máximo:

- etapa visualizada;
- bloqueios principais;
- uma dica;
- navegação secundária.

Se não houver bloqueios/contexto, ocultar lateral e expandir a área principal.

Em telas menores, usar drawer.

Densidade alvo:

- cabeçalho: 72–104 px;
- phase rail: 52–72 px;
- toolbar de próxima ação: 56–76 px;
- linha de pendência: 56–72 px;
- gaps principais: 12–16 px;
- evitar rounded-[28px] e p-5/p-6 em todos os níveis.

Critério de primeira dobra:

Em 1366×768 e 1920×1080, a área operacional deve começar dentro da primeira tela, salvo alerta crítico real.

Arquivos possíveis:

- client/src/components/licitacao/processo/licitacao-command-bar.tsx
- client/src/components/licitacao/processo/licitacao-phase-rail.tsx
- client/src/components/licitacao/processo/licitacao-next-action-toolbar.tsx
- client/src/components/licitacao/processo/licitacao-evidence-queue.tsx
- client/src/components/licitacao/processo/licitacao-evidence-row.tsx
- client/src/components/licitacao/processo/licitacao-evidence-editor.tsx
- client/src/components/licitacao/processo/licitacao-publication-essential-form.tsx
- client/src/components/licitacao/processo/licitacao-publication-advanced.tsx

Use esses nomes apenas se não houver equivalentes atuais.

Restrições:

1. Não alterar schema de banco.
2. Não alterar regras legais.
3. Não alterar categorias documentais.
4. Não alterar mutations existentes.
5. Não remover funcionalidades.
6. Não criar uma segunda implementação paralela.
7. Não quebrar deep links `?fase=`.
8. Não quebrar modo claro.

Testes obrigatórios:

- npm run check
- npm run test:all
- npm run build

Testes manuais mínimos:

1. Abrir `/licitacao/2572?fase=DISPUTA` em dark mode.
2. Confirmar que cards concluídos não ficam brancos/claros.
3. Confirmar distinção entre current, viewing, available e blocked.
4. Confirmar que a área operacional aparece na primeira dobra.
5. Confirmar fila de evidências compacta.
6. Abrir uma evidência e anexar documento.
7. Navegar para próxima pendência.
8. Alternar Pendentes/Concluídos/Todos.
9. Abrir `/licitacao/2572?fase=PUBLICACAO`.
10. Confirmar que apenas os campos essenciais aparecem inicialmente.
11. Abrir cálculo legal e cronograma manual sob demanda.
12. Testar processo fora do fluxo e justificativa de auditoria.
13. Repetir em modo claro.
14. Testar em 1366×768, 1920×1080 e largura mobile.

Entregue no final:

- componentes refatorados/criados;
- tokens adicionados;
- contraste validado;
- redução aproximada de altura/rolagem;
- fluxo de evidências implementado;
- comportamento da publicação progressiva;
- comandos executados;
- riscos e próximos passos.
```

## Prompt de revisão

```txt
Revise a segunda rodada de UX da página do processo licitatório.

Verifique:

1. se a implementação reutilizou os componentes existentes;
2. se não houve duplicação paralela;
3. se a primeira dobra contém a área operacional;
4. se o phase rail tem estados claros e compactos;
5. se current e viewing não são confundidos;
6. se dark mode não contém cartões claros incompatíveis;
7. se os contrastes são adequados;
8. se a fila de evidências substituiu formulários repetidos;
9. se somente um editor fica aberto;
10. se Resolver próxima pendência funciona;
11. se Publicação usa divulgação progressiva;
12. se cronograma manual está oculto por padrão;
13. se uploads e mutations continuam funcionando;
14. se modo claro não regrediu;
15. se check, testes e build passam.

Corrija as regressões encontradas sem ampliar o escopo funcional.
```

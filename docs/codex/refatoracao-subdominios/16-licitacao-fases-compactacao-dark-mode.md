# 16 — Compactação das fases e revisão do modo escuro da Licitação

## 1. Objetivo

Executar uma segunda rodada de refatoração da página do processo licitatório, agora com foco em:

- reduzir a altura estrutural antes da área de trabalho;
- organizar as fases como uma estação operacional compacta;
- reduzir rolagem e repetição de formulários;
- deixar clara a diferença entre etapa atual, etapa visualizada, etapa concluída, disponível e bloqueada;
- melhorar contraste, hierarquia e semântica de cores no modo escuro;
- agilizar a resolução sequencial de pendências.

Rota principal:

```txt
/licitacao/:processoId?fase=PREPARACAO
/licitacao/:processoId?fase=PUBLICACAO
/licitacao/:processoId?fase=DISPUTA
/licitacao/:processoId?fase=JULGAMENTO_HABILITACAO
/licitacao/:processoId?fase=RECURSOS_HOMOLOGACAO
/licitacao/:processoId?fase=FECHAMENTO
```

Esta etapa deve partir da implementação visual mais recente existente no worktree. Antes de criar componentes, localizar os componentes já extraídos na rodada anterior e reutilizá-los.

## 2. Diagnóstico visual dos prints atuais

### 2.1. Evoluções positivas já visíveis

A implementação recente já introduziu:

- painel guiado;
- cabeçalho do processo;
- trilha de fases;
- card de próxima ação;
- assistente contextual;
- auditoria mais compacta;
- navegação específica por fase.

Essa estrutura deve ser preservada conceitualmente.

### 2.2. Problemas remanescentes

#### Excesso de camadas antes da operação

No desktop, antes de chegar ao formulário ou checklist da etapa, o usuário percorre:

1. título do painel;
2. aviso de auditoria;
3. cabeçalho do processo;
4. trilha de fases;
5. card de próxima ação;
6. assistente lateral;
7. somente depois, área operacional.

Mesmo em monitor de alta resolução, o conteúdo que exige ação frequentemente começa abaixo da primeira dobra.

#### Trilha de fases muito alta

As fases continuam representadas como cards relativamente grandes. A trilha ocupa altura excessiva e cria ambiguidade entre os estados:

- `CONCLUÍDA`;
- `SELECIONADA`;
- `DISPONÍVEL`;
- `EM EXECUÇÃO`;
- `BLOQUEADA`.

A etapa atual e a etapa apenas selecionada para visualização precisam ter tratamento distinto e mais previsível.

#### Baixo contraste no modo escuro

Os prints mostram:

- superfícies com tons muito próximos;
- bordas discretas demais;
- cartões concluídos com fundo claro incompatível com o restante do tema;
- textos secundários e badges com contraste reduzido;
- estado selecionado pouco distinto do estado disponível;
- alertas claros muito luminosos dentro do tema escuro;
- grandes áreas em azul-marinho sem hierarquia suficiente entre painel, card, campo e item interativo.

#### Formulários repetidos na fase externa

Na fase `DISPUTA`, cada evidência aparece como um card completo contendo:

- título;
- descrição;
- status;
- título da evidência;
- descrição da evidência;
- input de arquivo;
- botão para anexar.

Essa repetição produz rolagem extensa e exige que o usuário leia vários blocos semelhantes.

#### Publicação ainda extensa

Na fase `PUBLICACAO`, cronograma, regra aplicada, condutor, status, número do edital, links, descrição, observação e cronograma manual permanecem simultaneamente visíveis. Campos essenciais, calculados, avançados e excepcionais ainda competem na mesma hierarquia.

## 3. Princípio da segunda rodada

A página deve deixar de ser uma sequência vertical de painéis e passar a funcionar como um **workbench de processo**.

A primeira dobra deve responder imediatamente:

1. Qual é o processo?
2. Qual é a etapa atual?
3. Há bloqueios?
4. Qual é a próxima ação?
5. Onde executo essa ação agora?

Meta visual para desktop:

```txt
Cabeçalho operacional + trilha de fases + ação atual <= 220 px de altura útil
```

A área operacional da fase deve começar dentro da primeira tela em resoluções de 1366×768 e superiores, salvo quando houver alerta crítico real.

## 4. Arquitetura visual alvo

```txt
┌──────────────────────────────────────────────────────────────┐
│ Barra compacta do processo                                   │
│ 0145/2026 · Dispensa Eletrônica · Disputa · 10 pendências    │
│ [Dossiê] [Documentos] [Histórico] [Auditoria] [Voltar]       │
├──────────────────────────────────────────────────────────────┤
│ Trilho compacto das fases                                    │
│ ✓ Preparação — ✓ Publicação — ● Disputa — ○ Julgamento ...   │
├──────────────────────────────────────────────────────────────┤
│ Próxima ação: Resolver documentos da fase externa [Abrir]    │
├───────────────────────────────────────────┬──────────────────┤
│ Área operacional da fase                  │ Contexto         │
│ Fila compacta de pendências               │ recolhível       │
└───────────────────────────────────────────┴──────────────────┘
```

## 5. Barra compacta do processo

Unificar cabeçalho do processo e aviso de auditoria em uma barra operacional.

### Conteúdo primário

- número SIREL;
- modalidade;
- secretaria;
- etapa efetivamente em execução;
- responsável;
- quantidade de pendências.

### Conteúdo secundário

- Dossiê;
- Documentos;
- Histórico;
- Auditoria;
- Voltar à fila.

### Auditoria reforçada

Não manter uma faixa amarela de largura total permanentemente aberta.

Usar badge ou botão:

```txt
[⚠ Fora do fluxo]
```

Ao clicar, abrir popover/drawer com:

- justificativa vigente;
- edição da justificativa;
- indicação de reaproveitamento nas ações críticas.

Se a justificativa estiver vazia, usar um ponto vermelho/âmbar no botão e bloquear a ação somente quando necessário.

## 6. Trilho compacto das fases

Substituir cards altos por um `phase rail` horizontal.

### Estado visual obrigatório

Usar somente estes estados semânticos:

```txt
completed   — etapa concluída
current     — etapa atual do processo
viewing     — etapa histórica/futura que o usuário está visualizando
available   — etapa liberada para navegação/avanço
blocked     — etapa ainda bloqueada
```

### Regras

1. Ao abrir o processo, `viewing` deve ser igual a `current`.
2. Se o usuário clicar em etapa concluída, mostrar:

```txt
Visualizando etapa concluída
[Voltar para a etapa atual]
```

3. Não usar simultaneamente `selecionada` e `em execução` sem explicar a diferença.
4. Etapa bloqueada deve permanecer legível, mas não parecer desabilitada por opacidade extrema.
5. Mostrar pendências apenas como contador pequeno:

```txt
Disputa · 10
```

6. O trilho completo deve ocupar aproximadamente 52–72 px de altura.
7. Em mobile, usar rolagem horizontal com `scroll-snap`.

## 7. Próxima ação compacta

O bloco de próxima ação deve ser uma toolbar, não outro painel grande.

Exemplo:

```txt
Próxima ação  Resolver 10 pendências da fase externa
[Ir para primeira pendência]
```

Quando a etapa estiver pronta:

```txt
Etapa pronta  Publicação registrada
[Abrir disputa]
```

### Funcionalidade

O botão deve:

- localizar a primeira pendência relevante;
- abrir o editor/drawer correspondente;
- posicionar foco no controle principal;
- não apenas rolar para o início genérico da seção.

## 8. Fila compacta de evidências

Este é o principal ganho operacional da fase externa.

### 8.1. Substituir cards completos

Não renderizar um formulário de upload completo para cada requisito.

Usar uma lista/fila compacta:

```txt
[!] Termo de autuação                 Obrigatório   Pendente       [Resolver]
[✓] Aviso de Dispensa                 Obrigatório   Sistêmico      [Ver]
[!] Documentos da plataforma          Obrigatório   Pendente       [Resolver]
[ ] Recursos                          Condicional    Não aplicável  [Revisar]
```

### 8.2. Editor único

Ao clicar em um item, abrir um único drawer/painel lateral ou painel inline abaixo da linha selecionada com:

- orientação curta;
- status;
- última evidência;
- título pré-preenchido;
- descrição opcional recolhida;
- seletor/drag-and-drop de arquivo;
- botão de anexar;
- ações especiais, quando existentes.

Somente um editor pode ficar aberto por vez.

### 8.3. Filtros da fila

Adicionar controles compactos:

```txt
[Pendentes 10] [Concluídos 2] [Todos 12]
```

Padrão:

- pendentes primeiro;
- concluídos recolhidos;
- condicionais/não aplicáveis separados quando necessário.

### 8.4. Ações de produtividade

Implementar nesta ordem:

1. `Resolver próxima pendência`;
2. `Anterior` e `Próxima` dentro do editor;
3. lembrar o último item aberto por processo e fase;
4. drag-and-drop de um arquivo;
5. upload múltiplo e associação assistida somente em fase posterior.

## 9. Organização da fase de Publicação

Separar a interface em três níveis.

### Nível 1 — essencial

Sempre visível:

- data de publicação;
- hora da disputa;
- condutor;
- número do edital;
- status do processo;
- ação `Publicar processo` ou `Salvar`.

### Nível 2 — canais e links

Recolhível:

- BLL;
- PNCP;
- DOU;
- jornal;
- descrição de movimentação;
- observação.

### Nível 3 — cronograma avançado/manual

Mostrar apenas quando:

- processo estiver fora do fluxo;
- usuário ativar `Editar cronograma manualmente`;
- existir divergência legal/operacional.

A regra aplicada e a data mínima legal devem aparecer como resumo compacto, não como painel extenso.

Exemplo:

```txt
Prazo legal: válido · sessão mínima em 01/05/2026
[Ver cálculo]
```

## 10. Assistente contextual

No desktop, o assistente lateral deve ter largura entre 240 e 280 px e conter apenas:

- etapa visualizada;
- bloqueios principais;
- dica contextual;
- navegação secundária da fase.

O bloco `Contexto` deve ficar recolhido por padrão.

No mobile e em telas menores que o breakpoint definido, o assistente deve virar drawer.

Quando não houver bloqueios nem conteúdo contextual relevante, ocultar a coluna e ampliar a área operacional.

## 11. Sistema de superfícies no modo escuro

O tema atual possui superfícies muito próximas. Criar níveis claros:

```txt
--surface-base-dark
--surface-shell-dark
--surface-panel-dark
--surface-card-dark
--surface-raised-dark
--surface-hover-dark
--surface-selected-dark
```

Sugestão de direção cromática, sujeita a ajuste por contraste:

```txt
base      #0b1220
shell     #111a29
panel     #172235
card      #1d2a40
raised    #24344d
hover     #2a3c58
```

Bordas:

```txt
subtle    #34445d
strong    #526a8a
focus     #73bdf0
```

Textos:

```txt
primary   #f5f8fc
secondary #c8d5e4
muted     #91a4ba
```

Não aplicar os valores sem validação de contraste. Eles servem como direção inicial.

## 12. Tokens semânticos de estado

Criar tokens independentes do tema:

```txt
--phase-current-bg
--phase-current-border
--phase-current-text

--phase-completed-bg
--phase-completed-border
--phase-completed-text

--phase-available-bg
--phase-available-border
--phase-available-text

--phase-viewing-bg
--phase-viewing-border
--phase-viewing-text

--phase-blocked-bg
--phase-blocked-border
--phase-blocked-text

--notice-warning-bg
--notice-warning-border
--notice-warning-text

--notice-success-bg
--notice-success-border
--notice-success-text
```

### Regra crítica

Não depender de classes claras como:

```txt
bg-emerald-50
bg-amber-50
text-emerald-700
```

para componentes que precisam funcionar nos dois temas.

Os overrides globais atuais não cobrem todas as classes semânticas e podem produzir cartões claros dentro do tema escuro. Migrar os componentes novos para tokens semânticos ou classes próprias por `data-state`.

## 13. Contraste e acessibilidade

Critérios mínimos:

- texto normal com contraste mínimo de 4,5:1;
- texto grande e elementos gráficos relevantes com contraste mínimo de 3:1;
- borda/foco de controles com contraste perceptível;
- não depender apenas de cor para comunicar estado;
- usar ícone, rótulo e/ou padrão visual junto da cor;
- foco de teclado sempre visível;
- estados bloqueados legíveis;
- áreas clicáveis com no mínimo 40–44 px de altura quando possível.

## 14. Densidade e espaçamento

Criar um perfil de densidade operacional para esta tela.

Recomendações:

```txt
Cabeçalho do processo: 72–104 px
Phase rail: 52–72 px
Toolbar de próxima ação: 56–76 px
Linha de pendência: 56–72 px
Gap principal entre blocos: 12–16 px
Raio de cards operacionais: 14–18 px
```

Evitar `rounded-[28px]` e `p-5/p-6` em todos os níveis. Grandes raios e paddings devem ficar reservados para hero/hub, não para estações de trabalho densas.

## 15. Componentização recomendada

Reutilizar os componentes já criados na rodada anterior. Se ainda não existirem, considerar:

```txt
client/src/components/licitacao/processo/licitacao-command-bar.tsx
client/src/components/licitacao/processo/licitacao-phase-rail.tsx
client/src/components/licitacao/processo/licitacao-next-action-toolbar.tsx
client/src/components/licitacao/processo/licitacao-evidence-queue.tsx
client/src/components/licitacao/processo/licitacao-evidence-row.tsx
client/src/components/licitacao/processo/licitacao-evidence-editor.tsx
client/src/components/licitacao/processo/licitacao-phase-assistant.tsx
client/src/components/licitacao/processo/licitacao-publication-essential-form.tsx
client/src/components/licitacao/processo/licitacao-publication-advanced.tsx
```

Não criar componentes duplicados se a implementação atual já tiver equivalentes como:

```txt
LicitacaoProcessHeader
LicitacaoPhaseStepper
LicitacaoNextActionCard
LicitacaoContextAssistant
LicitacaoAuditDrawer
```

Nesse caso, refatorar os existentes.

## 16. Estratégia incremental

### Etapa A — tokens e estados

- criar tokens de fase e alertas em claro/escuro;
- remover cores claras vazando no dark mode;
- diferenciar `current`, `viewing`, `available`, `completed` e `blocked`;
- validar foco e contraste.

### Etapa B — compactação do topo

- unificar cabeçalho e auditoria;
- transformar stepper em phase rail;
- transformar próxima ação em toolbar;
- garantir área operacional na primeira dobra.

### Etapa C — fila de evidências da fase externa

- substituir grade de formulários por lista compacta;
- criar editor único;
- pendentes primeiro;
- implementar `Resolver próxima pendência`.

### Etapa D — publicação progressiva

- separar essencial, canais/links e cronograma avançado;
- esconder cronograma manual por padrão;
- resumir cálculo legal.

### Etapa E — replicar padrão

Aplicar o mesmo padrão às demais fases sem duplicação:

- preparação;
- julgamento/habilitação;
- recursos/homologação;
- fechamento.

## 17. Critérios de aceite

A etapa será considerada concluída quando:

- a área operacional começar dentro da primeira dobra em desktop;
- a trilha de fases ocupar no máximo aproximadamente 72 px;
- etapa atual e etapa visualizada forem claramente distintas;
- cartões concluídos não ficarem claros/brancos no modo escuro;
- alertas de sucesso e aviso tiverem versões escuras coerentes;
- pendências da fase externa forem exibidas em lista compacta;
- somente um editor de evidência ficar aberto;
- o usuário puder ir diretamente para a primeira pendência;
- itens concluídos estiverem recolhidos por padrão;
- publicação mostrar primeiro apenas campos essenciais;
- cronograma manual ficar oculto salvo exceção/ativação;
- modo claro continuar íntegro;
- navegação por teclado e foco visível funcionarem;
- queries, mutations, uploads e regras legais continuarem inalterados;
- `npm run check`, `npm run test:all` e `npm run build` passarem.

## 18. Fora do escopo

Não alterar nesta etapa:

- schema de banco;
- regras de prazo;
- lógica de conclusão automática;
- categorias documentais;
- mutations de upload;
- regras de processo fora do fluxo;
- integrações PNCP/BLL;
- permissões por subsistema.

A mudança é de arquitetura visual, fluxo de interação e produtividade operacional.

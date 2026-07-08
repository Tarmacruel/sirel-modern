# 12 — Refatoração UX da página do processo licitatório

## 1. Objetivo desta etapa

Refatorar a página de edição e gerenciamento do processo licitatório no subsistema de Licitação, especialmente a rota:

```txt
/licitacao/:processoId?fase=PREPARACAO
```

O objetivo é reduzir carga cognitiva, transformar a tela em um fluxo guiado por etapa e aproximar a experiência de uso da rotina real do agente de contratação/pregoeiro.

A página não deve parecer um painel enciclopédico com tudo visível. Ela deve funcionar como um **posto de comando operacional**, mostrando:

1. onde o processo está;
2. o que bloqueia o avanço;
3. qual é a próxima ação segura;
4. onde anexar ou tratar o documento/ato necessário;
5. como avançar sem rolar excessivamente a página.

## 2. Diagnóstico do estado atual

Arquivo principal:

```txt
client/src/pages/licitacao-processo-page.tsx
```

A tela já possui muita lógica útil e não deve ser reescrita do zero. O problema central é a apresentação simultânea de muitos contextos.

### 2.1. Sinais de complexidade no componente atual

O componente concentra muitos estados de seções, formulários, páginas, modais, parser de SD, auditoria e checklist em um único arquivo. A estrutura `sectionOpen` mantém várias áreas simultaneamente mapeadas:

```txt
overview
internal
external
docs
publication
licitantes
propostas
lances
julgamento
habilitacao
recursos
homologacao
auditoria
history
```

A página também trabalha com uma fase linear própria:

```txt
PREPARACAO
PUBLICACAO
DISPUTA
JULGAMENTO_HABILITACAO
RECURSOS_HOMOLOGACAO
FECHAMENTO
```

Essa modelagem está correta, mas hoje ainda aparece como muita informação simultânea.

### 2.2. Elementos que geram sobrecarga visual

Pelos prints e pela leitura do código, os pontos mais carregados são:

- topo com `SectionCard` e vários botões concorrentes;
- barra de auditoria em destaque ocupando área nobre da tela;
- bloco grande de fluxo linear com muitos cards horizontais;
- cards de resumo do processo, modalidade, critério, valor, etapas e documentos;
- coluna lateral com etapa selecionada, bloqueios legais e contexto operacional;
- ação principal em barra sticky inferior;
- overview ainda visível dentro da fase de preparação;
- checklist interno e parser de SD competindo com a navegação de etapa;
- excesso de textos explicativos em cards e blocos secundários.

O resultado é funcional, mas exige esforço para responder rapidamente: “o que faço agora?”.

## 3. Princípio de refatoração

Não remover regra de negócio. Refatorar a superfície de interação.

A lógica existente deve ser reaproveitada:

- cálculo de fase atual;
- bloqueios por fase;
- checklist interno;
- parser/vinculação de SD;
- publicação e cronograma;
- propostas/lances/habilitação/recursos/homologação;
- auditoria para processo fora do fluxo;
- histórico e documentos.

A mudança deve ser feita por extração de componentes e reorganização visual.

## 4. Arquitetura de interface alvo

### 4.1. Layout alvo

A página deve ser reorganizada em quatro zonas:

```txt
┌─────────────────────────────────────────────────────────────┐
│  A. Cabeçalho compacto do processo                           │
├─────────────────────────────────────────────────────────────┤
│  B. Navegação guiada por etapas + próxima ação                │
├───────────────────────────────────────┬─────────────────────┤
│  C. Área de trabalho da etapa ativa    │  D. Assistente       │
│                                       │     contextual       │
└───────────────────────────────────────┴─────────────────────┘
```

### 4.2. Cabeçalho compacto

Substituir o topo atual por um cabeçalho curto e persistente, com:

- número do processo;
- modalidade;
- secretaria;
- fase atual;
- responsável;
- pendências abertas;
- ações secundárias em menu ou botões discretos.

Ações sugeridas:

```txt
Dossiê
Documentos
Histórico
Voltar à fila
```

Essas ações não devem competir visualmente com a ação principal da etapa.

### 4.3. Navegação guiada por etapas

A sequência legal deve continuar existindo, mas com apresentação mais compacta.

Trocar os cards horizontais grandes por um stepper compacto:

```txt
1 Preparação   2 Publicação   3 Disputa   4 Julgamento   5 Homologação   6 Fechamento
```

Cada etapa deve indicar:

- status: atual, concluída, bloqueada ou disponível;
- quantidade de pendências;
- tooltip/resumo curto;
- clique para mudar foco, se permitido.

### 4.4. Próxima ação clara

A tela deve ter uma área de “Próxima ação” logo abaixo do stepper.

Exemplo:

```txt
Próxima ação
Concluir checklist interno
Faltam 2 documentos obrigatórios para liberar a publicação.
[Resolver agora]
```

Se a fase estiver livre:

```txt
Próxima ação
Avançar para publicação
Checklist interno concluído. A etapa de publicação pode ser preparada.
[Avançar]
```

Essa área deve substituir a barra sticky inferior como principal guia cognitivo. A sticky inferior pode ser removida ou transformada em uma versão discreta apenas em telas longas/mobile.

## 5. Área de trabalho por etapa

### 5.1. Regra central

Mostrar apenas a etapa ativa como área principal. O restante deve ficar recolhido, acessível pelo stepper ou por menu lateral.

### 5.2. Preparação

A fase `PREPARACAO` deve ter foco em:

1. checklist interno;
2. parser/vinculação de SD quando aplicável;
3. configuração mínima para publicação;
4. documentos essenciais.

Evitar exibir overview extenso antes da tarefa principal.

Ordem recomendada:

```txt
1. Próxima pendência do checklist
2. Checklist interno guiado
3. Vinculação da SD / itens do processo
4. Configurações complementares
5. Documentos anexados
```

### 5.3. Publicação

A fase `PUBLICACAO` deve mostrar:

- data de publicação;
- hora da disputa;
- canais de publicação;
- cálculo de prazo legal;
- links PNCP/BLL;
- botão de publicar/liberar disputa.

### 5.4. Disputa

A fase `DISPUTA` deve mostrar apenas o que se aplica conforme o fluxo:

- licitantes;
- propostas;
- lances, se houver;
- importações/ata, quando aplicável;
- documentos da sessão.

### 5.5. Julgamento e habilitação

A fase `JULGAMENTO_HABILITACAO` deve priorizar:

- primeiro colocado;
- proposta vencedora;
- situação de habilitação;
- diligências/documentos;
- decisão de classificação/inabilitação.

### 5.6. Recursos e homologação

A fase `RECURSOS_HOMOLOGACAO` deve priorizar:

- recursos pendentes;
- decisão recursal;
- homologação;
- status crítico, se existir;
- encerramento formal.

### 5.7. Fechamento

A fase `FECHAMENTO` deve mostrar:

- bloqueios para contratos;
- auditoria resumida;
- movimentações recentes;
- botão de encaminhar para contratos.

## 6. Assistente contextual lateral

A coluna lateral atual deve ser simplificada e assumir papel de assistente, não de segundo painel completo.

### 6.1. Conteúdo fixo do assistente

Mostrar apenas:

- etapa selecionada;
- bloqueios da etapa;
- dica operacional curta;
- link para documentos/histórico se necessário.

### 6.2. Conteúdo removível ou recolhível

O bloco “Contexto operacional” deve ir para um accordion pequeno ou tooltip.

Não precisa ocupar espaço permanente com:

- fluxo;
- disputa;
- ajuda longa da modalidade.

Essas informações são úteis, mas secundárias.

## 7. Auditoria para processo fora do fluxo

A barra de auditoria atual é importante, mas visualmente pesada.

### 7.1. Comportamento sugerido

Transformar em faixa compacta:

```txt
Processo fora do fluxo — justificativa exigida para ações críticas
[Informar justificativa]
```

Ao clicar, abrir drawer/modal lateral com textarea.

### 7.2. Regra

A justificativa deve continuar persistida e reaproveitada nas ações críticas. Não mudar a regra funcional, apenas a apresentação.

## 8. Componentização recomendada

Extrair componentes sem alterar a regra de negócio inicialmente.

Arquivos sugeridos:

```txt
client/src/components/licitacao/processo/licitacao-process-header.tsx
client/src/components/licitacao/processo/licitacao-phase-stepper.tsx
client/src/components/licitacao/processo/licitacao-next-action-card.tsx
client/src/components/licitacao/processo/licitacao-context-assistant.tsx
client/src/components/licitacao/processo/licitacao-audit-drawer.tsx
client/src/components/licitacao/processo/licitacao-preparacao-workspace.tsx
client/src/components/licitacao/processo/licitacao-publicacao-workspace.tsx
client/src/components/licitacao/processo/licitacao-disputa-workspace.tsx
client/src/components/licitacao/processo/licitacao-julgamento-workspace.tsx
client/src/components/licitacao/processo/licitacao-homologacao-workspace.tsx
client/src/components/licitacao/processo/licitacao-fechamento-workspace.tsx
client/src/lib/licitacao-processo-view-model.ts
```

### 8.1. View model

Criar um view model para reduzir cálculo dentro do JSX:

```txt
buildLicitacaoProcessoViewModel()
```

Ele deve receber os dados já existentes e retornar:

- `processHeader`;
- `phaseStepper`;
- `currentPhase`;
- `nextAction`;
- `phasePendings`;
- `assistantContext`;
- `availableActions`;
- `workspaceVisibility`.

## 9. Estratégia incremental

### Etapa 1 — extração sem mudança visual drástica

- Extrair header, stepper, next action e assistente contextual.
- Manter a lógica atual.
- Não mexer em mutations nem endpoints.
- Garantir build e testes.

### Etapa 2 — simplificação visual

- Substituir `SectionCard` superior por `LicitacaoProcessHeader`.
- Substituir cards horizontais grandes por `LicitacaoPhaseStepper` compacto.
- Trocar sticky inferior por `LicitacaoNextActionCard` no topo da área útil.
- Compactar barra de auditoria.

### Etapa 3 — workspace por fase

- Mostrar apenas a fase ativa.
- Reorganizar `PREPARACAO` para priorizar checklist e SD.
- Deixar overview como detalhe recolhido, não como primeira área visual.

### Etapa 4 — refinamento mobile

- Stepper horizontal rolável no mobile.
- Assistente contextual vira drawer/recolhível.
- Ação principal fica fixa no rodapé apenas no mobile.

## 10. Critérios de aceite

A etapa será considerada concluída quando:

- a tela abrir diretamente com a fase solicitada em `?fase=PREPARACAO`;
- o usuário identificar a próxima ação em até uma leitura curta;
- o cabeçalho não duplicar informações já presentes no shell;
- o bloco de auditoria não ocupar área nobre em excesso;
- apenas a etapa ativa aparecer como área principal;
- pendências e bloqueios estiverem claros;
- documentos, dossiê e histórico continuarem acessíveis;
- upload, parser SD, checklist, publicação, julgamento, habilitação, recursos e homologação continuarem funcionando;
- a rota profunda continuar preservada;
- `npm run check`, `npm run test:all` e `npm run build` passarem.

## 11. Fora do escopo desta etapa

Não alterar:

- modelo de banco;
- regras de prazo legal;
- mutations da licitação;
- parser de SD;
- integração de documentos;
- regras de auditoria fora do fluxo;
- autorização por subsistema;
- publicação em PNCP/BLL.

Esta etapa é de UX, arquitetura de componente e organização cognitiva.

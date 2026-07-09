# 18 — Fluxo documental por fase, modalidade e modo orientativo

## 1. Objetivo

Reorganizar funcionalmente o fluxo guiado do processo licitatório para que:

- cada documento apareça somente na fase tecnicamente correspondente;
- os documentos sejam exibidos em ordem operacional, nunca em ordem alfabética;
- a etapa de Publicação varie conforme a modalidade;
- a etapa de Disputa concentre somente os atos próprios da sessão/disputa;
- Habilitação, Recursos e Controle Interno sejam fases independentes;
- Homologação receba seus documentos finais específicos;
- durante a implantação e familiarização dos usuários, as fases permaneçam navegáveis mesmo com pendências;
- a justificativa de processo fora do fluxo deixe de ser obrigatória temporariamente.

Esta etapa altera o fluxo funcional e o catálogo documental. Não é apenas uma alteração visual.

## 2. Diagnóstico da estrutura atual

O arquivo atual:

```txt
client/src/lib/licitacao-phase-config.ts
```

possui um `getLicitacaoDocumentBlueprint()` que retorna apenas:

```ts
{
  internal,
  external,
}
```

O array `external` mistura documentos de naturezas diferentes:

- termo de autuação;
- decreto do agente;
- aviso;
- confirmação PNCP;
- documentos da plataforma;
- propostas;
- julgamento técnico;
- habilitação;
- recursos;
- atas da sessão/adjudicação;
- comunicação à Controladoria;
- ata e termo de homologação.

Essa modelagem é a causa de documentos de Habilitação, Recursos, Controle Interno e Homologação aparecerem dentro da fase de Disputa.

A nova implementação não deve apenas filtrar visualmente o array atual. Deve substituir a modelagem por requisitos associados explicitamente a uma fase.

## 3. Novo catálogo central de fases

Criar ou consolidar um catálogo central compartilhado, preferencialmente em:

```txt
shared/src/licitacao-guided-flow.ts
```

Tipo sugerido:

```ts
export type LicitacaoGuidedPhaseKey =
  | "PREPARACAO"
  | "PUBLICACAO"
  | "DISPUTA"
  | "JULGAMENTO"
  | "HABILITACAO"
  | "RECURSOS"
  | "CONTROLE_INTERNO"
  | "HOMOLOGACAO"
  | "FECHAMENTO";
```

Para Dispensa com disputa, a sequência deve ser:

```txt
Preparação
→ Publicação
→ Disputa
→ Julgamento
→ Habilitação
→ Recursos
→ Controle Interno
→ Homologação
→ Fechamento
```

### 3.1. Aplicabilidade por modalidade

O catálogo deve permitir fases não aplicáveis:

```ts
isApplicable(context): boolean
```

Regras iniciais:

- `DISPUTA`: somente quando a modalidade/modo admitir disputa;
- `RECURSOS`: fase própria nas modalidades competitivas e na Dispensa com disputa;
- `CONTROLE_INTERNO`: após Recursos, antes de Homologação;
- contratação direta sem disputa pode pular fases competitivas conforme configuração;
- uma fase não aplicável deve ser omitida ou marcada como não aplicável, nunca simulada como concluída sem explicação.

## 4. Novo tipo de requisito documental

Substituir o requisito genérico por estrutura com fase e ordem explícitas:

```ts
export interface LicitacaoDocumentRequirement {
  category: string;
  phase: LicitacaoGuidedPhaseKey;
  order: number;
  label: string;
  description: string;
  obrigatorio: boolean;
  condicional?: boolean;
  source?: "UPLOAD" | "SYSTEM" | "PARSER" | "INTEGRATION";
  completionStrategy?:
    | "DOCUMENT"
    | "SYSTEM_STATE"
    | "PARSER_RESULT"
    | "MANUAL_CONFIRMATION";
  isApplicable?: (context: LicitacaoFlowContext) => boolean;
  isAvailable?: (context: LicitacaoFlowContext) => boolean;
}
```

### Regra de ordenação

A interface deve usar:

```ts
requirements.sort((a, b) => a.order - b.order)
```

Nunca usar `label.localeCompare()` para ordenar a fila operacional.

A função que resolve a próxima pendência deve usar exatamente o mesmo array já ordenado utilizado na renderização.

## 5. Etapa de Publicação por modalidade

A fase deve ser composta por:

1. configuração/pré-requisito da publicação;
2. cálculo ou definição das datas;
3. evidências da publicação;
4. links públicos;
5. publicação no Portal da Transparência.

Os anexos não devem ficar misturados com a fase de Disputa.

## 6. Publicação — Pregão, Concorrência, Leilão e Credenciamento

### Pré-requisito

O usuário calcula ou confirma as datas do cronograma.

Após o cronograma válido, liberar a área de evidências da publicação.

### Evidências disponíveis

Criar categorias específicas, se ainda não existirem equivalentes:

```txt
LICITACAO_EDITAL_PUBLICADO
LICITACAO_COMPROVANTE_PUBLICACAO_DOM
LICITACAO_COMPROVANTE_PUBLICACAO_DOU
LICITACAO_COMPROVANTE_PUBLICACAO_JORNAL
LICITACAO_COMPROVANTE_PUBLICACAO_PNCP
```

Exibir slots para:

- edital;
- comprovante de publicação no Diário Oficial do Município;
- comprovante de publicação no Diário Oficial da União;
- comprovante de publicação em Jornal de Grande Circulação;
- comprovante de publicação no PNCP;
- link público do processo no PNCP;
- link público do processo na BLL;
- botão `Publicar no Portal da Transparência`.

### Obrigatoriedade dinâmica

`Disponível para anexar` não significa necessariamente `obrigatório em todos os processos`.

DOM, DOU e Jornal devem respeitar os canais selecionados e as regras já configuradas. O card pode aparecer, mas o badge deve indicar:

```txt
Obrigatório
Opcional
Não aplicável
```

conforme o contexto.

## 7. Publicação — Dispensa de Licitação

### Pré-requisito

O usuário calcula ou confirma as datas de publicação da contratação direta.

### Evidências disponíveis

```txt
LICITACAO_AVISO_CONTRATACAO_DIRETA
LICITACAO_COMPROVANTE_PUBLICACAO_PNCP
```

Exibir:

- Aviso de Contratação Direta;
- comprovante de publicação no PNCP;
- link público do processo no PNCP;
- link público do processo na BLL;
- botão `Publicar no Portal da Transparência`.

Não exibir automaticamente edital, DOU ou Jornal para Dispensa, salvo regra específica configurada no processo.

## 8. Publicação — Inexigibilidade de Licitação

### Pré-requisito

O usuário deve selecionar o inciso/fundamento legal aplicável à Inexigibilidade.

Se não existir campo equivalente, criar campo configurável, por exemplo:

```txt
licitacoes.fundamentoLegalInciso
```

Não codificar o catálogo de incisos diretamente na página. Manter opções centralizadas e tipadas.

### Evidências disponíveis após a seleção

```txt
LICITACAO_AVISO_CONTRATACAO_DIRETA
LICITACAO_COMPROVANTE_PUBLICACAO_PNCP
```

Exibir:

- Aviso de Contratação Direta;
- comprovante de publicação no PNCP;
- link público do processo no PNCP;
- link público do processo na BLL;
- botão `Publicar no Portal da Transparência`.

Enquanto o inciso não estiver selecionado, mostrar um único callout compacto:

```txt
Selecione o fundamento legal para liberar a publicação.
[Selecionar inciso]
```

## 9. Publicação no Portal da Transparência

Antes de implementar, verificar se já existe integração em outro módulo ou serviço local.

Se não existir, criar uma fronteira clara:

```txt
server/src/integrations/transparencia/transparencia-provider.ts
```

Interface sugerida:

```ts
interface TransparenciaProvider {
  publishLicitacao(input: PublishLicitacaoInput): Promise<PublishResult>;
}
```

### Estados da ação

```txt
NOT_CONFIGURED
READY
PUBLISHING
PUBLISHED
FAILED
```

### Regras

- não simular publicação bem-sucedida;
- não marcar como publicado em caso de timeout ou erro;
- registrar protocolo/identificador retornado, quando houver;
- registrar data, usuário e erro na auditoria;
- impedir duplicidade por idempotência;
- permitir nova tentativa após falha;
- se endpoint ou credenciais não estiverem configurados, exibir `Integração não configurada`.

A implementação do botão deve reutilizar serviço existente, caso já exista no ambiente local.

## 10. Etapa de Disputa

Para modalidades com disputa, essa fase deve conter apenas atos próprios da sessão competitiva.

### Documento principal

```txt
LICITACAO_ATA_SESSAO_PROVISORIA
```

Label:

```txt
Ata de sessão provisória
```

### Fluxo

1. usuário anexa a ata provisória da plataforma;
2. sistema oferece `Processar ata`;
3. reutiliza o parser existente de ata de sessão;
4. apresenta prévia dos dados extraídos;
5. após confirmação, preenche/reconcilia:
   - licitantes;
   - propostas;
   - lances;
   - lotes/itens e resultados parciais, quando disponíveis;
6. libera o trabalho da etapa de Julgamento.

Não criar um segundo parser. Reutilizar a infraestrutura já existente de processamento de ata.

### Itens removidos da Disputa

Não solicitar nesta fase:

- ata de homologação;
- termo de homologação;
- comunicação para Controladoria;
- habilitação das empresas;
- recursos;
- atas finais de adjudicação/homologação;
- julgamento técnico como evidência genérica da Disputa.

## 11. Etapa de Julgamento

Associar a esta fase:

```txt
LICITACAO_JULGAMENTO_PROPOSTA_TECNICA
```

E demais documentos de:

- análise/classificação de propostas;
- parecer técnico;
- planilhas de julgamento;
- decisões de desclassificação/classificação;
- definição provisória do vencedor.

Os dados extraídos da ata provisória devem alimentar a área operacional, mas a decisão de julgamento permanece própria desta fase.

## 12. Etapa de Habilitação

Criar fase independente após Julgamento.

Associar:

```txt
LICITACAO_HABILITACAO_EMPRESAS
```

A conclusão pode ocorrer por:

- documento/evidência anexada;
- situação de habilitação registrada para o licitante analisado;
- combinação das duas estratégias conforme configuração.

Não exibir Habilitação dentro da fila documental da Disputa.

## 13. Etapa de Recursos

Criar fase independente após Habilitação.

Associar:

```txt
LICITACAO_RECURSOS
```

A fase deve permitir:

- registrar manifestação de intenção;
- cadastrar recurso;
- anexar razões/contrarrazões e decisão;
- marcar `Não houve recurso` quando aplicável.

Quando não houver recurso, a fase deve poder ser encerrada por confirmação sistêmica, sem exigir upload artificial.

## 14. Etapa de Controle Interno

Criar fase independente:

```txt
CONTROLE_INTERNO
```

Sequência:

```txt
Julgamento → Habilitação → Recursos → Controle Interno → Homologação
```

Associar:

```txt
LICITACAO_COMUNICACAO_CONTROLADORIA
```

Label sugerido:

```txt
Encaminhamento ao Controle Interno
```

Se a fase atual precisar ser persistida no enum/status da licitação e ainda não houver valor equivalente, adicionar:

```txt
CONTROLE_INTERNO
```

em:

- enum do banco;
- `licitacaoStatusOptions`;
- labels;
- schemas;
- migration.

Não adicionar valor duplicado se já existir status ou etapa de workflow equivalente que possa ser reutilizado corretamente.

## 15. Etapa de Homologação

A fase deve receber, no mínimo:

```txt
LICITACAO_ATA_HOMOLOGACAO
LICITACAO_ATA_RELATORIO_LANCES
LICITACAO_ATA_SESSAO_FINAL
LICITACAO_ATA_ADJUDICACAO
LICITACAO_ATA_VENCEDORES
```

Labels:

- Ata de homologação;
- Ata/relatório de lances;
- Ata de sessão final;
- Ata de adjudicação;
- Ata de vencedores do processo.

O `Termo de homologação` já existente deve permanecer associado à fase de Homologação quando aplicável. Não removê-lo silenciosamente; configurar sua obrigatoriedade conforme a modalidade/regra existente.

Documentos gerados pelo parser ou pela plataforma podem concluir o requisito por `PARSER_RESULT` ou `SYSTEM_STATE`, sem obrigar upload duplicado.

## 16. Modo temporário de implantação: orientativo

Durante a fase de implementação e familiarização, o fluxo não deve bloquear a navegação nem o avanço por pendências.

Criar política configurável no backend, não apenas um bypass visual.

Exemplo:

```ts
export type LicitacaoFlowEnforcement = "ADVISORY" | "BLOCKING";
```

Parâmetro sugerido:

```txt
LICITACAO.FLUXO.ENFORCEMENT=ADVISORY
```

Ou configuração equivalente já suportada pelo sistema.

### Comportamento em `ADVISORY`

- todas as fases aplicáveis ficam acessíveis;
- o usuário pode avançar com pendências;
- pendências continuam visíveis e contabilizadas;
- bloqueios viram alertas, não impedimentos;
- a justificativa de processo fora do fluxo é opcional;
- ações críticas não devem falhar apenas pela ausência da justificativa;
- toda mudança continua sendo auditada;
- a interface pode mostrar `Avançando com pendências`, sem exigir confirmação repetitiva a cada clique.

### Comportamento futuro em `BLOCKING`

- pendências obrigatórias impedem avanço;
- justificativa volta a ser exigida para exceções;
- regras devem poder ser reativadas por configuração, sem reescrever componentes.

## 17. Estados visuais das fases no modo orientativo

Como as fases estarão desbloqueadas, evitar rotular fases futuras como `BLOQUEADA`.

Usar:

```txt
CURRENT
COMPLETED
AVAILABLE
AVAILABLE_WITH_PENDING
VIEWING
NOT_APPLICABLE
```

`AVAILABLE_WITH_PENDING` deve ser clicável e exibir contador.

A etapa efetivamente corrente do processo continua distinta da etapa apenas visualizada.

## 18. Compatibilidade com documentos existentes

A redistribuição deve ser derivada pela categoria documental.

Não mover fisicamente nem duplicar arquivos existentes.

Ao abrir processo antigo:

- localizar documentos pela categoria;
- mostrar cada documento na nova fase correspondente;
- preservar histórico e vínculo original;
- não exigir novo upload quando já houver documento válido;
- não perder conclusões sistêmicas existentes.

## 19. Arquitetura recomendada

### Shared

```txt
shared/src/licitacao-guided-flow.ts
shared/src/licitacao-publication-requirements.ts
```

### Frontend

```txt
client/src/components/licitacao/processo/licitacao-publication-evidence.tsx
client/src/components/licitacao/processo/licitacao-dispute-parser.tsx
client/src/components/licitacao/processo/licitacao-phase-workspace.tsx
client/src/lib/licitacao-document-sequence.ts
```

### Backend

```txt
server/src/lib/licitacao-flow-policy.ts
server/src/lib/licitacao-document-requirements.ts
server/src/integrations/transparencia/transparencia-provider.ts
```

Reutilizar componentes e serviços já criados. Os nomes são sugestões, não autorização para duplicação.

## 20. Estratégia de implementação

### Etapa A — catálogo e ordem

- criar catálogo fase/documento/modalidade;
- adicionar `phase` e `order`;
- remover ordenação alfabética;
- garantir que renderização e `próxima pendência` usem a mesma sequência.

### Etapa B — novas fases

- criar Habilitação;
- criar Recursos;
- criar Controle Interno;
- atualizar trilho e view model;
- remapear documentos existentes.

### Etapa C — Publicação contextual

- Pregão/Concorrência/Leilão/Credenciamento;
- Dispensa;
- Inexigibilidade com seleção de inciso;
- links PNCP/BLL;
- evidências por canal;
- botão Transparência.

### Etapa D — Disputa e parser

- manter somente ata provisória na fila documental;
- integrar parser;
- prévia e confirmação;
- preencher participantes/propostas/lances;
- encaminhar para Julgamento.

### Etapa E — modo orientativo

- parametrizar enforcement;
- liberar fases;
- tornar justificativa opcional;
- preservar auditoria e pendências.

## 21. Testes obrigatórios

### Ordem

- requisitos são exibidos por `order`;
- `Resolver próxima pendência` segue exatamente a mesma ordem;
- nenhum `localeCompare(label)` interfere na fila.

### Publicação

- Dispensa mostra Aviso de Contratação Direta e PNCP;
- Inexigibilidade só libera evidências após seleção do inciso;
- Pregão/Concorrência/Leilão/Credenciamento mostram edital e canais;
- DOU/Jornal respeitam aplicabilidade dinâmica;
- links PNCP/BLL persistem;
- Transparência não informa sucesso falso.

### Fases

- Disputa não mostra Habilitação, Recursos, Controle ou Homologação;
- Julgamento mostra documentos próprios;
- Habilitação é independente;
- Recursos é independente e aceita `Não houve recurso`;
- Controle Interno fica entre Recursos e Homologação;
- Homologação mostra suas cinco atas/documentos finais.

### Modo orientativo

- usuário navega para fases futuras com pendências;
- avanço não exige justificativa;
- pendências permanecem visíveis;
- auditoria continua registrando ações;
- configuração `BLOCKING` permanece testável para uso futuro.

### Regressão

```txt
npm run check
npm run test:all
npm run build
```

Também executar testes do parser de ata conforme scripts existentes.

## 22. Critérios de aceite

A etapa estará concluída quando:

- documentos aparecerem na fase tecnicamente correta;
- a ordem visual for sequencial e estável;
- o botão de próxima pendência não alternar pela ordenação alfabética;
- Publicação variar corretamente por modalidade;
- links PNCP/BLL e botão Transparência estiverem na Publicação;
- Disputa solicitar apenas a ata provisória e atos próprios da sessão;
- parser alimentar licitantes, propostas e lances com prévia/confirmacão;
- Habilitação, Recursos e Controle Interno forem fases independentes;
- Homologação receber os documentos finais definidos;
- fases estiverem desbloqueadas no modo `ADVISORY`;
- justificativa não bloquear o fluxo durante a implantação;
- documentos antigos continuarem acessíveis sem duplicação;
- testes, typecheck e build passarem.

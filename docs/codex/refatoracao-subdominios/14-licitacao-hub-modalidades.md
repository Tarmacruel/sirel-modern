# 14 — Hub de modalidades do subsistema de Licitação

## 1. Objetivo

Transformar a primeira tela do subsistema de Licitação em um **hub compacto por modalidade/equipe de trabalho**, antes da listagem geral de processos.

A entrada `/licitacao` não deve começar diretamente por uma tabela com todos os processos. Ela deve primeiro permitir que a equipe escolha o tipo de trabalho:

- Credenciamentos;
- Dispensas de licitação;
- Inexigibilidades;
- Pregões;
- Concorrências e demais disputas competitivas;
- Licitações externas / Atas, incluindo adesões a atas de outros órgãos e atas em que o Município é órgão participante;
- Todos os processos, como rota de consulta geral.

A tela deve ser compacta, com pouca informação textual, navegação por objetos e ícones, e comportamento de redirecionamento/filtro.

## 2. Diagnóstico da tela atual

Arquivo principal:

```txt
client/src/pages/licitacao-page.tsx
```

A página atual já possui filtro por grupo de modalidade:

```txt
modalidadeGrupo
```

E usa as opções existentes em `shared/src/const.ts`:

```txt
PREGAO
CONCORRENCIA
DISPENSA
INEXIGIBILIDADE
CREDENCIAMENTO
LEILAO
OUTROS
```

Hoje a rota `/licitacao` carrega:

- `PageIntro` com texto amplo;
- quatro cards gerais de indicadores;
- filtro textual;
- filtro de status;
- filtro de secretaria;
- filtro de tipo de modalidade;
- tabela com todos os processos;
- painel lateral de detalhe por linha.

Esse formato é útil para visão geral, mas não é ideal para equipes organizadas por modalidade.

## 3. Decisão de produto

A rota `/licitacao` passa a ser uma entrada de seleção de área de trabalho.

Fluxo desejado:

```txt
Usuário acessa licitacao.sirel.com.br/licitacao
        ↓
Vê cards compactos por modalidade/equipe
        ↓
Clica em Dispensas, Pregões, Credenciamento etc.
        ↓
Sistema abre a fila filtrada daquela modalidade
        ↓
Usuário trabalha apenas nos processos daquele grupo
```

## 4. Rotas e query params recomendados

Preservar `/licitacao` como hub.

Criar modo de lista filtrada por query string:

```txt
/licitacao?hub=0&workspace=dispensas
/licitacao?hub=0&workspace=inexigibilidades
/licitacao?hub=0&workspace=credenciamentos
/licitacao?hub=0&workspace=pregoes
/licitacao?hub=0&workspace=concorrencias
/licitacao?hub=0&workspace=atas-adesoes
/licitacao?hub=0&workspace=todos
```

Alternativa aceitável, se o roteamento ficar mais limpo:

```txt
/licitacao/dispensas
/licitacao/inexigibilidades
/licitacao/credenciamentos
/licitacao/pregoes
/licitacao/concorrencias
/licitacao/atas-adesoes
```

A opção por query string é menos invasiva porque aproveita a rota e a tabela atual.

## 5. Registry de áreas de trabalho da Licitação

Criar arquivo recomendado:

```txt
client/src/lib/licitacao-workspaces.ts
```

Ou, se for reutilizado no backend:

```txt
shared/src/licitacao-workspaces.ts
```

Tipo sugerido:

```ts
export type LicitacaoWorkspaceKey =
  | "credenciamentos"
  | "dispensas"
  | "inexigibilidades"
  | "pregoes"
  | "concorrencias"
  | "atas-adesoes"
  | "todos";

export type LicitacaoWorkspaceDefinition = {
  key: LicitacaoWorkspaceKey;
  title: string;
  shortTitle: string;
  icon: string;
  modalidadeGrupo?: string;
  customFilter?: "ATAS_ADESOES";
  href: string;
  tone?: "default" | "primary" | "warning" | "success" | "neutral";
};
```

## 6. Cards compactos do Hub

Criar componente:

```txt
client/src/components/licitacao/licitacao-workspace-hub.tsx
```

Cada card deve ter:

- ícone;
- nome curto;
- contador principal;
- subtítulo mínimo;
- botão/ação implícita no card inteiro.

Exemplo visual:

```txt
[ícone] Dispensas
128
Fila de contratação direta
```

Evitar textos longos. O card inteiro deve ser clicável.

## 7. Mapa de áreas/equipes

### 7.1. Credenciamento

```txt
key: credenciamentos
modalidadeGrupo: CREDENCIAMENTO
label: Credenciamentos
ícone: BadgeCheck / Handshake / UsersRound
```

### 7.2. Dispensas

```txt
key: dispensas
modalidadeGrupo: DISPENSA
label: Dispensas
ícone: FileMinus2 / ClipboardCheck
```

### 7.3. Inexigibilidades

```txt
key: inexigibilidades
modalidadeGrupo: INEXIGIBILIDADE
label: Inexigibilidades
ícone: FileKey2 / ShieldCheck
```

### 7.4. Pregões

```txt
key: pregoes
modalidadeGrupo: PREGAO
label: Pregões
ícone: Gavel / Megaphone
```

### 7.5. Concorrências e disputas competitivas

```txt
key: concorrencias
modalidadeGrupo: CONCORRENCIA
label: Concorrências
ícone: Landmark / Scale
```

### 7.6. Atas, adesões e licitações externas

```txt
key: atas-adesoes
customFilter: ATAS_ADESOES
label: Atas e adesões
ícone: FileSymlink / Network / ClipboardCopy
```

Essa área deve cobrir:

- adesão a atas de registro de preços de outros órgãos;
- atas em que o Município é órgão participante;
- processos externos acompanhados pela equipe de licitação, quando cadastrados no sistema.

Como essa classificação pode não estar totalmente modelada no banco, implementar em duas etapas:

1. Frontend com card e query param próprio;
2. Backend com filtro real por campos existentes ou, se necessário, campo classificatório futuro.

## 8. Filtros técnicos

### 8.1. Reutilizar filtro existente

Para as modalidades já cobertas pelo schema atual, usar:

```ts
modalidadeGrupo: "DISPENSA" | "INEXIGIBILIDADE" | "CREDENCIAMENTO" | "PREGAO" | "CONCORRENCIA"
```

A página atual já possui `modalidadeGrupo` no estado e envia esse filtro para `trpc.licitacao.list`.

### 8.2. Novo filtro para Atas/Adesões

Adicionar ao input de listagem, se possível:

```ts
workspace?: "ATAS_ADESOES" | "TODOS";
```

Ou:

```ts
modalidadeEspecial?: "ATAS_ADESOES";
```

O backend deve filtrar por critérios disponíveis. Exemplos possíveis, a depender do banco atual:

- código/nome da modalidade contendo `ADESAO`;
- código/nome contendo `ATA`;
- origem do processo marcada como externa;
- tipo de contratação cadastrado como adesão/participação;
- campo futuro específico, se inexistente hoje.

Não usar heurística frágil sem validar dados reais. Se o dado ainda não existir, implementar o card com estado vazio e comentário técnico para modelagem futura.

## 9. Layout recomendado

### 9.1. Tela inicial `/licitacao`

Estrutura:

```txt
Cabeçalho curto: Licitação
Subtítulo curto: Escolha a área de trabalho
Grid de cards compactos por modalidade
Linha inferior: Todos os processos | Publicações pendentes | Recursos
```

Sem tabela na primeira leitura.

### 9.2. Tela filtrada

Ao clicar em uma modalidade, abrir a mesma listagem atual, mas com:

- título alterado para a área selecionada;
- chip de filtro ativo;
- botão `Trocar modalidade` ou `Voltar ao Hub`;
- tabela/lista filtrada;
- filtros secundários recolhíveis.

Exemplo:

```txt
Dispensas
128 processos
[Voltar às modalidades] [Todos] [Publicados] [Pendentes]
```

## 10. Redução textual

Evitar textos como:

```txt
A entrada do módulo destaca o que está publicado...
```

Preferir:

```txt
Escolha a fila de trabalho.
```

Nos cards:

```txt
Dispensas
Contratação direta
128
```

## 11. Componente de lista filtrada

Extrair a tabela atual para componente próprio:

```txt
client/src/components/licitacao/licitacao-process-list.tsx
```

A página `LicitacaoPage` deve ficar responsável por:

- ler query params;
- decidir se mostra Hub ou lista;
- montar filtros;
- passar filtros ao componente de lista.

## 12. Indicadores por card

Idealmente criar endpoint específico:

```txt
licitacao.workspaceSummary
```

Retorno sugerido:

```ts
{
  key: "dispensas",
  total: 128,
  pendentesPublicacao: 42,
  recursosPendentes: 0,
  atrasados: 3
}
```

Se o endpoint não couber nesta etapa, usar `licitacao.list` com `pageSize: 1` por workspace apenas para contador, mas isso pode gerar várias chamadas. Preferir endpoint agregado no backend.

## 13. Critérios de aceite

A etapa será aceita quando:

- `/licitacao` abrir um Hub compacto por modalidade;
- cards forem clicáveis e orientados por ícones;
- clicar em `Dispensas` abrir a fila filtrada por `modalidadeGrupo=DISPENSA`;
- clicar em `Inexigibilidades` abrir a fila filtrada por `INEXIGIBILIDADE`;
- clicar em `Credenciamentos` abrir a fila filtrada por `CREDENCIAMENTO`;
- clicar em `Pregões` abrir a fila filtrada por `PREGAO`;
- clicar em `Concorrências` abrir a fila filtrada por `CONCORRENCIA`;
- existir card para `Atas e adesões`, ainda que o filtro real dependa de validação do modelo de dados;
- a listagem filtrada permitir voltar ao Hub;
- a tabela atual continuar funcional;
- filtros secundários continuarem disponíveis, mas com menor destaque;
- não houver excesso textual na primeira tela;
- `npm run check`, `npm run test:all` e `npm run build` passarem.

## 14. Fora do escopo

Não refatorar nesta etapa:

- página de detalhe `/licitacao/:processoId`;
- fluxo interno de preparação/publicação/disputa;
- schema de permissões por usuário;
- integração PNCP/BLL;
- regras de prazo;
- upload/documentos.

Esta etapa é apenas a entrada operacional do subsistema de Licitação por modalidade/equipe.

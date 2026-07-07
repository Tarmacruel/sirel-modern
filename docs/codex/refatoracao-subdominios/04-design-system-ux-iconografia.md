# 04 — Design system, UX, iconografia e linearidade operacional

## 1. Objetivo

Reduzir a poluição visual do SIREL e transformar cada subsistema em uma experiência objetiva, orientada a ações e com menor carga cognitiva.

Cada subdomínio deve responder rapidamente:

1. onde o usuário está;
2. quais pendências exigem atenção;
3. qual é a próxima ação segura.

## 2. Princípios de interface

### Clareza antes de completude

A tela inicial de cada subsistema não deve mostrar todas as informações disponíveis. Ela deve priorizar pendências, prazos, alertas, ações rápidas e retomada de processos recentes.

### Texto curto

Usar títulos curtos, descrições de uma frase e botões diretos.

Modelo recomendado:

```txt
Licitações em andamento
Julgamento, habilitação, recursos e publicação.
[ Abrir painel ]
```

### Hierarquia visual

Sequência recomendada para telas principais:

```txt
Título curto
Subtítulo operacional
Ações primárias
Cards de status
Tabela ou lista principal
Detalhes progressivos
```

### Ícones com função

Os ícones devem sinalizar função. Evitar ícones puramente decorativos.

## 3. Mapa de iconografia

Usar `lucide-react`, mantendo coerência visual.

| Subsistema | Ícone principal | Ícones auxiliares |
|---|---|---|
| Hub | `LayoutDashboard` | `Sparkles`, `Search`, `BellRing` |
| Planejamento | `FolderKanban` | `ClipboardList`, `FileText`, `Calculator` |
| Compras | `ShoppingCart` | `SearchCheck`, `BadgeDollarSign`, `PackageCheck` |
| Licitação | `ScrollText` | `Gavel`, `Users`, `FileCheck2`, `Clock3` |
| Contratos | `Landmark` | `CalendarClock`, `PenLine`, `ShieldCheck` |
| Documentos | `FileText` | `Upload`, `Download`, `Archive` |
| Workflow | `Workflow` | `ArrowRightLeft`, `Clock3`, `CheckCircle2` |
| Consultas | `Search` | `FolderSearch`, `Database`, `History` |
| Administração | `Settings2` | `Users`, `ShieldCheck`, `Activity` |

## 4. Header por subsistema

O header deve ser compacto e funcional.

Exemplo:

```txt
[Ícone] Licitação
Fase externa, julgamento e habilitação.

[Busca rápida] [Prazos] [Novo documento] [Usuário]
```

Evitar subtítulos extensos. O header não deve competir com o conteúdo da página.

## 5. Sidebar por subsistema

A sidebar deve ter no máximo 7 entradas principais.

Licitação:

```txt
Início
Licitações
Documentos
Prazos
Dossiês
Consultas
Notificações
```

Planejamento:

```txt
Início
Processos
DFD
ETP
Cotações
TR
PCA
```

Administração:

```txt
Início
Usuários
Parâmetros
Auditoria
Importações
Cadastros
Saúde do sistema
```

## 6. Cards de ação

Cada card deve ter:

- ícone;
- título de até 32 caracteres;
- descrição de até 96 caracteres;
- métrica opcional;
- uma ação principal.

Exemplo conceitual:

```txt
[ScrollText] Licitações em julgamento
12 processos com proposta em análise.
[ Abrir ]
```

## 7. Botões

Usar verbos objetivos:

```txt
Abrir
Novo
Salvar
Prosseguir
Revisar
Exportar
Gerar PDF
Consultar
```

Evitar rótulos longos e explicações dentro do botão.

## 8. Fluxo linear em Licitação

A tela de Licitação deve apresentar etapas em ordem, conforme a modalidade. O componente sugerido é `StepTimeline`, com etapa atual, etapa concluída e próxima etapa.

Ritos competitivos completos devem exibir preparação, publicação, propostas, disputa, julgamento, habilitação, recursos e homologação.

Contratações diretas devem exibir justificativa, pesquisa ou comprovação, habilitação, ratificação ou homologação e contratação.

## 9. Homes por subsistema

Licitação: ações rápidas, prazos críticos, processos por fase, diligências abertas e documentos recentes.

Planejamento: DFD pendentes, ETP em elaboração, cotações incompletas, TR aguardando validação e PCA.

Compras: pesquisas de preço, mapas comparativos, fornecedores, itens sem referência e importações de SD.

Administração: usuários ativos, auditoria recente, parâmetros críticos, importações e saúde do sistema.

## 10. Ajuda progressiva

Textos longos devem ficar fechados por padrão, em componentes de ajuda ou detalhes. A interface principal deve permanecer limpa.

## 11. Estados visuais

Badges padronizados:

```txt
Rascunho
Em andamento
Aguardando
Concluído
Atrasado
Crítico
```

Ícones recomendados:

- `AlertTriangle`: prazo crítico ou inconsistência;
- `Clock3`: aguardando prazo;
- `CheckCircle2`: concluído;
- `XCircle`: inválido ou encerrado;
- `ShieldCheck`: validado.

## 12. Mobile

Regras:

- sidebar como drawer;
- ações primárias sempre visíveis;
- tabelas com versão card/lista;
- header baixo;
- busca rápida acessível.

## 13. Componentes recomendados

Criar ou consolidar:

```txt
SubsystemHero
SubsystemActionGrid
ActionCard
StatusBadge
StepTimeline
ProcessQuickSearch
CompactMetricCard
ModuleEmptyState
DeniedState
CrossSubsystemLink
```

## 14. Definition of Done

- cada subsistema possui título, ícone e descrição próprios;
- login contextual usa textos do subsistema;
- sidebar tem no máximo 7 entradas principais;
- header é compacto;
- home por subsistema prioriza ações e pendências;
- textos longos foram movidos para ajuda progressiva;
- botões usam verbos objetivos;
- mobile foi considerado;
- ícones têm função clara.

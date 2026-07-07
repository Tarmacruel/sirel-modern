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

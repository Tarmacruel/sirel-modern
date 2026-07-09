# 19 — Prompt Codex: fluxo documental por fase e modalidade

## Prompt principal

```txt
Leia antes de implementar:

- docs/codex/refatoracao-subdominios/09-registro-implementacao-operacao-local.md
- docs/codex/refatoracao-subdominios/16-licitacao-fases-compactacao-dark-mode.md
- docs/codex/refatoracao-subdominios/18-licitacao-fluxo-documental-por-fase.md
- client/src/lib/licitacao-phase-config.ts
- shared/src/const.ts
- shared/src/schemas/licitacao.ts
- server/src/routers/licitacao.ts
- client/src/pages/licitacao-processo-page.tsx
- componentes atuais em client/src/components/licitacao/processo
- docs/ata-sessao-reports.md

Objetivo:
Reorganizar funcionalmente o fluxo guiado da licitação, distribuindo documentos por fase e modalidade, corrigindo a ordem sequencial, criando fases independentes de Habilitação, Recursos e Controle Interno e ativando temporariamente um modo orientativo sem bloqueio por pendências ou justificativa.

Antes de implementar:

1. Inspecione o worktree atual, pois as refatorações visuais mais recentes podem ainda não estar refletidas no estado remoto antigo.
2. Localize o catálogo atual de fases e documentos.
3. Localize qualquer ordenação alfabética aplicada à fila de evidências.
4. Localize a função que resolve `próxima pendência`.
5. Localize o parser/integrador de ata de sessão existente.
6. Verifique se já existe integração com o Portal da Transparência.
7. Verifique se já existe campo para fundamento/inciso da Inexigibilidade.
8. Não crie implementações paralelas se já houver serviços equivalentes.

Problema estrutural atual:

`getLicitacaoDocumentBlueprint()` retorna apenas `{ internal, external }`, e o array `external` mistura documentos de Publicação, Disputa, Julgamento, Habilitação, Recursos, Controle Interno e Homologação.

Substitua essa estrutura por catálogo explícito por fase.

Novo modelo de fases:

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

Sequência obrigatória para Dispensa com disputa:

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

Cada requisito documental deve ter pelo menos:

```ts
{
  category: string;
  phase: LicitacaoGuidedPhaseKey;
  order: number;
  label: string;
  description: string;
  obrigatorio: boolean;
  condicional?: boolean;
  source?: "UPLOAD" | "SYSTEM" | "PARSER" | "INTEGRATION";
  completionStrategy?: "DOCUMENT" | "SYSTEM_STATE" | "PARSER_RESULT" | "MANUAL_CONFIRMATION";
}
```

Ordem:

1. Renderize por `order` crescente.
2. Não use `label.localeCompare()` para a fila operacional.
3. A função de próxima pendência deve consumir o mesmo array ordenado da UI.
4. Crie testes que demonstrem a estabilidade da sequência.

PUBLICAÇÃO — PREGÃO, CONCORRÊNCIA, LEILÃO E CREDENCIAMENTO

Após calcular/confirmar as datas, liberar:

- edital;
- comprovante de publicação no Diário Oficial do Município;
- comprovante de publicação no Diário Oficial da União;
- comprovante de publicação em Jornal de Grande Circulação;
- comprovante de publicação no PNCP;
- link público no PNCP;
- link público na BLL;
- botão `Publicar no Portal da Transparência`.

Categorias sugeridas, somente se não existirem equivalentes:

- LICITACAO_EDITAL_PUBLICADO
- LICITACAO_COMPROVANTE_PUBLICACAO_DOM
- LICITACAO_COMPROVANTE_PUBLICACAO_DOU
- LICITACAO_COMPROVANTE_PUBLICACAO_JORNAL
- LICITACAO_COMPROVANTE_PUBLICACAO_PNCP

DOM, DOU e Jornal devem respeitar canais e aplicabilidade dinâmica. Disponibilizar slot não significa marcar tudo como obrigatório indiscriminadamente.

PUBLICAÇÃO — DISPENSA

Após calcular/confirmar as datas, liberar:

- Aviso de Contratação Direta;
- comprovante de publicação no PNCP;
- link PNCP;
- link BLL;
- botão `Publicar no Portal da Transparência`.

Não exibir automaticamente edital, DOU ou Jornal para Dispensa, salvo configuração específica do processo.

PUBLICAÇÃO — INEXIGIBILIDADE

Primeiro exigir seleção do inciso/fundamento legal aplicável.

Se não houver campo equivalente, criar campo tipado e migration, por exemplo:

```txt
licitacoes.fundamentoLegalInciso
```

Depois da seleção, liberar:

- Aviso de Contratação Direta;
- comprovante de publicação no PNCP;
- link PNCP;
- link BLL;
- botão `Publicar no Portal da Transparência`.

Não codifique as opções de inciso diretamente no componente. Centralize o catálogo.

PORTAL DA TRANSPARÊNCIA

1. Reutilize integração existente, se houver.
2. Se não houver, crie provider/adapter explícito.
3. Não simule sucesso.
4. Estados mínimos:
   - NOT_CONFIGURED
   - READY
   - PUBLISHING
   - PUBLISHED
   - FAILED
5. Registrar protocolo, data, usuário e erro quando disponíveis.
6. Garantir idempotência e nova tentativa segura.
7. Sem endpoint/credenciais, mostrar `Integração não configurada`.

DISPUTA

Na fila documental da Disputa, manter somente documentos próprios da sessão.

Documento principal obrigatório:

```txt
LICITACAO_ATA_SESSAO_PROVISORIA
```

Fluxo:

1. anexar ata provisória;
2. acionar parser existente;
3. exibir prévia;
4. confirmar reconciliação;
5. preencher licitantes, propostas, lances e resultados disponíveis;
6. liberar trabalho de Julgamento.

Não criar um segundo parser. Reutilizar `relatorios.processAtaSessao` ou o serviço equivalente já integrado.

Remover da Disputa:

- ata de homologação;
- termo de homologação;
- comunicação para Controladoria;
- habilitação das empresas;
- recursos;
- atas finais;
- julgamento técnico como evidência genérica de Disputa.

JULGAMENTO

Associar documentos e ações de:

- análise/classificação;
- parecer técnico;
- planilhas de julgamento;
- decisões de classificação/desclassificação;
- definição provisória do vencedor.

Mover `LICITACAO_JULGAMENTO_PROPOSTA_TECNICA` para esta fase.

HABILITAÇÃO

Criar fase independente após Julgamento.

Mover:

```txt
LICITACAO_HABILITACAO_EMPRESAS
```

Permitir conclusão por documento e/ou estado sistêmico dos licitantes, conforme regra atual.

RECURSOS

Criar fase independente após Habilitação.

Mover:

```txt
LICITACAO_RECURSOS
```

Permitir:

- intenção;
- razões;
- contrarrazões;
- decisão;
- ação `Não houve recurso` sem exigir upload artificial.

CONTROLE INTERNO

Criar fase independente depois de Recursos e antes de Homologação.

Mover:

```txt
LICITACAO_COMUNICACAO_CONTROLADORIA
```

Label preferencial:

```txt
Encaminhamento ao Controle Interno
```

Se o estado atual precisar ser persistido e não existir equivalente, adicionar `CONTROLE_INTERNO` ao enum, schemas, labels e migration. Não duplicar etapa de workflow existente se ela já representar corretamente o mesmo estado.

HOMOLOGAÇÃO

Associar, no mínimo:

- LICITACAO_ATA_HOMOLOGACAO
- LICITACAO_ATA_RELATORIO_LANCES
- LICITACAO_ATA_SESSAO_FINAL
- LICITACAO_ATA_ADJUDICACAO
- LICITACAO_ATA_VENCEDORES

Manter Termo de Homologação nesta fase quando aplicável. Não removê-lo silenciosamente.

Documentos já gerados pelo parser/plataforma podem concluir requisitos sem upload duplicado.

MODO ORIENTATIVO TEMPORÁRIO

Implemente política configurável no backend:

```ts
type LicitacaoFlowEnforcement = "ADVISORY" | "BLOCKING";
```

Configuração inicial:

```txt
LICITACAO.FLUXO.ENFORCEMENT=ADVISORY
```

Em `ADVISORY`:

- todas as fases aplicáveis são clicáveis;
- usuário pode avançar com pendências;
- pendências continuam visíveis;
- justificativa de fora do fluxo é opcional;
- backend não deve rejeitar ação somente por pendência ou justificativa ausente;
- auditoria permanece ativa;
- não exibir fases futuras como bloqueadas;
- usar `AVAILABLE_WITH_PENDING` quando necessário.

Preserve implementação de `BLOCKING` para reativação futura por configuração, sem reescrever a UI.

COMPATIBILIDADE

1. Não duplicar documentos existentes.
2. Redistribuir pela categoria.
3. Preservar vínculos, IDs, histórico e arquivos.
4. Documento já existente deve aparecer na nova fase correta.
5. Não exigir novo upload de evidência válida.
6. Preservar conclusões automáticas existentes.

ARQUITETURA SUGERIDA

Shared:

- shared/src/licitacao-guided-flow.ts
- shared/src/licitacao-publication-requirements.ts

Frontend:

- client/src/components/licitacao/processo/licitacao-publication-evidence.tsx
- client/src/components/licitacao/processo/licitacao-dispute-parser.tsx
- client/src/components/licitacao/processo/licitacao-phase-workspace.tsx
- client/src/lib/licitacao-document-sequence.ts

Backend:

- server/src/lib/licitacao-flow-policy.ts
- server/src/lib/licitacao-document-requirements.ts
- server/src/integrations/transparencia/transparencia-provider.ts

Esses nomes são sugestões. Refatore equivalentes atuais em vez de duplicar.

TESTES OBRIGATÓRIOS

1. Ordem de documentos por `order`.
2. Próxima pendência segue a mesma ordem.
3. Disputa não mostra documentos de outras fases.
4. Dispensa recebe publicação específica.
5. Inexigibilidade depende do inciso.
6. Pregão/Concorrência/Leilão/Credenciamento recebem edital/canais.
7. Habilitação, Recursos e Controle Interno aparecem separadamente.
8. Homologação recebe os documentos finais definidos.
9. ADVISORY permite avanço com pendência.
10. Justificativa não bloqueia no modo ADVISORY.
11. BLOCKING permanece testável.
12. Documentos antigos continuam acessíveis.
13. Parser de ata continua funcional.

Executar:

- npm run check
- npm run test:all
- npm run build
- testes Python do parser de ata, conforme scripts existentes

TESTES MANUAIS MÍNIMOS

1. Abrir uma Dispensa com disputa.
2. Confirmar sequência das nove fases.
3. Confirmar todas as fases clicáveis no modo orientativo.
4. Confirmar avanço sem justificativa.
5. Publicação mostra Aviso de Contratação Direta, PNCP, links e Transparência.
6. Disputa mostra somente Ata de Sessão Provisória como evidência documental principal.
7. Processar ata e revisar prévia.
8. Confirmar preenchimento de licitantes/propostas/lances.
9. Julgamento mostra seus documentos.
10. Habilitação mostra seus documentos.
11. Recursos permite registrar ausência.
12. Controle Interno mostra encaminhamento.
13. Homologação mostra atas finais.
14. Resolver próxima pendência segue ordem sequencial.
15. Repetir Publicação em Pregão e Inexigibilidade.

Entregue no final:

- catálogo final de fases;
- mapa final de documentos por fase/modalidade;
- migrations criadas;
- estratégia de compatibilidade;
- integração do parser;
- situação da integração Transparência;
- política ADVISORY/BLOCKING;
- testes executados;
- limitações e próximos passos.
```

## Prompt de revisão

```txt
Revise a implementação do fluxo documental por fase e modalidade.

Verifique:

1. se o catálogo deixou de depender de `{ internal, external }`;
2. se todo documento tem fase e ordem explícitas;
3. se a UI e `próxima pendência` usam a mesma sequência;
4. se não há ordenação alfabética acidental;
5. se Publicação varia corretamente por modalidade;
6. se Inexigibilidade exige inciso antes de liberar publicação;
7. se Transparência não simula sucesso;
8. se Disputa contém somente atos da sessão;
9. se o parser existente foi reutilizado;
10. se Julgamento, Habilitação, Recursos, Controle Interno e Homologação estão separados;
11. se documentos antigos foram preservados;
12. se ADVISORY libera avanço e torna justificativa opcional;
13. se BLOCKING pode ser reativado por configuração;
14. se não houve regressão em upload, propostas, lances ou habilitação;
15. se check, testes, build e testes do parser passam.

Corrija as regressões encontradas sem voltar a misturar documentos entre fases.
```

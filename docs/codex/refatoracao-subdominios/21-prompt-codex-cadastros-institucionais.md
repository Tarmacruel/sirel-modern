# 21 — Prompt Codex: cadastros institucionais e designações

## Prompt principal

```txt
Leia antes de implementar:

- docs/codex/refatoracao-subdominios/09-registro-implementacao-operacao-local.md
- docs/codex/refatoracao-subdominios/18-licitacao-fluxo-documental-por-fase.md
- docs/codex/refatoracao-subdominios/20-cadastros-institucionais-designacoes.md
- client/src/pages/cadastros-page.tsx
- shared/src/schemas/cadastros.ts
- server/src/routers/cadastros.ts
- server/src/db/schema.ts
- drizzle/schema.ts
- client/src/pages/licitacao-processo-page.tsx
- catálogo/document requirements atual da Licitação

Objetivo:
Criar um catálogo institucional reutilizável de Comissões de Contratação, Equipes de Apoio, Ordenadores de Despesas e atos de designação. Na fase de Preparação, o usuário deve selecionar esses registros em vez de anexar novamente os decretos em cada processo.

Diagnóstico atual:

1. Cadastros já possui pessoas/servidores, secretarias e departamentos.
2. Não existem entidades de comissão, equipe de apoio, ordenador ou ato institucional.
3. A tabela `pessoas` deve ser reutilizada para membros e responsáveis.
4. `processos` já possui `autoridadeCompetenteId` e `condutorProcessoId`, mas não possui vínculos institucionais.
5. `documentos.processoId` é obrigatório; portanto, não use um processo arbitrário para armazenar decreto reutilizável.
6. Os requisitos atuais de decreto devem mudar de upload comum para seleção de catálogo.

Antes de alterar:

1. Inspecione o worktree mais recente.
2. Localize qualquer implementação já iniciada de atos, comissões ou designações.
3. Não duplique pessoas/servidores.
4. Não crie uma segunda tela genérica de cadastros se a entrada puder ser integrada ao Hub atual.
5. Não transforme `cadastros-page.tsx` em outro componente monolítico.

MODELO DE DADOS

Crie, salvo se já existir equivalente:

1. `atos_designacao`
2. `grupos_institucionais`
3. `grupos_institucionais_membros`
4. `ordenadores_despesa`
5. `ordenadores_despesa_secretarias`, se o vínculo puder abranger mais de uma secretaria

Enums/tipos:

```ts
type AtoDesignacaoTipo = "DECRETO" | "PORTARIA" | "RESOLUCAO" | "OUTRO";
type GrupoInstitucionalTipo = "COMISSAO_CONTRATACAO" | "EQUIPE_APOIO";
type OrdenadorTipoVinculo = "TITULAR" | "SUBSTITUTO" | "DELEGADO";
```

Funções de membros devem ser centralizadas e tipadas:

- PRESIDENTE
- AGENTE_CONTRATACAO
- PREGOEIRO
- MEMBRO
- MEMBRO_SUPLENTE
- COORDENADOR_APOIO
- APOIO
- OUTRO

`atos_designacao` deve armazenar:

- número;
- ano;
- tipo;
- ementa;
- emissão/publicação;
- início/fim de vigência;
- arquivo URL/chave;
- MIME/tamanho;
- hash;
- ativo;
- auditoria temporal.

Não use `documentos` para o arquivo institucional porque `processoId` é obrigatório.

VÍNCULO COM A LICITAÇÃO

Adicione em `licitacoes`, salvo arquitetura equivalente mais adequada já existente:

- comissaoId
- equipeApoioId
- ordenadorDespesaId
- designacoesSnapshot jsonb
- designacoesSelecionadasPor
- designacoesSelecionadasEm

Os IDs devem possuir FKs explícitas.

Ao selecionar, grave snapshot contendo:

- nome da estrutura;
- número/tipo do ato;
- vigência;
- membros e funções;
- pessoa do ordenador;
- secretaria/escopo.

O snapshot deve preservar a realidade existente no momento da seleção. Mudança posterior do catálogo não pode alterar retroativamente o processo.

CADASTROS — UI

Adicionar no Hub de Cadastros:

- Comissões
- Equipes de Apoio
- Ordenadores de Despesas

Opcionalmente, adicionar também `Atos de Designação` como entrada própria.

Não implementar os formulários complexos dentro de um único switch gigante.

Crie/refatore componentes dedicados, por exemplo:

- client/src/components/cadastros-institucionais/comissoes-panel.tsx
- client/src/components/cadastros-institucionais/equipes-apoio-panel.tsx
- client/src/components/cadastros-institucionais/ordenadores-panel.tsx
- client/src/components/cadastros-institucionais/ato-designacao-form.tsx
- client/src/components/cadastros-institucionais/membros-editor.tsx

COMISSÃO

Campos:

- nome;
- sigla;
- secretaria/escopo opcional;
- ato;
- vigência;
- membros selecionados do cadastro de pessoas;
- função de cada membro;
- ordem;
- situação.

EQUIPE DE APOIO

Campos:

- nome;
- ato;
- vigência;
- coordenador, se houver;
- membros de apoio;
- secretaria/escopo;
- situação.

Permita que comissão e equipe apontem para o mesmo ato quando o decreto formalizar ambas.

ORDENADOR DE DESPESAS

Campos:

- pessoa existente;
- secretaria(s);
- titular/substituto/delegado;
- ato;
- vigência;
- observação;
- situação.

Não replique nome, CPF ou cargo em nova tabela.

PREPARAÇÃO DA LICITAÇÃO

No início da sequência, inserir:

1. Selecionar Comissão de Contratação
2. Selecionar Equipe de Apoio
3. Selecionar Ordenador de Despesas
4. Demais atos/documentos já configurados

Para a Dispensa analisada, a sequência final esperada é:

1. Comissão
2. Equipe de Apoio
3. Ordenador de Despesas
4. Reserva orçamentária
5. Ato de autorização
6. Justificativa da dispensa
7. Pesquisa de preços
8. Minuta do aviso
9. Parecer jurídico

A aplicabilidade deve continuar configurável por modalidade.

Cada requisito institucional deve abrir seletor, não upload:

```txt
Comissão de Contratação    Não selecionada    [Selecionar]
Equipe de Apoio            Não selecionada    [Selecionar]
Ordenador de Despesas      Não selecionado     [Selecionar]
```

Após selecionar, mostrar:

- nome;
- ato;
- vigência;
- membros principais;
- Ver composição;
- Ver ato;
- Trocar.

MODAL DE SELEÇÃO

Filtros:

- busca;
- tipo;
- secretaria;
- vigência;
- ativos/vigentes.

Resultados devem mostrar:

- nome;
- ato;
- vigência;
- composição resumida;
- escopo;
- ação `Selecionar para o processo`.

Adicionar atalho `Abrir Cadastros` para gestor/admin quando não houver registro adequado.

COMPLETION STRATEGY

Estenda o requisito documental com:

```ts
source: "CATALOG"
completionStrategy: "CATALOG_SELECTION"
editor: "INSTITUTIONAL_SELECTOR"
```

Mapeamento:

- LICITACAO_DECRETO_COMISSAO => comissaoId
- LICITACAO_DECRETO_EQUIPE_APOIO => equipeApoioId
- LICITACAO_DECRETO_ORDENADOR_DESPESAS => ordenadorDespesaId

Não mostrar upload comum para esses três requisitos.

CONDUTOR E AUTORIDADE

Ao selecionar comissão com AGENTE_CONTRATACAO, PREGOEIRO ou PRESIDENTE:

- sugerir preencher `condutorProcessoId`;
- pedir confirmação;
- não sobrescrever silenciosamente.

Ordenador e autoridade competente permanecem conceitos independentes. Pode haver sugestão de preenchimento, mas não acoplamento obrigatório.

VIGÊNCIA E VERSIONAMENTO

Para novas seleções:

- mostrar ativos;
- mostrar vigentes na data de referência;
- priorizar compatíveis com a secretaria.

Para registros já vinculados:

- preservar histórico após expiração;
- não invalidar automaticamente o processo;
- mostrar aviso de vigência encerrada quando aplicável.

Se composição usada em processos precisar mudar:

- criar nova versão;
- não alterar retroativamente a versão usada;
- impedir exclusão física de registro vinculado.

DOSSIÊ

Exibir os atos como `Documento institucional referenciado`.

Não duplicar o arquivo em `documentos` para cada processo.

Na exportação do dossiê, resolver os atos referenciados e incluir os arquivos.

BACKEND

Prefira router dedicado:

```txt
server/src/routers/cadastros-institucionais.ts
```

Procedures esperadas:

- atos.list/save/inactivate
- comissoes.list/get/save/inactivate
- equipesApoio.list/get/save/inactivate
- ordenadores.list/get/save/inactivate
- designacoes.availableForProcess
- designacoes.getForLicitacao
- designacoes.selectForLicitacao

Schemas:

```txt
shared/src/schemas/cadastros-institucionais.ts
```

Permissões:

- operador/gestor/admin podem consultar e selecionar;
- somente gestor autorizado/admin podem criar, alterar e inativar;
- todos os atos devem ser auditados.

UPLOAD

Crie upload próprio para atos institucionais, reutilizando segurança existente:

```txt
/api/cadastros-institucionais/atos/upload
```

Validar:

- autenticação;
- MIME;
- tamanho;
- nome seguro;
- hash;
- armazenamento;
- auditoria.

MIGRAÇÃO E COMPATIBILIDADE

1. Não apagar decretos já anexados em processos antigos.
2. Novos processos usam catálogo como padrão.
3. Oferecer, se viável, conversão administrativa de documento antigo em ato institucional.
4. Não exigir regularização retroativa imediata durante o modo orientativo.
5. Preservar histórico e documentos antigos.

TESTES OBRIGATÓRIOS

1. Criar ato institucional.
2. Criar comissão com membros e funções.
3. Criar equipe de apoio.
4. Criar ordenador para secretaria.
5. Compartilhar ato entre comissão e equipe.
6. Selecionar os três no processo.
7. Confirmar conclusão sistêmica dos requisitos.
8. Confirmar ausência de formulário de upload para esses requisitos.
9. Trocar seleção e conferir auditoria.
10. Confirmar snapshot histórico.
11. Confirmar que alteração posterior do catálogo não altera processo antigo.
12. Confirmar sugestão de condutor sem sobrescrita automática.
13. Confirmar documento institucional no dossiê.
14. Confirmar bloqueio de exclusão de registro vinculado.
15. Confirmar filtros por vigência e secretaria.

Executar:

- npm run check
- npm run test:all
- npm run build

Entregue no final:

- tabelas/migrations criadas;
- componentes e rotas criados;
- fluxo de seleção na Preparação;
- estratégia de snapshot/versionamento;
- integração com o dossiê;
- permissões aplicadas;
- testes executados;
- limitações remanescentes.
```

## Prompt de revisão

```txt
Revise a implementação dos cadastros institucionais e designações.

Verifique:

1. se pessoas/servidores foram reutilizados;
2. se não há duplicação de nomes e CPFs;
3. se atos não foram armazenados em processo arbitrário;
4. se comissão e equipe podem compartilhar o mesmo ato;
5. se vínculos possuem vigência e versionamento;
6. se processos registram IDs e snapshot;
7. se os três requisitos usam CATALOG_SELECTION;
8. se upload comum deixou de aparecer;
9. se troca de seleção é auditada;
10. se processo antigo mantém composição histórica;
11. se condutor não é sobrescrito silenciosamente;
12. se dossiê resolve o ato institucional sem duplicação;
13. se permissões e upload são seguros;
14. se registros vinculados não podem ser apagados;
15. se check, testes e build passam.

Corrija regressões sem transformar o catálogo institucional em documentos duplicados por processo.
```

# 20 — Cadastros institucionais e designações na Preparação

## 1. Objetivo

Criar, dentro de **Cadastros**, um catálogo institucional reutilizável para:

- Comissões de Contratação;
- Equipes de Apoio;
- Ordenadores de Despesas;
- atos de designação vinculados a essas estruturas.

Na fase de Preparação da licitação, o usuário não deve anexar novamente os decretos em cada processo. Ele deve selecionar a comissão, a equipe de apoio e o ordenador previamente cadastrados, registrando no processo:

- responsáveis selecionados;
- composição vigente;
- funções dos membros;
- decreto/ato correspondente;
- período de vigência;
- usuário e data da seleção.

A seleção deve concluir sistemicamente os requisitos documentais correspondentes e disponibilizar os atos no dossiê sem duplicar o arquivo físico.

## 2. Diagnóstico atual

### 2.1. Cadastros existentes

O cadastro atual possui:

```txt
itens
fornecedores
secretarias
pessoas
servidores
departamentos
usuarios
parametros
```

Não existem entidades para comissões, equipes de apoio, ordenadores ou atos de designação.

### 2.2. Pessoas já podem ser reutilizadas

A tabela `pessoas` já contém:

- nome;
- CPF;
- cargo;
- secretaria;
- situação ativa/inativa.

Comissões, equipes e ordenadores devem apontar para esse cadastro. Não criar uma segunda tabela de nomes de servidores dentro da Licitação.

### 2.3. Responsáveis atuais do processo

O processo já possui:

```txt
autoridadeCompetenteId
condutorProcessoId
```

Esses campos devem continuar existindo. Eles representam pessoas específicas do processo, mas não substituem:

- a composição formal da comissão;
- a equipe de apoio;
- o vínculo institucional do ordenador de despesas;
- o respectivo ato de designação.

### 2.4. Documentos comuns não servem como catálogo

A tabela `documentos` exige `processoId` não nulo. Portanto, um decreto institucional reutilizável por vários processos não deve ser cadastrado como documento de um processo arbitrário.

Criar armazenamento próprio para atos institucionais ou uma camada documental institucional independente do processo.

### 2.5. Checklist atual

A configuração atual inclui como uploads comuns:

```txt
LICITACAO_DECRETO_COMISSAO
LICITACAO_DECRETO_EQUIPE_APOIO
LICITACAO_DECRETO_ORDENADOR_DESPESAS
```

Esses requisitos devem passar de `UPLOAD` para `CATALOG_SELECTION`.

## 3. Decisão de domínio

Separar quatro conceitos:

```txt
Pessoa
Ato de designação
Grupo institucional
Vínculo de ordenador de despesas
```

### Pessoa

Servidor ou responsável já cadastrado em `pessoas`.

### Ato de designação

Decreto, portaria, resolução ou outro ato que formaliza a designação.

### Grupo institucional

Estrutura coletiva:

- Comissão de Contratação;
- Equipe de Apoio.

### Ordenador de despesas

Vínculo entre uma pessoa, uma ou mais unidades administrativas e um ato de designação.

## 4. Modelo de dados recomendado

### 4.1. Enum de tipo de ato

```ts
export type AtoDesignacaoTipo =
  | "DECRETO"
  | "PORTARIA"
  | "RESOLUCAO"
  | "OUTRO";
```

### 4.2. Tabela `atos_designacao`

Campos:

```txt
id
numero
ano
tipo
ementa
data_emissao
data_publicacao
vigencia_inicio
vigencia_fim
arquivo_url
arquivo_chave
mime_type
tamanho_bytes
hash_arquivo
ativo
criado_por
criado_em
atualizado_em
```

Regras:

- número, ano e tipo identificam o ato;
- o arquivo é armazenado uma única vez;
- calcular hash para evitar upload duplicado;
- ato utilizado em processo não deve ser apagado;
- correção substancial deve gerar nova versão/novo registro;
- ato expirado permanece disponível para consulta histórica.

### 4.3. Enum de grupo institucional

```ts
export type GrupoInstitucionalTipo =
  | "COMISSAO_CONTRATACAO"
  | "EQUIPE_APOIO";
```

### 4.4. Tabela `grupos_institucionais`

Campos:

```txt
id
nome
tipo
sigla
secretaria_id nullable
ato_designacao_id
vigencia_inicio
vigencia_fim
versao
substitui_grupo_id nullable
observacao
ativo
criado_por
criado_em
atualizado_em
```

Uma mesma comissão alterada por novo decreto deve gerar nova versão, preservando a anterior.

### 4.5. Tabela `grupos_institucionais_membros`

Campos:

```txt
id
grupo_id
pessoa_id
funcao
ordem
titular
ativo
criado_em
```

Funções sugeridas, sem limitar futuras extensões:

```txt
PRESIDENTE
AGENTE_CONTRATACAO
PREGOEIRO
MEMBRO
MEMBRO_SUPLENTE
COORDENADOR_APOIO
APOIO
OUTRO
```

A função deve ser centralizada em catálogo compartilhado, não digitada livremente em cada processo.

### 4.6. Tabela `ordenadores_despesa`

Campos:

```txt
id
pessoa_id
secretaria_id
ato_designacao_id
tipo_vinculo
vigencia_inicio
vigencia_fim
observacao
ativo
criado_por
criado_em
atualizado_em
```

Tipos sugeridos:

```txt
TITULAR
SUBSTITUTO
DELEGADO
```

Se um ordenador possuir competência para várias secretarias, usar tabela associativa:

```txt
ordenadores_despesa_secretarias
```

em vez de duplicar a pessoa ou o ato.

## 5. Vínculo com a licitação

### 5.1. Campos na tabela `licitacoes`

Para o cenário atual de uma seleção ativa de cada tipo:

```txt
comissao_id
 equipe_apoio_id
 ordenador_despesa_id
 designacoes_snapshot jsonb
 designacoes_selecionadas_por
 designacoes_selecionadas_em
```

Os três IDs devem possuir FK explícita.

### 5.2. Snapshot histórico

Ao salvar as seleções, registrar em `designacoes_snapshot`:

```json
{
  "comissao": {
    "id": 12,
    "nome": "Comissão Permanente de Contratação",
    "ato": "Decreto nº 123/2026",
    "membros": []
  },
  "equipeApoio": {},
  "ordenadorDespesa": {}
}
```

O snapshot preserva o estado institucional existente no momento da seleção. Alterações futuras no catálogo não podem modificar retroativamente a composição registrada no processo.

### 5.3. Auditoria

Toda seleção ou troca deve registrar:

- valor anterior;
- valor novo;
- usuário;
- data/hora;
- processo;
- motivo, quando informado.

Não sobrescrever silenciosamente uma seleção anterior.

## 6. Cadastros — experiência do usuário

Adicionar entradas em Cadastros:

```txt
Comissões
Equipes de Apoio
Ordenadores de Despesas
```

O ato de designação pode ser gerido dentro desses formulários e também por uma área reutilizável `Atos de Designação`.

### 6.1. Comissões

Formulário:

- nome;
- sigla;
- secretaria/escopo opcional;
- decreto/ato;
- vigência;
- membros;
- função de cada membro;
- ordenação dos membros;
- situação.

A composição deve ser feita pesquisando pessoas/servidores existentes.

### 6.2. Equipes de Apoio

Formulário equivalente, com:

- nome da equipe;
- ato;
- vigência;
- coordenador, se houver;
- membros de apoio;
- secretaria/escopo;
- situação.

Permitir compartilhar o mesmo ato de uma comissão quando o decreto formalizar ambos.

### 6.3. Ordenadores de Despesas

Formulário:

- pessoa;
- secretaria ou secretarias;
- tipo de vínculo;
- ato de designação/delegação;
- vigência;
- observação;
- situação.

Não duplicar os dados da pessoa.

### 6.4. Navegação

Como são cadastros complexos, não inflar o grande `cadastros-page.tsx` com novos switches e formulários monolíticos.

Criar painéis/componentes próprios, acessíveis dentro do Hub de Cadastros:

```txt
client/src/components/cadastros-institucionais/comissoes-panel.tsx
client/src/components/cadastros-institucionais/equipes-apoio-panel.tsx
client/src/components/cadastros-institucionais/ordenadores-panel.tsx
client/src/components/cadastros-institucionais/ato-designacao-form.tsx
client/src/components/cadastros-institucionais/membros-editor.tsx
```

## 7. Fase de Preparação

### 7.1. Sequência inicial

Para a Dispensa analisada, inserir no início da fase:

```txt
1. Selecionar Comissão de Contratação
2. Selecionar Equipe de Apoio
3. Selecionar Ordenador de Despesas
4. Reserva orçamentária
5. Ato de autorização da autoridade competente
6. Justificativa da dispensa
7. Pesquisa de preços
8. Minuta do aviso
9. Parecer jurídico
```

A aplicabilidade deve continuar configurável por modalidade e rito.

### 7.2. Componente de seleção

Cada requisito institucional deve aparecer como linha compacta:

```txt
Comissão de Contratação       Não selecionada      [Selecionar]
Equipe de Apoio               Não selecionada      [Selecionar]
Ordenador de Despesas         Não selecionado       [Selecionar]
```

Após a seleção:

```txt
Comissão Permanente de Contratação
Decreto nº 123/2026 · vigente até 31/12/2026 · 5 membros
[Ver composição] [Ver ato] [Trocar]
```

### 7.3. Modal de seleção

Filtros:

- nome;
- tipo;
- secretaria;
- vigência;
- somente ativos/vigentes.

Cada resultado deve mostrar:

- nome;
- número do ato;
- vigência;
- membros principais;
- secretaria/escopo;
- situação.

Ação:

```txt
Selecionar para o processo
```

### 7.4. Atalho para Cadastros

Se o usuário não encontrar o registro:

```txt
Não encontrou a comissão? Abrir Cadastros
```

Somente usuários com permissão de gestão podem criar ou alterar registros. Operadores podem selecionar registros existentes.

## 8. Estratégia de conclusão dos requisitos

Atualizar o catálogo documental:

```ts
source: "CATALOG"
completionStrategy: "CATALOG_SELECTION"
editor: "INSTITUTIONAL_SELECTOR"
```

Mapeamento:

```txt
LICITACAO_DECRETO_COMISSAO
→ concluído quando comissao_id estiver selecionada

LICITACAO_DECRETO_EQUIPE_APOIO
→ concluído quando equipe_apoio_id estiver selecionada

LICITACAO_DECRETO_ORDENADOR_DESPESAS
→ concluído quando ordenador_despesa_id estiver selecionado
```

Não abrir upload comum para esses requisitos.

## 9. Relação com condutor e autoridade

### 9.1. Condutor

Ao selecionar uma comissão que possua membro com função:

```txt
AGENTE_CONTRATACAO
PREGOEIRO
PRESIDENTE
```

o sistema pode sugerir preencher `condutorProcessoId`.

Não substituir o condutor silenciosamente. Exibir confirmação.

### 9.2. Autoridade e ordenador

`autoridadeCompetenteId` e ordenador de despesas podem coincidir, mas devem permanecer conceitos independentes.

Ao selecionar o ordenador, o sistema pode sugerir a autoridade competente quando a configuração institucional indicar equivalência, sem impor o vínculo automaticamente.

## 10. Vigência e integridade histórica

### Nova seleção

Mostrar por padrão somente registros:

- ativos;
- vigentes na data do processo;
- compatíveis com a secretaria/escopo.

### Processo já vinculado

Se o ato expirar posteriormente:

- preservar a seleção histórica;
- não invalidar automaticamente o processo;
- mostrar badge `Vigência encerrada após a seleção`, quando aplicável.

### Alteração de composição

Se uma comissão já utilizada precisar mudar:

- não editar retroativamente a versão usada;
- duplicar/criar nova versão vinculada ao novo ato;
- manter a versão anterior para processos antigos.

## 11. Dossiê e documentos

Os atos selecionados devem aparecer no dossiê como:

```txt
Documento institucional referenciado
```

Exemplo:

```txt
Decreto nº 123/2026 — Comissão Permanente de Contratação
Origem: Catálogo Institucional
```

Não copiar o arquivo para `documentos` a cada processo.

Para exportação do dossiê, o serviço deve resolver os atos referenciados e incluir seus arquivos na montagem final.

## 12. Backend e API

Criar router próprio, ainda que a entrada visual fique em Cadastros:

```txt
server/src/routers/cadastros-institucionais.ts
```

Procedures sugeridas:

```txt
atos.list
atos.save
atos.inactivate

comissoes.list
comissoes.get
comissoes.save
comissoes.inactivate

 equipesApoio.list
 equipesApoio.get
 equipesApoio.save
 equipesApoio.inactivate

 ordenadores.list
 ordenadores.get
 ordenadores.save
 ordenadores.inactivate

 designacoes.availableForProcess
 designacoes.getForLicitacao
 designacoes.selectForLicitacao
```

Schemas:

```txt
shared/src/schemas/cadastros-institucionais.ts
```

## 13. Permissões

### Leitura e seleção

- operador de Licitação;
- gestor;
- administrador.

### Criação e alteração de catálogo

- gestor autorizado;
- administrador.

### Exclusão

Não excluir registros vinculados. Apenas inativar.

Todas as alterações devem ser auditadas.

## 14. Upload dos atos

Como `documentos.processoId` é obrigatório, criar endpoint/storage próprio para atos:

```txt
/api/cadastros-institucionais/atos/upload
```

Reaproveitar as mesmas validações de segurança dos uploads existentes:

- autenticação;
- limite de tamanho;
- MIME permitido;
- nome seguro;
- hash;
- armazenamento fora da pasta pública direta;
- auditoria.

## 15. Migração e compatibilidade

### Processos antigos

- documentos de decreto já anexados devem continuar visíveis;
- não apagá-los;
- quando possível, oferecer ação administrativa para converter um decreto existente em ato de catálogo;
- a conversão deve vincular o processo original sem duplicar o arquivo;
- não exigir seleção retroativa imediata durante o modo orientativo.

### Novos processos

- usar seleção do catálogo como padrão;
- upload avulso desses três decretos não deve ser a opção principal;
- permitir exceção administrativa apenas se configurada.

## 16. Testes obrigatórios

### Cadastros

- criar ato;
- cadastrar comissão com membros;
- cadastrar equipe de apoio;
- cadastrar ordenador por secretaria;
- compartilhar um ato entre comissão e equipe;
- impedir exclusão de registro vinculado;
- versionar comissão usada.

### Preparação

- selecionar comissão;
- selecionar equipe;
- selecionar ordenador;
- concluir requisitos por estado sistêmico;
- trocar seleção e auditar;
- sugerir condutor sem sobrescrever automaticamente;
- filtrar registros por vigência e secretaria.

### Histórico

- alteração posterior do catálogo não modifica snapshot do processo;
- ato expirado continua disponível em processo antigo;
- dossiê resolve o documento institucional.

### Regressão

```txt
npm run check
npm run test:all
npm run build
```

## 17. Critérios de aceite

A etapa estará concluída quando:

- Cadastros tiver entradas para Comissões, Equipes de Apoio e Ordenadores;
- membros forem selecionados do cadastro de pessoas/servidores;
- atos forem armazenados uma única vez;
- Preparação exibir os três seletores no início da sequência;
- requisitos forem concluídos por seleção, não por upload repetido;
- processo registrar IDs, snapshot, usuário e data;
- troca de seleção gerar auditoria;
- vigência e secretaria forem consideradas na busca;
- Dossiê mostrar atos referenciados;
- processos antigos permanecerem íntegros;
- typecheck, testes e build passarem.

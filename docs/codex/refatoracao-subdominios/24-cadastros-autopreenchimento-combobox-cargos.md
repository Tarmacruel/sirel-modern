# 24 — Autopreenchimento, seletores pesquisáveis, cargos e funções

## 1. Objetivo

Corrigir a persistência e a experiência dos cadastros de Pessoa, Servidor e Usuário, implementando:

- leitura confiável dos dados salvos;
- vínculo de Usuário com Pessoa/Servidor realmente persistido;
- reavaliação imediata do modal de regularização;
- autopreenchimento de Servidor e Usuário a partir do cadastro de Pessoas;
- busca incremental por nome, CPF, matrícula e secretaria;
- substituição de seletores extensos por comboboxes assíncronos;
- cadastro estruturado de Cargos;
- cadastro estruturado de Funções;
- cargo obrigatório para Servidor;
- função opcional para Servidor.

Esta etapa é simultaneamente uma correção funcional e uma refatoração de UX dos Cadastros.

## 2. Evidências do estado atual

### 2.1. Persistência existe no backend

A mutation atual de `pessoas/servidores` já monta payload com:

```txt
matricula
dataNascimento
cargo
secretariaId
```

A mutation de `usuarios` também já recebe e grava:

```txt
pessoaId
identityProfileCompletedAt
```

Portanto, não criar uma segunda mutation paralela. Primeiro corrigir o fluxo de leitura, cache e confirmação da gravação.

### 2.2. O frontend abre edição com dados da linha da tabela

O modal atualmente usa:

```ts
setFormState(mapRowToForm(entity, row));
```

A linha pode estar:

- parcial;
- desatualizada pelo `placeholderData`;
- vinda do cache anterior;
- sem os campos recém-gravados.

O formulário de edição não deve considerar a linha da listagem como fonte definitiva.

### 2.3. Cache não é totalmente invalidado

Após salvar, o frontend invalida listagem e resumo, mas não invalida necessariamente:

```txt
cadastros.formOptions
auth.me
```

Consequências possíveis:

- Pessoa salva continua aparecendo com dados antigos nos seletores;
- vínculo `pessoaId` parece não ter sido salvo;
- usuário atual continua com estado antigo de regularização;
- o modal de identidade não reaparece ou não fecha conforme a alteração.

### 2.4. Seletores carregam listas completas

`cadastros.formOptions` carrega todas as Pessoas, Fornecedores e Itens ativos. Os formulários usam `<select>` nativo.

Isso gera:

- dropdowns maiores que a tela;
- rolagem extensa;
- busca inexistente;
- custo de rede crescente;
- dificuldade para nomes repetidos;
- risco de seleção incorreta.

### 2.5. Cargo ainda é texto livre

`pessoas.cargo` permanece `varchar` e o formulário usa `<Input>` livre. Não existe entidade de Cargo ou Função.

## 3. Prioridade de correção

Executar na seguinte ordem:

1. confirmar migration e persistência no banco operacional;
2. criar leitura por ID e read-after-write;
3. corrigir invalidação de cache;
4. corrigir reavaliação de identidade;
5. criar combobox assíncrono reutilizável;
6. implementar autopreenchimento;
7. criar Cargos e Funções;
8. migrar os seletores gerais.

Não iniciar pela estética do combobox sem corrigir a fonte dos dados.

## 4. Correção da persistência

## 4.1. Conferência da migration

Verificar no banco operacional se existem e estão graváveis:

```txt
pessoas.matricula
pessoas.data_nascimento
users.pessoa_id
users.identity_profile_completed_at
```

Criar teste de saúde/migration que consulte `information_schema.columns` ou utilize o mecanismo de migrations existente.

Não considerar a interface renderizada como prova de que a migration foi aplicada corretamente.

## 4.2. Endpoint de leitura individual

Adicionar procedure:

```txt
cadastros.getById
```

Input:

```ts
{
  entity: CadastroEntity;
  id: number;
}
```

A procedure deve retornar o registro completo e atualizado.

Ao abrir `Editar pessoa`, `Editar servidor` ou `Editar usuário`:

1. abrir modal em estado de carregamento;
2. buscar `getById`;
3. preencher o formulário com a resposta do backend;
4. não usar a linha da tabela como fonte final.

A linha pode ser usada somente para título provisório.

## 4.3. Read-after-write

Após `cadastros.save`:

1. executar a gravação;
2. buscar novamente o registro salvo por ID;
3. retornar o registro completo na response ou validar em nova query;
4. atualizar diretamente o cache da listagem;
5. somente então fechar o modal e mostrar sucesso.

Se o registro retornado não contiver os valores enviados, tratar como erro de persistência e não mostrar sucesso genérico.

## 4.4. Invalidações obrigatórias

Após salvar Pessoa/Servidor:

```txt
cadastros.list
cadastros.summary
cadastros.getById
cadastros.formOptions
cadastros.lookup
auth.me, quando a pessoa estiver vinculada ao usuário atual
```

Após salvar Usuário:

```txt
cadastros.list
cadastros.summary
cadastros.getById
cadastros.formOptions
cadastros.lookup
auth.me, quando o usuário editado for o usuário atual
usuarios/subsystem access, quando aplicável
```

O backend pode retornar flags:

```ts
{
  affectsCurrentIdentity: boolean;
  identityProfileChanged: boolean;
}
```

para orientar a invalidação.

## 4.5. Feedback de erro

- não fechar o modal se a mutation falhar;
- mostrar erro no topo do modal;
- mostrar erros por campo quando houver;
- registrar no console apenas informação técnica sem PII;
- não exibir `salvo com sucesso` antes da confirmação de leitura.

## 5. Reavaliação do modal de identidade

O status de regularização deve ser calculado no backend a partir do banco atual.

Após qualquer alteração em:

```txt
users.pessoaId
pessoas.cpf
pessoas.matricula
pessoas.dataNascimento
```

o frontend deve invalidar/refazer `auth.me`.

### Regras adicionais

- `identityDismissed` deve ser resetado quando mudar:
  - `user.id`;
  - `requiresIdentityCompletion`;
  - lista de `missingFields`;
- sessão antiga no `localStorage` não deve impedir a abertura do modal depois que `auth.me` retornar;
- em primeiro login após deploy, sempre usar `auth.me` como fonte de verdade;
- adicionar teste E2E para usuário sem `pessoaId`.

### Diagnóstico administrativo

No cadastro de Usuário, exibir de forma explícita:

```txt
Sem vínculo de identidade
Vínculo incompleto
Identidade completa
Conflito de identidade
```

## 6. Combobox assíncrono reutilizável

Criar componente genérico, por exemplo:

```txt
client/src/components/ui/async-combobox.tsx
```

Interface sugerida:

```ts
interface AsyncComboboxProps<T> {
  value: string | number | null;
  onChange: (value: T | null) => void;
  query: (search: string) => Promise<T[]>;
  getOptionValue: (option: T) => string | number;
  getOptionLabel: (option: T) => string;
  renderOption?: (option: T) => ReactNode;
  initialOption?: T | null;
  placeholder?: string;
  searchPlaceholder?: string;
  minSearchLength?: number;
  debounceMs?: number;
  allowClear?: boolean;
}
```

### Comportamento obrigatório

- debounce entre 200 e 300 ms;
- busca iniciada enquanto o usuário digita;
- limite padrão de 20 resultados;
- suporte a teclado;
- foco visível;
- loading;
- estado vazio;
- erro e retry;
- item selecionado permanece visível mesmo fora da consulta atual;
- não carregar milhares de opções;
- não fechar incorretamente ao clicar na barra de rolagem;
- respeitar modal e z-index;
- funcionar em mobile.

## 7. Backend de lookup assíncrono

Criar procedure genérica ou conjunto tipado:

```txt
cadastros.lookup
```

Input sugerido:

```ts
{
  entity:
    | "pessoas"
    | "servidores"
    | "secretarias"
    | "cargos"
    | "funcoes"
    | "departamentos"
    | "fornecedores"
    | "itens";
  search?: string;
  limit?: number;
  excludeIds?: number[];
  secretariaId?: number;
  activeOnly?: boolean;
}
```

### Pessoa/Servidor

Buscar por:

- nome sem acentos;
- CPF;
- matrícula;
- cargo;
- função;
- secretaria.

### Ordenação

Prioridade:

1. correspondência exata;
2. início do nome;
3. todos os termos presentes;
4. similaridade normalizada;
5. ordem alfabética.

Não executar fuzzy matching pesado sobre toda a base sem índice. Para a base atual, usar busca normalizada e ranking SQL simples.

### Resposta

```ts
{
  id: number;
  label: string;
  subtitle?: string;
  metadata?: Record<string, unknown>;
}
```

Não retornar CPF completo em lookup geral, salvo usuário autorizado e necessidade explícita. Preferir CPF mascarado.

## 8. Autopreenchimento de Servidor

## 8.1. Fluxo correto

Como Pessoa e Servidor representam o mesmo registro-base, cadastrar servidor a partir de Pessoa significa **completar/promover o registro existente**, não inserir duplicata.

No modal `Novo servidor`, o primeiro campo deve ser:

```txt
Pessoa já cadastrada
```

Combobox pesquisável por:

- nome;
- CPF;
- matrícula.

### Ao selecionar Pessoa

Autopreencher:

```txt
nome
CPF
data de nascimento
secretaria, se houver
cargo, se houver
função, se houver
```

Bloquear ou sinalizar campos de identidade já confirmados. Permitir complemento de campos ausentes.

### Persistência

Se uma Pessoa existente foi selecionada:

```txt
UPDATE pessoas WHERE id = pessoaSelecionada.id
```

Não executar `INSERT`.

### Sem resultado

Mostrar:

```txt
Nenhuma pessoa encontrada
[Cadastrar nova pessoa]
```

A criação de nova pessoa pode permanecer dentro do fluxo, mas deve ser explícita.

## 8.2. Detecção de possível duplicidade

Enquanto o usuário digita o nome do servidor:

- consultar Pessoas com nome próximo;
- mostrar alerta discreto:

```txt
Encontramos pessoas com nome semelhante. Selecione uma para evitar duplicidade.
```

Não bloquear quando não houver correspondência segura.

## 9. Autopreenchimento de Usuário

No modal de criação/edição de Usuário, o campo principal deve ser:

```txt
Pessoa/servidor vinculado
```

### Busca em tempo real

O texto inicial da busca deve acompanhar `formState.name`.

Ao digitar:

```txt
JONATAS DA SILVA SOUSA
```

o combobox deve consultar candidatos com:

- nome exato;
- prefixo;
- termos equivalentes;
- nome próximo;
- mesma secretaria em prioridade secundária.

### Exibição dos candidatos

Exemplo:

```txt
JONATAS DA SILVA SOUSA
Matrícula 001234 · ADM · CPF ***.436.***-21
```

Quando houver nomes repetidos, matrícula e secretaria devem distinguir os registros.

### Ao selecionar Pessoa/Servidor

Autopreencher:

```txt
Nome do usuário ← pessoa.nome
Secretaria ← pessoa.secretariaId
```

Opcionalmente sugerir:

```txt
username
```

mas nunca alterar login existente durante edição.

Se futuramente Pessoa possuir e-mail institucional, preencher e-mail somente quando vazio.

### Troca de vínculo

- solicitar confirmação;
- verificar se Pessoa já está vinculada a outro usuário;
- salvar `pessoaId`;
- recalcular `identityProfileCompletedAt`;
- invalidar `auth.me` se for o usuário atual.

## 10. Catálogo de Cargos

Adicionar entidade:

```txt
cargos
```

Tabela sugerida:

```txt
id
codigo nullable
nome
categoria nullable
descricao nullable
ativo
criado_em
atualizado_em
```

Exemplos:

```txt
Agente de Contratação I
Assistente Administrativo
Analista Administrativo
Secretário Municipal
```

### Regras

- nome único normalizado;
- não excluir cargo utilizado;
- permitir inativação;
- cargo obrigatório para Servidor;
- Pessoa genérica pode ficar sem cargo;
- usar combobox pesquisável.

## 11. Catálogo de Funções

Adicionar entidade:

```txt
funcoes
```

Tabela sugerida:

```txt
id
codigo nullable
nome
descricao nullable
ativo
criado_em
atualizado_em
```

Exemplos:

```txt
Agente de Contratação
Pregoeiro
Fiscal de Contrato
Gestor de Contrato
Chefe de Departamento
```

### Regras

- função opcional para Servidor;
- não confundir função funcional com papel de acesso (`admin`, `gestor`, etc.);
- não confundir com função do membro dentro de Comissão;
- permitir inativação, não exclusão quando utilizada;
- usar combobox pesquisável.

## 12. Alterações na tabela `pessoas`

Adicionar:

```txt
cargo_id integer nullable references cargos(id)
funcao_id integer nullable references funcoes(id)
```

### Compatibilidade com `cargo` legado

Não remover imediatamente `pessoas.cargo`.

Executar migração em etapas:

1. criar `cargos` e `funcoes`;
2. coletar valores distintos de `pessoas.cargo`;
3. normalizar e criar cargos correspondentes;
4. preencher `cargo_id`;
5. manter `cargo` como fallback temporário;
6. atualizar leituras para preferir `cargo_id`;
7. remover/deprecar texto legado apenas após conferência.

## 13. Schemas e entidades de Cadastros

Adicionar a `cadastroEntityOptions`:

```txt
cargos
funcoes
```

Schemas:

```ts
cargoCadastroSchema
funcaoCadastroSchema
```

Atualizar Pessoa/Servidor:

```ts
cargoId?: number | null;
funcaoId?: number | null;
```

Servidor deve validar:

```txt
cargoId obrigatório
funcaoId opcional
```

Durante a transição, aceitar `cargo` legado somente para leitura/importação administrativa.

## 14. Migração dos seletores gerais

Aplicar `AsyncCombobox` prioritariamente em:

1. vínculo Pessoa/Servidor do Usuário;
2. Pessoa base do Servidor;
3. Secretaria;
4. Cargo;
5. Função;
6. Responsável de Departamento;
7. membros de Comissão e Equipe de Apoio;
8. Ordenador de Despesas;
9. Fornecedor e Item em formulários extensos.

Não substituir enums pequenos, como Perfil de Usuário, por combobox assíncrono.

## 15. Testes de persistência obrigatórios

### Pessoa/Servidor

1. editar matrícula e nascimento;
2. salvar;
3. backend retornar os valores;
4. fechar e reabrir por `getById`;
5. valores permanecerem;
6. atualizar página;
7. valores permanecerem.

### Usuário

1. selecionar Pessoa;
2. salvar;
3. resposta conter `pessoaId`;
4. reabrir usuário;
5. vínculo permanecer;
6. atualizar página;
7. vínculo permanecer;
8. `auth.me` refletir a mudança para o próprio usuário.

### Cache

- editar Pessoa e abrir seletor de Usuário sem recarregar página;
- matrícula e nascimento atualizados devem aparecer;
- não usar dados antigos de `formOptions`.

## 16. Testes de autopreenchimento

### Servidor

- buscar Pessoa por nome;
- selecionar;
- preencher campos existentes;
- completar matrícula/cargo;
- salvar no mesmo ID;
- não criar duplicata.

### Usuário

- digitar nome;
- candidatos filtrarem em tempo real;
- nomes próximos aparecerem ordenados;
- selecionar Pessoa;
- nome e secretaria serem preenchidos;
- vínculo persistir.

## 17. Testes do modal de regularização

- usuário sem `pessoaId` recebe modal;
- usuário com vínculo sem matrícula recebe modal;
- usuário com vínculo sem nascimento recebe modal;
- atualização administrativa do usuário atual invalida `auth.me`;
- `identityDismissed` é resetado quando o perfil muda;
- após completar, o modal não reaparece;
- hard reload mantém o estado correto.

## 18. Critérios de aceite

A etapa estará concluída quando:

- matrícula e nascimento persistirem após reabrir e atualizar;
- vínculo de Usuário persistir;
- modal de regularização reagir imediatamente ao estado real;
- edição carregar registro completo por ID;
- sucesso só aparecer após confirmação da leitura;
- Servidor reutilizar Pessoa existente sem duplicação;
- Usuário autopreencher nome e secretaria da Pessoa selecionada;
- vínculo sugerir pessoas de nome igual ou próximo;
- seletores extensos possuírem busca incremental;
- `formOptions` deixar de carregar listas massivas para esses campos;
- existir cadastro de Cargos;
- existir cadastro de Funções;
- Cargo ser obrigatório para Servidor;
- Função ser opcional;
- dados legados de cargo serem migrados sem perda;
- `npm run check`, `npm run test:all` e `npm run build` passarem.

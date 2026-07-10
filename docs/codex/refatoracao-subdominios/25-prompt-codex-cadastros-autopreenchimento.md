# 25 — Prompt Codex: persistência, autopreenchimento e seletores pesquisáveis

## Prompt principal

```txt
Leia antes de implementar:

- docs/codex/refatoracao-subdominios/09-registro-implementacao-operacao-local.md
- docs/codex/refatoracao-subdominios/22-identidade-recuperacao-credenciais.md
- docs/codex/refatoracao-subdominios/24-cadastros-autopreenchimento-combobox-cargos.md
- client/src/pages/cadastros-page.tsx
- client/src/features/cadastros/form.ts
- client/src/components/auth/identity-profile-completion-modal.tsx
- client/src/App.tsx
- client/src/lib/auth-session.ts
- shared/src/schemas/cadastros.ts
- shared/src/schemas/auth-recovery.ts
- server/src/routers/cadastros.ts
- server/src/routers/auth.ts
- server/src/db/schema.ts
- drizzle/schema.ts
- migrations recentes de identidade

Objetivo:
Corrigir a persistência aparente/real de matrícula, data de nascimento e pessoaId; reavaliar corretamente o modal de identidade; implementar autopreenchimento de Servidor e Usuário a partir de Pessoa; substituir seletores extensos por comboboxes assíncronos; e criar catálogos de Cargos e Funções.

IMPORTANTE

Não presuma que o problema é apenas visual.

Faça diagnóstico end-to-end:

1. migration aplicada no banco operacional;
2. payload enviado pelo frontend;
3. schema Zod;
4. mutation do backend;
5. registro gravado;
6. resposta da mutation;
7. cache invalidado;
8. registro reaberto por leitura direta;
9. auth.me atualizado quando necessário.

Não mostre sucesso antes de confirmar a persistência.

PARTE A — CORRIGIR PERSISTÊNCIA E LEITURA

1. Verifique as colunas:
   - pessoas.matricula
   - pessoas.data_nascimento
   - users.pessoa_id
   - users.identity_profile_completed_at
2. Confirme a migration em ambiente operacional.
3. Crie testes de escrita e leitura.
4. Não crie mutation duplicada se `cadastros.save` já grava os campos.

Crie procedure:

```txt
cadastros.getById
```

Input:

```ts
{ entity, id }
```

Ao abrir edição:

- não use somente a linha da tabela;
- abra loading;
- busque o registro completo por ID;
- preencha o form com a resposta atual do backend.

Após salvar:

1. execute mutation;
2. leia novamente o registro salvo;
3. confirme os campos;
4. atualize cache;
5. feche modal;
6. mostre sucesso.

Se a leitura não refletir o payload, mantenha modal aberto e informe falha de persistência.

Invalide após Pessoa/Servidor:

- cadastros.list
- cadastros.summary
- cadastros.getById
- cadastros.formOptions
- cadastros.lookup
- auth.me quando afetar o usuário atual

Invalide após Usuário:

- cadastros.list
- cadastros.summary
- cadastros.getById
- cadastros.formOptions
- cadastros.lookup
- auth.me quando o ID salvo for o usuário atual

Considere retornar da mutation:

```ts
{
  record,
  affectsCurrentIdentity,
  identityProfileChanged
}
```

PARTE B — CORRIGIR MODAL DE IDENTIDADE

O modal deve abrir quando `auth.me` indicar:

```txt
requiresIdentityCompletion = true
```

Corrija os cenários:

- usuário sem pessoaId;
- usuário com pessoa sem matrícula;
- usuário com pessoa sem nascimento;
- usuário com pessoa sem CPF;
- usuário editado pelo próprio administrador durante a sessão.

Regras:

1. `auth.me` é a fonte de verdade após carregar.
2. Sessão antiga do localStorage não pode suprimir o modal.
3. Resetar `identityDismissed` quando mudar:
   - user.id
   - requiresIdentityCompletion
   - missingFields
4. Depois de salvar Pessoa ou Usuário relacionado ao usuário atual, refetch imediato de auth.me.
5. Adicionar teste E2E com usuário sem pessoaId.

No cadastro de Usuário, mostrar status:

- Sem vínculo de identidade
- Vínculo incompleto
- Identidade completa
- Conflito de identidade

PARTE C — COMBOBOX ASSÍNCRONO

Crie componente reutilizável:

```txt
client/src/components/ui/async-combobox.tsx
```

Requisitos:

- debounce 200–300 ms;
- busca enquanto digita;
- mínimo configurável de caracteres;
- limite padrão 20;
- loading;
- vazio;
- erro e tentar novamente;
- teclado completo;
- foco visível;
- item selecionado persistente;
- z-index correto dentro de Modal;
- mobile;
- allowClear;
- não carregar toda a base.

Crie procedure:

```txt
cadastros.lookup
```

Entidades:

- pessoas
- servidores
- secretarias
- cargos
- funcoes
- departamentos
- fornecedores
- itens

Input mínimo:

```ts
{
  entity,
  search,
  limit,
  excludeIds,
  secretariaId,
  activeOnly
}
```

Para Pessoa/Servidor, buscar por:

- nome sem acentos;
- CPF;
- matrícula;
- cargo;
- função;
- secretaria.

Ranking:

1. exato;
2. prefixo;
3. todos os termos;
4. similaridade normalizada;
5. alfabético.

Não retornar PII completa desnecessária. CPF deve aparecer mascarado no resultado.

Reduza `cadastros.formOptions`: mantenha apenas enums e listas pequenas. Pessoas, fornecedores e itens não devem ser carregados integralmente para selects.

PARTE D — AUTOPREENCHIMENTO DE SERVIDOR

No modal Novo servidor, adicione como primeiro campo:

```txt
Pessoa já cadastrada
```

Esse campo usa AsyncCombobox.

Ao digitar o nome do servidor, consultar pessoas similares automaticamente.

Ao selecionar pessoa:

- manter o mesmo ID;
- preencher nome;
- CPF;
- nascimento;
- secretaria;
- cargo;
- função;
- matrícula, se existir.

Ao salvar uma Pessoa selecionada:

```txt
UPDATE pessoas
```

Nunca INSERT de outro registro.

Se não encontrar:

```txt
Nenhuma pessoa encontrada
[Cadastrar nova pessoa]
```

Adicionar indicação de possível duplicidade durante a digitação.

PARTE E — AUTOPREENCHIMENTO DE USUÁRIO

Substitua o select nativo `Pessoa/servidor vinculado` por AsyncCombobox.

A busca deve acompanhar o campo Nome em tempo real.

Quando `name` for preenchido, consultar pessoas com:

- mesmo nome;
- prefixo;
- mesmos termos;
- nome próximo;
- mesma secretaria como critério secundário.

Candidato deve mostrar:

```txt
NOME DA PESSOA
Matrícula 001234 · ADM · CPF ***.436.***-21
```

Ao selecionar:

- pessoaId = option.id;
- name = pessoa.nome;
- secretariaId = pessoa.secretariaId quando existir;
- não alterar username existente;
- preencher e-mail somente se houver fonte institucional e o campo estiver vazio.

Ao trocar vínculo:

- pedir confirmação;
- verificar vínculo com outro usuário;
- persistir;
- recalcular identityProfileCompletedAt;
- invalidar auth.me quando for o usuário atual.

PARTE F — CARGOS E FUNÇÕES

Crie tabelas:

```txt
cargos
funcoes
```

Cargos:

```txt
id
codigo nullable
nome unique normalizado
categoria nullable
descricao nullable
ativo
criadoEm
atualizadoEm
```

Funções:

```txt
id
codigo nullable
nome unique normalizado
descricao nullable
ativo
criadoEm
atualizadoEm
```

Adicione em pessoas:

```txt
cargoId nullable FK cargos
funcaoId nullable FK funcoes
```

Regras:

- Cargo obrigatório para Servidor;
- Cargo opcional para Pessoa genérica;
- Função opcional;
- Função funcional não é role de acesso;
- Função funcional não é função de membro de comissão;
- registro usado não pode ser excluído, apenas inativado.

Adicione entidades em Cadastros:

```txt
cargos
funcoes
```

Crie schemas:

```txt
cargoCadastroSchema
funcaoCadastroSchema
```

Atualize Pessoa/Servidor:

```txt
cargoId
funcaoId
```

Use AsyncCombobox para ambos.

MIGRAÇÃO DO CARGO TEXTO

Não remova `pessoas.cargo` imediatamente.

1. criar cargos;
2. listar valores distintos de cargo legado;
3. normalizar;
4. criar catálogo;
5. preencher cargoId;
6. preferir cargoId na leitura;
7. manter fallback de texto durante transição;
8. somente remover após relatório sem pendências.

PARTE G — MIGRAR SELETORES PRIORITÁRIOS

Substituir por AsyncCombobox:

1. Pessoa/Servidor de Usuário;
2. Pessoa base de Servidor;
3. Secretaria;
4. Cargo;
5. Função;
6. Responsável de Departamento;
7. membros de Comissão/Equipe;
8. Ordenadores;
9. Fornecedor e Item em listas extensas.

Não substituir selects pequenos de enum, como Perfil.

TESTES OBRIGATÓRIOS

Persistência:

1. editar matrícula e nascimento;
2. salvar;
3. resposta conter valores;
4. getById conter valores;
5. reabrir modal;
6. atualizar navegador;
7. valores permanecerem.

Vínculo:

8. selecionar Pessoa no Usuário;
9. salvar;
10. getById retornar pessoaId;
11. reabrir modal;
12. vínculo permanecer;
13. atualizar navegador;
14. vínculo permanecer.

Modal:

15. usuário sem pessoaId recebe modal;
16. sem matrícula recebe modal;
17. sem nascimento recebe modal;
18. alteração administrativa atualiza auth.me;
19. após completar, modal fecha e não retorna.

Autopreenchimento:

20. criar Servidor de Pessoa existente sem duplicar;
21. selecionar Pessoa no Usuário e preencher nome/secretaria;
22. busca por nome próximo prioriza candidato correto;
23. nomes iguais são distinguíveis por matrícula/secretaria.

Combobox:

24. consulta é debounced;
25. não baixa lista inteira;
26. teclado funciona;
27. opção selecionada permanece;
28. dropdown não ultrapassa modal/tela;
29. listas vazias e erros são tratados.

Cargos/Funções:

30. criar cargo;
31. criar função;
32. servidor exige cargo;
33. função é opcional;
34. cargo legado é migrado;
35. registro utilizado não pode ser excluído.

Executar:

- npm run check
- npm run test:all
- npm run build

Entregue no final:

- causa raiz encontrada para cada dado que parecia não persistir;
- migration verificada;
- getById/read-after-write implementados;
- caches invalidados;
- modal corrigido;
- AsyncCombobox e lookup implementados;
- autopreenchimento de Servidor e Usuário;
- Cargos e Funções;
- migração do cargo legado;
- testes executados;
- pendências remanescentes.
```

## Prompt de revisão

```txt
Revise a implementação de persistência, autopreenchimento e seletores pesquisáveis.

Verifique:

1. se o backend realmente grava matrícula, nascimento e pessoaId;
2. se a UI reabre dados por getById;
3. se existe read-after-write;
4. se sucesso não é mostrado antes da confirmação;
5. se formOptions e auth.me são invalidados;
6. se o modal aparece para usuário sem vínculo;
7. se identityDismissed reseta quando o perfil muda;
8. se Servidor reutiliza Pessoa existente;
9. se não há duplicação de Pessoa;
10. se Usuário recebe nome/secretaria da Pessoa;
11. se a busca por nome é incremental e ranqueada;
12. se selects grandes foram removidos;
13. se Cargos e Funções são entidades distintas;
14. se Cargo é obrigatório para Servidor;
15. se cargo legado foi preservado durante a migração;
16. se os testes e build passam.

Corrija falhas sem voltar a carregar listas completas ou duplicar registros de Pessoas.
```

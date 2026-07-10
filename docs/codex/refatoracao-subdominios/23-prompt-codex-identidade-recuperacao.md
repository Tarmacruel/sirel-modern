# 23 — Prompt Codex: identidade, regularização e recuperação de credenciais

## Prompt principal

```txt
Leia antes de implementar:

- docs/codex/refatoracao-subdominios/09-registro-implementacao-operacao-local.md
- docs/codex/refatoracao-subdominios/22-identidade-recuperacao-credenciais.md
- client/src/pages/login-page.tsx
- client/src/App.tsx
- client/src/lib/auth-session.ts
- client/src/pages/cadastros-page.tsx
- shared/src/schemas/cadastros.ts
- server/src/routers/auth.ts
- server/src/lib/auth-password.ts
- server/src/lib/auth-session.ts
- server/src/lib/request-auth.ts
- server/src/_core/context.ts
- server/src/trpc.ts
- server/src/db/schema.ts
- drizzle/schema.ts

Objetivo:
Adicionar data de nascimento ao cadastro de Pessoa, matrícula ao cadastro de Servidor, vínculo entre Usuário e Pessoa, recuperação de nome de usuário, redefinição de senha e modal pós-login para regularização de identidade.

REQUISITOS FUNCIONAIS

1. Pessoa deve possuir Data de nascimento.
2. Servidor deve possuir Matrícula e Data de nascimento.
3. Usuário deve ser vinculável a uma Pessoa/Servidor.
4. Rodapé do login deve possuir:
   - Esqueci meu usuário
   - Redefinir senha
5. Recuperação de usuário deve solicitar:
   - CPF
   - Matrícula
   - Data de nascimento
6. Redefinição de senha deve solicitar na primeira etapa:
   - Nome de usuário
   - CPF
   - Matrícula
   - Data de nascimento
7. Após confirmar identidade, deve abrir segunda etapa para nova senha.
8. Usuário com cadastro incompleto deve receber modal após o login.
9. Depois de regularizado, o modal não deve voltar a aparecer.
10. Sessões antigas devem ser invalidadas depois de redefinição ou troca de senha.

DIAGNÓSTICO IMPORTANTE

- `pessoas` e `servidores` usam atualmente a mesma tabela `pessoas`.
- `users` não possui `pessoaId`.
- não vincule por semelhança de nome;
- `documentos` e o fluxo de Licitação não participam deste escopo;
- a autenticação atual usa token stateless e precisa de versão de sessão para revogação individual.

MODELO DE DADOS

Adicionar em `pessoas`:

```txt
dataNascimento date nullable
matricula varchar(40) nullable
```

Regras:

- matrícula como texto;
- preservar zeros à esquerda;
- trim e normalização consistente;
- nascimento não pode estar no futuro;
- matrícula exigida funcionalmente quando a entidade salva for `servidores`;
- data de nascimento disponível em Pessoa e obrigatória na regularização de identidade.

Adicionar em `users`:

```txt
pessoaId integer nullable references pessoas(id) on delete set null
sessionVersion integer not null default 1
identityProfileCompletedAt timestamptz nullable
```

Criar índice único parcial para `users.pessoaId` quando não nulo.

Antes de criar índices únicos de CPF/matrícula:

1. gere relatório de duplicidades;
2. não quebre migration por dados legados;
3. durante a transição, recuse recuperação ambígua;
4. após saneamento, crie índices únicos parciais normalizados.

Criar tabela:

```txt
auth_recovery_challenges
```

Campos mínimos:

- id
- userId
- purpose
- challengeHash
- expiresAt
- usedAt
- attempts
- ipFingerprint
- createdAt

O desafio deve:

- ser aleatório;
- ser armazenado somente como hash;
- expirar em cerca de 10 minutos;
- ser de uso único;
- não ir para URL ou localStorage.

SCHEMAS

Atualizar `shared/src/schemas/cadastros.ts`.

Pessoa:

```txt
dataNascimento opcional/null
```

Servidor:

```txt
matricula obrigatória
dataNascimento obrigatória
```

Usuário:

```txt
pessoaId opcional/null
```

Criar `shared/src/schemas/auth-recovery.ts` com schemas para:

- recoverUsername
- requestPasswordReset
- completePasswordReset
- changePassword
- completeIdentityProfile

CADASTROS

Pessoa:

- adicionar input de data de nascimento.

Servidor:

- adicionar matrícula;
- adicionar data de nascimento;
- incluir matrícula na busca/listagem autorizada.

Usuário:

- adicionar seletor Pessoa/Servidor;
- exibir status de identidade:
  - completa
  - sem pessoa
  - CPF ausente
  - matrícula ausente
  - nascimento ausente

Não duplicar pessoa ao criar usuário.

AUTH RESPONSE

Faça `auth.login` e `auth.me` retornarem:

```ts
identityProfile: {
  pessoaId: number | null;
  complete: boolean;
  missingFields: Array<"CPF" | "MATRICULA" | "DATA_NASCIMENTO" | "PESSOA_LINK">;
  cpfMasked: string | null;
  matriculaMasked: string | null;
  dataNascimentoPresent: boolean;
}
requiresIdentityCompletion: boolean
```

Não devolva CPF, matrícula ou nascimento completos no payload comum da sessão.

Atualize os tipos em `client/src/lib/auth-session.ts`.

MODAL PÓS-LOGIN

Crie:

```txt
client/src/components/auth/identity-profile-completion-modal.tsx
```

Integre no fluxo após `auth.me`.

Se `requiresIdentityCompletion` for true, abrir modal com:

- CPF
- Matrícula
- Data de nascimento

Regras:

- quando houver pessoa vinculada, mostrar somente campos faltantes;
- não sobrescrever valor divergente já existente;
- conflito deve exigir revisão administrativa;
- após salvar, refetch de `auth.me`;
- após completar, modal não abre novamente;
- permitir logout;
- implementar parâmetro `AUTH.IDENTITY_COMPLETION_MODE=REMINDER|REQUIRED`;
- em REMINDER, permitir `Lembrar depois` até novo login;
- em REQUIRED, permitir apenas regularizar, solicitar suporte ou sair.

CONCILIAÇÃO DE PESSOA

Se `users.pessoaId` já existir:

- preencher somente ausentes;
- impedir CPF/matrícula conflitantes;
- não sobrescrever divergência.

Se não existir:

1. buscar correspondência exata por CPF e matrícula;
2. se houver uma única pessoa compatível, vincular;
3. se houver um único candidato por nome normalizado + mesma secretaria, sem dados conflitantes, completar e vincular;
4. se não houver candidato/conflito, criar pessoa com o nome e secretaria do usuário e vincular;
5. se houver ambiguidade, não vincular; registrar conflito para revisão administrativa.

Nunca vincule apenas por similaridade aproximada de nome.

RECUPERAÇÃO DO USUÁRIO

Adicionar ação no rodapé do login:

```txt
Esqueci meu usuário
```

Criar dialog:

```txt
client/src/components/auth/username-recovery-dialog.tsx
```

Campos:

- CPF
- Matrícula
- Data de nascimento

Procedure pública:

```txt
auth.recoverUsername
```

Validar correspondência exata com pessoa e usuário ativos.

Em sucesso:

```txt
Seu nome de usuário é: nome.usuario
[Usar este usuário no login]
```

Em falha:

```txt
Não foi possível confirmar os dados informados. Verifique os dados ou procure o administrador do SIREL.
```

Não revele qual dado divergiu nem se o CPF existe.

REDEFINIÇÃO DE SENHA

Adicionar ação no rodapé:

```txt
Redefinir senha
```

Criar dialog de duas etapas:

```txt
client/src/components/auth/password-reset-dialog.tsx
```

Etapa 1:

- Nome de usuário
- CPF
- Matrícula
- Data de nascimento

Procedure:

```txt
auth.requestPasswordReset
```

Em correspondência exata, emitir challenge temporário.

Etapa 2:

- Nova senha
- Confirmar nova senha

Procedure:

```txt
auth.completePasswordReset
```

Na conclusão:

- validar challenge;
- marcar usedAt;
- usar `hashPassword()` existente;
- incrementar `sessionVersion`;
- registrar PASSWORD_RESET;
- invalidar tokens antigos;
- retornar ao login;
- não autenticar silenciosamente.

Mensagem:

```txt
Senha redefinida. Entre novamente com a nova senha.
```

TROCA DE SENHA AUTENTICADA

Adicionar no menu do usuário:

```txt
Alterar minha senha
```

Campos:

- Senha atual
- Nova senha
- Confirmar nova senha

Procedure protegida:

```txt
auth.changePassword
```

- validar senha atual;
- hash da nova senha;
- incrementar sessionVersion;
- registrar PASSWORD_CHANGE;
- emitir nova sessão ou forçar novo login.

SESSÃO E REVOGAÇÃO

Atualizar `SessionPayload`:

```ts
sub
sessionVersion
iat
exp
```

Inclua os campos atuais.

`createSessionToken()` deve receber `sessionVersion`.

O backend deve conferir em procedures protegidas:

```txt
token.sessionVersion === users.sessionVersion
```

Atualize:

- auth-session.ts
- request-auth.ts
- context/middleware/protectedProcedure conforme necessário

Não use apenas limpeza do cookie local como revogação.

RATE LIMIT E SEGURANÇA

Implementar no mínimo:

```txt
5 tentativas em 15 minutos
```

Aplicar por:

- IP;
- usuário informado;
- fingerprint HMAC dos dados normalizados.

Nunca registrar CPF, matrícula ou nascimento brutos.

Adicionar eventos:

- USERNAME_RECOVERY_SUCCESS
- USERNAME_RECOVERY_FAILURE
- USERNAME_RECOVERY_BLOCKED
- PASSWORD_RESET_REQUEST
- PASSWORD_RESET_FAILURE
- PASSWORD_RESET_BLOCKED
- IDENTITY_PROFILE_COMPLETED
- IDENTITY_PROFILE_CONFLICT

Respostas devem ser genéricas e uniformes.

Recuperação pública somente por HTTPS em produção.

Não persistir dados de recuperação no navegador.

LOGIN UI

No rodapé do formulário, inserir links/botões discretos:

```txt
Esqueci meu usuário
Redefinir senha
```

Preservar o layout por subsistema.

Não transformar a tela em um formulário extenso.

Os dialogs devem funcionar em desktop e mobile, com foco e teclado corretos.

MIGRAÇÃO E BACKFILL

1. adicionar campos nullable;
2. manter login legado funcionando;
3. criar relatório de incompletos e duplicidades;
4. ativar modal de regularização;
5. recuperação só funciona para identidade completa e não ambígua;
6. não inserir CPF, matrícula ou nascimento fictícios;
7. ativar índices únicos após saneamento.

Criar visão/relatório administrativo para:

- usuário sem pessoa;
- sem CPF;
- sem matrícula;
- sem nascimento;
- CPF duplicado;
- matrícula duplicada.

TESTES OBRIGATÓRIOS

Cadastro:

1. Pessoa salva nascimento.
2. Servidor salva matrícula e nascimento.
3. Zeros da matrícula são preservados.
4. Usuário vincula a pessoa.
5. Dois usuários não vinculam à mesma pessoa.

Modal:

6. Abre para incompleto.
7. Não abre para completo.
8. Preenche ausentes.
9. Não sobrescreve divergência.
10. Ambiguidade exige revisão.
11. REMINDER permite adiar.
12. REQUIRED restringe acesso e permite logout.

Usuário:

13. Dados corretos recuperam username.
14. Campo incorreto gera mensagem genérica.
15. Conta inativa não é recuperada.
16. Rate limit bloqueia tentativas.
17. Logs não contêm PII.

Senha:

18. Identidade correta gera challenge.
19. Challenge expira.
20. Challenge não pode ser reutilizado.
21. Nova senha usa scrypt.
22. sessionVersion incrementa.
23. token antigo é recusado.
24. nova senha permite login.
25. troca autenticada exige senha atual.

Executar:

- npm run check
- npm run test:all
- npm run build

Entregue no final:

- migrations criadas;
- alterações de schemas;
- fluxo de vínculo usuário/pessoa;
- modal de regularização;
- dialogs do login;
- rate limiting;
- auditoria;
- invalidação de sessão;
- relatório de dados incompletos/duplicados;
- testes executados;
- riscos e pendências.
```

## Prompt de revisão

```txt
Revise a implementação de identidade e recuperação de credenciais.

Verifique:

1. se data de nascimento pertence a pessoas;
2. se matrícula é tratada como texto e preserva zeros;
3. se usuário possui vínculo explícito com pessoa;
4. se não há associação por nome aproximado;
5. se o modal deixa de aparecer após regularização;
6. se divergências não sobrescrevem dados existentes;
7. se recuperação exige correspondência exata dos três dados;
8. se respostas não permitem enumeração de contas;
9. se challenge de senha é curto, hasheado e de uso único;
10. se senha usa o hash já existente;
11. se sessionVersion invalida tokens anteriores;
12. se rate limiting funciona;
13. se logs não possuem CPF, matrícula ou nascimento;
14. se usuários legados continuam entrando;
15. se check, testes e build passam.

Corrija falhas sem reduzir os controles de segurança ou duplicar cadastros de pessoas.
```

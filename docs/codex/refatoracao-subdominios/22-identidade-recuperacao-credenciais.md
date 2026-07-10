# 22 — Identidade pessoal, regularização cadastral e recuperação de credenciais

## 1. Objetivo

Implementar uma camada de identidade pessoal vinculada aos usuários do SIREL para permitir:

- data de nascimento no cadastro de Pessoa;
- matrícula funcional no cadastro de Servidor;
- vínculo explícito entre Usuário e Pessoa/Servidor;
- recuperação do nome de usuário por CPF, matrícula e data de nascimento;
- redefinição de senha por nome de usuário, CPF, matrícula e data de nascimento;
- modal de regularização após o login para usuários com cadastro incompleto;
- interrupção automática do lembrete após a regularização;
- auditoria, limitação de tentativas e invalidação das sessões anteriores após troca de senha.

As funcionalidades de recuperação ficarão no rodapé da tela de login.

## 2. Diagnóstico atual

### 2.1. Pessoa e Servidor usam a mesma tabela

A interface trata `pessoas` e `servidores` como entidades distintas, mas ambas persistem na tabela `pessoas`.

O cadastro atual contém:

```txt
nome
cpf
cargo
secretaria_id
ativo
```

Não existem:

```txt
data_nascimento
matricula
```

### 2.2. Usuário não está vinculado a Pessoa

A tabela `users` possui:

```txt
id
username
name
email
password_hash
role
secretaria_id
ativo
```

Não existe `pessoa_id`.

Não realizar recuperação tentando relacionar `users.name` com `pessoas.nome`. Nomes não são identificadores confiáveis e podem ser repetidos ou alterados.

### 2.3. Autenticação atual

O login atual:

- aceita nome de usuário ou e-mail;
- possui bloqueio após tentativas inválidas;
- usa senha derivada com `scrypt` e salt;
- cria sessão stateless com duração de 12 horas;
- não possui recuperação de usuário;
- não possui fluxo público de redefinição de senha;
- não possui revogação individual de sessões.

### 2.4. Eventos existentes

O enum de auditoria já contempla:

```txt
PASSWORD_CHANGE
PASSWORD_RESET
```

Devem ser adicionados eventos específicos para recuperação de usuário, regularização cadastral, falhas e bloqueios.

## 3. Decisão de domínio

A identidade de autenticação deve obedecer à relação:

```txt
Usuário 1 → 1 Pessoa/Servidor
```

Uma pessoa pode possuir no máximo um usuário ativo no SIREL, salvo decisão administrativa futura para múltiplos vínculos.

CPF, matrícula e data de nascimento pertencem à Pessoa/Servidor, não à tabela de usuários.

## 4. Alterações no modelo de dados

## 4.1. Tabela `pessoas`

Adicionar:

```txt
data_nascimento date nullable
matricula varchar(40) nullable
```

Regras:

- `dataNascimento` é exibida em Pessoa e Servidor;
- `matricula` é exibida e exigida funcionalmente no cadastro de Servidor;
- matrícula deve ser armazenada como texto para preservar zeros à esquerda;
- normalizar matrícula removendo espaços periféricos e aplicando caixa consistente;
- CPF deve continuar normalizado para comparação;
- não registrar CPF, matrícula ou nascimento em logs textuais.

### Unicidade

A recuperação exige identificação não ambígua.

Antes de criar índices únicos, executar relatório de duplicidades para:

- CPF normalizado;
- matrícula normalizada.

Após saneamento, criar índices únicos parciais para valores não vazios. Enquanto houver duplicidade, o serviço de recuperação deve recusar resultados ambíguos.

## 4.2. Tabela `users`

Adicionar:

```txt
pessoa_id integer nullable references pessoas(id) on delete set null
session_version integer not null default 1
identity_profile_completed_at timestamptz nullable
```

Índice:

```txt
unique users(pessoa_id) where pessoa_id is not null
```

### Motivo de `session_version`

Os tokens atuais são stateless. Após redefinir senha, sessões antigas continuariam válidas até expirar.

`sessionVersion` deve ser incluído no token e conferido pelo backend. Na redefinição de senha:

```txt
session_version = session_version + 1
```

Isso invalida cookies e Bearer tokens emitidos anteriormente.

## 4.3. Tabela de desafios de recuperação

Criar:

```txt
auth_recovery_challenges
```

Campos sugeridos:

```txt
id
user_id
purpose
challenge_hash
expires_at
used_at
attempts
ip_fingerprint
created_at
```

Tipos:

```txt
PASSWORD_RESET
```

O token de desafio:

- deve ser aleatório e criptograficamente seguro;
- deve ser devolvido apenas uma vez ao frontend;
- deve ser armazenado apenas como hash;
- deve expirar em aproximadamente 10 minutos;
- deve ser de uso único;
- não deve ser persistido em `localStorage`;
- não deve aparecer na URL.

## 5. Schemas compartilhados

Atualizar `shared/src/schemas/cadastros.ts`:

```ts
pessoaCadastroSchema: {
  dataNascimento?: string | null;
}

servidorCadastroSchema: {
  dataNascimento: string;
  matricula: string;
}

usuarioCadastroSchema: {
  pessoaId?: number | null;
}
```

Regras:

- nascimento não pode estar no futuro;
- definir limite razoável de idade sem bloquear casos excepcionais indevidamente;
- matrícula obrigatória ao salvar pela entidade `servidores`;
- CPF obrigatório para servidor destinado a possuir usuário;
- usuário novo deve preferencialmente ser vinculado a servidor existente.

Criar schemas de autenticação em arquivo dedicado, por exemplo:

```txt
shared/src/schemas/auth-recovery.ts
```

## 6. Cadastros de Pessoa e Servidor

### Pessoa

Adicionar campo:

```txt
Data de nascimento
```

### Servidor

Adicionar:

```txt
Matrícula
Data de nascimento
```

### Listagem

- não mostrar CPF completo por padrão;
- não mostrar data de nascimento completa em tabela ampla;
- matrícula pode ser exibida conforme permissão;
- CPF e nascimento completos somente em formulário autorizado;
- incluir filtros por matrícula no cadastro de Servidores.

### Cadastro de Usuário

Adicionar seletor:

```txt
Pessoa/Servidor vinculado
```

Exibir estado:

```txt
Identidade completa
CPF ausente
Matrícula ausente
Data de nascimento ausente
Sem pessoa vinculada
```

Ao criar usuário para servidor já cadastrado, não duplicar a pessoa.

## 7. Status de regularização no login

`auth.login` e `auth.me` devem retornar objeto derivado:

```ts
identityProfile: {
  pessoaId: number | null;
  complete: boolean;
  missingFields: Array<"CPF" | "MATRICULA" | "DATA_NASCIMENTO" | "PESSOA_LINK">;
  cpfMasked: string | null;
  matriculaMasked: string | null;
  dataNascimentoPresent: boolean;
}
```

Não devolver CPF, matrícula ou nascimento completos no payload comum da sessão.

Campo de conveniência:

```ts
requiresIdentityCompletion: boolean
```

A condição deve ser calculada a partir do estado atual do banco. O timestamp de conclusão serve para auditoria, mas não deve prevalecer sobre campos posteriormente removidos.

## 8. Modal de regularização após o login

Criar componente, por exemplo:

```txt
client/src/components/auth/identity-profile-completion-modal.tsx
```

O modal deve abrir após `auth.me` quando:

```txt
requiresIdentityCompletion === true
```

Campos:

```txt
CPF
Matrícula
Data de nascimento
```

### Comportamento

- mostrar apenas campos ausentes quando houver pessoa vinculada;
- permitir corrigir conflito somente por fluxo administrativo;
- não sobrescrever silenciosamente dado já cadastrado e diferente;
- após salvar, invalidar/refazer `auth.me`;
- quando o perfil estiver completo, não abrir novamente;
- manter ação `Sair da conta` disponível.

### Modo operacional

Criar parâmetro configurável:

```txt
AUTH.IDENTITY_COMPLETION_MODE=REMINDER | REQUIRED
```

Recomendação inicial:

```txt
REMINDER
```

Nesse modo, o usuário pode escolher `Lembrar depois`, mas o modal reaparece em novo login.

Em `REQUIRED`, somente são permitidos:

- regularizar;
- sair da conta;
- solicitar suporte administrativo.

A troca de modo não deve exigir reescrita do componente.

## 9. Estratégia de vínculo durante a regularização

## 9.1. Usuário já possui `pessoaId`

- atualizar somente campos ausentes;
- rejeitar CPF ou matrícula já vinculados a outra pessoa;
- se valor informado divergir de valor existente, não sobrescrever; direcionar para revisão administrativa;
- preencher `identityProfileCompletedAt` quando os três dados estiverem presentes.

## 9.2. Usuário ainda não possui `pessoaId`

Executar conciliação segura:

1. procurar correspondência exata por CPF e matrícula normalizados;
2. se houver exatamente uma pessoa compatível, vincular;
3. se houver pessoa com mesmo nome normalizado e mesma secretaria, com campos ausentes e sem conflito, permitir completar e vincular;
4. se não houver candidato nem conflito, criar nova pessoa com nome e secretaria do usuário e vincular;
5. se houver múltiplos candidatos ou qualquer divergência, não vincular automaticamente; gerar pendência de revisão administrativa.

Não vincular apenas por semelhança de nome.

## 10. Rodapé da tela de login

Adicionar duas ações discretas:

```txt
Esqueci meu usuário
Redefinir senha
```

Não poluir o formulário principal. As ações devem abrir dialogs próprios.

Arquivos sugeridos:

```txt
client/src/components/auth/username-recovery-dialog.tsx
client/src/components/auth/password-reset-dialog.tsx
client/src/components/auth/identity-input-fields.tsx
```

## 11. Recuperação do nome de usuário

### Entrada

```txt
CPF
Matrícula
Data de nascimento
```

### Validação

O backend deve encontrar exatamente:

- pessoa ativa;
- usuário ativo vinculado;
- CPF normalizado igual;
- matrícula normalizada igual;
- data de nascimento igual.

Se houver zero ou múltiplos resultados, a operação falha.

### Resposta

Em caso de sucesso, exibir:

```txt
Seu nome de usuário é: nome.usuario
```

Adicionar ação:

```txt
Usar este usuário no login
```

Em falha, usar mensagem genérica:

```txt
Não foi possível confirmar os dados informados. Verifique os dados ou procure o administrador do SIREL.
```

Não informar qual campo divergiu e não revelar se o CPF existe.

## 12. Redefinição de senha

### Etapa 1 — confirmação da identidade

Solicitar:

```txt
Nome de usuário
CPF
Matrícula
Data de nascimento
```

Validar correspondência exata entre usuário ativo e pessoa vinculada.

Em sucesso, emitir desafio temporário de redefinição.

### Etapa 2 — nova senha

Solicitar:

```txt
Nova senha
Confirmar nova senha
```

Regras:

- aplicar a política de senha central do sistema;
- usar `hashPassword()` existente;
- nunca enviar ou armazenar senha em texto;
- consumir o desafio uma única vez;
- incrementar `sessionVersion`;
- registrar `PASSWORD_RESET`;
- invalidar sessões anteriores;
- limpar o formulário e retornar ao login.

Mensagem final:

```txt
Senha redefinida. Entre novamente com a nova senha.
```

## 13. Troca de senha autenticada

Além da recuperação no login, adicionar no menu do usuário:

```txt
Alterar minha senha
```

Fluxo autenticado:

```txt
Senha atual
Nova senha
Confirmar nova senha
```

Esse fluxo não precisa solicitar CPF, matrícula e nascimento, pois o usuário já está autenticado e confirma a senha atual.

Registrar `PASSWORD_CHANGE` e incrementar `sessionVersion`, emitindo nova sessão para a própria requisição ou solicitando novo login.

## 14. Proteções obrigatórias

CPF, matrícula e nascimento são dados estáticos e não equivalem a um segundo fator forte. Implementar as seguintes proteções:

### Limitação de tentativas

Aplicar por:

- IP;
- nome de usuário, quando informado;
- fingerprint HMAC dos dados normalizados, sem armazenar os dados brutos.

Parâmetro inicial sugerido:

```txt
5 tentativas em 15 minutos
```

Após o limite, responder genericamente e registrar bloqueio.

### Resposta uniforme

- evitar diferença evidente entre usuário existente e inexistente;
- não retornar CPF, matrícula, nascimento ou e-mail;
- não registrar os dados em texto nos logs;
- não usar query string para os formulários.

### Auditoria

Adicionar eventos:

```txt
USERNAME_RECOVERY_SUCCESS
USERNAME_RECOVERY_FAILURE
USERNAME_RECOVERY_BLOCKED
PASSWORD_RESET_REQUEST
PASSWORD_RESET_FAILURE
PASSWORD_RESET_BLOCKED
IDENTITY_PROFILE_COMPLETED
IDENTITY_PROFILE_CONFLICT
```

Os logs devem guardar:

- userId somente quando conhecido;
- IP;
- evento;
- data;
- detalhe técnico sem PII.

### Sessões

- adicionar `sessionVersion` ao token;
- conferir a versão no backend para procedures protegidas;
- reset de senha invalida todas as sessões anteriores;
- não confiar apenas em apagar o cookie do navegador atual.

### Transporte e armazenamento

- permitir recuperação apenas em HTTPS em produção;
- não persistir dados de recuperação no navegador;
- usar `new-password` nos inputs de nova senha;
- limpar estados do dialog ao fechar.

## 15. Router e procedures

Expandir `authRouter` ou separar router público de recuperação.

Procedures sugeridas:

```txt
auth.recoverUsername
auth.requestPasswordReset
auth.completePasswordReset
auth.changePassword
auth.completeIdentityProfile
auth.identityProfileStatus
```

Ações públicas:

```txt
recoverUsername
requestPasswordReset
completePasswordReset
```

Ações protegidas:

```txt
changePassword
completeIdentityProfile
identityProfileStatus
```

## 16. Alterações no token e contexto

Atualizar payload:

```ts
interface SessionPayload {
  sub: number;
  sessionVersion: number;
  iat: number;
  exp: number;
  // campos atuais
}
```

O backend deve validar que:

```txt
token.sessionVersion === users.sessionVersion
```

Pode ser validado em middleware/procedure protegida com consulta ao usuário ativo.

Não aceitar tokens antigos sem versão após a janela de migração definida.

## 17. Migração e backfill

### Etapa 1

Adicionar campos nullable e tabelas sem bloquear usuários existentes.

### Etapa 2

Criar relatório administrativo:

```txt
Usuários sem pessoa vinculada
Usuários sem CPF
Usuários sem matrícula
Usuários sem data de nascimento
Pessoas com CPF duplicado
Pessoas com matrícula duplicada
```

### Etapa 3

Permitir regularização por modal e por administração.

### Etapa 4

Após saneamento, ativar índices únicos e, se desejado, modo `REQUIRED`.

### Compatibilidade

- usuários existentes continuam autenticando;
- recuperação só funciona quando identidade estiver completa e não ambígua;
- cadastro incompleto não deve produzir recuperação parcial;
- não preencher dados fictícios em migration.

## 18. UX do modal e dialogs

### Modal pós-login

Título:

```txt
Complete seus dados de identificação
```

Texto curto:

```txt
Esses dados serão usados para confirmar sua identidade caso você precise recuperar o acesso.
```

Não usar textos alarmistas nem exibir os dados em outras áreas do sistema.

### Recuperar usuário

Fluxo compacto em uma única etapa.

### Redefinir senha

Usar stepper de duas etapas:

```txt
1. Confirmar identidade
2. Criar nova senha
```

### Acessibilidade

- foco inicial correto;
- labels explícitos;
- erros associados ao campo;
- navegação por teclado;
- não depender somente de cor;
- mensagens genéricas de segurança no topo, detalhes de formato junto ao campo.

## 19. Testes obrigatórios

### Cadastro

- salvar data de nascimento em Pessoa;
- salvar matrícula e nascimento em Servidor;
- preservar zeros à esquerda;
- impedir matrícula conflitante;
- vincular usuário a pessoa;
- impedir dois usuários vinculados à mesma pessoa.

### Regularização

- modal abre para perfil incompleto;
- modal não abre após completar;
- atualização preenche somente campo ausente;
- divergência gera conflito e não sobrescreve;
- usuário sem pessoa é conciliado corretamente;
- ambiguidade exige revisão administrativa;
- `REMINDER` permite adiar;
- `REQUIRED` bloqueia a aplicação, mas permite logout.

### Recuperação de usuário

- combinação correta retorna usuário;
- qualquer campo incorreto retorna mensagem genérica;
- conta inativa não é recuperada;
- duplicidade/ambiguidade não retorna usuário;
- rate limit funciona;
- logs não contêm PII.

### Redefinição de senha

- combinação correta gera desafio;
- desafio expira;
- desafio é de uso único;
- desafio incorreto falha;
- senha é armazenada com `scrypt`;
- `sessionVersion` incrementa;
- token antigo deixa de funcionar;
- nova senha permite login;
- rate limit funciona.

### Troca autenticada

- exige senha atual correta;
- registra `PASSWORD_CHANGE`;
- invalida sessões anteriores;
- usuário consegue entrar novamente.

### Regressão

```txt
npm run check
npm run test:all
npm run build
```

## 20. Critérios de aceite

A etapa estará concluída quando:

- Pessoa possuir data de nascimento;
- Servidor possuir matrícula e data de nascimento;
- Usuário estiver vinculável a Pessoa/Servidor;
- login retornar status de completude sem expor PII;
- modal aparecer somente para cadastro incompleto;
- recuperação de usuário funcionar com os três dados;
- redefinição de senha funcionar com usuário e os três dados;
- rodapé do login possuir as duas ações;
- sessões antigas forem invalidadas após reset;
- tentativas forem limitadas e auditadas;
- conflitos e ambiguidades não forem resolvidos automaticamente;
- usuários legados continuarem acessando durante a migração;
- typecheck, testes e build passarem.

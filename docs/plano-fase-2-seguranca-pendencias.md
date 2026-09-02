# Fase 2 — Segurança, privacidade e pendências

## Objetivo e regra de implantação

Esta fase protege primeiro o ambiente interno e mantém um portal público mínimo. Toda alteração de banco será aditiva e compatível. Antes de aplicá-la ao banco operacional ou a qualquer banco com dados, deve haver backup validado e registro do resultado; bancos vazios descartáveis devem ser reconstruídos primeiro para validar a cadeia completa. A branch de trabalho é `fase-2-seguranca-evolucoes`; testes de integração e homologação serão executados no computador de casa antes de qualquer implantação no ambiente de trabalho.

## Entregue nesta base

- As procedures internas tRPC passaram a exigir sessão validada; somente `health`, login e recuperação permanecem anônimos.
- A sessão é exclusivamente por cookie `HttpOnly`, `Secure` em produção e `SameSite=Lax`; o cliente não armazena nem envia Bearer.
- `JWT_SECRET` sem pelo menos 32 caracteres impede a inicialização; a operação deve gerar o valor com entropia criptográfica e mantê-lo fora do repositório.
- Mutações autenticadas exigem cookie e cabeçalho anti-CSRF, com verificação de Fetch Metadata.
- O portal público possui contratos próprios: lista somente processos ativos e publicados e expõe apenas número, edital, objeto, secretaria, modalidade e data de publicação. Documentos públicos recebem link assinado sem ID interno.
- Downloads internos, relatórios, SDs e ativos de cadastro exigem autenticação. Documento restrito respeita `restritoA`; administrador sempre acessa e lista vazia libera apenas a usuários autenticados.
- Upload autentica antes do Multer, limita tamanho/partes, rejeita extensões/MIME não permitidos, gera nome aleatório e valida assinatura de PDF.
- Helmet, `X-Powered-By` desativado, CSP em `Report-Only`, respostas 404/500 sem detalhe interno e proxy confiável somente com `TRUST_PROXY` explícito.
- O servidor de desenvolvimento Vite fica restrito a `127.0.0.1`, porta fixa e acesso ao sistema de arquivos estrito; não há liberação curinga de hosts (`allowedHosts: []`) nem CORS aberto. O túnel encaminha o cabeçalho de host para `localhost:5173`, sem precisar abrir a allowlist.
- O bootstrap da importação legada exige `SIREL_DEFAULT_PASSWORD` (mínimo de 12 caracteres), `SIREL_ADMIN_USERNAME` e `SIREL_ADMIN_NAME`; `SIREL_ADMIN_EMAIL` é opcional. Não há mais fallbacks `BETA_*` nem credenciais padrão no código.
- `OPERACAO_LOCAL_SENSIVEL.txt` foi retirado do versionamento e é ignorado pelo Git. O único artefato versionado é o modelo sem segredos `OPERACAO_LOCAL_SENSIVEL.example.txt`, a ser copiado e preenchido localmente.
- `xlsx` foi removido dos fluxos de importação/exportação. O nome de importação `exceljs` foi preservado como alias npm para `devextreme-exceljs-fork@4.4.11`, cuja distribuição não inclui a cadeia vulnerável de `uuid` no bundle de navegador.

## Bloqueadores globais antes de produção

1. Adicionar testes HTTP de autorização, CSRF, enumeração de documento e upload residual; os testes unitários existentes não substituem estes cenários.
2. Subir a CSP de observação para bloqueio após avaliar os relatórios de violação no ambiente de teste.
3. Implementar limite de taxa por IP e por conta em login e recuperação, usando armazenamento compartilhado quando houver mais de uma instância.
4. Concluir criptografia AES-256-GCM do artefato de backup antes do espelhamento OneDrive, com `BACKUP_ENCRYPTION_KEY` fora do repositório, ACL restritiva, checksum do cifrado e restauração de ZIP legado somente mediante confirmação explícita.

### Controle de dependências concluído

Em 31/08/2026, a cadeia `exceljs -> uuid` vulnerável foi eliminada inclusive do bundle de navegador sem alterar os imports da aplicação: o alias npm `exceljs` resolve para `devextreme-exceljs-fork@4.4.11`. Após a substituição e a validação de compatibilidade, tanto `npm audit --omit=dev` quanto `npm audit` retornam 0 vulnerabilidades. Os dois comandos permanecem obrigatórios antes de cada promoção, sem aceitação de achados altos ou moderados em dependências de produção ou de desenvolvimento.

### Segredos que possam ter sido versionados

Retirar um arquivo do índice não remove seu conteúdo do histórico nem invalida cópias já realizadas. Todo segredo, credencial, URL privada ou chave que tenha sido versionado deve ser tratado como potencialmente exposto: revogar ou rotacionar o valor no serviço de origem, atualizar o ambiente local/de implantação e invalidar sessões, tokens ou chaves derivadas quando aplicável. A confirmação da rotação deve compor o registro operacional, sem registrar o valor secreto.

## Releases funcionais

### R2.1 — Cadastros (implementado; homologação manual pendente)

Leitura individual, read-after-write, invalidação de cache, combobox assíncrono compartilhado, lookup paginado, vínculo Pessoa/Usuário, detecção de duplicidade e catálogos de Cargos/Funções foram implementados. A migration `0056_cadastros_cargos_funcoes.sql` mantém `cargo` legado e possui gate automatizado de esquema/dados; a `0057_importacao_bll_itens_lote_index.sql` reconcilia de forma aditiva um índice legado necessário à reconstrução limpa. Evidências, roteiro de homologação doméstica e rollback estão em [R2.1 — Registro de implementação e roteiro de homologação](./r2.1-cadastros-implementacao-homologacao.md).

### R2.2 — Documentos e portal público (implementação na branch; homologação e implantação pendentes)

O R2.2 consolida o gate de publicação, classificação institucional, linhagem de versões e o portal público mínimo em `https://transparencia.sirel.com.br`:

- `0058_documentos_publicacao.sql` cria os estados `RASCUNHO`, `EM_REVISAO`, `APROVADO`, `REJEITADO` e `RETIRADO`; o acervo existente entra em revisão, sem aprovação retroativa;
- `0059_documentos_classificacao_versoes.sql` cria o catálogo de classificações, preserva `categoria` legado, associa o acervo ao catálogo e adiciona raiz/antecessor para uma linhagem explícita de versões;
- novas versões nascem internas como `RASCUNHO`; o portal mantém a última versão pública aprovada enquanto uma versão posterior estiver em elaboração ou revisão e invalida o link da versão substituída após a nova aprovação;
- somente processos ativos/publicados e documentos `publico=true`, `APROVADO` e sem `restritoA` são expostos; download usa capacidade opaca e revalida a autorização;
- o hostname público usa allowlist própria de rotas somente leitura, contratos que não expõem IDs internos e cliente que usa `credentials: "omit"`, sem Bearer ou CSRF;
- classificação, acesso, revisão, aprovação, rejeição e retirada devem ficar registrados na auditoria com snapshots sanitizados.

O cadastro da rota no Cloudflare Tunnel não confirma que a aplicação está implantada ou que a migration foi aplicada. O roteiro completo, os limites de exposição, a sequência segura de banco, a matriz manual e o rollback estão em [R2.2 — Documentos e Portal da Transparência](./r2.2-documentos-portal-publico-homologacao.md). Antes de qualquer banco com dados, é obrigatório restaurar e validar backup isolado; nenhuma migration deve ser aplicada diretamente no operacional. A definição entre SSO por cookie de domínio e isolamento total do cookie no hostname público continua sendo uma decisão obrigatória antes da produção.

### R2.3 — Gestão operacional

Consolidar dashboard executivo, timeline por processo, gargalos, contratos/vigências, tarefas por usuário e relatórios consolidados. Cada tela deve usar as queries autenticadas internas; o portal público não reutiliza DTOs internos.

### R2.4 — Operação

Criar job periódico que restaure um backup em ambiente isolado, valide banco, uploads e checksums, elimine o ambiente temporário e guarde evidência auditável. Acrescentar checklist de operação e resposta a falha.

### R2.5 — IA e busca semântica

Preparar normalização e índice textual local. Nenhum documento ou dado pessoal poderá sair do ambiente sem configuração explícita, avaliação de privacidade, registro de finalidade e opt-in administrativo.

## Critérios de aceite por release

- `npm run check`, `npm run test:all` e `npm run build` aprovados.
- Testes de integração para anônimo negado, portal filtrado, documento público/restrito, perfis, enumeração, cabeçalhos forjados, segredo ausente, CSRF, upload inválido e backup/restauração.
- `npm audit --omit=dev` sem vulnerabilidades altas ou moderadas em dependências de produção.
- Revisão manual do login, upload, documento público e backup, com evidência anexada ao registro operacional.

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
- Dependências vulneráveis foram atualizadas; `xlsx` foi substituído por `exceljs` nos fluxos de importação/exportação.

## Bloqueadores globais antes de produção

1. Adicionar testes HTTP de autorização, CSRF, enumeração de documento e upload residual; os testes unitários existentes não substituem estes cenários.
2. Subir a CSP de observação para bloqueio após avaliar os relatórios de violação no ambiente de teste.
3. Implementar limite de taxa por IP e por conta em login e recuperação, usando armazenamento compartilhado quando houver mais de uma instância.
4. Concluir criptografia AES-256-GCM do artefato de backup antes do espelhamento OneDrive, com `BACKUP_ENCRYPTION_KEY` fora do repositório, ACL restritiva, checksum do cifrado e restauração de ZIP legado somente mediante confirmação explícita.
5. Resolver as vulnerabilidades transitivas ainda reportadas por `npm audit --omit=dev` após validar a compatibilidade das bibliotecas de planilha e geração DOCX; não promover para produção com achados altos ou moderados.

## Releases funcionais

### R2.1 — Cadastros (implementado; homologação manual pendente)

Leitura individual, read-after-write, invalidação de cache, combobox assíncrono compartilhado, lookup paginado, vínculo Pessoa/Usuário, detecção de duplicidade e catálogos de Cargos/Funções foram implementados. A migration `0056_cadastros_cargos_funcoes.sql` mantém `cargo` legado e possui gate automatizado de esquema/dados; a `0057_importacao_bll_itens_lote_index.sql` reconcilia de forma aditiva um índice legado necessário à reconstrução limpa. Evidências, roteiro de homologação doméstica e rollback estão em [R2.1 — Registro de implementação e roteiro de homologação](./r2.1-cadastros-implementacao-homologacao.md).

### R2.2 — Documentos e portal público

Completar busca, metadados, versionamento e classificação. Publicar somente documento aprovado e público. Registrar auditoria de alterações de `publico` e `restritoA`, incluindo autor, valores anterior/novo e justificativa.

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

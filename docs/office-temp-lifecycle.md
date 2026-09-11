# Correção do ciclo de vida Office — SIREL

## Diagnóstico

Foram examinados os usos de `mkdtemp`, `tmpdir`, `child_process`, `UserInstallation`,
`--headless`, `--convert-to`, `soffice` e os dois prefixos no repositório.
Os dois produtores Office eram `server/src/modules/arquivos/content.ts`
(indexação textual) e `preview.ts` (PDF para visualização). HTTP e o router tRPC
chamam o mesmo preview; o indexador chama o extrator. Não há outro conversor Office
para miniaturas/HTML. Os subprocessos de relatórios SD/atas são Python, não LibreOffice.
Uploads usam outro diretório e não são alvo desta coleta.

Falhas concretas encontradas no código anterior:

- O preview chamava `child.kill()` no timeout e rejeitava a operação imediatamente,
  sem aguardar o encerramento. No Windows, matar o lançador não garante encerrar
  `soffice.bin`. O `finally` podia tentar excluir um perfil ainda aberto.
- A falha de exclusão do perfil era descartada (`catch(() => undefined)`).
- O extrator usava timeout de `execFile`, sem possuir a árvore de processos.
  Uma falha de `rm` era absorvida pelo `catch` externo que retorna `null`.
- As duas alocações do extrator ocorriam antes do `try`: se a segunda falhasse,
  a primeira não tinha cleanup.
- Não havia retry para bloqueios, recuperação na inicialização, GC periódico,
  nem espera pelos jobs Office antes de `process.exit()` no shutdown.
- A indexação tinha dois workers por padrão; previews não tinham limite conjunto.

O indexador já compara tamanho/mtime e data da indexação, evitando reconverter
arquivos inalterados. Não foi encontrado loop de conversão recursiva no código.
Na inspeção inicial desta máquina não havia diretórios dos dois padrões nem
processos `soffice` ativos. Portanto, não foi possível atribuir os 100 GB históricos
a um documento, medir seus maiores arquivos ou recuperar logs da falha original.
O mecanismo de vazamento acima é demonstrável no código; o incidente histórico
não foi reproduzido integralmente.

## Implementação

`office.ts` centraliza fila, alocações, perfil exclusivo, metadados de propriedade,
execução, consumo da saída, métricas e `finally`. Cada alocação entra imediatamente
na lista de cleanup. `content.ts` aguarda a leitura antes da remoção; `preview.ts`
publica somente um PDF completo por cópia e rename de staging exclusivo no cache.
Uma falha não apaga o cache de outra instância. A validade e retenção do cache
continuam sendo regidas pelas configurações existentes.

Foram mantidos os caminhos curtos e compatíveis em `%TEMP%`:

```text
sirel-office-profile-XXXXXX/      perfil + metadados
sirel-office-text-XXXXXX/         saída + metadados + internal-temp/
```

`TEMP`, `TMP` e `TMPDIR` do subprocesso apontam para `internal-temp` do próprio job.
Isso inclui os temporários internos do LibreOffice e da compilação do supervisor.
O documento original não é copiado nem modificado. Não houve migração do acervo,
alteração de interface, autenticação, permissões ou endpoints.

Antes, uma extração criava **2 diretórios** de primeiro nível e um preview criava
**1 perfil** (além do cache persistente). Agora ambos criam **2 diretórios** de
primeiro nível e deixam **0** após conclusão normal, erro ou timeout confirmado.
O PDF de cache é um resultado útil e permanece conforme sua retenção, não é órfão.

`office-temp.ts` valida nome exato de `mkdtemp` (prefixo e seis caracteres
alfanuméricos), pai absoluto, tipo e caminho real. Não percorre junctions/symlinks
para calcular tamanho nem aceita exclusão de um caminho fora da raiz esperada.
`fs.rm` faz até três retries adicionais com backoff de 200, 400 e 600 ms para os
erros transitórios tratados pelo Node. A falha final é registrada e contabilizada;
o marcador `released: true` permite recuperação posterior sem reiniciar o backend.

## Processos e cancelamento

`office-process.ts` usa `office-windows.ts`, um supervisor PowerShell/C# embutido
no JavaScript compilado. Não requer copiar um `.ps1`, instalar pacote npm nativo
ou encerrar processos por nome.

Em Windows 10/11, `PROC_THREAD_ATTRIBUTE_JOB_LIST` associa o processo a um Job
Object **na criação**, sem intervalo de execução fora do controle. Filhos e netos
herdam o job; `KILL_ON_JOB_CLOSE` impede sobreviventes se o supervisor cair.
Um handle aberto do processo Node detecta a queda do backend sem confundir PIDs
reutilizados. O supervisor aguarda `ActiveProcesses == 0`, inclusive se o lançador
sair antes do filho. Timeout/cancelamento pedem `TerminateJobObject` somente nesse
job. Não existe `taskkill /IM`, nem encerramento global de LibreOffice.

O timeout inclui a inicialização do supervisor. O backend aguarda o fechamento do
supervisor antes do cleanup. Se ele não responder ao cancelamento por 10 segundos,
há encerramento forçado; o erro `TERMINATION_UNCONFIRMED` conserva os diretórios
para recuperação segura, em vez de alegar que a árvore foi confirmada como vazia.
Esse caso excepcional exige observar os logs e verificar o ambiente/permissões.

No shutdown normal (`SIGINT`/`SIGTERM`), novos jobs são rejeitados, ativos são
cancelados, a fila é rejeitada e o backend aguarda o cleanup antes de sair.
Queda abrupta/Windows reiniciado pode impedir o `finally`: a recuperação posterior
é responsabilidade do GC. Não se promete execução de JavaScript após queda de energia.

Previews compartilhados **concluem e alimentam o cache** se uma página, conexão ou
proxy desconectar, dentro do mesmo timeout. Não são cancelados pelo primeiro cliente
que sair, pois outros podem esperar pelo mesmo resultado. HTTP não abre um stream
quando a resposta já foi destruída. O helper aceita `AbortSignal` para cancelamento
explícito e para o shutdown, inclusive durante a espera na fila.

A alternativa POSIX usa um grupo de processos; a validação de produção desta
correção é Windows. PowerShell 5.1, CIM e `Add-Type` precisam estar disponíveis
para a conta do serviço (ambientes com Constrained Language/AppLocker devem validar
essa execução). O supervisor evita qualquer janela visível.

Referências de implementação: [Job Objects da Microsoft](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects),
[associação atômica no Windows 10](https://devblogs.microsoft.com/oldnewthing/20230209-00/?p=107812)
e [eventos/processos do Node](https://nodejs.org/api/child_process.html).

## Recuperação e limites

O GC inicia junto do runtime do backend, mesmo se a raiz do acervo estiver
indisponível, e roda a cada **60 minutos**, com timer `unref()` e sem sobreposição
na mesma instância. Ele considera somente os dois padrões acima com idade superior
a **2 horas** (mtime e criação). O timeout configurável é no máximo 10 minutos;
duas horas deixam margem para inicialização, shutdown e recuperação do Windows.

Diretórios com proprietário vivo e ainda não liberados são preservados. Metadados
inválidos são preservados. Para compatibilidade com resíduos antigos sem marcador,
qualquer LibreOffice ativo adia **toda** a coleta. Falha ao inspecionar processos
também adia a remoção. Um PID reutilizado pode adiar a coleta conservadoramente.
A idade sozinha nunca autoriza excluir dados associados a proprietário ativo.
Os logs registram encontrados, elegíveis, removidos, ignorados, falhas e bytes.
O cálculo de tamanho cede ao event loop entre diretórios.

| Configuração | Padrão | Faixa/comportamento |
| --- | --- | --- |
| `ARQUIVOS_OFFICE_CONCURRENCY` | 2 | 1–8, fila compartilhada por processo backend |
| `ARQUIVOS_OFFICE_PREVIEW_TIMEOUT_SECONDS` | 90 s | 10–600 s |
| `ARQUIVOS_CONTENT_INDEX_TIMEOUT_SECONDS` | 90 s | 10–600 s, existente |
| `ARQUIVOS_PREVIEW_MAX_MB` | 250 MiB | existente, preservado |
| `ARQUIVOS_CONTENT_INDEX_MAX_MB` | 50 MiB | existente, também limita leitura de texto gerado |
| `ARQUIVOS_CONTENT_INDEX_MAX_CHARS` | 1.000.000 | existente, preservado |

Não foi imposto novo teto de tamanho de PDF/temporários sem dados representativos
dos documentos legítimos. Timeout, fila limitada e remoção imediata evitam acúmulo
entre jobs. Expansões extremas de um único documento ainda exigem capacidade de
disco adequada durante a operação. Os logs de bytes removidos ajudam a identificá-las.

Métricas exportadas internamente por `office-temp.ts`: `officeActiveJobs`,
`officeQueuedJobs`, `officeConversionsTotal`, `officeConversionsFailed`,
`officeConversionTimeouts`, `officeCleanupFailures`, `officeTempBytesRemoved`.
Logs usam ID de job, PID, códigos, duração e basenames aleatórios dos temporários;
não incluem texto, nomes ou caminhos dos documentos nem stderr do LibreOffice.

## Limpeza administrativa e validação em produção

Executar com a mesma conta e o mesmo `%TEMP%` do serviço:

```powershell
# Somente inventário; não exclui arquivos.
npm run office:cleanup --workspace server

# Depois de revisar o inventário; revalida processos, idade e propriedade.
npm run office:cleanup --workspace server -- --apply
```

`--apply` informa o inventário antes da exclusão. Não há limpeza genérica do TEMP,
nem encerramento automático de processos legados desconhecidos. Se houver LO ativo
ou proprietário vivo, os resíduos são preservados; aguarde o encerramento normal
ou investigue a operação correspondente. Não matar todos os processos por nome.

1. Aplicar o build e reiniciar o backend pelo procedimento operacional habitual.
2. Abrir DOCX, XLSX e PPTX e verificar PDFs; indexar um DOCX e localizar seu texto.
3. Repetir em várias abas e fechar uma durante a conversão. Verificar logs de
   conclusão/cleanup, zero jobs ativos ao final e ausência de novos órfãos.
4. Conferir a coleta inicial e horária; processos ativos devem adiar a coleta.
5. Em homologação, executar a suíte real/estresse abaixo e conferir seu JSON.
6. Revisar resíduos antigos com o comando de simulação antes de usar `--apply`.

```powershell
npm run check
npm run build
npm run test:all
$env:OFFICE_INTEGRATION='1'
$env:OFFICE_STRESS_COUNT='50'
$env:OFFICE_STRESS_REPORT=(Join-Path (Get-Location) 'output/office-stress-result.json')
npm run test --workspace server -- src/tests/office-integration.test.ts src/tests/office-process.integration.test.ts
Remove-Item Env:OFFICE_INTEGRATION, Env:OFFICE_STRESS_COUNT, Env:OFFICE_STRESS_REPORT
```

Os testes usam documentos sintéticos versionados. A suíte normal não exige
LibreOffice; os testes reais são opt-in. Executar a suíte real em homologação sem
outras operações LibreOffice, pois a verificação final de processos é global.
Os testes não excluem resíduos antigos de produção: a coleta destrutiva é testada
em diretórios exclusivos de teste, e a medição de TEMP do estresse é somente leitura.

## Resultados da execução

Validação em 11/09/2026 no Windows, Node **v24.14.0** e LibreOffice **26.2.5.2**:

| Verificação | Resultado |
| --- | --- |
| `npm run check` | shared, servidor e frontend aprovados |
| `npm run build` | aprovado; aviso de chunks grandes do Vite, sem erro |
| Suíte geral do servidor | 157 testes aprovados |
| Suíte geral do frontend | 105 testes aprovados |
| Ciclo de vida/GC, incluído na suíte do servidor | 26 testes aprovados |
| Integração real opt-in | 16 testes aprovados |
| Stress real final | 50 operações em 188,8 s, duas simultâneas |
| Simulação administrativa final | 0 resíduos encontrados; nenhuma exclusão |

A execução geral pulou 32 testes opt-in; 16 deles são os novos testes Office,
executados separadamente com sucesso. Os outros 16 dependem de integrações externas
já existentes e não foram executados. Não se afirma cobertura de todos os cenários
de produção nem de documentos de tamanho máximo a partir de fixtures pequenas.

Cobertura: previews DOCX/XLSX/PPTX, texto DOCX, documento corrompido, erro de
subprocesso, timeout, cancelamento ativo/em fila, desconexão HTTP, duas/dez
conversões reais concorrentes, 2/5/10/100 jobs simulados, shutdown com 1.000 pedidos,
falha na segunda alocação, falha de cleanup, marcador para recuperação, diretório
antigo/recente/ativo, proprietário morto, metadados inválidos, inspeção de processos
indisponível, arquivos de outros programas e junctions. No Windows foram testados
queda abrupta do processo proprietário, descendente independente do lançador,
quoting de argumentos e um bloqueio real de compartilhamento de arquivo.

Houve duas rodadas reais de 50 operações; ambas terminaram sem crescimento Office.
Na primeira execução, uma expectativa do teste de descendente órfão falhou porque
o próprio Node encerrava o filho não destacado. A fixture passou a criar um filho
destacado nesse cenário, mantendo-o no Job Object externo. O reteste específico e
a suíte real final passaram sem rejeições não tratadas.

Medição da rodada final, também em [JSON versionado](office-stress-result.json):

| Medida | Antes | Depois |
| --- | ---: | ---: |
| Diretórios `sirel-office-profile/text-*` | 0 | 0 |
| Bytes desses diretórios | 0 | 0 |
| Bytes legíveis contabilizados no `%TEMP%` geral | 881.096.997 | 881.125.666 |
| Entradas não mensuráveis do TEMP geral | 2 | 2 |

A variação global foi **+28.669 bytes** (aproximadamente 28 KiB), sem aumento Office.
Outros aplicativos utilizavam TEMP simultaneamente; duas entradas não puderam ser
mensuradas. Esses totais são a soma dos itens legíveis, não uma medição completa de
todo o volume, e não permitem atribuir a variação a um aplicativo específico.
Ao final havia **zero** `soffice.exe`, `soffice.com` ou `soffice.bin`.

As métricas da suíte real final registraram 68 jobs Office (incluindo os 50 do
estresse), 48.366.435 bytes removidos e zero falhas de cleanup. A falha de conversão
e os dois timeouts registrados foram provocados pelos testes negativos. Em cada
lote do estresse os diretórios Office retornaram ao inventário inicial vazio.
Os testes de exclusão afetaram somente diretórios sintéticos exclusivos. Nenhum
resíduo antigo de produção foi apagado; nessa etapa não foi solicitado reinício
manual do backend. A inspeção operacional posterior confirmou que o watcher ativo
já havia recarregado as alterações nesta mesma pasta. A publicação autorizada e a
validação do ambiente público estão no [registro de publicação](office-publicacao-2026-09-11.md).

## Arquivos alterados

- Backend: `office.ts`, `office-process.ts`, `office-windows.ts`, `office-temp.ts`,
  `content.ts`, `preview.ts`, `runtime.ts`, `http.ts`, `config.ts` em
  `server/src/modules/arquivos/`; integração de shutdown em `server/src/index.ts`.
- Operação: `server/src/scripts/cleanup-office-temp.ts`, `server/package.json`,
  `.env.example`, este relatório e referência no README.
- Testes: `office-lifecycle.test.ts`, `office-integration.test.ts`,
  `office-process.integration.test.ts` e fixtures em `server/src/tests/fixtures/office/`.

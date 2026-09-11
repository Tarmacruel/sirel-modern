# Publicação da correção Office — 11/09/2026

O operador autorizou concluir as pendências da correção e publicar no Git e no
ambiente de produção existente. A base anterior é `69a23ee`, na branch
`fase-2-seguranca-evolucoes`, do repositório `Tarmacruel/sirel-modern`.

## Ambiente identificado

O ambiente público usa esta pasta do repositório. O backend roda em `3030` com
`tsx watch`; o frontend em `5173` com Vite; o Cloudflare Tunnel encaminha os hosts
institucionais para esse ambiente. A conta Windows proprietária do backend é a
mesma conta em que os testes nativos de PowerShell/C#/LibreOffice passaram.

Os logs confirmaram a recarga automática do backend com o novo resolvedor
`soffice.com` e a coleta Office na inicialização. A implantação preserva o modelo
operacional existente, conforme `docs/FOLGAS_OPERACAO.md`. O build compilado também
é gerado e validado. Esta entrega não migra o serviço para outra arquitetura.

Não é necessário executar migrations, seed, reset, modificar documentos do acervo
ou alterar o Tunnel/DNS para aplicar esta correção.

## Pendências resolvidas antes da publicação

A auditoria de dependências prevista pelo projeto encontrou seis pacotes afetados,
incluindo achados altos em produção. Foram atualizados:

| Dependência | Versão corrigida |
| --- | --- |
| `multer` | 2.3.0 |
| `nodemailer` | 9.1.1 |
| `fflate` (transitiva) | 0.8.3 |
| `vitest`, `@vitest/ui` e componentes correspondentes | 4.1.11 |

As versões foram mantidas nas linhas compatíveis disponíveis; o lockfile registra
as resoluções. `npm audit` e `npm audit --omit=dev` passaram a retornar **zero
vulnerabilidades**. Não foi utilizado `npm audit fix --force`.

Referências: [correção do Vitest](https://github.com/advisories/GHSA-82fw-gwwq-j7x9),
[vazamento em uploads abortados do Multer](https://github.com/advisories/GHSA-qfvm-cv95-jqjf)
e [correção do Nodemailer](https://github.com/advisories/GHSA-8m3c-c648-2xjj).

Após a atualização, `npm run check` e as suítes gerais passaram novamente:
**157 testes do servidor e 105 do frontend**, agora com Vitest 4.1.11.
O relatório de [ciclo de vida](office-temp-lifecycle.md) contém o resultado de
50 conversões reais, sem resíduos Office, e os limites da medição de TEMP.

O build completo passou após as atualizações. A suíte real foi repetida com
Vitest 4.1.11: **15 testes passaram**; apenas o estresse opt-in, já executado com
sucesso na etapa anterior, não foi repetido nesta rodada.

## Verificação do ambiente público

Em 11/09/2026, as chamadas públicas a `/api/trpc/health.ping` em
`www.sirel.com.br`, `arquivos.sirel.com.br` e `licitacao.sirel.com.br` retornaram
HTTP **200** e `ok: true`. `/healthz` local também retornou 200; o preview público
sem ticket foi recusado com **401**, como esperado.

Os logs registraram a recarga automática após a atualização das dependências às
09:12:55. Na conferência das 16:40, o mesmo backend atualizado continuava saudável
e processava a indexação real com os novos marcadores de propriedade. Os blocos
recentes de cleanup registraram remoções de aproximadamente 714 KB por job, com
`failures: 0`. As pastas observadas pertenciam aos jobs ativos desse backend.

Não foi forçado outro reinício durante a indexação: a versão já estava carregada
pelo watcher. A implantação foi confirmada pelo processo ativo, pelos logs do novo
helper e pelas respostas públicas. Nenhuma limpeza de diretório ativo foi feita.

## Rollback

Em caso de regressão atribuível à entrega, reverter o commit desta correção na
mesma branch, instalar as dependências do lockfile resultante, reconstruir e
recarregar o backend pelo mesmo mecanismo operacional. Validar `/healthz`,
`/api/trpc/health.ping` e a recusa de preview sem ticket. O rollback de código não
exige rollback de banco. A versão anterior volta a apresentar as falhas Office e
as dependências vulneráveis identificadas; manter essa reversão apenas pelo tempo
necessário para recuperar o serviço.

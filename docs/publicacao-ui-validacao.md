# Publicação da licitação — revisão de interface

## Mudança

A Publicação usa o mesmo workspace da Preparação, com três abas:

- **Documentos:** lista completa dos comprovantes aplicáveis, filtros e um editor por vez. Anexos concluídos e tratamentos excepcionais seguem o padrão aprovado.
- **Cronograma:** data da publicação, cálculo existente de prazos e datas manuais visíveis nos processos fora do fluxo.
- **Canais e dados:** links públicos, condutor, status, fundamento da inexigibilidade quando aplicável e observações. O status da integração com o Portal da Transparência fica recolhido.

Cabeçalho e navegação de etapas ficam compactos. Dossiê, documentos, histórico e auditoria continuam em “Mais ações”. A fase passa a ocupar a largura disponível, com uma única área de ações para salvar o cronograma, publicar e abrir a próxima etapa. As regras e bloqueios continuam definidos pelo servidor.

A atualização dos documentos preserva datas, links e outros campos editados ainda não salvos. Campos sem edição local recebem os valores atualizados do servidor. O carregamento de outro processo reinicia essa comparação. Essa preservação não equivale a salvamento automático.

## Validação

- Verificação de tipos e build completo aprovados; permanece o aviso existente de bundles grandes.
- Suíte completa antes da publicação: 157 testes do servidor e 108 do frontend aprovados; 32 testes opt-in do servidor não executados.
- Smoke da Preparação aprovado após a extração do componente compartilhado.
- Smoke da Publicação usa Microsoft Edge, 1440 × 1000 e 390 × 844, com tema escuro e dados fictícios.
- O roteiro verifica filtros, documento concluído, navegação por teclado, preservação de arquivo e título entre abas, retorno e foco no celular, ausência de transbordamento horizontal, uploads, salvamento do cronograma, payload da publicação e avanço permitido pelo avaliador de fluxo real.
- Há cenários de cronograma automático e campos condicionais da inexigibilidade.

Todos os acessos à API e todas as gravações do smoke são interceptados no navegador. O teste não consulta nem altera processos reais. Não há migrações ou mudanças de backend.

```powershell
node --import tsx scripts/testing/publication-ui-smoke.mjs
node --import tsx scripts/testing/preparation-ui-smoke.mjs
```

Capturas e resultados ficam em `output/playwright/publication-ui/` e `output/playwright/preparation-ui/`, ignorados pelo Git.

## Publicação no ambiente público — 15/09/2026

O ambiente público continua usando esta pasta, com Vite em `5173`, backend em `3030` e o Tunnel existente. A nova interface foi confirmada em `https://www.sirel.com.br` pelo roteiro completo abaixo, usando os arquivos efetivamente servidos pelo domínio e interceptando todas as APIs com dados fictícios:

```powershell
node --import tsx scripts/testing/publication-ui-smoke.mjs --published
```

O teste passou sem erros de execução ou acessos não interceptados à API. As capturas ficam em `output/playwright/publication-ui-published/`. A telemetria injetada pelo Cloudflare é bloqueada durante essa verificação. `npm audit` e `npm audit --omit=dev` retornaram zero vulnerabilidades.

Na conferência inicial, o backend estava sem escutar em `3030`, e os logs registravam encerramento por esgotamento do heap. O watcher existente recebeu uma recarga sem alteração de código do servidor; os registros locais de PID foram atualizados. Após a recuperação, `/healthz` local e `/api/trpc/health.ping` em `www.sirel.com.br` e `licitacao.sirel.com.br` retornaram HTTP 200 e `ok: true`. Essa recuperação não representa uma correção da causa do consumo de memória, que não foi investigada nesta entrega de interface.

O serviço conserva sua configuração operacional. Não foi executado o inicializador que pode disparar migrations e seed; não houve reset ou mudança de DNS/Tunnel. Para reverter a interface, reverter o commit desta entrega na mesma branch e reconstruir, sem rollback de banco.

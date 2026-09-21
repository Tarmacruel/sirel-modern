# Fases finais da Licitação

## Direção visual

Todas as fases usam o cabeçalho compacto, o seletor de etapas recolhido e a área de trabalho aprovada em Preparação. Documentos ficam em lista e detalhe, com filtros; operações ficam em abas. A ação de avanço aparece no rodapé da etapa.

- **Julgamento:** documentos e classificação por item; edição de posição, situação e justificativa. Contratação direta mantém o cadastro de licitantes.
- **Recursos:** documentos e decisões; criação e revisão do mesmo recurso, filtros de pendentes/decididos e paginação. Revisar envia `recursoId`, sem criar outro registro.
- **Controle Interno:** documentos de encaminhamento e avanço para homologação.
- **Homologação:** documentos finais, resumo do resultado e formulário com data/status. A homologação registrada libera a navegação para Fechamento.
- **Fechamento:** resumo, histórico paginado e auditoria em processos fora do fluxo. A conferência para Contratos distingue carregamento, erro, pendências e encaminhamento já realizado.

Requisitos, modalidade, inversão de fases e bloqueios continuam definidos pelo avaliador do servidor. A revisão de etapas anteriores não altera a etapa atual do processo. Atualizações invalidam também a consulta das pendências para Contratos.

Foram concluídos os ajustes locais associados: persistência da justificativa de auditoria no processo e correção da digitação progressiva de valores monetários. O endpoint de revisão de recurso confere se o registro pertence à licitação informada.

## Verificação reproduzível

```powershell
npm run build
npm run test:all
node --import tsx scripts/testing/preparation-ui-smoke.mjs
node --import tsx scripts/testing/publication-ui-smoke.mjs
node --import tsx scripts/testing/dispute-ui-smoke.mjs
node --import tsx scripts/testing/qualification-ui-smoke.mjs
node --import tsx scripts/testing/judgment-ui-smoke.mjs
node --import tsx scripts/testing/final-phases-ui-smoke.mjs
node --import tsx scripts/testing/final-phases-ui-smoke.mjs --published
node --import tsx scripts/testing/judgment-ui-smoke.mjs --published
```

Os testes de navegador carregam a interface real e interceptam **todas** as APIs com dados sintéticos. Usam o avaliador real de fases para simular bloqueios. Mesmo com `--published`, não alteram registros reais, não enviam documentos reais e não encaminham processos reais.

Cobertura das etapas finais: criar/revisar recurso, cancelar sem gravação, manter formulário após erro da API, anexar documentos obrigatórios, preservar a prévia de leitura das atas, homologar, revisar etapas concluídas, confirmar/cancelar encaminhamento, exigir justificativa no fluxo de liberação com pendências, recuperar erro na consulta de pendências e operar em 390 px sem transbordamento da página. Tabelas extensas permitem rolagem interna.

Imagens, árvores de acessibilidade e resultados ficam em `output/playwright/final-phases-ui[-published]` e `output/playwright/judgment-ui[-published]`. A pasta de artefatos não integra o Git.

## Ambiente publicado

O domínio existente serve o frontend e a API desta instalação local pelo túnel já configurado. Esta entrega preserva a infraestrutura e não executa migrações nem rotinas de carga de dados.

Durante a entrega foi encontrada outra parada anterior da API por esgotamento do heap do Node. O serviço foi restabelecido pelo observador existente e os endpoints de saúde foram conferidos. A causa do crescimento de memória não foi corrigida nesta refatoração visual; permanece uma limitação operacional a investigar.

Os testes automatizados do servidor que dependem de infraestrutura externa permanecem ignorados conforme a configuração existente. O build mantém o aviso conhecido de bundles acima de 500 kB.

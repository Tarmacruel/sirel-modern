# Preparação da licitação — revisão de interface

## Mudança

A preparação agora é um espaço de trabalho por objeto: Documentos, Itens, Responsáveis e Configuração. A lista mostra todos os documentos, com filtros por situação e um único editor. O progresso usa a conclusão calculada pelo servidor; um documento aguardado de outro setor continua pendente.

O cabeçalho e a navegação de etapas ficaram compactos. Resumos, alertas laterais e a fila parcial duplicados foram retirados da preparação. O objeto da contratação permanece visível; textos extensos podem ser expandidos. Dossiê, acervo completo, histórico e auditoria continuam em “Mais ações”.

Documentos pendentes apresentam seleção de arquivo e salvamento. Título, descrição e tratamentos excepcionais são acessados sob demanda. Documentos concluídos mostram o anexo; novo upload e remoção ficam recolhidos. A seleção de arquivo é preservada por categoria e entre abas, e o envio informa andamento e bloqueia repetição.

No celular, a lista dá lugar ao documento selecionado, com retorno explícito e recuperação do foco. Informações complementares do cabeçalho ficam recolhidas. As outras fases mantêm seus requisitos e bloqueios.

## Validação

- `npm run check`: passou.
- `npm run build`: passou; permanece o aviso existente sobre bundles grandes.
- `npm run test --workspace client`: 105 testes passaram.
- Os 9 testes de cabeçalho, etapas e workspace foram repetidos após os refinamentos e passaram.
- Browser real Microsoft Edge, desktop 1440 × 1000 e celular 390 × 844: filtros, etapas bloqueadas, abas por teclado, documento concluído, arquivo e título preservados, retorno/foco no celular, upload com categoria correta, atualização do progresso e redirecionamento de fase indisponível passaram. Auditoria fecha com Escape na primeira tecla.
- Nenhum erro de execução no browser, nenhum acesso externo durante o teste e nenhum transbordamento horizontal da página no celular.

O teste de navegador usa a página e o avaliador de fluxo reais, com dados fictícios e todas as APIs interceptadas localmente. Não lê nem altera o processo 2567 de produção. As mudanças desta entrega são de frontend; não há migração ou alteração de dados.

Para repetir, na raiz do projeto com dependências instaladas e Microsoft Edge disponível:

```powershell
npm run build --workspace shared
node --import tsx scripts/testing/preparation-ui-smoke.mjs
```

Capturas e resultado ficam em `output/playwright/preparation-ui/` (ignorado pelo Git). As correções de segurança preparadas em outro worktree não fazem parte desta entrega.

Após aplicar a interface, `node --import tsx scripts/testing/preparation-ui-smoke.mjs --published` confere os arquivos servidos por `www.sirel.com.br`, mantendo todas as APIs interceptadas com dados fictícios. Esse modo não envia o upload de teste ao servidor. Seus artefatos ficam em `output/playwright/preparation-ui-published/`.

# Validação do SIREL Folgas

## Testes automatizados

Na raiz da cópia em validação:

```powershell
npm run test --workspace server -- src/modules/folgas/rules.test.ts
npm run test --workspace client -- src/lib/folgas-host.test.ts
node scripts/test-folgas-integration.mjs
npm run check
npm run test:all
npm run build
```

Para integração, `DATABASE_URL` identifica o banco operacional e `TEST_DATABASE_URL` deve apontar para outro banco PostgreSQL, com o schema completo aplicado. Configure as URLs por ambiente privado; não as coloque em documentação ou histórico de comandos. O runner exige ambas e habilita o guard existente de isolamento. A suíte usa HTTP tRPC, `auth.login`, cookies reais e CSRF, cria identidades sintéticas e remove seus próprios registros ao final. Nunca execute em banco operacional.

Sem a habilitação explícita de integração, `npm run test:all` pula os testes dependentes de PostgreSQL. Isso não substitui a execução separada acima.

Cobertura: exemplos obrigatórios de 4 dias, virada de ano, feriados nas duas bordas, datas inválidas/duplicadas, limites, não participante, ausência de sessão, CSRF, acesso a todas as procedures administrativas, admin para pessoa sem conta, fechamento, impacto/rollback, auditoria e duas sessões simultâneas. A concorrência deve terminar com exatamente uma linha para a data; há também tentativa de INSERT duplicado diretamente no PostgreSQL.

## Navegadores reais na cópia isolada

Os scripts `scripts/testing/folgas-fixtures.mts` e `scripts/testing/folgas-browser-smoke.mjs` reproduzem o roteiro local usado nesta máquina. As fixtures recusam escrita fora do banco `sirel_folgas_validation_20260908`. Esse banco contém somente schema restaurado e dados sintéticos de teste. Não contém a cópia de registros operacionais.

Use a cópia de validação com API 3031, Vite 5174, `CLIENT_URL=http://localhost:5174,http://folgas.localhost:5174`, `VITE_FOLGAS_HOSTNAMES=folgas.sirel.com.br,folgas.localhost`, `SIREL_WEB_PORT=5174` e `SIREL_API_ORIGIN=http://127.0.0.1:3031`. A `.env` dessa cópia deve apontar ao banco isolado. Aguarde API/Vite ficarem disponíveis antes de iniciar.

```powershell
node node_modules/tsx/dist/cli.mjs scripts/testing/folgas-fixtures.mts
node scripts/testing/folgas-browser-smoke.mjs chrome
node node_modules/tsx/dist/cli.mjs scripts/testing/folgas-fixtures.mts
node scripts/testing/folgas-browser-smoke.mjs msedge
```

Executar sequencialmente: a preparação troca senhas sintéticas e arquiva as campanhas antigas de smoke. Os arquivos em `output/playwright` são locais e ignorados pelo Git; `fixtures.json` contém credenciais temporárias e não deve ser compartilhado. Os navegadores usam perfis isolados, sem alterar o perfil do operador.

Verificar e inspecionar capturas: desktop claro/escuro, viewport móvel 390×844 com toque, concorrência de duas sessões, entrada principal, admin/gestor, não participante, abertura/fechamento e criação/inclusão de pessoa canônica. O operador dispensou o celular real fora da LAN e aceitou emulação no navegador. Isso não dispensa validar o HTTPS público via Tunnel.

## Gate externo e abertura

Após liberar a versão candidata, confirmar HTTPS de `folgas.sirel.com.br`, carregamento de assets, login existente e chamadas `/api` pelo proxy, sem expor backend ou banco. Confirmar também a raiz de `www.sirel.com.br` e deep links. A campanha deve permanecer RASCUNHO/FECHADA durante a validação. Abrir somente após revisão de participantes e calendário e conclusão dos gates.

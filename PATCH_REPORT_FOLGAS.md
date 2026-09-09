# PATCH REPORT — SIREL Folgas publicado em RASCUNHO

Relatório PDF: layout aprovado e implementado. Botão **Baixar relatório PDF** para admin/gestor, com dados confirmados da campanha, nomes, indicadores, paginação e emissão local. Exportação protegida por sessão/CSRF, sem persistência pública. Testes: renderizador 2; integração 7; Chrome 13 e Edge 13 cenários incluindo download. Sem nova migration ou alteração de campanha/reservas. Detalhes e evidências na seção de PDF do relatório de implementação.

Atualização 09/09/2026: operador aprovou a leva e seu envio ao GitHub, branch `fase-2-seguranca-evolucoes`. O site e a rota administrativa seguem HTTP 200. Estado atual: RASCUNHO, 15 participantes ativos, 2 reservas e 8 dias não úteis, após operações autenticadas do admin. Essas operações foram preservadas. As contagens abaixo são o registro histórico da primeira publicação. Não houve nova alteração de código nem abertura da campanha pelo agente nesta leva.

08/09/2026 — código operacional f9c745882bb142948cdf9e9f026060f08133a3d2, branch fase-2-seguranca-evolucoes.

- RESOLVIDO: quatro âncoras MANUAL do instalador, sem substituir App.tsx ou autenticação.
- RESOLVIDO: schema/journal/migration 0062, backup, lock, transação, UNIQUE, auditoria e proteção administrativa.
- IMPLEMENTADO: admin pesquisa, cria e inclui pessoas pelo próprio site; nenhum participante foi pré-carregado.
- APROVADO: check, test:all e build na raiz operacional; 6 integrações do código publicado contra PostgreSQL separado. Regras 11, host 2, Chrome 12 e Edge 12 aprovados na validação.
- PUBLICADO: https://folgas.sirel.com.br e /folgas/admin com HTTP 200; assets 200, API protegida 401 sem sessão e preflight de login 204. www permanece 200. Tunnel existente preservado.
- AUTORIZAÇÃO: operador liberou explicitamente o painel em RASCUNHO antes do cadastro de participantes.
- STATUS: campanha ID 1 em RASCUNHO, publicada sem pré-carga. Agora contém 15 participantes incluídos por ações autenticadas de admin e zero reservas; inclusões posteriores preservadas.
- PENDENTE ANTES DE ABRIR: observação direta de login no subdomínio e revisão final de participantes/calendário. A auditoria já comprova uso administrativo autenticado no sistema publicado. Esses gates não são declarados concluídos.

Detalhes, evidências e rollback em FOLGAS_IMPLEMENTATION_REPORT.md.

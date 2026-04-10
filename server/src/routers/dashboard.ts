import { and, count, desc, eq, gte, inArray, isNull, lte, or, sql, sum } from "drizzle-orm";
import { z } from "zod";

import { requireDb } from "../db/client.js";
import {
  contratos,
  modalidades,
  movimentacoesWorkflow,
  notificacoesUsuario,
  pessoas,
  processos,
  prazosProcessuais,
  secretarias,
  users,
  workflowProcesso,
} from "../db/schema.js";
import { syncOperationalNotifications } from "../lib/notificacoes.js";
import { protectedProcedure, router } from "../trpc.js";

function formatDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function resolveTourRoleTemplate(role: string) {
  if (role === "admin" || role === "auditor") return "admin-auditor";
  if (role === "gestor") return "gestor";
  if (role === "operador") return "operador";
  return "user";
}

function buildContinueHref(processoId: number, moduloAtual: string | null) {
  if (moduloAtual === "LICITACAO") {
    return `/licitacao/${processoId}`;
  }
  return `/processos/${processoId}`;
}

function buildRecommendedActions(role: string, counts: {
  prazosHoje: number;
  prazosAtrasados: number;
  proximas24h: number;
  notificacoesNaoLidas: number;
  contratosAtivos: number;
  processosAtivos: number;
}) {
  if (role === "operador") {
    return [
      {
        id: "novo-processo",
        label: "Iniciar novo processo",
        description: "Abrir a base do processo e começar o fluxo regular com contexto operacional imediato.",
        href: "/processos",
        iconKey: "processos",
        tone: "accent",
        badge: null,
      },
      {
        id: "prazos-operador",
        label: "Atacar prazos críticos",
        description: "Ir direto para a fila do dia e reduzir risco de atraso em etapas já abertas.",
        href: "/prazos",
        iconKey: "prazos",
        tone: counts.prazosAtrasados > 0 ? "danger" : "warning",
        badge: counts.prazosAtrasados > 0 ? `${counts.prazosAtrasados} em atraso` : `${counts.prazosHoje} hoje`,
      },
      {
        id: "compras-operador",
        label: "Consolidar compras",
        description: "Entrar na fila de cotações, mapas comparativos e fechamento documental.",
        href: "/compras",
        iconKey: "compras",
        tone: "default",
        badge: `${counts.processosAtivos} ativos`,
      },
      {
        id: "licitacao-operador",
        label: "Abrir licitação",
        description: "Acompanhar publicações, recursos e a evolução dos processos em disputa.",
        href: "/licitacao",
        iconKey: "licitacao",
        tone: "default",
        badge: `${counts.proximas24h} nas próximas 24h`,
      },
    ];
  }

  if (role === "gestor") {
    return [
      {
        id: "agenda-critica-gestor",
        label: "Revisar agenda crítica",
        description: "Ver a faixa de urgência do dia para orientar priorização e destravar equipes.",
        href: "/prazos",
        iconKey: "prazos",
        tone: counts.prazosAtrasados > 0 ? "danger" : "warning",
        badge: counts.prazosAtrasados > 0 ? `${counts.prazosAtrasados} atrasados` : `${counts.prazosHoje} hoje`,
      },
      {
        id: "contratos-gestor",
        label: "Acompanhar contratos",
        description: "Conferir vigências, contratos ativos e transições da última macrofase.",
        href: "/contratos",
        iconKey: "contratos",
        tone: "default",
        badge: `${counts.contratosAtivos} ativos`,
      },
      {
        id: "relatorios-gestor",
        label: "Ler indicadores",
        description: "Abrir os recortes executivos de volume, prazo e distribuição por área.",
        href: "/relatorios",
        iconKey: "relatorios",
        tone: "accent",
        badge: null,
      },
      {
        id: "processos-gestor",
        label: "Ver processos ativos",
        description: "Retomar a base viva de processos sem perder a visão transversal da operação.",
        href: "/processos",
        iconKey: "processos",
        tone: "default",
        badge: `${counts.processosAtivos} ativos`,
      },
    ];
  }

  if (role === "admin") {
    return [
      {
        id: "usuarios-admin",
        label: "Gerir usuários",
        description: "Entrar na área administrativa de perfis, acesso e segurança básica.",
        href: "/usuarios",
        iconKey: "usuarios",
        tone: "default",
        badge: null,
      },
      {
        id: "parametros-admin",
        label: "Ajustar parâmetros",
        description: "Revisar branding, comportamento e parâmetros institucionais do ambiente.",
        href: "/parametros",
        iconKey: "parametros",
        tone: "accent",
        badge: null,
      },
      {
        id: "importacoes-admin",
        label: "Monitorar importações",
        description: "Acompanhar reconciliações, integrações e consistência da base importada.",
        href: "/importacoes",
        iconKey: "importacoes",
        tone: counts.notificacoesNaoLidas > 0 ? "warning" : "default",
        badge: counts.notificacoesNaoLidas > 0 ? `${counts.notificacoesNaoLidas} alertas` : null,
      },
      {
        id: "auditoria-admin",
        label: "Validar trilhas sensíveis",
        description: "Consultar eventos críticos e movimentos auditáveis da operação.",
        href: "/auditoria",
        iconKey: "auditoria",
        tone: "default",
        badge: null,
      },
    ];
  }

  if (role === "auditor") {
    return [
      {
        id: "auditoria-auditor",
        label: "Abrir auditoria",
        description: "Entrar na trilha de eventos sensíveis, filtros e histórico operacional.",
        href: "/auditoria",
        iconKey: "auditoria",
        tone: "accent",
        badge: null,
      },
      {
        id: "consultas-auditor",
        label: "Consultar base central",
        description: "Localizar processos, números, objetos e fornecedores com rapidez.",
        href: "/consultas",
        iconKey: "consultas",
        tone: "default",
        badge: null,
      },
      {
        id: "dossie-auditor",
        label: "Analisar dossiês",
        description: "Acessar consolidações históricas e vínculos para leitura aprofundada.",
        href: "/dossie",
        iconKey: "dossie",
        tone: "default",
        badge: null,
      },
      {
        id: "notificacoes-auditor",
        label: "Ler notificações",
        description: "Verifique mensagens operacionais pendentes antes de avançar para a trilha.",
        href: "/notificacoes",
        iconKey: "notificacoes",
        tone: counts.notificacoesNaoLidas > 0 ? "warning" : "default",
        badge: counts.notificacoesNaoLidas > 0 ? `${counts.notificacoesNaoLidas} não lidas` : null,
      },
    ];
  }

  return [
    {
      id: "notificacoes-user",
      label: "Ler notificações",
      description: "Abrir a central de mensagens e pendências visíveis para o seu perfil.",
      href: "/notificacoes",
      iconKey: "notificacoes",
      tone: counts.notificacoesNaoLidas > 0 ? "warning" : "default",
      badge: counts.notificacoesNaoLidas > 0 ? `${counts.notificacoesNaoLidas} pendentes` : null,
    },
    {
      id: "consultas-user",
      label: "Pesquisar processos",
      description: "Usar a busca central para localizar processos, editais e objetos relevantes.",
      href: "/consultas",
      iconKey: "consultas",
      tone: "accent",
      badge: null,
    },
    {
      id: "workflow-user",
      label: "Acompanhar workflow",
      description: "Ver a movimentação recente e o módulo atual dos processos em acompanhamento.",
      href: "/workflow",
      iconKey: "workflow",
      tone: "default",
      badge: null,
    },
  ];
}

export const dashboardRouter = router({
  entry: protectedProcedure.query(async ({ ctx }) => {
    const db = requireDb();
    const userId = ctx.user?.id;
    if (!userId) {
      throw new Error("Usuário não autenticado para a entrada do dashboard.");
    }

    await syncOperationalNotifications(userId);

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const today = formatDateString(todayStart);
    const limit24h = formatDateString(addDays(todayStart, 1));

    const [
      userRow,
      prazosHojeRow,
      prazosAtrasadosRow,
      proximas24hRow,
      notificacoesNaoLidasRow,
      contratosAtivosRow,
      processosAtivosRow,
      continueRows,
    ] = await Promise.all([
      db
        .select({
          id: users.id,
          nome: users.name,
          role: users.role,
          secretaria: secretarias.nome,
          lastSignedIn: users.lastSignedIn,
        })
        .from(users)
        .leftJoin(secretarias, eq(secretarias.id, users.secretariaId))
        .where(eq(users.id, userId))
        .limit(1)
        .then((rows) => rows[0] ?? null),
      db
        .select({ total: count() })
        .from(prazosProcessuais)
        .where(and(inArray(prazosProcessuais.status, ["PENDENTE", "EM_ATRASO"]), eq(prazosProcessuais.dataPrevista, today)))
        .then((rows) => rows[0]),
      db
        .select({ total: count() })
        .from(prazosProcessuais)
        .where(and(inArray(prazosProcessuais.status, ["PENDENTE", "EM_ATRASO"]), sql`${prazosProcessuais.dataPrevista} < ${today}`))
        .then((rows) => rows[0]),
      db
        .select({ total: count() })
        .from(prazosProcessuais)
        .where(
          and(
            inArray(prazosProcessuais.status, ["PENDENTE", "EM_ATRASO"]),
            gte(prazosProcessuais.dataPrevista, today),
            lte(prazosProcessuais.dataPrevista, limit24h),
          ),
        )
        .then((rows) => rows[0]),
      db
        .select({ total: count() })
        .from(notificacoesUsuario)
        .where(
          and(
            eq(notificacoesUsuario.userId, userId),
            eq(notificacoesUsuario.lida, false),
            or(isNull(notificacoesUsuario.dataExpiracao), gte(notificacoesUsuario.dataExpiracao, now)),
          ),
        )
        .then((rows) => rows[0]),
      db
        .select({ total: count() })
        .from(contratos)
        .where(eq(contratos.status, "ATIVO"))
        .then((rows) => rows[0]),
      db
        .select({ total: count() })
        .from(processos)
        .where(and(eq(processos.finalizado, false), eq(processos.ativo, true)))
        .then((rows) => rows[0]),
      db
        .select({
          processoId: processos.id,
          numeroSirel: processos.numeroSirel,
          objeto: processos.objeto,
          secretaria: secretarias.nome,
          moduloAtual: workflowProcesso.moduloAtual,
          etapaAtual: workflowProcesso.etapaAtual,
          atualizadoEm: workflowProcesso.atualizadoEm,
        })
        .from(processos)
        .innerJoin(secretarias, eq(secretarias.id, processos.secretariaId))
        .leftJoin(workflowProcesso, eq(workflowProcesso.processoId, processos.id))
        .where(and(eq(processos.finalizado, false), eq(processos.ativo, true)))
        .orderBy(desc(workflowProcesso.atualizadoEm), desc(processos.atualizadoEm), desc(processos.id))
        .limit(4),
    ]);

    if (!userRow) {
      throw new Error("Usuário não localizado para montar a entrada do dashboard.");
    }

    const criticalCounts = {
      prazosHoje: Number(prazosHojeRow?.total ?? 0),
      prazosAtrasados: Number(prazosAtrasadosRow?.total ?? 0),
      proximas24h: Number(proximas24hRow?.total ?? 0),
      notificacoesNaoLidas: Number(notificacoesNaoLidasRow?.total ?? 0),
      contratosAtivos: Number(contratosAtivosRow?.total ?? 0),
      processosAtivos: Number(processosAtivosRow?.total ?? 0),
    };

    return {
      userContext: userRow,
      criticalCounts,
      recommendedActions: buildRecommendedActions(userRow.role, criticalCounts),
      continueItems: continueRows.map((row) => ({
        processoId: row.processoId,
        numeroSirel: row.numeroSirel,
        objeto: row.objeto,
        moduloAtual: row.moduloAtual ?? "SEM_WORKFLOW",
        etapaAtual: row.etapaAtual ?? "Sem etapa detalhada",
        secretaria: row.secretaria,
        href: buildContinueHref(row.processoId, row.moduloAtual),
        atualizadoEm: row.atualizadoEm,
      })),
      tour: {
        version: "entry-2026-04",
        shouldAutoStart: true,
        roleTemplate: resolveTourRoleTemplate(userRow.role),
      },
    };
  }),

  summary: protectedProcedure
    .input(
      z.object({
        ano: z.number().int().min(2000).max(2100).nullable().optional(),
        modalidadeId: z.number().int().optional(),
        condutorId: z.number().int().optional(),
        secretariaId: z.number().int().optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const db = requireDb();
      const userId = ctx.user?.id;
      if (!userId) {
        throw new Error("Usuário não autenticado para o dashboard.");
      }

      await syncOperationalNotifications(userId);

      const now = new Date();
      const filterYear = input?.ano;
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const recentMovementWindow = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const today = formatDateString(todayStart);
      const limit24h = formatDateString(addDays(todayStart, 1));
      const limit48h = formatDateString(addDays(todayStart, 2));

      const processYearFilter = filterYear ? eq(processos.anoReferencia, filterYear) : undefined;
      const condicaoModalidade = input?.modalidadeId ? eq(processos.modalidadeId, input.modalidadeId) : undefined;
      const condicaoCondutor = input?.condutorId ? eq(processos.condutorProcessoId, input?.condutorId) : undefined;
      const condicaoSecretaria = input?.secretariaId ? eq(processos.secretariaId, input.secretariaId) : undefined;
      const processFilter = processYearFilter || condicaoModalidade || condicaoCondutor || condicaoSecretaria
        ? and(
            ...(processYearFilter ? [processYearFilter] : []),
            ...(condicaoModalidade ? [condicaoModalidade] : []),
            ...(condicaoCondutor ? [condicaoCondutor] : []),
            ...(condicaoSecretaria ? [condicaoSecretaria] : []),
          )
        : undefined;

      const [
        processosAtivosRow,
        contratosVigentesRow,
        valorGlobalEstimadoRow,
        prazosHojeRow,
        prazos24hRow,
        prazos48hRow,
        prazosAtrasadosRow,
        tarefasPendentesRow,
        movimentacoesUltimas24hRow,
        porModuloRows,
        processosPorSecretariaRows,
        modalidadesMaisUtilizadasRows,
        evolucaoMensalRows,
        minhaAgendaRows,
        rankingCondutoresRows,
        agendaCriticaRows,
        movimentacoesRecentesRows,
      ] = await Promise.all([
        db
          .select({ total: count() })
          .from(processos)
          .where(and(eq(processos.finalizado, false), ...(processFilter ? [processFilter] : [])))
          .then((rows) => rows[0]),
        db.select({ total: count() }).from(contratos).where(eq(contratos.status, "ATIVO")).then((rows) => rows[0]),
        db
          .select({ total: sum(processos.valorEstimado) })
          .from(processos)
          .where(processFilter)
          .then((rows) => rows[0]),
        db
          .select({ total: count() })
          .from(prazosProcessuais)
          .where(and(inArray(prazosProcessuais.status, ["PENDENTE", "EM_ATRASO"]), eq(prazosProcessuais.dataPrevista, today)))
          .then((rows) => rows[0]),
        db
          .select({ total: count() })
          .from(prazosProcessuais)
          .where(
            and(
              inArray(prazosProcessuais.status, ["PENDENTE", "EM_ATRASO"]),
              gte(prazosProcessuais.dataPrevista, today),
              lte(prazosProcessuais.dataPrevista, limit24h),
            ),
          )
          .then((rows) => rows[0]),
        db
          .select({ total: count() })
          .from(prazosProcessuais)
          .where(
            and(
              inArray(prazosProcessuais.status, ["PENDENTE", "EM_ATRASO"]),
              gte(prazosProcessuais.dataPrevista, formatDateString(addDays(todayStart, 2))),
              lte(prazosProcessuais.dataPrevista, limit48h),
            ),
          )
          .then((rows) => rows[0]),
        db
          .select({ total: count() })
          .from(prazosProcessuais)
          .where(and(inArray(prazosProcessuais.status, ["PENDENTE", "EM_ATRASO"]), sql`${prazosProcessuais.dataPrevista} < ${today}`))
          .then((rows) => rows[0]),
        db
          .select({ total: count() })
          .from(notificacoesUsuario)
          .where(
            and(
              eq(notificacoesUsuario.userId, userId),
              eq(notificacoesUsuario.lida, false),
              or(isNull(notificacoesUsuario.dataExpiracao), gte(notificacoesUsuario.dataExpiracao, now)),
            ),
          )
          .then((rows) => rows[0]),
        db
          .select({ total: count() })
          .from(movimentacoesWorkflow)
          .where(gte(movimentacoesWorkflow.criadoEm, recentMovementWindow))
          .then((rows) => rows[0]),
        db
          .select({ modulo: workflowProcesso.moduloAtual, total: count() })
          .from(workflowProcesso)
          .groupBy(workflowProcesso.moduloAtual),
        db
          .select({ secretariaId: secretarias.id, secretaria: secretarias.nome, total: count() })
          .from(processos)
          .innerJoin(secretarias, eq(secretarias.id, processos.secretariaId))
          .where(and(eq(processos.finalizado, false), ...(processFilter ? [processFilter] : [])))
          .groupBy(secretarias.id, secretarias.nome)
          .orderBy(desc(count()), secretarias.nome)
          .limit(6),
        db
          .select({ modalidadeId: modalidades.id, modalidade: modalidades.nome, total: count() })
          .from(processos)
          .leftJoin(modalidades, eq(modalidades.id, processos.modalidadeId))
          .where(processFilter)
          .groupBy(modalidades.id, modalidades.nome)
          .orderBy(desc(count()), modalidades.nome)
          .limit(6),
        db
          .select({
            referencia: sql<string>`to_char(date_trunc('month', ${processos.criadoEm}), 'YYYY-MM')`,
            mes: sql<string>`to_char(date_trunc('month', ${processos.criadoEm}), 'MM/YYYY')`,
            total: count(),
          })
          .from(processos)
          .where(processFilter)
          .groupBy(sql`date_trunc('month', ${processos.criadoEm})`)
          .orderBy(sql`date_trunc('month', ${processos.criadoEm})`),
        db
          .select({
            id: notificacoesUsuario.id,
            type: notificacoesUsuario.tipo,
            priority: notificacoesUsuario.prioridade,
            title: notificacoesUsuario.titulo,
            message: notificacoesUsuario.mensagem,
            href: notificacoesUsuario.href,
            read: notificacoesUsuario.lida,
            createdAt: notificacoesUsuario.criadoEm,
          })
          .from(notificacoesUsuario)
          .where(
            and(
              eq(notificacoesUsuario.userId, userId),
              eq(notificacoesUsuario.lida, false),
              or(isNull(notificacoesUsuario.dataExpiracao), gte(notificacoesUsuario.dataExpiracao, now)),
            ),
          )
          .orderBy(desc(notificacoesUsuario.prioridade), desc(notificacoesUsuario.atualizadoEm), desc(notificacoesUsuario.id))
          .limit(5),
        db
          .select({
            condutorId: pessoas.id,
            condutor: pessoas.nome,
            total: count(),
          })
          .from(processos)
          .innerJoin(pessoas, eq(pessoas.id, processos.condutorProcessoId))
          .where(processFilter)
          .groupBy(pessoas.id, pessoas.nome)
          .orderBy(desc(count()), pessoas.nome)
          .limit(5),
        db
          .select({
            id: prazosProcessuais.id,
            processoId: processos.id,
            numeroSirel: processos.numeroSirel,
            objeto: processos.objeto,
            titulo: prazosProcessuais.titulo,
            tipo: prazosProcessuais.tipo,
            dataPrevista: prazosProcessuais.dataPrevista,
            status: prazosProcessuais.status,
          })
          .from(prazosProcessuais)
          .innerJoin(processos, eq(processos.id, prazosProcessuais.processoId))
          .where(and(inArray(prazosProcessuais.status, ["PENDENTE", "EM_ATRASO"]), lte(prazosProcessuais.dataPrevista, limit48h)))
          .orderBy(prazosProcessuais.dataPrevista, processos.numeroSirel)
          .limit(8),
        db
          .select({
            id: movimentacoesWorkflow.id,
            processoId: processos.id,
            numeroSirel: processos.numeroSirel,
            descricao: movimentacoesWorkflow.descricao,
            moduloDestino: movimentacoesWorkflow.moduloDestino,
            criadoEm: movimentacoesWorkflow.criadoEm,
          })
          .from(movimentacoesWorkflow)
          .innerJoin(processos, eq(processos.id, movimentacoesWorkflow.processoId))
          .orderBy(desc(movimentacoesWorkflow.criadoEm), desc(movimentacoesWorkflow.id))
          .limit(8),
      ]);

      return {
        processosAtivos: Number(processosAtivosRow?.total ?? 0),
        contratosVigentes: Number(contratosVigentesRow?.total ?? 0),
        valorGlobalEstimado: Number(valorGlobalEstimadoRow?.total ?? 0),
        prazosHoje: Number(prazosHojeRow?.total ?? 0),
        prazos24h: Number(prazos24hRow?.total ?? 0),
        prazos48h: Number(prazos48hRow?.total ?? 0),
        prazosAtrasados: Number(prazosAtrasadosRow?.total ?? 0),
        tarefasPendentesUsuario: Number(tarefasPendentesRow?.total ?? 0),
        movimentacoesUltimas24h: Number(movimentacoesUltimas24hRow?.total ?? 0),
        porModulo: porModuloRows.map((row) => ({ modulo: row.modulo, total: Number(row.total) })),
        processosPorSecretaria: processosPorSecretariaRows.map((row) => ({ secretariaId: row.secretariaId, secretaria: row.secretaria, total: Number(row.total) })),
        modalidadesMaisUtilizadas: modalidadesMaisUtilizadasRows.map((row) => ({ modalidadeId: row.modalidadeId ?? null, modalidade: row.modalidade ?? "Sem modalidade", total: Number(row.total) })),
        evolucaoMensal: evolucaoMensalRows.map((row) => ({ referencia: row.referencia, mes: row.mes, total: Number(row.total) })),
        rankingCondutores: rankingCondutoresRows.map((row) => ({ condutorId: row.condutorId ?? null, condutor: row.condutor, total: Number(row.total) })),
        minhaAgenda: minhaAgendaRows,
        agendaCritica: agendaCriticaRows,
        ultimasMovimentacoes: movimentacoesRecentesRows,
      };
    }),
});

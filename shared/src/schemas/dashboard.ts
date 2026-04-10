import { z } from "zod";

export const dashboardAgendaItemSchema = z.object({
  id: z.number().int().nonnegative(),
  type: z.string(),
  priority: z.string(),
  title: z.string(),
  message: z.string(),
  href: z.string().nullable().optional(),
  read: z.boolean().optional(),
  createdAt: z.date().nullable(),
});

export const dashboardSummarySchema = z.object({
  processosAtivos: z.number().nonnegative(),
  contratosVigentes: z.number().nonnegative(),
  valorGlobalEstimado: z.number().nonnegative(),
  prazosHoje: z.number().nonnegative(),
  prazos24h: z.number().nonnegative(),
  prazos48h: z.number().nonnegative(),
  prazosAtrasados: z.number().nonnegative(),
  tarefasPendentesUsuario: z.number().nonnegative(),
  movimentacoesUltimas24h: z.number().nonnegative(),
  porModulo: z.array(
    z.object({
      modulo: z.string().nullable(),
      total: z.number().nonnegative(),
    }),
  ),
  processosPorSecretaria: z.array(
    z.object({
      secretariaId: z.number().int().nullable(),
      secretaria: z.string(),
      total: z.number().nonnegative(),
    }),
  ),
  modalidadesMaisUtilizadas: z.array(
    z.object({
      modalidadeId: z.number().int().nullable(),
      modalidade: z.string(),
      total: z.number().nonnegative(),
    }),
  ),
  evolucaoMensal: z.array(
    z.object({
      referencia: z.string(),
      mes: z.string(),
      total: z.number().nonnegative(),
    }),
  ),
  rankingCondutores: z.array(
    z.object({
      condutorId: z.number().int().nullable(),
      condutor: z.string(),
      total: z.number().nonnegative(),
    }),
  ),
  minhaAgenda: z.array(dashboardAgendaItemSchema),
  agendaCritica: z.array(
    z.object({
      id: z.number().int().nonnegative(),
      processoId: z.number().int().nonnegative(),
      numeroSirel: z.string(),
      objeto: z.string(),
      titulo: z.string(),
      tipo: z.string(),
      dataPrevista: z.string().nullable(),
      status: z.string(),
    }),
  ),
  ultimasMovimentacoes: z.array(
    z.object({
      id: z.number().int().nonnegative(),
      processoId: z.number().int().nonnegative(),
      numeroSirel: z.string(),
      descricao: z.string(),
      moduloDestino: z.string(),
      criadoEm: z.date().nullable(),
    }),
  ),
});

export const dashboardEntryActionSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string(),
  href: z.string(),
  iconKey: z.string(),
  tone: z.enum(["default", "accent", "warning", "danger", "success"]).default("default"),
  badge: z.string().nullable().optional(),
});

export const dashboardContinueItemSchema = z.object({
  processoId: z.number().int().positive(),
  numeroSirel: z.string(),
  objeto: z.string(),
  moduloAtual: z.string(),
  etapaAtual: z.string(),
  secretaria: z.string(),
  href: z.string(),
  atualizadoEm: z.date().nullable(),
});

export const dashboardEntrySchema = z.object({
  userContext: z.object({
    id: z.number().int().positive(),
    nome: z.string(),
    role: z.string(),
    secretaria: z.string().nullable(),
    lastSignedIn: z.date().nullable(),
  }),
  criticalCounts: z.object({
    prazosHoje: z.number().nonnegative(),
    prazosAtrasados: z.number().nonnegative(),
    proximas24h: z.number().nonnegative(),
    notificacoesNaoLidas: z.number().nonnegative(),
    contratosAtivos: z.number().nonnegative(),
    processosAtivos: z.number().nonnegative(),
  }),
  recommendedActions: z.array(dashboardEntryActionSchema),
  continueItems: z.array(dashboardContinueItemSchema),
  tour: z.object({
    version: z.string(),
    shouldAutoStart: z.boolean(),
    roleTemplate: z.string(),
  }),
});

export type DashboardSummaryDto = z.infer<typeof dashboardSummarySchema>;
export type DashboardEntryDto = z.infer<typeof dashboardEntrySchema>;

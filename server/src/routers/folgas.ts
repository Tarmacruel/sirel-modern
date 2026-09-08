import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import { z } from "zod";

import {
  compareDateOnly,
  isValidDateOnly,
  normalizeDateOnly,
  validateFolgaSelection,
} from "@sirel/shared/folgas-rules";

import type { AppContext } from "../_core/context.js";
import { cadastrosRouter } from "./cadastros.js";
import { requireDb } from "../db/client.js";
import {
  adminProcedure,
  gestorProcedure,
  protectedProcedure,
  router,
} from "../trpc.js";

const dateOnlySchema = z
  .string()
  .refine(isValidDateOnly, "Data inválida. Use AAAA-MM-DD.");
const campaignStatusSchema = z.enum([
  "RASCUNHO",
  "ABERTA",
  "FECHADA",
  "ARQUIVADA",
]);
const nonWorkingTypeSchema = z.enum([
  "FERIADO",
  "PONTO_FACULTATIVO",
  "BLOQUEIO_ADMIN",
]);

const campaignIdInput = z
  .object({ campaignId: z.number().int().positive().optional() })
  .optional();

const campaignSaveSchema = z.object({
  id: z.number().int().positive().optional(),
  calendarioConfirmado: z.boolean().default(false),
  nome: z.string().trim().min(3).max(180),
  ano: z.number().int().min(2020).max(2100),
  dataInicio: dateOnlySchema,
  dataFim: dateOnlySchema,
  selecaoInicio: z.string().datetime({ offset: true }).nullable().optional(),
  selecaoFim: z.string().datetime({ offset: true }).nullable().optional(),
  maxFolgas: z.number().int().min(1).max(20).default(2),
  maxDiasConsecutivos: z.number().int().min(1).max(10).default(3),
  status: campaignStatusSchema.default("RASCUNHO"),
});

const participantSaveSchema = z.object({
  campaignId: z.number().int().positive(),
  userId: z.number().int().positive().optional(),
  pessoaId: z.number().int().positive().optional(),
  ativo: z.boolean(),
  limiteFolgas: z.number().int().min(1).max(20).nullable().optional(),
});

const nonWorkingSaveSchema = z.object({
  id: z.number().int().positive().optional(),
  campaignId: z.number().int().positive(),
  data: dateOnlySchema,
  tipo: nonWorkingTypeSchema,
  descricao: z.string().trim().min(2).max(220),
  bloqueiaSelecao: z.boolean().default(true),
  contaComoSemExpediente: z.boolean().default(true),
});

const setReservationsSchema = z.object({
  campaignId: z.number().int().positive(),
  dates: z.array(dateOnlySchema).max(20),
});

type QueryResultLike<T> = { rows?: T[] } | T[];

function resultRows<T>(value: QueryResultLike<T>): T[] {
  if (Array.isArray(value)) return value;
  return Array.isArray(value?.rows) ? value.rows : [];
}

function dateOnly(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return normalizeDateOnly(String(value ?? ""));
}

function isoDateTime(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

function forwardedIp(req: { headers: Record<string, unknown>; ip?: string }) {
  const raw = String(req.headers["x-forwarded-for"] ?? "").trim();
  return (raw.split(",")[0]?.trim() || req.ip || "").slice(0, 45) || null;
}

async function audit(
  executor: { execute: (query: any) => Promise<any> },
  input: {
    campaignId?: number | null;
    actorUserId: number;
    targetUserId?: number | null;
    action: string;
    payload?: unknown;
    ip?: string | null;
  },
) {
  await executor.execute(sql`
    INSERT INTO folga_audit_log
      (campanha_id, usuario_ator_id, usuario_alvo_id, acao, payload, ip_origem)
    VALUES
      (${input.campaignId ?? null}, ${input.actorUserId}, ${input.targetUserId ?? null},
       ${input.action}, ${JSON.stringify(input.payload ?? {})}::jsonb, ${input.ip ?? null})
  `);
}

async function getCampaign(
  executor: { execute: (query: any) => Promise<any> },
  campaignId?: number,
) {
  const result = campaignId
    ? await executor.execute(sql`
        SELECT *
        FROM folga_campanhas
        WHERE id = ${campaignId}
        LIMIT 1
      `)
    : await executor.execute(sql`
        SELECT *
        FROM folga_campanhas
        ORDER BY
          CASE status WHEN 'ABERTA' THEN 0 WHEN 'RASCUNHO' THEN 1 WHEN 'FECHADA' THEN 2 ELSE 3 END,
          id DESC
        LIMIT 1
      `);

  return resultRows<any>(result)[0] ?? null;
}

function mapCampaign(row: any) {
  if (!row) return null;
  return {
    id: Number(row.id),
    nome: String(row.nome),
    ano: Number(row.ano),
    dataInicio: dateOnly(row.data_inicio),
    dataFim: dateOnly(row.data_fim),
    selecaoInicio: isoDateTime(row.selecao_inicio),
    selecaoFim: isoDateTime(row.selecao_fim),
    maxFolgas: Number(row.max_folgas),
    maxDiasConsecutivos: Number(row.max_dias_consecutivos ?? 3),
    status: String(row.status),
    createdAt: isoDateTime(row.criado_em),
    updatedAt: isoDateTime(row.atualizado_em),
  };
}

function campaignIsOpen(row: any) {
  if (!row || row.status !== "ABERTA") return false;
  const now = Date.now();
  const start = row.selecao_inicio
    ? new Date(row.selecao_inicio).getTime()
    : null;
  const end = row.selecao_fim ? new Date(row.selecao_fim).getTime() : null;
  if (start && now < start) return false;
  if (end && now > end) return false;
  return true;
}

async function getParticipant(
  executor: { execute: (query: any) => Promise<any> },
  campaignId: number,
  userId: number,
) {
  const result = await executor.execute(sql`
    SELECT *
    FROM folga_participantes
    WHERE campanha_id = ${campaignId}
      AND (user_id = ${userId} OR pessoa_id = (SELECT pessoa_id FROM users WHERE id=${userId}))
    LIMIT 1
  `);
  return resultRows<any>(result)[0] ?? null;
}

async function getNonWorkingDays(
  executor: { execute: (query: any) => Promise<any> },
  campaignId: number,
) {
  const result = await executor.execute(sql`
    SELECT id, campanha_id, data, tipo, descricao, bloqueia_selecao, conta_como_sem_expediente
    FROM folga_dias_nao_uteis
    WHERE campanha_id = ${campaignId}
    ORDER BY data ASC
  `);
  return resultRows<any>(result).map((row) => ({
    id: Number(row.id),
    campaignId: Number(row.campanha_id),
    data: dateOnly(row.data),
    tipo: String(row.tipo),
    descricao: String(row.descricao),
    bloqueiaSelecao: Boolean(row.bloqueia_selecao),
    contaComoSemExpediente: Boolean(row.conta_como_sem_expediente),
  }));
}

async function getReservations(
  executor: { execute: (query: any) => Promise<any> },
  campaignId: number,
) {
  const result = await executor.execute(sql`
    SELECT
      r.id,
      r.campanha_id,
      r.user_id,
      r.participante_id,
      r.data_folga,
      r.criado_em,
      COALESCE(pe.nome, u.name) AS usuario_nome,
      u.username AS usuario_username
    FROM folga_reservas r
    INNER JOIN folga_participantes p ON p.id = r.participante_id
    LEFT JOIN users u ON u.id = p.user_id
    LEFT JOIN pessoas pe ON pe.id = p.pessoa_id
    WHERE r.campanha_id = ${campaignId}
    ORDER BY r.data_folga ASC, u.name ASC
  `);
  return resultRows<any>(result).map((row) => ({
    id: Number(row.id),
    campaignId: Number(row.campanha_id),
    userId: row.user_id == null ? null : Number(row.user_id),
    participantId: Number(row.participante_id),
    data: dateOnly(row.data_folga),
    userName: String(row.usuario_nome),
    username: String(row.usuario_username ?? ""),
    createdAt: isoDateTime(row.criado_em),
  }));
}

type Executor = { execute: (query: any) => Promise<any> };
async function lockCampaign(db: Executor, id: number) {
  await db.execute(sql`SELECT pg_advisory_xact_lock(76491, ${id})`);
  const row = resultRows<any>(
    await db.execute(
      sql`SELECT id FROM folga_campanhas WHERE id=${id} FOR UPDATE`,
    ),
  )[0];
  if (!row)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Campanha não encontrada.",
    });
}
async function validateCampaignImpact(db: Executor, id: number) {
  const campaign = mapCampaign(await getCampaign(db, id))!;
  const days = await getNonWorkingDays(db, id);
  const reservations = await getReservations(db, id);
  for (const participantId of new Set(
    reservations.map((r) => r.participantId),
  )) {
    const participant = resultRows<any>(
      await db.execute(
        sql`SELECT * FROM folga_participantes WHERE id=${participantId} AND campanha_id=${id}`,
      ),
    )[0];
    const dates = reservations
      .filter((r) => r.participantId === participantId)
      .map((r) => r.data);
    const check = validateFolgaSelection({
      selectedDates: dates,
      nonWorkingDates: days
        .filter((d) => d.contaComoSemExpediente)
        .map((d) => d.data),
      maxConsecutiveOffDays: campaign.maxDiasConsecutivos,
    });
    if (
      !participant?.ativo ||
      dates.length > (participant.limite_folgas ?? campaign.maxFolgas) ||
      dates.some(
        (d) =>
          d < campaign.dataInicio ||
          d > campaign.dataFim ||
          days.some((n) => n.data === d && n.bloqueiaSelecao),
      ) ||
      !check.valid
    ) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "A alteração invalidaria reservas confirmadas. Revise e remova as reservas afetadas antes de continuar.",
      });
    }
  }
}

async function setReservations(
  ctx: AppContext,
  input: z.infer<typeof setReservationsSchema>,
  participantId?: number,
) {
  const db = requireDb();
  const uniqueDates = [...new Set(input.dates.map(dateOnly))].sort(
    compareDateOnly,
  );

  if (uniqueDates.length !== input.dates.length) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Há datas repetidas na seleção.",
    });
  }

  return db.transaction(async (tx) => {
    // Serializa alterações da mesma campanha. A constraint UNIQUE continua sendo a última barreira.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(76491, ${input.campaignId})`,
    );

    const campaignResult = await tx.execute(sql`
        SELECT * FROM folga_campanhas WHERE id = ${input.campaignId} FOR UPDATE
      `);
    const campaignRow = resultRows<any>(campaignResult)[0];
    if (!campaignRow) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Campanha de folgas não encontrada.",
      });
    }
    if (!campaignIsOpen(campaignRow)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "O período de escolha das folgas não está aberto.",
      });
    }

    const participant = participantId
      ? resultRows<any>(
          await tx.execute(
            sql`SELECT * FROM folga_participantes WHERE id=${participantId} AND campanha_id=${input.campaignId}`,
          ),
        )[0]
      : await getParticipant(tx, input.campaignId, ctx.user!.id);
    if (!participant?.ativo) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Seu usuário não está habilitado nesta campanha de folgas.",
      });
    }

    const limit = Number(participant.limite_folgas ?? campaignRow.max_folgas);
    if (uniqueDates.length > limit) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Você pode selecionar no máximo ${limit} folga${limit === 1 ? "" : "s"}.`,
      });
    }

    const campaignStart = dateOnly(campaignRow.data_inicio);
    const campaignEnd = dateOnly(campaignRow.data_fim);
    for (const date of uniqueDates) {
      if (
        compareDateOnly(date, campaignStart) < 0 ||
        compareDateOnly(date, campaignEnd) > 0
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `A data ${date} está fora do período permitido.`,
        });
      }
    }

    const nonWorkingDays = await getNonWorkingDays(tx, input.campaignId);
    const blockedSelection = new Set(
      nonWorkingDays
        .filter((item) => item.bloqueiaSelecao)
        .map((item) => item.data),
    );
    const countsAsOff = new Set(
      nonWorkingDays
        .filter((item) => item.contaComoSemExpediente)
        .map((item) => item.data),
    );

    for (const date of uniqueDates) {
      if (blockedSelection.has(date)) {
        const item = nonWorkingDays.find((row) => row.data === date);
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: item?.descricao
            ? `${date} está bloqueada: ${item.descricao}.`
            : `${date} não pode ser selecionada.`,
        });
      }
    }

    const ruleCheck = validateFolgaSelection({
      selectedDates: uniqueDates,
      nonWorkingDates: countsAsOff,
      maxConsecutiveOffDays: Number(campaignRow.max_dias_consecutivos ?? 3),
    });
    if (!ruleCheck.valid) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          ruleCheck.violations[0]?.message ??
          "A seleção viola as regras de continuidade de folgas.",
        cause: ruleCheck.violations,
      });
    }

    const allReservations = await getReservations(tx, input.campaignId);
    const occupiedByOthers = new Map(
      allReservations
        .filter((row) => row.participantId !== Number(participant.id))
        .map((row) => [row.data, row]),
    );
    for (const date of uniqueDates) {
      if (occupiedByOthers.has(date)) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `A data ${date} acabou de ser escolhida por outra pessoa. Atualize o calendário e escolha outra data.`,
        });
      }
    }

    await tx.execute(sql`
        DELETE FROM folga_reservas
        WHERE campanha_id = ${input.campaignId}
          AND participante_id = ${participant.id}
      `);

    for (const date of uniqueDates) {
      try {
        await tx.execute(sql`
            INSERT INTO folga_reservas (campanha_id, participante_id, user_id, data_folga)
            VALUES (${input.campaignId}, ${participant.id}, ${participant.user_id}, ${date}::date)
          `);
      } catch (error: any) {
        if (String(error?.code ?? error?.cause?.code ?? "") === "23505") {
          throw new TRPCError({
            code: "CONFLICT",
            message: `A data ${date} já foi reservada por outra pessoa.`,
          });
        }
        throw error;
      }
    }

    await audit(tx, {
      campaignId: input.campaignId,
      actorUserId: ctx.user!.id,
      targetUserId: participant.user_id,
      action: participantId ? "ADMIN_SET_RESERVATIONS" : "SET_MY_RESERVATIONS",
      payload: { participantId: participant.id, dates: uniqueDates },
      ip: forwardedIp(ctx.req as any),
    });

    return { ok: true, dates: uniqueDates };
  });
}

export const folgasRouter = router({
  overview: protectedProcedure
    .input(campaignIdInput)
    .query(async ({ ctx, input }) => {
      const db = requireDb();
      const campaignRow = await getCampaign(db, input?.campaignId);
      if (!campaignRow) {
        return {
          campaign: null,
          eligible: false,
          open: false,
          limit: 0,
          myDates: [] as string[],
          nonWorkingDays: [] as Awaited<ReturnType<typeof getNonWorkingDays>>,
          occupied: [] as Array<{
            id: number;
            date: string;
            mine: boolean;
            userId: number | null;
            userName: string | null;
          }>,
        };
      }

      const campaign = mapCampaign(campaignRow)!;
      const participant = await getParticipant(db, campaign.id, ctx.user!.id);
      if (
        !participant?.ativo &&
        !["admin", "gestor"].includes(ctx.user!.role)
      ) {
        return {
          campaign,
          eligible: false,
          open: false,
          limit: 0,
          myDates: [] as string[],
          nonWorkingDays: [] as Awaited<ReturnType<typeof getNonWorkingDays>>,
          occupied: [] as Array<{
            id: number;
            date: string;
            mine: boolean;
            userId: number | null;
            userName: string | null;
          }>,
        };
      }
      const nonWorkingDays = await getNonWorkingDays(db, campaign.id);
      const reservations = await getReservations(db, campaign.id);
      const canSeeNames = ["admin", "gestor"].includes(String(ctx.user!.role));
      const limit = Number(
        participant?.limite_folgas ?? campaignRow.max_folgas ?? 0,
      );

      return {
        campaign,
        eligible: Boolean(participant?.ativo),
        open: campaignIsOpen(campaignRow),
        limit,
        myDates: reservations
          .filter((row) => row.participantId === Number(participant?.id))
          .map((row) => row.data)
          .sort(compareDateOnly),
        nonWorkingDays,
        occupied: reservations.map((row) => ({
          id: row.id,
          date: row.data,
          mine: row.participantId === Number(participant?.id),
          userId:
            canSeeNames || row.participantId === Number(participant?.id)
              ? row.userId
              : null,
          userName: canSeeNames ? row.userName : null,
        })),
      };
    }),

  setMyReservations: protectedProcedure
    .input(setReservationsSchema)
    .mutation(({ ctx, input }) => setReservations(ctx, input)),
  adminSetReservations: adminProcedure
    .input(
      setReservationsSchema.extend({
        participantId: z.number().int().positive(),
      }),
    )
    .mutation(({ ctx, input }) =>
      setReservations(ctx, input, input.participantId),
    ),
  adminDashboard: gestorProcedure
    .input(campaignIdInput)
    .query(async ({ input }) => {
      const db = requireDb();
      const campaigns = resultRows<any>(
        await db.execute(
          sql`SELECT * FROM folga_campanhas ORDER BY ano DESC,id DESC`,
        ),
      ).map((r) => mapCampaign(r)!);
      const selectedCampaign = input?.campaignId
        ? (campaigns.find((c) => c.id === input.campaignId) ?? null)
        : (campaigns[0] ?? null);
      const users = resultRows<any>(
        await db.execute(
          sql`SELECT id,username,name FROM users WHERE ativo ORDER BY name`,
        ),
      ).map((r) => ({
        id: Number(r.id),
        username: String(r.username ?? ""),
        name: String(r.name),
      }));
      const participants = selectedCampaign
        ? resultRows<any>(
            await db.execute(sql`
      SELECT p.*,COALESCE(pe.nome,u.name) AS nome,u.username
      FROM folga_participantes p LEFT JOIN users u ON u.id=p.user_id LEFT JOIN pessoas pe ON pe.id=p.pessoa_id
      WHERE p.campanha_id=${selectedCampaign.id} ORDER BY nome
    `),
          ).map((r) => ({
            id: Number(r.id),
            userId: r.user_id == null ? null : Number(r.user_id),
            pessoaId: r.pessoa_id == null ? null : Number(r.pessoa_id),
            userName: String(r.nome),
            username: String(r.username ?? ""),
            ativo: Boolean(r.ativo),
            limiteFolgas:
              r.limite_folgas == null ? null : Number(r.limite_folgas),
          }))
        : [];
      return {
        campaigns,
        selectedCampaign,
        users,
        participants,
        nonWorkingDays: selectedCampaign
          ? await getNonWorkingDays(db, selectedCampaign.id)
          : [],
        reservations: selectedCampaign
          ? await getReservations(db, selectedCampaign.id)
          : [],
      };
    }),
  adminSearchPeople: adminProcedure
    .input(z.object({ search: z.string().trim().max(100) }))
    .query(async ({ input }) => {
      if (input.search.length < 2) return [];
      return resultRows<any>(
        await requireDb().execute(
          sql`SELECT p.id,p.nome,u.id AS user_id FROM pessoas p LEFT JOIN users u ON u.pessoa_id=p.id AND u.ativo WHERE p.ativo AND p.nome ILIKE ${"%" + input.search + "%"} ORDER BY p.nome LIMIT 30`,
        ),
      ).map((r) => ({
        id: Number(r.id),
        nome: String(r.nome),
        userId: r.user_id == null ? null : Number(r.user_id),
      }));
    }),
  adminCreatePerson: adminProcedure
    .input(
      z.object({
        nome: z.string().trim().min(3).max(200),
        cpf: z.string().trim().optional(),
        matricula: z.string().trim().max(40).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // The canonical registry owns validation, duplicate checking and auditing.
      return cadastrosRouter
        .createCaller(ctx)
        .save({ entity: "pessoas", data: { ...input, ativo: true } });
    }),
  adminSaveCampaign: gestorProcedure
    .input(campaignSaveSchema)
    .mutation(async ({ ctx, input }) => {
      if (input.dataInicio > input.dataFim)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A data inicial não pode ser posterior à data final.",
        });
      if (
        input.selecaoInicio &&
        input.selecaoFim &&
        new Date(input.selecaoInicio) > new Date(input.selecaoFim)
      )
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "O início da seleção não pode ser posterior ao encerramento.",
        });
      return requireDb().transaction(async (db) => {
        if (input.id) {
          await lockCampaign(db, input.id);
          const before = mapCampaign(await getCampaign(db, input.id))!;
          if (
            before.status === "ABERTA" &&
            (before.dataInicio !== input.dataInicio ||
              before.dataFim !== input.dataFim ||
              before.maxFolgas !== input.maxFolgas ||
              before.maxDiasConsecutivos !== input.maxDiasConsecutivos ||
              before.selecaoInicio !== isoDateTime(input.selecaoInicio) ||
              before.selecaoFim !== isoDateTime(input.selecaoFim))
          )
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Feche a campanha antes de alterar período ou limites.",
            });
        } else if (input.status !== "RASCUNHO")
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Crie a campanha em rascunho antes de abrir.",
          });
        const result = input.id
          ? await db.execute(sql`
        UPDATE folga_campanhas SET nome=${input.nome},ano=${input.ano},data_inicio=${input.dataInicio}::date,data_fim=${input.dataFim}::date,selecao_inicio=${input.selecaoInicio ?? null}::timestamptz,selecao_fim=${input.selecaoFim ?? null}::timestamptz,max_folgas=${input.maxFolgas},max_dias_consecutivos=${input.maxDiasConsecutivos},status=${input.status},atualizado_em=now() WHERE id=${input.id} RETURNING *
      `)
          : await db.execute(sql`
        INSERT INTO folga_campanhas (nome,ano,data_inicio,data_fim,selecao_inicio,selecao_fim,max_folgas,max_dias_consecutivos,status,criado_por) VALUES (${input.nome},${input.ano},${input.dataInicio}::date,${input.dataFim}::date,${input.selecaoInicio ?? null}::timestamptz,${input.selecaoFim ?? null}::timestamptz,${input.maxFolgas},${input.maxDiasConsecutivos},${input.status},${ctx.user!.id}) RETURNING *
      `);
        const saved = mapCampaign(resultRows<any>(result)[0])!;
        await validateCampaignImpact(db, saved.id);
        if (input.status === "ABERTA") {
          const count = resultRows<any>(
            await db.execute(
              sql`SELECT count(*)::int AS total FROM folga_participantes WHERE campanha_id=${saved.id} AND ativo`,
            ),
          )[0].total;
          if (!count)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Inclua os participantes antes de abrir.",
            });
          if (!input.selecaoInicio || !input.selecaoFim)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Defina a abertura e o encerramento da escolha.",
            });
          if (!input.calendarioConfirmado)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "Confirme a revisão institucional dos participantes e do calendário, inclusive dias adjacentes.",
            });
        }
        await audit(db, {
          campaignId: saved.id,
          actorUserId: ctx.user!.id,
          action: input.id ? "UPDATE_CAMPAIGN" : "CREATE_CAMPAIGN",
          payload: input,
          ip: forwardedIp(ctx.req as any),
        });
        return saved;
      });
    }),
  adminSetParticipant: gestorProcedure
    .input(participantSaveSchema)
    .mutation(async ({ ctx, input }) => {
      if (Boolean(input.userId) === Boolean(input.pessoaId))
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Selecione uma pessoa ou um usuário.",
        });
      if (input.pessoaId && ctx.user!.role !== "admin")
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "A inclusão manual de pessoas é restrita ao administrador.",
        });
      return requireDb().transaction(async (db) => {
        await lockCampaign(db, input.campaignId);
        if ((await getCampaign(db, input.campaignId)).status === "ABERTA")
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Feche a campanha antes de alterar participantes.",
          });
        const identity = input.userId
          ? resultRows<any>(
              await db.execute(
                sql`SELECT id AS user_id,pessoa_id FROM users WHERE id=${input.userId} AND ativo`,
              ),
            )[0]
          : resultRows<any>(
              await db.execute(
                sql`SELECT u.id AS user_id,p.id AS pessoa_id FROM pessoas p LEFT JOIN users u ON u.pessoa_id=p.id AND u.ativo WHERE p.id=${input.pessoaId} AND p.ativo`,
              ),
            )[0];
        if (!identity)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Pessoa ou usuário ativo não encontrado no SIREL.",
          });
        const existing = resultRows<any>(
          await db.execute(
            sql`SELECT id FROM folga_participantes WHERE campanha_id=${input.campaignId} AND (user_id=${identity.user_id ?? null} OR pessoa_id=${identity.pessoa_id ?? null})`,
          ),
        )[0];
        if (existing)
          await db.execute(
            sql`UPDATE folga_participantes SET user_id=${identity.user_id ?? null},pessoa_id=${identity.pessoa_id ?? null},ativo=${input.ativo},limite_folgas=${input.limiteFolgas ?? null},atualizado_em=now() WHERE id=${existing.id}`,
          );
        else
          await db.execute(
            sql`INSERT INTO folga_participantes (campanha_id,user_id,pessoa_id,ativo,limite_folgas) VALUES (${input.campaignId},${identity.user_id ?? null},${identity.pessoa_id ?? null},${input.ativo},${input.limiteFolgas ?? null})`,
          );
        await validateCampaignImpact(db, input.campaignId);
        await audit(db, {
          campaignId: input.campaignId,
          actorUserId: ctx.user!.id,
          targetUserId: identity.user_id,
          action: "SET_PARTICIPANT",
          payload: input,
          ip: forwardedIp(ctx.req as any),
        });
        return { ok: true };
      });
    }),
  adminSaveNonWorkingDay: gestorProcedure
    .input(nonWorkingSaveSchema)
    .mutation(async ({ ctx, input }) =>
      requireDb().transaction(async (db) => {
        await lockCampaign(db, input.campaignId);
        if ((await getCampaign(db, input.campaignId)).status === "ABERTA")
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Feche a campanha antes de alterar o calendário.",
          });
        const result = input.id
          ? await db.execute(
              sql`UPDATE folga_dias_nao_uteis SET data=${input.data}::date,tipo=${input.tipo},descricao=${input.descricao},bloqueia_selecao=${input.bloqueiaSelecao},conta_como_sem_expediente=${input.contaComoSemExpediente},atualizado_em=now() WHERE id=${input.id} AND campanha_id=${input.campaignId} RETURNING id`,
            )
          : await db.execute(
              sql`INSERT INTO folga_dias_nao_uteis (campanha_id,data,tipo,descricao,bloqueia_selecao,conta_como_sem_expediente) VALUES (${input.campaignId},${input.data}::date,${input.tipo},${input.descricao},${input.bloqueiaSelecao},${input.contaComoSemExpediente}) ON CONFLICT (campanha_id,data) DO UPDATE SET tipo=EXCLUDED.tipo,descricao=EXCLUDED.descricao,bloqueia_selecao=EXCLUDED.bloqueia_selecao,conta_como_sem_expediente=EXCLUDED.conta_como_sem_expediente,atualizado_em=now() RETURNING id`,
            );
        if (!resultRows(result).length)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Dia não encontrado.",
          });
        await validateCampaignImpact(db, input.campaignId);
        await audit(db, {
          campaignId: input.campaignId,
          actorUserId: ctx.user!.id,
          action: "SAVE_NON_WORKING_DAY",
          payload: input,
          ip: forwardedIp(ctx.req as any),
        });
        return { ok: true };
      }),
    ),
  adminDeleteNonWorkingDay: gestorProcedure
    .input(
      z.object({
        campaignId: z.number().int().positive(),
        id: z.number().int().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      requireDb().transaction(async (db) => {
        await lockCampaign(db, input.campaignId);
        if ((await getCampaign(db, input.campaignId)).status === "ABERTA")
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Feche a campanha antes de alterar o calendário.",
          });
        const removed = resultRows(
          await db.execute(
            sql`DELETE FROM folga_dias_nao_uteis WHERE id=${input.id} AND campanha_id=${input.campaignId} RETURNING id`,
          ),
        );
        if (!removed.length)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Dia não encontrado.",
          });
        await validateCampaignImpact(db, input.campaignId);
        await audit(db, {
          campaignId: input.campaignId,
          actorUserId: ctx.user!.id,
          action: "DELETE_NON_WORKING_DAY",
          payload: input,
          ip: forwardedIp(ctx.req as any),
        });
        return { ok: true };
      }),
    ),
  adminRemoveReservation: gestorProcedure
    .input(
      z.object({
        campaignId: z.number().int().positive(),
        reservationId: z.number().int().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      requireDb().transaction(async (db) => {
        await lockCampaign(db, input.campaignId);
        const removed = resultRows<any>(
          await db.execute(
            sql`DELETE FROM folga_reservas WHERE id=${input.reservationId} AND campanha_id=${input.campaignId} RETURNING *`,
          ),
        )[0];
        if (!removed)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Reserva não encontrada.",
          });
        await audit(db, {
          campaignId: input.campaignId,
          actorUserId: ctx.user!.id,
          targetUserId: removed.user_id,
          action: "ADMIN_REMOVE_RESERVATION",
          payload: {
            ...input,
            participantId: removed.participante_id,
            date: dateOnly(removed.data_folga),
          },
          ip: forwardedIp(ctx.req as any),
        });
        return { ok: true };
      }),
    ),
});

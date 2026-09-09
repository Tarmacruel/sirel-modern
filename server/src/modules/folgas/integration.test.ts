import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import superjson from "superjson";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { requireDb, databaseEnabled, closeDb } from "../../db/client.js";
import { createContext } from "../../_core/context.js";
import { appRouter } from "../../routers/index.js";
import { hashPassword } from "../../lib/auth-password.js";

const suite =
  databaseEnabled && process.env.RUN_DB_INTEGRATION_TESTS === "true"
    ? describe.sequential
    : describe.skip;
type Session = { cookie: string; csrf: string };
suite("Folgas HTTP + PostgreSQL isolado", () => {
  let server: Server,
    base: string,
    campaignId: number,
    admin: Session,
    gestor: Session,
    a: Session,
    b: Session,
    outsider: Session;
  const userIds: number[] = [];
  let personId: number;
  const prefix = "folgas_" + randomUUID().slice(0, 8);
  const password = randomUUID();
  const campaign = {
    nome: "Teste Folgas " + prefix,
    ano: 2026,
    dataInicio: "2026-09-08",
    dataFim: "2026-12-31",
    selecaoInicio: "2020-01-01T00:00:00Z",
    selecaoFim: "2099-01-01T00:00:00Z",
    maxFolgas: 2,
    maxDiasConsecutivos: 3,
    status: "RASCUNHO" as string,
    calendarioConfirmado: true,
  };
  async function call(
    path: string,
    input: unknown,
    session?: Session,
    query = false,
  ) {
    const encoded = JSON.stringify(superjson.serialize(input));
    const response = await fetch(
      base +
        "/" +
        path +
        (query ? "?input=" + encodeURIComponent(encoded) : ""),
      {
        method: query ? "GET" : "POST",
        headers: {
          "content-type": "application/json",
          ...(session
            ? { cookie: session.cookie, "x-sirel-csrf": session.csrf }
            : {}),
        },
        ...(!query ? { body: encoded } : {}),
      },
    );
    const body: any = await response.json();
    if (body.error)
      return {
        ok: false as const,
        error: superjson.deserialize<any>(body.error),
        status: response.status,
      };
    return {
      ok: true as const,
      data: superjson.deserialize<any>(body.result.data),
      headers: response.headers,
    };
  }
  async function login(username: string) {
    const r = await call("auth.login", { login: username, password });
    expect(r.ok).toBe(true);
    if (!r.ok) throw Error(r.error.message);
    const cookies = r.headers.getSetCookie().map((c) => c.split(";")[0]);
    return {
      cookie: cookies.join("; "),
      csrf: decodeURIComponent(
        cookies.find((c) => c.startsWith("sirel_csrf="))!.split("=")[1],
      ),
    };
  }
  async function save(status: string, changes: Record<string, unknown> = {}) {
    return call(
      "folgas.adminSaveCampaign",
      { ...campaign, id: campaignId, status, ...changes },
      admin,
    );
  }
  beforeAll(async () => {
    const app = express();
    app.use(
      "/api/trpc",
      createExpressMiddleware({ router: appRouter, createContext }),
    );
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as any).port}/api/trpc`;
    const sessions: Session[] = [];
    for (const role of ["admin", "gestor", "user", "user", "user"]) {
      const username = prefix + "_" + userIds.length;
      const result = await requireDb().execute(
        sql`INSERT INTO users (username,name,role,password_hash,ativo) VALUES (${username},${username},${role}::user_role,${hashPassword(password)},true) RETURNING id`,
      );
      userIds.push(Number(result.rows[0].id));
      sessions.push(await login(username));
    }
    [admin, gestor, a, b, outsider] = sessions;
    const created = await call("folgas.adminSaveCampaign", campaign, admin);
    expect(created.ok).toBe(true);
    if (!created.ok) throw Error(created.error.message);
    campaignId = created.data.id;
    for (const userId of userIds.slice(2, 4))
      expect(
        (
          await call(
            "folgas.adminSetParticipant",
            { campaignId, userId, ativo: true },
            admin,
          )
        ).ok,
      ).toBe(true);
    const person = await requireDb().execute(
      sql`INSERT INTO pessoas (nome) VALUES (${prefix + "_sem_conta"}) RETURNING id`,
    );
    personId = Number(person.rows[0].id);
    expect(
      (
        await call(
          "folgas.adminSetParticipant",
          { campaignId, pessoaId: personId, ativo: true },
          admin,
        )
      ).ok,
    ).toBe(true);
    for (const data of ["2026-09-07", "2027-01-01"])
      expect(
        (
          await call(
            "folgas.adminSaveNonWorkingDay",
            {
              campaignId,
              data,
              tipo: "FERIADO",
              descricao: "Feriado de teste",
            },
            admin,
          )
        ).ok,
      ).toBe(true);
    expect((await save("ABERTA")).ok).toBe(true);
  }, 60000);
  afterAll(async () => {
    if (campaignId) {
      await requireDb().execute(
        sql`DELETE FROM folga_reservas WHERE campanha_id=${campaignId}`,
      );
      await requireDb().execute(
        sql`DELETE FROM folga_campanhas WHERE id=${campaignId}`,
      );
    }
    if (personId)
      await requireDb().execute(sql`DELETE FROM pessoas WHERE id=${personId}`);
    for (const id of userIds) {
      await requireDb().execute(
        sql`DELETE FROM auditoria_log WHERE usuario_id=${id}`,
      );
      await requireDb().execute(sql`DELETE FROM auth_log WHERE user_id=${id}`);
      await requireDb().execute(sql`DELETE FROM users WHERE id=${id}`);
    }
    if (server)
      await new Promise<void>((resolve) => server.close(() => resolve()));
    await closeDb();
  });
  it("duas sessões reais disputam a data: exatamente uma reserva e conflito amigável", async () => {
    const responses = await Promise.all([
      call(
        "folgas.setMyReservations",
        { campaignId, dates: ["2026-09-16"] },
        a,
      ),
      call(
        "folgas.setMyReservations",
        { campaignId, dates: ["2026-09-16"] },
        b,
      ),
    ]);
    expect(responses.filter((r) => r.ok)).toHaveLength(1);
    const failed = responses.find((r) => !r.ok)!;
    if (failed.ok) throw Error("Sem conflito");
    expect(failed.error.data.code).toBe("CONFLICT");
    expect(failed.error.message).toMatch(/outra pessoa/);
    const rows = await requireDb().execute(
      sql`SELECT * FROM folga_reservas WHERE campanha_id=${campaignId} AND data_folga='2026-09-16'`,
    );
    expect(rows.rows).toHaveLength(1);
    const view = await call(
      "folgas.overview",
      { campaignId },
      rows.rows[0].user_id === userIds[2] ? b : a,
      true,
    );
    expect(view.ok).toBe(true);
    if (view.ok) {
      expect(view.data.occupied[0].userName).toBeNull();
      expect(view.data.occupied[0].userId).toBeNull();
    }
  });
  it("PostgreSQL recusa INSERT duplicado mesmo sem o router", async () => {
    const p = await requireDb().execute(
      sql`SELECT id FROM folga_participantes WHERE campanha_id=${campaignId} AND user_id=${userIds[2]}`,
    );
    await expect(
      requireDb().execute(
        sql`INSERT INTO folga_reservas (campanha_id,participante_id,user_id,data_folga) VALUES (${campaignId},${p.rows[0].id},${userIds[2]},'2026-09-16')`,
      ),
    ).rejects.toMatchObject({ cause: { code: "23505" } });
  });
  it("autenticação, CSRF, não participante e todas as operações administrativas são protegidos", async () => {
    expect(
      (await call("folgas.overview", { campaignId }, undefined, true)).ok,
    ).toBe(false);
    expect(
      (
        await call(
          "folgas.setMyReservations",
          { campaignId, dates: ["2026-09-23"] },
          { ...a, csrf: "incorreto" },
        )
      ).ok,
    ).toBe(false);
    expect(
      (
        await call(
          "folgas.setMyReservations",
          { campaignId, dates: ["2026-09-23"] },
          outsider,
        )
      ).ok,
    ).toBe(false);
    const view = await call("folgas.overview", { campaignId }, outsider, true);
    if (view.ok) {
      expect(view.data.eligible).toBe(false);
      expect(view.data.occupied).toEqual([]);
    }
    for (const [path, input, query] of [
      ["adminDashboard", { campaignId }, true],
      ["adminExportPdf", { campaignId }, false],
      ["adminSaveCampaign", { ...campaign, id: campaignId }, false],
      [
        "adminSetParticipant",
        { campaignId, userId: userIds[4], ativo: true },
        false,
      ],
      [
        "adminSaveNonWorkingDay",
        { campaignId, data: "2026-10-01", tipo: "FERIADO", descricao: "Teste" },
        false,
      ],
      ["adminDeleteNonWorkingDay", { campaignId, id: 1 }, false],
      ["adminRemoveReservation", { campaignId, reservationId: 1 }, false],
      [
        "adminSetReservations",
        { campaignId, participantId: 1, dates: [] },
        false,
      ],
      ["adminSearchPeople", { search: "Teste" }, true],
      ["adminCreatePerson", { nome: "Pessoa indevida" }, false],
    ] as const) {
      const r = await call("folgas." + path, input, a, query);
      expect(r.ok, path).toBe(false);
      if (!r.ok) expect(r.error.data.code, path).toBe("FORBIDDEN");
    }
    expect(
      (await call("folgas.adminDashboard", { campaignId }, gestor, true)).ok,
    ).toBe(true);
  });
  it("servidor recusa todos os exemplos de quatro dias e datas fora do período", async () => {
    for (const dates of [
      ["2026-09-14", "2026-09-15"],
      ["2026-09-17", "2026-09-18"],
      ["2026-09-18", "2026-09-21"],
      ["2026-09-08"],
      ["2026-12-31"],
      ["2026-09-19"],
      ["2026-09-07"],
      ["2026-09-99"],
      ["2026-09-23", "2026-09-23"],
      ["2026-09-09", "2026-09-16", "2026-09-23"],
    ])
      expect(
        (await call("folgas.setMyReservations", { campaignId, dates }, a)).ok,
        dates.join(","),
      ).toBe(false);
    expect(
      (
        await call(
          "folgas.setMyReservations",
          { campaignId, dates: ["2026-09-14", "2026-09-18"] },
          a,
        )
      ).ok,
    ).toBe(true);
  });
  it("admin registra para pessoa sem conta, usando a mesma regra e auditoria", async () => {
    const d = await call("folgas.adminDashboard", { campaignId }, admin, true);
    if (!d.ok) throw Error(d.error.message);
    const person = d.data.participants.find(
      (p: any) => p.pessoaId === personId,
    );
    expect(
      (
        await call(
          "folgas.adminSetReservations",
          { campaignId, participantId: person.id, dates: ["2026-09-08"] },
          admin,
        )
      ).ok,
    ).toBe(false);
    expect(
      (
        await call(
          "folgas.adminSetReservations",
          { campaignId, participantId: person.id, dates: ["2026-09-23"] },
          admin,
        )
      ).ok,
    ).toBe(true);
    expect(
      (await call("folgas.adminSearchPeople", { search: prefix }, admin, true))
        .ok,
    ).toBe(true);
  });
  it("admin e gestor exportam PDF da campanha, incluindo pessoa sem conta", async () => {
    const { loadFolgasReport } = await import("./report.js");
    const data = await loadFolgasReport(campaignId);
    expect(
      data.reservations.some((r) => r.name === prefix + "_sem_conta"),
    ).toBe(true);
    expect(data.reservations.map((r) => r.date)).toEqual(
      [...data.reservations.map((r) => r.date)].sort(),
    );
    for (const session of [admin, gestor]) {
      const response = await call(
        "folgas.adminExportPdf",
        { campaignId },
        session,
      );
      expect(response.ok).toBe(true);
      if (!response.ok) throw Error(response.error.message);
      expect(response.data.mimeType).toBe("application/pdf");
      expect(response.data.filename).toBe(`folgas-campanha-${campaignId}.pdf`);
      const pdf = Buffer.from(response.data.base64, "base64");
      expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
      expect(pdf.length).toBeGreaterThan(2000);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect(
      (
        await call(
          "folgas.adminExportPdf",
          { campaignId },
          { ...admin, csrf: "incorreto" },
        )
      ).ok,
    ).toBe(false);
    const absent = await call(
      "folgas.adminExportPdf",
      { campaignId: 2147483647 },
      admin,
    );
    expect(absent.ok).toBe(false);
    if (!absent.ok) expect(absent.error.data.code).toBe("NOT_FOUND");
  });
  it("fechamento, impacto nas reservas, rollback e auditoria administrativa", async () => {
    expect(
      (
        await call(
          "folgas.adminSaveNonWorkingDay",
          {
            campaignId,
            data: "2026-09-24",
            tipo: "FERIADO",
            descricao: "Teste",
          },
          admin,
        )
      ).ok,
    ).toBe(false);
    expect((await save("ABERTA", { maxFolgas: 1 })).ok).toBe(false);
    expect((await save("FECHADA")).ok).toBe(true);
    expect(
      (await call("folgas.setMyReservations", { campaignId, dates: [] }, a)).ok,
    ).toBe(false);
    expect((await save("FECHADA", { maxFolgas: 1 })).ok).toBe(false);
    expect((await save("FECHADA", { dataInicio: "2026-09-20" })).ok).toBe(
      false,
    );
    expect(
      (
        await call(
          "folgas.adminSaveNonWorkingDay",
          {
            campaignId,
            data: "2026-09-17",
            tipo: "FERIADO",
            descricao: "Invalida sexta",
          },
          admin,
        )
      ).ok,
    ).toBe(false);
    expect(
      (
        await requireDb().execute(
          sql`SELECT * FROM folga_dias_nao_uteis WHERE campanha_id=${campaignId} AND data='2026-09-17'`,
        )
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await call(
          "folgas.adminSetParticipant",
          { campaignId, userId: userIds[2], ativo: false },
          admin,
        )
      ).ok,
    ).toBe(false);
    const rows = await requireDb().execute(
      sql`SELECT id FROM folga_reservas WHERE campanha_id=${campaignId}`,
    );
    for (const row of rows.rows)
      expect(
        (
          await call(
            "folgas.adminRemoveReservation",
            { campaignId, reservationId: Number(row.id) },
            admin,
          )
        ).ok,
      ).toBe(true);
    expect((await save("FECHADA", { maxFolgas: 1 })).ok).toBe(true);
    const log = await requireDb().execute(
      sql`SELECT acao FROM folga_audit_log WHERE campanha_id=${campaignId}`,
    );
    expect(log.rows.map((r) => r.acao)).toEqual(
      expect.arrayContaining([
        "CREATE_CAMPAIGN",
        "SET_PARTICIPANT",
        "SAVE_NON_WORKING_DAY",
        "SET_MY_RESERVATIONS",
        "ADMIN_SET_RESERVATIONS",
        "ADMIN_REMOVE_RESERVATION",
        "UPDATE_CAMPAIGN",
      ]),
    );
  });
});

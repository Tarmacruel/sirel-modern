import { and, eq, inArray, or } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { requireDb, databaseEnabled } from "../db/client.js";
import {
  auditoriaLog,
  cargos,
  funcoes,
  pessoas,
  secretarias,
  users,
} from "../db/schema.js";
import { hashPassword } from "../lib/auth-password.js";
import { appRouter } from "../routers/index.js";

const suite = databaseEnabled ? describe.sequential : describe.skip;

async function createMergeTestContext(suffix: string) {
  const db = requireDb();
  const [admin] = await db
    .insert(users)
    .values({
      username: `r21_merge_admin_${suffix}`,
      name: "Administrador de teste de mesclagem R2.1",
      passwordHash: hashPassword(`R2.1-Merge-${suffix}`),
      loginMethod: "local_password",
      role: "admin",
      ativo: true,
    })
    .returning();
  const context = {
    req: { headers: {} },
    res: {},
    db,
    databaseEnabled: true,
    user: {
      id: admin.id,
      username: admin.username ?? `admin-${admin.id}`,
      name: admin.name,
      email: admin.email,
      role: "admin",
      secretariaId: admin.secretariaId,
      sessionVersion: admin.sessionVersion,
    },
  };
  return { db, admin, caller: appRouter.createCaller(context as any) };
}

suite("cadastros R2.1 - integracao", () => {
  it("confirma persistencia, promocao, lookup, catalogos e vinculo unico", async () => {
    const db = requireDb();
    const suffix = String(Date.now());
    let createdAdminId: number | null = null;
    let createdSecretariaId: number | null = null;
    let cargoId: number | null = null;
    let funcaoId: number | null = null;
    let pessoaId: number | null = null;
    let linkedUserId: number | null = null;

    let [admin] = await db
      .select()
      .from(users)
      .where(and(eq(users.role, "admin"), eq(users.ativo, true)))
      .limit(1);
    if (!admin) {
      [admin] = await db
        .insert(users)
        .values({
          username: `r21_admin_${suffix}`,
          name: "Administrador de teste R2.1",
          passwordHash: hashPassword(`R2.1-Teste-${suffix}`),
          loginMethod: "local_password",
          role: "admin",
          ativo: true,
        })
        .returning();
      createdAdminId = admin.id;
    }

    let [secretaria] = await db
      .select()
      .from(secretarias)
      .where(eq(secretarias.ativo, true))
      .limit(1);
    if (!secretaria) {
      [secretaria] = await db
        .insert(secretarias)
        .values({
          sigla: `R21-${suffix.slice(-6)}`,
          nome: `Secretaria de teste R2.1 ${suffix}`,
          ativo: true,
        })
        .returning();
      createdSecretariaId = secretaria.id;
    }

    const context = {
      req: { headers: {} },
      res: {},
      db,
      databaseEnabled: true,
      user: {
        id: admin.id,
        username: admin.username ?? `admin-${admin.id}`,
        name: admin.name,
        email: admin.email,
        role: "admin",
        secretariaId: admin.secretariaId,
        sessionVersion: admin.sessionVersion,
      },
    };
    const caller = appRouter.createCaller(context as any);

    try {
      const cargo = await caller.cadastros.save({
        entity: "cargos",
        data: {
          codigo: `CR${suffix.slice(-8)}`,
          nome: `Cargo integração R2.1 ${suffix}`,
          categoria: "Teste automatizado",
          ativo: true,
        },
      });
      cargoId = cargo.id;
      const testCargoId = cargo.id;

      const funcao = await caller.cadastros.save({
        entity: "funcoes",
        data: {
          codigo: `FN${suffix.slice(-8)}`,
          nome: `Função integração R2.1 ${suffix}`,
          ativo: true,
        },
      });
      funcaoId = funcao.id;
      const testFuncaoId = funcao.id;

      const personName = `R21 Maria Integração ${suffix}`;
      const person = await caller.cadastros.save({
        entity: "pessoas",
        data: { nome: personName, cargo: "Cargo textual nao autorizado", ativo: true },
      });
      pessoaId = person.id;
      const testPessoaId = person.id;
      expect(person.cargo).toBeNull();

      const cpf = `9${suffix.replace(/\D/g, "").slice(-10).padStart(10, "0")}`;
      const promoted = await caller.cadastros.save({
        entity: "servidores",
        data: {
          id: testPessoaId,
          nome: personName,
          cpf,
          matricula: `MAT-${suffix}`,
          dataNascimento: "1990-05-10",
          cargoId: testCargoId,
          funcaoId: testFuncaoId,
          secretariaId: secretaria.id,
          ativo: true,
        },
      });
      expect(promoted.id).toBe(testPessoaId);
      expect(promoted.record).toMatchObject({
        id: testPessoaId,
        matricula: `MAT-${suffix}`,
        cargoId: testCargoId,
        funcaoId: testFuncaoId,
        secretariaId: secretaria.id,
      });

      const reread = await caller.cadastros.getById({
        entity: "servidores",
        id: testPessoaId,
      });
      expect(reread).toMatchObject({
        id: testPessoaId,
        cpf,
        cargoId: testCargoId,
        funcaoId: testFuncaoId,
      });

      const approximate = await caller.cadastros.lookup({
        entity: "pessoas",
        search: personName.replace("Maria", "Maira"),
        page: 1,
        pageSize: 10,
        preferSecretariaId: secretaria.id,
        activeOnly: true,
      });
      expect(approximate.items.some((item) => item.id === testPessoaId)).toBe(true);
      expect(approximate.items.find((item) => item.id === testPessoaId)?.metadata?.cpfMascarado)
        .toMatch(/^\*\*\*\./);

      const renamedCargo = await caller.cadastros.save({
        entity: "cargos",
        data: {
          id: testCargoId,
          codigo: `CR${suffix.slice(-8)}`,
          nome: `Cargo renomeado R2.1 ${suffix}`,
          categoria: "Teste automatizado",
          ativo: true,
        },
      });
      expect(renamedCargo.nome).toContain("renomeado");
      const [personAfterRename] = await db
        .select({ cargo: pessoas.cargo })
        .from(pessoas)
        .where(eq(pessoas.id, testPessoaId));
      expect(personAfterRename?.cargo).toBe(renamedCargo.nome);

      await caller.cadastros.bulkSetStatus({
        entity: "cargos",
        ids: [testCargoId],
        ativo: false,
      });
      await expect(
        caller.cadastros.save({
          entity: "servidores",
          data: {
            id: testPessoaId,
            nome: `${personName} Atualizado`,
            cpf,
            matricula: `MAT-${suffix}`,
            dataNascimento: "1990-05-10",
            cargoId: testCargoId,
            funcaoId: testFuncaoId,
            secretariaId: secretaria.id,
            ativo: true,
          },
        }),
      ).resolves.toMatchObject({ id: pessoaId });

      const linkedUser = await caller.usuarios.create({
        pessoaId: testPessoaId,
        username: `r21_user_${suffix}`,
        name: "Nome substituído pela Pessoa",
        email: `r21-${suffix}@example.test`,
        password: `R2.1-Teste-${suffix}`,
        role: "operador",
        secretariaId: secretaria.id,
        ativo: true,
      });
      linkedUserId = linkedUser.id;
      expect(linkedUser).toMatchObject({ pessoaId: testPessoaId, name: `${personName} Atualizado` });
      const [userBeforeUpdate] = await db
        .select({ sessionVersion: users.sessionVersion })
        .from(users)
        .where(eq(users.id, linkedUserId));

      await caller.cadastros.save({
        entity: "usuarios",
        data: {
          id: linkedUserId,
          pessoaId: testPessoaId,
          name: `${personName} Atualizado`,
          email: `r21-updated-${suffix}@example.test`,
          role: "operador",
          secretariaId: secretaria.id,
          ativo: true,
        },
      });
      const [userAfterUpdate] = await db
        .select({ sessionVersion: users.sessionVersion })
        .from(users)
        .where(eq(users.id, linkedUserId));
      expect(userAfterUpdate?.sessionVersion).toBe(
        (userBeforeUpdate?.sessionVersion ?? 0) + 1,
      );
      const [userAudit] = await db
        .select({ before: auditoriaLog.dadosAnteriores, after: auditoriaLog.dadosNovos })
        .from(auditoriaLog)
        .where(and(eq(auditoriaLog.tabela, "users"), eq(auditoriaLog.registroId, linkedUserId)))
        .limit(1);
      expect(JSON.stringify(userAudit)).not.toContain("passwordHash");
      expect(JSON.stringify(userAudit)).not.toContain("sessionVersion");

      await expect(
        caller.usuarios.create({
          pessoaId: testPessoaId,
          username: `r21_duplicate_${suffix}`,
          name: "Duplicado",
          password: `R2.1-Teste-${suffix}`,
          role: "operador",
          secretariaId: secretaria.id,
          ativo: true,
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" });

      const [beforeDeactivate] = await db
        .select({ sessionVersion: users.sessionVersion })
        .from(users)
        .where(eq(users.id, linkedUserId));
      await caller.cadastros.remove({ entity: "usuarios", id: linkedUserId });
      const [afterDeactivate] = await db
        .select({ ativo: users.ativo, sessionVersion: users.sessionVersion })
        .from(users)
        .where(eq(users.id, linkedUserId));
      expect(afterDeactivate).toMatchObject({
        ativo: false,
        sessionVersion: (beforeDeactivate?.sessionVersion ?? 0) + 1,
      });
      await caller.cadastros.bulkSetStatus({
        entity: "usuarios",
        ids: [linkedUserId],
        ativo: true,
      });
      const [afterReactivate] = await db
        .select({ ativo: users.ativo, sessionVersion: users.sessionVersion })
        .from(users)
        .where(eq(users.id, linkedUserId));
      expect(afterReactivate).toMatchObject({
        ativo: true,
        sessionVersion: (afterDeactivate?.sessionVersion ?? 0) + 1,
      });

      const operatorCaller = appRouter.createCaller({
        ...context,
        user: { ...context.user, role: "operador" },
      } as any);
      const maskedList = await operatorCaller.cadastros.list({
        entity: "pessoas",
        search: suffix,
        page: 1,
        pageSize: 10,
      });
      const maskedPerson = maskedList.items[0] as {
        cpf?: string | null;
        dataNascimento?: Date | string | null;
      } | undefined;
      expect(maskedPerson?.cpf).toMatch(/^\*\*\*\./);
      expect(maskedPerson?.dataNascimento).toBeNull();
      const maskedRecord = await operatorCaller.cadastros.getById({
        entity: "pessoas",
        id: testPessoaId,
      });
      expect(maskedRecord.cpf).toBeNull();
      expect(maskedRecord.cpfMascarado).toMatch(/^\*\*\*\./);
      expect(maskedRecord.dataNascimento).toBeNull();
      await expect(
        operatorCaller.cadastros.history({
          entity: "pessoas",
          id: testPessoaId,
          page: 1,
          pageSize: 10,
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });

      const gestorCaller = appRouter.createCaller({
        ...context,
        user: { ...context.user, role: "gestor" },
      } as any);
      await expect(
        gestorCaller.cadastros.summary({ entity: "usuarios" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        gestorCaller.cadastros.save({
          entity: "usuarios",
          data: {
            name: "Escalada negada",
            username: `r21_escalada_${suffix}`,
            password: `R2.1-Teste-${suffix}`,
            role: "admin",
            ativo: true,
          },
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    } finally {
      const auditFilters = [
        cargoId
          ? and(eq(auditoriaLog.tabela, "cargos"), eq(auditoriaLog.registroId, cargoId))
          : undefined,
        funcaoId
          ? and(eq(auditoriaLog.tabela, "funcoes"), eq(auditoriaLog.registroId, funcaoId))
          : undefined,
        pessoaId
          ? and(eq(auditoriaLog.tabela, "pessoas"), eq(auditoriaLog.registroId, pessoaId))
          : undefined,
        linkedUserId
          ? and(eq(auditoriaLog.tabela, "users"), eq(auditoriaLog.registroId, linkedUserId))
          : undefined,
      ].filter(Boolean) as any[];
      if (auditFilters.length) await db.delete(auditoriaLog).where(or(...auditFilters));
      if (linkedUserId) await db.delete(users).where(eq(users.id, linkedUserId));
      if (pessoaId) await db.delete(pessoas).where(eq(pessoas.id, pessoaId));
      if (funcaoId) await db.delete(funcoes).where(eq(funcoes.id, funcaoId));
      if (cargoId) await db.delete(cargos).where(eq(cargos.id, cargoId));
      if (createdAdminId) {
        await db
          .delete(auditoriaLog)
          .where(eq(auditoriaLog.usuarioId, createdAdminId));
      }
      if (createdAdminId) await db.delete(users).where(eq(users.id, createdAdminId));
      if (createdSecretariaId) {
        await db.delete(secretarias).where(eq(secretarias.id, createdSecretariaId));
      }
    }
  });

  it("preserva dados funcionais e remapeia com seguranca o usuario da pessoa absorvida", async () => {
    const suffix = `${Date.now()}${Math.floor(Math.random() * 10_000)}`;
    const { db, admin, caller } = await createMergeTestContext(suffix);
    let secretariaId: number | null = null;
    let cargoId: number | null = null;
    let funcaoId: number | null = null;
    let sourceId: number | null = null;
    let targetId: number | null = null;
    let linkedUserId: number | null = null;

    try {
      const [secretaria] = await db
        .insert(secretarias)
        .values({
          sigla: `M${suffix.slice(-9)}`,
          nome: `Secretaria mesclagem R2.1 ${suffix}`,
          ativo: true,
        })
        .returning();
      secretariaId = secretaria.id;

      const [cargo] = await db
        .insert(cargos)
        .values({
          codigo: `MC${suffix.slice(-8)}`,
          nome: `Cargo mesclagem R2.1 ${suffix}`,
          nomeNormalizado: `cargo mesclagem r21 ${suffix}`,
          ativo: true,
        })
        .returning();
      cargoId = cargo.id;

      const [funcao] = await db
        .insert(funcoes)
        .values({
          codigo: `MF${suffix.slice(-8)}`,
          nome: `Funcao mesclagem R2.1 ${suffix}`,
          nomeNormalizado: `funcao mesclagem r21 ${suffix}`,
          ativo: true,
        })
        .returning();
      funcaoId = funcao.id;

      const [target] = await db
        .insert(pessoas)
        .values({ nome: `Pessoa mantida ${suffix}`, ativo: true })
        .returning();
      targetId = target.id;
      const cpf = `8${suffix.replace(/\D/g, "").slice(-10).padStart(10, "0")}`;
      const [source] = await db
        .insert(pessoas)
        .values({
          nome: `Pessoa absorvida ${suffix}`,
          cpf,
          matricula: `MAT-MERGE-${suffix}`,
          dataNascimento: "1985-04-03",
          cargo: `Cargo legado preservado ${suffix}`,
          cargoId: cargo.id,
          funcaoId: funcao.id,
          secretariaId: secretaria.id,
          ativo: true,
        })
        .returning();
      sourceId = source.id;

      const [linkedUser] = await db
        .insert(users)
        .values({
          username: `r21_merge_user_${suffix}`,
          name: source.nome,
          passwordHash: hashPassword(`R2.1-Merge-User-${suffix}`),
          loginMethod: "local_password",
          role: "operador",
          pessoaId: source.id,
          secretariaId: null,
          sessionVersion: 7,
          ativo: true,
        })
        .returning();
      linkedUserId = linkedUser.id;

      const merged = await caller.cadastros.mergePessoas({
        sourceId: source.id,
        targetId: target.id,
      });
      expect(merged.pessoaMantida).toMatchObject({
        id: target.id,
        cpf,
        matricula: source.matricula,
        dataNascimento: "1985-04-03",
        cargo: source.cargo,
        cargoId: cargo.id,
        funcaoId: funcao.id,
        secretariaId: secretaria.id,
      });
      expect(merged.summary).toMatchObject({
        usuariosRemapeados: 1,
        usuariosDestinoPreservados: 0,
      });

      const [persistedTarget] = await db
        .select()
        .from(pessoas)
        .where(eq(pessoas.id, target.id));
      expect(persistedTarget).toMatchObject({
        matricula: source.matricula,
        dataNascimento: "1985-04-03",
        cargo: source.cargo,
        cargoId: cargo.id,
        funcaoId: funcao.id,
        secretariaId: secretaria.id,
      });
      const [deletedSource] = await db
        .select({ id: pessoas.id })
        .from(pessoas)
        .where(eq(pessoas.id, source.id));
      expect(deletedSource).toBeUndefined();

      const [remappedUser] = await db
        .select({
          pessoaId: users.pessoaId,
          name: users.name,
          secretariaId: users.secretariaId,
          identityProfileCompletedAt: users.identityProfileCompletedAt,
          sessionVersion: users.sessionVersion,
        })
        .from(users)
        .where(eq(users.id, linkedUser.id));
      expect(remappedUser).toMatchObject({
        pessoaId: target.id,
        name: target.nome,
        secretariaId: secretaria.id,
        sessionVersion: 8,
      });
      expect(remappedUser?.identityProfileCompletedAt).toBeInstanceOf(Date);

      const [userAudit] = await db
        .select({ before: auditoriaLog.dadosAnteriores, after: auditoriaLog.dadosNovos })
        .from(auditoriaLog)
        .where(and(eq(auditoriaLog.tabela, "users"), eq(auditoriaLog.registroId, linkedUser.id)))
        .limit(1);
      expect(userAudit?.after).toMatchObject({ pessoaId: target.id, name: target.nome });
      const serializedAudit = JSON.stringify(userAudit);
      expect(serializedAudit).not.toContain("passwordHash");
      expect(serializedAudit).not.toContain("sessionVersion");
      expect(serializedAudit).not.toContain("openId");
    } finally {
      await db.delete(auditoriaLog).where(eq(auditoriaLog.usuarioId, admin.id));
      if (linkedUserId) await db.delete(users).where(eq(users.id, linkedUserId));
      if (sourceId) await db.delete(pessoas).where(eq(pessoas.id, sourceId));
      if (targetId) await db.delete(pessoas).where(eq(pessoas.id, targetId));
      if (funcaoId) await db.delete(funcoes).where(eq(funcoes.id, funcaoId));
      if (cargoId) await db.delete(cargos).where(eq(cargos.id, cargoId));
      if (secretariaId) await db.delete(secretarias).where(eq(secretarias.id, secretariaId));
      await db.delete(users).where(eq(users.id, admin.id));
    }
  });

  it("bloqueia divergencias estruturadas sem alterar nenhum dos registros", async () => {
    const suffix = `${Date.now()}${Math.floor(Math.random() * 10_000)}`;
    const { db, admin, caller } = await createMergeTestContext(suffix);
    let sourceId: number | null = null;
    let targetId: number | null = null;

    try {
      const [target] = await db
        .insert(pessoas)
        .values({
          nome: `Pessoa conflito destino ${suffix}`,
          cpf: `7${suffix.slice(-10).padStart(10, "0")}`,
          matricula: `MAT-DEST-${suffix}`,
          dataNascimento: "1980-01-01",
          ativo: true,
        })
        .returning();
      targetId = target.id;
      const [source] = await db
        .insert(pessoas)
        .values({
          nome: `Pessoa conflito origem ${suffix}`,
          cpf: `6${suffix.slice(-10).padStart(10, "0")}`,
          matricula: `MAT-SOURCE-${suffix}`,
          dataNascimento: "1990-02-02",
          ativo: true,
        })
        .returning();
      sourceId = source.id;

      await expect(
        caller.cadastros.mergePessoas({ sourceId: source.id, targetId: target.id }),
      ).rejects.toMatchObject({ code: "CONFLICT" });

      const preservedRows = await db
        .select({ id: pessoas.id, matricula: pessoas.matricula })
        .from(pessoas)
        .where(inArray(pessoas.id, [source.id, target.id]));
      expect(preservedRows).toHaveLength(2);
      expect(preservedRows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: source.id, matricula: source.matricula }),
          expect.objectContaining({ id: target.id, matricula: target.matricula }),
        ]),
      );
    } finally {
      await db.delete(auditoriaLog).where(eq(auditoriaLog.usuarioId, admin.id));
      if (sourceId) await db.delete(pessoas).where(eq(pessoas.id, sourceId));
      if (targetId) await db.delete(pessoas).where(eq(pessoas.id, targetId));
      await db.delete(users).where(eq(users.id, admin.id));
    }
  });

  it("bloqueia a mesclagem quando origem e destino possuem usuarios distintos", async () => {
    const suffix = `${Date.now()}${Math.floor(Math.random() * 10_000)}`;
    const { db, admin, caller } = await createMergeTestContext(suffix);
    let sourceId: number | null = null;
    let targetId: number | null = null;
    const linkedUserIds: number[] = [];

    try {
      const [target] = await db
        .insert(pessoas)
        .values({ nome: `Pessoa com usuario destino ${suffix}`, ativo: true })
        .returning();
      targetId = target.id;
      const [source] = await db
        .insert(pessoas)
        .values({ nome: `Pessoa com usuario origem ${suffix}`, ativo: true })
        .returning();
      sourceId = source.id;
      const createdUsers = await db
        .insert(users)
        .values([
          {
            username: `r21_merge_source_${suffix}`,
            name: source.nome,
            passwordHash: hashPassword(`R2.1-Merge-Source-${suffix}`),
            loginMethod: "local_password",
            role: "operador" as const,
            pessoaId: source.id,
            ativo: true,
          },
          {
            username: `r21_merge_target_${suffix}`,
            name: target.nome,
            passwordHash: hashPassword(`R2.1-Merge-Target-${suffix}`),
            loginMethod: "local_password",
            role: "operador" as const,
            pessoaId: target.id,
            ativo: true,
          },
        ])
        .returning({ id: users.id, pessoaId: users.pessoaId });
      linkedUserIds.push(...createdUsers.map((row) => row.id));

      await expect(
        caller.cadastros.mergePessoas({ sourceId: source.id, targetId: target.id }),
      ).rejects.toMatchObject({ code: "CONFLICT" });

      const preservedLinks = await db
        .select({ id: users.id, pessoaId: users.pessoaId })
        .from(users)
        .where(inArray(users.id, linkedUserIds));
      expect(preservedLinks).toEqual(expect.arrayContaining(createdUsers));
      const preservedPeople = await db
        .select({ id: pessoas.id })
        .from(pessoas)
        .where(inArray(pessoas.id, [source.id, target.id]));
      expect(preservedPeople).toHaveLength(2);
    } finally {
      await db.delete(auditoriaLog).where(eq(auditoriaLog.usuarioId, admin.id));
      if (linkedUserIds.length) await db.delete(users).where(inArray(users.id, linkedUserIds));
      if (sourceId) await db.delete(pessoas).where(eq(pessoas.id, sourceId));
      if (targetId) await db.delete(pessoas).where(eq(pessoas.id, targetId));
      await db.delete(users).where(eq(users.id, admin.id));
    }
  });

  it("preserva e sincroniza o usuario ja vinculado a pessoa de destino", async () => {
    const suffix = `${Date.now()}${Math.floor(Math.random() * 10_000)}`;
    const { db, admin, caller } = await createMergeTestContext(suffix);
    let secretariaId: number | null = null;
    let cargoId: number | null = null;
    let sourceId: number | null = null;
    let targetId: number | null = null;
    let linkedUserId: number | null = null;

    try {
      const [secretaria] = await db
        .insert(secretarias)
        .values({
          sigla: `D${suffix.slice(-9)}`,
          nome: `Secretaria destino R2.1 ${suffix}`,
          ativo: true,
        })
        .returning();
      secretariaId = secretaria.id;
      const [cargo] = await db
        .insert(cargos)
        .values({
          codigo: `DC${suffix.slice(-8)}`,
          nome: `Cargo destino R2.1 ${suffix}`,
          nomeNormalizado: `cargo destino r21 ${suffix}`,
          ativo: true,
        })
        .returning();
      cargoId = cargo.id;

      const [target] = await db
        .insert(pessoas)
        .values({ nome: `Pessoa destino preservada ${suffix}`, ativo: true })
        .returning();
      targetId = target.id;
      const [source] = await db
        .insert(pessoas)
        .values({
          nome: `Pessoa origem complementar ${suffix}`,
          cpf: `5${suffix.replace(/\D/g, "").slice(-10).padStart(10, "0")}`,
          matricula: `MAT-DESTINO-${suffix}`,
          dataNascimento: "1988-06-15",
          cargo: cargo.nome,
          cargoId: cargo.id,
          secretariaId: secretaria.id,
          ativo: true,
        })
        .returning();
      sourceId = source.id;
      const [linkedUser] = await db
        .insert(users)
        .values({
          username: `r21_merge_target_only_${suffix}`,
          name: target.nome,
          passwordHash: hashPassword(`R2.1-Merge-Target-Only-${suffix}`),
          loginMethod: "local_password",
          role: "operador",
          pessoaId: target.id,
          secretariaId: null,
          identityProfileCompletedAt: null,
          sessionVersion: 3,
          ativo: true,
        })
        .returning();
      linkedUserId = linkedUser.id;

      const merged = await caller.cadastros.mergePessoas({
        sourceId: source.id,
        targetId: target.id,
      });
      expect(merged.summary).toMatchObject({
        usuariosRemapeados: 0,
        usuariosDestinoPreservados: 1,
        usuariosDestinoSincronizados: 1,
      });

      const [synchronizedUser] = await db
        .select({
          pessoaId: users.pessoaId,
          name: users.name,
          secretariaId: users.secretariaId,
          identityProfileCompletedAt: users.identityProfileCompletedAt,
          sessionVersion: users.sessionVersion,
        })
        .from(users)
        .where(eq(users.id, linkedUser.id));
      expect(synchronizedUser).toMatchObject({
        pessoaId: target.id,
        name: target.nome,
        secretariaId: secretaria.id,
        sessionVersion: 4,
      });
      expect(synchronizedUser?.identityProfileCompletedAt).toBeInstanceOf(Date);
    } finally {
      await db.delete(auditoriaLog).where(eq(auditoriaLog.usuarioId, admin.id));
      if (linkedUserId) await db.delete(users).where(eq(users.id, linkedUserId));
      if (sourceId) await db.delete(pessoas).where(eq(pessoas.id, sourceId));
      if (targetId) await db.delete(pessoas).where(eq(pessoas.id, targetId));
      if (cargoId) await db.delete(cargos).where(eq(cargos.id, cargoId));
      if (secretariaId) await db.delete(secretarias).where(eq(secretarias.id, secretariaId));
      await db.delete(users).where(eq(users.id, admin.id));
    }
  });
});

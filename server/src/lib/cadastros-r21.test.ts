import { describe, expect, it } from "vitest";

import {
  cadastroGetByIdInputSchema,
  cadastroLookupInputSchema,
  cadastroSaveInputSchema,
  pessoaCadastroSchema,
  servidorCadastroSchema,
} from "@sirel/shared/schemas/cadastros";

import {
  buildCadastroLookupTrigrams,
  canUseCadastroCatalogSelection,
  maskCadastroCpf,
  normalizeCadastroLookupText,
  sanitizeCadastroAuditData,
} from "../routers/cadastros.js";

describe("contratos de cadastros R2.1", () => {
  it("normaliza acentos, caixa e espacos para busca e unicidade", () => {
    expect(normalizeCadastroLookupText("  Agênte   de CONTRATAÇÃO  ")).toBe(
      "agente de contratacao",
    );
  });

  it("mascara CPF sem expor o documento completo", () => {
    expect(maskCadastroCpf("123.456.789-01")).toBe("***.456.***-01");
    expect(maskCadastroCpf("123")).toBeNull();
  });

  it("aceita Pessoa generica sem cargo estruturado", () => {
    const parsed = pessoaCadastroSchema.safeParse({
      nome: "Pessoa sem vinculo funcional",
      ativo: true,
    });
    expect(parsed.success).toBe(true);
  });

  it("impede que Pessoa com secretaria contorne os campos obrigatorios de Servidor", () => {
    const parsed = pessoaCadastroSchema.safeParse({
      nome: "Pessoa promovida de forma incompleta",
      secretariaId: 1,
      ativo: true,
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.cargoId).toContain(
        "Selecione o cargo do servidor.",
      );
      expect(parsed.error.flatten().fieldErrors.matricula).toContain(
        "Informe a matricula do servidor.",
      );
      expect(parsed.error.flatten().fieldErrors.dataNascimento).toContain(
        "Informe a data de nascimento do servidor.",
      );
    }
  });

  it("exige cargo estruturado para Servidor", () => {
    const parsed = servidorCadastroSchema.safeParse({
      nome: "Servidor Municipal",
      matricula: "001234",
      dataNascimento: "1990-05-10",
      secretariaId: 1,
      ativo: true,
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.cargoId).toContain(
        "Selecione o cargo do servidor.",
      );
    }
  });

  it("preserva o id da Pessoa existente ao promover para Servidor", () => {
    const parsed = cadastroSaveInputSchema.parse({
      entity: "servidores",
      data: {
        id: 42,
        nome: "Servidor Existente",
        matricula: "001234",
        dataNascimento: "1990-05-10",
        secretariaId: 1,
        cargoId: 2,
        funcaoId: null,
        ativo: true,
      },
    });
    expect(parsed.data.id).toBe(42);
  });

  it("aplica paginacao limitada e defaults no lookup", () => {
    expect(cadastroLookupInputSchema.parse({ entity: "pessoas" })).toMatchObject({
      page: 1,
      pageSize: 20,
      activeOnly: true,
    });
    expect(
      cadastroLookupInputSchema.safeParse({ entity: "pessoas", pageSize: 51 }).success,
    ).toBe(false);
    expect(
      cadastroLookupInputSchema.parse({
        entity: "pessoas",
        preferSecretariaId: 9,
      }).preferSecretariaId,
    ).toBe(9);
  });

  it("gera fragmentos que mantem nomes curtos com transposicao como candidatos", () => {
    const maria = buildCadastroLookupTrigrams("Maria");
    const maira = buildCadastroLookupTrigrams("Maira");
    expect(maria.some((fragment) => maira.includes(fragment))).toBe(true);
  });

  it("permite manter catalogo inativo existente, mas nao criar uma nova associacao", () => {
    const inactiveCargo = { id: 4, ativo: false };
    expect(canUseCadastroCatalogSelection(4, inactiveCargo, 4)).toBe(true);
    expect(canUseCadastroCatalogSelection(4, inactiveCargo, null)).toBe(false);
    expect(canUseCadastroCatalogSelection(5, undefined, 5)).toBe(false);
  });

  it("remove segredos de snapshots de auditoria inclusive em objetos aninhados", () => {
    expect(
      sanitizeCadastroAuditData({
        id: 1,
        passwordHash: "hash",
        resetTokenHash: "token-hash",
        nested: { sessionVersion: 3, clientSecret: "secret", name: "Usuario" },
      }),
    ).toEqual({ id: 1, nested: { name: "Usuario" } });
  });

  it("tipa leitura individual para os novos catalogos", () => {
    expect(cadastroGetByIdInputSchema.parse({ entity: "cargos", id: 7 })).toEqual({
      entity: "cargos",
      id: 7,
    });
    expect(cadastroGetByIdInputSchema.parse({ entity: "funcoes", id: 8 })).toEqual({
      entity: "funcoes",
      id: 8,
    });
  });
});

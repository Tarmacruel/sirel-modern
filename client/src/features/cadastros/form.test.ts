import { describe, expect, it } from "vitest";

import {
  applyPessoaToServidorForm,
  applyPessoaToUsuarioForm,
  buildCadastroPayload,
  maskCnpj,
  maskPhone,
  persistenceMismatchFields,
  resolveCadastroIdentityStatus,
  validateCadastroForm,
} from "@/features/cadastros/form";

describe("cadastros form", () => {
  it("aplica máscara de CNPJ", () => {
    expect(maskCnpj("12345678000199")).toBe("12.345.678/0001-99");
  });

  it("aplica máscara de telefone com celular", () => {
    expect(maskPhone("73999887766")).toBe("(73) 99988-7766");
  });

  it("normaliza payload de fornecedor para validação", () => {
    const payload = buildCadastroPayload("fornecedores", {
      razaoSocial: "Fornecedor Teste",
      cnpj: "12.345.678/0001-99",
      email: "fornecedor@sirel.local",
      telefone: "73999887766",
      cidade: "Teixeira de Freitas",
      estado: "ba",
      ativo: true,
    });

    expect(payload).toEqual({
      id: undefined,
      razaoSocial: "Fornecedor Teste",
      cnpj: "12345678000199",
      email: "fornecedor@sirel.local",
      telefone: "(73) 99988-7766",
      cidade: "Teixeira de Freitas",
      estado: "BA",
      ativo: true,
    });
  });

  it("exige secretaria para usuário gestor", () => {
    const result = validateCadastroForm("usuarios", {
      username: "gestor.teste",
      name: "Gestor Teste",
      email: "gestor@sirel.local",
      role: "gestor",
      secretariaId: "",
      password: "Senha123",
      ativo: true,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.secretariaId).toBeTruthy();
    }
  });

  it("normaliza identidade funcional de servidor", () => {
    const result = validateCadastroForm("servidores", {
      nome: "Servidor Teste",
      cpf: "123.456.789-01",
      matricula: " MAT-001 ",
      dataNascimento: "1990-05-12",
      cargo: "Agente",
      cargoId: "4",
      secretariaId: "2",
      ativo: true,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toMatchObject({
        matricula: "MAT-001",
        dataNascimento: "1990-05-12",
      });
    }
  });

  it("inclui pessoa vinculada no payload de usuário", () => {
    const payload = buildCadastroPayload("usuarios", {
      username: "operador.teste",
      name: "Operador Teste",
      email: "operador@sirel.local",
      role: "operador",
      secretariaId: "3",
      pessoaId: "7",
      password: "Senha123",
      ativo: true,
    });

    expect(payload).toMatchObject({
      pessoaId: 7,
      secretariaId: 3,
    });
  });

  it("reutiliza o ID da Pessoa ao completar o cadastro como Servidor", () => {
    const form = applyPessoaToServidorForm(
      {
        nome: "",
        cpf: "",
        matricula: "",
        dataNascimento: "",
        cargoId: "",
        funcaoId: "",
        secretariaId: "",
        ativo: true,
      },
      {
        id: 42,
        nome: "Maria Servidora",
        cpf: "12345678901",
        dataNascimento: "1985-04-20",
        secretariaId: 3,
        cargoId: 8,
        funcaoId: 5,
      },
    );

    const payload = buildCadastroPayload("servidores", {
      ...form,
      matricula: "MAT-42",
    });
    expect(payload).toMatchObject({
      id: 42,
      nome: "Maria Servidora",
      matricula: "MAT-42",
      secretariaId: 3,
      cargoId: 8,
      funcaoId: 5,
    });
  });

  it("autopreenche nome e secretaria do Usuário pela Pessoa selecionada", () => {
    const form = applyPessoaToUsuarioForm(
      { name: "Nome anterior", secretariaId: "", pessoaId: "" },
      { id: 17, nome: "Pessoa Canônica", secretariaId: 9, secretariaNome: "Administração" },
    );

    expect(form).toMatchObject({
      pessoaId: "17",
      name: "Pessoa Canônica",
      secretariaId: "9",
      identityStatus: "incompleto",
    });
  });

  it("marca como completo o vínculo com Pessoa que possui os campos de identidade", () => {
    const form = applyPessoaToUsuarioForm(
      { name: "", secretariaId: "", pessoaId: "" },
      {
        id: 18,
        nome: "Pessoa Completa",
        cpf: "12345678901",
        matricula: "MAT-18",
        dataNascimento: "1990-01-02",
      },
    );

    expect(form.identityStatus).toBe("completo");
  });

  it("detecta divergência na leitura de confirmação", () => {
    expect(
      persistenceMismatchFields(
        "servidores",
        { matricula: "MAT-10", dataNascimento: "1991-02-03", cargoId: 4 },
        { matricula: "MAT-ANTIGA", dataNascimento: "1991-02-03T00:00:00.000Z", cargoId: 4 },
      ),
    ).toEqual(["matricula"]);
  });

  it("classifica explicitamente o estado do vínculo de identidade", () => {
    expect(resolveCadastroIdentityStatus({ pessoaId: null })).toBe("sem-vinculo");
    expect(resolveCadastroIdentityStatus({ pessoaId: 1, identityStatus: "incompleto" })).toBe("incompleto");
    expect(resolveCadastroIdentityStatus({ pessoaId: 1, identityStatus: "completo" })).toBe("completo");
    expect(resolveCadastroIdentityStatus({ pessoaId: 1, identityStatus: "conflito" })).toBe("conflito");
  });
});

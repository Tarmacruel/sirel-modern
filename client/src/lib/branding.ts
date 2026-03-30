import { useEffect, useMemo } from "react";

import { trpc } from "@/lib/trpc";

export const systemName = "SIREL";
export const systemFullName = "SIREL - Sistema de Registro e Gestão de Licitações";
export const systemFooterText = `${systemFullName} - Desenvolvido por Jonatas da Silva Sousa`;
export const prefeituraLogoUrl = "/prefeitura-teixeira-freitas.svg";
export const prefeituraLines = [
  "MUNICIPIO DE TEIXEIRA DE FREITAS",
  "PREFEITURA MUNICIPAL DE TEIXEIRA DE FREITAS",
  "CNPJ: 13.650.403/0001-28",
  "AV MARECHAL CASTELO BRANCO, 145, CENTRO, 45985160, TEIXEIRA DE FREITAS-BA",
] as const;

export interface RuntimeBrandingSnapshot {
  systemName: string;
  systemFooterText: string;
  prefeituraLogoUrl: string;
  prefeituraLines: readonly [string, string, string, string];
  corPrimaria: string;
  corSecundaria: string;
}

let runtimeSnapshot: RuntimeBrandingSnapshot = {
  systemName,
  systemFooterText,
  prefeituraLogoUrl,
  prefeituraLines,
  corPrimaria: "",
  corSecundaria: "",
};

function asString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function isHexColor(value: string) {
  return /^#[0-9A-F]{6}$/i.test(value);
}

function normalizeLogoUrl(value: string) {
  if (!value) return prefeituraLogoUrl;
  if (value === "/dist/prefeitura-teixeira-freitas.svg") return prefeituraLogoUrl;
  if (value.startsWith("/dist/")) return value.replace(/^\/dist\//, "/");
  return value;
}

export function useRuntimeBranding() {
  const nomeOrgao = trpc.parametros.obterValor.useQuery({ chave: "INSTITUCIONAL.NOME_ORGAO" }, { retry: false, staleTime: 300_000 });
  const cnpjOrgao = trpc.parametros.obterValor.useQuery({ chave: "INSTITUCIONAL.CNPJ_ORGAO" }, { retry: false, staleTime: 300_000 });
  const endereco = trpc.parametros.obterValor.useQuery({ chave: "INSTITUCIONAL.ENDERECO" }, { retry: false, staleTime: 300_000 });
  const logoUrl = trpc.parametros.obterValor.useQuery({ chave: "VISUAL.LOGO_URL" }, { retry: false, staleTime: 300_000 });
  const corPrimaria = trpc.parametros.obterValor.useQuery({ chave: "VISUAL.COR_PRIMARIA" }, { retry: false, staleTime: 300_000 });
  const corSecundaria = trpc.parametros.obterValor.useQuery({ chave: "VISUAL.COR_SECUNDARIA" }, { retry: false, staleTime: 300_000 });
  const rodape = trpc.parametros.obterValor.useQuery({ chave: "SISTEMA.RODAPE" }, { retry: false, staleTime: 300_000 });

  const data = useMemo<RuntimeBrandingSnapshot>(() => {
    const nome = asString(nomeOrgao.data?.valor, prefeituraLines[1]);
    const cnpj = asString(cnpjOrgao.data?.valor, "13.650.403/0001-28");
    const enderecoValue = (endereco.data?.valor ?? {}) as Record<string, unknown>;
    const enderecoStr = [
      asString(enderecoValue.logradouro),
      asString(enderecoValue.numero),
      asString(enderecoValue.bairro),
      asString(enderecoValue.cep),
      asString(enderecoValue.municipio),
      asString(enderecoValue.uf),
    ]
      .filter(Boolean)
      .join(", ");

    return {
      systemName,
      systemFooterText: asString(rodape.data?.valor, systemFooterText),
      prefeituraLogoUrl: normalizeLogoUrl(asString(logoUrl.data?.valor, prefeituraLogoUrl)),
      prefeituraLines: [
        "MUNICIPIO DE TEIXEIRA DE FREITAS",
        nome,
        `CNPJ: ${cnpj}`,
        enderecoStr || prefeituraLines[3],
      ] as const,
      corPrimaria: asString(corPrimaria.data?.valor, ""),
      corSecundaria: asString(corSecundaria.data?.valor, ""),
    };
  }, [cnpjOrgao.data?.valor, corPrimaria.data?.valor, corSecundaria.data?.valor, endereco.data?.valor, logoUrl.data?.valor, nomeOrgao.data?.valor, rodape.data?.valor]);

  useEffect(() => {
    runtimeSnapshot = data;
    if (typeof document === "undefined") return;
    document.documentElement.style.removeProperty("--color-primary-500");
    document.documentElement.style.removeProperty("--color-primary-700");
    document.documentElement.style.removeProperty("--color-primary-900");
    if (isHexColor(data.corPrimaria)) {
      document.documentElement.style.setProperty("--brand-primary", data.corPrimaria);
    } else {
      document.documentElement.style.removeProperty("--brand-primary");
    }
    if (isHexColor(data.corSecundaria)) {
      document.documentElement.style.setProperty("--brand-secondary", data.corSecundaria);
    } else {
      document.documentElement.style.removeProperty("--brand-secondary");
    }
  }, [data.corPrimaria, data.corSecundaria]);

  return data;
}

export function getRuntimeBrandingSnapshot() {
  return runtimeSnapshot;
}

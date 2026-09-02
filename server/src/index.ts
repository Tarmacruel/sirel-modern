import "./bootstrap/load-env.js";

import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import cors from "cors";
import express from "express";
import helmet from "helmet";
import multer from "multer";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { and, asc, desc, eq, gt, inArray, sql } from "drizzle-orm";
import {
  ataSessaoApplyInputSchema,
  ataSessaoCreatePreviewFromDiscoveryInputSchema,
  ataSessaoPreviewProcessInputSchema,
} from "@sirel/shared/schemas/ata-sessao";
import { documentoTipoOptions } from "@sirel/shared/schemas/documentos";

import { createContext } from "./_core/context.js";
import { logAuditoria } from "./db/auditoria.js";
import { requireDb } from "./db/client.js";
import {
  atosDesignacao,
  catalogoItens,
  documentoClassificacoes,
  documentos,
  fornecedores,
  itensProcesso,
  movimentacoesWorkflow,
  processos,
  propostasLicitacao,
} from "./db/schema.js";
import {
  generateAtaSessaoReports,
  isAtaSessaoReportInputError,
} from "./lib/ata-sessao-reports.js";
import {
  ataSessaoMulterClientErrorMessage,
  collectMulterFilePaths,
  hasPdfFileSignature,
  removeAutomaticReportDirectory,
  removeTransientUploadFiles,
} from "./lib/ata-sessao-upload.js";
import {
  applyAtaSessaoPreview,
  createAtaSessaoPreviewFromDiscovery,
  createAtaSessaoPreviewFromDocumento,
  discoverAtaSessaoProcess,
} from "./lib/ata-sessao-sync.js";
import {
  startBllLocalScheduler,
  stopBllLocalScheduler,
} from "./lib/bll-sync-local.js";
import { startImportacoesScheduler } from "./lib/importacoes-bll.js";
import {
  isAllowedCorsOrigin,
  resolveAllowedOrigins,
} from "./lib/cors-origins.js";
import { projectRoot } from "./lib/project-root.js";
import { resolveRequestUser } from "./lib/request-auth.js";
import { assertSessionSecretConfigured } from "./lib/auth-session.js";
import { hasValidCsrfToken } from "./lib/csrf.js";
import { documentoEstaPublicamenteDisponivel } from "./lib/document-publication.js";
import {
  nextDocumentoVersao,
  resolveDocumentoRaizId,
} from "./lib/document-lineage.js";
import { verifyPublicDocumentLink } from "./lib/public-document-link.js";
import { registerArquivosHttp } from "./modules/arquivos/http.js";
import { startArquivosRuntime } from "./modules/arquivos/runtime.js";
import {
  isTransparencyPortalPathAllowed,
  isTransparencyPortalRequest,
  isTransparencyPortalSameOrigin,
} from "./lib/transparency-portal-host.js";
import { parseSdReport } from "./lib/sd-reports.js";
import { appRouter } from "./routers/index.js";

const app = express();
assertSessionSecretConfigured();
const trustProxy = String(process.env.TRUST_PROXY ?? "").trim();
if (trustProxy === "true" || /^\d+$/.test(trustProxy)) {
  app.set("trust proxy", trustProxy === "true" ? 1 : Number(trustProxy));
}
const port = Number(process.env.PORT ?? 3030);
const host = process.env.HOST ?? "127.0.0.1";
const isProduction = process.env.NODE_ENV === "production";
const clientUrl =
  process.env.CLIENT_URL ?? (isProduction ? "" : "http://localhost:5173");
const currentDir = dirname(fileURLToPath(import.meta.url));
const uploadsRoot = resolve(projectRoot, "storage/uploads");
const legacyUploadsRoot = resolve(projectRoot, "../storage/uploads");
const cadastroAssetsRoot = join(uploadsRoot, "cadastros");
const atosDesignacaoUploadsRoot = join(
  uploadsRoot,
  "cadastros-institucionais",
  "atos",
);
const ataSessaoReportsRoot = resolve(
  projectRoot,
  "storage/reports/atas-sessao",
);
const ataSessaoUploadsRoot = join(ataSessaoReportsRoot, "uploads");
const sdReportsRoot = resolve(projectRoot, "storage/reports/sd");
const sdUploadsRoot = join(sdReportsRoot, "uploads");
const clientDistRoot = resolveClientDistRoot();
const clientIndexHtml = join(clientDistRoot, "index.html");

if (!existsSync(uploadsRoot)) {
  mkdirSync(uploadsRoot, { recursive: true });
}
if (!existsSync(cadastroAssetsRoot)) {
  mkdirSync(cadastroAssetsRoot, { recursive: true });
}
if (!existsSync(atosDesignacaoUploadsRoot)) {
  mkdirSync(atosDesignacaoUploadsRoot, { recursive: true });
}
if (!existsSync(ataSessaoUploadsRoot)) {
  mkdirSync(ataSessaoUploadsRoot, { recursive: true });
}
if (!existsSync(sdUploadsRoot)) {
  mkdirSync(sdUploadsRoot, { recursive: true });
}

function resolveDocumentoPath(arquivoChave: string) {
  const normalizedKey = arquivoChave.replace(/\\/g, "/").replace(/^\/+/, "");
  const candidates = Array.from(
    new Set([
      join(uploadsRoot, normalizedKey),
      join(legacyUploadsRoot, normalizedKey),
      normalizedKey,
    ]),
  );

  return (
    candidates.find((candidate) => existsSync(candidate)) ??
    join(uploadsRoot, normalizedKey)
  );
}

function slugifyFileName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function parseStringArrayField(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return [];

  if (raw.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item).trim()).filter(Boolean);
      }
    } catch {
      return [];
    }
  }

  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isAllowedAtoDesignacaoFile(file: Express.Multer.File) {
  const allowedExtensions = new Set([
    ".pdf",
    ".doc",
    ".docx",
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
  ]);
  const allowedMimeTypes = new Set([
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "image/png",
    "image/jpeg",
    "image/webp",
  ]);
  const extension = extname(file.originalname).toLowerCase();
  return (
    allowedExtensions.has(extension) && allowedMimeTypes.has(file.mimetype)
  );
}

function buildUploadRelativePath(file: Express.Multer.File) {
  return (
    file.path.replace(/\\/g, "/").split("/storage/uploads/").pop() ??
    file.filename
  );
}

function resolveClientDistRoot() {
  const candidates = [
    resolve(currentDir, "../../client/dist"),
    resolve(currentDir, "../../../client/dist"),
    resolve(currentDir, "../../../../client/dist"),
    resolve(process.cwd(), "client/dist"),
    resolve(process.cwd(), "../client/dist"),
  ];

  return (
    candidates.find((candidate) => existsSync(join(candidate, "index.html"))) ??
    candidates[0]
  );
}

function shouldServeSpaFallback(req: express.Request) {
  const method = req.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") return false;
  if (req.path === "/api" || req.path.startsWith("/api/")) return false;
  if (req.path === "/healthz") return false;
  if (extname(req.path)) return false;

  return existsSync(clientIndexHtml);
}

function requireUploadUser(req: express.Request, res: express.Response) {
  const user = resolveRequestUser(req);
  if (!user) {
    res.status(401).json({ message: "Login obrigatório." });
    return null;
  }
  if (!["admin", "gestor", "operador"].includes(user.role)) {
    res.status(403).json({
      message: "Acesso restrito a operadores, gestores e administradores.",
    });
    return null;
  }
  return user;
}

function removeUploadedFile(file: Express.Multer.File | undefined) {
  if (!file?.path) return;
  try {
    rmSync(file.path, { force: true });
  } catch {
    // A falha de limpeza não deve ocultar a resposta de validação ao cliente.
  }
}

function requireAuthenticatedUser(req: express.Request, res: express.Response) {
  const user = resolveRequestUser(req);
  if (!user) {
    res.status(401).json({ message: "Login obrigatorio." });
    return null;
  }
  return user;
}

function requireUploadAccess(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  if (!requireUploadUser(req, res)) return;
  if (!hasValidCsrfToken(req)) {
    res.status(403).json({ message: "Validacao CSRF obrigatoria." });
    return;
  }
  next();
}

function isAllowedDocumentFile(file: Express.Multer.File) {
  const extension = extname(file.originalname).toLowerCase();
  const allowed = new Map([
    [".pdf", "application/pdf"],
    [".doc", "application/msword"],
    [
      ".docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    [".png", "image/png"],
    [".jpg", "image/jpeg"],
    [".jpeg", "image/jpeg"],
    [".webp", "image/webp"],
  ]);
  return allowed.get(extension) === file.mimetype;
}

const storage = multer.diskStorage({
  destination(req, _file, callback) {
    const processoId =
      String(req.body.processoId ?? "geral").replace(/\D+/g, "") || "geral";
    const targetDir = join(uploadsRoot, `processo-${processoId}`);
    mkdirSync(targetDir, { recursive: true });
    callback(null, targetDir);
  },
  filename(_req, file, callback) {
    const extension = extname(file.originalname) || "";
    callback(null, `${randomUUID()}${extension.toLowerCase()}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 25 * 1024 * 1024,
    files: 1,
    fields: 20,
    parts: 22,
    fieldNameSize: 100,
    fieldSize: 100_000,
  },
  fileFilter(_req, file, callback) {
    callback(null, isAllowedDocumentFile(file));
  },
});

const cadastroAssetStorage = multer.diskStorage({
  destination(req, _file, callback) {
    const entity = String(req.body.entity ?? "")
      .trim()
      .toLowerCase();
    const recordId =
      String(req.body.recordId ?? "").replace(/\D+/g, "") || "geral";
    const targetDir = join(cadastroAssetsRoot, `${entity}-${recordId}`);
    mkdirSync(targetDir, { recursive: true });
    callback(null, targetDir);
  },
  filename(_req, file, callback) {
    const extension = extname(file.originalname) || "";
    const baseName =
      slugifyFileName(file.originalname.replace(extension, "")) || "arquivo";
    callback(null, `${Date.now()}-${baseName}${extension.toLowerCase()}`);
  },
});

const cadastroAssetUpload = multer({
  storage: cadastroAssetStorage,
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 8, parts: 10 },
  fileFilter(_req, file, callback) {
    callback(
      null,
      ["image/png", "image/jpeg", "image/webp"].includes(file.mimetype) &&
        [".png", ".jpg", ".jpeg", ".webp"].includes(
          extname(file.originalname).toLowerCase(),
        ),
    );
  },
});

const atoDesignacaoStorage = multer.diskStorage({
  destination(_req, _file, callback) {
    mkdirSync(atosDesignacaoUploadsRoot, { recursive: true });
    callback(null, atosDesignacaoUploadsRoot);
  },
  filename(_req, file, callback) {
    const extension = extname(file.originalname) || ".pdf";
    const baseName =
      slugifyFileName(file.originalname.replace(extension, "")) ||
      "ato-designacao";
    callback(null, `${Date.now()}-${baseName}${extension.toLowerCase()}`);
  },
});

const atoDesignacaoUpload = multer({
  storage: atoDesignacaoStorage,
  limits: { fileSize: 25 * 1024 * 1024, files: 1, fields: 8, parts: 10 },
  fileFilter(_req, file, callback) {
    callback(null, isAllowedDocumentFile(file));
  },
});

const ataSessaoStorage = multer.diskStorage({
  destination(_req, _file, callback) {
    mkdirSync(ataSessaoUploadsRoot, { recursive: true });
    callback(null, ataSessaoUploadsRoot);
  },
  filename(_req, file, callback) {
    const extension = extname(file.originalname) || ".pdf";
    const baseName =
      slugifyFileName(file.originalname.replace(extension, "")) || "ata-sessao";
    callback(
      null,
      `${Date.now()}-${randomUUID()}-${baseName}${extension.toLowerCase()}`,
    );
  },
});

const ataSessaoUpload = multer({
  storage: ataSessaoStorage,
  limits: { fileSize: 25 * 1024 * 1024, files: 2, fields: 12, parts: 15 },
  fileFilter(_req, file, callback) {
    callback(null, extname(file.originalname).toLowerCase() === ".pdf");
  },
});

const ataSessaoStandaloneUpload = ataSessaoUpload.fields([
  { name: "arquivo", maxCount: 1 },
  { name: "sdArquivo", maxCount: 1 },
]);

function receiveAtaSessaoStandaloneFiles(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  ataSessaoStandaloneUpload(req, res, (error) => {
    if (!error) {
      next();
      return;
    }

    removeTransientUploadFiles(
      collectMulterFilePaths(req.files),
      ataSessaoUploadsRoot,
    );
    const clientMessage = ataSessaoMulterClientErrorMessage(error);
    if (clientMessage) {
      res.status(400).json({ message: clientMessage });
      return;
    }
    next(error);
  });
}

const sdStorage = multer.diskStorage({
  destination(_req, _file, callback) {
    mkdirSync(sdUploadsRoot, { recursive: true });
    callback(null, sdUploadsRoot);
  },
  filename(_req, file, callback) {
    const extension = extname(file.originalname) || ".pdf";
    const baseName =
      slugifyFileName(file.originalname.replace(extension, "")) || "sd";
    callback(null, `${Date.now()}-${baseName}${extension.toLowerCase()}`);
  },
});

const sdUpload = multer({
  storage: sdStorage,
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 10, parts: 12 },
  fileFilter(_req, file, callback) {
    callback(null, extname(file.originalname).toLowerCase() === ".pdf");
  },
});

type SdManualItem = {
  numero?: number;
  descricao: string;
  unidade?: string;
  quantidade?: number;
  preco_unitario?: number;
  preco_total?: number;
};

function normalizeSdManualItem(payload: unknown): SdManualItem | null {
  if (!payload || typeof payload !== "object") return null;
  const source = payload as Record<string, unknown>;
  const descricao = String(source.descricao ?? "").trim();
  if (!descricao) return null;
  const numero = Number(source.numero ?? 0);
  const quantidade = Number(source.quantidade ?? NaN);
  const precoUnitario = Number(source.preco_unitario ?? NaN);
  const precoTotal = Number(source.preco_total ?? NaN);

  return {
    numero: Number.isFinite(numero) && numero > 0 ? numero : undefined,
    descricao,
    unidade: String(source.unidade ?? "").trim() || undefined,
    quantidade: Number.isFinite(quantidade) ? quantidade : undefined,
    preco_unitario: Number.isFinite(precoUnitario) ? precoUnitario : undefined,
    preco_total: Number.isFinite(precoTotal) ? precoTotal : undefined,
  };
}

function parseSdNumberish(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const normalized =
    raw.includes(",") &&
    (!raw.includes(".") || raw.lastIndexOf(",") > raw.lastIndexOf("."))
      ? raw.replace(/\./g, "").replace(",", ".")
      : raw.replace(/,/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatSdDecimal(value: number, scale: number) {
  return value.toFixed(scale);
}

function buildSdArtifact(
  relativePath: string,
  downloadBasePath: string,
  label: string,
) {
  return {
    label,
    relativePath,
    downloadUrl: `${downloadBasePath}?file=${encodeURIComponent(relativePath)}`,
  };
}

function resolveSdArtifactPath(relativePath: string) {
  const normalizedRelativePath = String(relativePath ?? "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
  if (!normalizedRelativePath) {
    throw new Error("Arquivo base do parse não informado.");
  }

  const absolutePath = resolve(sdReportsRoot, normalizedRelativePath);
  const normalizedRoot = resolve(sdReportsRoot).replace(/\\/g, "/");
  const normalizedTarget = absolutePath.replace(/\\/g, "/");
  if (!normalizedTarget.startsWith(normalizedRoot)) {
    throw new Error("Arquivo base inválido.");
  }
  if (!existsSync(absolutePath)) {
    throw new Error("Arquivo base do parse não encontrado.");
  }

  return {
    absolutePath,
    relativePath: normalizedRelativePath,
  };
}

function finalizeSdPayload(params: {
  relativePath: string;
  manualItemsRaw: unknown[];
  downloadBasePath: string;
}) {
  const { absolutePath, relativePath } = resolveSdArtifactPath(
    params.relativePath,
  );
  const manualItems = params.manualItemsRaw
    .map((item: unknown) => normalizeSdManualItem(item))
    .filter((item: SdManualItem | null): item is SdManualItem => Boolean(item));

  const basePayload = JSON.parse(readFileSync(absolutePath, "utf-8")) as Record<
    string,
    unknown
  >;
  const baseItems = Array.isArray(basePayload.itens) ? basePayload.itens : [];
  const mergedItems = [
    ...baseItems,
    ...manualItems.map((item: SdManualItem) => ({ ...item, fonte: "manual" })),
  ];
  const baseSummary = (basePayload.summary as Record<string, unknown>) ?? {};
  const mergedPayload = {
    ...basePayload,
    summary: {
      ...baseSummary,
      total_itens: mergedItems.length,
    },
    itens: mergedItems,
    manual_items: manualItems,
    finalized_at: new Date().toISOString(),
  };

  const finalRelativePath = relativePath.replace(/\.json$/i, "-final.json");
  const finalAbsolutePath = resolve(sdReportsRoot, finalRelativePath);
  writeFileSync(
    finalAbsolutePath,
    JSON.stringify(mergedPayload, null, 2),
    "utf-8",
  );

  return {
    manualItems,
    mergedPayload,
    finalRelativePath,
    artifact: buildSdArtifact(
      finalRelativePath,
      params.downloadBasePath,
      "JSON SD finalizado",
    ),
  };
}

type SdProcessImportItem = {
  numeroItem?: number;
  descricao: string;
  unidade: string;
  quantidade: string;
  valorUnitarioEstimado: string | null;
  valorTotalEstimado: string | null;
};

function normalizeSdImportItem(payload: unknown): SdProcessImportItem | null {
  if (!payload || typeof payload !== "object") return null;

  const source = payload as Record<string, unknown>;
  const descricao = String(source.descricao ?? "").trim();
  if (!descricao) return null;

  const numeroItem = Number(source.numero ?? 0);
  let quantidade = parseSdNumberish(source.quantidade);
  const valorUnitario = parseSdNumberish(source.preco_unitario);
  let valorTotal = parseSdNumberish(source.preco_total);

  if ((quantidade === null || quantidade <= 0) && valorUnitario && valorTotal) {
    quantidade = valorTotal / valorUnitario;
  }

  if ((valorTotal === null || valorTotal <= 0) && valorUnitario && quantidade) {
    valorTotal = valorUnitario * quantidade;
  }

  return {
    numeroItem:
      Number.isFinite(numeroItem) && numeroItem > 0 ? numeroItem : undefined,
    descricao,
    unidade: String(source.unidade ?? "").trim() || "UND",
    quantidade: formatSdDecimal(
      quantidade && quantidade > 0 ? quantidade : 1,
      3,
    ),
    valorUnitarioEstimado:
      valorUnitario && valorUnitario > 0
        ? formatSdDecimal(valorUnitario, 2)
        : null,
    valorTotalEstimado:
      valorTotal && valorTotal > 0 ? formatSdDecimal(valorTotal, 2) : null,
  };
}

async function vincularSdAoProcesso(params: {
  processoId: number;
  itens: unknown[];
  userId: number;
}) {
  const db = requireDb();
  const [processo] = await db
    .select({ id: processos.id, numeroSirel: processos.numeroSirel })
    .from(processos)
    .where(eq(processos.id, params.processoId))
    .limit(1);

  if (!processo) {
    throw new Error("Processo não encontrado.");
  }

  const itensValidos = params.itens
    .map((item) => normalizeSdImportItem(item))
    .filter((item): item is SdProcessImportItem => Boolean(item));

  if (!itensValidos.length) {
    throw new Error(
      "Nenhum item válido foi encontrado para vincular ao processo.",
    );
  }

  const itensAtuais = await db
    .select({
      id: itensProcesso.id,
      numeroItem: itensProcesso.numeroItem,
      descricao: itensProcesso.descricao,
      quantidade: itensProcesso.quantidade,
      unidade: itensProcesso.unidade,
      valorUnitarioEstimado: itensProcesso.valorUnitarioEstimado,
      valorTotalEstimado: itensProcesso.valorTotalEstimado,
    })
    .from(itensProcesso)
    .where(eq(itensProcesso.processoId, params.processoId))
    .orderBy(asc(itensProcesso.numeroItem));

  const existingIds = itensAtuais.map((item) => item.id);
  if (existingIds.length) {
    const [propostaExistente] = await db
      .select({ id: propostasLicitacao.id })
      .from(propostasLicitacao)
      .where(inArray(propostasLicitacao.itemId, existingIds))
      .limit(1);
    if (propostaExistente) {
      throw new Error(
        "Não é possível importar a SD porque o processo já possui propostas vinculadas aos itens.",
      );
    }
  }

  const numeroToItem = new Map(
    itensAtuais.map((item) => [item.numeroItem, item]),
  );
  const usedNumbers = new Set(itensAtuais.map((item) => item.numeroItem));
  let nextNumero = (itensAtuais[itensAtuais.length - 1]?.numeroItem ?? 0) + 1;
  let created = 0;
  let updated = 0;

  for (const item of itensValidos) {
    const existing = item.numeroItem
      ? (numeroToItem.get(item.numeroItem) ?? null)
      : null;
    const payload = {
      descricao: item.descricao,
      quantidade: item.quantidade,
      unidade: item.unidade,
      valorUnitarioEstimado: item.valorUnitarioEstimado,
      valorTotalEstimado: item.valorTotalEstimado,
      atualizadoEm: new Date(),
    };

    if (existing) {
      await db
        .update(itensProcesso)
        .set(payload)
        .where(eq(itensProcesso.id, existing.id));
      updated += 1;
      continue;
    }

    let numeroItem = item.numeroItem ?? nextNumero;
    while (usedNumbers.has(numeroItem)) {
      numeroItem += 1;
    }
    usedNumbers.add(numeroItem);
    nextNumero = numeroItem + 1;

    await db.insert(itensProcesso).values({
      processoId: params.processoId,
      numeroItem,
      descricao: item.descricao,
      quantidade: item.quantidade,
      unidade: item.unidade,
      valorUnitarioEstimado: item.valorUnitarioEstimado,
      valorTotalEstimado: item.valorTotalEstimado,
      criadoEm: new Date(),
      atualizadoEm: new Date(),
    });
    created += 1;
  }

  const itensAtualizados = await db
    .select({ valorTotalEstimado: itensProcesso.valorTotalEstimado })
    .from(itensProcesso)
    .where(eq(itensProcesso.processoId, params.processoId));
  const totalEstimado = itensAtualizados
    .map((item) => parseSdNumberish(item.valorTotalEstimado))
    .filter((item): item is number => item !== null)
    .reduce((acc, current) => acc + current, 0);

  await db
    .update(processos)
    .set({
      valorEstimado:
        totalEstimado > 0 ? formatSdDecimal(totalEstimado, 2) : null,
      atualizadoEm: new Date(),
    })
    .where(eq(processos.id, params.processoId));

  await db.insert(movimentacoesWorkflow).values({
    processoId: params.processoId,
    moduloOrigem: "LICITACAO",
    moduloDestino: "LICITACAO",
    descricao: "Itens da SD vinculados ao processo",
    observacao: `${itensValidos.length} item(ns) processado(s) via parser da SD (${created} novo(s), ${updated} atualizado(s)).`,
    usuarioId: params.userId,
    criadoEm: new Date(),
  });

  return {
    processo,
    created,
    updated,
    total: itensValidos.length,
    valorEstimado: totalEstimado > 0 ? totalEstimado : null,
  };
}

async function handleSdProcessarRequest(
  req: express.Request,
  res: express.Response,
  params: {
    auditTable: string;
    auditDescription: string;
    downloadBasePath: string;
  },
) {
  const user = requireUploadUser(req, res);
  if (!user) return;
  if (!req.file) {
    res
      .status(400)
      .json({ message: "Selecione um arquivo PDF da SD para processar." });
    return;
  }

  const extension = extname(req.file.originalname).toLowerCase();
  if (extension !== ".pdf") {
    res.status(400).json({
      message: "Somente arquivos PDF de Solicitação de Despesa são aceitos.",
    });
    return;
  }

  const result = await parseSdReport(req.file.path);
  const relativeJsonPath = relative(
    sdReportsRoot,
    resolve(result.outputDir, "sd-parsed.json"),
  )
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");

  await logAuditoria({ user } as any, {
    tabela: params.auditTable,
    registroId: Number(req.body.processoId ?? 0) || 0,
    acao: "CREATE",
    dadosNovos: {
      arquivoOriginal: req.file.originalname,
      outputDir: result.outputDir,
      summary: result.summary,
      metadata: result.metadata,
      processoId: Number(req.body.processoId ?? 0) || null,
    },
    descricao: params.auditDescription,
  });

  res.status(201).json({
    ...result,
    originalFileName: req.file.originalname,
    artifact: buildSdArtifact(
      relativeJsonPath,
      params.downloadBasePath,
      "JSON SD parseado",
    ),
  });
}

function handleSdDownloadRequest(req: express.Request, res: express.Response) {
  const relativeFile = String(req.query.file ?? "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
  if (!relativeFile) {
    res.status(400).json({ message: "Arquivo do parse de SD não informado." });
    return;
  }

  const absolutePath = resolve(sdReportsRoot, relativeFile);
  const normalizedRoot = resolve(sdReportsRoot).replace(/\\/g, "/");
  const normalizedTarget = absolutePath.replace(/\\/g, "/");
  if (!normalizedTarget.startsWith(normalizedRoot)) {
    res.status(400).json({ message: "Arquivo de parse inválido." });
    return;
  }
  if (!existsSync(absolutePath)) {
    res.status(404).json({ message: "Arquivo de parse não encontrado." });
    return;
  }

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
  const rawName = relativeFile.split("/").pop() || "sd-parsed.json";
  res.setHeader(
    "Content-Disposition",
    `attachment; filename=\"${slugifyFileName(rawName.replace(/\\.json$/i, ""))}.json\"`,
  );
  res.sendFile(absolutePath);
}

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      reportOnly: true,
      directives: {
        "default-src": ["'self'"],
        "base-uri": ["'self'"],
        "frame-ancestors": ["'self'"],
        "img-src": ["'self'", "data:", "blob:"],
      },
    },
    crossOriginResourcePolicy: { policy: "same-site" },
  }),
);
app.disable("x-powered-by");
const internalCors = cors({
  origin(origin, callback) {
    if (
      isAllowedCorsOrigin(origin, {
        clientUrl,
        nodeEnv: process.env.NODE_ENV,
      })
    ) {
      callback(null, true);
      return;
    }

    callback(new Error("Origem não autorizada pelo SIREL"));
  },
  allowedHeaders: ["Content-Type", "X-Sirel-Csrf"],
  credentials: true,
});

const transparencyPortalCors = cors({
  origin(origin, callback) {
    if (isTransparencyPortalSameOrigin(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error("Origem nao autorizada pelo portal publico"));
  },
  allowedHeaders: ["Content-Type"],
  credentials: false,
});

/**
 * Cookies de sessão são compartilhados entre ambientes internos por
 * compatibilidade. O portal é uma fronteira sem login e não pode encaminhar
 * uma chamada interna mesmo quando o navegador apresenta esse cookie.
 */
app.use((req, res, next) => {
  if (
    isTransparencyPortalRequest(req) &&
    !isTransparencyPortalPathAllowed(req.path, req.method)
  ) {
    res.status(404).json({ message: "Recurso nao encontrado." });
    return;
  }
  next();
});

app.use((req, res, next) => {
  const middleware = isTransparencyPortalRequest(req)
    ? transparencyPortalCors
    : internalCors;
  middleware(req, res, next);
});

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "100kb" }));
app.use("/api", (req, res, next) => {
  if (
    ["GET", "HEAD", "OPTIONS"].includes(req.method) ||
    req.path.startsWith("/trpc")
  ) {
    next();
    return;
  }
  if (!requireAuthenticatedUser(req, res)) return;
  if (!hasValidCsrfToken(req)) {
    res.status(403).json({ message: "Validacao CSRF obrigatoria." });
    return;
  }
  next();
});

app.get("/healthz", (req, res) => {
  if (isTransparencyPortalRequest(req)) {
    // A fronteira pública não precisa revelar composição de CORS, módulos ou
    // demais detalhes operacionais para ser monitorada.
    res.json({ ok: true });
    return;
  }

  res.json({
    ok: true,
    service: "sirel-modern-server",
    timestamp: new Date().toISOString(),
    corsAllowedOrigins: resolveAllowedOrigins(clientUrl).length,
    subdomainsEnabled: true,
  });
});

app.post(
  "/api/planejamento/documentos/upload",
  requireUploadAccess,
  upload.single("arquivo"),
  async (req, res) => {
    let documentoPersistido = false;
    try {
      const user = requireUploadUser(req, res);
      if (!user) {
        removeUploadedFile(req.file);
        return;
      }
      if (!req.file) {
        res.status(400).json({ message: "Selecione um arquivo para upload." });
        return;
      }
      if (
        extname(req.file.originalname).toLowerCase() === ".pdf" &&
        !hasPdfFileSignature(req.file.path)
      ) {
        rmSync(req.file.path, { force: true });
        res
          .status(400)
          .json({ message: "O arquivo PDF nao possui uma assinatura valida." });
        return;
      }

      const processoId = Number(req.body.processoId ?? 0);
      const tipo = String(req.body.tipo ?? "").trim();
      const categoria = String(req.body.categoria ?? "").trim() || null;
      const titulo = String(req.body.titulo ?? req.file.originalname).trim();
      const descricao = String(req.body.descricao ?? "").trim() || null;
      const dataReferencia =
        String(req.body.dataReferencia ?? "").trim() || null;
      const palavrasChave = parseStringArrayField(req.body.palavrasChave);
      const documentoAnteriorIdValue = Number(
        req.body.documentoAnteriorId ?? 0,
      );
      const documentoAnteriorId =
        Number.isSafeInteger(documentoAnteriorIdValue) &&
        documentoAnteriorIdValue > 0
          ? documentoAnteriorIdValue
          : null;
      const classificacaoIdValue = Number(req.body.classificacaoId ?? 0);
      const classificacaoId =
        Number.isSafeInteger(classificacaoIdValue) && classificacaoIdValue > 0
          ? classificacaoIdValue
          : null;
      if (
        !Number.isSafeInteger(processoId) ||
        processoId < 1 ||
        !titulo ||
        !documentoTipoOptions.includes(
          tipo as (typeof documentoTipoOptions)[number],
        )
      ) {
        removeUploadedFile(req.file);
        res.status(400).json({
          message: "Informe processo, tipo válido e título do documento.",
        });
        return;
      }

      const db = requireDb();
      const [processo] = await db
        .select({ id: processos.id })
        .from(processos)
        .where(eq(processos.id, processoId))
        .limit(1);
      if (!processo) {
        removeUploadedFile(req.file);
        res
          .status(400)
          .json({ message: "O processo informado não foi encontrado." });
        return;
      }
      const [documentoAnterior] = documentoAnteriorId
        ? await db
            .select()
            .from(documentos)
            .where(eq(documentos.id, documentoAnteriorId))
            .limit(1)
        : [null];
      if (documentoAnteriorId && !documentoAnterior) {
        removeUploadedFile(req.file);
        res.status(400).json({ message: "Documento anterior nao encontrado." });
        return;
      }
      if (documentoAnterior && documentoAnterior.processoId !== processoId) {
        removeUploadedFile(req.file);
        res.status(400).json({
          message: "A nova versao precisa permanecer no mesmo processo.",
        });
        return;
      }
      const classificacaoEfetivaId =
        classificacaoId ?? documentoAnterior?.classificacaoId ?? null;
      const [classificacao] = classificacaoEfetivaId
        ? await db
            .select({
              id: documentoClassificacoes.id,
              nome: documentoClassificacoes.nome,
              ativo: documentoClassificacoes.ativo,
            })
            .from(documentoClassificacoes)
            .where(eq(documentoClassificacoes.id, classificacaoEfetivaId))
            .limit(1)
        : [null];
      if (classificacaoEfetivaId && !classificacao?.ativo) {
        removeUploadedFile(req.file);
        res.status(400).json({
          message: "Selecione uma classificacao institucional ativa.",
        });
        return;
      }
      const documentoRaizId = documentoAnterior
        ? resolveDocumentoRaizId(documentoAnterior)
        : null;
      const existingVersions = documentoRaizId
        ? await db
            .select({ versao: documentos.versao })
            .from(documentos)
            .where(eq(documentos.documentoRaizId, documentoRaizId))
        : [];
      const nextVersion = documentoRaizId
        ? nextDocumentoVersao(existingVersions)
        : 1;
      const relativePath = buildUploadRelativePath(req.file);

      const [created] = await db
        .insert(documentos)
        .values({
          processoId,
          titulo,
          descricao,
          tipo: tipo as
            | "DFD"
            | "ETP"
            | "TR"
            | "EDITAL"
            | "COMUNICACAO_INTERNA"
            | "RESULTADO"
            | "CONTRATO"
            | "OUTRO",
          categoria: categoria || classificacao?.nome || null,
          classificacaoId: classificacaoEfetivaId,
          versao: nextVersion,
          documentoRaizId,
          versaoAnteriorId: documentoAnterior?.id ?? null,
          arquivoUrl: "",
          arquivoChave: relativePath,
          tamanhoBytes: req.file.size,
          mimeType: req.file.mimetype,
          dataReferencia,
          publico: false,
          statusPublicacao: "RASCUNHO",
          aprovadoPor: null,
          aprovadoEm: null,
          palavrasChave,
          restritoA: [],
          criadoPor: user.id,
          criadoEm: new Date(),
          atualizadoEm: new Date(),
        })
        .returning();
      documentoPersistido = true;

      const downloadUrl = `/api/planejamento/documentos/${created.id}/download`;
      const [persisted] = await db
        .update(documentos)
        .set({
          arquivoUrl: downloadUrl,
          documentoRaizId: documentoRaizId ?? created.id,
          atualizadoEm: new Date(),
        })
        .where(eq(documentos.id, created.id))
        .returning();

      await logAuditoria({ user } as any, {
        tabela: "documentos",
        registroId: created.id,
        acao: "CREATE",
        dadosNovos: persisted,
        descricao: `Documento ${titulo} enviado por upload local`,
      });

      res.status(201).json(persisted);
    } catch (error) {
      if (!documentoPersistido) removeUploadedFile(req.file);
      console.error(error);
      res.status(500).json({ message: "Falha ao salvar o documento enviado." });
    }
  },
);

app.post(
  "/api/cadastros/assets/upload",
  requireUploadAccess,
  cadastroAssetUpload.single("arquivo"),
  async (req, res) => {
    try {
      const user = requireUploadUser(req, res);
      if (!user) return;
      if (!req.file) {
        res.status(400).json({ message: "Selecione um arquivo para upload." });
        return;
      }

      const entity = String(req.body.entity ?? "").trim();
      const recordId = Number(req.body.recordId ?? 0);
      if (!recordId || !["itens", "fornecedores"].includes(entity)) {
        res
          .status(400)
          .json({ message: "Informe a entidade e o registro do cadastro." });
        return;
      }

      const relativePath =
        req.file.path.replace(/\\/g, "/").split("/storage/uploads/").pop() ??
        req.file.filename;
      const db = requireDb();

      if (entity === "itens") {
        const [item] = await db
          .select()
          .from(catalogoItens)
          .where(eq(catalogoItens.id, recordId))
          .limit(1);
        if (!item) {
          res.status(404).json({ message: "Item não encontrado." });
          return;
        }

        if (item.imagemChave) {
          const previousPath = resolveDocumentoPath(item.imagemChave);
          if (existsSync(previousPath)) {
            rmSync(previousPath, { force: true });
          }
        }

        const assetUrl = `/api/cadastros/assets/itens/${recordId}/download`;
        const [updated] = await db
          .update(catalogoItens)
          .set({
            imagemUrl: assetUrl,
            imagemChave: relativePath,
            atualizadoEm: new Date(),
          })
          .where(eq(catalogoItens.id, recordId))
          .returning();

        await logAuditoria({ user } as any, {
          tabela: "catalogo_itens",
          registroId: recordId,
          acao: "UPDATE",
          dadosAnteriores: item,
          dadosNovos: updated,
          descricao: `Imagem do item ${item.descricao} atualizada`,
        });

        res.status(201).json({ success: true, assetUrl });
        return;
      }

      const [fornecedor] = await db
        .select()
        .from(fornecedores)
        .where(eq(fornecedores.id, recordId))
        .limit(1);
      if (!fornecedor) {
        res.status(404).json({ message: "Fornecedor não encontrado." });
        return;
      }

      if (fornecedor.logoChave) {
        const previousPath = resolveDocumentoPath(fornecedor.logoChave);
        if (existsSync(previousPath)) {
          rmSync(previousPath, { force: true });
        }
      }

      const assetUrl = `/api/cadastros/assets/fornecedores/${recordId}/download`;
      const [updated] = await db
        .update(fornecedores)
        .set({
          logoUrl: assetUrl,
          logoChave: relativePath,
          atualizadoEm: new Date(),
        })
        .where(eq(fornecedores.id, recordId))
        .returning();

      await logAuditoria({ user } as any, {
        tabela: "fornecedores",
        registroId: recordId,
        acao: "UPDATE",
        dadosAnteriores: fornecedor,
        dadosNovos: updated,
        descricao: `Logo do fornecedor ${fornecedor.razaoSocial} atualizada`,
      });

      res.status(201).json({ success: true, assetUrl });
    } catch (error) {
      console.error(error);
      res
        .status(500)
        .json({ message: "Falha ao salvar o arquivo do cadastro." });
    }
  },
);

app.post(
  "/api/cadastros-institucionais/atos/upload",
  requireUploadAccess,
  atoDesignacaoUpload.single("arquivo"),
  async (req, res) => {
    try {
      const user = requireUploadUser(req, res);
      if (!user) return;
      if (!["admin", "gestor"].includes(user.role)) {
        res.status(403).json({
          message:
            "Apenas gestores e administradores podem enviar atos institucionais.",
        });
        return;
      }
      if (!req.file) {
        res.status(400).json({ message: "Selecione um arquivo para upload." });
        return;
      }
      if (!isAllowedAtoDesignacaoFile(req.file)) {
        rmSync(req.file.path, { force: true });
        res.status(400).json({
          message: "Formato invalido. Envie PDF, DOC, DOCX, PNG, JPG ou WEBP.",
        });
        return;
      }

      const fileBuffer = readFileSync(req.file.path);
      const hashArquivo = createHash("sha256").update(fileBuffer).digest("hex");
      const db = requireDb();
      const [existingAto] = await db
        .select({
          arquivoUrl: atosDesignacao.arquivoUrl,
          arquivoChave: atosDesignacao.arquivoChave,
          mimeType: atosDesignacao.mimeType,
          tamanhoBytes: atosDesignacao.tamanhoBytes,
          hashArquivo: atosDesignacao.hashArquivo,
        })
        .from(atosDesignacao)
        .where(eq(atosDesignacao.hashArquivo, hashArquivo))
        .limit(1);
      if (existingAto?.arquivoChave) {
        const existingPath = resolveDocumentoPath(existingAto.arquivoChave);
        if (existsSync(existingPath)) {
          rmSync(req.file.path, { force: true });
          res.status(200).json({
            success: true,
            arquivoUrl:
              existingAto.arquivoUrl ??
              `/api/cadastros-institucionais/atos/download?key=${encodeURIComponent(existingAto.arquivoChave)}`,
            arquivoChave: existingAto.arquivoChave,
            mimeType: existingAto.mimeType ?? req.file.mimetype,
            tamanhoBytes: existingAto.tamanhoBytes ?? req.file.size,
            hashArquivo,
          });
          return;
        }
      }
      const arquivoChave = buildUploadRelativePath(req.file);
      const arquivoUrl = `/api/cadastros-institucionais/atos/download?key=${encodeURIComponent(arquivoChave)}`;

      await logAuditoria({ user } as any, {
        tabela: "atos_designacao_uploads",
        registroId: 0,
        acao: "CREATE",
        dadosNovos: {
          arquivoOriginal: req.file.originalname,
          arquivoChave,
          mimeType: req.file.mimetype,
          tamanhoBytes: req.file.size,
          hashArquivo,
        },
        descricao: "Arquivo de ato institucional enviado",
      });

      res.status(201).json({
        success: true,
        arquivoUrl,
        arquivoChave,
        mimeType: req.file.mimetype,
        tamanhoBytes: req.file.size,
        hashArquivo,
      });
    } catch (error) {
      console.error(error);
      res
        .status(500)
        .json({ message: "Falha ao salvar o ato institucional enviado." });
    }
  },
);

app.post(
  "/api/relatorios/ata-sessao/processar",
  requireUploadAccess,
  receiveAtaSessaoStandaloneFiles,
  async (req, res) => {
    const uploadedFiles = req.files as
      | Record<string, Express.Multer.File[]>
      | undefined;
    const transientUploadPaths = collectMulterFilePaths(uploadedFiles);
    try {
      const user = requireUploadUser(req, res);
      if (!user) return;
      const ataFile = uploadedFiles?.arquivo?.[0];
      const sdFile = uploadedFiles?.sdArquivo?.[0];
      if (!ataFile || !sdFile) {
        res.status(400).json({
          message:
            "Selecione os arquivos PDF da Ata BLL e da Solicitação de Despesa para processar.",
        });
        return;
      }

      const invalidFiles = [ataFile, sdFile].filter((file) => {
        if (extname(file.originalname).toLowerCase() !== ".pdf") return true;
        // O MIME informado pelo navegador não é confiável e pode vir
        // vazio/octet-stream. A assinatura evita rejeitar PDFs válidos e
        // também impede aceitar um arquivo apenas renomeado para .pdf.
        return !hasPdfFileSignature(file.path);
      });
      if (invalidFiles.length > 0) {
        res.status(400).json({
          message:
            "Somente arquivos PDF da Ata BLL e da Solicitação de Despesa são aceitos.",
        });
        return;
      }

      const result = await generateAtaSessaoReports(
        {
          sourcePath: ataFile.path,
          sdSourcePath: sdFile.path,
          processoId: Number(req.body.processoId) || undefined,
          generatedByName: user.name,
          edital: String(req.body.edital ?? "").trim() || undefined,
          processoAdministrativo:
            String(req.body.processoAdministrativo ?? "").trim() || undefined,
          arquivoOrigem:
            String(req.body.arquivoOrigem ?? ataFile.originalname).trim() ||
            undefined,
          dataGeracao: String(req.body.dataGeracao ?? "").trim() || undefined,
        },
        { removeAutomaticOutputOnFailure: true },
      );

      if (result.summary.totalLotes === 0) {
        removeAutomaticReportDirectory(result.outputDir, ataSessaoReportsRoot);
        throw new Error(
          "Nenhum lote foi identificado; a estrutura da Ata BLL não foi reconhecida.",
        );
      }
      if (!result.estimatedValueReconciliation) {
        removeAutomaticReportDirectory(result.outputDir, ataSessaoReportsRoot);
        throw new Error(
          "A estrutura da SD não foi reconhecida para conciliação dos valores estimados.",
        );
      }

      await logAuditoria({ user } as any, {
        tabela: "relatorios_ata_sessao",
        registroId: 0,
        acao: "CREATE",
        dadosNovos: {
          arquivoOriginal: ataFile.originalname,
          arquivoOriginalSd: sdFile.originalname,
          outputDir: result.outputDir,
          summary: result.summary,
          estimatedValueReconciliation: result.estimatedValueReconciliation,
        },
        descricao: `Processamento avulso de Ata BLL (${ataFile.originalname}) com Solicitação de Despesa (${sdFile.originalname}) em Documentos`,
      });

      res.status(201).json({
        ...result,
        originalFileName: ataFile.originalname,
        originalSdFileName: sdFile.originalname,
      });
    } catch (error) {
      console.error(error);
      const rawMessage = error instanceof Error ? error.message : String(error);
      const normalizedMessage = rawMessage
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
      const isMissingTextLayer =
        normalizedMessage.includes("pdf sem camada de texto") ||
        normalizedMessage.includes("sem texto extraivel") ||
        normalizedMessage.includes("ocr");
      const isUnrecognizedStructure = [
        "estrutura do documento nao reconhecida",
        "estrutura da solicitacao de despesa",
        "estrutura da sd",
        "nenhum lote",
        "nenhum item",
        "sdstructureerror",
        "sditemextractionerror",
      ].some((marker) => normalizedMessage.includes(marker));

      if (
        isAtaSessaoReportInputError(error) ||
        isMissingTextLayer ||
        isUnrecognizedStructure
      ) {
        res.status(422).json({
          message: isMissingTextLayer
            ? "Não foi possível ler um dos PDFs porque ele não possui camada de texto. Gere um PDF pesquisável com OCR e tente novamente."
            : "Não foi possível reconhecer a estrutura da Ata BLL ou da Solicitação de Despesa enviada.",
        });
        return;
      }
      res.status(500).json({
        message:
          "Falha ao processar a Ata BLL e a Solicitação de Despesa enviadas.",
      });
    } finally {
      removeTransientUploadFiles(transientUploadPaths, ataSessaoUploadsRoot);
    }
  },
);

app.post(
  "/api/ata-sessao/discover-process",
  ataSessaoUpload.single("arquivo"),
  async (req, res) => {
    try {
      const user = requireUploadUser(req, res);
      if (!user) return;
      if (!req.file) {
        res.status(400).json({
          message:
            "Selecione um arquivo PDF da ata para identificar o processo.",
        });
        return;
      }

      const extension = extname(req.file.originalname).toLowerCase();
      if (extension !== ".pdf") {
        res.status(400).json({
          message: "Somente arquivos PDF de ata de sessão são aceitos.",
        });
        return;
      }

      const providedProcessoId =
        Number(req.body.providedProcessoId ?? 0) || null;
      const result = await discoverAtaSessaoProcess({
        sourcePath: req.file.path,
        originalFileName: req.file.originalname,
        providedProcessoId,
        userId: user.id,
      });

      await logAuditoria({ user } as any, {
        tabela: "licitacao_ata_sync_runs",
        registroId: result.discoveryId,
        acao: "CREATE",
        dadosNovos: {
          discoveryId: result.discoveryId,
          originalFileName: result.originalFileName,
          metadata: result.metadata,
          summary: result.summary,
        },
        descricao: `Descoberta de processo a partir de ata de sessão: ${req.file.originalname}`,
      });

      res.status(201).json(result);
    } catch (error) {
      console.error(error);
      res.status(500).json({
        message:
          error instanceof Error
            ? error.message
            : "Falha ao identificar o processo pela ata de sessão.",
      });
    }
  },
);

app.post("/api/ata-sessao/create-preview-from-discovery", async (req, res) => {
  try {
    const user = requireUploadUser(req, res);
    if (!user) return;
    const input = ataSessaoCreatePreviewFromDiscoveryInputSchema.parse(
      req.body,
    );
    const preview = await createAtaSessaoPreviewFromDiscovery(input, user.id);
    if (preview.document) {
      await logAuditoria({ user } as any, {
        tabela: "documentos",
        registroId: preview.document.id,
        acao: "CREATE",
        dadosNovos: {
          ...preview.document,
          publico: false,
          statusPublicacao: "RASCUNHO",
          restritoA: [],
        },
        descricao: `Ata de sessão adicionada ao acervo como rascunho: ${preview.document.titulo}`,
      });
    }
    res.status(201).json(preview);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message:
        error instanceof Error
          ? error.message
          : "Falha ao criar a prévia da sincronização da ata.",
    });
  }
});

app.post("/api/licitacao/ata-sessao/processar", async (req, res) => {
  try {
    const user = requireUploadUser(req, res);
    if (!user) return;
    const input = ataSessaoPreviewProcessInputSchema.parse(req.body);
    const preview = await createAtaSessaoPreviewFromDocumento(input);
    res.status(201).json(preview);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message:
        error instanceof Error
          ? error.message
          : "Falha ao processar a ata vinculada ao processo.",
    });
  }
});

app.post("/api/licitacao/ata-sessao/aplicar", async (req, res) => {
  try {
    const user = requireUploadUser(req, res);
    if (!user) return;
    const input = ataSessaoApplyInputSchema.parse(req.body);
    const result = await applyAtaSessaoPreview({
      runId: input.runId,
      userId: user.id,
    });
    res.status(201).json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message:
        error instanceof Error
          ? error.message
          : "Falha ao aplicar a sincronização da ata no processo.",
    });
  }
});

app.post(
  "/api/relatorios/sd/processar",
  requireUploadAccess,
  sdUpload.single("arquivo"),
  async (req, res) => {
    try {
      const user = requireUploadUser(req, res);
      if (!user) return;
      if (!req.file) {
        res
          .status(400)
          .json({ message: "Selecione um arquivo PDF da SD para processar." });
        return;
      }

      const extension = extname(req.file.originalname).toLowerCase();
      if (extension !== ".pdf") {
        res.status(400).json({
          message:
            "Somente arquivos PDF de Solicitação de Despesa são aceitos.",
        });
        return;
      }

      const result = await parseSdReport(req.file.path);
      const relativeJsonPath = relative(
        sdReportsRoot,
        resolve(result.outputDir, "sd-parsed.json"),
      )
        .replace(/\\/g, "/")
        .replace(/^\/+/, "");

      await logAuditoria({ user } as any, {
        tabela: "relatorios_sd",
        registroId: 0,
        acao: "CREATE",
        dadosNovos: {
          arquivoOriginal: req.file.originalname,
          outputDir: result.outputDir,
          summary: result.summary,
          metadata: result.metadata,
        },
        descricao: `Processamento avulso de SD em Documentos: ${req.file.originalname}`,
      });

      res.status(201).json({
        ...result,
        originalFileName: req.file.originalname,
        artifact: {
          label: "JSON SD parseado",
          relativePath: relativeJsonPath,
          downloadUrl: `/api/relatorios/sd/download?file=${encodeURIComponent(relativeJsonPath)}`,
        },
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        message:
          error instanceof Error
            ? error.message
            : "Falha ao processar a SD enviada.",
      });
    }
  },
);

app.post("/api/relatorios/sd/finalizar", async (req, res) => {
  try {
    const user = requireUploadUser(req, res);
    if (!user) return;

    const relativePath = String(req.body.relativePath ?? "")
      .trim()
      .replace(/\\/g, "/")
      .replace(/^\/+/, "");
    if (!relativePath) {
      res.status(400).json({ message: "Arquivo base do parse não informado." });
      return;
    }

    const absolutePath = resolve(sdReportsRoot, relativePath);
    const normalizedRoot = resolve(sdReportsRoot).replace(/\\/g, "/");
    const normalizedTarget = absolutePath.replace(/\\/g, "/");
    if (!normalizedTarget.startsWith(normalizedRoot)) {
      res.status(400).json({ message: "Arquivo base inválido." });
      return;
    }
    if (!existsSync(absolutePath)) {
      res
        .status(404)
        .json({ message: "Arquivo base do parse não encontrado." });
      return;
    }

    const manualItemsRaw: unknown[] = Array.isArray(req.body.manualItems)
      ? req.body.manualItems
      : [];
    const manualItems = manualItemsRaw
      .map((item: unknown) => normalizeSdManualItem(item))
      .filter((item: SdManualItem | null): item is SdManualItem =>
        Boolean(item),
      );

    const basePayload = JSON.parse(
      readFileSync(absolutePath, "utf-8"),
    ) as Record<string, unknown>;
    const baseItems = Array.isArray(basePayload.itens) ? basePayload.itens : [];
    const mergedItems = [
      ...baseItems,
      ...manualItems.map((item: SdManualItem) => ({
        ...item,
        fonte: "manual",
      })),
    ];
    const baseSummary = (basePayload.summary as Record<string, unknown>) ?? {};
    const mergedPayload = {
      ...basePayload,
      summary: {
        ...baseSummary,
        total_itens: mergedItems.length,
      },
      itens: mergedItems,
      manual_items: manualItems,
      finalized_at: new Date().toISOString(),
    };

    const finalRelativePath = relativePath.replace(/\.json$/i, "-final.json");
    const finalAbsolutePath = resolve(sdReportsRoot, finalRelativePath);
    writeFileSync(
      finalAbsolutePath,
      JSON.stringify(mergedPayload, null, 2),
      "utf-8",
    );

    await logAuditoria({ user } as any, {
      tabela: "relatorios_sd",
      registroId: 0,
      acao: "UPDATE",
      dadosNovos: {
        baseRelativePath: relativePath,
        finalRelativePath,
        manualItems: manualItems.length,
      },
      descricao: `Finalização de SD com ${manualItems.length} item(ns) manual(is)`,
    });

    res.status(201).json({
      ...mergedPayload,
      artifact: {
        label: "JSON SD finalizado",
        relativePath: finalRelativePath,
        downloadUrl: `/api/relatorios/sd/download?file=${encodeURIComponent(finalRelativePath)}`,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message:
        error instanceof Error
          ? error.message
          : "Falha ao finalizar o parse da SD.",
    });
  }
});

app.post(
  "/api/licitacao/sd/processar",
  requireUploadAccess,
  sdUpload.single("arquivo"),
  async (req, res) => {
    try {
      await handleSdProcessarRequest(req, res, {
        auditTable: "licitacao_sd",
        auditDescription: `Processamento de SD na Licitação para o processo ${String(req.body.processoId ?? "0")}`,
        downloadBasePath: "/api/licitacao/sd/download",
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        message:
          error instanceof Error
            ? error.message
            : "Falha ao processar a SD do processo.",
      });
    }
  },
);

app.post("/api/licitacao/sd/vincular", async (req, res) => {
  try {
    const user = requireUploadUser(req, res);
    if (!user) return;

    const processoId = Number(req.body.processoId ?? 0);
    if (!processoId) {
      res
        .status(400)
        .json({ message: "Processo não informado para vinculação da SD." });
      return;
    }

    const manualItemsRaw: unknown[] = Array.isArray(req.body.manualItems)
      ? req.body.manualItems
      : [];
    const { manualItems, mergedPayload, finalRelativePath, artifact } =
      finalizeSdPayload({
        relativePath: String(req.body.relativePath ?? ""),
        manualItemsRaw,
        downloadBasePath: "/api/licitacao/sd/download",
      });
    const vinculacao = await vincularSdAoProcesso({
      processoId,
      itens: Array.isArray(mergedPayload.itens) ? mergedPayload.itens : [],
      userId: user.id,
    });

    await logAuditoria({ user } as any, {
      tabela: "itens_processo",
      registroId: processoId,
      acao: "UPDATE",
      dadosNovos: {
        processoId,
        finalRelativePath,
        manualItems: manualItems.length,
        created: vinculacao.created,
        updated: vinculacao.updated,
        total: vinculacao.total,
        valorEstimado: vinculacao.valorEstimado,
      },
      descricao: `SD vinculada ao processo ${vinculacao.processo.numeroSirel} na Licitação`,
    });

    res.status(201).json({
      ...mergedPayload,
      artifact,
      vinculacao: {
        processoId,
        created: vinculacao.created,
        updated: vinculacao.updated,
        total: vinculacao.total,
        valorEstimado: vinculacao.valorEstimado,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message:
        error instanceof Error
          ? error.message
          : "Falha ao vincular a SD ao processo.",
    });
  }
});

app.get("/api/relatorios/ata-sessao/download", async (req, res) => {
  try {
    if (!requireAuthenticatedUser(req, res)) return;
    const relativeFile = String(req.query.file ?? "")
      .trim()
      .replace(/\\/g, "/")
      .replace(/^\/+/, "");
    if (!relativeFile) {
      res.status(400).json({ message: "Arquivo do relatório não informado." });
      return;
    }

    const absolutePath = resolve(ataSessaoReportsRoot, relativeFile);
    const normalizedRoot = resolve(ataSessaoReportsRoot).replace(/\\/g, "/");
    const normalizedTarget = absolutePath.replace(/\\/g, "/");
    if (!normalizedTarget.startsWith(normalizedRoot)) {
      res.status(400).json({ message: "Arquivo de relatório inválido." });
      return;
    }
    if (!existsSync(absolutePath)) {
      res.status(404).json({ message: "Arquivo de relatório não encontrado." });
      return;
    }

    const extension = extname(absolutePath).toLowerCase();
    const mimeType =
      extension === ".pdf"
        ? "application/pdf"
        : extension === ".xlsx"
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : extension === ".json"
            ? "application/json; charset=utf-8"
            : "text/plain; charset=utf-8";

    res.setHeader("Content-Type", mimeType);
    res.setHeader("X-Content-Type-Options", "nosniff");
    const rawName = relativeFile.split("/").pop() || "relatorio";
    const baseName = rawName.endsWith(extension)
      ? rawName.slice(0, -extension.length)
      : rawName;
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=\"${slugifyFileName(baseName) || "relatorio"}${extension}\"`,
    );
    res.sendFile(absolutePath);
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ message: "Falha ao disponibilizar o relatório da ata." });
  }
});

app.get("/api/relatorios/sd/download", async (req, res) => {
  try {
    if (!requireAuthenticatedUser(req, res)) return;
    const relativeFile = String(req.query.file ?? "")
      .trim()
      .replace(/\\/g, "/")
      .replace(/^\/+/, "");
    if (!relativeFile) {
      res
        .status(400)
        .json({ message: "Arquivo do parse de SD não informado." });
      return;
    }

    const absolutePath = resolve(sdReportsRoot, relativeFile);
    const normalizedRoot = resolve(sdReportsRoot).replace(/\\/g, "/");
    const normalizedTarget = absolutePath.replace(/\\/g, "/");
    if (!normalizedTarget.startsWith(normalizedRoot)) {
      res.status(400).json({ message: "Arquivo de parse inválido." });
      return;
    }
    if (!existsSync(absolutePath)) {
      res.status(404).json({ message: "Arquivo de parse não encontrado." });
      return;
    }

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const rawName = relativeFile.split("/").pop() || "sd-parsed.json";
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=\"${slugifyFileName(rawName.replace(/\\.json$/i, ""))}.json\"`,
    );
    res.sendFile(absolutePath);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Falha ao baixar o parse de SD." });
  }
});

app.get("/api/licitacao/sd/download", async (req, res) => {
  try {
    if (!requireAuthenticatedUser(req, res)) return;
    handleSdDownloadRequest(req, res);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Falha ao baixar o parse de SD." });
  }
});

app.get(
  "/api/cadastros/assets/:entity/:recordId/download",
  async (req, res) => {
    try {
      if (!requireAuthenticatedUser(req, res)) return;
      const entity = String(req.params.entity ?? "").trim();
      const recordId = Number(req.params.recordId ?? 0);
      const db = requireDb();

      if (!recordId || !["itens", "fornecedores"].includes(entity)) {
        res.status(400).json({ message: "Cadastro inválido." });
        return;
      }

      if (entity === "itens") {
        const [item] = await db
          .select()
          .from(catalogoItens)
          .where(eq(catalogoItens.id, recordId))
          .limit(1);
        if (!item?.imagemChave) {
          res.status(404).json({ message: "Imagem do item não encontrada." });
          return;
        }

        const absolutePath = resolveDocumentoPath(item.imagemChave);
        if (!existsSync(absolutePath)) {
          res.status(404).json({ message: "Arquivo físico não encontrado." });
          return;
        }

        res.sendFile(absolutePath);
        return;
      }

      const [fornecedor] = await db
        .select()
        .from(fornecedores)
        .where(eq(fornecedores.id, recordId))
        .limit(1);
      if (!fornecedor?.logoChave) {
        res.status(404).json({ message: "Logo do fornecedor não encontrada." });
        return;
      }

      const absolutePath = resolveDocumentoPath(fornecedor.logoChave);
      if (!existsSync(absolutePath)) {
        res.status(404).json({ message: "Arquivo físico não encontrado." });
        return;
      }

      res.sendFile(absolutePath);
    } catch (error) {
      console.error(error);
      res
        .status(500)
        .json({ message: "Falha ao disponibilizar o arquivo do cadastro." });
    }
  },
);

app.get("/api/cadastros-institucionais/atos/download", async (req, res) => {
  try {
    if (!requireUploadUser(req, res)) return;

    const arquivoChave = String(req.query.key ?? "")
      .trim()
      .replace(/\\/g, "/")
      .replace(/^\/+/, "");
    if (
      !arquivoChave ||
      !arquivoChave.startsWith("cadastros-institucionais/atos/") ||
      arquivoChave.includes("../")
    ) {
      res.status(400).json({ message: "Chave do ato invalida." });
      return;
    }

    const absolutePath = resolveDocumentoPath(arquivoChave);
    const normalizedRoot = resolve(atosDesignacaoUploadsRoot).replace(
      /\\/g,
      "/",
    );
    const normalizedTarget = resolve(absolutePath).replace(/\\/g, "/");
    if (!normalizedTarget.startsWith(normalizedRoot)) {
      res.status(400).json({ message: "Caminho do ato invalido." });
      return;
    }
    if (!existsSync(absolutePath)) {
      res.status(404).json({ message: "Arquivo fisico nao encontrado." });
      return;
    }

    const db = requireDb();
    const [ato] = await db
      .select()
      .from(atosDesignacao)
      .where(eq(atosDesignacao.arquivoChave, arquivoChave))
      .limit(1);
    const extension = extname(arquivoChave) || extname(absolutePath);
    const rawName = ato
      ? `${ato.tipo}-${ato.numero}-${ato.ano}`
      : arquivoChave.split("/").pop() || "ato-designacao";
    const downloadName = `${slugifyFileName(rawName.replace(extension, "")) || "ato-designacao"}${extension}`;
    const mimeType = ato?.mimeType?.trim() || "application/octet-stream";

    res.setHeader("Content-Type", mimeType);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader(
      "Content-Disposition",
      `inline; filename=\"${downloadName}\"`,
    );
    res.sendFile(absolutePath);
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ message: "Falha ao disponibilizar o ato institucional." });
  }
});

app.get("/api/publico/documentos/:token/download", async (req, res) => {
  try {
    const documentoId = verifyPublicDocumentLink(
      String(req.params.token ?? ""),
    );
    if (!documentoId) {
      res.status(404).json({ message: "Documento nao encontrado." });
      return;
    }
    const db = requireDb();
    const [result] = await db
      .select({
        documento: documentos,
        publicado: processos.publicado,
        ativo: processos.ativo,
      })
      .from(documentos)
      .innerJoin(processos, eq(processos.id, documentos.processoId))
      .where(eq(documentos.id, documentoId))
      .limit(1);
    const documento = result?.documento;
    if (
      !documento?.arquivoChave ||
      !documentoEstaPublicamenteDisponivel(documento) ||
      !result.publicado ||
      !result.ativo
    ) {
      res.status(404).json({ message: "Documento nao encontrado." });
      return;
    }
    const documentoRaizId = documento.documentoRaizId ?? documento.id;
    const [versaoPublicaPosterior] = await db
      .select({ id: documentos.id })
      .from(documentos)
      .where(
        and(
          eq(documentos.documentoRaizId, documentoRaizId),
          gt(documentos.versao, documento.versao),
          eq(documentos.publico, true),
          eq(documentos.statusPublicacao, "APROVADO"),
          sql`coalesce(jsonb_array_length(${documentos.restritoA}), 0) = 0`,
        ),
      )
      .limit(1);
    if (versaoPublicaPosterior) {
      // Uma nova versão pública aprovada substitui a anterior inclusive para
      // links opacos emitidos antes da atualização.
      res.status(404).json({ message: "Documento nao encontrado." });
      return;
    }
    const absolutePath = resolveDocumentoPath(documento.arquivoChave);
    if (!existsSync(absolutePath)) {
      res.status(404).json({ message: "Documento nao encontrado." });
      return;
    }
    const extension = extname(documento.arquivoChave) || extname(absolutePath);
    const downloadName = `${slugifyFileName(documento.titulo || "documento") || "documento"}${extension}`;
    res.setHeader(
      "Content-Type",
      documento.mimeType?.trim() || "application/octet-stream",
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${downloadName}"`,
    );
    res.sendFile(absolutePath);
  } catch {
    res.status(500).json({ message: "Falha ao disponibilizar o documento." });
  }
});

app.get(
  "/api/planejamento/documentos/:documentoId/download",
  async (req, res) => {
    try {
      const user = requireAuthenticatedUser(req, res);
      if (!user) return;
      const db = requireDb();
      const documentoId = Number(req.params.documentoId ?? 0);
      const [documento] = await db
        .select()
        .from(documentos)
        .where(eq(documentos.id, documentoId))
        .limit(1);
      if (!documento?.arquivoChave) {
        res.status(404).json({ message: "Documento não encontrado." });
        return;
      }

      const restrictions = Array.isArray(documento.restritoA)
        ? documento.restritoA.map((role) => String(role).toLowerCase())
        : [];
      if (
        user.role !== "admin" &&
        restrictions.length > 0 &&
        !restrictions.includes(user.role.toLowerCase())
      ) {
        res
          .status(403)
          .json({ message: "Seu perfil nao possui acesso a este documento." });
        return;
      }

      const absolutePath = resolveDocumentoPath(documento.arquivoChave);
      if (!existsSync(absolutePath)) {
        res.status(404).json({ message: "Arquivo físico não encontrado." });
        return;
      }

      const extension =
        extname(documento.arquivoChave || "") || extname(absolutePath);
      const downloadName = `${slugifyFileName(documento.titulo || "documento") || "documento"}${extension}`;
      const mimeType = documento.mimeType?.trim() || "application/octet-stream";

      res.setHeader("Content-Type", mimeType);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=\"${downloadName}\"`,
      );
      res.sendFile(absolutePath);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Falha ao disponibilizar o documento." });
    }
  },
);

app.delete("/api/planejamento/documentos/:documentoId", async (req, res) => {
  try {
    const user = requireUploadUser(req, res);
    if (!user) return;

    const db = requireDb();
    const documentoId = Number(req.params.documentoId ?? 0);
    const [documento] = await db
      .select()
      .from(documentos)
      .where(eq(documentos.id, documentoId))
      .limit(1);
    if (!documento) {
      res.status(404).json({ message: "Documento não encontrado." });
      return;
    }

    if (["EM_REVISAO", "APROVADO"].includes(documento.statusPublicacao)) {
      res.status(409).json({
        message:
          "Retire ou conclua a decisao de publicacao antes de excluir este documento.",
      });
      return;
    }
    const [versaoPosterior] = await db
      .select({ id: documentos.id })
      .from(documentos)
      .where(eq(documentos.versaoAnteriorId, documentoId))
      .limit(1);
    if (versaoPosterior) {
      res.status(409).json({
        message:
          "Este documento possui uma versao posterior e precisa permanecer na linhagem auditavel.",
      });
      return;
    }

    if (documento.arquivoChave) {
      const absolutePath = resolveDocumentoPath(documento.arquivoChave);
      if (existsSync(absolutePath)) {
        rmSync(absolutePath, { force: true });
      }
    }

    await db.delete(documentos).where(eq(documentos.id, documentoId));
    await logAuditoria({ user } as any, {
      tabela: "documentos",
      registroId: documentoId,
      acao: "DELETE",
      dadosAnteriores: documento,
      descricao: `Documento ${documento.titulo} removido do acervo do processo`,
    });

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Falha ao excluir o documento." });
  }
});

registerArquivosHttp(app);

app.use(
  "/api/trpc",
  createExpressMiddleware({ router: appRouter, createContext }),
);

if (existsSync(clientIndexHtml)) {
  app.use(
    express.static(clientDistRoot, {
      index: false,
      maxAge: isProduction ? "1h" : 0,
    }),
  );

  app.get("/{*path}", (req, res, next) => {
    if (!shouldServeSpaFallback(req)) {
      next();
      return;
    }

    res.sendFile(clientIndexHtml);
  });
} else if (isProduction) {
  console.warn(
    `Client build not found at ${clientIndexHtml}; SPA routes will not be served by Express.`,
  );
}

app.use((_req, res) => {
  res.status(404).json({ message: "Recurso nao encontrado." });
});

app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    if (error instanceof multer.MulterError) {
      res
        .status(400)
        .json({ message: "Upload invalido ou acima do limite permitido." });
      return;
    }
    console.error(error);
    res
      .status(500)
      .json({ message: "Falha interna ao processar a solicitacao." });
  },
);

const server = app.listen(port, host, () => {
  startImportacoesScheduler();
  startBllLocalScheduler();
  startArquivosRuntime().catch((error) => {
    console.error("[SIREL Arquivos] Falha no runtime:", error);
  });
  console.log(`SIREL SIREL server listening on http://${host}:${port}`);
});

function shutdown() {
  stopBllLocalScheduler();
  server.close(() => {
    process.exit(0);
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

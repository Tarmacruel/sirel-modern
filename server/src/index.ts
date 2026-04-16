import "./bootstrap/load-env.js";

import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import cors from "cors";
import express from "express";
import multer from "multer";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { desc, eq } from "drizzle-orm";

import { createContext } from "./_core/context.js";
import { logAuditoria } from "./db/auditoria.js";
import { requireDb } from "./db/client.js";
import { catalogoItens, documentos, fornecedores } from "./db/schema.js";
import { verifySessionToken } from "./lib/auth-session.js";
import { generateAtaSessaoReports } from "./lib/ata-sessao-reports.js";
import { startBllLocalScheduler, stopBllLocalScheduler } from "./lib/bll-sync-local.js";
import { startImportacoesScheduler } from "./lib/importacoes-bll.js";
import { parseSdReport } from "./lib/sd-reports.js";
import { appRouter } from "./routers/index.js";

const app = express();
const port = Number(process.env.PORT ?? 3030);
const host = process.env.HOST ?? "0.0.0.0";
const clientUrl = process.env.CLIENT_URL ?? "http://localhost:5173";
const currentDir = dirname(fileURLToPath(import.meta.url));
const uploadsRoot = resolve(currentDir, "../../storage/uploads");
const legacyUploadsRoot = resolve(currentDir, "../../../storage/uploads");
const cadastroAssetsRoot = join(uploadsRoot, "cadastros");
const ataSessaoReportsRoot = resolve(currentDir, "../../storage/reports/atas-sessao");
const ataSessaoUploadsRoot = join(ataSessaoReportsRoot, "uploads");
const sdReportsRoot = resolve(currentDir, "../../storage/reports/sd");
const sdUploadsRoot = join(sdReportsRoot, "uploads");

if (!existsSync(uploadsRoot)) {
  mkdirSync(uploadsRoot, { recursive: true });
}
if (!existsSync(cadastroAssetsRoot)) {
  mkdirSync(cadastroAssetsRoot, { recursive: true });
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

  return candidates.find((candidate) => existsSync(candidate)) ?? join(uploadsRoot, normalizedKey);
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

function parseBooleanFlag(value: unknown) {
  return ["1", "true", "on", "sim", "yes"].includes(String(value ?? "").trim().toLowerCase());
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

function resolveRequestUser(req: express.Request) {
  const authHeader = String(req.headers.authorization ?? "").trim();
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const sessionPayload = verifySessionToken(bearerToken);
  const roleHeader = String(req.headers["x-sirel-role"] ?? "").trim();
  const userId = Number(req.headers["x-sirel-user-id"] ?? 0) || 1;
  const secretariaId = Number(req.headers["x-sirel-secretaria-id"] ?? 0) || null;

  return sessionPayload
    ? {
        id: sessionPayload.sub,
        username: sessionPayload.username,
        name: sessionPayload.name,
        email: sessionPayload.email ?? "",
        role: sessionPayload.role,
        secretariaId: sessionPayload.secretariaId,
      }
    : roleHeader
      ? {
          id: userId,
          username: String(req.headers["x-sirel-username"] ?? "demo"),
          name: String(req.headers["x-sirel-user-name"] ?? "Usuario demo"),
          email: String(req.headers["x-sirel-user-email"] ?? "demo@sirel.local"),
          role: roleHeader,
          secretariaId,
        }
      : null;
}

function requireUploadUser(req: express.Request, res: express.Response) {
  const user = resolveRequestUser(req);
  if (!user) {
    res.status(401).json({ message: "Login obrigatorio." });
    return null;
  }
  if (!["admin", "gestor", "operador"].includes(user.role)) {
    res.status(403).json({ message: "Acesso restrito a operadores, gestores e administradores." });
    return null;
  }
  return user;
}

const storage = multer.diskStorage({
  destination(req, _file, callback) {
    const processoId = String(req.body.processoId ?? "geral").replace(/\D+/g, "") || "geral";
    const targetDir = join(uploadsRoot, `processo-${processoId}`);
    mkdirSync(targetDir, { recursive: true });
    callback(null, targetDir);
  },
  filename(_req, file, callback) {
    const extension = extname(file.originalname) || "";
    const baseName = slugifyFileName(file.originalname.replace(extension, "")) || "documento";
    callback(null, `${Date.now()}-${baseName}${extension.toLowerCase()}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
});

const cadastroAssetStorage = multer.diskStorage({
  destination(req, _file, callback) {
    const entity = String(req.body.entity ?? "").trim().toLowerCase();
    const recordId = String(req.body.recordId ?? "").replace(/\D+/g, "") || "geral";
    const targetDir = join(cadastroAssetsRoot, `${entity}-${recordId}`);
    mkdirSync(targetDir, { recursive: true });
    callback(null, targetDir);
  },
  filename(_req, file, callback) {
    const extension = extname(file.originalname) || "";
    const baseName = slugifyFileName(file.originalname.replace(extension, "")) || "arquivo";
    callback(null, `${Date.now()}-${baseName}${extension.toLowerCase()}`);
  },
});

const cadastroAssetUpload = multer({
  storage: cadastroAssetStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
});

const ataSessaoStorage = multer.diskStorage({
  destination(_req, _file, callback) {
    mkdirSync(ataSessaoUploadsRoot, { recursive: true });
    callback(null, ataSessaoUploadsRoot);
  },
  filename(_req, file, callback) {
    const extension = extname(file.originalname) || ".pdf";
    const baseName = slugifyFileName(file.originalname.replace(extension, "")) || "ata-sessao";
    callback(null, `${Date.now()}-${baseName}${extension.toLowerCase()}`);
  },
});

const ataSessaoUpload = multer({
  storage: ataSessaoStorage,
  limits: { fileSize: 25 * 1024 * 1024 },
});

const sdStorage = multer.diskStorage({
  destination(_req, _file, callback) {
    mkdirSync(sdUploadsRoot, { recursive: true });
    callback(null, sdUploadsRoot);
  },
  filename(_req, file, callback) {
    const extension = extname(file.originalname) || ".pdf";
    const baseName = slugifyFileName(file.originalname.replace(extension, "")) || "sd";
    callback(null, `${Date.now()}-${baseName}${extension.toLowerCase()}`);
  },
});

const sdUpload = multer({
  storage: sdStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
});

app.use(cors({
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }

    const configuredOrigins = clientUrl
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    if (!configuredOrigins.length || configuredOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(null, true);
  },
  credentials: true,
}));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/healthz", (_req, res) => {
  res.json({ ok: true, service: "sirel-modern-server", timestamp: new Date().toISOString() });
});

app.post("/api/planejamento/documentos/upload", upload.single("arquivo"), async (req, res) => {
  try {
    const user = requireUploadUser(req, res);
    if (!user) return;
    if (!req.file) {
      res.status(400).json({ message: "Selecione um arquivo para upload." });
      return;
    }

    const processoId = Number(req.body.processoId ?? 0);
    const tipo = String(req.body.tipo ?? "").trim();
    const categoria = String(req.body.categoria ?? "").trim() || null;
    const titulo = String(req.body.titulo ?? req.file.originalname).trim();
    const descricao = String(req.body.descricao ?? "").trim() || null;
    const dataReferencia = String(req.body.dataReferencia ?? "").trim() || null;
    const publico = parseBooleanFlag(req.body.publico);
    const palavrasChave = parseStringArrayField(req.body.palavrasChave);
    const restritoA = parseStringArrayField(req.body.restritoA);
    if (!processoId || !titulo || !tipo) {
      res.status(400).json({ message: "Informe processo, tipo e titulo do documento." });
      return;
    }

    const db = requireDb();
    const latest = await db
      .select({ versao: documentos.versao })
      .from(documentos)
      .where(eq(documentos.processoId, processoId))
      .orderBy(desc(documentos.versao))
      .limit(1);
    const nextVersion = Number(latest[0]?.versao ?? 0) + 1;
    const relativePath = req.file.path.replace(/\\/g, "/").split("/storage/uploads/").pop() ?? req.file.filename;

    const [created] = await db.insert(documentos).values({
      processoId,
      titulo,
      descricao,
      tipo: tipo as "DFD" | "ETP" | "TR" | "EDITAL" | "COMUNICACAO_INTERNA" | "RESULTADO" | "CONTRATO" | "OUTRO",
      categoria,
      versao: nextVersion,
      arquivoUrl: "",
      arquivoChave: relativePath,
      tamanhoBytes: req.file.size,
      mimeType: req.file.mimetype,
      dataReferencia,
      publico,
      palavrasChave,
      restritoA,
      criadoPor: user.id,
      criadoEm: new Date(),
      atualizadoEm: new Date(),
    }).returning();

    const downloadUrl = `/api/planejamento/documentos/${created.id}/download`;
    await db.update(documentos).set({ arquivoUrl: downloadUrl, atualizadoEm: new Date() }).where(eq(documentos.id, created.id));

    await logAuditoria({ user } as any, {
      tabela: "documentos",
      registroId: created.id,
      acao: "CREATE",
      dadosNovos: { ...created, arquivoUrl: downloadUrl },
      descricao: `Documento ${titulo} enviado por upload local`,
    });

    res.status(201).json({ ...created, arquivoUrl: downloadUrl });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Falha ao salvar o documento enviado." });
  }
});

app.post("/api/cadastros/assets/upload", cadastroAssetUpload.single("arquivo"), async (req, res) => {
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
      res.status(400).json({ message: "Informe a entidade e o registro do cadastro." });
      return;
    }

    const relativePath = req.file.path.replace(/\\/g, "/").split("/storage/uploads/").pop() ?? req.file.filename;
    const db = requireDb();

    if (entity === "itens") {
      const [item] = await db.select().from(catalogoItens).where(eq(catalogoItens.id, recordId)).limit(1);
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
      const [updated] = await db.update(catalogoItens).set({
        imagemUrl: assetUrl,
        imagemChave: relativePath,
        atualizadoEm: new Date(),
      }).where(eq(catalogoItens.id, recordId)).returning();

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

    const [fornecedor] = await db.select().from(fornecedores).where(eq(fornecedores.id, recordId)).limit(1);
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
    const [updated] = await db.update(fornecedores).set({
      logoUrl: assetUrl,
      logoChave: relativePath,
      atualizadoEm: new Date(),
    }).where(eq(fornecedores.id, recordId)).returning();

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
    res.status(500).json({ message: "Falha ao salvar o arquivo do cadastro." });
  }
});

app.post("/api/relatorios/ata-sessao/processar", ataSessaoUpload.single("arquivo"), async (req, res) => {
  try {
    const user = requireUploadUser(req, res);
    if (!user) return;
    if (!req.file) {
      res.status(400).json({ message: "Selecione um arquivo PDF da ata para processar." });
      return;
    }

    const extension = extname(req.file.originalname).toLowerCase();
    if (extension !== ".pdf") {
      res.status(400).json({ message: "Somente arquivos PDF de ata de sessão são aceitos." });
      return;
    }

    const result = await generateAtaSessaoReports({
      sourcePath: req.file.path,
      generatedByName: user.name,
      edital: String(req.body.edital ?? "").trim() || undefined,
      processoAdministrativo: String(req.body.processoAdministrativo ?? "").trim() || undefined,
      arquivoOrigem: String(req.body.arquivoOrigem ?? req.file.originalname).trim() || undefined,
      dataGeracao: String(req.body.dataGeracao ?? "").trim() || undefined,
    });
    const artifacts = result.artifacts.map((artifact) => {
      const relativePath = relative(ataSessaoReportsRoot, resolve(artifact.path)).replace(/\\/g, "/").replace(/^\/+/, "");
      return {
        ...artifact,
        relativePath,
        downloadUrl: `/api/relatorios/ata-sessao/download?file=${encodeURIComponent(relativePath)}`,
      };
    });

    await logAuditoria({ user } as any, {
      tabela: "relatorios_ata_sessao",
      registroId: 0,
      acao: "CREATE",
      dadosNovos: {
        arquivoOriginal: req.file.originalname,
        outputDir: result.outputDir,
        summary: result.summary,
      },
      descricao: `Processamento avulso de ata de sessão em Documentos: ${req.file.originalname}`,
    });

    res.status(201).json({
      ...result,
      originalFileName: req.file.originalname,
      artifacts,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Falha ao processar a ata de sessão enviada." });
  }
});

app.post("/api/relatorios/sd/processar", sdUpload.single("arquivo"), async (req, res) => {
  try {
    const user = requireUploadUser(req, res);
    if (!user) return;
    if (!req.file) {
      res.status(400).json({ message: "Selecione um arquivo PDF da SD para processar." });
      return;
    }

    const extension = extname(req.file.originalname).toLowerCase();
    if (extension !== ".pdf") {
      res.status(400).json({ message: "Somente arquivos PDF de Solicitação de Despesa são aceitos." });
      return;
    }

    const result = await parseSdReport(req.file.path);
    const relativeJsonPath = relative(sdReportsRoot, resolve(result.outputDir, "sd-parsed.json"))
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
    res.status(500).json({ message: "Falha ao processar a SD enviada." });
  }
});

app.get("/api/relatorios/ata-sessao/download", async (req, res) => {
  try {
    const relativeFile = String(req.query.file ?? "").trim().replace(/\\/g, "/").replace(/^\/+/, "");
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
    const baseName = rawName.endsWith(extension) ? rawName.slice(0, -extension.length) : rawName;
    res.setHeader("Content-Disposition", `attachment; filename=\"${slugifyFileName(baseName) || "relatorio"}${extension}\"`);
    res.sendFile(absolutePath);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Falha ao disponibilizar o relatório da ata." });
  }
});

app.get("/api/relatorios/sd/download", async (req, res) => {
  try {
    const relativeFile = String(req.query.file ?? "").trim().replace(/\\/g, "/").replace(/^\/+/, "");
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
    res.setHeader("Content-Disposition", `attachment; filename=\"${slugifyFileName(rawName.replace(/\\.json$/i, ""))}.json\"`);
    res.sendFile(absolutePath);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Falha ao baixar o parse de SD." });
  }
});

app.get("/api/cadastros/assets/:entity/:recordId/download", async (req, res) => {
  try {
    const entity = String(req.params.entity ?? "").trim();
    const recordId = Number(req.params.recordId ?? 0);
    const db = requireDb();

    if (!recordId || !["itens", "fornecedores"].includes(entity)) {
      res.status(400).json({ message: "Cadastro inválido." });
      return;
    }

    if (entity === "itens") {
      const [item] = await db.select().from(catalogoItens).where(eq(catalogoItens.id, recordId)).limit(1);
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

    const [fornecedor] = await db.select().from(fornecedores).where(eq(fornecedores.id, recordId)).limit(1);
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
    res.status(500).json({ message: "Falha ao disponibilizar o arquivo do cadastro." });
  }
});

app.get("/api/planejamento/documentos/:documentoId/download", async (req, res) => {
  try {
    const db = requireDb();
    const documentoId = Number(req.params.documentoId ?? 0);
    const [documento] = await db.select().from(documentos).where(eq(documentos.id, documentoId)).limit(1);
    if (!documento?.arquivoChave) {
      res.status(404).json({ message: "Documento não encontrado." });
      return;
    }

    const absolutePath = resolveDocumentoPath(documento.arquivoChave);
    if (!existsSync(absolutePath)) {
      res.status(404).json({ message: "Arquivo físico não encontrado." });
      return;
    }

    const extension = extname(documento.arquivoChave || "") || extname(absolutePath);
    const downloadName = `${slugifyFileName(documento.titulo || "documento") || "documento"}${extension}`;
    const forceDownload = String(req.query.download ?? "").trim() === "1";
    const mimeType = documento.mimeType?.trim() || "application/octet-stream";

    res.setHeader("Content-Type", mimeType);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Disposition", `${forceDownload ? "attachment" : "inline"}; filename=\"${downloadName}\"`);
    res.sendFile(absolutePath);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Falha ao disponibilizar o documento." });
  }
});

app.delete("/api/planejamento/documentos/:documentoId", async (req, res) => {
  try {
    const user = requireUploadUser(req, res);
    if (!user) return;

    const db = requireDb();
    const documentoId = Number(req.params.documentoId ?? 0);
    const [documento] = await db.select().from(documentos).where(eq(documentos.id, documentoId)).limit(1);
    if (!documento) {
      res.status(404).json({ message: "Documento não encontrado." });
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

app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));

const server = app.listen(port, host, () => {
  startImportacoesScheduler();
  startBllLocalScheduler();
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

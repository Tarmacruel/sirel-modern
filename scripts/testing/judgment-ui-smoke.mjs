import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import superjson from "superjson";
import { createServer } from "vite";
import { createDisputeFixture } from "./fixtures/dispute-ui-fixture.mjs";

// node --import tsx scripts/testing/judgment-ui-smoke.mjs [--published]
// Exercise the actual UI and flow evaluator with synthetic data; intercept every API.
const published = process.argv.includes("--published");
const origin = published ? "https://www.sirel.com.br" : "http://127.0.0.1:5190";
const output = resolve(
  `output/playwright/judgment-ui${published ? "-published" : ""}`,
);
mkdirSync(output, { recursive: true });
const server = published
  ? null
  : await createServer({
      root: resolve("client"),
      configFile: resolve("client/vite.config.ts"),
      server: {
        port: 5190,
        strictPort: true,
        host: "127.0.0.1",
        proxy: { "/api": { target: "http://127.0.0.1:1" } },
      },
    });
await server?.listen();
let browser, page;
function createJudgmentFixture(options = {}) {
  const base = createDisputeFixture({ populated: true, ...options });
  for (const item of base.detail().flow.evidence) {
    if (item.phase === "DISPUTA")
      base.upload({ category: item.category, title: item.label });
  }
  base.mutate("licitacao.advanceStage", { statusLicitacao: "JULGAMENTO" });
  const proposals = base.detail().propostas;
  proposals.splice(2);
  proposals.forEach((p, i) => {
    p.classificacao = null;
    p.valorAtualTotal = 14000;
    p.justificativa = null;
    p.licitanteNome = i
      ? "Comercial Horizonte Ltda."
      : "Fornecedor de teste Ltda.";
  });
  const originalMutate = base.mutate;
  base.mutate = (name, input) => {
    if (name === "licitacao.saveProposta" && input.propostaId) {
      base.mutations.push({ name, input });
      Object.assign(
        proposals.find((p) => p.id === input.propostaId),
        input,
      );
      return { success: true };
    }
    return originalMutate(name, input);
  };
  return base;
}
let fixture = createJudgmentFixture();
const errors = [],
  unexpectedRequests = [],
  calls = [];
try {
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  await context.addInitScript(() => {
    localStorage.setItem("sirel-theme", "dark");
    localStorage.setItem("sirel-sidebar-collapsed", "1");
  });
  await context.route("**/*", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (
      published &&
      url.origin === "https://static.cloudflareinsights.com" &&
      url.pathname.startsWith("/beacon.min.js")
    )
      return route.abort();
    if (url.origin !== origin) {
      unexpectedRequests.push(request.url());
      return route.abort();
    }
    try {
      if (url.pathname.startsWith("/api/trpc/")) {
        const names = decodeURIComponent(
          url.pathname.slice("/api/trpc/".length),
        ).split(",");
        const payload =
          request.method() === "GET"
            ? null
            : JSON.parse(request.postData() ?? "{}");
        const response = names.map((name, index) => {
          calls.push(name);
          const input = payload
            ? superjson.deserialize(
                url.searchParams.has("batch") ? payload[index] : payload,
              )
            : null;
          return {
            result: {
              data: superjson.serialize(
                payload ? fixture.mutate(name, input) : fixture.query(name),
              ),
            },
          };
        });
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            url.searchParams.has("batch") ? response : response[0],
          ),
        });
      }
      if (url.pathname === "/api/planejamento/documentos/upload") {
        const body = request.postData() ?? "";
        const field = (name) =>
          body.match(new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r]+)`))?.[1] ??
          "";
        calls.push(`upload:${field("categoria")}`);
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            fixture.upload({
              category: field("categoria"),
              title: field("titulo"),
            }),
          ),
        });
      }
      if (
        url.pathname === "/api/licitacao/ata-sessao/processar" ||
        url.pathname === "/api/licitacao/ata-sessao/aplicar"
      ) {
        const input = request.postDataJSON();
        const result = url.pathname.endsWith("processar")
          ? fixture.preview(input.documentoId)
          : fixture.applyPreview(input.runId);
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(result),
        });
      }
      if (url.pathname.startsWith("/api/")) {
        unexpectedRequests.push(request.url());
        return route.abort();
      }
      return route.continue();
    } catch (error) {
      errors.push(`Fixture: ${error.message}`);
      return route.abort();
    }
  });
  page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.setDefaultNavigationTimeout(45000);
  page.on("pageerror", (error) => errors.push(error.message));
  const workspace = () =>
    page.getByRole("region", { name: "Julgamento", exact: true });
  const documents = () =>
    workspace().getByRole("list", {
      name: "Documentos do julgamento",
      exact: true,
    });
  const tab = (name) =>
    workspace().getByRole("tab", { name: new RegExp(`^${name}`) });
  const next = () =>
    workspace().getByRole("button", { name: /Avançar para habilitação/i });
  const pdf = {
    name: "Ata de teste.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n% Synthetic fixture\n%%EOF"),
  };
  async function capture(name) {
    await page
      .getByRole("status")
      .getByRole("button")
      .evaluateAll((buttons) => {
        buttons.forEach((button) => button.click());
      });
    writeFileSync(
      resolve(output, `${name}.yml`),
      await page.locator("body").ariaSnapshot(),
    );
    await page.screenshot({
      path: resolve(output, `${name}.png`),
      fullPage: true,
    });
  }
  async function open(phase = "JULGAMENTO") {
    await page.goto(`${origin}/licitacao/2567?fase=${phase}`);
    if (phase === "JULGAMENTO") await workspace().waitFor({ timeout: 30000 });
    await page.waitForLoadState("networkidle");
  }
  async function saveAndRefresh(button, procedure) {
    await Promise.all([
      page.waitForResponse((response) => response.url().includes(procedure)),
      button.click(),
    ]);
    await page.waitForLoadState("networkidle");
  }
  await open();
  assert.equal(await workspace().getByRole("tab").count(), 2);
  assert.equal(await next().isDisabled(), true);
  assert.equal(
    await workspace().getByRole("progressbar").getAttribute("aria-valuenow"),
    "0",
  );
  await capture("desktop-documents");
  await tab("Classificação").click();
  await workspace()
    .getByRole("table", { name: "Classificação das propostas" })
    .waitFor();
  await capture("desktop-ranking");
  await workspace()
    .getByRole("button", { name: /Editar classificação/ })
    .first()
    .click();
  await capture("desktop-edit");
  await page.getByLabel("Classificação", { exact: true }).fill("1");
  await page
    .getByLabel("Justificativa", { exact: true })
    .fill("Proposta aceita após análise técnica.");
  await saveAndRefresh(
    page.getByRole("button", { name: "Salvar classificação" }),
    "licitacao.saveProposta",
  );
  assert.equal(fixture.mutations.at(-1).input.propostaId, 8701);
  assert.equal(fixture.mutations.at(-1).input.valorUnitarioProposto, 1450);
  assert.equal(
    fixture.mutations.at(-1).input.dataProposta,
    "2026-09-14T12:00:00.000Z",
  );
  await workspace().getByRole("table").getByText("1º lugar").waitFor();
  assert.equal(await next().isDisabled(), true);
  await tab("Documentos").click();
  await workspace()
    .getByLabel("Selecionar arquivo do documento", { exact: true })
    .setInputFiles(pdf);
  await saveAndRefresh(
    workspace().getByRole("button", { name: "Salvar documento", exact: true }),
    "upload",
  );
  await next().click({ trial: true });
  await capture("desktop-ready");
  await page.setViewportSize({ width: 390, height: 844 });
  await capture("mobile-documents");
  await documents().getByRole("button").first().click();
  await capture("mobile-document-detail");
  await workspace()
    .getByRole("button", { name: "Voltar aos documentos" })
    .click();
  await tab("Classificação").click();
  await capture("mobile-ranking");
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await saveAndRefresh(next(), "licitacao.advanceStage");
  assert.equal(fixture.mutations.at(-1).input.statusLicitacao, "HABILITACAO");
  await page.waitForURL(/fase=HABILITACAO/);
  fixture = createJudgmentFixture({ inverted: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await open();
  assert.equal(
    await workspace()
      .getByRole("button", { name: /Avançar para recursos/i })
      .count(),
    1,
  );
  fixture = createJudgmentFixture({ direct: true });
  await open();
  assert.equal(await tab("Licitantes").count(), 1);
  await capture("desktop-direct");
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpectedRequests, []);
  writeFileSync(
    resolve(output, "result.json"),
    JSON.stringify(
      {
        errors,
        unexpectedRequests,
        classificationEdit: true,
        blockingGate: true,
        phaseInversion: true,
        directMode: true,
        mobileOverflow: false,
      },
      null,
      2,
    ),
  );
  console.log(`Judgment UI smoke passed. Artifacts: ${output}`);
} catch (error) {
  if (page) {
    await page.screenshot({
      path: resolve(output, "failure.png"),
      fullPage: true,
    });
    writeFileSync(
      resolve(output, "failure.yml"),
      await page.locator("body").ariaSnapshot(),
    );
    writeFileSync(
      resolve(output, "failure.json"),
      JSON.stringify(
        { message: error.message, errors, unexpectedRequests },
        null,
        2,
      ),
    );
  }
  throw error;
} finally {
  await browser?.close();
  await server?.close();
}

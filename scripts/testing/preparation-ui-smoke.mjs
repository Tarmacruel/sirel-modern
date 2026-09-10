import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import superjson from "superjson";
import { createServer } from "vite";
import { createPreparationFixture } from "./fixtures/preparation-ui-fixture.mjs";

// Run: npm run build --workspace shared && node --import tsx scripts/testing/preparation-ui-smoke.mjs
// All API traffic stays in this browser's route fixture. No server, credentials or database are used.
const port = 5186;
const published = process.argv.includes("--published");
const origin = published ? "https://www.sirel.com.br" : `http://127.0.0.1:${port}`;
const output = resolve(`output/playwright/preparation-ui${published ? "-published" : ""}`);
mkdirSync(output, { recursive: true });
const server = published ? null : await createServer({ root: resolve("client"), configFile: resolve("client/vite.config.ts"), server: { port, strictPort: true, host: "127.0.0.1", proxy: { "/api": { target: "http://127.0.0.1:1" } } } });
await server?.listen();
let browser, page;
const errors = [], unexpectedRequests = [], blockedAnalytics = [], calls = [];
try {
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const browserContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  const fixture = createPreparationFixture();
  await browserContext.route("**/*", async (route) => {
    const request = route.request(), url = new URL(request.url());
    // Cloudflare injects analytics into the published HTML. Block it as well;
    // the UI validation must neither send telemetry nor depend on that script.
    if (published && url.origin === "https://static.cloudflareinsights.com" && url.pathname.startsWith("/beacon.min.js")) {
      blockedAnalytics.push(request.url());
      return route.abort();
    }
    if (url.origin !== origin) { unexpectedRequests.push(request.url()); return route.abort(); }
    if (url.pathname.startsWith("/api/trpc/")) {
      const names = decodeURIComponent(url.pathname.slice("/api/trpc/".length)).split(",");
      const response = names.map((name) => {
        calls.push(name);
        if (request.method() !== "GET") throw new Error(`Unexpected mutation: ${name}`);
        return { result: { data: superjson.serialize(fixture.query(name)) } };
      });
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(url.searchParams.has("batch") ? response : response[0]) });
    }
    if (url.pathname === "/api/planejamento/documentos/upload") {
      const body = request.postData() ?? "";
      const field = (name) => body.match(new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r]+)`))?.[1] ?? "";
      assert(field("categoria"), "Upload must carry the selected object category");
      calls.push(`upload:${field("categoria")}`);
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fixture.upload({ category: field("categoria"), title: field("titulo") })) });
    }
    if (url.pathname.startsWith("/api/")) { unexpectedRequests.push(request.url()); return route.abort(); }
    return route.continue();
  });
  page = await browserContext.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => errors.push(error.message));
  async function capture(name) {
    writeFileSync(resolve(output, `${name}.yml`), await page.locator("body").ariaSnapshot());
    await page.screenshot({ path: resolve(output, `${name}.png`), fullPage: true });
  }
  await page.goto(`${origin}/licitacao/2567?fase=PREPARACAO`);
  await page.getByText("0140/2026", { exact: true }).first().waitFor({ timeout: 30000 });
  await page.waitForLoadState("networkidle");
  await capture("desktop");
  const workspace = page.getByRole("region", { name: "Preparação", exact: true });
  const documents = () => page.getByRole("list", { name: "Documentos da preparação", exact: true });
  const advance = workspace.getByRole("button", { name: "Avançar para publicação", exact: true });
  assert.equal(await page.getByRole("progressbar").getAttribute("aria-valuenow"), "4");
  assert.equal(await documents().getByRole("listitem").count(), 9);
  assert.equal(await advance.isDisabled(), true);

  // Other phases remain read-only while preparation has required evidence missing.
  await page.getByRole("button", { name: "Ver etapas", exact: true }).click();
  const phases = page.getByRole("navigation", { name: "Fases da licitação" });
  assert.equal(await phases.getByRole("button", { name: /Disputa|Recursos/ }).count(), 0);
  assert.equal(await phases.getByRole("button", { name: /Publica[cç][aã]o/ }).isDisabled(), true);
  await page.getByRole("button", { name: "Ocultar etapas", exact: true }).click();

  await page.getByRole("button", { name: "Mais ações", exact: true }).click();
  await page.getByRole("button", { name: "Fora do fluxo", exact: true }).click();
  const audit = page.getByRole("heading", { name: "Justificativa de auditoria", exact: true });
  await audit.waitFor();
  await page.getByRole("textbox", { name: "Justificativa obrigatoria", exact: true }).fill("Validação local da navegação por teclado.");
  await page.getByRole("textbox", { name: "Justificativa obrigatoria", exact: true }).press("Escape");
  await audit.waitFor({ state: "hidden" });
  assert.equal(await page.getByRole("button", { name: "Mais ações", exact: true }).getAttribute("aria-expanded"), "false");

  await workspace.getByRole("button", { name: "Concluídos", exact: true }).click();
  assert.equal(await documents().getByRole("listitem").count(), 1);
  assert.equal(await workspace.getByRole("link", { name: "Abrir documento", exact: true }).isVisible(), true);
  assert.equal(await workspace.getByLabel("Selecionar arquivo do documento", { exact: true }).isVisible(), false);
  assert.equal(await workspace.getByRole("button", { name: "Remover documento", exact: true }).isVisible(), false);
  await capture("desktop-completed-document");
  await workspace.getByRole("button", { name: "Pendentes", exact: true }).click();
  assert.equal(await documents().getByRole("listitem").count(), 8);
  await documents().getByRole("button", { name: /Pesquisa de preços/ }).click();
  await workspace.getByRole("heading", { name: "Pesquisa de preços", exact: true }).waitFor();
  assert.equal(await workspace.getByRole("button", { name: "Salvar documento", exact: true }).isDisabled(), true);

  // A selected local file and custom title survive switching away and back to its object.
  const pdf = { name: "Pesquisa de preços — validação.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n% Synthetic UI fixture only\n%%EOF") };
  await workspace.getByLabel("Selecionar arquivo do documento", { exact: true }).setInputFiles(pdf);
  await workspace.getByText("Personalizar título e descrição", { exact: true }).click();
  await workspace.getByPlaceholder("Pesquisa de preços", { exact: true }).fill("Pesquisa de preços revisada");
  await workspace.getByRole("tab", { name: "Itens", exact: true }).click();
  await workspace.getByText("Materiais de manutenção predial", { exact: true }).waitFor();
  assert.equal(await workspace.getByLabel("Selecionar arquivo do documento", { exact: true }).isVisible(), false);
  await capture("desktop-items");
  await workspace.getByRole("tab", { name: "Itens", exact: true }).press("ArrowRight");
  assert.equal(await workspace.getByRole("tab", { name: "Responsáveis", exact: true }).getAttribute("aria-selected"), "true");
  assert.equal(await workspace.getByRole("list", { name: "Responsáveis da preparação", exact: true }).getByRole("listitem").count(), 3);
  await capture("desktop-people");
  await workspace.getByRole("tab", { name: "Configuração", exact: true }).click();
  await capture("desktop-configuration");
  await workspace.getByRole("tab", { name: /^Documentos/ }).click();
  await documents().getByRole("button", { name: /Pesquisa de preços/ }).click();
  await workspace.getByText("Personalizar título e descrição", { exact: true }).click();
  assert.equal(await workspace.getByPlaceholder("Pesquisa de preços", { exact: true }).inputValue(), "Pesquisa de preços revisada");
  assert.equal(await workspace.getByRole("button", { name: "Salvar documento", exact: true }).isDisabled(), false);
  await capture("desktop-document-ready");

  // Mobile switches between the object list and a focused detail panel.
  await page.setViewportSize({ width: 390, height: 844 });
  await workspace.getByRole("tab", { name: /^Documentos/ }).click();
  await page.getByRole("heading", { name: "0140/2026", exact: true }).scrollIntoViewIfNeeded();
  await capture("mobile");
  await documents().getByRole("button", { name: /Pesquisa de preços/ }).click();
  await workspace.getByRole("button", { name: "Voltar aos documentos", exact: true }).waitFor();
  assert.equal(await documents().isVisible(), false);
  assert.equal(await workspace.getByRole("heading", { name: "Pesquisa de preços", exact: true }).isVisible(), true);
  await capture("mobile-document-detail");
  await workspace.getByRole("button", { name: "Voltar aos documentos", exact: true }).click();
  assert.equal(await documents().isVisible(), true);
  assert.equal(await documents().getByRole("button", { name: /Pesquisa de preços/ }).evaluate((element) => document.activeElement === element), true);
  await documents().getByRole("button", { name: /Pesquisa de preços/ }).scrollIntoViewIfNeeded();
  await capture("mobile-document-list");
  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  assert.equal(horizontalOverflow, false, "Mobile page must fit the viewport");

  // Actual upload UI calls a browser-local fixture only, and completion refreshes the flow count.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await documents().getByRole("button", { name: /Pesquisa de preços/ }).click();
  await workspace.getByRole("button", { name: "Salvar documento", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow") === "5");
  assert.equal(calls.filter((name) => name === "upload:LICITACAO_PESQUISA_PRECOS").length, 1);
  assert.equal(await advance.isDisabled(), true, "Other required evidence still blocks advancement");
  await capture("desktop-upload-completed");
  await page.goto(`${origin}/licitacao/2567?fase=HOMOLOGACAO`);
  await page.getByRole("region", { name: "Preparação", exact: true }).waitFor();
  assert.match(page.url(), /fase=PREPARACAO/);
  assert.deepEqual(errors, [], "No browser runtime errors");
  assert.deepEqual(unexpectedRequests, [], "All API data must remain isolated");
  writeFileSync(resolve(output, "result.json"), JSON.stringify({ errors, unexpectedRequests, blockedAnalytics, calls, mobileHorizontalOverflow: horizontalOverflow, objectFilters: true, completedDocumentDisclosure: true, tabKeyboardNavigation: true, fileDraftPreserved: true, mobileListDetailNavigation: true, fixtureUploadCompleted: true, blockedPhaseRedirect: true }, null, 2));
  console.log(`Preparation UI smoke passed. Artifacts: ${output}`);
} catch (error) {
  if (page) {
    writeFileSync(resolve(output, "failure.yml"), await page.locator("body").ariaSnapshot());
    await page.screenshot({ path: resolve(output, "failure.png"), fullPage: true });
    writeFileSync(resolve(output, "failure.json"), JSON.stringify({ message: error.message, errors, unexpectedRequests, calls }, null, 2));
  }
  throw error;
} finally {
  await browser?.close();
  await server?.close();
}

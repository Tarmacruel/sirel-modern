import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import superjson from "superjson";
import { createServer } from "vite";
import { createPublicationFixture } from "./fixtures/publication-ui-fixture.mjs";

// Run: node --import tsx scripts/testing/publication-ui-smoke.mjs [--published]
// Uses the actual UI and flow evaluator, with every API intercepted locally.
const published = process.argv.includes("--published");
const origin = published ? "https://www.sirel.com.br" : "http://127.0.0.1:5187";
const output = resolve(`output/playwright/publication-ui${published ? "-published" : ""}`);
mkdirSync(output, { recursive: true });
const server = published ? null : await createServer({ root: resolve("client"), configFile: resolve("client/vite.config.ts"), server: { port: 5187, strictPort: true, host: "127.0.0.1", proxy: { "/api": { target: "http://127.0.0.1:1" } } } });
await server?.listen();
let browser, page;
let fixture = createPublicationFixture();
const errors = [], unexpectedRequests = [], blockedAnalytics = [], calls = [];
try {
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  await context.addInitScript(() => {
    localStorage.setItem("sirel-theme", "dark");
    localStorage.setItem("sirel-sidebar-collapsed", "1");
  });
  await context.route("**/*", async (route) => {
    const request = route.request(), url = new URL(request.url());
    if (published && url.origin === "https://static.cloudflareinsights.com" && url.pathname.startsWith("/beacon.min.js")) {
      blockedAnalytics.push(request.url());
      return route.abort();
    }
    if (url.origin !== origin) { unexpectedRequests.push(request.url()); return route.abort(); }
    if (url.pathname.startsWith("/api/trpc/")) {
      const names = decodeURIComponent(url.pathname.slice("/api/trpc/".length)).split(",");
      const payload = request.method() === "GET" ? null : JSON.parse(request.postData() ?? "{}");
      const response = names.map((name, index) => {
        calls.push(name);
        const input = payload ? superjson.deserialize(url.searchParams.has("batch") ? payload[index] : payload) : null;
        return { result: { data: superjson.serialize(payload ? fixture.mutate(name, input) : fixture.query(name)) } };
      });
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(url.searchParams.has("batch") ? response : response[0]) });
    }
    if (url.pathname === "/api/planejamento/documentos/upload") {
      const body = request.postData() ?? "";
      const field = (name) => body.match(new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r]+)`))?.[1] ?? "";
      calls.push(`upload:${field("categoria")}`);
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fixture.upload({ category: field("categoria"), title: field("titulo") })) });
    }
    if (url.pathname.startsWith("/api/")) { unexpectedRequests.push(request.url()); return route.abort(); }
    return route.continue();
  });
  page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => errors.push(error.message));
  const workspace = () => page.getByRole("region", { name: "Publicação", exact: true });
  const documentList = () => workspace().getByRole("list", { name: "Documentos da publicação", exact: true });
  async function capture(name) {
    writeFileSync(resolve(output, `${name}.yml`), await page.locator("body").ariaSnapshot());
    await page.screenshot({ path: resolve(output, `${name}.png`), fullPage: true });
  }
  async function open() {
    await page.goto(`${origin}/licitacao/2567?fase=PUBLICACAO`);
    await workspace().waitFor({ timeout: 30000 });
    await page.waitForLoadState("networkidle");
  }
  await open();
  assert.equal(await workspace().getByRole("tab").count(), 3);
  assert.equal(await documentList().getByRole("listitem").count(), 3);
  assert.equal(await page.getByText("Fila de evidencias", { exact: true }).isVisible(), false);
  assert.equal(await workspace().getByRole("progressbar").getAttribute("aria-valuenow"), "1");
  assert.equal(await workspace().getByRole("progressbar").getAttribute("aria-valuemax"), "6");
  await capture("desktop-documents");

  await page.getByRole("button", { name: "Ver etapas", exact: true }).click();
  assert.equal(await page.getByRole("navigation", { name: "Fases da licitação" }).getByRole("button", { name: /Disputa/ }).isDisabled(), true);
  await page.getByRole("button", { name: "Ocultar etapas", exact: true }).click();
  await page.getByRole("button", { name: "Mais ações", exact: true }).click();
  await page.getByRole("button", { name: "Fora do fluxo", exact: true }).click();
  await page.getByRole("textbox", { name: "Justificativa obrigatoria", exact: true }).fill("Validação local da publicação manual.");
  await page.getByRole("textbox", { name: "Justificativa obrigatoria", exact: true }).press("Escape");

  await workspace().getByRole("button", { name: "Concluídos", exact: true }).click();
  assert.equal(await documentList().getByRole("listitem").count(), 1);
  assert.equal(await workspace().getByRole("link", { name: "Abrir documento", exact: true }).isVisible(), true);
  assert.equal(await workspace().getByLabel("Selecionar arquivo do documento", { exact: true }).isVisible(), false);
  await workspace().getByRole("button", { name: "Pendentes", exact: true }).click();
  const pdf = { name: "Aviso de contratação.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n% Synthetic fixture\n%%EOF") };
  await workspace().getByLabel("Selecionar arquivo do documento", { exact: true }).setInputFiles(pdf);
  await workspace().getByText("Personalizar título e descrição", { exact: true }).click();
  await workspace().getByPlaceholder("Aviso de Contratacao Direta", { exact: true }).fill("Aviso revisado");
  await workspace().getByRole("tab", { name: "Cronograma", exact: true }).click();
  await workspace().getByLabel("Data de publicação no PNCP", { exact: true }).fill("2026-09-15");
  await workspace().getByLabel("Recebimento inicial", { exact: true }).fill("2026-09-16T08:30");
  await workspace().getByLabel("Recebimento final", { exact: true }).fill("2026-09-23T08:00");
  await workspace().getByLabel("Abertura / disputa", { exact: true }).fill("2026-09-23T08:30");
  await capture("desktop-manual-schedule");
  await workspace().getByRole("tab", { name: "Cronograma", exact: true }).press("ArrowRight");
  assert.equal(await workspace().getByRole("tab", { name: "Canais e dados", exact: true }).getAttribute("aria-selected"), "true");
  await workspace().getByLabel("Link público do PNCP", { exact: true }).fill("https://pncp.gov.br/app/editais/fixture");
  await workspace().getByLabel("Link público da BLL", { exact: true }).fill("https://bllcompras.com/Process/fixture");
  await workspace().getByLabel("Observação operacional", { exact: true }).fill("Registro de validação da publicação.");
  await capture("desktop-channels");
  await workspace().getByRole("tab", { name: /^Documentos/ }).click();
  assert.equal(await workspace().getByRole("button", { name: "Salvar documento", exact: true }).isDisabled(), false);
  assert.equal(await workspace().getByPlaceholder("Aviso de Contratacao Direta", { exact: true }).inputValue(), "Aviso revisado");

  await page.setViewportSize({ width: 390, height: 844 });
  await workspace().getByRole("tab", { name: /^Documentos/ }).click();
  await page.getByRole("heading", { name: "0140/2026", exact: true }).scrollIntoViewIfNeeded();
  await capture("mobile-documents");
  await documentList().getByRole("button", { name: /Aviso de Contratacao Direta/ }).click();
  assert.equal(await documentList().isVisible(), false);
  await capture("mobile-detail");
  await workspace().getByRole("button", { name: "Voltar aos documentos", exact: true }).click();
  assert.equal(await documentList().getByRole("button", { name: /Aviso de Contratacao Direta/ }).evaluate((element) => document.activeElement === element), true);
  for (const tab of ["Cronograma", "Canais e dados"]) {
    await workspace().getByRole("tab", { name: tab, exact: true }).click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${tab} must fit mobile viewport`);
    await capture(`mobile-${tab === "Cronograma" ? "schedule" : "channels"}`);
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  await workspace().getByRole("tab", { name: /^Documentos/ }).click();
  await documentList().getByRole("button", { name: /Aviso de Contratacao Direta/ }).click();
  await workspace().getByRole("button", { name: "Salvar documento", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#licitacao-publicacao-form [role="progressbar"]')?.getAttribute("aria-valuenow") === "2");
  await documentList().getByRole("button", { name: /Diario Oficial do Municipio/ }).click();
  await workspace().getByLabel("Selecionar arquivo do documento", { exact: true }).setInputFiles({ ...pdf, name: "DOM.pdf" });
  await workspace().getByRole("button", { name: "Salvar documento", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#licitacao-publicacao-form [role="progressbar"]')?.getAttribute("aria-valuenow") === "3");
  await Promise.all([
    page.waitForResponse((response) => response.url().includes("licitacao.saveConfiguracao")),
    workspace().getByRole("button", { name: "Salvar cronograma", exact: true }).click(),
  ]);
  await page.waitForLoadState("networkidle");
  assert.equal(fixture.mutations[0]?.name, "licitacao.saveConfiguracao");
  assert.equal(fixture.mutations[0].input.dataAberturaPropostas, "2026-09-23T08:30");
  await workspace().getByRole("button", { name: "Publicar processo", exact: true }).click();
  await workspace().getByRole("button", { name: "Abrir próxima fase", exact: true }).waitFor();
  assert.equal(fixture.mutations.length, 2);
  const sent = fixture.mutations[1].input;
  assert.equal(sent.linkPncpPublico, "https://pncp.gov.br/app/editais/fixture");
  assert.equal(sent.linkBllPublico, "https://bllcompras.com/Process/fixture");
  assert.equal(sent.dataAberturaPropostas, "2026-09-23T08:30");
  assert.equal(sent.observacao, "Registro de validação da publicação.");
  assert.equal(await workspace().getByRole("button", { name: "Abrir próxima fase", exact: true }).isDisabled(), false);
  await capture("desktop-published");
  await workspace().getByRole("button", { name: "Abrir próxima fase", exact: true }).click();
  await page.waitForURL(/fase=DISPUTA/);

  fixture = createPublicationFixture({ manual: false });
  await open();
  await workspace().getByRole("tab", { name: "Cronograma", exact: true }).click();
  assert.equal(await workspace().getByLabel("Abertura / disputa", { exact: true }).count(), 0);
  await workspace().getByLabel("Data de publicação no PNCP", { exact: true }).fill("2026-09-15");
  await workspace().getByLabel("Hora da disputa", { exact: true }).fill("09:00");
  await capture("desktop-automatic-schedule");

  fixture = createPublicationFixture({ manual: false, modalidade: "INEXIGIBILIDADE" });
  await open();
  await workspace().getByRole("tab", { name: "Canais e dados", exact: true }).click();
  await workspace().getByRole("combobox", { name: "Fundamento legal da inexigibilidade", exact: true }).waitFor();
  assert.equal(await workspace().getByLabel("Link público da BLL", { exact: true }).count(), 0);
  await capture("desktop-inexigibilidade");

  assert.deepEqual(errors, [], "No browser runtime errors");
  assert.deepEqual(unexpectedRequests, [], "No unmocked API or external traffic");
  writeFileSync(resolve(output, "result.json"), JSON.stringify({ published, errors, unexpectedRequests, blockedAnalytics, calls, publicationPayloadVerified: true, automaticSchedule: true, conditionalChannels: true, mobileOverflow: false }, null, 2));
  console.log(`Publication UI smoke passed. Artifacts: ${output}`);
} catch (error) {
  if (page) {
    await page.screenshot({ path: resolve(output, "failure.png"), fullPage: true });
    writeFileSync(resolve(output, "failure.yml"), await page.locator("body").ariaSnapshot());
    writeFileSync(resolve(output, "failure.json"), JSON.stringify({ message: error.message, errors, unexpectedRequests, calls }, null, 2));
  }
  throw error;
} finally {
  await browser?.close();
  await server?.close();
}

import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import superjson from "superjson";
import { createServer } from "vite";
import { createQualificationFixture } from "./fixtures/qualification-ui-fixture.mjs";

// node --import tsx scripts/testing/qualification-ui-smoke.mjs [--published]
// Exercise the actual UI and flow evaluator with synthetic data; intercept every API.
const published = process.argv.includes("--published");
const origin = published ? "https://www.sirel.com.br" : "http://127.0.0.1:5189";
const output = resolve(
  `output/playwright/qualification-ui${published ? "-published" : ""}`,
);
mkdirSync(output, { recursive: true });
const server = published
  ? null
  : await createServer({
      root: resolve("client"),
      configFile: resolve("client/vite.config.ts"),
      server: {
        port: 5189,
        strictPort: true,
        host: "127.0.0.1",
        proxy: { "/api": { target: "http://127.0.0.1:1" } },
      },
    });
await server?.listen();
let browser, page;
let fixture = createQualificationFixture();
let rejectNextReview = false;
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
          if (name === "licitacao.saveHabilitacao" && rejectNextReview) {
            rejectNextReview = false;
            return {
              error: superjson.serialize({
                message: "Não foi possível salvar a análise. Tente novamente.",
                code: -32603,
                data: {
                  code: "INTERNAL_SERVER_ERROR",
                  httpStatus: 500,
                  path: name,
                },
              }),
            };
          }
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
    page.getByRole("region", { name: "Habilitação", exact: true });
  const docs = () =>
    workspace().getByRole("list", { name: "Documentos da habilitação" });
  const tab = (name) =>
    workspace().getByRole("tab", { name: new RegExp(`^${name}`) });
  const next = () => workspace().getByRole("button", { name: /^Avançar para/ });
  const form = () => page.locator("#licitacao-habilitacao-form");
  const review = (name = "Fornecedor de teste Ltda.") =>
    workspace().getByRole("button", {
      name: `Revisar habilitação de ${name}`,
      exact: true,
    });
  const pdf = {
    name: "Habilitação.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n% Synthetic fixture\n%%EOF"),
  };
  async function capture(name) {
    await page
      .getByRole("status")
      .getByRole("button")
      .evaluateAll((buttons) => buttons.forEach((button) => button.click()));
    writeFileSync(
      resolve(output, `${name}.yml`),
      await page.locator("body").ariaSnapshot(),
    );
    await page.screenshot({
      path: resolve(output, `${name}.png`),
      fullPage: true,
    });
  }
  async function open() {
    await page.goto(`${origin}/licitacao/2567?fase=HABILITACAO`);
    await workspace().waitFor({ timeout: 30000 });
    await page.waitForLoadState("networkidle");
  }
  async function saveReview(status, observation) {
    await form()
      .getByRole("combobox", { name: "Situação da habilitação", exact: true })
      .selectOption(status);
    await form().getByRole("textbox", { name: "Observação", exact: true }).fill(observation);
    await page
      .getByRole("button", { name: "Salvar habilitação", exact: true })
      .click();
    await form().waitFor({ state: "hidden" });
  }
  await open();
  assert.equal(await workspace().getByRole("tab").count(), 2);
  assert.equal(await docs().getByRole("listitem").count(), 1);
  assert.equal(
    await workspace().getByRole("progressbar").getAttribute("aria-valuemax"),
    "2",
  );
  assert.equal(await next().isDisabled(), true);
  assert.equal(
    await page.getByText("Fila de evidencias", { exact: true }).isVisible(),
    false,
  );
  await capture("desktop-documents");
  await workspace()
    .getByLabel("Selecionar arquivo do documento")
    .setInputFiles(pdf);
  await workspace()
    .getByText("Personalizar título e descrição", { exact: true })
    .click();
  await workspace()
    .getByLabel("Título", { exact: true })
    .fill("Documentação de habilitação revisada");
  await tab("Documentos").focus();
  await tab("Documentos").press("ArrowRight");
  assert.equal(await tab("Licitantes").getAttribute("aria-selected"), "true");
  await capture("desktop-review");
  await workspace()
    .getByRole("group", { name: "Filtrar situação da habilitação" })
    .getByRole("button", { name: /^Habilitados/ })
    .click();
  assert.equal(
    await workspace().getByRole("table").getByRole("row").count(),
    2,
  );
  await review("Comercial Horizonte Ltda.").click();
  assert.equal(
    await form()
      .getByRole("combobox", { name: "Situação da habilitação", exact: true })
      .inputValue(),
    "HABILITADO",
  );
  assert.equal(
    await form().getByRole("textbox", { name: "Observação", exact: true }).inputValue(),
    "Documentação conferida.",
  );
  await form()
    .getByRole("combobox", { name: "Licitante", exact: true })
    .selectOption("8601");
  assert.equal(
    await form()
      .getByRole("combobox", { name: "Situação da habilitação", exact: true })
      .inputValue(),
    "PENDENTE",
  );
  assert.equal(
    await form().getByRole("textbox", { name: "Observação", exact: true }).inputValue(),
    "Aguardando certidão atualizada.",
  );
  await form()
    .getByRole("textbox", { name: "Observação", exact: true })
    .fill("Alteração cancelada");
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  assert.equal(fixture.mutations.length, 0);
  await workspace()
    .getByRole("group", { name: "Filtrar situação da habilitação" })
    .getByRole("button", { name: /^Todos/ })
    .click();
  await review().click();
  assert.equal(
    await form().getByRole("textbox", { name: "Observação", exact: true }).inputValue(),
    "Aguardando certidão atualizada.",
  );
  rejectNextReview = true;
  await form()
    .getByRole("textbox", { name: "Observação", exact: true })
    .fill("Certidão não apresentada.");
  await form()
    .getByRole("combobox", { name: "Situação da habilitação", exact: true })
    .selectOption("INABILITADO");
  await page
    .getByRole("button", { name: "Salvar habilitação", exact: true })
    .click();
  await form()
    .getByText("Não foi possível salvar a análise. Tente novamente.", {
      exact: true,
    })
    .waitFor();
  assert.equal(
    await form().getByRole("textbox", { name: "Observação", exact: true }).inputValue(),
    "Certidão não apresentada.",
  );
  assert.equal(fixture.mutations.length, 0);
  await saveReview("INABILITADO", "Certidão não apresentada.");
  assert.deepEqual(fixture.mutations.at(-1).input, {
    licitanteId: 8601,
    statusHabilitacao: "INABILITADO",
    observacaoHabilitacao: "Certidão não apresentada.",
  });
  assert.equal(await next().isDisabled(), true);
  await review().click();
  assert.equal(
    await form()
      .getByRole("combobox", { name: "Situação da habilitação", exact: true })
      .inputValue(),
    "INABILITADO",
  );
  await capture("desktop-review-modal");
  await saveReview("HABILITADO", "Documentação regular após conferência.");
  assert.equal(
    await next().isDisabled(),
    true,
    "The document is still mandatory after a favorable review",
  );
  await tab("Documentos").click();
  assert.equal(
    await workspace().getByLabel("Título", { exact: true }).inputValue(),
    "Documentação de habilitação revisada",
  );
  assert.equal(
    await workspace()
      .getByRole("button", { name: "Salvar documento", exact: true })
      .isDisabled(),
    false,
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await capture("mobile-documents");
  await docs()
    .getByRole("button", { name: /Habilitação das empresas/ })
    .click();
  assert.equal(await docs().isVisible(), false);
  await capture("mobile-document-detail");
  await workspace()
    .getByRole("button", { name: "Voltar aos documentos", exact: true })
    .click();
  assert.equal(
    await docs()
      .getByRole("button", { name: /Habilitação das empresas/ })
      .evaluate((element) => document.activeElement === element),
    true,
  );
  await tab("Licitantes").click();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  assert.equal(
    await workspace()
      .getByRole("region", { name: "Tabela de habilitação" })
      .evaluate((element) => element.scrollWidth > element.clientWidth),
    true,
  );
  await capture("mobile-review");
  await review().click();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await capture("mobile-review-modal");
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await tab("Documentos").click();
  await workspace()
    .getByRole("button", { name: "Salvar documento", exact: true })
    .click();
  await workspace()
    .getByRole("link", { name: "Abrir documento", exact: true })
    .waitFor();
  assert.equal(
    await workspace().getByRole("progressbar").getAttribute("aria-valuenow"),
    "2",
  );
  assert.equal(await next().isDisabled(), false);
  await capture("desktop-ready");
  await next().click();
  await page.waitForURL(/fase=RECURSOS/);
  assert.equal(fixture.mutations.at(-1).input.statusLicitacao, "RECURSOS");
  const mutationCount = fixture.mutations.length;
  await open();
  await workspace()
    .getByRole("button", { name: "Abrir recursos", exact: true })
    .click();
  await page.waitForURL(/fase=RECURSOS/);
  assert.equal(
    fixture.mutations.length,
    mutationCount,
    "Reviewing a completed phase must not change process status",
  );

  fixture = createQualificationFixture({ many: true });
  await open();
  await tab("Licitantes").click();
  assert.equal(
    await workspace().getByRole("table").getByRole("row").count(),
    9,
  );
  await workspace()
    .getByRole("button", { name: "Proxima", exact: true })
    .click();
  await workspace()
    .getByRole("button", { name: "Proxima", exact: true })
    .click();
  assert.equal(
    await workspace().getByRole("table").getByRole("row").count(),
    2,
  );
  await workspace()
    .getByRole("group", { name: "Filtrar situação da habilitação" })
    .getByRole("button", { name: /^Inabilitados/ })
    .click();
  assert.equal(await review("Serviços Aurora Ltda.").isVisible(), true);
  assert.equal(
    await workspace()
      .getByRole("button", { name: "Proxima", exact: true })
      .count(),
    0,
  );

  fixture = createQualificationFixture({ inverted: true, empty: true });
  await open();
  assert.equal(
    await next()
      .textContent()
      .then((text) => text.trim()),
    "Avançar para disputa",
  );
  await tab("Licitantes").click();
  await workspace()
    .getByText("Adicionar licitante", { exact: true })
    .first()
    .click();
  await workspace()
    .getByRole("combobox", { name: "Fornecedor licitante", exact: true })
    .click();
  await page.getByRole("option", { name: /Fornecedor de teste Ltda/ }).click();
  await workspace()
    .getByRole("button", { name: "Adicionar licitante", exact: true })
    .click();
  await review().waitFor();
  assert.equal(fixture.mutations.at(-1).input.fornecedorId, 9601);
  await review().click();
  await saveReview("HABILITADO", "Documentação regular antes da disputa.");
  await tab("Documentos").click();
  await workspace()
    .getByLabel("Selecionar arquivo do documento")
    .setInputFiles(pdf);
  await workspace()
    .getByRole("button", { name: "Salvar documento", exact: true })
    .click();
  await workspace()
    .getByRole("link", { name: "Abrir documento", exact: true })
    .waitFor();
  await next().click();
  await page.waitForURL(/fase=DISPUTA/);
  assert.equal(
    fixture.mutations.at(-1).input.statusLicitacao,
    "RECEBIMENTO_PROPOSTAS",
  );

  fixture = createQualificationFixture({ direct: true });
  await open();
  assert.match(await next().textContent(), /controle/);
  fixture = createQualificationFixture({ enforcement: "ADVISORY" });
  await open();
  assert.equal(await next().isDisabled(), false);
  assert.deepEqual(errors, [], "No browser or fixture errors");
  assert.deepEqual(unexpectedRequests, [], "All API requests intercepted");
  writeFileSync(
    resolve(output, "result.json"),
    JSON.stringify(
      {
        published,
        errors,
        unexpectedRequests,
        calls,
        reviewPayload: true,
        reviewFailureAndRetry: true,
        documentDraft: true,
        gating: true,
        inverted: true,
        direct: true,
        advisory: true,
        pagination: true,
        mobileOverflow: false,
      },
      null,
      2,
    ),
  );
  console.log(`Qualification UI smoke passed. Artifacts: ${output}`);
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
        { message: error.message, errors, unexpectedRequests, calls },
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

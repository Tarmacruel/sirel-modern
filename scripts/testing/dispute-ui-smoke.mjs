import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import superjson from "superjson";
import { createServer } from "vite";
import { createDisputeFixture } from "./fixtures/dispute-ui-fixture.mjs";

// node --import tsx scripts/testing/dispute-ui-smoke.mjs [--published]
// Exercise the actual UI and flow evaluator with synthetic data; intercept every API.
const published = process.argv.includes("--published");
const origin = published ? "https://www.sirel.com.br" : "http://127.0.0.1:5188";
const output = resolve(
  `output/playwright/dispute-ui${published ? "-published" : ""}`,
);
mkdirSync(output, { recursive: true });
const server = published
  ? null
  : await createServer({
      root: resolve("client"),
      configFile: resolve("client/vite.config.ts"),
      server: {
        port: 5188,
        strictPort: true,
        host: "127.0.0.1",
        proxy: { "/api": { target: "http://127.0.0.1:1" } },
      },
    });
await server?.listen();
let browser, page;
let fixture = createDisputeFixture();
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
  page.on("pageerror", (error) => errors.push(error.message));
  const workspace = () =>
    page.getByRole("region", { name: "Disputa", exact: true });
  const documents = () =>
    workspace().getByRole("list", {
      name: "Documentos da disputa",
      exact: true,
    });
  const tab = (name) =>
    workspace().getByRole("tab", { name: new RegExp(`^${name}`) });
  const next = () =>
    workspace().getByRole("button", { name: /Avançar para Julgamento/i });
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
  async function open(phase = "DISPUTA") {
    await page.goto(`${origin}/licitacao/2567?fase=${phase}`);
    if (phase === "DISPUTA") await workspace().waitFor({ timeout: 30000 });
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
  assert.equal(await workspace().getByRole("tab").count(), 4);
  assert.equal(await documents().getByRole("listitem").count(), 2);
  assert.equal(await next().isDisabled(), true);
  assert.equal(
    await page.getByText("Fila de evidencias", { exact: true }).isVisible(),
    false,
  );
  await capture("desktop-documents");
  await page.getByRole("button", { name: "Ver etapas", exact: true }).click();
  assert.equal(
    await page
      .getByRole("navigation", { name: "Fases da licitação" })
      .getByRole("button", { name: /Julgamento/ })
      .isDisabled(),
    true,
  );
  await page
    .getByRole("button", { name: "Ocultar etapas", exact: true })
    .click();

  await workspace()
    .getByLabel("Selecionar arquivo do documento", { exact: true })
    .setInputFiles(pdf);
  await workspace()
    .getByText("Personalizar título e descrição", { exact: true })
    .click();
  await workspace()
    .getByLabel("Título", { exact: true })
    .fill("Ata revisada de teste");
  await tab("Propostas").click();
  assert.equal(
    await workspace()
      .getByRole("button", { name: "Nova proposta", exact: true })
      .isDisabled(),
    true,
  );
  await tab("Lances").click();
  assert.equal(
    await workspace()
      .getByRole("button", { name: "Registrar lance", exact: true })
      .isDisabled(),
    true,
  );
  await tab("Licitantes").click();
  await workspace()
    .getByRole("combobox", { name: "Fornecedor licitante", exact: true })
    .click();
  await page.getByRole("option", { name: /Fornecedor de teste Ltda/ }).click();
  await saveAndRefresh(
    workspace().getByRole("button", {
      name: "Adicionar licitante",
      exact: true,
    }),
    "licitacao.saveLicitante",
  );
  assert.equal(fixture.mutations.at(-1).input.fornecedorId, 9601);
  await workspace()
    .getByRole("table", { name: "Licitantes registrados" })
    .waitFor();
  await capture("desktop-bidders");

  await tab("Propostas").click();
  await workspace()
    .getByRole("button", { name: "Nova proposta", exact: true })
    .click();
  const proposal = page.locator("#licitacao-proposta-form");
  await proposal
    .getByRole("combobox", { name: "Licitante", exact: true })
    .selectOption("8601");
  await proposal
    .getByRole("combobox", { name: "Item do processo", exact: true })
    .selectOption("90001");
  await proposal
    .getByLabel("Valor unitario proposto", { exact: true })
    .fill("145000");
  await proposal
    .getByLabel("Data da proposta", { exact: true })
    .fill("2026-09-14");
  await saveAndRefresh(
    page.getByRole("button", { name: "Registrar proposta", exact: true }),
    "licitacao.saveProposta",
  );
  assert.equal(fixture.mutations.at(-1).input.valorUnitarioProposto, 1450);
  assert.equal(fixture.mutations.at(-1).input.licitanteId, 8601);
  await proposal.waitFor({ state: "hidden" });
  await capture("desktop-proposals");

  await tab("Lances").click();
  await workspace()
    .getByRole("button", { name: "Registrar lance", exact: true })
    .click();
  const bid = page.locator("#licitacao-lance-form");
  await bid
    .getByRole("combobox", { name: "Proposta vinculada", exact: true })
    .selectOption("8701");
  await bid.getByLabel("Valor do lance", { exact: true }).fill("140000");
  await bid.getByLabel("Data do lance", { exact: true }).fill("2026-09-15");
  await saveAndRefresh(
    page.locator('button[form="licitacao-lance-form"]'),
    "licitacao.saveLance",
  );
  assert.equal(fixture.mutations.at(-1).input.valorLance, 1400);
  assert.equal(fixture.mutations.at(-1).input.propostaId, 8701);
  await bid.waitFor({ state: "hidden" });
  assert.equal(
    await workspace()
      .getByRole("table", { name: "Lances registrados" })
      .getByText("Fornecedor de teste Ltda.", { exact: true })
      .isVisible(),
    true,
  );
  await capture("desktop-bids");

  await tab("Documentos").click();
  assert.equal(
    await workspace().getByLabel("Título", { exact: true }).inputValue(),
    "Ata revisada de teste",
  );
  assert.equal(
    await workspace()
      .getByRole("button", { name: "Salvar documento", exact: true })
      .isDisabled(),
    false,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await capture("mobile-documents");
  await documents()
    .getByRole("button", { name: /Ata da sessão provisória/ })
    .click();
  assert.equal(await documents().isVisible(), false);
  await capture("mobile-detail");
  await workspace()
    .getByRole("button", { name: "Voltar aos documentos", exact: true })
    .click();
  assert.equal(
    await documents()
      .getByRole("button", { name: /Ata da sessão provisória/ })
      .evaluate((element) => document.activeElement === element),
    true,
  );
  for (const name of ["Licitantes", "Propostas", "Lances"]) {
    await tab(name).click();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      `${name} must fit mobile viewport`,
    );
    const tableRegion = workspace().getByRole("region", {
      name: `Tabela de ${name.toLocaleLowerCase("pt-BR")}`,
      exact: true,
    });
    assert.equal(
      await tableRegion.evaluate(
        (element) => element.scrollWidth > element.clientWidth,
      ),
      true,
    );
    await capture(`mobile-${name.toLowerCase()}`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await tab("Documentos").click();
  await saveAndRefresh(
    workspace().getByRole("button", { name: "Salvar documento", exact: true }),
    "/api/licitacao/ata-sessao/processar",
  );
  const preview = page.getByRole("heading", {
    name: "Previa da sincronizacao da ata",
    exact: true,
  });
  await preview.waitFor();
  assert.equal(
    fixture.mutations.some((item) => item.name === "ata.apply"),
    false,
  );
  await saveAndRefresh(
    page.getByRole("button", {
      name: "Aplicar atualizacao da ata",
      exact: true,
    }),
    "/api/licitacao/ata-sessao/aplicar",
  );
  assert.equal(fixture.mutations.at(-1).input.runId, 9801);
  await preview.waitFor({ state: "hidden" });
  assert.equal(
    await next().isDisabled(),
    false,
    "Optional platform documents must not block advancement",
  );
  await capture("desktop-ready");
  await saveAndRefresh(next(), "licitacao.advanceStage");
  await page.waitForURL(/fase=JULGAMENTO/);
  assert.equal(fixture.mutations.at(-1).input.statusLicitacao, "JULGAMENTO");

  fixture = createDisputeFixture({ populated: true });
  await open();
  for (const [name, tableName] of [
    ["Propostas", "Propostas registradas"],
    ["Lances", "Lances registrados"],
  ]) {
    await tab(name).click();
    assert.equal(
      await workspace()
        .getByRole("table", { name: tableName })
        .getByRole("row")
        .count(),
      9,
    );
    await workspace()
      .getByRole("button", { name: "Proxima", exact: true })
      .click();
    await workspace()
      .getByRole("button", { name: "Proxima", exact: true })
      .click();
    assert.equal(
      await workspace()
        .getByRole("table", { name: tableName })
        .getByRole("row")
        .count(),
      2,
    );
  }
  await tab("Licitantes").click();
  await saveAndRefresh(
    workspace().getByRole("button", {
      name: "Retirar Fornecedor de teste Ltda.",
      exact: true,
    }),
    "licitacao.deleteLicitante",
  );
  await workspace().getByText("Inativo", { exact: true }).waitFor();

  fixture = createDisputeFixture({ noBids: true });
  await open();
  assert.equal(await workspace().getByRole("tab").count(), 3);
  assert.equal(await tab("Lances").count(), 0);
  fixture = createDisputeFixture({ inverted: true });
  await open();
  assert.equal(await next().isDisabled(), true);
  await page.getByRole("button", { name: "Ver etapas", exact: true }).click();
  const phases = await page
    .getByRole("navigation", { name: "Fases da licitação" })
    .getByRole("button")
    .allTextContents();
  assert.ok(
    phases.findIndex((name) => name.includes("Habilita")) <
      phases.findIndex((name) => name.includes("Disputa")),
  );
  fixture = createDisputeFixture({ direct: true });
  await open("JULGAMENTO");
  assert.equal(await workspace().isVisible(), false);
  assert.equal(
    await page
      .getByRole("navigation", { name: "Fases da licitacao" })
      .getByRole("button", { name: /Disputa/ })
      .count(),
    0,
  );
  await page
    .getByRole("button", { name: "Exibir seção", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Adicionar licitante", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Exibir seção", exact: true })
    .first()
    .click();
  assert.equal(
    await page
      .getByRole("button", { name: "Nova proposta", exact: true })
      .isDisabled(),
    true,
  );

  assert.deepEqual(errors, [], "No browser or fixture errors");
  assert.deepEqual(
    unexpectedRequests,
    [],
    "No unmocked API or external traffic",
  );
  writeFileSync(
    resolve(output, "result.json"),
    JSON.stringify(
      {
        published,
        errors,
        unexpectedRequests,
        calls,
        CRUD: true,
        ataPreviewBeforeApply: true,
        blockingGate: true,
        pagination: true,
        conditionalTabs: true,
        mobileOverflow: false,
      },
      null,
      2,
    ),
  );
  console.log(`Dispute UI smoke passed. Artifacts: ${output}`);
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

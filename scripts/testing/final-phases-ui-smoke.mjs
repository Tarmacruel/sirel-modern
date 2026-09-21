import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import superjson from "superjson";
import { createServer } from "vite";
import { createFinalPhasesFixture } from "./fixtures/final-phases-ui-fixture.mjs";

// node --import tsx scripts/testing/final-phases-ui-smoke.mjs [--published]
// Exercise the actual UI and flow evaluator with synthetic data; intercept every API.
const published = process.argv.includes("--published");
const origin = published ? "https://www.sirel.com.br" : "http://127.0.0.1:5191";
const output = resolve(
  `output/playwright/final-phases-ui${published ? "-published" : ""}`,
);
mkdirSync(output, { recursive: true });
const server = published
  ? null
  : await createServer({
      root: resolve("client"),
      configFile: resolve("client/vite.config.ts"),
      server: {
        port: 5191,
        strictPort: true,
        host: "127.0.0.1",
        proxy: { "/api": { target: "http://127.0.0.1:1" } },
      },
    });
await server?.listen();
let browser, page;
let fixture = createFinalPhasesFixture();
let rejectNextReview = false;
let rejectedProcedure = "licitacao.saveRecurso";
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
          if (name === rejectedProcedure && rejectNextReview) {
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
  const workspace = (name) => page.getByRole("region", { name, exact: true });
  const tab = (name) => page.getByRole("tab", { name: new RegExp(`^${name}`) });
  const next = () => page.getByRole("button", { name: /^Avançar para/ });
  const resourceForm = () => page.locator("#licitacao-recurso-form");
  const homologationForm = () => page.locator("#licitacao-homologacao-form");
  const pdf = {
    name: "Comprovante de teste.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n% Synthetic fixture\n%%EOF"),
  };
  async function capture(name) {
    await page
      .locator('[role="status"], [role="alert"]')
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
  async function open(phase, label) {
    await page.goto(`${origin}/licitacao/2567?fase=${phase}`);
    await workspace(label).waitFor();
    await page.waitForLoadState("networkidle");
  }
  async function uploadRequired(phase, label) {
    const required = fixture
      .detail()
      .flow.evidence.filter(
        (item) => item.phase === phase && item.obrigatorio && !item.concluido,
      );
    for (const item of required) {
      await workspace(label)
        .getByRole("list")
        .getByRole("button", { name: new RegExp(item.label) })
        .click();
      await workspace(label)
        .getByLabel("Selecionar arquivo do documento", { exact: true })
        .setInputFiles(pdf);
      await workspace(label)
        .getByRole("button", { name: "Salvar documento", exact: true })
        .click();
      await workspace(label)
        .getByRole("list")
        .getByRole("button", { name: new RegExp(item.label) })
        .getByText("Anexado", { exact: true })
        .waitFor();
      if (
        await page
          .getByRole("heading", {
            name: "Previa da sincronizacao da ata",
            exact: true,
          })
          .isVisible()
      ) {
        await page.getByRole("button", { name: "Fechar", exact: true }).click();
      }
    }
  }
  async function saveResource() {
    await page
      .getByRole("button", { name: "Salvar decisão", exact: true })
      .click();
    await resourceForm().waitFor({ state: "hidden" });
  }
  await open("RECURSOS", "Recursos");
  assert.equal(await page.getByRole("tab").count(), 2);
  assert.equal(await next().isDisabled(), true);
  await capture("appeals-documents-desktop");
  await tab("Documentos").focus();
  await tab("Documentos").press("ArrowRight");
  assert.equal(await tab("Decisões").getAttribute("aria-selected"), "true");
  await capture("appeals-list-desktop");
  await page.getByRole("button", { name: /Revisar recurso de/ }).click();
  assert.equal(
    await resourceForm()
      .getByRole("textbox", { name: "Descrição", exact: true })
      .inputValue(),
    fixture.detail().recursos[0].descricao,
  );
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  assert.equal(fixture.mutations.length, 0);
  await page.getByRole("button", { name: /Revisar recurso de/ }).click();
  await resourceForm()
    .getByRole("combobox", { name: "Resultado", exact: true })
    .selectOption("IMPROVIDO");
  await resourceForm()
    .getByLabel("Data do julgamento", { exact: true })
    .fill("2026-09-20");
  await resourceForm()
    .getByRole("textbox", { name: "Decisão", exact: true })
    .fill("Decisão de teste: classificação mantida.");
  rejectNextReview = true;
  await page
    .getByRole("button", { name: "Salvar decisão", exact: true })
    .click();
  await resourceForm()
    .getByText("Não foi possível salvar a análise. Tente novamente.")
    .waitFor();
  assert.equal(fixture.mutations.length, 0);
  await capture("appeal-error-preserved");
  await saveResource();
  assert.equal(fixture.detail().recursos.length, 1);
  assert.equal(fixture.mutations.at(-1).input.recursoId, 9900);
  await next().click({ trial: true });
  await capture("appeals-ready-desktop");
  await next().click();
  await page.waitForURL(/fase=CONTROLE_INTERNO/);
  await workspace("Controle Interno").waitFor();
  assert.equal(await next().isDisabled(), true);
  await capture("control-desktop");
  await uploadRequired("CONTROLE_INTERNO", "Controle Interno");
  await next().click();
  await page.waitForURL(/fase=HOMOLOGACAO/);
  await workspace("Homologação").waitFor();
  assert.equal(
    await workspace("Homologação")
      .getByRole("button", { name: "Concluir homologação", exact: true })
      .isDisabled(),
    true,
  );
  await capture("homologation-documents-desktop");
  await uploadRequired("HOMOLOGACAO", "Homologação");
  await tab("Resultado").click();
  await capture("homologation-result-desktop");
  await page
    .getByRole("button", { name: "Concluir homologação", exact: true })
    .click();
  await homologationForm()
    .getByLabel("Data da homologação", { exact: true })
    .fill("2026-09-20");
  rejectedProcedure = "licitacao.homologar";
  rejectNextReview = true;
  await page
    .getByRole("button", { name: "Homologar licitacao", exact: true })
    .click();
  await homologationForm()
    .getByText("Não foi possível salvar a análise. Tente novamente.")
    .waitFor();
  assert.equal(fixture.detail().processo.homologado, false);
  await page
    .getByRole("button", { name: "Homologar licitacao", exact: true })
    .click();
  await homologationForm().waitFor({ state: "hidden" });
  assert.equal(fixture.detail().processo.homologado, true);
  await page
    .getByRole("button", { name: "Abrir fechamento", exact: true })
    .click();
  await workspace("Fechamento").waitFor();
  assert.equal(await tab("Documentos").count(), 0);
  await capture("closing-summary-desktop");
  await tab("Histórico").click();
  await capture("closing-history-desktop");
  await tab("Resumo").click();
  const beforeTransition = fixture.mutations.length;
  await workspace("Fechamento")
    .getByRole("button", { name: "Encaminhar para Contratos", exact: true })
    .click();
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  assert.equal(fixture.mutations.length, beforeTransition);
  await workspace("Fechamento")
    .getByRole("button", { name: "Encaminhar para Contratos", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Encaminhar para Contratos", exact: true })
    .last()
    .click();
  await workspace("Fechamento")
    .getByRole("button", { name: "Abrir Contratos", exact: true })
    .waitFor();
  assert.equal(fixture.mutations.at(-1).name, "processos.advanceMacroPhase");
  assert.equal(fixture.mutations.at(-1).input.permitirBypass, false);

  // Optional evidence never blocks an empty recursal phase.
  fixture = createFinalPhasesFixture({ appeals: 0 });
  await open("RECURSOS", "Recursos");
  assert.equal(await next().isDisabled(), false);
  await tab("Decisões").click();
  await page
    .getByRole("button", { name: "Registrar recurso", exact: true })
    .click();
  await resourceForm()
    .getByRole("textbox", { name: "Descrição", exact: true })
    .fill("Novo recurso de teste");
  await page
    .getByRole("button", { name: "Registrar recurso", exact: true })
    .last()
    .click();
  await resourceForm().waitFor({ state: "hidden" });
  assert.equal(fixture.detail().recursos.length, 1);
  assert.equal(await next().isDisabled(), true);

  // All four phases fit a narrow viewport; documents use list/detail navigation.
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [phase, label] of [
    ["RECURSOS", "Recursos"],
    ["CONTROLE_INTERNO", "Controle Interno"],
    ["HOMOLOGACAO", "Homologação"],
    ["FECHAMENTO", "Fechamento"],
  ]) {
    fixture = createFinalPhasesFixture({ phase });
    await open(phase, label);
    await capture(`${phase.toLowerCase()}-mobile`);
    if (phase !== "FECHAMENTO") {
      await workspace(label)
        .getByRole("list")
        .getByRole("button")
        .first()
        .click();
      await capture(`${phase.toLowerCase()}-detail-mobile`);
      await page
        .getByRole("button", { name: "Voltar aos documentos", exact: true })
        .click();
    }
    await workspace(label).getByRole("tab").last().click();
    await capture(`${phase.toLowerCase()}-operations-mobile`);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
  }
  fixture = createFinalPhasesFixture({ phase: "FECHAMENTO", manual: true });
  await open("FECHAMENTO", "Fechamento");
  await tab("Auditoria").click();
  await page.getByRole("table", { name: "Registros de auditoria" }).waitFor();
  await capture("closing-audit-mobile");
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await capture("closing-audit-desktop");
  await open("RECURSOS", "Recursos");
  await page
    .getByRole("button", { name: "Abrir controle interno", exact: true })
    .click();
  await workspace("Controle Interno").waitFor();
  assert.equal(
    fixture.mutations.length,
    0,
    "Revisiting completed phases must not regress status",
  );

  fixture = createFinalPhasesFixture({
    phase: "FECHAMENTO",
    gateBlockers: [
      {
        label: "Vincular instrumento contratual",
        detalhe: "Pendência sintética de teste.",
      },
    ],
  });
  await open("FECHAMENTO", "Fechamento");
  await page.getByRole("list", { name: "Pendências para Contratos" }).waitFor();
  await page
    .getByRole("button", { name: "Encaminhar para Contratos", exact: true })
    .click();
  assert.equal(
    await page
      .getByRole("button", { name: "Liberar com pendências", exact: true })
      .isDisabled(),
    true,
  );
  await capture("closing-gate-review");
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  assert.equal(fixture.mutations.length, 0);
  rejectedProcedure = "processos.macroPhaseGate";
  rejectNextReview = true;
  fixture = createFinalPhasesFixture({ phase: "FECHAMENTO" });
  await open("FECHAMENTO", "Fechamento");
  await page
    .getByRole("button", { name: "Tentar novamente", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Encaminhar para Contratos", exact: true })
      .isDisabled(),
    true,
  );
  await page
    .getByRole("button", { name: "Tentar novamente", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Encaminhar para Contratos", exact: true })
    .click({ trial: true });
  fixture = createFinalPhasesFixture({
    phase: "HOMOLOGACAO",
    direct: true,
    inverted: true,
  });
  await open("HOMOLOGACAO", "Homologação");
  assert.equal(
    fixture.detail().flow.phases.some((phase) => phase.key === "RECURSOS"),
    false,
  );
  await uploadRequired("HOMOLOGACAO", "Homologação");
  assert.equal(
    await page
      .getByRole("button", { name: "Concluir homologação", exact: true })
      .isDisabled(),
    false,
  );
  await capture("homologation-direct-desktop");
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpectedRequests, []);
  writeFileSync(
    resolve(output, "result.json"),
    JSON.stringify(
      {
        errors,
        unexpectedRequests,
        appealCreateAndEdit: true,
        cancelWithoutWrite: true,
        saveErrorsRetainDraft: true,
        requiredEvidenceAndGates: true,
        homologation: true,
        contractsTransition: true,
        mobileOverflow: false,
        audit: true,
        directMode: true,
        historicalNavigation: true,
      },
      null,
      2,
    ),
  );
  console.log(`Final phases UI smoke passed. Artifacts: ${output}`);
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

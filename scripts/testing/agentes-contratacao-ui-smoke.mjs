import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import superjson from "superjson";
import { createPreparationFixture } from "./fixtures/preparation-ui-fixture.mjs";
import { evaluateLicitacaoFlow } from "../../server/src/lib/licitacao-flow-state.ts";

// All API calls, including mutations, are intercepted with synthetic data.
const origin = "https://www.sirel.com.br";
const output = resolve("output/playwright/agentes-contratacao");
mkdirSync(output, { recursive: true });
const fixture = createPreparationFixture();
const ato = { id: 9007, label: "Decreto 100/2026", arquivoUrl: "/storage/ato-teste.pdf" };
let agent = null, selected = null;
const calls = [], errors = [], unexpected = [];
function query(name, input) {
  if (name === "cadastrosInstitucionais.atos.list") return { items: [ato], total: 1 };
  if (name === "cadastrosInstitucionais.agentesContratacao.list") return { items: agent ? [agent] : [], total: agent ? 1 : 0 };
  if (name === "cadastros.lookup") return { items: [{ id: 9009, label: "Responsável de teste", metadata: { cargoNome: "Agente" } }], total: 1 };
  if (name === "cadastrosInstitucionais.designacoes.getForLicitacao") return { ...fixture.query(name), agenteContratacao: selected };
  if (name === "cadastrosInstitucionais.designacoes.availableForProcess") return { ...fixture.query(name), agentesContratacao: agent ? [agent] : [], dataReferencia: "2026-07-07" };
  if (name === "licitacao.detail") {
    const detail = fixture.detail();
    detail.processo.modalidadeCodigo = "DISPENSA_ELETRONICA";
    detail.processo.modalidade = "Dispensa Eletrônica";
    detail.processo.modoDisputa = "ABERTO";
    detail.licitacao.agenteContratacaoId = selected?.id ?? null;
    detail.flow = evaluateLicitacaoFlow({ context: { modalidadeCodigo: "DISPENSA_ELETRONICA", modoDisputa: "ABERTO" }, publicado: false, homologado: false, status: "PREPARACAO", fields: detail.licitacao, documents: detail.documentos, exceptions: [], bidders: [], proposals: [], itemIds: [90001], pendingAppeals: 0 }, "BLOCKING");
    detail.checklistInterno.itens = detail.flow.evidence.filter((item) => item.phase === "PREPARACAO").map((item) => ({ ...item, documentos: [], statusFlexivel: "PADRAO", naoAplicavel: false }));
    return detail;
  }
  if (name === "cadastrosInstitucionais.agentesContratacao.save") {
    assert.equal(input.tipo, "AGENTE_CONTRATACAO");
    assert.equal(input.membros.length, 1);
    assert.equal(input.membros[0].pessoaId, 9009);
    assert.equal(input.atoDesignacaoId, ato.id);
    agent = { ...input, id: 9005, ato, membros: input.membros.map((member) => ({ ...member, pessoaNome: "Responsável de teste" })) };
    return agent;
  }
  if (name === "cadastrosInstitucionais.designacoes.selectForLicitacao") {
    assert.equal(input.agenteContratacaoId, agent.id);
    assert.equal(input.comissaoId, 901);
    assert.equal(input.equipeApoioId, 902);
    assert.equal(input.ordenadorDespesaId, 903);
    selected = agent;
    return { success: true };
  }
  return fixture.query(name);
}

const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(20000);
page.on("pageerror", (error) => errors.push(error.message));
await context.route("**/*", async (route) => {
  const request = route.request(), url = new URL(request.url());
  if (url.hostname === "static.cloudflareinsights.com") return route.abort();
  if (url.origin !== origin) { unexpected.push(url.href); return route.abort(); }
  if (url.pathname.startsWith("/api/trpc/")) {
    const names = decodeURIComponent(url.pathname.slice("/api/trpc/".length)).split(",");
    const batch = url.searchParams.has("batch");
    const raw = JSON.parse(url.searchParams.get("input") ?? request.postData() ?? "null");
    const result = names.map((name, index) => {
      calls.push(name);
      const serialized = batch ? raw?.[index] : raw;
      const input = serialized ? superjson.deserialize(serialized) : undefined;
      return { result: { data: superjson.serialize(query(name, input)) } };
    });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(batch ? result : result[0]) });
  }
  if (url.pathname.startsWith("/api/")) { unexpected.push(url.href); return route.abort(); }
  return route.continue();
});
async function capture(name) {
  writeFileSync(resolve(output, `${name}.yml`), await page.locator("body").ariaSnapshot());
  await page.screenshot({ path: resolve(output, `${name}.png`), fullPage: true });
}
try {
  await page.goto(`${origin}/cadastros?institucionais=1`);
  await page.getByRole("button", { name: "Agentes de contratação", exact: true }).click();
  await page.getByRole("combobox", { name: "Agente de contratação", exact: true }).click();
  await page.getByRole("option", { name: /Responsável de teste/ }).click();
  await page.getByRole("combobox", { name: "Ato de designacao", exact: true }).selectOption("9007");
  await page.getByRole("textbox", { name: "Vigencia inicio", exact: true }).fill("2026-01-01");
  await page.getByRole("button", { name: "Salvar Agente de contratação", exact: true }).click();
  await page.getByText("Agente de contratação salvo.", { exact: true }).waitFor();
  await capture("cadastro-salvo");
  assert.equal(agent.nome, "Responsável de teste");
  await page.goto(`${origin}/licitacao/2567?fase=PREPARACAO`);
  const workspace = page.getByRole("region", { name: "Preparação", exact: true });
  await workspace.getByRole("tab", { name: "Responsáveis", exact: true }).click();
  await workspace.getByRole("button", { name: /Agente de contratação/ }).click();
  await workspace.getByRole("button", { name: "Selecionar", exact: true }).click();
  await page.getByText("Responsável de teste", { exact: true }).waitFor();
  await capture("selecionar-agente");
  await page.getByRole("button", { name: "Selecionar para o processo", exact: true }).click();
  await workspace.getByRole("button", { name: "Trocar", exact: true }).waitFor();
  await capture("agente-selecionado");
  assert.equal(selected?.id, 9005);
  assert.equal(await workspace.getByRole("button", { name: "Agente de contratação Selecionado", exact: true }).count(), 1);
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpected, []);
  writeFileSync(resolve(output, "result.json"), JSON.stringify({ calls, errors, unexpected, createdAndSelected: true }, null, 2));
  console.log("Agent registration and selection smoke passed (synthetic API).");
} catch (error) {
  await capture("failure");
  writeFileSync(resolve(output, "failure.json"), JSON.stringify({ error: error.message, errors, calls, unexpected }, null, 2));
  throw error;
} finally { await browser.close(); }

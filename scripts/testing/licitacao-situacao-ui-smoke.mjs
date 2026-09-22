import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import superjson from "superjson";
import { createPreparationFixture } from "./fixtures/preparation-ui-fixture.mjs";
import { evaluateLicitacaoFlow } from "../../server/src/lib/licitacao-flow-state.ts";

// Synthetic API only: no production records are changed by this browser test.
const origin = "https://www.sirel.com.br", output = resolve("output/playwright/licitacao-situacao");
mkdirSync(output,{ recursive:true });
const fixture = createPreparationFixture();
let decisao = null, itemResult = null;
const history = [], calls = [], errors = [], unexpected = [];
function detail() {
  const data = fixture.detail();
  data.processo.publicado = true; data.licitacao.statusLicitacao = "JULGAMENTO";
  data.licitacao.situacaoProcedimento = decisao;
  data.licitantes = [{ id:9901, fornecedorId:9901, fornecedorRazaoSocial:"Fornecedor de teste", ativo:true, statusHabilitacao:"PENDENTE" }];
  data.propostas = [{ id:9902, itemId:90001, licitanteId:9901, fornecedorNome:"Fornecedor de teste", situacao:"DESCLASSIFICADA", valorUnitarioProposto:"10", valorUnitarioAtual:"10", justificativa:"Proposta não atende à especificação", classificacao:null }];
  data.flow = evaluateLicitacaoFlow({ context:{ modalidadeCodigo:"DISPENSA_ELETRONICA",modoDisputa:"ABERTO" }, publicado:true,homologado:false,status:"JULGAMENTO",fields:data.licitacao,documents:data.documentos,exceptions:[],bidders:data.licitantes,proposals:data.propostas,itemIds:[90001],closedItemIds:itemResult ? [90001] : [],pendingAppeals:0 },"BLOCKING");
  return data;
}
function query(name,input) {
  if (name === "processos.macroPhaseGate") return { allowed:false, blockers:[], pending:[], canAdvance:false };
  if (name === "licitacao.detail") return detail();
  if (name === "licitacao.situacao.get") return { situacao:decisao?.situacao ?? "EM_ANDAMENTO", decisao, itens:[{ id:90001,numeroItem:1,descricao:"Item sintético para teste",resultado:itemResult,decisao }],sugestao:"FRACASSADO",todosEncerrados:!!itemResult,historico:history };
  if (name === "licitacao.situacao.registrarProcesso") {
    assert.equal(input.processoId,2567); assert.equal(input.situacao,"FRACASSADO"); assert.equal(input.data,"2026-09-22"); assert(input.justificativa.length > 3);
    decisao = input; itemResult = input.situacao; history.push({ id:1,decisao:input,item_ids:[90001],usuario:"Gestor de teste" }); return { success:true };
  }
  if (name === "licitacao.situacao.reabrirProcesso") { decisao = { ...input,situacao:"EM_ANDAMENTO" }; history.push({ id:2,decisao,item_ids:[],usuario:"Gestor de teste" }); return { success:true }; }
  if (name === "licitacao.situacao.reabrirItens") { assert.deepEqual(input.itemIds,[90001]); itemResult=null; history.push({ id:3,decisao:{ ...input,situacao:"EM_ANDAMENTO" },item_ids:[90001],usuario:"Gestor de teste" }); return {success:true}; }
  return fixture.query(name);
}
const browser = await chromium.launch({ channel:"msedge",headless:true });
const context = await browser.newContext({ viewport:{width:1440,height:1000} });
const page = await context.newPage(); page.setDefaultTimeout(20000); page.on("pageerror",e=>errors.push(e.message));
await context.route("**/*",async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.hostname==="static.cloudflareinsights.com")return route.abort();
  if(url.origin!==origin){unexpected.push(url.href);return route.abort();}
  if(url.pathname.startsWith("/api/trpc/")){
    const names=decodeURIComponent(url.pathname.slice("/api/trpc/".length)).split(","),batch=url.searchParams.has("batch");
    const raw=JSON.parse(url.searchParams.get("input")??request.postData()??"null");
    const response=names.map((name,index)=>{calls.push(name);const value=batch?raw?.[index]:raw;return {result:{data:superjson.serialize(query(name,value?superjson.deserialize(value):undefined))}};});
    return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(batch?response:response[0])});
  }
  if(url.pathname.startsWith("/api/")){unexpected.push(url.href);return route.abort();}
  return route.continue();
});
async function capture(name){writeFileSync(resolve(output,`${name}.yml`),await page.locator("body").ariaSnapshot());await page.screenshot({path:resolve(output,`${name}.png`),fullPage:true});}
async function fillDecision(reason){await page.getByRole("textbox",{name:"Data da decisão",exact:true}).fill("2026-09-22");await page.getByRole("textbox",{name:"Justificativa",exact:true}).fill(reason);await page.getByRole("button",{name:"Revisar decisão",exact:true}).click();}
try {
  await page.goto(`${origin}/licitacao/2567?fase=JULGAMENTO`);
  const panel=page.getByRole("region",{name:"Situação do procedimento",exact:true});
  await panel.getByRole("button",{name:"Definir situação",exact:true}).click();
  await fillDecision("Todas as propostas foram desclassificadas conforme decisão registrada.");
  await capture("confirmacao-fracasso");
  assert.equal(decisao,null,"Review must not write the decision");
  await page.getByRole("button",{name:"Confirmar decisão",exact:true}).click();
  await panel.getByRole("button",{name:"Reabrir processo",exact:true}).waitFor();
  await capture("processo-fracassado");
  await page.reload();
  await panel.getByRole("button",{name:"Reabrir processo",exact:true}).click();
  await fillDecision("Reabertura autorizada para revisão do julgamento.");
  await page.getByRole("button",{name:"Confirmar decisão",exact:true}).click();
  await panel.getByRole("button",{name:"Definir situação",exact:true}).waitFor();
  await panel.getByRole("button",{name:"Definir situação",exact:true}).click();
  await page.getByRole("combobox",{name:"Abrangência",exact:true}).selectOption("REABRIR_ITENS");
  await page.getByRole("checkbox",{name:/Item 1/}).check();
  await fillDecision("Item devolvido ao julgamento após revisão da decisão.");
  await page.getByRole("button",{name:"Confirmar decisão",exact:true}).click();
  await page.getByRole("heading",{name:"Confirmar decisão",exact:true}).waitFor({state:"hidden"});
  assert.equal(itemResult,null); assert.equal(history.length,3);
  await page.setViewportSize({width:390,height:844}); await capture("mobile-reaberto");
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
  writeFileSync(resolve(output,"result.json"),JSON.stringify({calls,errors,unexpected},null,2));console.log("Situation decision, persistence and reopening UI smoke passed (synthetic API).");
} catch(error){await capture("failure");writeFileSync(resolve(output,"failure.json"),JSON.stringify({message:error.message,calls,errors,unexpected},null,2));throw error;}
finally {await browser.close();}

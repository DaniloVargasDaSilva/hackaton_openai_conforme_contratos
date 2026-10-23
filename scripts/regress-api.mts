// Regressão de TODAS as rotas da API, com os caminhos de erro. Altera dados: precisa de DEMO_RESET_ENABLED=1
// no alvo, e termina devolvendo a demo ao estado inicial.
//
//   npm run test:api -- http://localhost:3000
//   npm run test:api -- https://seu-app.vercel.app
//
// Toda resposta de sucesso é validada pelos schemas zod do front (lib/contracts e lib/contracts-3vias).
// Funciona com e sem OpenAI: onde a IA decide o resultado, aceita as duas origens e confere o formato.
import { readFileSync } from "node:fs";
import { z } from "zod";

const load = async (p: string) => {
  const m: any = await import(p);
  return m.default ?? m;
};
const contracts = await load("../lib/contracts");
const tres = await load("../lib/contracts-3vias");
const { ApiError, ContractDetail, ContractSummary, InvoiceLine, Report } = contracts;
const { CheckResult3, Health, NfResponse, Occurrence3, UploadDeliveriesResult, UploadNfResult } = tres;

const base = (process.argv.slice(2).find((a) => /^https?:\/\//.test(a)) ?? process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const API = `${base}/api`;
const C = "/contracts/c-042";
const seed = JSON.parse(readFileSync("data/seed-demo.json", "utf8"));
const xml = readFileSync("data/demo/nf-8812-ficticia.xml", "utf8");
const csv = readFileSync("data/demo/entregas-outubro.csv", "utf8");

let fails = 0;
let total = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  total++;
  if (!cond) fails++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? `  ${extra}` : ""}`);
};
const sec = (t: string) => console.log(`\n## ${t}`);

type R = { status: number; data: any; error: boolean; code?: string; ms: number };

/** Chama a rota. `body` string vai crua (para testar JSON inválido); objeto vai como JSON. */
async function call(method: string, path: string, schema: z.ZodTypeAny | null, body?: unknown): Promise<R> {
  const t0 = Date.now();
  let res: Response;
  try {
    res = await fetch(API + path, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    });
  } catch (e) {
    fails++;
    total++;
    console.log(`FAIL  ${method} ${path}  sem resposta (${(e as Error).message})`);
    return { status: 0, data: null, error: true, ms: Date.now() - t0 };
  }
  const ms = Date.now() - t0;
  const json: any = await res.json().catch(() => null);
  if (!res.ok) {
    const isErr = ApiError.safeParse(json).success;
    return { status: res.status, data: json, error: isErr, code: json?.error?.code, ms };
  }
  if (schema) {
    const p = schema.safeParse(json);
    if (!p.success) {
      fails++;
      total++;
      console.log(`FAIL  ${method} ${path}  fora do schema do front: ${JSON.stringify(p.error.issues.slice(0, 2))}`);
      return { status: res.status, data: json, error: false, ms };
    }
    return { status: res.status, data: p.data, error: false, ms };
  }
  return { status: res.status, data: json, error: false, ms };
}

/** Confere que a resposta de erro segue o formato { error: { code, message } } com o status e o código esperados. */
const errIs = (r: R, status: number, code?: string) => r.status === status && r.error && (code === undefined || r.code === code);

console.log(`Alvo: ${base}`);

/* ================= saúde ================= */
sec("GET /api/health");
let r = await call("GET", "/health", Health);
ok("responde 200 no schema do front", r.status === 200 && r.data?.ok === true && r.data.db === true, `(${r.ms} ms)`);
ok("informa schema (tabelas existem)", r.data?.schema !== false, r.data?.detail ?? "");
const aiOn = r.data?.ai === true;
console.log(`INFO  IA configurada: ${aiOn ? "sim" : "não (fallback e template)"}`);
if (r.data?.ok !== true) {
  console.log("\nSem banco pronto não há o que testar. Rode: npm run db:setup");
  process.exit(1);
}

/* ================= estado inicial ================= */
sec("POST /api/demo/reset");
r = await call("POST", "/demo/reset?estado=vazio", null);
if (r.status === 404) {
  console.log("FAIL  reset respondeu 404: ligue DEMO_RESET_ENABLED=1 no alvo para rodar a regressão");
  process.exit(1);
}
ok("reset ?estado=vazio responde 200 { ok, resetAt }", r.status === 200 && r.data?.ok === true && typeof r.data.resetAt === "string", `(${r.ms} ms)`);
r = await call("GET", `${C}/invoice-lines`, z.array(InvoiceLine));
ok("estado vazio: sem linhas de fatura", r.data?.length === 0);
r = await call("GET", `${C}/nf`, NfResponse);
ok("estado vazio: sem NF", r.data?.nf === null);

/* ================= carteira ================= */
sec("GET /api/contracts");
r = await call("GET", "/contracts", z.array(ContractSummary));
const list = r.data ?? [];
ok("10 contratos", list.length === 10);
ok("ordenados por valor anual decrescente", list.every((c: any, i: number) => i === 0 || list[i - 1].annualValue >= c.annualValue));
ok("042/2026 é classe A", list.find((c: any) => c.number === "042/2026")?.abcClass === "A");
ok("% acumulado do 4º contrato ≈ 76", Math.abs((list[3]?.cumulativePct ?? 0) - 76.19) < 0.05, `(${list[3]?.cumulativePct})`);
ok("curva fecha em 100%", list[list.length - 1]?.cumulativePct === 100);
ok("classes só A, B ou C e na ordem A→B→C", list.map((c: any) => c.abcClass).join("") === [...list.map((c: any) => c.abcClass)].sort().join(""));

sec("GET /api/contracts/:id");
r = await call("GET", C, ContractDetail);
ok("c-042: 11 cláusulas e 8 itens", r.data?.clauses?.length === 11 && r.data?.items?.length === 8);
ok("itens na ordem do contrato (suite … sla)", r.data?.items?.[0]?.id === "suite" && r.data?.items?.[7]?.id === "sla");
ok("texto do contrato presente", (r.data?.contract?.text ?? "").includes("CLÁUSULA 2"));
ok("extração de origem 'seed' no estado inicial", r.data?.extraction?.source === "seed");
const verified = (r.data?.items ?? []).filter((i: any) => i.quoteVerified).length;
console.log(`INFO  itens com trecho conferido: ${verified} de 8`);
r = await call("GET", "/contracts/nao-existe", null);
ok("id inexistente: 404 NOT_FOUND", errIs(r, 404, "NOT_FOUND"));

sec("POST /api/contracts");
const novo = { number: "999/2026", supplier: "Teste Ltda", object: "Teste", annualValue: 1000, renewsAt: "2027-01-01", text: "Contrato de teste com texto suficiente para passar da validação de cinquenta caracteres." };
r = await call("POST", "/contracts", ContractDetail, novo);
ok("cria contrato: 201 sem itens", r.status === 201 && r.data?.items?.length === 0);
const newId = r.data?.contract?.id;
ok("contrato novo entra na carteira", ((await call("GET", "/contracts", z.array(ContractSummary))).data ?? []).length === 11);
r = await call("POST", "/contracts", null, { ...novo, text: "curto" });
ok("texto curto: 400 VALIDATION_ERROR", errIs(r, 400, "VALIDATION_ERROR"));
r = await call("POST", "/contracts", null, "{isto não é json");
ok("JSON inválido: 400 INVALID_JSON", errIs(r, 400, "INVALID_JSON"));
r = await call("POST", "/contracts", null, { number: "1" });
ok("campos faltando: 400 VALIDATION_ERROR", errIs(r, 400, "VALIDATION_ERROR"));

/* ================= extração ================= */
sec("POST /api/contracts/:id/extract");
r = await call("POST", `${C}/extract`, ContractDetail);
ok("extrai o c-042: 8 itens, origem ai ou fallback", r.status === 200 && r.data?.items?.length === 8 && ["ai", "fallback"].includes(r.data.extraction.source), `(origem ${r.data?.extraction?.source}, ${r.ms} ms)`);
ok("mantém a ordem e os ids do contrato", r.data?.items?.[0]?.id === "suite" && r.data?.items?.some((i: any) => i.id === "tokens"));
r = await call("POST", `/contracts/${newId}/extract`, ContractDetail);
ok("contrato novo: extração responde 200 no schema", r.status === 200, `(origem ${r.data?.extraction?.source}, ${r.data?.items?.length} itens)`);
r = await call("POST", "/contracts/nao-existe/extract", null);
ok("extração de id inexistente: 404", errIs(r, 404, "NOT_FOUND"));

/* ================= NF e entregas ================= */
sec("POST/GET /api/contracts/:id/nf");
r = await call("POST", `${C}/nf`, UploadNfResult, { xml: "<a><b>isto nao e uma nota fiscal</b></a>" });
ok("XML sem <nNF>: nf null e erro de arquivo", r.data?.nf === null && r.data?.errors?.[0]?.row === null);
r = await call("POST", `${C}/nf`, UploadNfResult, { xml: "<a><b></a> xml quebrado aqui" });
ok("XML malformado: nf null e erro de arquivo", r.data?.nf === null && r.data?.errors?.length === 1);
r = await call("GET", `${C}/invoice-lines`, z.array(InvoiceLine));
ok("envio inválido não gravou nada", r.data?.length === 0);
r = await call("POST", `${C}/nf`, null, { xml: "curto" });
ok("corpo curto: 400 VALIDATION_ERROR", errIs(r, 400, "VALIDATION_ERROR"));
r = await call("POST", `${C}/nf`, UploadNfResult, { xml });
ok("NF válida: 8 itens, sem erros", r.status === 200 && r.data?.nf?.items?.length === 8 && r.data.errors.length === 0, `(${r.ms} ms)`);
ok("tokens: franquia + excedente = 66 a R$ 90", (() => { const l = r.data?.lines?.find((x: any) => x.itemId === "tokens"); return l?.billedQty === 66 && l?.billedUnitPrice === 90; })());
r = await call("GET", `${C}/nf`, NfResponse);
ok("GET nf devolve a NF 8812", r.data?.nf?.number === "8812" && r.data.nf.total === 45330);
r = await call("GET", "/contracts/nao-existe/nf", null);
ok("GET nf de id inexistente: 404", errIs(r, 404, "NOT_FOUND"));
r = await call("POST", "/contracts/nao-existe/nf", null, { xml });
ok("POST nf de id inexistente: 404", errIs(r, 404, "NOT_FOUND"));
r = await call("GET", `/contracts/${newId}/nf`, NfResponse);
ok("contrato novo: GET nf = null", r.data?.nf === null);

sec("POST /api/contracts/:id/nf-photo");
const foto = Buffer.from("x".repeat(3000)).toString("base64");
r = await call("POST", `${C}/nf-photo`, null, { imageBase64: foto, mimeType: "image/heic" });
ok("formato não suportado: 400 VALIDATION_ERROR", errIs(r, 400, "VALIDATION_ERROR"));
r = await call("POST", `${C}/nf-photo`, null, { imageBase64: "abc", mimeType: "image/jpeg" });
ok("imagem vazia: 400 VALIDATION_ERROR", errIs(r, 400, "VALIDATION_ERROR"));
const before = (await call("GET", `${C}/invoice-lines`, z.array(InvoiceLine))).data?.length;
r = await call("POST", `${C}/nf-photo`, UploadNfResult, { imageBase64: foto, mimeType: "image/jpeg" });
ok("foto: 200 no schema; com IA lê a NF, sem IA devolve erro claro", r.status === 200 && (r.data?.nf !== null || (r.data?.errors?.length ?? 0) > 0), aiOn ? `(IA: nf ${r.data?.nf?.number ?? "não lida"})` : `(${r.data?.errors?.[0]?.message ?? ""})`);
ok("foto que falha não apaga as linhas já gravadas", (await call("GET", `${C}/invoice-lines`, z.array(InvoiceLine))).data?.length >= (before ?? 0));
r = await call("POST", "/contracts/nao-existe/nf-photo", null, { imageBase64: foto, mimeType: "image/jpeg" });
ok("foto de id inexistente: 404", errIs(r, 404, "NOT_FOUND"));
// Garante a NF 8812 para o resto, mesmo se a IA tiver lido outra coisa.
await call("POST", `${C}/nf`, UploadNfResult, { xml });

sec("POST /api/contracts/:id/deliveries");
r = await call("POST", `${C}/deliveries`, UploadDeliveriesResult, { csv: "foo,bar\n1,2\n3,4" });
ok("cabeçalho errado: erro de arquivo e nada alterado", r.data?.errors?.length === 1 && r.data.errors[0].row === null && r.data.lines.length > 0);
r = await call("POST", `${C}/deliveries`, UploadDeliveriesResult, { csv: "item_id,fonte,data_entrega,qtd_entregue,usuarios_ativos,disponibilidade_pct\nxxx,F,,,,\nsuite,F,2026-13-40,,,\ncrm,F,,abc,,\n" });
ok("linhas inválidas: item desconhecido, data e número ruins", (r.data?.errors?.length ?? 0) === 3 && r.data.errors.every((e: any) => typeof e.row === "number"), JSON.stringify((r.data?.errors ?? []).map((e: any) => e.row)));
r = await call("POST", `${C}/deliveries`, null, { csv: "x" });
ok("corpo curto: 400 VALIDATION_ERROR", errIs(r, 400, "VALIDATION_ERROR"));
r = await call("POST", `${C}/deliveries`, UploadDeliveriesResult, { csv });
ok("CSV válido: 8 linhas, sem erros", r.status === 200 && r.data?.lines?.length === 8 && r.data.errors.length === 0, `(${r.ms} ms)`);
r = await call("POST", "/contracts/nao-existe/deliveries", null, { csv });
ok("entregas de id inexistente: 404", errIs(r, 404, "NOT_FOUND"));

/* ================= linhas ================= */
sec("GET/PATCH /api/invoice-lines");
r = await call("GET", `${C}/invoice-lines`, z.array(InvoiceLine));
const lines = r.data ?? [];
ok("8 linhas na ordem dos itens", lines.length === 8 && lines[0]?.itemId === "suite" && lines[7]?.itemId === "sla");
const sla = lines.find((l: any) => l.itemId === "sla");
ok("SLA: 98,9% medido e nenhum crédito", sla?.measuredPct === 98.9 && (sla?.creditApplied ?? 0) === 0);
const suite = lines.find((l: any) => l.itemId === "suite");
r = await call("PATCH", `/invoice-lines/${suite.id}`, null, { billedQty: "muitas" });
ok("PATCH com tipo errado: 400 VALIDATION_ERROR", errIs(r, 400, "VALIDATION_ERROR"));
r = await call("PATCH", "/invoice-lines/id-que-nao-existe", null, { billedQty: 1 });
ok("PATCH em linha inexistente: 404 NOT_FOUND", errIs(r, 404, "NOT_FOUND"));
r = await call("PATCH", `/invoice-lines/${suite.id}`, InvoiceLine, { source: "tentando mudar" });
ok("PATCH ignora campos que não são editáveis (source)", r.status === 200 && r.data?.source === suite.source);
r = await call("GET", `/contracts/nao-existe/invoice-lines`, null);
ok("GET linhas de id inexistente: 404", errIs(r, 404, "NOT_FOUND"));

/* ================= conferência ================= */
sec("POST/GET /api/contracts/:id/check");
r = await call("POST", `${C}/check`, CheckResult3);
let occ = r.data?.occurrences ?? [];
ok("5 ocorrências e R$ 4.644 em jogo", occ.length === 5 && r.data?.totals?.atStake === 4644, `(${occ.length}, R$ ${r.data?.totals?.atStake}, ${r.ms} ms)`);
ok("chaves esperadas", occ.map((o: any) => o.key).sort().join(",") === "crm:valor,implantacao:prazo,sla:sla,suite:quantidade,tokens:quantidade");
const impacts: Record<string, number> = { "suite:quantidade": 930, "crm:valor": 720, "tokens:quantidade": 720, "implantacao:prazo": 720, "sla:sla": 1554 };
ok("impacto de cada ocorrência bate com o gabarito", occ.every((o: any) => o.impact === impacts[o.key]));
ok("todas pendentes e totals consistentes", r.data?.totals?.pendingCount === 5 && r.data.totals.confirmed === 0);
ok("evidência em três vias em todas", occ.every((o: any) => o.evidence.contract.length > 0 && o.evidence.invoice && o.evidence.delivery.source));
ok("oportunidades: sem_uso (R$ 1.364) e plano_acima, sem 'desligados' (LGPD)", r.data?.opportunities?.length === 2 && r.data.opportunities.some((o: any) => o.rule === "sem_uso" && o.monthlyValue === 1364) && r.data.opportunities.some((o: any) => o.rule === "plano_acima") && !r.data.opportunities.some((o: any) => o.rule === "desligados"));
ok("ocorrências ordenadas por impacto", occ.every((o: any, i: number) => i === 0 || occ[i - 1].impact >= o.impact));
r = await call("GET", `${C}/check`, CheckResult3);
ok("GET devolve a última conferência", r.data?.occurrences?.length === 5);
r = await call("GET", "/contracts/nao-existe/check", null);
ok("GET check de id inexistente: 404", errIs(r, 404, "NOT_FOUND"));
r = await call("POST", "/contracts/nao-existe/check", null);
ok("POST check de id inexistente: 404", errIs(r, 404, "NOT_FOUND"));
r = await call("GET", `/contracts/${newId}/check`, CheckResult3);
ok("contrato sem fatura: conferência vazia e zerada", r.data?.occurrences?.length === 0 && r.data?.totals?.atStake === 0);

/* ================= revisão ================= */
sec("POST /api/occurrences/:id/review");
const crm = occ.find((o: any) => o.key === "crm:valor");
r = await call("POST", `/occurrences/${crm.id}/review`, Occurrence3, { status: "confirmada", comment: "Confirmado com o fornecedor", reviewer: "Carla (TI)" });
ok("confirma: status e histórico com 1 revisão", r.data?.status === "confirmada" && r.data.reviews.length === 1 && r.data.reviews[0].reviewer === "Carla (TI)");
r = await call("POST", `/occurrences/${crm.id}/review`, Occurrence3, { status: "descartada", comment: "Mudei de ideia", reviewer: "Dan" });
ok("segunda revisão: vale a mais recente e o histórico guarda as duas", r.data?.status === "descartada" && r.data.reviews.length === 2 && r.data.reviews[0].status === "descartada");
r = await call("POST", `/occurrences/${crm.id}/review`, Occurrence3, { status: "confirmada", reviewer: "Carla (TI)" });
ok("comentário é opcional", r.status === 200 && r.data?.reviews?.[0]?.comment === "");
r = await call("POST", `/occurrences/${crm.id}/review`, null, { status: "talvez", reviewer: "Carla" });
ok("status inválido: 400 VALIDATION_ERROR", errIs(r, 400, "VALIDATION_ERROR"));
r = await call("POST", `/occurrences/${crm.id}/review`, null, { status: "confirmada", reviewer: "" });
ok("revisor vazio: 400 VALIDATION_ERROR", errIs(r, 400, "VALIDATION_ERROR"));
r = await call("POST", "/occurrences/id-que-nao-existe/review", null, { status: "confirmada", reviewer: "Carla" });
ok("ocorrência inexistente: 404 NOT_FOUND", errIs(r, 404, "NOT_FOUND"));
r = await call("POST", `${C}/check`, CheckResult3);
ok("reconferir mantém a revisão pela chave", r.data?.occurrences?.find((o: any) => o.key === "crm:valor")?.status === "confirmada" && r.data.totals.confirmed === 720 && r.data.totals.pendingCount === 4);

sec("Ocorrência que some e volta");
const suiteOcc = r.data.occurrences.find((o: any) => o.key === "suite:quantidade");
await call("POST", `/occurrences/${suiteOcc.id}/review`, Occurrence3, { status: "confirmada", reviewer: "Carla (TI)" });
r = await call("PATCH", `/invoice-lines/${suite.id}`, InvoiceLine, { billedQty: 120 });
ok("corrige a quantidade da suíte (PATCH)", r.data?.billedQty === 120);
r = await call("GET", `${C}/check`, CheckResult3);
ok("GET /check já reflete a edição, sem reconferir: R$ 3.714", r.data?.totals?.atStake === 3714 && r.data.occurrences.length === 4, `(R$ ${r.data?.totals?.atStake})`);
r = await call("POST", `/occurrences/${suiteOcc.id}/review`, null, { status: "confirmada", reviewer: "Carla" });
ok("revisar ocorrência que sumiu: 409 OCORRENCIA_INATIVA", errIs(r, 409, "OCORRENCIA_INATIVA"));
await call("PATCH", `/invoice-lines/${suite.id}`, InvoiceLine, { billedQty: 135 });
r = await call("POST", `${C}/check`, CheckResult3);
const volta = r.data?.occurrences?.find((o: any) => o.key === "suite:quantidade");
ok("ocorrência volta com o mesmo id e a revisão que já tinha", volta?.id === suiteOcc.id && volta.status === "confirmada" && r.data.totals.atStake === 4644);

/* ================= fatura antiga (CSV único) ================= */
sec("POST /api/contracts/:id/invoice-lines (CSV único, compatibilidade)");
r = await call("POST", `${C}/invoice-lines`, null, { csv: seed.invoiceCsv });
ok("CSV de fatura da demo: 8 linhas e sem erros", r.status === 200 && r.data?.lines?.length === 8 && r.data.errors.length === 0);
r = await call("POST", `${C}/invoice-lines`, null, { csv: "item_id,fonte\nsuite,x\n" });
ok("cabeçalho incompleto: erro de arquivo", r.status === 200 && r.data?.errors?.length === 1 && r.data.errors[0].row === 1);
r = await call("POST", `${C}/invoice-lines`, null, { csv: seed.invoiceCsv.replace("suite,", "naoexiste,") });
ok("item desconhecido: erro com número da linha, o resto entra", r.data?.errors?.[0]?.row === 2 && r.data.lines.length === 7);
r = await call("POST", `${C}/invoice-lines`, null, { csv: "x" });
ok("corpo curto: 400 VALIDATION_ERROR", errIs(r, 400, "VALIDATION_ERROR"));
await call("POST", `${C}/invoice-lines`, null, { csv: seed.invoiceCsv });
r = await call("POST", `${C}/check`, CheckResult3);
ok("conferência sobre a fatura antiga dá o mesmo resultado (R$ 4.644)", r.data?.occurrences?.length === 5 && r.data.totals.atStake === 4644);
ok("fatura antiga: evidência com a origem única nos dois lados", r.data?.occurrences?.every((o: any) => o.evidence.invoice?.source && o.evidence.delivery.source));

/* ================= relatório ================= */
sec("POST /api/contracts/:id/report");
// Volta ao fluxo de três vias antes do relatório.
await call("POST", `${C}/nf`, UploadNfResult, { xml });
await call("POST", `${C}/deliveries`, UploadDeliveriesResult, { csv });
r = await call("POST", `${C}/check`, CheckResult3);
r = await call("POST", `${C}/report`, Report);
ok("relatório com ocorrências confirmadas: origem ai ou template", r.status === 200 && ["ai", "template"].includes(r.data?.source) && r.data.text.length > 30, `(origem ${r.data?.source}, ${r.ms} ms)`);
ok("o relatório cita as ocorrências confirmadas", r.data?.source === "ai" || /Suíte|CRM|suíte/.test(r.data?.text ?? ""));
r = await call("POST", "/contracts/nao-existe/report", null);
ok("relatório de id inexistente: 404", errIs(r, 404, "NOT_FOUND"));
r = await call("POST", `/contracts/${newId}/report`, Report);
ok("contrato sem ocorrências: relatório diz que não há divergência", r.status === 200 && r.data?.source === "template" && /nenhuma/i.test(r.data?.text ?? ""));

/* ================= reset ================= */
sec("POST /api/demo/reset (volta ao estado da demo)");
r = await call("POST", "/demo/reset", null);
ok("reset cheio responde 200", r.status === 200 && r.data?.ok === true, `(${r.ms} ms)`);
r = await call("GET", "/contracts", z.array(ContractSummary));
ok("o contrato criado no teste foi removido", r.data?.length === 10);
r = await call("GET", `${C}/nf`, NfResponse);
ok("NF 8812 carregada", r.data?.nf?.number === "8812");
r = await call("POST", `${C}/check`, CheckResult3);
ok("R$ 4.644, 5 ocorrências e nenhuma confirmada", r.data?.occurrences?.length === 5 && r.data.totals.atStake === 4644 && r.data.totals.confirmed === 0 && r.data.totals.pendingCount === 5);
r = await call("GET", C, ContractDetail);
ok("itens do contrato voltaram ao seed", r.data?.extraction?.source === "seed" && r.data.items.length === 8);

console.log(`\n${total - fails}/${total} checks passaram.`);
console.log(fails === 0 ? "TUDO OK" : `${fails} FALHA(S)`);
process.exit(fails === 0 ? 0 : 1);

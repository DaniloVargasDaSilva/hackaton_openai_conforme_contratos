// Teste de fumaça da API contra qualquer URL (local ou Vercel).
//
//   npm run check:deploy -- https://seu-app.vercel.app           só leitura, não altera nada
//   npm run check:deploy -- https://seu-app.vercel.app --write   fluxo completo: reseta a demo, envia NF e entregas,
//                                                                 confere, revisa e gera o relatório
//
// Toda resposta é validada com os mesmos schemas zod que o front usa. A saída é uma lista PASS/FAIL
// que dá para colar numa conversa. Código de saída 1 se algo falhar.
import { readFileSync } from "node:fs";
import { z } from "zod";

// O tsx carrega os módulos do repo como CJS; o import dinâmico entrega o module.exports em `default`.
const load = async (p: string) => {
  const m: any = await import(p);
  return m.default ?? m;
};
const contracts = await load("../lib/contracts");
const tres = await load("../lib/contracts-3vias");
const { ApiError, ContractDetail, ContractSummary, InvoiceLine, Report } = contracts;
const { CheckResult3, Health, NfResponse, UploadDeliveriesResult, UploadNfResult } = tres;

const args = process.argv.slice(2);
const write = args.includes("--write");
const base = (args.find((a) => /^https?:\/\//.test(a)) ?? process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const API = `${base}/api`;
const C = "/contracts/c-042";

let fails = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (!cond) fails++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? `  ${extra}` : ""}`);
};

type Res = { status: number; data: any; isApiError: boolean; ms: number; error?: string };

async function call(method: string, path: string, schema: z.ZodTypeAny | null, body?: unknown, quiet = false): Promise<Res> {
  const t0 = Date.now();
  let r: Response;
  try {
    r = await fetch(API + path, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    fails++;
    console.log(`FAIL  ${method} ${path}  sem resposta (${(e as Error).message})`);
    return { status: 0, data: null, isApiError: false, ms: Date.now() - t0, error: "sem resposta" };
  }
  const ms = Date.now() - t0;
  const text = await r.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  if (!r.ok) {
    const detail = json?.error ? `${json.error.code}: ${json.error.message}` : text.slice(0, 160);
    // O corpo do erro é o que explica o problema em produção; só some nos testes que esperam o erro.
    if (!quiet) console.log(`INFO  ${method} ${path} respondeu ${r.status}  ${detail}`);
    return { status: r.status, data: null, isApiError: ApiError.safeParse(json).success, ms, error: detail };
  }
  if (json === null) {
    fails++;
    console.log(`FAIL  ${method} ${path}  resposta não é JSON (${r.status}): ${text.slice(0, 120)}`);
    return { status: r.status, data: null, isApiError: false, ms };
  }
  if (schema) {
    const p = schema.safeParse(json);
    if (!p.success) {
      fails++;
      console.log(`FAIL  ${method} ${path}  fora do schema do front: ${JSON.stringify(p.error.issues.slice(0, 2))}`);
      return { status: r.status, data: json, isApiError: false, ms };
    }
    return { status: r.status, data: p.data, isApiError: false, ms };
  }
  return { status: r.status, data: json, isApiError: false, ms };
}

const sec = (t: string) => console.log(`\n## ${t}`);

console.log(`Alvo: ${base}   modo: ${write ? "completo (--write)" : "só leitura"}`);

/* ---------- leitura ---------- */
sec("Saúde");
let r = await call("GET", "/health", Health);
ok("GET /api/health responde", r.status === 200, `(${r.ms} ms)`);
ok("banco conectado (db: true)", r.data?.db === true, r.data ? `db=${r.data.db}` : "");
console.log(`INFO  IA configurada: ${r.data?.ai === true ? "sim" : "não (extração e relatório usam fallback)"}`);
if (r.status === 0) {
  console.log("\nO servidor não respondeu. Confira a URL e se o deploy já terminou.");
  process.exit(1);
}
if (r.status === 404) {
  console.log("\n/api/health não existe nesse endereço: a URL está errada ou o deploy não inclui a API.");
  process.exit(1);
}
if (r.status >= 500 || r.data?.db !== true) {
  console.log("\nA API respondeu, mas sem banco. Confira DATABASE_URL (use a URL com pooler) e rode uma vez: npx prisma db push && npx tsx prisma/seed.ts");
  process.exit(1);
}

sec("Leitura");
r = await call("GET", "/contracts", z.array(ContractSummary));
ok("GET /contracts", r.status === 200, `(${r.ms} ms)`);
const seeded = Array.isArray(r.data) && r.data.length === 10;
ok("10 contratos da demo (seed aplicado)", seeded, Array.isArray(r.data) ? `(${r.data.length})` : "");
if (!seeded) console.log("INFO  rode o seed: DATABASE_URL=... npx tsx prisma/seed.ts");
r = await call("GET", C, ContractDetail);
ok("GET /contracts/c-042", r.status === 200 && r.data?.items?.length === 8, r.data?.items ? `(${r.data.items.length} itens)` : "");
r = await call("GET", `${C}/nf`, NfResponse);
ok("GET /contracts/c-042/nf", r.status === 200);
r = await call("GET", `${C}/invoice-lines`, z.array(InvoiceLine));
ok("GET /contracts/c-042/invoice-lines", r.status === 200, r.data ? `(${r.data.length} linhas)` : `(${r.error ?? ""})`);
r = await call("GET", `${C}/check`, CheckResult3);
ok("GET /contracts/c-042/check", r.status === 200, r.data ? `(${r.data.occurrences.length} ocorrências, R$ ${r.data.totals.atStake})` : `(${r.error ?? r.ms + " ms"})`);
r = await call("GET", "/contracts/nao-existe", null, undefined, true);
ok("erro 404 no formato { error: { code, message } }", r.status === 404 && r.isApiError);

if (!write) {
  console.log(fails === 0 ? "\nLeitura OK. Para o fluxo completo: acrescente --write (precisa de DEMO_RESET_ENABLED=1)." : `\n${fails} FALHA(S)`);
  process.exit(fails === 0 ? 0 : 1);
}

/* ---------- escrita ---------- */
const xml = readFileSync("data/demo/nf-8812-ficticia.xml", "utf8");
const csv = readFileSync("data/demo/entregas-outubro.csv", "utf8");

sec("Fluxo completo");
r = await call("POST", "/demo/reset?estado=vazio", null, undefined, true);
if (r.status === 404) {
  console.log("FAIL  POST /demo/reset respondeu 404: a variável DEMO_RESET_ENABLED=1 não está ligada neste deploy");
  process.exit(1);
}
ok("reset da demo (fatura vazia)", r.status === 200, `(${r.ms} ms)`);
r = await call("POST", `${C}/nf`, UploadNfResult, { xml });
ok("envio da NF (XML)", r.status === 200 && r.data?.nf?.items?.length === 8 && r.data.errors.length === 0, `(${r.ms} ms)`);
r = await call("POST", `${C}/deliveries`, UploadDeliveriesResult, { csv });
ok("envio das entregas (CSV)", r.status === 200 && r.data?.lines?.length === 8 && r.data.errors.length === 0, `(${r.ms} ms)`);
r = await call("POST", `${C}/check`, CheckResult3);
ok("conferência: 5 ocorrências e R$ 4.644", r.data?.occurrences?.length === 5 && r.data.totals.atStake === 4644, r.data ? `(${r.data.occurrences.length}, R$ ${r.data.totals.atStake}, ${r.ms} ms)` : "");
const withInvoice = r.data?.occurrences?.every((o: any) => o.evidence.invoice) === true;
ok("evidência em três vias (contrato, NF, entrega)", withInvoice);
const crm = r.data?.occurrences?.find((o: any) => o.key === "crm:valor");
if (crm) {
  const rv = await call("POST", `/occurrences/${crm.id}/review`, z.any(), { status: "confirmada", comment: "teste de fumaça", reviewer: "Teste" });
  ok("revisão: confirmar uma ocorrência", rv.status === 200 && rv.data?.status === "confirmada");
}
r = await call("POST", `${C}/report`, Report);
ok("relatório", r.status === 200 && typeof r.data?.text === "string" && r.data.text.length > 50, r.data ? `(origem: ${r.data.source}, ${r.ms} ms)` : "");
r = await call("POST", `${C}/extract`, ContractDetail);
ok("extração do contrato", r.status === 200 && r.data?.items?.length >= 1, r.data ? `(origem: ${r.data.extraction.source}, ${r.ms} ms)` : "");

sec("Volta ao estado da demo");
r = await call("POST", "/demo/reset", null);
ok("reset da demo (fatura cheia)", r.status === 200, `(${r.ms} ms)`);
r = await call("POST", `${C}/check`, CheckResult3);
ok("conferência depois do reset: R$ 4.644 e nada confirmado", r.data?.totals?.atStake === 4644 && r.data.totals.confirmed === 0);

console.log(fails === 0 ? "\nTUDO OK" : `\n${fails} FALHA(S)`);
process.exit(fails === 0 ? 0 : 1);

// Implementação mock de cada função do api-client. Responde como o back responderia,
// a partir do seed. O check NÃO reimplementa o motor: devolve o expectedCheck do seed.
import type { ContractDetail, InvoiceLinePatch, Opportunity, Review } from "../contracts";
import type { CheckResult3 as CheckResult, Occurrence3 as Occurrence } from "../contracts-3vias";
import type { CreateContractBody, ReviewBody } from "../api-client";
import { ApiClientError } from "../api-error";
import { simulate } from "./latency";
import { contractsWithAbc, findCreated, getStore, mergePart, seedData } from "./store";
import { nf8812, occurrenceFixtures, opportunityFixtures, reportText, typeOrder } from "./fixtures";

const DEMO_ID = seedData.demoContract.id;

function notFound(what: string): never {
  throw new ApiClientError("nao_encontrado", `${what} não encontrado.`, 404);
}

function contractDetail(id: string, source: ContractDetail["extraction"]["source"], at: string | null): ContractDetail {
  const summary = contractsWithAbc().find((c) => c.id === id);
  if (!summary) notFound("Contrato");
  const created = findCreated(id);
  if (created) {
    return {
      contract: { ...summary, text: created.text },
      clauses: [],
      items: created.items,
      extraction: created.extraction,
    };
  }
  const isDemo = id === DEMO_ID;
  return {
    contract: { ...summary, text: isDemo ? seedData.demoContract.text : "" },
    clauses: isDemo ? seedData.demoContract.clauses : [],
    items: isDemo ? seedData.expectedItems : [],
    extraction: { source, at },
  };
}

function buildCheck(): CheckResult {
  const s = getStore();
  const ready = s.billed && s.delivered;
  const occurrences: Occurrence[] = ready
    ? seedData.expectedCheck.occurrences.map(({ key, impact }) => {
        const fx = occurrenceFixtures[key];
        const [itemId] = key.split(":");
        const reviews = s.reviews[key] ?? [];
        return {
          id: `occ-${key.replace(":", "-")}`,
          key,
          contractId: DEMO_ID,
          itemId,
          impact,
          ...fx,
          status: reviews[0]?.status ?? "pendente",
          reviews,
        };
      })
    : [];
  occurrences.sort((a, b) => typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type));

  const opportunities: Opportunity[] = ready
    ? seedData.expectedCheck.opportunities.map((o) => ({
        id: `opp-${o.itemId}-${o.rule}`,
        itemId: o.itemId,
        rule: o.rule,
        monthlyValue: o.monthlyValue,
        ...opportunityFixtures[`${o.itemId}:${o.rule}`],
      }))
    : [];

  // No back real os totais são do Dan; aqui o mock faz o papel dele.
  const totals = {
    atStake: ready ? seedData.expectedCheck.atStake : 0,
    confirmed: occurrences.filter((o) => o.status === "confirmada").reduce((acc, o) => acc + o.impact, 0),
    pendingCount: occurrences.filter((o) => o.status === "pendente").length,
  };
  return { contractId: DEMO_ID, checkedAt: s.checkedAt ?? new Date().toISOString(), occurrences, opportunities, totals };
}

export const mocks = {
  async getHealth() {
    await simulate("health");
    return { ok: true, db: true, ai: false };
  },

  async getContracts() {
    await simulate("contracts");
    return contractsWithAbc();
  },

  async getContract(id: string) {
    await simulate("contract");
    return contractDetail(id, "seed", null);
  },

  async createContract(body: CreateContractBody) {
    await simulate("contracts", 700);
    const id = `c-${body.number.replace(/\D+/g, "-").replace(/^-|-$/g, "")}-${Date.now().toString(36).slice(-4)}`;
    getStore().created.push({
      summary: {
        id,
        number: body.number,
        supplier: body.supplier,
        object: body.object,
        annualValue: body.annualValue,
        renewsAt: body.renewsAt,
        hasDemoData: true,
      },
      text: body.text,
      items: [],
      extraction: { source: "seed", at: null },
    });
    return contractDetail(id, "seed", null);
  },

  async extractContract(id: string) {
    const created = findCreated(id);
    if (created) {
      // No mock a "IA" devolve os itens de referência do seed; o trecho só conta
      // como conferido se existir no texto enviado (como faz o back).
      await simulate("extract", 1800);
      const norm = (t: string) => t.replace(/\s+/g, " ").trim();
      const text = norm(created.text);
      created.items = seedData.expectedItems.map((it) => ({ ...it, quoteVerified: text.includes(norm(it.quote)) }));
      created.extraction = { source: "fallback", at: new Date().toISOString() };
      return contractDetail(id, "fallback", created.extraction.at);
    }
    await simulate("extract", 1800);
    return contractDetail(id, "fallback", new Date().toISOString());
  },

  async getLines(id: string) {
    await simulate("lines");
    if (id !== DEMO_ID) return [];
    return getStore().lines;
  },

  async getNf(id: string) {
    await simulate("nf");
    return { nf: id === DEMO_ID ? getStore().nf : null };
  },

  async uploadNf(id: string, xml: string) {
    await simulate("nf", 700);
    if (!/<nNF>/i.test(xml)) {
      return { nf: null, lines: getStore().lines, errors: [{ row: null, message: "O arquivo não parece uma NF-e: falta a tag <nNF>." }] };
    }
    if (id !== DEMO_ID) notFound("Contrato");
    const s = getStore();
    s.nf = nf8812;
    mergePart("billed");
    return { nf: s.nf, lines: s.lines, errors: [] };
  },

  async uploadDeliveries(id: string, csv: string) {
    await simulate("deliveries", 600);
    const header = csv.split(/\r?\n/)[0] ?? "";
    if (!header.includes("item_id")) {
      return { lines: getStore().lines, errors: [{ row: null, message: "Cabeçalho do CSV sem a coluna item_id." }] };
    }
    if (id !== DEMO_ID) notFound("Contrato");
    mergePart("delivered");
    return { lines: getStore().lines, errors: [] };
  },

  async patchLine(lineId: string, patch: InvoiceLinePatch) {
    await simulate("lines");
    const line = getStore().lines.find((l) => l.id === lineId);
    if (!line) notFound("Linha");
    Object.assign(line, patch);
    return line;
  },

  async runCheck(id: string) {
    await simulate("check", 600);
    if (id !== DEMO_ID) notFound("Contrato");
    getStore().checkedAt = new Date().toISOString();
    return buildCheck();
  },

  async getCheck(id: string) {
    await simulate("check");
    if (id !== DEMO_ID) notFound("Contrato");
    return buildCheck();
  },

  async reviewOccurrence(occId: string, body: ReviewBody) {
    await simulate("review");
    const occ = buildCheck().occurrences.find((o) => o.id === occId);
    if (!occ) notFound("Ocorrência");
    const review: Review = {
      id: `rev-${Date.now()}`,
      status: body.status,
      comment: body.comment ?? "",
      reviewer: body.reviewer,
      createdAt: new Date().toISOString(),
    };
    const s = getStore();
    s.reviews[occ.key] = [review, ...(s.reviews[occ.key] ?? [])];
    return buildCheck().occurrences.find((o) => o.id === occId)!;
  },

  async generateReport(id: string) {
    await simulate("report", 1200);
    if (id !== DEMO_ID) notFound("Contrato");
    const check = buildCheck();
    const confirmed = check.occurrences.filter((o) => o.status === "confirmada");
    const total = check.totals.confirmed.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    return { text: reportText(confirmed, total), source: "template" as const, generatedAt: new Date().toISOString() };
  },
};

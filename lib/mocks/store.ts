// Estado em memória do mock, clonado do seed. Faz o papel do banco do Dan.
import seed from "@/data/seed-demo.json";
import type { ContractItem, ContractSummary, InvoiceLine, Review } from "../contracts";
import type { NfDocument } from "../contracts-3vias";
import { seedCheio } from "./latency";

type SeedContract = Omit<ContractSummary, "abcClass" | "cumulativePct">;

export const seedData = seed as unknown as {
  company: { name: string; reviewerDefault: string };
  contracts: SeedContract[];
  demoContract: { id: string; text: string; clauses: { ref: string; text: string }[] };
  expectedItems: ContractItem[];
  invoiceLines: InvoiceLine[];
  expectedCheck: {
    occurrences: { key: string; impact: number }[];
    atStake: number;
    opportunities: { itemId: string; rule: "sem_uso" | "desligados" | "plano_acima"; monthlyValue: number | null }[];
  };
};

export type CreatedContract = {
  summary: SeedContract;
  text: string;
  items: ContractItem[];
  extraction: { source: "ai" | "fallback" | "seed"; at: string | null };
};

type Store = {
  nf: NfDocument | null;
  billed: boolean;
  delivered: boolean;
  lines: InvoiceLine[];
  reviews: Record<string, Review[]>; // por key, mais recente primeiro
  checkedAt: string | null;
  created: CreatedContract[]; // contratos enviados pelo "Novo contrato"
};

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

let store: Store | null = null;

export function getStore(): Store {
  if (!store) {
    const cheio = seedCheio();
    store = {
      nf: null,
      billed: cheio,
      delivered: cheio,
      lines: cheio ? clone(seedData.invoiceLines) : [],
      reviews: {},
      checkedAt: null,
      created: [],
    };
  }
  return store;
}

const BILLED: (keyof InvoiceLine)[] = ["billedQty", "billedUnitPrice", "creditApplied", "penaltyApplied"];
const DELIVERED: (keyof InvoiceLine)[] = ["deliveredAt", "measuredQty", "activeUsers", "measuredPct"];
const DELIVERED_QTY: Record<string, number> = { crm: 40, backup: 1, suporte: 38 };

// Junta na linha a parte que veio de cada arquivo, a partir das linhas do seed.
export function mergePart(part: "billed" | "delivered") {
  const s = getStore();
  const fields = part === "billed" ? BILLED : DELIVERED;
  for (const src of seedData.invoiceLines) {
    let line = s.lines.find((l) => l.itemId === src.itemId);
    if (!line) {
      line = {
        ...clone(src),
        billedQty: null,
        billedUnitPrice: null,
        deliveredAt: null,
        measuredQty: null,
        activeUsers: null,
        measuredPct: null,
        creditApplied: null,
        penaltyApplied: null,
      };
      s.lines.push(line);
    }
    for (const f of fields) (line as Record<string, unknown>)[f] = src[f];
    // O CSV de entregas (data/demo/entregas-outubro.csv) também traz qtd entregue
    // para itens recorrentes; o motor não usa, mas a coluna "Entregue" mostra.
    if (part === "delivered" && line.measuredQty == null && src.itemId in DELIVERED_QTY) {
      line.measuredQty = DELIVERED_QTY[src.itemId];
    }
  }
  s.lines.sort(
    (a, b) =>
      seedData.invoiceLines.findIndex((l) => l.id === a.id) - seedData.invoiceLines.findIndex((l) => l.id === b.id),
  );
  s[part] = true;
}

// Curva ABC do mock (no back real isso é do Dan): A até 80% acumulado, B até 95%.
export function contractsWithAbc(): ContractSummary[] {
  const all = [...seedData.contracts, ...getStore().created.map((c) => c.summary)];
  const sorted = [...all].sort((a, b) => b.annualValue - a.annualValue);
  const total = sorted.reduce((acc, c) => acc + c.annualValue, 0);
  let acc = 0;
  return sorted.map((c) => {
    acc += c.annualValue;
    const cumulativePct = Math.round((acc / total) * 1000) / 10;
    const abcClass = cumulativePct <= 80 ? "A" : cumulativePct <= 95 ? "B" : "C";
    return { ...c, abcClass, cumulativePct };
  });
}

export function findCreated(id: string): CreatedContract | undefined {
  return getStore().created.find((c) => c.summary.id === id);
}

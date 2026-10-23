// lib/contracts.ts
// Ponto de contato front ↔ back. Quem mudar avisa o outro antes.
import { z } from "zod";

/* ---------- carteira ---------- */
export const AbcClass = z.enum(["A", "B", "C"]);
export const ContractSummary = z.object({
  id: z.string(),
  number: z.string(),            // "042/2026"
  supplier: z.string(),
  object: z.string(),
  annualValue: z.number(),
  renewsAt: z.string(),          // YYYY-MM-DD
  hasDemoData: z.boolean(),
  abcClass: AbcClass,            // calculado no back
  cumulativePct: z.number(),     // 0–100, calculado no back
});
export type ContractSummary = z.infer<typeof ContractSummary>;

/* ---------- contrato ---------- */
export const Clause = z.object({ ref: z.string(), text: z.string() }); // ref "2.1"
export type Clause = z.infer<typeof Clause>;

export const RuleKind = z.enum(["recorrente", "consumo", "entrega", "nivel_servico"]);
export const ContractItem = z.object({
  id: z.string(),
  name: z.string(),
  kind: RuleKind,
  unit: z.string().nullable(),
  quantity: z.number().nullable(),          // máximo contratado (recorrente) ou qtd a entregar (entrega)
  unitPrice: z.number().nullable(),         // preço unitário; em "consumo" é o preço da franquia
  dueDate: z.string().nullable(),           // entrega
  penaltyPerDayPct: z.number().nullable(),  // entrega: 0.5 = 0,5% ao dia
  penaltyCapPct: z.number().nullable(),     // entrega: 10 = 10%
  franchiseQty: z.number().nullable(),      // consumo: 50 (milhões de tokens)
  overageUnitPrice: z.number().nullable(),  // consumo: 90 por milhão
  slaMinPct: z.number().nullable(),         // nivel_servico: 99.5
  slaCreditPct: z.number().nullable(),      // nivel_servico: 10
  slaBaseItemIds: z.array(z.string()),      // nivel_servico: itens que compõem a mensalidade
  clauseRefs: z.array(z.string()),          // ["2.1", "6.1"]
  quote: z.string(),                        // trecho exato do contrato
  quoteVerified: z.boolean(),               // true se o trecho existe literalmente no texto
});
export type ContractItem = z.infer<typeof ContractItem>;

export const ContractDetail = z.object({
  contract: ContractSummary.extend({ text: z.string() }),
  clauses: z.array(Clause),
  items: z.array(ContractItem),
  extraction: z.object({
    source: z.enum(["ai", "fallback", "seed"]),
    at: z.string().nullable(),
  }),
});
export type ContractDetail = z.infer<typeof ContractDetail>;

/* ---------- fatura e entregas ---------- */
export const InvoiceLine = z.object({
  id: z.string(),
  contractId: z.string(),
  itemId: z.string(),
  source: z.string(),                   // "NF 8812 · linha 1"
  billedQty: z.number().nullable(),
  billedUnitPrice: z.number().nullable(),
  deliveredAt: z.string().nullable(),
  measuredQty: z.number().nullable(),   // tokens medidos, turmas realizadas…
  activeUsers: z.number().nullable(),   // licenças com uso em 30 dias
  measuredPct: z.number().nullable(),   // disponibilidade medida
  creditApplied: z.number().nullable(),
  penaltyApplied: z.number().nullable(),
});
export type InvoiceLine = z.infer<typeof InvoiceLine>;
export const InvoiceLinePatch = InvoiceLine.omit({ id: true, contractId: true, itemId: true, source: true }).partial();
export type InvoiceLinePatch = z.infer<typeof InvoiceLinePatch>;

/* ---------- ocorrências e revisão ---------- */
export const OccurrenceType = z.enum(["quantidade", "prazo", "valor", "sla"]);
export const ReviewStatus = z.enum(["pendente", "confirmada", "descartada"]);
export const Review = z.object({
  id: z.string(),
  status: ReviewStatus,
  comment: z.string(),
  reviewer: z.string(),
  createdAt: z.string(),
});
export type Review = z.infer<typeof Review>;

export const Occurrence = z.object({
  id: z.string(),
  key: z.string(),              // `${itemId}:${type}` — estável entre conferências
  contractId: z.string(),
  itemId: z.string(),
  itemName: z.string(),
  type: OccurrenceType,
  title: z.string(),            // "15 licenças cobradas além do contratado"
  impact: z.number(),           // R$; 0 quando não há valor
  explanation: z.string(),      // 1–2 frases, gerado no back (template)
  evidence: z.object({
    contract: z.array(z.object({ clauseRef: z.string(), quote: z.string() })),
    delivery: z.object({ source: z.string(), text: z.string() }),
  }),
  status: ReviewStatus,         // status da revisão mais recente
  reviews: z.array(Review),     // histórico, mais recente primeiro
});
export type Occurrence = z.infer<typeof Occurrence>;

export const Opportunity = z.object({
  id: z.string(),
  itemId: z.string(),
  rule: z.enum(["sem_uso", "plano_acima"]), // LGPD: sem regra sobre pessoas, só contagem agregada de uso
  title: z.string(),
  monthlyValue: z.number().nullable(),
  detail: z.string(),
});
export type Opportunity = z.infer<typeof Opportunity>;

export const CheckResult = z.object({
  contractId: z.string(),
  checkedAt: z.string(),
  occurrences: z.array(Occurrence),
  opportunities: z.array(Opportunity),
  totals: z.object({
    atStake: z.number(),        // soma de impact de todas
    confirmed: z.number(),      // soma das confirmadas
    pendingCount: z.number(),
  }),
});
export type CheckResult = z.infer<typeof CheckResult>;

export const Report = z.object({
  text: z.string(),
  source: z.enum(["ai", "template"]),
  generatedAt: z.string(),
});
export type Report = z.infer<typeof Report>;

/* ---------- corpos de requisição ---------- */
export const CreateContractBody = z.object({
  number: z.string(), supplier: z.string(), object: z.string(),
  annualValue: z.number(), renewsAt: z.string(), text: z.string().min(50),
});
export const UploadInvoiceBody = z.object({ csv: z.string().min(10) });
export const ReviewBody = z.object({
  status: ReviewStatus, comment: z.string().default(""), reviewer: z.string().min(1),
});

export const ApiError = z.object({ error: z.object({ code: z.string(), message: z.string() }) });
export type ApiError = z.infer<typeof ApiError>;

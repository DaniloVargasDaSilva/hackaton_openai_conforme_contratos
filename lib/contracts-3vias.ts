// lib/contracts-3vias.ts — PROPOSTA do front para a conferência em 3 vias
// (contratado × faturado na NF XML × entregue no CSV). Fica separado de
// lib/contracts.ts para não mexer no arquivo do Dan antes de combinar.
// Quando o Dan aceitar, isto vai para lib/contracts.ts e este arquivo some.
import { z } from "zod";
import { CheckResult, InvoiceLine, Occurrence } from "./contracts";

/* ---------- NF fictícia (para o DANFE) ---------- */
export const NfParty = z.object({ name: z.string(), cnpj: z.string(), city: z.string().nullable() });
export type NfParty = z.infer<typeof NfParty>;
export const NfItem = z.object({
  line: z.number(),
  itemId: z.string().nullable(), // cProd → item do contrato
  description: z.string(),
  unit: z.string(),
  qty: z.number(),
  unitPrice: z.number(),
  total: z.number(),
});
export type NfItem = z.infer<typeof NfItem>;
export const NfDocument = z.object({
  number: z.string(),
  series: z.string(),
  issuedAt: z.string(),
  competence: z.string(),
  issuer: NfParty,
  recipient: NfParty,
  items: z.array(NfItem),
  discounts: z.array(z.object({ description: z.string(), amount: z.number() })),
  totalProducts: z.number(),
  totalDiscounts: z.number(),
  total: z.number(),
  notes: z.string().nullable(),
  fictitious: z.literal(true),
});
export type NfDocument = z.infer<typeof NfDocument>;
export const NfResponse = z.object({ nf: NfDocument.nullable() });

/* ---------- uploads ---------- */
export const UploadError = z.object({ row: z.number().nullable(), message: z.string() }); // row null = arquivo todo
export type UploadError = z.infer<typeof UploadError>;
export const UploadNfBody = z.object({ xml: z.string().min(20) });
export const UploadNfResult = z.object({
  nf: NfDocument.nullable(),
  lines: z.array(InvoiceLine),
  errors: z.array(UploadError),
});
export type UploadNfResult = z.infer<typeof UploadNfResult>;
export const UploadDeliveriesBody = z.object({ csv: z.string().min(10) });
export const UploadDeliveriesResult = z.object({
  lines: z.array(InvoiceLine),
  errors: z.array(UploadError),
});
export type UploadDeliveriesResult = z.infer<typeof UploadDeliveriesResult>;

/* ---------- evidência em 3 colunas: Occurrence.evidence ganha `invoice` ---------- */
export const EvidenceSource = z.object({ source: z.string(), text: z.string() });
export const Occurrence3 = Occurrence.extend({
  evidence: Occurrence.shape.evidence.extend({
    invoice: EvidenceSource.nullable().optional(), // linha da NF; opcional enquanto o back for de 2 vias
  }),
});
export type Occurrence3 = z.infer<typeof Occurrence3>;
export const CheckResult3 = CheckResult.extend({ occurrences: z.array(Occurrence3) });
export type CheckResult3 = z.infer<typeof CheckResult3>;

/* ---------- utilitários do front (não são rotas novas) ---------- */
export const Health = z.object({ ok: z.boolean(), db: z.boolean(), ai: z.boolean() });
export type Health = z.infer<typeof Health>;

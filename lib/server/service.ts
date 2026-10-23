// Dan: regras de negócio que as rotas chamam. As rotas só leem a requisição e devolvem a resposta.
// Acesso ao banco em SQL direto (driver pg), sem Prisma.
import { randomUUID } from "node:crypto";
import type { z } from "zod";
import type {
  ContractDetail,
  ContractItem,
  ContractSummary,
  CreateContractBody as CreateContractBodySchema,
  InvoiceLine,
  InvoiceLinePatch,
  Report,
  ReviewBody as ReviewBodySchema,
} from "@/lib/contracts";
import type { CheckResult3, NfDocument, Occurrence3, UploadError } from "@/lib/contracts-3vias";
import { classifyAbc } from "./abc";
import { applyDeliveries, applyNf, applyNfDocument } from "./billing";
import { db, getConnectionTarget, insertMany, transaction, type Db } from "./db";
import { ApiError, describeDbError } from "./http";
import { extractItems, isAiEnabled, NfPhotoError, readNfFromImage, writeReport } from "./ai";
import { parseInvoiceCsv } from "./csv";
import {
  toConferenceLine,
  toItem,
  toLine,
  toOccurrence,
  toSummary,
  type DbContract,
  type DbItem,
  type DbLine,
  type DbOccurrence,
  type DbReview,
} from "./mappers";
import { conferir, type UsageFactInput } from "./rules";

type CreateContractBody = z.infer<typeof CreateContractBodySchema>;
type ReviewBody = z.infer<typeof ReviewBodySchema>;
type Opportunity = CheckResult3["opportunities"][number];
type Occurrence = Occurrence3;

const ITEM_COLUMNS = [
  "id", "contractId", "position", "name", "kind", "unit", "quantity", "unitPrice", "dueDate", "penaltyPerDayPct",
  "penaltyCapPct", "franchiseQty", "overageUnitPrice", "slaMinPct", "slaCreditPct", "slaBaseItemIds", "clauseRefs",
  "quote", "quoteVerified",
];

const itemRow = (contractId: string, i: ContractItem, position: number): unknown[] => [
  i.id, contractId, position, i.name, i.kind, i.unit, i.quantity, i.unitPrice, i.dueDate, i.penaltyPerDayPct,
  i.penaltyCapPct, i.franchiseQty, i.overageUnitPrice, i.slaMinPct, i.slaCreditPct, i.slaBaseItemIds, i.clauseRefs,
  i.quote, i.quoteVerified,
];

const LINE_COLUMNS = [
  "id", "contractId", "itemId", "source", "invoiceSource", "deliverySource", "row", "billedQty", "billedUnitPrice",
  "deliveredAt", "measuredQty", "activeUsers", "measuredPct", "creditApplied", "penaltyApplied",
];

/** Campos que a tela pode editar numa linha da fatura. */
const PATCHABLE = ["billedQty", "billedUnitPrice", "deliveredAt", "measuredQty", "activeUsers", "measuredPct", "creditApplied", "penaltyApplied"] as const;

const now = () => new Date().toISOString();

/* ---------- carteira ---------- */

export async function listContracts(): Promise<ContractSummary[]> {
  const rows = await db.query<DbContract>(`SELECT * FROM "Contract" ORDER BY "annualValue" DESC`);
  const abc = classifyAbc(rows);
  return rows.map((row) => toSummary(row, abc.get(row.id)!));
}

/** Carrega um contrato ou responde 404. */
async function findContract(id: string, q: Db = db): Promise<DbContract> {
  const [row] = await q.query<DbContract>(`SELECT * FROM "Contract" WHERE id = $1`, [id]);
  if (!row) throw new ApiError(404, "NOT_FOUND", `Contrato ${id} não encontrado`);
  return row;
}

export async function getContractDetail(id: string): Promise<ContractDetail> {
  const [contract, all, clauses, items] = await Promise.all([
    findContract(id),
    db.query<{ id: string; annualValue: number }>(`SELECT id, "annualValue" FROM "Contract"`),
    db.query<{ ref: string; text: string }>(`SELECT ref, text FROM "Clause" WHERE "contractId" = $1 ORDER BY ref`, [id]),
    db.query<DbItem>(`SELECT * FROM "ContractItem" WHERE "contractId" = $1 ORDER BY "position"`, [id]),
  ]);
  const abc = classifyAbc(all).get(id)!;

  return {
    contract: { ...toSummary(contract, abc), text: contract.text ?? "" },
    clauses: clauses.map((c) => ({ ref: c.ref, text: c.text })),
    items: items.map(toItem),
    extraction: {
      // Contrato sem extração ainda entra como fallback, sem itens.
      source: (contract.extractionSource as "ai" | "fallback" | "seed" | null) ?? "fallback",
      at: contract.extractedAt?.toISOString() ?? null,
    },
  };
}

export async function createContract(body: CreateContractBody): Promise<ContractDetail> {
  const id = `up-${randomUUID().slice(0, 8)}`;
  await db.query(
    `INSERT INTO "Contract" (id, number, supplier, object, "annualValue", "renewsAt", "hasDemoData", text)
     VALUES ($1, $2, $3, $4, $5, $6, false, $7)`,
    [id, body.number, body.supplier, body.object, body.annualValue, body.renewsAt, body.text],
  );
  return getContractDetail(id);
}

/* ---------- extração ---------- */

export async function extractContract(id: string): Promise<ContractDetail> {
  const contract = await findContract(id);
  if (!contract.text) {
    throw new ApiError(422, "SEM_TEXTO", "O contrato não tem texto para extrair");
  }

  const { items, source } = await extractItems(id, contract.text);

  await transaction(async (tx) => {
    await tx.query(`DELETE FROM "ContractItem" WHERE "contractId" = $1`, [id]);
    await insertMany(tx, "ContractItem", ITEM_COLUMNS, items.map((item, position) => itemRow(id, item, position)));
    await tx.query(`UPDATE "Contract" SET "extractionSource" = $2, "extractedAt" = $3, "checkedAt" = NULL WHERE id = $1`, [id, source, now()]);
  });

  return getContractDetail(id);
}

/* ---------- fatura e entregas ---------- */

export async function listInvoiceLines(contractId: string): Promise<InvoiceLine[]> {
  await findContract(contractId);
  const rows = await db.query<DbLine>(`SELECT * FROM "InvoiceLine" WHERE "contractId" = $1 ORDER BY "row"`, [contractId]);
  return rows.map(toLine);
}

export async function uploadInvoiceCsv(contractId: string, csv: string) {
  await findContract(contractId);
  const items = await db.query<{ id: string }>(`SELECT id FROM "ContractItem" WHERE "contractId" = $1`, [contractId]);
  const { lines, errors } = parseInvoiceCsv(csv, new Set(items.map((i) => i.id)));

  await transaction(async (tx) => {
    await tx.query(`DELETE FROM "InvoiceLine" WHERE "contractId" = $1`, [contractId]);
    await tx.query(`UPDATE "Contract" SET "checkedAt" = NULL WHERE id = $1`, [contractId]);
    await insertMany(
      tx,
      "InvoiceLine",
      LINE_COLUMNS,
      lines.map((l, index) => [
        randomUUID(), contractId, l.itemId, l.source, null, null, index + 2, l.billedQty, l.billedUnitPrice,
        l.deliveredAt, l.measuredQty, l.activeUsers, l.measuredPct, l.creditApplied, l.penaltyApplied,
      ]),
    );
  });

  return { lines: await listInvoiceLines(contractId), errors };
}

/** NF lida do XML, para o DANFE. null enquanto nenhuma NF foi enviada. */
export async function getNf(contractId: string): Promise<{ nf: NfDocument | null }> {
  const contract = await findContract(contractId);
  return { nf: (contract.nf as NfDocument | null) ?? null };
}

/** POST /nf: grava o lado faturado a partir do XML. Reenviar substitui só o lado faturado. */
export async function uploadNf(
  contractId: string,
  xml: string,
): Promise<{ nf: NfDocument | null; lines: InvoiceLine[]; errors: UploadError[] }> {
  await findContract(contractId);
  const { nf, errors } = await transaction((tx) => applyNf(tx, contractId, xml));
  return { nf, lines: await listInvoiceLines(contractId), errors };
}

/**
 * POST /nf-photo: a IA lê a foto da NF e o resultado é gravado como se fosse o XML.
 * A chamada à IA fica fora da transação, para não segurar uma conexão do banco esperando a OpenAI.
 */
export async function uploadNfPhoto(
  contractId: string,
  imageBase64: string,
  mimeType: string,
): Promise<{ nf: NfDocument | null; lines: InvoiceLine[]; errors: UploadError[] }> {
  await findContract(contractId);
  const itemRows = await db.query<DbItem>(`SELECT * FROM "ContractItem" WHERE "contractId" = $1 ORDER BY "position"`, [contractId]);

  let nf: NfDocument;
  try {
    nf = await readNfFromImage(imageBase64, mimeType, itemRows.map(toItem));
  } catch (error) {
    if (error instanceof NfPhotoError) {
      return { nf: null, lines: await listInvoiceLines(contractId), errors: [{ row: null, message: error.message }] };
    }
    throw error;
  }

  const saved = await transaction((tx) => applyNfDocument(tx, contractId, nf));
  return { nf: saved.nf, lines: await listInvoiceLines(contractId), errors: saved.errors };
}

/** POST /deliveries: grava o lado entregue a partir do CSV. Reenviar substitui só o lado entregue. */
export async function uploadDeliveries(
  contractId: string,
  csv: string,
): Promise<{ lines: InvoiceLine[]; errors: UploadError[] }> {
  await findContract(contractId);
  const { errors } = await transaction((tx) => applyDeliveries(tx, contractId, csv));
  return { lines: await listInvoiceLines(contractId), errors };
}

export async function patchInvoiceLine(lineId: string, patch: InvoiceLinePatch): Promise<InvoiceLine> {
  const values: unknown[] = [lineId];
  const sets: string[] = [];
  for (const key of PATCHABLE) {
    const value = patch[key];
    if (value !== undefined) {
      values.push(value);
      sets.push(`"${key}" = $${values.length}`);
    }
  }

  const [row] = sets.length
    ? await db.query<DbLine>(`UPDATE "InvoiceLine" SET ${sets.join(", ")} WHERE id = $1 RETURNING *`, values)
    : await db.query<DbLine>(`SELECT * FROM "InvoiceLine" WHERE id = $1`, [lineId]);
  if (!row) throw new ApiError(404, "NOT_FOUND", "Linha da fatura não encontrada");

  // A edição muda os números: a conferência anterior não vale mais.
  await db.query(`UPDATE "Contract" SET "checkedAt" = NULL WHERE id = $1`, [row.contractId]);
  return toLine(row);
}

/* ---------- conferência ---------- */

async function loadConferenceInputs(contractId: string) {
  const [items, lines, usageFacts, clauses] = await Promise.all([
    db.query<DbItem>(`SELECT * FROM "ContractItem" WHERE "contractId" = $1 ORDER BY "position"`, [contractId]),
    db.query<DbLine>(`SELECT * FROM "InvoiceLine" WHERE "contractId" = $1 ORDER BY "row"`, [contractId]),
    db.query<UsageFactInput>(`SELECT "itemId", "overPlanUsers" FROM "UsageFact" WHERE "contractId" = $1`, [contractId]),
    db.query<{ ref: string; text: string }>(`SELECT ref, text FROM "Clause" WHERE "contractId" = $1`, [contractId]),
  ]);
  return {
    items: items.map(toItem),
    lines: lines.map(toConferenceLine),
    usageFacts,
    clauses: clauses.map((c) => ({ ref: c.ref, text: c.text })),
  };
}

/** Junta as revisões às ocorrências com uma consulta só. */
async function withReviews(rows: DbOccurrence[], q: Db = db): Promise<(DbOccurrence & { reviews: DbReview[] })[]> {
  if (rows.length === 0) return [];
  const reviews = await q.query<DbReview>(`SELECT * FROM "Review" WHERE "occurrenceId" = ANY($1::text[])`, [rows.map((r) => r.id)]);
  const byOccurrence = new Map<string, DbReview[]>();
  for (const review of reviews) byOccurrence.set(review.occurrenceId, [...(byOccurrence.get(review.occurrenceId) ?? []), review]);
  return rows.map((row) => ({ ...row, reviews: byOccurrence.get(row.id) ?? [] }));
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Lê o estado persistido: ocorrências ativas com revisões, mais as oportunidades da última conferência. */
async function buildCheckResult(contractId: string, known?: DbContract): Promise<CheckResult3> {
  const contract = known ?? (await findContract(contractId));
  const rows = await db.query<DbOccurrence>(
    `SELECT * FROM "Occurrence" WHERE "contractId" = $1 AND active ORDER BY impact DESC`,
    [contractId],
  );
  const occurrences = (await withReviews(rows)).map(toOccurrence);

  const atStake = occurrences.reduce((sum, o) => sum + o.impact, 0);
  const confirmed = occurrences.filter((o) => o.status === "confirmada").reduce((sum, o) => sum + o.impact, 0);
  const pendingCount = occurrences.filter((o) => o.status === "pendente").length;

  return {
    contractId,
    checkedAt: (contract.checkedAt ?? new Date()).toISOString(),
    occurrences,
    opportunities: (contract.opportunities as Opportunity[] | null) ?? [],
    totals: { atStake: round2(atStake), confirmed: round2(confirmed), pendingCount },
  };
}

/**
 * Reconfere o contrato. Recalcula as ocorrências e mantém as revisões pela `key`.
 * Ocorrência que sumiu fica inativa, e as revisões dela continuam no banco.
 */
export async function runCheck(contractId: string): Promise<CheckResult3> {
  // Existência do contrato e dados da conferência em paralelo: cada consulta é uma ida e volta de rede.
  const [, inputs] = await Promise.all([findContract(contractId), loadConferenceInputs(contractId)]);
  const { occurrences, opportunities } = conferir(inputs.items, inputs.lines, inputs.usageFacts, inputs.clauses);

  const updated = await transaction(async (tx) => {
    for (const o of occurrences) {
      await tx.query(
        `INSERT INTO "Occurrence" (id, "contractId", key, "itemId", "itemName", type, title, impact, explanation, evidence, active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, true)
         ON CONFLICT ("contractId", key) DO UPDATE SET
           "itemId" = EXCLUDED."itemId", "itemName" = EXCLUDED."itemName", type = EXCLUDED.type, title = EXCLUDED.title,
           impact = EXCLUDED.impact, explanation = EXCLUDED.explanation, evidence = EXCLUDED.evidence, active = true`,
        [randomUUID(), contractId, o.key, o.itemId, o.itemName, o.type, o.title, o.impact, o.explanation, JSON.stringify(o.evidence)],
      );
    }
    await tx.query(`UPDATE "Occurrence" SET active = false WHERE "contractId" = $1 AND NOT (key = ANY($2::text[]))`, [
      contractId,
      occurrences.map((o) => o.key),
    ]);
    const [contract] = await tx.query<DbContract>(
      `UPDATE "Contract" SET "checkedAt" = $2, opportunities = $3::jsonb WHERE id = $1 RETURNING *`,
      [contractId, now(), JSON.stringify(opportunities)],
    );
    return contract;
  });

  return buildCheckResult(contractId, updated);
}

/** GET /check: devolve a última conferência, ou roda uma se não houver. */
export async function getCheck(contractId: string): Promise<CheckResult3> {
  const contract = await findContract(contractId);
  if (!contract.checkedAt) return runCheck(contractId);
  return buildCheckResult(contractId, contract);
}

/* ---------- revisão ---------- */

export async function reviewOccurrence(occId: string, body: ReviewBody): Promise<Occurrence> {
  const [occurrence] = await db.query<DbOccurrence>(`SELECT * FROM "Occurrence" WHERE id = $1`, [occId]);
  if (!occurrence) throw new ApiError(404, "NOT_FOUND", "Ocorrência não encontrada");
  if (!occurrence.active) {
    throw new ApiError(409, "OCORRENCIA_INATIVA", "A ocorrência não existe mais na última conferência");
  }

  await db.query(
    `INSERT INTO "Review" (id, "occurrenceId", status, comment, reviewer, "createdAt") VALUES ($1, $2, $3, $4, $5, $6)`,
    [randomUUID(), occId, body.status, body.comment, body.reviewer, now()],
  );

  const [row] = await withReviews([occurrence]);
  return toOccurrence(row);
}

/* ---------- relatório ---------- */

export async function generateReport(contractId: string): Promise<Report> {
  const contract = await findContract(contractId);
  const rows = await db.query<DbOccurrence>(
    `SELECT * FROM "Occurrence" WHERE "contractId" = $1 AND active ORDER BY impact DESC`,
    [contractId],
  );
  const confirmed = (await withReviews(rows)).map(toOccurrence).filter((o) => o.status === "confirmada");

  const { text, source } = await writeReport(contract.number, contract.supplier, confirmed);
  return { text, source, generatedAt: new Date().toISOString() };
}

/* ---------- saúde ---------- */

/**
 * Saúde da API. `db` = conectou no banco; `schema` = as tabelas existem; `ok` exige os dois.
 * O SELECT 1 sozinho passa num banco vazio, e aí as rotas dão erro com a saúde dizendo que está tudo bem.
 * `target` (host, banco e projeto, nunca a senha) só aparece com DEMO_RESET_ENABLED=1, o modo de demonstração.
 */
export async function health() {
  const ai = isAiEnabled();
  const target = () => (process.env.DEMO_RESET_ENABLED === "1" ? getConnectionTarget() : null);

  try {
    await db.query(`SELECT 1`);
  } catch (error) {
    const problem = describeDbError(error);
    return { ok: false, db: false, schema: false, ai, target: target(), detail: problem?.message ?? "Não consegui conectar no banco." };
  }

  try {
    await db.query(`SELECT 1 FROM "Contract" LIMIT 1`);
  } catch (error) {
    const problem = describeDbError(error);
    return { ok: false, db: true, schema: false, ai, target: target(), detail: problem?.message ?? "O banco conecta, mas a consulta às tabelas falhou." };
  }

  return { ok: true, db: true, schema: true, ai, target: target(), detail: null };
}
